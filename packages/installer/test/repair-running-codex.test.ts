import assert from "node:assert/strict";
import test from "node:test";
import { shouldPatchWhileCodexRuns } from "../src/commands/repair";

test("watcher repair patches the app on disk even when Codex is running", () => {
  assert.equal(
    shouldPatchWhileCodexRuns({
      codexWasRunning: true,
      watcherRepair: true,
      platform: "darwin",
    }),
    true,
  );
});

test("interactive repair still prompts before patching a running Codex app", () => {
  assert.equal(
    shouldPatchWhileCodexRuns({
      codexWasRunning: true,
      watcherRepair: false,
      platform: "darwin",
    }),
    false,
  );
});
