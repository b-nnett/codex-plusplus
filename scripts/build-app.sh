#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
version="${CODEXPP_VERSION:-$(cat VERSION)}"
build_number="${CODEXPP_BUILD_NUMBER:-1}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || { echo 'Invalid CODEXPP_VERSION.' >&2; exit 1; }
[[ "$build_number" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid CODEXPP_BUILD_NUMBER.' >&2; exit 1; }
swift build -c release -debug-info-format none
bin_dir="$(swift build -c release --show-bin-path)"
app="$PWD/dist/Codex++.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
icon_work="$(mktemp -d "${TMPDIR:-/tmp}/codexpp-icon.XXXXXX")"
trap 'rm -rf "$icon_work"' EXIT
iconset="$icon_work/AppIcon.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" Assets/AppIcon.png --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" Assets/AppIcon.png --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$app/Contents/Resources/AppIcon.icns"
cp "$bin_dir/CodexPP" "$app/Contents/MacOS/CodexPP"
for resource in "$bin_dir"/*.bundle; do
  [ -e "$resource" ] && ditto "$resource" "$app/Contents/Resources/$(basename "$resource")"
done
python3 scripts/reviewed-patches.py --package "$app"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.codexpp.helper</string>
<key>CFBundleName</key><string>Codex++</string>
<key>CFBundleDisplayName</key><string>Codex++</string>
<key>CFBundleExecutable</key><string>CodexPP</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>__CODEXPP_VERSION__</string>
<key>CFBundleVersion</key><string>__CODEXPP_BUILD__</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
sed -i '' -e "s/__CODEXPP_VERSION__/$version/" -e "s/__CODEXPP_BUILD__/$build_number/" "$app/Contents/Info.plist"
cp LICENSE "$app/Contents/Resources/LICENSE"
cp THIRD-PARTY-NOTICES.md "$app/Contents/Resources/THIRD-PARTY-NOTICES.md"
cp vendor/sparkle/LICENSE "$app/Contents/Resources/SPARKLE-LICENSE"
signing_identity="${CODEXPP_SIGNING_IDENTITY:-}"
if [ -z "$signing_identity" ]; then
  signing_identity="$(security find-identity -v -p codesigning | awk '/"Developer ID Application:/ {print $2}')"
fi
if [ -z "$signing_identity" ] || [[ "$signing_identity" == *$'\n'* ]] || [ "$signing_identity" = "-" ]; then
  echo 'A Developer ID Application certificate is required. Set CODEXPP_SIGNING_IDENTITY when multiple identities are installed.' >&2
  exit 1
fi
CODEXPP_SIGNING_IDENTITY="$signing_identity" bash scripts/build-sparkle.sh
ditto "$PWD/.build/sparkle-framework/Sparkle.framework" "$app/Contents/Resources/Sparkle.framework"
node_include="${CODEXPP_NODE_INCLUDE:-}"
if [ -z "$node_include" ]; then
  for candidate in "$(node -p 'require("path").resolve(process.execPath, "../../include/node")')" /opt/homebrew/include/node /usr/local/include/node; do
    if [ -f "$candidate/node_api.h" ]; then node_include="$candidate"; break; fi
  done
fi
if [ ! -f "$node_include/node_api.h" ]; then
  echo 'Node-API headers are required. Set CODEXPP_NODE_INCLUDE to the directory containing node_api.h.' >&2
  exit 1
fi
clang++ -shared -fPIC -fobjc-arc -std=c++17 -mmacosx-version-min=14.0 \
  -I "$node_include" -framework AppKit -framework Security -undefined dynamic_lookup \
  Sources/CodexPPNativeBrowser/browser-native.mm -o "$app/Contents/Resources/browser-native.node"
codesign --force --timestamp --sign "$signing_identity" "$app/Contents/Resources/browser-native.node"
clang -dynamiclib -arch arm64 -mmacosx-version-min=14.0 -framework Security \
  Sources/CodexPPNativeBrowser/startup-policy.c -o "$app/Contents/Resources/CodexPPStartup.dylib"
codesign --force --timestamp --options runtime --sign "$signing_identity" "$app/Contents/Resources/CodexPPStartup.dylib"
codesign --force --timestamp --options runtime --entitlements Assets/Helper.entitlements --sign "$signing_identity" "$app"
codesign --verify --deep --strict "$app"
if [ -n "${CODEXPP_NOTARY_PROFILE:-}" ]; then
  archive="$PWD/dist/Codex++-$version.zip"
  ditto -c -k --keepParent "$app" "$archive"
  xcrun notarytool submit "$archive" --keychain-profile "$CODEXPP_NOTARY_PROFILE" --wait
  xcrun stapler staple "$app"
  xcrun stapler validate "$app"
fi
printf 'Built %s\n' "$app"
