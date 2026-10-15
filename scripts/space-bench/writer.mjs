// The Page writer's cost per keystroke (applyEditor's OCo check, bCo and Vmo in app-initial of build 20398)
// when typing inside a long list or table, against typing in a paragraph: the whole edited top-level node
// is serialised to markdown again for every keystroke.
//
//   node --experimental-vm-modules --stack-size=4000 scripts/space-bench/writer.mjs --assets <extracted app.asar>/webview/assets
//     [--patched <dir with a patched app-initial-*.js>] [--items 10,50,200] [--keys 300] [--count 1] [--random 1 --seed 1]
//
// With --patched the same keystrokes run on both chunks, and every writer patch and the final markdown of every
// shared block must be identical. --random 1 types random characters (including markdown-sensitive ones),
// deletes and replaces at random places of random list items, table cells, code blocks and paragraphs
// instead of typing at the end of the middle item.
import fs from 'node:fs';
import path from 'node:path';
import { load } from './loader.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') && a.push([x.slice(2), all[i + 1]]), a), []));
const initialName = fs.readdirSync(args.assets).find(n => /^app-initial-.*\.js$/.test(n));
async function writer(source) {
  const env = await load({ assets: args.assets, sources: source ? { [initialName]: source } : {},
    exportsFor: { 'app-shared': ['VY'], 'app-initial': ['Kv', 'hgr', '_gr', 'Vgo', 'P$', 'bCo', 'Vmo', 'Hmo', 'OCo', 'Hje', 'DCo', 'MCo', 'd$', 'z$', 'HL', 'Ugo', 'zL', 'VL'] } });
  const I = await env.chunk('app-initial-');
  (await env.chunk('app-shared-')).VY();
  for (const init of ['HL', 'Ugo', 'z$', 'd$', 'MCo', 'DCo']) I[init]();
  const pmu = I.Vgo({ isRichTableCellSupportEnabled: true });
  const counts = { serialize: 0 };
  if (args.count) { const s = pmu.serialize; pmu.serialize = function (...a) { counts.serialize++; return s.apply(this, a); }; }
  return { I, pmu, counts };
}
const versions = { stock: await writer(null) };
if (args.patched) versions.patched = await writer(fs.readFileSync(path.join(args.patched, initialName), 'utf8'));

const line = i => `item ${i} with some **bold** text and \`code\` and a [link](https://example.com/${i})`;
const shapes = {
  paragraph: n => Array.from({ length: n }, (_, i) => line(i) + '.').join('\n\n'),
  list: n => Array.from({ length: n }, (_, i) => `- ${line(i)}` + (i % 7 === 3 ? `\n  - nested ${i}\n  - [ ] task ${i}` : '')).join('\n'),
  ordered: n => Array.from({ length: n }, (_, i) => `${i + 1}. ${line(i)}`).join('\n'),
  table: n => ['| a | b | c |', '| --- | --- | --- |', ...Array.from({ length: n }, (_, i) => `| ${i} | ${line(i)} | x |`)].join('\n'),
  mixed: n => [shapes.list(Math.max(2, n >> 2)), '```js\nconst a = 1;\nconst b = 2;\n```', shapes.ordered(Math.max(2, n >> 2)), shapes.table(Math.max(2, n >> 2)), shapes.paragraph(3)].join('\n\n'),
};
const chars = ['a', ' ', 'e', '*', '_', '`', '\\', '[', ']', '#', '|', '.', '1', '-', '**', 'x y', '<', '&'];
function run({ I, pmu, counts }, shape, n, seedStart) {
  let seed = seedStart; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const doc = pmu.parse(shapes[shape](n)), ydoc = new I.Kv(), roots = I.hgr(ydoc);
  ydoc.transact(() => I.P$(doc, pmu).forEach((u, index) => I._gr(roots, { id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, index, markdown: u.markdown, kind: u.kind })));
  let state = I.Hje.create({ doc });
  let pos = null; state.doc.descendants((node, p) => { if (node.isTextblock && pos == null && p > state.doc.content.size / 2) pos = p + node.nodeSize - 1; });
  const keys = Number(args.keys ?? 300), record = [];
  let total = 0, applied = 0; counts.serialize = 0;
  for (let k = 0; k < keys + 30; k++) {
    let tr;
    if (args.random) {
      const blocks = []; state.doc.descendants((node, p) => { if (node.isTextblock) blocks.push({ from: p + 1, to: p + node.nodeSize - 1 }); });
      const b = blocks[Math.floor(rnd() * blocks.length)], at = b.from + Math.floor(rnd() * (b.to - b.from + 1)), r = rnd();
      if (r < 0.6 || at >= b.to) tr = state.tr.insertText(chars[Math.floor(rnd() * chars.length)], at);
      else { const end = Math.min(b.to, at + 1 + Math.floor(rnd() * 3)); tr = r < 0.85 ? state.tr.delete(at, end) : state.tr.insertText(chars[Math.floor(rnd() * chars.length)], at, end); }
    } else { tr = state.tr.insertText('abc '[k % 4], pos); pos++; }
    const before = state.doc; state = state.apply(tr);
    const t0 = performance.now();
    let patch = null;
    if (I.OCo(ydoc, before, before, pmu)) { patch = I.bCo(ydoc, state.doc, before, pmu, tr); if (patch != null && I.Hmo(ydoc, patch) == null) { I.Vmo(ydoc, patch); applied++; } }
    if (k >= 30) total += performance.now() - t0;
    if (args.patched) record.push(JSON.stringify(patch, (key, v) => key === 'image' && v === undefined ? '<undefined>' : v));
  }
  const blocks = I.VL(I.zL(ydoc)).map(b => `${b.id}:${b.kind}:${b.text.toJSON()}`);
  return { ms: +(total / keys).toFixed(3), serialize: +(counts.serialize / (keys + 30)).toFixed(2), applied, record: record.concat(blocks) };
}
const seeds = Number(args.seeds ?? 1);
for (const n of (args.items ?? '10,50,200').split(',').map(Number)) {
  const row = { items: n };
  for (const shape of Object.keys(shapes)) {
    if (!args.random && shape === 'mixed') continue;
    for (let s = 0; s < seeds; s++) {
      const seed = Number(args.seed ?? 1) + s, results = {};
      for (const [label, version] of Object.entries(versions)) results[label] = run(version, shape, n, seed);
      const cell = row[shape] ??= {};
      for (const [label, r] of Object.entries(results)) { (cell[label] ??= []).push(r.ms); if (args.count) cell[`${label}Serialize`] = r.serialize; }
      if (results.patched) {
        const same = results.patched.record.every((v, i) => v === results.stock.record[i]) && results.patched.record.length === results.stock.record.length;
        cell.identical = (cell.identical ?? true) && same;
        if (!same) { const i = results.patched.record.findIndex((v, j) => v !== results.stock.record[j]); console.log('DIFFERENT', shape, n, seed, i, results.stock.record[i]?.slice(0, 300), '\n vs', results.patched.record[i]?.slice(0, 300)); }
      }
    }
    for (const [key, v] of Object.entries(row[shape])) if (Array.isArray(v)) row[shape][key] = +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3);
  }
  console.log(JSON.stringify({ msPerKey: row }));
}
