// Thread-switch benchmark for markdown lexing, on the real shared lexer function of
// ChatGPT build 20398's app-shared chunk (VZ: marked plus the app's extensions and
// post-passes, behind its LRU token cache).
//
//   node --experimental-vm-modules --stack-size=4000 --expose-gc scripts/switchrender-bench/markdown.mjs \
//     --assets <extracted app.asar>/webview/assets [--adapter Sources/CodexPPCore/Resources/startup-adapter.js]
//     [--threads 3] [--messages 40] [--size 4000] [--rounds 4] [--scans 0] [--memory 1]
//
// `threads` threads of `messages` assistant messages (../streaming-bench/corpus.mjs, about
// `size` characters each) are visited in turn, `rounds` times; a visit lexes every message
// of the thread, as remounting the transcript does (VZ(text, undefined)). With --scans 1
// each visit also lexes one derived text per message (the message with a trailing line),
// standing in for the background scans that lex texts other than the rendered ones. The
// first round (cold cache) is reported apart from the later ones. With --memory 1 it fills
// the cache with distinct messages and reports the retained heap (needs --expose-gc).
// With --adapter the app-shared chunk is first patched by that startup-adapter.js.
import fs from 'node:fs';
import vm from 'node:vm';
import { load } from './loader.mjs';
import { markdown } from '../streaming-bench/corpus.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') && a.push([x.slice(2), all[i + 1]]), a), []));
const assets = args.assets ?? process.env.CODEXPP_WEBVIEW_ASSETS;
if (!assets) throw new Error('pass --assets <extracted app.asar>/webview/assets (or set CODEXPP_WEBVIEW_ASSETS)');
const repo = new URL('../..', import.meta.url).pathname;
const sharedName = fs.readdirSync(assets).find(n => /^app-shared-.*\.js$/.test(n));
let shared = fs.readFileSync(`${assets}/${sharedName}`, 'utf8'), applied = null;
if (args.adapter && args.adapter !== 'none') {
  const c = vm.createContext({});
  vm.runInContext(fs.readFileSync(`${repo}/Sources/CodexPPCore/Resources/acorn.js`, 'utf8'), c);
  vm.runInContext(fs.readFileSync(args.adapter, 'utf8'), c);
  c.input = { shared, diagnostics: false };
  const result = vm.runInContext('CodexPPStartupAdapter.adapt(input)', c);
  applied = Object.keys(result.applied).filter(k => result.applied[k] === 'shared');
  shared = result.shared ?? shared;
}
const env = await load({ assets, sources: { 'app-shared': shared }, sharedExports: ['VZ', 'UZ'] });
env.shared.UZ();
const VZ = env.shared.VZ;
const nThreads = Number(args.threads ?? 3), nMessages = Number(args.messages ?? 40), size = Number(args.size ?? 4000);
const threads = Array.from({ length: nThreads }, (_, t) => Array.from({ length: nMessages }, (_, m) => markdown({ seed: 1 + t * 1000 + m, size })));
const scans = args.scans === '1';

if (args.memory === '1') {
  if (typeof gc !== 'function') throw new Error('--memory needs --expose-gc');
  const count = Number(args.count ?? 1200), texts = Array.from({ length: count }, (_, i) => markdown({ seed: 900000 + i, size }));
  gc(); gc(); const base = process.memoryUsage().heapUsed;
  for (const t of texts) VZ(t, undefined);
  gc(); gc(); const filled = process.memoryUsage().heapUsed;
  // How many of them the cache kept: a hit returns the same array.
  let kept = 0; for (const t of texts) { const a = VZ(t, undefined), b = VZ(t, undefined); if (a === b) kept++; }
  console.log(JSON.stringify({ adapter: args.adapter ?? 'none', memory: { lexed: count, charsEach: Math.round(texts.reduce((s, t) => s + t.length, 0) / count), retainedMB: +((filled - base) / 2 ** 20).toFixed(1) } }));
  process.exit(0);
}

const visits = [];
for (let round = 0; round < Number(args.rounds ?? 4); round++) {
  for (let t = 0; t < nThreads; t++) {
    const t0 = performance.now();
    for (const text of threads[t]) { VZ(text, undefined); if (scans) VZ(text + '\n\n.', undefined); }
    visits.push({ round, thread: t, ms: performance.now() - t0 });
  }
}
const mean = list => +(list.reduce((s, v) => s + v.ms, 0) / list.length).toFixed(2);
console.log(JSON.stringify({ adapter: args.adapter ?? 'none', applied, threads: nThreads, messages: nMessages, chars: Math.round(threads.flat().reduce((s, t) => s + t.length, 0) / (nThreads * nMessages)), scans,
  firstRoundMeanMs: mean(visits.filter(v => v.round === 0)), laterVisitMeanMs: mean(visits.filter(v => v.round > 0)), visits: visits.map(v => +v.ms.toFixed(1)) }));
process.exit(0);
