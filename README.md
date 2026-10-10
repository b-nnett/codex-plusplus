# Codex++ menu bar helper

A fresh macOS base for Codex++, kept outside the ChatGPT desktop app. The helper owns extension installation, settings, connection status, recovery controls, and links to the project. It installs a persistent startup patch in ChatGPT and hosts renderer Extensions through a loopback CDP connection.

## Run

Requires macOS 14 or later, Swift 6 / Xcode command-line tools, and Node with its Node-API development headers to build the native browser adapter. Homebrew header locations are discovered automatically; set `CODEXPP_NODE_INCLUDE` for another installation. The built helper uses ChatGPT's bundled Node runtime and needs no separate Node installation.

```sh
./scripts/build-app.sh
open 'dist/Codex++.app' --args --show-menu
```

The app lives in the menu bar without a Dock icon or a separate window. Its monochrome rounded eight-spoke icon follows the supplied logo and adapts to the menu bar appearance. The full logo is the application icon. Builds require an installed Apple-issued Developer ID Application signing identity. The build selects it when exactly one is available; set `CODEXPP_SIGNING_IDENTITY` when multiple identities are installed. The patcher pins that certificate and rejects self-signed legacy pins. Notarization is not yet configured.

## Available now

- The Extensions submenu gives each installed extension the placeholder extension logo. Selecting an extension opens and focuses its row in **Codex++ → Extensions** inside desktop Settings. **Open in Finder** opens extension storage.
- **Settings…** opens the desktop app's Settings using [`codex://settings`](https://learn.chatgpt.com/docs/reference/commands#supported-links).
- **Codex++ → Extensions** in Settings installs local folders, toggles extensions, shows errors, and removes extensions to Trash. New extensions start disabled. Reinstalling the same ID replaces its package.
- The restart action is the Safe Mode switch: **Restart ChatGPT without Extensions** pauses extensions and relaunches the desktop app; while paused, **Restart ChatGPT with Extensions** resumes them and relaunches it. The action has its own menu section. **Pause Extensions / Resume Extensions** in Settings controls all extensions while retaining their enabled selections.
- Appshots keep working through the bundled OpenAI-signed `cua_node` runtime. Codex++ starts the packaged headless CUA launcher, requests a snapshot over the service's native pipe, and maps the result into the existing Appshot renderer events. It does not launch a second Electron app, expose another CDP port, or change the computer-use service and its authentication policy.
- Settings and GitHub are separate native menu items in the next section, followed by Quit.

The current desktop app is `ChatGPT.app`, with bundle ID `com.openai.codex` (verified on this machine). The helper validates that identity and migrates a stale `Codex.app` path to the new app. Displayed app names follow the selected bundle. GitHub initially points to `b-nnett/codex-plusplus`.

The first restart from the helper stages, verifies, and installs Extensions support. Subsequent launches of ChatGPT start the helper and its loopback connection automatically. The helper never force-quits the app. The Settings adapter registers Extensions in the shared native navigation list, sidebar, Settings search, and Cmd-K menu. The page uses the app's own Settings page/title, section, card, row, button, and switch components with its React instance.

There is one Extensions system. Renderer packages are supported; packages for older main-process/native APIs need adaptation. A remote catalogue and automatic helper updates are future work.

[`better-browser`](extensions/better-browser) enables macOS AutoFill in editable in-app browser fields. It uses a narrow native bridge and the clicked frame with the existing context menu. Build the current helper and restart ChatGPT through Codex++ to install that bridge before enabling the extension.

## Patching and recovery

The installer follows the external helper approach used by [Vencord's installer](https://github.com/Vencord/Installer/blob/main/patcher.go), with adapters for this app. The currently reviewed target is **ChatGPT 26.1007.21159, build 20052, arm64**, patch **v35**. Known releases use pinned hashes. Future updates require a valid complete OpenAI signature and successful structural adapter discovery before staging; unexpected or ambiguous contracts fail with the replacement closed.

Settings integration uses a bundled Acorn parser to discover native components through their JSX property contracts and import/export graph. Source-range edits register Extensions in navigation, title lookup, search, and Cmd-K. Minified local names, export aliases, hashed bundle names, and React cache indexes are discovered rather than pinned. Missing or ambiguous matches stop staging; vendor JavaScript is parsed as data and never executed by discovery. A signed `codexpp-settings-discovery.json` records the resolved component and hook bindings. Known releases use pinned archive and native-binary hashes. Future releases require a complete valid OpenAI signature before structural adapter discovery; missing or ambiguous contracts stop the automatic repatch with the app closed. Discovery uses the app’s bundled Node runtime after verifying its OpenAI signature; JavaScriptCore remains the fallback when that runtime is absent. Archive lookups avoid rebuilding directory maps and all source replacements are written in one pass. No separate Node installation or network access is required.

Reviewed releases can use exact-source edit recipes sealed inside the helper signature. Each recipe verifies the original header, every source hash and every resulting hash; the bootstrap is generated fresh. `scripts/reviewed-patches.py --patched /path/to/verified/ChatGPT.app` derives a recipe from an existing verified patch and its verified original backup. Packaging excludes recipes when their adapter/parser/runtime fingerprint changes. Unseen releases retain full structural discovery. The complete current-release patch pipeline measured **16.34, 16.38 and 16.38 seconds**, including signing, verification, a real startup probe and atomic commit; download, Sparkle installation and final app launch are separate. See [sub-20 evidence](docs/repatch-sub20-2026-10-10.json).

The adapter prepends a small bootstrap to the existing entry point. It starts the external helper and enables CDP on `127.0.0.1`; the same Extensions runtime and storage remain in use. It preserves ASAR payload offsets and unpacked native-module flags. The installer recalculates file/block hashes, the header hash in Info.plist, and this Electron build's pinned native integrity-dictionary digest. [Electron's integrity checks](https://www.electronjs.org/docs/latest/tutorial/asar-integrity) remain enabled.

Installation prepares a separate bundle, signs it, validates its signatures and content hashes, and runs a startup probe that exits before the normal app interface. ChatGPT then quits gracefully; an atomic directory exchange installs the verified bundle. The complete original bundle is retained beside the app as `.ChatGPT.codexpp-original-<transaction>.app`. A journal and an exclusive lock protect the commit; verification failures roll back. No administrator privileges or forced ChatGPT termination are used.

Hold **Option** while opening the helper menu to reveal **Restore Original ChatGPT…** in place of Restart. Restoration returns the original bundle, including its vendor signature. CLI commands are also available:

```sh
helper='dist/Codex++.app/Contents/MacOS/CodexPP'
"$helper" --patch-status /Applications/ChatGPT.app
"$helper" --stage-patch /Applications/ChatGPT.app
"$helper" --patch-and-restart /Applications/ChatGPT.app
# Close ChatGPT before restore or recovery of an exchanged bundle:
"$helper" --restore-app /Applications/ChatGPT.app
"$helper" --recover-patch /Applications/ChatGPT.app
```

The modified root and affected Electron framework use the same pinned Developer ID certificate as the helper. Bundled tool executables that are not modified, including `cua_node/bin/node` and `node_repl`, retain their vendor signatures. The patcher pins its certificate fingerprint in `Patching/signing-identity.json` and refuses to change identities or fall back to ad-hoc signing. Developer ID provides a stable Keychain team partition; a signed startup library disables Keychain interaction before Electron loads. Inaccessible items return errors without dialogs. Normal launches use real encryption, and no Keychain items or access rules are changed. The local signature cannot claim OpenAI's team, keychain groups, app groups, or push-notification entitlement. Appshot uses the verified signed runtime shipped inside the installed app for its native-pipe request. Other vendor identity-dependent features may still be unavailable. The startup probe verifies the patched boot path, while the native-capture bridge and computer-use tool path are covered by separate live checks. Keep the helper at the location used during installation; relocation currently requires restoring and reinstalling the patch. Normal app updates hand installation to Sparkle, then the helper repatches before launching the replacement. The menu bar shows preparation, signing, startup verification and restart progress. Three real background updates from different older releases passed with zero observed Keychain prompts. See [Automatic update and repatch](docs/automatic-update-repatch.md) and [validation evidence](docs/three-clean-updates-2026-10-09.json).

Connection and extension errors show a red warning and **Fix** in the menu bar. An unpatched app offers **Install Extensions Support and Restart**; other connection or extension errors offer **Repair and Restart ChatGPT**. Repair preserves enabled extensions and the pause setting, waits for actual process exit, and uses the existing verified patch/install path. Actions are disabled while work is in progress, and a healthy connection restores the usual icon.

Receipts and content hashes identify the installed patch. The helper verifies the patch before connecting and re-verifies when the archive changes. Transaction state lives in `~/Library/Application Support/CodexPP/Patching/`; bootstrap diagnostics live in `Diagnostics/`. Both installation and recovery refuse unexpected changes rather than replacing an updated app with an older backup.

The Appshot authentication failure, headless signed-client implementation, and computer-use tool verification are documented in [Native capture authentication](docs/native-capture-authentication.md), including message flow, service locations, signing identities, and end-to-end evidence.

## Extension contract

An extension folder contains `manifest.json` and a JavaScript entry. See [`examples/quiet-focus`](examples/quiet-focus) for a working example.

```json
{
  "id": "you.your-extension",
  "name": "Your Extension",
  "version": "0.1.0",
  "description": "A small improvement to ChatGPT",
  "scope": "renderer",
  "main": "index.js",
  "githubRepo": "you/your-extension"
}
```

The entry executes as a function with an `api` argument in each allowed ChatGPT app page. It does not run in web tabs, webviews, sandboxes, or remote frames. It can use the DOM directly. This is trusted code, not a sandbox: renderer extensions can read and change the interface, including visible conversation content.

```js
api.addStyle('.my-element { border-radius: 12px; }');
api.on(window, 'keydown', event => { /* handle a shortcut */ });
api.onCleanup(() => { /* undo direct DOM changes */ });
// Alternatively return a cleanup function. Async initialization is supported.
```

`api.addStyle` and `api.on` register cleanup automatically. Register cleanup for timers, observers, direct DOM mutations, and other side effects. Cleanup runs in reverse order when an extension is disabled, replaced, removed, or the helper quits. A cleanup failure blocks reloading that instance and tells the user to restart ChatGPT. Initialization failures do not retry every poll; toggle the extension or install changed code to retry. A hung initializer or code that blocks the renderer may also require restarting ChatGPT.

`api.shell` is the owned, versioned shell integration (`protocol === 1`) on reviewed builds. Await `api.waitForShell()` during initialization: it waits up to five seconds for the app module, avoiding CDP startup races. `snapshot()` returns the active frame, panel, main surface, titlebar, sidebar state, native peek state and rail-width token, or `null` when the contract is unavailable/ambiguous. Hidden cached routes are excluded using standard DOM layout checks. `setSidebarOpen(boolean)` invokes the app's native command without relying on translated labels. `windowControls(hidden)` returns a native acknowledgement; hiding controls requires the installed/enabled Focus Mode extension and a renewable four-second lease. Pause/removal, navigation, renderer failure, unresponsive windows and lease expiry restore controls through Electron's public API. The shell AST adapter discovers property contracts and the sidebar command; unknown builds and missing/ambiguous matches still fail before installation.

Settings and installed extensions live in `~/Library/Application Support/CodexPP/`. The old `codex-plusplus` folder is untouched. Each poll checks that ChatGPT owns the loopback listener before evaluating code. Target URLs and debugger socket addresses are restricted to the local app renderer.

## Development checks

```sh
./scripts/check.sh
./scripts/preview-app.sh
open 'dist/Codex++ Preview.app'
```

The default suite includes a simulated Appshot contract test. It pins the MCP initialization shape, signed-runtime environment, exact elicitation scope, payload limits, renderer update sequence, and fail-closed behavior for changed server identities or response shapes. During review of a new ChatGPT build, run the same bridge against its bundled signed runtime and an open test app:

```sh
CODEXPP_LIVE_APPSHOT_APP=com.apple.finder node --test Tests/native-capture.test.mjs
```

Set `CODEXPP_CUA_RESOURCES` if the candidate app is staged somewhere other than `/Applications/ChatGPT.app/Contents/Resources`. Use the bundle identifier of a unique, open test app; retained ChatGPT backups may make `com.openai.codex` ambiguous. The live check validates types and sizes but never prints accessibility text or screenshot data.

The UI preview uses its own temporary extension directory and disables desktop app connections and restarts. Swift tests cover patch corruption, unknown builds, native integrity slots, local signing policy, interrupted transactions, atomic installation, restoration, storage, and Settings in isolated WebKit fixtures. AST regression tests rename bundle hashes, local symbols, import/export aliases, and cache indexes, and verify missing or ambiguous exports fail closed. Node tests cover extension lifecycle, cleanup, failures, concurrent synchronization, native component bindings, and Settings actions. Set `CODEXPP_ORIGINAL_ASAR` to the reviewed original archive and `CODEXPP_ADAPTER_OUTPUT` to a temporary output directory to validate and export the exact vendor adapter. With `CODEXPP_VENDOR_SOURCE` pointing to the reviewed compiled command-menu module, the Node integration test executes the app’s actual Settings search and Cmd-K components against the new registration, and runs the compiled Settings route with fixture host hooks through the Extensions render. The route test reproduces the former router-location/Button collision and verifies dedicated component imports prevent it. Integration checks also execute the native title component and search visibility filter; the sidebar and visible section lists share one Extensions descriptor because the app filters by object identity. The integration has not been visually verified inside the live ChatGPT app.

The main source boundaries are `CodexPPCore` (storage, versioned patch adapters, ASAR integrity, signing, and transactions), `HelperModel` (operations), `CDPClient` and `SettingsSession` (transport), the injected Settings page, and the AppKit menu shell.
