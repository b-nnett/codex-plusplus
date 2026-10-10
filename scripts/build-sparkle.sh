#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
sparkle_commit=066e75a8b3e99962685d6a90cdd5293ebffd9261
sparkle_root="$PWD/.build/sparkle-framework"
patch_hash="$(shasum -a 256 vendor/sparkle/local-peer-authentication.patch | awk '{print $1}')"
if [ ! -f "$sparkle_root/patch.sha256" ] || [ "$(cat "$sparkle_root/patch.sha256")" != "$patch_hash" ]; then
  sparkle_source="$PWD/.build/sparkle-source"
  if [ ! -d "$sparkle_source/.git" ]; then git clone --no-checkout https://github.com/sparkle-project/Sparkle.git "$sparkle_source"; fi
  git -C "$sparkle_source" checkout --force --detach "$sparkle_commit"
  git -C "$sparkle_source" apply "$PWD/vendor/sparkle/local-peer-authentication.patch"
  xcodebuild -project "$sparkle_source/Sparkle.xcodeproj" -scheme Sparkle -configuration Release \
    -derivedDataPath "$PWD/.build/sparkle-products" ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
    MACOSX_DEPLOYMENT_TARGET=12.0 CODE_SIGNING_ALLOWED=NO build
  mkdir -p "$sparkle_root"
  rm -rf "$sparkle_root/Sparkle.framework"
  ditto "$PWD/.build/sparkle-products/Build/Products/Release/Sparkle.framework" "$sparkle_root/Sparkle.framework"
  printf '%s' "$patch_hash" > "$sparkle_root/patch.sha256"
fi
sparkle_identity="${CODEXPP_SIGNING_IDENTITY:-}"
if [ -z "$sparkle_identity" ]; then
  sparkle_identity="$(security find-identity -v -p codesigning | awk '/"Developer ID Application:/ {print $2}')"
fi
if [ -z "$sparkle_identity" ] || [[ "$sparkle_identity" == *$'\n'* ]] || [ "$sparkle_identity" = "-" ]; then
  echo 'A persistent signing identity is required for authenticated updater peers.' >&2; exit 1
fi
sparkle_framework="$sparkle_root/Sparkle.framework"
cat > "$sparkle_root/downloader.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>com.apple.security.app-sandbox</key><true/><key>com.apple.security.network.client</key><true/></dict></plist>
PLIST
codesign --force --options runtime --sign "$sparkle_identity" --entitlements "$sparkle_root/downloader.plist" "$sparkle_framework/Versions/B/XPCServices/Downloader.xpc"
codesign --force --options runtime --sign "$sparkle_identity" "$sparkle_framework/Versions/B/XPCServices/Installer.xpc"
codesign --force --options runtime --sign "$sparkle_identity" "$sparkle_framework/Versions/B/Autoupdate"
codesign --force --options runtime --sign "$sparkle_identity" "$sparkle_framework/Versions/B/Updater.app"
codesign --force --options runtime --sign "$sparkle_identity" "$sparkle_framework"
codesign --verify --deep --strict "$sparkle_framework"
