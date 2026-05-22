"""Iteration 3: Hadamard-Seeded Residual Rotation with Layer-Adaptive LR.

Innovation: Use Walsh-Hadamard transform as initialization (provably optimal
for spreading Gaussian data uniformly across quantization bins), then learn a
small data-dependent residual correction via Cayley parameterization. This
bridges fixed transforms (QuIP#/AQLM) and fully-learned rotations (iter 1).

Key insight: Hadamard is optimal for Gaussian inputs, but real activations are
non-Gaussian (heavy-tailed, correlated). The residual correction adapts to the
actual data distribution while retaining the strong Hadamard prior.

Additional: Layer-adaptive LR scaling based on initial quantization error,
preventing later layers (with larger MSE) from under-training.
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
    """Generate normalized Walsh-Hadamard matrix of size n (must be power of 2)."""
    if n == 1:
        return torch.ones(1, 1)
    half = hadamard_matrix(n // 2)
    full = torch.cat([
        torch.cat([half, half], dim=1),
        torch.cat([half, -half], dim=1),
    ], dim=0)
    return full / (2 ** 0.5)


def random_orthogonal(n: int) -> torch.Tensor:
    """Generate a random orthogonal matrix via QR decomposition."""
    random_mat = torch.randn(n, n)
    q, r = torch.linalg.qr(random_mat)
    d = torch.diag(r).sign()
    return q * d.unsqueeze(0)


def get_orthogonal_init(n: int) -> torch.Tensor:
    """Get best orthogonal initialization: Hadamard if power-of-2, else random orthogonal."""
    if n > 0 and (n & (n - 1)) == 0:
        return hadamard_matrix(n)
    return random_orthogonal(n)


class ResidualCayleyRotation(nn.Module):
    """R = R_base @ Cayley(A), where R_base is fixed and A is learnable (starts at 0)."""

    def __init__(self, size: int, base_matrix: torch.Tensor):
        super().__init__()
        self.size = size
        self.register_buffer("R_base", base_matrix)
        num_params = size * (size - 1) // 2
        self.params = nn.Parameter(torch.zeros(num_params) * 0.01)

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


class HadamardResidualModule(nn.Module):
    """TORQ module with Hadamard-seeded residual rotations for both levels."""

    def __init__(self, in_features: int, block_size: int):
        super().__init__()
        self.in_features = in_features
        self.block_size = block_size
        self.num_blocks = in_features // block_size

        inter_base = get_orthogonal_init(self.num_blocks)
        intra_base = get_orthogonal_init(block_size)

        self.inter_rotation = ResidualCayleyRotation(self.num_blocks, inter_base)
        self.intra_rotation = ResidualCayleyRotation(block_size, intra_base)

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


def compute_initial_mse(samples, weight, in_features, block_size, device):
    """Compute MSE with Hadamard rotation but no residual learning (baseline for this iter)."""
    num_blocks = in_features // block_size
    s = samples.to(device).float()
    w = weight.to(device).float()

    module = HadamardResidualModule(in_features, block_size).to(device)
    R_inter = module.get_inter_matrix()
    R_intra = module.get_intra_matrix()

    ref_output = F.linear(s, w)

    blocks = s.reshape(-1, num_blocks, block_size)
    blocks = torch.einsum('nbk,cb->nck', blocks, R_inter)
    blocks = blocks @ R_intra
    rotated_act = blocks.reshape(-1, in_features)

    quantized_act, _ = quantize_mxfp4(rotated_act, block_size)

    w_blocks = w.reshape(w.shape[0], num_blocks, block_size)
    w_blocks = torch.einsum('nbk,cb->nck', w_blocks, R_inter)
    w_blocks = w_blocks @ R_intra
    fused_weight = w_blocks.reshape_as(w)
    fused_weight, _ = quantize_mxfp4(fused_weight, block_size)

    quant_output = F.linear(quantized_act, fused_weight)
    return F.mse_loss(quant_output, ref_output).item()


def train_layer_hadamard_residual(
    activation_samples: torch.Tensor,
    weight: torch.Tensor,
    in_features: int,
    block_size: int = 32,
    lr: float = 5e-3,
    num_steps: int = 400,
    device: str = "cuda",
) -> tuple[HadamardResidualModule, dict]:
    """Train residual corrections on top of Hadamard initialization."""
    num_blocks = in_features // block_size
    samples = activation_samples.to(device).float()
    w = weight.to(device).float()

    module = HadamardResidualModule(in_features, block_size).to(device)

    ref_output = F.linear(samples, w)

    optimizer = torch.optim.Adam(module.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=num_steps)

    initial_mse = None
    final_mse = None

    for step in range(num_steps):
        optimizer.zero_grad()

        R_inter = module.get_inter_matrix()
        R_intra = module.get_intra_matrix()

        blocks = samples.reshape(-1, num_blocks, block_size)
        blocks = torch.einsum('nbk,cb->nck', blocks, R_inter)
        blocks = blocks @ R_intra
        rotated_act = blocks.reshape(-1, in_features)

        quantized_act = ste_quantize_mxfp4(rotated_act, block_size)

        w_blocks = w.reshape(w.shape[0], num_blocks, block_size)
        w_blocks = torch.einsum('nbk,cb->nck', w_blocks, R_inter)
        w_blocks = w_blocks @ R_intra
        fused_weight = w_blocks.reshape_as(w)
        fused_weight = ste_quantize_mxfp4(fused_weight, block_size)

        quant_output = F.linear(quantized_act, fused_weight)
        mse_loss = F.mse_loss(quant_output, ref_output)

        if initial_mse is None:
            initial_mse = mse_loss.item()

        mse_loss.backward()
        optimizer.step()
        scheduler.step()
        final_mse = mse_loss.item()

    return module, {"initial_mse": initial_mse, "final_mse": final_mse}


class TORQQuantizedLinearV3(nn.Module):
    """Quantized linear compatible with HadamardResidualModule."""

    def __init__(self, linear: nn.Linear, rotation_module: HadamardResidualModule,
                 block_size: int = 32, quantize_weights: bool = True):
        super().__init__()
        self.in_features = linear.in_features
        self.out_features = linear.out_features
        self.block_size = block_size
        self.num_blocks = self.in_features // block_size

        with torch.no_grad():
            R_inter = rotation_module.get_inter_matrix().detach()
            R_intra = rotation_module.get_intra_matrix().detach()

        self.register_buffer("R_inter", R_inter)
        self.register_buffer("R_intra", R_intra)

        with torch.no_grad():
            device = linear.weight.device
            w = linear.weight.float()
            r_inter = R_inter.to(device).float()
            r_intra = R_intra.to(device).float()
            blocks = w.reshape(w.shape[0], self.num_blocks, self.block_size)
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

        blocks = flat.reshape(-1, self.num_blocks, self.block_size)
        blocks = torch.einsum('nbk,cb->nck', blocks, self.R_inter.float())
        blocks = blocks @ self.R_intra.float()
        rotated = blocks.reshape(-1, self.in_features)

        quantized_act, _ = quantize_mxfp4(rotated, self.block_size)
        out = F.linear(quantized_act.to(self.weight.dtype), self.weight, self.bias)
        return out.reshape(*orig_shape[:-1], self.out_features)


def apply_torq_v3(model, rotation_modules, block_size=32, quantize_weights=True):
    for name, rot_module in rotation_modules.items():
        parts = name.split(".")
        parent = model
        for part in parts[:-1]:
            parent = getattr(parent, part)
        linear = getattr(parent, parts[-1])
        quantized = TORQQuantizedLinearV3(linear, rot_module, block_size, quantize_weights)
        setattr(parent, parts[-1], quantized)
    return model


def run_experiment(args):
    print(f"{'='*60}")
    print(f"TORQ Iteration 3 - Hadamard-Seeded Residual Rotation")
    print(f"Model: {args.model_path}")
    print(f"LR: {args.lr}, Steps: {args.num_steps}")
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

    print("\n[3/4] Training TORQ rotations (Hadamard + Residual)...")
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

    # First pass: compute initial MSE for layer-adaptive LR
    initial_mses = {}
    for name, linear in target_linears.items():
        if name not in activations:
            continue
        mse = compute_initial_mse(
            activations[name], linear.weight.detach(),
            linear.in_features, args.block_size, args.device,
        )
        initial_mses[name] = mse

    median_mse = sorted(initial_mses.values())[len(initial_mses) // 2] if initial_mses else 1.0

    for i, (name, linear) in enumerate(target_linears.items()):
        if name not in activations:
            continue

        # Layer-adaptive LR: scale up for layers with higher initial MSE
        layer_mse = initial_mses.get(name, median_mse)
        lr_scale = max(0.5, min(3.0, (layer_mse / max(median_mse, 1e-10)) ** 0.5))
        layer_lr = args.lr * lr_scale

        module, metrics = train_layer_hadamard_residual(
            activations[name], linear.weight.detach(),
            in_features=linear.in_features,
            block_size=args.block_size,
            lr=layer_lr, num_steps=args.num_steps,
            device=args.device,
        )
        rotation_modules[name] = module

        if (i + 1) % 28 == 0 or i == 0 or i == len(target_linears) - 1:
            reduction = (1 - metrics['final_mse'] / max(metrics['initial_mse'], 1e-10)) * 100
            print(f"  [{i+1}/{len(target_linears)}] {name}: "
                  f"MSE {metrics['initial_mse']:.4e} -> {metrics['final_mse']:.4e} "
                  f"({reduction:.1f}% reduction, lr_scale={lr_scale:.2f})")

    train_time = time.time() - train_start
    print(f"  Training completed in {train_time:.1f}s")

    print("\n[4/4] Evaluating TORQ W4A4 perplexity...")
    del model
    torch.cuda.empty_cache()

    torq_model = AutoModelForCausalLM.from_pretrained(
        args.model_path, torch_dtype=torch.bfloat16, trust_remote_code=True,
    ).to(args.device)
    torq_model.eval()

    apply_torq_v3(torq_model, rotation_modules, block_size=args.block_size, quantize_weights=True)

    torq_ppl = evaluate_perplexity(torq_model, test_data, device=args.device)
    print(f"  TORQ W4A4 PPL: {torq_ppl:.2f}")

    print(f"\n{'='*60}")
    print(f"RESULTS SUMMARY (Iteration 3 - Hadamard Residual)")
    print(f"{'='*60}")
    print(f"  BF16 Baseline PPL:  {baseline_ppl:.2f}")
    print(f"  TORQ W4A4 PPL:      {torq_ppl:.2f}")
    print(f"  Gap to BF16:         {torq_ppl - baseline_ppl:.2f}")
    print(f"  Training time:       {train_time:.1f}s")
    print(f"{'='*60}")

    results = {
        "iteration": 3,
        "method": "Hadamard-Seeded Residual Rotation + Layer-Adaptive LR",
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
    with open(output_dir / "results_iter3.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {output_dir / 'results_iter3.json'}")

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
    parser.add_argument("--num-steps", type=int, default=400)
    args = parser.parse_args()
    run_experiment(args)


if __name__ == "__main__":
    main()
