// Behaviour tests for the switchrender lane's startup edits, on minimal fixtures
// of the vendor code shapes they match.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { adapt } from './startup-harness.mjs';

// The code snippet component: highlight state, the per-instance highlight
// scheduler (ref state, effect, guard), the dispose effect and the lazily
// imported highlighter, reduced to what the edit matches and reads.
const snippetFixture = [
  'function YGi(e){let t=null;return()=>t??=e()}',
  'function Wf(e){return e()}',
  'var Rqi=YGi(()=>Wf(()=>import(`./highlight-code-abc123.js`),[],import.meta.url).catch(e=>null));',
  'function Mqi(e){let{content:m,language:f}=e,[de,fe]=(0,J9.useState)(null),pe;',
  'pe={disposed:!1,latestContent:m,latestLanguage:f,lastStartedAtMs:null,timeoutHandle:null};let me=(0,J9.useRef)(pe),_e=!0;',
  'let ve=()=>{let e=me.current;if(e.latestContent=m,e.latestLanguage=f,!_e||e.timeoutHandle!=null)return;',
  'let i=()=>{if(e.timeoutHandle=null,e.disposed)return;let t=e.latestContent,n=e.latestLanguage;e.lastStartedAtMs=0,Rqi().then(r=>{e.disposed||r==null||fe(r.highlightCode(t,n))})};i()};',
  '(0,J9.useEffect)(ve,[m,f]);',
  'let be=()=>{let e=me.current;return e.disposed=!1,()=>{e.disposed=!0,e.timeoutHandle!=null&&(clearTimeout(e.timeoutHandle),e.timeoutHandle=null)}};(0,J9.useEffect)(be,[]);',
  'return{html:de!=null&&m.startsWith(de.code)?de.html:null}}',
].join('\n');

// A small hook runtime: one component instance, synchronous re-render on setState.
function hooksRuntime() {
  let current = null;
  const J9 = {
    useState(init) {
      const inst = current, i = inst.index++;
      if (!(i in inst.slots)) inst.slots[i] = typeof init === 'function' ? init() : init;
      const set = inst.setters[i] ??= v => { inst.slots[i] = v; if (inst.mounted) inst.rerender(); };
      return [inst.slots[i], set];
    },
    useRef(v) { const inst = current, i = inst.index++; return inst.slots[i] ??= { current: v }; },
    useEffect(fn, deps) {
      const inst = current, i = inst.index++, old = inst.slots[i];
      if (old == null || deps.length !== old.deps.length || deps.some((d, k) => d !== old.deps[k])) inst.pending.push(() => { old?.cleanup?.(); inst.slots[i] = { deps, cleanup: fn() }; });
    },
  };
  function mount(Component, props) {
    const inst = { slots: [], setters: [], pending: [], mounted: true, output: null, props };
    inst.rerender = () => {
      current = inst; inst.index = 0; inst.output = Component(inst.props); current = null;
      const effects = inst.pending.splice(0); for (const run of effects) run();
    };
    inst.rerender();
    return {
      first: inst.output,
      get output() { return inst.output; },
      update(next) { inst.props = next; inst.rerender(); },
      unmount() { inst.mounted = false; for (const s of inst.slots) s?.cleanup?.(); },
    };
  }
  return { J9, mount };
}

function loadSnippet(source) {
  const { J9, mount } = hooksRuntime();
  const highlighter = { calls: 0, highlightCode(code, language) { this.calls++; return { code, html: `<b>${language ?? 'auto'}:${code}</b>`, language: language ?? 'auto' }; } };
  const module = Object.freeze({ highlightCode: (c, l) => highlighter.highlightCode(c, l) });
  // The fixture's dynamic import and import.meta are module-only syntax; stand them in after patching.
  const runnable = source.replace('import(`./highlight-code-abc123.js`)', 'Promise.resolve(ppTestModule)').replace('import.meta.url', '""');
  const sandbox = { J9, ppTestModule: module, clearTimeout, setTimeout };
  vm.runInNewContext(`${runnable};this.Mqi=Mqi;`, sandbox);
  return { highlighter, render: props => mount(sandbox.Mqi, props) };
}
const settle = () => new Promise(r => setTimeout(r, 0));

test('rememberedCodeHighlight starts a remounted code block from its kept highlight', async () => {
  const result = adapt({ shared: snippetFixture });
  assert.equal(result.applied.rememberedCodeHighlight, 'shared');
  const { highlighter, render } = loadSnippet(result.shared);

  const a = render({ content: 'let x = 1', language: 'js' });
  assert.equal(a.first.html, null);
  await settle();
  assert.equal(a.output.html, '<b>js:let x = 1</b>');
  assert.equal(highlighter.calls, 1);
  a.unmount();

  // Same content and language: highlighted on the first render, not highlighted again.
  const b = render({ content: 'let x = 1', language: 'js' });
  assert.equal(b.first.html, '<b>js:let x = 1</b>');
  await settle();
  assert.equal(highlighter.calls, 1);
  b.unmount();

  // Another language or content highlights as before.
  const c = render({ content: 'let x = 1', language: 'ts' });
  assert.equal(c.first.html, null);
  await settle();
  assert.equal(c.output.html, '<b>ts:let x = 1</b>');
  assert.equal(highlighter.calls, 2);
  c.unmount();
  const d = render({ content: 'let x = 1' });
  assert.equal(d.first.html, null);
  await settle();
  assert.equal(highlighter.calls, 3);

  // A later content change of a seeded block highlights the new content.
  const e = render({ content: 'let x = 1', language: 'ts' });
  assert.equal(e.first.html, '<b>ts:let x = 1</b>');
  e.update({ content: 'let x = 12', language: 'ts' });
  await settle();
  assert.equal(e.output.html, '<b>ts:let x = 12</b>');
  assert.equal(highlighter.calls, 4);
});

test('rememberedCodeHighlight keeps nothing that does not match the shown content', async () => {
  const { highlighter, render } = loadSnippet(adapt({ shared: snippetFixture }).shared);
  // Streaming: unmounted while the newest content has not been highlighted yet.
  const a = render({ content: 'print(', language: 'python' });
  await settle();
  a.update({ content: 'print(1)', language: 'python' });
  a.unmount();
  await settle();
  assert.equal(render({ content: 'print(1)', language: 'python' }).first.html, null);
  assert.equal(render({ content: 'print(', language: 'python' }).first.html, null);
  // A block that never highlighted keeps nothing either.
  const b = render({ content: 'x', language: 'c' });
  b.unmount();
  await settle();
  assert.equal(render({ content: 'x', language: 'c' }).first.html, null);
  assert.ok(highlighter.calls >= 1);
});

test('rememberedCodeHighlight bounds its cache by entries and characters', async () => {
  const { render } = loadSnippet(adapt({ shared: snippetFixture }).shared);
  const keep = async content => { const v = render({ content, language: 'js' }); await settle(); v.unmount(); };
  for (let i = 0; i <= 300; i++) await keep(`block ${i}`);
  assert.equal(render({ content: 'block 0', language: 'js' }).first.html, null, 'the oldest of 301 entries is evicted');
  assert.notEqual(render({ content: 'block 300', language: 'js' }).first.html, null);
  // Over a million characters of code plus HTML: not kept.
  const big = 'x'.repeat(600000);
  await keep(big);
  assert.equal(render({ content: big, language: 'js' }).first.html, null);
  // Several large blocks: the total stays within 4 million characters.
  const large = Array.from({ length: 6 }, (_, i) => String(i).repeat(400000));
  for (const content of large) await keep(content);
  assert.equal(render({ content: large[0], language: 'js' }).first.html, null);
  assert.notEqual(render({ content: large[5], language: 'js' }).first.html, null);
});

test('rememberedCodeHighlight leaves an unrecognised snippet unpatched', () => {
  const noGuard = snippetFixture.replace('!_e||e.timeoutHandle!=null', '!_e');
  const result = adapt({ shared: noGuard });
  assert.equal(result.applied.rememberedCodeHighlight, undefined);
  assert.match(result.skipped.rememberedCodeHighlight, /guards/);
  const noLoader = adapt({ shared: snippetFixture.replace('./highlight-code-abc123.js', './other-abc123.js') });
  assert.equal(noLoader.applied.rememberedCodeHighlight, undefined);
  // Unpatched, the component still highlights on every mount.
  const { highlighter, render } = loadSnippet(snippetFixture);
  return (async () => {
    const a = render({ content: 'a', language: 'js' }); await settle(); a.unmount();
    assert.equal(render({ content: 'a', language: 'js' }).first.html, null);
    await settle();
    assert.equal(highlighter.calls, 2);
  })();
});

// The markdown lexer's token cache: its limits and the eviction loop after an insert.
const lexFixture = [
  'var bKn,xKn,SKn,cache=new Map;function UZ(){bKn=100,xKn=6e6,SKn=1e6}UZ();',
  'function VZ(e){let a=e.length<=SKn?cache:void 0,o=`true:${e}`,s=a?.get(o);if(s!=null)return a?.delete(o),a?.set(o,s),s;let f=[{type:`paragraph`,raw:e}];',
  'if(a!=null){a.set(o,f);let e=0;for(let t of a.keys())e+=t.length;for(;a.size>bKn||e>xKn;){let t=a.keys().next().value;if(typeof t==`string`)a.delete(t),e-=t.length;else break}}return f}',
].join('\n');

test('largerMarkdownLexCache keeps up to 1000 entries within 2 million characters', () => {
  const result = adapt({ shared: lexFixture });
  assert.equal(result.applied.largerMarkdownLexCache, 'shared');
  const run = source => { const s = {}; vm.runInNewContext(`${source};this.VZ=VZ;this.cache=cache;`, s); return s; };
  const patched = run(result.shared), stock = run(lexFixture);
  for (let i = 0; i < 1200; i++) { patched.VZ(`message ${i} `.repeat(40)); stock.VZ(`message ${i} `.repeat(40)); }
  assert.equal(stock.cache.size, 100);
  assert.equal(patched.cache.size, 1000);
  const first = patched.VZ(`message 1199 `.repeat(40));
  assert.equal(patched.VZ(`message 1199 `.repeat(40)), first, 'a hit returns the cached tokens');
  // Large messages: evicted down to 2 million characters, but never below the stock limits.
  const p2 = run(result.shared), s2 = run(lexFixture);
  for (let i = 0; i < 300; i++) { p2.VZ(`${i}`.padEnd(10000, '.')); s2.VZ(`${i}`.padEnd(10000, '.')); }
  const chars = m => [...m.keys()].reduce((n, k) => n + k.length, 0);
  assert.equal(s2.cache.size, 100);
  assert.ok(chars(p2.cache) <= 2e6 && p2.cache.size >= 100, `${p2.cache.size} entries, ${chars(p2.cache)} chars`);
  for (const key of s2.cache.keys()) assert.ok(p2.cache.has(key));
  const p3 = run(result.shared), s3 = run(lexFixture);
  for (let i = 0; i < 20; i++) { p3.VZ(`${i}`.padEnd(400000, '.')); s3.VZ(`${i}`.padEnd(400000, '.')); }
  assert.deepEqual([...p3.cache.keys()], [...s3.cache.keys()], 'the stock limits still apply when they are the larger');
});

test('largerMarkdownLexCache leaves other limits unpatched', () => {
  const result = adapt({ shared: lexFixture.replace('bKn=100', 'bKn=50') });
  assert.equal(result.applied.largerMarkdownLexCache, undefined);
  assert.match(result.skipped.largerMarkdownLexCache, /cache limits/);
});
