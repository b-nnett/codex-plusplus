// Thread-switch benchmark for code blocks, on the real app-shared chunk (its code
// snippet component, React and react-dom) and the real highlight-code chunk
// (highlight.js with the app's grammars) of ChatGPT build 20398.
//
//   node --experimental-vm-modules --stack-size=4000 scripts/switchrender-bench/highlight.mjs \
//     --assets <extracted app.asar>/webview/assets [--adapter Sources/CodexPPCore/Resources/startup-adapter.js]
//     [--switches 6] [--blocks 10] [--compute 1] [--dom out.txt]
//
// Two threads of `blocks` code blocks each (2-8 KB slices of real source files in this
// repository, every third one without a language) are mounted alternately, as switching
// threads does: the transcript remounts, and each block renders with
// deferEnhancementsUntilVisible like the transcript's code blocks (the fake
// IntersectionObserver reports every block visible one task after it is observed).
// Each switch is timed from the render call until the DOM stops changing (all blocks
// highlighted), and the number of blocks already highlighted in the first committed render
// is counted. The first visit of each thread is reported separately (nothing remembered yet).
// With --compute 1 it also times highlightCode alone for one thread's blocks; --dom writes the
// serialised DOM after each visit settles, so two variants can be compared.
// With --adapter the app-shared chunk is first patched by that startup-adapter.js.
// The internal names it exports (Mqi, Uqi, kde, ...) are this build's minified names.
import fs from 'node:fs';
import vm from 'node:vm';
import { load } from './loader.mjs';

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

// Code: slices of real files, 2-8 KB, cut at line ends.
const files = [
  ['Sources/CodexPPCore/AppPatcher.swift', 'swift'], ['scripts/review-build.py', 'python'], ['scripts/media-bench/run.mjs', null],
  ['Sources/CodexPPCore/BuildReview.swift', 'swift'], ['scripts/streaming-bench/fakedom.mjs', 'javascript'], ['scripts/review-build.py', null],
  ['Tests/review-build.test.mjs', 'js'], ['scripts/media-bench/upload.html', 'html'], ['Sources/CodexPPCore/RendererPipeline.swift', null],
  ['scripts/check.sh', 'bash'], ['Package.swift', 'swift'], ['Sources/CodexPPCore/AppPatcher.swift', null],
];
const blocksPerThread = Number(args.blocks ?? 10);
const slice = (text, at, size) => { const s = text.indexOf('\n', at) + 1, e = text.indexOf('\n', s + size); return text.slice(s, e < 0 ? undefined : e); };
const thread = offset => Array.from({ length: blocksPerThread }, (_, i) => {
  const [file, language] = files[(i + offset) % files.length], text = fs.readFileSync(`${repo}/${file}`, 'utf8');
  const size = Math.min(2000 + ((i * 1777 + offset * 911) % 6000), text.length - 200);
  return { language: i % 3 === 2 ? undefined : language ?? undefined, content: slice(text, (offset * 3001 + i * 997) % Math.max(1, text.length - size - 100), size) };
});
const threads = [thread(0), thread(5)];

const env = await load({ assets, sources: { 'app-shared': shared }, sharedExports: ['Mqi', 'Uqi', 'K', 'kde', 'ph', 'THe', 'wHe'] });
const g = env.global;
g.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.on = true; } observe(el) { setTimeout(() => this.on && this.cb([{ isIntersecting: true, target: el }], this), 0); } unobserve() {} disconnect() { this.on = false; } takeRecords() { return []; } };
env.shared.Uqi(); env.shared.THe();
const { jsx } = env.shared.K(), { createRoot } = env.shared.kde(), { flushSync } = env.shared.ph(), Intl = env.shared.wHe, Mqi = env.shared.Mqi;
const { document } = env.dom;
const container = document.createElement('div'); document.body.appendChild(container);
const root = createRoot(container);
const view = (id, blocks) => jsx(Intl, { locale: 'en', defaultLocale: 'en', messages: {}, onError() {},
  children: jsx('div', { children: blocks.map((b, i) => jsx(Mqi, { content: b.content, language: b.language, deferEnhancementsUntilVisible: true }, `${id}-${i}`)) }) }, id);
const highlighted = () => (env.dom.serialize(container).match(/hljs-/g) ? container.childNodes[0].childNodes.filter(n => env.dom.serialize(n).includes('hljs-')).length : 0);
if (args.dom) fs.writeFileSync(args.dom, '');
const tick = () => new Promise(r => setTimeout(r, 0));

if (args.compute === '1') {
  const hc = await env.chunk('highlight-code-');
  for (let round = 0; round < 3; round++) {
    const t0 = performance.now();
    let html = 0;
    for (const b of threads[0]) html += hc.highlightCode(b.content, b.language).html.length;
    console.log(JSON.stringify({ compute: { round, ms: +(performance.now() - t0).toFixed(1), blocks: threads[0].length, chars: threads[0].reduce((s, b) => s + b.content.length, 0), htmlChars: html, unlabelled: threads[0].filter(b => !b.language).length } }));
  }
}

async function visit(index) {
  const id = `thread-${index}`, before = { ...env.dom.counters };
  const t0 = performance.now();
  flushSync(() => root.render(view(id, threads[index])));
  const firstMs = performance.now() - t0, atFirstRender = highlighted();
  // Settled: no DOM change for 30 consecutive timer tasks spanning at least 30 ms (a
  // long highlighting task counts as one tick, so it cannot end the wait early).
  let last = performance.now(), quiet = 0, snapshot = JSON.stringify(env.dom.counters);
  while (quiet < 30 || performance.now() - last < 30) {
    await tick();
    const now = JSON.stringify(env.dom.counters);
    if (now !== snapshot) { snapshot = now; last = performance.now(); quiet = 0; } else quiet++;
  }
  const settledMs = last - t0, done = highlighted();
  if (args.dom) fs.appendFileSync(args.dom, `${id}\n${env.dom.serialize(container)}\n`);
  const dom = Object.fromEntries(Object.entries(env.dom.counters).map(([k, v]) => [k, v - before[k]]));
  return { thread: index, firstRenderMs: +firstMs.toFixed(1), settledMs: +settledMs.toFixed(1), highlightedAtFirstRender: atFirstRender, highlightedAtEnd: done, dom };
}
// Warm-up: load the highlighter, JIT. Then a fresh pair of threads is not available
// without reloading, so the first visits are reported as such.
const first = [await visit(0), await visit(1)];
const switches = [];
for (let i = 0; i < Number(args.switches ?? 6); i++) switches.push(await visit(i % 2));
const mean = k => +(switches.reduce((s, x) => s + x[k], 0) / switches.length).toFixed(1);
console.log(JSON.stringify({ adapter: args.adapter ?? 'none', applied, first, switches, meanSwitch: { firstRenderMs: mean('firstRenderMs'), settledMs: mean('settledMs'), highlightedAtFirstRender: mean('highlightedAtFirstRender') } }, null, 1));
process.exit(0);
