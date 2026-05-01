import assert from "node:assert/strict";
import test from "node:test";
import { launchdWatcherCommand } from "../src/watcher";

test("launchd watcher command clears stale log entries before each run", () => {
  const command = launchdWatcherCommand("/tmp/codex plusplus/watch'er.log");

  assert.match(command, /^: > '\/tmp\/codex plusplus\/watch'\\''er\.log'; sleep 3; /);
  assert.match(command, /CODEX_PLUSPLUS_WATCHER=1/);
  assert.match(command, / update --watcher --quiet \|\| /);
  assert.match(command, / repair --quiet \|\| true$/);
});
