// Behaviour tests for the streaming lane's startup edits, on minimal fixtures of
// the vendor code shapes they match.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { adapt } from './startup-harness.mjs';

// The markdown renderer (top-level loop, per-token render, React keys), the fade
// data builder and the streaming view, reduced to what the edit matches and reads.
const streamingFixture = [
  'var renders=0,jsx=(type,props,key)=>({type,key,props});',
  'function _6i(e,t,n,r){let i=r?.get(e),a=i==null?`${e.type}-${e.raw}`:`${e.type}-${i}`,o=n.get(a)??0;return n.set(a,o+1),`${t}-${a}-${String(o)}`}',
  'function R6i(e){return Array.isArray(e)?e:[e]}',
  'function g6i(e,t,n){renders++;switch(e.type){case`space`:return null;case`code`:return jsx(n.components.pre,{index:n.nextCodeBlockIndex++,open:n.openCodeFenceToken===e,children:e.text},t);' +
    'case`codexDirective`:return jsx(`directive`,{id:n.nextDirectiveId()},t);' +
    'case`list`:return jsx(`ul`,{children:e.items.map((i,j)=>jsx(`li`,{...n.getListItemDecorationProps?.(i),children:i.tokens.map(x=>n.renderText(x.text,`${t}-${j}`,x,!0))},j))},t);' +
    'default:return jsx(n.components.p,{children:[e.tokens.map((x,j)=>n.renderText(x.text,`${t}-${j}`,x,!0)),n.lastBlockToken===e?n.trailingContent:null]},t)}}',
  'function h6i(e,t){let n=[],r=new Map;for(let i=0;i<e.length;i+=1){let a=e[i],o=_6i(a,`root`,r,t.streamingTokenKeys);n.push(...R6i(g6i(a,o,t)))}return n}',
  'function p6i(e,t){let n=0,r={...t,decorateText:!0,lastBlockToken:e.findLast(x=>x.type!==`space`),nextCodeBlockIndex:0,nextDirectiveId:()=>`d:${n++}`,renderTokens(e){return h6i(e,this)}};return r.renderTokens(e)}',
  'function Root(e){return p6i(e.tokens,{components:e.components,getListItemDecorationProps:e.getListItemDecorationProps,openCodeFenceToken:e.openCodeFenceToken,renderText:e.renderText,streamingTokenKeys:e.streamingTokenKeys,trailingContent:e.trailingContent})}',
  // Fade data: one segment per word, keys from the view's key state (stable by position).
  'function walkFade(e,r){for(let t of e){let s=r.segmentContents.length;if(t.type===`list`){for(let i of t.items){r.listItemDecorationByToken.set(i,{startIndex:r.segmentContents.length});walkFade(i.tokens,r)}}' +
    'else if(Array.isArray(t.tokens))walkFade(t.tokens,r);else if(typeof t.text==`string`&&t.type===`text`){let w=t.text.split(/(?<= )/),o={parts:w,segmentCount:w.length,segmentKeys:[],startIndex:s};r.textByToken.set(t,o),r.textEntries.push(o),r.segmentContents.push(...w)}' +
    'r.segmentContents.length>s&&r.tokenSegmentEntries.push({segmentIndex:s,token:t})}}',
  'function keysFor(e,n){return e.map((c,i)=>n.keys[i]??`k${i}`)}',
  'function msl(e,t,n){let r={listItemDecorationByToken:new WeakMap,listItemDecorationEntries:[],segmentContents:[],streamingTokenKeys:new WeakMap,textEntries:[],textByToken:new WeakMap,tokenSegmentEntries:[]};walkFade(e,r);' +
    'let i=keysFor(r.segmentContents,n);for(let e of r.textEntries)e.segmentKeys=i.slice(e.startIndex,e.startIndex+e.segmentCount);for(let{segmentIndex:e,token:t}of r.tokenSegmentEntries)r.streamingTokenKeys.set(t,i[e]);' +
    'return{listItemDecorationByToken:r.listItemDecorationByToken,streamingTokenKeys:r.streamingTokenKeys,textByToken:r.textByToken}}',
  'function words(e){return e.fadeText?e.fadeSegmentKeys.map((k,j)=>e.fadeSegmentTimeline.settledKeys.has(k)?e.text.split(/(?<= )/)[j]:jsx(`span`,{className:`fade`},k)):e.text}',
  'function c(n){return Array(n).fill(null)}',
  'var memo=f=>f,View=memo(function(e){let t=c(20),{adaptiveStreaming:n,children:fe,isStreaming:i,fadeSegmentDelayMs:d,fadeSegmentMaxDelayMs:f,keyState:ks,components:s,textStyle:O,timeline:ie,trailingContent:tc}=e,L=d===void 0?0:d,P=i;',
  'let ye=P?msl(fe,null,ks):void 0,Ce;t[0]!==P||t[1]!==L||t[2]!==ye?.textByToken||t[3]!==O?.kind?(Ce=()=>(e,t,n,r)=>{let i=ye?.textByToken.get(n);return words({fadeSegmentDelayMs:L,fadeSegmentKeys:i?.segmentKeys,fadeSegmentTimeline:ie,fadeText:P,text:e,keyPrefix:t})},t[0]=P,t[1]=L,t[2]=ye?.textByToken,t[3]=O?.kind,t[4]=Ce):Ce=t[4];',
  'let Te=Ce(),Ee;t[5]!==L||t[6]!==ye?.listItemDecorationByToken?(Ee=e=>{let t=ye?.listItemDecorationByToken.get(e);if(t!=null)return{className:ie.settledKeys.has(t.segmentKey)?void 0:`fade`,timeline:ie}},t[5]=L,t[6]=ye?.listItemDecorationByToken,t[7]=Ee):Ee=t[7];',
  'let De=Ee,Ae=ye?.streamingTokenKeys;return Root({components:s,getListItemDecorationProps:De,openCodeFenceToken:void 0,renderText:Te,streamingTokenKeys:Ae,tokens:fe,trailingContent:tc})});',
].join('\n');

const text = s => ({ type: 'text', raw: s, text: s });
const para = s => ({ type: 'paragraph', raw: s, tokens: [text(s)] });
const code = s => ({ type: 'code', raw: s, text: s });
const list = (...items) => ({ type: 'list', raw: items.join(), items: items.map(s => ({ type: 'list_item', raw: s, tokens: [text(s)] })) });

function load(source) {
  const sandbox = {};
  vm.runInNewContext(`${source};this.View=View;this.renderCount=()=>renders;`, sandbox);
  const timeline = { settledKeys: new Set(), delayMsByKey: new Map() };
  const keyState = { keys: [] };
  const components = { p: 'p', pre: 'pre' };
  let last = 0;
  return {
    timeline, keyState,
    frame(tokens, extra = {}) {
      const out = sandbox.View({ adaptiveStreaming: true, isStreaming: true, children: tokens, keyState, components, textStyle: { kind: 'assistant-message' }, timeline, ...extra });
      const now = sandbox.renderCount(), rendered = now - last; last = now;
      return { out, rendered };
    },
    settleAll() { for (let i = 0; i < 1000; i++) timeline.settledKeys.add(`k${i}`); },
  };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('settled blocks of a streaming reply are rendered once and then reused', () => {
  const { initial: patched, applied } = adapt({ initial: streamingFixture });
  assert.equal(applied.streamingBlockCache, 'initial');
  const stock = load(streamingFixture), next = load(patched);
  const a = para('First block of the reply. '), b = list('one ', 'two '), x = code('let x = 1'), y = code('let y = 2');
  const frames = [[a, para('Sec')], [a, b, para('Second para')], [a, b, x, y, para('Third para grows')], [a, b, x, y, para('Third para grows more')]];
  const counts = [];
  frames.forEach((tokens, i) => {
    if (i === 2) { stock.settleAll(); next.settleAll(); }
    const s = stock.frame(tokens), n = next.frame(tokens);
    assert.deepEqual(plain(n.out), plain(s.out), `frame ${i} renders the same elements`);
    assert.equal(s.rendered, tokens.length, 'stock renders every block');
    counts.push(n.rendered);
  });
  // Frames 0-1: nothing has settled, every block is rebuilt. Frame 2: everything settles
  // and is rebuilt once. Frame 3: only the last block is rebuilt.
  assert.deepEqual(counts, [2, 3, 5, 1]);
  // The reused elements are the very same objects (so React skips them).
  const first = next.frame(frames[3]).out, second = next.frame(frames[3]).out;
  assert.equal(first[0], second[0]); assert.equal(first[2], second[2]);
  assert.deepEqual(plain(second).map(e => e?.props?.index).filter(i => i != null), [0, 1], 'reused code blocks keep their code-block numbers');
});

test('blocks are rebuilt when their fade keys, the components or the streaming state change', () => {
  const { initial: patched } = adapt({ initial: streamingFixture });
  const a = para('Alpha beta. '), b = para('Gamma delta. '), tail = para('tail');
  const next = load(patched), stock = load(streamingFixture);
  next.settleAll(); stock.settleAll();
  for (const view of [next, stock]) view.frame([a, b, tail]);
  assert.equal(next.frame([a, b, para('tail2')]).rendered, 1);
  // Different (settled) keys for the same words of the first block: it is rebuilt.
  for (const view of [next, stock]) { view.keyState.keys = ['z0', 'z1']; view.timeline.settledKeys.add('z0').add('z1'); }
  const rekeyed = next.frame([a, b, tail]), rekeyedStock = stock.frame([a, b, tail]);
  assert.equal(rekeyed.rendered, 2, "the first block and the last"); assert.deepEqual(plain(rekeyed.out), plain(rekeyedStock.out));
  for (const view of [next, stock]) { view.keyState.keys = []; view.frame([a, b, tail]); }
  // Words that have not finished fading: their block is rebuilt every frame.
  const fresh = load(patched);
  fresh.timeline.settledKeys.add('k2').add('k3');
  assert.equal(fresh.frame([a, b, tail]).rendered, 3);
  assert.equal(fresh.frame([a, b, tail]).rendered, 2, 'only the settled second block is reused');
  assert.equal(fresh.frame([a, b, tail]).rendered, 2);
  fresh.timeline.settledKeys.add('k0').add('k1');
  assert.equal(fresh.frame([a, b, tail]).rendered, 2, 'rebuilt once more when its words have settled');
  assert.equal(fresh.frame([a, b, tail]).rendered, 1);
  // Different components: rebuilt.
  assert.equal(next.frame([a, b, tail], { components: { p: 'P', pre: 'pre' } }).rendered, 3);
  // Not streaming (the final render): every block is rebuilt, every time.
  assert.equal(next.frame([a, b, tail], { isStreaming: false }).rendered, 3);
  assert.equal(next.frame([a, b, tail], { isStreaming: false }).rendered, 3);
  // Directives are never reused.
  const d = { type: 'codexDirective', raw: ':x', name: 'x', attributes: {} };
  next.frame([d, a, tail]);
  assert.equal(next.frame([d, a, tail]).rendered, 2);
});

test('without the fade data builder or the streaming view the renderer is left as it is', () => {
  const noBuilder = streamingFixture.replace('function msl(e,t,n){', 'function msl(e,t,n,x){');
  const { initial, skipped, applied } = adapt({ initial: noBuilder });
  assert.equal(applied.streamingBlockCache, undefined);
  assert.match(skipped.streamingBlockCache, /fade data builder/);
  assert.equal(initial, undefined, 'nothing else edits the fixture, so no patched source is returned');
  const noView = adapt({ initial: streamingFixture.replace('fadeSegmentMaxDelayMs:f,', '') });
  assert.match(noView.skipped.streamingBlockCache, /streaming markdown view/);
});
