// The Space sidebar's local page search (Wa in space-sidebar-*.js of build 20398), stock and patched, on
// generated page lists: ms per call while a query is typed one character at a time, and whether every
// result list is identical.
//
//   node --experimental-vm-modules --stack-size=4000 scripts/space-bench/search.mjs \
//     --assets <extracted app.asar>/webview/assets --patched <dir with the patched space-sidebar-*.js> [--pages 200,1000,3000]
//
// Pages have three-word titles, ~30-word previews and a random parent (a tree), and ten Spaces own the
// first ten root pages. The app runs this once per keystroke in the search field's change handler, and
// again during render when server results arrive.
import fs from 'node:fs';
import path from 'node:path';
import { load } from './loader.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') && a.push([x.slice(2), all[i + 1]]), a), []));
const assets = args.assets;
const name = fs.readdirSync(assets).find(n => /^space-sidebar-.*\.js$/.test(n));
// The chunk's top-level initialiser starts the whole sidebar module graph; only the search's own is run.
const strip = s => s.replace(/([A-Za-z_$][\w$]*)\(\);export\{([A-Za-z_$][\w$]* as SpaceSidebar)\}/, 'export{$2}');
async function searchFrom(source) {
  const env = await load({ assets, sources: { [name]: strip(source) }, exportsFor: { [name]: ['Wa', 'Za'] } });
  const S = await env.chunk(name);
  S.Za();
  return S.Wa;
}
const versions = { stock: await searchFrom(fs.readFileSync(path.join(assets, name), 'utf8')) };
if (args.patched) versions.patched = await searchFrom(fs.readFileSync(path.join(args.patched, name), 'utf8'));
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const words = 'project roadmap meeting notes design review weekly sync quarterly planning budget onboarding research interview launch metrics retro hiring product engineering marketing sales'.split(' ');
const sentence = n => Array.from({ length: n }, () => words[Math.floor(rnd() * words.length)]).join(' ');
for (const count of (args.pages ?? '200,1000,3000').split(',').map(Number)) {
  const pages = [];
  for (let i = 0; i < count; i++) pages.push({ page_id: `p${i}`, title: sentence(3), preview: sentence(30), parent: i < 20 ? null : { page_id: `p${Math.floor(rnd() * i)}` },
    deleted_at: null, access: { can_read: true }, updated_at: new Date(1.7e12 + i * 1e6).toISOString(), symbol: null, drive_space_id: null });
  const spaces = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: sentence(2), root_page_id: `p${i}`, updated_at: new Date(1.7e12).toISOString() }));
  const query = 'project roadmap', row = { pages: count }, outputs = {};
  for (const [label, Wa] of Object.entries(versions)) {
    for (let w = 0; w < 5; w++) Wa({ pages, query: query.slice(0, 3 + w), spaces });
    const times = [], out = [];
    for (let k = 1; k <= query.length; k++) { const a = performance.now(); out.push(JSON.stringify(Wa({ pages, query: query.slice(0, k), spaces }))); times.push(performance.now() - a); }
    times.sort((a, b) => a - b);
    row[label] = { msMedian: +times[times.length >> 1].toFixed(2), msMax: +times.at(-1).toFixed(2) };
    outputs[label] = out;
  }
  if (outputs.patched) row.identical = outputs.patched.every((o, i) => o === outputs.stock[i]);
  console.log(JSON.stringify(row));
}
