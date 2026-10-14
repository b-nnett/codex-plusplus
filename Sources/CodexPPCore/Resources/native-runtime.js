// Main-process extension host. It never opens a debugger or network listener.
(function createNativeRuntime(electron, support, rendererRuntime, rendererBridge, trace) {
  trace ||= {enabled:false, span:(_name, fn) => fn(), async:(_name, fn) => fn(), collector() {}};
  const crypto = require('crypto');
  const fs = require('fs');
  const path = require('path');
  const responseChannel = 'codex_desktop:message-for-view';
  const settingsFile = path.join(support, 'settings.json');
  const extensionsDirectory = path.join(support, 'Extensions');
  const diagnosticsDirectory = path.join(support, 'Diagnostics');
  const diagnosticsFile = path.join(diagnosticsDirectory, 'runtime.json');
  let disposed = false;
  let timer = null;
  const watchers = [];

  function trustedFrame(frame) {
    try {
      const url = new URL(frame.url);
      return url.protocol === 'app:' && url.host === '-' &&
        (['/index.html', '/detached-window.html', '/settings'].includes(url.pathname) || url.pathname.startsWith('/settings/'));
    } catch { return false; }
  }

  function trustedEvent(event) {
    return event?.sender && event.senderFrame === event.sender.mainFrame && trustedFrame(event.senderFrame);
  }

  function atomicJSON(file, value) {
    fs.mkdirSync(path.dirname(file), {recursive:true, mode:0o700});
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(value), {mode:0o600});
      fs.renameSync(temporary, file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }

  function settings() {
    if (!fs.existsSync(settingsFile)) return {appPath:'/Applications/ChatGPT.app', extensionsPaused:false, enabled:{}};
    const value = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        typeof value.extensionsPaused !== 'boolean' || !value.enabled || typeof value.enabled !== 'object' || Array.isArray(value.enabled)) {
      throw new Error('Codex++ settings.json is invalid.');
    }
    return value;
  }

  function saveSettings(value) {
    atomicJSON(settingsFile, value);
  }

  function validID(value) {
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value) && value !== '.' && value !== '..';
  }

  function inside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
  }

  function loadExtension(folder) {
    const root = fs.realpathSync(folder);
    const manifestPath = fs.realpathSync(path.join(root, 'manifest.json'));
    if (!inside(root, manifestPath) || !fs.statSync(manifestPath).isFile()) throw new Error('The manifest must stay inside the extension folder.');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!validID(manifest.id) || typeof manifest.name !== 'string' || !manifest.name.trim() ||
        typeof manifest.version !== 'string' || !manifest.version || manifest.scope !== 'renderer' ||
        typeof manifest.main !== 'string' || path.isAbsolute(manifest.main) || !manifest.main.endsWith('.js') || manifest.main.split(/[\\/]/).includes('..')) {
      throw new Error('The extension manifest is invalid.');
    }
    const entry = fs.realpathSync(path.join(root, manifest.main));
    if (!inside(root, entry) || !fs.statSync(entry).isFile()) throw new Error('The extension entry must stay inside its folder.');
    const bytes = fs.readFileSync(entry);
    if (bytes.length > 2_000_000) throw new Error('The extension entry is larger than 2 MB.');
    const code = bytes.toString('utf8');
    if (!Buffer.from(code, 'utf8').equals(bytes)) throw new Error('The extension entry must be UTF-8 JavaScript.');
    return {manifest, root, code, fingerprint:crypto.createHash('sha256').update(bytes).digest('hex')};
  }

  // Polls revalidate with stat calls only; contents are reread and rehashed
  // when a manifest or entry file is replaced, edited or retargeted.
  const loadedCache = new Map();
  function stamp(file) {
    const stat = fs.statSync(file);
    return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  }
  function cachedExtension(folder) {
    const cached = loadedCache.get(folder);
    try {
      if (cached && stamp(path.join(folder, 'manifest.json')) === cached.manifestStamp &&
          stamp(path.join(folder, cached.item.manifest.main)) === cached.entryStamp) return cached.item;
    } catch { /* Reload below to report the precise problem. */ }
    loadedCache.delete(folder);
    const manifestStamp = stamp(path.join(folder, 'manifest.json'));
    const item = loadExtension(folder);
    const entryStamp = stamp(path.join(folder, item.manifest.main));
    loadedCache.set(folder, {item, manifestStamp, entryStamp});
    return item;
  }

  function extensions() {
    fs.mkdirSync(extensionsDirectory, {recursive:true, mode:0o700});
    const items = [], problems = [], seen = new Set();
    for (const entry of fs.readdirSync(extensionsDirectory, {withFileTypes:true})) {
      if (entry.name.startsWith('.') || !entry.isDirectory()) continue;
      const folder = path.join(extensionsDirectory, entry.name);
      seen.add(folder);
      try {
        const item = cachedExtension(folder);
        if (item.manifest.id !== entry.name) throw new Error('Folder name must match manifest ID.');
        items.push(item);
      } catch (error) { problems.push(`${entry.name}: ${error.message}`); }
    }
    for (const folder of loadedCache.keys()) if (!seen.has(folder)) loadedCache.delete(folder);
    items.sort((a,b) => a.manifest.name.localeCompare(b.manifest.name));
    return {items, problems};
  }

  function snapshot(configuration, loaded, errors = {}) {
    return {
      extensions: loaded.items.map(item => ({
        id:item.manifest.id, name:item.manifest.name, description:item.manifest.description || '',
        version:item.manifest.version, enabled:configuration.enabled[item.manifest.id] === true,
        ...(errors[item.manifest.id] ? {error:errors[item.manifest.id]} : {})
      })),
      extensionsPaused: configuration.extensionsPaused,
      intent: Number.isSafeInteger(configuration.settingsIntent) ? configuration.settingsIntent : 0,
      selectedExtensionId: typeof configuration.selectedExtensionId === 'string' ? configuration.selectedExtensionId : ''
    };
  }

  function literal(value) { return JSON.stringify(value).replaceAll('</script', '<\\/script'); }

  // Compiled once per fingerprint rather than on every poll.
  const preparedCache = new Map();
  function prepared(item) {
    let result = preparedCache.get(item.fingerprint);
    if (result !== undefined) return result;
    try {
      // Syntax validation occurs in the main process. The renderer receives an
      // ordinary function literal and does not need eval or a CSP exception.
      trace.span(`extension.compile:${item.manifest.id}`, () => new Function('api', `"use strict";\n${item.code}`));
      // The renderer passes its timing primitives in a scope object so a
      // traced launch can attribute callback time to each extension. The
      // inner block lets an extension redeclare any of these names.
      result = `{id:${literal(item.manifest.id)},fingerprint:${literal(item.fingerprint)},start:async function(api,codexPPScope){"use strict";` +
        `const {MutationObserver,requestAnimationFrame,setTimeout,setInterval}=codexPPScope||globalThis;{\n${item.code}\n}}}`;
    } catch (error) {
      result = `{id:${literal(item.manifest.id)},fingerprint:${literal(item.fingerprint)},error:${literal(String(error))}}`;
    }
    preparedCache.set(item.fingerprint, result);
    return result;
  }

  function appContents() {
    return electron.webContents.getAllWebContents().filter(contents => !contents.isDestroyed() && trustedFrame(contents.mainFrame));
  }

  const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const statusExpression = 'globalThis.__codexPP?.protocol===2&&typeof globalThis.__codexPP.status==="function"?globalThis.__codexPP.status():null';
  const syncTimeoutMs = 15000;
  // One outstanding call per window. A hung renderer is reported, not queued.
  const inflight = new Map();
  const lastStates = new Map();

  function withTimeout(promise, label) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} did not respond within ${syncTimeoutMs / 1000} seconds.`)), syncTimeoutMs);
      timer.unref?.();
    })]).finally(() => clearTimeout(timer));
  }

  async function synchronize(contents, desired, key) {
    const status = await trace.async('runtime.sync.status', () => contents.executeJavaScript(statusExpression, false));
    if (status?.key === key && Array.isArray(status.states)) return status.states;
    // The window is new, reloaded or out of date: deliver the full payload.
    const expression = trace.span('runtime.sync.prepare', () => `${rendererRuntime}\n${rendererBridge}\n` +
      `globalThis.__codexPP.sync([${desired.map(prepared).join(',')}],${literal(key)}${trace.enabled && trace.renderer !== false ? ',{trace:true}' : ''})`);
    const states = await trace.async('runtime.sync.full', () => contents.executeJavaScript(expression, false));
    return Array.isArray(states) ? states : [];
  }

  function synchronizeOne(contents, desired, key) {
    const running = inflight.get(contents.id);
    if (running) {
      return Promise.resolve(lastStates.get(contents.id) ||
        [{id:'runtime', state:'error', error:'An app window is busy; extensions will synchronize when it responds.'}]);
    }
    const job = synchronize(contents, desired, key)
      .then(states => { lastStates.set(contents.id, states); return states; })
      .finally(() => { if (inflight.get(contents.id) === job) inflight.delete(contents.id); });
    inflight.set(contents.id, job);
    return withTimeout(job, 'An app window');
  }

  async function publishSettings(contents, value) {
    const key = digest(value);
    const expression = `(()=>{const r=globalThis.__codexPP;if(r?.protocol!==2||typeof r.status!=="function")return;` +
      `if(r.status().settingsKey!==${literal(key)})r.settings(${literal(value)},${literal(key)});})()`;
    await withTimeout(contents.executeJavaScript(expression, false), 'An app window');
  }

  let lastDiagnostic = '', lastDiagnosticTime = 0;
  function writeDiagnostics(value) {
    // The helper treats a diagnostic older than ten seconds as disconnected.
    const serialized = JSON.stringify(value), now = Date.now();
    if (serialized === lastDiagnostic && now - lastDiagnosticTime < 5000) return;
    atomicJSON(diagnosticsFile, {...value, time:new Date(now).toISOString()});
    lastDiagnostic = serialized; lastDiagnosticTime = now;
  }

  let lastErrors = {};
  async function pollOnce() {
    try {
      const configuration = trace.span('runtime.poll.settings', settings);
      const loaded = trace.span('runtime.poll.extensions', extensions);
      const contents = trace.span('runtime.poll.windows', appContents);
      const desired = configuration.extensionsPaused ? [] : loaded.items.filter(item => configuration.enabled[item.manifest.id] === true);
      const key = digest([configuration.extensionsPaused, desired.map(item => [item.manifest.id, item.fingerprint])]);
      const results = await Promise.all(contents.map(async item => {
        try { return await synchronizeOne(item, desired, key); }
        catch (error) { return [{id:'runtime', state:'error', error:String(error)}]; }
      }));
      const errors = {}, active = new Set();
      for (const states of results) for (const state of states) {
        if (state?.error) errors[state.id] = String(state.error);
        else if (state?.state === 'active') active.add(state.id);
      }
      lastErrors = errors;
      // Only changed snapshots cross into each Settings renderer.
      const value = snapshot(configuration, loaded, errors);
      await trace.async('runtime.poll.publishSettings', () => Promise.all(contents.map(item => publishSettings(item, value).catch(() => {}))));
      trace.span('runtime.poll.diagnostics', () => writeDiagnostics({schema:1, pid:process.pid, windows:contents.length,
        activeExtensions:[...active], runtimeErrors:errors, problems:loaded.problems}));
    } catch (error) {
      // An unreadable configuration fails closed: no extension keeps running.
      await Promise.all(appContents().map(item => synchronizeOne(item, [], digest([true, []])).catch(() => {})));
      writeDiagnostics({schema:1, pid:process.pid, windows:0,
        activeExtensions:[], runtimeErrors:{runtime:String(error)}});
    }
  }

  // Polls never overlap. A request made while one runs schedules exactly one
  // follow-up, and its caller waits for that follow-up to observe new settings.
  let polling = null, pollAgain = false;
  function poll() {
    if (disposed) return Promise.resolve();
    if (polling) { pollAgain = true; return polling; }
    polling = (async () => {
      try { do { pollAgain = false; await trace.async('runtime.poll', pollOnce); } while (pollAgain && !disposed); }
      finally { polling = null; }
    })();
    return polling;
  }

  async function install(owner) {
    const selection = await electron.dialog.showOpenDialog(owner || undefined, {
      title:'Install Extension', message:'Choose a folder containing manifest.json and its JavaScript entry.',
      properties:['openDirectory','createDirectory']
    });
    if (selection.canceled || selection.filePaths.length !== 1) return;
    const source = loadExtension(selection.filePaths[0]);
    const confirmation = await electron.dialog.showMessageBox(owner || undefined, {
      type:'warning', buttons:['Install','Cancel'], defaultId:1, cancelId:1,
      message:`Install ${source.manifest.name}?`,
      detail:`Version ${source.manifest.version}. Extensions execute JavaScript inside ChatGPT and can read or change its interface. Install code you trust.`
    });
    if (confirmation.response !== 0) return;
    fs.mkdirSync(extensionsDirectory, {recursive:true, mode:0o700});
    const destination = path.join(extensionsDirectory, source.manifest.id);
    const stage = path.join(extensionsDirectory, `.install-${crypto.randomUUID()}`);
    const backup = path.join(extensionsDirectory, `.backup-${crypto.randomUUID()}`);
    try {
      fs.cpSync(source.root, stage, {recursive:true, errorOnExist:true, force:false, filter:file => !fs.lstatSync(file).isSymbolicLink()});
      loadExtension(stage);
      const existed = fs.existsSync(destination);
      if (existed) fs.renameSync(destination, backup);
      try { fs.renameSync(stage, destination); }
      catch (error) { if (existed) fs.renameSync(backup, destination); throw error; }
      if (existed) fs.rmSync(backup, {recursive:true, force:true});
    } finally {
      if (fs.existsSync(stage)) fs.rmSync(stage, {recursive:true, force:true});
    }
  }

  async function action(event, request) {
    // Pause stays available when settings.json is unreadable, and writes a valid file.
    let configuration;
    try { configuration = settings(); }
    catch (error) {
      if (request.action !== 'pause') throw error;
      configuration = {appPath:'/Applications/ChatGPT.app', extensionsPaused:true, enabled:{}};
    }
    const owner = electron.BrowserWindow.fromWebContents(event.sender);
    switch (request.action) {
      case 'state': break;
      case 'folder': {
        fs.mkdirSync(extensionsDirectory, {recursive:true, mode:0o700});
        const error = await electron.shell.openPath(extensionsDirectory);
        if (error) throw new Error(error);
        break;
      }
      case 'install': await install(owner); break;
      case 'pause': configuration.extensionsPaused = true; saveSettings(configuration); break;
      case 'resume': configuration.extensionsPaused = false; saveSettings(configuration); break;
      case 'set-enabled':
        if (!validID(request.extensionId) || typeof request.enabled !== 'boolean') throw new Error('Invalid extension selection.');
        if (!extensions().items.some(item => item.manifest.id === request.extensionId)) throw new Error('This extension is no longer installed.');
        configuration.enabled[request.extensionId] = request.enabled; saveSettings(configuration); break;
      case 'remove': {
        if (!validID(request.extensionId)) throw new Error('Invalid extension selection.');
        const destination = path.join(extensionsDirectory, request.extensionId);
        const item = loadExtension(destination);
        if (item.manifest.id !== request.extensionId || item.root !== fs.realpathSync(destination)) throw new Error('Invalid extension folder.');
        configuration.enabled[request.extensionId] = false; saveSettings(configuration);
        await electron.shell.trashItem(destination);
        break;
      }
      default: throw new Error('Unknown extension action.');
    }
    await poll();
    return snapshot(settings(), extensions(), lastErrors);
  }

  function handle(event, request) {
    if (!trustedEvent(event)) throw new Error('Invalid Codex++ settings sender.');
    if (typeof request.requestId !== 'string' || request.requestId.length === 0 || request.requestId.length > 128 || typeof request.action !== 'string') {
      throw new Error('Invalid Codex++ settings request.');
    }
    void action(event, request).then(
      data => { if (!event.sender.isDestroyed()) event.sender.send(responseChannel, {type:'codexpp-settings-result', requestId:request.requestId, ok:true, data}); },
      error => { if (!event.sender.isDestroyed()) event.sender.send(responseChannel, {type:'codexpp-settings-result', requestId:request.requestId, ok:false, error:error.message || String(error)}); }
    );
  }

  const created = (_event, contents) => {
    const refresh = () => {
      // A reload discards the old page's runtime; never wait on its job.
      inflight.delete(contents.id); lastStates.delete(contents.id);
      if (trustedFrame(contents.mainFrame)) void poll();
    };
    contents.on('did-finish-load', refresh);
    contents.on('destroyed', () => { inflight.delete(contents.id); lastStates.delete(contents.id); });
  };
  electron.app.on('web-contents-created', created);
  // Traced launches pull each window's extension timing report.
  trace.collector(() => Promise.all(appContents().map(contents => withTimeout(
    contents.executeJavaScript('globalThis.__codexPP?.trace?.()??null', false), 'An app window'
  ).then(report => report && {webContentsId:contents.id, ...report, page:new URL(contents.mainFrame.url).pathname,
    route:(({search, hash}) => (search + hash).slice(0, 160))(new URL(contents.mainFrame.url)),
    pid:contents.getOSProcessId?.() ?? null,
    subframes:(() => { try { return contents.mainFrame.framesInSubtree.slice(0, 30).map(frame => ({origin:(() => { try { const url = new URL(frame.url); return url.origin + url.pathname.slice(0, 80); } catch { return null; } })(), pid:frame.osProcessId})); } catch { return []; } })(),
    visible:electron.BrowserWindow.fromWebContents(contents)?.isVisible?.() ?? null}, () => null)))
    .then(reports => reports.filter(Boolean)));
  // Settings and extension edits poll at once through file watches, and a
  // window load polls on its own; the heartbeat keeps the helper's diagnostics
  // fresh (it treats ten seconds as disconnected) and catches a missed event.
  // A one-second poll ran two scripts in every window forever, even idle.
  for (const [target, options] of [[support, {}], [extensionsDirectory, {recursive:true}]]) {
    try {
      const watcher = fs.watch(target, options, () => void poll());
      watcher.on?.('error', () => {});
      watcher.unref?.();
      watchers.push(watcher);
    } catch {}
  }
  timer = setInterval(() => void poll(), 4000);
  timer.unref?.();
  void electron.app.whenReady().then(poll);

  return Object.freeze({
    handles(request) { return request?.type === 'codexpp-settings'; },
    handle,
    poll,
    dispose() {
      disposed = true;
      if (timer) clearInterval(timer);
      for (const watcher of watchers.splice(0)) { try { watcher.close(); } catch {} }
      electron.app.removeListener('web-contents-created', created);
      for (const contents of appContents()) void contents.executeJavaScript('globalThis.__codexPP?.sync([]);globalThis.__codexPPBridge?.stop?.()', false).catch(() => {});
    }
  });
})
