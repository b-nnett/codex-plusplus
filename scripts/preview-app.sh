#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/build-app.sh
preview="$PWD/dist/Codex++ Preview.app"
ditto "$PWD/dist/Codex++.app" "$preview"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier dev.codexpp.helper.preview' "$preview/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName Codex++ Preview' "$preview/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Add :CodexPPPreview bool true' "$preview/Contents/Info.plist"
codesign --force --sign - "$preview"
printf 'Built isolated UI preview: %s\n' "$preview"
