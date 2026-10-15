// Behaviour tests for the keepalive lane's startup edits: each runs a minimal
// fixture of the vendor shape, stock and patched, in a VM sandbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adapt} from './startup-harness.mjs';

// The retained-page outlet (app-primary): it reads the Statsig dynamic config
// 3646412386, parses it with a schema whose fields fall back to defaults, and
// hands enabled / max_pages / ttl_seconds to the retained-page stack.
const schema = 'var Bgt,Rgt;function Igt(){return Bgt=ys({enabled:oo().catch(!1),max_pages:mn().int().positive().catch(5),ttl_seconds:mn().positive().optional().catch(void 0)})}';
const outlet = 'function Lgt(e){let t=(0,Rgt.c)(4),{routes:n}=e,{value:s}=Eo(`3646412386`),c;t[0]===s?c=t[1]:(c=Bgt.parse(s),t[0]=s,t[1]=c);let l=c;' +
  'return{enabled:l.enabled,retainConversations:l.enabled,maxPages:l.max_pages,ttlSeconds:l.ttl_seconds,routes:n}}';
const primary = `${schema}${outlet}export{Lgt as age,Igt as init};`;

function run(source, config) {
  // A schema stub with the vendor's fallbacks: missing or invalid fields take their defaults.
  const ys = shape => ({parse: value => Object.fromEntries(Object.entries(shape).map(([key, fallback]) => [key, value?.[key] ?? fallback]))});
  const sandbox = {module: {}, Object, ys, oo: () => ({catch: v => v}), mn: () => ({int: () => ({positive: () => ({catch: v => v})}), positive: () => ({optional: () => ({catch: v => v})})}),
    Eo: id => ({value: id === '3646412386' ? config : undefined}), Rgt: {c: n => new Array(n).fill(Symbol.for('react.memo_cache_sentinel'))}};
  vm.runInNewContext(source.replace(/export\{Lgt as age,Igt as init\};$/, 'module.Lgt=Lgt;module.init=Igt;'), sandbox);
  sandbox.module.init();
  return sandbox.module.Lgt({routes: 'r'});
}

test('retained thread views: development builds turn the retained-page outlet on with 4 pages', () => {
  const {primary: patched, applied} = adapt({primary});
  assert.equal(applied.retainRecentThreadViews, 'primary');
  // Stock: the experiment's default is off (5 pages, no TTL override).
  assert.deepEqual({...run(primary, {})}, {enabled: false, retainConversations: false, maxPages: 5, ttlSeconds: undefined, routes: 'r'});
  // Patched: on, the visible page plus the 3 most recent others; the config's TTL still applies.
  assert.deepEqual({...run(patched, {})}, {enabled: true, retainConversations: true, maxPages: 4, ttlSeconds: undefined, routes: 'r'});
  assert.deepEqual({...run(patched, {enabled: false, max_pages: 9, ttl_seconds: 120})}, {enabled: true, retainConversations: true, maxPages: 4, ttlSeconds: 120, routes: 'r'});
});

test('retained thread views: release builds and other shapes stay stock', () => {
  const release = adapt({primary, diagnostics: false});
  assert.equal(release.skipped.retainRecentThreadViews, 'development builds only');
  assert.equal(release.primary, undefined, 'release builds leave the chunk as it is');
  // A schema without max_pages (a different config under the same id) is not touched.
  const other = adapt({primary: primary.replace('max_pages:mn().int().positive().catch(5),', '')});
  assert.equal(other.skipped.retainRecentThreadViews, 'expected one match, found 0');
  // The same config read somewhere other than the retained-page outlet is not touched either.
  const elsewhere = adapt({primary: primary.replace('retainConversations:l.enabled,maxPages:l.max_pages,', '')});
  assert.equal(elsewhere.skipped.retainRecentThreadViews, 'expected one match, found 0');
});
