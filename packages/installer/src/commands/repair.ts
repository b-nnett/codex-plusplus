import kleur from "kleur";
import { existsSync, readFileSync, statSync } from "node:fs";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { install, readCodexVersion, stageAssets } from "./install.js";
import { ensureUserPaths } from "../paths.js";
import { readState, writeState } from "../state.js";
import { locateCodex } from "../platform.js";
import { readHeaderHash } from "../asar.js";
import { CODEX_PLUSPLUS_VERSION, compareSemver } from "../version.js";
import { installWatcher } from "../watcher.js";
import { clearUpdateMode, isUpdateModeFresh, readUpdateMode, writeUpdateMode } from "../update-mode.js";
import { findSourceRoot } from "../source-root.js";
import {
  isCodexRunning,
  openCodex,
  promptRestartCodexAfterPatch,
  promptRestartCodexAfterRuntimeUpdate,
  promptRestartCodexToRepatch,
  showCodexUpdateDetectedNotification,
  showUpdateModePausedAlert,
} from "../alerts.js";
import { fileURLToPath } from "node:url";

interface Opts {
  app?: string;
  quiet?: boolean;
  force?: boolean;
  localSigning?: boolean;
  watcher?: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = findSourceRoot(here);
const SETTLE_TIMEOUT_MS = 120_000;
const WATCHER_SETTLE_TIMEOUT_MS = 15 * 60_000;
const SETTLE_SAMPLE_MS = 2_000;
const SETTLE_STABLE_SAMPLES = 2;
const WATCHER_RETRY_NOTICE_MS = 30_000;

/**
 * `repair` is essentially `install` rerun, but it preserves the user's
 * config + tweaks (which `install` already does) and refreshes the watcher
 * unless the prior install explicitly had no watcher. We re-derive everything from the
 * current Codex.app on disk; the new asar/plist/framework hashes will
 * differ from those in `state.json` after a Sparkle update, so we just
 * overwrite state.
 */
export async function repair(opts: Opts = {}): Promise<void> {
  const paths = ensureUserPaths();
  const state = readState(paths.stateFile);
  if (!state) {
    if (!opts.quiet) {
      console.warn(
        kleur.yellow("No prior install state found. Running fresh install instead."),
      );
    }
  }

  let settledBeforeHashCheck = false;
  if (state && !opts.force) {
    announceCodexUpdateDetected(paths.updateModeFile, opts.app ?? state.appRoot);
    notifyUpdateModePaused(paths.updateModeFile, opts.app ?? state.appRoot);
    await waitForMacAppUpdateToSettle(opts.app ?? state.appRoot, settleOptions(opts, paths.updateModeFile));
    settledBeforeHashCheck = true;
    const codex = locateCodex(opts.app ?? state.appRoot);
    const updateMode = readUpdateMode(paths.updateModeFile);
    if (updateMode) {
      const codexVersion = readCodexVersion(codex.metaPath);
      if (codexVersion === updateMode.codexVersion && isUpdateModeFresh(updateMode)) {
        const watcher = refreshWatcher(state.watcher, codex.appRoot, opts.quiet);
        writeState(paths.stateFile, { ...state, watcher, sourceRoot });
        if (!updateMode.notifiedAt) {
          showUpdateModePausedAlert(codex.appRoot, codexVersion);
          writeUpdateMode(paths.updateModeFile, {
            ...updateMode,
            notifiedAt: new Date().toISOString(),
          });
        }
        if (!opts.quiet) {
          console.log(kleur.yellow("Codex update mode is active; leaving signed app unpatched."));
        }
        return;
      }
      if (codexVersion === updateMode.codexVersion && !opts.quiet) {
        console.log(kleur.yellow("Codex update mode is stale; clearing it and repairing Codex++."));
      }
      clearUpdateMode(paths.updateModeFile);
    }
    const { headerHash } = readHeaderHash(codex.asarPath);
    if (headerHash === state.patchedAsarHash) {
      const watcher = refreshWatcher(state.watcher, codex.appRoot, opts.quiet);
      if (compareSemver(CODEX_PLUSPLUS_VERSION, state.version) > 0) {
        if (!isAutoUpdateEnabled(paths.configFile)) {
          if (!opts.quiet) console.log(kleur.yellow("Codex++ auto-update is disabled."));
          return;
        }
        stageAssets(paths.runtime);
        writeState(paths.stateFile, {
          ...state,
          watcher,
          version: CODEX_PLUSPLUS_VERSION,
          sourceRoot,
          runtimeUpdatedAt: new Date().toISOString(),
        });
        if (!opts.quiet) {
          console.log(
            kleur.green(`Updated Codex++ runtime ${state.version} → ${CODEX_PLUSPLUS_VERSION}.`),
          );
        }
        if (isCodexRunning(codex.appRoot)) {
          promptRestartCodexAfterRuntimeUpdate(codex.appRoot, CODEX_PLUSPLUS_VERSION);
        }
        return;
      }
      writeState(paths.stateFile, { ...state, watcher, sourceRoot });
      if (!opts.quiet) console.log(kleur.green("Patch already intact."));
      return;
    }
  }

  if (!settledBeforeHashCheck) {
    await waitForMacAppUpdateToSettle(opts.app ?? state?.appRoot, settleOptions(opts, paths.updateModeFile));
  }

  let codexWasRunning = false;
  let repairedAppRoot: string | null = null;
  let reopenAfterRepair = false;
  try {
    const codex = locateCodex(opts.app ?? state?.appRoot);
    repairedAppRoot = codex.appRoot;
    codexWasRunning = isCodexRunning(codex.appRoot);
    if (shouldPatchWhileCodexRuns({
      codexWasRunning,
      watcherRepair: isWatcherRepair(opts),
      platform: process.platform,
    })) {
      if (!opts.quiet) {
        console.log(kleur.yellow("Codex is running; patching the app on disk and prompting for restart after repair."));
      }
    } else if (codexWasRunning && process.platform === "darwin" && promptRestartCodexToRepatch(codex.appRoot)) {
      reopenAfterRepair = true;
      codexWasRunning = false;
    } else if (codexWasRunning && process.platform === "darwin") {
      if (!opts.quiet) {
        console.log(kleur.yellow("Repair postponed. Codex is still running without the updated Codex++ patch."));
      }
      return;
    }
  } catch {
    // install() will surface the real locate/preflight error below.
  }

  await install({
    app: opts.app ?? state?.appRoot,
    fuse: state?.fuseFlipped ?? true,
    resign: state?.resigned ?? true,
    localSigning: opts.localSigning === true,
    watcher: state?.watcher === "none" ? false : true,
    watcherKind: state?.watcher,
    quiet: opts.quiet,
  });
  if (reopenAfterRepair && repairedAppRoot) {
    openCodex(repairedAppRoot, { detached: true, delayMs: 1_000 });
  } else if (codexWasRunning && repairedAppRoot) {
    promptRestartCodexAfterPatch(repairedAppRoot);
  }
  if (!opts.quiet) console.log(kleur.green("✓ Repair complete."));
}

function announceCodexUpdateDetected(updateModeFile: string, appRoot: string): void {
  const updateMode = readUpdateMode(updateModeFile);
  if (!updateMode || updateMode.patchingNotifiedAt) return;

  try {
    const codex = locateCodex(appRoot);
    const codexVersion = readCodexVersion(codex.metaPath);
    if (!codexVersion || codexVersion === updateMode.codexVersion) return;
    showCodexUpdateDetectedNotification();
    writeUpdateMode(updateModeFile, {
      ...updateMode,
      patchingNotifiedAt: new Date().toISOString(),
    });
  } catch {
    // The app bundle may be mid-update. The settle wait below handles that path.
  }
}

function notifyUpdateModePaused(updateModeFile: string, fallbackAppRoot: string): void {
  const updateMode = readUpdateMode(updateModeFile);
  if (!updateMode || updateMode.notifiedAt || !isUpdateModeFresh(updateMode)) return;

  const appRoot = updateMode.appRoot || fallbackAppRoot;
  showUpdateModePausedAlert(appRoot, updateMode.codexVersion);
  writeUpdateMode(updateModeFile, {
    ...updateMode,
    notifiedAt: new Date().toISOString(),
  });
}

function isAutoUpdateEnabled(configFile: string): boolean {
  if (!existsSync(configFile)) return true;
  try {
    const config = JSON.parse(readFileSync(configFile, "utf8")) as {
      codexPlusPlus?: { autoUpdate?: boolean };
    };
    return config.codexPlusPlus?.autoUpdate !== false;
  } catch {
    return true;
  }
}

interface SettleOptions {
  quiet?: boolean;
  timeoutMs?: number;
  retryNoticeMs?: number;
}

function settleOptions(opts: Opts, updateModeFile: string): SettleOptions {
  const updateMode = readUpdateMode(updateModeFile);
  const watcherRetry = isWatcherRepair(opts) && updateMode !== null && isUpdateModeFresh(updateMode);
  return {
    quiet: opts.quiet,
    timeoutMs: watcherRetry ? WATCHER_SETTLE_TIMEOUT_MS : SETTLE_TIMEOUT_MS,
    retryNoticeMs: watcherRetry ? WATCHER_RETRY_NOTICE_MS : undefined,
  };
}

function isWatcherRepair(opts: Opts): boolean {
  return opts.watcher === true || process.env.CODEX_PLUSPLUS_WATCHER === "1";
}

export function shouldPatchWhileCodexRuns(opts: {
  codexWasRunning: boolean;
  watcherRepair: boolean;
  platform: NodeJS.Platform;
}): boolean {
  return opts.codexWasRunning && opts.watcherRepair && opts.platform === "darwin";
}

async function waitForMacAppUpdateToSettle(appRoot: string | undefined, opts: SettleOptions = {}): Promise<void> {
  if (platform() !== "darwin" || !appRoot) return;

  const paths = [
    join(appRoot, "Contents", "Info.plist"),
    join(appRoot, "Contents", "Resources", "app.asar"),
  ];

  let previous = bundleSnapshot(paths);
  let stableSamples = 0;
  let announced = previous.includes(":missing:");
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? SETTLE_TIMEOUT_MS;
  let lastRetryNotice = started;
  if (announced && !opts.quiet) {
    console.log(kleur.dim("Waiting for Codex.app update files to appear..."));
  }

  while (Date.now() - started < timeoutMs) {
    await delay(SETTLE_SAMPLE_MS);
    const snapshot = bundleSnapshot(paths);
    if (!snapshot.includes(":missing:") && snapshot === previous && patchInputsReadable(appRoot)) {
      stableSamples += 1;
      if (stableSamples >= SETTLE_STABLE_SAMPLES) return;
    } else {
      stableSamples = 0;
      previous = snapshot;
      if (!opts.quiet && !announced) {
        console.log(kleur.dim("Waiting for Codex.app update files to settle..."));
        announced = true;
      }
    }
    if (
      opts.retryNoticeMs &&
      !opts.quiet &&
      Date.now() - started > SETTLE_TIMEOUT_MS &&
      Date.now() - lastRetryNotice >= opts.retryNoticeMs
    ) {
      console.log(kleur.dim("Codex.app still appears to be updating; retrying repair shortly..."));
      lastRetryNotice = Date.now();
    }
  }
  const minutes = Math.max(1, Math.round(timeoutMs / 60_000));
  throw new Error(`Codex.app still appears to be updating after ${minutes}m; retry repair after the update finishes.`);
}

function bundleSnapshot(paths: string[]): string {
  return paths
    .map((p) => {
      try {
        const st = statSync(p);
        return `${p}:${st.size}:${st.mtimeMs}`;
      } catch {
        return `${p}:missing:0`;
      }
    })
    .join("|");
}

function patchInputsReadable(appRoot: string): boolean {
  try {
    const codex = locateCodex(appRoot);
    if (!readCodexVersion(codex.metaPath)) return false;
    readHeaderHash(codex.asarPath);
    return true;
  } catch {
    return false;
  }
}

function refreshWatcher(
  previous: NonNullable<ReturnType<typeof readState>>["watcher"],
  appRoot: string,
  quiet?: boolean,
): NonNullable<ReturnType<typeof readState>>["watcher"] {
  if (previous === "none") return previous;
  try {
    return installWatcher(appRoot);
  } catch (e) {
    if (!quiet) console.warn(kleur.yellow(`Watcher refresh failed: ${(e as Error).message}`));
    return previous;
  }
}
