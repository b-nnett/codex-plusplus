// Behaviour tests for the typing lane's startup edits, on minimal fixtures of
// the vendor code shapes they match.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { adapt } from './startup-harness.mjs';

// The composer's text conversions, reduced: fJr (the markdown editor factory;
// every call returns a new object whose serialize runs the shared serialiser),
// mJr (getText) and YB (plain text). The Transform stand-in makes a new copy
// without the literalPaste mark when the document has one, like the real one.
const textFixture = [
  'var runs=0,strips=0,plains=0,EJr;',
  'class wo{constructor(d){this.doc=d}removeMark(a,b,m){strips++;if(this.doc.pasted)this.doc={...this.doc,pasted:!1};return this}}',
  'function vde(e){return e}',
  'function CJr(e){return e}',
  'function fJr(){EJr??={serialize:e=>(runs++,e.text+`\\n`)};let e=EJr,t=new WeakMap;return{pmu:e,pastePreferredHtml:(e,t,n)=>!1,pasteLiteralText:(e,t)=>!1,' +
    'serialize:(n,r)=>{let i=CJr(new wo(vde(n)).removeMark(0,n.content.size,n.type.schema.marks.literalPaste).doc);if(i.fail)throw Error(`boom`);if(i.pasted)throw Error(`not stripped`);' +
    'return!r?.preserveParagraphSpacing&&i.paragraphs?i.text.toUpperCase():e.serialize(i).replace(/\\n$/,``)},plugins:[]}}',
  'function YB(e,{forClipboard:t=!1,preferFileMentionFsPath:n=!1,preserveLinkMarkers:r=!1,preserveTextLinkMarks:i=!1,preserveUnresolvedSkillMentions:a=!1}={}){plains++;let o=e.text+(i?`+links`:``)+(t?`+clip`:``);return{content:o}}',
  'function hJr(e){return e.text.includes(`-`)||e.text.includes(`&`)}',
  'function mJr(e,t){if(t==null||!hJr(e))return YB(e).content;let n=new wo(vde(e)).removeMark(0,e.content.size,e.type.schema.marks.literalPaste).doc,r=t(n);' +
    'return r.replace(/&#(?:x[\\da-f]+|\\d+);/gi,``).trim()===``?YB(e).content:r}',
].join('\n');
const schemaStub = { schema: { marks: { literalPaste: {} } } };
const pmDoc = (text, extra = {}) => ({ text, content: { size: text.length }, type: schemaStub, ...extra });

function loadText(source) {
  const sandbox = {};
  vm.runInNewContext(`${source};this.fJr=fJr;this.mJr=mJr;this.YB=YB;this.counts=()=>({runs,strips,plains});`, sandbox);
  return sandbox;
}
const counts = env => ({ ...env.counts() });

test('composer markdown is serialised once per document, across editor instances and pasted text', () => {
  const { initial: patched, applied } = adapt({ initial: textFixture });
  assert.equal(applied.composerSerializeOnce, 'initial');
  const stock = loadText(textFixture), next = loadText(patched);
  const doc = pmDoc('- a\n- b'), other = pmDoc('- a\n- bc'), paragraphs = pmDoc('p', { paragraphs: true }), pasted = pmDoc('- pasted', { pasted: true });
  for (const env of [stock, next]) {
    const store = env.fJr(), editor = env.fJr();
    env.outputs = [...[store.serialize(doc), editor.serialize(doc), editor.serialize(doc), editor.serialize(doc, { preserveParagraphSpacing: true }),
      editor.serialize(other), store.serialize(paragraphs), store.serialize(paragraphs, { preserveParagraphSpacing: true }),
      // A pasted draft: the store serialises the document, getText the copy without literalPaste marks.
      store.serialize(pasted), env.mJr(pasted, editor.serialize), env.mJr(pasted, editor.serialize)]];
  }
  assert.deepEqual(next.outputs, stock.outputs);
  assert.deepEqual(next.outputs.slice(0, 5), ['- a\n- b', '- a\n- b', '- a\n- b', '- a\n- b', '- a\n- bc']);
  assert.deepEqual(next.outputs.slice(7), ['- pasted', '- pasted', '- pasted']);
  // Stock: one run per call that reaches the serialiser (9). Patched: one per distinct document copy and option (5).
  assert.equal(counts(stock).runs, 9);
  assert.equal(counts(next).runs, 5);
  // Errors propagate and are not cached; a later call for the same document tries again.
  const broken = pmDoc('x', { fail: true }), editor = next.fJr();
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

test('getText is computed once per document and serialize function', () => {
  const { initial: patched, applied } = adapt({ initial: textFixture });
  assert.equal(applied.composerTextOnce, 'initial');
  const stock = loadText(textFixture), next = loadText(patched);
  const pasted = pmDoc('- pasted', { pasted: true }), plain = pmDoc('plain'), blank = pmDoc('&#x20;', { pasted: true });
  for (const env of [stock, next]) {
    const one = env.fJr(), two = env.fJr();
    env.outputs = [...[env.mJr(pasted, one.serialize), env.mJr(pasted, one.serialize), env.mJr(pasted, two.serialize), env.mJr(pasted, undefined),
      env.mJr(plain, one.serialize), env.mJr(plain, one.serialize), env.mJr(blank, one.serialize), env.mJr(blank, one.serialize)]];
  }
  assert.deepEqual(next.outputs, stock.outputs);
  assert.deepEqual(next.outputs, ['- pasted', '- pasted', '- pasted', '- pasted', 'plain', 'plain', '&#x20;', '&#x20;']);
  // Stock strips twice per markdown call (getText, then serialize: 10); patched once per document object
  // (the two drafts and their two copies: 4), and serialises each copy once.
  assert.equal(counts(stock).strips, 10);
  assert.equal(counts(next).strips, 4);
  assert.equal(counts(stock).runs, 5);
  assert.equal(counts(next).runs, 2);
  assert.ok(counts(next).plains < counts(stock).plains);
  // A non-object document goes to the original function.
  assert.throws(() => next.mJr(null, undefined), { name: 'TypeError' });
});

test('plain text is converted once per document and options, in a new object each call', () => {
  const { initial: patched, applied } = adapt({ initial: textFixture });
  assert.equal(applied.composerPlainTextOnce, 'initial');
  const stock = loadText(textFixture), next = loadText(patched);
  const doc = pmDoc('text');
  for (const env of [stock, next]) {
    env.results = [env.YB(doc, { preserveTextLinkMarks: true }), env.YB(doc, { preserveTextLinkMarks: true }), env.YB(doc), env.YB(doc, {}), env.YB(doc, { forClipboard: true })];
    env.outputs = env.results.map(r => ({ ...r }));
  }
  assert.deepEqual(next.outputs, stock.outputs);
  assert.deepEqual(next.outputs.map(r => r.content), ['text+links', 'text+links', 'text', 'text', 'text+clip']);
  assert.notEqual(next.results[0], next.results[1]);
  assert.equal(counts(stock).plains, 5);
  assert.equal(counts(next).plains, 3);
  // Options that are not booleans, and null options, go to the original function.
  next.YB(doc, { preserveTextLinkMarks: 1 });
  assert.equal(counts(next).plains, 4);
  assert.throws(() => next.YB(doc, null), { name: 'TypeError' });
  assert.throws(() => stock.YB(doc, null), { name: 'TypeError' });
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
