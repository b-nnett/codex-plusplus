# Releasing Codex++

Codex++ is released from `b-nnett/codex-plusplus` as signed source. Helpers
update themselves from the latest published release (see README → Updates),
so a release needs the update-signing key and must pass the release workflow.

## One-time setup

1. Create the release key on a hardware key (the private half never leaves it):

   ```sh
   ssh-keygen -t ed25519-sk -C release@codexpp -f ~/.ssh/codexpp_release
   ```

2. Add its public key to `Sources/CodexPPCore/Resources/release-signers`:

   ```
   release@codexpp namespaces="codexpp-release" sk-ssh-ed25519@openssh.com AAAA...
   ```

   `check-release.sh` refuses a tagged release without it, because helpers built
   from that release could never verify a later one.

3. Connect this checkout to GitHub. 2.0 replaces the 1.x codebase, which has
   no shared history with it: keep 1.x on `legacy-1.x`, then replace `main`.

   ```sh
   git remote add origin https://github.com/b-nnett/codex-plusplus.git
   git fetch origin --no-tags
   git push origin refs/remotes/origin/main:refs/heads/legacy-1.x
   git push --force-with-lease=main:refs/remotes/origin/main origin main
   ```

   The 1.x tags (`v0.1.0`–`v1.0.0`) and releases stay as they are. Fetch with
   `--no-tags`: 1.x's `v0.1.0` tag is unrelated to this history.

## Each release

1. Set `VERSION`, date the matching `CHANGELOG.md` heading (no "unreleased"),
   commit, and tag with a signed tag:

   ```sh
   git tag -s "v$(cat VERSION)" -m "Codex++ $(cat VERSION)"
   ```

2. Build and sign the source release (`check.sh` first):

   ```sh
   ./scripts/check.sh
   CODEXPP_REQUIRE_TAG=1 CODEXPP_RELEASE_KEY=~/.ssh/codexpp_release ./scripts/release-source.sh
   ```

   This writes `dist/releases/`: the tarball, `SHA256SUMS`, `release.json` and
   `release.json.sig`, and verifies the signature against `release-signers`.

3. Draft the GitHub release with exactly those files, then push the tag:

   ```sh
   gh release create "v$(cat VERSION)" --draft --title "Codex++ $(cat VERSION)" --notes-file <(sed -n "/^## $(cat VERSION)/,/^## /p" CHANGELOG.md | sed '$d') dist/releases/*
   git push origin main "v$(cat VERSION)"
   ```

4. `.github/workflows/release.yml` rebuilds the tarball from the tag, requires
   the drafted one to be byte-identical, verifies the signature, runs the
   tests and publishes the draft as the latest release. Helpers pick it up on
   their next daily check.
