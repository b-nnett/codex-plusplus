/**
 * Renderer preload entry. Runs in an isolated world before Codex's page JS.
 * Responsibilities:
 *   1. Install a React DevTools-shaped global hook to capture the renderer
 *      reference when React mounts. We use this for fiber walking.
 *   2. After DOMContentLoaded, kick off settings-injection logic.
 *   3. Discover renderer-scoped tweaks (via IPC to main) and start them.
 *   4. Listen for `codexpp:tweaks-changed` from main (filesystem watcher) and
 *      hot-reload tweaks without dropping the page.
 */

import { ipcRenderer } from "electron";
import { installReactHook } from "./react-hook";
import {
  mountFloatingSettingsLauncher,
  startSettingsInjector,
} from "./settings-injector";
import { startTweakHost, teardownTweakHost } from "./tweak-host";
import { mountManager } from "./manager";

// File-log preload progress so we can diagnose without DevTools. Best-effort:
// failures here must never throw because we'd take the page down with us.
//
// Codex's renderer is sandboxed (sandbox: true), so `require("node:fs")` is
// unavailable. We forward log lines to main via IPC; main writes the file.
function fileLog(stage: string, extra?: unknown): void {
  const msg = `[codex-plusplus preload] ${stage}${
    extra === undefined ? "" : " " + safeStringify(extra)
  }`;
  try {
    console.error(msg);
  } catch {}
  try {
    ipcRenderer.send("codexpp:preload-log", "info", msg);
  } catch {}
}
function safeStringify(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

fileLog("preload entry", { url: location.href });

let standaloneSettingsEnabled = false;

// React hook must be installed *before* Codex's bundle runs.
try {
  installReactHook();
  fileLog("react hook installed");
} catch (e) {
  fileLog("react hook FAILED", String(e));
}

queueMicrotask(() => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
});

async function boot() {
  fileLog("boot start", { readyState: document.readyState });
  try {
    const config = await ipcRenderer.invoke("codexpp:get-config").catch(() => null) as
      | { settingsInjector?: boolean }
      | null;
    standaloneSettingsEnabled = config?.settingsInjector === false;
    if (standaloneSettingsEnabled) {
      fileLog("settings injector disabled by config");
    } else {
      startSettingsInjector();
      fileLog("settings injector started");
    }
    await startTweakHost();
    fileLog("tweak host started");
    await mountManager();
    fileLog("manager mounted");
    if (standaloneSettingsEnabled) {
      mountFloatingSettingsLauncher();
      fileLog("standalone settings launcher mounted");
    }
    subscribeReload();
    fileLog("boot complete");
  } catch (e) {
    fileLog("boot FAILED", String((e as Error)?.stack ?? e));
    console.error("[codex-plusplus] preload boot failed:", e);
  }
}

// Hot reload: gated behind a small in-flight lock so a flurry of fs events
// doesn't reentrantly tear down the host mid-load.
let reloading: Promise<void> | null = null;
function subscribeReload(): void {
  ipcRenderer.on("codexpp:tweaks-changed", () => {
    if (reloading) return;
    reloading = (async () => {
      try {
        console.info("[codex-plusplus] hot-reloading tweaks");
        teardownTweakHost();
        await startTweakHost();
        await mountManager();
        if (standaloneSettingsEnabled) mountFloatingSettingsLauncher();
      } catch (e) {
        console.error("[codex-plusplus] hot reload failed:", e);
      } finally {
        reloading = null;
      }
    })();
  });
}
