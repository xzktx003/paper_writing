"""Cayley-parameterized trainable orthogonal rotations for TORQ."""

import torch
import torch.nn as nn


def cayley_transform(A: torch.Tensor) -> torch.Tensor:
    """Convert skew-symmetric matrix A to orthogonal matrix via Cayley transform.
    R = (I - A)(I + A)^{-1}, where A is skew-symmetric (A^T = -A).
    """
    n = A.shape[-1]
    I = torch.eye(n, device=A.device, dtype=A.dtype)
    return torch.linalg.solve(I + A, I - A)


class CayleyRotation(nn.Module):
    """Learnable orthogonal matrix parameterized via Cayley transform."""

    def __init__(self, size: int):
        super().__init__()
        self.size = size
        # Upper triangular parameters for skew-symmetric matrix
        num_params = size * (size - 1) // 2
        self.params = nn.Parameter(torch.zeros(num_params))

    def get_skew_symmetric(self) -> torch.Tensor:
        A = torch.zeros(self.size, self.size, device=self.params.device, dtype=self.params.dtype)
        idx = torch.triu_indices(self.size, self.size, offset=1)
        A[idx[0], idx[1]] = self.params
        A = A - A.T
        return A

    def forward(self) -> torch.Tensor:
        A = self.get_skew_symmetric()
        return cayley_transform(A)


class TORQRotationModule(nn.Module):
    """Trainable two-level rotation for a single linear layer."""

    def __init__(self, in_features: int, block_size: int = 32):
        super().__init__()
        assert in_features % block_size == 0
        self.in_features = in_features
        self.block_size = block_size
        self.num_blocks = in_features // block_size

        self.inter_rotation = CayleyRotation(self.num_blocks)
        self.intra_rotation = CayleyRotation(block_size)

    def get_inter_matrix(self) -> torch.Tensor:
        return self.inter_rotation()

    def get_intra_matrix(self) -> torch.Tensor:
        return self.intra_rotation()

    def apply_rotation(self, x: torch.Tensor) -> torch.Tensor:
        """Apply two-level structured rotation to input.
        x: [batch, in_features] or [batch, seq, in_features]
        """
        orig_shape = x.shape
        flat = x.reshape(-1, self.in_features).float()

        R_inter = self.get_inter_matrix()
        R_intra = self.get_intra_matrix()

        # Reshape to [N, B, K]
        blocks = flat.reshape(-1, self.num_blocks, self.block_size)
        # Inter-block: rotate across blocks for each position
        # blocks: [N, B, K], R_inter: [B, B] -> einsum nbk,cb->nck
        blocks = torch.einsum('nbk,cb->nck', blocks, R_inter)
        # Intra-block: rotate within each block
        # blocks: [N, B, K], R_intra: [K, K] -> blocks @ R_intra
        blocks = blocks @ R_intra

        return blocks.reshape(orig_shape).to(x.dtype)

    def get_fused_weight(self, weight: torch.Tensor) -> torch.Tensor:
        """Compute W_fuse = W @ O where O is the composite rotation.
        weight: [out_features, in_features]
        """
        R_inter = self.get_inter_matrix()
        R_intra = self.get_intra_matrix()

        w = weight.float()
        blocks = w.reshape(w.shape[0], self.num_blocks, self.block_size)
        blocks = torch.einsum('nbk,cb->nck', blocks, R_inter)
        blocks = blocks @ R_intra
        return blocks.reshape_as(weight).to(weight.dtype)
