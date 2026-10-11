import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../Sources/CodexPPCore/Resources/renderer-runtime.js', import.meta.url), 'utf8');
function context() {
  const nodes = [], events = new Set();
  const sandbox = vm.createContext({
    console,
    document: {
      head: { append: node => nodes.push(node) },
      createElement: () => ({ dataset: {}, remove() { nodes.splice(nodes.indexOf(this), 1); } })
    },
    target: { addEventListener: (_, handler) => events.add(handler), removeEventListener: (_, handler) => events.delete(handler) },
    executions: 0, nodes, events
  });
  vm.runInContext(source, sandbox);
  return sandbox;
}
const extension = (ctx, code, id = 'example') => ({
  id, fingerprint:code,
  start:vm.runInContext(`(async function(api){"use strict";\n${code}\n})`, ctx)
});

test('loads once, cleans styles and event handlers when disabled', async () => {
  const ctx = context();
  const desired = [extension(ctx, `globalThis.executions++; api.addStyle('body {}'); api.on(target, 'click', () => {});`)];
  await ctx.__codexPP.sync(desired);
  await ctx.__codexPP.sync(desired);
  assert.equal(ctx.executions, 1);
  assert.equal(ctx.nodes.length, 1); assert.equal(ctx.events.size, 1);
  await ctx.__codexPP.sync([]);
  assert.equal(ctx.nodes.length, 0); assert.equal(ctx.events.size, 0);
});
test('changed code cleans the prior version before starting the next', async () => {
  const ctx = context();
  await ctx.__codexPP.sync([extension(ctx, `api.addStyle('old'); return () => { globalThis.executions += 10; };`)]);
  await ctx.__codexPP.sync([extension(ctx, `globalThis.executions++; api.addStyle('new');`)]);
  assert.equal(ctx.executions, 11);
  assert.equal(ctx.nodes.length, 1); assert.equal(ctx.nodes[0].textContent, 'new');
});
test('an extension error does not prevent another from loading or retry each poll', async () => {
  const ctx = context();
  const desired = [extension(ctx, `globalThis.executions++; api.addStyle('bad'); throw new Error('broken');`), extension(ctx, `api.addStyle('good');`, 'good')];
  const status = await ctx.__codexPP.sync(desired);
  assert.match(status.find(row => row.id === 'example').error, /broken/);
  assert.equal(status.find(row => row.id === 'good').state, 'active');
  await ctx.__codexPP.sync(desired);
  assert.equal(ctx.executions, 1); assert.equal(ctx.nodes.length, 1);
  await ctx.__codexPP.sync([]);
  await ctx.__codexPP.sync(desired);
  assert.equal(ctx.executions, 2);
});
test('cleanup failures demand restart and never create a duplicate instance', async () => {
  const ctx = context();
  await ctx.__codexPP.sync([extension(ctx, `globalThis.executions++; api.onCleanup(() => { throw new Error('cannot clean'); });`)]);
  const stopped = await ctx.__codexPP.sync([]);
  assert.match(stopped[0].error, /restart ChatGPT/);
  await ctx.__codexPP.sync([extension(ctx, `globalThis.executions += 100;`)]);
  assert.equal(ctx.executions, 1);
});
test('concurrent updates are serialized around async initialization', async () => {
  const ctx = context();
  const code = `globalThis.executions++; return Promise.resolve(() => { globalThis.executions += 10; });`;
  await Promise.all([ctx.__codexPP.sync([extension(ctx, code)]), ctx.__codexPP.sync([])]);
  assert.equal(ctx.executions, 11);
});

test('shell capabilities arriving after injection resolve startup without a stale null', async () => {
  const ctx = context();
  ctx.setTimeout = setTimeout;
  const loading = ctx.__codexPP.sync([extension(ctx, `return api.waitForShell().then(shell => {
    globalThis.readyShell = shell === api.shell && shell.protocol === 1;
  });`)]);
  setTimeout(() => { ctx.__codexPPShell = Object.freeze({protocol:1}); }, 10);
  const states = await loading;
  assert.equal(ctx.readyShell, true);
  assert.equal(states[0].state, 'active');
});

test('missing or incompatible shell capabilities fail after a bounded wait', async () => {
  for (const shell of [undefined, {protocol:2}]) {
    const ctx = context();
    let attempts = 0;
    ctx.__codexPPShell = shell;
    ctx.setTimeout = fn => { attempts++; queueMicrotask(fn); };
    const states = await ctx.__codexPP.sync([extension(ctx, 'return api.waitForShell();'), extension(ctx, 'globalThis.executions++;', 'other')]);
    assert.equal(states[0].state, 'error');
    assert.match(states[0].error, /shell v1 is unavailable/);
    assert.equal(attempts, 99);
    assert.equal(states[1].state, 'active');
  }
});

test('prepared extension functions run without renderer eval', async () => {
  const ctx = context();
  const loading = ctx.__codexPP.sync([
    extension(ctx, 'return new Promise(resolve => { globalThis.releaseNativeAck = resolve; });', 'native'),
    extension(ctx, 'globalThis.executions++;', 'later')
  ]);
  await Promise.resolve();
  ctx.releaseNativeAck();
  const states = await loading;
  assert.equal(ctx.executions, 1);
  assert.equal(states[1].state, 'active');
});
