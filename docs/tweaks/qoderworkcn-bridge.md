# QoderWork CN Bridge Tweak

`tweaks/qoderworkcn-bridge` is a bundled local tweak for using QoderWork CN
through Codex's OpenAI Responses provider settings.

It is intentionally implemented as a Codex++ tweak instead of a core runtime
patch:

- the bridge is a local HTTP Responses server, not an MCP server;
- main-process tweak code can start and stop the Node bridge in-process;
- renderer tweak code only shows health status in Codex++ Settings;
- Codex config changes are isolated in managed TOML blocks;
- completed Responses calls are also written to a CodexBar-style usage ledger.

## Local Development

```powershell
node --import tsx packages/installer/src/cli.ts validate-tweak tweaks/qoderworkcn-bridge
node --import tsx packages/installer/src/cli.ts dev tweaks/qoderworkcn-bridge --replace --no-watch
```

The live tweak link is created under:

```text
%APPDATA%\codex-plusplus\tweaks\com.qoderworkcn.responses-bridge
```

## Fresh Machine Setup

This bridge is included as a Codex++ tweak. A new machine still needs the local
QoderWork CN dependency:

1. Install QoderWork CN and sign in.
2. Confirm `qodercli.exe` exists, or set `QODER_CLI` to its path before
   launching Codex++.
3. Install or repair Codex++ so the Codex++ runtime loads inside Codex.
4. Enable the tweak, for example from a source checkout:

   ```powershell
   node --import tsx packages/installer/src/cli.ts dev tweaks/qoderworkcn-bridge --replace --no-watch
   ```

5. Launch Codex through Codex++ and open Settings -> Codex++ -> QoderWork CN
   Bridge. The page should show `Bridge: Ready`, `Qoder CLI: Found`, and a
   Responses endpoint such as `http://127.0.0.1:38441/v1`.
6. Use the `qoderworkcn-codex` model id from Codex.

Known blockers are missing QoderWork CN login, a non-default `qodercli.exe`
path, unavailable `qmodel` lane, bridge port conflicts, or launching Codex
without the Codex++ runtime.

## Codex Config

At startup, the main-process half updates:

```text
%APPDATA%\codex-plusplus\tweak-data\com.qoderworkcn.responses-bridge\codex-home\config.toml
%APPDATA%\codex-plusplus\tweak-data\com.qoderworkcn.responses-bridge\codex-home\qoderworkcn.config.toml
```

This is intentionally isolated from `%USERPROFILE%\.codex`. To target the
currently launched Codex profile instead, launch Codex++ with
`QODERWORKCN_CODEX_HOME` or `CODEX_HOME` set explicitly.

For Codex Beta isolation on Windows, use a launcher that sets
`CODEX_PLUSPLUS_HOME` to an isolated Codex++ home, points `CODEX_HOME` and
`QODERWORKCN_CODEX_HOME` at the tweak-managed profile in that home, and sets
`QODERWORKCN_BRIDGE_PORT=38442`.

The default model block sets:

```toml
model = "qoderworkcn-codex"
model_provider = "qoderworkcn-bridge"
model_reasoning_effort = "low"
```

The provider block sets `wire_api = "responses"` and points to:

```text
http://127.0.0.1:38441/v1
```

The Beta isolated launcher overrides this to `http://127.0.0.1:38442/v1` so it
does not collide with the default Codex++ Qoder bridge.

The model catalog path is the absolute path to the tweak's
`bridge/models_catalog.json`.

## CodexBar-Style Usage

Completed QoderWork bridge requests are appended to:

```text
<managed CODEX_HOME>\codexbar-qoderworkcn-usage.jsonl
```

The bridge exposes:

```text
GET http://127.0.0.1:38441/usage
GET http://127.0.0.1:38442/usage   # isolated beta launcher
```

The payload mirrors CodexBar's local cost JSON shape: `provider`, `source`,
`updatedAt`, `sessionTokens`, `last30DaysTokens`, `daily[]`, `totals`, and
`modelBreakdowns[]`. Costs are `null` until per-million-token estimates are
provided through `QODERWORKCN_INPUT_USD_PER_1M`,
`QODERWORKCN_OUTPUT_USD_PER_1M`, and optionally
`QODERWORKCN_CACHED_INPUT_USD_PER_1M`.
