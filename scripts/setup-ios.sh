#!/usr/bin/env bash
# Installs the Swift toolchain and xtool in a cloud session (apps/ios/AGENTS.md).
# Not part of session-start.sh: Swift is a 1.1 GB download, needed only for iPhone work.
set -euo pipefail

SWIFT_VERSION=6.4.1
XTOOL_VERSION=1.22.2

if ! /opt/swift/usr/bin/swift --version 2>/dev/null | grep -q "Swift version $SWIFT_VERSION "; then
  echo "Installing Swift $SWIFT_VERSION…"
  tmp=$(mktemp -d)
  curl -fsSL "https://download.swift.org/swift-$SWIFT_VERSION-release/ubuntu2404/swift-$SWIFT_VERSION-RELEASE/swift-$SWIFT_VERSION-RELEASE-ubuntu24.04.tar.gz" -o "$tmp/swift.tgz"
  rm -rf /opt/swift && mkdir -p /opt/swift
  tar xzf "$tmp/swift.tgz" -C /opt/swift --strip-components=1
  rm -rf "$tmp"
fi
ln -sf /opt/swift/usr/bin/* /usr/local/bin/

if ! xtool --version 2>/dev/null | grep -q "$XTOOL_VERSION"; then
  echo "Installing xtool $XTOOL_VERSION…"
  tmp=$(mktemp -d)
  curl -fsSL "https://github.com/xtool-org/xtool/releases/download/$XTOOL_VERSION/xtool-$(uname -m).AppImage" -o "$tmp/xtool"
  chmod +x "$tmp/xtool"
  (cd "$tmp" && ./xtool --appimage-extract >/dev/null)
  rm -rf /opt/xtool && mv "$tmp/squashfs-root" /opt/xtool
  rm -rf "$tmp"
fi
ln -sf /opt/xtool/AppRun /usr/local/bin/xtool

swift --version | head -1
xtool --version
if [ -d "$HOME/.swiftpm/swift-sdks/darwin.artifactbundle" ]; then
  echo "iPhone SDK: installed"
else
  echo "iPhone SDK: not installed. pnpm test:ios works without it; for pnpm build:ios see apps/ios/AGENTS.md."
fi
