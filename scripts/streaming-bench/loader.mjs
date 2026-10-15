// Loads the real ChatGPT webview chunks (rolldown-runtime, app-shared, app-initial) as
// ES modules in a vm context with a minimal fake DOM, and exposes internal bindings
// by appending `export {...}` statements. Run with --experimental-vm-modules.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { makeDom } from './fakedom.mjs';

// A virtual clock for the page (performance.now, Date.now): the benchmark advances it one frame at a time,
// so time-dependent output (fade delays) is the same in every run.
export const clock = { t: 1000, now() { return this.t; }, mark() {}, measure() {}, getEntriesByName() { return []; }, timeOrigin: 0 };
export async function load({ assets, initialSource, initialExports = [], sharedExports = [] }) {
  const dom = makeDom();
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, performance: clock,
    TextEncoder, TextDecoder, URL, URLSearchParams, AbortController, AbortSignal, Event: dom.Event, EventTarget,
    structuredClone, atob, btoa, crypto: globalThis.crypto, MessageChannel, Blob: globalThis.Blob, fetch: async () => { throw new Error('no fetch'); },
    Intl, WeakRef, FinalizationRegistry,
  };
  const ctx = vm.createContext(sandbox);
  const g = vm.runInContext('globalThis', ctx);
  Object.assign(g, dom.globals);
  g.window = g; g.self = g; g.top = g; g.parent = g;
  g.requestAnimationFrame = cb => setTimeout(() => cb(clock.now()), 0);
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
  g.electronBridge = undefined;
  g.addEventListener = () => {}; g.removeEventListener = () => {}; g.dispatchEvent = () => true;
  g.devicePixelRatio = 2; g.innerWidth = 1200; g.innerHeight = 800;
  g.CSS = { supports: () => false, escape: s => s };
  g.CustomEvent = class extends dom.Event { constructor(t, i = {}) { super(t, i); this.detail = i.detail; } };
  g.customElements = { define() {}, get() {}, whenDefined: () => Promise.resolve() };
  g.CSSStyleSheet = class { replaceSync() {} replace() { return Promise.resolve(this); } insertRule() {} get cssRules() { return []; } };

  const cache = new Map();
  const readAsset = name => fs.readFileSync(path.join(assets, name), 'utf8');
  async function moduleFor(name) {
    if (cache.has(name)) return cache.get(name);
    let source;
    if (name.startsWith('app-initial-')) source = initialSource + `\nexport{${initialExports.map(n => `${n} as __pp_${n}`).join(',')}};`;
    else if (name.startsWith('app-shared-')) source = readAsset(name) + `\nexport{${sharedExports.map(n => `${n} as __pp_${n}`).join(',')}};`;
    else source = readAsset(name);
    const mod = new vm.SourceTextModule(source, {
      context: ctx, identifier: name,
      initializeImportMeta(meta) { meta.url = `app://-/assets/${name}`; },
      importModuleDynamically: async spec => { throw new Error('dynamic import disabled: ' + spec); },
    });
    cache.set(name, mod);
    return mod;
  }
  const initialName = fs.readdirSync(assets).find(n => /^app-initial-.*\.js$/.test(n));
  const root = await moduleFor(initialName);
  await root.link(async spec => moduleFor(spec.replace(/^\.\//, '')));
  await root.evaluate();
  const shared = cache.get(fs.readdirSync(assets).find(n => /^app-shared-.*\.js$/.test(n)));
  const pick = ns => new Proxy({}, { get: (t, k) => ns['__pp_' + String(k)], ownKeys: () => Object.keys(ns).filter(k => k.startsWith('__pp_')).map(k => k.slice(5)), getOwnPropertyDescriptor: (t, k) => ({ enumerable: true, configurable: true, value: ns['__pp_' + String(k)] }) });
  return { initial: pick(root.namespace), shared: pick(shared.namespace), dom, global: g };
}
