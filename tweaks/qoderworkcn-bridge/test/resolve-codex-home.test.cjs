const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const tweak = require("../index.js");

test("uses tweak data dir as the default isolated Codex home", () => {
  const previousQoderHome = process.env.QODERWORKCN_CODEX_HOME;
  const previousCodexHome = process.env.CODEX_HOME;
  delete process.env.QODERWORKCN_CODEX_HOME;
  delete process.env.CODEX_HOME;

  try {
    const actual = tweak.__private.resolveCodexHome({
      fs: { dataDir: "C:/Users/tester/AppData/Roaming/codex-plusplus/tweak-data/com.qoderworkcn.responses-bridge" },
    });

    assert.equal(
      actual,
      path.join(
        "C:/Users/tester/AppData/Roaming/codex-plusplus/tweak-data/com.qoderworkcn.responses-bridge",
        "codex-home",
      ),
    );
  } finally {
    restoreEnv("QODERWORKCN_CODEX_HOME", previousQoderHome);
    restoreEnv("CODEX_HOME", previousCodexHome);
  }
});

test("lets an explicit QoderWork profile override CODEX_HOME", () => {
  const previousQoderHome = process.env.QODERWORKCN_CODEX_HOME;
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.QODERWORKCN_CODEX_HOME = "C:/profiles/qoder";
  process.env.CODEX_HOME = "C:/profiles/codex";

  try {
    assert.equal(
      tweak.__private.resolveCodexHome({ fs: { dataDir: "C:/ignored" } }),
      path.resolve("C:/profiles/qoder"),
    );
  } finally {
    restoreEnv("QODERWORKCN_CODEX_HOME", previousQoderHome);
    restoreEnv("CODEX_HOME", previousCodexHome);
  }
});

test("lets QoderWork bridge port override the legacy bridge port", () => {
  const previousQoderPort = process.env.QODERWORKCN_BRIDGE_PORT;
  const previousBridgePort = process.env.QODER_BRIDGE_PORT;
  process.env.QODERWORKCN_BRIDGE_PORT = "38442";
  process.env.QODER_BRIDGE_PORT = "38441";

  try {
    assert.equal(tweak.__private.resolveBridgePort({ storage: { get: () => "" } }), 38442);
  } finally {
    restoreEnv("QODERWORKCN_BRIDGE_PORT", previousQoderPort);
    restoreEnv("QODER_BRIDGE_PORT", previousBridgePort);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
