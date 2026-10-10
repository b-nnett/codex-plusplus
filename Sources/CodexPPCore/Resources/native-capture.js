// Headless Appshot bridge for the reviewed main-process bootstrap.
(function createNativeCapture(electron) {
  const childProcess = require('child_process');
  const fs = require('fs');
  const path = require('path');

  const responseChannel = 'codex_desktop:message-for-view';
  const startURL = 'vscode://codex/computer-use-start-capture';
  const marker = '__CODEXPP_APPSHOT_V1__';
  const maxImageBytes = 16 * 1024 * 1024;
  const maxTextLength = 2 * 1024 * 1024;
  let runtime = null;
  let starting = null;
  let captureQueue = Promise.resolve();

  function vendorExecutable(file) {
    const verification = childProcess.spawnSync('/usr/bin/codesign', ['--verify', '--strict', file], {encoding: 'utf8'});
    const identity = childProcess.spawnSync('/usr/bin/codesign', ['-d', '-vv', file], {encoding: 'utf8'});
    if (verification.status !== 0 || identity.status !== 0 || !String(identity.stderr).includes('TeamIdentifier=2DC432GLL2')) {
      throw new Error(`The bundled ${path.basename(file)} runtime is not signed by the expected vendor team.`);
    }
  }

  function send(state, message) {
    if (state.child.exitCode != null || state.child.signalCode != null || !state.child.stdin.writable) {
      throw new Error('The headless capture runtime is unavailable.');
    }
    state.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function rejectPending(state, error) {
    for (const pending of state.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    state.pending.clear();
  }

  function rpc(state, method, params, timeoutMs = 15000) {
    const id = state.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        state.pending.delete(id);
        reject(new Error(`The headless capture runtime timed out during ${method}.`));
      }, timeoutMs);
      timeout.unref?.();
      state.pending.set(id, {resolve, reject, timeout});
      try { send(state, {jsonrpc: '2.0', id, method, params}); }
      catch (error) {
        clearTimeout(timeout);
        state.pending.delete(id);
        reject(error);
      }
    });
  }

  function approvalApp(message) {
    const metadata = message?.params?._meta ?? message?.params?.meta;
    if (metadata?.connector_id !== 'computer-use' || metadata?.tool_name !== 'get_app_state') return null;
    const app = metadata?.tool_params?.app;
    return typeof app === 'string' ? app : null;
  }

  function receive(state, message) {
    if (message?.method === 'elicitation/create' && message.id != null) {
      const app = approvalApp(message);
      const accepted = app != null && app === state.activeApp;
      send(state, {
        jsonrpc: '2.0',
        id: message.id,
        result: {action: accepted ? 'accept' : 'decline', content: {}}
      });
      return;
    }
    if (message?.id == null) return;
    const pending = state.pending.get(message.id);
    if (!pending) return;
    state.pending.delete(message.id);
    clearTimeout(pending.timeout);
    if (message.error) pending.reject(new Error(message.error.message || 'The headless capture runtime returned an error.'));
    else pending.resolve(message.result);
  }

  function consume(state, chunk) {
    state.stdout += chunk;
    for (;;) {
      const newline = state.stdout.indexOf('\n');
      if (newline < 0) return;
      const line = state.stdout.slice(0, newline).trim();
      state.stdout = state.stdout.slice(newline + 1);
      if (!line) continue;
      try { receive(state, JSON.parse(line)); }
      catch {}
    }
  }

  async function start() {
    if (runtime && runtime.child.exitCode == null && runtime.child.signalCode == null) return runtime;
    if (starting) return starting;
    starting = (async () => {
      const root = path.join(process.resourcesPath, 'cua_node');
      const node = path.join(root, 'bin', 'node');
      const nodeRepl = path.join(root, 'bin', 'node_repl');
      const modules = path.join(root, 'lib', 'node_modules');
      const wrapper = path.join(modules, '@oai', 'cua-repl', 'bin', 'cua-repl.mjs');
      for (const file of [node, nodeRepl, wrapper]) {
        if (!fs.statSync(file).isFile()) throw new Error('The bundled headless capture runtime is incomplete.');
      }
      vendorExecutable(node);
      vendorExecutable(nodeRepl);

      const environment = {...process.env};
      delete environment.ELECTRON_RUN_AS_NODE;
      delete environment.NODE_OPTIONS;
      environment.CUA_REPL_NODE_REPL_PATH = nodeRepl;
      environment.CUA_REPL_ENABLED_SURFACES = 'computer';
      environment.NODE_REPL_NODE_MODULE_DIRS = modules;
      environment.NODE_REPL_TRUSTED_CODE_PATHS = modules;
      environment.NODE_REPL_TRUSTED_SERVICES = JSON.stringify({sky: '@oai/sky/service'});
      environment.NODE_REPL_JS_BANNER = '';
      environment.NODE_REPL_DISABLE_ANALYTICS = '1';
      environment.BROWSER_USE_DISABLE_AMBIENT_NETWORK = '1';

      const child = childProcess.spawn(node, [wrapper], {env: environment, stdio: ['pipe', 'pipe', 'pipe']});
      const state = {activeApp: null, child, nextId: 1, pending: new Map(), stderr: '', stdout: ''};
      runtime = state;
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => consume(state, chunk));
      child.stderr.on('data', chunk => { state.stderr = `${state.stderr}${chunk}`.slice(-32768); });
      child.once('error', error => rejectPending(state, error));
      child.once('exit', (code, signal) => {
        const detail = state.stderr.trim();
        rejectPending(state, new Error(detail || `The headless capture runtime exited (${signal || code || 'unknown'}).`));
        if (runtime === state) runtime = null;
      });

      const initialized = await rpc(state, 'initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {elicitation: {form: {}}},
        clientInfo: {name: 'codexpp-appshot', version: '1'}
      });
      if (initialized?.serverInfo?.name !== 'rmcp') throw new Error('The bundled headless capture runtime returned an unexpected identity.');
      send(state, {jsonrpc: '2.0', method: 'notifications/initialized', params: {}});
      return state;
    })();
    try { return await starting; }
    catch (error) {
      if (runtime?.child && runtime.child.exitCode == null) runtime.child.kill();
      runtime = null;
      throw error;
    } finally { starting = null; }
  }

  function toolError(result) {
    if (!result?.isError) return null;
    const text = result.content?.find(item => item?.type === 'text' && typeof item.text === 'string')?.text;
    return new Error(text || 'The headless capture request failed.');
  }

  async function captureNow(app) {
    const state = await start();
    state.activeApp = app;
    try {
      const appLiteral = JSON.stringify(app);
      const markerLiteral = JSON.stringify(marker);
      const code = `await (async()=>{ const {sky}=await import("@oai/sky"); const fs=await import("node:fs/promises"); const state=await sky.get_app_state({app:${appLiteral},disableDiff:true}); if(!state?.screenshot?.url) throw new Error("Computer Use returned no screenshot"); const image=await fs.readFile(new URL(state.screenshot.url)); if(image.length===0||image.length>${maxImageBytes}) throw new Error("Computer Use returned an invalid screenshot size"); let mime=null; if(image[0]===0x89&&image[1]===0x50&&image[2]===0x4e&&image[3]===0x47)mime="image/png"; else if(image[0]===0xff&&image[1]===0xd8&&image[2]===0xff)mime="image/jpeg"; else throw new Error("Computer Use returned an unsupported screenshot format"); const text=typeof state.text==="string"?state.text:""; if(text.length>${maxTextLength}) throw new Error("Computer Use returned an invalid accessibility tree size"); nodeRepl.write(${markerLiteral}+JSON.stringify({text,screenshotDataURL:"data:"+mime+";base64,"+image.toString("base64")})); })();`;
      const result = await rpc(state, 'tools/call', {
        name: 'js',
        arguments: {code, timeout_ms: 45000, title: 'Capture app screenshot'}
      }, 50000);
      const failure = toolError(result);
      if (failure) throw failure;
      const output = result?.content?.find(item => item?.type === 'text' && typeof item.text === 'string' && item.text.startsWith(marker))?.text;
      if (!output) throw new Error('The headless capture runtime returned no Appshot payload.');
      const payload = JSON.parse(output.slice(marker.length));
      if (typeof payload.text !== 'string' || typeof payload.screenshotDataURL !== 'string' || !payload.screenshotDataURL.startsWith('data:image/')) {
        throw new Error('The headless capture runtime returned an invalid Appshot payload.');
      }
      return payload;
    } finally { state.activeApp = null; }
  }

  function capture(app) {
    const operation = captureQueue.then(() => captureNow(app));
    captureQueue = operation.catch(() => {});
    return operation;
  }

  function emit(sender, message) {
    if (!sender.isDestroyed()) sender.send(responseChannel, message);
  }

  function fetchError(sender, request, error) {
    emit(sender, {
      type: 'fetch-response', responseType: 'error', requestId: request.requestId, status: 432,
      error: error instanceof Error ? error.message : String(error),
      headers: {'content-type': 'application/json'}
    });
  }

  async function relay(sender, request) {
    let started = false;
    let captureId = null;
    try {
      const body = JSON.parse(request.body || '{}');
      captureId = body.requestId;
      const app = body.bundleIdentifier;
      if (typeof captureId !== 'string' || captureId.length === 0 || captureId.length > 128 ||
          typeof app !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(app)) {
        throw new Error('The Appshot request is invalid.');
      }
      emit(sender, {
        type: 'fetch-response', responseType: 'success', requestId: request.requestId, status: 200,
        headers: {'content-type': 'application/json'},
        bodyJsonString: JSON.stringify({result: 'started'})
      });
      started = true;
      emit(sender, {type: 'computer-use-capture-updated', requestId: captureId, update: {type: 'metadata', app: {bundleIdentifier: app}}});
      const payload = await capture(app);
      emit(sender, {type: 'computer-use-capture-updated', requestId: captureId, update: {type: 'axText', text: payload.text}});
      emit(sender, {
        type: 'computer-use-capture-updated', requestId: captureId,
        update: {type: 'screenshot', screenshotDataURL: payload.screenshotDataURL, transitionSnapshotDataURL: payload.screenshotDataURL}
      });
      emit(sender, {type: 'computer-use-capture-updated', requestId: captureId, update: {type: 'completed'}});
    } catch (error) {
      console.error('[Codex++] headless Appshot:', error);
      if (started) {
        if (typeof captureId === 'string') {
          emit(sender, {type: 'computer-use-capture-updated', requestId: captureId, update: {type: 'failed', failureReason: 'start_request_failed'}});
        }
      } else { fetchError(sender, request, error); }
    }
  }

  return {
    handles(request) {
      return request?.type === 'fetch' && request?.method === 'POST' && request?.url === startURL;
    },
    relay,
    warmup() { return start().then(() => undefined); },
    dispose() {
      const state = runtime;
      runtime = null;
      starting = null;
      if (state?.child && state.child.exitCode == null && state.child.signalCode == null) state.child.kill();
    }
  };
})
