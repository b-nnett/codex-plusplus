Sparkle 2.9.1, upstream commit 066e75a8b3e99962685d6a90cdd5293ebffd9261.

The local peer authentication patch replaces the Apple-team XPC requirement with the running updater's exact leaf certificate and a restricted list of updater/app identifiers. Unsigned callers and a missing certificate fail closed. This supports the persistent Codex++ signer without disabling XPC authentication. Ed25519 archive verification is unchanged. The installer driver forces `relaunch = NO`, handing launch to Codex++ after installation. This is applied in source because Sparkle marks its private driver methods `objc_direct`, so runtime swizzling cannot intercept their calls.

Build with scripts/build-sparkle.sh. Source is downloaded from the pinned upstream GitHub commit. LICENSE is retained. The full verifier source is included for review; local-peer-authentication.patch is applied to the pinned checkout.
