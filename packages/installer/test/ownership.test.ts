import assert from "node:assert/strict";
import test from "node:test";
import { resolveTargetUserOwnership } from "../src/ownership";

test("target ownership uses sudo user when running as root", () => {
  assert.deepEqual(
    resolveTargetUserOwnership({
      currentUid: 0,
      currentGid: 0,
      sudoUid: "502",
      sudoGid: "20",
      homeOwner: { uid: 502, gid: 20 },
    }),
    { uid: 502, gid: 20 },
  );
});

test("target ownership falls back to home owner for root with preserved HOME", () => {
  assert.deepEqual(
    resolveTargetUserOwnership({
      currentUid: 0,
      currentGid: 0,
      homeOwner: { uid: 501, gid: 20 },
    }),
    { uid: 501, gid: 20 },
  );
});

test("target ownership keeps normal user ownership unchanged", () => {
  assert.deepEqual(
    resolveTargetUserOwnership({
      currentUid: 501,
      currentGid: 20,
      sudoUid: "502",
      sudoGid: "20",
      homeOwner: { uid: 501, gid: 20 },
    }),
    { uid: 501, gid: 20 },
  );
});
