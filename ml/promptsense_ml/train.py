"""Train, evaluate and export the stumble predictor.

    python -m promptsense_ml.train --data data/ --out runs/latest
    python -m promptsense_ml.train --synthetic 24 --out runs/synthetic   # no data yet
    python -m promptsense_ml.train --data data/ --deploy ../apps/web/public/models

Outputs in --out: stumble.onnx, stumble.json (spec, threshold, metrics),
metrics.json. --deploy copies the model where the web app loads it from.
"""

from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

from . import spec
from .data import load_sessions, split_by_participant, stack, to_session
from .metrics import average_precision, best_threshold, event_metrics
from .model import WithSigmoid, build, heuristic_risk
from .synth import generate


def set_seed(seed: int) -> None:
    np.random.seed(seed)
    torch.manual_seed(seed)


def predict(model: nn.Module, x: np.ndarray, batch: int = 4096) -> np.ndarray:
    model.eval()
    out = []
    with torch.no_grad():
        for i in range(0, len(x), batch):
            out.append(torch.sigmoid(model(torch.from_numpy(x[i : i + batch]))).numpy())
    return np.concatenate(out) if out else np.zeros(0, np.float32)


def train_model(train_x, train_y, val_x, val_y, args) -> tuple[nn.Module, dict]:
    model = build(args.model, hidden=args.hidden) if args.model == "gru" else build(args.model)
    pos = float(train_y.sum())
    pos_weight = torch.tensor((len(train_y) - pos) / max(pos, 1.0))
    loss_fn = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    xt, yt = torch.from_numpy(train_x), torch.from_numpy(train_y)
    best_ap, best_state, bad_epochs = -1.0, None, 0
    history = []
    for epoch in range(args.epochs):
        model.train()
        perm = torch.randperm(len(xt))
        total = 0.0
        for i in range(0, len(xt), args.batch):
            idx = perm[i : i + args.batch]
            opt.zero_grad()
            loss = loss_fn(model(xt[idx]), yt[idx])
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            total += float(loss) * len(idx)
        ap = average_precision(val_y, predict(model, val_x)) if len(val_y) else float("nan")
        history.append({"epoch": epoch + 1, "loss": total / max(1, len(xt)), "val_ap": ap})
        print(f"epoch {epoch + 1:3d}  loss {total / max(1, len(xt)):.4f}  val AP {ap:.3f}", flush=True)
        if np.isnan(ap) or ap > best_ap + 1e-4:
            best_ap, bad_epochs = ap, 0
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            bad_epochs += 1
            if bad_epochs >= args.patience:
                print("early stopping")
                break
    if best_state:
        model.load_state_dict(best_state)
    return model, {"history": history, "best_val_ap": best_ap}


def export_onnx(model: nn.Module, path: Path) -> None:
    wrapped = WithSigmoid(model).eval()
    dummy = torch.zeros(1, spec.WINDOW, spec.FEATURE_COUNT)
    torch.onnx.export(
        wrapped,
        (dummy,),
        str(path),
        input_names=["features"],
        output_names=["risk"],
        dynamic_axes={"features": {0: "batch"}, "risk": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )


def check_onnx(path: Path, model: nn.Module, x: np.ndarray) -> float:
    """Max absolute difference between PyTorch and ONNX Runtime on real windows."""
    import onnxruntime as ort

    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    sample = x[: min(256, len(x))]
    onnx_out = sess.run(["risk"], {"features": sample})[0]
    torch_out = predict(model, sample)
    return float(np.max(np.abs(onnx_out - torch_out))) if len(sample) else 0.0


def main(argv: list[str] | None = None) -> dict:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", nargs="*", default=[], help=".json/.jsonl files or directories of exported sessions")
    ap.add_argument("--synthetic", type=int, default=0, help="add N synthetic participants (3 sessions each)")
    ap.add_argument("--model", choices=["gru", "cnn"], default="gru")
    ap.add_argument("--hidden", type=int, default=32)
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--patience", type=int, default=5)
    ap.add_argument("--val-fraction", type=float, default=0.25)
    ap.add_argument("--target-recall", type=float, default=0.6)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", type=Path, default=Path("runs/latest"))
    ap.add_argument("--deploy", type=Path, help="copy stumble.onnx/json here (e.g. ../apps/web/public/models)")
    args = ap.parse_args(argv)

    set_seed(args.seed)
    sessions = load_sessions(args.data) if args.data else []
    if args.synthetic:
        sessions += [s for r in generate(args.synthetic, 3, seed=args.seed) if (s := to_session(r))]
    if not sessions:
        ap.error("no sessions: pass --data and/or --synthetic")
    sources = {s.label_source for s in sessions}
    print(f"{len(sessions)} sessions from {len({s.participant for s in sessions})} participants; labels: {sorted(sources)}")

    train_s, val_s = split_by_participant(sessions, args.val_fraction, args.seed)
    train_x, train_y = stack(train_s)
    val_x, val_y = stack(val_s)
    print(f"train windows {len(train_x)} (pos {train_y.mean():.3f}), val windows {len(val_x)} (pos {val_y.mean() if len(val_y) else 0:.3f})")

    model, info = train_model(train_x, train_y, val_x, val_y, args)

    def model_risk(x: np.ndarray) -> np.ndarray:
        return predict(model, x)

    eval_set = val_s or train_s
    threshold = best_threshold(eval_set, model_risk, args.target_recall)
    ev_model = event_metrics(eval_set, model_risk, on=threshold, off=threshold - 0.2)
    ev_base = event_metrics(eval_set, heuristic_risk)
    vx, vy = stack(eval_set)
    metrics = {
        "val_ap": average_precision(vy, model_risk(vx)),
        "baseline_val_ap": average_precision(vy, heuristic_risk(vx)),
        "threshold": threshold,
        **{f"event_{k}": v for k, v in ev_model.to_dict().items()},
        **{f"baseline_event_{k}": v for k, v in ev_base.to_dict().items()},
    }
    print(json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in metrics.items()}, indent=2))

    args.out.mkdir(parents=True, exist_ok=True)
    onnx_path = args.out / "stumble.onnx"
    export_onnx(model, onnx_path)
    diff = check_onnx(onnx_path, model, vx)
    if diff > 1e-4:
        raise SystemExit(f"ONNX output differs from PyTorch by {diff:.2e}")
    version = time.strftime("%Y%m%d-%H%M%S")
    synthetic_only = all(s.meta.get("synthetic") for s in sessions)
    meta = {
        "version": version,
        "model": args.model,
        "spec": spec.as_dict(),
        "threshold": {"on": threshold, "off": round(threshold - 0.2, 2)},
        "metrics": metrics,
        "trainedOn": {"sessions": len(sessions), "participants": len({s.participant for s in sessions}), "labels": sorted(sources), "syntheticOnly": synthetic_only},
    }
    (args.out / "stumble.json").write_text(json.dumps(meta, indent=2, default=float))
    (args.out / "metrics.json").write_text(json.dumps({**metrics, **info}, indent=2, default=float))
    print(f"exported {onnx_path} ({onnx_path.stat().st_size / 1024:.1f} KiB), onnx/torch max diff {diff:.1e}")

    if args.deploy:
        if synthetic_only:
            print("warning: deploying a model trained only on synthetic data; use for demos, not production")
        args.deploy.mkdir(parents=True, exist_ok=True)
        shutil.copy(onnx_path, args.deploy / "stumble.onnx")
        shutil.copy(args.out / "stumble.json", args.deploy / "stumble.json")
        print(f"deployed to {args.deploy}")
    return metrics


if __name__ == "__main__":
    main()
