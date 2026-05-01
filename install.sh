#!/usr/bin/env bash
set -euo pipefail

REPO="${CODEX_PLUSPLUS_REPO:-b-nnett/codex-plusplus}"
REF="${CODEX_PLUSPLUS_REF:-main}"

fail() {
  echo "[!] $1" >&2
  echo "    Paste this error into Codex if you need help." >&2
  exit 1
}

require_command() {
  local cmd="$1"
  local message="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "$message"
  fi
}

chown_to_sudo_user() {
  local path="$1"
  if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_UID:-}" ] && [ -n "${SUDO_GID:-}" ]; then
    chown -R "$SUDO_UID:$SUDO_GID" "$path" 2>/dev/null || true
  fi
}

resolve_sudo_home() {
  if [ "$(id -u)" -ne 0 ] || [ -z "${SUDO_USER:-}" ] || [ "$SUDO_USER" = "root" ]; then
    return 0
  fi

  local sudo_home=""
  if command -v dscl >/dev/null 2>&1; then
    sudo_home="$(dscl . -read "/Users/$SUDO_USER" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
  elif command -v getent >/dev/null 2>&1; then
    sudo_home="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
  fi

  if [ -n "$sudo_home" ] && [ -d "$sudo_home" ]; then
    HOME="$sudo_home"
    export HOME
  fi
}

resolve_sudo_home
INSTALL_DIR="${CODEX_PLUSPLUS_SOURCE_DIR:-$HOME/.codex-plusplus/source}"

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js 20+ is required but node was not found."
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js 20+ is required; found $(node -v)."
fi

require_command npm "npm is required to build codex-plusplus from GitHub source."
require_command curl "curl is required to download codex-plusplus from GitHub."
require_command tar "tar is required to unpack the codex-plusplus download."

WORK="$(mktemp -d "${TMPDIR:-/tmp}/codex-plusplus.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

ARCHIVE="$WORK/source.tar.gz"
EXTRACT="$WORK/extract"
NEXT="$WORK/source"

echo "Downloading codex-plusplus from https://github.com/$REPO ($REF)..."
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" -o "$ARCHIVE" ||
  fail "Download failed from https://github.com/$REPO ($REF). Check the repo, branch, and network connection."
mkdir -p "$EXTRACT"
tar -xzf "$ARCHIVE" -C "$EXTRACT" --strip-components 1 ||
  fail "Could not unpack the codex-plusplus download."
mv "$EXTRACT" "$NEXT"

echo "Installing dependencies..."
(
  cd "$NEXT"
  if [ -f package-lock.json ]; then
    if ! npm ci --workspaces --include-workspace-root --ignore-scripts; then
      echo "npm ci failed; regenerating the downloaded lockfile and installing workspace dependencies." >&2
      rm -f package-lock.json
      npm install --workspaces --include-workspace-root --ignore-scripts ||
        fail "npm install failed while installing codex-plusplus dependencies."
    fi
  else
    npm install --workspaces --include-workspace-root --ignore-scripts ||
      fail "npm install failed while installing codex-plusplus dependencies."
  fi
)

echo "Building codex-plusplus..."
(
  cd "$NEXT"
  npm run build || fail "codex-plusplus build failed."
)

mkdir -p "$(dirname "$INSTALL_DIR")"
rm -rf "$INSTALL_DIR.previous"
if [ -d "$INSTALL_DIR" ]; then
  mv "$INSTALL_DIR" "$INSTALL_DIR.previous"
fi
mv "$NEXT" "$INSTALL_DIR"
chown_to_sudo_user "$INSTALL_DIR"

echo "Running installer..."
node "$INSTALL_DIR/packages/installer/dist/cli.js" install "$@" ||
  fail "codex-plusplus installer failed."

echo
echo "codex-plusplus source installed at: $INSTALL_DIR"
