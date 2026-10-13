import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../Sources/CodexPPCore/Resources/native-runtime.js', import.meta.url), 'utf8');
const rendererRuntime = fs.readFileSync(new URL('../Sources/CodexPPCore/Resources/renderer-runtime.js', import.meta.url), 'utf8');
const rendererBridge = fs.readFileSync(new URL('../Sources/CodexPPCore/Resources/renderer-bridge.js', import.meta.url), 'utf8');

function fixture() {
  const support = fs.mkdtempSync(path.join(os.tmpdir(), 'codexpp-native-runtime-'));
  const directory = path.join(support, 'Extensions', 'example');
  fs.mkdirSync(directory, {recursive:true});
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({id:'example',name:'Example',version:'1',scope:'renderer',main:'index.js'}));
  fs.writeFileSync(path.join(directory, 'index.js'), 'globalThis.executions=(globalThis.executions||0)+1;api.addStyle("body{}");');
  fs.writeFileSync(path.join(support, 'settings.json'), JSON.stringify({appPath:'/Applications/ChatGPT.app',port:9222,extensionsPaused:false,enabled:{example:true},settingsIntent:0}));

  const nodes = [], messages = [];
  const renderer = vm.createContext({
    console, URL, setTimeout, clearTimeout, crypto:{randomUUID:crypto.randomUUID}, executions:0,
    document:{head:{append:node=>nodes.push(node)},createElement:()=>({dataset:{},remove(){}})},
    electronBridge:{sendMessageFromView(){}}, nodes
  });
  renderer.window = renderer;
  renderer.window.addEventListener = () => {};
  renderer.window.removeEventListener = () => {};
  const contents = new EventEmitter();
  contents.id = 7;
  contents.mainFrame = {url:'app://-/index.html'};
  contents.isDestroyed = () => false;
  contents.executeJavaScript = expression => Promise.resolve(vm.runInContext(expression, renderer));
  contents.send = (channel, message) => messages.push({channel, message});

  const app = new EventEmitter();
  app.whenReady = () => Promise.resolve();
  const electron = {
    app,
    webContents:{getAllWebContents:()=>[contents]},
    BrowserWindow:{fromWebContents:()=>null},
    dialog:{showOpenDialog:async()=>({canceled:true,filePaths:[]})},
    shell:{openPath:async()=>'',trashItem:async()=>{}}
  };
  const factory = vm.runInNewContext(source, {console,URL,Buffer,process,setInterval,clearInterval,setTimeout,clearTimeout,require:name=>require(name)}, {filename:'native-runtime.js'});
  const runtime = factory(electron, support, rendererRuntime, rendererBridge);
  return {support,renderer,contents,messages,runtime,cleanup(){runtime.dispose();fs.rmSync(support,{recursive:true,force:true});}};
}

test('main-process host injects enabled extensions without a debugger endpoint or renderer eval', async () => {
  const f = fixture();
  try {
    await f.runtime.poll();
    assert.equal(f.renderer.executions, 1);
    assert.equal(f.renderer.__codexPP.protocol, 2);
    assert.equal(f.renderer.__codexPPBridge.protocol, 2);
    assert.doesNotMatch(source, /remote-debugging|createServer|\.listen\(/);
    assert.doesNotMatch(rendererRuntime, /new Function|eval\s*\(/);
    const diagnostic = JSON.parse(fs.readFileSync(path.join(f.support, 'Diagnostics', 'runtime.json')));
    assert.equal(diagnostic.windows, 1);
    assert.deepEqual(diagnostic.activeExtensions, ['example']);
    await f.runtime.poll();
    assert.equal(f.renderer.executions, 1);
  } finally { f.cleanup(); }
});

test('settings IPC rejects websites and subframes before mutating configuration', () => {
  const f = fixture();
  try {
    const request = {type:'codexpp-settings',requestId:'one',action:'pause'};
    assert.throws(() => f.runtime.handle({sender:f.contents,senderFrame:{url:'app://-/index.html'}}, request), /sender/);
    const website = {...f.contents, mainFrame:{url:'https://example.com/'}};
    assert.throws(() => f.runtime.handle({sender:website,senderFrame:website.mainFrame}, request), /sender/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.support, 'settings.json'))).extensionsPaused, false);
  } finally { f.cleanup(); }
});

test('settings IPC accepts the trusted main frame and returns the updated state', async () => {
  const f = fixture();
  try {
    const request = {type:'codexpp-settings',requestId:'pause-one',action:'pause'};
    f.runtime.handle({sender:f.contents,senderFrame:f.contents.mainFrame}, request);
    for (let attempt = 0; attempt < 20 && f.messages.length === 0; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.support, 'settings.json'))).extensionsPaused, true);
    assert.equal(f.messages.length, 1);
    assert.equal(f.messages[0].channel, 'codex_desktop:message-for-view');
    assert.deepEqual(JSON.parse(JSON.stringify(f.messages[0].message)), {
      type:'codexpp-settings-result', requestId:'pause-one', ok:true,
      data:{extensions:[{id:'example',name:'Example',description:'',version:'1',enabled:true}],extensionsPaused:true,intent:0,selectedExtensionId:''}
    });
  } finally { f.cleanup(); }
});

function recordCalls(f) {
  const calls = [], execute = f.contents.executeJavaScript;
  f.contents.executeJavaScript = expression => { calls.push(expression); return execute(expression); };
  return calls;
}

test('steady-state polls probe status without resending extension code or rewriting diagnostics', async () => {
  const f = fixture();
  try {
    await f.runtime.poll();
    const diagnostics = path.join(f.support, 'Diagnostics', 'runtime.json');
    const written = fs.statSync(diagnostics).mtimeMs;
    const calls = recordCalls(f);
    for (let index = 0; index < 5; index++) await f.runtime.poll();
    assert.equal(f.renderer.executions, 1);
    assert.ok(calls.length > 0);
    assert.ok(calls.every(call => !call.includes('globalThis.executions')), 'extension code was resent');
    assert.ok(calls.every(call => call.length < 2000), 'a steady-state call carried a large payload');
    assert.equal(fs.statSync(diagnostics).mtimeMs, written);
  } finally { f.cleanup(); }
});

test('edited extension files are reloaded and redelivered', async () => {
  const f = fixture();
  try {
    await f.runtime.poll();
    const entry = path.join(f.support, 'Extensions', 'example', 'index.js');
    fs.writeFileSync(entry, 'globalThis.executions=(globalThis.executions||0)+10;');
    await f.runtime.poll();
    assert.equal(f.renderer.executions, 11);
  } finally { f.cleanup(); }
});

test('a reloaded renderer receives the full payload again', async () => {
  const f = fixture();
  try {
    await f.runtime.poll();
    delete f.renderer.__codexPP;
    await f.runtime.poll();
    assert.equal(f.renderer.executions, 2);
  } finally { f.cleanup(); }
});

test('overlapping polls coalesce and a hung window does not queue more calls', async () => {
  const f = fixture();
  try {
    await f.runtime.poll();
    let calls = 0;
    f.contents.executeJavaScript = () => { calls++; return new Promise(() => {}); };
    const pending = [f.runtime.poll(), f.runtime.poll(), f.runtime.poll()];
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(calls, 1, 'overlapping polls each called into the hung renderer');
    assert.equal(pending[1], pending[2]);
    f.runtime.dispose();
  } finally { f.cleanup(); }
});

test('a settings change reaches windows at once instead of waiting for the heartbeat', async () => {
  const f = fixture();
  try {
    await f.runtime.poll();
    assert.equal(f.renderer.executions, 1);
    assert.match(source, /setInterval\(\(\) => void poll\(\), 4000\)/, 'the idle heartbeat is slow');
    const file = path.join(f.support, 'settings.json');
    const value = JSON.parse(fs.readFileSync(file));
    // Replaced atomically, the way the helper writes it.
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({...value, extensionsPaused:true}));
    fs.renameSync(`${file}.tmp`, file);
    let diagnostic = null;
    for (let attempt = 0; attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      diagnostic = JSON.parse(fs.readFileSync(path.join(f.support, 'Diagnostics', 'runtime.json')));
      if (diagnostic.activeExtensions.length === 0) break;
    }
    assert.deepEqual(diagnostic.activeExtensions, [], 'paused within about a second, not four');
  } finally { f.cleanup(); }
});
