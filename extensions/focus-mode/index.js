// Requires the checked Codex++ shell contract; never guess at app internals.
// Only the reviewed primary renderer loads that contract. Detached/browser and
// standalone Settings renderers are valid app pages, but do not host this shell.
// Skip them before waiting, so their intentional absence cannot become a global
// extension error. Keep the readiness/error checks for supported renderers.
if (globalThis.location?.pathname !== '/index.html') return;
if (typeof api.waitForShell !== 'function') throw Error('Update the Codex++ helper and reload the app to use Focus Mode.');
return api.waitForShell().then(shell => {
if (shell?.protocol !== 1) throw Error('Focus Mode needs the Codex++ shell v1 adapter. Repatch the app.');
const focusClass = 'codexpp-focus-mode';
const dwellClass = 'codexpp-focus-mode-dwell';
const edgeDwellMs = 250;
const edgeWidth = 8;
const windowControlsDelayMs = 250;
let restoreSidebarOnExit = false;
let closingSidebar = false;
let closeSidebarTimer = null;
let peekTimer = null;
let windowControlsTimer = null;
let heartbeat = null;
let generation = 0;
let pointerX = null;
let pointerY = null;

api.addStyle(`
  [data-codexpp-shell-role="panel"] {
    min-width: 0 !important;
    transition:
      width var(--transition-duration-moderate, 200ms) var(--ease-spring-snappy, ease-out),
      opacity var(--transition-duration-basic, 150ms) ease-out,
      clip-path var(--transition-duration-moderate, 200ms) var(--ease-spring-snappy, ease-out) !important;
  }
  [data-codexpp-shell-role="frame"] {
    transition: padding-inline-start var(--transition-duration-moderate, 200ms) var(--ease-spring-snappy, ease-out) !important;
  }
  [data-codexpp-shell-role="main"] {
    transition:
      clip-path var(--transition-duration-moderate, 200ms) var(--ease-spring-snappy, ease-out),
      border-radius var(--transition-duration-moderate, 200ms) var(--ease-spring-snappy, ease-out),
      margin-top var(--transition-duration-moderate, 200ms) var(--ease-spring-snappy, ease-out) !important;
  }
  [data-codexpp-shell-role="titlebar"] {
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
  html.${focusClass} [data-codexpp-shell-role="titlebar"] {
    opacity: 0 !important;
    pointer-events: none !important;
  }
  html.${focusClass} [data-codexpp-shell-role="titlebar"] * {
    pointer-events: none !important;
  }
  @media (prefers-reduced-motion: reduce) {
    [data-codexpp-shell-role="panel"],
    [data-codexpp-shell-role="frame"],
    [data-codexpp-shell-role="main"],
    [data-codexpp-shell-role="titlebar"] {
      transition-duration: 0ms !important;
    }
  }
`);

function root() { return document.documentElement; }
function isFocused() { return root().classList.contains(focusClass); }
function clearPeekTimer() {
  if (peekTimer !== null) window.clearTimeout(peekTimer);
  peekTimer = null;
}
function clearControlsTimer() {
  if (windowControlsTimer !== null) window.clearTimeout(windowControlsTimer);
  windowControlsTimer = null;
}
function publishControls(hidden, epoch = generation) {
  return shell.windowControls(hidden).catch(error => {
    api.log(String(error));
    if (hidden && epoch === generation && isFocused())
      exitFocusMode({immediateWindowControls: true});
  });
}
function setDwellMode(active) {
  clearPeekTimer();
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
  if (isFocused() || !current) return;
  generation++;
  restoreSidebarOnExit = current.sidebarOpen;
  closingSidebar = current.sidebarOpen;
  try { shell.setSidebarOpen(false); }
  catch (error) { closingSidebar = false; api.log(String(error)); return; }
  if (closingSidebar) closeSidebarTimer = window.setTimeout(() => {
    closeSidebarTimer = null;
    if (closingSidebar) exitFocusMode({immediateWindowControls: true});
  }, 1000);
  root().style.setProperty('--codexpp-focus-rail-width', current.railWidth);
  root().classList.add(focusClass);
  root().toggleAttribute('data-codexpp-focus-mode', true);
  clearControlsTimer();
  void publishControls(true); // Immediate native hide; no delayed entry.
  heartbeat = window.setInterval(() => {
    const latest = shell.snapshot();
    if (!latest) { exitFocusMode({immediateWindowControls: true}); return; }
    root().style.setProperty('--codexpp-focus-rail-width', latest.railWidth);
    void publishControls(true);
  }, 1000);
}
function exitFocusMode({keepNativeSidebar = false, immediateWindowControls = false} = {}) {
  const wasFocused = isFocused();
  // Auxiliary app windows also load extensions. Never reveal controls in a
  // window where this instance has not hidden them or queued a restoration.
  if (!wasFocused && heartbeat === null && windowControlsTimer === null) return;
  generation++;
  clearPeekTimer();
  clearControlsTimer();
  if (heartbeat !== null) window.clearInterval(heartbeat);
  heartbeat = null;
  if (closeSidebarTimer !== null) window.clearTimeout(closeSidebarTimer);
  closeSidebarTimer = null;
  closingSidebar = false;
  root().classList.remove(focusClass, dwellClass);
  root().removeAttribute('data-codexpp-focus-mode');
  root().style.removeProperty('--codexpp-focus-rail-width');
  if (immediateWindowControls) void publishControls(false);
  else windowControlsTimer = window.setTimeout(() => {
    windowControlsTimer = null;
    void publishControls(false);
  }, windowControlsDelayMs);
  if (wasFocused && !keepNativeSidebar && shell.snapshot()) {
    try { shell.setSidebarOpen(restoreSidebarOnExit); } catch (error) { api.log(String(error)); }
  }
  restoreSidebarOnExit = false;
}
function handlePointerMove(event) {
  if (!isFocused()) return;
  pointerX = event.clientX;
  pointerY = event.clientY;
  if (root().classList.contains(dwellClass)) { closeDwellWhenFinished(); return; }
  if (event.clientX >= 0 && event.clientX <= edgeWidth) {
    if (peekTimer === null) peekTimer = window.setTimeout(() => {
      peekTimer = null;
      if (shell.snapshot()) setDwellMode(true);
    }, edgeDwellMs);
  } else clearPeekTimer();
}
const observer = new MutationObserver(() => {
  if (!isFocused()) return;
  const current = shell.snapshot();
  if (!current) { exitFocusMode({immediateWindowControls: true}); return; }
  if (closingSidebar && !current.sidebarOpen) {
    closingSidebar = false;
    window.clearTimeout(closeSidebarTimer);
    closeSidebarTimer = null;
  }
  if (!closingSidebar && current.sidebarOpen) exitFocusMode({keepNativeSidebar: true});
  else if (root().classList.contains(dwellClass)) closeDwellWhenFinished();
});
observer.observe(root(), {subtree: true, childList: true, attributes: true,
  attributeFilter: ['data-codexpp-shell-sidebar-open', 'data-codexpp-shell-peeking', 'data-codexpp-shell-role']});
api.on(window, 'keydown', event => {
  // ISO/British layouts put \\ on IntlBackslash rather than the ANSI key.
  // Accept the logical key as well as the original physical-key binding.
  const backslash = event.code === 'Backslash' || event.key === '\\' || event.key === '|';
  if (!backslash || !event.metaKey || !event.shiftKey ||
      event.ctrlKey || event.altKey || event.repeat || (!isFocused() && !shell.snapshot())) return;
  event.preventDefault();
  event.stopPropagation();
  if (isFocused()) exitFocusMode(); else enterFocusMode();
}, true);
api.on(document, 'pointermove', handlePointerMove, true);
// Native embedded views can take over pointer delivery: pointerout still tells
// us the last boundary crossed without depending on their DOM ancestry.
api.on(document, 'pointerout', event => {
  if (!isFocused() || !root().classList.contains(dwellClass)) return;
  pointerX = event.clientX;
  pointerY = event.clientY;
  closeDwellWhenFinished();
}, true);
api.on(document, 'pointerleave', event => {
  if (event.target !== document && event.target !== root()) return;
  clearPeekTimer();
  setDwellMode(false);
}, true);
api.on(window, 'blur', () => setDwellMode(false));
api.on(window, 'pagehide', () => exitFocusMode({keepNativeSidebar: true, immediateWindowControls: true}));
api.onCleanup(() => {
  observer.disconnect();
  exitFocusMode({immediateWindowControls: true});
});
});
