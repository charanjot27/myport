"""Evaluate an exported ONNX model (exactly what the browser runs) against
labelled sessions, next to the heuristic baseline.

    python -m promptsense_ml.evaluate --model runs/latest/stumble.onnx --data data/
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from .data import load_sessions, stack
from .metrics import average_precision, event_metrics
from .model import heuristic_risk


def main(argv: list[str] | None = None) -> dict:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--data", nargs="+", required=True)
    args = ap.parse_args(argv)

    import onnxruntime as ort

    meta_path = args.model.with_suffix(".json")
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    on = meta.get("threshold", {}).get("on", 0.6)
    off = meta.get("threshold", {}).get("off", on - 0.2)
    sess = ort.InferenceSession(str(args.model), providers=["CPUExecutionProvider"])

    def onnx_risk(x: np.ndarray) -> np.ndarray:
        return np.concatenate([sess.run(["risk"], {"features": x[i : i + 4096]})[0] for i in range(0, len(x), 4096)]) if len(x) else np.zeros(0)

    sessions = load_sessions(args.data)
    x, y = stack(sessions)
    report = {
        "sessions": len(sessions),
        "model": {"ap": average_precision(y, onnx_risk(x)), **event_metrics(sessions, onnx_risk, on, off).to_dict()},
        "baseline": {"ap": average_precision(y, heuristic_risk(x)), **event_metrics(sessions, heuristic_risk).to_dict()},
    }
    print(json.dumps(report, indent=2, default=float))
    return report


if __name__ == "__main__":
    main()
