# Automatic update and repatch

Codex++ keeps the normal Sparkle update check, download, archive signature verification, extraction, and installation. It changes the final install request to `relaunch = NO`. The old app records a private, atomic handoff ticket before foreground installation or when a background installation is prepared. The helper waits for both the old app and Sparkle's installer to exit, validates the replacement, stages and signs its patch, runs its startup probe, commits the patch, and launches the patched replacement.

The helper launches the replacement only after it commits the verified patch. Rehearsals avoid app-bound UI tools during the installation gap, because those tools can independently open an app. Codex++ does not change user Keychain items, loosen their access lists, or dismiss Keychain dialogs.

## Keychain identity and startup policy

A persistent self-signed certificate was insufficient: its designated requirement stayed stable, but macOS classified each signed build into a changing `cdhash:` Keychain partition. A later normal startup prompted even after disposable probes were fixed. The previous single-run result below therefore does not satisfy the zero-prompt goal.

The patch signer now requires an explicitly pinned Apple-issued Developer ID Application certificate, shared by the helper, app, native addon and updater. On this machine, its existing team partition and designated requirement were already present in the storage key's access rules. No access-rule migration was performed. Apple's [Security implementation](https://github.com/apple-oss-distributions/Security/blob/main/securityd/src/clientid.cpp) assigns Developer ID code to its stable certificate team, rather than CDHash.

The vendor launcher still performs its original allocator setup and calls `ChromeMain`. Its unique framework-path string is redirected to a small signed startup library. Before loading Electron, that library calls `SecKeychainSetUserInteractionAllowed(false)`. Failure to establish the policy stops startup. It then loads the original framework with the vendor's global symbol scope, preserves arguments, and returns its result. An inaccessible Keychain item must return an access error without a dialog; normal profiles never use mock encryption. Native-addon initialization and the disabled interaction policy are checked in startup probes and recorded in boot diagnostics.

This is a source-distributed local development patch. Published releases contain source and checksums rather than a prebuilt helper. Each machine needs its own Developer ID and existing Keychain authorization; a local builder may notarize that helper with `CODEXPP_NOTARY_PROFILE`. The code refuses a missing or self-signed legacy certificate pin; it cannot promise silent access to a Keychain item that has never authorized that signer.

## Updater authentication

The vendor Sparkle installer originally required an OpenAI-signed XPC client. This rejects the locally signed patched app before extraction. Codex++ bundles Sparkle 2.9.1 from pinned upstream commit `066e75a8b3e99962685d6a90cdd5293ebffd9261`, with a peer-authentication change: the installer and app authenticate the exact persistent signing certificate and a restricted set of app/updater identifiers. Unsigned code and unrelated signers are rejected. Ed25519 archive signature verification remains unchanged. See `vendor/sparkle/local-peer-authentication.patch` and `scripts/build-sparkle.sh`.

The install-on-quit hook preserves the vendor delegate's return value and block without invoking the block itself. An application-termination observer refreshes the ticket for the delegate's current prepared item, allowing a long-lived app to quit after the original ticket date. Cleared selections do not create a new ticket. Sparkle's original automatic installer still performs the installation.

## Future releases

Known releases retain their pinned archive/bootstrap/framework hashes. For an unknown release, Codex++ first verifies the complete nested OpenAI signature, requiring team `2DC432GLL2` and bundle identifier `com.openai.codex`. It then discovers and pins the bootstrap, full archive header, arm64 framework hash, and unique native integrity slot. The existing AST adapters resolve the Settings, browser, bookmarks, and shell contracts. A missing or ambiguous contract fails staging before the app is launched. Automatic compatibility is therefore bounded by the contracts the helper supports; it cannot guarantee support for an arbitrary future rewrite.

`Patching/update-handoff.json` persists interrupted handoffs. `Diagnostics/update.json` records a successful repatch; `Diagnostics/boot.json` proves which patched adapter launched; `Diagnostics/helper.json` reports extension health. Tickets expire after 24 hours and are bound to the selected application and helper paths.

## Real updater rehearsal

1. Obtain the previous release from the official appcast, retaining its unmodified vendor-signed bundle.
2. Patch that bundle with `CodexPP --patch-app /path/to/previous/ChatGPT.app`.
3. Run `CodexPP --begin-update-validation /path/to/previous/ChatGPT.app`. This verifies both bundles, quits the current app, atomically exchanges them, and opens the actual previous release. The current patched bundle remains at the supplied path for recovery.
4. In ChatGPT, choose **Check for Updates**, then **Install Update**. Complete the normal update UI.
5. Observe the old app exit, vendor installation, automatic helper repatch, and patched restart. Check that no Keychain dialog appears throughout.
6. Verify the installed version, receipt, signature, startup diagnostics, active extensions, unchanged bookmark/settings hashes, and unchanged designated requirement.

For a normal background rehearsal, keep the existing automatic-check and automatic-download preferences enabled, make `SULastCheckTime` overdue while preparing an older release, and open that release. Sparkle performs its ordinary scheduled check, download, archive verification and preparation. Wait for a bound `installMode: "on-quit"` ticket and for other patch transactions to finish. `CodexPP --finish-background-update-validation` verifies the prepared ticket and running patched source, then requests a normal application quit; it does not install, patch or launch a replacement. Sparkle installs and the resident helper repatches and restarts. Rehearsal process waits use actual PID liveness because Workspace termination notifications can lag behind process exit.

## Three clean updates — 2026-10-09

Three real automatic-updater runs passed, each ending on **26.1007.21159, build 20052, patch v30**:

| Source release | Source build | Patched restart (UTC) | Result |
| --- | --- | --- | --- |
| 26.930.61225 | 13520 | 22:01:13 | Passed |
| 26.930.51102 | 13100 | 22:07:16 | Passed |
| 26.1002.52244 | 13536 | 22:14:23 | Passed |

Every run used Sparkle's normal scheduled check, full archive download, EdDSA verification and installation on ordinary quit. The resident helper automatically repatched and restarted the replacement. No SecurityAgent process or securityd Keychain-prompt event was observed. Source startup, staging probes and final startup all recorded Keychain interaction disabled. Normal app arguments contained neither the probe flag nor mock-Keychain mode.

Each target passed strict nested signature validation, retained the same Developer ID designated requirement, connected to the helper with all three extensions healthy, and preserved bookmark/settings hashes and read-only Keychain access metadata. The canonical app remains running on the final v30 target; automatic checks and downloads remain enabled.

The desktop was locked during these three runs, so they validate the real background updater rather than the foreground update UI. About and signed-in UI verification are explicitly unavailable in their evidence. A preliminary foreground v29 rehearsal verified the latest About version and signed-in app, but is excluded from the three-run count.

The final checks passed: 81 Swift tests, 44 JavaScript tests and three native harnesses; 5 Swift and 11 JavaScript tests needing optional vendor fixtures were skipped. See [the three-run evidence](three-clean-updates-2026-10-09.json) for archive-verification records, process transitions, startup diagnostics, signatures, data hashes and monitoring scope.

## Earlier rehearsals and regressions

The subsequent sub-20 performance pass measured **16.34, 16.38 and 16.38 seconds** across three separate copies of official 26.1007.21159. Each measurement includes the complete patch process: validation, staging, signing, real startup probe and atomic commit. These are repatch measurements, not additional updater cycles; download, Sparkle installation and final normal launch are separate. The installed helper uses this implementation and remains connected with three healthy extensions. All 21,089 archive entries match the working v30 patch, including actual packed-payload hashes. Checks passed: 88 Swift tests, 47 JavaScript tests and three native harnesses; six Swift and eleven JavaScript tests needing optional fixtures were skipped. [Sub-20 evidence](repatch-sub20-2026-10-10.json) records each run, its native noninteractive-Keychain proof and the installed helper.

This path uses reviewed source edits sealed inside the verified helper signature, checks each input/output hash, and generates the bootstrap fresh. Adapter/parser/runtime changes invalidate packaged recipes. An unseen release still needs full AST discovery and has no under-20 guarantee. Local app/framework/helper signatures request no secure timestamp, avoiding signing-server round trips; they retain the pinned Developer ID, designated requirement, hardened-runtime flags and filtered entitlements. This local development signing policy does not provide historical timestamp validity after certificate expiry. Only the validated 32-byte native integrity value is overwritten. Archive lookups use direct directory access, and command completion uses process notifications instead of polling. Signature checks, complete archive/framework hashes, startup policy checks and commit/rollback boundaries remain intact.

On 2026-10-10, a user-triggered foreground update also completed and restarted on v30 with all three extensions active. Its long repatch delay prompted a performance pass. Repeated archive-directory bridging was replaced with one path index; discovery now uses the app's verified OpenAI-signed Node runtime; all source replacements are written in one archive pass. The full patch pipeline measured **103.99 seconds before and 46.76 seconds after** on copies of the same official release, including signing, verification, startup probe and atomic installation. Download time is separate. All 21,089 archive entries retained identical contents and flags. The installed helper now shows preparation, adaptation, signing, startup-check and restart phases in its menu. [Performance evidence](repatch-performance-2026-10-10.json) records the intermediate measurements and checks.

The earlier release pair was 26.1002.52244 (13536) to 26.1007.21159 (20052), from the official appcast. Sparkle verified the archive and the helper automatically repatched and restarted it. No prompt was observed in that particular cycle, but subsequent probe and normal-startup prompts invalidated the wider zero-prompt claim. That historical result is not counted toward the requested three clean updates.

Those earlier checks passed: 78 Swift tests, 44 JavaScript tests, and two native harnesses (6 Swift and 11 JavaScript fixture-dependent tests skipped). Separate real vendor-adapter discovery, persistent signing, and Sparkle certificate peer checks also passed. See [historical machine-readable evidence](update-validation-2026-10-09.json).

Earlier rehearsals exposed two incorrect interception points: denying Sparkle’s relaunch delegate permission aborts installation, and its private installer methods are `objc_direct` and cannot be swizzled. The final implementation forces the install request’s relaunch flag to NO in the pinned framework source. One observation attempt reopened the vendor replacement through SkyComputerUseService; the final rehearsal used process/file monitoring through the gap and did not reproduce that launch. During future rehearsals, avoid app-bound accessibility/screenshot calls after starting installation until the new patched boot is recorded.

## Follow-up: disposable probe Keychain regression

At 22:01 BST on 2026-10-09, a fresh staging-path probe triggered a real `Codex Storage Key` prompt. The earlier updater rehearsal did not expose this separate probe case. A disposable browser profile alone does not isolate Chromium’s macOS encryption provider from the real Keychain.

The helper now passes `--use-mock-keychain` only to `--codexpp-probe` processes with fresh disposable profiles. Chromium documents this test mode for avoiding Keychain access dialogs in [its macOS build instructions](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/mac_build_instructions.md#Avoiding-system-permissions-dialogs-after-each-build). Normal app launches use real encryption, the Developer ID signer, and the noninteractive policy described above. No user Keychain items or access lists are changed.

The actual helper probe command was repeated three times against each release, with a different staging path and profile every time. All six passed; a 50 ms SecurityAgent monitor observed no prompt process during execution or for two seconds after each exit. The five patch transaction tests also passed. [Probe evidence](probe-validation-2026-10-09.json) is separate from the earlier update-cycle evidence. Run `scripts/check-startup-probes.py --helper dist/Codex++.app/Contents/MacOS/CodexPP --output /tmp/probe-results.json /path/to/patched/ChatGPT.app` to reproduce. The `--check-probe` CLI refuses unpatched bundles and leaves installation transactions untouched.
