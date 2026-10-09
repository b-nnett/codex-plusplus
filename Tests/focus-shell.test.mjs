import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';

const resource = name => fs.readFileSync(new URL(`../Sources/CodexPPCore/Resources/${name}.js`, import.meta.url), 'utf8');
const extension = fs.readFileSync(new URL('../extensions/focus-mode/index.js', import.meta.url), 'utf8');
const rendererRuntime = fs.readFileSync(new URL('../Sources/CodexPP/Resources/runtime.js', import.meta.url), 'utf8');
const parser = vm.createContext({});
for (const name of ['acorn', 'shell-adapter']) vm.runInContext(resource(name), parser);
const fixture = (name = 'toggle', open = 'state') => `
function ${name}() {}
const ${open} = false, peek = false;
const commands = new Map([['toggleSidebar', ${name}]]);
const frame = {'data-app-shell-frame':true, 'data-app-shell-sidebar-open':${open}};
const panel = {'data-app-shell-left-panel-appearance':'default','data-slate-sidebar-peeking':peek};
const main = {'data-app-shell-main-surface':'default'};
const titlebar = {'data-app-shell-titlebar':true};
`;

test('Focus Mode skips unsupported renderer entries before touching any APIs', () => {
  for (const pathname of ['/detached-window.html', '/settings', '/settings/general', '/unknown.html']) {
    const ctx = vm.createContext({location:{pathname}});
    // No DOM, bridge, timers or extension APIs: none should be touched.
    assert.equal(vm.runInContext(`(new Function('api', ${JSON.stringify(extension)}))({})`, ctx), undefined);
  }
});

test('Focus Mode still reports a missing shell in the supported main renderer', async () => {
  let timers = 0;
  const ctx = vm.createContext({location:{pathname:'/index.html'},
    setTimeout(fn) {timers++; queueMicrotask(fn);}});
  vm.runInContext(rendererRuntime, ctx);
  const states = await ctx.__codexPP.sync([{id:'focus-mode',code:extension}]);
  assert.equal(states[0].state, 'error');
  assert.match(states[0].error, /shell v1 is unavailable/);
  assert.equal(timers, 99);
});

test('Hot-update clears the old detached-window failure without a reload or another wait', async () => {
  let timers = 0;
  const ctx = vm.createContext({location:{pathname:'/detached-window.html'},
    setTimeout(fn) {timers++; queueMicrotask(fn);}});
  vm.runInContext(rendererRuntime, ctx);
  const old = await ctx.__codexPP.sync([{id:'focus-mode',code:'return api.waitForShell();'}]);
  assert.equal(old[0].state, 'error');
  timers = 0;
  const fixed = await ctx.__codexPP.sync([{id:'focus-mode',code:extension}]);
  assert.equal(fixed[0].state, 'active');
  assert.equal(fixed[0].error, null);
  assert.equal(timers, 0);
  const repeated = await ctx.__codexPP.sync([{id:'focus-mode',code:extension}]);
  assert.equal(repeated[0].error, null);
  assert.equal(timers, 0);
});

test('Shell discovery survives renamed symbols, formatting and string syntax', () => {
  for (const source of [fixture(), fixture('renamedCommand', 'sidebarState').replaceAll("'", '"').replace('"toggleSidebar"', '`toggleSidebar`')]) {
    const patched = parser.CodexPPShellAdapter.adapt(source, '');
    let command;
    const ctx = vm.createContext({__codexPPShell:{registerSidebarToggle(fn) {command = fn; return fn;}}});
    vm.runInContext(patched, ctx);
    assert.equal(typeof command, 'function');
    assert.equal(vm.runInContext("commands.get('toggleSidebar')", ctx), command);
    assert.equal(vm.runInContext("frame['data-codexpp-shell-sidebar-open']", ctx), false);
    assert.equal(vm.runInContext("panel['data-codexpp-shell-peeking']", ctx), false);
    for (const role of ['frame','panel','main','titlebar'])
      assert.equal(vm.runInContext(`${role}['data-codexpp-shell-role']`, ctx), role);
  }
});

test('Missing, ambiguous, malformed and already patched shells fail closed', () => {
  assert.throws(() => parser.CodexPPShellAdapter.adapt('throw Error("never execute");', ''), /expected one match/);
  assert.throws(() => parser.CodexPPShellAdapter.adapt(fixture() + "const duplicate = {'data-app-shell-main-surface':'default'};", ''), /found 2/);
  assert.throws(() => parser.CodexPPShellAdapter.adapt(fixture().replace('toggleSidebar', 'unknownCommand'), ''), /Shell command/);
  assert.throws(() => parser.CodexPPShellAdapter.adapt(parser.CodexPPShellAdapter.adapt(fixture(), ''), ''), /already adapted/);
  assert.throws(() => parser.CodexPPShellAdapter.adapt('{', ''), /Unexpected token/);
});

function native() {
  let now = 0, installed = true;
  let settings = {enabled:{'focus-mode':true}};
  const timers = new Map(), calls = [];
  const win = new EventEmitter();
  win.isDestroyed = () => false;
  win.setWindowButtonVisibility = visible => calls.push(visible);
  const owner = new EventEmitter();
  owner.mainFrame = {url:'app://-/index.html'};
  const event = {sender:owner,senderFrame:owner.mainFrame};
  const ctx = vm.createContext({URL,process:{platform:'darwin'},Date:{now:() => now},
    setInterval(fn) {const id = {}; timers.set(id, fn); return id;}, clearInterval:id => timers.delete(id),
    require:name => name === 'path' ? path : {readFileSync(file) {
      if (file.endsWith('settings.json')) return JSON.stringify(settings);
      if (!installed) throw Error('removed');
      return JSON.stringify({id:'focus-mode',scope:'renderer'});
    }}});
  const bridge = vm.runInContext(resource('native-shell'), ctx)({BrowserWindow:{fromWebContents:sender => sender === owner ? win : null}}, '/support');
  const controls = hidden => bridge.controls(event, {protocol:1,hidden});
  return {bridge,controls,event,owner,win,calls,timers,
    tick(ms) {now += ms; for (const fn of timers.values()) fn();},
    settings(value) {settings=value;}, remove() {installed=false;}};
}

function rendererShell() {
  const listeners = new Set(), timers = new Map(), requests = [];
  let sequence = 0;
  const ctx = vm.createContext({crypto:{randomUUID:() => `request-${++sequence}`},
    setTimeout(fn) {const id = {}; timers.set(id, fn); return id;},
    clearTimeout:id => timers.delete(id),
    addEventListener(_type, fn) {listeners.add(fn);},
    removeEventListener(_type, fn) {listeners.delete(fn);},
    electronBridge:{sendMessageFromView(request) {requests.push(request); return Promise.resolve();}}});
  vm.runInContext('globalThis.window = globalThis', ctx);
  vm.runInContext(resource('shell-runtime'), ctx);
  return {shell:ctx.__codexPPShell, requests, timers, listeners,
    reply(source, origin, data) {for (const fn of [...listeners]) fn({source, origin, data});},
    local:vm.runInContext('window', ctx)};
}

test('Native controls accept the real source-null preload relay and same-window replies', async () => {
  for (const preload of [true, false]) {
    const f = rendererShell();
    const pending = f.shell.windowControls(true);
    f.reply(preload ? null : f.local, preload ? '' : 'app://-', {
      type:'codexpp-shell-controls-result', requestId:f.requests[0].requestId, supported:true, hidden:true});
    assert.equal((await pending).hidden, true);
    assert.equal(f.timers.size, 0);
    assert.equal(f.listeners.size, 0);
  }
});

test('Native controls reject unrelated frames, origins, request IDs and failed acknowledgements', async () => {
  const f = rendererShell();
  const pending = f.shell.windowControls(true);
  const data = {type:'codexpp-shell-controls-result', requestId:f.requests[0].requestId, supported:true, hidden:true};
  f.reply({}, '', data);
  f.reply(null, 'https://unrelated.example', data);
  f.reply(null, '', {...data, requestId:'another-request'});
  f.reply(null, '', {...data, type:'another-message'});
  assert.equal(f.timers.size, 1);
  assert.equal(f.listeners.size, 1);
  f.reply(null, '', {...data, supported:false});
  await assert.rejects(pending, /Native window controls unavailable/);
  assert.equal(f.timers.size, 0);
  assert.equal(f.listeners.size, 0);
  const timedOut = f.shell.windowControls(true);
  for (const timer of [...f.timers.values()]) timer();
  await assert.rejects(timedOut, /timed out/);
  assert.equal(f.listeners.size, 0);
});

test('Native controls hide immediately, refresh leases and restore on expiry', () => {
  const f = native();
  assert.equal(f.controls(true).hidden, true);
  assert.deepEqual(f.calls, [false]);
  f.tick(3000); f.controls(true); f.tick(3000);
  assert.equal(f.calls.at(-1), false);
  f.tick(1000);
  assert.equal(f.calls.at(-1), true);
  assert.equal(f.timers.size, 0);
  assert.equal(f.owner.listenerCount('did-start-navigation'), 0);
});

test('Crash, unresponsive window and top-level navigation revoke native leases', () => {
  for (const signal of ['destroyed','render-process-gone','unresponsive','navigation']) {
    const f = native(); f.controls(true);
    if (signal === 'navigation') {
      f.owner.emit('did-start-navigation', {}, 'https://child.test', false, false);
      assert.equal(f.calls.at(-1), false);
      f.owner.emit('did-start-navigation', {}, 'app://-/index.html', true, true);
      assert.equal(f.calls.at(-1), false);
      f.owner.emit('did-start-navigation', {}, 'app://-/index.html', false, true);
    } else (signal === 'unresponsive' ? f.win : f.owner).emit(signal);
    assert.equal(f.calls.at(-1), true);
    assert.equal(f.timers.size, 0);
    assert.equal(f.win.listenerCount('unresponsive'), 0);
    assert.equal(f.owner.listenerCount('destroyed'), 0);
  }
});

test('Pause, disable, removal and explicit release restore controls without renderer cleanup', () => {
  for (const change of [f => f.settings({extensionsPaused:true,enabled:{'focus-mode':true}}),
    f => f.settings({withoutTweaks:true,enabled:{'focus-mode':true}}),
    f => f.settings({enabled:{'focus-mode':false}}), f => f.remove(), f => f.controls(false)]) {
    const f = native(); f.controls(true); change(f); f.tick(500);
    assert.equal(f.calls.at(-1), true);
    assert.equal(f.timers.size, 0);
  }
  const f = native();
  for (let i=0;i<20;i++) { f.controls(true); f.controls(false); }
  assert.equal(f.owner.listenerCount('destroyed'), 0);
  assert.equal(f.win.listenerCount('unresponsive'), 0);
});

test('Websites, child frames, unknown protocols and malformed IPC cannot hide controls', () => {
  const f = native();
  for (const senderFrame of [{url:'https://external.test/'},{url:'app://-/index.html'}])
    assert.throws(() => f.bridge.controls({...f.event,senderFrame}, {protocol:1,hidden:true}), /Invalid/);
  for (const request of [{protocol:2,hidden:true},{protocol:1,hidden:'yes'}])
    assert.throws(() => f.bridge.controls(f.event, request), /Invalid/);
  f.owner.mainFrame.url = 'app://-/settings';
  assert.throws(() => f.controls(true), /Invalid/);
  assert.equal(f.calls.length, 0);
});

test('Reviewed archive shell contract is discoverable', {skip:!process.env.CODEXPP_SHELL_ARCHIVE}, () => {
  const bytes = fs.readFileSync(process.env.CODEXPP_SHELL_ARCHIVE);
  const header = JSON.parse(bytes.subarray(16,16+bytes.readUInt32LE(12)));
  const base = 8+bytes.readUInt32LE(4);
  const modules = Object.entries(header.files.webview.files.assets.files).filter(([p,n]) => p.endsWith('.js') && !n.unpacked)
    .map(([,n]) => bytes.subarray(base+Number(n.offset),base+Number(n.offset)+n.size).toString());
  const candidates = modules.filter(source => source.includes('data-app-shell-frame') && source.includes('data-app-shell-left-panel-appearance') && source.includes('data-app-shell-main-surface'));
  assert.equal(candidates.length, 1);
  const patched = parser.CodexPPShellAdapter.adapt(candidates[0], resource('shell-runtime'));
  assert.equal(patched.split('registerSidebarToggle(').length, 3); // runtime method and discovered command
});
