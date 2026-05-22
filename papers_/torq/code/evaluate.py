"""Evaluate perplexity with TORQ quantization applied."""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional

from mxfp4 import quantize_mxfp4
from rotations import TORQRotationModule


class TORQQuantizedLinear(nn.Module):
    """Linear layer with TORQ rotation + MXFP4 fake quantization (W4A4)."""

    def __init__(
        self,
        linear: nn.Linear,
        rotation_module: TORQRotationModule,
        block_size: int = 32,
        quantize_weights: bool = True,
    ):
        super().__init__()
        self.in_features = linear.in_features
        self.out_features = linear.out_features
        self.block_size = block_size
        self.num_blocks = self.in_features // block_size

        # Get rotation matrices (frozen after training)
        with torch.no_grad():
            R_inter = rotation_module.get_inter_matrix().detach()
            R_intra = rotation_module.get_intra_matrix().detach()

        self.register_buffer("R_inter", R_inter)
        self.register_buffer("R_intra", R_intra)

        # Fuse rotation into weight: W_fuse = W @ O
        with torch.no_grad():
            device = linear.weight.device
            w = linear.weight.float()
            r_inter = R_inter.to(device).float()
            r_intra = R_intra.to(device).float()
            blocks = w.reshape(w.shape[0], self.num_blocks, self.block_size)
            blocks = torch.einsum('nbk,cb->nck', blocks, r_inter)
            blocks = blocks @ r_intra
            fused_weight = blocks.reshape_as(w)

            if quantize_weights:
                fused_weight, _ = quantize_mxfp4(fused_weight, block_size)

        self.weight = nn.Parameter(fused_weight.to(linear.weight.dtype), requires_grad=False)
        self.bias = None
        if linear.bias is not None:
            self.bias = nn.Parameter(linear.bias.detach().clone(), requires_grad=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        orig_shape = x.shape
        flat = x.reshape(-1, self.in_features).float()

        # Apply forward rotation
        blocks = flat.reshape(-1, self.num_blocks, self.block_size)
        blocks = torch.einsum('nbk,cb->nck', blocks, self.R_inter.float())
        blocks = blocks @ self.R_intra.float()
        rotated = blocks.reshape(-1, self.in_features)

        # Quantize activations with MXFP4
        quantized_act, _ = quantize_mxfp4(rotated, self.block_size)

        # Linear with fused weight
        out = F.linear(quantized_act.to(self.weight.dtype), self.weight, self.bias)
        return out.reshape(*orig_shape[:-1], self.out_features)


def apply_torq_to_model(
    model: nn.Module,
    rotation_modules: dict[str, TORQRotationModule],
    block_size: int = 32,
    quantize_weights: bool = True,
) -> nn.Module:
    """Replace target linear layers with TORQ-quantized versions."""
    for name, rot_module in rotation_modules.items():
        parts = name.split(".")
        parent = model
        for part in parts[:-1]:
            parent = getattr(parent, part)
        linear = getattr(parent, parts[-1])
        assert isinstance(linear, nn.Linear)

        quantized_linear = TORQQuantizedLinear(
            linear, rot_module, block_size=block_size,
            quantize_weights=quantize_weights,
        )
        setattr(parent, parts[-1], quantized_linear)

    return model


@torch.no_grad()
def evaluate_perplexity(
    model: nn.Module,
    test_data: list[torch.Tensor],
    device: str = "cuda",
    batch_size: int = 1,
) -> float:
    """Evaluate perplexity on test data chunks."""
    model.eval()
    total_nll = 0.0
    total_tokens = 0

    for i in range(0, len(test_data), batch_size):
        batch = torch.stack(test_data[i:i + batch_size]).to(device)
        outputs = model(input_ids=batch)
        logits = outputs.logits

        # Shift for next-token prediction
        shift_logits = logits[:, :-1, :].contiguous()
        shift_labels = batch[:, 1:].contiguous()

        loss = F.cross_entropy(
            shift_logits.reshape(-1, shift_logits.shape[-1]),
            shift_labels.reshape(-1),
            reduction="sum",
        )
        total_nll += loss.item()
        total_tokens += shift_labels.numel()

    ppl = torch.exp(torch.tensor(total_nll / total_tokens)).item()
    return ppl
