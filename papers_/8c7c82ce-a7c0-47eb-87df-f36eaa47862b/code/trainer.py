"""Training loop for TORQ rotations using Cayley parameterization."""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional

from mxfp4 import quantize_mxfp4, compute_block_scales, soft_codebook_occupancy_loss
from rotations import TORQRotationModule


class TORQTrainer:
    """Train per-layer rotation matrices to minimize quantization error."""

    def __init__(
        self,
        in_features: int,
        block_size: int = 32,
        lr_inter: float = 1e-3,
        lr_intra: float = 1e-3,
        num_steps_inter: int = 200,
        num_steps_intra: int = 200,
        device: str = "cuda",
    ):
        self.in_features = in_features
        self.block_size = block_size
        self.lr_inter = lr_inter
        self.lr_intra = lr_intra
        self.num_steps_inter = num_steps_inter
        self.num_steps_intra = num_steps_intra
        self.device = device

    def train_inter_rotation(
        self,
        activation_samples: torch.Tensor,
        rotation_module: TORQRotationModule,
    ) -> dict:
        """Train inter-block rotation to equalize block variances.
        Loss: variance of per-block variances (want all blocks to have equal variance).
        """
        samples = activation_samples.to(self.device).float()
        num_blocks = self.in_features // self.block_size

        optimizer = torch.optim.Adam(
            rotation_module.inter_rotation.parameters(), lr=self.lr_inter
        )

        metrics = {"losses": []}
        for step in range(self.num_steps_inter):
            optimizer.zero_grad()
            R_inter = rotation_module.get_inter_matrix()

            blocks = samples.reshape(-1, num_blocks, self.block_size)
            rotated_blocks = torch.einsum('nbk,cb->nck', blocks, R_inter)

            # Per-block variance: [B]
            block_vars = rotated_blocks.var(dim=(0, 2))
            # Loss: variance of block variances (want uniform)
            target_var = block_vars.mean()
            loss = ((block_vars - target_var) ** 2).mean()

            loss.backward()
            optimizer.step()
            metrics["losses"].append(loss.item())

        metrics["initial_loss"] = metrics["losses"][0] if metrics["losses"] else 0.0
        metrics["final_loss"] = metrics["losses"][-1] if metrics["losses"] else 0.0
        return metrics

    def train_intra_rotation(
        self,
        activation_samples: torch.Tensor,
        rotation_module: TORQRotationModule,
    ) -> dict:
        """Train intra-block rotation to improve codebook utilization.
        Uses differentiable soft histogram loss.
        """
        samples = activation_samples.to(self.device).float()
        num_blocks = self.in_features // self.block_size

        optimizer = torch.optim.Adam(
            rotation_module.intra_rotation.parameters(), lr=self.lr_intra
        )

        metrics = {"losses": []}
        for step in range(self.num_steps_intra):
            optimizer.zero_grad()
            R_inter = rotation_module.get_inter_matrix().detach()
            R_intra = rotation_module.get_intra_matrix()

            blocks = samples.reshape(-1, num_blocks, self.block_size)
            # Apply inter (frozen)
            blocks = torch.einsum('nbk,cb->nck', blocks, R_inter)
            # Apply intra (trainable)
            rotated = blocks @ R_intra

            # Compute scales and normalize
            scales = compute_block_scales(rotated)
            normalized = rotated / scales

            # Soft codebook occupancy loss
            loss = soft_codebook_occupancy_loss(normalized)

            loss.backward()
            optimizer.step()
            metrics["losses"].append(loss.item())

        metrics["initial_loss"] = metrics["losses"][0] if metrics["losses"] else 0.0
        metrics["final_loss"] = metrics["losses"][-1] if metrics["losses"] else 0.0
        return metrics

    def train_layer(
        self,
        activation_samples: torch.Tensor,
        weight: Optional[torch.Tensor] = None,
    ) -> tuple[TORQRotationModule, dict]:
        """Full training pipeline for one layer's rotations."""
        rotation_module = TORQRotationModule(
            self.in_features, self.block_size
        ).to(self.device)

        # Phase 1: Train inter-block rotation
        inter_metrics = self.train_inter_rotation(activation_samples, rotation_module)

        # Phase 2: Train intra-block rotation (with inter frozen)
        intra_metrics = self.train_intra_rotation(activation_samples, rotation_module)

        metrics = {
            "inter": inter_metrics,
            "intra": intra_metrics,
        }
        return rotation_module, metrics
