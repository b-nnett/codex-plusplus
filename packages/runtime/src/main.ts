/**
 * Main-process bootstrap. Loaded by the asar loader before Codex's own
 * main process code runs. We hook `BrowserWindow` so every window Codex
 * creates gets our preload script attached. We also stand up an IPC
 * channel for tweaks to talk to the main process.
 *
 * We are in CJS land here (matches Electron's main process and Codex's own
 * code). The renderer-side runtime is bundled separately into preload.js.
 */
import { app, BrowserView, BrowserWindow, clipboard, ipcMain, session, shell, webContents } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import chokidar from "chokidar";
import { discoverTweaks, type DiscoveredTweak } from "./tweak-discovery";
import { createDiskStorage, type DiskStorage } from "./storage";
import { syncManagedMcpServers } from "./mcp-sync";
import { getWatcherHealth } from "./watcher-health";
import {
  isMainProcessTweakScope,
  reloadTweaks,
  setTweakEnabledAndReload,
} from "./tweak-lifecycle";
import { appendCappedLog } from "./logging";

const userRoot = process.env.CODEX_PLUSPLUS_USER_ROOT;
const runtimeDir = process.env.CODEX_PLUSPLUS_RUNTIME;

if (!userRoot || !runtimeDir) {
  throw new Error(
    "codex-plusplus runtime started without CODEX_PLUSPLUS_USER_ROOT/RUNTIME envs",
  );
}

const PRELOAD_PATH = resolve(runtimeDir, "preload.js");
const TWEAKS_DIR = join(userRoot, "tweaks");
const LOG_DIR = join(userRoot, "log");
const LOG_FILE = join(LOG_DIR, "main.log");
const CONFIG_FILE = join(userRoot, "config.json");
const CODEX_CONFIG_FILE = join(homedir(), ".codex", "config.toml");
const INSTALLER_STATE_FILE = join(userRoot, "state.json");
const UPDATE_MODE_FILE = join(userRoot, "update-mode.json");
const SIGNED_CODEX_BACKUP = join(userRoot, "backup", "Codex.app");
const CODEX_PLUSPLUS_VERSION = "0.1.3";
const CODEX_PLUSPLUS_REPO = "b-nnett/codex-plusplus";
const CODEX_WINDOW_SERVICES_KEY = "__codexpp_window_services__";
const DEFAULT_CDP_STABLE_PORT = 9222;
const DEFAULT_CDP_BETA_PORT = 9223;
const CDP_PORT_MIN = 1;
const CDP_PORT_MAX = 65535;
const REMOTE_DEBUGGING_SWITCH = "remote-debugging-port";

mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(TWEAKS_DIR, { recursive: true });

// Optional: enable Chrome DevTools Protocol on a TCP port so we can drive the
// running Codex from outside (curl http://localhost:<port>/json, attach via
// CDP WebSocket, take screenshots, evaluate in renderer, etc.). Codex's
// production build sets webPreferences.devTools=false, which kills the
// in-window DevTools shortcut, but `--remote-debugging-port` works regardless
// because it's a Chromium command-line switch processed before app init.
//
// Off by default. Set CODEXPP_REMOTE_DEBUG=1 (optionally CODEXPP_REMOTE_DEBUG_PORT)
// or enable it from Codex++ Settings. Must be appended before `app` becomes
// ready; we're at module top-level so that's fine.
const startupCdp = resolveStartupCdpConfig();
if (startupCdp.enabled && !hasRemoteDebuggingSwitch()) {
  app.commandLine.appendSwitch(REMOTE_DEBUGGING_SWITCH, String(startupCdp.port));
  log("info", `remote debugging enabled on port ${startupCdp.port} via ${startupCdp.source}`);
}

interface PersistedState {
  codexPlusPlus?: {
    autoUpdate?: boolean;
    safeMode?: boolean;
    updateCheck?: CodexPlusPlusUpdateCheck;
    cdp?: CodexCdpConfig;
  };
  /** Per-tweak enable flags. Missing entries default to enabled. */
  tweaks?: Record<string, { enabled?: boolean }>;
  /** Cached GitHub release checks. Runtime never auto-installs updates. */
  tweakUpdateChecks?: Record<string, TweakUpdateCheck>;
}

interface CodexCdpConfig {
  enabled?: boolean;
  port?: number;
}

interface CodexCdpStatus {
  enabled: boolean;
  active: boolean;
  configuredPort: number;
  activePort: number | null;
  restartRequired: boolean;
  source: "argv" | "env" | "config" | "off";
  jsonListUrl: string | null;
  jsonVersionUrl: string | null;
  launchCommand: string;
  appRoot: string | null;
}

interface CodexPlusPlusUpdateCheck {
  checkedAt: string;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  updateAvailable: boolean;
  error?: string;
}

interface TweakUpdateCheck {
  checkedAt: string;
  repo: string;
  currentVersion: string;
  latestVersion: string | null;
  latestTag: string | null;
  releaseUrl: string | null;
  updateAvailable: boolean;
  error?: string;
}

function readState(): PersistedState {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as PersistedState;
  } catch {
    return {};
  }
}
function writeState(s: PersistedState): void {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(s, null, 2));
  } catch (e) {
    log("warn", "writeState failed:", String((e as Error).message));
  }
}
function isCodexPlusPlusAutoUpdateEnabled(): boolean {
  return readState().codexPlusPlus?.autoUpdate !== false;
}
function setCodexPlusPlusAutoUpdate(enabled: boolean): void {
  const s = readState();
  s.codexPlusPlus ??= {};
  s.codexPlusPlus.autoUpdate = enabled;
  writeState(s);
}
function setCodexCdpConfig(config: CodexCdpConfig): void {
  const s = readState();
  s.codexPlusPlus ??= {};
  s.codexPlusPlus.cdp = {
    enabled: config.enabled === true,
    port: normalizeCdpPort(config.port),
  };
  writeState(s);
}
function isCodexPlusPlusSafeModeEnabled(): boolean {
  return readState().codexPlusPlus?.safeMode === true;
}
function isTweakEnabled(id: string): boolean {
  const s = readState();
  if (s.codexPlusPlus?.safeMode === true) return false;
  return s.tweaks?.[id]?.enabled !== false;
}
function setTweakEnabled(id: string, enabled: boolean): void {
  const s = readState();
  s.tweaks ??= {};
  s.tweaks[id] = { ...s.tweaks[id], enabled };
  writeState(s);
}

interface InstallerState {
  appRoot: string;
  codexVersion: string | null;
}

function readInstallerState(): InstallerState | null {
  try {
    return JSON.parse(readFileSync(INSTALLER_STATE_FILE, "utf8")) as InstallerState;
  } catch {
    return null;
  }
}

function readEarlyCdpConfig(): CodexCdpConfig {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as PersistedState;
    return parsed.codexPlusPlus?.cdp ?? {};
  } catch {
    return {};
  }
}

function resolveStartupCdpConfig(): { enabled: boolean; port: number; source: CodexCdpStatus["source"] } {
  const argvPort = getActiveRemoteDebuggingPort();
  if (argvPort !== null) {
    return { enabled: true, port: argvPort, source: "argv" };
  }

  if (process.env.CODEXPP_REMOTE_DEBUG === "1") {
    return {
      enabled: true,
      port: normalizeCdpPort(readNumber(process.env.CODEXPP_REMOTE_DEBUG_PORT)),
      source: "env",
    };
  }

  const cdp = readEarlyCdpConfig();
  if (cdp.enabled === true) {
    return {
      enabled: true,
      port: normalizeCdpPort(cdp.port),
      source: "config",
    };
  }

  return { enabled: false, port: normalizeCdpPort(cdp.port), source: "off" };
}

function hasRemoteDebuggingSwitch(): boolean {
  try {
    if (app.commandLine.hasSwitch(REMOTE_DEBUGGING_SWITCH)) return true;
  } catch {}
  return getActiveRemoteDebuggingPort() !== null;
}

function getActiveRemoteDebuggingPort(): number | null {
  try {
    const fromApp = app.commandLine.getSwitchValue(REMOTE_DEBUGGING_SWITCH);
    const parsed = readNumber(fromApp);
    if (isValidCdpPort(parsed)) return parsed;
  } catch {}

  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith(`--${REMOTE_DEBUGGING_SWITCH}=`)) {
      const parsed = readNumber(arg.slice(`--${REMOTE_DEBUGGING_SWITCH}=`.length));
      if (isValidCdpPort(parsed)) return parsed;
    }
    if (arg === `--${REMOTE_DEBUGGING_SWITCH}`) {
      const parsed = readNumber(process.argv[i + 1]);
      if (isValidCdpPort(parsed)) return parsed;
    }
  }

  return null;
}

function getCodexCdpStatus(): CodexCdpStatus {
  const state = readState();
  const configured = state.codexPlusPlus?.cdp ?? {};
  const enabled = configured.enabled === true;
  const configuredPort = normalizeCdpPort(configured.port);
  const activePort = getActiveRemoteDebuggingPort();
  const active = activePort !== null;
  const startup = resolveStartupCdpConfig();
  const urlPort = activePort ?? configuredPort;
  const appRoot = readInstallerState()?.appRoot ?? null;

  return {
    enabled,
    active,
    configuredPort,
    activePort,
    restartRequired: enabled && activePort !== configuredPort,
    source: active ? startup.source : enabled ? "config" : "off",
    jsonListUrl: active ? cdpUrl(urlPort, "json/list") : null,
    jsonVersionUrl: active ? cdpUrl(urlPort, "json/version") : null,
    launchCommand: buildCdpLaunchCommand(appRoot, configuredPort),
    appRoot,
  };
}

function cdpUrl(port: number, path: string): string {
  return `http://127.0.0.1:${port}/${path}`;
}

function buildCdpLaunchCommand(appRoot: string | null, port: number): string {
  const appPath = appRoot ?? "/Applications/Codex.app";
  return `open -na ${shellQuote(appPath)} --args --remote-debugging-port=${port}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function normalizeCdpPort(port: unknown): number {
  const parsed = typeof port === "number" ? port : readNumber(String(port ?? ""));
  return isValidCdpPort(parsed) ? parsed : defaultCdpPort();
}

function defaultCdpPort(): number {
  const appRoot = readInstallerState()?.appRoot ?? "";
  let appName = "";
  try {
    appName = app.getName();
  } catch {}
  return /\bbeta\b/i.test(`${appRoot} ${appName}`) ? DEFAULT_CDP_BETA_PORT : DEFAULT_CDP_STABLE_PORT;
}

function isValidCdpPort(port: number | null): port is number {
  return port !== null && Number.isInteger(port) && port >= CDP_PORT_MIN && port <= CDP_PORT_MAX;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function log(level: "info" | "warn" | "error", ...args: unknown[]): void {
  const line = `[${new Date().toISOString()}] [${level}] ${args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ")}\n`;
  try {
    appendCappedLog(LOG_FILE, line);
  } catch {}
  if (level === "error") console.error("[codex-plusplus]", ...args);
}

function installSparkleUpdateHook(): void {
  if (process.platform !== "darwin") return;

  const Module = require("node:module") as typeof import("node:module") & {
    _load?: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = Module._load;
  if (typeof originalLoad !== "function") return;

  Module._load = function codexPlusPlusModuleLoad(request: string, parent: unknown, isMain: boolean) {
    const loaded = originalLoad.apply(this, [request, parent, isMain]) as unknown;
    if (typeof request === "string" && /sparkle(?:\.node)?$/i.test(request)) {
      wrapSparkleExports(loaded);
    }
    return loaded;
  };
}

function wrapSparkleExports(loaded: unknown): void {
  if (!loaded || typeof loaded !== "object") return;
  const exports = loaded as Record<string, unknown> & { __codexppSparkleWrapped?: boolean };
  if (exports.__codexppSparkleWrapped) return;
  exports.__codexppSparkleWrapped = true;

  for (const name of ["installUpdatesIfAvailable"]) {
    const fn = exports[name];
    if (typeof fn !== "function") continue;
    exports[name] = function codexPlusPlusSparkleWrapper(this: unknown, ...args: unknown[]) {
      prepareSignedCodexForSparkleInstall();
      return Reflect.apply(fn, this, args);
    };
  }

  if (exports.default && exports.default !== exports) {
    wrapSparkleExports(exports.default);
  }
}

function prepareSignedCodexForSparkleInstall(): void {
  if (process.platform !== "darwin") return;
  if (existsSync(UPDATE_MODE_FILE)) {
    log("info", "Sparkle update prep skipped; update mode already active");
    return;
  }
  if (!existsSync(SIGNED_CODEX_BACKUP)) {
    log("warn", "Sparkle update prep skipped; signed Codex.app backup is missing");
    return;
  }
  if (!isDeveloperIdSignedApp(SIGNED_CODEX_BACKUP)) {
    log("warn", "Sparkle update prep skipped; Codex.app backup is not Developer ID signed");
    return;
  }

  const state = readInstallerState();
  const appRoot = state?.appRoot ?? inferMacAppRoot();
  if (!appRoot) {
    log("warn", "Sparkle update prep skipped; could not infer Codex.app path");
    return;
  }

  const mode = {
    enabledAt: new Date().toISOString(),
    appRoot,
    codexVersion: state?.codexVersion ?? null,
  };
  writeFileSync(UPDATE_MODE_FILE, JSON.stringify(mode, null, 2));

  try {
    execFileSync("ditto", [SIGNED_CODEX_BACKUP, appRoot], { stdio: "ignore" });
    try {
      execFileSync("xattr", ["-dr", "com.apple.quarantine", appRoot], { stdio: "ignore" });
    } catch {}
    log("info", "Restored signed Codex.app before Sparkle install", { appRoot });
  } catch (e) {
    log("error", "Failed to restore signed Codex.app before Sparkle install", {
      message: (e as Error).message,
    });
  }
}

function isDeveloperIdSignedApp(appRoot: string): boolean {
  const result = spawnSync("codesign", ["-dv", "--verbose=4", appRoot], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return (
    result.status === 0 &&
    /Authority=Developer ID Application:/.test(output) &&
    !/Signature=adhoc/.test(output) &&
    !/TeamIdentifier=not set/.test(output)
  );
}

function inferMacAppRoot(): string | null {
  const marker = ".app/Contents/MacOS/";
  const idx = process.execPath.indexOf(marker);
  return idx >= 0 ? process.execPath.slice(0, idx + ".app".length) : null;
}

// Surface unhandled errors from anywhere in the main process to our log.
process.on("uncaughtException", (e: Error & { code?: string }) => {
  log("error", "uncaughtException", { code: e.code, message: e.message, stack: e.stack });
});
process.on("unhandledRejection", (e) => {
  log("error", "unhandledRejection", { value: String(e) });
});

installSparkleUpdateHook();

interface LoadedMainTweak {
  stop?: () => void;
  storage: DiskStorage;
}

interface CodexWindowServices {
  createFreshLocalWindow?: (route?: string) => Promise<Electron.BrowserWindow | null>;
  ensureHostWindow?: (hostId?: string) => Promise<Electron.BrowserWindow | null>;
  getPrimaryWindow?: (hostId?: string) => Electron.BrowserWindow | null;
  getContext?: (hostId: string) => { registerWindow?: (windowLike: CodexWindowLike) => void } | null;
  windowManager?: {
    createWindow?: (opts: Record<string, unknown>) => Promise<Electron.BrowserWindow | null>;
    registerWindow?: (
      windowLike: CodexWindowLike,
      hostId: string,
      primary: boolean,
      appearance: string,
    ) => void;
    options?: {
      allowDevtools?: boolean;
      preloadPath?: string;
    };
  };
}

interface CodexWindowLike {
  id: number;
  webContents: Electron.WebContents;
  on(event: "closed", listener: () => void): unknown;
  once?(event: string, listener: (...args: unknown[]) => void): unknown;
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener?(event: string, listener: (...args: unknown[]) => void): unknown;
  isDestroyed?(): boolean;
  isFocused?(): boolean;
  focus?(): void;
  show?(): void;
  hide?(): void;
  getBounds?(): Electron.Rectangle;
  getContentBounds?(): Electron.Rectangle;
  getSize?(): [number, number];
  getContentSize?(): [number, number];
  setTitle?(title: string): void;
  getTitle?(): string;
  setRepresentedFilename?(filename: string): void;
  setDocumentEdited?(edited: boolean): void;
  setWindowButtonVisibility?(visible: boolean): void;
}

interface CodexCreateWindowOptions {
  route: string;
  hostId?: string;
  show?: boolean;
  appearance?: string;
  parentWindowId?: number;
  bounds?: Electron.Rectangle;
}

interface CodexCreateViewOptions {
  route: string;
  hostId?: string;
  appearance?: string;
}

const tweakState = {
  discovered: [] as DiscoveredTweak[],
  loadedMain: new Map<string, LoadedMainTweak>(),
};

const tweakLifecycleDeps = {
  logInfo: (message: string) => log("info", message),
  setTweakEnabled,
  stopAllMainTweaks,
  clearTweakModuleCache,
  loadAllMainTweaks,
  broadcastReload,
};

// 1. Hook every session so our preload runs in every renderer.
//
// We use Electron's modern `session.registerPreloadScript` API (added in
// Electron 35). The deprecated `setPreloads` path silently no-ops in some
// configurations (notably with sandboxed renderers), so registerPreloadScript
// is the only reliable way to inject into Codex's BrowserWindows.
function registerPreload(s: Electron.Session, label: string): void {
  try {
    const reg = (s as unknown as {
      registerPreloadScript?: (opts: {
        type?: "frame" | "service-worker";
        id?: string;
        filePath: string;
      }) => string;
    }).registerPreloadScript;
    if (typeof reg === "function") {
      reg.call(s, { type: "frame", filePath: PRELOAD_PATH, id: "codex-plusplus" });
      log("info", `preload registered (registerPreloadScript) on ${label}:`, PRELOAD_PATH);
      return;
    }
    // Fallback for older Electron versions.
    const existing = s.getPreloads();
    if (!existing.includes(PRELOAD_PATH)) {
      s.setPreloads([...existing, PRELOAD_PATH]);
    }
    log("info", `preload registered (setPreloads) on ${label}:`, PRELOAD_PATH);
  } catch (e) {
    if (e instanceof Error && e.message.includes("existing ID")) {
      log("info", `preload already registered on ${label}:`, PRELOAD_PATH);
      return;
    }
    log("error", `preload registration on ${label} failed:`, e);
  }
}

app.whenReady().then(() => {
  log("info", "app ready fired");
  registerPreload(session.defaultSession, "defaultSession");
});

app.on("session-created", (s) => {
  registerPreload(s, "session-created");
});

// DIAGNOSTIC: log every webContents creation. Useful for verifying our
// preload reaches every renderer Codex spawns.
app.on("web-contents-created", (_e, wc) => {
  try {
    const wp = (wc as unknown as { getLastWebPreferences?: () => Record<string, unknown> })
      .getLastWebPreferences?.();
    log("info", "web-contents-created", {
      id: wc.id,
      type: wc.getType(),
      sessionIsDefault: wc.session === session.defaultSession,
      sandbox: wp?.sandbox,
      contextIsolation: wp?.contextIsolation,
    });
    wc.on("preload-error", (_ev, p, err) => {
      log("error", `wc ${wc.id} preload-error path=${p}`, String(err?.stack ?? err));
    });
  } catch (e) {
    log("error", "web-contents-created handler failed:", String((e as Error)?.stack ?? e));
  }
});

log("info", "main.ts evaluated; app.isReady=" + app.isReady());
if (isCodexPlusPlusSafeModeEnabled()) {
  log("warn", "safe mode is enabled; tweaks will not be loaded");
}

// 2. Initial tweak discovery + main-scope load.
loadAllMainTweaks();

app.on("will-quit", () => {
  stopAllMainTweaks();
  // Best-effort flush of any pending storage writes.
  for (const t of tweakState.loadedMain.values()) {
    try {
      t.storage.flush();
    } catch {}
  }
});

// 3. IPC: expose tweak metadata + reveal-in-finder.
ipcMain.handle("codexpp:list-tweaks", async () => {
  await Promise.all(tweakState.discovered.map((t) => ensureTweakUpdateCheck(t)));
  const updateChecks = readState().tweakUpdateChecks ?? {};
  return tweakState.discovered.map((t) => ({
    manifest: t.manifest,
    entry: t.entry,
    dir: t.dir,
    entryExists: existsSync(t.entry),
    enabled: isTweakEnabled(t.manifest.id),
    update: updateChecks[t.manifest.id] ?? null,
  }));
});

ipcMain.handle("codexpp:get-tweak-enabled", (_e, id: string) => isTweakEnabled(id));
ipcMain.handle("codexpp:set-tweak-enabled", (_e, id: string, enabled: boolean) => {
  return setTweakEnabledAndReload(id, enabled, tweakLifecycleDeps);
});

ipcMain.handle("codexpp:get-config", () => {
  const s = readState();
  return {
    version: CODEX_PLUSPLUS_VERSION,
    autoUpdate: s.codexPlusPlus?.autoUpdate !== false,
    safeMode: s.codexPlusPlus?.safeMode === true,
    updateCheck: s.codexPlusPlus?.updateCheck ?? null,
  };
});

ipcMain.handle("codexpp:set-auto-update", (_e, enabled: boolean) => {
  setCodexPlusPlusAutoUpdate(!!enabled);
  return { autoUpdate: isCodexPlusPlusAutoUpdateEnabled() };
});

ipcMain.handle("codexpp:get-cdp-status", () => getCodexCdpStatus());

ipcMain.handle("codexpp:set-cdp-config", (_e, config: CodexCdpConfig) => {
  setCodexCdpConfig(config);
  return getCodexCdpStatus();
});

ipcMain.handle("codexpp:check-codexpp-update", async (_e, force?: boolean) => {
  return ensureCodexPlusPlusUpdateCheck(force === true);
});

ipcMain.handle("codexpp:get-watcher-health", () => getWatcherHealth(userRoot!));

// Sandboxed renderer preload can't use Node fs to read tweak source. Main
// reads it on the renderer's behalf. Path must live under tweaksDir for
// security — we refuse anything else.
ipcMain.handle("codexpp:read-tweak-source", (_e, entryPath: string) => {
  const resolved = resolve(entryPath);
  if (!resolved.startsWith(TWEAKS_DIR + "/") && resolved !== TWEAKS_DIR) {
    throw new Error("path outside tweaks dir");
  }
  return require("node:fs").readFileSync(resolved, "utf8");
});

/**
 * Read an arbitrary asset file from inside a tweak's directory and return it
 * as a `data:` URL. Used by the settings injector to render manifest icons
 * (the renderer is sandboxed; `file://` won't load).
 *
 * Security: caller passes `tweakDir` and `relPath`; we (1) require tweakDir
 * to live under TWEAKS_DIR, (2) resolve relPath against it and re-check the
 * result still lives under TWEAKS_DIR, (3) cap output size at 1 MiB.
 */
const ASSET_MAX_BYTES = 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
ipcMain.handle(
  "codexpp:read-tweak-asset",
  (_e, tweakDir: string, relPath: string) => {
    const fs = require("node:fs") as typeof import("node:fs");
    const dir = resolve(tweakDir);
    if (!dir.startsWith(TWEAKS_DIR + "/")) {
      throw new Error("tweakDir outside tweaks dir");
    }
    const full = resolve(dir, relPath);
    if (!full.startsWith(dir + "/")) {
      throw new Error("path traversal");
    }
    const stat = fs.statSync(full);
    if (stat.size > ASSET_MAX_BYTES) {
      throw new Error(`asset too large (${stat.size} > ${ASSET_MAX_BYTES})`);
    }
    const ext = full.slice(full.lastIndexOf(".")).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
    const buf = fs.readFileSync(full);
    return `data:${mime};base64,${buf.toString("base64")}`;
  },
);

// Sandboxed preload can't write logs to disk; forward to us via IPC.
ipcMain.on("codexpp:preload-log", (_e, level: "info" | "warn" | "error", msg: string) => {
  const lvl = level === "error" || level === "warn" ? level : "info";
  try {
    appendCappedLog(join(LOG_DIR, "preload.log"), `[${new Date().toISOString()}] [${lvl}] ${msg}\n`);
  } catch {}
});

// Sandbox-safe filesystem ops for renderer-scope tweaks. Each tweak gets
// a sandboxed dir under userRoot/tweak-data/<id>. Renderer side calls these
// over IPC instead of using Node fs directly.
ipcMain.handle("codexpp:tweak-fs", (_e, op: string, id: string, p: string, c?: string) => {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error("bad tweak id");
  if (p.includes("..")) throw new Error("path traversal");
  const dir = join(userRoot!, "tweak-data", id);
  mkdirSync(dir, { recursive: true });
  const full = join(dir, p);
  const fs = require("node:fs") as typeof import("node:fs");
  switch (op) {
    case "read": return fs.readFileSync(full, "utf8");
    case "write": return fs.writeFileSync(full, c ?? "", "utf8");
    case "exists": return fs.existsSync(full);
    case "dataDir": return dir;
    default: throw new Error(`unknown op: ${op}`);
  }
});

ipcMain.handle("codexpp:user-paths", () => ({
  userRoot,
  runtimeDir,
  tweaksDir: TWEAKS_DIR,
  logDir: LOG_DIR,
}));

ipcMain.handle("codexpp:reveal", (_e, p: string) => {
  shell.openPath(p).catch(() => {});
});

ipcMain.handle("codexpp:open-external", (_e, url: string) => {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    throw new Error("only github.com links can be opened from tweak metadata");
  }
  shell.openExternal(parsed.toString()).catch(() => {});
});

ipcMain.handle("codexpp:open-cdp-url", (_e, url: string) => {
  const parsed = new URL(url);
  const isLocalHttp =
    parsed.protocol === "http:" &&
    ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) &&
    (parsed.pathname === "/json/list" || parsed.pathname === "/json/version");
  if (!isLocalHttp) {
    throw new Error("only local CDP /json/list and /json/version URLs can be opened");
  }
  shell.openExternal(parsed.toString()).catch(() => {});
});

ipcMain.handle("codexpp:copy-text", (_e, text: string) => {
  clipboard.writeText(String(text));
  return true;
});

// Manual force-reload trigger from the renderer (e.g. the "Force Reload"
// button on our injected Tweaks page). Bypasses the watcher debounce.
ipcMain.handle("codexpp:reload-tweaks", () => {
  reloadTweaks("manual", tweakLifecycleDeps);
  return { at: Date.now(), count: tweakState.discovered.length };
});

// 4. Filesystem watcher → debounced reload + broadcast.
//    We watch the tweaks dir for any change. On the first tick of inactivity
//    we stop main-side tweaks, clear their cached modules, re-discover, then
//    restart and broadcast `codexpp:tweaks-changed` to every renderer so it
//    can re-init its host.
const RELOAD_DEBOUNCE_MS = 250;
let reloadTimer: NodeJS.Timeout | null = null;
function scheduleReload(reason: string): void {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    reloadTweaks(reason, tweakLifecycleDeps);
  }, RELOAD_DEBOUNCE_MS);
}

try {
  const watcher = chokidar.watch(TWEAKS_DIR, {
    ignoreInitial: true,
    // Wait for files to settle before triggering — guards against partially
    // written tweak files during editor saves / git checkouts.
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    // Avoid eating CPU on huge node_modules trees inside tweak folders.
    ignored: (p) => p.includes(`${TWEAKS_DIR}/`) && /\/node_modules\//.test(p),
  });
  watcher.on("all", (event, path) => scheduleReload(`${event} ${path}`));
  watcher.on("error", (e) => log("warn", "watcher error:", e));
  log("info", "watching", TWEAKS_DIR);
  app.on("will-quit", () => watcher.close().catch(() => {}));
} catch (e) {
  log("error", "failed to start watcher:", e);
}

// --- helpers ---

function loadAllMainTweaks(): void {
  try {
    tweakState.discovered = discoverTweaks(TWEAKS_DIR);
    log(
      "info",
      `discovered ${tweakState.discovered.length} tweak(s):`,
      tweakState.discovered.map((t) => t.manifest.id).join(", "),
    );
  } catch (e) {
    log("error", "tweak discovery failed:", e);
    tweakState.discovered = [];
  }

  syncMcpServersFromEnabledTweaks();

  for (const t of tweakState.discovered) {
    if (!isMainProcessTweakScope(t.manifest.scope)) continue;
    if (!isTweakEnabled(t.manifest.id)) {
      log("info", `skipping disabled main tweak: ${t.manifest.id}`);
      continue;
    }
    try {
      const mod = require(t.entry);
      const tweak = mod.default ?? mod;
      if (typeof tweak?.start === "function") {
        const storage = createDiskStorage(userRoot!, t.manifest.id);
        tweak.start({
          manifest: t.manifest,
          process: "main",
          log: makeLogger(t.manifest.id),
          storage,
          ipc: makeMainIpc(t.manifest.id),
          fs: makeMainFs(t.manifest.id),
          codex: makeCodexApi(),
        });
        tweakState.loadedMain.set(t.manifest.id, {
          stop: tweak.stop,
          storage,
        });
        log("info", `started main tweak: ${t.manifest.id}`);
      }
    } catch (e) {
      log("error", `tweak ${t.manifest.id} failed to start:`, e);
    }
  }
}

function syncMcpServersFromEnabledTweaks(): void {
  try {
    const result = syncManagedMcpServers({
      configPath: CODEX_CONFIG_FILE,
      tweaks: tweakState.discovered.filter((t) => isTweakEnabled(t.manifest.id)),
    });
    if (result.changed) {
      log("info", `synced Codex MCP config: ${result.serverNames.join(", ") || "none"}`);
    }
    if (result.skippedServerNames.length > 0) {
      log(
        "info",
        `skipped Codex++ managed MCP server(s) already configured by user: ${result.skippedServerNames.join(", ")}`,
      );
    }
  } catch (e) {
    log("warn", "failed to sync Codex MCP config:", e);
  }
}

function stopAllMainTweaks(): void {
  for (const [id, t] of tweakState.loadedMain) {
    try {
      t.stop?.();
      t.storage.flush();
      log("info", `stopped main tweak: ${id}`);
    } catch (e) {
      log("warn", `stop failed for ${id}:`, e);
    }
  }
  tweakState.loadedMain.clear();
}

function clearTweakModuleCache(): void {
  // Drop any cached require() entries that live inside the tweaks dir so a
  // re-require on next load picks up fresh code. We do prefix matching on
  // the resolved tweaks dir.
  const prefix = TWEAKS_DIR + (TWEAKS_DIR.endsWith("/") ? "" : "/");
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(prefix)) delete require.cache[key];
  }
}

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

async function ensureCodexPlusPlusUpdateCheck(force = false): Promise<CodexPlusPlusUpdateCheck> {
  const state = readState();
  const cached = state.codexPlusPlus?.updateCheck;
  if (
    !force &&
    cached &&
    cached.currentVersion === CODEX_PLUSPLUS_VERSION &&
    Date.now() - Date.parse(cached.checkedAt) < UPDATE_CHECK_INTERVAL_MS
  ) {
    return cached;
  }

  const release = await fetchLatestRelease(CODEX_PLUSPLUS_REPO, CODEX_PLUSPLUS_VERSION);
  const latestVersion = release.latestTag ? normalizeVersion(release.latestTag) : null;
  const check: CodexPlusPlusUpdateCheck = {
    checkedAt: new Date().toISOString(),
    currentVersion: CODEX_PLUSPLUS_VERSION,
    latestVersion,
    releaseUrl: release.releaseUrl ?? `https://github.com/${CODEX_PLUSPLUS_REPO}/releases`,
    releaseNotes: release.releaseNotes,
    updateAvailable: latestVersion
      ? compareVersions(normalizeVersion(latestVersion), CODEX_PLUSPLUS_VERSION) > 0
      : false,
    ...(release.error ? { error: release.error } : {}),
  };
  state.codexPlusPlus ??= {};
  state.codexPlusPlus.updateCheck = check;
  writeState(state);
  return check;
}

async function ensureTweakUpdateCheck(t: DiscoveredTweak): Promise<void> {
  const id = t.manifest.id;
  const repo = t.manifest.githubRepo;
  const state = readState();
  const cached = state.tweakUpdateChecks?.[id];
  if (
    cached &&
    cached.repo === repo &&
    cached.currentVersion === t.manifest.version &&
    Date.now() - Date.parse(cached.checkedAt) < UPDATE_CHECK_INTERVAL_MS
  ) {
    return;
  }

  const next = await fetchLatestRelease(repo, t.manifest.version);
  const latestVersion = next.latestTag ? normalizeVersion(next.latestTag) : null;
  const check: TweakUpdateCheck = {
    checkedAt: new Date().toISOString(),
    repo,
    currentVersion: t.manifest.version,
    latestVersion,
    latestTag: next.latestTag,
    releaseUrl: next.releaseUrl,
    updateAvailable: latestVersion
      ? compareVersions(latestVersion, normalizeVersion(t.manifest.version)) > 0
      : false,
    ...(next.error ? { error: next.error } : {}),
  };
  state.tweakUpdateChecks ??= {};
  state.tweakUpdateChecks[id] = check;
  writeState(state);
}

async function fetchLatestRelease(
  repo: string,
  currentVersion: string,
): Promise<{ latestTag: string | null; releaseUrl: string | null; releaseNotes: string | null; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: {
          "Accept": "application/vnd.github+json",
          "User-Agent": `codex-plusplus/${currentVersion}`,
        },
        signal: controller.signal,
      });
      if (res.status === 404) {
        return { latestTag: null, releaseUrl: null, releaseNotes: null, error: "no GitHub release found" };
      }
      if (!res.ok) {
        return { latestTag: null, releaseUrl: null, releaseNotes: null, error: `GitHub returned ${res.status}` };
      }
      const body = await res.json() as { tag_name?: string; html_url?: string; body?: string };
      return {
        latestTag: body.tag_name ?? null,
        releaseUrl: body.html_url ?? `https://github.com/${repo}/releases`,
        releaseNotes: body.body ?? null,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    return {
      latestTag: null,
      releaseUrl: null,
      releaseNotes: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function normalizeVersion(v: string): string {
  return v.trim().replace(/^v/i, "");
}

function compareVersions(a: string, b: string): number {
  const av = VERSION_RE.exec(a);
  const bv = VERSION_RE.exec(b);
  if (!av || !bv) return 0;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(av[i]) - Number(bv[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

function broadcastReload(): void {
  const payload = {
    at: Date.now(),
    tweaks: tweakState.discovered.map((t) => t.manifest.id),
  };
  for (const wc of webContents.getAllWebContents()) {
    try {
      wc.send("codexpp:tweaks-changed", payload);
    } catch (e) {
      log("warn", "broadcast send failed:", e);
    }
  }
}

function makeLogger(scope: string) {
  return {
    debug: (...a: unknown[]) => log("info", `[${scope}]`, ...a),
    info: (...a: unknown[]) => log("info", `[${scope}]`, ...a),
    warn: (...a: unknown[]) => log("warn", `[${scope}]`, ...a),
    error: (...a: unknown[]) => log("error", `[${scope}]`, ...a),
  };
}

function makeMainIpc(id: string) {
  const ch = (c: string) => `codexpp:${id}:${c}`;
  return {
    on: (c: string, h: (...args: unknown[]) => void) => {
      const wrapped = (_e: unknown, ...args: unknown[]) => h(...args);
      ipcMain.on(ch(c), wrapped);
      return () => ipcMain.removeListener(ch(c), wrapped as never);
    },
    send: (_c: string) => {
      throw new Error("ipc.send is renderer→main; main side uses handle/on");
    },
    invoke: (_c: string) => {
      throw new Error("ipc.invoke is renderer→main; main side uses handle");
    },
    handle: (c: string, handler: (...args: unknown[]) => unknown) => {
      ipcMain.handle(ch(c), (_e: unknown, ...args: unknown[]) => handler(...args));
    },
  };
}

function makeMainFs(id: string) {
  const dir = join(userRoot!, "tweak-data", id);
  mkdirSync(dir, { recursive: true });
  const fs = require("node:fs/promises") as typeof import("node:fs/promises");
  return {
    dataDir: dir,
    read: (p: string) => fs.readFile(join(dir, p), "utf8"),
    write: (p: string, c: string) => fs.writeFile(join(dir, p), c, "utf8"),
    exists: async (p: string) => {
      try {
        await fs.access(join(dir, p));
        return true;
      } catch {
        return false;
      }
    },
  };
}

function makeCodexApi() {
  return {
    createBrowserView: async (opts: CodexCreateViewOptions) => {
      const services = getCodexWindowServices();
      const windowManager = services?.windowManager;
      if (!services || !windowManager?.registerWindow) {
        throw new Error(
          "Codex embedded view services are not available. Reinstall Codex++ 0.1.1 or later.",
        );
      }

      const route = normalizeCodexRoute(opts.route);
      const hostId = opts.hostId || "local";
      const appearance = opts.appearance || "secondary";
      const view = new BrowserView({
        webPreferences: {
          preload: windowManager.options?.preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          spellcheck: false,
          devTools: windowManager.options?.allowDevtools,
        },
      });
      const windowLike = makeWindowLikeForView(view);
      windowManager.registerWindow(windowLike, hostId, false, appearance);
      services.getContext?.(hostId)?.registerWindow?.(windowLike);
      await view.webContents.loadURL(codexAppUrl(route, hostId));
      return view;
    },

    createWindow: async (opts: CodexCreateWindowOptions) => {
      const services = getCodexWindowServices();
      if (!services) {
        throw new Error(
          "Codex window services are not available. Reinstall Codex++ 0.1.1 or later.",
        );
      }

      const route = normalizeCodexRoute(opts.route);
      const hostId = opts.hostId || "local";
      const parent = typeof opts.parentWindowId === "number"
        ? BrowserWindow.fromId(opts.parentWindowId)
        : BrowserWindow.getFocusedWindow();
      const createWindow = services.windowManager?.createWindow;

      let win: Electron.BrowserWindow | null | undefined;
      if (typeof createWindow === "function") {
        win = await createWindow.call(services.windowManager, {
          initialRoute: route,
          hostId,
          show: opts.show !== false,
          appearance: opts.appearance || "secondary",
          parent,
        });
      } else if (hostId === "local" && typeof services.createFreshLocalWindow === "function") {
        win = await services.createFreshLocalWindow(route);
      } else if (typeof services.ensureHostWindow === "function") {
        win = await services.ensureHostWindow(hostId);
      }

      if (!win || win.isDestroyed()) {
        throw new Error("Codex did not return a window for the requested route");
      }

      if (opts.bounds) {
        win.setBounds(opts.bounds);
      }
      if (parent && !parent.isDestroyed()) {
        try {
          win.setParentWindow(parent);
        } catch {}
      }
      if (opts.show !== false) {
        win.show();
      }

      return {
        windowId: win.id,
        webContentsId: win.webContents.id,
      };
    },
  };
}

function makeWindowLikeForView(view: Electron.BrowserView): CodexWindowLike {
  const viewBounds = () => view.getBounds();
  return {
    id: view.webContents.id,
    webContents: view.webContents,
    on: (event: "closed", listener: () => void) => {
      if (event === "closed") {
        view.webContents.once("destroyed", listener);
      } else {
        view.webContents.on(event, listener);
      }
      return view;
    },
    once: (event: string, listener: (...args: unknown[]) => void) => {
      view.webContents.once(event as "destroyed", listener);
      return view;
    },
    off: (event: string, listener: (...args: unknown[]) => void) => {
      view.webContents.off(event as "destroyed", listener);
      return view;
    },
    removeListener: (event: string, listener: (...args: unknown[]) => void) => {
      view.webContents.removeListener(event as "destroyed", listener);
      return view;
    },
    isDestroyed: () => view.webContents.isDestroyed(),
    isFocused: () => view.webContents.isFocused(),
    focus: () => view.webContents.focus(),
    show: () => {},
    hide: () => {},
    getBounds: viewBounds,
    getContentBounds: viewBounds,
    getSize: () => {
      const b = viewBounds();
      return [b.width, b.height];
    },
    getContentSize: () => {
      const b = viewBounds();
      return [b.width, b.height];
    },
    setTitle: () => {},
    getTitle: () => "",
    setRepresentedFilename: () => {},
    setDocumentEdited: () => {},
    setWindowButtonVisibility: () => {},
  };
}

function codexAppUrl(route: string, hostId: string): string {
  const url = new URL("app://-/index.html");
  url.searchParams.set("hostId", hostId);
  if (route !== "/") url.searchParams.set("initialRoute", route);
  return url.toString();
}

function getCodexWindowServices(): CodexWindowServices | null {
  const services = (globalThis as unknown as Record<string, unknown>)[CODEX_WINDOW_SERVICES_KEY];
  return services && typeof services === "object" ? (services as CodexWindowServices) : null;
}

function normalizeCodexRoute(route: string): string {
  if (typeof route !== "string" || !route.startsWith("/")) {
    throw new Error("Codex route must be an absolute app route");
  }
  if (route.includes("://") || route.includes("\n") || route.includes("\r")) {
    throw new Error("Codex route must not include a protocol or control characters");
  }
  return route;
}

// Touch BrowserWindow to keep its import — older Electron lint rules.
void BrowserWindow;
