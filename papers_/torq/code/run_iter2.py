"""Iteration 2: Hybrid Analytical-Learned TORQ.

Innovation: Combine analytical Schur-Horn Givens rotation for inter-block
(provably optimal for variance equalization) with gradient-based STE training
for intra-block rotation only. This reduces the optimization burden and
leverages the theoretical guarantee of the inter-block stage.
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
from mxfp4 import quantize_mxfp4, compute_block_scales
from rotations import TORQRotationModule, CayleyRotation
from evaluate import apply_torq_to_model, evaluate_perplexity
from data import get_calibration_dataloader, get_wikitext2_testdata


TARGET_SUFFIXES = ("q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj")


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


def analytical_inter_rotation(samples: torch.Tensor, num_blocks: int, block_size: int,
                               max_steps: int = 128, tol: float = 1e-4) -> torch.Tensor:
    """Compute inter-block rotation analytically using Schur-Horn Givens equalization."""
    blocks = samples.reshape(-1, num_blocks, block_size).float()
    # Aggregate across positions to get inter-block covariance
    shared_samples = blocks.permute(0, 2, 1).reshape(-1, num_blocks)
    centered = shared_samples - shared_samples.mean(dim=0, keepdim=True)
    covariance = centered.T @ centered / max(centered.shape[0] - 1, 1)

    # Givens equalization
    work = covariance.to(torch.float64)
    work = 0.5 * (work + work.T)
    work = work + 1e-6 * torch.eye(num_blocks, device=work.device, dtype=work.dtype)
    target = torch.trace(work) / num_blocks
    rotation = torch.eye(num_blocks, device=work.device, dtype=work.dtype)

    for step in range(max_steps):
        diag = work.diag()
        deviation = diag - target
        if float(deviation.abs().max().item()) <= tol:
            break
        i = int(torch.argmax(deviation).item())
        j = int(torch.argmin(deviation).item())
        if i == j:
            break
        a, b, d = work[i, i], work[i, j], work[j, j]
        theta = 0.5 * torch.atan2(d - a, 2.0 * b + 1e-12)
        c, s = torch.cos(theta), torch.sin(theta)
        g = torch.eye(num_blocks, device=work.device, dtype=work.dtype)
        g[i, i], g[j, j] = c, c
        g[i, j], g[j, i] = -s, s
        work = g.T @ work @ g
        work = 0.5 * (work + work.T)
        rotation = rotation @ g

    return rotation.to(torch.float32)


class HybridTORQModule(nn.Module):
    """TORQ module with fixed analytical inter-rotation and learnable intra-rotation."""

    def __init__(self, in_features: int, block_size: int, inter_rotation: torch.Tensor):
        super().__init__()
        self.in_features = in_features
        self.block_size = block_size
        self.num_blocks = in_features // block_size
        self.register_buffer("R_inter", inter_rotation)
        self.intra_rotation = CayleyRotation(block_size)

    def get_inter_matrix(self) -> torch.Tensor:
        return self.R_inter

    def get_intra_matrix(self) -> torch.Tensor:
        return self.intra_rotation()


def train_layer_hybrid(
    activation_samples: torch.Tensor,
    weight: torch.Tensor,
    in_features: int,
    block_size: int = 32,
    lr: float = 5e-3,
    num_steps: int = 300,
    device: str = "cuda",
) -> tuple[HybridTORQModule, dict]:
    """Train intra-block rotation with fixed analytical inter-block rotation."""
    num_blocks = in_features // block_size
    samples = activation_samples.to(device).float()
    w = weight.to(device).float()

    # Step 1: Compute analytical inter-block rotation
    R_inter = analytical_inter_rotation(samples, num_blocks, block_size).to(device)

    # Step 2: Create hybrid module
    hybrid = HybridTORQModule(in_features, block_size, R_inter).to(device)

    # Reference output
    ref_output = F.linear(samples, w)

    # Only optimize intra-block rotation
    optimizer = torch.optim.Adam(hybrid.intra_rotation.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=num_steps)

    initial_mse = None
    final_mse = None

    for step in range(num_steps):
        optimizer.zero_grad()

        R_intra = hybrid.get_intra_matrix()

        # Apply rotations to activations
        blocks = samples.reshape(-1, num_blocks, block_size)
        blocks = torch.einsum('nbk,cb->nck', blocks, R_inter)
        blocks = blocks @ R_intra
        rotated_act = blocks.reshape(-1, in_features)

        # STE quantize activations
        quantized_act = ste_quantize_mxfp4(rotated_act, block_size)

        # Fuse rotation into weight
        w_blocks = w.reshape(w.shape[0], num_blocks, block_size)
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

    return hybrid, {"initial_mse": initial_mse, "final_mse": final_mse}


def run_experiment(args):
    print(f"{'='*60}")
    print(f"TORQ Iteration 2 - Hybrid Analytical-Learned")
    print(f"Model: {args.model_path}")
    print(f"LR: {args.lr}, Steps: {args.num_steps}")
    print(f"{'='*60}")

    # Load model
    print("\n[1/4] Loading model...")
    model = AutoModelForCausalLM.from_pretrained(
        args.model_path, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(args.device)
    model.eval()

    # Evaluate baseline
    print("\n[2/4] Evaluating baseline (BF16) perplexity...")
    test_data = get_wikitext2_testdata(args.model_path, seq_len=args.seq_len)
    baseline_ppl = evaluate_perplexity(model, test_data, device=args.device)
    print(f"  Baseline BF16 PPL: {baseline_ppl:.2f}")

    # Collect calibration data and train rotations
    print("\n[3/4] Training TORQ rotations (Hybrid)...")
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

        hybrid, metrics = train_layer_hybrid(
            activations[name], linear.weight.detach(),
            in_features=linear.in_features,
            block_size=args.block_size,
            lr=args.lr, num_steps=args.num_steps,
            device=args.device,
        )
        rotation_modules[name] = hybrid

        if (i + 1) % 28 == 0 or i == 0 or i == len(target_linears) - 1:
            reduction = (1 - metrics['final_mse'] / max(metrics['initial_mse'], 1e-10)) * 100
            print(f"  [{i+1}/{len(target_linears)}] {name}: "
                  f"MSE {metrics['initial_mse']:.4e} -> {metrics['final_mse']:.4e} "
                  f"({reduction:.1f}% reduction)")

    train_time = time.time() - train_start
    print(f"  Training completed in {train_time:.1f}s")

    # Apply TORQ and evaluate
    print("\n[4/4] Evaluating TORQ W4A4 perplexity...")
    del model
    torch.cuda.empty_cache()

    torq_model = AutoModelForCausalLM.from_pretrained(
        args.model_path, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(args.device)
    torq_model.eval()

    apply_torq_to_model(
        torq_model, rotation_modules,
        block_size=args.block_size, quantize_weights=True,
    )

    torq_ppl = evaluate_perplexity(torq_model, test_data, device=args.device)
    print(f"  TORQ W4A4 PPL: {torq_ppl:.2f}")

    # Summary
    print(f"\n{'='*60}")
    print(f"RESULTS SUMMARY (Iteration 2 - Hybrid)")
    print(f"{'='*60}")
    print(f"  BF16 Baseline PPL:  {baseline_ppl:.2f}")
    print(f"  TORQ W4A4 PPL:      {torq_ppl:.2f}")
    print(f"  Gap to BF16:         {torq_ppl - baseline_ppl:.2f}")
    print(f"  Training time:       {train_time:.1f}s")
    print(f"{'='*60}")

    # Save results
    results = {
        "iteration": 2,
        "method": "Hybrid Analytical-Learned (Givens inter + STE intra)",
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
    with open(output_dir / "results_iter2.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {output_dir / 'results_iter2.json'}")

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
    parser.add_argument("--num-steps", type=int, default=300)
    args = parser.parse_args()
    run_experiment(args)


if __name__ == "__main__":
    main()
