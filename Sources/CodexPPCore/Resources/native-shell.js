// Public Electron API; leases prevent a crashed/stopped renderer hiding controls forever.
(function installNativeShell(electron, support) {
  const fs = require('fs'), path = require('path');
  const owners = new Map();
  function allowed() {
    try {
      const settings = JSON.parse(fs.readFileSync(path.join(support, 'settings.json'), 'utf8'));
      const manifest = JSON.parse(fs.readFileSync(path.join(support, 'Extensions', 'focus-mode', 'manifest.json'), 'utf8'));
      return !settings.extensionsPaused && !settings.withoutTweaks && settings.enabled?.['focus-mode'] === true &&
        manifest.id === 'focus-mode' && manifest.scope === 'renderer';
    } catch { return false; }
  }
  return Object.freeze({
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
