import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FuseV1, readFuses, writeFuse } from "../src/fuses";

const FUSE_SENTINEL = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX", "ascii");

test("readFuses decodes the Electron fuse table", () => {
  withTempDir((root) => {
    const binary = join(root, "Electron Framework");
    writeFileSync(
      binary,
      fakeElectronBinary({
        prefix: Buffer.from("prefix"),
        fuses: ["1", "0", "3", "2", "1"],
      }),
    );

    const snapshot = readFuses(binary);

    assert.equal(snapshot.schemaVersion, 1);
    assert.equal(snapshot.count, 5);
    assert.deepEqual(snapshot.fuses, ["on", "off", "inherit", "removed", "on"]);
    assert.equal(snapshot.offset, "prefix".length + FUSE_SENTINEL.length + 2);
  });
});

test("writeFuse updates the requested fuse and preserves file mode", () => {
  withTempDir((root) => {
    const binary = join(root, "Electron Framework");
    writeFileSync(
      binary,
      fakeElectronBinary({ fuses: ["1", "1", "1", "1", "1"] }),
    );
    chmodSync(binary, 0o755);
    const modeBefore = statSync(binary).mode & 0o777;

    const result = writeFuse(binary, "EnableEmbeddedAsarIntegrityValidation", "off");
    const snapshot = readFuses(binary);

    assert.deepEqual(result, { from: "on", to: "off" });
    assert.equal(snapshot.fuses[FuseV1.EnableEmbeddedAsarIntegrityValidation], "off");
    assert.equal(statSync(binary).mode & 0o777, modeBefore);
  });
});

test("writeFuse is a no-op when the fuse already has the requested value", () => {
  withTempDir((root) => {
    const binary = join(root, "Electron Framework");
    writeFileSync(
      binary,
      fakeElectronBinary({ fuses: ["1", "1", "1", "1", "0"] }),
    );

    const result = writeFuse(binary, "EnableEmbeddedAsarIntegrityValidation", "off");

    assert.deepEqual(result, { from: "off", to: "off" });
    assert.equal(readFuses(binary).fuses[FuseV1.EnableEmbeddedAsarIntegrityValidation], "off");
  });
});

test("readFuses rejects binaries without the Electron fuse sentinel", () => {
  withTempDir((root) => {
    const binary = join(root, "not-electron");
    writeFileSync(binary, "plain executable");

    assert.throws(() => readFuses(binary), /Fuse sentinel not found/);
  });
});

test("readFuses rejects unsupported fuse schema versions", () => {
  withTempDir((root) => {
    const binary = join(root, "Electron Framework");
    writeFileSync(binary, fakeElectronBinary({ schemaVersion: 2, fuses: ["1"] }));

    assert.throws(() => readFuses(binary), /Unsupported fuse schema version: 2/);
  });
});

test("readFuses rejects implausible fuse counts", () => {
  withTempDir((root) => {
    const binary = join(root, "Electron Framework");
    writeFileSync(binary, fakeElectronBinary({ count: 33, fuses: ["1"] }));

    assert.throws(() => readFuses(binary), /Implausible fuse count: 33/);
  });
});

test("readFuses rejects unknown fuse byte values", () => {
  withTempDir((root) => {
    const binary = join(root, "Electron Framework");
    writeFileSync(binary, fakeElectronBinary({ rawFuses: Buffer.from([0x78]) }));

    assert.throws(() => readFuses(binary), /Unknown fuse byte 0x78 at index 0/);
  });
});

test("writeFuse rejects fuses that are not present in the binary", () => {
  withTempDir((root) => {
    const binary = join(root, "Electron Framework");
    writeFileSync(binary, fakeElectronBinary({ fuses: ["1", "1", "1", "1"] }));

    assert.throws(
      () => writeFuse(binary, "EnableEmbeddedAsarIntegrityValidation", "off"),
      /is beyond this binary's fuse count \(4\)/,
    );
  });
});

function fakeElectronBinary(opts: {
  prefix?: Buffer;
  schemaVersion?: number;
  count?: number;
  fuses?: string[];
  rawFuses?: Buffer;
}): Buffer {
  const rawFuses = opts.rawFuses ?? Buffer.from((opts.fuses ?? []).join(""), "ascii");
  return Buffer.concat([
    opts.prefix ?? Buffer.from(""),
    FUSE_SENTINEL,
    Buffer.from([opts.schemaVersion ?? 1, opts.count ?? rawFuses.length]),
    rawFuses,
    Buffer.from("suffix"),
  ]);
}

function withTempDir(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "codexpp-fuses-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
