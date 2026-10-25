"""Load session records and turn them into training windows.

A record is the JSON the web app exports (SessionRecord in
packages/core/src/coach/session.ts). Research-mode records carry per-frame
features (`features: [{t, f}]`). Stumble times come from, in order of trust:

1. `labels`: human-confirmed labels from the labelling tool (kind != "none");
2. `autoStumbles`: stumbles detected automatically by the app;
3. a fallback detector here (restarts + long mid-sentence gaps).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Iterator

import numpy as np

from . import spec


@dataclass
class Session:
    id: str
    participant: str
    times: np.ndarray  # [T] ms
    frames: np.ndarray  # [T, F]
    stumbles: np.ndarray  # [S] ms, sorted
    label_source: str
    meta: dict = field(default_factory=dict)


def read_records(paths: Iterable[str | Path]) -> Iterator[dict]:
    """Read .json (one record), .jsonl (one per line) or directories of either."""
    for p in map(Path, paths):
        if p.is_dir():
            yield from read_records(sorted([*p.glob("*.json"), *p.glob("*.jsonl")]))
        elif p.suffix == ".jsonl":
            with p.open() as fh:
                for line in fh:
                    if line.strip():
                        yield json.loads(line)
        else:
            yield json.loads(p.read_text())


def fallback_stumbles(record: dict) -> list[float]:
    """Restarts (cursor jumps back) and long gaps between consecutive words."""
    out: list[float] = []
    max_pos = 0
    for a in record.get("alignment", []):
        if a.get("offScript"):
            continue
        pos = a["position"]
        if pos < max_pos - 1 and max_pos - pos <= 25:
            out.append(a["t"])
        max_pos = max(max_pos, pos)
    timings = sorted(record.get("tokenTimings", []), key=lambda x: x["token"])
    for prev, cur in zip(timings, timings[1:]):
        if cur["token"] == prev["token"] + 1 and 1200 < cur["t"] - prev["t"] < 8000:
            out.append(prev["t"])
    return merge_close(sorted(out))


def merge_close(times: list[float], gap_ms: float = 1500) -> list[float]:
    merged: list[float] = []
    for t in times:
        if not merged or t - merged[-1] >= gap_ms:
            merged.append(t)
    return merged


def stumble_times(record: dict) -> tuple[list[float], str]:
    labels = record.get("labels") or []
    if labels:
        return merge_close(sorted(l["t"] for l in labels if l.get("kind") != "none")), "human"
    auto = record.get("autoStumbles") or []
    if auto:
        return merge_close(sorted(s["t"] for s in auto)), "auto"
    return fallback_stumbles(record), "fallback"


def to_session(record: dict) -> Session | None:
    feats = record.get("features") or []
    if len(feats) < spec.WINDOW:
        return None
    if any(len(x["f"]) != spec.FEATURE_COUNT for x in feats):
        raise ValueError(f"session {record.get('id')}: feature count does not match spec v{spec.VERSION}")
    times = np.array([x["t"] for x in feats], dtype=np.float64)
    frames = np.array([x["f"] for x in feats], dtype=np.float32)
    stumbles, source = stumble_times(record)
    return Session(
        id=record["id"],
        participant=str(record.get("participant") or record.get("meta", {}).get("participant") or record["id"]),
        times=times,
        frames=frames,
        stumbles=np.array(stumbles, dtype=np.float64),
        label_source=source,
        meta=record.get("meta", {}),
    )


def load_sessions(paths: Iterable[str | Path]) -> list[Session]:
    sessions = [s for r in read_records(paths) if (s := to_session(r)) is not None]
    return sessions


def frame_labels(session: Session) -> np.ndarray:
    """1 where a stumble starts within (HORIZON_MIN, HORIZON_MAX] seconds after the frame."""
    y = np.zeros(len(session.times), dtype=np.float32)
    lo, hi = spec.HORIZON_MIN_S * 1000, spec.HORIZON_MAX_S * 1000
    for s in session.stumbles:
        y[(session.times >= s - hi) & (session.times < s - lo)] = 1.0
    return y


def windows(session: Session) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Sliding windows [N, WINDOW, F] ending at each frame, with labels [N] and end times [N].

    The first WINDOW-1 frames are zero-padded on the left, exactly like the
    browser's StumbleMonitor does at the start of a session.
    """
    w = spec.WINDOW
    pad = np.zeros((w - 1, spec.FEATURE_COUNT), dtype=np.float32)
    padded = np.concatenate([pad, session.frames], axis=0)
    idx = np.arange(len(session.frames))[:, None] + np.arange(w)[None, :]
    return padded[idx], frame_labels(session), session.times


def split_by_participant(sessions: list[Session], val_fraction: float = 0.2, seed: int = 0) -> tuple[list[Session], list[Session]]:
    """Hold out whole participants so validation measures generalisation to new speakers."""
    people = sorted({s.participant for s in sessions})
    rng = np.random.default_rng(seed)
    rng.shuffle(people)
    n_val = max(1, int(round(len(people) * val_fraction))) if len(people) > 1 else 0
    val_people = set(people[:n_val])
    train = [s for s in sessions if s.participant not in val_people]
    val = [s for s in sessions if s.participant in val_people]
    return train, val


def stack(sessions: list[Session]) -> tuple[np.ndarray, np.ndarray]:
    xs, ys = [], []
    for s in sessions:
        x, y, _ = windows(s)
        xs.append(x)
        ys.append(y)
    if not xs:
        return np.zeros((0, spec.WINDOW, spec.FEATURE_COUNT), np.float32), np.zeros((0,), np.float32)
    return np.concatenate(xs), np.concatenate(ys)
