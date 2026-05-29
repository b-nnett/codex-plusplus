import assert from "node:assert/strict";
import asar from "@electron/asar";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cleanupTempTree, patchAsar, readHeaderHash } from "../src/asar";

test("asar temp cleanup removes extracted work trees", async () => {
  const root = mkdtempSync(join(tmpdir(), "codexpp-asar-cleanup-"));
  mkdirSync(join(root, "src", "nested"), { recursive: true });
  writeFileSync(join(root, "src", "nested", "file.txt"), "ok");

  await cleanupTempTree(root);

  assert.equal(existsSync(root), false);
});

test("patchAsar preserves many unpacked files without a giant glob", async () => {
  const root = mkdtempSync(join(tmpdir(), "codexpp-asar-unpacked-"));
  try {
    const source = join(root, "src");
    const archive = join(root, "app.asar");
    mkdirSync(join(source, "long", "nested", "tree"), { recursive: true });
    writeFileSync(join(source, "package.json"), JSON.stringify({ main: "before.js" }));

    const streams: Parameters<typeof asar.createPackageFromStreams>[1] = [
      { type: "directory", path: "long", unpacked: false },
      { type: "directory", path: "long/nested", unpacked: false },
      { type: "directory", path: "long/nested/tree", unpacked: false },
      {
        type: "file",
        path: "package.json",
        streamGenerator: () => createReadStream(join(source, "package.json")),
        unpacked: false,
        stat: readFileStat(join(source, "package.json")),
      },
    ];

    for (let i = 0; i < 700; i++) {
      const file = join(source, "long", "nested", "tree", `file-${String(i).padStart(4, "0")}.txt`);
      writeFileSync(file, `file ${i}`);
      streams.push({
        type: "file",
        path: `long/nested/tree/file-${String(i).padStart(4, "0")}.txt`,
        streamGenerator: () => createReadStream(file),
        unpacked: true,
        stat: readFileStat(file),
      });
    }

    await asar.createPackageFromStreams(archive, streams);
    await patchAsar(archive, (dir) => {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ main: "after.js" }));
    });

    const packageJson = JSON.parse(asar.extractFile(archive, "package.json").toString("utf8"));
    assert.equal(packageJson.main, "after.js");
    const unpackedFile = readFileSync(join(root, "app.asar.unpacked", "long", "nested", "tree", "file-0000.txt"), "utf8");
    assert.equal(unpackedFile, "file 0");
    const { header } = readHeaderHash(archive);
    const unpackedCount = countUnpacked(header as Record<string, unknown>);
    assert.equal(unpackedCount, 700);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function readFileStat(path: string) {
  return statSync(path);
}

function countUnpacked(node: Record<string, unknown>): number {
  const files = (node as { files?: Record<string, Record<string, unknown>> }).files;
  if (!files) return 0;
  let count = 0;
  for (const value of Object.values(files)) {
    if ((value as { files?: unknown }).files) count += countUnpacked(value);
    else if ((value as { unpacked?: boolean }).unpacked) count++;
  }
  return count;
}
