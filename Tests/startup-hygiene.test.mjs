// Behaviour tests for the hygiene lane's startup edits: each runs a minimal
// fixture of the vendor shape, stock and patched, in a VM sandbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adapt} from './startup-harness.mjs';

test('unhandled IPC broadcasts: lifecycle notices are not logged, others once per client and method', async () => {
  const appServer = 'export class c1{logger;broadcastHandlers=new Map;anyBroadcastHandlers=new Set;clientId=`a`;constructor(l){this.logger=l}' +
    'addBroadcastHandler(e,t){return this.broadcastHandlers.set(e,t),()=>{this.broadcastHandlers.delete(e)}}' +
    'async handleBroadcast(e){if(e.targetClientIds!=null&&!e.targetClientIds.includes(this.clientId))return;let t=this.broadcastHandlers.get(e.method);' +
    'if(this.anyBroadcastHandlers.size>0&&await Promise.all(Array.from(this.anyBroadcastHandlers).map(t=>t(e))),t){await t(e);return}' +
    'this.anyBroadcastHandlers.size===0&&this.logger.warning(`Received broadcast but no handler is configured`,{safe:{method:e.method},sensitive:{}})}}';
  const {appServer: patched, applied} = adapt({appServer});
  assert.equal(applied.quietUnhandledBroadcasts, 'appServer');
  const make = source => { const sandbox = {module: {}, Set, Map, Array, Promise}; vm.runInNewContext(source.replace('export class c1', 'module.C=class'), sandbox); return sandbox.module.C; };
  const run = async source => {
    const C = make(source), logs = [], handled = [];
    const a = new C({warning: (m, o) => logs.push(['a', o.safe.method])}), b = new C({warning: (m, o) => logs.push(['b', o.safe.method])});
    a.addBroadcastHandler('client-status-changed', e => handled.push(e.method));
    for (const method of ['client-status-changed', 'ipc-connection-reset', 'query-cache-invalidate', 'query-cache-invalidate', 'thread-stream-following-changed', 'client-status-changed'])
      for (const client of [a, b]) await client.handleBroadcast({type: 'broadcast', method, params: {}});
    return {logs, handled};
  };
  const stock = await run(appServer), quiet = await run(patched);
  assert.equal(stock.logs.length, 10, 'stock logs every unhandled broadcast');
  assert.deepEqual(quiet.logs, [['a', 'query-cache-invalidate'], ['b', 'query-cache-invalidate'], ['a', 'thread-stream-following-changed'], ['b', 'thread-stream-following-changed']]);
  assert.deepEqual(quiet.handled, stock.handled, 'handlers run as before');
  assert.deepEqual(quiet.handled, ['client-status-changed', 'client-status-changed']);
});

test('ResizeObserver loop notices are not reported as global errors; other errors are', () => {
  const initial = 'export function boot(Ho){window.addEventListener(`error`,e=>{let t=e?.error?.stack??e?.error?.message??e?.message??`Unknown error`;' +
    'Ho.dispatchMessage(`log-message`,{level:`error`,message:`[desktop-notifications][global-error] ${String(t)}`})});' +
    'window.addEventListener(`unhandledrejection`,e=>{Ho.dispatchMessage(`log-message`,{level:`error`,message:`[desktop-notifications][unhandled-rejection] ${e.reason}`})})}';
  const {initial: patched, applied} = adapt({initial});
  assert.equal(applied.benignResizeObserverNotice, 'initial');
  const run = source => {
    const listeners = {}, sent = [];
    const sandbox = {module: {}, String, window: {addEventListener: (type, fn) => { listeners[type] = fn; }}};
    vm.runInNewContext(source.replace('export function boot', 'module.boot=function'), sandbox);
    sandbox.module.boot({dispatchMessage: (type, payload) => sent.push(payload.message)});
    listeners.error({message: 'ResizeObserver loop completed with undelivered notifications.', error: null});
    listeners.error({message: 'ResizeObserver loop limit exceeded', error: null});
    listeners.error({message: 'Uncaught TypeError: x is undefined', error: {stack: 'TypeError: x is undefined\n at f'}});
    listeners.error({message: 'ResizeObserver loop thrown', error: {message: 'ResizeObserver loop completed with undelivered notifications.'}});
    return sent;
  };
  assert.equal(run(initial).length, 4);
  assert.deepEqual(run(patched), ['[desktop-notifications][global-error] TypeError: x is undefined\n at f',
    '[desktop-notifications][global-error] ResizeObserver loop completed with undelivered notifications.']);
});

test('thread notifications for a conversation this window has not loaded do not log "Conversation state not found"', () => {
  const shared = 'export function unn({manager:e,notificationContext:t},n){switch(n.method){case`thread/environment/connected`:case`thread/environment/disconnected`:' +
    '{let{threadId:t,environmentId:r}=n.params,i=e.getConversation(Y(t));if(r===`managed`)return;e.updateConversationState(Y(t),e=>{e.connectedEnvironmentIds=[r]});return}' +
    'case`thread/settings/updated`:{let{threadId:r,threadSettings:i}=n.params,a=Y(r);t.threadStore.conversations.has(a)&&e.updateConversationState(a,e=>{e.settings=i});return}' +
    'case`thread/goal/updated`:{let{threadId:t,goal:r}=n.params,i=Y(t),a=e.getConversation(i),o=r.status===`complete`&&a!=null;' +
    'e.updateConversationState(i,e=>{e.threadGoal=r}),o&&e.sendRequest(`thread/goal/clear`,{threadId:i});return}' +
    'case`thread/goal/cleared`:{let t=Y(n.params.threadId);e.updateConversationState(t,e=>{e.threadGoal=null});return}' +
    'case`thread/tokenUsage/updated`:{let{threadId:t,tokenUsage:r}=n.params;e.updateConversationState(Y(t),e=>{e.latestTokenUsageInfo=r});return}}}' +
    ';function Y(e){return e}';
  const {shared: patched, applied} = adapt({shared});
  assert.equal(applied.knownConversationNotifications, 'shared');
  const run = source => {
    const sandbox = {module: {}};
    vm.runInNewContext(source.replace('export function unn', 'module.unn=function unn'), sandbox);
    const conversations = new Map([['known', {}]]), errors = [], requests = [];
    const manager = {
      getConversation: id => conversations.get(id) ?? null,
      updateConversationState: (id, fn) => { const c = conversations.get(id); if (!c) { errors.push(id); return; } fn(c); },
      sendRequest: (m, p) => { requests.push(m); return {catch() {}}; },
    };
    const context = {threadStore: {conversations}};
    for (const threadId of ['known', 'other']) {
      sandbox.module.unn({manager, notificationContext: context}, {method: 'thread/tokenUsage/updated', params: {threadId, tokenUsage: 7}});
      sandbox.module.unn({manager, notificationContext: context}, {method: 'thread/goal/updated', params: {threadId, goal: {status: 'complete'}}});
      sandbox.module.unn({manager, notificationContext: context}, {method: 'thread/environment/connected', params: {threadId, environmentId: 'vm'}});
      sandbox.module.unn({manager, notificationContext: context}, {method: 'thread/settings/updated', params: {threadId, threadSettings: 's'}});
    }
    const goalBefore = conversations.get('known').threadGoal;
    sandbox.module.unn({manager, notificationContext: context}, {method: 'thread/goal/cleared', params: {threadId: 'other'}});
    sandbox.module.unn({manager, notificationContext: context}, {method: 'thread/goal/cleared', params: {threadId: 'known'}});
    return JSON.parse(JSON.stringify({errors, requests, known: conversations.get('known'), goalBefore}));
  };
  const stock = run(shared), fixed = run(patched);
  assert.deepEqual(stock.errors, ['other', 'other', 'other', 'other']);
  assert.deepEqual(fixed.errors, []);
  assert.deepEqual(fixed.known, stock.known, 'the loaded conversation is updated as before');
  assert.deepEqual(fixed.known, {latestTokenUsageInfo: 7, threadGoal: null, connectedEnvironmentIds: ['vm'], settings: 's'});
  assert.deepEqual(fixed.goalBefore, {status: 'complete'});
  assert.deepEqual(fixed.requests, stock.requests);
});

test('Library Empty Trash stops listing on a repeated cursor or after 200 pages and keeps what it collected', async () => {
  const libraryTrash = 'export async function K(e,t){try{let n=new Set,r;do{t.signal.throwIfAborted();let i=await e.safeGet(`/pages/archived`,{signal:t.signal,parameters:{query:{cursor:r,limit:50}}});' +
    'for(let e of i.items)n.add(e.page_id);r=i.next_cursor??void 0}while(r!=null);return[...n]}finally{t.stop()}}';
  const {libraryTrash: patched, applied} = adapt({libraryTrash});
  assert.equal(applied.libraryTrashPaginationGuard, 'libraryTrash');
  const load = source => { const sandbox = {module: {}, Set}; vm.runInNewContext(source.replace('export async function K', 'module.K=async function'), sandbox); return sandbox.module.K; };
  const run = async (source, next) => {
    const calls = [];
    const e = {safeGet: async (path, {parameters: {query}}) => { calls.push(query.cursor); return next(query.cursor, calls.length); }};
    const items = await load(source)(e, {signal: {throwIfAborted() {}}, stop() {}});
    return {items: [...items], calls};
  };
  const pages = {undefined: ['a', 'c1'], c1: ['b', 'c2'], c2: ['c', null]};
  const listing = cursor => ({items: pages[cursor].slice(0, -1).map(page_id => ({page_id})), next_cursor: pages[cursor].at(-1)});
  assert.deepEqual(await run(patched, listing), await run(libraryTrash, listing), 'a normal listing is unchanged');
  assert.deepEqual(await run(patched, listing), {items: ['a', 'b', 'c'], calls: [undefined, 'c1', 'c2']});
  const repeated = await run(patched, (cursor, n) => ({items: [{page_id: `p${n}`}], next_cursor: 'again'}));
  assert.deepEqual(repeated, {items: ['p1', 'p2'], calls: [undefined, 'again']});
  const stockRepeated = await run(libraryTrash, (cursor, n) => { if (n > 500) throw new Error('still paging'); return {items: [], next_cursor: 'again'}; }).catch(e => e.message);
  assert.equal(stockRepeated, 'still paging');
  const endless = await run(patched, (cursor, n) => ({items: [{page_id: `p${n}`}], next_cursor: `c${n}`}));
  assert.equal(endless.calls.length, 200); assert.equal(endless.items.length, 200);
});

test('identical MCP inventory requests share one result across priorities and for 2 s after it arrives', async () => {
  const shared = 'export function Oan(e,t,n,r,i){let a={...r,priority:r?.priority??(n.threadId==null?`background`:`interactive`)},o=JSON.stringify({options:a,params:n}),s=t.get(o);' +
    'if(s&&r?.coalesce!==!1)return s;let c=Date.now(),l=e.sendRequest(`mcpServerStatus/list`,n,a).then(e=>(i?.(e,c),e));return t.set(o,l),l.finally(()=>{t.get(o)===l&&t.delete(o)})}';
  const {shared: patched, applied} = adapt({shared});
  assert.equal(applied.sharedMcpInventory, 'shared');
  const timers = [];
  const run = source => {
    const sandbox = {Date, JSON, setTimeout: f => timers.push(f)};
    vm.runInNewContext(source.replace('export ', '') + ';this.Oan=Oan;', sandbox);
    let sent = 0, fail = false;
    const client = {sendRequest: () => { sent++; return fail ? Promise.reject(Error('down')) : Promise.resolve({data: []}); }};
    const cache = new Map();
    return {list: (params, options) => sandbox.Oan(client, cache, params, options), get sent() { return sent; }, fail(v) { fail = v; }};
  };
  const all = {cursor: null, detail: 'toolsAndAuthOnly', limit: 100};
  const stock = run(shared);
  await Promise.all([stock.list(all, {priority: 'interactive'}), stock.list(all)]);
  await stock.list(all);
  assert.equal(stock.sent, 3, 'stock: different priorities and back-to-back requests each start the servers');
  const live = run(patched);
  await Promise.all([live.list(all, {priority: 'interactive'}), live.list(all)]);
  await live.list(all);
  assert.equal(live.sent, 1, 'one request serves both priorities and a request right after it');
  await live.list(all, {coalesce: false});
  assert.equal(live.sent, 2, 'a caller asking for a fresh result still gets one');
  for (const f of timers.splice(0)) f();
  await live.list(all);
  assert.equal(live.sent, 3, 'after 2 s the inventory is requested again');
  for (const f of timers.splice(0)) f();
  live.fail(true);
  await assert.rejects(live.list(all));
  live.fail(false);
  await live.list(all);
  assert.equal(live.sent, 5, 'a failed request is not reused');
  await live.list({...all, threadId: 't'});
  for (const f of timers.splice(0)) f(); // released at once (zero delay)
  await live.list({...all, threadId: 't'});
  assert.equal(live.sent, 7, 'thread-scoped requests are not kept after they finish');
});
