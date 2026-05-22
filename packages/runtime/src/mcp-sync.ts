import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { TweakMcpServer } from "@codex-plusplus/sdk";

export const MCP_MANAGED_START = "# BEGIN CODEX++ MANAGED MCP SERVERS";
export const MCP_MANAGED_END = "# END CODEX++ MANAGED MCP SERVERS";

export interface McpSyncTweak {
  dir: string;
  manifest: {
    id: string;
    mcp?: TweakMcpServer;
  };
}

export interface BuiltManagedMcpBlock {
  block: string;
  serverNames: string[];
  skippedServerNames: string[];
}

export interface ManagedMcpSyncResult extends BuiltManagedMcpBlock {
  changed: boolean;
}

export function syncManagedMcpServers({
  configPath,
  tweaks,
}: {
  configPath: string;
  tweaks: McpSyncTweak[];
}): ManagedMcpSyncResult {
  const current = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const built = buildManagedMcpBlock(tweaks, current);
  const next = mergeManagedMcpBlock(current, built.block);

  if (next !== current) {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, next, "utf8");
  }

  return { ...built, changed: next !== current };
}

export function buildManagedMcpBlock(
  tweaks: McpSyncTweak[],
  existingToml = "",
): BuiltManagedMcpBlock {
  const manualToml = stripManagedMcpBlock(existingToml);
  const manualNames = findMcpServerNames(manualToml);
  const usedNames = new Set(manualNames);
  const serverNames: string[] = [];
  const skippedServerNames: string[] = [];
  const entries: string[] = [];

  for (const tweak of tweaks) {
    const mcp = normalizeMcpServer(tweak.manifest.mcp);
    if (!mcp) continue;

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
    block: [MCP_MANAGED_START, ...entries, MCP_MANAGED_END].join("\n"),
    serverNames,
    skippedServerNames,
  };
}

export function mergeManagedMcpBlock(currentToml: string, managedBlock: string): string {
  if (!managedBlock && !currentToml.includes(MCP_MANAGED_START)) return currentToml;
  const stripped = stripManagedMcpBlock(currentToml).trimEnd();
  if (!managedBlock) return stripped ? `${stripped}\n` : "";
  return `${stripped ? `${stripped}\n\n` : ""}${managedBlock}\n`;
}

export function stripManagedMcpBlock(toml: string): string {
  const pattern = new RegExp(
    `\\n?${escapeRegExp(MCP_MANAGED_START)}[\\s\\S]*?${escapeRegExp(MCP_MANAGED_END)}\\n?`,
    "g",
  );
  return toml.replace(pattern, "\n").replace(/\n{3,}/g, "\n\n");
}

export function mcpServerNameFromTweakId(id: string): string {
  const withoutPublisher = id.replace(/^co\.bennett\./, "");
  const slug = withoutPublisher
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "tweak-mcp";
}

function findMcpServerNames(toml: string): Set<string> {
  const names = new Set<string>();
  const tablePattern = /^\s*\[mcp_servers\.([^\]\s]+)\]\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(toml)) !== null) {
    names.add(unquoteTomlKey(match[1] ?? ""));
  }
  return names;
}

function reserveUniqueName(baseName: string, usedNames: Set<string>): string {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }
  for (let i = 2; ; i += 1) {
    const candidate = `${baseName}-${i}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }
}

function normalizeMcpServer(value: TweakMcpServer | undefined): TweakMcpServer | null {
  if (!value || typeof value.command !== "string" || value.command.length === 0) return null;
  if (value.args !== undefined && !Array.isArray(value.args)) return null;
  if (value.args?.some((arg) => typeof arg !== "string")) return null;
  if (value.env !== undefined) {
    if (!value.env || typeof value.env !== "object" || Array.isArray(value.env)) return null;
    if (Object.values(value.env).some((envValue) => typeof envValue !== "string")) return null;
  }
  return value;
}

function formatMcpServer(serverName: string, tweakDir: string, mcp: TweakMcpServer): string {
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

function resolveCommand(tweakDir: string, command: string): string {
  if (isAbsolute(command) || !looksLikeRelativePath(command)) return command;
  return resolve(tweakDir, command);
}

function resolveArg(tweakDir: string, arg: string): string {
  if (isAbsolute(arg) || arg.startsWith("-")) return arg;
  const candidate = resolve(tweakDir, arg);
  return existsSync(candidate) ? candidate : arg;
}

function looksLikeRelativePath(value: string): boolean {
  return value.startsWith("./") || value.startsWith("../") || value.includes("/");
}

function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

function formatTomlStringArray(values: string[]): string {
  return `[${values.map(formatTomlString).join(", ")}]`;
}

function formatTomlInlineTable(record: Record<string, string>): string {
  return `{ ${Object.entries(record)
    .map(([key, value]) => `${formatTomlKey(key)} = ${formatTomlString(value)}`)
    .join(", ")} }`;
}

function formatTomlKey(key: string): string {
  return /^[a-zA-Z0-9_-]+$/.test(key) ? key : formatTomlString(key);
}

function unquoteTomlKey(key: string): string {
  if (!key.startsWith('"') || !key.endsWith('"')) return key;
  try {
    return JSON.parse(key) as string;
  } catch {
    return key;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
