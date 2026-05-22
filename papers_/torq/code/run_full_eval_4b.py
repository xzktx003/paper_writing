"""Full WikiText2 evaluation for Qwen3-4B: BF16 vs MXFP4 RTN."""

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

MODEL_PATH = "/data01/datasets/Qwen3-4B"
TARGET_SUFFIXES = ("q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj")


def get_full_wikitext2_testdata(tokenizer_path: str, seq_len: int = 2048):
    """Load FULL WikiText2 test set, no chunk limit."""
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


class RTNQuantizedLinear(nn.Module):
    """MXFP4 W4A4 RTN (no rotation, no scaling)."""

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

        # Quantize activations
        act_q, _ = quantize_mxfp4(flat, self.block_size)

        out = F.linear(act_q.to(self.weight.dtype), self.weight, self.bias)
        return out.reshape(*orig_shape[:-1], self.out_features)


def apply_rtn_mxfp4(model, block_size=32):
    """Replace target linears with MXFP4 RTN quantized versions."""
    count = 0
    for name, module in model.named_modules():
        if isinstance(module, nn.Linear) and name.endswith(TARGET_SUFFIXES):
            parts = name.split(".")
            parent = model
            for part in parts[:-1]:
                parent = getattr(parent, part)
            setattr(parent, parts[-1], RTNQuantizedLinear(module, block_size))
            count += 1
    print(f"  Quantized {count} layers to MXFP4 W4A4")
    return model


def main():
    device = "cuda"
    seq_len = 2048
    block_size = 32

    print(f"{'='*60}")
    print(f"Full WikiText2 Evaluation: Qwen3-4B")
    print(f"Model: {MODEL_PATH}")
    print(f"Seq len: {seq_len}, Block size: {block_size}")
    print(f"{'='*60}")

    # Load test data
    print("\n[1/3] Loading full WikiText2 test set...")
    test_data = get_full_wikitext2_testdata(MODEL_PATH, seq_len=seq_len)

    # BF16 baseline
    print("\n[2/3] Evaluating BF16 baseline...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_PATH, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(device)
    model.eval()

    t0 = time.time()
    bf16_ppl = evaluate_perplexity(model, test_data, device=device)
    t1 = time.time()
    print(f"  BF16 PPL: {bf16_ppl:.4f} ({t1-t0:.1f}s)")

    # MXFP4 RTN
    print("\n[3/3] Evaluating MXFP4 RTN W4A4...")
    del model
    torch.cuda.empty_cache()

    model_rtn = AutoModelForCausalLM.from_pretrained(
        MODEL_PATH, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(device)
    model_rtn.eval()
    apply_rtn_mxfp4(model_rtn, block_size=block_size)

    t0 = time.time()
    rtn_ppl = evaluate_perplexity(model_rtn, test_data, device=device)
    t1 = time.time()
    print(f"  MXFP4 RTN PPL: {rtn_ppl:.4f} ({t1-t0:.1f}s)")

    # Summary
    print(f"\n{'='*60}")
    print(f"RESULTS (Qwen3-4B, full WikiText2 test, seq_len={seq_len})")
    print(f"{'='*60}")
    print(f"  BF16 Baseline:  {bf16_ppl:.4f}")
    print(f"  MXFP4 RTN W4A4: {rtn_ppl:.4f}")
    print(f"  Gap:            +{rtn_ppl - bf16_ppl:.4f}")
    print(f"  Relative:       +{(rtn_ppl - bf16_ppl) / bf16_ppl * 100:.1f}%")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
