import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, cpSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
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
    ...findMacCodexApps("/Applications"),
    ...findMacCodexApps(join(homedir(), "Applications")),
  ].filter(Boolean) as string[];

  const appRoot = unique(candidates).find((p) => isMacCodexApp(p));
  if (!appRoot) {
    throw new Error(
      `[!] Codex App Not Found\n\n` +
        `Ensure Codex.app or Codex (Beta).app is installed in /Applications or ~/Applications.\n` +
        `Tried:\n  ${unique(candidates).join("\n  ")}\n\n` +
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
    electronBinary: resolveMacFrameworkBinary(appRoot),
    executable: join(appRoot, "Contents", "MacOS", info.executable),
    appName: info.name,
    bundleId: info.bundleId,
    channel: inferCodexChannel(info.bundleId, info.name),
    platform: "darwin",
  };
}

function resolveMacFrameworkBinary(appRoot: string): string {
  const frameworksDir = join(appRoot, "Contents", "Frameworks");
  const preferred = [
    join(frameworksDir, "Electron Framework.framework", "Versions", "A", "Electron Framework"),
    join(frameworksDir, "Electron Framework.framework", "Electron Framework"),
    join(frameworksDir, "Codex Framework.framework", "Codex Framework"),
    join(frameworksDir, "Codex Framework.framework", "Versions", "Current", "Codex Framework"),
  ];
  const foundPreferred = preferred.find((candidate) => existsSync(candidate));
  if (foundPreferred) return foundPreferred;

  if (existsSync(frameworksDir)) {
    try {
      for (const entry of readdirSync(frameworksDir)) {
        if (!/^(Electron|Codex) Framework\.framework$/i.test(entry)) continue;
        const framework = join(frameworksDir, entry);
        const binaryName = entry.replace(/\.framework$/i, "");
        const candidates = [
          join(framework, binaryName),
          join(framework, "Versions", "Current", binaryName),
          join(framework, "Versions", "A", binaryName),
          ...versionedFrameworkBinaries(framework, binaryName),
        ];
        const found = candidates.find((candidate) => existsSync(candidate));
        if (found) return found;
      }
    } catch {}
  }

  return preferred[0];
}

function versionedFrameworkBinaries(framework: string, binaryName: string): string[] {
  const versionsDir = join(framework, "Versions");
  if (!existsSync(versionsDir)) return [];
  try {
    return readdirSync(versionsDir)
      .filter((version) => version !== "Current")
      .map((version) => join(versionsDir, version, binaryName));
  } catch {
    return [];
  }
}

function findMacCodexApps(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((name) => /\.app$/i.test(name) && /\bcodex\b/i.test(name))
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

function isMacCodexApp(appRoot: string): boolean {
  const infoPath = join(appRoot, "Contents", "Info.plist");
  if (!existsSync(infoPath)) return false;
  const info = readMacAppInfo(appRoot);
  return inferCodexChannel(info.bundleId, info.name) !== "unknown";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
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
    candidates.push(...windowsCodexCandidates(local));
    candidates.push(
      join(local, "Programs", "Codex (Beta)"),
      join(local, "Programs", "Codex Beta"),
      join(local, "Programs", "codex-beta"),
      join(local, "Programs", "Codex"),
      join(local, "Programs", "codex"),
      join(local, "Codex (Beta)"),
      join(local, "Codex Beta"),
      join(local, "codex-beta"),
      join(local, "Codex"),
      join(local, "codex"),
    );
    candidates.push(...windowsCodexCandidates(join(local, "Programs")));
  }
  if (programFiles) {
    candidates.push(
      join(programFiles, "Codex (Beta)"),
      join(programFiles, "Codex Beta"),
      join(programFiles, "codex-beta"),
      join(programFiles, "Codex"),
      join(programFiles, "codex"),
      ...windowsCodexCandidates(join(programFiles, "WindowsApps")),
      ...windowsCodexCandidates(programFiles),
    );
  }
  if (programFilesX86) {
    candidates.push(
      join(programFilesX86, "Codex (Beta)"),
      join(programFilesX86, "Codex Beta"),
      join(programFilesX86, "codex-beta"),
      join(programFilesX86, "Codex"),
      join(programFilesX86, "codex"),
      ...windowsCodexCandidates(programFilesX86),
    );
  }
  const storeInstalls = findWindowsStoreCodexInstalls();
  for (const storeInstall of storeInstalls) {
    if (storeInstall.installLocation) {
      candidates.push(...windowsStoreCodexCandidates(storeInstall.installLocation));
    }
  }

  const tried = unique(candidates);
  const appRoot = tried.find(isWinCodexRoot);
  if (!appRoot) {
    const triedText = tried.length > 0 ? tried.join("\n  ") : "(no default locations available)";
    if (storeInstalls.length > 0) {
      const storeText = storeInstalls
        .map((install) => `  ${install.name}\n  ${install.installLocation ?? "(install location is hidden by Windows)"}`)
        .join("\n");
      throw new Error(
        `[!] Codex App Not Found\n\n` +
          `Codex appears to be installed from the Microsoft Store, but Codex++ could not find app.asar under the expected package layout.\n\n` +
          `Store package(s):\n${storeText}\n\n` +
          `Expected one of:\n` +
          `  <package>\\app\\resources\\app.asar\n` +
          `  <package>\\resources\\app.asar\n\n` +
          `Tried:\n  ${triedText}\n\n` +
          `If you have a standalone copy elsewhere, rerun with --app pointing at its install folder.`,
      );
    }
    throw new Error(
      `[!] Codex App Not Found\n\n` +
        `Ensure Codex is installed in one of the default Windows locations.\n` +
        `Tried:\n  ${triedText}\n\n` +
        `If Codex is somewhere else, rerun with --app pointing at its install folder.`,
    );
  }
  const writableAppRoot = isWindowsAppsPath(appRoot) ? ensureWindowsStoreMirror(appRoot) : appRoot;
  const resourcesDir = join(writableAppRoot, "resources");
  const executable = findWinExecutable(writableAppRoot);
  const appName = basename(executable, ".exe");
  return {
    appRoot: writableAppRoot,
    resourcesDir,
    asarPath: join(resourcesDir, "app.asar"),
    metaPath: null,
    electronBinary: executable,
    executable,
    appName,
    bundleId: null,
    channel: inferCodexChannel(null, appName),
    platform: "win32",
  };
}

function windowsCodexCandidates(root: string): string[] {
  if (!existsSync(root)) return [];
  const candidates: string[] = [];
  try {
    for (const entry of readdirSync(root)) {
      if (!/\bcodex\b/i.test(entry)) continue;
      const dir = join(root, entry);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      candidates.push(dir);
      candidates.push(...windowsStoreCodexCandidates(dir));
      const latest = latestWindowsSquirrelAppDir(dir);
      if (latest) candidates.push(latest);
    }
  } catch {}
  return candidates;
}

function windowsStoreCodexCandidates(packageRoot: string): string[] {
  return [join(packageRoot, "app"), packageRoot];
}

function isWindowsAppsPath(path: string): boolean {
  return /\\WindowsApps\\/i.test(`${path.replace(/\//g, "\\")}\\`);
}

function ensureWindowsStoreMirror(storeAppRoot: string): string {
  const sourceAppRoot = basename(storeAppRoot).toLowerCase() === "app"
    ? storeAppRoot
    : join(storeAppRoot, "app");
  if (!isWinCodexRoot(sourceAppRoot)) return storeAppRoot;

  const packageRoot = dirname(sourceAppRoot);
  const packageName = basename(packageRoot);
  const local = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  const mirrorAppRoot = join(local, "codex-plusplus", "store-apps", packageName, "app");
  mirrorDirectory(sourceAppRoot, mirrorAppRoot);
  return mirrorAppRoot;
}

function mirrorDirectory(source: string, target: string): void {
  mkdirSync(dirname(target), { recursive: true });
  const result = spawnSync(
    "robocopy.exe",
    [source, target, "/MIR", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"],
    { stdio: "ignore" },
  );
  // Robocopy uses 0-7 for success / non-fatal copy states.
  if (typeof result.status === "number" && result.status <= 7) return;

  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}

function latestWindowsSquirrelAppDir(root: string): string | null {
  try {
    const entries = readdirSync(root)
      .filter((d) => /^app-/i.test(d))
      .map((d) => join(root, d))
      .filter((p) => statSync(p).isDirectory());
    entries.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return entries.at(-1) ?? null;
  } catch {
    return null;
  }
}

function isWinCodexRoot(appRoot: string): boolean {
  return existsSync(join(appRoot, "resources", "app.asar"));
}

function findWinExecutable(appRoot: string): string {
  try {
    const exe = readdirSync(appRoot).find((name) => /\.exe$/i.test(name) && /\bcodex\b/i.test(name));
    if (exe) return join(appRoot, exe);
  } catch {}
  return join(appRoot, "Codex.exe");
}

function findWindowsStoreCodexInstalls(): { name: string; installLocation: string | null }[] {
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        [
          "$pkgs = Get-AppxPackage | Where-Object {",
          "$_.Name -match 'Codex' -or $_.PackageFullName -match 'Codex' -or $_.InstallLocation -match 'Codex'",
          "} | Select-Object Name, InstallLocation;",
          "if ($pkgs) { $pkgs | ConvertTo-Json -Compress }",
        ].join(" "),
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 },
    ).trim();
    if (!out) return [];
    const parsed = JSON.parse(out) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .map((row) => {
        const item = row as { Name?: unknown; InstallLocation?: unknown };
        const name = typeof item.Name === "string" ? item.Name : "Codex";
        const installLocation =
          typeof item.InstallLocation === "string" && item.InstallLocation.trim()
            ? item.InstallLocation
            : null;
        return { name, installLocation };
      })
      .filter((row) => row.installLocation !== null);
  } catch {
    return [];
  }
}

function locateLinux(override?: string): CodexInstall {
  // Linux builds are distributed by community ports today. Support unpacked
  // Electron installs from deb/rpm packages as well as user-local symlinked
  // installs used by am-will/codex-app.
  const candidates = [
    override,
    "/usr/bin/codex-desktop",
    "/usr/bin/codex",
    "/usr/local/bin/codex-desktop",
    "/usr/local/bin/codex",
    "/usr/lib/codex-desktop",
    "/opt/codex-desktop/current",
    "/opt/codex-desktop",
    "/opt/Codex",
    "/opt/codex",
    join(homedir(), ".local", "bin", "codex-desktop"),
    join(homedir(), ".local", "bin", "codex"),
    join(homedir(), ".local", "opt", "codex-desktop", "current"),
    join(homedir(), ".local", "opt", "codex-desktop"),
    join(homedir(), ".local", "share", "codex-desktop", "current"),
    join(homedir(), ".local", "share", "codex-desktop"),
    join(homedir(), ".local", "share", "Codex"),
  ].filter(Boolean) as string[];
  const install = unique(candidates).map(resolveLinuxInstall).find((p): p is LinuxInstallCandidate => p !== null);
  if (!install) {
    throw new Error(
      `[!] Codex App Not Found\n\n` +
        `Ensure Codex is installed in a supported Linux location.\n` +
        `Tried:\n  ${unique(candidates).join("\n  ")}\n\n` +
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

export interface LinuxInstallCandidate {
  appRoot: string;
  resourcesDir: string;
  executable: string;
}

export function resolveLinuxInstall(candidate: string): LinuxInstallCandidate | null {
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

  for (const root of unique(roots)) {
    const resourcesDir = join(root, "resources");
    if (!existsSync(join(resourcesDir, "app.asar"))) continue;
    const executable = findLinuxExecutable(root);
    if (!executable) continue;
    return { appRoot: root, resourcesDir, executable };
  }
  return null;
}

function findLinuxExecutable(appRoot: string): string | null {
  const candidates = ["Codex", "codex-desktop", "codex"].map((name) => join(appRoot, name));
  return candidates.find(isExecutableFile) ?? null;
}

function isExecutableFile(path: string): boolean {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return false;
    return (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}
