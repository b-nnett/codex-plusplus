// Owned renderer contract. Build-dependent discovery belongs in shell-adapter.
(() => {
  let toggleSidebar = null;
  function snapshot() {
    const nodes = {};
    for (const role of ['frame', 'panel', 'main', 'titlebar']) {
      // Cached routes remain mounted under display:none. Opacity is deliberately
      // ignored because Focus Mode itself fades the panel/titlebar to zero.
      const found = [...document.querySelectorAll(`[data-codexpp-shell-role="${role}"]`)]
        .filter(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden');
      if (found.length !== 1 || !found[0].isConnected) return null;
      nodes[role] = found[0];
    }
    const state = nodes.frame.getAttribute('data-codexpp-shell-sidebar-open');
    // Use the app's layout token, not a fixed rail width or the expanded panel.
    const rail = getComputedStyle(nodes.frame).getPropertyValue('--app-shell-navigation-rail-width').trim();
    if (!/^(?:\d+(?:\.\d+)?)px$/.test(rail) || Number.parseFloat(rail) < 16 || Number.parseFloat(rail) > 256 ||
        !['true', 'false'].includes(state) || typeof toggleSidebar !== 'function') return null;
    return Object.freeze({...nodes, sidebarOpen: state === 'true',
      peeking: nodes.panel.getAttribute('data-codexpp-shell-peeking') === 'true', railWidth: rail});
  }
  function windowControls(hidden) {
    if (typeof hidden !== 'boolean') return Promise.reject(Error('Invalid window controls state.'));
    const bridge = globalThis.electronBridge;
    if (typeof bridge?.sendMessageFromView !== 'function') return Promise.reject(Error('Native shell bridge unavailable.'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const finish = (error, result) => {
        clearTimeout(timer);
        window.removeEventListener('message', receive);
        if (error) reject(error); else resolve(result);
      };
      const receive = event => {
        // The Electron preload relays IPC with dispatchEvent(new MessageEvent),
        // whose source is null and origin is empty, not window.postMessage.
        // Keep accepting same-window replies, but never replies from another
        // frame/worker or origin. The per-request UUID binds the acknowledgement.
        const local = event.source === window || (event.source === null && event.origin === '');
        if (!local || event.data?.type !== 'codexpp-shell-controls-result' || event.data.requestId !== requestId) return;
        if (event.data.supported !== true || event.data.hidden !== hidden) finish(Error('Native window controls unavailable.'));
        else finish(null, event.data);
      };
      const timer = setTimeout(() => finish(Error('Native window controls timed out.')), 1000);
      window.addEventListener('message', receive);
      Promise.resolve(bridge.sendMessageFromView({type: 'codexpp-shell-controls', protocol: 1, hidden, requestId}))
        .catch(error => finish(error));
    });
  }
  Object.defineProperty(globalThis, '__codexPPShell', {value: Object.freeze({
    protocol: 1,
    snapshot,
    registerSidebarToggle(command) {
      if (toggleSidebar || typeof command !== 'function') throw Error('Invalid shell sidebar command registration.');
      toggleSidebar = command;
      return command;
    },
    setSidebarOpen(open) {
      const current = snapshot();
      if (!current || typeof open !== 'boolean') throw Error('Shell sidebar unavailable.');
      if (current.sidebarOpen !== open) toggleSidebar();
    },
    windowControls
  })});
})();
