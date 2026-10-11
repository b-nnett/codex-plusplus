// Uses ChatGPT's existing preload bridge; no debugger or network listener.
(() => {
  if (globalThis.__codexPPBridge?.protocol === 2) return;
  globalThis.__codexPPBridge?.stop?.();
  const pending = new Map();
  const receive = event => {
    if (event.source && event.source !== window) return;
    const response = event.data;
    if (response?.type !== 'codexpp-settings-result') return;
    const request = pending.get(response.requestId);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(response.requestId);
    response.ok ? request.resolve(response.data) : request.reject(new Error(response.error || 'The helper could not complete this action.'));
  };
  window.addEventListener('message', receive);
  globalThis.__codexPPBridge = Object.freeze({
    protocol: 2,
    request(action, extra = {}) {
      if (pending.size >= 32) return Promise.reject(new Error('Wait for the current operation.'));
      const requestId = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Codex++ did not respond.')); }, 180000);
        pending.set(requestId, {resolve, reject, timer});
        try { globalThis.electronBridge.sendMessageFromView({...extra, type:'codexpp-settings', action, requestId}); }
        catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
      });
    },
    stop() {
      window.removeEventListener('message', receive);
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Codex++ disconnected.')); }
      pending.clear(); delete globalThis.__codexPPBridge;
    }
  });
})();
