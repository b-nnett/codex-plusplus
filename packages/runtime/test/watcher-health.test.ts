import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { analyzeWatcherLogTail, getWatcherHealth } from "../src/watcher-health";

test("watcher health reports missing install state as not ready", () => {
  withTempDir((root) => {
    const health = getWatcherHealth(root);

    assert.equal(health.status, "error");
    assert.equal(health.watcher, "none");
    assert.equal(health.checks[0]?.name, "Install state");
    assert.equal(health.checks[0]?.status, "error");
  });
});

test("watcher health warns when automatic refresh is disabled", () => {
  withTempDir((root) => {
    writeFileSync(
      join(root, "state.json"),
      JSON.stringify({ version: "0.1.2", watcher: "none", appRoot: "/missing" }),
    );
    writeFileSync(
      join(root, "config.json"),
      JSON.stringify({ codexPlusPlus: { autoUpdate: false } }),
    );

    const health = getWatcherHealth(root);

    assert.equal(
      health.checks.find((check) => check.name === "Automatic refresh")?.status,
      "warn",
    );
    assert.equal(
      health.checks.find((check) => check.name === "Watcher kind")?.status,
      "error",
    );
  });
});

test("watcher log health points privileged repair failures to sudo repair", () => {
  const check = analyzeWatcherLogTail(`
✗ codex-plusplus failed
Cannot write to /Applications/Codex.app/Contents/Info.plist.

macOS App Management or file ownership is blocking modification of /Applications/Codex.app/Contents/Info.plist.
Fix:
  3. If the file is root-owned or the error is EACCES, run the installer itself with sudo:
     or rerun: sudo codexplusplus install
`);

  assert.equal(check.name, "watcher log");
  assert.equal(check.status, "warn");
  assert.equal(check.detail, "auto-repair needs privileges; run `sudo codexplusplus repair`");
});

function withTempDir(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "codexpp-watcher-health-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
