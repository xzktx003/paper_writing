"""Iteration 1: Streamlined TORQ with end-to-end STE training.
Skips redundant RTN eval, focuses on training + TORQ eval.
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from datetime import datetime

import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import AutoModelForCausalLM, AutoTokenizer

sys.path.insert(0, str(Path(__file__).parent))
from mxfp4 import quantize_mxfp4, compute_block_scales, soft_codebook_occupancy_loss
from rotations import TORQRotationModule
from evaluate import apply_torq_to_model, evaluate_perplexity, TORQQuantizedLinear
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


def collect_activations(
    model: nn.Module,
    dataloader,
    target_names: list[str],
    device: str = "cuda",
    max_samples: int = 512,
) -> dict[str, torch.Tensor]:
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


def train_layer_ste(
    activation_samples: torch.Tensor,
    weight: torch.Tensor,
    in_features: int,
    block_size: int = 32,
    lr: float = 1e-2,
    num_steps: int = 500,
    device: str = "cuda",
) -> tuple[TORQRotationModule, dict]:
    """Train both rotations jointly using end-to-end STE MSE loss."""
    rot_module = TORQRotationModule(in_features, block_size).to(device)
    samples = activation_samples.to(device).float()
    w = weight.to(device).float()
    num_blocks = in_features // block_size

    ref_output = F.linear(samples, w)

    optimizer = torch.optim.Adam(rot_module.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=num_steps)

    initial_mse = None
    final_mse = None

    for step in range(num_steps):
        optimizer.zero_grad()

        R_inter = rot_module.get_inter_matrix()
        R_intra = rot_module.get_intra_matrix()

        # Rotate activations
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

    return rot_module, {"initial_mse": initial_mse, "final_mse": final_mse}


def run_experiment(args):
    print(f"{'='*60}")
    print(f"TORQ Iteration 1 - End-to-End STE Training")
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
    print("\n[3/4] Training TORQ rotations (STE end-to-end)...")
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

        rot_module, metrics = train_layer_ste(
            activations[name], linear.weight.detach(),
            in_features=linear.in_features,
            block_size=args.block_size,
            lr=args.lr, num_steps=args.num_steps,
            device=args.device,
        )
        rotation_modules[name] = rot_module

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
    print(f"RESULTS SUMMARY (Iteration 1 - STE)")
    print(f"{'='*60}")
    print(f"  BF16 Baseline PPL:  {baseline_ppl:.2f}")
    print(f"  TORQ W4A4 PPL:      {torq_ppl:.2f}")
    print(f"  Gap to BF16:         {torq_ppl - baseline_ppl:.2f}")
    print(f"  Training time:       {train_time:.1f}s")
    print(f"{'='*60}")

    # Save results
    results = {
        "iteration": 1,
        "method": "STE end-to-end MSE",
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
    with open(output_dir / "results_iter1.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {output_dir / 'results_iter1.json'}")

    ckpt = {}
    for name, rot_module in rotation_modules.items():
        ckpt[name] = {
            "inter_params": rot_module.inter_rotation.params.data.cpu(),
            "intra_params": rot_module.intra_rotation.params.data.cpu(),
            "in_features": rot_module.in_features,
            "block_size": rot_module.block_size,
        }
    torch.save(ckpt, output_dir / "rotations_iter1.pt")

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
    parser.add_argument("--lr", type=float, default=1e-2)
    parser.add_argument("--num-steps", type=int, default=500)
    args = parser.parse_args()
    run_experiment(args)


if __name__ == "__main__":
    main()
