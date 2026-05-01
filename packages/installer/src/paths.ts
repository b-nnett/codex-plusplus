import { platform } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { chownForTargetUser, targetUserHome } from "./ownership.js";

/**
 * User-data directory layout. Picked per platform conventions; created lazily.
 *
 *   <root>/
 *     runtime/        — extracted runtime bundle (loader pulls from here)
 *     tweaks/         — user tweaks
 *     backup/         — original Codex.app artifacts (asar, plist, framework binary)
 *     config.json     — installer state + per-tweak enable flags
 *     log/            — runtime + installer logs
 *     state.json      — installer state (paths, hashes, version installed against)
 */
export interface UserPaths {
  root: string;
  runtime: string;
  tweaks: string;
  backup: string;
  configFile: string;
  stateFile: string;
  updateModeFile: string;
  binDir: string;
  logDir: string;
}

export function userPaths(): UserPaths {
  const root = userRoot();
  const paths: UserPaths = {
    root,
    runtime: join(root, "runtime"),
    tweaks: join(root, "tweaks"),
    backup: join(root, "backup"),
    configFile: join(root, "config.json"),
    stateFile: join(root, "state.json"),
    updateModeFile: join(root, "update-mode.json"),
    binDir: join(root, "bin"),
    logDir: join(root, "log"),
  };
  return paths;
}

export function ensureUserPaths(): UserPaths {
  const p = userPaths();
  for (const dir of [p.root, p.runtime, p.tweaks, p.backup, p.binDir, p.logDir]) {
    mkdirSync(dir, { recursive: true });
    chownForTargetUser(dir);
  }
  return p;
}

function userRoot(): string {
  if (process.env.CODEX_PLUSPLUS_HOME) return process.env.CODEX_PLUSPLUS_HOME;

  const home = targetUserHome();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "codex-plusplus");
    case "win32":
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "codex-plusplus");
    default:
      return join(
        process.env.XDG_DATA_HOME ?? join(home, ".local", "share"),
        "codex-plusplus",
      );
  }
}
