# PromptSense

A browser teleprompter that watches and listens to the speaker. It follows your
voice, predicts stumbles before they happen, keeps eye contact natural, hides
your script's reflection in your eyes, and can prove the speaker is live.

Video never leaves the device: face, eye and hand tracking run in the browser.

## What's in the box

| Path | What it is |
|---|---|
| `packages/core` | Platform-independent engine: script parsing, streaming speech-to-script alignment, scroll physics, gaze calibration, reading detection, stumble features and predictor, coach report, gestures, liveness scoring. `@promptsense/core/browser` holds the WebGL effects. |
| `apps/web` | The product: Vite + React app (setup tour, script library, editor, prompter with camera-focus and always-on-top floating modes, calibration, coach report, liveness check, research labelling, account). |
| `services/api` | Fastify API on PostgreSQL (or SQLite for development): accounts, script sync, session summaries, cloud-speech tokens, signed liveness attestations, Stripe billing, research uploads, data export and deletion. |
| `apps/extension` | Chrome extension that applies the corneal shield and reading-aware eye contact to your camera inside Meet, Zoom, Teams, Whereby, Riverside and StreamYard. |
| `ml` | Training pipeline for the stumble predictor (PyTorch → ONNX). |
| `deploy` | Dockerfiles, nginx config with a strict Content Security Policy, docker-compose with PostgreSQL. |

### Module status (against the concept doc)

| Module | Status |
|---|---|
| 0. Speech-synced scrolling | **Built.** Browser speech (free) or Deepgram streaming (Pro, script terms boosted). Fuzzy, phonetic alignment that handles ad-libs, skips, restarts and off-script talk. Fixed-speed and manual modes, mirror mode, pause on look-away. |
| 1. Eye-voice span stumble prediction | **Built.** Gaze calibration, line-level gaze-to-word mapping, 13 features at 10 Hz, heuristic baseline, trainable GRU shipped as ONNX. The scroll slows and the hard word is highlighted ahead of time. Needs real volunteer data to train the production model. |
| 2. Saccade-aware eye contact | **Built.** A reading-vs-not classifier gates a GPU eye-region warp, with smooth blending and faster ramps during blinks. Runs in recordings (web) and in calls (extension). The naturalness user study is still to be run. |
| 5. Screen-light liveness | **Built.** Server-seeded colour challenge (photosensitivity-safe), server-side scoring, Ed25519-signed attestations, public key endpoint. |
| 5. Corneal reflection shield | **Built** (defence): iris-region blur plus highlight compression, before video leaves the device. The attack demo (super-resolution + OCR) is research work, not shipped. |
| Coach mode | **Built.** Pace, fillers, stumbles timeline, pauses, eye contact, posture, fidgeting, coverage, tips, and how well the predictor anticipated each stumble. |
| Gesture control | **Built.** Open palm = pause, ✌ = next section, ☝ = rewind sentence, 👍 = resume, 👎 = previous section. Hold to confirm, with a progress ring. |
| 3. Lip-reading fallback | **Not built.** Needs a server GPU visual-speech model. The VAD already estimates SNR, so fusion can be added later. |
| 4. Audience-aware pacing | **Not built, on purpose.** Analysing other call participants' faces raises biometric-consent issues, and emotion recognition in education and workplaces is prohibited under EU AI Act Art. 5(1)(f). Get legal review before building it. |
| Desktop virtual camera | **Not built.** The Chrome extension covers web-based calls. Native Zoom, Teams and OBS need a signed native app with a virtual camera driver. |

## Quick start (development)

Requirements: Node 22+, pnpm 10 (`corepack enable`), Chrome or Edge.

```bash
cd jotr
pnpm install
pnpm --filter @promptsense/web assets     # copies MediaPipe/ONNX runtimes, downloads face & hand models

# Web app only (local-first, no account needed)
pnpm dev                                  # http://localhost:5173

# With the API (accounts, sync, liveness signing): two terminals
pnpm dev:api                              # http://localhost:8787 (SQLite in services/api/data/)
VITE_API_URL=/api pnpm dev                # Vite proxies /api to the API
```

Camera and microphone need a secure context: `localhost` works; anything else needs HTTPS.

## Testing on your laptop

Automated tests cover logic, the UI flow (fake camera and mic, scripted speech),
pixel-level checks of the effects, the extension, and the full Docker stack.
They can't judge real-world feel. Please check these with real hardware:

1. **Setup tour** (opens on first visit, or **Setup tour** in the header): it should take under a minute. Check that it detects your Mac and camera, and that the text in step 6 sits right under your camera.
2. **Floating over other tabs:** open a script and click **⧉ Start floating (any tab)**. Drag the small window right under your camera, then switch to Google Meet or another site. The text should stay on top and keep following your voice. ⤺ brings it back; ■ finishes.
3. **Look at the lens:** record a take and watch it back. While reading, you should appear to be looking at the viewer.
4. **Reflections:** wear your glasses if you have them. The reflection check should report whether text showed up and pick a brightness. Then zoom into a recording: no readable text in your eyes or lenses. Use ☾/☀ in the prompter toolbar to adjust.
5. **Voice following** (Chrome): read the sample script, skip a paragraph, re-read a sentence, say "um". The underline should track you within about 2 words.
6. **Calibration** (about 8 s, in the tour or at `/calibrate`): the result should be "good" or "usable". It keeps fine-tuning while you read.
7. **Stumble assist**: read a script with hard words. Watch for hard words turning orange just before you reach them.
8. **Look-away pause**: turn your head away; the scroll should pause and resume when you look back.
9. **Gestures** (enable in Settings): an open palm toggles pause; ✌ jumps a section.
10. **Liveness** (`/verify`): try it in a normally lit room, then hold a phone video of yourself up to the camera; that should fail.
11. **Extension**: `pnpm --filter @promptsense/extension build`, then load `apps/extension/dist` via `chrome://extensions` (Developer mode → Load unpacked). Join a Meet test call and check the self-view.

Tell me what breaks and what feels off; that is the feedback loop.

## Tests

```bash
pnpm -r typecheck
pnpm --filter @promptsense/core --filter @promptsense/api --filter @promptsense/web test   # unit tests
pnpm --filter @promptsense/web build && pnpm --filter @promptsense/web e2e                  # Playwright, fake media
pnpm --filter @promptsense/extension test                                                   # extension + WebGL effects
cd ml && .venv/bin/pytest                                                                   # ML pipeline (see ml/README.md)
```

End-to-end tests replace speech recognition with a deterministic source
(`window.__promptsenseFakeSpeech`). They run under the production Content
Security Policy, and can target a running deployment with
`E2E_BASE_URL=http://localhost:8080`.

## Deploy

```bash
cp deploy/.env.example deploy/.env
pnpm --filter @promptsense/api keygen >> deploy/.env    # liveness signing key
# edit deploy/.env: APP_URL, POSTGRES_PASSWORD, optional Deepgram/Stripe/admin token
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

This serves the app on port 8080 (put TLS in front, e.g. Caddy, a cloud load
balancer, or Cloudflare). The API runs migrations on start. Configuration:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgres://…` (compose sets it) |
| `LIVENESS_PRIVATE_KEY`, `LIVENESS_KEY_ID` | Ed25519 key for attestations (required in production) |
| `DEEPGRAM_API_KEY` | Enables cloud speech for Pro users (`CLOUD_ASR_FOR_ALL=true` for a pilot) |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Pro subscriptions; webhook URL `https://<app>/api/billing/webhook` with events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` |
| `ADMIN_TOKEN` | Bearer token for `GET /research/export` (study data for `ml/`) |
| `CORS_ORIGINS`, `APP_URL`, `COOKIE_SAMESITE`, `TRUST_PROXY` | Origin checks, redirects, cookies behind a proxy |

**Shipping a trained stumble model:** `python -m promptsense_ml.train --data … --deploy ../apps/web/public/models`, then rebuild the web image. The browser loads it automatically and refuses models built for a different feature spec.

**Extension release:** `pnpm --filter @promptsense/extension build`, zip `apps/extension/dist`, then submit to the Chrome Web Store. Expect review questions about `world: MAIN` and camera processing; the privacy page explains it.

## Privacy and security notes

- Video and audio are never uploaded or stored by PromptSense. Speech audio goes to the recogniser the user picks (Google via the browser, or Deepgram for Pro); "Off" keeps it local.
- Research uploads need explicit consent on the account. They contain derived features only, the API rejects media fields, and withdrawing consent deletes them. Get **ethics board approval** before recruiting volunteers.
- Passwords use scrypt. Sessions are httpOnly cookies. State-changing requests are checked against allowed origins. Auth endpoints are rate-limited.
- The web app ships with a strict CSP: no third-party scripts, and models are served from the same origin.
- Users can export and delete their account data (`/account`).
- Before launch, get legal review of the privacy policy, a DPIA for biometric processing (GDPR Art. 9, Quebec Law 25, Illinois BIPA), and the speech provider's data processing agreement.

## Architecture

```
camera ─► MediaPipe face/iris/hands (WebGPU → CPU fallback) ─┐
mic ───► VAD + speech recogniser (browser / Deepgram) ───────┤
                                                             ▼
                          FusionTimeline (one clock: performance.now)
            ┌──────────────┬──────────────┬──────────────┬──────────────┐
         aligner      gaze → word    reading gate     gestures      liveness
            │          stumble features (10 Hz) → heuristic / ONNX GRU
            ▼                          ▼                ▼
   scroll controller ◄── slow-down ── warning      WebGL eye warp + corneal blur
            │                                           │
       prompter view                          recording / extension track
            └──────────────► SessionRecord (derived signals only) ─► coach report, research export
```
