import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

type CheckStatus = "ok" | "warn" | "error";

export interface WatcherHealthCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface WatcherHealth {
  checkedAt: string;
  status: CheckStatus;
  title: string;
  summary: string;
  watcher: string;
  checks: WatcherHealthCheck[];
}

interface InstallerState {
  appRoot?: string;
  version?: string;
  watcher?: "launchd" | "login-item" | "scheduled-task" | "systemd" | "none";
}

interface RuntimeConfig {
  codexPlusPlus?: {
    autoUpdate?: boolean;
  };
}

const LAUNCHD_LABEL = "com.codexplusplus.watcher";
const WATCHER_LOG = join(homedir(), "Library", "Logs", "codex-plusplus-watcher.log");

export function getWatcherHealth(userRoot: string): WatcherHealth {
  const checks: WatcherHealthCheck[] = [];
  const state = readJson<InstallerState>(join(userRoot, "state.json"));
  const config = readJson<RuntimeConfig>(join(userRoot, "config.json")) ?? {};

  checks.push({
    name: "Install state",
    status: state ? "ok" : "error",
    detail: state ? `Codex++ ${state.version ?? "(unknown version)"}` : "state.json is missing",
  });

  if (!state) return summarize("none", checks);

  const autoUpdate = config.codexPlusPlus?.autoUpdate !== false;
  checks.push({
    name: "Automatic refresh",
    status: autoUpdate ? "ok" : "warn",
    detail: autoUpdate ? "enabled" : "disabled in Codex++ config",
  });

  checks.push({
    name: "Watcher kind",
    status: state.watcher && state.watcher !== "none" ? "ok" : "error",
    detail: state.watcher ?? "none",
  });

  const appRoot = state.appRoot ?? "";
  checks.push({
    name: "Codex app",
    status: appRoot && existsSync(appRoot) ? "ok" : "error",
    detail: appRoot || "missing appRoot in state",
  });

  switch (platform()) {
    case "darwin":
      checks.push(...checkLaunchdWatcher(appRoot));
      break;
    case "linux":
      checks.push(...checkSystemdWatcher(appRoot));
      break;
    case "win32":
      checks.push(...checkScheduledTaskWatcher());
      break;
    default:
      checks.push({
        name: "Platform watcher",
        status: "warn",
        detail: `unsupported platform: ${platform()}`,
      });
  }

  return summarize(state.watcher ?? "none", checks);
}

function checkLaunchdWatcher(appRoot: string): WatcherHealthCheck[] {
  const checks: WatcherHealthCheck[] = [];
  const plistPath = join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
  const plist = existsSync(plistPath) ? readFileSafe(plistPath) : "";
  const asarPath = appRoot ? join(appRoot, "Contents", "Resources", "app.asar") : "";

  checks.push({
    name: "launchd plist",
    status: plist ? "ok" : "error",
    detail: plistPath,
  });

  if (plist) {
    checks.push({
      name: "launchd label",
      status: plist.includes(LAUNCHD_LABEL) ? "ok" : "error",
      detail: LAUNCHD_LABEL,
    });
    checks.push({
      name: "launchd trigger",
      status: asarPath && plist.includes(asarPath) ? "ok" : "error",
      detail: asarPath || "missing appRoot",
    });
    checks.push({
      name: "watcher command",
      status: plist.includes("CODEX_PLUSPLUS_WATCHER=1") && plist.includes(" update --watcher --quiet")
        ? "ok"
        : "error",
      detail: commandSummary(plist),
    });

    const cliPath = extractFirst(plist, /'([^']*packages\/installer\/dist\/cli\.js)'/);
    if (cliPath) {
      checks.push({
        name: "repair CLI",
        status: existsSync(cliPath) ? "ok" : "error",
        detail: cliPath,
      });
    }
  }

  const loaded = commandSucceeds("launchctl", ["list", LAUNCHD_LABEL]);
  checks.push({
    name: "launchd loaded",
    status: loaded ? "ok" : "error",
    detail: loaded ? "service is loaded" : "launchctl cannot find the watcher",
  });

  checks.push(watcherLogCheck());
  return checks;
}

function checkSystemdWatcher(appRoot: string): WatcherHealthCheck[] {
  const dir = join(homedir(), ".config", "systemd", "user");
  const service = join(dir, "codex-plusplus-watcher.service");
  const timer = join(dir, "codex-plusplus-watcher.timer");
  const pathUnit = join(dir, "codex-plusplus-watcher.path");
  const expectedPath = appRoot ? join(appRoot, "resources", "app.asar") : "";
  const pathBody = existsSync(pathUnit) ? readFileSafe(pathUnit) : "";

  return [
    {
      name: "systemd service",
      status: existsSync(service) ? "ok" : "error",
      detail: service,
    },
    {
      name: "systemd timer",
      status: existsSync(timer) ? "ok" : "error",
      detail: timer,
    },
    {
      name: "systemd path",
      status: pathBody && expectedPath && pathBody.includes(expectedPath) ? "ok" : "error",
      detail: expectedPath || pathUnit,
    },
    {
      name: "path unit active",
      status: commandSucceeds("systemctl", ["--user", "is-active", "--quiet", "codex-plusplus-watcher.path"]) ? "ok" : "warn",
      detail: "systemctl --user is-active codex-plusplus-watcher.path",
    },
    {
      name: "timer active",
      status: commandSucceeds("systemctl", ["--user", "is-active", "--quiet", "codex-plusplus-watcher.timer"]) ? "ok" : "warn",
      detail: "systemctl --user is-active codex-plusplus-watcher.timer",
    },
  ];
}

function checkScheduledTaskWatcher(): WatcherHealthCheck[] {
  return [
    {
      name: "logon task",
      status: commandSucceeds("schtasks.exe", ["/Query", "/TN", "codex-plusplus-watcher"]) ? "ok" : "error",
      detail: "codex-plusplus-watcher",
    },
    {
      name: "hourly task",
      status: commandSucceeds("schtasks.exe", ["/Query", "/TN", "codex-plusplus-watcher-hourly"]) ? "ok" : "warn",
      detail: "codex-plusplus-watcher-hourly",
    },
  ];
}

function watcherLogCheck(): WatcherHealthCheck {
  if (!existsSync(WATCHER_LOG)) {
    return { name: "watcher log", status: "warn", detail: "no watcher log yet" };
  }
  const tail = readFileSafe(WATCHER_LOG).split(/\r?\n/).slice(-40).join("\n");
  return analyzeWatcherLogTail(tail);
}

export function analyzeWatcherLogTail(tail: string): WatcherHealthCheck {
  const hasError = /✗ codex-plusplus failed|codex-plusplus failed|error|failed/i.test(tail);
  const needsSudoRepair =
    hasError &&
    /Cannot write to .*Codex.*\.app|App Management|file ownership|run the installer itself with sudo|sudo codexplusplus (?:install|repair)|EACCES|EPERM/i.test(tail);
  return {
    name: "watcher log",
    status: hasError ? "warn" : "ok",
    detail: hasError
      ? needsSudoRepair
        ? "auto-repair needs privileges; run `sudo codexplusplus repair`"
        : "recent watcher log contains an error"
      : WATCHER_LOG,
  };
}

function summarize(watcher: string, checks: WatcherHealthCheck[]): WatcherHealth {
  const hasError = checks.some((c) => c.status === "error");
  const hasWarn = checks.some((c) => c.status === "warn");
  const status: CheckStatus = hasError ? "error" : hasWarn ? "warn" : "ok";
  const failed = checks.filter((c) => c.status === "error").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const title =
    status === "ok"
      ? "Auto-repair watcher is ready"
      : status === "warn"
        ? "Auto-repair watcher needs review"
        : "Auto-repair watcher is not ready";
  const summary =
    status === "ok"
      ? "Codex++ should automatically repair itself after Codex updates."
      : `${failed} failing check(s), ${warned} warning(s).`;

  return {
    checkedAt: new Date().toISOString(),
    status,
    title,
    summary,
    watcher,
    checks,
  };
}

function commandSucceeds(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: "ignore", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function commandSummary(plist: string): string {
  const command = extractFirst(plist, /<string>([^<]*(?:update --watcher --quiet|repair --quiet)[^<]*)<\/string>/);
  return command ? unescapeXml(command).replace(/\s+/g, " ").trim() : "watcher command not found";
}

function extractFirst(source: string, pattern: RegExp): string | null {
  return source.match(pattern)?.[1] ?? null;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
