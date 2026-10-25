"""Small sequence models for stumble prediction. They must stay tiny: the
browser runs one inference every 100 ms on the CPU (ONNX Runtime wasm)."""

from __future__ import annotations

import numpy as np
import torch
from torch import nn

from . import spec


class StumbleGRU(nn.Module):
    def __init__(self, hidden: int = 32, layers: int = 1, dropout: float = 0.1):
        super().__init__()
        self.norm = nn.LayerNorm(spec.FEATURE_COUNT)
        self.gru = nn.GRU(spec.FEATURE_COUNT, hidden, num_layers=layers, batch_first=True, dropout=dropout if layers > 1 else 0.0)
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(hidden, 1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: [B, WINDOW, F] -> logits [B]"""
        out, _ = self.gru(self.norm(x))
        return self.head(out[:, -1]).squeeze(-1)


class StumbleCNN(nn.Module):
    """1D-CNN alternative from the concept doc; comparable accuracy, even cheaper."""

    def __init__(self, channels: int = 32, dropout: float = 0.1):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(spec.FEATURE_COUNT, channels, 3, padding=1),
            nn.GELU(),
            nn.Conv1d(channels, channels, 3, padding=2, dilation=2),
            nn.GELU(),
            nn.AdaptiveAvgPool1d(1),
        )
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(channels, 1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.net(x.transpose(1, 2)).squeeze(-1)).squeeze(-1)


class WithSigmoid(nn.Module):
    """Export wrapper: the browser expects a probability named "risk"."""

    def __init__(self, inner: nn.Module):
        super().__init__()
        self.inner = inner

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.inner(features))


def build(kind: str, **kw) -> nn.Module:
    if kind == "gru":
        return StumbleGRU(**kw)
    if kind == "cnn":
        return StumbleCNN(**kw)
    raise ValueError(f"unknown model kind {kind!r}")


def heuristic_risk(windows: np.ndarray) -> np.ndarray:
    """NumPy port of HeuristicStumblePredictor (packages/core/src/stumble/predictor.ts), the baseline to beat."""
    f = windows[:, -1, :]
    I = spec.IDX
    valid = f[:, I["gaze_valid"]] > 0
    diff_max = f[:, I["next_difficulty_max"]]
    since = np.minimum(1.5, f[:, I["since_advance_s"]])
    brk = f[:, I["break_ahead"]]
    z_invalid = -3.4 + 2.6 * diff_max + 0.9 * since - 0.8 * brk
    evs = f[:, I["evs_words"]] * 10
    shrink = np.maximum(0, 1.5 - evs)
    collapsing = np.maximum(0, -f[:, I["evs_delta"]] * 10)
    z_valid = (
        -3.2
        + 0.9 * shrink
        + 0.4 * collapsing
        + 1.0 * np.minimum(1.5, f[:, I["fixation_s"]])
        + 1.2 * f[:, I["regression"]]
        + 2.4 * diff_max
        + 0.6 * since * f[:, I["speaking"]]
        - 0.8 * brk
    )
    z = np.where(valid, z_valid, z_invalid)
    return 1 / (1 + np.exp(-z))
