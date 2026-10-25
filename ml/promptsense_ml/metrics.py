"""Metrics that match how the product uses the model.

Frame-level AUC-PR is useful for model selection, but the headline metric
from the concept doc is event-level: of all stumbles, how many got a warning
0.3–2 s in advance (recall at lead), and how many warnings were followed by
a stumble (precision). Warnings use the same smoothing and hysteresis as the
browser's StumbleMonitor.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from . import spec
from .data import Session, windows


def average_precision(y: np.ndarray, p: np.ndarray) -> float:
    if y.sum() == 0:
        return float("nan")
    order = np.argsort(-p)
    y = y[order]
    tp = np.cumsum(y)
    precision = tp / np.arange(1, len(y) + 1)
    return float((precision * y).sum() / y.sum())


def warnings_from_risk(times: np.ndarray, risk: np.ndarray, on: float, off: float) -> np.ndarray:
    """Browser-equivalent smoothing (0.6/0.4 EMA) and hysteresis; returns warning onset times."""
    smoothed = 0.0
    active = False
    onsets = []
    for t, r in zip(times, risk):
        smoothed = 0.6 * smoothed + 0.4 * float(r)
        if not active and smoothed >= on:
            active = True
            onsets.append(t)
        elif active and smoothed <= off:
            active = False
    return np.array(onsets)


@dataclass
class EventMetrics:
    stumbles: int
    warnings: int
    caught: int
    recall: float
    precision: float
    mean_lead_s: float
    false_alarms_per_min: float

    def to_dict(self) -> dict:
        return asdict(self)


def event_metrics(sessions: list[Session], risk_fn, on: float = 0.6, off: float = 0.4) -> EventMetrics:
    lo, hi = spec.HORIZON_MIN_S * 1000, spec.HORIZON_MAX_S * 1000
    n_stumbles = n_warn = caught = useful = 0
    leads: list[float] = []
    minutes = 0.0
    for s in sessions:
        x, _, times = windows(s)
        onsets = warnings_from_risk(times, risk_fn(x), on, off)
        minutes += (times[-1] - times[0]) / 60000 if len(times) > 1 else 0
        n_stumbles += len(s.stumbles)
        n_warn += len(onsets)
        for st in s.stumbles:
            ok = onsets[(onsets <= st - lo) & (onsets >= st - hi)]
            if len(ok):
                caught += 1
                leads.append((st - ok.max()) / 1000)
        for w in onsets:
            if np.any((s.stumbles - w >= lo) & (s.stumbles - w <= hi)):
                useful += 1
    return EventMetrics(
        stumbles=n_stumbles,
        warnings=n_warn,
        caught=caught,
        recall=caught / n_stumbles if n_stumbles else float("nan"),
        precision=useful / n_warn if n_warn else float("nan"),
        mean_lead_s=float(np.mean(leads)) if leads else float("nan"),
        false_alarms_per_min=(n_warn - useful) / minutes if minutes else float("nan"),
    )


def best_threshold(sessions: list[Session], risk_fn, target_recall: float = 0.6) -> float:
    """Highest warning threshold that still meets the recall target (fewest false alarms)."""
    best = 0.3
    for on in np.arange(0.3, 0.91, 0.05):
        m = event_metrics(sessions, risk_fn, on=float(on), off=float(on) - 0.2)
        if not np.isnan(m.recall) and m.recall >= target_recall:
            best = float(on)
    return round(best, 2)
