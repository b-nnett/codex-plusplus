import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import asar from "@electron/asar";
import { backupOnce, readFileInAsar, readHeaderHash } from "../src/asar.js";
import { prepareBackupSet } from "../src/backups.js";
import type { InstallerState } from "../src/state.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("new app installation replaces a stale backup set", async () => {
  const root = makeRoot();
  const oldAsar = await createAsar(root, "old.asar", { version: "1" });
  const currentAsar = await createAsar(root, "current.asar", { version: "2" });
  const backupDir = join(root, "backup");
  mkdirSync(backupDir);
  cpSync(oldAsar, join(backupDir, "app.asar"));
  writeFileSync(join(backupDir, "Electron Framework"), "old");

  const rotated = prepareBackupSet({
    appRoot: "/apps/new",
    asarPath: currentAsar,
    backupDir,
    previousState: stateFor("/apps/old", oldAsar, oldAsar),
  });
  backupOnce(currentAsar, join(backupDir, "app.asar"));

  assert.equal(rotated, true);
  assert.equal(readPackageVersion(join(backupDir, "app.asar")), "2");
  assert.equal(existsSync(join(backupDir, "Electron Framework")), false);
});

test("in-place app update replaces the previous build backup", async () => {
  const root = makeRoot();
  const oldAsar = await createAsar(root, "old.asar", { version: "1" });
  const currentAsar = await createAsar(root, "current.asar", { version: "2" });
  const backupDir = join(root, "backup");
  mkdirSync(backupDir);
  cpSync(oldAsar, join(backupDir, "app.asar"));

  const rotated = prepareBackupSet({
    appRoot: "/apps/current",
    asarPath: currentAsar,
    backupDir,
    previousState: stateFor("/apps/current", oldAsar, oldAsar),
  });

  assert.equal(rotated, true);
});

test("repeated install preserves a matching pristine backup", async () => {
  const root = makeRoot();
  const pristineAsar = await createAsar(root, "pristine.asar", { version: "2" });
  const patchedAsar = await createAsar(root, "patched.asar", {
    version: "2",
    main: "codex-plusplus-loader.cjs",
    __codexpp: { originalMain: "bootstrap.js" },
  });
  const backupDir = join(root, "backup");
  mkdirSync(backupDir);
  cpSync(pristineAsar, join(backupDir, "app.asar"));

  const rotated = prepareBackupSet({
    appRoot: "/apps/current",
    asarPath: patchedAsar,
    backupDir,
    previousState: stateFor("/apps/current", pristineAsar, patchedAsar),
  });

  assert.equal(rotated, false);
  assert.equal(readPackageVersion(join(backupDir, "app.asar")), "2");
});

test("repeated install rejects a stale pristine backup", async () => {
  const root = makeRoot();
  const staleAsar = await createAsar(root, "stale.asar", { version: "1" });
  const pristineAsar = await createAsar(root, "pristine.asar", { version: "2" });
  const patchedAsar = await createAsar(root, "patched.asar", {
    version: "2",
    main: "codex-plusplus-loader.cjs",
    __codexpp: { originalMain: "bootstrap.js" },
  });
  const backupDir = join(root, "backup");
  mkdirSync(backupDir);
  cpSync(staleAsar, join(backupDir, "app.asar"));

  assert.throws(
    () =>
      prepareBackupSet({
        appRoot: "/apps/current",
        asarPath: patchedAsar,
        backupDir,
        previousState: stateFor("/apps/current", pristineAsar, patchedAsar),
      }),
    /backup does not match the patched app/,
  );
  assert.equal(readPackageVersion(join(backupDir, "app.asar")), "1");
});

test("invalid target metadata does not retire the existing backup", async () => {
  const root = makeRoot();
  const staleAsar = await createAsar(root, "stale.asar", { version: "1" });
  const invalidAsar = await createAsarWithPackage(root, "invalid.asar", "{invalid");
  const backupDir = join(root, "backup");
  mkdirSync(backupDir);
  cpSync(staleAsar, join(backupDir, "app.asar"));

  assert.throws(() =>
    prepareBackupSet({
      appRoot: "/apps/new",
      asarPath: invalidAsar,
      backupDir,
      previousState: null,
    }),
  );
  assert.equal(readPackageVersion(join(backupDir, "app.asar")), "1");
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "codexpp-backups-"));
  roots.push(root);
  return root;
}

async function createAsar(
  root: string,
  name: string,
  pkg: Record<string, unknown>,
): Promise<string> {
  const source = join(root, `${name}.source`);
  const destination = join(root, name);
  mkdirSync(source);
  writeFileSync(
    join(source, "package.json"),
    JSON.stringify({ name: "test-codex", main: "bootstrap.js", ...pkg }),
  );
  await asar.createPackage(source, destination);
  return destination;
}

async function createAsarWithPackage(
  root: string,
  name: string,
  packageSource: string,
): Promise<string> {
  const source = join(root, `${name}.source`);
  const destination = join(root, name);
  mkdirSync(source);
  writeFileSync(join(source, "package.json"), packageSource);
  await asar.createPackage(source, destination);
  return destination;
}

function stateFor(appRoot: string, originalAsar: string, patchedAsar: string): InstallerState {
  return {
    version: "test",
    installedAt: new Date(0).toISOString(),
    appRoot,
    originalAsarHash: readHeaderHash(originalAsar).headerHash,
    patchedAsarHash: readHeaderHash(patchedAsar).headerHash,
    codexVersion: null,
    fuseFlipped: false,
    resigned: false,
    originalEntryPoint: "bootstrap.js",
    watcher: "none",
  };
}

function readPackageVersion(asarPath: string): string {
  const pkg = JSON.parse(readFileInAsar(asarPath, "package.json").toString()) as {
    version: string;
  };
  return pkg.version;
}
