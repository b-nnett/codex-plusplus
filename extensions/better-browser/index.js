return (async () => {
  const bridge = globalThis.electronBridge;
  if (typeof bridge?.sendMessageFromView !== 'function') {
    throw new Error('better-browser requires the native Codex++ browser bridge.');
  }
  const requestId = crypto.randomUUID();
  const result = await new Promise((resolve, reject) => {
    const finish = (error, value) => {
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      error ? reject(error) : resolve(value);
    };
    const receive = event => {
      if (event.data?.type === 'codexpp-browser-autofill-result' && event.data.requestId === requestId) {
        finish(null, event.data);
      }
    };
    const timer = setTimeout(() => finish(new Error('Update Codex++ and restart ChatGPT to install native browser AutoFill support.')), 5000);
    window.addEventListener('message', receive);
    api.onCleanup(() => bridge.sendMessageFromView({ type: 'codexpp-browser-autofill', enabled: false }));
    Promise.resolve(bridge.sendMessageFromView({ type: 'codexpp-browser-autofill', enabled: true, requestId }))
      .catch(error => finish(error));
  });
  if (result.supported !== true || result.nativeVersion !== 2) {
    throw new Error('Update Codex++ and restart ChatGPT to install the native macOS AutoFill adapter.');
  }
})();
