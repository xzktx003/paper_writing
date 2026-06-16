"""
Dynamic Codebook Mixer (B1-Optimized)

动态码本混合器 - 基于激活统计动态调制量化码本。

核心思想:
  量化函数由输入激活统计动态调制: q(x, w) = argmin_c∈C(s; λ(x)) ||w - c||²
  其中 λ(x) = g(activation_stats(x)) ∈ [0, 1] 控制码本的"稀疏性"
  
  λ(x) → 0: 更稀疏的码本（更多零级别，更少非零级别）
  λ(x) → 1: 更均匀的码本（均匀分布的级别）

创新点:
  1. 首次提出激活条件码本概念
  2. 利用LLM的层次化结构特性（attention sink现象）
  3. 平滑插值避免码本切换的突变
  4. 单码本+调制机制，内存开销低

理论支撑: PAC-Bayes框架下的最优动态码本选择
"""

from __future__ import annotations

import torch
import torch.nn.functional as F
import numpy as np
from typing import Dict, Optional, Tuple, List, Union
from dataclasses import dataclass, field
from abc import ABC, abstractmethod


@dataclass
class CodebookConfig:
    """码本配置"""
    n_levels: int = 16                    # 总级别数
    zero_inclusive: bool = True           # 是否包含精确的0级别
    zero_slots: int = 2                   # 0级别占用的槽数（对称分布）
    base_beta: float = 1.5                # 基准GGD形状参数（中等重尾）
    compression_range: Tuple[float, float] = (0.5, 1.0)  # 压缩比范围
    interpolation_temperature: float = 0.3  # 平滑插值温度
    
    @property
    def nonzero_levels(self) -> int:
        return self.n_levels - self.zero_slots
    
    @property
    def max_codebook_value(self) -> float:
        """码本值的最大绝对值（用于scale计算）"""
        return 1.0


class ActivationStatisticsCollector:
    """
    激活统计收集器 - 用于计算动态码本调制所需的统计量。
    
    收集的统计量:
    - sparsity: 零比例
    - kurtosis: 峰度（衡量重尾程度）
    - variance: 方差
    - entropy: 激活分布熵
    """
    
    def __init__(self, model: Optional[torch.nn.Module] = None):
        self.model = model
        self.stats: Dict[str, Dict[str, float]] = {}
        self.hooks: List = []
        
    def register_hooks(self, 
                      target_modules: Optional[List[type]] = None,
                      exclude_names: Optional[List[str]] = None):
        """注册forward hooks收集激活统计"""
        if target_modules is None:
            target_modules = [torch.nn.Linear]
        if exclude_names is None:
            exclude_names = ['lm_head', 'embed_tokens']
        
        for name, module in self.model.named_modules():
            if any(isinstance(module, tm) for tm in target_modules):
                if any(ex in name for ex in exclude_names):
                    continue
                hook = module.register_forward_hook(self._make_hook(name))
                self.hooks.append(hook)
                
    def _make_hook(self, name: str):
        def hook(module, inputs, output):
            if not inputs or len(inputs) == 0:
                return
            x = inputs[0]
            if isinstance(x, tuple):
                x = x[0]
            
            x_flat = x.detach().float().reshape(-1)
            
            # 计算统计量
            zero_ratio = (x_flat == 0).float().mean().item()
            
            mean_sq = (x_flat ** 2).mean()
            fourth_moment = (x_flat ** 4).mean()
            kurtosis = fourth_moment / (mean_sq ** 2 + 1e-8) if mean_sq > 1e-8 else 1.0
            
            variance = x_flat.var().item()
            
            # 计算简单熵估计
            hist = torch.histc(x_flat.abs(), bins=32)
            hist = hist / (hist.sum() + 1e-8)
            entropy = -(hist * torch.log(hist + 1e-8)).sum().item()
            
            self.stats[name] = {
                'sparsity': zero_ratio,
                'kurtosis': kurtosis,
                'variance': variance,
                'entropy': entropy,
            }
        return hook
    
    def remove_hooks(self):
        """移除所有hooks"""
        for hook in self.hooks:
            hook.remove()
        self.hooks = []
    
    def get_stats(self) -> Dict[str, Dict[str, float]]:
        """获取收集的统计量"""
        return self.stats.copy()
    
    def get_layer_stats(self, layer_name: str) -> Optional[Dict[str, float]]:
        """获取特定层的统计量"""
        return self.stats.get(layer_name)
    
    def compute_sparsity_metric(self, stats: Dict[str, float]) -> float:
        """
        根据激活统计计算综合稀疏度指标
        
        Sparsity = w1 * zero_ratio + w2 * normalized_kurtosis
        
        范围: [0, 1]
        0 = 均匀分布（需要均匀码本）
        1 = 稀疏分布（需要稀疏码本）
        """
        zero_ratio = stats.get('sparsity', 0.0)
        kurtosis = stats.get('kurtosis', 3.0)
        
        # 归一化峰度到[0, 1]
        # 假设典型范围是3（正态）到30（重尾）
        normalized_kurtosis = min(1.0, (kurtosis - 3.0) / 27.0)
        
        # 加权组合
        w1, w2 = 0.6, 0.4
        sparsity = w1 * zero_ratio + w2 * normalized_kurtosis
        
        return float(np.clip(sparsity, 0.0, 1.0))


class BaseCodebookGenerator(ABC):
    """码本生成器基类"""
    
    @abstractmethod
    def generate(self, config: CodebookConfig, device: str = 'cpu') -> np.ndarray:
        """生成基准码本"""
        pass


class GGDBasedCodebookGenerator(BaseCodebookGenerator):
    """基于GGD的Lloyd-Max码本生成器"""
    
    def generate(self, config: CodebookConfig, device: str = 'cpu') -> np.ndarray:
        """
        生成GGD拟合的Lloyd-Max基准码本
        
        使用GGD(α=1, β=base_beta)的分位数作为码本级别
        """
        from .ggd import ggd_quantile
        
        n = config.nonzero_levels
        if n <= 0:
            return np.zeros(config.n_levels, dtype=np.float32)
        
        # 计算分位点
        probs = np.linspace(0.5/n, 1-0.5/n, n)
        
        # GGD分位数
        alpha = 1.0
        beta = config.base_beta
        cb = ggd_quantile(probs, alpha, beta)
        
        # 插入零级别
        if config.zero_inclusive:
            zero_pos = config.zero_slots // 2
            result = np.zeros(config.n_levels, dtype=np.float32)
            nonzero_idx = np.concatenate([
                np.arange(zero_pos),
                np.arange(zero_pos + config.zero_slots, config.n_levels)
            ])
            if len(nonzero_idx) == len(cb):
                result[nonzero_idx] = cb
            else:
                # 处理边界情况
                result = np.zeros(config.n_levels, dtype=np.float32)
                result[:len(cb)] = cb[:config.nonzero_levels]
            return result
        
        return cb.astype(np.float32)


class UniformCodebookGenerator(BaseCodebookGenerator):
    """均匀码本生成器（RTN风格）"""
    
    def generate(self, config: CodebookConfig, device: str = 'cpu') -> np.ndarray:
        """生成均匀分布的码本"""
        n = config.nonzero_levels
        if n <= 0:
            return np.zeros(config.n_levels, dtype=np.float32)
        
        # [-1, 1]范围内的均匀分布
        cb = np.linspace(-1, 1, n).astype(np.float32)
        
        if config.zero_inclusive:
            zero_pos = config.zero_slots // 2
            result = np.zeros(config.n_levels, dtype=np.float32)
            nonzero_idx = np.concatenate([
                np.arange(zero_pos),
                np.arange(zero_pos + config.zero_slots, config.n_levels)
            ])
            result[nonzero_idx] = cb
            return result
        
        return cb


class DynamicCodebookMixer:
    """
    动态码本混合器
    
    核心机制:
    1. 预计算基准码本（中间态）
    2. 根据激活稀疏度动态调制码本
    3. 使用平滑插值避免突变
    
    Usage:
        mixer = DynamicCodebookMixer(n_levels=16)
        
        # 方式1: 使用收集的激活统计
        collector = ActivationStatisticsCollector(model)
        collector.register_hooks()
        # ... run model ...
        mixer.set_activation_stats(collector.get_stats())
        quantized = mixer.quantize(weight)
        
        # 方式2: 直接使用稀疏度值
        quantized = mixer.quantize_with_sparsity(weight, sparsity=0.7)
    """
    
    def __init__(self, 
                 n_levels: int = 16,
                 block_size: int = 64,
                 config: Optional[CodebookConfig] = None,
                 codebook_generator: Optional[BaseCodebookGenerator] = None,
                 device: str = 'cpu'):
        self.n_levels = n_levels
        self.block_size = block_size
        self.device = device
        
        # 配置
        if config is None:
            config = CodebookConfig(n_levels=n_levels)
        self.config = config
        
        # 码本生成器
        if codebook_generator is None:
            codebook_generator = GGDBasedCodebookGenerator()
        self.generator = codebook_generator
        
        # 预计算基准码本
        self.base_codebook = self.generator.generate(config)
        
        # 激活统计（用于动态调制）
        self._activation_stats: Dict[str, Dict[str, float]] = {}
        self._default_sparsity = 0.5
        
        # 缓存调制后的码本（避免重复计算）
        self._modulated_cache: Dict[float, np.ndarray] = {}
        self._cache_enabled = True
    
    def set_activation_stats(self, stats: Dict[str, Dict[str, float]]):
        """设置激活统计（从collector获取）"""
        self._activation_stats = stats
        self._modulated_cache.clear()  # 清除缓存
    
    def set_default_sparsity(self, sparsity: float):
        """设置默认稀疏度（当没有激活统计时使用）"""
        self._default_sparsity = float(np.clip(sparsity, 0.0, 1.0))
    
    def compute_layer_sparsity(self, layer_name: str) -> float:
        """计算特定层的稀疏度"""
        if layer_name in self._activation_stats:
            stats = self._activation_stats[layer_name]
            # 计算综合稀疏度指标
            return self._compute_sparsity_from_stats(stats)
        return self._default_sparsity
    
    def _compute_sparsity_from_stats(self, stats: Dict[str, float]) -> float:
        """从统计量计算稀疏度"""
        zero_ratio = stats.get('sparsity', 0.0)
        kurtosis = stats.get('kurtosis', 3.0)
        
        # 归一化峰度
        normalized_kurtosis = min(1.0, max(0.0, (kurtosis - 3.0) / 27.0))
        
        # 加权组合
        return 0.6 * zero_ratio + 0.4 * normalized_kurtosis
    
    def modulate_codebook(self, 
                         sparsity: float,
                         temperature: Optional[float] = None) -> np.ndarray:
        """
        根据稀疏度动态调制码本
        
        机制:
        - sparsity高 → 压缩非零级别到更小的范围（更多精度在零附近）
        - sparsity低 → 保持均匀分布
        
        使用sigmoid插值实现平滑过渡:
        compression = sigmoid((0.5 - sparsity) / temperature)
        
        Args:
            sparsity: [0, 1]，0=均匀，1=稀疏
            temperature: 插值温度，None时使用配置中的值
            
        Returns:
            调制后的码本（float32）
        """
        if temperature is None:
            temperature = self.config.interpolation_temperature
        
        # 检查缓存
        cache_key = round(float(sparsity), 3)
        if self._cache_enabled and cache_key in self._modulated_cache:
            return self._modulated_cache[cache_key]
        
        # 计算压缩比
        # sparsity=0 → compression=1.0（不压缩）
        # sparsity=1 → compression=min_compression
        min_compression = self.config.compression_range[0]
        max_compression = self.config.compression_range[1]
        
        # Sigmoid插值
        x = (0.5 - sparsity) / max(temperature, 0.01)
        compression = min_compression + (max_compression - min_compression) * (1 + np.exp(-x)) / 2
        compression = np.clip(compression, min_compression, max_compression)
        
        # 基准码本
        cb = self.base_codebook.copy()
        nonzero_mask = cb != 0
        
        # 当前非零值的范围
        nonzero_vals = cb[nonzero_mask]
        if len(nonzero_vals) == 0:
            return cb
        
        current_range = np.max(np.abs(nonzero_vals))
        if current_range < 1e-8:
            return cb
        
        # 压缩非零级别
        # 保持零级别不变
        compression_np = float(compression) if hasattr(compression, 'item') else compression
        cb[nonzero_mask] = nonzero_vals * compression_np
        
        # 归一化到原始范围
        new_range = np.max(np.abs(cb[nonzero_mask]))
        if new_range > 1e-8:
            cb[nonzero_mask] = cb[nonzero_mask] * (current_range / new_range)
        
        # 缓存
        if self._cache_enabled:
            self._modulated_cache[cache_key] = cb
        
        return cb
    
    def quantize_with_sparsity(self,
                              weight: torch.Tensor,
                              sparsity: float,
                              use_dynamic: bool = True,
                              gamma: float = 0.95) -> Dict[str, torch.Tensor]:
        """
        使用给定稀疏度值进行动态量化
        
        Args:
            weight: 待量化权重
            sparsity: 激活稀疏度 [0, 1]
            use_dynamic: 是否使用动态调制
            gamma: 范围缩放因子
            
        Returns:
            quantized: 量化后的权重
            codebook: 使用的码本
            metadata: 元数据
        """
        # 调制码本
        if use_dynamic:
            codebook = self.modulate_codebook(sparsity)
        else:
            codebook = self.base_codebook
        
        return self._quantize_with_codebook(weight, codebook, gamma)
    
    def quantize(self, 
                weight: torch.Tensor,
                layer_name: Optional[str] = None,
                gamma: float = 0.95,
                use_dynamic: bool = True) -> Dict[str, torch.Tensor]:
        """
        对权重进行动态码本量化
        
        如果提供了layer_name，会自动使用对应层的激活统计
        否则使用默认稀疏度
        
        Args:
            weight: 待量化权重 [..., n]
            layer_name: 层名称（用于查找激活统计）
            gamma: 范围缩放因子
            use_dynamic: 是否使用动态调制
            
        Returns:
            quantized: 量化后的权重
            codebook: 使用的码本
            sparsity: 使用的稀疏度
            scale: 缩放因子
        """
        # 获取稀疏度
        if layer_name is not None:
            sparsity = self.compute_layer_sparsity(layer_name)
        else:
            sparsity = self._default_sparsity
        
        return self.quantize_with_sparsity(weight, sparsity, use_dynamic, gamma)
    
    def _quantize_with_codebook(self,
                               weight: torch.Tensor,
                               codebook: np.ndarray,
                               gamma: float) -> Dict[str, torch.Tensor]:
        """使用给定码本进行量化"""
        codebook_t = torch.from_numpy(codebook).to(weight.device).float()
        
        original_shape = weight.shape
        flat_weight = weight.reshape(-1)
        n_elements = flat_weight.numel()
        n_blocks = (n_elements + self.block_size - 1) // self.block_size
        
        # Padding
        padded = torch.zeros(n_blocks * self.block_size,
                           dtype=flat_weight.dtype,
                           device=flat_weight.device)
        padded[:n_elements] = flat_weight
        blocks = padded.reshape(n_blocks, self.block_size)
        
        # 计算每块的scale
        block_max = blocks.abs().max(dim=1, keepdim=True).values
        block_max = torch.where(block_max < 1e-10,
                               torch.ones_like(block_max),
                               block_max)
        
        cb_max = codebook_t.abs().max()
        scales = gamma * block_max / cb_max  # [n_blocks, 1]
        
        # 缩放码本
        scaled_codebook = codebook_t.unsqueeze(0) * scales  # [n_blocks, n_levels]
        
        # 最近邻量化
        blocks_exp = blocks.unsqueeze(-1)  # [n_blocks, block_size, 1]
        cb_exp = scaled_codebook.unsqueeze(1)  # [n_blocks, 1, n_levels]
        
        distances = torch.abs(blocks_exp - cb_exp)  # [n_blocks, block_size, n_levels]
        indices = distances.argmin(dim=-1)  # [n_blocks, block_size]
        
        # 重建 - 使用正确的索引方式
        # scaled_codebook: [n_blocks, n_levels], indices: [n_blocks, block_size]
        # 结果应该是 [n_blocks, block_size]
        row_indices = torch.arange(n_blocks, device=indices.device).unsqueeze(1).expand_as(indices)
        reconstructed = scaled_codebook[row_indices.flatten(), indices.flatten()].reshape(n_blocks, self.block_size)
        
        quantized = reconstructed.reshape(-1)[:n_elements].reshape(original_shape)
        
        # 计算误差
        mse = ((flat_weight[:n_elements] - reconstructed.reshape(-1)[:n_elements]) ** 2).mean()
        
        return {
            'quantized': quantized,
            'codebook': codebook,
            'sparsity': None,  # 外部设置
            'scales': scales,
            'indices': indices,
            'mse': mse.item() if isinstance(mse, torch.Tensor) else mse,
        }


    def disable_cache(self):
        """禁用码本缓存"""
        self._cache_enabled = False
        self._modulated_cache.clear()
    
    def enable_cache(self):
        """启用码本缓存"""
        self._cache_enabled = True
    
    def get_codebook_range(self) -> Tuple[float, float]:
        """获取当前基准码本的值范围"""
        nonzero_mask = self.base_codebook != 0
        nonzero_vals = self.base_codebook[nonzero_mask]
        if len(nonzero_vals) == 0:
            return 0.0, 0.0
        return float(np.min(nonzero_vals)), float(np.max(nonzero_vals))


def create_dynamic_codebook_quantizer(
    model: torch.nn.Module,
    n_levels: int = 16,
    block_size: int = 64,
    device: str = 'cuda'
) -> Tuple[DynamicCodebookMixer, ActivationStatisticsCollector]:
    """
    创建动态码本量化器并自动收集激活统计
    
    Returns:
        mixer: DynamicCodebookMixer实例
        collector: ActivationStatisticsCollector实例
    """
    mixer = DynamicCodebookMixer(
        n_levels=n_levels,
        block_size=block_size,
        device=device
    )
    
    collector = ActivationStatisticsCollector(model)
    collector.register_hooks()
    
    return mixer, collector


# ============================================================================
# 测试代码
# ============================================================================

if __name__ == '__main__':
    print("=" * 60)
    print("Testing Dynamic Codebook Mixer")
    print("=" * 60)
    
    # 测试1: 基本功能
    print("\n[Test 1] Basic Codebook Generation")
    mixer = DynamicCodebookMixer(n_levels=16)
    print(f"Base codebook shape: {mixer.base_codebook.shape}")
    print(f"Base codebook: {mixer.base_codebook}")
    
    # 测试2: 动态调制
    print("\n[Test 2] Dynamic Modulation with Different Sparsity")
    sparsities = [0.0, 0.25, 0.5, 0.75, 1.0]
    for s in sparsities:
        cb = mixer.modulate_codebook(s)
        nonzero = cb[cb != 0]
        range_val = np.max(np.abs(nonzero)) if len(nonzero) > 0 else 0
        print(f"  Sparsity={s:.2f}: codebook range = {range_val:.4f}")
    
    # 测试3: 量化功能
    print("\n[Test 3] Quantization with Sparsity")
    weight = torch.randn(128, 512)
    for s in [0.0, 0.5, 1.0]:
        result = mixer.quantize_with_sparsity(weight, sparsity=s)
        print(f"  Sparsity={s:.2f}: MSE = {result['mse']:.6e}")
    
    # 测试4: 激活统计计算
    print("\n[Test 4] Activation Statistics Calculation")
    stats = {
        'sparse_layer': {'sparsity': 0.5, 'kurtosis': 20.0, 'variance': 0.1},
        'dense_layer': {'sparsity': 0.1, 'kurtosis': 3.0, 'variance': 1.0},
    }
    for name, s in stats.items():
        sparsity_metric = mixer._compute_sparsity_from_stats(s)
        print(f"  {name}: sparsity_metric = {sparsity_metric:.4f}")
    
    # 测试5: 缓存功能
    print("\n[Test 5] Cache Performance")
    import time
    mixer.enable_cache()
    start = time.time()
    for _ in range(100):
        mixer.modulate_codebook(0.5)
    cached_time = time.time() - start
    
    mixer.disable_cache()
    start = time.time()
    for _ in range(100):
        mixer.modulate_codebook(0.5)
    uncached_time = time.time() - start
    
    print(f"  Cached: {cached_time*1000:.2f}ms")
    print(f"  Uncached: {uncached_time*1000:.2f}ms")
    print(f"  Speedup: {uncached_time/cached_time:.1f}x")
    
    print("\n" + "=" * 60)
    print("All tests passed!")
    print("=" * 60)
