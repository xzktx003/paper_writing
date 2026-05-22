"""MXFP4 quantization primitives for TORQ experiments."""

import torch
import torch.nn.functional as F

C_MAX = 6.0
POSITIVE_CODEBOOK = torch.tensor(
    [0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0], dtype=torch.float32
)
DECISION_BOUNDARIES = torch.tensor(
    [0.25, 0.75, 1.25, 1.75, 2.5, 3.5, 5.0], dtype=torch.float32
)


def clip_to_pow2(values: torch.Tensor) -> torch.Tensor:
    clamped = torch.clamp(values, min=2.0**-14)
    exponents = torch.ceil(torch.log2(clamped))
    return torch.pow(2.0, exponents).clamp(min=2.0**-14, max=2.0**15)


def compute_block_scales(x: torch.Tensor) -> torch.Tensor:
    """Compute per-block power-of-2 scales. x: [..., K]"""
    amax = x.abs().amax(dim=-1, keepdim=True)
    return clip_to_pow2(amax / C_MAX)


def quantize_mxfp4(x: torch.Tensor, block_size: int = 32) -> tuple[torch.Tensor, torch.Tensor]:
    """Fake-quantize tensor along last dim with MXFP4 block scaling.
    Returns (quantized, scales).
    """
    orig_shape = x.shape
    assert x.shape[-1] % block_size == 0
    x_blocks = x.reshape(*orig_shape[:-1], -1, block_size).float()
    scales = compute_block_scales(x_blocks)
    normalized = x_blocks / scales
    boundaries = DECISION_BOUNDARIES.to(x.device)
    codebook = POSITIVE_CODEBOOK.to(x.device)
    abs_norm = normalized.abs()
    indices = torch.bucketize(abs_norm, boundaries)
    quantized_norm = codebook[indices] * normalized.sign()
    dequantized = (quantized_norm * scales).reshape(orig_shape)
    return dequantized.to(x.dtype), scales.squeeze(-1)


def soft_quantize_mxfp4(x: torch.Tensor, block_size: int = 32, tau: float = 0.1) -> torch.Tensor:
    """Differentiable approximation of MXFP4 quantization using STE."""
    quantized, _ = quantize_mxfp4(x, block_size)
    return x + (quantized - x).detach()


def codebook_occupancy_loss(normalized: torch.Tensor) -> torch.Tensor:
    """Non-differentiable codebook occupancy loss for monitoring."""
    boundaries = DECISION_BOUNDARIES.to(normalized.device)
    codebook = POSITIVE_CODEBOOK.to(normalized.device)
    indices = torch.bucketize(normalized.abs(), boundaries)
    counts = torch.bincount(indices.reshape(-1), minlength=len(codebook)).float()
    hist = counts / counts.sum().clamp(min=1)
    target = 1.0 / len(codebook)
    return ((hist - target) ** 2).sum()


def soft_codebook_occupancy_loss(normalized: torch.Tensor, tau: float = 0.05) -> torch.Tensor:
    """Differentiable surrogate for codebook occupancy using soft histograms."""
    boundaries = DECISION_BOUNDARIES.to(normalized.device, dtype=normalized.dtype)
    abs_vals = normalized.abs().reshape(-1)
    n = abs_vals.shape[0]
    num_bins = len(POSITIVE_CODEBOOK)
    soft_counts = torch.zeros(num_bins, device=normalized.device, dtype=normalized.dtype)
    for i in range(len(boundaries)):
        prob_above = torch.sigmoid((abs_vals - boundaries[i]) / tau)
        if i == 0:
            soft_counts[0] = (1.0 - prob_above).sum()
        soft_counts[i + 1] = prob_above.sum() if i == len(boundaries) - 1 else torch.zeros(1, device=normalized.device)

    cumulative = torch.zeros(num_bins + 1, device=normalized.device, dtype=normalized.dtype)
    cumulative[0] = n
    for i in range(len(boundaries)):
        prob_above = torch.sigmoid((abs_vals - boundaries[i]) / tau)
        cumulative[i + 1] = prob_above.sum()
    for i in range(num_bins):
        soft_counts[i] = cumulative[i] - cumulative[i + 1] if i < num_bins - 1 else cumulative[i]

    soft_counts = torch.zeros(num_bins, device=normalized.device, dtype=normalized.dtype)
    cumulative_probs = []
    for i in range(len(boundaries)):
        prob_above = torch.sigmoid((abs_vals - boundaries[i]) / tau)
        cumulative_probs.append(prob_above.sum())

    soft_counts[0] = n - cumulative_probs[0]
    for i in range(1, num_bins - 1):
        soft_counts[i] = cumulative_probs[i - 1] - cumulative_probs[i]
    soft_counts[num_bins - 1] = cumulative_probs[-1]

    hist = soft_counts / n
    target = 1.0 / num_bins
    return ((hist - target) ** 2).sum()
