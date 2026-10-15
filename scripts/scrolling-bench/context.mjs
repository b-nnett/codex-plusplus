// Scroll-context benchmark on the real thread-scroll-layout chunk (ThreadScrollLayout, its
// scroll-to-bottom button) and the real response-spacer chunk of ChatGPT build 20398, with
// React and react-dom from app-shared.
//
//   node --experimental-vm-modules --stack-size=4000 scripts/scrolling-bench/context.mjs \
//     --assets <extracted app.asar>/webview/assets [--adapter Sources/CodexPPCore/Resources/startup-adapter.js]
//     [--consumers 40] [--late 1] [--dom out.txt]
//
// The layout is mounted with the response spacer and `consumers` components that read the
// thread scroll context and key an effect on it (as the app's ~15 consumers do). The scroll
// element is then scrolled to a series of distances from the bottom, crossing the 24 px line
// four times, and each step reports how many consumers re-rendered, how many effects keyed on
// the context ran again, and whether the scroll-to-bottom button is shown; the totals include
// the response spacer's 101-threshold IntersectionObservers built after mount. With --late 1
// the consumers mount in a later commit than the layout (the scroll element already exists);
// otherwise in the same commit, where the spacer's layout effects find no scroll element.
// --dom writes the serialised DOM before and after scrolling, so variants can be compared.
// With --adapter the thread-scroll-layout chunk is first patched by that startup-adapter.js.
// Harness-only stubs, identical in both variants: two hooks of the layout that need app
// providers (an app scope and a Statsig gate, taken as "no" and "bottom origin"), the
// footer's ResizeObserver hook, and the spacer's reduced-motion hook.
import fs from 'node:fs';
import vm from 'node:vm';
import { load } from '../switchrender-bench/loader.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') && a.push([x.slice(2), all[i + 1]]), a), []));
const assets = args.assets ?? process.env.CODEXPP_WEBVIEW_ASSETS;
if (!assets) throw new Error('pass --assets <extracted app.asar>/webview/assets (or set CODEXPP_WEBVIEW_ASSETS)');
const repo = new URL('../..', import.meta.url).pathname;
const file = prefix => fs.readdirSync(assets).find(n => n.startsWith(prefix) && n.endsWith('.js'));
let layout = fs.readFileSync(`${assets}/${file('thread-scroll-layout-')}`, 'utf8'), applied = null;
if (args.adapter && args.adapter !== 'none') {
  const c = vm.createContext({});
  vm.runInContext(fs.readFileSync(`${repo}/Sources/CodexPPCore/Resources/acorn.js`, 'utf8'), c);
  vm.runInContext(fs.readFileSync(args.adapter, 'utf8'), c);
  c.input = { threadScrollLayout: layout, diagnostics: false };
  const result = vm.runInContext('CodexPPStartupAdapter.adapt(input)', c);
  applied = Object.keys(result.applied);
  layout = result.threadScrollLayout ?? layout;
}
const stub = (source, from, to) => { if (!source.includes(from)) throw new Error(`stub not found: ${from}`); return source.replace(from, to); };
for (const [from, to] of [['De=n(),D;', 'De=!1,D;'], ['T=p(`2004881635`)', 'T=!1'], ['Yt=le(Jt)', 'Yt=null']]) layout = stub(layout, from, to);
const spacer = stub(fs.readFileSync(`${assets}/${file('thread-response-space-controller-')}`, 'utf8'), 's=n(),{getScrollElement:c}=a', 's=!1,{getScrollElement:c}=a');

const env = await load({ assets, sources: { 'thread-scroll-layout': layout, 'thread-response-space-controller': spacer }, sharedExports: ['K', 'kde', 'ph', 'THe', 'wHe', 'o'] });
env.shared.THe(); // initialises the module that holds the Intl provider
const g = env.global;
// A column-reverse scroller: distance from the bottom is -scrollTop.
const El = g.Element.prototype;
Object.defineProperty(El, 'scrollTop', { get() { return this._st ?? 0; }, set(v) { this._st = v; }, configurable: true });
Object.defineProperty(El, 'clientHeight', { get() { return 800; }, configurable: true });
Object.defineProperty(El, 'scrollHeight', { get() { return 20000; }, configurable: true });
El.scrollTo = function ({ top }) { this._st = top; };
let observersBuilt = 0;
g.IntersectionObserver = class { constructor() { observersBuilt++; } observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
const { jsx, jsxs } = env.shared.K(), { createRoot } = env.shared.kde(), { flushSync } = env.shared.ph(), React = env.shared.o(), Intl = env.shared.wHe;
const layoutNs = await env.chunk('thread-scroll-layout-'), contextNs = await env.chunk('thread-scroll-controller-context-value-'), spacerNs = await env.chunk('thread-response-space-controller-');
layoutNs.n(); contextNs.n(); spacerNs.r(); spacerNs.a();
const useController = contextNs.r;
const counts = { renders: 0, setups: 0, contexts: new Set() };
function Consumer() {
  const c = useController();
  counts.renders++; counts.contexts.add(c);
  React.useEffect(() => { counts.setups++; return c.addScrollListener(() => {}); }, [c]);
  return null;
}
function Spacer() { const c = useController(); const [controller] = React.useState(() => new spacerNs.t(c)); return jsx(spacerNs.i, { controller }); }
const consumers = Number(args.consumers ?? 40);
const children = jsxs('div', { children: [jsx(Spacer, {}, 'spacer'), ...Array.from({ length: consumers }, (_, i) => jsx(Consumer, {}, i))] });
const container = env.dom.document.createElement('div'); env.dom.document.body.appendChild(container);
const root = createRoot(container);
const app = content => jsx(Intl, { locale: 'en', defaultLocale: 'en', messages: {}, onError() {},
  children: jsx(layoutNs.t, { children: content, scrollToBottomButton: {}, responseSpacer: null, footer: jsx('div', { children: 'footer' }) }) });
const tick = () => new Promise(r => setTimeout(r, 0));
if (args.late === '1') { flushSync(() => root.render(app(jsx('div', {})))); await tick(); }
flushSync(() => root.render(app(children)));
await tick(); await tick();
const nodes = []; (function visit(n) { nodes.push(n); n.childNodes.forEach(visit); })(container);
const scroller = nodes.find(n => n.nodeType === 1 && n.className.startsWith('thread-scroll-container') && n._listeners?.scroll?.length);
const footer = nodes.find(n => n.nodeType === 1 && n.getAttribute('data-thread-scroll-footer') === 'true');
const before = env.dom.serialize(container), base = { renders: counts.renders, setups: counts.setups, observers: observersBuilt };
const steps = [];
for (const distance of [0, 10, 30, 200, 600, 1200, 600, 30, 20, 0, 50, 0]) {
  const r = counts.renders, s = counts.setups;
  scroller._st = -distance;
  for (const f of [...scroller._listeners.scroll]) f({ type: 'scroll', target: scroller });
  await tick(); await tick();
  steps.push({ distance, consumerRenders: counts.renders - r, effectReruns: counts.setups - s, button: /<button aria-hidden="false"/.test(env.dom.serialize(footer)) ? 'shown' : 'hidden' });
}
if (args.dom) fs.writeFileSync(args.dom, `${before}\n----\n${env.dom.serialize(container)}\n`);
console.log(JSON.stringify({ applied, consumers, late: args.late === '1', steps,
  totals: { consumerRenders: counts.renders - base.renders, effectReruns: counts.setups - base.setups, contextObjects: counts.contexts.size, spacerObserversRebuilt: observersBuilt - base.observers } }));
process.exit(0);
