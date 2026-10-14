// Evaluated only in trusted ChatGPT app:// renderer pages by the main process.
(() => {
  if (globalThis.__codexPP?.protocol === 2) return;
  const records = new Map();
  let queue = Promise.resolve();
  // The main process compares these keys before resending extension code.
  let deliveryKey = null, settingsKey = null;
  // A warning keeps the extension running but surfaces in Settings and the helper.
  // Reported in delivery order; a failed start re-inserts its record.
  let order = [];
  const rank = id => { const index = order.indexOf(id); return index < 0 ? order.length : index; };
  const states = () => [...records].sort(([a], [b]) => rank(a) - rank(b))
    .map(([id, record]) => ({ id, state: record.state, error: record.error || record.warning || null }));

  // Opt-in timing for traced launches: per-extension callback cost and the
  // page's long tasks (buffered from page start), on the epoch-ms clock.
  let tracer = null;
  function enableTrace() {
    if (tracer || typeof performance === 'undefined') return;
    const origin = performance.timeOrigin, stats = new Map(), slow = [], longTasks = [];
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (longTasks.length < 5000) longTasks.push({ start: origin + entry.startTime, dur: entry.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
    // Animation-frame callbacks per requesting call site and per second: a
    // loop that keeps scheduling frames keeps the GPU busy while idle.
    const frames = new Map(), framesPerSecond = new Map();
    try {
      const request = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = function codexPPTracedFrame(callback) {
        const site = (new Error().stack ?? '').split('\n').slice(2, 4).map(line => line.trim().replace(/^at /, '').slice(0, 140)).join(' < ');
        return request(time => {
          const second = Math.floor(performance.now() / 1000);
          if (frames.size < 200 || frames.has(site)) frames.set(site, (frames.get(site) ?? 0) + 1);
          framesPerSecond.set(second, (framesPerSecond.get(second) ?? 0) + 1);
          return callback(time);
        });
      };
    } catch {}
    tracer = {
      record(name, start, end) {
        const dur = end - start, stat = stats.get(name) || { name, count: 0, totalMs: 0, maxMs: 0, firstStart: origin + start };
        stat.count++; stat.totalMs += dur; stat.maxMs = Math.max(stat.maxMs, dur);
        stats.set(name, stat);
        if (dur >= 4 && slow.length < 2000) slow.push({ name, start: origin + start, dur });
      },
      report() {
        const marks = performance.getEntriesByType('mark').slice(0, 200).map(mark => ({ name: mark.name, start: origin + mark.startTime }));
        // Loading-gate first/last renders recorded by the startup adapter.
        const gates = globalThis.__codexPPGates ? Object.fromEntries(Object.entries(globalThis.__codexPPGates).slice(0, 100)) : null;
        const startup = globalThis.__codexPPStartup ? JSON.parse(JSON.stringify(globalThis.__codexPPStartup)) : null;
        // Resource waterfall (chunk/script loads over app://): path and timings only.
        const resources = performance.getEntriesByType('resource').slice(0, 600).map(entry => {
          let name = entry.name;
          try { const url = new URL(entry.name); name = url.protocol === 'app:' ? url.pathname : `${url.protocol}//${url.host}`; } catch {}
          return { name, type: entry.initiatorType, start: entry.startTime, end: entry.responseEnd, size: entry.encodedBodySize || 0 };
        });
        // Query waterfall from the startup adapter's QueryCache stamps (keys are app identifiers).
        const queries = [];
        for (const cache of globalThis.__codexPPQueryCaches ?? []) {
          for (const query of cache.getAll?.() ?? []) {
            if (queries.length >= 400) break;
            let bytes = null; try { bytes = JSON.stringify(query.state?.data ?? null)?.length ?? 0; } catch {}
            queries.push({ key: JSON.stringify(query.queryKey).slice(0, 120), created: query.__codexPPCreated ?? null, bytes,
              updated: query.state?.dataUpdatedAt ? query.state.dataUpdatedAt - origin : null, status: query.state?.status, fetchStatus: query.state?.fetchStatus });
          }
        }
        // Animations still running when the trace is collected (idle GPU cost): name and element only.
        const describe = el => el ? `${el.tagName?.toLowerCase() ?? ''}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 4).join('.') : ''}`.slice(0, 160) : null;
        const animations = (document.getAnimations?.() ?? []).filter(animation => animation.playState === 'running').slice(0, 50).map(animation => ({
          name: animation.animationName ?? animation.transitionProperty ?? animation.constructor?.name ?? null,
          infinite: animation.effect?.getTiming?.().iterations === Infinity,
          target: describe(animation.effect?.target),
          visible: (() => { const r = animation.effect?.target?.getBoundingClientRect?.(); return r ? r.width > 0 && r.height > 0 : null; })(),
        }));
        let media = null;
        try { media = {
          playingVideos: [...document.querySelectorAll('video')].filter(video => !video.paused).map(video => describe(video)),
          canvases: document.querySelectorAll('canvas').length,
          animatedImages: [...document.images].filter(image => /\.(gif|webp|apng)(\?|$)/i.test(image.currentSrc)).map(image => describe(image)).slice(0, 20),
          visibility: document.visibilityState,
          jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
          domNodes: document.getElementsByTagName('*').length,
          turnNodes: document.querySelectorAll('[data-content-search-turn-key]').length,
          iframes: [...document.querySelectorAll('iframe,webview')].slice(0, 20).map(frame => {
            let origin = null; try { origin = new URL(frame.src).origin; } catch {}
            const parents = []; for (let node = frame.parentElement; node && parents.length < 4; node = node.parentElement) parents.push(describe(node));
            return { tag: frame.tagName.toLowerCase(), origin, title: frame.title?.slice(0, 80) || null, name: frame.name?.slice(0, 60) || null,
              className: typeof frame.className === 'string' ? frame.className.slice(0, 120) : null, sandbox: frame.getAttribute('sandbox'),
              hidden: frame.hidden || frame.getAttribute('aria-hidden') === 'true' || frame.getBoundingClientRect().width === 0, parents };
          }),
        }; } catch {}
        const now = Math.floor(performance.now() / 1000);
        const recentFrames = [...framesPerSecond].filter(([second]) => second >= now - 10).sort(([a], [b]) => a - b);
        // Whole frame-rate timeline (seconds since page start), for long sessions such as a streamed turn.
        const frameTimeline = [...framesPerSecond].sort(([a], [b]) => a - b).slice(-600);
        return { origin, stats: [...stats.values()], slow, longTasks, marks, gates, startup, resources, queries, animations, media,
          frames: [...frames].sort((a, b) => b[1] - a[1]).slice(0, 15), recentFrames, frameTimeline };
      }
    };
  }
  function timed(name, callback) {
    if (!tracer || typeof callback !== 'function') return callback;
    return function (...args) {
      const start = performance.now();
      try { return callback.apply(this, args); } finally { tracer.record(name, start, performance.now()); }
    };
  }
  // Extensions read these instead of the globals; untraced launches get the globals.
  function scope(id) {
    const { MutationObserver: Observer, requestAnimationFrame: frame, setTimeout: timeout, setInterval: interval } = globalThis;
    if (!tracer) return { MutationObserver: Observer, requestAnimationFrame: frame, setTimeout: timeout, setInterval: interval };
    return {
      MutationObserver: Observer && class extends Observer { constructor(callback) { super(timed(`${id}:mutation`, callback)); } },
      requestAnimationFrame: frame && (callback => frame(timed(`${id}:frame`, callback))),
      setTimeout: timeout && ((callback, ...rest) => timeout(timed(`${id}:timeout`, callback), ...rest)),
      setInterval: interval && ((callback, ...rest) => interval(timed(`${id}:interval`, callback), ...rest))
    };
  }

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
    order = desired.map(extension => extension.id);
    for (const [id, record] of records) {
      if (!wanted.has(id) || wanted.get(id).fingerprint !== record.fingerprint) await stop(id);
    }
    // Each start runs its synchronous part in order; awaiting them together
    // keeps one slow initializer from delaying every extension after it.
    const starting = [];
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
          const listener = timed(`${extension.id}:event:${event}`, callback);
          target.addEventListener(event, listener, options);
          record.cleanups.push(() => target.removeEventListener(event, listener, options));
        },
        warn(message) { record.warning = String(message); },
        log: (...args) => console.info(`[Codex++ ${extension.id}]`, ...args)
      });
      starting.push((async () => {
        try {
          if (typeof extension.start !== 'function') throw new Error(extension.error || 'The extension could not be compiled.');
          const started = tracer && performance.now();
          const pending = extension.start(api, scope(extension.id));
          if (tracer) tracer.record(`${extension.id}:start.sync`, started, performance.now());
          const cleanup = await pending;
          if (tracer) tracer.record(`${extension.id}:start`, started, performance.now());
          if (typeof cleanup === 'function') record.cleanups.push(cleanup);
        } catch (error) {
          await stop(extension.id);
          const failed = records.get(extension.id) || { fingerprint: extension.fingerprint, cleanups: [] };
          failed.state = 'error';
          failed.error = String(error) + (failed.error ? `; ${failed.error}` : '');
          records.set(extension.id, failed);
        }
      })());
    }
    await Promise.all(starting);
    return states();
  }

  Object.defineProperty(globalThis, '__codexPP', {
    configurable: true,
    value: Object.freeze({
      protocol: 2,
      sync(desired, key, options) {
        if (options?.trace) enableTrace();
        const next = queue.then(() => reconcile(desired)).then(result => {
          if (key !== undefined) deliveryKey = key;
          return result;
        });
        queue = next.catch(() => {});
        return next;
      },
      // Cheap per-poll probe: no extension code crosses the IPC boundary.
      status() { return { key: deliveryKey, settingsKey, states: states() }; },
      trace() { return tracer ? tracer.report() : null; },
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
