// The Page editor's callout split filter (dJ in content-*.js of build 20398), stock and patched, on a page
// parsed with the real page markdown converter: the time filterTransaction takes for one typed character.
//
//   node --experimental-vm-modules --stack-size=4000 scripts/space-bench/callout.mjs \
//     --assets <extracted app.asar>/webview/assets --patched <dir with the patched content-*.js> [--blocks 120,400] [--keys 2000]
//
// The converter's schema here has no callout node (the Page's own converter adds it), so the walk visits
// every node and finds none: the common case of a page without Highlight blocks.
import fs from 'node:fs';
import path from 'node:path';
import { load } from './loader.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') && a.push([x.slice(2), all[i + 1]]), a), []));
const assets = args.assets;
const contentName = fs.readdirSync(assets).find(n => n.startsWith('content-') && fs.readFileSync(path.join(assets, n), 'utf8').includes('spacePageCommentDecorations'));
const strip = s => s.replace(/([A-Za-z_$][\w$]*)\(\);export\{([A-Za-z_$][\w$]* as PageEditorContent)\}/, 'export{$2}');
async function filterFrom(source) {
  const env = await load({ assets, sources: { [contentName]: strip(source) }, exportsFor: { 'app-shared': ['VY'], 'app-initial': ['Vgo', 'Hje', 'Ugo'], [contentName]: ['dJ', 'mJ'] } });
  const I = await env.chunk('app-initial-');
  (await env.chunk('app-shared-')).VY();
  const C = await env.chunk(contentName);
  I.Ugo(); C.mJ();
  return { I, plugin: C.dJ() };
}
const stock = await filterFrom(fs.readFileSync(path.join(assets, contentName), 'utf8'));
const patched = await filterFrom(fs.readFileSync(path.join(args.patched, contentName), 'utf8'));
let seed = 3;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const words = 'the page keeps a shared document of blocks and each block is markdown text with comments anchored to ranges of it'.split(' ');
const sentence = n => Array.from({ length: n }, () => { const w = words[Math.floor(rnd() * words.length)], r = rnd(); return r < 0.06 ? `**${w}**` : r < 0.1 ? `*${w}*` : r < 0.13 ? `\`${w}\`` : r < 0.15 ? `[${w}](https://example.com)` : w; }).join(' ');
const page = blocks => Array.from({ length: blocks }, (_, i) => i % 9 === 0 ? `## ${sentence(4)}` : i % 9 === 3 ? Array.from({ length: 3 }, () => `- ${sentence(8)}`).join('\n') : sentence(30) + '.').join('\n\n');
for (const blocks of (args.blocks ?? '120,400').split(',').map(Number)) {
  const out = {};
  for (const [name, env] of [['stock', stock], ['patched', patched]]) {
    const pmu = env.I.Vgo({ isRichTableCellSupportEnabled: true });
    const state = env.I.Hje.create({ doc: pmu.parse(page(blocks)), plugins: [env.plugin] });
    const filter = env.plugin.spec.filterTransaction;
    const at = Math.floor(state.doc.content.size / 2);
    let pos = at; while (!state.doc.resolve(pos).parent.isTextblock) pos++;
    const trs = Array.from({ length: Number(args.keys ?? 2000) }, (_, k) => state.tr.insertText('abc'[k % 3], pos));
    for (const tr of trs.slice(0, 200)) filter(tr, state);
    const t0 = performance.now(); let kept = 0;
    for (const tr of trs) kept += filter(tr, state) ? 1 : 0;
    out[name] = { usPerKey: +((performance.now() - t0) * 1000 / trs.length).toFixed(1), allowed: kept };
  }
  console.log(JSON.stringify({ blocks, ...out }));
}
