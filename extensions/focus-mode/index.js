// Requires the checked Codex++ shell contract; never guess at app internals.
// Only the reviewed primary renderer loads that contract. Detached/browser and
// standalone Settings renderers are valid app pages, but do not host this shell.
// Skip them before waiting, so their intentional absence cannot become a global
// extension error. Keep the readiness/error checks for supported renderers.
if (globalThis.location?.pathname !== '/index.html') return;
if (typeof api.waitForShell !== 'function') throw Error('Update the Codex++ helper and reload the app to use Focus Mode.');
return api.waitForShell().then(shell => {
if (shell?.protocol !== 1) throw Error('Focus Mode needs the Codex++ shell v1 adapter. Repatch the app.');
if (['snapshot', 'setSidebarOpen', 'windowControls'].some(name => typeof shell[name] !== 'function'))
  throw Error('Incomplete Codex++ shell v1 contract. Repatch the app.');
const focusClass = 'codexpp-focus-mode';
const dwellClass = 'codexpp-focus-mode-dwell';
const exitClass = 'codexpp-focus-mode-exiting';
const edgeDwellMs = 250;
const edgeWidth = 8;
const shellLossGraceMs = 400;
const dwellCheckMs = 32;
// Follow ChatGPT's motion token rather than freezing today's spring timing.
// The defaults reproduce the reviewed build: a 200 ms token gives a 250 ms
// controls delay and a 650 ms exit window.
function motionMs() {
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return 0;
  const token = getComputedStyle(document.documentElement).getPropertyValue('--transition-duration-moderate').trim();
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(token);
  const value = match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : 200;
  return Math.min(Math.max(value, 50), 1000);
}
const windowControlsDelay = () => { const motion = motionMs(); return motion && motion + 50; };
const exitMotionDelay = () => Math.round(motionMs() * 3.25);
// Leading and trailing calls, at most one per interval. Unlike animation
// frames, this still runs in occluded or offscreen renderers.
function throttle(callback, interval) {
  let last = -Infinity, timer = null;
  const run = () => { timer = null; last = performance.now(); callback(); };
  const call = () => {
    if (disposed) return;
    const wait = last + interval - performance.now();
    if (wait <= 0 && timer === null) run();
    else if (timer === null) timer = window.setTimeout(run, Math.max(wait, 0));
  };
  call.cancel = () => { if (timer !== null) window.clearTimeout(timer); timer = null; };
  return call;
}
let restoreSidebarOnExit = false;
let closingSidebar = false;
let active = false;
let disposed = false;
let focusFrame = null;
let sidebarJob = null;
let controlsRequest = null;
let peekTimer = null;
let windowControlsTimer = null;
let heartbeat = null;
let shellLossTimer = null;
let exitMotionTimer = null;
let generation = 0;
let pointerX = null;
let pointerY = null;
let browserPane = null;
let browserHost = null;
const browserOverrides = new Map();
const browserResize = new ResizeObserver(() => syncBrowserViewport());
// Native pane motion can rewrite inline styles many times per frame. Each sync
// reads layout, so coalesce these instead of forcing a layout per mutation.
const scheduleBrowserViewport = throttle(() => syncBrowserViewport(), 16);
const browserMutations = new MutationObserver(scheduleBrowserViewport);

const styleNode = api.addStyle(`
  [data-codexpp-shell-role="panel"] {
    min-width: 0 !important;
  }
  :where(html.${focusClass}, html.${exitClass}) [data-codexpp-shell-role="panel"] {
    transition:
      width var(--transition-duration-moderate, 200ms) var(--ease-spring-snappy, ease-out),
      opacity var(--transition-duration-basic, 150ms) ease-out,
      clip-path var(--transition-duration-moderate, 200ms) var(--ease-spring-snappy, ease-out) !important;
  }
  :where(html.${focusClass}, html.${exitClass}) [data-codexpp-shell-role="frame"] {
    transition: padding-inline-start var(--transition-duration-moderate, 200ms) var(--ease-spring-snappy, ease-out) !important;
  }
  :where(html.${focusClass}, html.${exitClass}) [data-codexpp-shell-role="main"] {
    transition:
      clip-path var(--transition-duration-moderate, 200ms) var(--ease-spring-snappy, ease-out),
      border-radius var(--transition-duration-moderate, 200ms) var(--ease-spring-snappy, ease-out),
      margin-top var(--transition-duration-moderate, 200ms) var(--ease-spring-snappy, ease-out) !important;
  }
  :where(html.${focusClass}, html.${exitClass}) [data-codexpp-shell-role="titlebar"] {
    transition: opacity var(--transition-duration-basic, 150ms) ease-out !important;
  }
  html.${focusClass} [data-codexpp-shell-role="panel"] {
    width: 0 !important;
    opacity: 0;
    clip-path: inset(0 100% 0 0 round var(--radius-xl-base, 12px));
    pointer-events: none !important;
  }
  html.${focusClass}.${dwellClass} [data-codexpp-shell-role="panel"] {
    width: var(--codexpp-focus-rail-width) !important;
    opacity: 1;
    clip-path: inset(0 round var(--radius-xl-base, 12px));
    pointer-events: auto !important;
  }
  html.${focusClass} [data-codexpp-shell-role="frame"] {
    padding-inline-start: var(--spacing, 4px) !important;
  }
  html.${focusClass}.${dwellClass} [data-codexpp-shell-role="frame"] {
    padding-inline-start: 0 !important;
  }
  html.${focusClass} [data-codexpp-shell-role="main"] {
    clip-path: inset(0) !important;
    border-radius: var(--radius-xl-base, 12px) !important;
    margin-top: var(--spacing, 4px) !important;
  }
  /* Native pane motion still subtracts the closed navigation rail from its
     inline pixel width. Only a semantically full-width pane should instead
     follow the actual flex canvas, including dwell and window resizing. Keep
     native split-pane sizing, inner frames, and inline styles untouched. */
  html.${focusClass} [data-codexpp-shell-role="main"]
    [data-app-shell-right-panel-full-width="true"] + aside[data-app-shell-focus-area="right-panel"] {
    width: 100% !important;
  }
  html.${focusClass} [data-codexpp-focus-browser-viewport] {
    width: var(--codexpp-focus-browser-width) !important;
  }
  html.${focusClass} [data-codexpp-focus-browser-viewport] > webview,
  html.${focusClass} [data-codexpp-focus-browser-viewport] > [data-browser-sidebar-cursor-overlay-host] {
    width: var(--codexpp-focus-browser-inner-width) !important;
  }
  html.${focusClass} [data-codexpp-shell-role="titlebar"] {
    opacity: 0 !important;
    pointer-events: none !important;
  }
  html.${focusClass} [data-codexpp-shell-role="titlebar"] * {
    pointer-events: none !important;
  }
  html.${exitClass} [data-codexpp-shell-role="panel"],
  html.${exitClass} [data-codexpp-shell-role="frame"],
  html.${exitClass} [data-codexpp-shell-role="main"],
  html.${exitClass} [data-codexpp-shell-role="titlebar"] {
    transition-duration: 90ms !important;
  }
  @media (prefers-reduced-motion: reduce) {
    [data-codexpp-shell-role="panel"],
    [data-codexpp-shell-role="frame"],
    [data-codexpp-shell-role="main"],
    [data-codexpp-shell-role="titlebar"],
    html.${exitClass} [data-codexpp-shell-role] {
      transition-duration: 0ms !important;
    }
  }
`);
const expectedStyle = styleNode.textContent;

function root() { return document.documentElement; }
function isFocused() { return active; }
function hasStyle() {
  return styleNode.isConnected && styleNode.textContent === expectedStyle &&
    !styleNode.disabled && !styleNode.sheet?.disabled;
}
function ownsFocusedUI() {
  return root().classList.contains(focusClass) && hasStyle();
}
function clearBrowserViewport() {
  browserResize.disconnect(); browserMutations.disconnect(); scheduleBrowserViewport.cancel();
  browserPane = browserHost = null;
  for (const [node, original] of browserOverrides) {
    for (const [name, value, priority] of original.properties) {
      if (value) node.style.setProperty(name, value, priority); else node.style.removeProperty(name);
    }
    if (original.attribute === null) node.removeAttribute('data-codexpp-focus-browser-viewport');
    else node.setAttribute('data-codexpp-focus-browser-viewport', original.attribute);
  }
  browserOverrides.clear();
}
function syncBrowserViewport(current = shell.snapshot()) {
  if (!isFocused() || !current) { clearBrowserViewport(); return; }
  const panes = [...current.main.querySelectorAll(
    '[data-app-shell-right-panel-full-width="true"] + aside[data-app-shell-focus-area="right-panel"]'
  )].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
  const hosts = [...document.querySelectorAll('[data-browser-host-root]')].filter(node => node.isConnected);
  // Portals are not descendants of the main canvas. Refuse ambiguous hosts,
  // cached/hidden tabs, staged transitions and background automation surfaces.
  const viewports = hosts.length === 1 ? [...hosts[0].querySelectorAll(
    '[data-browser-sidebar-webview][data-app-shell-focus-area="right-panel"]'
  )].filter(node => {
    const css = getComputedStyle(node);
    return css.visibility === 'visible' && css.pointerEvents === 'auto' &&
      Number(css.opacity) === 1 && !node.inert && node.getClientRects().length;
  }) : [];
  if (panes.length !== 1 || viewports.length !== 1) { clearBrowserViewport(); return; }
  const pane = panes[0], viewport = viewports[0], webview = viewport.querySelector(':scope > webview');
  if (!webview) { clearBrowserViewport(); return; }
  const transform = getComputedStyle(webview).transform;
  const matrix = transform === 'none' ? null : new DOMMatrixReadOnly(transform);
  // Only the native uniform scale is supported. Never distort a device preview.
  if (matrix && (!matrix.is2D || matrix.b !== 0 || matrix.c !== 0 || matrix.e !== 0 ||
      matrix.f !== 0 || matrix.a <= 0 || matrix.a !== matrix.d)) { clearBrowserViewport(); return; }
  const zoom = Number.parseFloat(getComputedStyle(viewport).zoom) || 1;
  const width = pane.getBoundingClientRect().width / zoom;
  if (!Number.isFinite(width) || width <= 0) { clearBrowserViewport(); return; }
  if (browserPane !== pane || browserHost !== hosts[0] || !browserOverrides.has(viewport)) {
    clearBrowserViewport(); browserPane = pane; browserHost = hosts[0];
    browserOverrides.set(viewport, {
      attribute:viewport.getAttribute('data-codexpp-focus-browser-viewport'),
      properties:['--codexpp-focus-browser-width','--codexpp-focus-browser-inner-width'].map(name =>
        [name,viewport.style.getPropertyValue(name),viewport.style.getPropertyPriority(name)])
    });
    browserResize.observe(pane);
    browserMutations.observe(browserHost, {subtree:true,childList:true,attributes:true,attributeFilter:['style']});
    viewport.setAttribute('data-codexpp-focus-browser-viewport', '');
  }
  for (const [name, value] of [
    ['--codexpp-focus-browser-width', `${width}px`],
    ['--codexpp-focus-browser-inner-width', `${width / (matrix?.a ?? 1)}px`]
  ]) if (viewport.style.getPropertyValue(name) !== value) viewport.style.setProperty(name, value);
}
function finishSidebarJob(error) {
  const job = sidebarJob;
  if (!job) return;
  sidebarJob = null;
  window.clearTimeout(job.timer);
  job.error = error;
  if (error) api.log(String(error));
  job.resolve();
  syncObservers();
}
function pumpSidebarJob(current = shell.snapshot()) {
  const job = sidebarJob;
  if (!job) return;
  if (current && current.frame !== job.frame) {
    // A restoration belongs to one shell instance, never a replacement route.
    finishSidebarJob();
    if (isFocused()) exitFocusMode({keepNativeSidebar: true, immediateWindowControls: true});
    return;
  }
  if (performance.now() >= job.deadline) {
    finishSidebarJob(Error('Sidebar transition did not settle; pending restoration cancelled.'));
    if (isFocused()) exitFocusMode({immediateWindowControls: true});
    return;
  }
  if (current) {
    if (job.expected !== null && current.sidebarOpen === job.expected) job.expected = null;
    if (job.expected === null) {
      if (current.sidebarOpen === job.desired) { finishSidebarJob(); return; }
      // Only one native toggle may be in flight. Coalesce rapid enter/exit into
      // the latest desired state instead of toggling against stale React state.
      job.expected = job.desired;
      try { shell.setSidebarOpen(job.desired); }
      catch (error) {
        finishSidebarJob(error);
        if (isFocused()) exitFocusMode({immediateWindowControls: true});
        return;
      }
    }
  }
  window.clearTimeout(job.timer);
  job.timer = window.setTimeout(() => {
    pumpSidebarJob();
    if (isFocused()) {
      const latest = currentShell();
      if (latest) reconcileShell(latest);
    }
  }, 50);
}
function requestSidebar(open, current) {
  if (!sidebarJob && current?.sidebarOpen === open) return true;
  if (!sidebarJob) {
    if (!current && !focusFrame) return false;
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    sidebarJob = {frame: current?.frame ?? focusFrame, original: restoreSidebarOnExit,
      desired: open, expected: null, deadline: performance.now() + 1000,
      timer: null, promise, resolve, error: null};
  } else sidebarJob.desired = open;
  const job = sidebarJob;
  pumpSidebarJob(current);
  return !job.error;
}
function clearPeekTimer() {
  if (peekTimer !== null) window.clearTimeout(peekTimer);
  peekTimer = null;
}
function clearControlsTimer() {
  if (windowControlsTimer !== null) window.clearTimeout(windowControlsTimer);
  windowControlsTimer = null;
}
function clearShellLossTimer() {
  if (shellLossTimer !== null) window.clearTimeout(shellLossTimer);
  shellLossTimer = null;
}
function clearExitMotion() {
  if (exitMotionTimer !== null) window.clearTimeout(exitMotionTimer);
  exitMotionTimer = null; root().classList.remove(exitClass);
}
function currentShell() {
  const current = shell.snapshot();
  if (current) clearShellLossTimer();
  else if (isFocused() && shellLossTimer === null) {
    // React can briefly unmount/swap a surface during native navigation. Never
    // guess at a replacement: revalidate the owned contract after a short grace.
    const epoch = generation;
    shellLossTimer = window.setTimeout(() => {
      shellLossTimer = null;
      if (epoch !== generation || !isFocused()) return;
      const recovered = shell.snapshot();
      if (recovered) reconcileShell(recovered);
      else {
        api.log('Focus Mode exited: the shell contract remained unavailable.');
        exitFocusMode({immediateWindowControls: true});
      }
    }, shellLossGraceMs);
  }
  return current;
}
function publishControls(hidden, epoch = generation) {
  if (controlsRequest?.hidden === hidden && controlsRequest.epoch === epoch)
    return controlsRequest.promise;
  const request = {hidden, epoch, promise: null};
  controlsRequest = request;
  let result;
  try { result = shell.windowControls(hidden); }
  catch (error) { result = Promise.reject(error); }
  request.promise = Promise.resolve(result).catch(error => {
    api.log(String(error));
    if (hidden && epoch === generation && isFocused())
      exitFocusMode({immediateWindowControls: true});
  }).finally(() => {
    if (controlsRequest === request) controlsRequest = null;
  });
  return request.promise;
}
const scheduleDwellCheck = throttle(() => closeDwellWhenFinished(), dwellCheckMs);
function setDwellMode(active) {
  clearPeekTimer();
  if (!active) scheduleDwellCheck.cancel();
  root().classList.toggle(dwellClass, active && isFocused());
}
function closeDwellWhenFinished() {
  const current = shell.snapshot();
  if (!current || current.peeking || pointerX === null || pointerY === null) return;
  const bounds = current.main.getBoundingClientRect();
  if (pointerX >= bounds.left && pointerX <= bounds.right &&
      pointerY >= bounds.top && pointerY <= bounds.bottom) setDwellMode(false);
}
function enterFocusMode() {
  const current = shell.snapshot();
  if (disposed || isFocused() || !current || !hasStyle()) return;
  generation++;
  clearExitMotion();
  pointerX = pointerY = null;
  restoreSidebarOnExit = sidebarJob?.original ?? current.sidebarOpen;
  focusFrame = current.frame;
  closingSidebar = current.sidebarOpen || sidebarJob !== null;
  if (!requestSidebar(false, current)) { closingSidebar = false; return; }
  root().style.setProperty('--codexpp-focus-rail-width', current.railWidth);
  root().classList.add(focusClass);
  root().toggleAttribute('data-codexpp-focus-mode', true);
  active = true;
  syncBrowserViewport(current);
  clearControlsTimer();
  void publishControls(true); // Immediate native hide; no delayed entry.
  heartbeat = window.setInterval(heartbeatTick, 1000);
  syncObservers();
}
function heartbeatTick() {
  if (!isFocused()) return;
  if (!ownsFocusedUI()) { exitFocusMode({immediateWindowControls: true}); return; }
  const latest = currentShell();
  if (!latest) return;
  reconcileShell(latest);
  if (!isFocused()) return;
  root().style.setProperty('--codexpp-focus-rail-width', latest.railWidth);
  void publishControls(true);
}
function exitFocusMode({keepNativeSidebar = false, immediateWindowControls = false} = {}) {
  const wasFocused = isFocused();
  // Auxiliary app windows also load extensions. Never reveal controls in a
  // window where this instance has not hidden them or queued a restoration.
  if (!wasFocused && heartbeat === null && windowControlsTimer === null) return;
  generation++;
  active = false;
  clearBrowserViewport();
  clearPeekTimer();
  clearControlsTimer();
  clearShellLossTimer();
  clearExitMotion();
  if (wasFocused && !disposed && !immediateWindowControls) {
    root().classList.add(exitClass);
    // Let the native spring finish underneath the shorter CSS tracking tween.
    // Re-entry/cleanup cancels this timer and restores normal entry durations.
    exitMotionTimer = window.setTimeout(clearExitMotion, exitMotionDelay());
  }
  if (heartbeat !== null) window.clearInterval(heartbeat);
  heartbeat = null;
  closingSidebar = false;
  root().classList.remove(focusClass, dwellClass);
  root().removeAttribute('data-codexpp-focus-mode');
  root().style.removeProperty('--codexpp-focus-rail-width');
  let restoredControls;
  if (immediateWindowControls) restoredControls = publishControls(false);
  else windowControlsTimer = window.setTimeout(() => {
    windowControlsTimer = null;
    void publishControls(false);
  }, windowControlsDelay());
  if (keepNativeSidebar) finishSidebarJob();
  else if (wasFocused) {
    const current = shell.snapshot();
    // The entry snapshot remains useful during a bounded shell swap. Its DOM
    // identity only scopes the retry; commands still require a valid snapshot.
    if (current && current.frame !== focusFrame) finishSidebarJob();
    else if (current || restoreSidebarOnExit || sidebarJob) requestSidebar(restoreSidebarOnExit, current);
  }
  restoreSidebarOnExit = false;
  focusFrame = null;
  syncObservers();
  return Promise.all([restoredControls, sidebarJob?.promise]);
}
function handlePointerMove(event) {
  if (!isFocused()) return;
  if (event.pointerType === 'touch' || event.buttons > 0) {
    clearPeekTimer();
    return;
  }
  pointerX = event.clientX;
  pointerY = event.clientY;
  // Each check snapshots the shell, which reads layout. Pointer events can
  // arrive faster than frames, so throttle them while the rail is open.
  if (root().classList.contains(dwellClass)) { scheduleDwellCheck(); return; }
  if (event.clientX >= 0 && event.clientX <= edgeWidth) {
    const epoch = generation;
    if (peekTimer === null) peekTimer = window.setTimeout(() => {
      peekTimer = null;
      if (epoch === generation && isFocused() && pointerX >= 0 && pointerX <= edgeWidth && currentShell())
        setDwellMode(true);
    }, edgeDwellMs);
  } else clearPeekTimer();
}
function reconcileShell(current) {
  pumpSidebarJob(current);
  if (!isFocused()) return;
  syncBrowserViewport(current);
  root().style.setProperty('--codexpp-focus-rail-width', current.railWidth);
  if (closingSidebar && !sidebarJob && !current.sidebarOpen) {
    closingSidebar = false;
  }
  if (!closingSidebar && current.sidebarOpen) exitFocusMode({keepNativeSidebar: true});
  else if (root().classList.contains(dwellClass)) closeDwellWhenFinished();
}
const roleSelector = '[data-codexpp-shell-role]';
const observer = new MutationObserver(records => {
  // Streaming chat text and unrelated widget updates are not shell changes.
  const changed = records.some(record => record.type === 'attributes' ||
    [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
      (node.matches(roleSelector) || node.querySelector(roleSelector))));
  if (!isFocused()) {
    // Native state changes advance cleanup even if background timers are
    // throttled. Keep this observer until bounded restoration has completed.
    if (sidebarJob && changed) pumpSidebarJob();
    return;
  }
  if (!ownsFocusedUI()) { exitFocusMode({immediateWindowControls: true}); return; }
  if (!changed) return;
  const current = currentShell();
  if (current) reconcileShell(current);
});
// The document's own class is observed separately: app-wide class churn
// (hover, streaming, Tailwind state) never reaches the subtree callback.
const rootObserver = new MutationObserver(() => {
  if (isFocused() && !ownsFocusedUI()) exitFocusMode({immediateWindowControls: true});
});
// Observe only while focused or while a bounded restoration is pending. An
// idle Focus Mode does no per-mutation work at all.
let observing = false;
function syncObservers() {
  const wanted = isFocused() || sidebarJob !== null;
  if (wanted === observing) return;
  observing = wanted;
  if (!wanted) { observer.disconnect(); rootObserver.disconnect(); return; }
  observer.observe(root(), {subtree: true, childList: true, attributes: true,
    attributeFilter: ['data-codexpp-shell-sidebar-open', 'data-codexpp-shell-peeking', 'data-codexpp-shell-role']});
  rootObserver.observe(root(), {attributes: true, attributeFilter: ['class']});
}
function toggleFocusMode() {
  if (disposed || (!isFocused() && (!hasStyle() || !shell.snapshot()))) return;
  if (isFocused()) exitFocusMode(); else enterFocusMode();
}
// A guest webview cannot bubble keyboard events into the app renderer. The
// owned native hook relays just this chord, with a renewable per-window lease.
if (typeof shell.onShortcut === 'function') api.onCleanup(shell.onShortcut(toggleFocusMode));
api.on(window, 'keydown', event => {
  if (disposed) return;
  // ISO/British layouts put \\ on IntlBackslash rather than the ANSI key.
  // Accept the logical key as well as the original physical-key binding.
  const backslash = event.code === 'Backslash' || event.key === '\\' || event.key === '|';
  if (!backslash || !event.metaKey || !event.shiftKey ||
      event.ctrlKey || event.altKey || event.repeat || event.isComposing ||
      (!isFocused() && (!hasStyle() || !shell.snapshot()))) return;
  event.preventDefault();
  event.stopPropagation();
  toggleFocusMode();
}, true);
api.on(document, 'pointermove', handlePointerMove, true);
api.on(document, 'pointerdown', clearPeekTimer, true);
api.on(document, 'pointercancel', () => setDwellMode(false), true);
// Native embedded views can take over pointer delivery: pointerout still tells
// us the last boundary crossed without depending on their DOM ancestry.
api.on(document, 'pointerout', event => {
  if (!isFocused()) return;
  pointerX = event.clientX;
  pointerY = event.clientY;
  if (event.clientX < 0 || event.clientX > edgeWidth) clearPeekTimer();
  if (root().classList.contains(dwellClass)) closeDwellWhenFinished();
}, true);
api.on(document, 'pointerleave', event => {
  if (event.target !== document && event.target !== root()) return;
  clearPeekTimer();
  setDwellMode(false);
}, true);
api.on(window, 'blur', () => setDwellMode(false));
api.on(window, 'resize', () => {
  setDwellMode(false);
  if (isFocused()) {
    const current = currentShell();
    if (current) reconcileShell(current);
  }
});
// Hidden windows have their timers throttled, so the native controls lease can
// lapse. Renew it and revalidate the shell the moment the window is visible.
api.on(document, 'visibilitychange', () => {
  if (document.hidden) setDwellMode(false);
  else heartbeatTick();
});
api.on(window, 'focus', heartbeatTick);
api.on(window, 'pagehide', () => exitFocusMode({keepNativeSidebar: true, immediateWindowControls: true}));
api.onCleanup(() => {
  disposed = true;
  clearExitMotion();
  const restored = exitFocusMode({immediateWindowControls: true});
  scheduleDwellCheck.cancel(); scheduleBrowserViewport.cancel();
  return Promise.all([restored, sidebarJob?.promise]).finally(() => {
    observing = false; observer.disconnect(); rootObserver.disconnect();
  });
});
});
