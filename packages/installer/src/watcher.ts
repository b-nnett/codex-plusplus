/**
 * Watcher: a small process scheduled to run at user login that compares the
 * current Codex.app's asar hash against the patched hash we recorded at
 * install. If they don't match, Sparkle has updated Codex over our patch —
 * we either auto-`repair` or surface a notification, depending on user prefs.
 *
 * Implementation per OS:
 *   macOS:   ~/Library/LaunchAgents/com.codexplusplus.watcher.plist (launchd)
 *   Linux:   ~/.config/systemd/user/codex-plusplus-watcher.service (systemd --user)
 *   Windows: Task Scheduler entry via schtasks.exe
 *
 * The watcher itself is just `codex-plusplus repair --quiet` triggered on the
 * relevant event (app launch / login). The simplest cross-platform approach
 * is "run at login" + "run when Codex.app is modified" (FSEvents/inotify on
 * unix, but launchd's WatchPaths handles it on mac).
 */
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir, platform, userInfo } from "node:os";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chownForTargetUser, targetUserOwnership } from "./ownership.js";

export type WatcherKind = "launchd" | "login-item" | "scheduled-task" | "systemd" | "none";

export function installWatcher(appRoot: string): WatcherKind {
  switch (platform()) {
    case "darwin":
      return installLaunchd(appRoot);
    case "linux":
      return installSystemd(appRoot);
    case "win32":
      return installScheduledTask(appRoot);
    default:
      return "none";
  }
}

export function uninstallWatcher(): void {
  switch (platform()) {
    case "darwin":
      return uninstallLaunchd();
    case "linux":
      return uninstallSystemd();
    case "win32":
      return uninstallScheduledTask();
  }
}

const LABEL = "com.codexplusplus.watcher";

function launchdPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

function launchdLogPath(): string {
  return join(homedir(), "Library", "Logs", "codex-plusplus-watcher.log");
}

function installLaunchd(appRoot: string): WatcherKind {
  if (isRunningFromWatcher()) return "launchd";

  const plPath = launchdPath();
  mkdirSync(dirname(plPath), { recursive: true });
  const logPath = launchdLogPath();
  mkdirSync(dirname(logPath), { recursive: true });
  // Trigger on login + when Codex.app's asar changes. Run this installed CLI
  // directly so auto-repair does not depend on npm availability.
  const repair = xmlEscape(
    `sleep 3; ${cliShellCommand("update", ["--watcher", "--quiet"])} || ${cliShellCommand("repair", ["--quiet"])} || true`,
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>${repair}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>WatchPaths</key>
  <array>
    <string>${appRoot}/Contents/Resources/app.asar</string>
  </array>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
  </dict>
</plist>`;
  writeFileSync(plPath, xml);
  writeFileSync(logPath, "", { flag: "a" });
  chownForTargetUser(plPath);
  chownForTargetUser(logPath);
  if (!bootstrapLaunchd(plPath)) {
    try {
      execLaunchctlForTargetUser(["unload", plPath]);
    } catch {}
    execLaunchctlForTargetUser(["load", plPath]);
  }
  return "launchd";
}

function isRunningFromWatcher(): boolean {
  return process.env.CODEX_PLUSPLUS_WATCHER === "1" || process.env.XPC_SERVICE_NAME === LABEL;
}

function uninstallLaunchd(): void {
  const plPath = launchdPath();
  if (!existsSync(plPath)) return;
  bootoutLaunchd(plPath);
  try {
    execLaunchctlForTargetUser(["unload", plPath]);
  } catch {}
  rmSync(plPath, { force: true });
}

function bootstrapLaunchd(plPath: string): boolean {
  const domain = launchdGuiDomain();
  if (!domain) return false;
  bootoutLaunchd(plPath);
  try {
    execFileSync("launchctl", ["bootstrap", domain, plPath], { stdio: "ignore" });
    execFileSync("launchctl", ["enable", `${domain}/${LABEL}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function bootoutLaunchd(plPath: string): void {
  const domain = launchdGuiDomain();
  if (!domain) return;
  try {
    execFileSync("launchctl", ["bootout", domain, plPath], { stdio: "ignore" });
  } catch {}
}

function launchdGuiDomain(): string | null {
  const uid = targetUserOwnership()?.uid ?? (typeof process.getuid === "function" ? process.getuid() : userInfo().uid);
  return typeof uid === "number" ? `gui/${uid}` : null;
}

function execLaunchctlForTargetUser(args: string[]): void {
  const owner = targetUserOwnership();
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (owner && currentUid === 0 && owner.uid !== 0) {
    execFileSync("launchctl", ["asuser", String(owner.uid), "launchctl", ...args], {
      stdio: "ignore",
    });
    return;
  }
  execFileSync("launchctl", args, { stdio: "ignore" });
}

function installSystemd(appRoot: string): WatcherKind {
  const dir = join(homedir(), ".config", "systemd", "user");
  mkdirSync(dir, { recursive: true });
  const repair = shellSingleQuote(
    `sleep 3; ${cliShellCommand("update", ["--watcher", "--quiet"])} || ${cliShellCommand("repair", ["--quiet"])} || true`,
  );
  const unit = `[Unit]
Description=codex-plusplus repair watcher

[Service]
Type=oneshot
ExecStart=/bin/sh -c ${repair}

[Install]
WantedBy=default.target
`;
  writeFileSync(join(dir, "codex-plusplus-watcher.service"), unit);
  writeFileSync(join(dir, "codex-plusplus-watcher.timer"), `[Unit]
Description=codex-plusplus hourly self-update check

[Timer]
OnBootSec=5m
OnUnitActiveSec=1h
Persistent=true

[Install]
WantedBy=timers.target
`);
  writeFileSync(join(dir, "codex-plusplus-watcher.path"), `[Unit]
Description=codex-plusplus app.asar watcher

[Path]
PathChanged=${appRoot}/resources/app.asar

[Install]
WantedBy=default.target
`);
  try {
    execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
    execFileSync("systemctl", ["--user", "enable", "codex-plusplus-watcher.service"], {
      stdio: "ignore",
    });
    execFileSync("systemctl", ["--user", "enable", "--now", "codex-plusplus-watcher.timer"], {
      stdio: "ignore",
    });
    execFileSync("systemctl", ["--user", "enable", "--now", "codex-plusplus-watcher.path"], {
      stdio: "ignore",
    });
  } catch {
    /* systemd may not be available */
  }
  return "systemd";
}

function uninstallSystemd(): void {
  const path = join(homedir(), ".config", "systemd", "user", "codex-plusplus-watcher.service");
  if (!existsSync(path)) return;
  try {
    execFileSync("systemctl", ["--user", "disable", "codex-plusplus-watcher.service"], {
      stdio: "ignore",
    });
    execFileSync("systemctl", ["--user", "disable", "--now", "codex-plusplus-watcher.path"], {
      stdio: "ignore",
    });
    execFileSync("systemctl", ["--user", "disable", "--now", "codex-plusplus-watcher.timer"], {
      stdio: "ignore",
    });
  } catch {}
  rmSync(path, { force: true });
  rmSync(join(homedir(), ".config", "systemd", "user", "codex-plusplus-watcher.path"), {
    force: true,
  });
  rmSync(join(homedir(), ".config", "systemd", "user", "codex-plusplus-watcher.timer"), {
    force: true,
  });
}

function installScheduledTask(_appRoot: string): WatcherKind {
  // schtasks.exe creates a logon-trigger task. We pass the watcher command via /TR.
  const repair = windowsWatcherTaskCommand();
  try {
    deleteScheduledTask("codex-plusplus-watcher-daily");
    execFileSync("schtasks.exe", [
      "/Create",
      "/F",
      "/SC",
      "ONLOGON",
      "/TN",
      "codex-plusplus-watcher",
      "/TR",
      repair,
    ]);
    execFileSync("schtasks.exe", [
      "/Create",
      "/F",
      "/SC",
      "HOURLY",
      "/MO",
      "1",
      "/TN",
      "codex-plusplus-watcher-hourly",
      "/TR",
      repair,
    ]);
    return "scheduled-task";
  } catch {
    return "none";
  }
}

function cliShellCommand(command: string, args: string[] = []): string {
  return [
    "CODEX_PLUSPLUS_WATCHER=1",
    shellQuote(process.execPath),
    ...process.execArgv.map(shellQuote),
    shellQuote(currentCliPath()),
    command,
    ...args,
  ].join(" ");
}

function currentCliPath(): string {
  const currentModulePath = fileURLToPath(import.meta.url);
  const extension = currentModulePath.endsWith(".ts") ? ".ts" : ".js";
  return join(dirname(currentModulePath), `cli${extension}`);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function windowsCommand(command: string, args: string[] = []): string {
  return [
    windowsQuote(process.execPath),
    ...process.execArgv.map(windowsQuote),
    windowsQuote(currentCliPath()),
    command,
    ...args,
  ].join(" ");
}

function windowsWatcherTaskCommand(): string {
  const comspec = process.env.ComSpec || "cmd.exe";
  return `"${comspec}" /d /s /c "${windowsCommand("update", ["--watcher", "--quiet"])} || ${windowsCommand("repair", ["--quiet"])}"`;
}

function windowsQuote(value: string): string {
  return `"${value.replace(/"/g, `\\"`)}"`;
}

function uninstallScheduledTask(): void {
  deleteScheduledTask("codex-plusplus-watcher");
  deleteScheduledTask("codex-plusplus-watcher-hourly");
  deleteScheduledTask("codex-plusplus-watcher-daily");
}

function deleteScheduledTask(name: string): void {
  try {
    execFileSync("schtasks.exe", ["/Delete", "/F", "/TN", name], {
      stdio: "ignore",
    });
  } catch {}
}
