# Reviewing a new ChatGPT build

When OpenAI ships a new ChatGPT build, `scripts/review-build.py` tells you in one run whether Codex++ can patch it and which edits still apply:

```sh
python3 scripts/review-build.py                                   # /Applications/ChatGPT.app
python3 scripts/review-build.py /path/to/ChatGPT.app --against dist/reviews/20398.json
python3 scripts/review-build.py --against auto                    # highest lower build in dist/reviews
```

The script builds the helper (`swift build -c release --product CodexPP`; pass `--helper` to use an existing binary, or `--configuration debug`) and runs its hidden, read-only `CodexPP --review-build <app>` mode. That mode runs the patch's own discovery: the same `RendererPipeline` that `AppPatcher.stage` uses, with the same chunk table, alias rules and JavaScript adapters, in the same order and with the same chained inputs. The report therefore cannot drift from what patching does. Nothing is written to the app.

The original archive is always the one reviewed. If the app is patched, the review reads the original backup that its receipt (`Contents/Resources/codexpp-patch.json`) records, `.ChatGPT.codexpp-original-<transaction>.app`, after checking that its archive hash matches the receipt. An unpatched app is reviewed as it is. You can also pass the backup path directly.

The run writes `dist/reviews/<build>.json` (the full report) and `dist/reviews/<build>.md` (a short summary, also printed to stdout).

## What the report says

- **Identity**: the version, the build, the archive header hash and the archive SHA-256. The status is one of three values. `pinned` means the build is in `PatchAdapter.reviewed`. `vendor-authenticated` means the build is not pinned, but it carries OpenAI's signature and meets the bundle contract, so patching runs full structural discovery. `unsupported` means neither.
- **Native contracts**: `bootstrapEntry`, `asarIntegritySlot` (the framework's unique integrity slot) and `launcherStartupPolicy` (the launcher framework path), each checked in memory.
- **Adapters**: settings, shell, bookmarks, sidebar, browser and startup, each with every edit or capability marked applied (with its target) or skipped (with a reason and a hint). Settings, shell, bookmarks and browser are required: if any of them fails, the patch fails. Sidebar is optional: if it fails, it is left out. Startup edits that do not match are skipped, but a startup discovery that cannot finish (a timeout, a crash or bad output) is retried once with a 180 s deadline, as patching does, and then fails the patch. The review reports it as a failed adapter with the reason and any retries. Hints include:
  - `chunk `initial` not found (prefix `app-initial-` in webview/assets matched 2 file(s); needs exactly one)`. Every startup chunk's resolution is in the JSON under `adapters[].chunks`, with its prefix-match and marker-match counts and any alias.
  - `the matched code shape is gone from `shared` (...)` for `expected one match, found 0`, or `the matcher is ambiguous` when there are 2 or more matches.
  - For a required adapter that failed, the useful line of its error, with the node stack removed.
  Diagnostic edits (`StartupStatus.diagnostics`) are marked `release: false`. They are listed apart, because release helpers never apply them.
- **Timing**: each adapter's discovery time. The review warns when startup discovery takes more than 20 s or was retried (its first deadline is 60 s, then one retry at 180 s), and flags any other adapter at its 60 s hard limit. The startup entry also carries the adapter's own `duration`, which is the value the patch's discovery report records. The machine's load average is recorded under `tool.loadAverage`, because times rise when the Mac is busy.
- **Diff** (`--against`): edits that are newly skipped, newly applied, new or no longer reported, and adapters whose status changed. A **regression** is a release edit that applied in the earlier report and now skips. An edit lost because its adapter failed also counts. An edit that is no longer reported while its adapter ran does not count, because it was removed from Codex++ itself.

## Exit status

- `0`: the build would patch, and there are no regressions.
- `1`: there is a regression against `--against`, or patching would fail (unsupported identity, a broken native contract or a failed required adapter). Use this as the CI gate.
- `2`: the review could not run (the helper failed, a file is missing, or the JSON is invalid).

`--from-json raw.json` formats a saved `--review-build` output without running the helper. `Tests/review-build.test.mjs` uses it to test the formatter and the diff.

## Reviewing a build

1. Run the script against the new build, with `--against` pointing at the last reviewed build's report.
2. If it exits 0, record the report. To pin the build, add it to `PatchAdapter.reviewed` as usual.
3. If it exits 1, start from the hints. For a chunk that is not found, compare the archive's file list for that prefix. For a code shape that is gone, diff the named chunk between the two builds and update the matcher in the adapter's `.js`. Then run the review again.
