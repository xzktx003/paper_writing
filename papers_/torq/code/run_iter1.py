"""Iteration 1: Run TORQ with end-to-end STE training."""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from datetime import datetime

import torch
import torch.nn as nn
from transformers import AutoModelForCausalLM, AutoTokenizer

sys.path.insert(0, str(Path(__file__).parent))
from mxfp4 import quantize_mxfp4
from rotations import TORQRotationModule
from trainer_ste import TORQTrainerSTE
from evaluate import apply_torq_to_model, evaluate_perplexity
from data import get_calibration_dataloader, get_wikitext2_testdata


TARGET_SUFFIXES = ("q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj")


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
    """Collect input activations for target layers (memory-efficient)."""
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


def run_experiment(args):
    print(f"{'='*60}")
    print(f"TORQ Iteration 1 - End-to-End STE Training")
    print(f"Model: {args.model_path}")
    print(f"Block size: {args.block_size}")
    print(f"LR: {args.lr}, Steps: {args.num_steps}")
    print(f"{'='*60}")

    # Load model
    print("\n[1/5] Loading model...")
    model = AutoModelForCausalLM.from_pretrained(
        args.model_path,
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
    ).to(args.device)
    model.eval()

    # Evaluate baseline
    print("\n[2/5] Evaluating baseline (BF16) perplexity...")
    test_data = get_wikitext2_testdata(args.model_path, seq_len=args.seq_len)
    baseline_ppl = evaluate_perplexity(model, test_data, device=args.device)
    print(f"  Baseline BF16 PPL: {baseline_ppl:.2f}")

    # Evaluate RTN
    print("\n[3/5] Evaluating direct MXFP4 (RTN) perplexity...")
    rtn_model = AutoModelForCausalLM.from_pretrained(
        args.model_path,
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
    ).to(args.device)
    rtn_model.eval()

    target_linears_rtn = find_target_linears(rtn_model)

    class RTNQuantLinear(nn.Module):
        def __init__(self, linear, block_size):
            super().__init__()
            with torch.no_grad():
                q_weight, _ = quantize_mxfp4(linear.weight.float(), block_size)
            self.weight = nn.Parameter(q_weight.to(linear.weight.dtype), requires_grad=False)
            self.bias = linear.bias
            self.block_size = block_size

        def forward(self, x):
            orig_shape = x.shape
            flat = x.reshape(-1, x.shape[-1]).float()
            q_act, _ = quantize_mxfp4(flat, self.block_size)
            out = nn.functional.linear(q_act.to(self.weight.dtype), self.weight, self.bias)
            return out.reshape(*orig_shape[:-1], out.shape[-1])

    for name, linear in target_linears_rtn.items():
        parts = name.split(".")
        parent = rtn_model
        for part in parts[:-1]:
            parent = getattr(parent, part)
        setattr(parent, parts[-1], RTNQuantLinear(linear, args.block_size))

    rtn_ppl = evaluate_perplexity(rtn_model, test_data, device=args.device)
    print(f"  RTN W4A4 PPL: {rtn_ppl:.2f}")
    del rtn_model
    torch.cuda.empty_cache()

    # Collect calibration data and train rotations
    print("\n[4/5] Training TORQ rotations (STE end-to-end)...")
    calib_loader = get_calibration_dataloader(
        args.model_path,
        batch_size=args.calib_batch_size,
        seq_len=args.seq_len,
        num_samples=args.num_calib_samples,
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

        act_samples = activations[name]
        trainer = TORQTrainerSTE(
            in_features=linear.in_features,
            block_size=args.block_size,
            lr=args.lr,
            num_steps=args.num_steps,
            device=args.device,
            weight_quant=True,
            codebook_reg_weight=args.codebook_reg,
        )

        rot_module, metrics = trainer.train_layer(
            act_samples, linear.weight.detach()
        )
        rotation_modules[name] = rot_module

        if (i + 1) % 28 == 0 or i == 0 or i == len(target_linears) - 1:
            print(f"  [{i+1}/{len(target_linears)}] {name}: "
                  f"MSE {metrics['initial_mse']:.6f} -> {metrics['final_mse']:.6f} "
                  f"({(1 - metrics['final_mse']/max(metrics['initial_mse'], 1e-10))*100:.1f}% reduction)")

    train_time = time.time() - train_start
    print(f"  Training completed in {train_time:.1f}s")

    # Apply TORQ and evaluate
    print("\n[5/5] Evaluating TORQ W4A4 perplexity...")
    torq_model = AutoModelForCausalLM.from_pretrained(
        args.model_path,
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
    ).to(args.device)
    torq_model.eval()

    apply_torq_to_model(
        torq_model, rotation_modules,
        block_size=args.block_size,
        quantize_weights=True,
    )

    torq_ppl = evaluate_perplexity(torq_model, test_data, device=args.device)
    print(f"  TORQ W4A4 PPL: {torq_ppl:.2f}")

    # Summary
    print(f"\n{'='*60}")
    print(f"RESULTS SUMMARY (Iteration 1 - STE)")
    print(f"{'='*60}")
    print(f"  BF16 Baseline PPL:  {baseline_ppl:.2f}")
    print(f"  RTN W4A4 PPL:       {rtn_ppl:.2f}")
    print(f"  TORQ W4A4 PPL:      {torq_ppl:.2f}")
    print(f"  Improvement over RTN: {rtn_ppl - torq_ppl:.2f}")
    print(f"  Gap to BF16:         {torq_ppl - baseline_ppl:.2f}")
    print(f"  Training time:       {train_time:.1f}s")
    print(f"{'='*60}")

    # Save results
    results = {
        "iteration": 1,
        "method": "STE end-to-end MSE",
        "timestamp": datetime.now().isoformat(),
        "model": args.model_path,
        "block_size": args.block_size,
        "baseline_ppl": baseline_ppl,
        "rtn_ppl": rtn_ppl,
        "torq_ppl": torq_ppl,
        "improvement_over_rtn": rtn_ppl - torq_ppl,
        "gap_to_bf16": torq_ppl - baseline_ppl,
        "training_time_s": train_time,
        "config": {
            "lr": args.lr,
            "num_steps": args.num_steps,
            "num_calib_samples": args.num_calib_samples,
            "max_activation_samples": args.max_activation_samples,
            "seq_len": args.seq_len,
            "codebook_reg": args.codebook_reg,
        },
    }

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    results_file = output_dir / "results_iter1.json"
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {results_file}")

    # Save rotation checkpoints
    ckpt_path = output_dir / "rotations_iter1.pt"
    ckpt = {}
    for name, rot_module in rotation_modules.items():
        ckpt[name] = {
            "inter_params": rot_module.inter_rotation.params.data.cpu(),
            "intra_params": rot_module.intra_rotation.params.data.cpu(),
            "in_features": rot_module.in_features,
            "block_size": rot_module.block_size,
        }
    torch.save(ckpt, ckpt_path)
    print(f"Rotation checkpoint saved to {ckpt_path}")

    return results


def main():
    parser = argparse.ArgumentParser(description="TORQ Iter1 - STE Training")
    parser.add_argument("--model-path", type=str, default="/data01/datasets/Qwen3-0.6B")
    parser.add_argument("--output-dir", type=str, default="./outputs")
    parser.add_argument("--device", type=str, default="cuda")
    parser.add_argument("--block-size", type=int, default=32)
    parser.add_argument("--seq-len", type=int, default=2048)
    parser.add_argument("--calib-batch-size", type=int, default=4)
    parser.add_argument("--num-calib-samples", type=int, default=32)
    parser.add_argument("--max-activation-samples", type=int, default=512)
    parser.add_argument("--lr", type=float, default=1e-2)
    parser.add_argument("--num-steps", type=int, default=500)
    parser.add_argument("--codebook-reg", type=float, default=0.0)
    args = parser.parse_args()

    run_experiment(args)


if __name__ == "__main__":
    main()
