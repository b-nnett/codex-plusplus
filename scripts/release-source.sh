#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/check-release.sh
version="$(cat VERSION)"
git_root="$(git rev-parse --show-toplevel)"
sha="$(git -C "$git_root" rev-parse HEAD)"
output="$PWD/dist/releases"
mkdir -p "$output"
archive="$output/codex-pp-$version-source.tar.gz"
relative="$(python3 -c 'import os,sys;print(os.path.relpath(sys.argv[1],sys.argv[2]))' "$PWD" "$git_root")"
tree="$sha"; [ "$relative" = . ] || tree="$sha:$relative"
git -C "$git_root" archive --format=tar --prefix="codex-pp-$version/" "$tree" | gzip -n > "$archive"
checksum="$(shasum -a 256 "$archive" | awk '{print $1}')"
size="$(stat -f %z "$archive")"
revision="$(sed -n 's/.*public static let revision = \([0-9]*\).*/\1/p' Sources/CodexPPCore/PatchAdapter.swift)"
printf '%s  %s\n' "$checksum" "$(basename "$archive")" > "$output/SHA256SUMS"
# The manifest helpers check before they build an update (SelfUpdate.swift).
cat > "$output/release.json" <<JSON
{"schema":2,"repo":"b-nnett/codex-plusplus","tag":"v$version","version":"$version","commit":"$sha","artifact":"$(basename "$archive")","sha256":"$checksum","size":$size,"patchRevision":$revision,"distribution":"source-only"}
JSON
rm -f "$output/release.json.sig"
# CODEXPP_RELEASE_KEY: the release signing key (a hardware-backed SSH key is
# recommended). Its public half is listed in Sources/CodexPPCore/Resources/release-signers.
if [ -n "${CODEXPP_RELEASE_KEY:-}" ]; then
  ssh-keygen -Y sign -f "$CODEXPP_RELEASE_KEY" -n codexpp-release "$output/release.json"
  ssh-keygen -Y verify -f Sources/CodexPPCore/Resources/release-signers -I release@codexpp -n codexpp-release -s "$output/release.json.sig" < "$output/release.json"
else
  echo 'release.json is unsigned: set CODEXPP_RELEASE_KEY to sign it. Helpers ignore unsigned releases.' >&2
fi
printf 'Created %s\n' "$archive"
