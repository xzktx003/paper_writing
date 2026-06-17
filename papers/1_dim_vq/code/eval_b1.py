#!/usr/bin/env python3
"""
B1 Dynamic Codebook — 实验验证脚本

在真实模型上验证激活条件码本(B1)的有效性。

对比: RTN, NF4, B1_Dynamic
模型: Qwen3-0.6B (快速), Qwen3-8B (完整)
数据集: WikiText-2
"""

import os, sys, json, math, argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List

import torch
import torch.nn as nn
from transformers import AutoModelForCausalLM, AutoTokenizer
from datasets import load_dataset

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adacode import DynamicCodebookMixer, ActivationStatisticsCollector

MODEL_PATHS = {
    "qwen3-0.6b": "/data01/datasets/Qwen3-0.6B",
    "qwen3-8b": "/data01/datasets/Qwen3-8B",
}

BLOCK_SIZE = 64
MAX_LENGTH = 256

def load_model(name: str):
    path = MODEL_PATHS.get(name, name)
    print(f"Loading {name} from {path}...")
    tokenizer = AutoTokenizer.from_pretrained(path, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        path, device_map="cpu", torch_dtype=torch.float16, trust_remote_code=True
    )
    model.eval()
    return model, tokenizer


def evaluate_ppl(model, tokenizer, max_samples: int = 50) -> float:
    print("Evaluating PPL...")
    dataset = load_dataset("wikitext", "wikitext-2-raw-v1", split="test")
    texts = [t for t in dataset["text"] if len(t.strip()) > 20][:max_samples]
    
    total_loss, total_tokens = 0.0, 0
    with torch.no_grad():
        for i, text in enumerate(texts):
            if i % 10 == 0:
                print(f"  Eval {i}/{len(texts)}")
            try:
                inputs = tokenizer(text, return_tensors="pt", max_length=MAX_LENGTH, truncation=True)
                inputs["labels"] = inputs["input_ids"].clone()
                outputs = model(**inputs)
                loss = outputs.loss.item()
                n = inputs["input_ids"].shape[1]
                if loss and not math.isnan(loss) and not math.isinf(loss):
                    total_loss += loss * n
                    total_tokens += n
            except:
                continue
    
    if total_tokens == 0:
        return float('inf')
    ppl = math.exp(total_loss / total_tokens)
    print(f"  PPL: {ppl:.4f} ({total_tokens} tokens)")
    return ppl


def collect_activation_stats(model, tokenizer, n_samples: int = 16) -> Dict:
    print(f"Collecting activation stats ({n_samples} samples)...")
    collector = ActivationStatisticsCollector(model)
    collector.register_hooks()
    dataset = load_dataset("wikitext", "wikitext-2-raw-v1", split="train")
    texts = [t for t in dataset["text"] if len(t.strip()) > 20][:n_samples]
    with torch.no_grad():
        for text in texts:
            try:
                tokens = tokenizer(text, return_tensors="pt", max_length=MAX_LENGTH, truncation=True)
                model(**tokens)
            except:
                continue
    collector.remove_hooks()
    stats = collector.get_stats()
    print(f"  Collected stats for {len(stats)} layers")
    return stats


def quantize_rtn(model):
    print("Quantizing RTN...")
    for name, module in model.named_modules():
        if not isinstance(module, nn.Linear) or module.weight.numel() == 0:
            continue
        if "lm_head" in name:
            continue
        w = module.weight.data.float()
        orig_shape = w.shape
        wf = w.reshape(-1)
        ne = wf.numel()
        nb = (ne + BLOCK_SIZE - 1) // BLOCK_SIZE
        
        pad = torch.zeros(nb * BLOCK_SIZE, dtype=wf.dtype)
        pad[:ne] = wf
        blocks = pad.reshape(nb, BLOCK_SIZE)
        
        bmax = blocks.abs().max(dim=1, keepdim=True).values.clamp(min=1e-10)
        scale = bmax / 7.0
        q = torch.clamp(torch.round(blocks / scale), -8, 7)
        rec = q * scale
        module.weight.data = rec.reshape(-1)[:ne].reshape(orig_shape).half()


def quantize_nf4(model):
    print("Quantizing NF4...")
    from statistics import NormalDist
    probs = torch.linspace(0.5/16, 1-0.5/16, 16)
    cb = torch.tensor([NormalDist().inv_cdf(float(p)) for p in probs])
    cb = cb / cb.abs().max()
    
    for name, module in model.named_modules():
        if not isinstance(module, nn.Linear) or module.weight.numel() == 0:
            continue
        if "lm_head" in name:
            continue
        w = module.weight.data.float()
        orig_shape = w.shape
        wf = w.reshape(-1)
        ne = wf.numel()
        nb = (ne + BLOCK_SIZE - 1) // BLOCK_SIZE
        
        pad = torch.zeros(nb * BLOCK_SIZE, dtype=wf.dtype)
        pad[:ne] = wf
        blocks = pad.reshape(nb, BLOCK_SIZE)
        
        bmax = blocks.abs().max(dim=1, keepdim=True).values.clamp(min=1e-10)
        alpha = 0.95 * bmax / cb.abs().max()
        scb = cb.unsqueeze(0) * alpha
        
        blocks_exp = blocks.unsqueeze(-1)
        scb_exp = scb.unsqueeze(1)
        dists = (blocks_exp - scb_exp).abs()
        idxs = dists.argmin(dim=-1)
        
        row_idx = torch.arange(nb).unsqueeze(1).expand_as(idxs)
        rec_flat = scb[row_idx.flatten(), idxs.flatten()].reshape(nb, BLOCK_SIZE)
        module.weight.data = rec_flat.reshape(-1)[:ne].reshape(orig_shape).half()


def quantize_b1(model, act_stats: Dict):
    print("Quantizing B1 (Dynamic Codebook)...")
    mixer = DynamicCodebookMixer(n_levels=16, block_size=BLOCK_SIZE)
    mixer.set_activation_stats(act_stats)
    
    for name, module in model.named_modules():
        if not isinstance(module, nn.Linear) or module.weight.numel() == 0:
            continue
        if "lm_head" in name:
            continue
        w = module.weight.data.float()
        sparsity = mixer.compute_layer_sparsity(name)
        result = mixer.quantize_with_sparsity(w, sparsity=sparsity, use_dynamic=True, gamma=0.95)
        module.weight.data = result['quantized'].half()


def run_experiment(model_name: str, methods: List[str]) -> Dict:
    print(f"\n{'='*60}")
    print(f"B1 Dynamic Codebook Experiment: {model_name}")
    print(f"{'='*60}")
    
    model, tokenizer = load_model(model_name)
    act_stats = collect_activation_stats(model, tokenizer, n_samples=16)
    
    # 输出激活统计摘要
    sparsities = []
    for name, stats in act_stats.items():
        sp = 0.6 * stats.get('sparsity', 0) + 0.4 * min(1.0, max(0.0, (stats.get('kurtosis', 3) - 3) / 27))
        sparsities.append((name, sp))
    sparsities.sort(key=lambda x: -x[1])
    print(f"\n  Top-5 sparsest layers:")
    for name, sp in sparsities[:5]:
        print(f"    {name}: s={sp:.3f}")
    print(f"  Bottom-5 densest layers:")
    for name, sp in sparsities[-5:]:
        print(f"    {name}: s={sp:.3f}")
    
    print("\n--- FP16 Baseline ---")
    fp16_ppl = evaluate_ppl(model, tokenizer)
    
    results = {"model": model_name, "fp16_ppl": fp16_ppl, "methods": {}}
    
    for method in methods:
        print(f"\n--- Method: {method} ---")
        model, _ = load_model(model_name)
        
        if method == "RTN":
            quantize_rtn(model)
        elif method == "NF4":
            quantize_nf4(model)
        elif method == "B1_Dynamic":
            quantize_b1(model, act_stats)
        else:
            continue
        
        ppl = evaluate_ppl(model, tokenizer)
        results["methods"][method] = {
            "ppl": ppl,
            "delta": ppl - fp16_ppl,
            "relative_delta": (ppl - fp16_ppl) / fp16_ppl * 100,
        }
        print(f"  {method}: PPL = {ppl:.4f} (Δ = {ppl - fp16_ppl:+.4f})")
        
        del model
        torch.cuda.empty_cache()
    
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, default="qwen3-0.6b")
    parser.add_argument("--methods", type=str, nargs="+", 
                       default=["RTN", "NF4", "B1_Dynamic"])
    parser.add_argument("--output", type=str, default=None)
    args = parser.parse_args()
    
    results = run_experiment(args.model, args.methods)
    
    out = args.output or f"experiments/results/b1_exp_{args.model}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n{'='*60}")
    print("Results Summary")
    print(f"{'='*60}")
    print(f"Model: {args.model}")
    print(f"FP16 PPL: {results['fp16_ppl']:.4f}")
    print(f"\n{'Method':<15} {'PPL':>10} {'Δ PPL':>10} {'Δ%':>10}")
    print("-" * 47)
    for method, data in results["methods"].items():
        print(f"{method:<15} {data['ppl']:>10.4f} {data['delta']:>+10.4f} {data['relative_delta']:>+9.1f}%")
    
    print(f"\nSaved: {out}")
    return results

if __name__ == "__main__":
    main()
