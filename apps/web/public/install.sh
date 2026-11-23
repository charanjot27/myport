#!/bin/sh
# JOTR Desktop installer for macOS.
#   curl -fsSL https://jotr1.netlify.app/install.sh | sh
# Downloads the latest JOTR for this Mac (Apple Silicon or Intel), puts it in
# /Applications and opens it. Files fetched with curl carry no "downloaded from
# the internet" flag, so macOS doesn't call the (not yet notarized) app damaged.
set -eu

REPO="charanjot27/myport"
BASE="${JOTR_DOWNLOAD_BASE:-https://github.com/$REPO/releases/latest/download}"
APP_DIR="${JOTR_APP_DIR:-/Applications}"

say() { printf '\033[1;38;5;209m▸\033[0m %s\n' "$1"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "This installer is for macOS. On Windows, download JOTR from https://jotr1.netlify.app"

case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  x86_64)
    # Intel build, unless this is an Apple Silicon Mac running the shell under Rosetta.
    if [ "$(sysctl -in sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then ARCH=arm64; else ARCH=x64; fi ;;
  *) die "Unsupported Mac processor: $(uname -m)" ;;
esac

TMP="$(mktemp -d)"
MOUNT=""
cleanup() {
  [ -n "$MOUNT" ] && hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

say "Downloading JOTR for $( [ "$ARCH" = arm64 ] && echo 'Apple Silicon' || echo 'Intel' ) Macs…"
curl -fL --progress-bar "$BASE/JOTR-mac-$ARCH.dmg" -o "$TMP/JOTR.dmg" || die "Download failed. Check your internet connection and try again."

say "Installing into $APP_DIR…"
MOUNT="$TMP/mnt"
mkdir -p "$MOUNT"
hdiutil attach "$TMP/JOTR.dmg" -nobrowse -readonly -mountpoint "$MOUNT" -quiet || die "Could not open the downloaded disk image."
[ -d "$MOUNT/JOTR.app" ] || die "JOTR.app not found in the download."

# Quit a running JOTR so it can be replaced.
osascript -e 'tell application "JOTR" to quit' >/dev/null 2>&1 || true
sleep 1

if [ -w "$APP_DIR" ]; then SUDO=""; else SUDO="sudo"; say "Your password may be needed to write to $APP_DIR."; fi
$SUDO rm -rf "$APP_DIR/JOTR.app"
$SUDO cp -R "$MOUNT/JOTR.app" "$APP_DIR/"
# Belt and braces: clear the flag in case anything set it.
$SUDO xattr -dr com.apple.quarantine "$APP_DIR/JOTR.app" 2>/dev/null || true

say "Opening JOTR…"
open "$APP_DIR/JOTR.app"
printf '\n\033[1;32m✓\033[0m JOTR is installed. Look for the notch under your camera, and the JOTR icon in the menu bar.\n'
printf '  Press ⌥ Space to start reading.\n'
