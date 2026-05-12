# Codex++

[Join the Discord Community!](https://discord.gg/6bY6gGX36H)

A tweak system for the [Codex](https://chatgpt.com/codex) desktop app. Inject custom features, fix UI bugs, and add a tweak manager — without rebuilding the app.

> **Status:** ~~alpha~~ Beta! Confirmed working on both macOS & Windows. Expect bugs, especially around auto-updating and new Codex updates. PRs welcome.

<img width="1413" height="1016" alt="Screenshot 2026-04-28 at 19 42 56" src="https://github.com/user-attachments/assets/ea0b2ffc-c30d-4f68-ae12-dd8d6a997b2f" />

## What it does

`codex-plusplus` patches your local Codex.app installation so a small **loader** runs on startup. The loader pulls a **runtime** from your user directory, which discovers and loads **tweaks** (small ESM modules with a manifest + `start/stop` lifecycle). The runtime injects a "Tweaks" tab into Codex's settings UI so you can enable, disable, and configure tweaks in-app.

Everything beyond the one-time install patch lives **outside** the app bundle, so iterating on tweaks is just save-and-reload.

## Install

Agentic Install (via Codex):

```sh
Inspect & install this for me: https://github.com/b-nnett/codex-plusplus, tell me where you install it and send me the local path for me to add new tweaks.
```

Homebrew:

```sh
brew install b-nnett/codex-plusplus/codexplusplus
codexplusplus install
```

Bun:

```sh
bun install -g github:b-nnett/codex-plusplus
codexplusplus install
```

Source bootstrap (macOS / Linux):

```sh
curl -fsSL https://raw.githubusercontent.com/b-nnett/codex-plusplus/main/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/b-nnett/codex-plusplus/main/install.ps1 | iex
```

On Windows, Codex is distributed through the Microsoft Store. Codex++ mirrors the
Store app into a writable managed copy under `%LOCALAPPDATA%/codex-plusplus/`,
patches that copy, and installs **Codex++** launchers in the Start Menu and on
the Desktop. Launch **Codex++**, not the Microsoft Store **Codex** shortcut; the
Store shortcut opens the unpatched app.

That's it. The installer:

1. Locates Codex (`/Applications/Codex.app` on macOS, or the Microsoft Store package on Windows).
2. Backs it up to `~/.codex-plusplus/backup/`.
3. Patches `app.asar` to require our loader.
4. Recomputes the asar header SHA-256 and writes it into `Info.plist` (`ElectronAsarIntegrity`).
5. Flips `EnableEmbeddedAsarIntegrityValidation` in the Electron Framework binary as a belt-and-suspenders.
6. Re-signs the app on macOS with a stable per-machine "Codex++ Local Signing" identity, creating it in the user keychain if needed.
7. Installs a launch agent / login item that detects app updates and re-runs `repair --quiet`.
8. Installs the default tweak set from their latest GitHub releases unless `--no-default-tweaks` is passed.

The watcher also runs hourly through the GitHub-installed local CLI. If a newer Codex++ GitHub release is available, it downloads the release, rebuilds the local CLI/runtime, and runs `repair` so the runtime in your user directory is refreshed without replacing tweak code. You can turn this off from Settings → Codex Plus Plus → Config.

After source-bootstrap install, the installer adds `codexplusplus` and `codex-plusplus`
to a writable PATH directory when possible. Use `codexplusplus` for day-to-day commands:

```sh
codexplusplus status
codexplusplus repair
codexplusplus update
```

`codexplusplus update` downloads the latest Codex++ GitHub release, rebuilds it, and runs
`repair`. If the command is not on PATH yet, rerun the source bootstrap once.
Use `codexplusplus update --ref main` only when you intentionally want the current development branch instead of the latest release.

To revert:

```sh
codexplusplus uninstall
```

Other commands: `status`, `doctor`, `repair`, `update-codex`, `create-tweak`,
`validate-tweak`, `dev`, and `safe-mode`.

### Updating Codex on macOS

Codex++ modifies and re-signs `Codex.app`, so Sparkle cannot safely install an
official Codex update while the app is patched. Use:

```sh
codexplusplus update-codex
```

This restores a Developer ID signed Codex.app for the official updater. After
Codex updates and restarts, the watcher re-applies Codex++ to the new app.

Default tweaks currently installed on first run:

- `co.bennett.custom-keyboard-shortcuts` from `b-nnett/codex-plusplus-keyboard-shortcuts`
- `co.bennett.ui-improvements` from `b-nnett/codex-plusplus-bennett-ui`

## Writing a tweak

A tweak is a folder under `<user-data-dir>/tweaks/` with:

```
my-tweak/
├── manifest.json
└── index.js            # or .mjs / .ts (transpiled by runtime)
```

```json
{
  "id": "com.you.my-tweak",
  "name": "My Tweak",
  "version": "0.1.0",
  "githubRepo": "you/my-tweak",
  "author": "you",
  "description": "Adds a button.",
  "minRuntime": "0.1.0"
}
```

```ts
import type { Tweak } from "@codex-plusplus/sdk";

export default {
  start(api) {
    api.settings.register({
      id: "my-tweak",
      title: "My Tweak",
      render: (root) => {
        root.innerHTML = `<button>hi</button>`;
      },
    });
    api.log.info("started");
  },
  stop() {},
} satisfies Tweak;
```

See [`docs/WRITING-TWEAKS.md`](./docs/WRITING-TWEAKS.md) for the full API.

## Tweak updates

Every tweak manifest must include `githubRepo` in `owner/repo` form. Codex++ checks GitHub Releases for each installed tweak at most once per day and shows **Update Available** in Settings → Tweaks when a newer semver release exists.

Codex++ does **not** auto-update tweaks. The manager links to the GitHub release so users can review the diff, release notes, and repository before manually replacing local tweak files.

See [`SECURITY.md`](./SECURITY.md) for the security model and reporting policy.

## How it works (TL;DR)

| Thing | Location |
|---|---|
| Loader stub | `Codex.app/Contents/Resources/app.asar` (entry replaced with `loader.cjs`) |
| Runtime | `<user-data-dir>/runtime/` (auto-installed, hot-reloadable) |
| Tweaks | `<user-data-dir>/tweaks/` |
| Config | `<user-data-dir>/config.json` |
| Backup | `<user-data-dir>/backup/` |

`<user-data-dir>` per-OS:

- macOS: `~/Library/Application Support/codex-plusplus/`
- Linux: `$XDG_DATA_HOME/codex-plusplus/` (default `~/.local/share/codex-plusplus/`)
- Windows: `%APPDATA%/codex-plusplus/`

Windows also keeps the managed patched Codex app mirror in
`%LOCALAPPDATA%/codex-plusplus/store-apps/`.

If a Codex release changes the Settings sidebar markup and Codex++'s injected
settings entries interfere with native Settings, set
`codexPlusPlus.settingsInjector` to `false` in `config.json`. Codex++ will skip
the native Settings sidebar injection and show a small `++` launcher for its
standalone Config/Tweaks panel instead.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for details.

## Contributors

- [Alex Naidis (@TheCrazyLex)](https://github.com/TheCrazyLex) — macOS permission hardening and sudo install handling.

## Legal

This is an unofficial project. Not affiliated with OpenAI. Modifying Codex.app violates its code signature; on macOS you may need to allow the re-signed app on first launch. Auto-updates from Sparkle overwrite the patch, so `codex-plusplus` installs a watcher that re-applies it.

Use at your own risk.

MIT.
