// Installed in the reviewed main-process bootstrap; never injected into websites.
(function installNativeBrowser(electron, support, native) {
  const owners = new Map();
  const fs = require('fs');
  const path = require('path');
  function isAppFrame(frame) {
    try {
      const url = new URL(frame.url);
      return url.protocol === 'app:' && url.host === '-' &&
        (['/index.html', '/detached-window.html', '/settings'].includes(url.pathname) ||
          url.pathname.startsWith('/settings/'));
    } catch { return false; }
  }
  function record(flags) {
    // One bounded record of capability flags; no URLs, field values or credentials.
    try {
      const directory = path.join(support, 'Diagnostics');
      fs.mkdirSync(directory, {recursive:true, mode:0o700});
      fs.writeFileSync(path.join(directory, 'browser-menu.json'), JSON.stringify({
        schema:1, time:new Date().toISOString(), ...flags
      }), {mode:0o600});
    } catch { /* Diagnostics must not prevent menus from opening. */ }
  }
  const available = process.platform === 'darwin' && native?.protocol === 1 &&
    typeof native.prepare === 'function' && typeof native.cancel === 'function';
  // Older signed modules lack the check; assume their reviewed classes exist.
  const viewClasses = () => {
    try { return typeof native?.viewClassesAvailable === 'function' ? native.viewClassesAvailable() === true : true; }
    catch { return false; }
  };
  // The armed popup belongs to one window. Revoking another window's owner
  // must not cancel it.
  let preparedWindow = null;
  function cancelFor(owner) {
    let ownerWindow = null;
    try { ownerWindow = owner.isDestroyed() ? null : electron.BrowserWindow?.fromWebContents?.(owner) ?? null; } catch {}
    if (!preparedWindow || !ownerWindow || ownerWindow === preparedWindow) {
      native.cancel();
      preparedWindow = null;
    }
  }
  const browser = Object.freeze({
    setEnabled(event, enabled) {
      if (!isAppFrame(event.senderFrame) || event.senderFrame !== event.sender.mainFrame ||
          typeof enabled !== 'boolean') throw new Error('Invalid native browser request.');
      if (!available) return {supported:false, nativeVersion:0};
      const owner = event.sender;
      if (enabled && !owners.has(owner)) {
        const revoke = () => {
          owners.delete(owner);
          cancelFor(owner);
          owner.removeListener('destroyed', revoke);
          owner.removeListener('did-start-navigation', navigate);
        };
        const navigate = (_event, _url, isInPlace, isMainFrame) => {
          if (isMainFrame && !isInPlace) revoke();
        };
        owners.set(owner, revoke);
        owner.on('destroyed', revoke);
        owner.on('did-start-navigation', navigate);
      } else if (!enabled) owners.get(owner)?.();
      return {supported:true, nativeVersion:2, viewClasses:viewClasses()};
    },
    frameForContextMenu(params, contents, window) {
      if (!available || !params.isEditable) return undefined;
      // The reviewed fork omits both clicked and focused frame properties.
      const frame = params.frame ?? contents?.focusedFrame ?? contents?.mainFrame;
      if (!frame || typeof window?.getNativeWindowHandle !== 'function') return undefined;
      if (![...owners.keys()].some(owner => !owner.isDestroyed() && isAppFrame(owner.mainFrame))) return undefined;
      // Click-time settings ensure pause, disable and removal take effect even
      // when renderer cleanup is delayed.
      try {
        const settings = JSON.parse(fs.readFileSync(path.join(support, 'settings.json'), 'utf8'));
        if (settings.extensionsPaused || settings.withoutTweaks || settings.enabled?.['better-browser'] !== true) return undefined;
        const manifest = JSON.parse(fs.readFileSync(path.join(support, 'Extensions', 'better-browser', 'manifest.json'), 'utf8'));
        if (manifest.id !== 'better-browser' || manifest.scope !== 'renderer') return undefined;
        contents?.focus?.();
        const prepared = native.prepare(window.getNativeWindowHandle());
        preparedWindow = prepared === true ? window : null;
        record({editable:true, clickedFrame:!!params.frame, focusedFrame:!!contents?.focusedFrame,
          mainFrame:!!contents?.mainFrame, suppliedFrame:true, nativePrepared:prepared === true});
        return frame;
      } catch {
        native.cancel(); preparedWindow = null;
        record({editable:true, suppliedFrame:false, nativePrepared:false});
        return undefined;
      }
    }
  });
  Object.defineProperty(globalThis, '__codexPPNativeBrowser', {value:browser, configurable:true});
  return browser;
})
