#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
# WebKit's content processes cannot launch inside SwiftPM's test sandbox on
# Xcode 27. The tests still run under the invoking user's normal macOS policy.
swift test --disable-sandbox
node --test Tests/runtime.test.mjs Tests/native-runtime.test.mjs Tests/native-settings.test.mjs Tests/native-navigation.test.mjs Tests/native-capture.test.mjs Tests/ast-adapter.test.mjs Tests/parser-runner.test.mjs Tests/better-browser.test.mjs Tests/bookmarks.test.mjs Tests/focus-shell.test.mjs Tests/sidebar-adapter.test.mjs
native_check="$(mktemp "${TMPDIR:-/tmp}/codexpp-native-browser.XXXXXX")"
trap 'rm -f "$native_check"' EXIT
clang++ -fobjc-arc -std=c++17 -framework AppKit Tests/native-browser-view.mm -o "$native_check"
"$native_check"
clang++ -fobjc-arc -std=c++17 -framework AppKit Tests/native-update-handoff.mm -o "$native_check"
"$native_check"
bash scripts/check-startup-policy.sh
node --test Tests/app-tools-parent.test.mjs
