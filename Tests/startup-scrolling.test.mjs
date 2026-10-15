// Behaviour tests for the scrolling lane's startup edits: each runs a minimal
// fixture of the vendor shape, stock and patched, in a VM sandbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adapt} from './startup-harness.mjs';

// ThreadScrollLayout (thread-scroll-layout-*.js), reduced: the flag in useState,
// the scroll handler that notifies listeners and then sets it, and the context
// value memoised on the compiler's cache, as in build 20398.
const layout = 'function L(e){let t=(0,Je.c)(4),O=e.scrollRef,[ke,je]=(0,R.useState)(!1),Le=e.listeners,st=()=>O.current,ct=st,ht;' +
  'ht=e=>{let t=e<=24;re?.(e,t);for(let t of Le)t(e);je(!t)};let Kt;' +
  't[0]!==ct||t[1]!==ke?(Kt={addScrollListener:f=>(Le.add(f),()=>Le.delete(f)),compensateScrollToDistanceFromBottomPx:ht,getScrollElement:ct,' +
  'responseSpacerController:null,isScrolledFromBottom:ke,scrollToBottom:()=>ht(0)},t[0]=ct,t[1]=ke,t[2]=Kt):Kt=t[2];return{context:Kt,onScroll:ht}}' +
  'var Je,R,re;function B(){}export{B as n,L as t};';

// A one-component React stand-in: state slots, the compiler's memo cache, and a
// re-render whenever a state setter changes a value.
function mount(source) {
  const slots = [], cache = new Array(4).fill(Symbol.for('react.memo_cache_sentinel'));
  let index = 0, dirty = false;
  const R = {useState: init => { const i = index++; if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init;
    return [slots[i], value => { if (!Object.is(slots[i], value)) { slots[i] = value; dirty = true; } }]; }};
  const sandbox = {module: {}, Je: {c: () => cache}, R};
  vm.runInNewContext(source.replace(/export\{B as n,L as t\};$/, 'module.L=L;'), sandbox);
  const props = {scrollRef: {current: null}, listeners: new Set()};
  const state = {renders: 0, contexts: new Set(), seen: []};
  const render = () => { index = 0; dirty = false; state.renders++; state.current = sandbox.module.L(props); state.contexts.add(state.current.context); };
  render();
  // A consumer's scroll listener records what the context says while it runs.
  props.listeners.add(() => state.seen.push(state.current.context.isScrolledFromBottom));
  state.scroll = distance => { state.current.onScroll(distance); if (dirty) render(); };
  state.attach = element => { props.scrollRef.current = element; };
  return state;
}

test('stable scroll context: crossing 24 px keeps the context object once consumers have the scroll element', () => {
  const {threadScrollLayout: patched, applied} = adapt({threadScrollLayout: layout});
  assert.equal(applied.stableScrollContext, 'threadScrollLayout');

  // Stock: every crossing re-renders the layout with a new context object; the
  // listeners still see the old value while they run.
  const stock = mount(layout);
  stock.attach({});
  for (const d of [10, 30, 200, 20, 50, 0]) stock.scroll(d);
  assert.equal(stock.contexts.size, 5);
  assert.equal(stock.renders, 5);
  assert.deepEqual(stock.seen, [false, false, true, true, false, true]);
  assert.equal(stock.current.context.isScrolledFromBottom, false);

  // Patched: the element is attached and read before scrolling, so no crossing
  // needs a new context: no re-render, one context object, and the flag is
  // current when the listeners run.
  const s = mount(patched);
  s.attach({});
  const element = s.current.context.getScrollElement();
  for (const d of [10, 30, 200, 20, 50, 0]) {
    s.scroll(d);
    assert.equal(s.current.context.isScrolledFromBottom, d > 24);
  }
  assert.equal(s.renders, 1);
  assert.equal(s.contexts.size, 1);
  assert.deepEqual(s.seen, [false, true, true, false, true, false]);
  assert.equal(s.current.context.getScrollElement(), element);
});

test('stable scroll context: a consumer that found no element still gets a new context at the next crossing', () => {
  const {threadScrollLayout: patched} = adapt({threadScrollLayout: layout});
  const s = mount(patched);
  const get = s.current.context.getScrollElement;
  // A layout effect that ran before the scroll element's ref was attached.
  assert.equal(get(), null);
  s.attach({});
  s.scroll(10);
  assert.equal(s.contexts.size, 1, 'no crossing yet');
  s.scroll(30);
  assert.equal(s.contexts.size, 2, 'the first crossing makes a new context, as stock does');
  assert.equal(s.current.context.isScrolledFromBottom, true);
  assert.equal(s.current.context.getScrollElement, get, 'getScrollElement keeps its identity');
  s.current.context.getScrollElement();
  s.scroll(0);
  s.scroll(40);
  assert.equal(s.contexts.size, 2, 'later crossings keep it');
  // A different element than consumers saw before also counts.
  s.attach({});
  s.current.context.getScrollElement();
  s.scroll(0);
  assert.equal(s.contexts.size, 3);
  assert.equal(s.current.context.isScrolledFromBottom, false);
});

test('stable scroll context: other shapes stay stock', () => {
  // The flag read elsewhere in the component (not only by the memo cache).
  const other = adapt({threadScrollLayout: layout.replace('let Kt;', 'let Kt;ke&&re?.();')});
  assert.equal(other.skipped.stableScrollContext, 'expected one match, found 0');
  assert.equal(other.threadScrollLayout, undefined);
  // A different initial state.
  assert.equal(adapt({threadScrollLayout: layout.replace('(0,R.useState)(!1)', '(0,R.useState)(0)')}).skipped.stableScrollContext, 'expected one match, found 0');
  // The flag set somewhere other than the scroll handler.
  assert.equal(adapt({threadScrollLayout: layout.replace('return{context:Kt', 'je(!1);return{context:Kt')}).skipped.stableScrollContext, 'expected one match, found 0');
  assert.equal(adapt({}).skipped.stableScrollContext, 'module not found');
});
