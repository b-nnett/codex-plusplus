import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildCliFailureIssueUrl, buildPatchFailureIssueUrl } from "../src/alerts";
import { findCodexMainCandidates } from "../src/commands/install";
import { createTweak } from "../src/commands/create-tweak";
import { devTweak } from "../src/commands/dev-tweak";
import { safeMode } from "../src/commands/safe-mode";
import {
  releaseVersionFromTag,
  shouldDownloadSelfUpdate,
} from "../src/commands/self-update";
import { validateTweak } from "../src/commands/validate-tweak";
import {
  CODEX_WINDOW_SERVICES_KEY,
  patchCodexWindowServicesSource,
} from "../src/codex-window-services";

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

test("window services patch supports appBrand before buildFlavor", () => {
  const source =
    "let R=Une({appBrand:a.U(),buildFlavor:o,allowDevtools:g,allowDebugMenu:v,allowInspectElement:_,globalState:I.globalState,settingsStore:I.settingsStore,desktopRoot:I.desktopRoot,preloadPath:I.preloadPath,repoRoot:I.repoRoot,disposables:P}),trusted=e=>R.isTrustedIpcSender(e.sender);H6({buildFlavor:o,isTrustedIpcEvent:trusted})";

  const patched = patchCodexWindowServicesSource(source);

  assert.ok(patched);
  assert.equal(patched.serviceVar, "R");
  assert.match(
    patched.source,
    /;globalThis\.__codexpp_window_services__=R;H6\(\{buildFlavor:o/,
  );
});

test("window services patch is idempotent when the marker is already present", () => {
  const source = `let M=FM({buildFlavor:a,allowDevtools:p,globalState:j.globalState,getGlobalStateForHost:j.getGlobalStateForHost,desktopRoot:j.desktopRoot,preloadPath:j.preloadPath,repoRoot:j.repoRoot,disposables:k});globalThis.${CODEX_WINDOW_SERVICES_KEY}=M;wD({buildFlavor:a})`;

  const patched = patchCodexWindowServicesSource(source);

  assert.ok(patched);
  assert.equal(patched.changed, false);
  assert.equal(patched.source, source);
});

test("window services patch ignores unrelated buildFlavor factories", () => {
  const source = "let x=Fn({buildFlavor:a,foo:b,bar:c});Other({buildFlavor:a})";

  assert.equal(patchCodexWindowServicesSource(source), null);
});

test("main candidate discovery supports nested recovered app bundle layout", () => {
  withTempDir((root) => {
    const buildDir = join(root, "recovered", "app-asar-extracted", ".vite", "build");
    mkdirSync(buildDir, { recursive: true });
    const bootstrap = join(buildDir, "bootstrap.js");
    const main = join(buildDir, "main-SLemWUtC.js");
    writeFileSync(bootstrap, "");
    writeFileSync(main, "");

    const candidates = findCodexMainCandidates(
      root,
      "recovered/app-asar-extracted/.vite/build/bootstrap.js",
    );

    assert.deepEqual(candidates, [bootstrap, main]);
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
