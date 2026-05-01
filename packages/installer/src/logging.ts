import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";
import { userPaths } from "./paths.js";
import { targetUserHome } from "./ownership.js";

export const MAX_LOG_BYTES = 10 * 1024 * 1024;

export function capLogFile(path: string, maxBytes = MAX_LOG_BYTES): void {
  try {
    if (!existsSync(path)) return;
    const size = statSync(path).size;
    if (size <= maxBytes) return;
    const existing = readFileSync(path);
    writeFileSync(path, existing.subarray(Math.max(0, existing.byteLength - maxBytes)));
  } catch {
    // Logging cleanup is best-effort and must not break installer commands.
  }
}

export function capKnownLogFiles(): void {
  const paths = userPaths();
  for (const file of ["main.log", "preload.log", "loader.log"]) {
    capLogFile(join(paths.logDir, file));
  }
  if (platform() === "darwin") {
    capLogFile(join(targetUserHome(), "Library", "Logs", "codex-plusplus-watcher.log"));
  }
}
