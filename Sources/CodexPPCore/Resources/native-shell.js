// Public Electron API; leases prevent a crashed/stopped renderer hiding controls forever.
(function installNativeShell(electron, support) {
  const fs = require('fs'), path = require('path');
  const owners = new Map();
  const shortcuts = new Map(), attached = new WeakSet(), guestOwners = new WeakMap();
  const responseChannel = 'codex_desktop:message-for-view';
  function appOwner(owner) {
    try {
      const url = new URL(owner.mainFrame.url);
      return !owner.isDestroyed() && url.protocol === 'app:' && url.host === '-' && url.pathname === '/index.html';
    } catch { return false; }
  }
  function allowed() {
    try {
      const settings = JSON.parse(fs.readFileSync(path.join(support, 'settings.json'), 'utf8'));
      const manifest = JSON.parse(fs.readFileSync(path.join(support, 'Extensions', 'focus-mode', 'manifest.json'), 'utf8'));
      return !settings.extensionsPaused && !settings.withoutTweaks && settings.enabled?.['focus-mode'] === true &&
        manifest.id === 'focus-mode' && manifest.scope === 'renderer';
    } catch { return false; }
  }
  function attach(contents) {
    if (attached.has(contents)) return;
    attached.add(contents);
    contents.on('did-attach-webview', (_event, guest) => { guestOwners.set(guest, contents); attach(guest); });
    contents.on('before-input-event', (event, input) => {
      const backslash = input.code === 'Backslash' || input.key === '\\' || input.key === '|';
      if (input.type !== 'keyDown' || !backslash || !input.meta || !input.shift ||
          input.control || input.alt || input.isComposing) return;
      // Resolve the exact containing app window, never the globally focused one.
      // Explicit attachment also handles guests whose host property is absent.
      let owner = guestOwners.get(contents) ?? contents.hostWebContents ?? contents;
      const win = electron.BrowserWindow.fromWebContents(owner);
      if (!win || win.isDestroyed()) return;
      owner = win.webContents;
      if (!appOwner(owner)) return;
      const lease = shortcuts.get(owner);
      if (!lease || Date.now() >= lease.expires || !allowed()) return;
      event.preventDefault(); // Suppress the DOM copy; one physical press toggles once.
      if (!input.isAutoRepeat) owner.send(responseChannel, {
        type:'codexpp-shell-toggle-focus', protocol:1, requestId:lease.requestId
      });
    });
  }
  electron.app?.on('web-contents-created', (_event, contents) => attach(contents));
  for (const contents of electron.webContents?.getAllWebContents?.() ?? []) attach(contents);
  return Object.freeze({
    shortcut(event, request) {
      const owner = event.sender;
      if (event.senderFrame !== owner.mainFrame || !appOwner(owner) || request.protocol !== 1 ||
          typeof request.enabled !== 'boolean' || typeof request.requestId !== 'string' ||
          request.requestId.length < 1 || request.requestId.length > 128) throw Error('Invalid shell shortcut request.');
      if (!request.enabled) {
        const lease = shortcuts.get(owner);
        if (lease?.requestId === request.requestId) lease.revoke();
        return;
      }
      if (!allowed()) return;
      let lease = shortcuts.get(owner);
      if (lease && lease.requestId !== request.requestId) { lease.revoke(); lease = null; }
      if (!lease) {
        const revoke = () => {
          clearInterval(lease.timer); shortcuts.delete(owner);
          for (const name of ['destroyed','render-process-gone']) owner.removeListener(name, revoke);
          owner.removeListener('did-start-navigation', navigate);
        };
        const navigate = (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) revoke(); };
        lease = {requestId:request.requestId, expires:0, revoke, timer:null};
        lease.timer = setInterval(() => { if (Date.now() >= lease.expires || !allowed()) revoke(); }, 500);
        lease.timer.unref?.(); shortcuts.set(owner, lease);
        for (const name of ['destroyed','render-process-gone']) owner.on(name, revoke);
        owner.on('did-start-navigation', navigate);
      }
      attach(owner);
      lease.expires = Date.now() + 4000;
    },
    controls(event, request) {
      const owner = event.sender;
      let valid = false;
      try {
        const url = new URL(event.senderFrame.url);
        valid = event.senderFrame === owner.mainFrame && url.protocol === 'app:' && url.host === '-' &&
          ['/index.html', '/detached-window.html'].includes(url.pathname);
      } catch {}
      if (!valid || request.protocol !== 1 || typeof request.hidden !== 'boolean') throw Error('Invalid native shell request.');
      const win = electron.BrowserWindow.fromWebContents(owner);
      if (process.platform !== 'darwin' || !win || win.isDestroyed() || typeof win.setWindowButtonVisibility !== 'function')
        return {supported: false, hidden: false};
      if (!request.hidden) {
        owners.get(owner)?.revoke();
        win.setWindowButtonVisibility(true);
        return {supported: true, hidden: false};
      }
      if (!allowed()) return {supported: false, hidden: false};
      let lease = owners.get(owner);
      if (!lease) {
        const revoke = () => {
          clearInterval(lease.timer);
          owners.delete(owner);
          for (const event of ['destroyed', 'render-process-gone']) owner.removeListener(event, revoke);
          owner.removeListener('did-start-navigation', navigate);
          win.removeListener('unresponsive', revoke);
          if (!win.isDestroyed()) win.setWindowButtonVisibility(true);
        };
        const navigate = (_event, _url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) revoke(); };
        lease = {expires: 0, revoke, timer: null};
        lease.timer = setInterval(() => { if (Date.now() >= lease.expires || !allowed()) revoke(); }, 500);
        lease.timer.unref?.();
        owners.set(owner, lease);
        for (const event of ['destroyed', 'render-process-gone']) owner.on(event, revoke);
        owner.on('did-start-navigation', navigate);
        win.on('unresponsive', revoke);
      }
      lease.expires = Date.now() + 4000;
      win.setWindowButtonVisibility(false);
      return {supported: true, hidden: true};
    }
  });
})
