import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inferCodexChannel, locateCodex } from "../src/platform";

test("inferCodexChannel detects stable and beta metadata", () => {
  assert.equal(inferCodexChannel("com.openai.codex", "Codex"), "stable");
  assert.equal(inferCodexChannel("com.openai.codex.beta", "Codex (Beta)"), "beta");
  assert.equal(inferCodexChannel(null, "Codex (Beta)"), "beta");
});

test("locateCodex reads beta bundle metadata from override path on macOS", { skip: process.platform !== "darwin" }, () => {
  const root = mkdtempSync(join(tmpdir(), "codexpp-platform-"));
  try {
    const app = join(root, "Codex (Beta).app");
    mkdirSync(join(app, "Contents", "Resources"), { recursive: true });
    mkdirSync(
      join(app, "Contents", "Frameworks", "Electron Framework.framework", "Versions", "A"),
      { recursive: true },
    );
    writeFileSync(join(app, "Contents", "Resources", "app.asar"), "");
    writeFileSync(
      join(app, "Contents", "Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>Codex (Beta)</string>
  <key>CFBundleExecutable</key><string>Codex (Beta)</string>
  <key>CFBundleIdentifier</key><string>com.openai.codex.beta</string>
</dict></plist>`,
    );

    const codex = locateCodex(app);
    assert.equal(codex.appName, "Codex (Beta)");
    assert.equal(codex.bundleId, "com.openai.codex.beta");
    assert.equal(codex.channel, "beta");
    assert.equal(codex.executable.endsWith("Contents/MacOS/Codex (Beta)"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("locateCodex supports am-will codex-app Linux install directory", { skip: process.platform !== "linux" }, () => {
  const root = mkdtempSync(join(tmpdir(), "codexpp-platform-"));
  try {
    const app = join(root, "codex-desktop");
    mkdirSync(join(app, "resources"), { recursive: true });
    writeFileSync(join(app, "resources", "app.asar"), "");
    writeFileSync(join(app, "Codex"), "");

    const codex = locateCodex(app);
    assert.equal(codex.appRoot, app);
    assert.equal(codex.resourcesDir, join(app, "resources"));
    assert.equal(codex.asarPath, join(app, "resources", "app.asar"));
    assert.equal(codex.electronBinary, join(app, "Codex"));
    assert.equal(codex.executable, join(app, "Codex"));
    assert.equal(codex.platform, "linux");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("locateCodex accepts a Linux launcher symlink override", { skip: process.platform !== "linux" }, () => {
  const root = mkdtempSync(join(tmpdir(), "codexpp-platform-"));
  try {
    const app = join(root, "codex-desktop");
    const bin = join(root, "bin");
    mkdirSync(join(app, "resources"), { recursive: true });
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(app, "resources", "app.asar"), "");
    writeFileSync(join(app, "Codex"), "");
    symlinkSync(join(app, "Codex"), join(bin, "codex-desktop"));

    const codex = locateCodex(join(bin, "codex-desktop"));
    assert.equal(codex.appRoot, app);
    assert.equal(codex.resourcesDir, join(app, "resources"));
    assert.equal(codex.electronBinary, join(app, "Codex"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
