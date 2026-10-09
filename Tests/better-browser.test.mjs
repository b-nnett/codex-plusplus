import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import path from 'node:path';

const resource = name => readFileSync(new URL(`../Sources/CodexPPCore/Resources/${name}.js`, import.meta.url), 'utf8');
const extension = readFileSync(new URL('../extensions/better-browser/index.js', import.meta.url), 'utf8');
const parser = vm.createContext({});
for (const name of ['acorn', 'browser-adapter']) vm.runInContext(resource(name), parser);
const fixture = (name = 'menu', params = 'p', window = 'w') => `
function ${name}({params:${params},webContents:contents,window:${window},onComment:comment,onInspect:inspect,isAnnotationModeEnabled:annotate}) {
  const items = [{label:'Quick annotate',click:comment},{role:'paste'},{label:'Inspect',click:inspect}];
  return Electron.Menu.buildFromTemplate(items).popup({window:${window}});
}
function otherMenu(window) { return Electron.Menu.buildFromTemplate([]).popup({window}); }
`;

test('Browser discovery preserves actions and supplies the actual clicked frame', () => {
  for (const [name, param, win] of [['menu', 'p', 'w'], ['renamed', 'context', 'host']]) {
    const source = parser.CodexPPBrowserAdapter.adapt(fixture(name, param, win));
    const frame = {}, window = {}, calls = [];
    const ctx = vm.createContext({ Electron: { Menu: { buildFromTemplate: items => ({ popup: options => calls.push({items,options}) }) } },
      __codexPPNativeBrowser: { frameForContextMenu: p => p.isEditable ? p.frame : undefined } });
    vm.runInContext(source, ctx);
    ctx[name]({params:{isEditable:true,frame},window});
    assert.equal(calls[0].options.frame, frame);
    assert.equal(calls[0].options.window, window);
    assert.deepEqual(Array.from(calls[0].items, item => item.label || item.role), ['Quick annotate','paste','Inspect']);
    ctx[name]({params:{isEditable:false,frame},window});
    assert.equal(calls[1].options.frame, undefined);
    ctx.otherMenu(window);
    assert.equal(Object.hasOwn(calls[2].options, 'frame'), false);
  }
});

test('Missing, ambiguous and already modified menus fail closed', () => {
  assert.throws(() => parser.CodexPPBrowserAdapter.adapt('throw new Error("do not execute");'), /expected one match/);
  assert.throws(() => parser.CodexPPBrowserAdapter.adapt(fixture() + fixture('duplicate')), /found 2/);
  assert.throws(() => parser.CodexPPBrowserAdapter.adapt(parser.CodexPPBrowserAdapter.adapt(fixture())), /found 0/);
});

function native(platform = 'darwin', available = true) {
  let settings = {enabled:{'better-browser':true}, extensionsPaused:false};
  let installed = true;
  const ctx = vm.createContext({URL,process:{platform},require:name => name === 'path' ? path : {
    readFileSync(file) {
      if (file.endsWith('settings.json')) return JSON.stringify(settings);
      if (!installed) throw Error('Removed');
      return JSON.stringify({id:'better-browser',scope:'renderer'});
    }
  }});
  const calls = [], handle = {};
  const module = {protocol:1, prepare(value) {calls.push(['prepare',value]); return true;}, cancel() {calls.push(['cancel']);}};
  const bridge = vm.runInContext(resource('native-browser'), ctx)({}, '/support', available ? module : null);
  const window = {getNativeWindowHandle:() => handle};
  const contents = {focus() {calls.push(['focus']);}};
  const owner = new EventEmitter();
  owner.mainFrame = {url:'app://-/index.html'};
  owner.isDestroyed = () => false;
  const event = {sender:owner,senderFrame:owner.mainFrame};
  const frame = {url:'https://website.example/embedded'};
  const params = {isEditable:true,frame};
  return {bridge,owner,event,frame,params,window,contents,calls,handle,
    frameFor:(params, source = contents, host = window) => bridge.frameForContextMenu(params, source, host),setSettings:value => {settings=value;},remove:() => {installed=false;}};
}

test('Native support follows toggle, pause, removal, reload and exact editable frame', () => {
  const f = native();
  assert.equal(f.frameFor(f.params), undefined);
  assert.equal(f.bridge.setEnabled(f.event,true).supported, true);
  assert.equal(f.frameFor(f.params), f.frame);
  assert.equal(f.frameFor({...f.params,isEditable:false}), undefined);
  assert.equal(f.frameFor({isEditable:true}), undefined);
  f.setSettings({enabled:{'better-browser':true},extensionsPaused:true});
  assert.equal(f.frameFor(f.params), undefined);
  f.setSettings({enabled:{'better-browser':false}});
  assert.equal(f.frameFor(f.params), undefined);
  f.setSettings({enabled:{'better-browser':true}});
  f.owner.emit('did-start-navigation', {}, 'https://subframe.example', false, false);
  assert.equal(f.frameFor(f.params), f.frame);
  f.owner.emit('did-start-navigation', {}, 'app://-/index.html', true, true);
  assert.equal(f.frameFor(f.params), f.frame);
  f.owner.emit('did-start-navigation', {}, 'app://-/index.html', false, true);
  assert.equal(f.frameFor(f.params), undefined);
  for (let i=0;i<20;i++) { f.bridge.setEnabled(f.event,true); f.bridge.setEnabled(f.event,false); }
  assert.equal(f.owner.listenerCount('destroyed'), 0);
  assert.equal(f.owner.listenerCount('did-start-navigation'), 0);
  f.bridge.setEnabled(f.event,true);
  f.remove();
  assert.equal(f.frameFor(f.params), undefined);
});

test('Browser menu supplies its WebContents and supports the reviewed fork without frame params', () => {
  const f = native();
  f.bridge.setEnabled(f.event, true);
  const main = {}, focused = {}, contents = {mainFrame:main};
  const calls = [];
  const ctx = vm.createContext({Electron:{Menu:{buildFromTemplate:() => ({popup:options => calls.push(options)})}},
    __codexPPNativeBrowser:f.bridge});
  vm.runInContext(parser.CodexPPBrowserAdapter.adapt(fixture()), ctx);
  ctx.menu({params:{isEditable:true},webContents:contents,window:f.window});
  assert.equal(calls[0].frame, main);
  contents.focusedFrame = focused;
  ctx.menu({params:{isEditable:true},webContents:contents,window:f.window});
  assert.equal(calls[1].frame, focused);
  ctx.menu({params:f.params,webContents:contents,window:f.window});
  assert.equal(calls[2].frame, f.frame);
  ctx.menu({params:{isEditable:false},webContents:contents,window:f.window});
  assert.equal(calls[3].frame, undefined);
  f.setSettings({enabled:{'better-browser':false}});
  ctx.menu({params:{isEditable:true},webContents:contents,window:f.window});
  assert.equal(calls[4].frame, undefined);
});

test('Websites, child frames and invalid IPC cannot enable native support', () => {
  const f = native();
  assert.throws(() => f.bridge.setEnabled({...f.event,senderFrame:{url:'https://website.example'}},true), /Invalid/);
  assert.throws(() => f.bridge.setEnabled({...f.event,senderFrame:{url:'app://-/index.html'}},true), /Invalid/);
  assert.throws(() => f.bridge.setEnabled(f.event,'yes'), /Invalid/);
  assert.equal(native('linux').bridge.setEnabled(f.event,true).supported, false);
  const missing = native('darwin', false);
  assert.equal(missing.bridge.setEnabled(missing.event,true).supported, false);
  assert.equal(missing.frameFor(missing.params), undefined);
});

test('Native view preparation runs only for an enabled editable browser menu', () => {
  const f = native();
  f.bridge.setEnabled(f.event, true);
  f.frameFor(f.params);
  assert.deepEqual(f.calls.slice(-2), [['focus'],['prepare',f.handle]]);
  const before = f.calls.length;
  f.frameFor({...f.params,isEditable:false});
  f.setSettings({enabled:{'better-browser':true},extensionsPaused:true});
  f.frameFor(f.params);
  f.setSettings({enabled:{'better-browser':false}});
  f.frameFor(f.params);
  assert.equal(f.calls.length, before);
  f.bridge.setEnabled(f.event, false);
  assert.equal(f.calls.at(-1)[0], 'cancel');
});

test('Extension waits for a native acknowledgement and releases support on cleanup', async () => {
  const listeners = new Set(), cleanups = [], messages = [];
  const ctx = vm.createContext({crypto:{randomUUID:() => 'fixture-request'},setTimeout,clearTimeout,
    window:{addEventListener:(_name,fn) => listeners.add(fn),removeEventListener:(_name,fn) => listeners.delete(fn)},
    electronBridge:{async sendMessageFromView(message) {
      messages.push(message);
      if (message.enabled) for (const fn of listeners) fn({data:{type:'codexpp-browser-autofill-result',requestId:message.requestId,supported:true,nativeVersion:2}});
      // The real preload deliberately discards ipcRenderer.invoke's return value.
    }},api:{onCleanup:fn => cleanups.push(fn)}});
  await vm.runInContext(`(new Function('api', ${JSON.stringify(extension)}))(api)`,ctx);
  assert.equal(listeners.size, 0);
  assert.equal(messages[0].enabled, true);
  await cleanups[0]();
  assert.equal(messages[1].enabled, false);
});

test('Extension initialization failures release native support through the real runtime', async () => {
  const listeners = new Set(), messages = [];
  const ctx = vm.createContext({console,crypto:{randomUUID:() => 'fixture-request'},setTimeout,clearTimeout,
    window:{addEventListener:(_name,fn) => listeners.add(fn),removeEventListener:(_name,fn) => listeners.delete(fn)},
    electronBridge:{async sendMessageFromView(message) {
      messages.push(message);
      if (message.enabled) throw Error('Native bridge rejected request');
    }}});
  vm.runInContext(readFileSync(new URL('../Sources/CodexPP/Resources/runtime.js',import.meta.url),'utf8'),ctx);
  const desired = [{id:'better-browser',code:extension}];
  const states = await ctx.__codexPP.sync(desired);
  assert.equal(states[0].state, 'error');
  assert.match(states[0].error, /Native bridge rejected request/);
  assert.deepEqual(messages.map(message => message.enabled), [true,false]);
  assert.equal(listeners.size, 0);
  await ctx.__codexPP.sync(desired);
  assert.equal(messages.length, 2);
});

test('Discovery works against the reviewed native main module', {skip:!process.env.CODEXPP_BROWSER_MAIN}, () => {
  const source = readFileSync(process.env.CODEXPP_BROWSER_MAIN, 'utf8');
  const patched = parser.CodexPPBrowserAdapter.adapt(source);
  assert.equal(patched.split('frame:globalThis.__codexPPNativeBrowser?.frameForContextMenu(').length, 2);
});

test('An old native acknowledgement cannot report the extension as healthy', async () => {
  const listeners = new Set(), messages = [];
  const ctx = vm.createContext({crypto:{randomUUID:() => 'old-native'},setTimeout,clearTimeout,
    window:{addEventListener:(_name,fn) => listeners.add(fn),removeEventListener:(_name,fn) => listeners.delete(fn)},
    electronBridge:{async sendMessageFromView(message) {
      messages.push(message);
      if (message.enabled) for (const fn of listeners) fn({data:{type:'codexpp-browser-autofill-result',requestId:message.requestId,supported:true}});
    }}});
  vm.runInContext(readFileSync(new URL('../Sources/CodexPP/Resources/runtime.js',import.meta.url),'utf8'),ctx);
  const states = await ctx.__codexPP.sync([{id:'better-browser',code:extension}]);
  assert.equal(states[0].state, 'error');
  assert.match(states[0].error, /native macOS AutoFill adapter/);
  assert.deepEqual(messages.map(message => message.enabled), [true,false]);
});
