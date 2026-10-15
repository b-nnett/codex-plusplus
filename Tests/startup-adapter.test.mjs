import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {EventEmitter} from 'node:events';

const load = name => fs.readFileSync(new URL(`../Sources/CodexPPCore/Resources/${name}.js`, import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(load('acorn'), context);
vm.runInContext(load('startup-adapter'), context);
// Development builds apply the diagnostic edits too; release builds pass diagnostics: false.
const adapt = input => { context.input = {diagnostics: true, ...input}; return JSON.parse(JSON.stringify(vm.runInContext('CodexPPStartupAdapter.adapt(input)', context))); };

// Minimal shapes of the vendor code the adapter targets (minified names vary).
const shared = `export function r(e,r){let i=e(r),[a,o]=[!0,v=>{a=v,r.loading.push(v)}];` +
  `(()=>{i.loadingStatus!==\`Ready\`&&i.initializeAsync().catch(t.Log.error).finally(()=>o(!1))})();return{client:i,isLoading:()=>a}}`;
const initial = `export function Provider(S,b,E,bQs){let e=!1;try{S.updateUserAsync(b).then(bQs).finally(()=>{e||E(b)})}catch(e){}` +
  `return \`CodexStatsigProvider.async\`};` +
  `function Qpl(){let e=new AudioContext({latencyHint:\`interactive\`});return e.decodeAudioData}` +
  `export function rml(){typeof window<\`u\`&&window.setTimeout(()=>{try{Qpl()}catch{}},0)}` +
  `export function uj(e){let t=1,{variant:a,debugName:o,startupIndicator:s}=e,[f,p]=(0,R.useState)(!1);return o}`;

class FakeClient extends EventEmitter {
  constructor(cached) { super(); this.cached = cached; this.loadingStatus = 'Uninitialized'; }
  update() {
    // Mirrors _updateUserAsyncImpl: the cache is published synchronously,
    // then the network result settles later.
    this.loadingStatus = 'Loading';
    this.emit('values_updated', {status: 'Loading', values: this.cached ? {source: 'Cache'} : null});
    return new Promise(resolve => setTimeout(() => { this.loadingStatus = 'Ready'; this.emit('values_updated', {status: 'Ready'}); resolve({success: true}); }, 20));
  }
  initializeAsync() { return this.update(); }
  updateUserAsync() { return this.update(); }
  off(event, listener) { this.removeListener(event, listener); }
}

function sharedHook(source, cached) {
  const module = {};
  vm.runInNewContext(source.replace('export function', 'module.r=function'), {module, t: {Log: {error() {}}}});
  const client = new FakeClient(cached), state = {loading: []};
  const hook = module.r(() => client, state);
  return {client, state, hook};
}

test('all four startup edits apply to the vendor shapes and re-parse', () => {
  const result = adapt({shared, initial});
  assert.deepEqual(Object.keys(result.applied).sort(), ['caretBlinkTimeout', 'compositorShimmer', 'deferDictationCues', 'loadingGateTimings', 'statsigCacheFirst', 'statsigUserCacheFirst']);
  // Every other edit is skipped because its chunk or code is not in this fixture.
  // None was dropped for breaking the module or colliding with another edit.
  assert.ok(!Object.values(result.skipped).some(reason => /did not parse|overlaps another edit|already exists/.test(reason)), JSON.stringify(result.skipped));
  assert.ok(!result.initial.includes('window.setTimeout(()=>{try{Qpl()}'));
  assert.ok(result.initial.includes('function Qpl()'), 'the cue player keeps its lazy AudioContext');
});

test('cached Statsig values end the loading state before the network fetch', async () => {
  const {shared: patched} = adapt({shared, initial});
  const cached = sharedHook(patched, true);
  assert.deepEqual(cached.state.loading, [false], 'cleared synchronously from the cache');
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(cached.client.listenerCount('values_updated'), 0, 'listener removed');

  const cold = sharedHook(patched, false);
  assert.deepEqual(cold.state.loading, [], 'no cache: still waits for the network');
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.deepEqual(cold.state.loading, [false]);
  assert.equal(cold.client.listenerCount('values_updated'), 0);
});

test('a startup user update accepts that user\'s cached values immediately', async () => {
  const {initial: patched} = adapt({shared, initial});
  const module = {};
  vm.runInNewContext(patched.replace('export function Provider', 'module.Provider=function').replace(/export function (rml|uj)/g, 'function $1'), {module, AudioContext: class {}});
  for (const cached of [true, false]) {
    const client = new FakeClient(cached), set = [];
    module.Provider(client, 'user', user => set.push(user), () => {});
    assert.deepEqual(set, cached ? ['user'] : [], cached ? 'cache hit sets the user now' : 'cache miss waits');
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(set.length, cached ? 2 : 1, 'the network completion still sets it');
    assert.equal(client.listenerCount('values_updated'), 0);
  }
});

test('unrecognised code is skipped, not patched', () => {
  const result = adapt({shared: 'export const x = 1;', initial: 'export function f(){window.setTimeout(()=>{},0)}'});
  assert.deepEqual(result.applied, {});
  assert.match(result.skipped.statsigCacheFirst, /found 0/);
  assert.equal(result.shared, undefined);
  assert.equal(result.initial, undefined);
  assert.deepEqual(adapt({}).applied, {});
});

test('ambiguous matches are skipped and patched output is never re-patched', () => {
  const twice = adapt({shared: shared + shared.replace('export function r', 'export function q'), initial: ''});
  assert.match(twice.skipped.statsigCacheFirst, /found 2/);
  const once = adapt({shared, initial});
  assert.throws(() => adapt({shared: once.shared, initial}), /already applied/);
});

test('loading indicators record when each gate mounted and unmounted', () => {
  const {initial: patched} = adapt({shared, initial});
  const module = {}, effects = [], clock = (() => { let t = 0; return () => (t += 10); })();
  const sandbox = {module, performance: {now: clock}, R: {useState: v => [v, () => {}], useEffect: effect => effects.push(effect)}};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(patched.replace(/export function (Provider|rml)/g, 'function $1').replace('export function uj', 'module.uj=function'), sandbox);
  module.uj({debugName: 'Gate.a'});
  module.uj({debugName: 'Gate.b'});
  const cleanups = effects.map(effect => effect());
  cleanups[0]();
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.__codexPPGates)), {'Gate.a': [10, 30], 'Gate.b': [20, null]});
});

const bootstrapComponent = `export function xQs(e){let t=[],{appVersion:r,auth:i,stableId:c,statsigClientKey:l,children:f}=e,p=null,h={current:0},g;` +
  `g=async e=>{let t=await SQs(e,h);try{let e=new AQs.StatsigClient(l,t.user,DQs(p));return e.dataAdapter.setData(t.statsigPayload),nZs(e.initializeSync(),\`electron\`),e}catch(e){let t=e;throw new f8(1,t)}};` +
  `return {g,label:\`CodexStatsigProvider.sync\`}}`;

// Just enough IndexedDB for open → transaction → get/put/delete → oncomplete.
function fakeIndexedDB(store) {
  return {open() {
    const request = {};
    setTimeout(() => {
      request.result = {close() {}, transaction() {
        const tx = {};
        const done = req => { setTimeout(() => tx.oncomplete?.(), 0); return req; };
        tx.objectStore = () => ({
          get: key => done({result: store.has(key) ? structuredClone(store.get(key)) : undefined}),
          put: (value, key) => done((store.set(key, structuredClone(value)), {})),
          delete: key => done((store.delete(key), {}))
        });
        return tx;
      }};
      request.onsuccess();
    }, 0);
    return request;
  }};
}

const settle = () => new Promise(resolve => setTimeout(resolve, 15));

function bootstrapHarness(fetches) {
  const {initial: patched, applied} = adapt({initial: bootstrapComponent});
  assert.equal(applied.statsigBootstrapCacheFirst, 'initial');
  const store = new Map(), log = [];
  class StatsigClient {
    constructor(key, user) { this.user = user; this.payloads = []; this.dataAdapter = {setData: payload => { if (payload === 'corrupt') throw Error('bad'); this.payloads.push(payload); }}; }
    initializeSync() { return {}; }
    updateUserSync(user) { log.push(['update', user]); }
  }
  const sandbox = {
    module: {}, log, AQs: {StatsigClient}, DQs: () => ({}), nZs: () => {}, f8: class extends Error {},
    SQs: () => { const next = fetches.shift(); return next instanceof Error ? Promise.reject(next) : new Promise(resolve => setTimeout(() => resolve(next), 5)); },
    indexedDB: fakeIndexedDB(store)
  };
  vm.runInNewContext(patched.replace('export function xQs', 'module.xQs=function'), sandbox);
  const run = auth => sandbox.module.xQs({appVersion: '1', auth, stableId: 's', statsigClientKey: 'k'}).g({});
  return {run, store, log};
}

test('the Statsig bootstrap waits on a cold cache, then serves the next launch from it', async () => {
  const user = {userId: 'u', accountId: 'a', authMethod: 'chatgpt'};
  const h = bootstrapHarness([{user: {id: 1}, statsigPayload: 'p1'}, {user: {id: 1}, statsigPayload: 'p2'}]);
  const first = await h.run(user);
  await settle();
  assert.deepEqual(first.payloads, ['p1'], 'cold cache: built from the network payload');
  assert.equal(h.store.size, 1, 'payload saved for this identity');

  const second = h.run(user);
  const client = await Promise.race([second, new Promise(resolve => setTimeout(() => resolve('timeout'), 4))]);
  assert.notEqual(client, 'timeout', 'warm cache resolves before the fetch');
  assert.deepEqual(client.payloads, ['p1']);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(client.payloads, ['p1', 'p2'], 'fresh payload applied to the live client');
  assert.equal(h.log.length, 1);
  assert.equal(h.store.values().next().value.statsigPayload, 'p2', 'fresh payload saved for next time');
});

test('the bootstrap cache is ignored for another identity and dropped when unusable', async () => {
  const h = bootstrapHarness([{user: {id: 1}, statsigPayload: 'p1'}, {user: {id: 2}, statsigPayload: 'p2'}, {user: {id: 1}, statsigPayload: 'p3'}]);
  await h.run({userId: 'u', accountId: 'a'});
  await settle();
  const other = await h.run({userId: 'v', accountId: 'a'});
  assert.deepEqual(other.payloads, ['p2'], 'another user waits for its own payload');
  await h.run({authMethod: 'chatgpt'}); // no user identifier or email: never cached, never reused
  const key = [...h.store.keys()][0];
  h.store.set(key, {...h.store.get(key), statsigPayload: 'corrupt'});
  const h2 = bootstrapHarness([{user: {id: 2}, statsigPayload: 'p4'}]);
  for (const [k, v] of h.store) h2.store.set(k, v);
  const recovered = await h2.run({userId: 'v', accountId: 'a'});
  await settle();
  assert.deepEqual(recovered.payloads, ['p4'], 'a corrupt cached payload falls back to the network');
});

test('a failed refresh keeps the cached client; a failed cold fetch still fails', async () => {
  const user = {userId: 'u', accountId: 'a'};
  const h = bootstrapHarness([{user: {id: 1}, statsigPayload: 'p1'}, new Error('offline'), new Error('offline')]);
  await h.run(user);
  await settle();
  const cached = await h.run(user);
  await settle();
  assert.deepEqual(cached.payloads, ['p1']);
  h.store.clear();
  await assert.rejects(h.run(user), /offline/);
});

test('the bootstrap identity falls back to other user identifiers and email', async () => {
  const h = bootstrapHarness([{user: {id: 1}, statsigPayload: 'p1'}, {user: {id: 1}, statsigPayload: 'p2'}]);
  const auth = {authMethod: 'chatgpt', userId: null, authenticatedUserId: 'au', email: 'x@y'};
  await h.run(auth);
  await settle();
  const client = await Promise.race([h.run(auth), new Promise(resolve => setTimeout(() => resolve('timeout'), 4))]);
  assert.notEqual(client, 'timeout', 'served from cache via authenticatedUserId');
});

test('dynamic chunk loads are timed through the preload helper', async () => {
  const helper = 'export const Wf=function(e,t,n){let r=Promise.resolve();if(t){document.getElementsByTagName(`link`);document.querySelector(`meta[property=csp-nonce]`);new URL(e,import.meta.url)}return r.then(()=>e())};';
  const {shared: patched, applied} = adapt({shared: helper});
  assert.equal(applied.chunkTimings, 'shared');
  const sandbox = {module: {}, performance: {now: (() => { let t = 0; return () => (t += 5); })()}};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(patched.replace('export const Wf=', 'module.Wf=').replace('import.meta.url', '""'), sandbox);
  assert.equal(await sandbox.module.Wf(async () => { await import(`./chunk-abc.js`).catch(() => {}); return 7; }, null, ''), 7);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.__codexPPStartup.chunks)), [['./chunk-abc.js', 5, 10]]);
});

test('the Suspense reveal throttle is skipped only during startup', () => {
  const react = 'export function Fc(t,fc,Ce){let a;if((t&62914560)===t&&(a=fc+300-Ce(),10<a)){return [`Throttled`,a]}return [null,a]}';
  const {shared: patched, applied} = adapt({shared: react});
  assert.equal(applied.startupRevealUnthrottled, 'shared');
  for (const [clock, expected] of [[500, null], [20000, 'Throttled']]) {
    const sandbox = {module: {}, performance: {now: () => clock}};
    vm.runInNewContext(patched.replace('export function Fc', 'module.Fc=function'), sandbox);
    assert.equal(sandbox.module.Fc(62914560, 1000, () => 1000)[0], expected);
  }
});

test('the policy step records its phases without changing behaviour', () => {
  const requirements = 'async function da(){la=null,await Gi(),x();let e=!1;for(;;){let f=`home-creation`;try{f=`policy-read`;' +
    'let{appServerVersion:o,response:p}=await i.a(a,c.app.getVersion(),{});f=`policy-validation`;let m=oa(o,p);return f=`node-permissions`,ta(m)?(la=m,!0):!1}catch(t){throw t}}}';
  const result = adapt({requirements});
  assert.equal(result.applied.policyPhaseTimings, 'requirements');
  assert.equal((result.requirements.match(/\.policy\?\?=\{\}\)\["/g) || []).length, 4, 'four phase marks');
  assert.ok(result.requirements.includes('await i.a(a,c.app.getVersion(),{})'), 'the policy read is unchanged');
});

test('the shell environment is cached without sensitive variables and refreshed in the background', async () => {
  const requirements = 'async function da(){la=null,await Gi(),x();for(;;){let f=`home-creation`;try{f=`policy-read`;' +
    'let{appServerVersion:o,response:p}=await i.a(a,c.app.getVersion(),{});f=`policy-validation`;let m=oa(o,p);return f=`node-permissions`,ta(m)?(la=m,!0):!1}catch(t){throw t}}}';
  const {requirements: patched, applied} = adapt({requirements});
  assert.equal(applied.shellEnvironmentCacheFirst, 'requirements');
  const files = new Map();
  const run = async (shellEnv, delay) => {
    const env = {HOME: '/h', PATH: '/usr/bin'}, log = [];
    let release; const loaded = new Promise(resolve => { release = resolve; });
    const sandbox = {
      process: {env}, performance, globalThis: {}, la: null, a: null, x() {}, i: {a: async () => ({})}, oa: () => ({}), ta: () => !0,
      c: {app: {getPath: () => '/data', getVersion: () => '1'}}, log, Date,
      Gi: () => { log.push(['spawn', {...env}]); return new Promise(resolve => setTimeout(() => { Object.assign(env, shellEnv); resolve({status: 'loaded'}); release(); }, delay)); },
      require: name => name === 'path' ? {join: (...parts) => parts.join('/')} : {readFileSync: file => { if (!files.has(file)) throw Error('missing'); return files.get(file); }, unlinkSync: file => files.delete(file), writeFileSync: (file, text) => files.set(file, text)}
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(patched + ';globalThis.run=da;', sandbox);
    const started = Date.now(); await sandbox.run(); const waited = Date.now() - started;
    await loaded; await new Promise(resolve => setTimeout(resolve, 5));
    return {env, log, waited};
  };
  const first = await run({PATH: '/usr/bin:/opt/bin', NVM_DIR: '/n'}, 30);
  assert.ok(first.waited >= 25, 'no cache: waits for the shell');
  const saved = JSON.parse(files.get('/data/codexpp-shell-environment-v2.json'));
  assert.deepEqual(saved.env, {PATH: '/usr/bin:/opt/bin', NVM_DIR: '/n'});
  const second = await run({PATH: '/usr/bin:/opt/bin:/new', NVM_DIR: '/n'}, 30);
  assert.ok(second.waited < 20, 'cache: continues at once');
  assert.equal(second.log[0][1].PATH, '/usr/bin', 'the real shell starts with the launch environment');
  assert.equal(second.env.PATH, '/usr/bin:/opt/bin:/new', 'fresh values win when they arrive');
  const third = await run({PATH: '/x', OPENAI_API_KEY: 'sk-secret'}, 30);
  const withSecret = files.get('/data/codexpp-shell-environment-v2.json');
  assert.ok(!withSecret.includes('sk-secret'), 'sensitive values are never written');
  assert.equal(JSON.parse(withSecret).sensitive, true);
  for (const [name, value] of [['DATABASE_URL', 'postgres://me:pw@db/app'], ['JAVA_HOME', 'https://me:pw@host/jdk'], ['GH_PAT', 'ghp_x']]) {
    await run({PATH: '/x', [name]: value}, 5);
    const text = files.get('/data/codexpp-shell-environment-v2.json');
    assert.ok(!text.includes(value), `${name} is never written`);
    assert.equal(JSON.parse(text).sensitive, true, `${name} keeps the blocking load`);
  }
  const fourth = await run({PATH: '/x', OPENAI_API_KEY: 'sk-secret'}, 30);
  assert.ok(fourth.waited >= 25, 'a shell that sets sensitive variables keeps the original wait');
});


test('index.html declares the entry module dependency chunks up front', () => {
  const html = '<head>\n    <script type="module" crossorigin src="./assets/index-1.js"></script>\n    <link rel="modulepreload" crossorigin href="./assets/app-shared-1.js">\n    <link rel="stylesheet" crossorigin href="./assets/app-shared-1.css">\n  </head>';
  const entry = 'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./rpc-1.js","./app-shared-1.js","./app-shared-1.css","./app-main-1.js","./app-initial-1.js","./app-initial-1.css"])))=>i.map(i=>d[i]);';
  const result = adapt({html, entry});
  assert.equal(result.applied.entryPreload, 'html');
  for (const link of ['modulepreload" crossorigin href="./assets/rpc-1.js', 'modulepreload" crossorigin href="./assets/app-initial-1.js', 'preload" as="style" crossorigin href="./assets/app-initial-1.css']) assert.ok(result.html.includes(link), link);
  assert.equal(result.html.split('app-shared-1.js').length, 2, 'already-declared chunks are not repeated');
  assert.ok(result.html.indexOf('codexpp:startup') < result.html.indexOf('app-shared-1.css'), 'inserted after the last modulepreload');
  assert.throws(() => adapt({html: result.html, entry}), /already applied/);
  assert.match(adapt({html, entry: 'export {}'}).skipped.entryPreload, /not recognised/);
});

test('settings start from the last result for this build and still refetch', async () => {
  const shared = 'export const VK=()=>({queryKey:XG(`get-settings`),queryFn:()=>load(),networkMode:`always`,placeholderData:P,staleTime:5});';
  const {shared: patched, applied} = adapt({shared});
  assert.equal(applied.settingsCacheFirst, 'shared');
  const store = new Map();
  const make = value => {
    const sandbox = {module: {}, XG: k => [k], P: {}, load: async () => value,
      localStorage: {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)}};
    vm.runInNewContext(patched.replace('export const VK=', 'module.VK=').replaceAll('import.meta.url', '"app://-/assets/app-shared-1.js"'), sandbox);
    return sandbox.module.VK();
  };
  const cold = make({theme: 'dark'});
  assert.equal(cold.initialData, undefined, 'no cache: placeholder as before');
  assert.deepEqual(await cold.queryFn(), {theme: 'dark'});
  const warm = make({theme: 'light'});
  assert.deepEqual(JSON.parse(JSON.stringify(warm.initialData)), {theme: 'dark'}, 'last result seeds the query');
  assert.equal(warm.initialDataUpdatedAt, 0, 'stale immediately, so it refetches');
  assert.deepEqual(await warm.queryFn(), {theme: 'light'});
});

test('the auth storage rollout flag starts from the last network answer', async () => {
  const main = 'async function pqe({sdkKey:e,stableId:t,platform:n,appVersion:r,fetch:i}){try{let e=await net(),t=gate(`codex_desktop_secret_auth_storage`);' +
    'return e.success&&e.source===`Network`&&t.details.reason===`Network:Recognized`&&t.value?[`features.secret_auth_storage=true`]:[]}catch{return[]}}' +
    '';
  const {main: patched, applied} = adapt({main});
  assert.equal(applied.authStorageGateCacheFirst, 'main');
  const files = new Map();
  const run = async (answer, delay) => {
    const sandbox = {globalThis: {}, net: () => new Promise(resolve => setTimeout(() => resolve({success: answer !== 'offline', source: answer === 'offline' ? 'NoValues' : 'Network'}), delay)),
      gate: () => ({value: answer === 'on', details: {reason: answer === 'offline' ? 'NoValues' : 'Network:Recognized'}}),
      require: name => name === 'electron' ? {app: {getPath: () => '/data'}} : name === 'path' ? {join: (...p) => p.join('/')}
        : {readFileSync: f => { if (!files.has(f)) throw Error('missing'); return files.get(f); }, writeFileSync: (f, v) => files.set(f, v)}};
    sandbox.globalThis = sandbox;
    vm.runInNewContext(patched + ';globalThis.pqe=pqe;', sandbox);
    const started = Date.now();
    const result = await sandbox.pqe({sdkKey: 'k', stableId: 's', platform: 'darwin', appVersion: '1'});
    const waited = Date.now() - started;
    await new Promise(resolve => setTimeout(resolve, delay + 10));
    return {result: JSON.parse(JSON.stringify(result)), waited};
  };
  const first = await run('on', 30);
  assert.deepEqual(first.result, ['features.secret_auth_storage=true']);
  assert.ok(first.waited >= 25, 'no saved answer: waits for the network');
  const second = await run('off', 30);
  assert.deepEqual(second.result, ['features.secret_auth_storage=true'], 'starts from the saved answer');
  assert.ok(second.waited < 20);
  const third = await run('offline', 30);
  assert.deepEqual(third.result, [], 'the flag change applies on the next launch');
  assert.match(files.get('/data/codexpp-auth-storage-gate.json'), /"overrides":\[\]/, 'a network failure never overwrites a confirmed answer');
});

test('hidden window prewarms are skipped and each window opens on demand', async () => {
  const main = 'class PageWarm{enabled=!0;made=0;slot={prewarm:async()=>{this.made++}};fill(){this.enabled&&this.slot.prewarm().catch(e=>{log(`Could not prewarm Page window`,e)})}' +
      'async openNewPage(){this.made++;this.fill();return!0}}' +
    'class Overlay{window=null;openingWindowPromise=null;made=0;async ensureWindow(){return this.window??=(this.made++,{})}' +
      'async prewarm(e){if(this.window!=null||this.openingWindowPromise!=null)return;await this.ensureWindow(e)}async open(){return this.ensureWindow()}}' +
    'class Detached{fillTimer=null;made=0;slot={prewarm:async()=>{this.made++}};scheduleFill(){this.fillTimer=setTimeout(()=>{this.slot.prewarm().catch(()=>{})},1)}' +
      'takeReady(){return null}async open(){this.takeReady()??this.made++}}' +
    'class Hotkey{made=0;async ensureHomeWindow(){this.made++}async ensureThreadWindow(){this.made++}' +
      'async prewarm(){await this.ensureHomeWindow(),await this.ensureThreadWindow()}async showHome(){await this.ensureHomeWindow()}}' +
    'globalThis.made=[PageWarm,Overlay,Hotkey,Detached];';
  const {main: patched, applied} = adapt({main});
  assert.deepEqual([applied.lazyPageWindowPrewarm, applied.lazyAvatarOverlayPrewarm, applied.lazyHotkeyWindowPrewarm, applied.lazyDetachedWindowPrewarm], ['main', 'main', 'main', 'main']);
  const sandbox = {log() {}};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(patched, sandbox);
  const [page, overlay, hotkey, detached] = sandbox.made.map(Class => new Class());
  page.fill(); await overlay.prewarm({}); await hotkey.prewarm(); detached.scheduleFill(); await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual([page.made, overlay.made, hotkey.made, detached.made], [0, 0, 0, 0], 'nothing is created ahead of use');
  await page.openNewPage(); await overlay.open(); await hotkey.showHome(); await detached.open();
  assert.deepEqual([page.made, overlay.made, hotkey.made, detached.made], [1, 1, 1, 1], 'each feature still opens its window');
  assert.throws(() => adapt({main: patched}), /already applied/);
});

test('a burst of side-panel browser state changes rebuilds the app menu once more, not every time', () => {
  const main = 'let refreshes=0,syncs=0;const qe={refreshApplicationMenu(){refreshes++}},pe={sync(){syncs++}};' +
    'const Be={cb:null,setOnBrowserStateChanged(e){this.cb=e}};Be.setOnBrowserStateChanged(()=>{qe.refreshApplicationMenu(),pe.sync()});' +
    'globalThis.state={fire:()=>Be.cb(),get counts(){return[refreshes,syncs]}};';
  const {main: patched, applied} = adapt({main});
  assert.equal(applied.coalesceBrowserMenuRefresh, 'main');
  const timers = [];
  const sandbox = {setTimeout: f => (timers.push(f), timers.length)};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(patched, sandbox);
  sandbox.state.fire();
  assert.equal(JSON.stringify(sandbox.state.counts), '[1,1]', 'the first change refreshes at once');
  for (let i = 0; i < 30; i++) sandbox.state.fire();
  assert.equal(JSON.stringify(sandbox.state.counts), '[1,31]', 'a burst waits for the menu, but every other step still runs');
  timers.shift()();
  assert.equal(JSON.stringify(sandbox.state.counts), '[2,31]', 'then the menu refreshes once');
  timers.shift()();
  sandbox.state.fire();
  assert.equal(JSON.stringify(sandbox.state.counts), '[3,32]', 'and a later change refreshes at once again');
});

test('the text cursor blinks only after activity where caret-animation is supported', () => {
  const run = supported => {
    const {initial: patched, applied} = adapt({initial});
    assert.equal(applied.caretBlinkTimeout, 'initial');
    const attributes = new Set(), styles = [], listeners = {}, frames = [];
    const root = {setAttribute: name => attributes.add(name), removeAttribute: name => attributes.delete(name)};
    const sandbox = {
      CSS: {supports: (property, value) => supported && property === 'caret-animation' && value === 'manual'},
      document: {documentElement: root, head: {append: node => styles.push(node.textContent)}, createElement: () => ({})},
      addEventListener: (type, listener, capture) => { assert.equal(capture, true); listeners[type] = listener; },
      requestAnimationFrame: callback => frames.push(callback), cancelAnimationFrame() {},
      window: {setTimeout() {}},
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(patched.replace(/export /g, ''), sandbox);
    return {attributes, styles: styles.filter(text => text.includes('caret')), listeners, frames};
  };
  const off = run(false);
  assert.deepEqual([off.styles.length, Object.keys(off.listeners).length], [0, 0], 'unsupported: the native blink is left alone');
  const on = run(true);
  assert.match(on.styles[0], /caret-animation:manual/);
  assert.match(on.styles[0], /prefers-reduced-motion:no-preference/);
  assert.deepEqual(Object.keys(on.listeners).sort(), ['focusin', 'keydown', 'pointerdown']);
  assert.equal(on.attributes.size, 0, 'idle: steady cursor, no animation');
  on.listeners.keydown();
  on.frames.shift()();
  assert.ok(on.attributes.has('data-codexpp-caret-blink'), 'typing restarts the blink');
});

test('checkout pages are rendered for their route, not prewarmed at launch', () => {
  const checkout = 'export function le(route,gate,ge){let j=gate&&cfg.get(`use_embedded_checkout`,!1)?ge({url:1}):null;return route??j}' +
    'export function W(S,gate){if(!S&&(!gate||!cfg.get(`use_embedded_credit_checkout`,!1)))return null;return `webview`}';
  const {checkout: patched, applied} = adapt({checkout});
  assert.deepEqual([applied.lazyCheckoutPricingPrewarm, applied.lazyCheckoutCreditPrewarm], ['checkout', 'checkout']);
  const sandbox = {cfg: {get: () => true}};
  vm.runInNewContext(patched.replace(/export /g, '') + ';this.le=le;this.W=W;', sandbox);
  assert.equal(sandbox.le(null, true, () => 'prewarm'), null, 'no pricing prewarm');
  assert.equal(sandbox.le('?url=pricing', true, () => 'prewarm'), '?url=pricing', 'the route still presents');
  assert.equal(sandbox.W(false, true), null, 'no credit prewarm');
  assert.equal(sandbox.W(true, true), 'webview', 'the credit route still renders');
});

test('MCP ready reports collapse the shared inventory refetch; per-thread work runs as stock', async () => {
  const initial = 'export function P(S,b,E,bQs){let e=!1;try{S.updateUserAsync(b).then(bQs).finally(()=>{e||E(b)})}catch(e){}return `x`};' +
    'export function on(n,log){n.subscribe({type:`notification`,listener:(a,o)=>{switch(a.method){case`item/completed`:n.getConversationCwd(a.params.threadId);break;' +
    'case`mcpServer/startupStatus/updated`:a.params.status===`ready`&&(gl(e.queryClient,{queryKey:[`mcp`,`toolsAndAuthOnly`],exact:!0}),log.push(`thread:`+a.params.threadId)),a.params.status===`failed`&&log.push(`failed:`+a.params.threadId);break}}})}';
  const {initial: patched, applied} = adapt({initial});
  assert.equal(applied.skipHiddenThreadRefetch, 'initial');
  const timers = [];
  let fetchedAt = 0, refetches = 0;
  const sandbox = {setTimeout: (f, ms) => (timers.push(f), timers.length), clearTimeout: id => { if (id) timers[id - 1] = null; }, performance: {now: () => 0}, JSON, Date,
    gl() { refetches++; }, e: {queryClient: {getQueryState: () => ({dataUpdatedAt: fetchedAt})}}};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(patched.replace(/export /g, '') + ';this.on=on;', sandbox);
  const log = [];
  let listener;
  sandbox.on({subscribe: options => { listener = options.listener; }, getConversationCwd() {}, getConversation: () => null}, log);
  const ready = (threadId, name) => listener({method: 'mcpServer/startupStatus/updated', params: {status: 'ready', threadId, name}});
  for (const name of ['a', 'b', 'c']) { ready('prediction-fork', name); ready('user-thread', name); }
  assert.equal(log.filter(l => l.startsWith('thread:')).length, 6, 'every report still runs its per-thread work');
  assert.equal(refetches, 0, 'the shared refetch waits');
  for (const f of timers.splice(0)) f?.();
  assert.equal(refetches, 1, 'six reports, one shared refetch');
  listener({method: 'mcpServer/startupStatus/updated', params: {status: 'failed', threadId: 'unknown-thread', name: 'a'}});
  assert.ok(log.includes('failed:unknown-thread'), 'failures for any thread behave as before');
  fetchedAt = Date.now();
  ready('second-thread', 'a');
  for (const f of timers.splice(0)) f?.();
  assert.equal(refetches, 1, 'an inventory fetched in the last minute covers a new thread');
  assert.ok(log.includes('thread:second-thread'));
});

test('the compositor shimmer moves layers instead of repainting the text', () => {
  const runtime = context.CodexPPStartupAdapter.compositorShimmer;
  assert.match(runtime, /@keyframes codexpp-shimmer-window\{from\{transform:translateX\(-100%\)\}to\{transform:translateX\(250%\)\}\}/, 'same path as background-position -100% to 250% of a half-width band');
  assert.match(runtime, /@keyframes codexpp-shimmer-text\{from\{transform:translateX\(50%\)\}to\{transform:translateX\(-125%\)\}\}/, 'the copy counter-moves so glyphs stay aligned');
  assert.doesNotMatch(runtime.replace(/loading-shimmer!important/g, ''), /background-position/, 'nothing animates a painted property');
  assert.match(runtime, /prefers-reduced-motion:reduce/);
  // A plain-text label gets the overlay; a label with elements keeps the original shimmer.
  const listeners = {}, appended = [];
  const make = (tag, children = [], height = 20) => ({tagName: tag, nodeType: 1, childNodes: children, dataset: {}, classList: {contains: c => c === 'codexpp-shimmer' && tag === 'overlay'},
    getBoundingClientRect: () => ({height}),
    style: {}, setAttribute() {}, append(...nodes) { this.childNodes.push(...nodes); appended.push(...nodes); }, matches: () => true, remove() {}});
  const rootAttributes = new Set(), windowListeners = {};
  let focused = true;
  const styles = new Map();
  const sandbox = {Element: Object, MutationObserver: class { observe() {} },
    getComputedStyle: el => ({padding: '0px', direction: 'ltr', textAlign: 'start', lineHeight: '20px', fontSize: '14px', ...styles.get(el)}),
    addEventListener: (type, f) => { windowListeners[type] = f; },
    document: {head: {append() {}}, hasFocus: () => focused, documentElement: {setAttribute: n => rootAttributes.add(n), removeAttribute: n => rootAttributes.delete(n)},
      createElement: () => ({...make('overlay'), className: ''}), addEventListener: (type, f) => { listeners[type] = f; }}};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(runtime, sandbox);
  const plain = make('div', [{nodeType: 3, data: 'Thinking'}]);
  listeners.animationstart({animationName: 'codexpp-shimmer-mark', target: plain});
  assert.equal(plain.dataset.codexppShimmer, 'on');
  const rich = make('div', [{nodeType: 1, classList: {contains: () => false}}]);
  listeners.animationstart({animationName: 'codexpp-shimmer-mark', target: rich});
  assert.equal(rich.dataset.codexppShimmer, 'off', 'rich content falls back to the original shimmer');
  const wrapped = make('div', [{nodeType: 3, data: 'Working for a long time on a long label'}], 40);
  listeners.animationstart({animationName: 'codexpp-shimmer-mark', target: wrapped});
  assert.equal(wrapped.dataset.codexppShimmer, 'off', 'a wrapped label keeps the original shimmer');
  for (const style of [{direction: 'rtl'}, {textAlign: 'center'}]) {
    const label = make('div', [{nodeType: 3, data: 'Thinking'}]);
    styles.set(label, style);
    listeners.animationstart({animationName: 'codexpp-shimmer-mark', target: label});
    assert.equal(label.dataset.codexppShimmer, 'off', JSON.stringify(style));
  }
  focused = false; windowListeners.blur();
  assert.ok(rootAttributes.has('data-codexpp-blurred'), 'an unfocused window pauses its shimmers');
  focused = true; windowListeners.focus();
  assert.ok(!rootAttributes.has('data-codexpp-blurred'), 'focus resumes them');
  assert.match(runtime, /:root\[data-codexpp-blurred\] \.codexpp-shimmer\{visibility:hidden\}/);
});

test('width media rules become container queries on the root at patch time; other media rules stay', () => {
  const rewrite = context.CodexPPStartupAdapter.rewriteViewportCSS;
  const css = '@layer utilities{.a{color:red}@media (width>=48rem){.md\\:flex{display:flex}}' +
    '@media not all and (width>=40rem){:root{--x:1}html[data-a] .b{color:blue}}' +
    '@media (height<=500px){.c{display:none}}@media (prefers-reduced-motion:reduce){.d{animation:none}}' +
    '@media (min-device-width:600px){.e{color:red}}@media screen and (min-width:450px),(width<=30rem){.f{content:"{not;a}"}}}' +
    '/* @media (width>=1px){} */.g{background:url(a;b)}';
  const out = rewrite(css);
  assert.ok(out.startsWith('html{container:codexpp-viewport/inline-size}@layer utilities{'), 'one root container, before the rules');
  assert.ok(out.includes('@container codexpp-viewport ((width>=48rem)){.md\\:flex{display:flex}}'));
  assert.ok(out.includes('@container codexpp-viewport not ((width>=40rem)){:root > body{--x:1}html[data-a] .b{color:blue}}'), 'root rules apply to body');
  assert.ok(out.includes('@media (height<=500px){.c{display:none}}'), 'height stays a media query');
  assert.ok(out.includes('@media (prefers-reduced-motion:reduce)'), 'preferences stay');
  assert.ok(out.includes('@media (min-device-width:600px)'), 'device queries stay');
  assert.ok(out.includes('@container codexpp-viewport ((min-width:450px)) or ((width<=30rem)){.f{content:"{not;a}"}}'), 'lists, media types and strings');
  assert.ok(out.endsWith('/* @media (width>=1px){} */.g{background:url(a;b)}'), 'comments and urls untouched');
  assert.equal(rewrite('.a{color:red}@media (prefers-color-scheme:dark){.a{color:blue}}'), null, 'nothing to change');
  assert.ok(rewrite('@charset "utf-8";@media (width>=1px){.a{b:c}}').startsWith('@charset "utf-8";html{container:'), 'after @charset');
  const {applied, css: files} = adapt({css: {'webview/assets/a.css': css, 'webview/assets/b.css': '.x{y:z}'}});
  assert.equal(applied.viewportContainerQueries, 'css');
  assert.deepEqual(Object.keys(files), ['webview/assets/a.css'], 'only changed stylesheets are returned');
});

test('the shell sets its size on window resize events, before the frame, without patching ResizeObserver', () => {
  const initial = 'export function P(S,b,E,bQs){let e=!1;try{S.updateUserAsync(b).then(bQs).finally(()=>{e||E(b)})}catch(e){}return `x`};' +
    'export function shell(st,l,He,be){return e=>{st(e),e!=null&&!l&&(He.set(e.clientHeight),be.set(e.clientWidth))}}';
  const {initial: patched, applied} = adapt({initial});
  assert.equal(applied.shellResizeSync, 'initial');
  let resize = null;
  const sandbox = {addEventListener: (type, f) => { if (type === 'resize') resize = f; }, document: {styleSheets: [], addEventListener() {}, head: {prepend() {}}, createElement: () => ({setAttribute() {}})},
    matchMedia: () => ({matches: false}), setTimeout() {}, CSS: {supports: () => false}};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(patched.replace(/export /g, '') + ';this.shell=shell;', sandbox);
  assert.equal(typeof sandbox.ResizeObserver, 'undefined', 'ResizeObserver is left alone');
  const value = () => ({v: null, set(x) { this.v = x; }});
  const height = value(), width = value(), element = {isConnected: true, clientHeight: 700, clientWidth: 1200};
  // The app's guard (l) is a client flag that is always true, so its own mount measurement never runs.
  const ref = sandbox.shell(() => {}, true, height, width);
  ref(element);
  assert.deepEqual([height.v, width.v], [null, null], 'mount behaves as stock');
  element.clientWidth = 1100; element.clientHeight = 690;
  resize();
  assert.deepEqual([height.v, width.v], [690, 1100], 'a window resize sets the new size at once');
  ref(null); element.clientWidth = 900; resize();
  assert.equal(width.v, 1100, 'an unmounted shell is forgotten');
});

test('release builds skip the diagnostic edits', () => {
  const requirements = 'async function da(){la=null,await Gi(),x();for(;;){let f=`home-creation`;try{f=`policy-read`;' +
    'let{appServerVersion:o,response:p}=await i.a(a,c.app.getVersion(),{});f=`policy-validation`;let m=oa(o,p);return f=`node-permissions`,ta(m)?(la=m,!0):!1}catch(t){throw t}}}';
  const release = adapt({requirements, diagnostics: false});
  assert.equal(release.skipped.policyPhaseTimings, 'development builds only');
  assert.ok(!release.requirements.includes('.policy??={}'), 'no phase marks');
  assert.equal(release.applied.shellEnvironmentCacheFirst, 'requirements', 'speed-ups still apply');
});

test('an edit that would reuse a vendor identifier is dropped by name; the rest still apply', () => {
  const base = adapt({shared, initial});
  assert.equal(base.applied.caretBlinkTimeout, 'initial');
  const result = adapt({shared, initial: initial + ';var ppRoot=1;'});
  assert.match(result.skipped.caretBlinkTimeout, /identifier ppRoot already exists/);
  assert.equal(result.applied.statsigUserCacheFirst, 'initial', 'other edits in the module still apply');
  assert.ok(!result.initial.includes('codexpp-caret-blink'));
});

test('the settings query keeps its context, any property order and a trailing comma; old builds\' caches are removed', async () => {
  const shared = 'export const VK=()=>({queryKey:XG(`get-settings`),placeholderData:P,queryFn:({signal})=>load(signal),});';
  const {shared: patched, applied} = adapt({shared});
  assert.equal(applied.settingsCacheFirst, 'shared');
  const storage = {};
  for (const [name, value] of Object.entries({getItem: k => storage[k] ?? null, setItem: (k, v) => { storage[k] = String(v); }, removeItem: k => { delete storage[k]; }}))
    Object.defineProperty(storage, name, {value, enumerable: false});
  storage['codexpp.settings:app://-/assets/app-shared-OLD.js'] = '{"theme":"old"}';
  storage['unrelated'] = 'kept';
  const signal = {aborted: false};
  const sandbox = {module: {}, XG: k => [k], P: {}, load: async s => ({theme: 'dark', signal: s === signal}), localStorage: storage};
  vm.runInNewContext(patched.replace('export const VK=', 'module.VK=').replaceAll('import.meta.url', '"app://-/assets/app-shared-1.js"'), sandbox);
  const result = await sandbox.module.VK().queryFn({signal});
  assert.equal(result.signal, true, 'the query context reaches the original queryFn');
  assert.deepEqual(Object.keys(storage).sort(), ['codexpp.settings:app://-/assets/app-shared-1.js', 'unrelated'], 'older builds\' entries are removed');
});

test('a keep-alive tick that comes late after sleep pings before it drops the socket', () => {
  const network = 'var Q={Open:1};var Wo=1e4,Go=6e4;function Ko(e,{onPongTimeout:t,pingIntervalMs:n=Wo,pongTimeoutMs:r=Go}){let i=Date.now(),a=!1,o=()=>{i=Date.now()},' +
    's=setInterval(()=>{if(!(e.readyState!==Q.Open||a)){if(Date.now()-i>r){a=!0,t();return}e.ping()}},n),c=()=>{clearInterval(s),e.off(`pong`,o),e.off(`close`,c)};' +
    'return e.on(`pong`,o),e.on(`close`,c),c}';
  const {network: patched, applied} = adapt({network});
  assert.equal(applied.wakeAwarePongTimeout, 'network');
  const run = source => {
    let now = 0, tick = null;
    const sandbox = {Date: {now: () => now}, Math, setInterval: f => (tick = f, 1), clearInterval() {}};
    vm.runInNewContext(source + ';this.Ko=Ko;', sandbox);
    const socket = new EventEmitter(); socket.readyState = 1; socket.pings = 0; socket.ping = () => socket.pings++;
    let dropped = 0;
    sandbox.Ko(socket, {onPongTimeout: () => dropped++});
    return {socket, advance(ms) { now += ms; tick(); }, get dropped() { return dropped; }, pong() { socket.emit('pong'); }};
  };
  // Stock: the first tick after a long sleep drops a socket that still works.
  const stock = run(network);
  stock.advance(1e4); stock.pong(); stock.advance(3600e3);
  assert.equal(stock.dropped, 1);
  // Patched: that tick pings; a live socket answers and is kept.
  const live = run(patched);
  live.advance(1e4); live.pong(); live.advance(3600e3);
  assert.equal(live.dropped, 0); assert.equal(live.socket.pings, 2);
  live.pong(); live.advance(1e4);
  assert.equal(live.dropped, 0);
  // A socket that died during sleep is dropped on the next tick, not 60 s later.
  const dead = run(patched);
  dead.advance(1e4); dead.pong(); dead.advance(3600e3); dead.advance(1e4);
  assert.equal(dead.dropped, 1);
  // While awake a silent socket is still dropped after the 60 s timeout.
  const awake = run(patched);
  for (let i = 0; i < 6; i++) awake.advance(1e4);
  assert.equal(awake.dropped, 0);
  awake.advance(1e4);
  assert.equal(awake.dropped, 1);
});

test('words whose fade has finished render as plain text; fading words stay spans', () => {
  const initial = 'function irl({fadeSegmentDelayMs:e,fadeSegmentMaxDelayMs:t,fadeText:n,fadeSegmentStartIndex:r,fadeSegmentTimeline:i,keys:a,segments:o}){' +
    'return n?o.map((n,o)=>{let s=r+o;return(0,arl.jsx)(`span`,{className:i?.settledKeys.has(a?.[o])?void 0:`fade`,children:n},a?.[o]??`fade-${s}`)}):o}';
  const {initial: patched, applied} = adapt({initial});
  assert.equal(applied.plainSettledWords, 'initial');
  const sandbox = {arl: {jsx: (type, props, key) => ({type, key, children: props.children})}};
  vm.runInNewContext(patched + ';this.irl=irl;', sandbox);
  const timeline = {settledKeys: new Set(['k0', 'k1', 'k3'])};
  const out = sandbox.irl({fadeSegmentDelayMs: 0, fadeText: true, fadeSegmentStartIndex: 0, fadeSegmentTimeline: timeline,
    keys: ['k0', 'k1', 'k2', 'k3', 'k4'], segments: ['Hello ', 'there, ', 'how ', 'are ', 'you']});
  assert.deepEqual(JSON.parse(JSON.stringify(out)), ['Hello there, ', {type: 'span', key: 'k2', children: 'how '}, 'are ', {type: 'span', key: 'k4', children: 'you'}]);
  assert.equal(out.map(part => typeof part === 'string' ? part : part.children).join(''), 'Hello there, how are you', 'the text is unchanged');
  const quiet = sandbox.irl({fadeText: false, segments: ['a', 'b'], keys: [], fadeSegmentStartIndex: 0, fadeSegmentTimeline: timeline});
  assert.deepEqual(JSON.parse(JSON.stringify(quiet)), ['a', 'b'], 'without fading the segments pass through as before');
});

test('at most four idle page sessions wait out the grace period; protected sessions are never closed', () => {
  const initial = 'var r1=new Map,EDo=12e4;function cDo(e){return e.session.getSnapshot().recoveryDrafts.length>0||e.session.hasDeferredLocalEdits}' +
    'function uDo(e){return cDo(e)||e.session.getSnapshot().pendingUpdates>0}function mDo(e){return!1}' +
    'function hDo(e){if(e.disposed||e.consumers!==0||uDo(e))return;let t=e.session.getSnapshot(),n=e.speculative||e.idleSince==null||mDo(e.scope)?0:EDo-Math.max(Date.now()-e.idleSince.wallMs,performance.now()-e.idleSince.monotonicMs);' +
    'if(n<=0||t.status!==`connected`||!t.hasCanonicalDocument||t.errorCode!=null){_Do(e);return}e.disposalTimer??=setTimeout(()=>{e.disposalTimer=null,hDo(e)},n)}' +
    'function gDo(e){e.disposalTimer!=null&&(clearTimeout(e.disposalTimer),e.disposalTimer=null)}' +
    'function _Do(e){if(!e.disposed){e.disposed=!0,gDo(e);for(let t of e.keys)r1.get(t)===e&&r1.delete(t);e.session.dispose()}}';
  const {initial: patched, applied} = adapt({initial});
  assert.equal(applied.capIdlePageSessions, 'initial');
  const run = source => {
    let now = 1000, timers = 0;
    const sandbox = {Date: {now: () => now}, performance: {now: () => now}, setTimeout: () => ++timers, clearTimeout() {}, Map, Set};
    vm.runInNewContext(source + ';this.r1=r1;this.hDo=hDo;', sandbox);
    const make = (id, snapshot = {}) => {
      const entry = {id, keys: [`${id}:content`, `${id}:meta`], consumers: 1, disposed: false, idleSince: null, disposalTimer: null, speculative: false, closed: 0,
        session: {hasDeferredLocalEdits: false, snap: {status: 'connected', hasCanonicalDocument: true, errorCode: null, pendingUpdates: 0, recoveryDrafts: [], ...snapshot},
          getSnapshot() { return this.snap; }, dispose() { entry.closed++; }}};
      for (const key of entry.keys) sandbox.r1.set(key, entry);
      return entry;
    };
    // A consumer leaves: the session is idle from now on and waits out the grace period.
    const release = entry => { now += 10; entry.consumers = 0; entry.idleSince = {wallMs: now, monotonicMs: now}; sandbox.hDo(entry); };
    return {make, release, map: sandbox.r1};
  };
  const scenario = source => {
    const {make, release, map} = run(source);
    const open = make('open');                                  // still shown
    const drafts = make('drafts');                              // recovery drafts
    const late = make('late');                                  // goes idle first, gets an unsent edit later
    release(late); late.session.snap.pendingUpdates = 1;
    release(drafts); drafts.session.snap.recoveryDrafts = ['draft']; release(drafts);
    const pages = Array.from({length: 7}, (_, i) => make(`page${i}`));
    for (const page of pages) release(page);
    return {open, drafts, late, pages, map};
  };
  const stock = scenario(initial);
  assert.equal(stock.pages.filter(p => p.disposed).length, 0, 'stock keeps every idle session for 2 minutes');
  const capped = scenario(patched);
  assert.deepEqual(capped.pages.map(p => p.disposed), [true, true, true, false, false, false, false], 'the three longest-idle plain sessions are closed; four wait');
  assert.ok(capped.pages.every(p => p.closed === (p.disposed ? 1 : 0)), 'each through the app\'s own disposal, once');
  assert.ok(capped.pages.every(p => p.disposed !== p.keys.some(key => capped.map.has(key))), 'closed sessions leave the session map under every key');
  assert.ok(!capped.open.disposed && !capped.drafts.disposed && !capped.late.disposed, 'sessions with consumers, drafts or pending updates are kept');
});

test('child-page lists poll only on a Space route, through the spaces list\'s own gate', () => {
  const initial = 'var dP,jf,vDr,q={},qg={THIRTY_SECONDS:3e4};function Cu(e,t){return{read:t}}function Cxr(e,t){return t.metadataRefreshInterval}' +
    'function init(){vDr=Cu(q,({get:e})=>e(jf).pathname?.startsWith(`/space`)===!0&&e(dP)!==!1)}' +
    'function spaceRoots(t){return Cxr(1,{listId:`space-roots`,metadataRefreshInterval:t(vDr)?qg.THIRTY_SECONDS:!1})}' +
    'function children(t,e){return Cxr(1,{accountId:1,listId:`parent:${e}`,checkpointEnabled:!1,metadataRefreshInterval:t(dP)!==!1&&qg.THIRTY_SECONDS})}';
  const {initial: patched, applied} = adapt({initial});
  assert.equal(applied.childPagesPollOnSpaceRoute, 'initial');
  const run = (source, {initialised = true} = {}) => {
    const sandbox = {};
    vm.runInNewContext(source + ';this.atoms=()=>({dP,jf,vDr});this.init=init;this.children=children;dP={name:"focus"};jf={name:"location"};', sandbox);
    if (initialised) sandbox.init();
    return (pathname, focused) => {
      const {dP, jf} = sandbox.atoms();
      const get = atom => atom === dP ? focused : atom === jf ? {pathname} : atom.read({get});
      return sandbox.children(get, 'folder');
    };
  };
  const stock = run(initial), gated = run(patched);
  assert.equal(stock('/local/thread-1', true), 3e4, 'stock polls off the Space route');
  assert.equal(gated('/local/thread-1', true), false);
  assert.equal(gated('/space/page-1', true), 3e4, 'on a Space route it polls as before');
  assert.equal(gated('/space/page-1', false), false, 'not while the window is unfocused');
  const early = run(patched, {initialised: false});
  assert.equal(early('/local/thread-1', true), 3e4, 'before the gate exists, the original focus check applies');
  assert.equal(early('/local/thread-1', false), false);
});

test('Empty Trash stops listing on a repeated cursor or after 200 pages and keeps what it collected', async () => {
  const trash = 'export async function collect(ge,_,a){let l=[];{let e=new Set,t;do{let n=await ge.safeGet(`/pages/archived`,{parameters:{query:{cursor:t,limit:50}},signal:a.signal});' +
    'for(let t of n.items)_.has(t.page_id)||e.add(t.page_id);t=n.next_cursor??void 0}while(t!=null);l=[...e]}return l}';
  const {trash: patched, applied} = adapt({trash});
  assert.equal(applied.trashPaginationGuard, 'trash');
  const load = source => { const sandbox = {module: {}, Set}; vm.runInNewContext(source.replace('export async function collect', 'module.collect=async function'), sandbox); return sandbox.module.collect; };
  const server = next => { const calls = []; return {calls, safeGet: async (path, {parameters: {query}}) => { calls.push(query.cursor); return next(query.cursor, calls.length); }}; };
  const run = async (source, next) => { const ge = server(next); const items = await load(source)(ge, new Set(['skip']), {signal: {}}); return {items: [...items], calls: ge.calls}; };
  // A normal three-page listing is unchanged.
  const pages = {undefined: ['a', 'skip', 'c1'], c1: ['b', 'c2'], c2: ['c', null]};
  const normal = await run(patched, cursor => ({items: pages[cursor].slice(0, -1).map(page_id => ({page_id})), next_cursor: pages[cursor].at(-1)}));
  assert.deepEqual(normal, {items: ['a', 'b', 'c'], calls: [undefined, 'c1', 'c2']});
  // A server that hands back the same cursor: stock would request it forever.
  const repeated = await run(patched, (cursor, n) => ({items: [{page_id: `p${n}`}], next_cursor: 'again'}));
  assert.deepEqual(repeated, {items: ['p1', 'p2'], calls: [undefined, 'again']});
  const stockRepeated = await run(trash, (cursor, n) => { if (n > 500) throw new Error('still paging'); return {items: [], next_cursor: 'again'}; }).catch(e => e.message);
  assert.equal(stockRepeated, 'still paging');
  // A listing that never ends stops after 200 pages.
  const endless = await run(patched, (cursor, n) => ({items: [{page_id: `p${n}`}], next_cursor: `c${n}`}));
  assert.equal(endless.calls.length, 200); assert.equal(endless.items.length, 200);
});

test('a Space appearance change made while a save is in flight is sent when that save succeeds', async () => {
  const appearance = 'export function make(P,m,E,c,x,j,O,p,s,I,L,d){let V;V=async e=>{if(!P||m==null||E?.saving===!0||c.get(x)!==m)return;let t=j(c,m);' +
    'O({appearance:{emoji:I,theme:L,...e},saving:!0}),await p.safePatch(`/spaces/v2/{space_id}/appearance`,{parameters:{path:{space_id:s.id}},requestBody:e,signal:t.signal})' +
    '.then(async e=>{t.signal.aborted||O({appearance:e,saving:!1})}).catch(()=>{O(E),t.signal.aborted||d.danger(`Could not save space appearance`)}).finally(()=>{t.signal.aborted&&O(null),t.stop()})};return V}';
  const {appearance: patched, applied} = adapt({appearance});
  assert.equal(applied.queuedAppearanceChange, 'appearance');
  const run = (source, {fail = false} = {}) => {
    const sandbox = {module: {}, Map, Promise};
    vm.runInNewContext(source.replace('export function make', 'module.make=function'), sandbox);
    const requests = [], shown = [], errors = [], pending = [];
    const api = {safePatch: (path, {requestBody}) => { requests.push(JSON.parse(JSON.stringify(requestBody))); return new Promise((resolve, reject) => pending.push(() => fail ? reject(new Error('500')) : resolve({emoji: null, theme: null, ...requestBody}))); }};
    const scope = {get: () => 'account'};
    // Each render makes a new save function; E is that render's optimistic state.
    const render = E => sandbox.module.make(true, 'account', E, scope, 'accountAtom', () => ({signal: {aborted: false}, stop() {}}), state => shown.push(state), api, {id: 'space-1'}, null, null, {danger: m => errors.push(m)});
    const settle = async () => { while (pending.length) { pending.shift()(); await new Promise(resolve => setTimeout(resolve, 0)); } };
    return {render, requests, shown, errors, settle, queue: () => sandbox.__codexPPAppearanceQueue};
  };
  const scenario = async (source, options) => {
    const app = run(source, options);
    const first = app.render(null)({theme: 'blue'});
    const saving = app.render({appearance: {emoji: null, theme: 'blue'}, saving: true});
    saving({theme: 'red'}); saving({emoji: 'star'});
    await app.settle(); await first;
    return app;
  };
  const stock = await scenario(appearance);
  assert.deepEqual(stock.requests, [{theme: 'blue'}], 'stock drops changes made during the save');
  const queued = await scenario(patched);
  assert.deepEqual(queued.requests, [{theme: 'blue'}, {theme: 'red', emoji: 'star'}], 'the latest changes are merged and sent after the first save');
  assert.deepEqual(JSON.parse(JSON.stringify(queued.shown.at(-1))), {appearance: {emoji: 'star', theme: 'red'}, saving: false});
  assert.equal(queued.queue().size, 0);
  const failed = await scenario(patched, {fail: true});
  assert.deepEqual(failed.requests, [{theme: 'blue'}], 'a failed save drops the queued change with it');
  assert.equal(failed.errors.length, 1); assert.equal(failed.queue().size, 0);
  // Without a save in flight, each change is sent at once, as before.
  const app = run(patched);
  const one = app.render(null)({emoji: 'a'}); await app.settle(); await one;
  assert.deepEqual(app.requests, [{emoji: 'a'}]);
});
test('stderr lines of a running stdio app-server are logged, not stored as the connection error', () => {
  const appServer = 'var o={an:e=>e.startsWith(`Parse Error`)?{code:`restart-required`}:{code:`connection-failed`,message:e}};function eB(e){return{message:e.message,safe:{}}}' +
    'class C{constructor(t){this.options={transport:t};this.logger=log;this.connectionError=null}attach(e){this.connection=e;let t=1,s=r=>log.rejected.push(r.message);' +
    'e.onerror=n=>{if(this.connection!==e){this.logger.trace(`stale`);return}let{message:r,safe:i}=eB(n,this.options);this.connectionError=o.an(r),' +
    'this.options.transport.kind===`websocket`&&s(Error(r)),this.options.transport.supportsReconnect()?this.logger.error(`app_server_connection.websocket_error`,{}):' +
    'this.logger.debug(`Codex CLI stderr`,{safe:{message:r}})}}}';
  const {appServer: patched, applied} = adapt({appServer});
  assert.equal(applied.stderrNotConnectionError, 'appServer');
  const run = (source, kind, readyState = 1) => {
    const debug = [], log = {rejected: [], error() {}, trace() {}, debug: (name, {safe}) => debug.push(safe.message)};
    const sandbox = {log};
    vm.runInNewContext(source + ';this.C=C;', sandbox);
    const host = new sandbox.C({kind, supportsReconnect: () => kind === 'websocket'}), connection = {readyState};
    host.attach(connection);
    return {host, connection, log, debug};
  };
  const line = {type: 'error', message: 'WARN codex_core: slow'};
  // Stock: a harmless WARN line becomes a connection-failed error on a connected host.
  const stock = run(appServer, 'stdio');
  stock.connection.onerror(line);
  assert.deepEqual({...stock.host.connectionError}, {code: 'connection-failed', message: 'WARN codex_core: slow'});
  const live = run(patched, 'stdio');
  live.connection.onerror(line);
  assert.equal(live.host.connectionError, null);
  assert.deepEqual(live.debug, ['WARN codex_core: slow'], 'still logged');
  // A line that means restart required, and process errors, are recorded as before.
  live.connection.onerror({type: 'error', message: 'Parse Error: bad'});
  assert.deepEqual({...live.host.connectionError}, {code: 'restart-required'});
  live.host.connectionError = null;
  live.connection.onerror({type: 'error', error: new Error('spawn EPIPE'), message: 'spawn EPIPE'});
  assert.equal(live.host.connectionError?.message, 'spawn EPIPE');
  // Once the process is no longer open, or on a websocket, stderr-shaped errors are recorded.
  const closed = run(patched, 'stdio', 3);
  closed.connection.onerror(line);
  assert.equal(closed.host.connectionError?.code, 'connection-failed');
  const socket = run(patched, 'websocket');
  socket.connection.onerror({type: 'error', message: 'socket hang up'});
  assert.equal(socket.host.connectionError?.message, 'socket hang up');
  assert.deepEqual(socket.log.rejected, ['socket hang up']);
});

test('remote-control websocket reconnects back off from 1 s to 30 s and reset once a socket is installed', async () => {
  const appServer = 'var LU=1e3;class X{reconnectTimer=null;streams=new Set([1]);fails=0;ws=null;async ensureOpen(){if(this.fails-->0)throw Error(`down`);this.installWebsocket({})}' +
    'installWebsocket(e){this.ws=e}scheduleReconnect(){this.reconnectTimer==null&&this.streams.size!==0&&(this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null,' +
    'this.ensureOpen().catch(e=>{warn(e),this.scheduleReconnect()})},LU))}}';
  const {appServer: patched, applied} = adapt({appServer});
  assert.equal(applied.remoteControlBackoff, 'appServer');
  const run = async (source, fails) => {
    const delays = []; let fire = null;
    const sandbox = {Math: Object.assign(Object.create(Math), {random: () => 0.5}), warn() {}, setTimeout: (f, ms) => (delays.push(ms), fire = f, 1)};
    vm.runInNewContext(source + ';this.X=X;', sandbox);
    const client = new sandbox.X(); client.fails = fails;
    client.scheduleReconnect();
    for (let i = 0; i <= fails; i++) { const f = fire; fire = null; f(); await new Promise(resolve => setImmediate(resolve)); }
    return {client, delays};
  };
  const stock = await run(appServer, 7);
  assert.deepEqual(stock.delays, [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]);
  const patchedRun = await run(patched, 7);
  assert.deepEqual(patchedRun.delays, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.ok(patchedRun.client.ws, 'the eighth attempt opened');
  patchedRun.client.ws = null; patchedRun.client.scheduleReconnect();
  assert.equal(patchedRun.delays.at(-1), 1000, 'a new outage starts again at 1 s');
});

test('pubsub reconnects are capped at 60 s, and focus or online reconnects a socket waiting to retry', () => {
  const shared = 'var SX={maxReconnectionDelay:1/0,maxRetries:20,minReconnectionDelay:1e3,reconnectionDelayGrowFactor:1.5},dVn={maxReconnectionDelay:1/0,maxRetries:5,minReconnectionDelay:2e3,reconnectionDelayGrowFactor:2};' +
    'class Sock{reconnectTimer=null;shouldReconnect=!0;reconnects=0;options=null;setReconnectOptions(e){this.options=e}reconnect(){this.reconnectTimer=null,this.reconnects++}}' +
    'class Client{socket=new Sock;isTransportOpen=!1;windowFocused=!1;constructor(){this.socket.setReconnectOptions(SX),document.addEventListener(`visibilitychange`,this.handleWindowFocusChange),' +
    'window.addEventListener(`blur`,this.handleWindowFocusChange),window.addEventListener(`focus`,this.handleWindowFocusChange)}disconnect(){document.removeEventListener(`visibilitychange`,this.handleWindowFocusChange),' +
    'window.removeEventListener(`blur`,this.handleWindowFocusChange),window.removeEventListener(`focus`,this.handleWindowFocusChange),this.closed=!0}' +
    'handleWindowFocusChange=()=>{let e=document.hasFocus()&&!document.hidden;if(this.socket.setReconnectOptions(e?SX:dVn),e&&!this.isTransportOpen&&!this.socket.shouldReconnect&&this.socket.reconnect(),' +
    '!this.isTransportOpen||e===this.windowFocused){this.windowFocused=e;return}this.windowFocused=e}}';
  const {shared: patched, applied} = adapt({shared});
  assert.equal(applied.pubsubReconnectCap, 'shared');
  const run = source => {
    const window = new EventTarget(), document = Object.assign(new EventTarget(), {hidden: false, hasFocus: () => true});
    const sandbox = {window, document};
    vm.runInNewContext(source + ';this.Client=Client;this.SX=SX;this.dVn=dVn;', sandbox);
    return {client: new sandbox.Client(), window, sandbox};
  };
  const stock = run(shared);
  assert.equal(stock.sandbox.SX.maxReconnectionDelay, Infinity);
  stock.client.socket.reconnectTimer = 1;
  stock.window.dispatchEvent(new Event('focus')); stock.window.dispatchEvent(new Event('online'));
  assert.equal(stock.client.socket.reconnects, 0, 'stock waits for the pending retry');
  const live = run(patched);
  assert.equal(live.sandbox.SX.maxReconnectionDelay, 6e4); assert.equal(live.sandbox.dVn.maxReconnectionDelay, 6e4);
  live.client.socket.reconnectTimer = 1;
  live.window.dispatchEvent(new Event('focus'));
  assert.equal(live.client.socket.reconnects, 1, 'focus reconnects while a retry is pending');
  live.window.dispatchEvent(new Event('focus'));
  assert.equal(live.client.socket.reconnects, 1, 'no retry pending and retries left: nothing to do');
  live.client.socket.shouldReconnect = false; live.window.dispatchEvent(new Event('focus'));
  assert.equal(live.client.socket.reconnects, 2, 'exhausted retries reconnect as before');
  live.window.dispatchEvent(new Event('online'));
  assert.equal(live.client.socket.reconnects, 3, 'online reconnects a socket that is not open');
  live.client.isTransportOpen = true; live.window.dispatchEvent(new Event('online'));
  assert.equal(live.client.socket.reconnects, 3, 'an open socket is left alone');
  live.client.isTransportOpen = false; live.client.disconnect(); live.window.dispatchEvent(new Event('online'));
  assert.equal(live.client.socket.reconnects, 3, 'disconnect removes the online listener');
});

test('after a websocket reconnect the visible thread resumes alongside the thread-list refresh', async () => {
  const initial = 'async function recover(e,s,c,i,g,refresh,log){try{let n=s!=null;i.markAllConversationsNeedResumeAfterReconnect({restoreStreams:!0,foregroundConversationId:n?s:null});' +
    'let a=!1;try{c===`live`?await refresh.refreshRecentConversations():null}catch(t){let n=t;a=!0,log.push(`refresh failed`)}let o=!n||s==null?!1:await g(e,s);log.push({o,a})}catch(t){log.push(`failed: ${t.message}`)}}';
  const {initial: patched, applied} = adapt({initial});
  assert.equal(applied.resumeVisibleThreadFirst, 'initial');
  const run = async (source, {refreshFails = false, resumeFails = false, visible = 'thread'} = {}) => {
    const sandbox = {}; vm.runInNewContext(source + ';this.recover=recover;', sandbox);
    const events = [], log = []; let finishRefresh;
    const refresh = () => (events.push('refresh'), new Promise((resolve, reject) => { finishRefresh = () => refreshFails ? reject(new Error('list')) : resolve(); }));
    const resume = async () => { events.push('resume'); if (resumeFails) throw new Error('resume'); return true; };
    const done = sandbox.recover('host', visible, 'live', {markAllConversationsNeedResumeAfterReconnect() { events.push('mark'); }}, resume, {refreshRecentConversations: refresh}, log);
    await new Promise(resolve => setImmediate(resolve));
    const before = [...events];
    finishRefresh(); await done;
    return {before, events, log: JSON.parse(JSON.stringify(log))};
  };
  const stock = await run(initial);
  assert.deepEqual(stock.before, ['mark', 'refresh'], 'stock resumes only after the refresh');
  const live = await run(patched);
  assert.deepEqual(live.before, ['mark', 'resume', 'refresh'], 'the resume starts first');
  assert.deepEqual(live.log, [{o: true, a: false}]);
  assert.deepEqual((await run(patched, {refreshFails: true})).log, ['refresh failed', {o: true, a: true}]);
  assert.deepEqual((await run(patched, {resumeFails: true})).log, ['failed: resume'], 'a failed resume reaches the same handler');
  const none = await run(patched, {visible: null});
  assert.deepEqual(none.events, ['mark', 'refresh']); assert.deepEqual(none.log, [{o: false, a: false}]);
});

test('the Remote Connections page skips its refresh ticks while the window is hidden', () => {
  const remoteSettings = 'var Qs=15e3;function effect(kn){return()=>{let e=null,t=!1,n=async()=>{t||(t=!0,e=new AbortController,await(async()=>{await kn(e.signal)})().finally(()=>{e=null,t=!1}))},' +
    'r=window.setInterval(()=>{n()},Qs);return()=>{e?.abort(),window.clearInterval(r)}}}';
  const {remoteSettings: patched, applied} = adapt({remoteSettings});
  assert.equal(applied.remoteSettingsPollWhenVisible, 'remoteSettings');
  const run = source => {
    let tick = null, refreshes = 0;
    const document = {hidden: true};
    const sandbox = {document, AbortController, window: {setInterval: (f, ms) => (assert.equal(ms, 15e3), tick = f, 1), clearInterval() {}}};
    vm.runInNewContext(source + ';this.effect=effect;', sandbox);
    sandbox.effect(async () => { refreshes++; })();
    return {tick: () => tick(), document, get refreshes() { return refreshes; }};
  };
  const stock = run(remoteSettings); stock.tick();
  assert.equal(stock.refreshes, 1);
  const live = run(patched); live.tick();
  assert.equal(live.refreshes, 0, 'hidden: skipped');
  live.document.hidden = false; live.tick();
  assert.equal(live.refreshes, 1, 'visible: refreshed');
});

test('re-registering a Browser sidebar window with the same owner records and logs nothing', () => {
  const main = 'class R{windows=new Map;sessionRoutes=new Map([[`c`,{windowId:`w`,ownerWebContentsId:1}]]);events=[];ensureWindowRecord(e){let t=this.windows.get(e);if(t!=null)return t;' +
    'let n={ownerWebContentsId:-1,windowId:e};return this.windows.set(e,n),n}recordDebugEvent(e){this.events.push(e.kind)}' +
    'registerWindow({ownerWebContentsId:e,windowId:t}){let n=t,r=(this.windows.get(n)??null)?.ownerWebContentsId,i=this.ensureWindowRecord(n);' +
    'if(i.ownerWebContentsId=e,r!=null&&r!==e)for(let t of this.sessionRoutes.values())t.windowId===n&&(t.ownerWebContentsId=e);' +
    'this.recordDebugEvent({kind:r==null?`browser-window-registered`:`browser-window-owner-rebound`}),Tq().info(r==null?`registered`:`rebound`)}}';
  const {main: patched, applied} = adapt({main});
  assert.equal(applied.quietSidebarRebind, 'main');
  const run = source => {
    const logs = [], sandbox = {Tq: () => ({info: m => logs.push(m)})};
    vm.runInNewContext(source + ';this.R=R;', sandbox);
    const registry = new sandbox.R();
    for (const owner of [1, 1, 1, 2]) registry.registerWindow({ownerWebContentsId: owner, windowId: 'w'});
    return {registry, logs};
  };
  assert.deepEqual(run(main).logs, ['registered', 'rebound', 'rebound', 'rebound']);
  const live = run(patched);
  assert.deepEqual(live.logs, ['registered', 'rebound']);
  assert.deepEqual([...live.registry.events], ['browser-window-registered', 'browser-window-owner-rebound']);
  assert.equal(live.registry.windows.get('w').ownerWebContentsId, 2);
  assert.equal(live.registry.sessionRoutes.get('c').ownerWebContentsId, 2, 'a changed owner still rebinds its routes');
});

test('background command output past its cap appends only the new tail instead of rewriting the terminal', () => {
  const xtermOutput = 'function X(e,b,C,I,n){let t=I.current,r=C(e);if(n.startsWith(t)){let r=n.slice(t.length);r.length>0&&e.write(b(r))}else e.reset(),n.length>0&&e.write(b(n));I.current=n}';
  const {xtermOutput: patched, applied} = adapt({xtermOutput});
  assert.equal(applied.terminalOutputAppend, 'xtermOutput');
  const run = source => {
    const sandbox = {Int32Array, Math};
    vm.runInNewContext(source + ';this.X=X;', sandbox);
    const term = {stream: '', resets: 0, bytes: 0, reset() { this.stream = ''; this.resets++; }, write(text) { this.stream += text; this.bytes += text.length; }};
    const ref = {current: ''};
    return {term, show: output => sandbox.X(term, s => s, () => true, ref, output)};
  };
  // The vendor's cap: the last 20,000 characters behind a truncation line.
  const mark = '[output truncated]\n', cap = 2e4;
  const capped = history => history.length > cap ? mark + history.slice(-cap) : history;
  const updates = []; let history = '';
  for (let i = 0; i < 800; i++) { history += `line ${i} ${'x'.repeat(i % 37)} ${(i * 7919) % 1000}\n`.repeat(3); updates.push(capped(history)); }
  assert.ok(history.length > 2 * cap);
  const stock = run(xtermOutput), fixed = run(patched);
  for (const output of updates) { stock.show(output); fixed.show(output); }
  assert.ok(stock.term.resets > 100, 'stock resets on every update once truncated');
  assert.equal(fixed.term.resets, 0);
  assert.equal(fixed.term.stream, history, 'the terminal received every line exactly once, in order');
  assert.ok(fixed.term.bytes < stock.term.bytes / 10);
  // The session buffer's cap (the last 16,000 characters, no truncation line).
  const session = run(patched); let buffer = '', full = '';
  for (let i = 0; i < 300; i++) { const chunk = `$ step ${i}: ${'#'.repeat(i % 50)}\r\n`; full += chunk; buffer = (buffer + chunk).slice(-16e3); session.show(buffer); }
  assert.equal(session.term.resets, 0); assert.equal(session.term.stream, full);
  // Unrelated output (no overlap), or shorter output, still resets as before.
  fixed.show(mark + 'y'.repeat(cap));
  assert.equal(fixed.term.resets, 1); assert.equal(fixed.term.stream, mark + 'y'.repeat(cap));
  fixed.show('short');
  assert.equal(fixed.term.resets, 2); assert.equal(fixed.term.stream, 'short');
});

test('terminal refits requested in the same frame share one animation frame and keep a forced repaint', () => {
  const terminalPanel = 'const T=(e,F,Se,m,E,l)=>{let u=!1,D=t=>{let n=t!==void 0&&t;u||e.isConnected&&requestAnimationFrame(()=>{u||e.isConnected&&(F.current?Se(m,E,l,n):E.fit())})};' +
    'D();let oe=new ResizeObserver(()=>{D()});return{D,stop:()=>{u=!0}}}';
  const {terminalPanel: patched, applied} = adapt({terminalPanel});
  assert.equal(applied.coalescedTerminalResize, 'terminalPanel');
  const run = source => {
    let frames = [];
    const sandbox = {requestAnimationFrame: f => frames.push(f), ResizeObserver: class {}};
    vm.runInNewContext(source + ';this.T=T;', sandbox);
    const calls = [];
    const panel = sandbox.T({isConnected: true}, {current: true}, (m, E, l, n) => calls.push(n), {}, {fit() {}}, 's');
    return {panel, calls, frame() { const now = frames; frames = []; now.forEach(f => f()); }, get pending() { return frames.length; }};
  };
  const stock = run(terminalPanel);
  stock.panel.D(); stock.panel.D(true);
  assert.equal(stock.pending, 3); stock.frame();
  assert.deepEqual(stock.calls, [false, false, true]);
  const fixed = run(patched);
  fixed.panel.D(); fixed.panel.D(true); fixed.panel.D();
  assert.equal(fixed.pending, 1); fixed.frame();
  assert.deepEqual(fixed.calls, [true], 'one refit, forced because one caller asked');
  fixed.panel.D(); fixed.frame();
  assert.deepEqual(fixed.calls, [true, false], 'the next frame starts unforced');
  fixed.panel.D(); fixed.panel.stop(); fixed.frame();
  assert.deepEqual(fixed.calls, [true, false], 'a frame after unmount does nothing, as before');
});

test('pty output is batched per session, in order, and always delivered before the exit', () => {
  const main = 'class M{log=[];appendOutput(e,t){this.log.push([`data`,t])}destroySession(e,t){this.log.push([`exit`,t])}getSessionForBackend(){return{id:1}}' +
    'make(){let n={},i={buffer:``,exit:null},a=()=>n==null?null:this.getSessionForBackend(n),o={onData:e=>{let t=a();if(t==null){i.buffer=`${i.buffer}${e}`.slice(-16e3);return}this.appendOutput(t.id,e)},' +
    'onExit:e=>{let t=a();if(t==null){i.exit=e;return}this.destroySession(t,e)}};return o}}';
  const {main: patched, applied} = adapt({main});
  assert.equal(applied.batchedPtyOutput, 'main');
  let timers = new Map, id = 0;
  const sandbox = {setTimeout: (f, ms) => (timers.set(++id, [f, ms]), id), clearTimeout: t => timers.delete(t)};
  vm.runInNewContext(patched + ';this.M=M;', sandbox);
  const tick = () => { const due = [...timers.values()]; timers = new Map; for (const [f, ms] of due) { assert.equal(ms, 8); f(); } };
  const manager = new sandbox.M(), sink = manager.make(), log = () => JSON.parse(JSON.stringify(manager.log));
  sink.onData('$ ');
  assert.deepEqual(log(), [['data', '$ ']], 'the first chunk after a quiet spell goes out at once');
  sink.onData('a'); sink.onData('b'); sink.onData('c');
  assert.equal(manager.log.length, 1);
  tick();
  assert.deepEqual(log().at(-1), ['data', 'abc'], 'chunks within the window are joined');
  tick();
  assert.equal(timers.size, 0, 'a quiet window ends the batching');
  sink.onData('x');
  assert.deepEqual(log().at(-1), ['data', 'x']);
  sink.onData('y'.repeat(4e4)); sink.onData('z'.repeat(3e4));
  assert.deepEqual(log().at(-1), ['data', 'y'.repeat(4e4) + 'z'.repeat(3e4)], 'flushed at once past 64 KB');
  sink.onData('last words'); sink.onExit({code: 0, signal: null});
  assert.deepEqual(log().slice(-2), [['data', 'last words'], ['exit', {code: 0, signal: null}]], 'pending output precedes the exit');
  assert.equal(timers.size, 0);
  const all = manager.log.filter(e => e[0] === 'data').map(e => e[1]).join('');
  assert.equal(all, '$ abcx' + 'y'.repeat(4e4) + 'z'.repeat(3e4) + 'last words');
  // Output that arrives before the session is registered still lands in its pending buffer.
  const early = new sandbox.M(); early.getSessionForBackend = () => null;
  const pending = early.make(); pending.onData('boot'); pending.onData(' log'); pending.onExit({code: 1, signal: null});
  assert.equal(early.log.length, 0);
});

test('home suggestions are no longer generated when the app goes to the background', () => {
  const main = 'function Ste({appEvent:e,startupPhases:s,run:_}){let d,v=e.subscribe(e=>{switch(e.type){case`background`:if(!s.hasReached(`background_ready`)){' +
    'd?.dispose(),d=ii({startupPhases:s,phase:`background_ready`,start:()=>{d=void 0,_(`background`)}});return}_(e.type);return;' +
    'case`foreground`:d?.dispose(),d=void 0;return;case`turnComplete`:return}});return v}' +
    'function Other(e,x){e.subscribe(e=>{switch(e.type){case`background`:x.handleBackground();break;case`foreground`:x.handleForeground()}})}';
  const {main: patched, applied} = adapt({main});
  assert.equal(applied.ambientSuggestionsOnDemand, 'main');
  const run = source => {
    const runs = [], handled = [], listeners = [];
    const sandbox = {ii: ({start}) => (start(), {dispose() {}})};
    vm.runInNewContext(source + ';this.Ste=Ste;this.Other=Other;', sandbox);
    const appEvent = {subscribe: f => (listeners.push(f), {dispose() {}})};
    sandbox.Ste({appEvent, startupPhases: {hasReached: () => true}, run: t => runs.push(t)});
    sandbox.Other(appEvent, {handleBackground: () => handled.push('background'), handleForeground: () => handled.push('foreground')});
    for (const type of ['background', 'foreground', 'turnComplete', 'background']) for (const f of listeners) f({type});
    return {runs, handled};
  };
  assert.deepEqual(run(main).runs, ['background', 'background'], 'stock: every trip to the background generates');
  const quiet = run(patched);
  assert.deepEqual(quiet.runs, []);
  assert.deepEqual(quiet.handled, ['background', 'foreground', 'background'], 'other background listeners are untouched');
});

test('home suggestions are generated at low reasoning effort', async () => {
  const ambient = 'async function Or({mode:f=`default`},d,n){let o=f===`first-plugin-connect`?d.ephemeralGenerationModel:d.ambientSuggestionsModel,' +
    'u=f===`first-plugin-connect`?`low`:n.pa;return{model:o,effort:u}}';
  const {ambient: patched, applied} = adapt({ambient});
  assert.equal(applied.ambientSuggestionsLowEffort, 'ambient');
  const sandbox = {};
  vm.runInNewContext(patched + ';this.Or=Or;', sandbox);
  const routing = {ephemeralGenerationModel: 'eph', ambientSuggestionsModel: 'amb'}, n = {pa: 'medium'};
  assert.deepEqual({...await sandbox.Or({}, routing, n)}, {model: 'amb', effort: 'low'});
  assert.deepEqual({...await sandbox.Or({mode: 'first-plugin-connect'}, routing, n)}, {model: 'eph', effort: 'low'}, 'the model choice is unchanged');
});

test('the catch-up prediction query runs only while the composer can show a prediction', () => {
  const primary = 'function ZXe(e){let{controller:n,canShowPrediction:r,hostId:i}=e,s=scope,c=target,u;u=[`cumberbatch`,c];let d=()=>fetches.push(c),f;' +
    'f={queryKey:u,queryFn:d,staleTime:1/0,gcTime:0,retry:!1,networkMode:`always`,refetchOnWindowFocus:!0};let{data:p}=Sm(f,s.queryClient);return r?p??null:null}';
  const {primary: patched, applied} = adapt({primary});
  assert.equal(applied.catchUpPredictionWhenShown, 'primary');
  const run = (source, canShowPrediction) => {
    const fetches = [], seen = [];
    // A minimal useQuery: a disabled query does not fetch.
    const sandbox = {fetches, scope: {queryClient: {}}, target: 't1', Sm: options => (seen.push(options.enabled), options.enabled !== false && options.queryFn(), {data: 'next'})};
    vm.runInNewContext(source + ';this.ZXe=ZXe;', sandbox);
    const shown = sandbox.ZXe({canShowPrediction});
    return {fetches: [...fetches], seen: [...seen], shown};
  };
  assert.deepEqual(run(primary, false).fetches, ['t1'], 'stock: fetched although it cannot be shown');
  assert.deepEqual(run(patched, false), {fetches: [], seen: [false], shown: null});
  assert.deepEqual(run(patched, true), {fetches: ['t1'], seen: [true], shown: 'next'});
  assert.deepEqual(run(patched, undefined).fetches, ['t1'], 'without the flag the query runs as before');
});

test('git state is added to a turn only when it differs from the copy the thread already has', async () => {
  const shared = 'async function pri(e,t,n,r){let a=t.getConversation(n);if(a==null)return r;let g=await e.read(n,r);' +
    'return g==null?r:{...r,additionalContext:{...r.additionalContext,codex_git_state:{kind:`untrusted`,value:m3(g)}}}}' +
    'function m3(e){return`<git>${e}</git>`}' +
    'function compacted(e,t){e.updateConversationState(t,t=>{delete t.lastInjectedPassiveContextKey})}';
  const {shared: patched, applied} = adapt({shared});
  assert.equal(applied.gitStateWhenChanged, 'shared');
  let branch = 'main', clock = 0;
  const state = {latestTurnStartMessageId: null};
  const manager = {getConversation: id => id === 'c' ? state : null, updateConversationState: (id, f) => f(state)};
  const reader = {read: (n, r) => JSON.stringify({schemaVersion: 1, threadId: n, clientUserMessageId: r.clientUserMessageId, status: 'complete', capturedAt: `t${clock++}`, branch})};
  const sandbox = {};
  vm.runInNewContext(patched + ';this.pri=pri;this.compacted=compacted;', sandbox);
  const send = async (id, started = true) => {
    const request = await sandbox.pri(reader, manager, 'c', {threadId: 'c', clientUserMessageId: id, additionalContext: {other: 1}});
    assert.equal(request.additionalContext.other, 1, 'other context is kept');
    if (started) state.latestTurnStartMessageId = id;
    return request.additionalContext.codex_git_state != null;
  };
  assert.equal(await send('m1'), true, 'the first turn carries it');
  assert.equal(await send('m2'), false, 'unchanged (apart from its timestamp and message id)');
  branch = 'feature';
  assert.equal(await send('m3'), true, 'changed');
  assert.equal(await send('m4'), false);
  branch = 'main';
  assert.equal(await send('m5', false), true);
  assert.equal(await send('m6', false), true, 'again when the turn that carried it never started');
  assert.equal(await send('m6'), true, 'and when the same message is prepared again');
  assert.equal(await send('m7'), false);
  sandbox.compacted(manager, 'c');
  assert.equal(await send('m8'), true, 'after a compaction or rollback');
  assert.equal(await send('m9'), false);
  // Delete inside the context: older Node does not propagate an outside delete.
  vm.runInContext('delete globalThis.__codexPPGitStateSession', sandbox);
  assert.equal(await send('m10'), true, 'after a reload');
  // Without the state API, or with an unreadable value, every turn carries it as before.
  const bare = {getConversation: manager.getConversation};
  for (let i = 0; i < 2; i++) assert.ok((await sandbox.pri(reader, bare, 'c', {clientUserMessageId: `b${i}`})).additionalContext.codex_git_state);
  const odd = {read: () => 'not json'};
  for (let i = 0; i < 2; i++) assert.ok((await sandbox.pri(odd, manager, 'c', {clientUserMessageId: `o${i}`})).additionalContext.codex_git_state);
});

test('a streaming code block without a language reuses its detected language', async () => {
  const shared = 'function Mqi(fe,Rqi,me){return()=>{let e=me.current;let t=e.latestContent,n=e.latestLanguage;e.lastStartedAtMs=0,' +
    'Rqi().then(r=>{e.disposed||r==null||fe(r.highlightCode(t,n))})}}';
  const {shared: patched, applied} = adapt({shared});
  assert.equal(applied.cachedAutoHighlightLanguage, 'shared');
  const run = source => {
    const calls = [], results = [], timers = [];
    const module = {highlightCode: (code, language) => {
      const named = language?.trim().toLowerCase();
      calls.push(named || 'auto');
      return {code, html: `<${named || 'auto'}>`, language: named || (code.startsWith('?') ? undefined : 'python')};
    }};
    const sandbox = {Promise, setTimeout: f => timers.push(f), clearTimeout: () => timers.splice(0)};
    vm.runInNewContext(source + ';this.Mqi=Mqi;', sandbox);
    const ref = {current: {disposed: false, latestContent: '', latestLanguage: undefined}};
    const highlight = sandbox.Mqi(result => results.push(result), () => Promise.resolve(module), ref);
    return {calls, results, timers, ref, async show(content, language) {
      ref.current.latestContent = content; ref.current.latestLanguage = language; highlight(); await new Promise(resolve => setTimeout(resolve, 0));
    }};
  };
  const stock = run(shared);
  for (const content of ['def a', 'def a():', 'def a():\n  pass']) await stock.show(content);
  assert.deepEqual(stock.calls, ['auto', 'auto', 'auto']);
  const cached = run(patched);
  await cached.show('def a');
  await cached.show('def a():');
  assert.deepEqual(cached.calls, ['auto', 'python'], 'the second pass uses the detected grammar');
  assert.equal(cached.results[1].language, 'python');
  await cached.show('def a():\n  pass', '');
  assert.deepEqual(cached.calls, ['auto', 'python', 'auto'], 'detected again once the content doubled');
  await cached.show('def a():\n  pass\n');
  assert.equal(cached.timers.length, 1);
  cached.timers[0]();
  assert.deepEqual(cached.calls, ['auto', 'python', 'auto', 'python', 'auto'], 'and once more when the content settles');
  assert.equal(cached.results.at(-1).html, '<auto>');
  // An explicit language is highlighted exactly as before.
  const named = run(patched);
  for (const content of ['fn a', 'fn a()', 'fn a() {}']) await named.show(content, 'Rust');
  assert.deepEqual(named.calls, ['rust', 'rust', 'rust']);
  assert.equal(named.timers.length, 0);
  // Content that auto-detection left as plain text stays plain text.
  const plain = run(patched);
  await plain.show('? a');
  await plain.show('? a b');
  assert.deepEqual(plain.calls, ['auto', 'plaintext']);
  assert.equal(plain.results[1].language, undefined);
  // A block replaced by different content is detected afresh.
  const replaced = run(patched);
  await replaced.show('def a():');
  await replaced.show('x');
  assert.deepEqual(replaced.calls, ['auto', 'auto']);
});

test('the integrated terminal loads the WebGL renderer once and falls back to the DOM renderer on failure', () => {
  const terminalPanel = 'export function mount(e,c,O){let m=new c.Terminal({});m.loadAddon(new O.FitAddon);m.attachCustomKeyEventHandler(()=>!0),m.open(e);return m}';
  const fakeAddon = '!function(e,t){"object"==typeof exports&&"object"==typeof module?module.exports=t():e.WebglAddon=t()}(self,(()=>({WebglAddon:class{' +
    'constructor(){if(self.failNext)throw Error("no webgl");self.made.push(this);this.lost=[]}onContextLoss(f){this.lost.push(f)}dispose(){this.disposed=!0}}})));';
  assert.equal(adapt({terminalPanel}).skipped.terminalWebglRenderer, 'renderer addon not provided');
  const {terminalPanel: patched, applied} = adapt({terminalPanel, webglAddon: fakeAddon});
  assert.equal(applied.terminalWebglRenderer, 'terminalPanel');
  const self = {made: [], failNext: false};
  const sandbox = {self, WeakSet, Error, WebGL2RenderingContext: function () {}};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(patched.replace(/export /g, '') + ';this.mount=mount;', sandbox);
  const term = () => ({addons: [], loadAddon(a) { this.addons.push(a); }, attachCustomKeyEventHandler() {}, open() {}});
  const c = {Terminal: function () { return term(); }}, O = {FitAddon: class {}};
  const first = sandbox.mount({}, c, O);
  assert.equal(self.made.length, 1); assert.ok(first.addons.includes(self.made[0]));
  self.made[0].lost[0]();
  assert.equal(self.made[0].disposed, true, 'a lost GPU context disposes the addon, back to the DOM renderer');
  self.failNext = true;
  assert.doesNotThrow(() => sandbox.mount({}, c, O), 'a failing addon leaves the terminal on the DOM renderer');
  // The vendored addon evaluates inside the wrapper and exposes its constructor.
  const real = fs.readFileSync(new URL('../Sources/CodexPPCore/Resources/xterm-addon-webgl.js', import.meta.url), 'utf8');
  const probe = {self: {}, WeakSet, WebGL2RenderingContext: undefined}; probe.globalThis = probe;
  const {terminalPanel: withReal} = adapt({terminalPanel, webglAddon: real});
  vm.runInNewContext(withReal.replace(/export /g, '') + ';this.mount=mount;this.ok=typeof ppWebgl;', probe);
  assert.equal(probe.ok, 'function');
  assert.doesNotThrow(() => probe.mount({}, c, O), 'without WebGL2 the terminal is left as it is');
});
