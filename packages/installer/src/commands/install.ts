import kleur from "kleur";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync, unlinkSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { locateCodex, type CodexInstall } from "../platform.js";
import { ensureUserPaths } from "../paths.js";
import { backupOnce, patchAsar, readHeaderHash } from "../asar.js";
import { setIntegrity, getIntegrity } from "../integrity.js";
import { writeFuse } from "../fuses.js";
import { adHocSign, clearQuarantine, signatureInfo } from "../codesign.js";
import { readPlist } from "../plist.js";
import { writeState } from "../state.js";
import { installWatcher, type WatcherKind } from "../watcher.js";
import { CODEX_PLUSPLUS_VERSION } from "../version.js";
import { installDefaultTweaks } from "../default-tweaks.js";
import { formatCliShimResult, installCliShims } from "../cli-shim.js";
import {
  CODEX_WINDOW_SERVICES_KEY,
  patchCodexWindowServicesSource,
} from "../codex-window-services.js";
import { chownForTargetUser } from "../ownership.js";

interface Opts {
  app?: string;
  fuse?: boolean; // sade --no-fuse → fuse: false
  resign?: boolean;
  watcher?: boolean;
  watcherKind?: WatcherKind;
  quiet?: boolean;
  defaultTweaks?: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(here, "..", "..", "assets");

export async function install(opts: Opts = {}): Promise<void> {
  const fuseFlip = opts.fuse !== false;
  const resign = opts.resign !== false;
  const wantWatcher = opts.watcher !== false;
  const wantDefaultTweaks = opts.defaultTweaks !== false;

  const step = makeStepper(opts.quiet === true);
  const codex = locateCodex(opts.app);
  step(`Located Codex at ${kleur.cyan(codex.appRoot)}`);
  preflightSystemTools(codex.platform, resign, codex.metaPath !== null);

  // Pre-flight every app-bundle target we will mutate so permission failures
  // surface before we patch app.asar or touch backups.
  preflightWritableTargets(codex, { fuseFlip });
  step("Bundle is writable");

  const codexVersion = readCodexVersion(codex.metaPath);
  if (codexVersion) step(`Codex version: ${kleur.cyan(codexVersion)}`);
  step(`Codex channel: ${kleur.cyan(codex.channel)}`);

  const paths = ensureUserPaths();
  step(`User dir: ${kleur.cyan(paths.root)}`);
  step(formatCliShimResult(installCliShims(paths.binDir)));

  // 1. Backup originals.
  const pristineAppBackup = codex.platform === "darwin" ? join(paths.backup, "Codex.app") : null;
  const backupAsar = join(paths.backup, "app.asar");
  const backupAsarUnpacked = join(paths.backup, "app.asar.unpacked");
  const backupPlist = codex.metaPath ? join(paths.backup, "Info.plist") : null;
  const backupFramework = join(paths.backup, "Electron Framework");
  if (pristineAppBackup) backupPristineApp(codex.appRoot, pristineAppBackup, step);
  backupOnce(codex.asarPath, backupAsar);
  if (existsSync(`${codex.asarPath}.unpacked`)) {
    backupOnce(`${codex.asarPath}.unpacked`, backupAsarUnpacked);
  }
  if (codex.metaPath && backupPlist) backupOnce(codex.metaPath, backupPlist);
  if (fuseFlip) backupOnce(codex.electronBinary, backupFramework);
  step("Backed up originals");

  const { headerHash: originalAsarHash } = readHeaderHash(codex.asarPath);

  // 2. Stage runtime + loader into the user dir.
  stageAssets(paths.runtime);
  step(`Staged runtime to ${kleur.cyan(paths.runtime)}`);

  // 3. Patch app.asar entry point to require our loader.
  const originalEntry = await injectLoader(codex.asarPath, paths.root);
  const { headerHash: patchedAsarHash } = readHeaderHash(codex.asarPath);
  step(`Patched app.asar (entry was ${kleur.dim(originalEntry)})`);

  // 4. Update Info.plist hash so Electron's integrity check passes.
  if (codex.metaPath) {
    setIntegrity(codex, patchedAsarHash);
    step(`Updated ElectronAsarIntegrity → ${kleur.dim(patchedAsarHash.slice(0, 12))}…`);
  }

  // 5. Belt-and-suspenders: flip the integrity validation fuse off.
  let fuseFlipped = false;
  if (fuseFlip) {
    try {
      const r = writeFuse(
        codex.electronBinary,
        "EnableEmbeddedAsarIntegrityValidation",
        "off",
      );
      step(`Fuse EnableEmbeddedAsarIntegrityValidation: ${r.from} → ${r.to}`);
      fuseFlipped = true;
    } catch (e) {
      console.warn(kleur.yellow(`Fuse flip failed: ${(e as Error).message}`));
    }
  }

  // 6. Re-sign on macOS.
  let resigned = false;
  if (resign && codex.platform === "darwin") {
    clearQuarantine(codex.appRoot);
    adHocSign(codex.appRoot);
    resigned = true;
    step("Re-signed ad-hoc");
  }

  // 7. Auto-repair watcher.
  let watcher: WatcherKind = opts.watcherKind ?? "none";
  if (wantWatcher) {
    try {
      watcher = installWatcher(codex.appRoot);
      step(`Installed watcher (${watcher})`);
    } catch (e) {
      console.warn(kleur.yellow(`Watcher install failed: ${(e as Error).message}`));
    }
  }

  // 8. Seed default tweaks from their release channels.
  if (wantDefaultTweaks) {
    await installDefaultTweaks(paths.tweaks, step);
  }

  // 9. Persist state.
  writeState(paths.stateFile, {
    version: CODEX_PLUSPLUS_VERSION,
    installedAt: new Date().toISOString(),
    appRoot: codex.appRoot,
    originalAsarHash,
    patchedAsarHash,
    codexVersion,
    codexChannel: codex.channel,
    codexBundleId: codex.bundleId,
    fuseFlipped,
    resigned,
    originalEntryPoint: originalEntry,
    watcher,
  });
  chownForTargetUser(paths.root, { recursive: true });

  if (!opts.quiet) {
    console.log();
    console.log(kleur.green().bold("✓ codex-plusplus installed."));
    console.log(`  Tweaks dir: ${kleur.cyan(paths.tweaks)}`);
    console.log(`  Logs:       ${kleur.cyan(paths.logDir)}`);
    console.log(`  Launch Codex normally; the Tweaks tab will appear in Settings.`);
  }
}

export function readCodexVersion(metaPath: string | null): string | null {
  if (!metaPath || !existsSync(metaPath)) return null;
  try {
    const pl = readPlist(metaPath);
    return (pl["CFBundleShortVersionString"] as string) ?? null;
  } catch {
    return null;
  }
}

function backupPristineApp(appRoot: string, backupPath: string, step: (msg: string) => void): void {
  const sig = signatureInfo(appRoot);
  if (!sig.ok || sig.adHoc || !sig.teamIdentifier) return;

  rmSync(backupPath, { recursive: true, force: true });
  execFileSync("ditto", [appRoot, backupPath], { stdio: "ignore" });
  step(`Backed up signed Codex.app to ${kleur.cyan(backupPath)}`);
}

/**
 * Replace app.asar's package.json `main` with our loader, copying the
 * loader.cjs into the asar so it can resolve. Returns the original entry path.
 */
async function injectLoader(asarPath: string, userRoot: string): Promise<string> {
  let originalMain = "";
  await patchAsar(asarPath, (dir) => {
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) {
      throw new Error("app.asar has no package.json — Codex layout changed?");
    }
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    originalMain = String(pkg.main ?? "");
    if (!originalMain) throw new Error("app.asar package.json has no `main` field");

    // Already patched? Bail.
    if (pkg["__codexpp"]) {
      originalMain = String(pkg["__codexpp"].originalMain);
    } else {
      pkg["__codexpp"] = {
        originalMain,
        userRoot,
        loader: "codex-plusplus-loader.cjs",
      };
      pkg.main = "codex-plusplus-loader.cjs";
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    }

    // Copy our loader stub into the asar root.
    const loaderSrc = join(assetsDir, "loader.cjs");
    if (!existsSync(loaderSrc)) {
      // Fall back to the in-repo path during development.
      const devLoader = resolve(here, "..", "..", "..", "..", "loader", "loader.cjs");
      if (!existsSync(devLoader)) {
        throw new Error(`loader.cjs not found at ${loaderSrc} or ${devLoader}`);
      }
      cpSync(devLoader, join(dir, "codex-plusplus-loader.cjs"));
    } else {
      cpSync(loaderSrc, join(dir, "codex-plusplus-loader.cjs"));
    }

    patchCodexWindowServices(dir, originalMain);
  });
  return originalMain;
}

function patchCodexWindowServices(appDir: string, originalMain: string): void {
  const candidates = findCodexMainCandidates(appDir, originalMain);

  for (const mainPath of candidates) {
    const source = readFileSync(mainPath, "utf8");
    const patched = patchCodexWindowServicesSource(source, CODEX_WINDOW_SERVICES_KEY);
    if (patched) {
      if (patched.changed) writeFileSync(mainPath, patched.source);
      return;
    }
  }

  throw new Error("Codex window services hook point not found");
}

function findCodexMainCandidates(appDir: string, originalMain: string): string[] {
  const out = [resolve(appDir, originalMain)];
  const buildDir = resolve(appDir, ".vite", "build");
  try {
    for (const name of readdirSync(buildDir)) {
      if (/^main-.*\.js$/.test(name)) out.push(resolve(buildDir, name));
    }
  } catch {}
  return [...new Set(out)].filter((p) => existsSync(p));
}

export function stageAssets(runtimeDir: string): void {
  mkdirSync(runtimeDir, { recursive: true });
  const src = join(assetsDir, "runtime");
  if (existsSync(src)) {
    cpSync(src, runtimeDir, { recursive: true });
    chownForTargetUser(runtimeDir, { recursive: true });
    return;
  }
  // Dev fallback: copy from the in-tree built runtime.
  const devSrc = resolve(here, "..", "..", "..", "..", "runtime", "dist");
  if (existsSync(devSrc)) {
    cpSync(devSrc, runtimeDir, { recursive: true });
    chownForTargetUser(runtimeDir, { recursive: true });
    return;
  }
  throw new Error(
    `Runtime assets not found. Expected at ${src} (built package) or ${devSrc} (dev).\n` +
      `Run \`npm run build\` from the workspace root.`,
  );
}

function makeStepper(quiet = false) {
  let n = 1;
  return (msg: string) => {
    if (!quiet) console.log(`${kleur.dim(`[${n++}]`)} ${msg}`);
  };
}

export function preflightWritableTargets(
  codex: Pick<CodexInstall, "resourcesDir" | "asarPath" | "metaPath" | "electronBinary" | "platform">,
  opts: { fuseFlip: boolean },
): void {
  preflightWritableDirectory(codex.resourcesDir, codex.platform);
  preflightWritableFile(codex.asarPath, codex.platform);
  if (codex.metaPath) preflightWritableFile(codex.metaPath, codex.platform);
  if (opts.fuseFlip) preflightWritableFile(codex.electronBinary, codex.platform);
}

/**
 * Touch a probe file inside the app bundle to surface (and trigger) macOS
 * App Management TCC denials before we begin destructive work.
 */
function preflightWritableDirectory(targetDir: string, platform: string): void {
  const probe = join(targetDir, ".codexpp-write-probe");
  try {
    const fd = openSync(probe, "w");
    closeSync(fd);
    unlinkSync(probe);
  } catch (e) {
    throw writableError(e, targetDir, platform);
  }
}

function preflightWritableFile(targetFile: string, platform: string): void {
  try {
    const fd = openSync(targetFile, "r+");
    closeSync(fd);
  } catch (e) {
    throw writableError(e, targetFile, platform);
  }
}

function writableError(e: unknown, target: string, platform: string): unknown {
  const err = e as NodeJS.ErrnoException;
  if (err.code !== "EPERM" && err.code !== "EACCES") return e;

  const isMac = platform === "darwin";
  const msg =
    `Cannot write to ${target}.\n\n` +
    (isMac
      ? `macOS App Management or file ownership is blocking modification of ${target}.\n` +
        `Fix:\n` +
        `  1. Open System Settings → Privacy & Security → App Management\n` +
        `  2. Enable the toggle for your terminal app (Terminal, iTerm2, etc.)\n` +
        `  3. If the file is root-owned or the error is EACCES, run the installer itself with sudo:\n` +
        `     curl -fsSL https://raw.githubusercontent.com/b-nnett/codex-plusplus/main/install.sh | sudo bash\n` +
        `     or rerun: sudo codexplusplus install\n\n` +
        `Avoid \`sudo curl ... | bash\`; that only runs curl as root, not the installer.\n\n` +
        `(If macOS just showed a permission dialog, click Allow and re-run.)\n`
      : `Check filesystem permissions for the Codex install folder.\n`) +
    `\nOriginal error: ${err.message}`;
  return new Error(msg);
}

function preflightSystemTools(platform: string, resign: boolean, hasPlist: boolean): void {
  if (platform !== "darwin") return;
  if (resign) requireCommand("codesign", "macOS codesign is required to re-sign Codex.app after patching.");
  if (hasPlist) requireCommand("plutil", "macOS plutil is required to update Codex.app's Info.plist.");
}

function requireCommand(command: string, message: string): void {
  const result = spawnSync("/bin/sh", ["-c", `command -v ${command}`], {
    stdio: "ignore",
  });
  if (result.status !== 0) {
    throw new Error(`[!] ${command} not installed\n\n${message}\nPaste this error into Codex if you need help.`);
  }
}
