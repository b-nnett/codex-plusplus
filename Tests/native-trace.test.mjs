import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../Sources/CodexPPCore/Resources/native-trace.js', import.meta.url), 'utf8');
const nativeRuntime = fs.readFileSync(new URL('../Sources/CodexPPCore/Resources/native-runtime.js', import.meta.url), 'utf8');
const rendererRuntime = fs.readFileSync(new URL('../Sources/CodexPPCore/Resources/renderer-runtime.js', import.meta.url), 'utf8');
const rendererBridge = fs.readFileSync(new URL('../Sources/CodexPPCore/Resources/renderer-bridge.js', import.meta.url), 'utf8');

function tracer(env = {}) {
  const support = fs.mkdtempSync(path.join(os.tmpdir(), 'codexpp-trace-'));
  const factory = vm.runInNewContext(source, {console, process: {...process, env}, setInterval, clearInterval, setTimeout, clearTimeout, require}, {filename: 'native-trace.js'});
  return {support, trace: factory(support, 'test-adapter')};
}

test('a disabled tracer is a frozen pass-through with no files or timers', async () => {
  const {support, trace} = tracer();
  try {
    assert.equal(trace.enabled, false);
    assert.ok(Object.isFrozen(trace));
    assert.equal(trace.span('x', () => 7), 7);
    assert.equal(await trace.async('x', async () => 8), 8);
    trace.start({app: new EventEmitter()});
    assert.equal(fs.existsSync(path.join(support, 'Diagnostics')), false);
  } finally { fs.rmSync(support, {recursive: true, force: true}); }
});

test('the enable file turns tracing on without an environment variable', () => {
  const support = fs.mkdtempSync(path.join(os.tmpdir(), 'codexpp-trace-'));
  try {
    fs.mkdirSync(path.join(support, 'Diagnostics'));
    fs.writeFileSync(path.join(support, 'Diagnostics', 'trace.enable'), '');
    const factory = vm.runInNewContext(source, {console, process: {...process, env: {}}, setInterval, clearInterval, setTimeout, clearTimeout, require}, {filename: 'native-trace.js'});
    assert.equal(factory(support, 'a').enabled, true);
  } finally { fs.rmSync(support, {recursive: true, force: true}); }
});

test('an enabled tracer records sync and async spans and writes them on quit', async () => {
  const {support, trace} = tracer({CODEXPP_TRACE: '1'});
  const app = new EventEmitter();
  try {
    assert.equal(trace.enabled, true);
    assert.throws(() => trace.span('throws', () => { throw new Error('boom'); }), /boom/);
    trace.span('busy', () => { const end = Date.now() + 5; while (Date.now() < end) {} });
    await trace.async('waits', () => new Promise(resolve => setTimeout(resolve, 10)));
    trace.measure('measured', trace.now() - 3);
    trace.collector(async () => [{webContentsId: 1, page: '/index.html', stats: [], slow: [], longTasks: []}]);
    trace.start({app});
    await trace.flush();
    app.emit('before-quit');
    const file = path.join(support, 'Diagnostics', `startup-trace-${process.pid}.json`);
    const written = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(written.schema, 1);
    assert.equal(written.adapter, 'test-adapter');
    const byName = Object.groupBy(written.events, event => `${event.name}/${event.kind}`);
    assert.ok(byName['throws/sync']);
    assert.ok(byName['busy/sync'][0].dur >= 4);
    assert.ok(byName['waits/async'][0].dur >= 8);
    assert.ok(byName['waits/sync'][0].dur < byName['waits/async'][0].dur);
    assert.ok(byName['measured/sync'][0].dur >= 2);
    assert.equal(written.renderers[0].page, '/index.html');
    assert.ok(written.processStart <= written.bootstrapStart && written.bootstrapStart <= written.whenReady);
  } finally {
    app.emit('before-quit');
    fs.rmSync(support, {recursive: true, force: true});
  }
});

function rendererContext() {
  const callbacks = [];
  const ctx = vm.createContext({
    console, URL, setTimeout, clearTimeout, setInterval, clearInterval, performance,
    crypto: {randomUUID: () => 'id'},
    document: {head: {append() {}}, createElement: () => ({dataset: {}, remove() {}})},
    electronBridge: {sendMessageFromView() {}},
    requestAnimationFrame: callback => { callbacks.push(callback); return callbacks.length; },
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} }
  });
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  vm.runInContext(`${rendererRuntime}\n${rendererBridge}`, ctx);
  return {ctx, callbacks};
}

// Mirrors native-runtime's prepared() wrapper.
function prepared(ctx, id, code) {
  return vm.runInContext(`({id:${JSON.stringify(id)},fingerprint:'f',start:async function(api,codexPPScope){"use strict";` +
    `const {MutationObserver,requestAnimationFrame,setTimeout,setInterval}=codexPPScope||globalThis;{\n${code}\n}}})`, ctx);
}

test('traced renderers attribute extension callback time and report it', async () => {
  const {ctx, callbacks} = rendererContext();
  const code = `const spin = () => { const end = Date.now() + 5; while (Date.now() < end) {} };
    globalThis.observer = new MutationObserver(spin);
    requestAnimationFrame(spin);
    api.on(globalThis, 'resize', spin);`;
  await ctx.__codexPP.sync([prepared(ctx, 'heavy', code)], 'k', {trace: true});
  ctx.observer.callback([]);
  callbacks.shift()();
  const report = ctx.__codexPP.trace();
  const stats = Object.fromEntries(report.stats.map(stat => [stat.name, stat]));
  assert.equal(stats['heavy:mutation'].count, 1);
  assert.ok(stats['heavy:mutation'].totalMs >= 4);
  assert.equal(stats['heavy:frame'].count, 1);
  assert.ok(stats['heavy:start'].count === 1 && stats['heavy:start.sync'].count === 1);
  assert.ok(report.slow.some(event => event.name === 'heavy:frame'));
  assert.ok(report.origin > 0);
});

test('untraced renderers pass the real primitives and report nothing', async () => {
  const {ctx} = rendererContext();
  await ctx.__codexPP.sync([prepared(ctx, 'plain', 'globalThis.same = MutationObserver === globalThis.MutationObserver;')], 'k');
  assert.equal(ctx.same, true);
  assert.equal(ctx.__codexPP.trace(), null);
});

test('an extension may redeclare a scoped primitive name', async () => {
  const {ctx} = rendererContext();
  const states = await ctx.__codexPP.sync([prepared(ctx, 'shadow', 'const setTimeout = () => 42; function own() { return setTimeout(); } globalThis.result = own();')], 'k', {trace: true});
  assert.equal(states[0].state, 'active');
  assert.equal(ctx.result, 42);
});

test('the main-process host emits the scoped wrapper and requests renderer tracing', async () => {
  const support = fs.mkdtempSync(path.join(os.tmpdir(), 'codexpp-trace-host-'));
  const directory = path.join(support, 'Extensions', 'example');
  fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({id: 'example', name: 'Example', version: '1', scope: 'renderer', main: 'index.js'}));
  fs.writeFileSync(path.join(directory, 'index.js'), 'const setInterval = 1; globalThis.ran = setInterval;');
  fs.writeFileSync(path.join(support, 'settings.json'), JSON.stringify({extensionsPaused: false, enabled: {example: true}}));
  const {ctx} = rendererContext();
  const calls = [];
  const contents = new EventEmitter();
  Object.assign(contents, {id: 1, mainFrame: {url: 'app://-/index.html'}, isDestroyed: () => false, send() {},
    executeJavaScript: expression => { calls.push(expression); return Promise.resolve(vm.runInContext(expression, ctx)); }});
  const app = new EventEmitter();
  app.whenReady = () => Promise.resolve();
  const electron = {app, webContents: {getAllWebContents: () => [contents]}, BrowserWindow: {fromWebContents: () => null}};
  const spans = [];
  const trace = {enabled: true, span: (name, fn) => { spans.push(name); return fn(); }, async: (name, fn) => { spans.push(name); return fn(); }, collector() {}};
  const factory = vm.runInNewContext(nativeRuntime, {console, URL, Buffer, process, setInterval, clearInterval, setTimeout, clearTimeout, require}, {filename: 'native-runtime.js'});
  const runtime = factory(electron, support, rendererRuntime, rendererBridge, trace);
  try {
    await runtime.poll();
    assert.equal(ctx.ran, 1);
    assert.ok(calls.some(call => call.includes(',{trace:true})')));
    assert.ok(ctx.__codexPP.trace());
    for (const name of ['runtime.poll', 'runtime.poll.settings', 'runtime.poll.extensions', 'extension.compile:example', 'runtime.sync.full']) {
      assert.ok(spans.includes(name), name);
    }
  } finally {
    runtime.dispose();
    fs.rmSync(support, {recursive: true, force: true});
  }
});

test('vendor IPC handlers are timed by channel and type and stay removable', async () => {
  const support = fs.mkdtempSync(path.join(os.tmpdir(), 'codexpp-trace-ipc-'));
  const ipcMain = new EventEmitter();
  const handlers = new Map();
  ipcMain.handle = (channel, listener) => handlers.set(channel, listener);
  const app = new EventEmitter();
  const factory = vm.runInNewContext(source, {console, process: {...process, env: {CODEXPP_TRACE: '1', CODEXPP_TRACE_MAIN_PROFILE: '1'}}, setInterval, clearInterval, setTimeout, clearTimeout, URL, require}, {filename: 'native-trace.js'});
  const trace = factory(support, 'ipc-adapter', {ipcMain, app});
  try {
    let calls = 0;
    const listener = () => { calls++; };
    ipcMain.on('vendor-channel', listener);
    ipcMain.emit('vendor-channel', {}, {type: 'hello', secret: 'not recorded'});
    ipcMain.removeListener('vendor-channel', listener);
    ipcMain.emit('vendor-channel', {}, {type: 'hello'});
    assert.equal(calls, 1);
    ipcMain.handle('invoke', async () => 5);
    assert.equal(await handlers.get('invoke')({}, {}), 5);
    await new Promise(resolve => setTimeout(resolve, 0));
    trace.start({app});
    app.emit('before-quit');
    const written = JSON.parse(fs.readFileSync(path.join(support, 'Diagnostics', `startup-trace-${process.pid}.json`), 'utf8'));
    const names = written.events.map(event => `${event.name}/${event.kind}`);
    assert.ok(names.includes('ipc:vendor-channel:hello/sync'));
    assert.ok(names.includes('ipc:invoke/async'));
    assert.ok(!JSON.stringify(written).includes('not recorded'));
    assert.equal(written.profiles[0]?.kind, 'main');
    assert.ok(fs.existsSync(written.profiles[0].file));
  } finally {
    app.emit('before-quit');
    fs.rmSync(support, {recursive: true, force: true});
  }
});
