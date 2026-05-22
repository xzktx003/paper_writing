"""Compare: Fixed Hadamard rotation (no learning) vs Full TORQ on Qwen3-0.6B."""

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

MODEL_PATH = "/data01/datasets/Qwen3-0.6B"
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
        if (i + 1) % 30 == 0:
            running_ppl = torch.exp(torch.tensor(total_nll / total_tokens)).item()
            print(f"    [{i+1}/{len(test_data)}] running PPL = {running_ppl:.4f}")
    ppl = torch.exp(torch.tensor(total_nll / total_tokens)).item()
    return ppl


class HadamardOnlyQuantizedLinear(nn.Module):
    """Fixed Hadamard rotation (inter + intra) + MXFP4 W4A4. No learning."""

    def __init__(self, linear: nn.Linear, block_size: int = 32):
        super().__init__()
        self.in_features = linear.in_features
        self.out_features = linear.out_features
        self.block_size = block_size
        self.num_blocks = self.in_features // block_size

        device = linear.weight.device
        R_inter = get_orthogonal_init(self.num_blocks).float().to(device)
        R_intra = get_orthogonal_init(block_size).float().to(device)

        self.register_buffer("R_inter", R_inter)
        self.register_buffer("R_intra", R_intra)

        with torch.no_grad():
            w = linear.weight.float()
            r_inter = R_inter
            r_intra = R_intra
            blocks = w.reshape(w.shape[0], self.num_blocks, self.block_size)
            blocks = torch.einsum('nbk,cb->nck', blocks, r_inter)
            blocks = blocks @ r_intra
            fused_weight = blocks.reshape_as(w)
            fused_weight, _ = quantize_mxfp4(fused_weight, block_size)

        self.weight = nn.Parameter(fused_weight.to(linear.weight.dtype), requires_grad=False)
        self.bias = None
        if linear.bias is not None:
            self.bias = nn.Parameter(linear.bias.detach().clone(), requires_grad=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        orig_shape = x.shape
        flat = x.reshape(-1, self.in_features).float()

        blocks = flat.reshape(-1, self.num_blocks, self.block_size)
        blocks = torch.einsum('nbk,cb->nck', blocks, self.R_inter.float())
        blocks = blocks @ self.R_intra.float()
        rotated = blocks.reshape(-1, self.in_features)

        quantized_act, _ = quantize_mxfp4(rotated, self.block_size)
        out = F.linear(quantized_act.to(self.weight.dtype), self.weight, self.bias)
        return out.reshape(*orig_shape[:-1], self.out_features)


class RTNQuantizedLinear(nn.Module):
    """MXFP4 W4A4 RTN (no rotation)."""

    def __init__(self, linear: nn.Linear, block_size: int = 32):
        super().__init__()
        self.in_features = linear.in_features
        self.out_features = linear.out_features
        self.block_size = block_size

        with torch.no_grad():
            w = linear.weight.float()
            w_q, _ = quantize_mxfp4(w, block_size)
        self.weight = nn.Parameter(w_q.to(linear.weight.dtype), requires_grad=False)
        self.bias = None
        if linear.bias is not None:
            self.bias = nn.Parameter(linear.bias.detach().clone(), requires_grad=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        orig_shape = x.shape
        flat = x.reshape(-1, self.in_features).float()
        act_q, _ = quantize_mxfp4(flat, self.block_size)
        out = F.linear(act_q.to(self.weight.dtype), self.weight, self.bias)
        return out.reshape(*orig_shape[:-1], self.out_features)


def apply_quantization(model, mode="hadamard", block_size=32):
    count = 0
    for name, module in list(model.named_modules()):
        if isinstance(module, nn.Linear) and name.endswith(TARGET_SUFFIXES):
            parts = name.split(".")
            parent = model
            for part in parts[:-1]:
                parent = getattr(parent, part)
            if mode == "hadamard":
                setattr(parent, parts[-1], HadamardOnlyQuantizedLinear(module, block_size))
            else:
                setattr(parent, parts[-1], RTNQuantizedLinear(module, block_size))
            count += 1
    print(f"  Applied {mode} to {count} layers")
    return model


def main():
    device = "cuda"
    seq_len = 2048
    block_size = 32

    print(f"{'='*60}")
    print(f"Hadamard-Only vs RTN vs TORQ — Qwen3-0.6B, Full WikiText2")
    print(f"{'='*60}")

    print("\n[1/4] Loading full WikiText2 test set...")
    test_data = get_full_wikitext2_testdata(MODEL_PATH, seq_len=seq_len)

    # BF16 baseline
    print("\n[2/4] BF16 baseline...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_PATH, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(device)
    model.eval()
    bf16_ppl = evaluate_perplexity(model, test_data, device=device)
    print(f"  BF16 PPL: {bf16_ppl:.4f}")
    del model; torch.cuda.empty_cache()

    # RTN
    print("\n[3/4] MXFP4 RTN (no rotation)...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_PATH, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(device)
    model.eval()
    apply_quantization(model, mode="rtn", block_size=block_size)
    rtn_ppl = evaluate_perplexity(model, test_data, device=device)
    print(f"  RTN PPL: {rtn_ppl:.4f}")
    del model; torch.cuda.empty_cache()

    # Hadamard only
    print("\n[4/4] MXFP4 + Hadamard only (fixed, no learning)...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_PATH, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(device)
    model.eval()
    apply_quantization(model, mode="hadamard", block_size=block_size)
    had_ppl = evaluate_perplexity(model, test_data, device=device)
    print(f"  Hadamard PPL: {had_ppl:.4f}")
    del model; torch.cuda.empty_cache()

    # Summary
    torq_ppl = 26.51  # from previous TORQ iter5 run on 0.6B (20-chunk)
    print(f"\n{'='*60}")
    print(f"RESULTS (Qwen3-0.6B, full WikiText2, seq_len={seq_len})")
    print(f"{'='*60}")
    print(f"  BF16 Baseline:         {bf16_ppl:.4f}")
    print(f"  MXFP4 RTN:            {rtn_ppl:.4f}  (gap +{rtn_ppl - bf16_ppl:.4f})")
    print(f"  MXFP4 + Hadamard:     {had_ppl:.4f}  (gap +{had_ppl - bf16_ppl:.4f})")
    print(f"  MXFP4 + TORQ (prev):  ~26.51  (gap ~+6.23, 20-chunk eval)")
    print(f"  ---")
    had_reduction = (1 - (had_ppl - bf16_ppl) / (rtn_ppl - bf16_ppl)) * 100
    print(f"  Hadamard gap reduction vs RTN: {had_reduction:.1f}%")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
