// Behaviour tests for the plugin lane's MCP inventory edits: each runs a
// minimal fixture of the vendor shape, stock and patched, in a VM sandbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adapt} from './startup-harness.mjs';

// The initial bundle's window-message handler: on `codex-app-server-initialized`
// it invalidates the host's MCP status queries through ml, which (with
// cancelRefetch false) also invalidates each query that is still fetching a
// second time once that fetch ends. The fixture's ml records that second pass
// as a deferred refetch whenever the inventory is fetching.
const initial = 'let cd=[`mcp`,`servers`,`status`],f={invalidateQueries:(t,n)=>(globalThis.log.push([`invalidate`,t.queryKey.join(`/`),n?.cancelRefetch]),Promise.resolve())};' +
  'function ml(e,t,n){globalThis.log.push([`ml`,t.queryKey.join(`/`),n.cancelRefetch]);globalThis.inventoryFetching&&globalThis.deferredRefetches++;return e.invalidateQueries(t,n)}' +
  'async function p(e){bb460:switch(e.type){case`window-fullscreen-changed`:break bb460;' +
  'case`codex-app-server-initialized`:e.hostId===`local`&&f.invalidateQueries({queryKey:[`gateway-oauth`]}),ml(f,{queryKey:[...cd,e.hostId]},{cancelRefetch:!1}),' +
  'f.invalidateQueries({queryKey:[`gh-pr-search`]});break bb460;case`codex-app-server-connection-changed`:break bb460}}' +
  'module.p=p;';

function sandbox(source) {
  const context = {module: {}, log: [], inventoryFetching: false, deferredRefetches: 0, Promise, JSON, Map};
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context;
}
const init = (overrides = {}) => ({type: 'codex-app-server-initialized', hostId: 'local', transport: 'stdio', appServerVersion: '0.146.0', installedCodexVersion: null, ...overrides});

// Startup: the window's first `ready` gets a snapshot before the inventory is
// requested; the second `ready` gets the same snapshot while it is in flight.
async function startup(c) {
  await c.module.p(init({isSnapshot: true}));
  c.inventoryFetching = true;
  await c.module.p(init({isSnapshot: true}));
  c.inventoryFetching = false;
}

test('repeatInitSnapshotNoRefetch: a repeated initialization snapshot does not refetch the in-flight MCP inventory', async () => {
  const {initial: patched, applied} = adapt({initial});
  assert.equal(applied.repeatInitSnapshotNoRefetch, 'initial');

  const stock = sandbox(initial);
  await startup(stock);
  assert.equal(stock.deferredRefetches, 1, 'stock: the inventory is fetched again after the first fetch');

  const s = sandbox(patched);
  await startup(s);
  assert.equal(s.deferredRefetches, 0, 'patched: no second inventory fetch');
  // Everything else in the case still runs, and the repeat still invalidates the same queries without cancelling fetches.
  assert.deepEqual(JSON.parse(JSON.stringify(s.log)), [
    ['invalidate', 'gateway-oauth', null], ['ml', 'mcp/servers/status/local', false], ['invalidate', 'mcp/servers/status/local', false], ['invalidate', 'gh-pr-search', null],
    ['invalidate', 'gateway-oauth', null], ['invalidate', 'mcp/servers/status/local', false], ['invalidate', 'gh-pr-search', null],
  ]);
});

test('repeatInitSnapshotNoRefetch: real initializations, new values and other hosts behave as before', async () => {
  const {initial: patched} = adapt({initial});
  const s = sandbox(patched);
  await s.module.p(init({isSnapshot: true}));
  s.inventoryFetching = true;
  // A real initialization (app-server restarted) is never treated as a repeat.
  await s.module.p(init());
  assert.equal(s.deferredRefetches, 1);
  // A snapshot with a different app-server version after it.
  await s.module.p(init({isSnapshot: true, appServerVersion: '0.147.0'}));
  assert.equal(s.deferredRefetches, 2);
  // The first snapshot for another host.
  await s.module.p(init({isSnapshot: true, hostId: 'remote-1', transport: 'websocket'}));
  assert.equal(s.deferredRefetches, 3);
  // The same snapshot again for each: now a repeat.
  await s.module.p(init({isSnapshot: true, appServerVersion: '0.147.0'}));
  await s.module.p(init({isSnapshot: true, hostId: 'remote-1', transport: 'websocket'}));
  assert.equal(s.deferredRefetches, 3);
  // A message that cannot be read falls back to the original call.
  const odd = init({isSnapshot: true});
  Object.defineProperty(odd, 'transport', {get() { throw Error('unreadable'); }});
  await s.module.p(odd);
  assert.equal(s.deferredRefetches, 4);
});
