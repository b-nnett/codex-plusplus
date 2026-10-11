// Evaluated only in trusted ChatGPT app:// renderer pages by the main process.
(() => {
  if (globalThis.__codexPP?.protocol === 2) return;
  const records = new Map();
  let queue = Promise.resolve();
  // The main process compares these keys before resending extension code.
  let deliveryKey = null, settingsKey = null;
  const states = () => [...records].map(([id, record]) => ({ id, state: record.state, error: record.error }));

  async function stop(id) {
    const record = records.get(id);
    if (!record || record.needsRestart) return;
    const failures = [];
    for (const cleanup of record.cleanups.splice(0).reverse()) {
      try { await cleanup(); } catch (error) { failures.push(String(error)); }
    }
    if (failures.length) {
      record.error = `Cleanup failed; restart ChatGPT: ${failures.join('; ')}`;
      record.needsRestart = true;
      record.state = 'error';
    } else records.delete(id);
  }

  async function reconcile(desired) {
    const wanted = new Map(desired.map(extension => [extension.id, extension]));
    for (const [id, record] of records) {
      if (!wanted.has(id) || wanted.get(id).fingerprint !== record.fingerprint) await stop(id);
    }
    for (const extension of desired) {
      if (records.has(extension.id)) continue;
      const record = { fingerprint: extension.fingerprint, cleanups: [], state: 'active', error: null };
      records.set(extension.id, record);
      const api = Object.freeze({
        id: extension.id,
        get shell() { return globalThis.__codexPPShell?.protocol === 1 ? globalThis.__codexPPShell : null; },
        waitForShell() {
          return new Promise((resolve, reject) => {
            let attempts = 0;
            const check = () => {
              if (globalThis.__codexPPShell?.protocol === 1) resolve(globalThis.__codexPPShell);
              else if (++attempts >= 100) reject(new Error('Codex++ shell v1 is unavailable. Repatch the app.'));
              else setTimeout(check, 50);
            };
            check();
          });
        },
        onCleanup(cleanup) {
          if (typeof cleanup !== 'function') throw new TypeError('onCleanup expects a function');
          record.cleanups.push(cleanup);
        },
        addStyle(css) {
          const node = document.createElement('style');
          node.dataset.codexpp = extension.id;
          node.textContent = css;
          (document.head || document.documentElement).append(node);
          record.cleanups.push(() => node.remove());
          return node;
        },
        on(target, event, callback, options) {
          target.addEventListener(event, callback, options);
          record.cleanups.push(() => target.removeEventListener(event, callback, options));
        },
        log: (...args) => console.info(`[Codex++ ${extension.id}]`, ...args)
      });
      try {
        if (typeof extension.start !== 'function') throw new Error(extension.error || 'The extension could not be compiled.');
        const cleanup = await extension.start(api);
        if (typeof cleanup === 'function') record.cleanups.push(cleanup);
      } catch (error) {
        await stop(extension.id);
        const failed = records.get(extension.id) || { fingerprint: extension.fingerprint, cleanups: [] };
        failed.state = 'error';
        failed.error = String(error) + (failed.error ? `; ${failed.error}` : '');
        records.set(extension.id, failed);
      }
    }
    return states();
  }

  Object.defineProperty(globalThis, '__codexPP', {
    configurable: true,
    value: Object.freeze({
      protocol: 2,
      sync(desired, key) {
        const next = queue.then(() => reconcile(desired)).then(result => {
          if (key !== undefined) deliveryKey = key;
          return result;
        });
        queue = next.catch(() => {});
        return next;
      },
      // Cheap per-poll probe: no extension code crosses the IPC boundary.
      status() { return { key: deliveryKey, settingsKey, states: states() }; },
      settings(value, key) {
        const store = globalThis.__codexPPNativeSettings;
        if (!store) return false;
        store.update(value);
        settingsKey = key;
        return true;
      }
    })
  });
})();
