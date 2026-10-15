// Behaviour tests for the plugin lane's startup edits: each runs a minimal
// fixture of the vendor shape, stock and patched, in a VM sandbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {adapt} from './startup-harness.mjs';

// The main-process shape: the Chrome profile scan (Ro), the detection wrapper
// (ls), the bulk sync-state read that logs the plural warning (Zo) and the
// per-plugin reconcile step that logs the singular one (Fne).
const main = 'const y={existsSync:p=>globalThis.fsCalls.exists(p),readdirSync:(p,o)=>globalThis.fsCalls.readdir(p,o),readFileSync:()=>{throw Error(`no file`)}},' +
  'C={join:(...p)=>p.join(`/`)},Yo={warning:(m,o)=>globalThis.logs.push([m,o.sensitive.error?.cause?.code??o.sensitive.error?.code])};' +
  'function Ro(e,t){return(0,y.existsSync)(e)?[e,...(0,y.readdirSync)(e,{withFileTypes:!0}).flatMap(t=>t.isDirectory()?[(0,C.join)(e,t.name)]:[])].some(e=>{let n=!1;' +
  'for(let r of[`Secure Preferences`,`Preferences`])try{let i=JSON.parse((0,y.readFileSync)((0,C.join)(e,r),`utf8`)).extensions;if(n=!0,i?.settings?.[t])return!0}catch{}' +
  'return!n&&(0,y.existsSync)((0,C.join)(e,`Extensions`,t))}):!1}' +
  'function jo({extensionId:t}){return[`/Users/u/Library/Application Support/Google/Chrome`].some(e=>Ro(e,t))}' +
  'function ls(e,t){let n;for(let r of e)try{if(t(r))return!0}catch(e){n??=e}if(n!=null)throw Error(`Chromium extension detection failed`,{cause:n});return!1}' +
  'async function Zo(e){try{return await Promise.all([`chrome`].map(async e=>({isExtensionInstalled:ls([{extensionId:`abc`}],jo),pluginName:e})))}' +
  'catch(t){return Yo.warning(`bundled_plugins_chrome_extension_sync_state_read_failed`,{safe:{marketplacePluginNames:e.marketplacePluginNames},sensitive:{error:t}}),null}}' +
  'async function Fne(e){let d=!1,r=null;try{r=ls([{extensionId:`abc`}],jo)}catch(e){d=!0,Yo.warning(`bundled_plugin_chrome_extension_sync_state_read_failed`,{safe:{pluginName:`chrome`},sensitive:{error:e}})}return{r,d}}' +
  'module.Zo=Zo;module.Fne=Fne;';

function sandbox(source, {electron = true} = {}) {
  let now = 1e6, mode = 'EPERM';
  const app = new EventEmitter(), state = {readdirs: 0};
  const fail = code => Object.assign(Error(`${code}: operation not permitted, scandir '/Users/u/Library/Application Support/Google/Chrome'`),
    {code, path: '/Users/u/Library/Application Support/Google/Chrome', syscall: 'scandir'});
  const context = {
    module: {}, logs: [], Promise, Error, JSON, Map, Math,
    Date: {now: () => now},
    require: name => { if (name !== 'electron' || !electron) throw Error(`no module ${name}`); return {app}; },
    fsCalls: {
      exists: p => !p.endsWith('/abc'),
      readdir: () => { state.readdirs++; if (mode === 'ok') return []; throw fail(mode); },
    },
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return {
    context, app, state, get logs() { return JSON.parse(JSON.stringify(context.logs)); },
    advance: ms => { now += ms; }, setMode: m => { mode = m; },
    // One startup reconcile: the bulk read, then the per-plugin step.
    startup: async () => [await context.module.Zo({marketplacePluginNames: ['chrome']}), await context.module.Fne({})],
    focus: () => context.module.Zo({marketplacePluginNames: ['chrome']}),
  };
}

test('chromeProfileScanBackoff: a privacy-denied Chrome folder is listed again after 1, 2, 4 ... minutes, on reactivation, and logged once per episode', async () => {
  const {main: patched, applied} = adapt({main});
  assert.equal(applied.chromeProfileScanBackoff, 'main');

  // Stock: every attempt lists the folder and logs.
  const stock = sandbox(main);
  await stock.startup();
  for (let i = 0; i < 5; i++) { stock.advance(1000); await stock.focus(); }
  assert.equal(stock.state.readdirs, 7);
  assert.equal(stock.logs.length, 7);

  const s = sandbox(patched);
  const [bulk, step] = await s.startup();
  assert.equal(bulk, null, 'the bulk read still fails as unknown');
  assert.deepEqual({r: step.r, d: step.d}, {r: null, d: true}, 'the per-plugin step still records an unknown state');
  assert.equal(s.state.readdirs, 1, 'the second startup read is held back');
  assert.deepEqual(s.logs, [['bundled_plugins_chrome_extension_sync_state_read_failed', 'EPERM']], 'logged once');
  for (let i = 0; i < 5; i++) { s.advance(1000); assert.equal(await s.focus(), null); }
  assert.equal(s.state.readdirs, 1, 'window focus within the backoff does not list again');

  // Timed retries: 1 min, then 2 min, then 4 min.
  s.advance(60e3); await s.focus();
  assert.equal(s.state.readdirs, 2);
  s.advance(119e3); await s.focus();
  assert.equal(s.state.readdirs, 2, 'the second delay is 2 minutes');
  s.advance(1e3); await s.focus();
  assert.equal(s.state.readdirs, 3);
  s.advance(239e3); await s.focus();
  assert.equal(s.state.readdirs, 3, 'the third delay is 4 minutes');

  // Focus moving between windows is not reactivation; the app becoming active again after being inactive is.
  s.app.emit('browser-window-focus'); await s.focus();
  assert.equal(s.state.readdirs, 3);
  s.app.emit('did-resign-active'); s.app.emit('browser-window-focus'); s.app.emit('did-become-active');
  await s.focus();
  assert.equal(s.state.readdirs, 4, 'one immediate retry on reactivation');
  await s.focus();
  assert.equal(s.state.readdirs, 4, 'only one');
  assert.equal(s.logs.length, 1, 'still one log line for the episode');

  // The delay stops doubling at an hour.
  for (let i = 0; i < 12; i++) { s.advance(36e5); await s.focus(); }
  const before = s.state.readdirs;
  s.advance(36e5 - 1); await s.focus();
  assert.equal(s.state.readdirs, before);
  s.advance(1); await s.focus();
  assert.equal(s.state.readdirs, before + 1, 'capped at one hour');

  // Permission granted: the next attempt succeeds and ends the episode; a later denial is logged again.
  s.setMode('ok'); s.advance(36e5);
  const [granted] = await s.startup();
  assert.deepEqual(JSON.parse(JSON.stringify(granted)), [{isExtensionInstalled: false, pluginName: 'chrome'}]);
  const afterSuccess = s.state.readdirs;
  await s.focus(); await s.focus();
  assert.equal(s.state.readdirs, afterSuccess + 2, 'no backoff after a success');
  s.setMode('EACCES');
  await s.focus(); await s.focus();
  assert.deepEqual(s.logs.slice(1), [['bundled_plugins_chrome_extension_sync_state_read_failed', 'EACCES']]);
});

test('chromeProfileScanBackoff: other errors are retried and logged every time; without Electron the timed backoff still applies', async () => {
  const {main: patched} = adapt({main});
  const s = sandbox(patched);
  s.setMode('EIO');
  await s.startup(); await s.focus(); await s.focus();
  assert.equal(s.state.readdirs, 4);
  assert.equal(s.logs.length, 4);

  const bare = sandbox(patched, {electron: false});
  await bare.startup(); await bare.focus();
  assert.equal(bare.state.readdirs, 1);
  bare.advance(60e3); await bare.focus();
  assert.equal(bare.state.readdirs, 2);
  assert.equal(bare.logs.length, 1);
});

test('chromeProfileScanBackoff is skipped when the sync-state warnings are missing', () => {
  const {applied, skipped} = adapt({main: main.replace('bundled_plugin_chrome_extension_sync_state_read_failed', 'renamed')});
  assert.equal(applied.chromeProfileScanBackoff, undefined);
  assert.equal(skipped.chromeProfileScanBackoff, 'sync-state warnings not found');
});
