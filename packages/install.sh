#!/usr/bin/env bash
# install.sh — download and install the twf CLI from a GitHub Release.
#
# Usage:
#   curl -sSL https://github.com/jmbarzee/temporal-architect/releases/latest/download/install.sh | bash
#
# Environment variables (all optional):
#   VERSION      — release tag to install, e.g. "v0.3.0" (default: latest)
#   INSTALL_DIR  — directory to place the twf binary (default: ~/.local/bin)
set -euo pipefail

REPO="jmbarzee/temporal-architect"
BINARY="twf"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

# ── Detect platform ───────────────────────────────────────────────────────────

detect_os() {
  case "$(uname -s)" in
    Darwin)  echo "darwin" ;;
    Linux)   echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT) echo "windows" ;;
    *)
      echo "Unsupported OS: $(uname -s)" >&2
      exit 1
      ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    arm64|aarch64) echo "arm64" ;;
    *)
      echo "Unsupported architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac
}

OS="$(detect_os)"
ARCH="$(detect_arch)"

# ── Resolve version ───────────────────────────────────────────────────────────

if [ -z "${VERSION:-}" ]; then
  echo "Fetching latest release version..."
  VERSION="$(curl -sSfL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
fi

if [ -z "$VERSION" ]; then
  echo "Could not determine version to install." >&2
  exit 1
fi

echo "Installing twf ${VERSION} for ${OS}/${ARCH}"

# ── Build download URLs ───────────────────────────────────────────────────────

BASE_URL="https://github.com/${REPO}/releases/download/${VERSION}"

if [ "$OS" = "windows" ]; then
  ARCHIVE="${BINARY}-${VERSION}-${OS}-${ARCH}.zip"
else
  ARCHIVE="${BINARY}-${VERSION}-${OS}-${ARCH}.tar.gz"
fi

ARCHIVE_URL="${BASE_URL}/${ARCHIVE}"
SUMS_URL="${BASE_URL}/SHA256SUMS"

# ── Download ──────────────────────────────────────────────────────────────────

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading ${ARCHIVE}..."
curl -sSfL "$ARCHIVE_URL" -o "${TMP_DIR}/${ARCHIVE}"

echo "Downloading SHA256SUMS..."
curl -sSfL "$SUMS_URL" -o "${TMP_DIR}/SHA256SUMS"

# ── Verify checksum ───────────────────────────────────────────────────────────

echo "Verifying checksum..."
(cd "$TMP_DIR" && grep "$ARCHIVE" SHA256SUMS | sha256sum --check --status)
echo "Checksum OK"

# ── Extract ───────────────────────────────────────────────────────────────────

if [ "$OS" = "windows" ]; then
  unzip -q "${TMP_DIR}/${ARCHIVE}" -d "$TMP_DIR"
  EXTRACTED="${TMP_DIR}/${BINARY}.exe"
else
  tar -xzf "${TMP_DIR}/${ARCHIVE}" -C "$TMP_DIR"
  EXTRACTED="${TMP_DIR}/${BINARY}"
fi

chmod +x "$EXTRACTED"

# ── Install ───────────────────────────────────────────────────────────────────

mkdir -p "$INSTALL_DIR"
mv "$EXTRACTED" "${INSTALL_DIR}/${BINARY}$([ "$OS" = "windows" ] && echo ".exe" || true)"

echo "Installed twf ${VERSION} to ${INSTALL_DIR}/${BINARY}"

# Warn if INSTALL_DIR is not on PATH
case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    echo ""
    echo "WARNING: ${INSTALL_DIR} is not in your PATH."
    echo "Add the following to your shell profile:"
    echo "  export PATH=\"\$PATH:${INSTALL_DIR}\""
    ;;
esac
