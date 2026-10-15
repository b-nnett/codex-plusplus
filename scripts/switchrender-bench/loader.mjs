// Loads the real ChatGPT webview chunks as ES modules in a vm context with the
// streaming benchmark's fake DOM (../streaming-bench/fakedom.mjs), like
// ../streaming-bench/loader.mjs, but any chunk's source can be replaced (a
// patched app-shared) and dynamic import() of other chunks works (the code
// snippet loads highlight-code-*.js that way). Internal bindings of app-shared
// are exposed by appending an `export {...}` statement. Needs
// --experimental-vm-modules.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { makeDom } from '../streaming-bench/fakedom.mjs';

export async function load({ assets, sources = {}, sharedExports = [] }) {
  const dom = makeDom();
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, queueMicrotask, performance,
    TextEncoder, TextDecoder, URL, URLSearchParams, AbortController, AbortSignal, Event: dom.Event, EventTarget,
    structuredClone, atob, btoa, crypto: globalThis.crypto, MessageChannel, Blob: globalThis.Blob, fetch: async () => { throw new Error('no fetch'); },
    Intl, WeakRef, FinalizationRegistry,
  };
  const ctx = vm.createContext(sandbox);
  const g = vm.runInContext('globalThis', ctx);
  Object.assign(g, dom.globals);
  g.window = g; g.self = g; g.top = g; g.parent = g;
  g.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 0);
  g.cancelAnimationFrame = id => clearTimeout(id);
  g.requestIdleCallback = cb => setTimeout(() => cb({ timeRemaining: () => 50, didTimeout: false }), 0);
  g.cancelIdleCallback = id => clearTimeout(id);
  const store = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
  g.localStorage = store(); g.sessionStorage = store();
  g.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  g.navigator = { userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit Chrome/140 Electron', platform: 'MacIntel', language: 'en-US', languages: ['en-US'], clipboard: {}, hardwareConcurrency: 8, maxTouchPoints: 0 };
  g.location = new URL('app://-/index.html');
  g.history = { pushState() {}, replaceState() {}, state: null, length: 1 };
  g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  g.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
  g.getComputedStyle = () => new Proxy({}, { get: (t, k) => k === 'getPropertyValue' ? () => '' : '' });
  g.addEventListener = () => {}; g.removeEventListener = () => {}; g.dispatchEvent = () => true;
  g.devicePixelRatio = 2; g.innerWidth = 1200; g.innerHeight = 800;
  g.CSS = { supports: () => false, escape: s => s };
  g.CustomEvent = class extends dom.Event { constructor(t, i = {}) { super(t, i); this.detail = i.detail; } };
  g.customElements = { define() {}, get() {}, whenDefined: () => Promise.resolve() };
  g.CSSStyleSheet = class { replaceSync() {} replace() { return Promise.resolve(this); } insertRule() {} get cssRules() { return []; } };

  const cache = new Map();
  const sharedName = fs.readdirSync(assets).find(n => /^app-shared-.*\.js$/.test(n));
  async function moduleFor(name) {
    if (cache.has(name)) return cache.get(name);
    let source = sources[name.replace(/-[0-9a-f]{12}\.js$/, '')] ?? fs.readFileSync(path.join(assets, name), 'utf8');
    if (name === sharedName) source += `\nexport{${sharedExports.map(n => `${n} as __pp_${n}`).join(',')}};`;
    const mod = new vm.SourceTextModule(source, {
      context: ctx, identifier: name,
      initializeImportMeta(meta) { meta.url = `app://-/assets/${name}`; },
      importModuleDynamically: async spec => {
        const m = await moduleFor(path.basename(spec));
        if (m.status === 'unlinked') await m.link(async s => moduleFor(path.basename(s)));
        if (m.status === 'linked') await m.evaluate();
        return m;
      },
    });
    cache.set(name, mod);
    return mod;
  }
  const shared = await moduleFor(sharedName);
  await shared.link(async spec => moduleFor(path.basename(spec)));
  await shared.evaluate();
  const ns = shared.namespace;
  const pick = new Proxy({}, { get: (t, k) => ns['__pp_' + String(k)] });
  // A chunk loaded on its own (e.g. highlight-code), with its static imports.
  const chunk = async prefix => {
    const m = await moduleFor(fs.readdirSync(assets).find(n => n.startsWith(prefix) && n.endsWith('.js')));
    if (m.status === 'unlinked') await m.link(async s => moduleFor(path.basename(s)));
    if (m.status === 'linked') await m.evaluate();
    return m.namespace;
  };
  return { shared: pick, chunk, dom, global: g };
}
