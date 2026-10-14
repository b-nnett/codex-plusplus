#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
version="$(cat VERSION)"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]
for file in LICENSE SECURITY.md CHANGELOG.md THIRD-PARTY-NOTICES.md; do test -s "$file"; done
grep -Eq "^## ${version//./\\.}([[:space:]]|$)" CHANGELOG.md
test -x scripts/build-app.sh -a -x scripts/build-sparkle.sh -a -x scripts/check.sh -a -x scripts/check-release.sh -a -x scripts/release-source.sh
bash -n scripts/build-app.sh scripts/build-sparkle.sh scripts/check.sh scripts/release-source.sh
for file in Sources/CodexPPCore/Resources/*.js Sources/CodexPPCore/Resources/*.mjs Sources/CodexPP/Resources/*.js; do node --check "$file"; done
if grep -rnE "appendSwitch\(['\"]remote-debugging|--remote-debugging-(port|address)" Sources; then
  echo 'Release check failed: a remote debugging endpoint is enabled.' >&2
  exit 1
fi
if grep -nE "new Function|eval[[:space:]]*\\(" Sources/CodexPPCore/Resources/renderer-runtime.js; then
  echo 'Release check failed: the production renderer runtime compiles source strings.' >&2
  exit 1
fi
grep -qF 'exclude: ["Resources/runtime.js"]' Package.swift
git_root="$(git rev-parse --show-toplevel)"
relative="$(python3 -c 'import os,sys;print(os.path.relpath(sys.argv[1],sys.argv[2]))' "$PWD" "$git_root")"
test -z "$(git -C "$git_root" status --porcelain --untracked-files=all -- "$relative")"
if [ "${CODEXPP_REQUIRE_TAG:-0}" = 1 ]; then
  # A release without the update-signing key could never update itself again.
  grep -Eq '^release@codexpp namespaces="codexpp-release" (sk-)?ssh-ed25519' Sources/CodexPPCore/Resources/release-signers || {
    echo 'Release check failed: add the release signing key to Sources/CodexPPCore/Resources/release-signers.' >&2; exit 1; }
  test "$(git -C "$git_root" describe --exact-match --tags HEAD)" = "v$version"
  ! grep -Eq "^## ${version//./\\.}.*unreleased" CHANGELOG.md
fi
printf 'Release checks passed for Codex++ %s at %s\n' "$version" "$(git -C "$git_root" rev-parse HEAD)"
