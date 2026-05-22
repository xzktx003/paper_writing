"""Run TORQ (iter5: Reorder+SmoothTORQ) on Qwen3-4B with full WikiText2 eval."""

import sys
import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import AutoModelForCausalLM, AutoTokenizer
from datasets import load_dataset

sys.path.insert(0, str(Path(__file__).parent))
from mxfp4 import quantize_mxfp4
from run_iter5 import (
    find_target_linears, collect_activations,
    train_layer_reorder_smooth_torq, apply_reorder_smooth_torq,
)
from data import get_calibration_dataloader

MODEL_PATH = "/data01/datasets/Qwen3-4B"


def get_full_wikitext2_testdata(tokenizer_path: str, seq_len: int = 2048):
    tokenizer = AutoTokenizer.from_pretrained(tokenizer_path, trust_remote_code=True)
    dataset = load_dataset("wikitext", "wikitext-2-raw-v1", split="test")
    text = "\n\n".join(dataset["text"])
    tokens = tokenizer.encode(text, add_special_tokens=False)
    tokens = torch.tensor(tokens, dtype=torch.long)

    chunks = []
    for i in range(0, len(tokens) - seq_len, seq_len):
        chunks.append(tokens[i:i + seq_len])

    print(f"  WikiText2 test: {len(tokens)} tokens, {len(chunks)} chunks of {seq_len}")
    return chunks


@torch.no_grad()
def evaluate_perplexity(model, test_data, device="cuda"):
    model.eval()
    total_nll = 0.0
    total_tokens = 0

    for i, chunk in enumerate(test_data):
        batch = chunk.unsqueeze(0).to(device)
        outputs = model(input_ids=batch)
        logits = outputs.logits

        shift_logits = logits[:, :-1, :].contiguous()
        shift_labels = batch[:, 1:].contiguous()

        loss = F.cross_entropy(
            shift_logits.reshape(-1, shift_logits.shape[-1]),
            shift_labels.reshape(-1),
            reduction="sum",
        )
        total_nll += loss.item()
        total_tokens += shift_labels.numel()

        if (i + 1) % 20 == 0:
            running_ppl = torch.exp(torch.tensor(total_nll / total_tokens)).item()
            print(f"    [{i+1}/{len(test_data)}] running PPL = {running_ppl:.4f}")

    ppl = torch.exp(torch.tensor(total_nll / total_tokens)).item()
    return ppl


def main():
    device = "cuda"
    seq_len = 2048
    block_size = 32
    lr = 5e-3
    scale_lr_mult = 3.0
    num_steps = 400
    num_calib_samples = 128
    calib_batch_size = 8
    max_activation_samples = 1024

    print(f"{'='*60}")
    print(f"TORQ (Reorder+SmoothTORQ) on Qwen3-4B - Full WikiText2")
    print(f"Model: {MODEL_PATH}")
    print(f"LR: {lr}, Scale LR mult: {scale_lr_mult}, Steps: {num_steps}")
    print(f"Calib: {num_calib_samples} samples, seq_len={seq_len}")
    print(f"{'='*60}")

    # Load test data
    print("\n[1/4] Loading full WikiText2 test set...")
    test_data = get_full_wikitext2_testdata(MODEL_PATH, seq_len=seq_len)

    # Load model
    print("\n[2/4] Loading model...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_PATH, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(device)
    model.eval()

    # Train TORQ
    print("\n[3/4] Training TORQ (Reorder + SmoothTORQ)...")
    calib_loader = get_calibration_dataloader(
        MODEL_PATH, batch_size=calib_batch_size,
        seq_len=seq_len, num_samples=num_calib_samples,
    )

    target_linears = find_target_linears(model)
    target_names = list(target_linears.keys())
    print(f"  Target layers: {len(target_names)}")
    print(f"  Collecting activations...")

    activations = collect_activations(
        model, calib_loader, target_names, device=device,
        max_samples=max_activation_samples,
    )

    rotation_modules = {}
    train_start = time.time()

    for i, (name, linear) in enumerate(target_linears.items()):
        if name not in activations:
            continue

        module, metrics = train_layer_reorder_smooth_torq(
            activations[name], linear.weight.detach(),
            in_features=linear.in_features,
            block_size=block_size,
            lr=lr,
            scale_lr_mult=scale_lr_mult,
            num_steps=num_steps,
            device=device,
        )
        rotation_modules[name] = module

        if (i + 1) % 28 == 0 or i == 0 or i == len(target_linears) - 1:
            reduction = (1 - metrics['final_mse'] / max(metrics['initial_mse'], 1e-10)) * 100
            print(f"  [{i+1}/{len(target_linears)}] {name}: "
                  f"MSE {metrics['initial_mse']:.4e} -> {metrics['final_mse']:.4e} "
                  f"({reduction:.1f}% reduction)")

    train_time = time.time() - train_start
    print(f"  Training completed in {train_time:.1f}s")

    # Apply and evaluate
    print("\n[4/4] Evaluating TORQ W4A4...")
    del model
    torch.cuda.empty_cache()

    torq_model = AutoModelForCausalLM.from_pretrained(
        MODEL_PATH, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(device)
    torq_model.eval()
    apply_reorder_smooth_torq(torq_model, rotation_modules, block_size=block_size, quantize_weights=True)

    t0 = time.time()
    torq_ppl = evaluate_perplexity(torq_model, test_data, device=device)
    t1 = time.time()
    print(f"  TORQ PPL: {torq_ppl:.4f} ({t1-t0:.1f}s)")

    # Summary
    bf16_ppl = 20.9548  # from previous run
    rtn_ppl = 39.9356   # from previous run
    print(f"\n{'='*60}")
    print(f"RESULTS (Qwen3-4B, full WikiText2, seq_len={seq_len})")
    print(f"{'='*60}")
    print(f"  BF16 Baseline:       {bf16_ppl:.4f}")
    print(f"  MXFP4 + TORQ:       {torq_ppl:.4f}  (gap +{torq_ppl - bf16_ppl:.4f})")
    print(f"  MXFP4 RTN:          {rtn_ppl:.4f}  (gap +{rtn_ppl - bf16_ppl:.4f})")
    print(f"  ---")
    print(f"  TORQ gap reduction: {(1 - (torq_ppl - bf16_ppl) / (rtn_ppl - bf16_ppl)) * 100:.1f}%")
    print(f"  Training time:      {train_time:.1f}s")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
