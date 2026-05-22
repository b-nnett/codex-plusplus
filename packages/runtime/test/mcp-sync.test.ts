import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildManagedMcpBlock,
  mcpServerNameFromTweakId,
  syncManagedMcpServers,
} from "../src/mcp-sync";

test("mcpServerNameFromTweakId matches Bennett tweak names", () => {
  assert.equal(mcpServerNameFromTweakId("co.bennett.native-widgets"), "native-widgets");
  assert.equal(mcpServerNameFromTweakId("co.bennett.project-home"), "project-home");
  assert.equal(mcpServerNameFromTweakId("com.example.my-widget"), "com-example-my-widget");
});

test("buildManagedMcpBlock creates TOML entries and resolves local server scripts", () => {
  withTempDir((root) => {
    const tweakDir = join(root, "co.bennett.native-widgets");
    mkdirSync(tweakDir, { recursive: true });
    writeFileSync(join(tweakDir, "mcp-server.js"), "");

    const built = buildManagedMcpBlock([
      {
        dir: tweakDir,
        manifest: {
          id: "co.bennett.native-widgets",
          mcp: {
            command: "node",
            args: ["mcp-server.js"],
            env: { WIDGETS: "1" },
          },
        },
      },
    ]);

    assert.deepEqual(built.serverNames, ["native-widgets"]);
    assert.equal(built.skippedServerNames.length, 0);
    assert.match(built.block, /\[mcp_servers\.native-widgets\]/);
    assert.match(built.block, /command = "node"/);
    const expectedArgPath = JSON.stringify(join(tweakDir, "mcp-server.js"));
    assert.match(built.block, new RegExp(`args = \\[${escapeRegExp(expectedArgPath)}\\]`));
    assert.match(built.block, /env = \{ WIDGETS = "1" \}/);
  });
});

test("buildManagedMcpBlock keeps user-managed names and allocates a suffixed managed name", () => {
  withTempDir((root) => {
    const built = buildManagedMcpBlock(
      [
        {
          dir: root,
          manifest: {
            id: "co.bennett.project-home",
            mcp: { command: "node", args: ["server.js"] },
          },
        },
      ],
      `[mcp_servers.project-home]\ncommand = "node"\n`,
    );

    assert.match(built.block, /\[mcp_servers\.project-home-2\]/);
    assert.deepEqual(built.serverNames, ["project-home-2"]);
    assert.deepEqual(built.skippedServerNames, ["project-home"]);
  });
});

test("buildManagedMcpBlock allows computer-use tweak to coexist with an existing computer-use server", () => {
  withTempDir((root) => {
    const tweakDir = join(root, "co.bennett.computer-use");
    mkdirSync(tweakDir, { recursive: true });
    writeFileSync(join(tweakDir, "computer-use-mcp.js"), "");

    const built = buildManagedMcpBlock(
      [
        {
          dir: tweakDir,
          manifest: {
            id: "co.bennett.computer-use",
            mcp: { command: "node", args: ["./computer-use-mcp.js"] },
          },
        },
      ],
      `[mcp_servers.computer-use]\ncommand = "node"\n`,
    );

    assert.match(built.block, /\[mcp_servers\.computer-use-2\]/);
    assert.deepEqual(built.serverNames, ["computer-use-2"]);
    assert.deepEqual(built.skippedServerNames, ["computer-use"]);
  });
});

test("syncManagedMcpServers updates only the managed config block", () => {
  withTempDir((root) => {
    const configPath = join(root, ".codex", "config.toml");
    mkdirSync(join(root, ".codex"), { recursive: true });
    writeFileSync(configPath, `[mcp_servers.project-home]\ncommand = "node"\n`);

    const first = syncManagedMcpServers({
      configPath,
      tweaks: [
        {
          dir: root,
          manifest: {
            id: "co.bennett.native-widgets",
            mcp: { command: "node", args: ["mcp-server.js"] },
          },
        },
      ],
    });
    const afterFirst = readFileSync(configPath, "utf8");

    assert.equal(first.changed, true);
    assert.match(afterFirst, /\[mcp_servers\.project-home\]/);
    assert.match(afterFirst, /# BEGIN CODEX\+\+ MANAGED MCP SERVERS/);
    assert.match(afterFirst, /\[mcp_servers\.native-widgets\]/);

    const second = syncManagedMcpServers({ configPath, tweaks: [] });
    const afterSecond = readFileSync(configPath, "utf8");

    assert.equal(second.changed, true);
    assert.match(afterSecond, /\[mcp_servers\.project-home\]/);
    assert.doesNotMatch(afterSecond, /native-widgets/);
    assert.doesNotMatch(afterSecond, /CODEX\+\+ MANAGED/);
  });
});

test("syncManagedMcpServers leaves user config untouched when there are no MCP tweaks", () => {
  withTempDir((root) => {
    const configPath = join(root, ".codex", "config.toml");
    mkdirSync(join(root, ".codex"), { recursive: true });
    const original = `[mcp_servers.project-home]\ncommand = "node"\n\n`;
    writeFileSync(configPath, original);

    const result = syncManagedMcpServers({ configPath, tweaks: [] });

    assert.equal(result.changed, false);
    assert.equal(readFileSync(configPath, "utf8"), original);
  });
});

test("syncManagedMcpServers creates the Codex config directory", () => {
  withTempDir((root) => {
    const configPath = join(root, ".codex", "config.toml");

    syncManagedMcpServers({
      configPath,
      tweaks: [
        {
          dir: root,
          manifest: { id: "co.bennett.native-widgets", mcp: { command: "node" } },
        },
      ],
    });

    assert.equal(existsSync(configPath), true);
  });
});

function withTempDir(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "codexpp-mcp-sync-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
