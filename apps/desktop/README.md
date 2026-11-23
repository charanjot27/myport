# JOTR Desktop

A teleprompter that grows out of your Mac's notch, right under the camera.

- **Over every app.** Meet, Zoom, Keynote, OBS, full-screen apps, every desktop: not just Chrome tabs.
- **Under the notch, or anywhere.** It hangs from the camera with curved edges like the hardware notch. Drag it anywhere; drop it near the top centre to snap back.
- **Out of screen recordings.** Asks the system to leave the window out of screenshots, recordings and screen sharing (`setContentProtection`). Reliable on Windows 10 2004+ and most macOS recorders; some newer macOS capture paths can still show it, so test with your recorder.
- **Follows your exact words.** *Chrome voice* (the default) uses Google Chrome's free speech recognition, the same as the JOTR website: word by word, in English, Hindi, Punjabi, Hinglish and more. When you press Start, JOTR opens a small Chrome window (served by the app on `localhost`) that listens and sends each word to the notch. Keep it open; behind other windows is fine. Needs Chrome and internet.
- Other modes: *Voice pace* (offline, scrolls at your speaking speed), *Deepgram* (your own API key), *Steady* (fixed speed).
- **Voice glow.** The glow under the text rises with your pitch and brightens with your loudness.
- **Manual control.** Scroll over the text to move line by line, click any word to continue from there, and use the sections pill (`# Heading` lines in the script) to jump around.

## Shortcuts (⌥ Option on Mac, Ctrl+Alt on Windows)

| Mac | Windows | |
|---|---|---|
| ⌥Space | Ctrl+Alt+Space | start / pause |
| ⌥H | Ctrl+Alt+H | show / hide |
| ⌥R | Ctrl+Alt+R | start over |
| ⌥↑ / ⌥↓ | Ctrl+Alt+↑ / ↓ | previous / next line (only while reading) |
| ⌥← / ⌥→ | Ctrl+Alt+← / → | previous / next section (only while reading) |

## Run it

```
pnpm install
pnpm --filter @promptsense/desktop start
```

## Install on a Mac

```
curl -fsSL https://jotr1.netlify.app/install.sh | sh
```

Downloads the latest release for Apple Silicon or Intel, installs it into Applications and opens it (no "damaged" warning, because curl downloads aren't flagged).

## Build the app

On a Mac: `pnpm --filter @promptsense/desktop dist:mac` → `apps/desktop/release/JOTR-0.1.0-arm64.dmg`.
On Windows: `pnpm --filter @promptsense/desktop dist:win`.

Unsigned builds work on your own computer (on a Mac, right-click → Open the first time). To share the app without
security warnings, sign and notarize it with an Apple Developer account ($99/year).

## Tests

```
pnpm --filter @promptsense/desktop test                         # voice analysis + placement
xvfb-run -a npx electron --no-sandbox -r ./test/app.e2e.cjs .            # launches the real app (Linux)
xvfb-run -a npx electron --no-sandbox -r ./test/chrome-voice.e2e.cjs .   # Chrome voice relay, word by word
xvfb-run -a npx electron --no-sandbox -r ./test/shortcuts.e2e.cjs .       # global shortcuts
```
