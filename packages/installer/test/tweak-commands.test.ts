import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildCliFailureIssueUrl, buildPatchFailureIssueUrl, isMacAppManagementError } from "../src/alerts";
import { findCodexMainCandidates } from "../src/commands/install";
import { createTweak } from "../src/commands/create-tweak";
import { devTweak } from "../src/commands/dev-tweak";
import { shouldPromptToQuitBeforeRepair } from "../src/commands/repair";
import { safeMode } from "../src/commands/safe-mode";
import {
  ensureCliExecutable,
  formatCommandFailure,
  releaseVersionFromTag,
  shouldDownloadSelfUpdate,
  shouldRunWatcherSelfUpdate,
} from "../src/commands/self-update";
import { validateTweak } from "../src/commands/validate-tweak";
import {
  CODEX_WINDOW_SERVICES_KEY,
  patchCodexWindowServicesSource,
} from "../src/codex-window-services";
import { readSelfUpdateState, writeSelfUpdateState } from "../src/self-update-state";
import { describeInstallationSource } from "../src/source-root";
import { watcherShellScript } from "../src/watcher";

test("createTweak scaffolds a both-scope tweak", () => {
  withTempDir((root) => {
    const dir = join(root, "my-tweak");

    withSilencedConsole(() =>
      createTweak(dir, {
        id: "com.example.generated",
        name: "Generated",
        repo: "example/generated",
        scope: "both",
      }),
    );

    assert.equal(existsSync(join(dir, "manifest.json")), true);
    assert.equal(existsSync(join(dir, "index.js")), true);
    assert.equal(existsSync(join(dir, "README.md")), true);
    assert.equal(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).scope, "both");
  });
});

test("createTweak refuses non-empty target directories unless forced empty", () => {
  withTempDir((root) => {
    const dir = join(root, "existing");
    withSilencedConsole(() => createTweak(dir, { repo: "example/existing" }));

    assert.throws(
      () => withSilencedConsole(() => createTweak(dir, { repo: "example/existing" })),
      /not empty/,
    );
  });
});

test("validateTweak accepts a generated tweak", () => {
  withTempDir((root) => {
    const dir = join(root, "valid");

    withSilencedConsole(() => createTweak(dir, { repo: "example/valid", scope: "renderer" }));

    assert.doesNotThrow(() => withSilencedConsole(() => validateTweak(dir)));
  });
});

test("validateTweak rejects missing entry files", () => {
  withTempDir((root) => {
    const dir = join(root, "missing-entry");
    withSilencedConsole(() => createTweak(dir, { repo: "example/missing-entry" }));
    rmSync(join(dir, "index.js"));

    assert.throws(() => withSilencedConsole(() => validateTweak(dir)), /validation failed/);
  });
});

test("validateTweak rejects invalid manifests", () => {
  withTempDir((root) => {
    const dir = join(root, "invalid");
    withSilencedConsole(() => createTweak(dir, { repo: "example/invalid" }));
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ id: "bad id" }));

    assert.throws(() => withSilencedConsole(() => validateTweak(dir)), /validation failed/);
  });
});

test("devTweak links a valid tweak into the configured tweaks directory", async () => {
  await withTempEnvAsync(async (envRoot) => {
    await withTempDirAsync(async (root) => {
      const dir = join(root, "linked");
      withSilencedConsole(() => createTweak(dir, { repo: "example/linked" }));

      await withSilencedConsoleAsync(() => devTweak(dir, { watch: false }));

      const link = join(envRoot, "tweaks", "com.example.linked");
      assert.equal(existsSync(link), true);
    });
  });
});

test("devTweak refuses to replace a link pointing elsewhere without --replace", async () => {
  await withTempEnvAsync(async (envRoot) => {
    await withTempDirAsync(async (root) => {
      const first = join(root, "first");
      const second = join(root, "second");
      withSilencedConsole(() => createTweak(first, { repo: "example/first" }));
      withSilencedConsole(() =>
        createTweak(second, {
          id: "com.example.first",
          repo: "example/second",
        }),
      );

      await withSilencedConsoleAsync(() => devTweak(first, { watch: false }));

      await assert.rejects(
        () => withSilencedConsoleAsync(() => devTweak(second, { watch: false })),
        /already exists/,
      );

      const link = join(envRoot, "tweaks", "com.example.first");
      assert.equal(existsSync(link), true);
    });
  });
});

test("devTweak replaces an existing dev link when requested", async () => {
  await withTempEnvAsync(async (envRoot) => {
    await withTempDirAsync(async (root) => {
      const first = join(root, "replace-first");
      const second = join(root, "replace-second");
      withSilencedConsole(() => createTweak(first, { repo: "example/replace-first" }));
      withSilencedConsole(() =>
        createTweak(second, {
          id: "com.example.replace-first",
          repo: "example/replace-second",
        }),
      );

      await withSilencedConsoleAsync(() => devTweak(first, { watch: false }));
      await withSilencedConsoleAsync(() => devTweak(second, { replace: true, watch: false }));

      const link = join(envRoot, "tweaks", "com.example.replace-first");
      assert.equal(existsSync(join(link, "manifest.json")), true);
      assert.match(readFileSync(join(link, "manifest.json"), "utf8"), /replace-second/);
    });
  });
});

test("devTweak rejects invalid tweak directories", async () => {
  await withTempEnvAsync(async () => {
    await withTempDirAsync(async (root) => {
      await assert.rejects(
        () => withSilencedConsoleAsync(() => devTweak(root, { watch: false })),
        /manifest not found/,
      );
    });
  });
});

test("safeMode enables safe mode without changing per-tweak flags", async () => {
  await withTempEnvAsync(async (envRoot) => {
    writeFileSync(
      join(envRoot, "config.json"),
      JSON.stringify({ tweaks: { "com.example.keep": { enabled: true } } }),
    );

    withSilencedConsole(() => safeMode());

    const config = JSON.parse(readFileSync(join(envRoot, "config.json"), "utf8"));
    assert.equal(config.codexPlusPlus.safeMode, true);
    assert.equal(config.tweaks["com.example.keep"].enabled, true);
    assert.equal(existsSync(join(envRoot, "tweaks", ".codexpp-safe-mode-reload")), true);
  });
});

test("safeMode disables safe mode with --off", async () => {
  await withTempEnvAsync(async (envRoot) => {
    writeFileSync(
      join(envRoot, "config.json"),
      JSON.stringify({ codexPlusPlus: { safeMode: true } }),
    );

    withSilencedConsole(() => safeMode({ off: true }));

    const config = JSON.parse(readFileSync(join(envRoot, "config.json"), "utf8"));
    assert.equal(config.codexPlusPlus.safeMode, false);
  });
});

test("safeMode status does not create config", async () => {
  await withTempEnvAsync(async (envRoot) => {
    withSilencedConsole(() => safeMode({ status: true }));

    assert.equal(existsSync(join(envRoot, "config.json")), false);
  });
});

test("safeMode rejects conflicting flags", async () => {
  await withTempEnvAsync(async () => {
    assert.throws(() => withSilencedConsole(() => safeMode({ on: true, off: true })), /only one/);
  });
});

test("window services patch separates the exposed service from the next setup call", () => {
  const source =
    "let M=FM({buildFlavor:a,allowDevtools:p,globalState:j.globalState,getGlobalStateForHost:j.getGlobalStateForHost,desktopRoot:j.desktopRoot,preloadPath:j.preloadPath,repoRoot:j.repoRoot,disposables:k}),N=e=>M.isTrustedIpcSender(e.sender);wD({buildFlavor:a,isTrustedIpcEvent:N}),n.ipcMain.on(Li,e=>{})";

  const patched = patchCodexWindowServicesSource(source);

  assert.ok(patched);
  assert.equal(patched.changed, true);
  assert.equal(patched.strategy, "service-factory-fingerprint");
  assert.match(
    patched.source,
    /;globalThis\.__codexpp_window_services__=M;wD\(\{buildFlavor:a/,
  );
  assert.doesNotMatch(patched.source, /__codexpp_window_services__=MwD/);
});

test("window services patch repairs the missing-separator state from Codex 26.429", () => {
  const source =
    "let M=FM({buildFlavor:a,allowDevtools:p,globalState:j.globalState,getGlobalStateForHost:j.getGlobalStateForHost,desktopRoot:j.desktopRoot,preloadPath:j.preloadPath,repoRoot:j.repoRoot,disposables:k}),N=e=>M.isTrustedIpcSender(e.sender);;globalThis.__codexpp_window_services__=MwD({buildFlavor:a,isTrustedIpcEvent:N}),n.ipcMain.on(Li,e=>{})";

  const patched = patchCodexWindowServicesSource(source);

  assert.ok(patched);
  assert.equal(patched.changed, true);
  assert.equal(patched.strategy, "repair-missing-separator");
  assert.match(
    patched.source,
    /;globalThis\.__codexpp_window_services__=M;wD\(\{buildFlavor:a/,
  );
  assert.doesNotMatch(patched.source, /__codexpp_window_services__=MwD/);
});

test("window services patch does not depend on Codex minified function names", () => {
  const source =
    "let services=Qa({buildFlavor:a,allowDevtools:p,allowDebugMenu:h,globalState:j.globalState,getGlobalStateForHost:j.getGlobalStateForHost,desktopRoot:j.desktopRoot,preloadPath:j.preloadPath,repoRoot:j.repoRoot,canHideLastLocalWindowToTray:()=>O,disposables:k}),trusted=e=>services.isTrustedIpcSender(e.sender);Zd({buildFlavor:a,isTrustedIpcEvent:trusted})";

  const patched = patchCodexWindowServicesSource(source);

  assert.ok(patched);
  assert.equal(patched.serviceVar, "services");
  assert.match(
    patched.source,
    /;globalThis\.__codexpp_window_services__=services;Zd\(\{buildFlavor:a/,
  );
});

test("window services patch handles reordered factory object properties", () => {
  const source =
    "let M=FM({allowDevtools:p,allowDebugMenu:h,globalState:j.globalState,getGlobalStateForHost:j.getGlobalStateForHost,desktopRoot:j.desktopRoot,preloadPath:j.preloadPath,repoRoot:j.repoRoot,disposables:k,buildFlavor:a}),N=e=>M.isTrustedIpcSender(e.sender);wD({buildFlavor:a,isTrustedIpcEvent:N})";

  const patched = patchCodexWindowServicesSource(source);

  assert.ok(patched);
  assert.equal(patched.serviceVar, "M");
  assert.match(
    patched.source,
    /;globalThis\.__codexpp_window_services__=M;wD\(\{buildFlavor:a/,
  );
});

test("window services patch handles quoted factory object properties", () => {
  const source =
    "let M=FM({'buildFlavor':a,'allowDevtools':p,'allowDebugMenu':h,'globalState':j.globalState,'getGlobalStateForHost':j.getGlobalStateForHost,'desktopRoot':j.desktopRoot,'preloadPath':j.preloadPath,'repoRoot':j.repoRoot,'disposables':k});next()";

  const patched = patchCodexWindowServicesSource(source);

  assert.ok(patched);
  assert.equal(patched.serviceVar, "M");
  assert.match(patched.source, /;globalThis\.__codexpp_window_services__=M;next\(\)/);
});

test("window services patch is idempotent when the marker is already present", () => {
  const source = `let M=FM({buildFlavor:a,allowDevtools:p,globalState:j.globalState,getGlobalStateForHost:j.getGlobalStateForHost,desktopRoot:j.desktopRoot,preloadPath:j.preloadPath,repoRoot:j.repoRoot,disposables:k});globalThis.${CODEX_WINDOW_SERVICES_KEY}=M;wD({buildFlavor:a})`;

  const patched = patchCodexWindowServicesSource(source);

  assert.ok(patched);
  assert.equal(patched.changed, false);
  assert.equal(patched.source, source);
});

test("window services patch falls back to lifecycle registration fingerprint", () => {
  const source = [
    "let M=oG({theme:a,featureFlags:b});",
    "_B({isWindows:E,quitState:ee,windows:M,applicationMenuManager:oe.applicationMenuManager,ensureHostWindow:M.ensureHostWindow,hotkeyWindowLifecycleManager:M.hotkeyWindowLifecycleManager,globalDictationLifecycleManager:M.globalDictationLifecycleManager,globalStatesByHostId:j.globalStatesByHostId,flushAndDisposeContexts:I.flushAndDisposeContexts,disposables:k,appEvent:F.appEvent,errorReporter:g});",
  ].join("");

  const patched = patchCodexWindowServicesSource(source);

  assert.ok(patched);
  assert.equal(patched.changed, true);
  assert.equal(patched.strategy, "lifecycle-registration-fingerprint");
  assert.equal(patched.serviceVar, "M");
  assert.match(patched.source, /;globalThis\.__codexpp_window_services__=M;$/);
});

test("window services patch ignores unrelated buildFlavor factories", () => {
  const source = "let x=Fn({buildFlavor:a,foo:b,bar:c});Other({buildFlavor:a})";

  assert.equal(patchCodexWindowServicesSource(source), null);
});

test("Codex main candidates include nested recovered Vite bundle files", () => {
  withTempDir((root) => {
    const buildDir = join(root, ".vite", "build");
    mkdirSync(buildDir, { recursive: true });
    writeFileSync(join(root, "bootstrap.js"), "");
    writeFileSync(join(buildDir, "main-abc123.js"), "");
    writeFileSync(join(buildDir, "renderer-abc123.js"), "");

    assert.deepEqual(findCodexMainCandidates(root, "bootstrap.js"), [
      join(root, "bootstrap.js"),
      join(buildDir, "main-abc123.js"),
    ]);
  });
});

test("patch failure report URL includes a prefilled GitHub issue", () => {
  const url = new URL(buildPatchFailureIssueUrl("Codex window services hook point not found"));

  assert.equal(url.origin + url.pathname, "https://github.com/b-nnett/codex-plusplus/issues/new");
  assert.equal(url.searchParams.get("title"), "Codex++ failed to patch Codex after update");
  assert.match(url.searchParams.get("body") ?? "", /Codex window services hook point not found/);
  assert.match(url.searchParams.get("body") ?? "", /Platform:/);
});

test("CLI failure report URL includes command and environment details", () => {
  const url = new URL(buildCliFailureIssueUrl("install", "codesign not installed"));

  assert.equal(url.origin + url.pathname, "https://github.com/b-nnett/codex-plusplus/issues/new");
  assert.equal(url.searchParams.get("title"), "Codex++ install failed");
  assert.match(url.searchParams.get("body") ?? "", /codexplusplus install/);
  assert.match(url.searchParams.get("body") ?? "", /codesign not installed/);
  assert.match(url.searchParams.get("body") ?? "", /Codex\+\+:/);
  assert.match(url.searchParams.get("body") ?? "", /Node:/);
});

test("App Management failures use the dedicated repair alert path", () => {
  assert.equal(
    isMacAppManagementError("macOS App Management is blocking modification of /Applications/Codex.app."),
    true,
  );
  assert.equal(isMacAppManagementError("Codex window services hook point not found"), false);
});

test("self-update release tags only download newer semver releases", () => {
  assert.equal(releaseVersionFromTag("v0.1.3"), "0.1.3");
  assert.equal(releaseVersionFromTag("0.1.3"), "0.1.3");
  assert.equal(releaseVersionFromTag("main"), null);
  assert.equal(shouldDownloadSelfUpdate("0.1.2", "v0.1.3"), true);
  assert.equal(shouldDownloadSelfUpdate("0.1.2", "v0.1.2"), false);
  assert.equal(shouldDownloadSelfUpdate("0.1.2", "v0.1.1"), false);
  assert.equal(shouldDownloadSelfUpdate("0.1.2", "main"), true);
  assert.equal(shouldDownloadSelfUpdate("0.1.2", "v0.1.2", true), true);
});

test("self-update state persists human-readable diagnostics", () => {
  withTempDir((root) => {
    const file = join(root, "self-update-state.json");
    writeSelfUpdateState(file, {
      checkedAt: "2026-05-01T00:00:00.000Z",
      completedAt: "2026-05-01T00:00:01.000Z",
      status: "failed",
      currentVersion: "0.1.3",
      latestVersion: "0.1.4",
      targetRef: "v0.1.4",
      releaseUrl: "https://github.com/b-nnett/codex-plusplus/releases/tag/v0.1.4",
      repo: "b-nnett/codex-plusplus",
      channel: "stable",
      sourceRoot: root,
      error: "download failed",
    });

    const state = readSelfUpdateState(file);
    assert.equal(state?.status, "failed");
    assert.equal(state?.latestVersion, "0.1.4");
    assert.equal(state?.error, "download failed");
  });
});

test("watcher self-update checks stay hourly while repair can run more often", () => {
  withTempDir((root) => {
    const file = join(root, "self-update-state.json");
    const checkedAt = Date.parse("2026-05-01T00:00:00.000Z");
    writeSelfUpdateState(file, {
      checkedAt: new Date(checkedAt).toISOString(),
      completedAt: new Date(checkedAt + 1_000).toISOString(),
      status: "up-to-date",
      currentVersion: "0.1.4",
      latestVersion: "0.1.4",
      targetRef: "v0.1.4",
      releaseUrl: "https://github.com/b-nnett/codex-plusplus/releases/tag/v0.1.4",
      repo: "b-nnett/codex-plusplus",
      channel: "stable",
      sourceRoot: root,
    });

    assert.equal(shouldRunWatcherSelfUpdate(file, checkedAt + 5 * 60_000), false);
    assert.equal(shouldRunWatcherSelfUpdate(file, checkedAt + 60 * 60_000), true);
  });
});

test("watcher runs self-update and app repair as separate steps", () => {
  const script = watcherShellScript();

  assert.match(script, /update --watcher --quiet --no-repair/);
  assert.match(script, /repair --watcher --quiet/);
  assert.match(script, /update[\s\S]+\|\| true;[\s\S]+repair/);
});

test("watcher repair does not block on pre-patch quit prompt", () => {
  assert.equal(shouldPromptToQuitBeforeRepair(true, {}, {}, "darwin"), true);
  assert.equal(shouldPromptToQuitBeforeRepair(true, { watcher: true }, {}, "darwin"), false);
  assert.equal(
    shouldPromptToQuitBeforeRepair(true, {}, { CODEX_PLUSPLUS_WATCHER: "1" }, "darwin"),
    false,
  );
  assert.equal(shouldPromptToQuitBeforeRepair(false, { watcher: true }, {}, "darwin"), false);
  assert.equal(shouldPromptToQuitBeforeRepair(true, {}, {}, "linux"), false);
});

test("launchd watcher script clears stale log entries before each run", () => {
  const script = watcherShellScript("/tmp/codex plusplus/watch'er.log");

  assert.match(script, /^: > '\/tmp\/codex plusplus\/watch'\\''er\.log'; sleep 3; /);
  assert.match(script, /update --watcher --quiet --no-repair/);
  assert.match(script, /repair --watcher --quiet/);
});

test("self-update marks the installed CLI executable on unix", () => {
  if (process.platform === "win32") return;

  withTempDir((root) => {
    const dist = join(root, "packages", "installer", "dist");
    mkdirSync(dist, { recursive: true });
    const cli = join(dist, "cli.js");
    writeFileSync(cli, "#!/usr/bin/env node\n", { mode: 0o644 });

    ensureCliExecutable(root);

    assert.equal(statSync(cli).mode & 0o111, 0o111);
  });
});

test("self-update command failures include a bounded output tail", () => {
  const message = formatCommandFailure("/usr/bin/node", ["/tmp/codex plusplus/cli.js", "repair"], {
    status: 1,
    signal: null,
    stdout: "stdout detail",
    stderr: "nested repair error",
  });

  assert.match(message, /'\/tmp\/codex plusplus\/cli\.js' repair failed with exit code 1/);
  assert.match(message, /stderr:\nnested repair error/);
  assert.match(message, /stdout:\nstdout detail/);
});

test("repair keeps local signing opt-in", () => {
  const source = readFileSync(new URL("../src/commands/repair.ts", import.meta.url), "utf8");

  assert.match(source, /localSigning:\s*opts\.localSigning === true/);
  assert.doesNotMatch(source, /state\.signingMode === "local-identity"/);
});

test("cli documents local signing and safe mode recovery", () => {
  const source = readFileSync(new URL("../src/cli.ts", import.meta.url), "utf8");

  assert.match(source, /\.option\("--local", "Use a stable local signing identity on macOS"\)/);
  assert.match(source, /localSigning:\s*resolveLocalSigning\(opts\)/);
  assert.match(source, /opts\.local === false \|\| opts\.localSigning === false \|\| opts\["local-signing"\] === false/);
  assert.match(source, /Leave safe mode with: codexplusplus safe-mode --off/);
  assert.match(source, /process\.argv\.length <= 2 \? \[\.\.\.process\.argv, "--help"\] : process\.argv/);
});

test("install keeps local signing opt-in", () => {
  const source = readFileSync(new URL("../src/commands/install.ts", import.meta.url), "utf8");

  assert.match(source, /let localSigning = opts\.localSigning === true/);
});

test("install falls back to ad-hoc signing if local identity setup fails", () => {
  const source = readFileSync(new URL("../src/commands/install.ts", import.meta.url), "utf8");

  assert.match(source, /Local signing setup failed; falling back to ad-hoc signing/);
  assert.match(source, /localSigning = false/);
});

test("installation source labels local checkouts", () => {
  withTempDir((root) => {
    mkdirSync(join(root, ".git"));
    assert.equal(describeInstallationSource(root).kind, "local-dev");
  });
  assert.equal(
    describeInstallationSource("/opt/homebrew/Cellar/codexplusplus/0.1.4").kind,
    "homebrew",
  );
});

function withTempDir(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "codexpp-tweak-command-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function withTempDirAsync(fn: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "codexpp-tweak-command-"));
  try {
    await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function withTempEnvAsync(fn: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "codexpp-dev-env-"));
  const originalHome = process.env.CODEX_PLUSPLUS_HOME;
  process.env.CODEX_PLUSPLUS_HOME = root;
  try {
    await fn(root);
  } finally {
    if (originalHome === undefined) delete process.env.CODEX_PLUSPLUS_HOME;
    else process.env.CODEX_PLUSPLUS_HOME = originalHome;
    rmSync(root, { recursive: true, force: true });
  }
}

function withSilencedConsole(fn: () => void): void {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    fn();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

async function withSilencedConsoleAsync(fn: () => Promise<void>): Promise<void> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    await fn();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}
