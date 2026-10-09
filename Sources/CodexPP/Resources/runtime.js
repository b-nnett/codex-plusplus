// Evaluated only in Codex app:// renderer pages by the external helper.
(() => {
  if (globalThis.__codexPP?.protocol === 1) return;
  const records = new Map();
  let queue = Promise.resolve();

  async function stop(id) {
    const record = records.get(id);
    if (!record) return;
    if (record.needsRestart) return;
    const failures = [];
    for (const cleanup of record.cleanups.splice(0).reverse()) {
      try { await cleanup(); } catch (error) { failures.push(String(error)); }
    }
    if (failures.length) {
      record.error = `Cleanup failed; restart Codex: ${failures.join('; ')}`;
      record.needsRestart = true;
      record.state = 'error';
    } else records.delete(id);
  }

  async function reconcile(desired, compiled) {
    const wanted = new Map(desired.map(extension => [extension.id, extension]));
    for (const [id, record] of records) {
      if (!wanted.has(id) || wanted.get(id).code !== record.code) await stop(id);
    }
    for (const extension of desired) {
      if (records.has(extension.id)) continue;
      const record = { code: extension.code, cleanups: [], state: 'active', error: null };
      records.set(extension.id, record);
      const api = Object.freeze({
        id: extension.id,
        get shell() { return globalThis.__codexPPShell?.protocol === 1 ? globalThis.__codexPPShell : null; },
        waitForShell() {
          // CDP can attach before the app's initial module has evaluated.
          // Poll only our owned API, never infer capabilities from private DOM.
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
        const prepared = compiled.get(extension.id);
        if (prepared.error) throw prepared.error;
        const start = prepared.start;
        const cleanup = await start(api);
        if (typeof cleanup === 'function') record.cleanups.push(cleanup);
      } catch (error) {
        await stop(extension.id);
        // Keep a failed record so a broken extension isn't retried on every poll.
        const failed = records.get(extension.id) || { code: extension.code, cleanups: [] };
        failed.state = 'error';
        failed.error = String(error) + (failed.error ? `; ${failed.error}` : '');
        records.set(extension.id, failed);
      }
    }
    return [...records].map(([id, record]) => ({ id, state: record.state, error: record.error }));
  }

  Object.defineProperty(globalThis, '__codexPP', {
    configurable: true,
    value: Object.freeze({
      protocol: 1,
      sync(desired) {
        // Compile while still inside the authenticated CDP evaluate call. A
        // native acknowledgement/cleanup await loses its CSP eval permission.
        // Parsing does not execute extension code; lifecycle order stays queued.
        const compiled = new Map();
        for (const extension of desired) {
          try {
            compiled.set(extension.id, {start: new Function('api', `"use strict";\n${extension.code}\n//# sourceURL=codexpp-extension/${encodeURIComponent(extension.id)}.js`)});
          } catch (error) { compiled.set(extension.id, {error}); }
        }
        const next = queue.then(() => reconcile(desired, compiled));
        queue = next.catch(() => {});
        return next;
      }
    })
  });
})();
