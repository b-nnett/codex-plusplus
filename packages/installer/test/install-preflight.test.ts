import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { preflightWritableTargets } from "../src/commands/install";

test("install preflight checks Info.plist before patching", { skip: process.platform === "win32" }, () => {
  withTempDir((root) => {
    const resourcesDir = join(root, "Contents", "Resources");
    const frameworkDir = join(
      root,
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
      "Versions",
      "A",
    );
    mkdirSync(resourcesDir, { recursive: true });
    mkdirSync(frameworkDir, { recursive: true });

    const asarPath = join(resourcesDir, "app.asar");
    const metaPath = join(root, "Contents", "Info.plist");
    const electronBinary = join(frameworkDir, "Electron Framework");
    writeFileSync(asarPath, "");
    writeFileSync(metaPath, "");
    writeFileSync(electronBinary, "");
    chmodSync(metaPath, 0o444);

    try {
      let error: unknown;
      assert.throws(
        () => {
          try {
            preflightWritableTargets(
              {
                resourcesDir,
                asarPath,
                metaPath,
                electronBinary,
                platform: "darwin",
              },
              { fuseFlip: true },
            );
          } catch (e) {
            error = e;
            throw e;
          }
        },
        /Cannot write to .*Info\.plist/,
      );
      assert.match(String(error), /run the installer itself with sudo/);
      assert.match(String(error), /sudo codexplusplus install/);
      assert.match(String(error), /Avoid `sudo curl \.\.\. \| bash`/);
    } finally {
      chmodSync(metaPath, 0o644);
    }
  });
});

test("install preflight checks Electron Framework when fuse flip is enabled", { skip: process.platform === "win32" }, () => {
  withTempDir((root) => {
    const resourcesDir = join(root, "Contents", "Resources");
    const frameworkDir = join(
      root,
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
      "Versions",
      "A",
    );
    mkdirSync(resourcesDir, { recursive: true });
    mkdirSync(frameworkDir, { recursive: true });

    const asarPath = join(resourcesDir, "app.asar");
    const metaPath = join(root, "Contents", "Info.plist");
    const electronBinary = join(frameworkDir, "Electron Framework");
    writeFileSync(asarPath, "");
    writeFileSync(metaPath, "");
    writeFileSync(electronBinary, "");
    chmodSync(electronBinary, 0o444);

    try {
      assert.throws(
        () =>
          preflightWritableTargets(
            {
              resourcesDir,
              asarPath,
              metaPath,
              electronBinary,
              platform: "darwin",
            },
            { fuseFlip: true },
          ),
        /Cannot write to .*Electron Framework/,
      );
    } finally {
      chmodSync(electronBinary, 0o644);
    }
  });
});

function withTempDir(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "codexpp-install-preflight-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
