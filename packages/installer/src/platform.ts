import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, join, resolve } from "node:path";
import { readPlist } from "./plist.js";

export type Platform = "darwin" | "win32" | "linux";
export type CodexChannel = "stable" | "beta" | "unknown";

export interface CodexInstall {
  /** Path to Codex.app (mac), Codex install dir (win), or AppImage (linux). */
  appRoot: string;
  /** Resources/ dir inside the app. */
  resourcesDir: string;
  /** Path to app.asar. */
  asarPath: string;
  /** Path to Info.plist (mac) or equivalent metadata file. */
  metaPath: string | null;
  /** Path to the Electron Framework binary (for fuse flipping). */
  electronBinary: string;
  /** Original-name executable used when launching. */
  executable: string;
  /** Human-readable app name, when available. */
  appName: string;
  /** Bundle id on macOS, when available. */
  bundleId: string | null;
  /** Known Codex release channel inferred from bundle metadata. */
  channel: CodexChannel;
  platform: Platform;
}

const MAC_DEFAULT = "/Applications/Codex.app";
const MAC_BETA_DEFAULT = "/Applications/Codex (Beta).app";

export function detectPlatform(): Platform {
  const p = platform();
  if (p === "darwin" || p === "win32" || p === "linux") return p;
  throw new Error(`Unsupported platform: ${p}`);
}

export function locateCodex(override?: string): CodexInstall {
  const plat = detectPlatform();
  if (plat === "darwin") return locateMac(override);
  if (plat === "win32") return locateWin(override);
  return locateLinux(override);
}

function locateMac(override?: string): CodexInstall {
  const candidates = [
    override,
    MAC_DEFAULT,
    MAC_BETA_DEFAULT,
    join(homedir(), "Applications", "Codex.app"),
    join(homedir(), "Applications", "Codex (Beta).app"),
  ].filter(Boolean) as string[];

  const appRoot = candidates.find((p) => existsSync(join(p, "Contents", "Info.plist")));
  if (!appRoot) {
    throw new Error(
      `[!] Codex App Not Found\n\n` +
        `Ensure Codex.app is installed in /Applications or ~/Applications.\n` +
        `Tried:\n  ${candidates.join("\n  ")}\n\n` +
        `If Codex is somewhere else, rerun with:\n` +
        `  codex-plusplus install --app /path/to/Codex.app`,
    );
  }
  const info = readMacAppInfo(appRoot);
  const resourcesDir = join(appRoot, "Contents", "Resources");
  return {
    appRoot,
    resourcesDir,
    asarPath: join(resourcesDir, "app.asar"),
    metaPath: join(appRoot, "Contents", "Info.plist"),
    electronBinary: join(
      appRoot,
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
      "Versions",
      "A",
      "Electron Framework",
    ),
    executable: join(appRoot, "Contents", "MacOS", info.executable),
    appName: info.name,
    bundleId: info.bundleId,
    channel: inferCodexChannel(info.bundleId, info.name),
    platform: "darwin",
  };
}

function readMacAppInfo(appRoot: string): { name: string; executable: string; bundleId: string | null } {
  const metaPath = join(appRoot, "Contents", "Info.plist");
  try {
    const plist = readPlist(metaPath);
    const name = String(plist.CFBundleDisplayName ?? plist.CFBundleName ?? basename(appRoot, ".app"));
    const executable = String(plist.CFBundleExecutable ?? name);
    const bundleId = typeof plist.CFBundleIdentifier === "string" ? plist.CFBundleIdentifier : null;
    return { name, executable, bundleId };
  } catch {
    const name = basename(appRoot, ".app");
    return { name, executable: name, bundleId: null };
  }
}

export function inferCodexChannel(bundleId: string | null, appName?: string): CodexChannel {
  if (bundleId === "com.openai.codex") return "stable";
  if (bundleId === "com.openai.codex.beta") return "beta";
  if (/\bbeta\b/i.test(appName ?? "")) return "beta";
  if (/\bcodex\b/i.test(appName ?? "")) return "stable";
  return "unknown";
}

function locateWin(override?: string): CodexInstall {
  // Squirrel.Windows commonly installs under %LOCALAPPDATA%\codex\app-<version>.
  // Some Electron installers use %LOCALAPPDATA%\Programs\Codex instead.
  const local = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const candidates: string[] = [];
  if (override) candidates.push(override);
  if (local) {
    const codexDir = join(local, "codex");
    if (existsSync(codexDir)) {
      // pick highest app-* directory
      try {
        const entries = readdirSync(codexDir)
          .filter((d) => d.startsWith("app-"))
          .map((d) => join(codexDir, d))
          .filter((p) => statSync(p).isDirectory());
        entries.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const latest = entries.at(-1);
        if (latest) candidates.push(latest);
      } catch {}
    }
    candidates.push(
      join(local, "Programs", "Codex"),
      join(local, "Programs", "codex"),
      join(local, "Codex"),
      join(local, "codex"),
    );
  }
  if (programFiles) candidates.push(join(programFiles, "Codex"), join(programFiles, "codex"));
  if (programFilesX86) candidates.push(join(programFilesX86, "Codex"), join(programFilesX86, "codex"));

  const appRoot = candidates.find((p) => existsSync(join(p, "resources", "app.asar")));
  if (!appRoot) {
    const tried = candidates.length > 0 ? candidates.join("\n  ") : "(no default locations available)";
    throw new Error(
      `[!] Codex App Not Found\n\n` +
        `Ensure Codex is installed in one of the default Windows locations.\n` +
        `Tried:\n  ${tried}\n\n` +
        `If Codex is somewhere else, rerun with --app pointing at its install folder.`,
    );
  }
  const resourcesDir = join(appRoot, "resources");
  return {
    appRoot,
    resourcesDir,
    asarPath: join(resourcesDir, "app.asar"),
    metaPath: null,
    electronBinary: join(appRoot, "Codex.exe"),
    executable: join(appRoot, "Codex.exe"),
    appName: "Codex",
    bundleId: null,
    channel: "stable",
    platform: "win32",
  };
}

function locateLinux(override?: string): CodexInstall {
  // Linux builds are distributed by community ports today. Support unpacked
  // Electron installs from deb/rpm packages as well as user-local symlinked
  // installs used by am-will/codex-app.
  const candidates = [
    override,
    "/usr/lib/codex-desktop",
    "/opt/codex-desktop/current",
    "/opt/codex-desktop",
    "/opt/Codex",
    "/opt/codex",
    join(homedir(), ".local", "opt", "codex-desktop", "current"),
    join(homedir(), ".local", "opt", "codex-desktop"),
    join(homedir(), ".local", "share", "codex-desktop", "current"),
    join(homedir(), ".local", "share", "codex-desktop"),
    join(homedir(), ".local", "share", "Codex"),
  ].filter(Boolean) as string[];
  const install = candidates.map(resolveLinuxInstall).find((p): p is LinuxInstallCandidate => p !== null);
  if (!install) {
    throw new Error(
      `[!] Codex App Not Found\n\n` +
        `Ensure Codex is installed in a supported Linux location.\n` +
        `Tried:\n  ${candidates.join("\n  ")}\n\n` +
        `If Codex is somewhere else, rerun with --app pointing at its install folder.`,
    );
  }
  const { appRoot, resourcesDir, executable } = install;
  return {
    appRoot,
    resourcesDir,
    asarPath: join(resourcesDir, "app.asar"),
    metaPath: null,
    electronBinary: executable,
    executable,
    appName: "Codex",
    bundleId: null,
    channel: "stable",
    platform: "linux",
  };
}

interface LinuxInstallCandidate {
  appRoot: string;
  resourcesDir: string;
  executable: string;
}

function resolveLinuxInstall(candidate: string): LinuxInstallCandidate | null {
  let resolved = candidate;
  try {
    resolved = realpathSync(candidate);
  } catch {
    // Keep the original path so the directory checks below can fail normally.
  }

  const roots: string[] = [];
  if (existsSync(resolved)) {
    try {
      const stat = statSync(resolved);
      if (stat.isDirectory()) {
        roots.push(resolved);
        if (basename(resolved) === "resources") roots.push(resolve(resolved, ".."));
      } else if (stat.isFile()) {
        roots.push(resolve(resolved, ".."));
      }
    } catch {}
  }
  roots.push(resolved);

  for (const root of [...new Set(roots)]) {
    const resourcesDir = join(root, "resources");
    if (!existsSync(join(resourcesDir, "app.asar"))) continue;
    const executable = findLinuxExecutable(root);
    if (!executable) continue;
    return { appRoot: root, resourcesDir, executable };
  }
  return null;
}

function findLinuxExecutable(appRoot: string): string | null {
  const candidates = [
    "Codex",
    "codex-desktop",
    "codex",
  ].map((name) => join(appRoot, name));
  return candidates.find((p) => existsSync(p)) ?? null;
}
