// Behaviour tests for the space lane's startup edits, on minimal fixtures of
// the vendor code shapes they match (the Page editor, the Space sidebar search
// and the Library masonry grid).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { adapt } from './startup-harness.mjs';

// Values made in a vm context (other realm), as plain data.
const plain = value => JSON.parse(JSON.stringify(value));

// ---- commentHighlightsMapped -------------------------------------------------
// The Page editor's comment highlights, reduced: a decoration set (Rl) with
// ProseMirror's mapping rules, the plugin key, the app's "plain text in one
// paragraph" test (HM, verbatim), the decoration plugin (OO), the resolver (DO,
// verbatim shape; AO resolves a target from `truth`, standing in for the Yjs
// relative positions), the rebuild (kO) and the layout effect (ZN).
const commentFixture = [
  'var rebuilds=0,resolves=0,truth=new Map;',
  'class xn{constructor(f,t,s){this.from=f;this.to=t;this.slice=s}}',
  'class Rl{constructor(d){this.decos=d}find(){return this.decos.slice()}map(m){return this===Rl.empty?this:new Rl(this.decos.map(d=>({...d,from:m.map(d.from,d.spec.highlight?-1:1),to:m.map(d.to,-1)})))}}',
  'Rl.empty=new Rl([]);',
  'class yc{constructor(n){this.name=n}getState(s){return s.plugin}}',
  'class al{constructor(s){this.spec=s}}',
  'var MO;function NO(){MO=new yc(`spacePageCommentDecorations`)}NO();',
  'function Bf(e){return e.messages.some(e=>e.deletedAt==null)}',
  'function nv(e){return{order:{toArray:()=>e.ids.slice()}}}',
  'function t_(e,t,n){return e.paras.map((t,n)=>({from:e.starts[n],node:t}))}',
  'function AO(e,t,n,r,i){resolves++;return truth.get(r.id)??null}',
  'function HM(e,t){return e.steps.every((n,r)=>{if(!(n instanceof xn)||n.slice.openStart!==0||n.slice.openEnd!==0||!n.slice.content.content.every(e=>e.isText))return!1;let i=e.docs[r],a=i.resolve(n.from),o=i.resolve(n.to);if(!a.parent.isTextblock||!a.sameParent(o)||t?.(a.parent)===!1)return!1;let s=!0;return a.parent.nodesBetween(a.parentOffset,o.parentOffset,e=>(s&&=e.isText,!1)),s})}',
  'function DO(e,t,n,r){let i=new Map,a=r[0];if(a==null)return i;if(r.every(e=>e===a))return i.set(a,AO(e,t,n,a));let o=nv(t).order.toArray(),s={ids:o,indexes:new Map(o.map((e,t)=>[e,t])),anchors:t_(e.state.doc,n,o.length),textPositions:new Map};for(let a of r)i.has(a)||i.set(a,AO(e,t,n,a,s));return i}',
  'function OO({document:e}){return new al({key:MO,state:{init:()=>Rl.empty,apply(e,t){let n=e.getMeta(MO);return n instanceof Rl?n:e.docChanged?t.map(e.mapping,e.doc):t}},props:{}})}',
  'function kO(e,t,n,r,i=new Map){rebuilds++;let c=r.filter(e=>e.state===`open`&&Bf(e)).map(e=>({id:e.id,target:e.target}));for(let[e,t]of i)c.push({id:e,target:t});' +
    'let l=DO(e,t,n,c.map(e=>e.target)),o=[],s=[];for(let t of c){let n=l.get(t.target);if(n!=null&&n.from<n.to){s.push({from:n.from,to:n.to,spec:{commentThreadId:t.id}});' +
    'let a={key:`${t.id}:0`,className:`page-comment-highlight`};o.push(a);s.push({from:n.from,to:n.from,spec:{key:a.key,highlight:a}})}}' +
    'return s.length===0&&(MO.getState(e.state)?.find().length??0)===0?[]:(e.dispatch(e.state.tr.setMeta(MO,new Rl(s))),o)}',
  'function ZN(o,i,s,p,a,f){let _=()=>{f(kO(o,i,s,p,a))};return _}',
].join('\n');

// A document of paragraphs (plain text); positions as in ProseMirror (each paragraph opens and closes).
function makeDoc(paras) {
  const starts = []; let pos = 0;
  const nodes = paras.map(text => {
    starts.push(pos); pos += text.length + 2;
    return { text, isTextblock: true, content: { size: text.length }, textBetween: (a, b) => text.slice(a, b),
      forEach: f => { if (text.length) f({ isText: true, isLeaf: true }); }, nodesBetween: (a, b, f) => { f({ isText: true }); } };
  });
  const doc = { paras: nodes, starts, texts: paras, size: pos,
    resolve(at) {
      const k = starts.findLastIndex(s => s < at || (s === at && false)), start = starts[k] + 1;
      if (k < 0 || at > start + nodes[k].text.length) throw new RangeError(`position ${at}`);
      return { pos: at, depth: 1, parent: nodes[k], parentOffset: at - start, start: () => start, before: () => starts[k], after: () => starts[k] + nodes[k].text.length + 2,
        sameParent(o) { return o.parent === this.parent; } };
    } };
  return doc;
}
function harness(source) {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${source};this.api={OO,ZN,xn,Rl,MO,stats:()=>({rebuilds,resolves}),truth}`, sandbox);
  const api = sandbox.api, plugin = api.OO({}).spec.state;
  class Tr {
    constructor(state) { this.state = state; this.steps = []; this.docs = []; this.doc = state.doc; this.docChanged = false; this.meta = {}; this.mapping = { map: p => p }; }
    setMeta(k, v) { this.meta[typeof k === 'string' ? k : k.name] = v; return this; }
    getMeta(k) { return this.meta[typeof k === 'string' ? k : k.name]; }
  }
  const view = { dispatch(tr) { this.state = { doc: tr.doc, plugin: plugin.apply(tr, this.state.plugin), get tr() { return new Tr(this); } }; } };
  view.state = { doc: makeDoc(['hello world, this is page text', 'second paragraph with words']), plugin: plugin.init(), get tr() { return new Tr(this); } };
  // Replaces from..to with text inside one paragraph (one ReplaceStep of plain text).
  const edit = (from, to, text, meta = {}) => {
    const before = view.state.doc, $from = before.resolve(from), k = before.paras.indexOf($from.parent), off = $from.parentOffset;
    const paras = before.texts.slice(); paras[k] = paras[k].slice(0, off) + text + paras[k].slice(off + (to - from));
    const tr = new Tr(view.state), delta = text.length - (to - from);
    tr.steps = [new api.xn(from, to, { openStart: 0, openEnd: 0, size: text.length, content: { content: [{ isText: true }], size: text.length, textBetween: () => text } })];
    tr.docs = [before]; tr.doc = makeDoc(paras); tr.docChanged = true;
    tr.mapping = { map: (p, assoc = 1) => p < from || (p === from && assoc < 0 && to === from) ? p : p > to || (p === to && to > from) || p === from ? p + delta : from };
    Object.assign(tr.meta, meta);
    view.dispatch(tr);
  };
  return { api, view, edit, document: { ids: ['b0', 'b1'] }, pmu: {} };
}
const thread = (id, block) => ({ id, state: 'open', messages: [{ deletedAt: null }], target: { kind: 'selection', id, anchor: { blockId: block }, head: { blockId: block } } });

test('comment highlights are kept through plain typing away from their edges, and rebuilt otherwise', () => {
  const { pageContent: patched, applied } = adapt({ pageContent: commentFixture });
  assert.equal(applied.commentHighlightsMapped, 'pageContent');
  const { api, view, edit, document, pmu } = harness(patched);
  const threads = [thread('t1', 'b0'), thread('t2', 'b1')], drafts = new Map(), results = [];
  // t1 covers "world" in the first paragraph (6..11 in it, 7..12 in the document); t2 "paragraph" in the second.
  api.truth.set('t1', { from: 7, to: 12 }); api.truth.set('t2', { from: 41, to: 50 });
  const effect = api.ZN(view, document, pmu, threads, drafts, value => results.push(value));
  const run = () => { effect(); return plain(api.stats()); };
  assert.deepEqual(run(), { rebuilds: 1, resolves: 2 });
  const built = results.at(-1);
  assert.equal(built.length, 2);

  // Typing inside the first paragraph before t1: the mapped set is kept; the threads of that block and of the
  // block after it are resolved again (two).
  edit(3, 3, 'X'); api.truth.set('t1', { from: 8, to: 13 }); api.truth.set('t2', { from: 42, to: 51 });
  assert.deepEqual(run(), { rebuilds: 1, resolves: 4 });
  assert.equal(typeof results.at(-1), 'function');
  assert.deepEqual(plain(results.at(-1)(built)), plain(built));
  assert.notEqual(results.at(-1)(built), built);
  assert.deepEqual(plain(api.MO.getState(view.state).find().filter(d => !d.spec.highlight).map(d => [d.from, d.to])), [[8, 13], [42, 51]]);
  // Typing in the second (last) paragraph: only t2 is resolved again.
  edit(55, 55, 'Y'); api.truth.set('t2', { from: 42, to: 51 });
  assert.deepEqual(run(), { rebuilds: 1, resolves: 5 });

  // At a highlight's edge (the end of "world"): rebuilt.
  edit(13, 13, 'Z'); api.truth.set('t1', { from: 8, to: 13 }); api.truth.set('t2', { from: 43, to: 52 });
  assert.equal(run().rebuilds, 2);
  // Strictly inside, but the same text could have gone after the range's last character ("worl|d" + "d"): rebuilt.
  edit(12, 12, 'd'); api.truth.set('t2', { from: 44, to: 53 });
  assert.equal(run().rebuilds, 3);
  // Plain typing inside the range ("wor|ld" + "x"): kept.
  edit(11, 11, 'x'); api.truth.set('t1', { from: 8, to: 14 }); api.truth.set('t2', { from: 45, to: 54 });
  assert.equal(run().rebuilds, 3);
  // The shared document resolves a range differently than the mapping (its markdown changed): rebuilt.
  edit(22, 22, '*'); api.truth.set('t1', { from: 8, to: 12 }); api.truth.set('t2', { from: 46, to: 55 });
  assert.equal(run().rebuilds, 4);
  assert.deepEqual(plain(api.MO.getState(view.state).find().filter(d => !d.spec.highlight).map(d => [d.from, d.to])), [[8, 12], [46, 55]]);
  // A projection of the shared document (a remote revision): rebuilt.
  edit(30, 30, 'r', { spacePageEditorProjection: true }); api.truth.set('t2', { from: 47, to: 56 });
  assert.equal(run().rebuilds, 5);
  // A new thread list: rebuilt; then plain typing with the same inputs: kept.
  const effect2 = api.ZN(view, document, pmu, threads.slice(), drafts, value => results.push(value));
  edit(2, 2, 'q'); api.truth.set('t1', { from: 9, to: 13 }); api.truth.set('t2', { from: 48, to: 57 });
  effect2();
  assert.equal(api.stats().rebuilds, 6);
  edit(2, 2, 'q'); api.truth.set('t1', { from: 10, to: 14 }); api.truth.set('t2', { from: 49, to: 58 });
  effect2();
  assert.equal(api.stats().rebuilds, 6);
  assert.deepEqual(plain(api.MO.getState(view.state).find().filter(d => !d.spec.highlight).map(d => [d.from, d.to])), [[10, 14], [49, 58]]);
});

test('comment highlights are rebuilt when a thread starts to resolve after an edit', () => {
  const { pageContent: patched } = adapt({ pageContent: commentFixture });
  const { api, view, edit, document, pmu } = harness(patched);
  const threads = [thread('t1', 'b0'), thread('t2', 'b0')], drafts = new Map();
  api.truth.set('t1', { from: 7, to: 12 });
  const effect = api.ZN(view, document, pmu, threads, drafts, () => {});
  effect();
  assert.equal(api.stats().rebuilds, 1);
  edit(20, 20, 'x'); api.truth.set('t2', { from: 15, to: 18 });
  effect();
  assert.equal(api.stats().rebuilds, 2);
  assert.deepEqual(plain(api.MO.getState(view.state).find().filter(d => !d.spec.highlight).map(d => d.spec.commentThreadId)), ['t1', 't2']);
});

test('commentHighlightsMapped needs every part of the shape', () => {
  const cuts = { 'a.sameParent(o)': 'a.parent===o.parent', 'textPositions:new Map};': 'textPositions:new Set};', '{f(kO(o,i,s,p,a))}': '{f(kO(o,i,s,p))}' };
  for (const [cut, replacement] of Object.entries(cuts)) {
    const source = commentFixture.replace(cut, replacement);
    const { applied, skipped } = adapt({ pageContent: source });
    assert.equal(applied.commentHighlightsMapped, undefined, cut);
    assert.match(skipped.commentHighlightsMapped, /expected one match, found 0/);
  }
});

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

// ---- pageBlockSerializedOnce -------------------------------------------------
// The Page writer's per-block markdown units, reduced: R$ keeps units per node
// object (fresh results, and the canonical units the writer stores, PSo/NSo);
// a fresh serialisation goes through the converter's serialize.
const writerFixture = [
  'var serialized=0,R$=new WeakMap,pmu={serialize:e=>(serialized++,e.kids.map(e=>e.text).join(`\\n\\n`))};',
  'function Vgo(e){return pmu}',
  'function PSo(e,t,n){let r=R$.get(e);r??(r=new WeakMap,R$.set(e,r)),r.set(n,t.slice())}',
  'function P$(e,t=Vgo({isRichTableCellSupportEnabled:!e.type.schema.nodes.table_cell.inlineContent})){let n=R$.get(e)?.get(t);if(n!=null)return n.slice();let r=[];' +
    'return e.forEach(n=>{let i=R$.get(n)?.get(t);if(i!=null){r.push(...i);return}let a=e.type.createChecked(e.attrs,[n]),o=t.serialize(a),' +
    'd=o.split(`\\n\\n`).map(e=>({kind:`markdown`,markdown:e}));let m=R$.get(n);m??(m=new WeakMap,R$.set(n,m)),m.set(t,d),r.push(...d)}),PSo(e,r,t),r}',
].join('\n');
test('a fresh copy of a block the writer serialised before reuses that serialisation', () => {
  const { initial: patched, applied } = adapt({ initial: writerFixture });
  assert.equal(applied.pageBlockSerializedOnce, 'initial');
  const docType = { createChecked: (attrs, kids) => ({ kids }) };
  const wrap = node => ({ type: docType, attrs: {}, forEach: f => f(node) });
  const listType = { name: 'list' }, content = { id: 'fragment' }, mark = { name: 'm' };
  const block = (attrs = { spread: false }, marks = []) => ({ type: listType, attrs, marks, content, text: '- one\n- two' });
  const out = {};
  for (const [name, source] of [['stock', writerFixture], ['patched', patched]]) {
    const sandbox = {}; vm.runInNewContext(`${source};this.P$=P$;this.R$=R$;this.pmu=pmu;this.count=()=>serialized`, sandbox);
    const after = block(), copy = block({ spread: false }), other = block({ spread: true }), marked = block({ spread: false }, [mark]);
    const results = [sandbox.P$(wrap(after), sandbox.pmu), sandbox.P$(wrap(copy), sandbox.pmu), sandbox.P$(wrap(other), sandbox.pmu), sandbox.P$(wrap(marked), sandbox.pmu)];
    // The writer stores canonical units for the node; a fresh copy still gets the fresh serialisation.
    sandbox.R$.get(after).set(sandbox.pmu, [{ kind: 'markdown', markdown: 'canonical' }]);
    results.push(sandbox.P$(wrap(after), sandbox.pmu), sandbox.P$(wrap(block()), sandbox.pmu));
    out[name] = { results: plain(results), serialized: sandbox.count() };
  }
  assert.deepEqual(out.patched.results, out.stock.results);
  assert.equal(out.stock.results[4][0].markdown, 'canonical');
  assert.equal(out.stock.results[5][0].markdown, '- one\n- two');
  assert.equal(out.stock.serialized, 5);
  assert.equal(out.patched.serialized, 3); // after, other (attributes differ), marked (marks differ)
});
test('pageBlockSerializedOnce leaves other shapes alone', () => {
  const source = writerFixture.replace('if(i!=null){r.push(...i);return}', 'if(i!=null){r.push(...i.slice());return}');
  const { applied, skipped } = adapt({ initial: source });
  assert.equal(applied.pageBlockSerializedOnce, undefined);
  assert.match(skipped.pageBlockSerializedOnce, /expected one match, found 0/);
});
