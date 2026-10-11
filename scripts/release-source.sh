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
git -C "$git_root" archive --format=tar --prefix="codex-pp-$version/" "$sha:codex-pp" | gzip -n > "$archive"
checksum="$(shasum -a 256 "$archive" | awk '{print $1}')"
printf '%s  %s\n' "$checksum" "$(basename "$archive")" > "$output/SHA256SUMS"
cat > "$output/release.json" <<JSON
{"schema":1,"version":"$version","commit":"$sha","artifact":"$(basename "$archive")","sha256":"$checksum","distribution":"source-only"}
JSON
printf 'Created %s\n' "$archive"
