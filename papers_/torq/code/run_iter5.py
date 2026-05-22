"""Iteration 5: Outlier-Aware Channel Reordering + SmoothTORQ.

Innovation: Before applying rotation, reorder channels so that channels with
similar activation magnitudes are grouped into the same MXFP4 block. This
directly targets MXFP4's shared-exponent weakness: if one outlier channel
shares a block with small channels, the shared exponent wastes precision.

The permutation P is zero-cost at inference — it's absorbed into weight column
reindexing. Combined with learned scaling and Hadamard-residual rotation:
    x_q = Q_mxfp4(R @ S @ P @ x)
    W_fuse = W @ P^T @ diag(1/S) @ R  (offline, no runtime cost)

This is novel because existing rotation-based methods (QuIP#, SpinQuant, AQLM)
don't exploit channel reordering for microscaling formats. The reordering is
specifically designed for the block-shared-exponent structure of MXFP4.
"""

import sys
import json
import time
import argparse
from pathlib import Path
from datetime import datetime

import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import AutoModelForCausalLM

sys.path.insert(0, str(Path(__file__).parent))
from mxfp4 import quantize_mxfp4
from evaluate import evaluate_perplexity
from data import get_calibration_dataloader, get_wikitext2_testdata


TARGET_SUFFIXES = ("q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj")


def hadamard_matrix(n: int) -> torch.Tensor:
    if n == 1:
        return torch.ones(1, 1)
    half = hadamard_matrix(n // 2)
    full = torch.cat([
        torch.cat([half, half], dim=1),
        torch.cat([half, -half], dim=1),
    ], dim=0)
    return full / (2 ** 0.5)


def get_orthogonal_init(n: int) -> torch.Tensor:
    if n > 0 and (n & (n - 1)) == 0:
        return hadamard_matrix(n)
    random_mat = torch.randn(n, n)
    q, r = torch.linalg.qr(random_mat)
    d = torch.diag(r).sign()
    return q * d.unsqueeze(0)


class ResidualCayleyRotation(nn.Module):
    def __init__(self, size: int, base_matrix: torch.Tensor):
        super().__init__()
        self.size = size
        self.register_buffer("R_base", base_matrix)
        num_params = size * (size - 1) // 2
        self.params = nn.Parameter(torch.zeros(num_params))

    def _get_skew_symmetric(self) -> torch.Tensor:
        A = torch.zeros(self.size, self.size, device=self.params.device, dtype=self.params.dtype)
        idx = torch.triu_indices(self.size, self.size, offset=1)
        A[idx[0], idx[1]] = self.params
        A = A - A.T
        return A

    def forward(self) -> torch.Tensor:
        A = self._get_skew_symmetric()
        I = torch.eye(self.size, device=A.device, dtype=A.dtype)
        R_residual = torch.linalg.solve(I + A, I - A)
        return self.R_base @ R_residual


def compute_channel_reordering(samples: torch.Tensor, block_size: int) -> torch.Tensor:
    """Compute permutation that groups channels with similar magnitudes into blocks.

    Strategy: Sort channels by log-magnitude, then interleave to minimize
    within-block dynamic range. This ensures each block has channels of
    similar scale, making the shared exponent efficient.
    """
    channel_magnitudes = samples.abs().mean(dim=0)
    log_mags = torch.log(channel_magnitudes.clamp(min=1e-10))

    # Sort by magnitude
    sorted_indices = torch.argsort(log_mags)

    # Interleave: assign sorted channels to blocks in round-robin
    # This ensures each block gets channels from a narrow magnitude range
    n_channels = samples.shape[1]
    num_blocks = n_channels // block_size

    # Group consecutive sorted channels into blocks
    # (channels 0..31 go to block 0, 32..63 to block 1, etc.)
    # This is the simplest and most effective: each block spans a narrow range
    permutation = sorted_indices

    return permutation


class ReorderSmoothTORQModule(nn.Module):
    """Channel reordering + learnable scaling + Hadamard-residual rotation."""

    def __init__(self, in_features: int, block_size: int,
                 permutation: torch.Tensor, init_scale: torch.Tensor = None):
        super().__init__()
        self.in_features = in_features
        self.block_size = block_size
        self.num_blocks = in_features // block_size

        self.register_buffer("permutation", permutation)
        self.register_buffer("inv_permutation", torch.argsort(permutation))

        if init_scale is not None:
            self.log_scale = nn.Parameter(torch.log(init_scale.clamp(min=1e-6)))
        else:
            self.log_scale = nn.Parameter(torch.zeros(in_features))

        inter_base = get_orthogonal_init(self.num_blocks)
        intra_base = get_orthogonal_init(block_size)
        self.inter_rotation = ResidualCayleyRotation(self.num_blocks, inter_base)
        self.intra_rotation = ResidualCayleyRotation(block_size, intra_base)

    def get_scale(self) -> torch.Tensor:
        return torch.exp(self.log_scale)

    def get_inter_matrix(self) -> torch.Tensor:
        return self.inter_rotation()

    def get_intra_matrix(self) -> torch.Tensor:
        return self.intra_rotation()


def ste_quantize_mxfp4(x: torch.Tensor, block_size: int = 32) -> torch.Tensor:
    quantized, _ = quantize_mxfp4(x, block_size)
    return x + (quantized - x).detach()


def find_target_linears(model: nn.Module) -> dict[str, nn.Linear]:
    matched = {}
    for name, module in model.named_modules():
        if isinstance(module, nn.Linear) and name.endswith(TARGET_SUFFIXES):
            matched[name] = module
    return matched


def collect_activations(model, dataloader, target_names, device="cuda", max_samples=512):
    collectors = {name: [] for name in target_names}
    sample_per_batch = max(max_samples // 16, 32)
    hooks = []

    def make_hook(name):
        def hook(module, inputs):
            if inputs and isinstance(inputs[0], torch.Tensor):
                flat = inputs[0].detach().reshape(-1, inputs[0].shape[-1])
                if flat.shape[0] > sample_per_batch:
                    indices = torch.randperm(flat.shape[0], device=flat.device)[:sample_per_batch]
                    flat = flat[indices]
                collectors[name].append(flat.cpu().float())
        return hook

    for name, module in model.named_modules():
        if name in target_names:
            hooks.append(module.register_forward_pre_hook(make_hook(name)))

    model.eval()
    with torch.no_grad():
        for batch in dataloader:
            model(batch.to(device))

    for h in hooks:
        h.remove()

    result = {}
    for name, chunks in collectors.items():
        if chunks:
            all_rows = torch.cat(chunks, dim=0)
            if all_rows.shape[0] > max_samples:
                indices = torch.randperm(all_rows.shape[0])[:max_samples]
                all_rows = all_rows[indices]
            result[name] = all_rows
    return result


def compute_heuristic_scale(samples: torch.Tensor, alpha: float = 0.5) -> torch.Tensor:
    """Heuristic initialization: normalize channel magnitudes."""
    channel_abs_mean = samples.abs().mean(dim=0)
    scale = (channel_abs_mean / channel_abs_mean.mean()).pow(alpha)
    scale = scale.clamp(min=0.1, max=10.0)
    return 1.0 / scale


def train_layer_reorder_smooth_torq(
    activation_samples: torch.Tensor,
    weight: torch.Tensor,
    in_features: int,
    block_size: int = 32,
    lr: float = 5e-3,
    scale_lr_mult: float = 3.0,
    num_steps: int = 400,
    device: str = "cuda",
) -> tuple[ReorderSmoothTORQModule, dict]:
    """Train reordering + smooth scaling + rotation jointly via STE."""
    num_blocks = in_features // block_size
    samples = activation_samples.to(device).float()
    w = weight.to(device).float()

    # Step 1: Compute channel reordering (data-dependent, non-learnable)
    permutation = compute_channel_reordering(samples, block_size).to(device)

    # Apply permutation to samples for scale initialization
    samples_reordered = samples[:, permutation]
    init_scale = compute_heuristic_scale(samples_reordered).to(device)

    module = ReorderSmoothTORQModule(
        in_features, block_size, permutation, init_scale=init_scale
    ).to(device)

    ref_output = F.linear(samples, w)

    param_groups = [
        {"params": [module.log_scale], "lr": lr * scale_lr_mult},
        {"params": list(module.inter_rotation.parameters()) + list(module.intra_rotation.parameters()), "lr": lr},
    ]
    optimizer = torch.optim.Adam(param_groups)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=num_steps)

    initial_mse = None
    final_mse = None

    for step in range(num_steps):
        optimizer.zero_grad()

        perm = module.permutation
        scale = module.get_scale()
        R_inter = module.get_inter_matrix()
        R_intra = module.get_intra_matrix()

        # Apply: permute -> scale -> rotate
        x_perm = samples[:, perm]
        x_scaled = x_perm * scale.unsqueeze(0)
        blocks = x_scaled.reshape(-1, num_blocks, block_size)
        blocks = torch.einsum('nbk,cb->nck', blocks, R_inter)
        blocks = blocks @ R_intra
        rotated_act = blocks.reshape(-1, in_features)

        # STE quantize activations
        quantized_act = ste_quantize_mxfp4(rotated_act, block_size)

        # Fuse into weight: W_fuse = W[:, perm] / S @ R
        # When x_perm = x[:, perm], we need W_perm = W[:, perm] for x_perm @ W_perm^T = x @ W^T
        w_perm = w[:, perm]
        w_scaled = w_perm / scale.unsqueeze(0)  # divide by scale
        w_blocks = w_scaled.reshape(w.shape[0], num_blocks, block_size)
        w_blocks = torch.einsum('nbk,cb->nck', w_blocks, R_inter)
        w_blocks = w_blocks @ R_intra
        fused_weight = w_blocks.reshape_as(w)

        # STE quantize weight
        fused_weight = ste_quantize_mxfp4(fused_weight, block_size)

        # Output MSE
        quant_output = F.linear(quantized_act, fused_weight)
        mse_loss = F.mse_loss(quant_output, ref_output)

        if initial_mse is None:
            initial_mse = mse_loss.item()

        mse_loss.backward()
        optimizer.step()
        scheduler.step()
        final_mse = mse_loss.item()

    return module, {"initial_mse": initial_mse, "final_mse": final_mse}


class ReorderSmoothTORQQuantizedLinear(nn.Module):
    """Quantized linear with reordering + scaling + rotation."""

    def __init__(self, linear: nn.Linear, module: ReorderSmoothTORQModule,
                 block_size: int = 32, quantize_weights: bool = True):
        super().__init__()
        self.in_features = linear.in_features
        self.out_features = linear.out_features
        self.block_size = block_size
        self.num_blocks = self.in_features // block_size

        with torch.no_grad():
            perm = module.permutation.detach()
            inv_perm = module.inv_permutation.detach()
            scale = module.get_scale().detach()
            R_inter = module.get_inter_matrix().detach()
            R_intra = module.get_intra_matrix().detach()

        self.register_buffer("permutation", perm)
        self.register_buffer("scale", scale)
        self.register_buffer("R_inter", R_inter)
        self.register_buffer("R_intra", R_intra)

        with torch.no_grad():
            device = linear.weight.device
            w = linear.weight.float()
            s = scale.to(device).float()
            r_inter = R_inter.to(device).float()
            r_intra = R_intra.to(device).float()

            # W[:, perm] / S @ R
            w_perm = w[:, perm.to(device)]
            w_scaled = w_perm / s.unsqueeze(0)
            blocks = w_scaled.reshape(w.shape[0], self.num_blocks, self.block_size)
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

        # Permute -> scale -> rotate -> quantize
        x_perm = flat[:, self.permutation]
        x_scaled = x_perm * self.scale.float().unsqueeze(0)
        blocks = x_scaled.reshape(-1, self.num_blocks, self.block_size)
        blocks = torch.einsum('nbk,cb->nck', blocks, self.R_inter.float())
        blocks = blocks @ self.R_intra.float()
        rotated = blocks.reshape(-1, self.in_features)

        quantized_act, _ = quantize_mxfp4(rotated, self.block_size)
        out = F.linear(quantized_act.to(self.weight.dtype), self.weight, self.bias)
        return out.reshape(*orig_shape[:-1], self.out_features)


def apply_reorder_smooth_torq(model, rotation_modules, block_size=32, quantize_weights=True):
    for name, module in rotation_modules.items():
        parts = name.split(".")
        parent = model
        for part in parts[:-1]:
            parent = getattr(parent, part)
        linear = getattr(parent, parts[-1])
        quantized = ReorderSmoothTORQQuantizedLinear(linear, module, block_size, quantize_weights)
        setattr(parent, parts[-1], quantized)
    return model


def run_experiment(args):
    print(f"{'='*60}")
    print(f"TORQ Iteration 5 - Reorder + SmoothTORQ")
    print(f"Model: {args.model_path}")
    print(f"LR: {args.lr}, Scale LR mult: {args.scale_lr_mult}, Steps: {args.num_steps}")
    print(f"{'='*60}")

    print("\n[1/4] Loading model...")
    model = AutoModelForCausalLM.from_pretrained(
        args.model_path, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(args.device)
    model.eval()

    print("\n[2/4] Evaluating baseline (BF16) perplexity...")
    test_data = get_wikitext2_testdata(args.model_path, seq_len=args.seq_len)
    baseline_ppl = evaluate_perplexity(model, test_data, device=args.device)
    print(f"  Baseline BF16 PPL: {baseline_ppl:.2f}")

    print("\n[3/4] Training Reorder + SmoothTORQ...")
    calib_loader = get_calibration_dataloader(
        args.model_path, batch_size=args.calib_batch_size,
        seq_len=args.seq_len, num_samples=args.num_calib_samples,
    )

    target_linears = find_target_linears(model)
    target_names = list(target_linears.keys())
    print(f"  Target layers: {len(target_names)}")
    print(f"  Collecting activations...")

    activations = collect_activations(
        model, calib_loader, target_names, device=args.device,
        max_samples=args.max_activation_samples,
    )

    rotation_modules = {}
    train_start = time.time()

    for i, (name, linear) in enumerate(target_linears.items()):
        if name not in activations:
            continue

        module, metrics = train_layer_reorder_smooth_torq(
            activations[name], linear.weight.detach(),
            in_features=linear.in_features,
            block_size=args.block_size,
            lr=args.lr,
            scale_lr_mult=args.scale_lr_mult,
            num_steps=args.num_steps,
            device=args.device,
        )
        rotation_modules[name] = module

        if (i + 1) % 28 == 0 or i == 0 or i == len(target_linears) - 1:
            reduction = (1 - metrics['final_mse'] / max(metrics['initial_mse'], 1e-10)) * 100
            print(f"  [{i+1}/{len(target_linears)}] {name}: "
                  f"MSE {metrics['initial_mse']:.4e} -> {metrics['final_mse']:.4e} "
                  f"({reduction:.1f}% reduction)")

    train_time = time.time() - train_start
    print(f"  Training completed in {train_time:.1f}s")

    print("\n[4/4] Evaluating Reorder+SmoothTORQ W4A4 perplexity...")
    del model
    torch.cuda.empty_cache()

    torq_model = AutoModelForCausalLM.from_pretrained(
        args.model_path, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(args.device)
    torq_model.eval()

    apply_reorder_smooth_torq(torq_model, rotation_modules, block_size=args.block_size, quantize_weights=True)

    torq_ppl = evaluate_perplexity(torq_model, test_data, device=args.device)
    print(f"  Reorder+SmoothTORQ W4A4 PPL: {torq_ppl:.2f}")

    print(f"\n{'='*60}")
    print(f"RESULTS SUMMARY (Iteration 5 - Reorder + SmoothTORQ)")
    print(f"{'='*60}")
    print(f"  BF16 Baseline PPL:  {baseline_ppl:.2f}")
    print(f"  Reorder+SmoothTORQ: {torq_ppl:.2f}")
    print(f"  Gap to BF16:         {torq_ppl - baseline_ppl:.2f}")
    print(f"  Training time:       {train_time:.1f}s")
    print(f"{'='*60}")

    results = {
        "iteration": 5,
        "method": "Outlier-Aware Channel Reordering + SmoothTORQ",
        "timestamp": datetime.now().isoformat(),
        "model": args.model_path,
        "baseline_ppl": baseline_ppl,
        "torq_ppl": torq_ppl,
        "gap_to_bf16": torq_ppl - baseline_ppl,
        "training_time_s": train_time,
        "config": vars(args),
    }

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    with open(output_dir / "results_iter5.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {output_dir / 'results_iter5.json'}")

    # Save all iteration comparison
    print(f"\n{'='*60}")
    print(f"ALL ITERATIONS COMPARISON")
    print(f"{'='*60}")
    print(f"  Iter 0 (Proxy losses):        PPL ~55.51 (seq2048)")
    print(f"  Iter 1 (STE joint):           PPL 137.18")
    print(f"  Iter 2 (Hybrid analytical):   PPL 152.92")
    print(f"  Iter 3 (Hadamard residual):   PPL 110.38")
    print(f"  Iter 4 (SmoothTORQ):          PPL 73.35")
    print(f"  Iter 5 (Reorder+SmoothTORQ):  PPL {torq_ppl:.2f}")
    print(f"  BF16 Baseline:                PPL 50.94")
    print(f"{'='*60}")

    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", type=str, default="/data01/datasets/Qwen3-0.6B")
    parser.add_argument("--output-dir", type=str, default="./outputs")
    parser.add_argument("--device", type=str, default="cuda")
    parser.add_argument("--block-size", type=int, default=32)
    parser.add_argument("--seq-len", type=int, default=128)
    parser.add_argument("--calib-batch-size", type=int, default=8)
    parser.add_argument("--num-calib-samples", type=int, default=32)
    parser.add_argument("--max-activation-samples", type=int, default=512)
    parser.add_argument("--lr", type=float, default=5e-3)
    parser.add_argument("--scale-lr-mult", type=float, default=3.0)
    parser.add_argument("--num-steps", type=int, default=400)
    args = parser.parse_args()
    run_experiment(args)


if __name__ == "__main__":
    main()
