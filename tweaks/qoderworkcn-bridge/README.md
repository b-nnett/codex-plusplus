# QoderWork CN Bridge

Codex++ tweak that starts the local QoderWork CN Responses bridge and points
Codex at it.

## What It Installs

- Local endpoint: `http://127.0.0.1:38441/v1` by default
- Codex model id: `qoderworkcn-codex`
- QoderWork CN model lane: `qmodel`
- Display label: `QoderWork CN Qwen3.7-Max`
- CodexBar-style usage endpoint: `/usage`
- Structured tool-call bridge for Codex app tools such as background threads

By default the tweak writes managed Codex config into its own isolated profile:

```text
%APPDATA%\codex-plusplus\tweak-data\com.qoderworkcn.responses-bridge\codex-home
```

Set `QODERWORKCN_CODEX_HOME` or `CODEX_HOME` before launching Codex++ to target a
different profile. The first write backs up the existing config in that target
profile to a `config.toml.backup-codexpp-qoderworkcn-*` file.

## Fresh Machine Setup

Installing Codex++ alone only installs the tweak runtime. To use QoderWork CN as
a Codex model provider on a new machine:

1. Install and launch QoderWork CN, then sign in with the account that can use
   the `qmodel` lane.
2. Confirm the QoderWork CLI exists. On Windows the default path is:

   ```text
   %LOCALAPPDATA%\Programs\QoderWork CN\resources\bin\qodercli.exe
   ```

   Set `QODER_CLI` before launching Codex++ if your installation uses a
   different path.
3. Install/repair Codex++ so Codex loads the Codex++ runtime.
4. Link or install this tweak, for example from a source checkout:

   ```powershell
   node --import tsx packages/installer/src/cli.ts dev tweaks/qoderworkcn-bridge --replace --no-watch
   ```

5. Start Codex through the Codex++ patched app or shortcut.
6. Open Settings -> Codex++ -> QoderWork CN Bridge and verify `Bridge: Ready`,
   `Qoder CLI: Found`, and `Tool bridge: structured-json`.
7. Select or verify the `qoderworkcn-codex` model in Codex. The bridge endpoint
   defaults to `http://127.0.0.1:38441/v1`.

Common setup blockers:

- QoderWork CN is not installed, not logged in, or installed at a non-default
  path.
- `qmodel` is not available for the signed-in QoderWork CN account.
- another process already owns the configured bridge port.
- Codex was launched without the Codex++ runtime, so the tweak never starts.
- an isolated profile launcher sets a different port such as `38442`; check the
  endpoint shown in the settings page.

For an isolated Codex Beta profile, launch Codex with a wrapper that sets
`CODEX_PLUSPLUS_HOME`, `CODEX_HOME`, and `QODERWORKCN_CODEX_HOME` only for that
child process. A separate port such as `QODERWORKCN_BRIDGE_PORT=38442` avoids
collisions with the default Codex++ Qoder bridge. Normal Codex launches keep
their existing profile and default port.

Long-running coding tasks can exceed QoderWork CLI's short interactive response
window. The embedded bridge defaults `QODER_BRIDGE_TIMEOUT_MS` to 2 hours and
keeps streamed Responses requests alive with SSE heartbeats while QoderWork is
still working. Set `QODER_BRIDGE_TIMEOUT_MS=0` to disable the bridge watchdog
entirely.

## CodexBar Usage

The bridge records completed Responses calls to a local JSONL ledger:

```text
<managed CODEX_HOME>\codexbar-qoderworkcn-usage.jsonl
```

`GET /usage` returns a CodexBar-style cost payload with today, rolling 30-day,
daily, total, and model-breakdown token counts. Token counts come from the
bridge's Responses `usage` object. Costs stay empty by default because QoderWork
CN is not billed through a public per-token OpenAI price table.

To enable estimated USD cost, launch Codex++ with per-million-token prices:

```powershell
$env:QODERWORKCN_INPUT_USD_PER_1M="2"
$env:QODERWORKCN_OUTPUT_USD_PER_1M="8"
$env:QODERWORKCN_CACHED_INPUT_USD_PER_1M="0.5"
```

## Development

From the Codex++ repository:

```powershell
node --import tsx packages/installer/src/cli.ts validate-tweak tweaks/qoderworkcn-bridge
node --import tsx packages/installer/src/cli.ts dev tweaks/qoderworkcn-bridge --replace --no-watch
```

Then start Codex through the Codex++ patched app or shortcut and open the
Codex++ settings page for `QoderWork CN Bridge`.

## Environment

The embedded bridge keeps the same environment variables as the standalone
`qoderworkcn-responses-bridge` project:

| Variable | Default |
| --- | --- |
| `QODER_CLI` | `%LOCALAPPDATA%\Programs\QoderWork CN\resources\bin\qodercli.exe` |
| `QODER_STORAGE_DIR` | `%USERPROFILE%\.qoderworkcn` |
| `QODER_RESOURCE_DIR` | same as `QODER_STORAGE_DIR` |
| `QODER_SITE` | `cn` |
| `QODER_MODEL` | `qmodel` |
| `QODER_BRIDGE_HOST` | `127.0.0.1` |
| `QODERWORKCN_BRIDGE_PORT` | `38441` |
| `QODER_BRIDGE_PORT` | `38441` legacy alias |
| `QODER_BRIDGE_TIMEOUT_MS` | `7200000` |
| `QODERWORKCN_CODEX_HOME` | Codex++ tweak-data isolated profile |
| `QODERWORKCN_USAGE_LEDGER` | `<CODEX_HOME>\codexbar-qoderworkcn-usage.jsonl` |
| `QODERWORKCN_INPUT_USD_PER_1M` | unset |
| `QODERWORKCN_OUTPUT_USD_PER_1M` | unset |
| `QODERWORKCN_CACHED_INPUT_USD_PER_1M` | unset |

`qmodel` is the QoderWork CN lane whose local dynamic text labels as
`Qwen3.7-Max`.

## Tool Calls / Subagents

Codex Beta sends Responses `tools` to the provider when app tools are available.
The bridge does not modify Codex Beta app files. Instead, it injects the exact
tool names and JSON schemas into QoderWork's prompt and asks QoderWork to return
tool calls in this envelope:

```text
<codex_tool_calls>
[{"name":"create_thread","arguments":{"prompt":"..."}}]
</codex_tool_calls>
```

The bridge converts that envelope into standard Responses `function_call` output
items. Codex Beta then executes its own native tools, such as `create_thread`,
and sends `function_call_output` items back on the next Responses request. The
bridge includes those tool results in the next QoderWork prompt so QoderWork can
continue or summarize.

Because QoderWork may reject host-tool envelopes as non-native tools, the bridge
also contains a narrow host-side planner for explicit subagent startup prompts.
When the user prompt clearly contains lines like `Subagent A: ...` and Codex
sent a `create_thread` tool, the bridge directly returns `create_thread`
function calls without invoking QoderWork first. This only starts the Codex
subagents; later tool outputs still flow back through the bridge for summary.
The planner accepts both namespace-shaped tools and flat tool names such as
`codex_app.create_thread`, matching the formats seen from Codex Beta.

Ordinary QoderWork text still returns as a normal assistant message. Unknown
tool names are ignored instead of returning invalid tool calls.
