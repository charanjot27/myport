# PromptSense ML: stumble predictor

Trains the model behind *eye-voice span stumble prediction* (module 1). It
predicts, every 100 ms, whether the speaker will stumble in the next 0.3–2 s.
The browser runs the exported ONNX model with ONNX Runtime Web, and falls back
to a hand-built heuristic when no model is deployed.

## Setup

```bash
cd ml
python3 -m venv .venv
.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu   # or a CUDA build
.venv/bin/pip install -e ".[dev]"
.venv/bin/pytest
```

## Data

1. In the web app, enable research in **Settings**. Before each take, tick
   **Save as a research session**. These sessions record per-frame features
   (`features: [{t, f}]`) and automatically detected stumbles.
2. Confirm or fix labels in **Research → Label**, then **Export dataset (.jsonl)**.
   Or, with the API, export every consented upload:
   `curl -H "Authorization: Bearer $ADMIN_TOKEN" $API/research/export > data/study.jsonl`
3. Put the files in `ml/data/` (git-ignored: participant data never goes into git).

Labels are used in this order of trust: human labels → the app's auto-detected
stumbles → a fallback detector (restarts and long gaps).

No volunteers yet? `python -m promptsense_ml.synth --out data/synthetic.jsonl`
generates synthetic sessions so the full pipeline runs. Models trained only on
synthetic data are marked `syntheticOnly` and are for demos, not production.

## Train, evaluate, ship

```bash
python -m promptsense_ml.train --data data/ --out runs/v1
python -m promptsense_ml.evaluate --model runs/v1/stumble.onnx --data data/holdout.jsonl
python -m promptsense_ml.train --data data/ --out runs/v1 --deploy ../apps/web/public/models
```

- The validation split holds out **whole participants**, so the scores measure how
  well the model generalises to new speakers.
- Headline metric (from the concept doc): **event recall at lead**. It is the share
  of stumbles that got a warning 0.3–2 s before they happened, computed with the
  same smoothing and hysteresis as the browser. Precision and false alarms per
  minute are reported alongside, next to the heuristic baseline.
- The warning threshold is picked for `--target-recall` (default 0.6) and shipped
  in `stumble.json`; the browser uses it.
- Export is verified: ONNX Runtime output must match PyTorch to within 1e-4.

## Feature spec

`promptsense_ml/spec.py` mirrors `packages/core/src/stumble/features.ts`. A test
fails if they drift apart. If you change features, bump the spec version and
retrain; the browser refuses models whose spec does not match.
