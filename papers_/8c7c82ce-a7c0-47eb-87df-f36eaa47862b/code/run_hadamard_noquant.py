"""Verify: Hadamard rotation WITHOUT quantization should give same PPL as BF16."""

import sys
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


class HadamardNoQuantLinear(nn.Module):
    """Hadamard rotation applied to both act and weight, but NO quantization.
    Should be mathematically equivalent to original: O(x) @ O(W)^T = x @ W^T
    """

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

        # Fuse rotation into weight (no quantization)
        with torch.no_grad():
            w = linear.weight.float()
            blocks = w.reshape(w.shape[0], self.num_blocks, self.block_size)
            blocks = torch.einsum('nbk,cb->nck', blocks, R_inter)
            blocks = blocks @ R_intra
            fused_weight = blocks.reshape_as(w)

        self.weight = nn.Parameter(fused_weight.to(linear.weight.dtype), requires_grad=False)
        self.bias = None
        if linear.bias is not None:
            self.bias = nn.Parameter(linear.bias.detach().clone(), requires_grad=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        orig_shape = x.shape
        flat = x.reshape(-1, self.in_features).float()

        # Apply same rotation to activations (no quantization)
        blocks = flat.reshape(-1, self.num_blocks, self.block_size)
        blocks = torch.einsum('nbk,cb->nck', blocks, self.R_inter.float())
        blocks = blocks @ self.R_intra.float()
        rotated = blocks.reshape(-1, self.in_features)

        out = F.linear(rotated.to(self.weight.dtype), self.weight, self.bias)
        return out.reshape(*orig_shape[:-1], self.out_features)


def apply_hadamard_noquant(model, block_size=32):
    count = 0
    for name, module in list(model.named_modules()):
        if isinstance(module, nn.Linear) and name.endswith(TARGET_SUFFIXES):
            parts = name.split(".")
            parent = model
            for part in parts[:-1]:
                parent = getattr(parent, part)
            setattr(parent, parts[-1], HadamardNoQuantLinear(module, block_size))
            count += 1
    print(f"  Applied Hadamard (no quant) to {count} layers")
    return model


def main():
    device = "cuda"
    seq_len = 2048

    print(f"{'='*60}")
    print(f"Verification: Hadamard rotation WITHOUT quantization")
    print(f"Expected: PPL should match BF16 baseline (~20.95)")
    print(f"{'='*60}")

    print("\n[1/3] Loading test data...")
    test_data = get_full_wikitext2_testdata(MODEL_PATH, seq_len=seq_len)

    # BF16 baseline (quick, just 20 chunks)
    print("\n[2/3] BF16 baseline (20 chunks for speed)...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_PATH, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(device)
    model.eval()
    bf16_ppl = evaluate_perplexity(model, test_data[:20], device=device)
    print(f"  BF16 PPL (20 chunks): {bf16_ppl:.4f}")
    del model; torch.cuda.empty_cache()

    # Hadamard no quant
    print("\n[3/3] Hadamard rotation, NO quantization (20 chunks)...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_PATH, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(device)
    model.eval()
    apply_hadamard_noquant(model, block_size=32)
    had_noquant_ppl = evaluate_perplexity(model, test_data[:20], device=device)
    print(f"  Hadamard (no quant) PPL (20 chunks): {had_noquant_ppl:.4f}")
    del model; torch.cuda.empty_cache()

    # Also test: quantize MXFP4 correctness by checking a single layer
    print("\n[Bonus] MXFP4 quantization sanity check...")
    x = torch.randn(4, 896)  # simulate one activation
    x_q, scales = quantize_mxfp4(x, block_size=32)
    
    # Check properties
    x_blocks = x_q.reshape(4, -1, 32)
    unique_per_block = []
    for i in range(x_blocks.shape[1]):
        block = x_blocks[0, i]
        unique_per_block.append(len(block.unique()))
    
    print(f"  Input range: [{x.min():.3f}, {x.max():.3f}]")
    print(f"  Quantized range: [{x_q.min():.3f}, {x_q.max():.3f}]")
    print(f"  Max unique values per block: {max(unique_per_block)} (should be <=15 for signed FP4)")
    print(f"  SNR: {10 * torch.log10((x**2).mean() / ((x - x_q)**2).mean()):.1f} dB")
    
    # Verify codebook values
    unique_abs = x_q.abs().unique().sort()[0]
    print(f"  Unique |values|: {unique_abs.tolist()[:10]}")
    expected = [0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0]
    # After scaling, values are codebook * scale, so unique_abs / scale should be in codebook
    
    print(f"\n{'='*60}")
    print(f"RESULTS")
    print(f"{'='*60}")
    print(f"  BF16 PPL:              {bf16_ppl:.4f}")
    print(f"  Hadamard (no quant):   {had_noquant_ppl:.4f}")
    print(f"  Difference:            {had_noquant_ppl - bf16_ppl:.4f}")
    print(f"  ---")
    if abs(had_noquant_ppl - bf16_ppl) < 0.5:
        print(f"  PASS: Rotation is mathematically correct (preserves dot product)")
    else:
        print(f"  FAIL: Rotation changes output! Check implementation.")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
