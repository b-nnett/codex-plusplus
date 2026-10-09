// Installed through Runtime.addBinding on a verified local app renderer.
((token) => {
  if (globalThis.__codexPPBridge?.session === token) return;
  globalThis.__codexPPBridge?.stop();
  const pending = new Map();
  let nextID = 0;
  globalThis.__codexPPBridge = Object.freeze({
    session: token,
    request(action, extra = {}) {
      if (pending.size >= 32) return Promise.reject(new Error('Wait for the current operation.'));
      return new Promise((resolve, reject) => {
        const requestId = String(++nextID);
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('The helper did not respond.')); }, 180000);
        pending.set(requestId, { resolve, reject, timer });
        try { globalThis.__codexPPInvoke(JSON.stringify({ ...extra, action, requestId, token })); }
        catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
      });
    },
    resolve(requestId, response) {
      const request = pending.get(requestId);
      if (!request) return;
      clearTimeout(request.timer); pending.delete(requestId);
      if (response.ok) request.resolve(response.data);
      else request.reject(new Error(response.error || 'The helper could not complete this action.'));
    },
    stop() {
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('The helper disconnected.')); }
      pending.clear(); delete globalThis.__codexPPBridge;
    }
  });
})(__CODEXPP_SESSION_TOKEN__);
