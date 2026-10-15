// Behaviour tests for the switchdata lane of startup edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adapt} from './startup-harness.mjs';

// The thread-config builder of app-shared, reduced to its shape: config
// requirements, then proxy info and Codex config (inside the request builder),
// the shell environment, the dynamic tools, and the developer instructions,
// each awaited in turn.
const builderHelpers = 'async function Bin(e,t,n){if(e==null)return null;try{return await n()}catch(e){return t.warning(`requirements`),null}}' +
  'async function wDt(e,t,n,r,i,a){let l={},u=await n();u!=null&&(l.proxy=u);if(a){let e=await a();if(e)for(let[t,n]of Object.entries(e))l[t]=n}return{cwd:r,model:e,tier:t,config:l}}' +
  'async function Win(e,t,n,r,i){try{let{shellEnvironment:t}=await n();if(t==null)return e;let a=await r();return{...e,config:{...e.config,shell:t,host:a}}}catch(n){return i.warning(`shell`),e}}';
const builder = (deps = 't') => 'async function Hin(e,' + deps + ',n=`critical`){let{requestClient:r,logger:i}=t;t.markPreparation?.(`request_parameters_started`);' +
  'let a=await Bin(e.serviceTier,i,()=>r.sendRequest(`configRequirements/read`)),o=await wDt(e.model,a,t.fetchProxyConfig,e.cwd,null,t.fetchCodexConfig);' +
  't.markPreparation?.(`request_parameters_finished`);let c=t.readShellEnvironment;' +
  'c!=null&&(t.markPreparation?.(`shell_environment_started`),o=await Win(o,e.cwd,()=>c(n),async()=>e.hostConfig,i));' +
  'if(t.readDynamicTools!=null){t.markPreparation?.(`dynamic_tools_started`);let n=await t.readDynamicTools();o.tools=n.map(e=>e.name);o.worktree=n.some(t=>t.name===`create_worktree`)}' +
  'if(t.readDeveloperInstructions!=null){t.markPreparation?.(`instructions_started`);let i=await t.readDeveloperInstructions({tools:o.tools},n);o.developerInstructions=i}return o}';
const builderChunk = builderHelpers + builder();

// Each request answers after `ms` (or fails, for names in `fail`); the log
// records when each started and finished.
function deps({ms = 20, fail = []} = {}) {
  const log = [], t0 = Date.now();
  const answer = (name, value) => new Promise((resolve, reject) => {
    const start = Date.now() - t0;
    setTimeout(() => { log.push({name, start, end: Date.now() - t0}); fail.includes(name) ? reject(new Error(name)) : resolve(value); }, ms);
  });
  return {log, deps: {
    requestClient: {sendRequest: method => answer(method, {requirements: 1})},
    logger: {warning() {}},
    fetchProxyConfig: () => answer('proxy', {baseUrl: 'x'}),
    fetchCodexConfig: () => answer('codexConfig', {'mcp.x': 1}),
    readShellEnvironment: priority => answer(`shell:${priority}`, {shellEnvironment: {PATH: '/bin'}}),
    readDynamicTools() { return answer(this === undefined ? 'tools:unbound' : 'tools', [{name: 'create_worktree'}]); },
    readDeveloperInstructions: (input, priority) => answer(`instructions:${priority}`, `dev ${input.tools.join(',')}`),
  }};
}
const build = (source, d) => vm.runInNewContext(`${source};Hin`, {setTimeout})({model: 'm', serviceTier: 'fast', cwd: '/repo', hostConfig: {h: 1}}, d);

test('the thread-config builder starts its independent reads together', async () => {
  const {shared: patched, applied} = adapt({shared: builderChunk});
  assert.equal(applied.parallelThreadConfigReads, 'shared');

  const stock = deps(), patchedRun = deps();
  const [stockResult, patchedResult] = [await build(builderChunk, stock.deps), await build(patched, patchedRun.deps)];
  assert.equal(JSON.stringify(patchedResult), JSON.stringify(stockResult), "the same configuration");
  assert.equal(patchedResult.developerInstructions, 'dev create_worktree');

  const names = log => log.map(r => r.name);
  assert.deepEqual(names(stock.log), ['configRequirements/read', 'proxy', 'codexConfig', 'shell:critical', 'tools', 'instructions:critical']);
  // Stock: six reads one after another. Patched: four start with the config requirements; the instructions wait for the tools.
  for (let i = 1; i < stock.log.length; i++) assert.ok(stock.log[i].start >= stock.log[i - 1].end);
  const byName = Object.fromEntries(patchedRun.log.map(r => [r.name, r]));
  for (const name of ['proxy', 'codexConfig', 'shell:critical', 'tools']) assert.ok(byName[name].start < byName['configRequirements/read'].end, name);
  assert.ok(byName['instructions:critical'].start >= byName.tools.end);
  assert.equal(patchedRun.log.length, 6, 'no read is made twice');
});

test('a failing read surfaces where the builder awaited it', async () => {
  const {shared: patched} = adapt({shared: builderChunk});
  for (const name of ['proxy', 'tools']) {
    const stock = await build(builderChunk, deps({fail: [name]}).deps).then(() => 'ok', e => e.message);
    const run = deps({fail: [name]});
    const result = await build(patched, run.deps).then(() => 'ok', e => e.message);
    assert.equal(result, stock);
    assert.equal(result, name);
  }
  // A failing shell environment is caught by the builder, as before.
  const shellStock = await build(builderChunk, deps({fail: ['shell:critical']}).deps);
  assert.equal(JSON.stringify(await build(patched, deps({fail: ["shell:critical"]}).deps)), JSON.stringify(shellStock));
});

test('a builder that uses its deps in another way is left as it is', () => {
  // The deps object is passed on whole: the copy would not be what the callee expects.
  const other = builderHelpers + builder('t').replace('let{requestClient:r,logger:i}=t;', 'let{requestClient:r,logger:i}=t;globalThis.keep=t;');
  const {applied, skipped} = adapt({shared: other});
  assert.equal(applied.parallelThreadConfigReads, undefined);
  assert.match(skipped.parallelThreadConfigReads, /found 0/);
});

// The inactive-thread manager of app-shared, reduced to its unsubscribe step.
const managerChunk = 'function nh(e,t,n){e.turns=t.map(e=>e),e.hasLoadedOldest=n}' +
  'var Men=class{params;constructor(e){this.params=e}hasActiveConversationView(e){return this.params.viewed.has(e)}hasOwnedStreamFollowers(e){return!1}' +
  'shouldKeepConversationLoaded(e){return e.keep===!0}getThreadRuntimeStatusAfterUnsubscribe(e){return{type:`idle`}}clearConversationStreamOwnership(e){}' +
  'async unsubscribeInactiveConversation(e){let t=this.params.threadStore.getConversation(e);if(t?.resumeState!==`resumed`)return;' +
  'try{let t=await this.params.requestClient.sendRequest(`thread/unsubscribe`,{threadId:e}),n=this.params.threadStore.getConversation(e),r=n!=null&&n.ephemeral===!0;' +
  'if(n!=null&&(r||n.resumeState!==`needs_resume`)){let t=r?{type:`notLoaded`}:this.getThreadRuntimeStatusAfterUnsubscribe(n),i=!r&&!this.hasActiveConversationView(e)&&!this.hasOwnedStreamFollowers(e)&&!this.shouldKeepConversationLoaded(n);' +
  'this.params.threadStore.updateConversationState(e,e=>{i&&(nh(e,[],!1),e.turnsPagination={olderCursor:null,oldestLoadedTurnId:null,isLoadingOlder:!1,hasLoadedOldest:!1}),e.resumeState=`needs_resume`,e.threadRuntimeStatus=t})}}' +
  'catch(t){}}}';

function manager(source) {
  const conversations = new Map(), viewed = new Set();
  const Men = vm.runInNewContext(`${source};Men`, {queueMicrotask});
  const m = new Men({viewed, requestClient: {sendRequest: async () => ({status: 'unsubscribed'})}, threadStore: {
    getConversation: id => conversations.get(id),
    updateConversationState(id, fn) { const c = conversations.get(id); if (c) fn(c); },
  }});
  const add = id => conversations.set(id, {id, resumeState: 'resumed', turns: [{turnId: `${id}-1`}], turnsPagination: {olderCursor: 'c'}});
  return {m, conversations, viewed, add, turns: id => conversations.get(id).turns.length};
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('the 10 most recently unsubscribed threads keep their turns', async () => {
  const {shared: patched, applied} = adapt({shared: managerChunk});
  assert.equal(applied.keepUnsubscribedTurns, 'shared');

  // Stock: every unsubscribed thread loses its turns.
  const stock = manager(managerChunk);
  stock.add('a'); await stock.m.unsubscribeInactiveConversation('a');
  assert.equal(stock.turns('a'), 0);
  assert.equal(stock.conversations.get('a').resumeState, 'needs_resume');

  const run = manager(patched);
  const ids = Array.from({length: 13}, (_, i) => `t${i}`);
  ids.forEach(run.add);
  for (const id of ids.slice(0, 10)) await run.m.unsubscribeInactiveConversation(id);
  await flush();
  for (const id of ids.slice(0, 10)) {
    assert.equal(run.turns(id), 1, `${id} keeps its turns`);
    assert.equal(run.conversations.get(id).resumeState, 'needs_resume');
    assert.equal(run.conversations.get(id).turnsPagination.olderCursor, 'c');
  }
  // t1 is reopened and resumed meanwhile; t2 is on screen: neither loses its turns when it would be evicted.
  run.conversations.get('t1').resumeState = 'resumed';
  run.viewed.add('t2');
  for (const id of ids.slice(10)) await run.m.unsubscribeInactiveConversation(id);
  await flush();
  assert.equal(run.turns('t0'), 0, 'the oldest kept thread is cleared as before');
  assert.equal(run.conversations.get('t0').turnsPagination.olderCursor, null);
  assert.equal(run.conversations.get('t0').hasLoadedOldest, false);
  assert.equal(run.turns('t1'), 1);
  assert.equal(run.turns('t2'), 1);
  for (const id of ids.slice(3)) assert.equal(run.turns(id), 1, id);

  // A thread that the original would keep anyway is not counted.
  run.add('kept'); run.conversations.get('kept').keep = true;
  await run.m.unsubscribeInactiveConversation('kept');
  assert.equal(run.turns('kept'), 1);
});

test('an unsubscribe step of another shape is left as it is', () => {
  const {applied, skipped} = adapt({shared: managerChunk.replace('`thread/unsubscribe`', '`thread/close`')});
  assert.equal(applied.keepUnsubscribedTurns, undefined);
  assert.match(skipped.keepUnsubscribedTurns, /found 0/);
});
