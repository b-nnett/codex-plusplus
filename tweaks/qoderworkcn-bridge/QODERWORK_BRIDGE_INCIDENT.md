# QoderWork Bridge Repair Notes

## Scope Boundary

This repair must stay inside Codex++ and the QoderWork bridge. Do not patch the
Codex Beta application bundle.

Allowed areas:

- the Codex++ repository's `tweaks/qoderworkcn-bridge` directory
- the user's chosen isolated Codex++ home
- optional wrapper launchers that set isolated environment variables
- the isolated `CODEX_HOME` managed by the tweak

Do not edit:

- the installed Codex or Codex Beta application bundle
- patched app copies produced by Codex++ installers

## Failure

Codex Beta routed requests to QoderWork successfully, but subagents did not
start. The prior bridge appended a text warning when `body.tools` was present:

```text
Tool calling is unavailable through this local text bridge. Answer directly in text.
```

That converted Codex app tools into plain prompt text. QoderWork could execute
some local CLI work, but it could not ask Codex Beta to run native tools such as
`create_thread`.

## Fix Direction

The bridge now:

1. Injects available Responses tools into the QoderWork prompt.
2. Asks QoderWork to emit a strict `<codex_tool_calls>` JSON envelope.
3. Converts recognized calls into Responses `function_call` output items.
4. Includes later `function_call_output` results in the next QoderWork prompt.
5. Directly plans explicit `Subagent A/B/...` startup requests into
   `create_thread` calls when QoderWork refuses host-tool envelopes.
6. Accepts both namespaced tools and flat names such as
   `codex_app.create_thread` from Codex Beta.

Codex Beta remains responsible for actually executing native tools.

## Current Limits

- QoderWork must comply with the JSON envelope for tool calls.
- The bridge only converts tools that Codex Beta already sent in `body.tools`.
- Unknown tool names are ignored to avoid invalid Responses output.
- Tool execution remains owned by Codex Beta; this tweak does not call Codex
  internals directly.
- The host-side subagent planner only handles explicit `Subagent X: ...` lines.
  It is intentionally narrow to avoid surprising tool execution.

## Verification

Run from the Codex++ repository:

```powershell
npm test --prefix tweaks/qoderworkcn-bridge/bridge
node --import tsx packages/installer/src/cli.ts validate-tweak tweaks/qoderworkcn-bridge
```
