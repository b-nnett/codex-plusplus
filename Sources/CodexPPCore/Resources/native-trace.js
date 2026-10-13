// Opt-in startup tracer for the reviewed main-process bootstrap. Disabled
// unless the app is launched with CODEXPP_TRACE=1 or Diagnostics/trace.enable
// exists; a disabled tracer is a frozen no-op. When enabled it records Codex++
// spans, main-thread stalls and renderer extension costs, all on the epoch-ms
// clock, to Diagnostics/startup-trace-<pid>.json. It also introspects the whole
// app: an in-process main-process CPU profile from the first bootstrap line,
// module load times, vendor IPC handler times, and a CPU profile of each app
// window's renderer through Electron's in-process debugger API (no port, no
// DevTools window). Profiles hold function names and script locations only;
// IPC is recorded by channel and message type, never by content.
(function createTrace(support, adapter, electron) {
  const fs = require('fs');
  const path = require('path');
  const diagnostics = path.join(support, 'Diagnostics');
  // trace.enable may hold KEY=VALUE lines (e.g. CODEXPP_TRACE_IPC=0); they
  // override the environment, so a normal `open -a` launch can be configured.
  let enabled = false;
  const settings = {...process.env};
  try {
    const file = path.join(diagnostics, 'trace.enable');
    if (fs.existsSync(file)) {
      enabled = true;
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const match = /^\s*(CODEXPP_TRACE_[A-Z_]+)\s*=\s*(\S*)\s*$/.exec(line);
        if (match) settings[match[1]] = match[2];
      }
    }
    enabled ||= process.env.CODEXPP_TRACE === '1';
  } catch {}
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      span: (_name, fn) => fn(),
      async: (_name, fn) => fn(),
      collector() {},
      start() {},
      flush() {}
    });
  }

  const {performance, monitorEventLoopDelay} = require('perf_hooks');
  const origin = performance.timeOrigin;
  const now = () => origin + performance.now();
  const maxEvents = 60000, maxStalls = 2000, keepFiles = 40;
  const profileSeconds = Math.min(120, Math.max(5, Number(settings.CODEXPP_TRACE_SECONDS) || 25));
  // Each whole-app probe can be switched off (CODEXPP_TRACE_<NAME>=0) to bisect perturbation.
  const probe = name => settings[`CODEXPP_TRACE_${name}`] !== '0';
  // The in-process main-process profiler can freeze the app's main thread
  // (it shares V8's inspector with the app's own sessions), so it is opt-in:
  // CODEXPP_TRACE_MAIN_PROFILE=1.
  const optIn = name => settings[`CODEXPP_TRACE_${name}`] === '1';
  const bootstrapStart = now();
  const events = [], stalls = [], collectors = [];
  let renderers = [], whenReady = null, dropped = 0, timers = [], stallTimer = null, histogram = null;
  let complete = false;
  const profiles = [], failures = [];

  function writeFile(name, value) {
    fs.mkdirSync(diagnostics, {recursive: true, mode: 0o700});
    const file = path.join(diagnostics, name), temporary = `${file}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value), {mode: 0o600});
    fs.renameSync(temporary, file);
    return file;
  }

  // Main-process CPU profile, started before any vendor code runs. In-process
  // inspector sessions answer synchronously, so the quit handler can stop it.
  let mainProfile = null;
  if (optIn('MAIN_PROFILE')) try {
    const session = new (require('inspector').Session)();
    session.connect();
    session.post('Profiler.enable');
    session.post('Profiler.setSamplingInterval', {interval: 500});
    mainProfile = {session, started: 0, stopped: false};
    session.post('Profiler.start', () => { mainProfile.started = now(); });
  } catch (error) { console.error('[Codex++] trace main profile:', error); }

  function stopMainProfile() {
    if (!mainProfile || mainProfile.stopped) return;
    mainProfile.stopped = true;
    try {
      mainProfile.session.post('Profiler.stop', (error, result) => {
        if (error || !result?.profile) return;
        const file = writeFile(`startup-main-${process.pid}.cpuprofile`, result.profile);
        profiles.push({kind: 'main', file, epochStart: mainProfile.started});
      });
      mainProfile.session.disconnect();
    } catch (error) { console.error('[Codex++] trace main profile:', error); }
  }

  // Module loads: self time (excluding nested loads) for every require.
  const loadStack = [];
  if (probe('MODULES')) try {
    const Module = require('module'), load = Module._load;
    Module._load = function (request) {
      const start = now();
      loadStack.push(0);
      try { return load.apply(this, arguments); } finally {
        const end = now(), nested = loadStack.pop(), total = end - start;
        if (loadStack.length) loadStack[loadStack.length - 1] += total;
        if (total >= 1 && events.length < maxEvents) {
          const label = String(request).split('/').slice(-3).join('/').slice(0, 120);
          events.push({name: `require:${label}`, kind: 'require', start, dur: total, self: total - nested});
        }
      }
    };
  } catch (error) { console.error('[Codex++] trace modules:', error); }

  // Vendor IPC: synchronous handler time and async latency per channel and
  // message type. Wrappers are remembered so removeListener still works.
  const wrapped = new WeakMap();
  function ipcWrapper(channel, listener) {
    if (typeof listener !== 'function') return listener;
    if (wrapped.has(listener)) return wrapped.get(listener);
    const wrapper = function (event, ...args) {
      const type = typeof args[0]?.type === 'string' ? `:${args[0].type.slice(0, 48)}` : '';
      const name = `ipc:${String(channel).slice(0, 80)}${type}`, start = now();
      let result;
      try { result = listener.call(this, event, ...args); } finally { record(name, start, now(), 'sync'); }
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).then(() => record(name, start, now(), 'async'), () => record(name, start, now(), 'async'));
      }
      return result;
    };
    wrapped.set(listener, wrapper);
    return wrapper;
  }
  const ipc = probe('IPC') ? electron?.ipcMain : null;
  if (ipc) {
    for (const method of ['handle', 'handleOnce', 'on', 'once', 'addListener', 'prependListener']) {
      const original = ipc[method];
      if (typeof original === 'function') ipc[method] = function (channel, listener) { return original.call(this, channel, ipcWrapper(channel, listener)); };
    }
    for (const method of ['removeListener', 'off']) {
      const original = ipc[method];
      if (typeof original === 'function') ipc[method] = function (channel, listener) { return original.call(this, channel, wrapped.get(listener) || listener); };
    }
  }

  // Window failures, so a startup experiment that breaks a renderer is visible.
  electron?.app?.on?.('web-contents-created', (_event, contents) => {
    const note = (name, detail) => record(`window:${name}`, now(), now(), 'sync') || failures.push({name, at: now(), webContentsId: contents.id, ...detail});
    contents.on('render-process-gone', (_e, details) => note('render-process-gone', {reason: details?.reason, exitCode: details?.exitCode}));
    contents.on('did-fail-load', (_e, code, description, url, isMainFrame) => note('did-fail-load', {code, description, isMainFrame, url: String(url).slice(0, 80)}));
    contents.on('unresponsive', () => note('unresponsive', {}));
    contents.on('console-message', (_e, level, message, line, sourceId) => { if (level >= 3 && failures.length < 200) failures.push({name: 'console-error', at: now(), webContentsId: contents.id, message: String(message).slice(0, 300), source: `${String(sourceId ?? '').slice(0, 200)}:${line ?? ''}`}); });
  });

  // Renderer CPU profiles of app windows through the in-process debugger API.
  const rendererProfiles = [];
  // Opt-in sampling heap profile (CODEXPP_TRACE_HEAP_PROFILE=1): which code
  // allocated the memory still live when the trace ends, without a snapshot.
  const heapProfile = optIn('HEAP_PROFILE');
  if (probe('RENDERER_PROFILE') || heapProfile) electron?.app?.on?.('web-contents-created', (_event, contents) => {
    try {
      if (contents.getType?.() !== 'window' || !contents.debugger || contents.debugger.isAttached()) return;
      contents.debugger.attach('1.3');
      const entry = {contents, started: 0};
      rendererProfiles.push(entry);
      // A debugger attached before the page starts holds the renderer until
      // Runtime.runIfWaitingForDebugger; release it once profiling has begun.
      const cpu = probe('RENDERER_PROFILE');
      entry.cpu = cpu;
      (cpu ? contents.debugger.sendCommand('Profiler.enable')
        .then(() => contents.debugger.sendCommand('Profiler.setSamplingInterval', {interval: 500}))
        .then(() => contents.debugger.sendCommand('Profiler.start')) : Promise.resolve())
        .then(() => heapProfile && contents.debugger.sendCommand('HeapProfiler.enable')
          .then(() => contents.debugger.sendCommand('HeapProfiler.startSampling', {samplingInterval: 65536})))
        .then(() => { entry.started = now(); }, error => { if (failures.length < 200) failures.push({name: 'renderer-profile-start', at: now(), webContentsId: contents.id, message: String(error?.message ?? error).slice(0, 300)}); })
        .finally(() => contents.debugger.sendCommand('Runtime.runIfWaitingForDebugger').catch(() => {}));
    } catch (error) { console.error('[Codex++] trace renderer profile:', error); }
  });

  // Opt-in heap snapshot of the visible app window when the trace ends
  // (CODEXPP_TRACE_HEAP_SNAPSHOT=1), streamed to disk chunk by chunk.
  async function takeHeapSnapshot() {
    if (!optIn('HEAP_SNAPSHOT')) return;
    const contents = electron.webContents.getAllWebContents().find(item => {
      try { const url = new URL(item.getURL()); return item.getType?.() === 'window' && url.protocol === 'app:' && url.pathname === '/index.html' && electron.BrowserWindow.fromWebContents(item)?.isVisible?.(); } catch { return false; }
    });
    if (!contents) return;
    const file = path.join(diagnostics, `startup-renderer-${process.pid}-${contents.id}.heapsnapshot`);
    const temporary = `${file}.${Date.now()}.tmp`;
    let fd = null, attached = false;
    const onMessage = (_event, method, params) => { if (method === 'HeapProfiler.addHeapSnapshotChunk' && fd != null) fs.writeSync(fd, params.chunk); };
    try {
      fd = fs.openSync(temporary, 'w', 0o600);
      if (!contents.debugger.isAttached()) { contents.debugger.attach('1.3'); attached = true; }
      contents.debugger.on('message', onMessage);
      await contents.debugger.sendCommand('HeapProfiler.enable');
      await contents.debugger.sendCommand('HeapProfiler.collectGarbage');
      await contents.debugger.sendCommand('HeapProfiler.takeHeapSnapshot', {reportProgress: false, captureNumericValue: false});
      fs.closeSync(fd); fd = null;
      fs.renameSync(temporary, file);
      profiles.push({kind: 'renderer-heap-snapshot', page: '/index.html', webContentsId: contents.id, file, epochStart: now()});
    } catch (error) {
      if (failures.length < 200) failures.push({name: 'heap-snapshot', at: now(), webContentsId: contents.id, message: String(error?.message ?? error).slice(0, 300)});
    } finally {
      if (fd != null) { try { fs.closeSync(fd); fs.rmSync(temporary, {force: true}); } catch {} }
      contents.debugger.removeListener('message', onMessage);
      if (attached) { try { contents.debugger.detach(); } catch {} }
    }
  }

  async function stopRendererProfiles() {
    for (const {contents, started, cpu} of rendererProfiles.splice(0)) {
      try {
        if (contents.isDestroyed()) continue;
        const url = new URL(contents.mainFrame.url);
        if (url.protocol === 'app:' && url.host === '-' && started) {
          if (cpu) {
            const {profile} = await contents.debugger.sendCommand('Profiler.stop');
            const file = writeFile(`startup-renderer-${process.pid}-${contents.id}.cpuprofile`, profile);
            profiles.push({kind: 'renderer', page: url.pathname, webContentsId: contents.id, file, epochStart: started});
          }
          if (heapProfile) {
            const {profile} = await Promise.race([contents.debugger.sendCommand('HeapProfiler.getSamplingProfile'),
              new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('heap profile timed out')), 60000); timer.unref?.(); })]);
            const file = writeFile(`startup-renderer-${process.pid}-${contents.id}.heapprofile`, profile);
            profiles.push({kind: 'renderer-heap', page: url.pathname, webContentsId: contents.id, file, epochStart: started});
          }
        }
        contents.debugger.detach();
      } catch (error) {
        console.error('[Codex++] trace renderer profile:', error);
        if (failures.length < 200) failures.push({name: 'renderer-profile-stop', at: now(), webContentsId: contents.id, message: String(error?.message ?? error).slice(0, 300)});
      }
    }
  }

  function record(name, start, end, kind) {
    if (events.length >= maxEvents) { dropped++; return; }
    events.push({name, kind, start, dur: end - start});
  }

  // Synchronous work runs on the main thread, so its duration is time the app
  // could not spend starting up.
  function span(name, fn) {
    const start = now();
    try { return fn(); } finally { record(name, start, now(), 'sync'); }
  }

  // Async work records its synchronous prefix and, separately, its full latency.
  function async(name, fn) {
    const start = now();
    let pending;
    try { pending = fn(); } finally { record(name, start, now(), 'sync'); }
    return Promise.resolve(pending).finally(() => record(name, start, now(), 'async'));
  }

  // A 10 ms interval that fires late means the main thread was blocked. The
  // report attributes each stall to overlapping Codex++ spans, or to the app.
  function watchStalls(durationMs) {
    const interval = 10, threshold = 30;
    let last = now();
    stallTimer = setInterval(() => {
      const current = now(), late = current - last - interval;
      if (late >= threshold && stalls.length < maxStalls) stalls.push({start: last + interval, dur: late});
      last = current;
    }, interval);
    stallTimer.unref?.();
    try { histogram = monitorEventLoopDelay({resolution: 10}); histogram.enable(); } catch { histogram = null; }
    const stop = setTimeout(() => { clearInterval(stallTimer); stallTimer = null; histogram?.disable(); }, durationMs);
    stop.unref?.();
  }

  function payload() {
    const delay = histogram ? {
      minMs: histogram.min / 1e6, meanMs: histogram.mean / 1e6, p50Ms: histogram.percentile(50) / 1e6,
      p99Ms: histogram.percentile(99) / 1e6, maxMs: histogram.max / 1e6
    } : null;
    return {
      schema: 1, adapter, pid: process.pid, processStart: origin, bootstrapStart, whenReady,
      written: now(), cpu: process.cpuUsage(), droppedEvents: dropped, loopDelay: delay,
      complete, profileSeconds, profiles, failures, events, stalls, renderers,
      // Vendor startup phase marks recorded by the startup adapter (performance.now()).
      vendorMain: globalThis.__codexPPStartupMain ?? null,
      // Every web contents (windows, webview guests, ...) by process, to map memory to owners.
      webContents: (() => { try {
        return electron.webContents.getAllWebContents().slice(0, 60).map(contents => {
          let url = null; try { const parsed = new URL(contents.getURL()); url = parsed.origin + parsed.pathname.slice(0, 80); } catch {}
          return {id: contents.id, type: contents.getType?.() ?? null, url, pid: contents.getOSProcessId?.() ?? null, host: contents.hostWebContents?.id ?? null};
        });
      } catch { return null; } })()
    };
  }

  function write() {
    try { writeFile(`startup-trace-${process.pid}.json`, payload()); }
    catch (error) { console.error('[Codex++] trace write:', error); }
  }

  function prune() {
    try {
      for (const pattern of [/^startup-trace-\d+\.json$/, /^startup-main-\d+\.cpuprofile$/, /^startup-renderer-\d+-\d+\.cpuprofile$/]) {
        const traces = fs.readdirSync(diagnostics).filter(name => pattern.test(name))
          .map(name => ({name, time: fs.statSync(path.join(diagnostics, name)).mtimeMs}))
          .sort((a, b) => b.time - a.time);
        for (const old of traces.slice(keepFiles)) fs.rmSync(path.join(diagnostics, old.name), {force: true});
      }
    } catch {}
  }

  async function flush() {
    const collected = [];
    if (probe('COLLECT')) for (const collect of collectors) {
      try { collected.push(...(await collect())); } catch {}
    }
    if (collected.length) renderers = collected;
    write();
  }

  return Object.freeze({
    enabled: true,
    // Renderer extension tracing (scoped primitives, long tasks) can be switched off.
    renderer: probe('RENDERER'),
    now,
    span,
    async,
    // Records synchronous work that began at `start` and ends now.
    measure(name, start) { record(name, start, now(), 'sync'); },
    // A collector returns renderer reports; they are pulled at each flush.
    collector(fn) { collectors.push(fn); },
    // Flushes repeatedly through the first minute so a short-lived launch
    // still leaves a trace; the quit flush is synchronous and keeps the last
    // renderer reports.
    start(electron) {
      whenReady = now();
      if (probe('STALLS')) watchStalls(60000);
      // Optionally stop the main-process profile early (CODEXPP_TRACE_MAIN_PROFILE_MS
      // after whenReady), to cover the launch path without long sessions.
      const mainProfileMs = Number(settings.CODEXPP_TRACE_MAIN_PROFILE_MS);
      if (mainProfile && Number.isFinite(mainProfileMs) && mainProfileMs > 0) {
        const early = setTimeout(stopMainProfile, mainProfileMs);
        early.unref?.();
      }
      prune();
      for (const seconds of [2, 4, 6, 8, 10, 12, 15, 20, 30, 45, 60].filter(seconds => seconds < profileSeconds)) {
        const timer = setTimeout(() => void flush(), seconds * 1000);
        timer.unref?.();
        timers.push(timer);
      }
      // Profiles cover startup plus a margin; `complete` tells tools the
      // trace and every profile are on disk.
      const finish = setTimeout(async () => {
        await stopRendererProfiles();
        await takeHeapSnapshot();
        stopMainProfile();
        await flush();
        complete = true;
        write();
      }, profileSeconds * 1000);
      finish.unref?.();
      timers.push(finish);
      electron.app.on('before-quit', () => { for (const timer of timers) clearTimeout(timer); stopMainProfile(); write(); });
    },
    flush
  });
})
