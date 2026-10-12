# Changelog

## 0.1.0 — unreleased

- Initial source release of the Codex++ macOS menu bar helper and renderer extension host.
- Exact-build patch recipes, authenticated update handoff, atomic rollback, native Settings integration, Appshot compatibility, AutoFill, bookmarks, Better Sidebar, and Focus Mode.
- Main-process extension injection without an externally reachable DevTools endpoint.
- Extension polling sends code to a window only when it changes; steady-state polls are a small status probe. Polls no longer overlap, a hung window cannot queue calls, and diagnostics are rewritten only on change or every five seconds.
- Patch v41 (v37–v40 unreleased): an optional better-sidebar contract discovered by code shape replaces minified export names; the browser menu adapter tolerates an upstream `frame` option.
- Extensions can report non-fatal warnings with `api.warn`.
- Appshot runtime warmup waits 15 seconds after launch instead of starting while the first window loads, and its vendor signature checks no longer block the main process. A capture requested earlier starts the runtime itself. `scripts/bench-startup.py` compares cold-launch time to interactivity of the patched and original apps.
- The helper menu no longer pops open on every ChatGPT launch; the bootstrap's background `open -g` reopen is ignored unless it activates the helper.
- Startup fast path (optional AST adapter, `codexpp-startup-discovery.json` reports what matched): ChatGPT sign-ins build the Statsig client from the last bootstrap payload for the same identity (kept in IndexedDB) instead of holding the whole window behind a spinner until OpenAI's bootstrap request returns, then apply the fresh payload when it arrives; Statsig's cached values end its async loading state; the dictation sound cues are no longer preloaded at launch. A first launch, a different account or app version, or an unrecognised build behaves exactly as before.
- Opt-in startup tracing (`Diagnostics/trace.enable`): Codex++ spans, main-thread stalls, vendor IPC and module timings, renderer extension costs, loading-gate timings and a renderer CPU profile; `scripts/trace-report.py` ranks them and `scripts/startup-critical-path.py` rebuilds the request timeline from ChatGPT's own logs. Extensions now start concurrently, so a slow initializer no longer delays the others.
