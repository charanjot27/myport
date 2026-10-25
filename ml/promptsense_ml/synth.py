"""Synthetic research sessions.

Lets the whole pipeline (training, evaluation, export, browser loading) run
before real volunteer data exists, and gives CI a fast end-to-end check. The
generative story follows the eye-voice span literature: the eyes normally
lead the voice by 2–3 words; in the second or two before a stumble the lead
collapses, fixations lengthen, regressions appear and speech slows. Hard
words make stumbles more likely.

Models trained on this data are only placeholders: they learn the story we
wrote, not real speakers. Retrain on labelled recordings before shipping.
"""

from __future__ import annotations

import argparse
import json
import math
import uuid
from pathlib import Path

import numpy as np

from . import spec


def _difficulties(rng: np.random.Generator, n: int) -> np.ndarray:
    d = rng.beta(1.2, 4.0, size=n)
    hard = rng.random(n) < 0.08
    d[hard] = rng.uniform(0.6, 0.95, size=hard.sum())
    return d


def generate_session(rng: np.random.Generator, participant: str, n_words: int = 220) -> dict:
    hz = spec.FRAME_HZ
    dt = 1000.0 / hz
    diff = _difficulties(rng, n_words)
    base_rate = rng.uniform(2.0, 2.8)  # words per second
    base_evs = rng.uniform(1.8, 3.2)
    gaze_noise = rng.uniform(0.4, 0.9)
    validity = rng.uniform(0.8, 0.97)

    t = 0.0
    pos = 0.0
    frames: list[dict] = []
    stumbles: list[float] = []
    pending: dict | None = None  # upcoming stumble: {at_word, onset_t, start_t}
    paused_until = -1.0
    last_advance_t = 0.0
    prev_evs = base_evs
    gaze_hist: list[float] = []
    fixation_start = 0.0
    fixation_word = -1
    word_times: list[float] = []

    while pos < n_words - 1:
        word = int(pos)
        # Decide whether a stumble is coming on one of the next words.
        if pending is None and t > paused_until:
            ahead = diff[word + 1 : word + 4]
            hazard = 0.004 + 0.06 * float(np.max(ahead, initial=0.0)) ** 3
            if rng.random() < hazard:
                lead = rng.uniform(0.6, 1.9)
                pending = {"start_t": t + lead * 1000, "onset_t": t}

        # Eye-voice span: healthy lead, collapsing as a stumble approaches.
        if pending:
            progress = min(1.0, (t - pending["onset_t"]) / max(1.0, pending["start_t"] - pending["onset_t"]))
            evs_target = base_evs * (1 - progress) + rng.uniform(-0.3, 0.6) * progress
            rate = base_rate * (1 - 0.45 * progress)
        else:
            evs_target = base_evs + 0.6 * math.sin(t / 2300.0)
            rate = base_rate * (1 - 0.25 * diff[word])
        evs = 0.7 * prev_evs + 0.3 * evs_target

        speaking = t > paused_until
        if pending and t >= pending["start_t"]:
            stumbles.append(t)
            paused_until = t + rng.uniform(600, 1500)
            if rng.random() < 0.5:
                pos = max(0.0, pos - rng.integers(2, 6))  # restart a few words back
            pending = None
            speaking = False

        if speaking:
            new_pos = pos + rate * dt / 1000.0
            if int(new_pos) > int(pos):
                last_advance_t = t
                word_times.append(t)
            pos = new_pos
        word_times = [x for x in word_times if x >= t - 3000]

        valid = rng.random() < validity
        gaze_word = int(round(pos + evs + rng.normal(0, gaze_noise))) if valid else None
        if gaze_word is None or abs(gaze_word - fixation_word) > 1:
            fixation_word = gaze_word if gaze_word is not None else -1
            fixation_start = t
        gaze_hist = (gaze_hist + [gaze_word if gaze_word is not None else math.nan])[-5:]
        regression = 0.0
        if gaze_word is not None:
            regression = float(any(not math.isnan(g) and g - gaze_word > 2 for g in gaze_hist))
            if pending and rng.random() < 0.08:
                regression = 1.0

        ahead = diff[int(pos) + 1 : int(pos) + 5]
        f = [0.0] * spec.FEATURE_COUNT
        I = spec.IDX
        evs_obs = (gaze_word - int(pos)) if gaze_word is not None else 0.0
        f[I["evs_words"]] = float(np.clip(evs_obs, -10, 20) / 10)
        f[I["evs_delta"]] = float(np.clip(evs - prev_evs, -10, 10) / 10) * 5 if valid else 0.0
        f[I["gaze_valid"]] = 1.0 if valid else 0.0
        f[I["fixation_s"]] = min(3.0, (t - fixation_start) / 1000) if valid else 0.0
        f[I["regression"]] = regression
        f[I["next_difficulty_max"]] = float(np.max(ahead, initial=0.0))
        f[I["next_difficulty_mean"]] = float(np.mean(ahead)) if len(ahead) else 0.0
        f[I["speech_rate"]] = min(8.0, len(word_times) / 3) / 4
        f[I["since_advance_s"]] = min(3.0, (t - last_advance_t) / 1000)
        f[I["speaking"]] = 1.0 if speaking else 0.0
        f[I["align_confidence"]] = float(np.clip(rng.normal(0.85, 0.08), 0, 1))
        f[I["off_script"]] = 1.0 if rng.random() < 0.01 else 0.0
        f[I["break_ahead"]] = 1.0 if rng.random() < 0.07 else 0.0
        frames.append({"t": round(t, 1), "f": [round(v, 4) for v in f]})
        prev_evs = evs
        t += dt

    return {
        "version": 1,
        "id": str(uuid.UUID(int=int(rng.integers(0, 2**63)))),
        "participant": participant,
        "scriptId": "synthetic",
        "scriptTitle": "synthetic",
        "scriptSource": "",
        "startedAt": "2026-01-01T00:00:00Z",
        "durationMs": t,
        "tokenTimings": [],
        "transcript": [],
        "alignment": [],
        "gaze": [],
        "face": [],
        "stumbleRisk": [],
        "events": [],
        "features": frames,
        "autoStumbles": [{"t": s, "kind": "hesitation", "token": 0} for s in stumbles],
        "meta": {"synthetic": True},
    }


def generate(n_participants: int, sessions_per_participant: int, seed: int = 0) -> list[dict]:
    rng = np.random.default_rng(seed)
    out = []
    for p in range(n_participants):
        for _ in range(sessions_per_participant):
            out.append(generate_session(rng, participant=f"synthetic-{p:03d}"))
    return out


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Write synthetic research sessions as JSON Lines.")
    ap.add_argument("--participants", type=int, default=24)
    ap.add_argument("--sessions", type=int, default=3, help="sessions per participant")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", type=Path, default=Path("data/synthetic.jsonl"))
    args = ap.parse_args(argv)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    records = generate(args.participants, args.sessions, args.seed)
    with args.out.open("w") as fh:
        for r in records:
            fh.write(json.dumps(r) + "\n")
    print(f"wrote {len(records)} sessions to {args.out}")


if __name__ == "__main__":
    main()
