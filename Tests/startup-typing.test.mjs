// Behaviour tests for the typing lane's startup edits, on minimal fixtures of
// the vendor code shapes they match.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { adapt } from './startup-harness.mjs';

// fJr: the composer's markdown editor factory. Every call returns a new object
// whose serialize runs the shared serialiser (counted here).
const serializeFixture = [
  'var runs=0,EJr;',
  'function vde(e){return e}',
  'function fJr(){EJr??={serialize:e=>(runs++,e.text+`\\n`)};let e=EJr,t=new WeakMap;return{pmu:e,pastePreferredHtml:(e,t,n)=>!1,pasteLiteralText:(e,t)=>!1,' +
    'serialize:(n,r)=>{let i=vde(n);if(i.fail)throw Error(`boom`);return!r?.preserveParagraphSpacing&&i.paragraphs?i.text.toUpperCase():e.serialize(i).replace(/\\n$/,``)},plugins:[]}}',
].join('\n');

function loadSerialize(source) {
  const sandbox = {};
  vm.runInNewContext(`${source};this.fJr=fJr;this.count=()=>runs;`, sandbox);
  return sandbox;
}

test('composer markdown is serialised once per document, across editor instances', () => {
  const { initial: patched, applied } = adapt({ initial: serializeFixture });
  assert.equal(applied.composerSerializeOnce, 'initial');
  const stock = loadSerialize(serializeFixture), next = loadSerialize(patched);
  const doc = { text: '- a\n- b' }, other = { text: '- a\n- bc' }, paragraphs = { text: 'p', paragraphs: true };
  for (const env of [stock, next]) {
    const store = env.fJr(), editor = env.fJr();
    env.outputs = [...[store.serialize(doc), editor.serialize(doc), editor.serialize(doc), editor.serialize(doc, { preserveParagraphSpacing: true }),
      editor.serialize(other), store.serialize(paragraphs), store.serialize(paragraphs, { preserveParagraphSpacing: true })]];
  }
  assert.deepEqual(next.outputs, stock.outputs);
  assert.deepEqual(next.outputs.slice(0, 5), ['- a\n- b', '- a\n- b', '- a\n- b', '- a\n- b', '- a\n- bc']);
  // Stock: one run per call that reaches the serialiser (6). Patched: one per distinct document and option (4).
  assert.equal(stock.count(), 6);
  assert.equal(next.count(), 4);
  // Errors propagate and are not cached; a later call for the same document tries again.
  const broken = { text: 'x', fail: true }, editor = next.fJr();
  assert.throws(() => editor.serialize(broken), /boom/);
  broken.fail = false;
  assert.equal(editor.serialize(broken), 'x');
  // Fallback: a non-object argument goes to the original function.
  assert.throws(() => editor.serialize(null), { name: 'TypeError' });
});

test('composerSerializeOnce leaves other object literals alone', () => {
  const source = 'function f(){return{pmu:1,serialize:(n,r)=>n.serialize(r),plugins:[]}}';
  const { initial, applied, skipped } = adapt({ initial: source });
  assert.equal(applied.composerSerializeOnce, undefined);
  assert.match(skipped.composerSerializeOnce, /expected one match, found 0/);
  assert.equal(initial ?? source, source);
});

// RichTextInput's mount effect, reduced: it subscribes to editor transactions
// (wB) and on each one runs the code-block clip check (fHc, document changes
// only) and the overflow measure (P).
const layoutFixture = [
  'var log=[];',
  'function wB(e,t){e.listeners.push(t);return()=>{e.listeners.splice(e.listeners.indexOf(t),1)}}',
  'function fHc(e){if(e.querySelector(`[data-composer-code-block]`)==null){log.push(`clip:none`);return}document.elementFromPoint(0,0);log.push(`clip`)}',
  'function mount(e,t){let P=()=>log.push(`measure:${t.overflow}`);let effect=()=>{let a=t.ownerDocument.fonts;a?.addEventListener(`loadingdone`,P);' +
    'let o=wB(e.view,e=>{e&&fHc(t),P()});return()=>{a?.removeEventListener(`loadingdone`,P),o()}};return effect()}',
].join('\n');

function loadLayout(source, { raf = true } = {}) {
  const frames = new Map(); let nextFrame = 1;
  const sandbox = { document: { elementFromPoint: () => null } };
  if (raf) {
    sandbox.requestAnimationFrame = cb => { const id = nextFrame++; frames.set(id, cb); return id; };
    sandbox.cancelAnimationFrame = id => { frames.delete(id); };
  }
  vm.runInNewContext(`${source};this.mount=mount;this.log=log;`, sandbox);
  const view = { listeners: [] };
  const root = { overflow: false, dataset: { richTextLayout: 'multiline' }, ownerDocument: { fonts: { addEventListener() {}, removeEventListener() {} } }, querySelector: () => ({}) };
  const unmount = sandbox.mount({ view }, root);
  return {
    root, unmount, get log() { return [...sandbox.log]; }, pending: () => frames.size,
    dispatch(docChanged) { for (const l of [...view.listeners]) l(docChanged); },
    frame() { const run = [...frames.values()]; frames.clear(); for (const cb of run) cb(0); },
  };
}

test('the composer layout check runs once per frame in the multiline layout', () => {
  const { initial: patched, applied } = adapt({ initial: layoutFixture });
  assert.equal(applied.composerLayoutPerFrame, 'initial');
  const stock = loadLayout(layoutFixture), next = loadLayout(patched);
  for (const env of [stock, next]) { env.dispatch(true); env.dispatch(false); env.dispatch(true); }
  assert.deepEqual(stock.log, ['clip', 'measure:false', 'measure:false', 'clip', 'measure:false']);
  assert.deepEqual(next.log, []);
  assert.equal(next.pending(), 1);
  next.root.overflow = true;
  next.frame();
  assert.deepEqual(next.log, ['clip', 'measure:true']);
  // A frame of selection-only transactions measures without the clip check.
  next.dispatch(false); next.dispatch(false); next.frame();
  assert.deepEqual(next.log, ['clip', 'measure:true', 'measure:true']);
  // Unmounting cancels a pending frame and unsubscribes.
  next.dispatch(true); next.unmount();
  assert.equal(next.pending(), 0);
  next.dispatch(true);
  assert.equal(next.pending(), 0);
  assert.equal(next.log.length, 3);
});

test('the composer layout check stays synchronous in the single-line layout and without requestAnimationFrame', () => {
  const { initial: patched } = adapt({ initial: layoutFixture });
  const next = loadLayout(patched);
  next.dispatch(true);                      // multiline: deferred
  next.root.dataset.richTextLayout = 'single-line';
  next.dispatch(false);                     // single-line: runs now, merging the pending document change
  assert.deepEqual(next.log, ['clip', 'measure:false']);
  assert.equal(next.pending(), 0);
  next.dispatch(false);
  assert.deepEqual(next.log, ['clip', 'measure:false', 'measure:false']);
  const noFrames = loadLayout(patched, { raf: false });
  noFrames.dispatch(true); noFrames.dispatch(false);
  assert.deepEqual(noFrames.log, ['clip', 'measure:false', 'measure:false']);
});

test('composerLayoutPerFrame needs the code-block clip check', () => {
  const source = layoutFixture.replace('elementFromPoint(0,0)', 'body');
  const { applied, skipped } = adapt({ initial: source });
  assert.equal(applied.composerLayoutPerFrame, undefined);
  assert.match(skipped.composerLayoutPerFrame, /expected one match, found 0/);
});
