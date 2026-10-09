# Native capture and computer-use authentication

Observed and implemented on 9 October 2026 with ChatGPT **26.1007.21159, build 20052**, and Codex++ adapter **chatgpt-macos-20052-v16**. These routes and service details are build-specific vendor internals.

## Why local signing breaks the original Appshot worker

The original Appshot path reaches ChatGPT's computer-use worker, which sends the `SkCu` / `SndR` Apple event to the canonical service at:

```text
~/.codex/computer-use/Codex Computer Use.app
```

The service authenticates the sender before handling that event. Its accepted requirements include OpenAI's team ID `2DC432GLL2`, another vendor team, and same-team callers. A locally signed ChatGPT bundle has no OpenAI team identity, even when it retains `com.openai.codex`, so the service rejects its worker with:

```text
Codex Computer Use Apple Event error -10000: Sender process is not authenticated
```

The service binary also checks parent signing metadata and has protected app-group and keychain entitlements. Patching or re-signing it would invalidate the identity and container access that Appshot needs, so Codex++ leaves the service unchanged.

## Headless signed-client path

The app ships OpenAI-signed `node`, `node_repl`, `@oai/cua-repl`, and `@oai/sky` components. Their nested signatures survive the local signing step because Codex++ does not modify or recursively re-sign those executables. Adapter v16 uses their intended headless path:

```text
locally signed ChatGPT renderer
    -> intercepted computer-use-start-capture request
    -> Codex++ main-process bridge
    -> bundled OpenAI-signed node + node_repl
    -> @oai/sky trusted service
    -> CodexComputerUseIPC-5 native pipe
    -> canonical OpenAI-signed computer-use service
```

The socket is:

```text
~/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock
```

The native transport uses length-prefixed JSON-RPC frames. The bundled client negotiates `CodexComputerUseIPC-5` and sends `ComputerUseIPCAppGetSkyshotRequest` for the bundle identifier selected by ChatGPT's existing frontmost-window code.

Codex++ launches the packaged `@oai/cua-repl` wrapper with only the computer surface enabled. Before launch it verifies that `cua_node/bin/node` and `cua_node/bin/node_repl` still carry TeamIdentifier `2DC432GLL2`. Analytics and ambient network access are disabled for this dedicated process. The MCP client accepts a Computer Use `get_app_state` elicitation only while handling the matching user-triggered Appshot request and only for the exact requested bundle identifier. Organization and service policy decisions still apply inside the vendor client and service.

The service returns full accessibility text plus a temporary JPEG or PNG. The bridge reads that local file, bounds-checks both payloads, converts the image to a data URL, and emits the renderer's existing sequence:

```text
metadata -> axText -> screenshot -> completed
```

All other host requests, including `computer-use-frontmost-window`, continue through the original handler. There is no hidden stock Codex window, second Electron process, loopback broker port, or CDP relay.

## Verification evidence

Before the signed-client bridge, the locally signed Appshot path settled with `hadAxText=false`, `hadScreenshot=false`, and `failureReason=start_request_failed:computer_use:-10000`.

The adapter v16 bridge was exercised directly against the live service through the exact packaged runtime. A read-only iTerm2 snapshot returned:

- a successful Appshot start response;
- metadata for `com.googlecode.iterm2`;
- 70,091 characters of accessibility text;
- a 969,971-character JPEG data URL; and
- the terminal `completed` update.

The focused ASAR/bootstrap suite also verifies that the generated entry point contains the signed CUA path and contains none of the removed stock-broker markers (`Runtime.addBinding`, the second hotkey monitor, or `CODEX_ELECTRON_START_IN_BACKGROUND`).

## Signing and integrity

The patched root app and affected Electron framework use the pinned `Codex++ Local Signing` identity. ASAR entry and header hashes, `ElectronAsarIntegrity`, and the reviewed native integrity digest are recalculated as before. The service and bundled `cua_node` executables are not modified.

Screen Recording and Accessibility permissions remain separate macOS authorization layers. This bridge fixes the sender-identity path; it does not grant missing user permissions.

## Diagnostics

These commands inspect the installed adapter and signed headless executables:

```sh
python3 -m json.tool /Applications/ChatGPT.app/Contents/Resources/codexpp-patch.json
codesign -d -vv /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node
codesign -d -vv /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl
```

The receipt should report `chatgpt-macos-20052-v16`, and both executables should report TeamIdentifier `2DC432GLL2`.

## Contract checks for app updates

`Tests/native-capture.test.mjs` runs the production bridge against a fake signed runtime. It fixes the expected MCP protocol version and server identity, launcher environment, `computer-use/get_app_state` approval scope, payload limits, and renderer event order. It also verifies that a changed connector, tool, app, response marker, payload shape, or server identity fails closed.

The same test file contains an opt-in compatibility check that launches the candidate app's real signed runtime and performs one snapshot without logging its contents:

```sh
CODEXPP_LIVE_APPSHOT_APP=com.apple.finder node --test Tests/native-capture.test.mjs
```

For a staged candidate, set `CODEXPP_CUA_RESOURCES` to its `Contents/Resources` directory. Use a unique, open test app; retained ChatGPT backups may make `com.openai.codex` ambiguous. Run this before approving a new adapter; it detects missing binaries or modules, signature changes, MCP negotiation changes, elicitation metadata changes, service errors, and incompatible Appshot response shapes.
