// Startup fast path, discovered by code shape rather than minified names. Each
// edit is independent and optional: a missing or ambiguous match leaves that
// code untouched and is reported, so an unrecognised build starts exactly as
// it does unpatched.
//
// statsigCacheFirst: the Statsig React hook keeps `isLoading` until the network
//   fetch in initializeAsync settles, although the SDK has already loaded and
//   published this user's cached values (values_updated, status "Loading",
//   source "Cache"). The app renders a spinner over everything until then.
//   Clear `isLoading` as soon as cached values for the user are live; the
//   network result still arrives through values_updated and re-renders.
// startupRevealUnthrottled: React holds a committed Suspense fallback for at
//   least 300 ms before revealing content (FALLBACK_THROTTLE_MS). Startup
//   commits a chain of fallbacks that are all the same spinner, and each one
//   restarts the timer, adding hundreds of milliseconds of pure waiting. Skip
//   the throttle during a window's first 10 seconds; React behaves as before
//   afterwards.
// entryPreload (webview/index.html): the entry module awaits import(rpc) and
//   only then import(app-main), whose dependencies include the 11 MB
//   app-initial bundle, so the largest file is requested only after the 8 MB
//   app-shared bundle has evaluated. Declare every chunk in the entry's
//   dependency list up front (modulepreload for JS, preload for CSS) so
//   Chromium fetches and compiles them in parallel; execution order is
//   unchanged.
// settingsCacheFirst: SettingsPreloadGate holds the window until get-settings
//   returns from the main process (about 360 ms at startup, while the settings
//   store initialises), and auth requests are sent only after it opens. Seed
//   the query with the last successful result for this build (localStorage)
//   as initialData, stale from the start, so the gate opens at once and the
//   fresh settings arrive immediately after.
// authStorageGateCacheFirst (main process): before spawning its app-server,
//   the app asks Statsig over the network whether the
//   codex_desktop_secret_auth_storage rollout flag is on, and adds
//   features.secret_auth_storage=true to the CLI when it is; every launch
//   waits on that round trip, and any failure starts the CLI without the flag.
//   Start with the last network-confirmed answer for this app version, device
//   and platform, and save the fresh answer for the next launch (only answers
//   recognised from the network are saved). No saved answer means the
//   original wait.
// caretBlinkTimeout: Chromium's own text-cursor blink repaints ChatGPT's
//   translucent window twice a second, about 12% of a CPU core whenever the app
//   is focused, even untouched. Where CSS caret-animation is supported, take
//   the blink over: blink for 5 s after typing, a click or focus, then hold the
//   cursor steady (always steady with Reduce Motion), like GTK's blink timeout.
// skipHiddenThreadRefetch: after every turn the app forks the conversation to
//   predict the next prompt (and starts other hidden generation threads for
//   titles, and prewarms a thread for the next new chat). When such a thread's
//   MCP servers report ready, the window refetched the host's whole MCP
//   inventory, which starts every MCP server again (two bursts of about six node
//   processes, 1.2 s each). Only that shared refetch is gated: one trailing call
//   2 s after the last report, skipped when the inventory is under a minute old.
// lazyCheckoutPricingPrewarm, lazyCheckoutCreditPrewarm: personal ChatGPT
//   accounts boot a hidden, signed-in chatgpt.com checkout page at launch so an
//   upgrade or credit purchase opens instantly (about 250 MB plus the web app's
//   own requests). Render it only when a /checkout/web route is opened.
// learnedStartupPreload: when the initial bundle starts evaluating, add
//   <link rel=modulepreload> for the chunks the previous launch of this build
//   requested in its first 1.5 s (at most 40; fetched and compiled, not run),
//   and record this launch's list about 8 s in. Needs chunkTimings.
// deferDockIcon (main process): window-manager setup applies the Dock icon
//   preference synchronously (image decode plus app.dock.setIcon, about 50 ms)
//   before the first window exists. Apply it 3 s later instead; theme-change
//   updates are unchanged, and the default preference looks the same.
// lazyPageWindowPrewarm, lazyAvatarOverlayPrewarm, lazyHotkeyWindowPrewarm,
//   lazyDetachedWindowPrewarm (main process): ChatGPT boots hidden copies of
//   the app for new Page windows, the avatar overlay and the hotkey window 3-13 s
//   after launch (each 0.5-1 GB and 1-3 s of CPU, plus ~100 app-server
//   requests), and a hidden detached-window shell. Skip the prewarm; each
//   feature creates its window when first opened instead.
// queryTimings (diagnostic): TanStack QueryCache.build stamps each new query
//   with its creation time and registers the cache in
//   globalThis.__codexPPQueryCaches, so traced launches can list when each
//   query was created and when its data arrived.
// appGateReasons (diagnostic): the component that holds the window until auth,
//   app info, platform and the query client are loaded records which of its
//   four flags were still set on each blocking render, in
//   globalThis.__codexPPStartup.appGate.
// chunkTimings: wrap Vite's preload helper so each dynamic import records its
//   chunk path and start/end times in globalThis.__codexPPStartup.chunks (first
//   400), for traced launches.
// statsigUserCacheFirst: when the Statsig user changes during startup, the
//   app's provider waits for a second network update. updateUserAsync loads the
//   new user's cache synchronously; accept it immediately when present.
// statsigBootstrapCacheFirst: for ChatGPT sign-ins the app fetches a Statsig
//   bootstrap payload from OpenAI (with retries) before creating the client,
//   and shows a spinner over the whole window until it arrives: about a second
//   on a good network, far longer on a bad one. Keep the last payload for the
//   same identity (client key, app version, device, user, account, auth
//   method) and build the client from it immediately; the fetch still runs,
//   and its result is saved (IndexedDB; the payload exceeds localStorage's
//   quota) and applied to the live client, which re-renders through
//   values_updated. No cached payload means the original wait.
// policyPhaseTimings (main process, startup-requirements; diagnostic only):
//   record when the network-policy step starts, finishes loading the shell
//   environment, sends the policy read and validates the result, in
//   globalThis.__codexPPStartupMain.policy (performance.now() times). No
//   behaviour changes.
// shellEnvironmentCacheFirst (main process): the policy step first runs the
//   user's login shell to capture its environment (about 140 ms). Apply the
//   variables the shell added last time and continue at once; the real load
//   still runs and overwrites them when it finishes, long before the app
//   starts its app-server. Variables whose names look sensitive are never
//   written to disk: when the shell sets any, every launch keeps the original
//   wait. Per-session variables are not cached either. The Codex home mkdir
//   that follows becomes synchronous (recursive, normally a no-op): before
//   Electron's ready, async I/O completes only once the loop runs, so the
//   policy CLI could not be spawned until then; now it boots during
//   Chromium's startup.
// loadingGateTimings: the shared loading indicator receives a debugName naming
//   the gate it stands for (production drops it from the DOM). An effect added
//   to it records when each name first mounted and last unmounted, in
//   globalThis.__codexPPGates (performance.now() times), so traced launches
//   show which gate held the window. The hook is unconditional, so React's
//   hook order is unchanged between renders.
// deferDictationCues: the composer eagerly constructs an AudioContext and
//   fetches and decodes three dictation sound cues at startup. The cue player
//   creates them on first use, so the eager preload is dropped.

// Compositor shimmer: ChatGPT's loading shimmer paints a gradient through the
// text (background-clip:text) and steps its background-position, so every step
// repaints the label and re-composites the window (about 17% of a core while a
// turn is thinking). This draws the text once in the base colour and lays a
// copy in the highlight colour over it, seen through a soft-edged window: the
// window slides with transform and the copy slides back by the same amount, so
// only the compositor moves layers. Same path, timing and colours as the
// original. Labels that hold more than plain text keep the original shimmer.
// While the window is not focused, shimmers pause and show the plain label.
const compositorShimmer = String.raw`(()=>{try{
if(typeof document==="undefined"||globalThis.__codexPPShimmer)return;globalThis.__codexPPShimmer=1;
const ppSel=".loading-shimmer-pure-text,.loading-shimmer,.loading-shimmer-pure-text-inverted";
const ppCss=":is(.loading-shimmer-pure-text,.loading-shimmer){--codexpp-base:var(--shimmer-text-secondary);--codexpp-hi:var(--shimmer-contrast);--codexpp-dur:var(--loading-shimmer-duration,var(--loading-shimmer-default-duration,2s));--codexpp-delay:0s;--codexpp-steps:48}"+
".loading-shimmer-pure-text-inverted{--codexpp-base:var(--text-primary);--codexpp-hi:var(--text-quaternary);--codexpp-dur:5s;--codexpp-delay:.5s}"+
"@keyframes codexpp-shimmer-mark{to{--codexpp-mark:1}}"+
":is("+ppSel+")[data-codexpp-shimmer=on]{animation:codexpp-shimmer-mark 1ms 1!important;background:none!important;-webkit-text-fill-color:var(--codexpp-base)!important;position:relative}"+
"@media (prefers-reduced-motion:no-preference){:root:not([data-reduced-motion=true]) :is("+ppSel+"):not([data-codexpp-shimmer]):not(.loading-shimmer:hover){animation-name:codexpp-shimmer-mark,loading-shimmer!important;animation-duration:1ms,var(--codexpp-dur)!important;animation-iteration-count:1,infinite!important}}"+
".codexpp-shimmer{display:none}:is("+ppSel+")[data-codexpp-shimmer=on]>.codexpp-shimmer{display:block;position:absolute;inset:0;pointer-events:none;overflow:hidden;user-select:none}"+
".codexpp-shimmer-window{position:absolute;top:0;bottom:0;left:0;width:50%;overflow:hidden;-webkit-mask-image:linear-gradient(to right,transparent 0%,#000 40%,#000 60%,transparent 100%);mask-image:linear-gradient(to right,transparent 0%,#000 40%,#000 60%,transparent 100%);"+
"will-change:transform;transform:translateX(-100%);animation:codexpp-shimmer-window var(--codexpp-dur) steps(var(--codexpp-steps,48),end) var(--codexpp-delay) infinite}"+
".loading-shimmer-pure-text-inverted .codexpp-shimmer-window,.loading-shimmer-pure-text-inverted .codexpp-shimmer-text{animation-timing-function:steps(120,end)}"+
".codexpp-shimmer-text{position:absolute;top:0;left:0;width:200%;height:100%;box-sizing:border-box;white-space:inherit;-webkit-text-fill-color:var(--codexpp-hi);color:var(--codexpp-hi);"+
"will-change:transform;transform:translateX(50%);animation:codexpp-shimmer-text var(--codexpp-dur) steps(var(--codexpp-steps,48),end) var(--codexpp-delay) infinite}"+
"@keyframes codexpp-shimmer-window{from{transform:translateX(-100%)}to{transform:translateX(250%)}}@keyframes codexpp-shimmer-text{from{transform:translateX(50%)}to{transform:translateX(-125%)}}"+
".loading-shimmer[data-codexpp-shimmer=on]:hover{-webkit-text-fill-color:var(--text-primary)!important}.loading-shimmer:hover>.codexpp-shimmer{display:none!important}"+
"@media (prefers-reduced-motion:reduce){.codexpp-shimmer{display:none!important}}:root[data-reduced-motion=true] .codexpp-shimmer{display:none!important}"+
"@media (prefers-reduced-motion:reduce){.motion-reduce\\:animate-none>.codexpp-shimmer{display:none!important}}"+
":root[data-codexpp-blurred] .codexpp-shimmer{visibility:hidden}:root[data-codexpp-blurred] :is(.codexpp-shimmer-window,.codexpp-shimmer-text,"+ppSel.split(",").map(s=>s+"[data-codexpp-shimmer=off]").join(",")+"){animation-play-state:paused!important}";
const ppStyle=document.createElement("style");ppStyle.textContent=ppCss;(document.head??document.documentElement).append(ppStyle);
const ppText=el=>{let t="";for(const n of el.childNodes){if(n.nodeType===3)t+=n.data;else if(!(n.nodeType===1&&n.classList.contains("codexpp-shimmer")))return null}return t};
// The highlight copy is laid out as one left-to-right, start-aligned line; any
// other label (wrapped, centred, right-to-left) keeps the original shimmer.
const ppSimple=el=>{const cs=getComputedStyle(el),line=parseFloat(cs.lineHeight)||1.25*parseFloat(cs.fontSize)||20;
return cs.direction==="ltr"&&/^(start|left|-webkit-left)$/.test(cs.textAlign)&&el.getBoundingClientRect().height<=1.6*line};
const ppAttach=el=>{if(el.dataset.codexppShimmer)return;const text=ppText(el);if(text==null||!text.trim()||!ppSimple(el)){el.dataset.codexppShimmer="off";return}
const overlay=document.createElement("span"),win=document.createElement("span"),copy=document.createElement("span");
overlay.className="codexpp-shimmer";overlay.setAttribute("aria-hidden","true");win.className="codexpp-shimmer-window";copy.className="codexpp-shimmer-text";
const cs=getComputedStyle(el);copy.style.padding=cs.padding;copy.textContent=text;win.append(copy);overlay.append(win);el.append(overlay);el.dataset.codexppShimmer="on";
new MutationObserver(()=>{const next=ppText(el);if(next==null||!next.trim()){overlay.remove();el.dataset.codexppShimmer="off";return}if(next!==copy.textContent)copy.textContent=next;if(overlay.parentNode!==el)el.append(overlay)})
.observe(el,{childList:true,characterData:true,subtree:true})};
// Pause while the window is not focused: frames for a shimmer nobody is looking at.
const ppRoot=document.documentElement,ppFocus=()=>{document.hasFocus()?ppRoot.removeAttribute("data-codexpp-blurred"):ppRoot.setAttribute("data-codexpp-blurred","")};
addEventListener("focus",ppFocus);addEventListener("blur",ppFocus);ppFocus();
document.addEventListener("animationstart",e=>{if(e.animationName==="codexpp-shimmer-mark"&&e.target instanceof Element&&e.target.matches(ppSel))ppAttach(e.target)},true);
}catch{}})();`;


// viewportContainerQueries: a stylesheet with width media queries is rebuilt
// whenever the window crosses one of them, and Chromium then resets every
// @font-face, @property and @keyframes rule of the document and restyles and
// relays out the whole window; app-shared.css (47 breakpoints) did this about
// 50 times in a 6 s resize. At patch time, width-only media rules in the
// app's stylesheets become container queries on <html> (which is always the
// viewport and never scrolls), so a breakpoint restyles only what it styles.
// Rules for <html> itself apply to <body>, which inherits the same values.
// Height, device, orientation and preference queries stay media queries.
const viewportContainer = 'codexpp-viewport';
function viewportCondition(prelude) {
  const text = prelude.trim();
  if (!/\bwidth\b/.test(text) || /height|aspect|orientation|resolution|device|print|hover|pointer|prefers|color|display-mode|scripting/.test(text)) return null;
  const parts = [];
  for (const piece of splitTopLevel(text, ',')) {
    let part = piece.trim().replace(/^(only\s+)?(screen|all)\s+and\s+/, '');
    const not = /^not\s+(?:screen|all)\s+and\s+([\s\S]*)$/.exec(part);
    const condition = not ? not[1].trim() : part;
    // Only feature conditions convert; a bare or negated media type does not.
    if (!condition.startsWith('(') || !condition.endsWith(')')) return null;
    parts.push(not ? `not (${condition})` : `(${condition})`);
  }
  return parts.length ? parts.join(' or ') : null;
}
function splitTopLevel(text, separator) {
  const parts = []; let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === separator && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}
const rootSelector = /^(?::root|html)(?:\[[^\]]*\]|\.[\w-]+|:[\w-]+(?:\([^)]*\))?)*$/;
function retargetRoot(prelude) {
  return splitTopLevel(prelude, ',').map(part => rootSelector.test(part.trim()) ? part.replace(part.trim(), `${part.trim()} > body`) : part).join(',');
}
function rewriteViewportCSS(css) {
  let out = '', emitted = 0, segment = 0, changed = 0;
  const stack = [];
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const end = css.indexOf('*/', i + 2); i = end < 0 ? css.length : end + 1; continue; }
    if (c === '"' || c === "'") { for (i++; i < css.length && css[i] !== c; i++) if (css[i] === '\\') i++; continue; }
    if (c === '\\') { i++; continue; }
    if (c === ';') { segment = i + 1; continue; }
    if (c === '}') { stack.pop(); segment = i + 1; continue; }
    if (c !== '{') continue;
    const prelude = css.slice(segment, i);
    const media = /^(\s*)@media\b([\s\S]*)$/.exec(prelude);
    const condition = media && viewportCondition(media[2]);
    let replacement = null;
    if (condition) { replacement = `${media[1]}@container ${viewportContainer} ${condition}`; changed++; }
    else if (stack.at(-1) === 'container' && !/^\s*@/.test(prelude)) { const next = retargetRoot(prelude); if (next !== prelude) replacement = next; }
    if (replacement !== null) { out += css.slice(emitted, segment) + replacement; emitted = i; }
    stack.push(condition ? 'container' : 'other');
    segment = i + 1;
  }
  if (!changed) return null;
  out += css.slice(emitted);
  // The root container, after any leading @charset/@import statements.
  const head = /^(\s*(@charset|@import)\b[^;]*;)*/.exec(out)[0];
  return `${head}html{container:${viewportContainer}/inline-size}${out.slice(head.length)}`;
}

globalThis.CodexPPStartupAdapter = Object.freeze({
  compositorShimmer,
  rewriteViewportCSS,
  adapt(input) {
    const marker = '/*codexpp:startup*/';
    const parse = source => acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    function walk(node, visit, ancestors = []) {
      if (!node || typeof node.type !== 'string') return;
      visit(node, ancestors);
      ancestors.push(node);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) { for (const child of value) walk(child, visit, ancestors); }
        else if (value && typeof value.type === 'string') walk(value, visit, ancestors);
      }
      ancestors.pop();
    }
    const member = (node, name) => node?.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
      !node.callee.computed && node.callee.property.type === 'Identifier' && node.callee.property.name === name;
    const isFalse = node => node?.type === 'UnaryExpression' && node.operator === '!' && node.argument.type === 'Literal' && node.argument.value === 1;
    const applied = {}, skipped = {}, edits = { shared: [], initial: [], requirements: [], main: [], network: [], checkout: [], trash: [], appearance: [], appServer: [], remoteSettings: [] };
    // Diagnostic edits (timings, gate reasons, the opaque-surface experiment hook)
    // ship only in development builds of the helper (input.diagnostics).
    const diagnostics = input.diagnostics === true;
    const developmentOnly = new Set(['queryTimings', 'appGateReasons', 'loadingGateTimings', 'policyPhaseTimings', 'opaqueSurfaceExperiment']);
    const sources = { shared: input.shared, initial: input.initial, requirements: input.requirements, main: input.main, network: input.network, checkout: input.checkout, trash: input.trash, appearance: input.appearance, appServer: input.appServer, remoteSettings: input.remoteSettings };
    if (Object.values(sources).some(source => typeof source === 'string' && source.includes(marker))) {
      throw new Error('Startup fast path already applied.');
    }
    const trees = {};
    let result_html = null;
    for (const [key, source] of Object.entries(sources)) if (typeof source === 'string') trees[key] = parse(source);
    function record(name, file, matches, edit) {
      if (!trees[file]) { skipped[name] = 'module not found'; return; }
      if (developmentOnly.has(name) && !diagnostics) { skipped[name] = 'development builds only'; return; }
      if (matches.length !== 1) { skipped[name] = `expected one match, found ${matches.length}`; return; }
      const made = edit(matches[0]);
      for (const one of Array.isArray(made) ? made : [made]) edits[file].push({ ...one, name });
      applied[name] = file;
    }

    // client.initializeAsync().catch(...).finally(() => setLoading(!1))
    if (trees.shared) {
      const matches = [];
      walk(trees.shared, node => {
        if (!member(node, 'finally') || node.arguments.length !== 1) return;
        const caught = node.callee.object, init = caught?.callee?.object;
        if (!member(caught, 'catch') || !member(init, 'initializeAsync') || init.arguments.length !== 0) return;
        const client = init.callee.object, done = node.arguments[0];
        if (client.type !== 'Identifier' || done.type !== 'ArrowFunctionExpression' || done.params.length !== 0) return;
        const set = done.body;
        if (set.type !== 'CallExpression' || set.callee.type !== 'Identifier' || set.arguments.length !== 1 || !isFalse(set.arguments[0])) return;
        matches.push({ node, client: client.name, setLoading: set.callee.name });
      });
      record('statsigCacheFirst', 'shared', matches, ({ node, client, setLoading }) => {
        const original = sources.shared.slice(node.start, node.end);
        const listener = `function ppCached(e){e?.status==="Loading"&&e.values?.source==="Cache"&&(${client}.off("values_updated",ppCached),${setLoading}(!1))}`;
        return { start: node.start, end: node.end,
          text: `${marker}((ppCached)=>(${client}.on("values_updated",ppCached),${original}.finally(()=>${client}.off("values_updated",ppCached))))(${listener})` };
      });
      // finishConcurrentRender: if (retryLanes && (wait = lastFallbackTime + 300 - now(), 10 < wait)) schedule `Throttled` commit
      const throttles = [];
      walk(trees.shared, (node, ancestors) => {
        if (node.type !== 'BinaryExpression' || node.operator !== '-' || node.right.type !== 'CallExpression' || node.right.arguments.length !== 0) return;
        const sum = node.left;
        if (sum.type !== 'BinaryExpression' || sum.operator !== '+' || sum.right.type !== 'Literal' || sum.right.value !== 300) return;
        const owner = [...ancestors].reverse().find(a => a.type === 'FunctionDeclaration' || a.type === 'FunctionExpression');
        if (owner && sources.shared.slice(owner.start, owner.end).includes('`Throttled`')) throttles.push(sum.right);
      });
      record('startupRevealUnthrottled', 'shared', throttles, literal => ({ start: literal.start, end: literal.end,
        text: `${marker}(performance.now()<1e4?0:300)` }));

      // X = Qk(scope, () => ({queryKey: key(`get-settings`), queryFn: ..., placeholderData: ..., ...}))
      const settingsQueries = [];
      walk(trees.shared, node => {
        if (node.type !== 'ObjectExpression') return;
        const props = new Map(node.properties.filter(p => p.type === 'Property' && !p.computed).map(p => [p.key.name, p]));
        const key = props.get('queryKey')?.value;
        if (!props.has('queryFn') || !props.has('placeholderData') || key?.type !== 'CallExpression' ||
            sources.shared.slice(key.start, key.end).indexOf('`get-settings`') < 0) return;
        settingsQueries.push({ node, prop: props.get('queryFn'), fn: props.get('queryFn').value });
      });
      record('settingsCacheFirst', 'shared', settingsQueries, ({ node, fn }) => {
        const store = 'ppSettingsKey="codexpp.settings:"+import.meta.url';
        return [
          // queryFn: the original, with the query context forwarded; each result is cached
          // (older builds' entries are removed).
          { start: fn.start, end: fn.end, text: `${marker}(...ppArgs)=>Promise.resolve((${sources.shared.slice(fn.start, fn.end)})(...ppArgs)).then(ppSettings=>{try{const ${store};` +
            `if(ppSettings!=null){localStorage.setItem(ppSettingsKey,JSON.stringify(ppSettings));` +
            `for(const ppOld of Object.keys(localStorage))ppOld.startsWith("codexpp.settings:")&&ppOld!==ppSettingsKey&&localStorage.removeItem(ppOld)}}catch{}return ppSettings})` },
          // After the last property (a trailing comma stays valid): the cached value as initial data.
          { start: node.properties.at(-1).end, end: node.properties.at(-1).end,
            text: `,...(()=>{try{const ${store},ppStored=localStorage.getItem(ppSettingsKey);return ppStored==null?{}:{initialData:JSON.parse(ppStored),initialDataUpdatedAt:0}}catch{return{}}})()` },
        ];
      });

      // build(client, options, state) { ... a || (a = new Query({...}), this.add(a)), a }
      const builds = [];
      walk(trees.shared, node => {
        if (node.type !== 'MethodDefinition' || node.key.name !== 'build' || node.value.params.length !== 3) return;
        const text = sources.shared.slice(node.start, node.end);
        if (!text.includes('defaultQueryOptions(') || !text.includes('getQueryDefaults(')) return;
        walk(node.value.body, inner => {
          if (inner.type === 'SequenceExpression' && inner.expressions.length === 2 && inner.expressions[0].type === 'AssignmentExpression' &&
              inner.expressions[0].right.type === 'NewExpression' && inner.expressions[1].type === 'CallExpression' &&
              inner.expressions[1].callee.type === 'MemberExpression' && inner.expressions[1].callee.property.name === 'add') {
            builds.push({ assign: inner.expressions[0], query: inner.expressions[0].left.name });
          }
        });
      });
      record('queryTimings', 'shared', builds, ({ assign, query }) => ({ start: assign.end, end: assign.end,
        text: `,${marker}${query}.__codexPPCreated=performance.now(),(globalThis.__codexPPQueryCaches??=new Set).add(this)` }));

      // Vite's __vitePreload(importThunk, deps, importerUrl): it links deps
      // with <link rel=modulepreload> (csp-nonce aware) before importing.
      const preloaders = [];
      walk(trees.shared, node => {
        if (node.type !== 'FunctionExpression' || node.params.length !== 3) return;
        const text = sources.shared.slice(node.start, node.end);
        if (text.includes('getElementsByTagName(`link`)') && text.includes('csp-nonce') && text.includes('import.meta.url')) preloaders.push(node);
      });
      record('chunkTimings', 'shared', preloaders, node => {
        const original = sources.shared.slice(node.start, node.end);
        return { start: node.start, end: node.end, text: `${marker}((ppPreload)=>function(e,t,n){const ppStart=performance.now(),` +
          `ppName=String(e).match(/import\\((?:\`|")([^\`"]+)/)?.[1]??"?";return ppPreload.call(this,e,t,n).finally(()=>{try{const ppLog=(globalThis.__codexPPStartup??={}).chunks??=[];` +
          `ppLog.length<400&&ppLog.push([ppName,ppStart,performance.now()])}catch{}})})(${original})` };
      });
    } else skipped.statsigCacheFirst = 'module not found';

    if (trees.initial) {
      // client.updateUserAsync(user).then(log).finally(() => { cancelled || setUser(user) })
      const matches = [];
      walk(trees.initial, (node, ancestors) => {
        if (!member(node, 'finally') || node.arguments.length !== 1) return;
        const then = node.callee.object, update = then?.callee?.object;
        if (!member(then, 'then') || !member(update, 'updateUserAsync') || update.arguments.length !== 1) return;
        const client = update.callee.object, user = update.arguments[0], done = node.arguments[0];
        if (client.type !== 'Identifier' || user.type !== 'Identifier' || done.type !== 'ArrowFunctionExpression') return;
        const body = done.body.type === 'BlockStatement' && done.body.body.length === 1 && done.body.body[0].type === 'ExpressionStatement'
          ? done.body.body[0].expression : done.body;
        if (body.type !== 'LogicalExpression' || body.operator !== '||' || body.left.type !== 'Identifier') return;
        const set = body.right;
        if (set.type !== 'CallExpression' || set.callee.type !== 'Identifier' || set.arguments.length !== 1 ||
            set.arguments[0].type !== 'Identifier' || set.arguments[0].name !== user.name) return;
        // Only the app's Statsig provider (its spinner is labelled in source).
        const owner = [...ancestors].reverse().find(a => a.type === 'FunctionDeclaration');
        if (!owner || !sources.initial.slice(owner.start, owner.end).includes('CodexStatsigProvider.async')) return;
        matches.push({ update, client: client.name, cancelled: body.left.name, setUser: set.callee.name, user: user.name });
      });
      record('statsigUserCacheFirst', 'initial', matches, ({ update, client, cancelled, setUser, user }) => {
        const original = sources.initial.slice(update.start, update.end);
        return { start: update.start, end: update.end,
          // updateUserAsync publishes the cached values synchronously before
          // its network fetch; observe exactly that call.
          text: `${marker}((ppCache)=>{const ppSeen=ppEvent=>{ppEvent?.status==="Loading"&&ppEvent.values?.source==="Cache"&&(ppCache.hit=!0)};` +
            `${client}.on("values_updated",ppSeen);try{return ${original}}finally{${client}.off("values_updated",ppSeen),ppCache.hit&&!${cancelled}&&${setUser}(${user})}})({})` };
      });

      // window.setTimeout(() => { try { preloadCues() } catch {} }, 0), where
      // preloadCues constructs an AudioContext.
      const audio = new Set();
      walk(trees.initial, node => {
        if (node.type !== 'FunctionDeclaration' || !node.id) return;
        const text = sources.initial.slice(node.start, node.end);
        if (text.includes('new AudioContext(') && text.includes('latencyHint') && text.includes('decodeAudioData')) audio.add(node.id.name);
      });
      const preloads = [];
      walk(trees.initial, node => {
        if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || node.callee.computed ||
            node.callee.object.type !== 'Identifier' || node.callee.object.name !== 'window' || node.callee.property.name !== 'setTimeout') return;
        const [callback, delay] = node.arguments;
        if (node.arguments.length !== 2 || delay.type !== 'Literal' || delay.value !== 0 || callback.type !== 'ArrowFunctionExpression') return;
        const statements = callback.body.type === 'BlockStatement' ? callback.body.body : [];
        const attempt = statements.length === 1 && statements[0].type === 'TryStatement' ? statements[0].block.body : [];
        const call = attempt.length === 1 && attempt[0].type === 'ExpressionStatement' ? attempt[0].expression : null;
        if (call?.type === 'CallExpression' && call.arguments.length === 0 && call.callee.type === 'Identifier' && audio.has(call.callee.name)) {
          preloads.push(node);
        }
      });
      record('deferDictationCues', 'initial', preloads, node => ({ start: node.start, end: node.end, text: `${marker}void 0` }));

      // g = async input => { let t = await fetchBootstrap(input, attempts);
      //   try { let c = new X.StatsigClient(key, t.user, options); return c.dataAdapter.setData(t.statsigPayload), ..., c } catch ... }
      const bootstraps = [];
      walk(trees.initial, (node, ancestors) => {
        if (node.type !== 'ArrowFunctionExpression' || !node.async || node.params.length !== 1 || node.params[0].type !== 'Identifier' ||
            node.body.type !== 'BlockStatement' || node.body.body.length !== 2) return;
        const [declaration, attempt] = node.body.body;
        if (declaration.type !== 'VariableDeclaration' || declaration.declarations.length !== 1 || attempt.type !== 'TryStatement') return;
        const [declarator] = declaration.declarations;
        const fetch = declarator.init?.type === 'AwaitExpression' ? declarator.init.argument : null;
        if (declarator.id.type !== 'Identifier' || fetch?.type !== 'CallExpression' || fetch.callee.type !== 'Identifier') return;
        const result = declarator.id.name, tryText = sources.initial.slice(attempt.start, attempt.end);
        if (!tryText.includes('.StatsigClient(') || !tryText.includes(`${result}.user`) || !tryText.includes(`.dataAdapter.setData(${result}.statsigPayload)`)) return;
        const owner = [...ancestors].reverse().find(a => a.type === 'FunctionDeclaration');
        if (!owner || !sources.initial.slice(owner.start, owner.end).includes('CodexStatsigProvider.sync')) return;
        const props = owner.body.body[0]?.type === 'VariableDeclaration' ? owner.body.body[0].declarations
          .find(d => d.id.type === 'ObjectPattern' && d.init?.type === 'Identifier' && d.init.name === owner.params[0]?.name) : null;
        const named = new Map((props?.id.properties ?? []).filter(p => p.type === 'Property' && !p.computed && p.value.type === 'Identifier')
          .map(p => [p.key.name || p.key.value, p.value.name]));
        if (!['auth', 'appVersion', 'statsigClientKey', 'stableId'].every(key => named.has(key))) return;
        bootstraps.push({ node, input: node.params[0].name, result, fetch: sources.initial.slice(fetch.start, fetch.end), tryText, named });
      });
      record('statsigBootstrapCacheFirst', 'initial', bootstraps, ({ node, input, result, fetch, tryText, named }) => {
        // ChatGPT sign-ins fill userId only after the account lookup, so the
        // identity takes the first user identifier available, plus account
        // and email; with neither a user identifier nor an email, no caching.
        const auth = named.get('auth');
        const who = `(${auth}?.userId??${auth}?.authenticatedUserId??${auth}?.accountUserId??null)`;
        const id = `JSON.stringify([${named.get('statsigClientKey')},${named.get('appVersion')},${named.get('stableId')}??null,${auth}?.authMethod??null,` +
          `${who},${auth}?.accountId??${auth}?.authenticatedAccountId??null,${auth}?.email??null])`;
        const known = `(${who}!=null||${auth}?.email!=null)`;
        // globalThis.__codexPPStartup.statsigBootstrap records what happened,
        // for traced launches: hit, miss, no-identity, saved, or an error.
        // The payload is megabytes, beyond localStorage's quota: keep it in
        // IndexedDB (database codexpp-startup, store kv).
        const idb = `ppStore=(ppMode,ppWork)=>new Promise((ppDone,ppFail)=>{const ppOpen=indexedDB.open("codexpp-startup",1);` +
          `ppOpen.onupgradeneeded=()=>ppOpen.result.createObjectStore("kv");ppOpen.onerror=()=>ppFail(ppOpen.error);` +
          `ppOpen.onsuccess=()=>{const ppDb=ppOpen.result,ppTx=ppDb.transaction("kv",ppMode),ppReq=ppWork(ppTx.objectStore("kv"));` +
          `ppTx.oncomplete=()=>{ppDb.close();ppDone(ppReq?.result??null)};ppTx.onerror=ppTx.onabort=()=>{ppDb.close();ppFail(ppTx.error)}}})`;
        return { start: node.start, end: node.end, text: `${marker}async ${input}=>{const ppKey="statsigBootstrap.v1",ppId=${id},` +
          `ppNote=ppState=>{try{((globalThis.__codexPPStartup??={}).statsigBootstrap??=[]).push(ppState)}catch{}},${idb},` +
          `ppFetch=${fetch},ppBuild=${result}=>{${tryText}},` +
          `ppSave=${result}=>{if(!${known}||${result}?.statsigPayload==null)return ppNote("not-saved");` +
          `ppStore("readwrite",ppKv=>ppKv.put({id:ppId,user:${result}.user,statsigPayload:${result}.statsigPayload},ppKey))` +
          `.then(()=>ppNote("saved"),ppError=>ppNote("save-error:"+ppError?.name))};` +
          // The fetch runs during the cache read; mark its rejection handled
          // so a fast failure is not reported as unhandled before the await.
          `ppFetch.catch(()=>{});let ppHit=null;try{const ppStored=${known}?await ppStore("readonly",ppKv=>ppKv.get(ppKey)):null;ppHit=ppStored?.id===ppId?ppStored:null;` +
          `ppNote(ppHit?"hit":!${known}?"no-identity":ppStored?"stale":"miss")}catch(ppError){ppNote("read-error:"+ppError?.name)}` +
          `if(ppHit){let ppClient=null;try{ppClient=ppBuild(ppHit)}catch{ppNote("cache-unusable");ppStore("readwrite",ppKv=>ppKv.delete(ppKey)).catch(()=>{})}` +
          `if(ppClient){ppFetch.then(${result}=>{ppSave(${result});try{ppClient.dataAdapter.setData(${result}.statsigPayload),ppClient.updateUserSync(${result}.user)}catch{}},()=>{});return ppClient}}` +
          `const ${result}=await ppFetch;ppSave(${result});return ppBuild(${result})}` };
      });

      // if (auth.isLoading || appInfoLoading || platformLoading || clientLoading) { ...return <Indicator/> }
      const appGates = [];
      walk(trees.initial, node => {
        if (node.type !== 'IfStatement' || node.consequent.type !== 'BlockStatement') return;
        const flags = [];
        for (let test = node.test; test.type === 'LogicalExpression' && test.operator === '||'; test = test.left) flags.unshift(test.right);
        let first = node.test; while (first.type === 'LogicalExpression') first = first.left;
        flags.unshift(first);
        if (flags.length !== 4 || flags[0].type !== 'MemberExpression' || flags[0].property.name !== 'isLoading' || !flags.slice(1).every(f => f.type === 'Identifier')) return;
        const body = sources.initial.slice(node.consequent.start, node.consequent.end);
        if (!/jsx\)\([A-Za-z_$][\w$]*,\{\}\)/.test(body)) return;
        appGates.push({ node, flags: flags.map(f => sources.initial.slice(f.start, f.end)) });
      });
      record('appGateReasons', 'initial', appGates, ({ node, flags }) => ({ start: node.consequent.start + 1, end: node.consequent.start + 1,
        text: `${marker}try{const ppLog=(globalThis.__codexPPStartup??={}).appGate??=[],ppNow=[${flags.map(f => `!!(${f})`).join(',')}];` +
          `JSON.stringify(ppLog.at(-1)?.[1])!==JSON.stringify(ppNow)&&ppLog.length<50&&ppLog.push([performance.now(),ppNow])}catch{}` }));

      // First statement of the initial bundle: learned preload of startup chunks.
      const firstStatement = trees.initial.body.find(statement => statement.type !== 'ImportDeclaration');
      // n.subscribe({...,listener:(a,o)=>{switch(a.method){...case`mcpServer/startupStatus/updated`:...toolsAndAuthOnly...}}})
      // where n is the host's conversation manager (n.getConversationCwd(...) in the same listener).
      const caseName = c => c.test?.type === 'TemplateLiteral' && c.test.quasis.length === 1 ? c.test.quasis[0].value.cooked : c.test?.type === 'Literal' ? c.test.value : null;
      const readyCases = [];
      walk(trees.initial, (node, ancestors) => {
        if (node.type !== 'SwitchStatement' || node.discriminant.type !== 'MemberExpression' || node.discriminant.object.type !== 'Identifier' ||
            node.discriminant.property.name !== 'method') return;
        const ready = node.cases.find(c => caseName(c) === 'mcpServer/startupStatus/updated');
        if (!ready?.consequent.length || !sources.initial.slice(ready.consequent[0].start, ready.consequent.at(-1).end).includes('toolsAndAuthOnly')) return;
        const call = [...ancestors].reverse().find(a => a.type === 'CallExpression' && a.callee.type === 'MemberExpression' &&
          a.callee.property.name === 'subscribe' && a.callee.object.type === 'Identifier');
        if (!call) return;
        const manager = call.callee.object.name;
        if (!sources.initial.slice(node.start, node.end).includes(`${manager}.getConversationCwd(`)) return;
        // gl(e.queryClient,{queryKey:[...dd,t,`toolsAndAuthOnly`],exact:!0},{cancelRefetch:!1}): the inventory refetch.
        let inventory = null;
        walk(ready, inner => {
          const options = inner.type === 'CallExpression' && inner.arguments.length >= 2 && inner.arguments[1].type === 'ObjectExpression' ? inner.arguments[1] : null;
          const key = options?.properties.find(p => p.type === 'Property' && p.key.name === 'queryKey')?.value;
          if (key?.type === 'ArrayExpression' && key.elements.at(-1)?.type === 'TemplateLiteral' && key.elements.at(-1).quasis[0]?.value.cooked === 'toolsAndAuthOnly' &&
              inner.arguments[0].type === 'MemberExpression' && inner.arguments[0].property.name === 'queryClient')
            inventory ??= { node: inner, client: sources.initial.slice(inner.arguments[0].start, inner.arguments[0].end), key: sources.initial.slice(key.start, key.end) };
        });
        if (!inventory) return;
        readyCases.push({ ready, event: node.discriminant.object.name, manager, inventory });
      });
      // Every MCP server of every thread (including hidden ones: the fork that
      // predicts the next prompt, title generation, the prewarmed next chat)
      // reports ready on its own, and each report refetched the host's shared
      // tool inventory, which restarts every MCP server. Only that shared call
      // is gated: reports collapse into one trailing refetch 2 s after the last,
      // skipped when the inventory was fetched in the last minute. Everything
      // else in the case (per-thread invalidations, failures) runs as before.
      record('skipHiddenThreadRefetch', 'initial', readyCases, ({ inventory }) => ({ start: inventory.node.start, end: inventory.node.end,
        text: `${marker}(globalThis.__codexPPInventoryRefetch??=(()=>{const ppTimers=new Map;return(ppClient,ppKey,ppRun)=>{` +
          `if((ppClient.getQueryState(ppKey)?.dataUpdatedAt??0)>Date.now()-6e4)return;const ppId=JSON.stringify(ppKey);clearTimeout(ppTimers.get(ppId));` +
          `ppTimers.set(ppId,setTimeout(()=>{ppTimers.delete(ppId);(ppClient.getQueryState(ppKey)?.dataUpdatedAt??0)>Date.now()-6e4||ppRun()},2e3))}})())` +
          `(${inventory.client},${inventory.key},()=>${sources.initial.slice(inventory.node.start, inventory.node.end)})` }));

      // Only in a module another edit recognised as ChatGPT's initial bundle.
      const recognised = Object.values(applied).includes('initial');
      if (firstStatement && recognised) {
        const fields = ':is([contenteditable],textarea,input)';
        const css = `${fields}{caret-animation:manual}@media (prefers-reduced-motion:no-preference){:root[data-codexpp-caret-blink] ${fields}:focus{` +
          `animation:codexpp-caret-blink 1.06s step-end 5}}@keyframes codexpp-caret-blink{50%{caret-color:transparent}}`;
        edits.initial.push({ name: 'caretBlinkTimeout', start: firstStatement.start, end: firstStatement.start, text: `${marker}(()=>{try{` +
          `if(typeof document==="undefined"||!globalThis.CSS?.supports?.("caret-animation","manual"))return;` +
          `const ppStyle=document.createElement("style");ppStyle.textContent=${JSON.stringify(css)};(document.head??document.documentElement).append(ppStyle);` +
          // Restart the blink on activity: drop the attribute, set it again next frame.
          `const ppRoot=document.documentElement;let ppFrame=0;const ppWake=()=>{ppRoot.removeAttribute("data-codexpp-caret-blink");cancelAnimationFrame(ppFrame);` +
          `ppFrame=requestAnimationFrame(()=>ppRoot.setAttribute("data-codexpp-caret-blink",""))};` +
          `for(const ppEvent of["keydown","pointerdown","focusin"])addEventListener(ppEvent,ppWake,!0)}catch{}})();` });
        applied.caretBlinkTimeout = 'initial';
        edits.initial.push({ name: 'compositorShimmer', start: firstStatement.start, end: firstStatement.start, text: `${marker}${compositorShimmer}` });
        applied.compositorShimmer = 'initial';
      } else skipped.caretBlinkTimeout = skipped.compositorShimmer = firstStatement ? 'initial bundle not recognised' : 'module not found';
      // The app shell measures itself with a ResizeObserver, which runs after
      // layout, and feeds framer-motion values that size the side panel; framer
      // writes them on the next frame, so during a window resize the chat
      // column took each step for a frame and snapped back. The shell's ref
      // callback already reads clientWidth/clientHeight on mount; it now also
      // registers the element so each window resize event (which runs before
      // the frame's layout) sets the same values at once.
      // e=>{st(e),e!=null&&!l&&(He.set(e.clientHeight),be.set(e.clientWidth))}
      const shellRefs = [];
      walk(trees.initial, node => {
        if (node.type !== 'ArrowFunctionExpression' || node.params.length !== 1 || node.params[0].type !== 'Identifier' || node.body.type !== 'BlockStatement') return;
        const element = node.params[0].name;
        walk(node.body, inner => {
          if (inner.type !== 'LogicalExpression' || inner.operator !== '&&' || inner.right.type !== 'SequenceExpression' || inner.right.expressions.length !== 2) return;
          const [height, width] = inner.right.expressions;
          const sets = (call, property) => member(call, 'set') && call.callee.object.type === 'Identifier' && call.arguments.length === 1 &&
            call.arguments[0].type === 'MemberExpression' && call.arguments[0].object.type === 'Identifier' && call.arguments[0].object.name === element &&
            call.arguments[0].property.name === property;
          if (sets(height, 'clientHeight') && sets(width, 'clientWidth'))
            shellRefs.push({ node, element, height: height.callee.object.name, width: width.callee.object.name });
        });
      });
      record('shellResizeSync', 'initial', shellRefs, ({ node, element, height, width }) => ({ start: node.body.start + 1, end: node.body.start + 1,
        text: `${marker}(globalThis.__codexPPShellSize??=(()=>{const ppShells=new Map;addEventListener("resize",()=>{for(const[ppWidth,[ppElement,ppHeight]]of ppShells)` +
          `ppElement.isConnected&&(ppHeight.set(ppElement.clientHeight),ppWidth.set(ppElement.clientWidth))},!0);` +
          `return(ppElement,ppHeight,ppWidth)=>{ppElement?ppShells.set(ppWidth,[ppElement,ppHeight]):ppShells.delete(ppWidth)}})())(${element},${height},${width});` }));
      if (firstStatement && applied.chunkTimings) {
        edits.initial.push({ name: 'learnedStartupPreload', start: firstStatement.start, end: firstStatement.start, text: `${marker}(()=>{try{` +
          `const ppKey="codexpp.startupChunks.v2:"+import.meta.url;let ppList=null;try{ppList=JSON.parse(localStorage.getItem(ppKey)??"null")}catch{}` +
          `if(Array.isArray(ppList))for(const ppName of ppList.slice(0,40)){if(typeof ppName!=="string"||!/^\\.\\/[\\w.-]+\\.js$/.test(ppName))continue;` +
          `const ppLink=document.createElement("link");ppLink.rel="modulepreload";ppLink.crossOrigin="";ppLink.href=new URL(ppName,import.meta.url).href;document.head.append(ppLink)}` +
          `setTimeout(()=>{try{const ppSeen=[...new Set((globalThis.__codexPPStartup?.chunks??[]).filter(ppChunk=>ppChunk[1]<1500).map(ppChunk=>ppChunk[0]))].slice(0,40);` +
          `ppSeen.length&&localStorage.setItem(ppKey,JSON.stringify(ppSeen))}catch{}},8e3)}catch{}})();` });
        applied.learnedStartupPreload = 'initial';
      } else skipped.learnedStartupPreload = trees.initial ? 'needs chunkTimings' : 'module not found';

      // function Indicator(e){let t=...,{variant:a,debugName:o,startupIndicator:s,...}=e; ...}
      const indicators = [];
      walk(trees.initial, node => {
        if (node.type !== 'FunctionDeclaration' || node.params.length !== 1 || node.params[0].type !== 'Identifier') return;
        const first = node.body.body[0];
        if (first?.type !== 'VariableDeclaration') return;
        for (const declarator of first.declarations) {
          if (declarator.id.type !== 'ObjectPattern' || declarator.init?.type !== 'Identifier' || declarator.init.name !== node.params[0].name) continue;
          const named = new Map(declarator.id.properties.filter(p => p.type === 'Property' && !p.computed && p.value.type === 'Identifier')
            .map(p => [p.key.name || p.key.value, p.value.name]));
          if (!(named.has('debugName') && named.has('variant') && named.has('startupIndicator'))) continue;
          // The component's own React namespace, from its useState call.
          let react = null;
          walk(node.body, call => {
            if (react == null && call.type === 'CallExpression' && call.callee.type === 'SequenceExpression' &&
                call.callee.expressions.length === 2 && call.callee.expressions[1].type === 'MemberExpression' &&
                call.callee.expressions[1].object.type === 'Identifier' && call.callee.expressions[1].property.name === 'useState') {
              react = call.callee.expressions[1].object.name;
            }
          });
          if (react) indicators.push({ first, name: named.get('debugName'), react });
        }
      });
      record('loadingGateTimings', 'initial', indicators, ({ first, name, react }) => ({ start: first.end, end: first.end,
        text: `${marker}(0,${react}.useEffect)(()=>{const k=String(${name}),g=globalThis.__codexPPGates??={},r=g[k]??=[performance.now(),null];` +
          `return()=>{r[1]=performance.now()}},[]);` }));
    } else {
      skipped.statsigUserCacheFirst = 'module not found';
      skipped.deferDictationCues = 'module not found';
      skipped.loadingGateTimings = 'module not found';
      skipped.statsigBootstrapCacheFirst = 'module not found';
    }

    if (trees.main) {
      const src = sources.main, gates = [];
      walk(trees.main, node => {
        if (node.type !== 'FunctionDeclaration' || !node.async || node.params.length !== 1 || node.params[0].type !== 'ObjectPattern') return;
        const body = src.slice(node.body.start, node.body.end);
        if (!body.includes('`codex_desktop_secret_auth_storage`') || !body.includes('`features.secret_auth_storage=true`')) return;
        const keys = new Set(node.params[0].properties.map(p => p.key?.name));
        if (!['stableId', 'platform', 'appVersion'].every(k => keys.has(k))) return;
        const recognised = body.indexOf('`Network:Recognized`');
        const test = /return ([A-Za-z_$][\w$]*)\.success&&/.exec(body);
        if (recognised < 0 || !test || test.index > recognised) return;
        gates.push({ node, body, testStart: test.index + 'return '.length, recognisedEnd: recognised + '`Network:Recognized`'.length });
      });
      record('authStorageGateCacheFirst', 'main', gates, ({ node, body, testStart, recognisedEnd }) => {
        const inner = body.slice(0, testStart) + '(ppNetwork=' + body.slice(testStart, recognisedEnd) + ')' + body.slice(recognisedEnd);
        const params = src.slice(node.params[0].start, node.params[0].end);
        return { start: node.params[0].start, end: node.end, text: `${marker}ppArgs){let ppNetwork=!1;const ppFs=require("fs"),` +
          `ppFile=require("path").join(require("electron").app.getPath("userData"),"codexpp-auth-storage-gate.json"),` +
          `ppKey=JSON.stringify([ppArgs?.appVersion??null,ppArgs?.stableId??null,ppArgs?.platform??null]),` +
          `ppFresh=(async(${params})=>${inner})(ppArgs).then(ppOverrides=>{try{ppNetwork&&Array.isArray(ppOverrides)&&` +
          `ppFs.writeFileSync(ppFile,JSON.stringify({key:ppKey,overrides:ppOverrides}),{mode:0o600})}catch{}return ppOverrides});` +
          `let ppCached=null;try{ppCached=JSON.parse(ppFs.readFileSync(ppFile,"utf8"))}catch{}` +
          `if(ppCached?.key===ppKey&&Array.isArray(ppCached.overrides)&&ppCached.overrides.every(ppItem=>ppItem==="features.secret_auth_storage=true")){` +
          `ppFresh.catch(()=>{});(globalThis.__codexPPStartupMain??={}).authStorageGate="cached";return ppCached.overrides}return ppFresh}` };
      });
      // let L = () => { if (!mac) return; let e = pref(); I(e), loadIcon({preference: e, resourceName: ...}).then(...) }; if (mac) { L(); ... }
      const docks = [];
      const dockFns = new Set();
      walk(trees.main, node => {
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'ArrowFunctionExpression' && node.init.params.length === 0) {
          const text = src.slice(node.init.start, node.init.end);
          if (text.includes('{preference:') && text.includes('resourceName:') && text.includes('.then(')) dockFns.add(node.id.name);
        }
      });
      walk(trees.main, node => {
        if (node.type !== 'IfStatement' || node.consequent.type !== 'BlockStatement') return;
        const first = node.consequent.body[0];
        const call = first?.type === 'ExpressionStatement' ? first.expression : null;
        if (call?.type === 'CallExpression' && call.arguments.length === 0 && call.callee.type === 'Identifier' && dockFns.has(call.callee.name) &&
            src.slice(node.start, node.end).includes('nativeTheme')) docks.push({ call });
      });
      record('deferDockIcon', 'main', docks, ({ call }) => ({ start: call.start, end: call.end, text: `${marker}setTimeout(${call.callee.name},3e3)` }));

      // Hidden prewarmed windows: each method only prepares a window that the
      // feature's own open path creates on demand, so returning early makes it lazy.
      const prewarms = { lazyPageWindowPrewarm: [], lazyAvatarOverlayPrewarm: [], lazyHotkeyWindowPrewarm: [], lazyDetachedWindowPrewarm: [] };
      walk(trees.main, node => {
        if (node.type !== 'MethodDefinition' || node.key.type !== 'Identifier' || node.value.body.body.length === 0) return;
        const fn = node.value, text = src.slice(fn.body.start, fn.body.end);
        // fill(){this.enabled&&...&&this.slot.prewarm().catch(e=>{...`Could not prewarm Page window`...})}
        if (node.key.name === 'fill' && fn.params.length === 0 && text.includes('.slot.prewarm()') && text.includes('Could not prewarm Page window'))
          prewarms.lazyPageWindowPrewarm.push(fn);
        // async prewarm(e){if(this.window!=null||this.openingWindowPromise!=null||...)return;...await this.ensureWindow(t)...}
        if (node.key.name === 'prewarm' && fn.async && fn.params.length === 1 && text.includes('this.openingWindowPromise') && text.includes('this.ensureWindow('))
          prewarms.lazyAvatarOverlayPrewarm.push(fn);
        // async prewarm(){...await this.ensureHomeWindow(),...&&await this.ensureThreadWindow()}
        if (node.key.name === 'prewarm' && fn.async && fn.params.length === 0 && text.includes('this.ensureHomeWindow()') && text.includes('this.ensureThreadWindow()'))
          prewarms.lazyHotkeyWindowPrewarm.push(fn);
        // scheduleFill(){...this.fillTimer=setTimeout(()=>{...this.slot.prewarm().catch(()=>{})},2e3)}
        if (node.key.name === 'scheduleFill' && fn.params.length === 0 && text.includes('this.fillTimer') && text.includes('this.slot.prewarm()'))
          prewarms.lazyDetachedWindowPrewarm.push(fn);
      });
      // shouldUseOpaqueWindowSurface(appearance,bounds,focused){return this.shouldAlwaysUseOpaqueWindowSurface(e)||...}
      // Experiment hook only: Diagnostics/experiments.json {"opaqueWindows":true} forces the opaque surface.
      const surfaces = [];
      walk(trees.main, node => {
        if (node.type === 'MethodDefinition' && node.key.type === 'Identifier' && node.key.name === 'shouldUseOpaqueWindowSurface' &&
            node.value.params.length === 3 && src.slice(node.value.body.start, node.value.body.end).includes('this.shouldAlwaysUseOpaqueWindowSurface(')) surfaces.push(node.value);
      });
      record('opaqueSurfaceExperiment', 'main', surfaces, fn => ({ start: fn.body.start + 1, end: fn.body.start + 1, text: `${marker}if(globalThis.__codexPPOpaqueWindows===true)return!0;` }));
      for (const [name, matches] of Object.entries(prewarms))
        record(name, 'main', matches, fn => ({ start: fn.body.start + 1, end: fn.body.start + 1, text: `${marker}return;` }));
      // X.setOnBrowserStateChanged(()=>{menu.refreshApplicationMenu(),...}): the side-panel browser
      // reports its bounds on every frame while the window resizes or the panel animates, and each
      // report rebuilt the whole application menu (1.6 s of a 12 s resize, then a 0.9 s major GC).
      // Now the first change refreshes at once and a burst collapses into one more 250 ms later.
      const menuRefreshes = [];
      walk(trees.main, node => {
        if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || node.callee.property.name !== 'setOnBrowserStateChanged' || node.arguments.length !== 1) return;
        const fn = node.arguments[0];
        if (fn.type !== 'ArrowFunctionExpression' || fn.params.length !== 0) return;
        const calls = [];
        walk(fn.body, inner => { if (inner.type === 'CallExpression' && inner.arguments.length === 0 && member(inner, 'refreshApplicationMenu')) calls.push(inner); });
        if (calls.length === 1) menuRefreshes.push(calls[0]);
      });
      // Only the menu rebuild is throttled; the rest of the callback (such as the
      // focused window's active-thread sync) still runs on every change.
      record('coalesceBrowserMenuRefresh', 'main', menuRefreshes, call => ({ start: call.start, end: call.end,
        text: `${marker}(globalThis.__codexPPMenuRefresh??=(()=>{let ppTimer=0,ppPending=null;const ppTick=()=>{const ppRun=ppPending;ppPending=null;` +
          `if(ppRun){ppRun();ppTimer=setTimeout(ppTick,250)}else ppTimer=0};return ppRun=>{if(ppTimer){ppPending=ppRun;return}ppRun();ppTimer=setTimeout(ppTick,250)}})())` +
          `(()=>${src.slice(call.start, call.end)})` }));
    } else {
      skipped.authStorageGateCacheFirst = 'module not found';
      skipped.deferDockIcon = 'module not found';
      skipped.coalesceBrowserMenuRefresh = skipped.opaqueSurfaceExperiment = skipped.lazyPageWindowPrewarm = skipped.lazyAvatarOverlayPrewarm = skipped.lazyHotkeyWindowPrewarm = skipped.lazyDetachedWindowPrewarm = 'module not found';
    }

    if (trees.requirements) {
      const src = sources.requirements, phases = [];
      walk(trees.requirements, node => {
        if (node.type !== 'FunctionDeclaration' || !node.async || node.params.length !== 0) return;
        const body = src.slice(node.start, node.end);
        if (!body.includes('`policy-read`') || !body.includes('`node-permissions`') || !body.includes('`policy-validation`')) return;
        const first = node.body.body[0];
        let request = null, validate = null;
        walk(node.body, inner => {
          if (inner.type === 'VariableDeclarator' && inner.id.type === 'ObjectPattern' && inner.init?.type === 'AwaitExpression' && inner.init.argument.type === 'CallExpression') {
            const keys = new Set(inner.id.properties.map(p => p.key?.name));
            if (keys.has('appServerVersion') && keys.has('response')) request = inner.init;
          }
          if (request && inner.type === 'VariableDeclarator' && inner.id.type === 'Identifier' && inner.init?.type === 'CallExpression' &&
              inner.init.callee.type === 'Identifier' && inner.init.arguments.length === 2 && inner.init.start > request.end && !validate) validate = inner;
        });
        let load = null, mkdir = null;
        walk(node.body, inner => {
          // await (0, fs.mkdir)(home, {recursive: !0})
          if (!mkdir && inner.type === 'AwaitExpression' && inner.argument.type === 'CallExpression' && inner.argument.arguments.length === 2 &&
              /^0,[A-Za-z_$][\w$]*\.mkdir$/.test(body.slice(inner.argument.callee.start - node.start, inner.argument.callee.end - node.start)) &&
              /^\{recursive:!0\}$/.test(body.slice(inner.argument.arguments[1].start - node.start, inner.argument.arguments[1].end - node.start))) mkdir = inner;
        });
        walk(first ?? node.body, inner => {
          if (!load && inner.type === 'AwaitExpression' && inner.argument.type === 'CallExpression' && inner.argument.arguments.length === 0 &&
              inner.argument.callee.type === 'Identifier') load = inner;
        });
        const electron = /([A-Za-z_$][\w$]*)\.app\.getVersion\(\)/.exec(body)?.[1];
        if (first?.type === 'ExpressionStatement' && request && validate) phases.push({ node, first, request, validate, load, electron, mkdir });
      });
      const mark = name => `((globalThis.__codexPPStartupMain??={}).policy??={})[${JSON.stringify(name)}]=performance.now()`;
      record('policyPhaseTimings', 'requirements', phases, ({ node }) => ({ start: node.body.start + 1, end: node.body.start + 1, text: `${marker}${mark('entry')};` }));
      if (phases.length === 1 && phases[0].load && phases[0].electron) {
        const { load, electron } = phases[0];
        const volatile = '/^(SHLVL|_|PWD|OLDPWD|TMPDIR|TERM_SESSION_ID|SECURITYSESSIONID|SSH_AUTH_SOCK|__CF_USER_TEXT_ENCODING|COMMAND_MODE|XPC_[A-Z_]+|LaunchInstanceID)$/';
        // Only variables on this allow-list (paths, locale, editors, toolchain
        // directories) are ever written, and never a URL with credentials. Any
        // other variable the shell sets keeps the original blocking load.
        const cacheable = '/^(PATH|MANPATH|INFOPATH|FPATH|LANG|LC_[A-Z]+|EDITOR|VISUAL|PAGER|HOMEBREW_(PREFIX|CELLAR|REPOSITORY)|[A-Z][A-Z0-9_]*_(HOME|ROOT|DIR|PATH))$/';
        const sensitive = '/(KEY|TOKEN|SECRET|PASS|AUTH|CREDENTIAL|COOKIE|SESSION|PRIVATE)/i';
        const credentials = '/:\\/\\/[^\\/\\s@]*@/';
        edits.requirements.push({ name: 'shellEnvironmentCacheFirst', start: load.start, end: load.end, text: `${marker}await(async ppLoad=>{const ppFs=require("fs"),` +
          `ppFile=require("path").join(${electron}.app.getPath("userData"),"codexpp-shell-environment-v2.json"),ppBefore={...process.env},` +
          // Caches written before the allow-list may hold values it now refuses.
          `ppOld=(()=>{try{ppFs.unlinkSync(require("path").join(${electron}.app.getPath("userData"),"codexpp-shell-environment.json"))}catch{}})(),` +
          `ppSave=ppSavedAt=>{try{const ppEnv={},ppSensitive=[];for(const[ppName,ppValue]of Object.entries(process.env)){if(ppBefore[ppName]===ppValue||${volatile}.test(ppName))continue;` +
          `!${cacheable}.test(ppName)||${sensitive}.test(ppName)||${credentials}.test(ppValue)?ppSensitive.push(ppName):ppEnv[ppName]=ppValue}ppFs.writeFileSync(ppFile,JSON.stringify({env:ppEnv,sensitive:ppSensitive.length>0,savedAt:ppSavedAt}),{mode:0o600})}catch{}};` +
          `let ppCached=null;try{ppCached=JSON.parse(ppFs.readFileSync(ppFile,"utf8"))}catch{}` +
          // A blocking load at least weekly drops variables removed from the
          // shell's configuration (background saves keep the old timestamp).
          `if(ppCached?.sensitive!==!1||typeof ppCached.env!=="object"||!(Date.now()-ppCached.savedAt<6048e5)){const ppResult=await ppLoad();ppSave(Date.now());return ppResult}` +
          // Start the real load first: it spawns the shell with the launch environment.
          `const ppPending=ppLoad();Object.assign(process.env,ppCached.env);(globalThis.__codexPPStartupMain??={}).shellEnvironment="cached";` +
          `void ppPending.then(()=>ppSave(ppCached.savedAt),()=>{})})(${src.slice(load.argument.callee.start, load.argument.callee.end)})` });
        applied.shellEnvironmentCacheFirst = 'requirements';
        const { mkdir } = phases[0];
        if (mkdir) edits.requirements.push({ name: 'shellEnvironmentCacheFirst', start: mkdir.start, end: mkdir.end,
          text: `${marker}(require("fs").mkdirSync(${src.slice(mkdir.argument.arguments[0].start, mkdir.argument.arguments[0].end)},{recursive:!0}),void 0)` });
      } else if (trees.requirements) skipped.shellEnvironmentCacheFirst = 'shell environment load not found';
      if (phases.length === 1 && diagnostics) {
        const { first, request, validate } = phases[0];
        edits.requirements.push({ name: 'policyPhaseTimings', start: first.end, end: first.end, text: `${marker}${mark('environment')};` });
        edits.requirements.push({ name: 'policyPhaseTimings', start: request.start, end: request.start, text: `${marker}(${mark('policy-read')},0)||` });
        edits.requirements.push({ name: 'policyPhaseTimings', start: validate.end, end: validate.end, text: `,ppPhase=(${mark('policy-validated')})` });
      }
    } else skipped.policyPhaseTimings = 'module not found';

    if (typeof input.html === 'string' && typeof input.entry === 'string') {
      const html = input.html;
      const list = /const __vite__mapDeps=.*?m\.f\|\|\(m\.f=(\[[^\]]*\])/.exec(input.entry)?.[1];
      let deps = null;
      try { deps = JSON.parse(list); } catch {}
      const anchor = html.lastIndexOf('<link rel="modulepreload"');
      if (html.includes('codexpp:startup')) throw new Error('Startup fast path already applied.');
      if (!Array.isArray(deps) || !deps.every(d => typeof d === 'string' && /^\.\/[\w.-]+\.(js|css)$/.test(d)) || anchor < 0) {
        skipped.entryPreload = 'entry dependency list not recognised';
      } else {
        const lineEnd = html.indexOf('>', anchor) + 1;
        const links = deps.filter(d => !html.includes(`assets/${d.slice(2)}"`)).map(d => d.endsWith('.css')
          ? `<link rel="preload" as="style" crossorigin href="./assets/${d.slice(2)}">`
          : `<link rel="modulepreload" crossorigin href="./assets/${d.slice(2)}">`);
        if (links.length) {
          result_html = html.slice(0, lineEnd) + `\n    <!--codexpp:startup-->` + links.map(l => `\n    ${l}`).join('') + html.slice(lineEnd);
          applied.entryPreload = 'html';
        } else skipped.entryPreload = 'nothing to preload';
      }
    }

    // Checkout webview hosts (the webview-page chunk exporting CheckoutPricingWebviewHost).
    // Pricing: j=...&&get(`use_embedded_checkout`,!1)?ge({currentPlan,url}):null is the
    // prewarm target; the /checkout/web route still presents through its own search.
    const pricing = [], credit = [];
    if (trees.checkout) walk(trees.checkout, node => {
      if (node.type === 'ConditionalExpression' && node.alternate.type === 'Literal' && node.alternate.value === null &&
          sources.checkout.slice(node.test.start, node.test.end).includes('`use_embedded_checkout`')) pricing.push(node);
      // Credit: if(...,!S&&(ne()||...||!...get(`use_embedded_credit_checkout`,!1)))return null; renders a prewarm otherwise.
      if (node.type === 'LogicalExpression' && node.operator === '&&' && node.left.type === 'UnaryExpression' && node.left.operator === '!' &&
          node.right.type === 'LogicalExpression' && node.right.operator === '||' &&
          sources.checkout.slice(node.right.start, node.right.end).includes('`use_embedded_credit_checkout`')) credit.push(node);
    });
    record('lazyCheckoutPricingPrewarm', 'checkout', pricing, node => ({ start: node.test.start, end: node.test.start, text: `${marker}!1&&` }));
    record('lazyCheckoutCreditPrewarm', 'checkout', credit, node => ({ start: node.right.start, end: node.right.start, text: `${marker}!0||` }));

    // wakeAwarePongTimeout: the websocket keep-alive pings every 10 s and drops
    // the socket once 60 s pass without a pong. Its timer stops while the Mac
    // sleeps, so the first tick after a wake saw the whole sleep as silence and
    // dropped a socket that still worked, and every thread then resynced. A
    // tick that comes more than two intervals late now pings first and allows
    // half an interval for the pong, so a dead socket is still dropped within
    // seconds of a wake and a live one is kept.
    if (trees.network) {
      const pings = [];
      walk(trees.network, node => {
        if (node.type !== 'FunctionDeclaration' || node.params.length !== 2 || node.params[1].type !== 'ObjectPattern') return;
        const local = {};
        for (const p of node.params[1].properties) {
          if (p.type === 'Property' && p.key.type === 'Identifier' && p.value.type === 'AssignmentPattern' && p.value.left.type === 'Identifier') local[p.key.name] = p.value.left.name;
        }
        if (!local.pingIntervalMs || !local.pongTimeoutMs || !node.params[1].properties.some(p => p.key?.name === 'onPongTimeout')) return;
        walk(node.body, call => {
          if (call.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.callee.name !== 'setInterval' || call.arguments.length !== 2) return;
          const [tick, interval] = call.arguments;
          if (tick.type !== 'ArrowFunctionExpression' || tick.params.length !== 0 || tick.body.type !== 'BlockStatement' ||
              interval.type !== 'Identifier' || interval.name !== local.pingIntervalMs) return;
          let lastPong = null;
          walk(tick.body, test => {
            if (test.type === 'BinaryExpression' && test.operator === '>' && test.right.type === 'Identifier' && test.right.name === local.pongTimeoutMs &&
                test.left.type === 'BinaryExpression' && test.left.operator === '-' && test.left.right.type === 'Identifier' &&
                isDateNow(test.left.left)) lastPong = test.left.right.name;
          });
          if (lastPong && sources.network.slice(tick.body.start, tick.body.end).includes('.ping()')) pings.push({ tick, lastPong, ...local });
        });
      });
      function isDateNow(node) { return node.type === 'CallExpression' && member(node, 'now') && node.callee.object.type === 'Identifier' && node.callee.object.name === 'Date'; }
      record('wakeAwarePongTimeout', 'network', pings, ({ tick, lastPong, pingIntervalMs: n, pongTimeoutMs: r }) => ({ start: tick.start, end: tick.end,
        text: `${marker}((ppTick)=>()=>{let ppNow=Date.now();ppNow-ppTick>2*${n}&&(${lastPong}=Math.max(${lastPong},ppNow-${r}+${n}/2));ppTick=ppNow;` +
          `${sources.network.slice(tick.body.start + 1, tick.body.end - 1)}})(Date.now())` }));
    } else skipped.wakeAwarePongTimeout = 'module not found';

    // predictOnlyOpenThreads: when any turn completes, the window forks that
    // whole conversation to predict the user's next message, even for a thread
    // nobody is looking at. A thread's composer already requests the same
    // prediction for each new turn while it is open (the main process shares
    // one request per turn), and again when the thread is opened later. So a
    // live prediction is requested only while a composer for that thread is
    // mounted; its prediction query exists exactly then.
    if (trees.shared) {
      const predictions = [];
      walk(trees.shared, (node, ancestors) => {
        if (!member(node, 'addTurnCompletedListener') || node.arguments.length !== 1 || node.arguments[0].type !== 'ArrowFunctionExpression') return;
        const listener = node.arguments[0], text = sources.shared.slice(listener.start, listener.end);
        if (!text.includes('generationTrigger:`live`')) return;
        const owner = [...ancestors].reverse().find(a => a.type === 'FunctionDeclaration');
        const scope = owner?.params[0];
        if (scope?.type !== 'Identifier') return;
        walk(listener.body, call => {
          if (member(call, 'requestUserMessagePrediction') && call.arguments.length === 2 && call.arguments[0].type === 'Identifier') {
            predictions.push({ call, scope: scope.name, target: call.arguments[0].name });
          }
        });
      });
      record('predictOnlyOpenThreads', 'shared', predictions, ({ call, scope, target }) => ({ start: call.start, end: call.end,
        text: `${marker}((ppCache)=>ppCache!=null&&ppCache.findAll({queryKey:[\`cumberbatch\`]}).every(ppQuery=>ppQuery.queryKey[1]?.threadId!==${target}.threadId))` +
          `(${scope}.queryClient?.getQueryCache?.())?Promise.resolve(null):${sources.shared.slice(call.start, call.end)}` }));
    } else skipped.predictOnlyOpenThreads = 'module not found';

    // plainSettledWords: while a reply streams, every word is its own fading
    // <span>, and every frame rebuilds and reconciles a span for every word of
    // the message, so frames cost more the longer the reply gets. A word whose
    // fade has finished has no class, handler or ref left; runs of those are
    // now emitted as plain text, so only the words still fading are elements.
    if (trees.initial) {
      const fades = [];
      walk(trees.initial, node => {
        if (node.type !== 'FunctionDeclaration' || node.params.length !== 1 || node.params[0].type !== 'ObjectPattern') return;
        const local = {};
        for (const p of node.params[0].properties) if (p.type === 'Property' && p.key.type === 'Identifier' && p.value.type === 'Identifier') local[p.key.name] = p.value.name;
        if (!local.fadeText || !local.fadeSegmentTimeline || !local.keys || !local.segments || !local.fadeSegmentStartIndex) return;
        const body = node.body.body;
        if (body.length !== 1 || body[0].type !== 'ReturnStatement' || body[0].argument?.type !== 'ConditionalExpression') return;
        const { test, consequent } = body[0].argument;
        if (test.type !== 'Identifier' || test.name !== local.fadeText || !member(consequent, 'map') || consequent.callee.object.type !== 'Identifier' ||
            consequent.callee.object.name !== local.segments || consequent.arguments.length !== 1) return;
        const each = consequent.arguments[0];
        if (each.type !== 'ArrowFunctionExpression' || each.params.length !== 2 || !sources.initial.slice(each.start, each.end).includes('`span`')) return;
        fades.push({ consequent, each, ...local });
      });
      record('plainSettledWords', 'initial', fades, ({ consequent, each, keys, segments, fadeSegmentTimeline: timeline }) => ({ start: consequent.start, end: consequent.end,
        text: `${marker}((ppOut,ppText,ppEach)=>(${segments}.forEach((ppSegment,ppIndex)=>{let ppKey=${keys}?.[ppIndex];` +
          `if(typeof ppSegment==="string"&&ppKey!=null&&${timeline}?.settledKeys.has(ppKey)){ppText=(ppText??"")+ppSegment;return}` +
          `ppText!=null&&(ppOut.push(ppText),ppText=null);ppOut.push(ppEach(ppSegment,ppIndex))}),ppText!=null&&ppOut.push(ppText),ppOut))` +
          `([],null,${sources.initial.slice(each.start, each.end)})` }));
    } else skipped.plainSettledWords = 'module not found';

    // capIdlePageSessions: closing a Page keeps its realtime session (a
    // websocket, the CRDT document and its heartbeat) for 2 minutes so that
    // reopening it is instant, with no limit on how many are kept: browsing
    // 40 pages in a Space leaves 40 live sockets for those 2 minutes. At most 4
    // idle sessions now wait out the grace period; when another one starts
    // waiting, the longest-idle ones are closed at once through the app's own
    // disposal. A session that has consumers, pending updates, deferred local
    // edits, recovery drafts or an unfinished local save is never counted or
    // closed (the same checks the app makes before disposing).
    if (trees.initial) {
      const caps = [];
      walk(trees.initial, node => {
        if (node.type !== 'FunctionDeclaration' || node.params.length !== 1 || node.params[0].type !== 'Identifier') return;
        const p = node.params[0].name, body = node.body.body, first = body[0];
        if (first?.type !== 'IfStatement' || first.consequent.type !== 'ReturnStatement' || first.test.type !== 'LogicalExpression') return;
        const guard = first.test.right;
        if (!sources.initial.slice(first.test.start, first.test.end).startsWith(`${p}.disposed||${p}.consumers!==0||`) || guard.type !== 'CallExpression' ||
            guard.callee.type !== 'Identifier' || guard.arguments.length !== 1 || guard.arguments[0].type !== 'Identifier' || guard.arguments[0].name !== p) return;
        const timer = body.find(s => s.type === 'ExpressionStatement' && s.expression.type === 'AssignmentExpression' && s.expression.operator === '??=' &&
          sources.initial.slice(s.expression.left.start, s.expression.left.end) === `${p}.disposalTimer` && s.expression.right.type === 'CallExpression' &&
          s.expression.right.callee.type === 'Identifier' && s.expression.right.callee.name === 'setTimeout');
        const now = body.find(s => s.type === 'IfStatement' && sources.initial.slice(s.test.start, s.test.end).includes('!==`connected`') &&
          s.consequent.type === 'BlockStatement' && s.consequent.body.length === 2 && s.consequent.body[1].type === 'ReturnStatement');
        const call = now?.consequent.body[0].expression;
        if (!timer || call?.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.arguments[0]?.name !== p) return;
        // The disposal function removes the session from the session map under each of its keys.
        let map = null;
        walk(trees.initial, fn => {
          if (fn.type !== 'FunctionDeclaration' || fn.id?.name !== call.callee.name || fn.params.length !== 1) return;
          const q = fn.params[0].name;
          walk(fn.body, loop => {
            if (loop.type !== 'ForOfStatement' || sources.initial.slice(loop.right.start, loop.right.end) !== `${q}.keys`) return;
            const m = /^([A-Za-z_$][\w$]*)\.get\(([A-Za-z_$][\w$]*)\)===([A-Za-z_$][\w$]*)&&\1\.delete\(\2\);?$/.exec(sources.initial.slice(loop.body.start, loop.body.end));
            if (m && m[3] === q) map = m[1];
          });
        });
        if (map) caps.push({ timer, p, guard: guard.callee.name, dispose: call.callee.name, map });
      });
      record('capIdlePageSessions', 'initial', caps, ({ timer, p, guard, dispose, map }) => ({ start: timer.start, end: timer.end,
        text: `${marker}try{const ppIdle=[...new Set(${map}.values())].filter(ppEntry=>ppEntry===${p}||!ppEntry.disposed&&ppEntry.consumers===0&&ppEntry.idleSince!=null&&` +
          `ppEntry.disposalTimer!=null&&!${guard}(ppEntry)).sort((ppA,ppB)=>ppA.idleSince.monotonicMs-ppB.idleSince.monotonicMs);` +
          `for(let ppExtra=ppIdle.length-4;ppExtra>0;ppExtra--){const ppOldest=ppIdle.shift();ppOldest.consumers===0&&!${guard}(ppOldest)&&${dispose}(ppOldest)}}catch{}` +
          `if(${p}.disposed)return;${sources.initial.slice(timer.start, timer.end)}` }));

      // childPagesPollOnSpaceRoute: each expanded folder in the Space sidebar
      // keeps a child-page list query that refetches every 30 s while the
      // window is focused, also when the app is showing a chat and not a Space.
      // The spaces list next to it polls only on a /space route (its own
      // route-and-focus gate). The child lists now use that same gate, so they
      // poll on Space routes as before and stop elsewhere; they still refetch
      // when they mount and whenever they become stale. Before the gate is
      // initialised, the original focus check applies.
      const gates = [], polls = [];
      walk(trees.initial, (node, ancestors) => {
        if (node.type === 'ArrowFunctionExpression' && node.params.length === 1 && node.params[0].type === 'ObjectPattern' && node.body.type === 'LogicalExpression' &&
            node.body.operator === '&&' && sources.initial.slice(node.body.left.start, node.body.left.end).endsWith('.pathname?.startsWith(`/space`)===!0')) {
          const focus = node.body.right, holder = ancestors.at(-2);
          if (focus.type === 'BinaryExpression' && focus.operator === '!==' && isFalse(focus.right) && focus.left.type === 'CallExpression' &&
              focus.left.arguments.length === 1 && focus.left.arguments[0].type === 'Identifier' && ancestors.at(-1)?.type === 'CallExpression') {
            const name = holder?.type === 'AssignmentExpression' && holder.left.type === 'Identifier' ? holder.left.name
              : holder?.type === 'VariableDeclarator' && holder.id.type === 'Identifier' ? holder.id.name : null;
            if (name) gates.push({ name, focus: focus.left.arguments[0].name });
          }
        }
        if (node.type !== 'ObjectExpression') return;
        const props = new Map(node.properties.filter(p => p.type === 'Property' && !p.computed && p.key.type === 'Identifier').map(p => [p.key.name, p.value]));
        const list = props.get('listId'), interval = props.get('metadataRefreshInterval');
        if (list?.type !== 'TemplateLiteral' || !list.quasis[0].value.cooked.startsWith('parent:') || interval?.type !== 'LogicalExpression' || interval.operator !== '&&') return;
        const test = interval.left;
        if (test.type === 'BinaryExpression' && test.operator === '!==' && isFalse(test.right) && test.left.type === 'CallExpression' && test.left.callee.type === 'Identifier' &&
            test.left.arguments.length === 1 && test.left.arguments[0].type === 'Identifier') polls.push({ test, get: test.left.callee.name, focus: test.left.arguments[0].name });
      });
      if (gates.length !== 1) skipped.childPagesPollOnSpaceRoute = `expected one Space route gate, found ${gates.length}`;
      else record('childPagesPollOnSpaceRoute', 'initial', polls.filter(poll => poll.focus === gates[0].focus), ({ test, get }) => ({ start: test.start, end: test.end,
        text: `${marker}(${gates[0].name}==null?${sources.initial.slice(test.start, test.end)}:${get}(${gates[0].name}))` }));
    } else skipped.capIdlePageSessions = skipped.childPagesPollOnSpaceRoute = 'module not found';

    // trashPaginationGuard: Empty Trash in a Space first lists every archived
    // page, following next_cursor until the server returns none. A cursor that
    // repeats (or a listing that never ends) kept the loop requesting forever
    // and the dialog never finished; the spaces list guards the same pattern.
    // The loop now also stops when a cursor repeats or after 200 pages
    // (10,000 items), and goes on with the pages collected so far.
    if (trees.trash) {
      const loops = [];
      walk(trees.trash, node => {
        if (node.type !== 'DoWhileStatement' || node.test.type !== 'BinaryExpression' || node.test.operator !== '!=' || node.test.left.type !== 'Identifier' ||
            node.test.right.type !== 'Literal' || node.test.right.value !== null) return;
        const cursor = node.test.left.name, body = sources.trash.slice(node.body.start, node.body.end);
        if (body.includes('`/pages/archived`') && body.includes(`cursor:${cursor}`) &&
            new RegExp(`[;,{]${cursor.replace(/\$/g, '\\$')}=[^;,]*\\.next_cursor\\?\\?void 0`).test(body)) loops.push({ node, cursor });
      });
      record('trashPaginationGuard', 'trash', loops, ({ node, cursor }) => ({ start: node.start, end: node.end,
        text: `${marker}{const ppSeen=new Set;do${sources.trash.slice(node.body.start, node.body.end)}while(${sources.trash.slice(node.test.start, node.test.end)}&&` +
          `!(ppSeen.has(${cursor})||ppSeen.add(${cursor}).size>=200));}` }));
    } else skipped.trashPaginationGuard = 'module not found';

    // queuedAppearanceChange: a Space's icon and colour are saved with one
    // request per change, and a change made while a save was still in flight
    // was dropped without a word (the picker showed it, then reverted). The
    // latest change made during a save is now kept (several merge into one)
    // and sent when that save succeeds, through the same save path and its
    // checks. If the save fails, the queued change is dropped with it.
    if (trees.appearance) {
      const saves = [];
      walk(trees.appearance, (node, ancestors) => {
        if (node.type !== 'ArrowFunctionExpression' || !node.async || node.params.length !== 1 || node.params[0].type !== 'Identifier' || node.body.type !== 'BlockStatement') return;
        const first = node.body.body[0];
        if (first?.type !== 'IfStatement' || first.consequent.type !== 'ReturnStatement' || !sources.appearance.slice(first.test.start, first.test.end).includes('.saving===!0')) return;
        if (ancestors.at(-1)?.type !== 'AssignmentExpression') return;
        let then = null, space = null, signal = null;
        walk(node.body, inner => {
          if (!member(inner, 'then') || inner.arguments.length !== 1) return;
          const patch = inner.callee.object;
          if (!member(patch, 'safePatch') || patch.arguments.length !== 2 || patch.arguments[0].type !== 'TemplateLiteral' ||
              patch.arguments[0].quasis[0].value.cooked !== '/spaces/v2/{space_id}/appearance') return;
          const options = sources.appearance.slice(patch.arguments[1].start, patch.arguments[1].end);
          const id = /path:\{space_id:([A-Za-z_$][\w$]*\.id)\}/.exec(options), aborts = /signal:([A-Za-z_$][\w$]*)\.signal[,}]/.exec(options);
          if (id && aborts) { then = inner.arguments[0]; space = id[1]; signal = aborts[1]; }
        });
        if (then) saves.push({ node, then, space, signal });
      });
      record('queuedAppearanceChange', 'appearance', saves, ({ node, then, space, signal }) => {
        const src = sources.appearance;
        // The original save, with its success callback marking whether the save went through.
        const original = src.slice(node.start, then.start) + `async(...ppArgs)=>{await(${src.slice(then.start, then.end)})(...ppArgs);ppMine.saved=!${signal}.signal.aborted}` +
          src.slice(then.end, node.end);
        return { start: node.start, end: node.end,
          text: `${marker}async function ppSaveAppearance(ppPatch){const ppQueue=globalThis.__codexPPAppearanceQueue??=new Map,ppKey=${space},ppBusy=ppQueue.get(ppKey);` +
            `if(ppBusy){ppBusy.pending={...ppBusy.pending,...ppPatch};return}const ppMine={pending:null,saved:!1};ppQueue.set(ppKey,ppMine);` +
            `try{await(${original})(ppPatch)}finally{ppQueue.get(ppKey)===ppMine&&ppQueue.delete(ppKey)}` +
            `ppMine.saved&&ppMine.pending!=null&&await ppSaveAppearance({...ppPatch,...ppMine.pending})}` };
      });
    } else skipped.queuedAppearanceChange = 'module not found';
    // stderrNotConnectionError (main process, app-server connection): the stdio
    // transport reports every non-empty line the app-server writes to stderr
    // through onerror, and the connection stored each one as its connection
    // error ({code: "connection-failed", message: <line>}), which every window
    // then receives with the next connection-state broadcast, even while the
    // host stays connected; harmless WARN lines did this hundreds of times. A
    // stderr line (an error event without an error object) of a stdio
    // transport whose process is still running is now only logged as before.
    // The transport still keeps the last line, which becomes the close reason
    // and the "most recent error" when the process exits; process and stdin
    // errors, websocket errors and lines that mean restart or update required
    // are recorded as before.
    if (trees.appServer) {
      const handlers = [];
      walk(trees.appServer, node => {
        if (node.type !== 'AssignmentExpression' || node.left.type !== 'MemberExpression' || node.left.computed || node.left.property.name !== 'onerror' ||
            node.left.object.type !== 'Identifier' || node.right.type !== 'ArrowFunctionExpression' || node.right.params.length !== 1 || node.right.params[0].type !== 'Identifier') return;
        const handler = node.right, connection = node.left.object.name, event = handler.params[0].name;
        const text = sources.appServer.slice(handler.start, handler.end);
        if (!text.includes('`Codex CLI stderr`') || !text.includes('this.options.transport.kind') || !text.includes(`this.connection!==${connection}`)) return;
        walk(handler.body, set => {
          if (set.type === 'AssignmentExpression' && set.operator === '=' && set.left.type === 'MemberExpression' && set.left.object.type === 'ThisExpression' &&
              !set.left.computed && set.left.property.name === 'connectionError' && set.right.type === 'CallExpression' && set.right.arguments.length === 1) handlers.push({ set, connection, event });
        });
      });
      record('stderrNotConnectionError', 'appServer', handlers, ({ set, connection, event }) => ({ start: set.start, end: set.end,
        text: `${marker}((ppError)=>this.options.transport.kind===\`stdio\`&&${connection}.readyState===1&&!(${event}!=null&&typeof ${event}=="object"&&"error" in ${event})&&` +
          `ppError?.code===\`connection-failed\`||(this.connectionError=ppError))(${sources.appServer.slice(set.right.start, set.right.end)})` }));
    } else skipped.stderrNotConnectionError = 'module not found';

    // remoteControlBackoff (main process, remote-control websocket): while any
    // remote-control stream is open, a dropped websocket is reopened 1 s later,
    // and a failed attempt (each one enrolls the client and asks for a new
    // handshake) schedules the next 1 s later, forever. Retries now back off:
    // 1 s, doubling to 30 s, with +-20% jitter, back to 1 s once a websocket is
    // installed again.
    if (trees.appServer) {
      const reconnects = [];
      walk(trees.appServer, node => {
        if (node.type !== 'ClassBody') return;
        const method = name => node.body.find(m => m.type === 'MethodDefinition' && !m.computed && m.key.type === 'Identifier' && m.key.name === name);
        const schedule = method('scheduleReconnect'), install = method('installWebsocket');
        if (!schedule || !install || !method('ensureOpen')) return;
        walk(schedule.value.body, (call, ancestors) => {
          if (call.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.callee.name !== 'setTimeout' || call.arguments.length !== 2) return;
          if (ancestors.some(a => a.type === 'FunctionExpression' || a.type === 'FunctionDeclaration')) return;
          const [fire, delay] = call.arguments;
          if (fire.type !== 'ArrowFunctionExpression' || delay.type !== 'Identifier' || !sources.appServer.slice(fire.start, fire.end).includes('this.ensureOpen().catch(')) return;
          reconnects.push({ delay, install });
        });
      });
      record('remoteControlBackoff', 'appServer', reconnects, ({ delay, install }) => [
        { start: delay.start, end: delay.end,
          text: `${marker}((ppStep)=>(this.ppRemoteBackoff=ppStep+1,Math.min(${delay.name}*2**ppStep,3e4)*(.8+Math.random()*.4)))(Math.min(this.ppRemoteBackoff??0,5))` },
        { start: install.value.body.start + 1, end: install.value.body.start + 1, text: `${marker}this.ppRemoteBackoff=0;` },
      ]);
    } else skipped.remoteControlBackoff = 'module not found';

    // pubsubReconnectCap: the ChatGPT pubsub socket grows its reconnect delay
    // without limit (x1.5 from 1-5 s while focused, x2 from 2-10 s in the
    // background), so after a long outage the next attempt can be hours away,
    // and focusing the window reconnects only once every retry is used up.
    // The delay is now capped at 60 s; focusing the window also reconnects at
    // once while a retry is merely waiting; and the window's online event
    // reconnects a socket that is not open. reconnect() clears the pending
    // timer and does nothing while a socket exists or after close().
    if (trees.shared) {
      const caps = [], focus = [], listeners = [];
      const keys = ['maxReconnectionDelay', 'maxRetries', 'minReconnectionDelay', 'reconnectionDelayGrowFactor'];
      walk(trees.shared, (node, ancestors) => {
        if (node.type === 'ObjectExpression' && node.properties.length === keys.length) {
          const names = node.properties.map(p => p.type === 'Property' && !p.computed && p.key.type === 'Identifier' ? p.key.name : null);
          const cap = node.properties[names.indexOf('maxReconnectionDelay')]?.value;
          if (keys.every(k => names.includes(k)) && cap?.type === 'BinaryExpression' && cap.operator === '/' && cap.left.value === 1 && cap.right.value === 0) caps.push(cap);
        }
        if (node.type === 'PropertyDefinition' && !node.computed && node.key.name === 'handleWindowFocusChange' && node.value?.type === 'ArrowFunctionExpression' &&
            sources.shared.slice(node.value.start, node.value.end).includes('this.isTransportOpen')) {
          walk(node.value.body, test => {
            if (test.type === 'UnaryExpression' && test.operator === '!' && test.argument.type === 'MemberExpression' && !test.argument.computed &&
                test.argument.property.name === 'shouldReconnect' && test.argument.object.type === 'MemberExpression' && test.argument.object.object.type === 'ThisExpression') {
              focus.push({ test, socket: sources.shared.slice(test.argument.object.start, test.argument.object.end), owner: ancestors[ancestors.length - 1] });
            }
          });
        }
        if ((member(node, 'addEventListener') || member(node, 'removeEventListener')) && node.callee.object.type === 'Identifier' && node.callee.object.name === 'window' &&
            node.arguments.length === 2 && node.arguments[0].type === 'TemplateLiteral' && node.arguments[0].expressions.length === 0 && node.arguments[0].quasis[0].value.cooked === 'focus' &&
            sources.shared.slice(node.arguments[1].start, node.arguments[1].end) === 'this.handleWindowFocusChange' &&
            ['SequenceExpression', 'ExpressionStatement'].includes(ancestors[ancestors.length - 1]?.type)) {
          listeners.push({ call: node, add: member(node, 'addEventListener'), owner: [...ancestors].reverse().find(a => a.type === 'ClassBody') });
        }
      });
      const owner = focus[0]?.owner, add = listeners.filter(l => l.add && l.owner === owner), remove = listeners.filter(l => !l.add && l.owner === owner);
      const matches = caps.length === 2 && focus.length === 1 && add.length === 1 && remove.length === 1 ? [{ caps, ...focus[0], add: add[0].call, remove: remove[0].call }] : [];
      record('pubsubReconnectCap', 'shared', matches, ({ caps, test, socket, add, remove }) => [
        ...caps.map(cap => ({ start: cap.start, end: cap.end, text: `${marker}6e4` })),
        { start: test.start, end: test.end, text: `${marker}(${sources.shared.slice(test.start, test.end)}||${socket}.reconnectTimer!=null)` },
        { start: add.end, end: add.end, text: `${marker},window.addEventListener(\`online\`,this.ppOnline??=()=>{this.isTransportOpen||${socket}.reconnect?.()})` },
        { start: remove.end, end: remove.end, text: `${marker},window.removeEventListener(\`online\`,this.ppOnline)` },
      ]);
    } else skipped.pubsubReconnectCap = 'module not found';

    // resumeVisibleThreadFirst: when a host's websocket reconnects, the window
    // marks every conversation for resume, refreshes the whole recent-thread
    // list, and only after that resumes the conversation on screen, so the
    // thread the user is looking at waits for the list. Its resume now starts
    // together with the refresh; both are awaited, and the failure handling
    // and the recovery log fields are unchanged.
    if (trees.initial) {
      const recoveries = [];
      walk(trees.initial, node => {
        if (node.type !== 'BlockStatement') return;
        const body = node.body;
        for (let i = 1; i + 1 < body.length; i++) {
          const refresh = body[i], next = body[i + 1];
          if (refresh.type !== 'TryStatement' || !refresh.handler || !sources.initial.slice(refresh.block.start, refresh.block.end).includes('.refreshRecentConversations()')) continue;
          if (!body.slice(0, i).some(s => /\.markAllConversationsNeedResumeAfterReconnect\(\{restoreStreams:/.test(sources.initial.slice(s.start, s.end)))) continue;
          if (next.type !== 'VariableDeclaration' || next.declarations.length !== 1) continue;
          const init = next.declarations[0].init;
          if (init?.type !== 'ConditionalExpression' || init.alternate.type !== 'AwaitExpression' || init.alternate.argument.type !== 'CallExpression') continue;
          recoveries.push({ refresh, test: init.test, call: init.alternate.argument });
        }
      });
      record('resumeVisibleThreadFirst', 'initial', recoveries, ({ refresh, test, call }) => [
        { start: refresh.start, end: refresh.start,
          text: `${marker}let ppResume=${sources.initial.slice(test.start, test.end)}?null:${sources.initial.slice(call.start, call.end)};ppResume?.catch(()=>{});` },
        { start: call.start, end: call.end, text: `${marker}ppResume` },
      ]);
    } else skipped.resumeVisibleThreadFirst = 'module not found';

    // remoteSettingsPollWhenVisible: the Remote Connections settings page
    // refreshes the remote and remote-control connection lists every 15 s for
    // as long as it is mounted, also while the window is hidden or minimised.
    // Ticks are now skipped while the document is hidden.
    if (trees.remoteSettings) {
      const polls = [];
      walk(trees.remoteSettings, (node, ancestors) => {
        if (!member(node, 'setInterval') || node.callee.object.type !== 'Identifier' || node.callee.object.name !== 'window' || node.arguments.length !== 2) return;
        const [tick, interval] = node.arguments;
        if (tick.type !== 'ArrowFunctionExpression' || tick.params.length !== 0 || tick.body.type !== 'BlockStatement' || tick.body.body.length !== 1 || interval.type !== 'Identifier') return;
        const call = tick.body.body[0].expression;
        if (call?.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.arguments.length !== 0) return;
        const effect = [...ancestors].reverse().find(a => a.type === 'ArrowFunctionExpression');
        const text = effect ? sources.remoteSettings.slice(effect.start, effect.end) : '';
        if (text.includes('new AbortController') && text.includes('window.clearInterval(')) polls.push(call);
      });
      record('remoteSettingsPollWhenVisible', 'remoteSettings', polls, call => ({ start: call.start, end: call.start, text: `${marker}document.hidden||` }));
    } else skipped.remoteSettingsPollWhenVisible = 'module not found';

    // quietSidebarRebind (main process): the Browser sidebar registers its
    // window on every browser-panel request, and each call recorded a debug
    // event and logged "rebound browser sidebar window" although the owner had
    // not changed (tens of thousands of lines a day, up to 138 a second). When
    // the owner is the same, the call now returns after ensuring the window
    // record; a new or changed owner is handled and logged as before.
    if (trees.main) {
      const registrations = [];
      walk(trees.main, node => {
        if (node.type !== 'MethodDefinition' || node.computed || node.key.name !== 'registerWindow' || node.value.params.length !== 1 || node.value.params[0].type !== 'ObjectPattern') return;
        const owner = node.value.params[0].properties.find(p => p.type === 'Property' && !p.computed && p.key.name === 'ownerWebContentsId' && p.value.type === 'Identifier');
        const body = node.value.body.body;
        if (!owner || body.length !== 3 || body[0].type !== 'VariableDeclaration' || body[1].type !== 'IfStatement' || body[2].type !== 'ExpressionStatement') return;
        const declarations = body[0].declarations, ensure = declarations.findIndex(d => member(d.init, 'ensureWindowRecord'));
        const previous = declarations[ensure - 1];
        if (ensure < 1 || previous.id.type !== 'Identifier' || !/\.ownerWebContentsId$/.test(sources.main.slice(previous.init.start, previous.init.end))) return;
        const tail = sources.main.slice(body[2].start, body[2].end);
        if (!tail.includes('this.recordDebugEvent(') || !tail.includes('`browser-window-owner-rebound`')) return;
        registrations.push({ at: body[1], previous: previous.id.name, owner: owner.value.name });
      });
      record('quietSidebarRebind', 'main', registrations, ({ at, previous, owner }) => ({ start: at.start, end: at.start, text: `${marker}if(${previous}===${owner})return;` }));
    } else skipped.quietSidebarRebind = 'module not found';

    const result = { applied, skipped };
    if (result_html) result.html = result_html;
    if (input.css && typeof input.css === 'object') {
      const css = {};
      for (const [path, text] of Object.entries(input.css)) {
        if (typeof text !== 'string') continue;
        const rewritten = rewriteViewportCSS(text);
        if (rewritten !== null) css[path] = rewritten;
      }
      if (Object.keys(css).length) { result.css = css; applied.viewportContainerQueries = 'css'; }
      else skipped.viewportContainerQueries = 'no width media queries';
    } else skipped.viewportContainerQueries = 'stylesheets not provided';
    // Each edit names its speed-up. An edit that overlaps another replacement,
    // reuses an identifier the vendor code already has, or leaves the module
    // unparsable is dropped by name and reported; the others still apply.
    const drop = (name, reason) => { delete applied[name]; skipped[name] = reason; };
    const compose = (file, list) => {
      let source = sources[file];
      for (const edit of [...list].sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
      return source;
    };
    const parses = text => { try { parse(text); return true; } catch { return false; } };
    for (const [file, list] of Object.entries(edits)) {
      if (!list.length) continue;
      const rejected = new Map();
      const ordered = [...list].sort((a, b) => a.start - b.start || a.end - b.end);
      for (let i = 1; i < ordered.length; i++) {
        if (ordered[i].start < ordered[i - 1].end) for (const edit of [ordered[i - 1], ordered[i]]) rejected.set(edit.name, 'overlaps another edit');
      }
      const existing = new Map();
      for (const edit of list) {
        for (const id of new Set(edit.text.match(/\bpp[A-Z][\w$]*/g) ?? [])) {
          if (!existing.has(id)) existing.set(id, new RegExp(`\\b${id.replace(/\$/g, '\\$')}\\b`).test(sources[file]));
          if (existing.get(id)) rejected.set(edit.name, `identifier ${id} already exists`);
        }
      }
      let kept = list.filter(edit => !rejected.has(edit.name));
      if (!parses(compose(file, kept))) {
        for (const name of new Set(kept.map(edit => edit.name))) {
          if (!parses(compose(file, kept.filter(edit => edit.name === name)))) rejected.set(name, 'did not parse');
        }
        kept = kept.filter(edit => !rejected.has(edit.name));
        if (!parses(compose(file, kept))) for (const edit of kept) rejected.set(edit.name, 'did not parse with the other edits');
        kept = kept.filter(edit => !rejected.has(edit.name));
      }
      for (const [name, reason] of rejected) drop(name, reason);
      if (kept.length) result[file] = compose(file, kept);
    }
    return result;
  }
});
