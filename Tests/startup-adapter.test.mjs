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
  assert.deepEqual(Object.keys(result.skipped).sort(), ['appGateReasons', 'authStorageGateCacheFirst', 'batchedPtyOutput', 'chunkTimings', 'coalesceBrowserMenuRefresh', 'coalescedTerminalResize', 'deferDockIcon', 'lazyAvatarOverlayPrewarm', 'lazyCheckoutCreditPrewarm', 'lazyCheckoutPricingPrewarm', 'lazyDetachedWindowPrewarm', 'lazyHotkeyWindowPrewarm', 'lazyPageWindowPrewarm', 'learnedStartupPreload', 'opaqueSurfaceExperiment', 'plainSettledWords', 'policyPhaseTimings', 'predictOnlyOpenThreads', 'queryTimings', 'settingsCacheFirst', 'shellResizeSync', 'skipHiddenThreadRefetch', 'startupRevealUnthrottled', 'statsigBootstrapCacheFirst', 'terminalOutputAppend', 'viewportContainerQueries', 'wakeAwarePongTimeout'], 'covered elsewhere');
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

test('live next-message predictions run only for a thread whose composer is open', async () => {
  const shared = 'function H0r(e,t){let n=pr.cumberbatch;n!=null&&t.addTurnCompletedListener(r=>{try{if(t.getStreamRole(r.conversationId)?.role!==`owner`)return;' +
    'let o={hostId:r.hostId,threadId:r.conversationId,latestTurnId:r.turnId,generationTrigger:`live`},s=null;' +
    'Promise.resolve(n.requestUserMessagePrediction(o,s)).then(t=>{t!=null&&log.push(t)}).catch(()=>{})}catch(e){}})}';
  const {shared: patched, applied} = adapt({shared});
  assert.equal(applied.predictOnlyOpenThreads, 'shared');
  const requests = [], log = [];
  let open = [];
  const scope = {queryClient: {getQueryCache: () => ({findAll: ({queryKey}) => open.filter(k => k[0] === queryKey[0]).map(queryKey => ({queryKey}))})}};
  let listener;
  const sandbox = {log, Promise, pr: {cumberbatch: {requestUserMessagePrediction: target => (requests.push(target.threadId), `prediction:${target.threadId}`)}}};
  vm.runInNewContext(patched + ';this.H0r=H0r;', sandbox);
  sandbox.H0r(scope, {addTurnCompletedListener: f => { listener = f; }, getStreamRole: () => ({role: 'owner'})});
  const complete = id => listener({hostId: 'local', conversationId: id, turnId: `${id}-turn`});
  open = [['cumberbatch', {hostId: 'local', threadId: 'visible', latestTurnId: 'visible-turn'}], ['other-query']];
  complete('visible'); complete('background');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(requests, ['visible'], 'a thread nobody has open is not forked');
  assert.deepEqual(log, ['prediction:visible']);
  // Without a query cache (an unexpected scope), behaviour is unchanged.
  const fallback = {};
  sandbox.H0r(fallback, {addTurnCompletedListener: f => { listener = f; }, getStreamRole: () => ({role: 'owner'})});
  complete('background');
  assert.deepEqual(requests, ['visible', 'background']);
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
