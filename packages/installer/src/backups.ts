import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readFileInAsar, readHeaderHash } from "./asar.js";
import type { InstallerState } from "./state.js";

interface PrepareBackupSetOptions {
  appRoot: string;
  asarPath: string;
  backupDir: string;
  previousState: InstallerState | null;
}

/**
 * Keep the global backup set aligned with the app installation being patched.
 * A repeated install of an already-patched app must retain its pristine backup;
 * a new app build must replace backups from the previous build.
 */
export function prepareBackupSet({
  appRoot,
  asarPath,
  backupDir,
  previousState,
}: PrepareBackupSetOptions): boolean {
  mkdirSync(backupDir, { recursive: true });

  const backupAsar = join(backupDir, "app.asar");
  const currentHash = readHeaderHash(asarPath).headerHash;
  const sameInstall = previousState?.appRoot === appRoot;
  const currentIsPatched = hasCodexPlusPlusMarker(asarPath);

  if (sameInstall && currentHash === previousState.patchedAsarHash) {
    const backupHash = readBackupHash(backupAsar);
    if (backupHash !== previousState.originalAsarHash) {
      throw new Error(
        "Codex++ backup does not match the patched app. Restore or reinstall " +
          "Codex before running install again; the current app cannot be safely backed up.",
      );
    }
    return false;
  }

  if (currentIsPatched) {
    throw new Error(
      "Codex is already patched, but it does not match the saved installer state. " +
        "Restore or reinstall Codex before running install again.",
    );
  }

  const backupHash = readBackupHash(backupAsar);
  if (
    sameInstall &&
    currentHash === previousState.originalAsarHash &&
    backupHash === previousState.originalAsarHash
  ) {
    return false;
  }

  const rotated = readdirSync(backupDir).length > 0;
  if (rotated) {
    rmSync(backupDir, { recursive: true, force: true });
    mkdirSync(backupDir, { recursive: true });
  }
  return rotated;
}

function hasCodexPlusPlusMarker(asarPath: string): boolean {
  const pkg = JSON.parse(readFileInAsar(asarPath, "package.json").toString()) as {
    __codexpp?: unknown;
  };
  return pkg.__codexpp !== undefined;
}

function readBackupHash(backupAsar: string): string | null {
  if (!existsSync(backupAsar)) return null;
  try {
    return readHeaderHash(backupAsar).headerHash;
  } catch {
    return null;
  }
}
