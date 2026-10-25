# Chrome Web Store listing: JOTR

Paste these into the Chrome Web Store developer dashboard
(https://chrome.google.com/webstore/devconsole). Site: https://jotr1.netlify.app

## Package

```
JOTR_SITE_ORIGIN=https://jotr1.netlify.app pnpm --filter @promptsense/extension package
```

Upload `apps/extension/jotr-chrome-web-store.zip`. For every later update, raise
`version` in `static/manifest.json` first.

## Store listing tab

**Name** (from the manifest): JOTR for video calls

**Summary** (max 132 characters):
Hide your script's reflection in your eyes and keep natural eye contact while you read, in Meet, Zoom and Teams.

**Description:**

JOTR is a teleprompter that keeps your eyes on your audience. This extension brings it into your video calls.

In Google Meet, Zoom, Microsoft Teams, Whereby, Riverside and StreamYard (web), JOTR improves your own camera, on your computer:

• Corneal shield: softly blurs the reflection of your screen and script in your eyes and glasses, so viewers can't see what you're reading.
• Natural eye contact while reading: gently corrects your gaze only while you read. Glances and pauses stay natural.
• One click opens the JOTR teleprompter: your script sits right under your camera and scrolls with your voice, in English, Hindi, Punjabi or Hinglish.

Private by design: your video is processed on your computer and is never uploaded or stored by JOTR. Turn any effect on or off from the toolbar icon.

Website: https://jotr1.netlify.app

**Category:** Productivity (or Tools)
**Language:** English

**Images** (made in JOTR's style):
- Store icon 128×128: `static/icons/128.png`
- Screenshots 1280×800: hero, closer look, library, prompter, extension popup
- Small promo tile 440×280, Marquee 1400×560

**Website / homepage:** https://jotr1.netlify.app

## Privacy practices tab

**Single purpose:**
Improves the user's own camera in web video calls (reflection shield and reading-aware eye contact) and opens the JOTR teleprompter.

**Permission justifications:**
- `storage`: Saves the user's effect settings (on/off switches and eye-contact strength).
- Host access to meet.google.com, *.zoom.us, teams.microsoft.com, teams.live.com, *.whereby.com, app.riverside.fm, streamyard.com: The extension processes the user's own camera inside these call sites. A content script wraps the page's camera request so the call receives the processed video. Audio is never touched.
- Content script on https://jotr1.netlify.app: Tells the JOTR website the extension is installed, so it can show "Added to Chrome".
- Main-world content script (`world: MAIN`): Needed to wrap `navigator.mediaDevices.getUserMedia` on the call page, which is only visible in the page's own JavaScript world.

**Remote code:** No. All code and the face-tracking model are bundled inside the extension.

**Data usage:** The extension does not collect or transmit any user data. Tick none of the data types, then certify:
- I do not sell or transfer user data to third parties outside the approved use cases.
- I do not use or transfer user data for purposes unrelated to the item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://jotr1.netlify.app/privacy

## Distribution tab

Visibility: Public. Regions: All regions.

## After approval

Copy the listing URL (https://chromewebstore.google.com/detail/…) and set it on Netlify:
Site configuration → Environment variables → `VITE_CHROME_STORE_URL` = that URL, then redeploy.
"Add to Chrome" on the site then opens the store page directly.
