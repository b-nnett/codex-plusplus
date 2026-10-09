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
const shellLossGraceMs = 400;
let restoreSidebarOnExit = false;
let closingSidebar = false;
let closeSidebarTimer = null;
let peekTimer = null;
let windowControlsTimer = null;
let heartbeat = null;
let shellLossTimer = null;
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
function clearShellLossTimer() {
  if (shellLossTimer !== null) window.clearTimeout(shellLossTimer);
  shellLossTimer = null;
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
  pointerX = pointerY = null;
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
    const latest = currentShell();
    if (!latest) return;
    reconcileShell(latest);
    if (!isFocused()) return;
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
  clearShellLossTimer();
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
  if (event.pointerType === 'touch' || event.buttons > 0) {
    clearPeekTimer();
    return;
  }
  pointerX = event.clientX;
  pointerY = event.clientY;
  if (root().classList.contains(dwellClass)) { closeDwellWhenFinished(); return; }
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
  if (closingSidebar && !current.sidebarOpen) {
    closingSidebar = false;
    window.clearTimeout(closeSidebarTimer);
    closeSidebarTimer = null;
  }
  if (!closingSidebar && current.sidebarOpen) exitFocusMode({keepNativeSidebar: true});
  else if (root().classList.contains(dwellClass)) closeDwellWhenFinished();
}
const roleSelector = '[data-codexpp-shell-role]';
const observer = new MutationObserver(records => {
  if (!isFocused()) return;
  // Streaming chat text and unrelated widget updates are not shell changes.
  const changed = records.some(record => record.type === 'attributes' ||
    [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
      (node.matches(roleSelector) || node.querySelector(roleSelector))));
  if (!changed) return;
  const current = currentShell();
  if (current) reconcileShell(current);
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
api.on(document, 'visibilitychange', () => {
  if (document.hidden) setDwellMode(false);
});
api.on(window, 'pagehide', () => exitFocusMode({keepNativeSidebar: true, immediateWindowControls: true}));
api.onCleanup(() => {
  observer.disconnect();
  exitFocusMode({immediateWindowControls: true});
});
});
