"""Feature spec shared with the browser.

Mirrors STUMBLE_SPEC in packages/core/src/stumble/features.ts. A test parses
the TypeScript file and fails if the two drift apart, because a model trained
on a different feature order would silently produce garbage in the browser.
"""

VERSION = 1
FRAME_HZ = 10
WINDOW = 20
HORIZON_MIN_S = 0.3
HORIZON_MAX_S = 2.0

FEATURES = [
    "evs_words",
    "evs_delta",
    "gaze_valid",
    "fixation_s",
    "regression",
    "next_difficulty_max",
    "next_difficulty_mean",
    "speech_rate",
    "since_advance_s",
    "speaking",
    "align_confidence",
    "off_script",
    "break_ahead",
]
FEATURE_COUNT = len(FEATURES)
IDX = {name: i for i, name in enumerate(FEATURES)}


def as_dict() -> dict:
    return {
        "version": VERSION,
        "frameHz": FRAME_HZ,
        "window": WINDOW,
        "horizon": {"min": HORIZON_MIN_S, "max": HORIZON_MAX_S},
        "features": FEATURES,
    }
