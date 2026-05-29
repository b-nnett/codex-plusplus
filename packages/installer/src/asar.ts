/**
 * asar helpers. We don't crack open the binary header ourselves; we use
 * @electron/asar which is well-maintained and matches the format Electron expects.
 *
 * The integrity hash Electron checks is the SHA-256 of the asar **header JSON**
 * (the leading length-prefixed JSON blob), not the entire file. @electron/asar
 * exposes this via `getRawHeader()`.
 */
import asar from "@electron/asar";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  cpSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export interface AsarHeaderInfo {
  /** SHA-256 hex of the header JSON bytes Electron hashes. */
  headerHash: string;
  /** The decoded header object (the directory tree). */
  header: unknown;
}

export function readHeaderHash(asarPath: string): AsarHeaderInfo {
  // getRawHeader returns { header, headerString, headerSize }
  const raw = (asar as unknown as {
    getRawHeader: (p: string) => { header: unknown; headerString: string };
  }).getRawHeader(asarPath);
  const hash = createHash("sha256").update(raw.headerString).digest("hex");
  return { headerHash: hash, header: raw.header };
}

/**
 * Extract → mutate via callback → repack. The callback receives a temp dir
 * containing the unpacked asar contents and may modify files in place.
 * Returns the new header hash post-repack.
 *
 * We must preserve the original asar's unpacked-file set EXACTLY: marking a
 * file `unpacked: true` in the header tells Electron to read it from
 * `app.asar.unpacked/` instead of inline. If we accidentally mark a file
 * unpacked that isn't actually present in the .unpacked/ sibling dir,
 * `require` will fail with MODULE_NOT_FOUND.
 */
export async function patchAsar(
  asarPath: string,
  mutate: (extractedDir: string) => Promise<void> | void,
): Promise<AsarHeaderInfo> {
  const work = mkdtempSync(join(tmpdir(), "cxx-asar-"));
  const extractDir = join(work, "src");
  const outAsar = join(work, "app.asar");

  // Snapshot which files were unpacked in the ORIGINAL asar before we touch
  // anything; we'll feed that exact set back during repack.
  const originalUnpackedPaths = collectUnpackedPaths(asarPath);

  try {
    asar.extractAll(asarPath, extractDir);
    await mutate(extractDir);

    await createPackagePreservingUnpacked(extractDir, outAsar, originalUnpackedPaths);

    // Atomic-ish replace: write next to the target, then rename. This prevents
    // a denied write (e.g. macOS App Management TCC) from leaving the bundle
    // without an app.asar. Both the staging file and target must be on the
    // same filesystem for `rename` to be atomic.
    const stagingPath = `${asarPath}.codexpp-new`;
    try {
      cpSync(outAsar, stagingPath);
    } catch (e) {
      throw annotatePermError(e, asarPath);
    }
    try {
      renameSync(stagingPath, asarPath);
    } catch (e) {
      try { unlinkSync(stagingPath); } catch { /* best effort */ }
      throw annotatePermError(e, asarPath);
    }
    asar.uncache(asarPath);
    return readHeaderHash(asarPath);
  } finally {
    await cleanupTempTree(work);
  }
}

export async function cleanupTempTree(path: string): Promise<void> {
  const retryDelaysMs = [25, 75, 150, 300, 600];
  for (const waitMs of [0, ...retryDelaysMs]) {
    if (waitMs > 0) await delay(waitMs);
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (e) {
      if (!isTransientCleanupError(e)) return;
    }
  }
}

function isTransientCleanupError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOTEMPTY" || code === "EBUSY" || code === "EPERM" || code === "EACCES";
}

/**
 * Walk the existing asar header and produce a brace-expansion glob naming
 * exactly the unpacked files. @electron/asar's `unpackDir` option recursively
 * unpacks entire directories, which promotes package metadata (`package.json`,
 * `LICENSE`, etc.) to unpacked even when those files are not physically present
 * in `.unpacked/`.
 *
 * Why this matters: if the header marks a file `unpacked: true` but the file
 * isn't on disk under `app.asar.unpacked/`, Electron's resolver throws
 * MODULE_NOT_FOUND when something requires the module — exactly the failure
 * mode we hit before this fix.
 */
async function createPackagePreservingUnpacked(
  extractDir: string,
  outAsar: string,
  unpackedPaths: Set<string>,
): Promise<void> {
  if (unpackedPaths.size === 0) {
    await asar.createPackageWithOptions(extractDir, outAsar, {
      globOptions: { dot: true },
    });
    return;
  }

  const streams = collectAsarStreams(extractDir, unpackedPaths);
  await asar.createPackageFromStreams(outAsar, streams);
}

function collectAsarStreams(
  root: string,
  unpackedPaths: Set<string>,
): Parameters<typeof asar.createPackageFromStreams>[1] {
  const streams: Parameters<typeof asar.createPackageFromStreams>[1] = [];
  collectAsarStreamsInto(root, root, unpackedPaths, streams);
  return streams;
}

function collectAsarStreamsInto(
  root: string,
  current: string,
  unpackedPaths: Set<string>,
  streams: Parameters<typeof asar.createPackageFromStreams>[1],
): void {
  const entries = readdirSync(current).sort((a, b) => a.localeCompare(b));
  for (const name of entries) {
    const full = join(current, name);
    const stat = lstatSync(full);
    const archivePath = toArchivePath(root, full);
    if (!archivePath) continue;

    if (stat.isDirectory()) {
      streams.push({ type: "directory", path: archivePath, unpacked: false });
      collectAsarStreamsInto(root, full, unpackedPaths, streams);
      continue;
    }

    const unpacked = unpackedPaths.has(archivePath);
    if (stat.isSymbolicLink()) {
      streams.push({
        type: "link",
        path: archivePath,
        streamGenerator: () => createReadStream(full),
        unpacked,
        stat,
        symlink: readlinkSync(full),
      });
      continue;
    }

    if (stat.isFile()) {
      streams.push({
        type: "file",
        path: archivePath,
        streamGenerator: () => createReadStream(full),
        unpacked,
        stat,
      });
    }
  }
}

function toArchivePath(root: string, full: string): string {
  return relative(root, full).split(sep).join("/");
}

function collectUnpackedPaths(asarPath: string): Set<string> {
  const sibling = `${asarPath}.unpacked`;
  if (!existsSync(sibling)) return new Set();
  const raw = (asar as unknown as {
    getRawHeader: (p: string) => { header: { files?: Record<string, unknown> } };
  }).getRawHeader(asarPath);
  const paths: string[] = [];
  walk(raw.header as Record<string, unknown>, "", paths);
  return new Set(paths.map((path) => path.replace(/^\//, "")));
}

function walk(node: Record<string, unknown>, prefix: string, out: string[]): void {
  const files = (node as { files?: Record<string, Record<string, unknown>> }).files;
  if (!files) return;
  for (const [name, val] of Object.entries(files)) {
    const p = `${prefix}/${name}`;
    const isDir = !!(val as { files?: unknown }).files;
    if (!isDir && (val as { unpacked?: boolean }).unpacked) out.push(p);
    if (isDir) walk(val, p, out);
  }
}

/** Backup helper: copy `from` to `to` if `to` doesn't already exist. */
export function backupOnce(from: string, to: string): void {
  if (!existsSync(to)) cpSync(from, to, { recursive: true });
}

/** Read a file inside the asar without extracting the whole thing. */
export function readFileInAsar(asarPath: string, relPath: string): Buffer {
  return asar.extractFile(asarPath, relPath) as Buffer;
}

/**
 * Wrap EPERM/EACCES errors writing into an app bundle with an actionable
 * message about macOS App Management permission. Other errors pass through.
 */
function annotatePermError(e: unknown, target: string): Error {
  const err = e as NodeJS.ErrnoException;
  if (err && (err.code === "EPERM" || err.code === "EACCES") && /\/Applications\//.test(target)) {
    const msg =
      `Permission denied writing to ${target}.\n\n` +
      `macOS App Management is blocking modification of /Applications/Codex.app.\n` +
      `Run "codexplusplus repair" in your terminal.\n\n` +
      `Original error: ${err.message}`;
    const wrapped = new Error(msg);
    (wrapped as NodeJS.ErrnoException).code = err.code;
    return wrapped;
  }
  return err instanceof Error ? err : new Error(String(err));
}
