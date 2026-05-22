"""Iteration 1: End-to-end STE-based training for TORQ rotations.

Innovation: Instead of separate proxy losses (variance equalization + soft histogram),
directly minimize the quantization reconstruction error using Straight-Through Estimator.
This jointly optimizes both R_inter and R_intra for the actual objective:
    min ||x - Q_mxfp4(x @ O) @ O^T||^2
where O is the composite structured rotation.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

from mxfp4 import quantize_mxfp4, compute_block_scales, soft_codebook_occupancy_loss
from rotations import TORQRotationModule, CayleyRotation


def ste_quantize_mxfp4(x: torch.Tensor, block_size: int = 32) -> torch.Tensor:
    """MXFP4 quantization with Straight-Through Estimator for gradients."""
    quantized, _ = quantize_mxfp4(x, block_size)
    # STE: forward uses quantized, backward passes through as identity
    return x + (quantized - x).detach()


class TORQTrainerSTE:
    """Train per-layer rotation matrices using end-to-end STE-based MSE loss."""

    def __init__(
        self,
        in_features: int,
        block_size: int = 32,
        lr: float = 1e-2,
        num_steps: int = 500,
        device: str = "cuda",
        weight_quant: bool = True,
        codebook_reg_weight: float = 0.0,
    ):
        self.in_features = in_features
        self.block_size = block_size
        self.lr = lr
        self.num_steps = num_steps
        self.device = device
        self.weight_quant = weight_quant
        self.codebook_reg_weight = codebook_reg_weight

    def apply_rotation(self, x: torch.Tensor, rot_module: TORQRotationModule) -> torch.Tensor:
        """Apply two-level structured rotation."""
        R_inter = rot_module.get_inter_matrix()
        R_intra = rot_module.get_intra_matrix()
        num_blocks = self.in_features // self.block_size

        blocks = x.reshape(-1, num_blocks, self.block_size)
        blocks = torch.einsum('nbk,cb->nck', blocks, R_inter)
        blocks = blocks @ R_intra
        return blocks.reshape(-1, self.in_features)

    def apply_inverse_rotation(self, x: torch.Tensor, rot_module: TORQRotationModule) -> torch.Tensor:
        """Apply inverse rotation (O^T)."""
        R_inter = rot_module.get_inter_matrix()
        R_intra = rot_module.get_intra_matrix()
        num_blocks = self.in_features // self.block_size

        blocks = x.reshape(-1, num_blocks, self.block_size)
        # Inverse: first R_intra^T, then R_inter^T
        blocks = blocks @ R_intra.T
        blocks = torch.einsum('nbk,cb->nck', blocks, R_inter.T)
        return blocks.reshape(-1, self.in_features)

    def train_layer(
        self,
        activation_samples: torch.Tensor,
        weight: torch.Tensor,
    ) -> tuple[TORQRotationModule, dict]:
        """Train both rotations jointly using end-to-end STE MSE loss.

        Loss = ||W @ x^T - W_fuse @ Q(x @ O)^T||^2_F (per-sample average)
        which is equivalent to minimizing output reconstruction error.
        """
        rot_module = TORQRotationModule(
            self.in_features, self.block_size
        ).to(self.device)

        samples = activation_samples.to(self.device).float()
        w = weight.to(self.device).float()

        # Reference output (no quantization)
        ref_output = F.linear(samples, w)

        optimizer = torch.optim.Adam(rot_module.parameters(), lr=self.lr)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=self.num_steps)

        metrics = {"losses": [], "mse_losses": [], "reg_losses": []}

        for step in range(self.num_steps):
            optimizer.zero_grad()

            # Forward rotation on activations
            rotated_act = self.apply_rotation(samples, rot_module)

            # STE quantize activations
            quantized_act = ste_quantize_mxfp4(rotated_act, self.block_size)

            # Fuse rotation into weight: W_fuse = W @ O
            R_inter = rot_module.get_inter_matrix()
            R_intra = rot_module.get_intra_matrix()
            num_blocks = self.in_features // self.block_size

            w_blocks = w.reshape(w.shape[0], num_blocks, self.block_size)
            w_blocks = torch.einsum('nbk,cb->nck', w_blocks, R_inter)
            w_blocks = w_blocks @ R_intra
            fused_weight = w_blocks.reshape_as(w)

            # Optionally quantize fused weight
            if self.weight_quant:
                fused_weight = ste_quantize_mxfp4(fused_weight, self.block_size)

            # Compute output with quantized activations and fused weight
            quant_output = F.linear(quantized_act, fused_weight)

            # MSE loss on output
            mse_loss = F.mse_loss(quant_output, ref_output)

            # Optional codebook regularization
            reg_loss = torch.tensor(0.0, device=self.device)
            if self.codebook_reg_weight > 0:
                scales = compute_block_scales(rotated_act.reshape(-1, self.block_size))
                normalized = rotated_act.reshape(-1, self.block_size) / scales
                reg_loss = soft_codebook_occupancy_loss(normalized)

            loss = mse_loss + self.codebook_reg_weight * reg_loss

            loss.backward()
            optimizer.step()
            scheduler.step()

            metrics["losses"].append(loss.item())
            metrics["mse_losses"].append(mse_loss.item())
            metrics["reg_losses"].append(reg_loss.item())

        metrics["initial_loss"] = metrics["losses"][0] if metrics["losses"] else 0.0
        metrics["final_loss"] = metrics["losses"][-1] if metrics["losses"] else 0.0
        metrics["initial_mse"] = metrics["mse_losses"][0] if metrics["mse_losses"] else 0.0
        metrics["final_mse"] = metrics["mse_losses"][-1] if metrics["mse_losses"] else 0.0

        return rot_module, metrics
