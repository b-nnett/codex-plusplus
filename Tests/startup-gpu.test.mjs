// Tests for the gpu lane of startup edits (readyPulseOpacity, blossomShimmerTransform)
// and the pet-window exclusion in the compositor shimmer.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {adapt} from './startup-harness.mjs';

// Minimal shapes of the vendor code: a lazily initialised CSS module class map, as
// rolldown emits it (`e` wraps the initialiser; class names are hashed).
const readyModule = 'var vTs,yTs,bTs;function xTs(){return(xTs=e((()=>{vTs=`_PrimaryAction_5lfkl_23`,yTs=`_ReadyPulse_5lfkl_39`,' +
  'bTs={PrimaryAction:vTs,"ready-border-pulse":`_ready-border-pulse_5lfkl_48`,ReadyPulse:yTs,"ready-pulse":`_ready-pulse_5lfkl_48`}})))()}';
const blossomModule = 'var lLn,uLn,dLn,fLn,pLn;function mLn(){return(mLn=e((()=>{lLn=`_Root_htamq_11`,uLn=`_Base_htamq_40`,dLn=`_Overlay_htamq_47`,' +
  'fLn=`_shimmer_htamq_67`,pLn={Root:lLn,Base:uLn,Overlay:dLn,shimmer:fLn}})))()}';
const initial = `${readyModule};${blossomModule};`;
// The vendor rules, as in app-initial's stylesheet.
const readyCss = '@keyframes _ready-pulse_5lfkl_48{0%,to{background-color:var(--ready-pulse-from)}50%{background-color:var(--ready-pulse-to)}}' +
  '@keyframes _ready-border-pulse_5lfkl_48{0%,to{border-color:var(--ready-pulse-from)}50%{border-color:var(--ready-pulse-to)}}' +
  '._PrimaryAction_5lfkl_23{position:relative;overflow:hidden}' +
  '._PrimaryAction_5lfkl_23[data-animate-ready]{--ready-pulse-from:var(--color-background-info-solid);--ready-pulse-to:color-mix(in srgb, var(--color-background-info-solid) 92%, black 8%);animation:4s ease-in-out infinite _ready-border-pulse_5lfkl_48}' +
  '._ReadyPulse_5lfkl_39{pointer-events:none;background-color:var(--color-background-info-solid);position:absolute;inset:0}' +
  '._ReadyPulse_5lfkl_39[data-animate-ready]{animation:4s ease-in-out infinite _ready-pulse_5lfkl_48}';
const blossomCss = '._Base_htamq_40{width:100%;height:100%}' +
  '._Overlay_htamq_47{pointer-events:none;background-image:linear-gradient(112deg, transparent 22%, var(--openai-blossom-shimmer-soft) 38%, var(--openai-blossom-shimmer-peak) 49%, var(--openai-blossom-shimmer-tail) 56%, transparent 74%);' +
  'background-position:140% 0;background-repeat:no-repeat;background-size:220% 100%;animation:2.2s cubic-bezier(.4,0,.2,1) infinite _shimmer_htamq_67;position:absolute;inset:0}' +
  ':root[data-reduced-motion=true] ._Overlay_htamq_47{animation:none}' +
  '@keyframes _shimmer_htamq_67{0%{background-position:140% 0}to{background-position:-105% 0}}';
const css = {'webview/assets/app-initial-x.css': `.a{b:c}${readyCss}${blossomCss}`, 'webview/assets/app-shared-x.css': '.x{y:z}'};

// Runs a patched module and initialises both class maps; returns the maps and the
// stylesheets the initialisers appended.
function run(source, {appendThrows = false} = {}) {
  const styles = [];
  const document = {head: {append(el) { if (appendThrows) throw new Error('detached'); styles.push(el.textContent); }}, createElement: () => ({textContent: ''})};
  const sandbox = {document, e: f => f};
  vm.runInNewContext(`${source};xTs();mLn();`, sandbox);
  return {ready: sandbox.bTs, blossom: sandbox.pLn, styles};
}

test('readyPulseOpacity: the pulse becomes an opacity fade of a layer painted in the pulse colour', () => {
  const {applied, skipped, initial: patched} = adapt({initial, css});
  assert.equal(applied.readyPulseOpacity, 'initial', JSON.stringify(skipped));
  const {ready, styles} = run(patched);
  assert.equal(ready.ReadyPulse, '_ReadyPulse_5lfkl_39', 'the class map is unchanged');
  const style = styles.find(s => s.includes('_ReadyPulse_5lfkl_39'));
  assert.ok(style, 'the override is appended when the module initialises');
  // Both vendor animations (background-color, border-color) are switched off.
  assert.ok(style.startsWith('._PrimaryAction_5lfkl_23[data-animate-ready],._ReadyPulse_5lfkl_39[data-animate-ready]{animation:none!important}'));
  // The fade layer: pulse-to colour, same duration, easing and iteration, opacity keyframes at the same offsets.
  assert.ok(style.includes('._ReadyPulse_5lfkl_39[data-animate-ready]::before{content:"";position:absolute;inset:0;pointer-events:none;background-color:var(--ready-pulse-to);opacity:0;animation:4s ease-in-out infinite codexpp-ready-pulse}'));
  assert.ok(style.includes('@keyframes codexpp-ready-pulse{0%,to{opacity:0}50%{opacity:1}}'));
  assert.doesNotMatch(style.replace(/background-color:var\(--ready-pulse-to\)/, ''), /background-color|border-color/, 'nothing animates a painted property');
  assert.ok(style.includes(':root[data-codexpp-blurred] ._ReadyPulse_5lfkl_39[data-animate-ready]::before{animation-play-state:paused}'), 'pauses in an unfocused window');
});

test('readyPulseOpacity: falls back to the original pulse', () => {
  // A failing append leaves the module's initialiser working (original CSS applies).
  const {initial: patched} = adapt({initial, css});
  const {ready, styles} = run(patched, {appendThrows: true});
  assert.equal(ready.PrimaryAction, '_PrimaryAction_5lfkl_23');
  assert.equal(styles.length, 0);
  // Stylesheets not given, or rules of another shape: the edit is skipped.
  assert.match(adapt({initial}).skipped.readyPulseOpacity, /expected one match, found 0/);
  const variants = [
    readyCss.replace('50%{background-color:var(--ready-pulse-to)}', '50%{background-color:var(--ready-pulse-to);transform:scale(1.02)}'),
    readyCss.replace('._PrimaryAction_5lfkl_23{position:relative;overflow:hidden}', '._PrimaryAction_5lfkl_23{position:relative;overflow:hidden;border-width:1px}'),
    readyCss.replace('background-color:var(--color-background-info-solid);position', 'background-color:red;position'),
    readyCss + '._ReadyPulse_5lfkl_39[data-animate-ready]{opacity:.5}',
  ];
  for (const variant of variants) {
    const result = adapt({initial, css: {'webview/assets/app-initial-x.css': variant + blossomCss}});
    assert.match(result.skipped.readyPulseOpacity, /expected one match, found 0/, variant);
    assert.ok(!(result.initial ?? initial).includes('ppReadyPulseStyle'));
  }
});

test('blossomShimmerTransform: the logo sweep slides a painted gradient instead of moving its background', () => {
  const {applied, skipped, initial: patched} = adapt({initial, css});
  assert.equal(applied.blossomShimmerTransform, 'initial', JSON.stringify(skipped));
  const {blossom, styles} = run(patched);
  assert.equal(blossom.Overlay, '_Overlay_htamq_47');
  const style = styles.find(s => s.includes('_Overlay_htamq_47'));
  assert.ok(style.startsWith('._Overlay_htamq_47{animation:none!important;background-size:0 0!important}'), 'the overlay itself no longer paints or animates');
  assert.ok(style.includes('._Overlay_htamq_47::before{content:"";position:absolute;top:0;left:0;width:220%;height:100%;pointer-events:none;background-image:inherit;'),
    'the same gradient, on a box of the gradient\'s size');
  // background-position 140% -> -105% of a 220% image is (100-220)*p/220 % of the image's own width.
  assert.ok(style.includes('animation:2.2s cubic-bezier(.4,0,.2,1) infinite codexpp-blossom-shimmer'), 'same duration and easing');
  assert.ok(style.includes('@keyframes codexpp-blossom-shimmer{0%{transform:translateX(-76.363636%)}to{transform:translateX(57.272727%)}}'));
  assert.ok(style.includes('transform:translateX(-76.363636%);'), 'rests at the starting position');
  assert.ok(style.includes(':root[data-reduced-motion=true] ._Overlay_htamq_47::before{animation:none}'));
  const width = 220, place = p => (100 - width) / 100 * p / 100;   // offset in box widths
  assert.ok(Math.abs(-0.76363636 * width / 100 - place(140)) < 1e-6 && Math.abs(0.57272727 * width / 100 - place(-105)) < 1e-6);
});

test('blossomShimmerTransform: falls back to the original sweep', () => {
  const variants = [
    blossomCss.replace('background-size:220% 100%', 'background-size:auto'),
    blossomCss.replace('{0%{background-position:140% 0}', '{0%{background-position:120% 0}'),
    blossomCss + '._Root_htamq_11:hover ._Overlay_htamq_47{animation-duration:1s}',
    blossomCss.replace('position:absolute;inset:0}', 'position:absolute;inset:0;mask-image:none}'),
  ];
  for (const variant of variants) {
    const result = adapt({initial, css: {'webview/assets/app-initial-x.css': readyCss + variant}});
    assert.match(result.skipped.blossomShimmerTransform, /expected one match, found 0/, variant);
    assert.equal(result.applied.readyPulseOpacity, 'initial', 'the other edit is independent');
  }
  const {initial: patched} = adapt({initial, css});
  assert.equal(run(patched, {appendThrows: true}).blossom.shimmer, '_shimmer_htamq_67');
});

test('the compositor shimmer leaves the pet window stock and still runs elsewhere', async () => {
  const context = vm.createContext({});
  const load = name => fs.readFileSync(new URL(`../Sources/CodexPPCore/Resources/${name}.js`, import.meta.url), 'utf8');
  vm.runInContext(load('acorn'), context);
  vm.runInContext(load('startup-adapter'), context);
  const runtime = context.CodexPPStartupAdapter.compositorShimmer;
  const install = location => {
    const appended = [], listeners = [];
    const sandbox = {location, addEventListener: type => listeners.push(type), getComputedStyle: () => ({}),
      document: {head: {append: el => appended.push(el)}, hasFocus: () => false, createElement: () => ({}),
        documentElement: {setAttribute() {}, removeAttribute() {}}, addEventListener: type => listeners.push(type)}};
    sandbox.globalThis = sandbox;
    vm.runInNewContext(runtime, sandbox);
    return {appended: appended.length, listeners};
  };
  // The pet window: app://-/index.html?initialRoute=%2Favatar-overlay (packaged) or /avatar-overlay (dev server).
  for (const location of [{pathname: '/index.html', search: '?initialRoute=%2Favatar-overlay'}, {pathname: '/avatar-overlay', search: ''},
    {pathname: '/index.html', search: '?mcp=1&initialRoute=/avatar-overlay'}]) {
    assert.deepEqual(install(location), {appended: 0, listeners: []}, JSON.stringify(location));
  }
  for (const location of [{pathname: '/index.html', search: ''}, {pathname: '/index.html', search: '?initialRoute=%2Favatar-overlay-settings'}, undefined]) {
    const {appended, listeners} = install(location);
    assert.equal(appended, 1, JSON.stringify(location));
    assert.deepEqual(listeners.sort(), ['animationstart', 'blur', 'focus']);
  }
});
