// Streaming-reply benchmark on the real app-initial chunk of ChatGPT build 20398.
//
//   node --experimental-vm-modules --stack-size=4000 scripts/streaming-bench/bench.mjs \
//     --assets <extracted app.asar>/webview/assets [--adapter Sources/CodexPPCore/Resources/startup-adapter.js]
//     [--save patched.js | --source patched.js] [--size 30000] [--delta 24] [--seed 1] [--animate 1]
//     [--settle 18] [--crlf 1] [--frames N] [--dom hashes.txt] [--final dom.html] [--scan 1]
//
// Loads the real rolldown-runtime, app-shared and app-initial chunks as ES modules in a vm
// with a small fake DOM (loader.mjs, fakedom.mjs), renders the real streaming markdown
// component with the bundled react-dom, and replays a generated reply (corpus.mjs) as one
// frame per `delta` characters (flushSync per frame), with a virtual clock advancing 1/60 s
// per frame. Fade-ins "finish" `settle` frames after an element mounts (its onAnimationEnd
// is called). Reports per-frame render+commit time; --dom writes a hash of the serialised
// DOM after every frame so two variants can be compared; --scan times only the text-level
// steps (open-markdown closing, block-boundary scan, prefix-cached lexing).
// With --adapter the chunk is first patched by that startup-adapter.js (only the `initial`
// input is given); --save/--source keep the patched chunk to skip that step next time.
// The internal names it exports (Gsl, Asl, kde, ...) are this build's minified names.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { load, clock } from './loader.mjs';
import { markdown } from './corpus.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') && a.push([x.slice(2), all[i + 1]]), a), []));
const assets = args.assets ?? process.env.CODEXPP_WEBVIEW_ASSETS;
if (!assets) throw new Error('pass --assets <extracted app.asar>/webview/assets (or set CODEXPP_WEBVIEW_ASSETS)');
const repo = new URL('../..', import.meta.url).pathname;
const initialName = fs.readdirSync(assets).find(n => /^app-initial-.*\.js$/.test(n));
let source = fs.readFileSync(`${assets}/${initialName}`, 'utf8');
let applied = null;
if (args.source) source = fs.readFileSync(args.source, 'utf8');
if (args.adapter && args.adapter !== 'none') {
  const c = vm.createContext({});
  vm.runInContext(fs.readFileSync(`${repo}/Sources/CodexPPCore/Resources/acorn.js`, 'utf8'), c);
  vm.runInContext(fs.readFileSync(args.adapter, 'utf8'), c);
  c.input = { initial: source, diagnostics: false };
  const result = vm.runInContext('CodexPPStartupAdapter.adapt(input)', c);
  applied = Object.keys(result.applied).filter(k => result.applied[k] === 'initial');
  source = result.initial ?? source;
  if (args.save) fs.writeFileSync(args.save, source);
}
// The inline-DIL Statsig gate needs the app's signal scope provider; the benchmark has none, so
// it reads as off (the same in every variant).
if (source.split('U=fs(`2957382457`)').length !== 2) throw new Error('gate not found');
source = source.replace('U=fs(`2957382457`)', 'U=!1');
const size = Number(args.size ?? 30000), delta = Number(args.delta ?? 24), animate = args.animate !== '0', settleFrames = Number(args.settle ?? 18);
const text = markdown({ seed: Number(args.seed ?? 1), size, crlf: args.crlf === '1' });
const env = await load({ assets, initialSource: source, initialExports: ['Gsl', 'Ksl', 'us', 'W', 'Asl', 'Msl', 'g6c', 'Vte', 'ksl', 'q'], sharedExports: ['kde', 'ph', 'ult', 'THe', 'wHe', 'jI', 'ARt', 'hPi', 'gPi'] });
env.initial.Ksl();
if (args.scan) {
  // The text-level steps of each streaming frame on their own: closing open markdown (g6c(Vte(text))),
  // the block-boundary scan (Msl) and the cached-prefix lexing (Asl, which calls Msl).
  const { g6c, Vte, Msl, Asl, ksl } = env.initial, cache = ksl(), t = { close: 0, boundary: 0, lex: 0 };
  let frames = 0;
  for (let k = delta; k < text.length + delta; k += delta, frames++) {
    let t0 = performance.now(); const md = g6c(Vte(text.slice(0, Math.min(k, text.length))), []).markdown;
    let t1 = performance.now(); Msl(md); let t2 = performance.now(); Asl(md, undefined, cache); let t3 = performance.now();
    t.close += t1 - t0; t.boundary += t2 - t1; t.lex += t3 - t2;
  }
  console.log(JSON.stringify({ chars: text.length, frames, perFrameMs: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, +(v / frames).toFixed(4)])) }));
  process.exit(0);
}
const { jsx } = env.initial.W(), { createRoot } = env.shared.kde(), { flushSync } = env.shared.ph();
const { document } = env.dom;
const container = document.createElement('div'); document.body.appendChild(container);
const root = createRoot(container);
const Gsl = env.initial.Gsl, Scope = env.shared.ult, appScope = env.initial.q;
env.shared.THe(); env.shared.jI(); env.shared.ARt({}, () => {}); const Intl = env.shared.wHe;
env.shared.gPi(); const observer = new env.global.ResizeObserver(() => {});
const view = p => jsx(Intl, { locale: 'en', defaultLocale: 'en', messages: {}, onError() {}, children: jsx(Scope, { scope: appScope, children: jsx(env.shared.hPi.Provider, { value: observer, children: jsx(Gsl, p) }) }) });
const props = { isStreaming: true, animate, adaptiveStreaming: true, fadeSegmentDelayMs: 0, textStyle: { kind: 'assistant-message' }, conversationId: 'conv', cwd: '/tmp/project', turnId: 'turn-1', allowWideBlocks: true, className: 'markdown' };
const firstSeen = new WeakMap();
const propsKey = el => Object.keys(el).find(k => k.startsWith('__reactProps$'));
function settle(frame) {
  // Simulate CSS animationend: fire onAnimationEnd for elements mounted `settleFrames` frames ago.
  const stack = [container];
  while (stack.length) {
    const n = stack.pop();
    if (n.nodeType === 1) {
      const k = propsKey(n), p = k && n[k];
      if (p?.onAnimationEnd) {
        const seen = firstSeen.get(n) ?? (firstSeen.set(n, frame), frame);
        if (frame - seen >= settleFrames) p.onAnimationEnd({ target: n, currentTarget: n });
      }
    }
    for (const c of n.childNodes) stack.push(c);
  }
}
const times = [], counters = env.dom.counters;
const domOut = args.dom ? fs.openSync(args.dom, 'w') : null;
let frame = 0;
const ends = [];
for (let k = delta; k < text.length + delta; k += delta) ends.push(Math.min(k, text.length));
const maxFrames = Number(args.frames ?? ends.length);
for (const end of ends.slice(0, maxFrames)) {
  clock.t += 1000 / 60;
  const t0 = performance.now();
  flushSync(() => root.render(view({ ...props, children: text.slice(0, end) })));
  times.push(performance.now() - t0);
  if (animate) settle(frame);
  if (domOut != null) fs.writeSync(domOut, `${frame} ${crypto.createHash('sha1').update(env.dom.serialize(container)).digest('hex')}\n`);
  frame++;
}
// Streaming ends: the same text, not streaming.
const tEnd0 = performance.now();
flushSync(() => root.render(view({ ...props, isStreaming: false, children: text })));
const tEnd = performance.now() - tEnd0;
const finalDom = env.dom.serialize(container);
if (domOut != null) { fs.writeSync(domOut, `final ${crypto.createHash('sha1').update(finalDom).digest('hex')}\n`); fs.closeSync(domOut); }
if (args.final) fs.writeFileSync(args.final, finalDom);
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const sum = a => a.reduce((x, y) => x + y, 0);
const n = times.length, tail = times.slice(Math.floor(n * 0.75));
console.log(JSON.stringify({
  adapter: args.adapter ?? 'none', applied, chars: text.length, frames: n, animate,
  totalMs: +sum(times).toFixed(1), meanMs: +(sum(times) / n).toFixed(3), p50: +q(times, 0.5).toFixed(3), p95: +q(times, 0.95).toFixed(3),
  lastQuarterMeanMs: +(sum(tail) / tail.length).toFixed(3), endRenderMs: +tEnd.toFixed(2), dom: { ...counters }, finalDomLength: finalDom.length,
}));
process.exit(0);
