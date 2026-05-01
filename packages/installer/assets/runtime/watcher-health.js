"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWatcherHealth = getWatcherHealth;
exports.analyzeWatcherLogTail = analyzeWatcherLogTail;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const LAUNCHD_LABEL = "com.codexplusplus.watcher";
const WATCHER_LOG = (0, node_path_1.join)((0, node_os_1.homedir)(), "Library", "Logs", "codex-plusplus-watcher.log");
function getWatcherHealth(userRoot) {
    const checks = [];
    const state = readJson((0, node_path_1.join)(userRoot, "state.json"));
    const config = readJson((0, node_path_1.join)(userRoot, "config.json")) ?? {};
    checks.push({
        name: "Install state",
        status: state ? "ok" : "error",
        detail: state ? `Codex++ ${state.version ?? "(unknown version)"}` : "state.json is missing",
    });
    if (!state)
        return summarize("none", checks);
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
        status: appRoot && (0, node_fs_1.existsSync)(appRoot) ? "ok" : "error",
        detail: appRoot || "missing appRoot in state",
    });
    switch ((0, node_os_1.platform)()) {
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
                detail: `unsupported platform: ${(0, node_os_1.platform)()}`,
            });
    }
    return summarize(state.watcher ?? "none", checks);
}
function checkLaunchdWatcher(appRoot) {
    const checks = [];
    const plistPath = (0, node_path_1.join)((0, node_os_1.homedir)(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
    const plist = (0, node_fs_1.existsSync)(plistPath) ? readFileSafe(plistPath) : "";
    const asarPath = appRoot ? (0, node_path_1.join)(appRoot, "Contents", "Resources", "app.asar") : "";
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
                status: (0, node_fs_1.existsSync)(cliPath) ? "ok" : "error",
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
function checkSystemdWatcher(appRoot) {
    const dir = (0, node_path_1.join)((0, node_os_1.homedir)(), ".config", "systemd", "user");
    const service = (0, node_path_1.join)(dir, "codex-plusplus-watcher.service");
    const timer = (0, node_path_1.join)(dir, "codex-plusplus-watcher.timer");
    const pathUnit = (0, node_path_1.join)(dir, "codex-plusplus-watcher.path");
    const expectedPath = appRoot ? (0, node_path_1.join)(appRoot, "resources", "app.asar") : "";
    const pathBody = (0, node_fs_1.existsSync)(pathUnit) ? readFileSafe(pathUnit) : "";
    return [
        {
            name: "systemd service",
            status: (0, node_fs_1.existsSync)(service) ? "ok" : "error",
            detail: service,
        },
        {
            name: "systemd timer",
            status: (0, node_fs_1.existsSync)(timer) ? "ok" : "error",
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
function checkScheduledTaskWatcher() {
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
function watcherLogCheck() {
    if (!(0, node_fs_1.existsSync)(WATCHER_LOG)) {
        return { name: "watcher log", status: "warn", detail: "no watcher log yet" };
    }
    const tail = readFileSafe(WATCHER_LOG).split(/\r?\n/).slice(-40).join("\n");
    return analyzeWatcherLogTail(tail);
}
function analyzeWatcherLogTail(tail) {
    const hasError = /✗ codex-plusplus failed|codex-plusplus failed|error|failed/i.test(tail);
    const needsSudoRepair = hasError &&
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
function summarize(watcher, checks) {
    const hasError = checks.some((c) => c.status === "error");
    const hasWarn = checks.some((c) => c.status === "warn");
    const status = hasError ? "error" : hasWarn ? "warn" : "ok";
    const failed = checks.filter((c) => c.status === "error").length;
    const warned = checks.filter((c) => c.status === "warn").length;
    const title = status === "ok"
        ? "Auto-repair watcher is ready"
        : status === "warn"
            ? "Auto-repair watcher needs review"
            : "Auto-repair watcher is not ready";
    const summary = status === "ok"
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
function commandSucceeds(command, args) {
    try {
        (0, node_child_process_1.execFileSync)(command, args, { stdio: "ignore", timeout: 5_000 });
        return true;
    }
    catch {
        return false;
    }
}
function commandSummary(plist) {
    const command = extractFirst(plist, /<string>([^<]*(?:update --watcher --quiet|repair --quiet)[^<]*)<\/string>/);
    return command ? unescapeXml(command).replace(/\s+/g, " ").trim() : "watcher command not found";
}
function extractFirst(source, pattern) {
    return source.match(pattern)?.[1] ?? null;
}
function readJson(path) {
    try {
        return JSON.parse((0, node_fs_1.readFileSync)(path, "utf8"));
    }
    catch {
        return null;
    }
}
function readFileSafe(path) {
    try {
        return (0, node_fs_1.readFileSync)(path, "utf8");
    }
    catch {
        return "";
    }
}
function unescapeXml(value) {
    return value
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}
//# sourceMappingURL=watcher-health.js.map