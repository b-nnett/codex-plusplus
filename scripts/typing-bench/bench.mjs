// Composer keystroke benchmark on the real app-initial chunk of ChatGPT build 20398: the
// markdown serialisation the composer runs for each edit of a draft.
//
//   node --experimental-vm-modules --stack-size=4000 scripts/typing-bench/bench.mjs \
//     --assets <extracted app.asar>/webview/assets [--adapter Sources/CodexPPCore/Resources/startup-adapter.js]
//     [--sizes 500,5000,20000] [--keys 200] [--texts 3] [--prompts 1] [--pasted 1]
//     [--save outputs.json | --reference outputs.json]
//
// A draft of each size (paragraphs, bullet and numbered lists, inline code, a fenced code
// block) is parsed with the composer's own markdown editor (fJr().pmu.parse), and `keys`
// characters are then typed at the end of a middle paragraph, one new document per key, as
// ProseMirror makes one per transaction. For each document the benchmark does what one
// keystroke does in the composer:
//   - the draft-store update (uYr): doc.toJSON() and the markdown serialisation of the doc;
//   - (reported apart) the plain-text conversion YB(doc, {preserveTextLinkMarks: true}), which the
//     main composer's plain-text listener and plain-text mode run per edit, called twice;
//   - the editor selectors that re-read the text: `texts` calls of the controller's getText()
//     (mJr(doc, serialize)) and `prompts` calls of getChatGptPrompt() (gBc(doc, getText)).
// How many selector reads one keystroke causes depends on which composer surfaces are mounted
// and on React's useSyncExternalStore (a selector runs when the store notifies and again when
// the component renders); the defaults (3 + 1) are a reading of the main composer's selectors,
// not a measurement in the app. Each read is reported separately as well.
// With --pasted 1 the whole draft carries the literalPaste mark, as a pasted draft does.
// It reports ms per keystroke and how many times the markdown serialiser itself (the unified
// pipeline behind fJr's `pmu.serialize`) ran per keystroke, and checks that every output equals
// the stock output for the same document.
// With --adapter the chunk is first patched by that startup-adapter.js (only the `initial`
// input is given). The internal names it exports are this build's minified names.
import fs from 'node:fs';
import vm from 'node:vm';
import { load } from '../streaming-bench/loader.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') && a.push([x.slice(2), all[i + 1]]), a), []));
const assets = args.assets ?? process.env.CODEXPP_WEBVIEW_ASSETS;
if (!assets) throw new Error('pass --assets <extracted app.asar>/webview/assets (or set CODEXPP_WEBVIEW_ASSETS)');
const repo = new URL('../..', import.meta.url).pathname;
const initialName = fs.readdirSync(assets).find(n => /^app-initial-.*\.js$/.test(n));
let source = fs.readFileSync(`${assets}/${initialName}`, 'utf8');
let applied = null;
if (args.adapter && args.adapter !== 'none') {
  const c = vm.createContext({});
  vm.runInContext(fs.readFileSync(`${repo}/Sources/CodexPPCore/Resources/acorn.js`, 'utf8'), c);
  vm.runInContext(fs.readFileSync(args.adapter, 'utf8'), c);
  c.input = { initial: source, diagnostics: false };
  const result = vm.runInContext('CodexPPStartupAdapter.adapt(input)', c);
  applied = Object.keys(result.applied).filter(k => result.applied[k] === 'initial');
  source = result.initial ?? source;
}
const env = await load({ assets, initialSource: source, initialExports: ['fJr', 'mJr', 'gBc', 'NJr', 'vBc', 'wo', 'KYr', 'UV', 'YB'] });
const I = env.initial;
I.NJr(); I.vBc(); I.UV();
const editor = I.fJr();           // the controller's markdownEditor (a fresh instance per composer)
const store = I.KYr();            // the draft store's own instance (uYr)
// Count runs of the shared unified serialiser (EJr.serialize), under every fJr instance.
const pmu = editor.pmu;
let runs = 0;
const original = pmu.serialize;
pmu.serialize = function (...a) { runs++; return original.apply(this, a); };

function draft(size, seed = 1) {
  let s = seed, out = [], len = 0;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const words = 'the composer keeps a draft of each thread and serialises it to markdown on every edit with `inline code` and **bold** text plus a [link](https://example.com) here'.split(' ');
  const sentence = n => Array.from({ length: n }, () => words[Math.floor(rnd() * words.length)]).join(' ');
  let i = 0;
  while (len < size) {
    const kind = i++ % 5;
    let block;
    if (kind === 1) block = Array.from({ length: 4 }, () => `- ${sentence(8)}`).join('\n');
    else if (kind === 3) block = Array.from({ length: 3 }, (_, k) => `${k + 1}. ${sentence(9)}`).join('\n');
    else if (kind === 4 && i % 3 === 0) block = '```js\n' + Array.from({ length: 6 }, (_, k) => `const v${k} = compute(${k}, "${sentence(3)}");`).join('\n') + '\n```';
    else block = sentence(30) + '.';
    out.push(block); len += block.length + 2;
  }
  return out.join('\n\n').slice(0, Math.max(size, 0));
}
function lastParagraphPos(doc) {
  let pos = null;
  doc.forEach((node, offset) => { if (node.type.name === 'paragraph' && offset < doc.content.size / 2) pos = offset + node.nodeSize - 1; });
  return pos;
}
const sizes = (args.sizes ?? '500,5000,20000').split(',').map(Number);
const keys = Number(args.keys ?? 200), texts = Number(args.texts ?? 3), prompts = Number(args.prompts ?? 1);
const reference = args.reference ? JSON.parse(fs.readFileSync(args.reference, 'utf8')) : null, record = {};
console.log(`app-initial: ${initialName}${applied ? ` (patched: ${applied.join(', ') || 'no edits'})` : ' (stock)'}`);
for (const size of sizes) {
  // Close the open fence of a cut-off draft so every size has a complete code block.
  let text = draft(size); if ((text.match(/```/g) ?? []).length % 2) text += '\n```';
  let base = editor.pmu.parse(text);
  const schema = base.type.schema;
  // --pasted 1: the draft was pasted, so its text carries the literalPaste mark (typed characters do not).
  if (args.pasted === '1') base = new I.wo(base).addMark(0, base.content.size, schema.marks.literalPaste.create()).doc;
  const docs = []; let doc = base;
  for (let k = 0; k < keys; k++) { const at = lastParagraphPos(doc); doc = new I.wo(doc).insert(at, schema.text('abcdefghij'[k % 10])).doc; docs.push(doc); }
  const getText = d => I.mJr(d, editor.serialize);
  const keystroke = d => {
    const out = [JSON.stringify(d.toJSON()).length, store.serialize(d)];
    for (let t = 0; t < texts; t++) out.push(getText(d));
    for (let p = 0; p < prompts; p++) out.push(I.gBc(d, getText).prompt);
    return out;
  };
  // Warm up on other documents, then time.
  for (let w = 0; w < 20; w++) keystroke(new I.wo(base).insert(lastParagraphPos(base), schema.text('w')).doc);
  runs = 0;
  const outs = [];
  let t0 = performance.now();
  for (const d of docs) outs.push(keystroke(d));
  const total = performance.now() - t0, serialisations = runs / keys;
  // Parts, on fresh documents of the same size (one more key each, not timed above).
  const parts = { toJSON: 0, storeSerialize: 0, getText: 0, getChatGptPrompt: 0, plainText: 0, plainTextAgain: 0 };
  for (let k = 0; k < 40; k++) {
    const d = new I.wo(docs.at(-1)).insert(lastParagraphPos(docs.at(-1)), schema.text(String(k % 10))).doc;
    let a = performance.now(); d.toJSON(); let b = performance.now(); store.serialize(d); let c = performance.now();
    getText(d); let e = performance.now(); I.gBc(d, getText); let f = performance.now();
    const p1 = I.YB(d, { preserveTextLinkMarks: true }).content; let g = performance.now(); const p2 = I.YB(d, { preserveTextLinkMarks: true }).content; let h = performance.now();
    if (p1 !== p2) throw new Error('plain text differs between calls');
    parts.toJSON += b - a; parts.storeSerialize += c - b; parts.getText += e - c; parts.getChatGptPrompt += f - e; parts.plainText += g - f; parts.plainTextAgain += h - g;
  }
  for (const k in parts) parts[k] = +(parts[k] / 40).toFixed(3);
  record[size] = outs.map(o => o.join('\u0000'));
  let same = null;
  if (reference?.[size]) same = reference[size].every((v, i) => v === record[size][i]);
  console.log(JSON.stringify({ size: text.length, pasted: args.pasted === '1', blocks: base.childCount, keys, msPerKey: +(total / keys).toFixed(3), serialisationsPerKey: +serialisations.toFixed(2), firstReadMs: parts, sameAsReference: same }));
}
if (args.save) fs.writeFileSync(args.save, JSON.stringify(record));
