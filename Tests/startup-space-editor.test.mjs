// Behaviour tests for the space lane's startup edits, on minimal fixtures of
// the vendor code shapes they match (the Page editor, the Space sidebar search
// and the Library masonry grid).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { adapt } from './startup-harness.mjs';

// Values made in a vm context (other realm), as plain data.
const plain = value => JSON.parse(JSON.stringify(value));

// ---- calloutFilterSkipsText --------------------------------------------------
const calloutFixture = [
  'class al{constructor(s){this.spec=s}}',
  'function dJ(){return new al({filterTransaction(e,t){if(!e.docChanged||e.getMeta(`spacePageEditorProjection`))return!0;let n=e.mapping,r=!0;' +
    'return e.doc.descendants((i,a)=>{if(!r)return!1;if(i.type.name!==`callout`)return;let o=i.depth;if(o===0)return;return r=i.ok,r}),r}})}',
].join('\n');
function tree(spec) {
  // spec: [name, {inline, leaf, ok, depth}, children]
  const make = ([name, attrs = {}, children = []]) => ({ type: { name }, inlineContent: !!attrs.inline, isLeaf: !!attrs.leaf, ok: attrs.ok ?? true, depth: attrs.depth ?? 1, children: children.map(make) });
  const root = make(spec);
  let visits = 0;
  root.descendants = f => { const walk = n => { for (const c of n.children) { visits++; if (f(c, 0) !== false) walk(c); } }; walk(root); };
  return { root, visits: () => visits };
}
const page = (ok) => ['doc', {}, [
  ['paragraph', { inline: true }, [['text', { leaf: true }], ['text', { leaf: true }], ['image', { leaf: true }]]],
  ['callout', { depth: 0 }, [['paragraph', { inline: true }, [['text', { leaf: true }]]], ['callout', { depth: 1, ok }, [['paragraph', { inline: true }, [['text', { leaf: true }]]]]]]],
  ['list', {}, [['item', {}, [['paragraph', { inline: true }, [['text', { leaf: true }]]], ['callout', { depth: 1, ok }, []]]]]],
  ['code_block', { inline: true }, [['text', { leaf: true }]]],
]];
test('the callout filter does not walk into paragraphs and text, with the same answer', () => {
  const { pageContent: patched, applied } = adapt({ pageContent: calloutFixture });
  assert.equal(applied.calloutFilterSkipsText, 'pageContent');
  for (const ok of [true, false]) {
    const out = {};
    for (const [name, source] of [['stock', calloutFixture], ['patched', patched]]) {
      const sandbox = {}; vm.runInNewContext(`${source};this.f=dJ().spec.filterTransaction`, sandbox);
      const { root, visits } = tree(page(ok));
      out[name] = { result: sandbox.f({ docChanged: true, getMeta: () => undefined, doc: root, mapping: {} }, {}), visits: visits() };
    }
    assert.equal(out.patched.result, out.stock.result);
    assert.equal(out.stock.result, ok);
    assert.ok(out.patched.visits < out.stock.visits, JSON.stringify(out));
  }
  // Nested callouts are still found inside blocks without inline content (callout > callout, list > item > callout).
  const sandbox = {}; vm.runInNewContext(`${patched};this.f=dJ().spec.filterTransaction`, sandbox);
  const { root } = tree(['doc', {}, [['list', {}, [['item', {}, [['callout', { depth: 1, ok: false }, []]]]]]]]);
  assert.equal(sandbox.f({ docChanged: true, getMeta: () => undefined, doc: root, mapping: {} }, {}), false);
});

// ---- sidebarSearchScorerOnce -------------------------------------------------
const sidebarFixture = [
  'var compiled=0;function Gr(e){compiled++;let t=e.trim();if(t.length===0)return()=>0;return n=>n.includes(t)?t.length*10-n.length:0}',
  'function Ya(e){return e.trim().replace(/\\s+/gu,` `).toLocaleLowerCase()}',
  'function Ka(e,t,n){let a={title:e.titleValues,location:e.location,preview:e.preview==null?[]:[e.preview]},c=0;for(let e of n){let t;' +
    'for(let n of[`title`,`location`,`preview`]){let r=Gr(e),i=Math.max(0,...a[n].filter(t=>Ya(t).includes(e)).map(e=>r(e)));if(i>0){t={field:n,score:i};break}}if(t==null)return null;c+=t.score}return c}',
  'function Wa(e,t){let n=Ya(t),r=n.split(` `);return e.map(e=>Ka(e,n,r))}',
].join('\n');
test('the sidebar search compiles each query word once and scores the same', () => {
  const { spaceSidebar: patched, applied } = adapt({ spaceSidebar: sidebarFixture });
  assert.equal(applied.sidebarSearchScorerOnce, 'spaceSidebar');
  const pages = Array.from({ length: 50 }, (_, i) => ({ titleValues: [`page ${i} roadmap`], location: [`space ${i % 3}`], preview: i % 2 ? `notes about the project ${i}` : null }));
  const out = {};
  for (const [name, source] of [['stock', sidebarFixture], ['patched', patched]]) {
    const sandbox = {}; vm.runInNewContext(`${source};this.Wa=Wa;this.count=()=>compiled`, sandbox);
    out[name] = { results: [sandbox.Wa(pages, 'road'), sandbox.Wa(pages, 'roadmap project'), sandbox.Wa(pages, 'space 1'), sandbox.Wa(pages, 'nothing')], compiled: sandbox.count() };
  }
  assert.deepEqual(plain(out.patched.results), plain(out.stock.results));
  assert.ok(out.stock.compiled > 300, String(out.stock.compiled));
  assert.equal(out.patched.compiled, 6); // road, roadmap, project, space, 1, nothing
  // Up to 256 words are kept; then the cache starts again.
  const sandbox = {}; vm.runInNewContext(`${patched};this.Wa=Wa;this.count=()=>compiled`, sandbox);
  for (let i = 0; i < 300; i++) sandbox.Wa(pages.slice(0, 1), `w${i}`);
  assert.equal(sandbox.count(), 300);
});

// ---- masonrySteadyObserver, masonryUnchangedPositions ------------------------
// The masonry grid's layout effect, reduced: the same statements around the
// ResizeObserver and the animated position map.
const masonryFixture = [
  'function x(e){let{items:n,animate:i,ref:a,setPositions:c}=e;let d=()=>{let e=a.current;if(!e)return;let t=n.map(T),r=new Map(e.children.map(w)),o=t.flatMap(e=>{let t=r.get(e);return t==null?[]:[t]}),' +
    's=()=>{let n=e.clientWidth;if(n===0)return;let h=t.map((e,n)=>({column:n%2,top:t.slice(0,n).filter((e,k)=>k%2===n%2).reduce((s,e)=>s+r.get(e).offsetHeight,0)}));' +
    'if(i){c(new Map(t.map((t,n)=>[t,{x:h[n].column*100,y:h[n].top,animate:!1}])));return}for(let[e,t]of o.entries())t.style.transform=`translateY(${h[e].top}px)`},' +
    'l,d=new ResizeObserver(()=>{l!=null&&cancelAnimationFrame(l),l=requestAnimationFrame(s)});d.observe(e);for(let e of o)d.observe(e);return s(),()=>{d.disconnect(),l!=null&&cancelAnimationFrame(l)}};return d}',
  'function T(e){let{id:t}=e;return t}function w(e){return[e.id,e]}',
].join('\n');
function masonryEnv(source) {
  const log = { created: 0, observe: [], unobserve: [], disconnected: 0, frames: [] };
  class ResizeObserver {
    constructor(cb) { log.created++; this.cb = cb; this.targets = new Set(); log.last = this; }
    observe(t) { log.observe.push(t.id); this.targets.add(t); }
    unobserve(t) { log.unobserve.push(t.id); this.targets.delete(t); }
    disconnect() { log.disconnected++; this.targets.clear(); }
  }
  const sandbox = { ResizeObserver, queueMicrotask, requestAnimationFrame: f => (log.frames.push(f), log.frames.length), cancelAnimationFrame: id => { log.frames[id - 1] = null; } };
  vm.runInNewContext(`${source};this.x=x`, sandbox);
  return { sandbox, log };
}
const el = id => ({ id, offsetHeight: 10 + id.length, style: {} });
test('the masonry grid keeps one observer per container and observes only new cards', async () => {
  const { libraryMasonry: patched, applied } = adapt({ libraryMasonry: masonryFixture });
  assert.equal(applied.masonrySteadyObserver, 'libraryMasonry');
  const cards = { a: el('a'), b: el('b'), c: el('c') };
  const container = { id: 'grid', clientWidth: 400, children: [cards.a, cards.b] };
  const ref = { current: container };
  for (const [name, source] of [['stock', masonryFixture], ['patched', patched]]) {
    const { sandbox, log } = masonryEnv(source);
    let cleanup = sandbox.x({ items: [{ id: 'a' }, { id: 'b' }], animate: false, ref })();
    assert.equal(cards.b.style.transform, 'translateY(0px)');
    // A new item list (the same two cards and a third): the effect is torn down and set up again in one commit.
    container.children = [cards.a, cards.b, cards.c];
    cleanup(); cleanup = sandbox.x({ items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], animate: false, ref })();
    assert.equal(cards.c.style.transform, `translateY(${cards.a.offsetHeight}px)`);
    await new Promise(r => setTimeout(r, 0));
    if (name === 'stock') {
      assert.equal(log.created, 2);
      assert.deepEqual(log.observe, ['grid', 'a', 'b', 'grid', 'a', 'b', 'c']);
    } else {
      assert.equal(log.created, 1);
      assert.deepEqual(log.observe, ['grid', 'a', 'b', 'c']);
      assert.equal(log.disconnected, 0);
      // A removed card is unobserved.
      container.children = [cards.a, cards.c];
      cleanup(); cleanup = sandbox.x({ items: [{ id: 'a' }, { id: 'c' }], animate: false, ref })();
      assert.deepEqual(log.unobserve, ['b']);
      // A resize runs the latest layout in the next frame.
      cards.a.offsetHeight = 40; log.last.cb([]);
      log.frames.at(-1)(0);
      assert.equal(cards.c.style.transform, 'translateY(0px)');
      // Torn down without a new setup (unmount): disconnected after the commit; a later mount gets a new observer.
      cleanup();
      await new Promise(r => setTimeout(r, 0));
      assert.equal(log.disconnected, 1);
      cleanup = sandbox.x({ items: [{ id: 'a' }], animate: false, ref })();
      assert.equal(log.created, 2);
    }
  }
});
test('the animated masonry grid keeps unchanged positions and skips an unchanged map', () => {
  const { libraryMasonry: patched, applied } = adapt({ libraryMasonry: masonryFixture });
  assert.equal(applied.masonryUnchangedPositions, 'libraryMasonry');
  const cards = { a: el('a'), b: el('b'), c: el('c') };
  const container = { id: 'grid', clientWidth: 400, children: [cards.a, cards.b, cards.c] };
  const { sandbox } = masonryEnv(patched);
  let state = new Map();
  const setPositions = next => { state = typeof next === 'function' ? next(state) : next; };
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  sandbox.x({ items, animate: true, ref: { current: container }, setPositions })();
  const first = state;
  assert.deepEqual(plain([...first].map(([k, v]) => [k, v.x, v.y])), [['a', 0, 0], ['b', 100, 0], ['c', 0, 11]]);
  // The same layout again: the same map object, so React skips the update.
  sandbox.x({ items, animate: true, ref: { current: container }, setPositions })();
  assert.equal(state, first);
  // One card moves: a new map, with the unchanged positions' objects kept.
  cards.a.offsetHeight = 30;
  sandbox.x({ items, animate: true, ref: { current: container }, setPositions })();
  assert.notEqual(state, first);
  assert.equal(state.get('a'), first.get('a'));
  assert.equal(state.get('b'), first.get('b'));
  assert.notEqual(state.get('c'), first.get('c'));
  assert.equal(state.get('c').y, 30);
  // A different order of the same positions is a new map.
  const before = state;
  sandbox.x({ items: [items[1], items[0], items[2]], animate: true, ref: { current: container }, setPositions })();
  assert.notEqual(state, before);
});
