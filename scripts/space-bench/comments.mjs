// Comment highlights on a Space Page while typing, on the real Page editor chunk
// (content-*.js) and app-initial of ChatGPT build 20398.
//
//   node --experimental-vm-modules --stack-size=4000 scripts/space-bench/comments.mjs \
//     --assets <extracted app.asar>/webview/assets [--patched <dir with the patched content-*.js>]
//     [--blocks 120] [--threads 8] [--edits 2000] [--seed 1] [--bench 300]
//
// A page of `blocks` blocks (headings, paragraphs with bold, italics, code and links, lists,
// a code block) is parsed with the page markdown converter and written into a canonical Yjs
// page document; `threads` comment threads are anchored with the editor's own TO() on random
// ranges (some across two blocks). Each edit is a ProseMirror transaction on an editor state
// with the comment decoration plugin (OO); the app's writer then applies it to the Yjs
// document (bCo + Vmo, as applyEditor does). Edits are random insertions (letters, spaces and
// markdown-sensitive characters), deletions and replacements inside one paragraph, mostly next
// to or inside highlighted ranges, plus some structural edits (split a paragraph).
//
// Correctness (--patched): after each edit, when the patched plugin kept the mapped set as
// exact, its decorations (positions, keys, thread ids) must equal those of a full rebuild by the
// app's own kO() on the same state. The run counts how often the set stayed exact.
// Timing (--bench): per keystroke, the stock path (kO after every edit) and the patched path
// (kO only when the set did not stay exact), typing at the end of a highlighted paragraph.
// Only the editor state is modelled: the view update that the extra transaction causes in the
// app (decoration diff, DOM, every other plugin's apply) is not, so the stock cost here is a
// lower bound.
import fs from 'node:fs';
import path from 'node:path';
import { load } from './loader.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') && a.push([x.slice(2), all[i + 1]]), a), []));
const assets = args.assets;
const contentName = fs.readdirSync(assets).find(n => n.startsWith('content-') && fs.readFileSync(path.join(assets, n), 'utf8').includes('spacePageCommentDecorations'));
let content = fs.readFileSync(args.patched ? path.join(args.patched, contentName) : path.join(assets, contentName), 'utf8');
// The chunk's own top-level initialiser starts the whole editor module graph; the pieces used here are initialised one by one.
content = content.replace(/([A-Za-z_$][\w$]*)\(\);export\{([A-Za-z_$][\w$]* as PageEditorContent)\}/, 'export{$2}');
const env = await load({ assets, sources: { [contentName]: content }, exportsFor: {
  'app-shared': ['VY'],
  'app-initial': ['Kv', 'hgr', '_gr', 'Vgo', 'P$', 'bCo', 'Vmo', 'Hmo', 'OCo', 'Hje', 'DCo', 'MCo', 'd$', 'z$', 'HL', 'Ugo', 'zL'],
  [contentName]: ['kO', 'DO', 'OO', 'MO', 'NO', 'TO', 'UM', 'oa', ...(args.patched ? ['ppCommentHighlightsResolved'] : [])] } });
const I = await env.chunk('app-initial-');
(await env.chunk('app-shared-')).VY();
const C = await env.chunk(contentName);
// Module initialisers of the functions used (rolldown's lazy init), as the app runs them before a Page opens.
for (const init of ['HL', 'Ugo', 'z$', 'd$', 'MCo', 'DCo']) I[init]();
C.NO(); C.UM();
const tags = () => env.global.__codexPPCommentHighlights;

let seed = Number(args.seed ?? 1);
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pickOne = a => a[Math.floor(rnd() * a.length)];
const words = 'the page keeps a shared document of blocks and each block is markdown text with comments anchored to ranges of it'.split(' ');
const sentence = n => Array.from({ length: n }, (_, i) => {
  const w = pickOne(words), r = rnd();
  return r < 0.05 ? `**${w}**` : r < 0.08 ? `*${w}*` : r < 0.1 ? `\`${w}\`` : r < 0.12 ? `[${w}](https://example.com/${w})` : w;
}).join(' ');
function pageMarkdown(blocks) {
  const out = [];
  for (let i = 0; out.length < blocks; i++) {
    const k = i % 9;
    if (k === 0) out.push(`## ${sentence(4)}`);
    else if (k === 3) out.push(Array.from({ length: 3 }, () => `- ${sentence(8)}`).join('\n'));
    else if (k === 6 && i % 4 === 2) out.push('```js\nconst a = 1;\nconst b = a + 2;\n```');
    else out.push(sentence(25 + (i % 5) * 6) + '.');
  }
  return out.join('\n\n');
}

const pmu = I.Vgo({ isRichTableCellSupportEnabled: true });
const EditorState = I.Hje, TextSelection = C.oa;
function makePage(blocks) {
  const doc = pmu.parse(pageMarkdown(blocks));
  const ydoc = new I.Kv(), roots = I.hgr(ydoc);
  const units = I.P$(doc, pmu);
  ydoc.transact(() => { roots.title.insert(0, 'Comments benchmark'); units.forEach((u, index) => I._gr(roots, { id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, index, markdown: u.markdown, kind: u.kind })); });
  if (!I.OCo(ydoc, doc, doc, pmu)) throw new Error('canonical document does not match the editor document');
  return { doc, ydoc };
}
function makeView(doc, ydoc, threadsRef) {
  const plugin = C.OO({ document: () => ydoc, getThreads: () => threadsRef.threads, markdown: pmu, onOpenThread() {} });
  const view = { state: EditorState.create({ doc, plugins: [plugin] }), isDestroyed: false, dom: { ownerDocument: env.dom.document },
    dispatch(tr) { this.state = this.state.apply(tr); } };
  return view;
}
function textblocks(doc) { const out = []; doc.descendants((n, pos) => { if (n.isTextblock && n.type.name !== 'code_block') { out.push({ from: pos + 1, to: pos + n.nodeSize - 1 }); return false; } }); return out; }
function makeThreads(view, ydoc, count) {
  const out = [], blocks = textblocks(view.state.doc).filter(b => b.to - b.from > 20);
  for (let i = 0; out.length < count && i < count * 20; i++) {
    const b = pickOne(blocks), cross = i % 4 === 3;
    const from = b.from + Math.floor(rnd() * (b.to - b.from - 10)), end = cross ? blocks[blocks.indexOf(b) + 1] : b;
    if (!end) continue;
    const to = cross ? end.from + 3 + Math.floor(rnd() * 5) : Math.min(b.to, from + 3 + Math.floor(rnd() * 15));
    const target = C.TO(view, ydoc, pmu, TextSelection.create(view.state.doc, from, to));
    if (target) out.push({ id: `t${out.length}`, state: 'open', target, messages: [{ authorType: 'user', deletedAt: null }] });
  }
  return out;
}
// Applies a transaction to the editor and the canonical document, as the app's applyEditor does.
function edit(view, ydoc, tr) {
  const before = view.state.doc;
  view.dispatch(tr);
  const after = view.state.doc;
  if (after === before) return;
  const patch = I.bCo(ydoc, after, before, pmu, tr);
  if (patch != null && I.Hmo(ydoc, patch) == null) I.Vmo(ydoc, patch);
  if (!I.OCo(ydoc, after, after, pmu)) throw new Error('writer left the documents apart');
}
// The highlight layer's effect, as patched (see commentHighlightsMapped): rebuild unless the set is exact for these inputs.
// The patched effect's test: the mapped set's tag is for these inputs and the edited blocks' threads resolve to it.
function wouldKeep(view, ydoc, threads, drafts) {
  const set = C.MO.getState(view.state), tag = tags()?.get(set);
  return tag != null && tag.view === view && tag.document === ydoc && tag.pmu === pmu && tag.threads === threads && tag.drafts === drafts &&
    C.ppCommentHighlightsResolved(view, ydoc, pmu, threads, drafts, set, tag) ? tag : null;
}
function effect(view, ydoc, threads, drafts, patched) {
  const before = C.MO.getState(view.state);
  if (patched) { const tag = wouldKeep(view, ydoc, threads, drafts); if (tag) { if (tag.touched.length) tags().set(before, { ...tag, touched: [] }); return 'kept'; } }
  const doc = view.state.doc;
  C.kO(view, ydoc, pmu, threads, drafts);
  const after = C.MO.getState(view.state);
  if (patched && after !== before && view.state.doc === doc && after.find().length > 0) (env.global.__codexPPCommentHighlights ??= new WeakMap).set(after, { view, document: ydoc, pmu, threads, drafts, touched: [], order: I.zL(ydoc).order.toArray() });
  return 'rebuilt';
}
const describe = set => set.find().map(d => [d.from, d.to, d.spec.key ?? null, d.spec.commentThreadId ?? d.spec.highlight?.threadId ?? null]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || String(a[2]).localeCompare(String(b[2])) || String(a[3]).localeCompare(String(b[3])));
function rebuildOf(view, ydoc, threads, drafts) {
  const copy = { state: view.state, isDestroyed: false, dom: view.dom, dispatch(tr) { this.state = this.state.apply(tr); } };
  C.kO(copy, ydoc, pmu, threads, drafts);
  return describe(C.MO.getState(copy.state));
}
const chars = ['a', 'e', 's', ' ', ' ', '*', '_', '`', '\\', '[', ']', '#', '.', '1', '-', 'aa', 'the ', '**'];
function randomEdit(state) {
  const decos = C.MO.getState(state).find(), blocks = textblocks(state.doc);
  // Mostly near a highlight boundary or inside a highlight, sometimes anywhere.
  let pos;
  const r = rnd();
  if (decos.length && r < 0.7) { const d = pickOne(decos); pos = (rnd() < 0.5 ? d.from : d.to) + Math.floor(rnd() * 5) - 2; }
  else { const b = pickOne(blocks); pos = b.from + Math.floor(rnd() * (b.to - b.from + 1)); }
  pos = Math.max(1, Math.min(state.doc.content.size - 1, pos));
  const $pos = state.doc.resolve(pos);
  if (!$pos.parent.isTextblock || $pos.parent.type.name === 'code_block') return null;
  const kind = rnd();
  if (kind < 0.55) return state.tr.insertText(pickOne(chars), pos);
  const end = Math.min($pos.end(), pos + 1 + Math.floor(rnd() * 4));
  if (end <= pos) return null;
  if (kind < 0.85) return state.tr.delete(pos, end);
  if (kind < 0.95) return state.tr.insertText(pickOne(chars), pos, end);
  return state.tr.split(pos);
}

const blocks = Number(args.blocks ?? 120), threadCount = Number(args.threads ?? 8);
if (args.patched) {
  // Sessions of edits on fresh pages; a session ends early when the writer cannot apply an edit to the
  // canonical document (the app would reject it and keep a recovery draft), since the two then differ.
  const n = Number(args.edits ?? 2000), perSession = Number(args.session ?? 400);
  const totals = { edits: 0, candidates: 0, keptExact: 0, rebuilt: 0, comparedWithFullRebuild: 0, mismatches: 0, sessions: 0, endedByWriter: 0, threads: 0 };
  while (totals.edits < n) {
    const { doc, ydoc } = makePage(blocks);
    const ref = { threads: [] };
    const view = makeView(doc, ydoc, ref);
    ref.threads = makeThreads(view, ydoc, threadCount);
    totals.threads += ref.threads.length; totals.sessions++;
    const drafts = new Map();
    effect(view, ydoc, ref.threads, drafts, true);
    for (let k = 0; k < perSession && totals.edits < n; k++) {
      const tr = randomEdit(view.state);
      if (tr == null) continue;
      const probe = () => { const order = I.zL(ydoc).order.toArray(), d = view.state.doc; return { fast: d.childCount === order.length, units: order.length, children: d.childCount,
        resolved: Object.fromEntries([...C.DO(view, ydoc, pmu, ref.threads.map(t => t.target))].map(([t, r], i) => [ref.threads[i]?.id, r && [r.from, r.to]])) }; };
      const before = args.debug ? probe() : null;
      try { edit(view, ydoc, tr); if (args.debug) view.probe = { before, after: probe() }; } catch (e) { if (/apart/.test(e.message)) { totals.endedByWriter++; break; } throw e; }
      totals.edits++;
      const candidate = tags()?.get(C.MO.getState(view.state)); if (candidate) totals.candidates++;
      if (candidate && wouldKeep(view, ydoc, ref.threads, drafts)) {
        const mapped = describe(C.MO.getState(view.state)), full = rebuildOf(view, ydoc, ref.threads, drafts);
        totals.comparedWithFullRebuild++;
        if (JSON.stringify(mapped) !== JSON.stringify(full)) {
          totals.mismatches++;
          console.log('MISMATCH', JSON.stringify(tr.steps.map(s => s.toJSON())));
          console.log(' mapped', JSON.stringify(mapped)); console.log(' full  ', JSON.stringify(full));
          if (args.debug) { const at = tr.steps[0].from, $p = view.state.doc.resolve(Math.min(at, view.state.doc.content.size)); const top = $p.node(1);
            console.log(' block', $p.before(1), JSON.stringify(top.toJSON()).slice(0, 1500)); console.log(' units', JSON.stringify(I.P$(view.state.doc.type.create(null, top), pmu).map(u => u.markdown)));
            console.log(' probe', JSON.stringify(view.probe)); }
          if (!args.keepGoing) process.exit(1);
        }
      }
      effect(view, ydoc, ref.threads, drafts, true) === 'kept' ? totals.keptExact++ : totals.rebuilt++;
    }
  }
  console.log(JSON.stringify({ blocks, threadsPerPage: threadCount, ...totals }));
}
if (args.bench) {
  const keys = Number(args.bench);
  for (const patched of [false, true]) {
    if (patched && !args.patched) break;
    seed = 99;
    const { doc, ydoc } = makePage(blocks);
    const ref = { threads: [] };
    const view = makeView(doc, ydoc, ref);
    ref.threads = makeThreads(view, ydoc, threadCount);
    const drafts = new Map();
    effect(view, ydoc, ref.threads, drafts, patched);
    // Type at the end of the paragraph holding the first highlight (after it, not touching it).
    // --where plain: in a paragraph no thread is anchored in (the last one clear of every highlight).
    const decos = C.MO.getState(view.state).find().sort((a, b) => a.from - b.from), first = decos[0];
    let typing = view.state.doc.resolve(first.to).end();
    if (args.where === 'plain') typing = textblocks(view.state.doc).filter(b => b.to > b.from && !decos.some(d => d.to >= b.from - 2 && d.from <= b.to + 2)).at(-1).to;
    const time = { editor: 0, writer: 0, highlights: 0, resolveOnly: 0 }, outcomes = { kept: 0, rebuilt: 0 };
    const type = (ch, timed) => {
      let a = performance.now();
      const before = view.state.doc, tr = view.state.tr.insertText(ch, typing); view.dispatch(tr); typing += ch.length;
      let b = performance.now();
      const patch = I.bCo(ydoc, view.state.doc, before, pmu, tr); if (patch != null && I.Hmo(ydoc, patch) == null) I.Vmo(ydoc, patch);
      let c = performance.now();
      if (args.debug && patched && timed && outcomes.kept + outcomes.rebuilt < 3) { const set = C.MO.getState(view.state), tag = tags()?.get(set); console.log('candidate', !!tag, 'touched', tag?.touched); }
      outcomes[effect(view, ydoc, ref.threads, drafts, patched)]++;
      let d = performance.now();
      if (args.parts) C.DO(view, ydoc, pmu, ref.threads.map(t => t.target));
      let e = performance.now();
      if (timed) { time.editor += b - a; time.writer += c - b; time.highlights += d - c; time.resolveOnly += e - d; }
    };
    for (let w = 0; w < 50; w++) type("w", false);
    outcomes.kept = outcomes.rebuilt = 0;
    for (let k = 0; k < keys; k++) type('abcdefghij '[k % 11], true);
    console.log(JSON.stringify({ path: patched ? "patched" : "stock", where: args.where ?? "highlighted", blocks, threads: ref.threads.length, keys, outcomes, msPerKey: Object.fromEntries(Object.entries(time).map(([k, v]) => [k, +(v / keys).toFixed(3)])) }));
  }
}
