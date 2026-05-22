"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCP_MANAGED_END = exports.MCP_MANAGED_START = void 0;
exports.syncManagedMcpServers = syncManagedMcpServers;
exports.buildManagedMcpBlock = buildManagedMcpBlock;
exports.mergeManagedMcpBlock = mergeManagedMcpBlock;
exports.stripManagedMcpBlock = stripManagedMcpBlock;
exports.mcpServerNameFromTweakId = mcpServerNameFromTweakId;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
exports.MCP_MANAGED_START = "# BEGIN CODEX++ MANAGED MCP SERVERS";
exports.MCP_MANAGED_END = "# END CODEX++ MANAGED MCP SERVERS";
function syncManagedMcpServers({ configPath, tweaks, }) {
    const current = (0, node_fs_1.existsSync)(configPath) ? (0, node_fs_1.readFileSync)(configPath, "utf8") : "";
    const built = buildManagedMcpBlock(tweaks, current);
    const next = mergeManagedMcpBlock(current, built.block);
    if (next !== current) {
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(configPath), { recursive: true });
        (0, node_fs_1.writeFileSync)(configPath, next, "utf8");
    }
    return { ...built, changed: next !== current };
}
function buildManagedMcpBlock(tweaks, existingToml = "") {
    const manualToml = stripManagedMcpBlock(existingToml);
    const manualNames = findMcpServerNames(manualToml);
    const usedNames = new Set(manualNames);
    const serverNames = [];
    const skippedServerNames = [];
    const entries = [];
    for (const tweak of tweaks) {
        const mcp = normalizeMcpServer(tweak.manifest.mcp);
        if (!mcp)
            continue;
        const baseName = mcpServerNameFromTweakId(tweak.manifest.id);
        if (manualNames.has(baseName)) {
            skippedServerNames.push(baseName);
        }
        const serverName = reserveUniqueName(baseName, usedNames);
        serverNames.push(serverName);
        entries.push(formatMcpServer(serverName, tweak.dir, mcp));
    }
    if (entries.length === 0) {
        return { block: "", serverNames, skippedServerNames };
    }
    return {
        block: [exports.MCP_MANAGED_START, ...entries, exports.MCP_MANAGED_END].join("\n"),
        serverNames,
        skippedServerNames,
    };
}
function mergeManagedMcpBlock(currentToml, managedBlock) {
    if (!managedBlock && !currentToml.includes(exports.MCP_MANAGED_START))
        return currentToml;
    const stripped = stripManagedMcpBlock(currentToml).trimEnd();
    if (!managedBlock)
        return stripped ? `${stripped}\n` : "";
    return `${stripped ? `${stripped}\n\n` : ""}${managedBlock}\n`;
}
function stripManagedMcpBlock(toml) {
    const pattern = new RegExp(`\\n?${escapeRegExp(exports.MCP_MANAGED_START)}[\\s\\S]*?${escapeRegExp(exports.MCP_MANAGED_END)}\\n?`, "g");
    return toml.replace(pattern, "\n").replace(/\n{3,}/g, "\n\n");
}
function mcpServerNameFromTweakId(id) {
    const withoutPublisher = id.replace(/^co\.bennett\./, "");
    const slug = withoutPublisher
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
    return slug || "tweak-mcp";
}
function findMcpServerNames(toml) {
    const names = new Set();
    const tablePattern = /^\s*\[mcp_servers\.([^\]\s]+)\]\s*$/gm;
    let match;
    while ((match = tablePattern.exec(toml)) !== null) {
        names.add(unquoteTomlKey(match[1] ?? ""));
    }
    return names;
}
function reserveUniqueName(baseName, usedNames) {
    if (!usedNames.has(baseName)) {
        usedNames.add(baseName);
        return baseName;
    }
    for (let i = 2;; i += 1) {
        const candidate = `${baseName}-${i}`;
        if (!usedNames.has(candidate)) {
            usedNames.add(candidate);
            return candidate;
        }
    }
}
function normalizeMcpServer(value) {
    if (!value || typeof value.command !== "string" || value.command.length === 0)
        return null;
    if (value.args !== undefined && !Array.isArray(value.args))
        return null;
    if (value.args?.some((arg) => typeof arg !== "string"))
        return null;
    if (value.env !== undefined) {
        if (!value.env || typeof value.env !== "object" || Array.isArray(value.env))
            return null;
        if (Object.values(value.env).some((envValue) => typeof envValue !== "string"))
            return null;
    }
    return value;
}
function formatMcpServer(serverName, tweakDir, mcp) {
    const lines = [
        `[mcp_servers.${formatTomlKey(serverName)}]`,
        `command = ${formatTomlString(resolveCommand(tweakDir, mcp.command))}`,
    ];
    if (mcp.args && mcp.args.length > 0) {
        lines.push(`args = ${formatTomlStringArray(mcp.args.map((arg) => resolveArg(tweakDir, arg)))}`);
    }
    if (mcp.env && Object.keys(mcp.env).length > 0) {
        lines.push(`env = ${formatTomlInlineTable(mcp.env)}`);
    }
    return lines.join("\n");
}
function resolveCommand(tweakDir, command) {
    if ((0, node_path_1.isAbsolute)(command) || !looksLikeRelativePath(command))
        return command;
    return (0, node_path_1.resolve)(tweakDir, command);
}
function resolveArg(tweakDir, arg) {
    if ((0, node_path_1.isAbsolute)(arg) || arg.startsWith("-"))
        return arg;
    const candidate = (0, node_path_1.resolve)(tweakDir, arg);
    return (0, node_fs_1.existsSync)(candidate) ? candidate : arg;
}
function looksLikeRelativePath(value) {
    return value.startsWith("./") || value.startsWith("../") || value.includes("/");
}
function formatTomlString(value) {
    return JSON.stringify(value);
}
function formatTomlStringArray(values) {
    return `[${values.map(formatTomlString).join(", ")}]`;
}
function formatTomlInlineTable(record) {
    return `{ ${Object.entries(record)
        .map(([key, value]) => `${formatTomlKey(key)} = ${formatTomlString(value)}`)
        .join(", ")} }`;
}
function formatTomlKey(key) {
    return /^[a-zA-Z0-9_-]+$/.test(key) ? key : formatTomlString(key);
}
function unquoteTomlKey(key) {
    if (!key.startsWith('"') || !key.endsWith('"'))
        return key;
    try {
        return JSON.parse(key);
    }
    catch {
        return key;
    }
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
//# sourceMappingURL=mcp-sync.js.map