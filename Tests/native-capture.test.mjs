import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const source = readFileSync(new URL('../Sources/CodexPPCore/Resources/native-capture.js', import.meta.url), 'utf8');
const hostRequire = createRequire(import.meta.url);
const marker = '__CODEXPP_APPSHOT_V1__';
const targetApp = 'com.example.Target';

function stream() {
  const value = new EventEmitter();
  value.setEncoding = () => {};
  return value;
}

function harness(onMessage) {
  const messages = [], spawnCalls = [], signatureCalls = [], logs = [];
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = stream();
  child.stderr = stream();
  child.stdin = {
    writable: true,
    write(line) {
      const message = JSON.parse(line);
      messages.push(message);
      onMessage?.(message, reply);
      return true;
    }
  };
  child.kill = () => { child.exitCode = 0; child.emit('exit', 0, null); };
  const reply = message => queueMicrotask(() => child.stdout.emit('data', `${JSON.stringify(message)}\n`));
  const childProcess = {
    spawnSync(executable, args, options) {
      signatureCalls.push({executable, args, options});
      return args[0] === '--verify'
        ? {status: 0, stdout: '', stderr: ''}
        : {status: 0, stdout: '', stderr: 'TeamIdentifier=2DC432GLL2\n'};
    },
    spawn(executable, args, options) {
      spawnCalls.push({executable, args, options});
      return child;
    }
  };
  const sandbox = vm.createContext({
    console: {error: (...args) => logs.push(args.map(String).join(' '))},
    process: {
      resourcesPath: '/Applications/ChatGPT.app/Contents/Resources',
      env: {ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--require bad.js', PRESERVED: 'yes'}
    },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    require(name) {
      if (name === 'child_process') return childProcess;
      if (name === 'fs') return {statSync: () => ({isFile: () => true})};
      if (name === 'path') return path;
      throw new Error(`Unexpected require: ${name}`);
    }
  });
  const factory = vm.runInContext(source, sandbox, {filename: 'native-capture.js'});
  return {bridge: factory({}), child, logs, messages, reply, signatureCalls, spawnCalls};
}

function validRequest(app = targetApp) {
  return {
    type: 'fetch', method: 'POST', url: 'vscode://codex/computer-use-start-capture', requestId: 'fetch-1',
    body: JSON.stringify({requestId: 'capture-1', bundleIdentifier: app})
  };
}

function sender() {
  const sent = [];
  return {sent, isDestroyed: () => false, send: (channel, message) => sent.push({channel, message})};
}

function standardRuntime({payload = {text: 'AX tree', screenshotDataURL: 'data:image/png;base64,iVBORw0KGgo='}, scopes} = {}) {
  let toolCall;
  const approvals = [];
  const queue = scopes ?? [{connector_id: 'computer-use', tool_name: 'get_app_state', tool_params: {app: targetApp}}];
  let index = 0;
  return {
    approvals,
    onMessage(message, reply) {
      if (message.method === 'initialize') {
        reply({jsonrpc: '2.0', id: message.id, result: {serverInfo: {name: 'rmcp'}}});
      } else if (message.method === 'tools/call') {
        toolCall = message;
        reply({jsonrpc: '2.0', id: 700 + index, method: 'elicitation/create', params: {meta: queue[index]}});
      } else if (message.id >= 700 && message.result) {
        approvals.push(message.result.action);
        index++;
        if (index < queue.length) {
          reply({jsonrpc: '2.0', id: 700 + index, method: 'elicitation/create', params: {_meta: queue[index]}});
        } else {
          reply({jsonrpc: '2.0', id: toolCall.id, result: {content: [{type: 'text', text: marker + JSON.stringify(payload)}]}});
        }
      }
    }
  };
}

test('headless capture preserves the signed-launch, MCP, approval, and renderer contracts', async t => {
  const runtime = standardRuntime();
  const h = harness(runtime.onMessage);
  t.after(() => h.bridge.dispose());
  const view = sender();
  assert.equal(h.bridge.handles(validRequest()), true);
  assert.equal(h.bridge.handles({...validRequest(), url: 'vscode://codex/computer-use-frontmost-window'}), false);

  const relay = h.bridge.relay(view, validRequest());
  assert.deepEqual(view.sent.map(item => item.message.type), ['fetch-response', 'computer-use-capture-updated']);
  assert.equal(view.sent[1].message.update.type, 'metadata');
  await relay;

  assert.equal(h.signatureCalls.length, 4);
  assert.deepEqual(h.signatureCalls.map(call => call.args[0]), ['--verify', '-d', '--verify', '-d']);
  assert.equal(h.spawnCalls.length, 1);
  const spawn = h.spawnCalls[0];
  assert.match(spawn.executable, /\/cua_node\/bin\/node$/);
  assert.match(spawn.args[0], /\/@oai\/cua-repl\/bin\/cua-repl\.mjs$/);
  assert.equal(spawn.options.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(spawn.options.env.NODE_OPTIONS, undefined);
  assert.equal(spawn.options.env.PRESERVED, 'yes');
  assert.equal(spawn.options.env.CUA_REPL_ENABLED_SURFACES, 'computer');
  assert.equal(spawn.options.env.NODE_REPL_TRUSTED_SERVICES, JSON.stringify({sky: '@oai/sky/service'}));
  assert.equal(spawn.options.env.NODE_REPL_DISABLE_ANALYTICS, '1');
  assert.equal(spawn.options.env.BROWSER_USE_DISABLE_AMBIENT_NETWORK, '1');

  const initialize = h.messages.find(message => message.method === 'initialize');
  assert.equal(initialize.params.protocolVersion, '2025-11-25');
  assert.deepEqual(initialize.params.capabilities, {elicitation: {form: {}}});
  assert.ok(h.messages.some(message => message.method === 'notifications/initialized'));
  const call = h.messages.find(message => message.method === 'tools/call');
  assert.equal(call.params.name, 'js');
  assert.equal(call.params.arguments.timeout_ms, 45000);
  assert.match(call.params.arguments.code, /^await \(async\(\)=>\{/);
  assert.match(call.params.arguments.code, /\}\)\(\);$/);
  assert.match(call.params.arguments.code, /sky\.get_app_state\(\{app:"com\.example\.Target",disableDiff:true\}\)/);
  assert.match(call.params.arguments.code, /image\.length>16777216/);
  assert.match(call.params.arguments.code, /text\.length>2097152/);
  assert.deepEqual(runtime.approvals, ['accept']);

  assert.deepEqual(view.sent.map(item => item.message.type), [
    'fetch-response', 'computer-use-capture-updated', 'computer-use-capture-updated',
    'computer-use-capture-updated', 'computer-use-capture-updated'
  ]);
  assert.equal(JSON.parse(view.sent[0].message.bodyJsonString).result, 'started');
  assert.deepEqual(view.sent.slice(1).map(item => item.message.update.type), ['metadata', 'axText', 'screenshot', 'completed']);
  assert.equal(view.sent[1].message.update.app.bundleIdentifier, targetApp);
  assert.equal(view.sent[2].message.update.text, 'AX tree');
  assert.equal(view.sent[3].message.update.transitionSnapshotDataURL, view.sent[3].message.update.screenshotDataURL);
});

test('elicitation scope changes fail closed until connector, tool, and app all match', async t => {
  const runtime = standardRuntime({scopes: [
    {connector_id: 'other', tool_name: 'get_app_state', tool_params: {app: targetApp}},
    {connector_id: 'computer-use', tool_name: 'other_tool', tool_params: {app: targetApp}},
    {connector_id: 'computer-use', tool_name: 'get_app_state', tool_params: {app: 'com.example.Other'}},
    {connector_id: 'computer-use', tool_name: 'get_app_state', tool_params: {app: targetApp}}
  ]});
  const h = harness(runtime.onMessage);
  t.after(() => h.bridge.dispose());
  await h.bridge.relay(sender(), validRequest());
  assert.deepEqual(runtime.approvals, ['decline', 'decline', 'decline', 'accept']);
});

test('response-shape changes fail the acknowledged capture without emitting partial content', async t => {
  for (const result of [
    {content: [{type: 'text', text: 'the marker changed'}]},
    {content: [{type: 'text', text: marker + JSON.stringify({text: [], screenshotDataURL: 'file:///tmp/image.png'})}]},
    {isError: true, content: [{type: 'text', text: 'upstream rejected the call'}]}
  ]) {
    let toolId;
    const h = harness((message, reply) => {
      if (message.method === 'initialize') reply({jsonrpc: '2.0', id: message.id, result: {serverInfo: {name: 'rmcp'}}});
      if (message.method === 'tools/call') { toolId = message.id; reply({jsonrpc: '2.0', id: toolId, result}); }
    });
    t.after(() => h.bridge.dispose());
    const view = sender();
    await h.bridge.relay(view, validRequest());
    assert.equal(view.sent.length, 3);
    assert.equal(view.sent[0].message.type, 'fetch-response');
    assert.equal(view.sent[0].message.responseType, 'success');
    assert.equal(view.sent[1].message.update.type, 'metadata');
    assert.equal(view.sent[2].message.update.type, 'failed');
    assert.equal(view.sent[2].message.update.failureReason, 'start_request_failed');
  }
});

test('unexpected server identity and malformed requests fail before capture events', async t => {
  const changed = harness((message, reply) => {
    if (message.method === 'initialize') reply({jsonrpc: '2.0', id: message.id, result: {serverInfo: {name: 'renamed-server'}}});
  });
  t.after(() => changed.bridge.dispose());
  await assert.rejects(changed.bridge.warmup(), /unexpected identity/);

  const neverStarted = harness(() => assert.fail('invalid input must not start the runtime'));
  const view = sender();
  await neverStarted.bridge.relay(view, {...validRequest(), body: JSON.stringify({requestId: '', bundleIdentifier: '../bad app'})});
  assert.equal(neverStarted.spawnCalls.length, 0);
  assert.equal(view.sent[0].message.responseType, 'error');
  assert.match(view.sent[0].message.error, /invalid/);
});

test('live signed runtime still satisfies the Appshot contract', {skip: !process.env.CODEXPP_LIVE_APPSHOT_APP, timeout: 60000}, async t => {
  const resourcesPath = process.env.CODEXPP_CUA_RESOURCES ?? '/Applications/ChatGPT.app/Contents/Resources';
  const liveProcess = {resourcesPath, env: process.env};
  const factory = vm.runInNewContext(source, {console, process: liveProcess, setTimeout, clearTimeout, require: hostRequire}, {filename: 'native-capture.js'});
  const bridge = factory({});
  t.after(() => bridge.dispose());
  for (let attempt = 1; attempt <= 2; attempt++) {
    const view = sender();
    const request = validRequest(process.env.CODEXPP_LIVE_APPSHOT_APP);
    request.requestId = `fetch-${attempt}`;
    request.body = JSON.stringify({requestId: `capture-${attempt}`, bundleIdentifier: process.env.CODEXPP_LIVE_APPSHOT_APP});
    const relay = bridge.relay(view, request);
    assert.equal(view.sent[0]?.message?.responseType, 'success', `attempt ${attempt}: capture was not acknowledged synchronously`);
    await relay;
    const response = view.sent[0]?.message;
    assert.equal(response?.responseType, 'success', `attempt ${attempt}: ${response?.error ?? 'missing Appshot response'}`);
    const updates = view.sent.slice(1).map(item => item.message.update);
    assert.deepEqual(updates.map(update => update.type), ['metadata', 'axText', 'screenshot', 'completed']);
    assert.equal(typeof updates[1].text, 'string');
    assert.match(updates[2].screenshotDataURL, /^data:image\/(png|jpeg);base64,/);
    assert.ok(updates[2].screenshotDataURL.length > 32);
  }
});
