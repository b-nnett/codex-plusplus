return (async () => {
  if (globalThis.location && !['/index.html', '/detached-window.html'].includes(globalThis.location.pathname)) return;
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
  // A framework update can rename the private view classes AutoFill needs.
  // Menus then keep their original items, so say so instead of failing silently.
  if (result.viewClasses === false) {
    const message = 'AutoFill is unavailable in this ChatGPT build: its browser view classes changed. Bookmarks still work.';
    if (typeof api.warn === 'function') api.warn(message); else api.log(message);
  }
  // Some windows expose the preload bridge before the browser modules finish loading.
  for (let attempt = 0; !globalThis.__codexPPBookmarks && attempt < 200; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const bookmarks = globalThis.__codexPPBookmarks;
  if (bookmarks?.protocol !== 1) throw new Error('Update Codex++ and restart ChatGPT to install bookmarks.');
  api.onCleanup(() => bookmarks.disable());
  await bookmarks.enable();
})();
