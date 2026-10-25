import json
import re
from pathlib import Path

import numpy as np
import pytest

from promptsense_ml import spec
from promptsense_ml.data import fallback_stumbles, frame_labels, load_sessions, split_by_participant, to_session, windows
from promptsense_ml.metrics import average_precision, warnings_from_risk
from promptsense_ml.model import heuristic_risk
from promptsense_ml.synth import generate

CORE = Path(__file__).resolve().parents[2] / "packages/core/src/stumble/features.ts"


def test_spec_matches_typescript():
    src = CORE.read_text()
    block = re.search(r"features:\s*\[(.*?)\]", src, re.S).group(1)
    ts_features = re.findall(r'"([a-z_]+)"', block)
    assert ts_features == spec.FEATURES
    assert f"window: {spec.WINDOW}," in src
    assert f"frameHz: {spec.FRAME_HZ}," in src
    assert f"min: {spec.HORIZON_MIN_S}, max: {spec.HORIZON_MAX_S}" in src


def test_synthetic_sessions_roundtrip(tmp_path):
    records = generate(2, 1, seed=1)
    path = tmp_path / "s.jsonl"
    path.write_text("\n".join(json.dumps(r) for r in records))
    sessions = load_sessions([path])
    assert len(sessions) == 2
    s = sessions[0]
    assert s.frames.shape[1] == spec.FEATURE_COUNT
    assert s.label_source == "auto"
    assert len(s.stumbles) > 0


def test_windows_and_labels():
    s = to_session(generate(1, 1, seed=2)[0])
    x, y, t = windows(s)
    assert x.shape == (len(s.frames), spec.WINDOW, spec.FEATURE_COUNT)
    # Left padding at the start, the last frame of each window is the current frame.
    assert np.all(x[0, :-1] == 0)
    np.testing.assert_array_equal(x[5, -1], s.frames[5])
    # Every positive frame has some stumble starting inside the prediction horizon.
    for tp in t[y == 1]:
        lead = (s.stumbles - tp) / 1000
        assert np.any((lead > spec.HORIZON_MIN_S - 1e-6) & (lead <= spec.HORIZON_MAX_S + 1e-6))
    assert frame_labels(s).sum() == y.sum()


def test_human_labels_take_priority():
    r = generate(1, 1, seed=3)[0]
    r["labels"] = [{"t": 5000, "kind": "restart"}, {"t": 9000, "kind": "none"}]
    s = to_session(r)
    assert s.label_source == "human"
    assert s.stumbles.tolist() == [5000]


def test_fallback_detector():
    r = {
        "alignment": [{"t": 0, "position": 10, "offScript": False}, {"t": 1000, "position": 4, "offScript": False}],
        "tokenTimings": [{"token": 1, "t": 3000}, {"token": 2, "t": 5000}],
    }
    assert fallback_stumbles(r) == [1000, 3000]


def test_participant_split_has_no_leakage():
    sessions = [to_session(r) for r in generate(5, 2, seed=4)]
    train, val = split_by_participant(sessions, 0.4)
    assert {s.participant for s in train}.isdisjoint({s.participant for s in val})
    assert len(train) + len(val) == len(sessions)


def test_warning_hysteresis_and_ap():
    times = np.arange(10) * 100.0
    risk = np.array([0, 1, 1, 1, 0, 0, 0, 1, 1, 1], dtype=float)
    assert warnings_from_risk(times, risk, 0.6, 0.4).tolist() == [200.0, 800.0]
    assert average_precision(np.array([1, 0, 1, 0.0]), np.array([0.9, 0.8, 0.7, 0.1])) == pytest.approx((1 + 2 / 3) / 2)


def test_heuristic_baseline_is_informative_on_synthetic_data():
    sessions = [to_session(r) for r in generate(4, 1, seed=5)]
    xs, ys = zip(*[(windows(s)[0], windows(s)[1]) for s in sessions])
    x, y = np.concatenate(xs), np.concatenate(ys)
    assert average_precision(y, heuristic_risk(x)) > y.mean() * 1.3


def test_train_export_and_onnx_parity(tmp_path):
    from promptsense_ml.train import main

    metrics = main(["--synthetic", "6", "--epochs", "3", "--out", str(tmp_path / "run"), "--deploy", str(tmp_path / "deploy")])
    assert (tmp_path / "deploy" / "stumble.onnx").exists()
    meta = json.loads((tmp_path / "deploy" / "stumble.json").read_text())
    assert meta["spec"]["features"] == spec.FEATURES
    assert meta["trainedOn"]["syntheticOnly"] is True
    assert metrics["val_ap"] > 0
