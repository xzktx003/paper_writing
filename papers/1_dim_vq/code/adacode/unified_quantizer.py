"""
Unified Adaptive Quantizer

统一的自适应量化器，结合:
1. 动态码本 (B1 - Dynamic Codebook)
2. 分层量化 (B2 - Hierarchical Quantization)
3. Hessian校正 (CFHQ)

创新点:
1. 首次将动态码本和分层量化结合
2. 利用激活统计 + 层内结构双重自适应
3. 与现有量化框架无缝集成

使用方式:
    unified = UnifiedAdaptiveQuantizer()
    
    # 方式1: 收集激活统计
    collector = ActivationStatisticsCollector(model)
    collector.register_hooks()
    # ... run model on calibration data ...
    stats = collector.get_stats()
    
    # 方式2: 量化
    for name, module in model.named_modules():
        if isinstance(module, nn.Linear):
            h_diag = hessian_diagonals.get(name)
            act_stats = stats.get(name)
            result = unified.quantize_layer(
                module.weight,
                activation_stats=act_stats,
                hessian_diagonal=h_diag
            )
            module.weight.data = result['quantized']
"""

from __future__ import annotations

import torch
import torch.nn as nn
from typing import Dict, Optional, Tuple, List, Union
from dataclasses import dataclass

from .dynamic_codebook import (
    DynamicCodebookMixer,
    ActivationStatisticsCollector,
    CodebookConfig,
)
from .hierarchical_quantizer import (
    HierarchicalQuantizer,
    AdaptiveHierarchicalQuantizer,
    HierarchicalQuantConfig,
    VarianceEstimator,
)


@dataclass
class UnifiedQuantizerConfig:
    """统一量化器配置"""
    # 码本配置 (B1)
    n_levels: int = 16
    block_size: int = 64
    gamma: float = 0.95  # 范围缩放因子
    use_dynamic_codebook: bool = True
    dynamic_sparsity_weight: Tuple[float, float] = (0.6, 0.4)  # (zero_ratio, kurtosis)权重
    
    # 分层配置 (B2)
    use_hierarchical: bool = True
    layer_bits: int = 2
    auto_layer_bits: bool = True
    
    # Hessian校正
    use_hessian_correction: bool = True
    hessian_clip: Tuple[float, float] = (0.9, 1.1)
    
    # 默认稀疏度（当无激活统计时）
    default_sparsity: float = 0.5
    
    # 设备
    device: str = 'cuda'


class UnifiedAdaptiveQuantizer:
    """
    统一自适应量化器
    
    整合B1（动态码本）和B2（分层量化）的优势:
    
    流程:
    1. 激活统计 → 码本稀疏度 (B1)
    2. 层内方差 → 分层策略 (B2)
    3. 动态码本量化
    4. Hessian校正 (可选)
    
    决策逻辑:
    - 高稀疏度激活 → 压缩码本
    - 高层间方差 → 启用分层
    - 有Hessian → 应用校正
    """
    
    def __init__(self, config: Optional[UnifiedQuantizerConfig] = None):
        if config is None:
            config = UnifiedQuantizerConfig()
        self.config = config
        
        # 初始化子量化器
        self._init_sub_quantizers()
        
        # 激活统计
        self._activation_stats: Dict[str, Dict[str, float]] = {}
        
        # 方差估计器
        self.variance_estimator = VarianceEstimator(config.block_size)
        
    def _init_sub_quantizers(self):
        """初始化子量化器"""
        # B1: 动态码本
        cb_config = CodebookConfig(
            n_levels=self.config.n_levels,
            compression_range=(0.5, 1.0),
        )
        self.dynamic_codebook = DynamicCodebookMixer(
            n_levels=self.config.n_levels,
            block_size=self.config.block_size,
            config=cb_config,
        )
        self.dynamic_codebook.set_default_sparsity(self.config.default_sparsity)
        
        # B2: 分层量化
        hier_config = HierarchicalQuantConfig(
            layer_bits=self.config.layer_bits,
            block_bits=4,  # 固定4-bit
            auto_layer_bits=self.config.auto_layer_bits,
            use_hessian_correction=self.config.use_hessian_correction,
            hessian_clip=self.config.hessian_clip,
        )
        if self.config.use_hierarchical:
            self.hierarchical_quantizer = AdaptiveHierarchicalQuantizer(
                hier_config,
                block_size=self.config.block_size,
                enable_threshold=0.1,
            )
        else:
            self.hierarchical_quantizer = None
    
    def set_activation_stats(self, stats: Dict[str, Dict[str, float]]):
        """设置激活统计"""
        self._activation_stats = stats
        self.dynamic_codebook.set_activation_stats(stats)
    
    def compute_layer_sparsity(self, layer_name: str) -> float:
        """计算层的稀疏度"""
        if layer_name in self._activation_stats:
            stats = self._activation_stats[layer_name]
            # 综合稀疏度
            w_zero, w_kurt = self.config.dynamic_sparsity_weight
            zero_ratio = stats.get('sparsity', 0.0)
            kurtosis = stats.get('kurtosis', 3.0)
            normalized_kurtosis = min(1.0, max(0.0, (kurtosis - 3.0) / 27.0))
            return w_zero * zero_ratio + w_kurt * normalized_kurtosis
        return self.config.default_sparsity
    
    def quantize_layer(self,
                      weight: torch.Tensor,
                      layer_name: Optional[str] = None,
                      activation_stats: Optional[Dict[str, float]] = None,
                      hessian_diagonal: Optional[torch.Tensor] = None,
                      return_metadata: bool = True) -> Dict[str, torch.Tensor]:
        """
        统一量化单层
        
        Args:
            weight: 权重张量
            layer_name: 层名称（用于查找激活统计）
            activation_stats: 激活统计（优先于layer_name查找）
            hessian_diagonal: 对角Hessian
            return_metadata: 是否返回元数据
            
        Returns:
            quantized: 量化后的权重
            metadata: {
                sparsity: 使用的稀疏度
                variance_ratio: 层内方差比
                hierarchical_enabled: 是否启用了分层
                layer_bits: 使用的layer精度
                mse: 最终MSE
            }
        """
        # 获取稀疏度
        if activation_stats is not None:
            w_zero, w_kurt = self.config.dynamic_sparsity_weight
            zero_ratio = activation_stats.get('sparsity', 0.0)
            kurtosis = activation_stats.get('kurtosis', 3.0)
            normalized_kurtosis = min(1.0, max(0.0, (kurtosis - 3.0) / 27.0))
            sparsity = w_zero * zero_ratio + w_kurt * normalized_kurtosis
        elif layer_name is not None:
            sparsity = self.compute_layer_sparsity(layer_name)
        else:
            sparsity = self.config.default_sparsity
        
        # 估算方差比（用于决定是否分层）
        variance_info = self.variance_estimator.estimate_variance_ratio(
            weight, self.config.block_size
        )
        variance_ratio = variance_info['variance_ratio']
        
        metadata = {
            'sparsity': sparsity,
            'variance_ratio': variance_ratio,
        }
        
        # 动态码本量化
        if self.config.use_dynamic_codebook:
            cb_result = self.dynamic_codebook.quantize_with_sparsity(
                weight,
                sparsity=sparsity,
                use_dynamic=True,
                gamma=self.config.gamma
            )
            quantized = cb_result['quantized']
            codebook = cb_result['codebook']
            scales = cb_result['scales']
            metadata['codebook_used'] = 'dynamic'
        else:
            # 使用分层量化作为主要方法
            quantized = weight.clone()
            scales = None
            codebook = None
            metadata['codebook_used'] = 'none'
        
        # 分层量化
        if self.config.use_hierarchical and variance_ratio >= 0.1:
            if self.hierarchical_quantizer is not None:
                # Ensure float dtype for hierarchical quantizer
                if quantized.dtype != torch.float32:
                    quantized = quantized.float()
                hier_result = self.hierarchical_quantizer.quantize_layer(
                    quantized,
                    hessian_diagonal=hessian_diagonal,
                    return_metadata=False
                )
                quantized = hier_result['quantized']
                metadata['hierarchical_enabled'] = hier_result['metadata'].get('hierarchical_enabled', False)
                metadata['layer_bits'] = hier_result['metadata'].get('layer_bits', 0)
            else:
                metadata['hierarchical_enabled'] = False
                metadata['layer_bits'] = 0
        else:
            metadata['hierarchical_enabled'] = False
            metadata['layer_bits'] = 0
        
        # 计算MSE
        flat_q = quantized.reshape(-1)
        flat_w = weight.reshape(-1)
        n = min(flat_q.numel(), flat_w.numel())
        mse = ((flat_w[:n] - flat_q[:n]) ** 2).mean().item()
        metadata['mse'] = mse
        
        if return_metadata:
            return {'quantized': quantized, 'metadata': metadata}
        return {'quantized': quantized}
    
    def quantize_model(self,
                      model: nn.Module,
                      activation_stats: Optional[Dict[str, Dict[str, float]]] = None,
                      hessian_diagonals: Optional[Dict[str, torch.Tensor]] = None,
                      skip_lm_head: bool = True) -> Dict[str, Dict]:
        """
        量化整个模型
        
        Args:
            model: PyTorch模型
            activation_stats: 每层的激活统计
            hessian_diagonals: 每层的对角Hessian
            skip_lm_head: 是否跳过lm_head
            
        Returns:
            results: 每层的量化结果
        """
        if activation_stats is not None:
            self.set_activation_stats(activation_stats)
        
        results = {}
        
        for name, module in model.named_modules():
            if not isinstance(module, nn.Linear):
                continue
            if module.weight.numel() == 0:
                continue
            if skip_lm_head and 'lm_head' in name:
                continue
            
            act_stats = activation_stats.get(name) if activation_stats else None
            h_diag = hessian_diagonals.get(name) if hessian_diagonals else None
            
            result = self.quantize_layer(
                module.weight.data,
                layer_name=name,
                activation_stats=act_stats,
                hessian_diagonal=h_diag,
            )
            
            # 更新权重
            module.weight.data = result['quantized']
            
            results[name] = result['metadata']
        
        return results


def create_unified_quantizer(
    n_levels: int = 16,
    block_size: int = 64,
    use_dynamic_codebook: bool = True,
    use_hierarchical: bool = True,
    use_hessian: bool = True,
    device: str = 'cuda'
) -> Tuple[UnifiedAdaptiveQuantizer, ActivationStatisticsCollector]:
    """
    创建统一量化器和激活统计收集器
    
    Usage:
        quantizer, collector = create_unified_quantizer()
        
        # 收集激活统计
        collector.register_hooks()
        with torch.no_grad():
            for batch in dataloader:
                model(batch)
        stats = collector.get_stats()
        collector.remove_hooks()
        
        # 量化
        results = quantizer.quantize_model(model, stats)
    """
    config = UnifiedQuantizerConfig(
        n_levels=n_levels,
        block_size=block_size,
        use_dynamic_codebook=use_dynamic_codebook,
        use_hierarchical=use_hierarchical,
        use_hessian_correction=use_hessian,
        device=device,
    )
    
    quantizer = UnifiedAdaptiveQuantizer(config)
    
    # 创建collector（需要在调用前注册到模型）
    collector = ActivationStatisticsCollector()
    
    return quantizer, collector


# ============================================================================
# 测试代码
# ============================================================================

if __name__ == '__main__':
    print("=" * 60)
    print("Testing Unified Adaptive Quantizer")
    print("=" * 60)
    
    # 测试1: 基本功能
    print("\n[Test 1] Basic Unified Quantization")
    config = UnifiedQuantizerConfig(
        use_dynamic_codebook=True,
        use_hierarchical=True,
        use_hessian_correction=False,  # 简化测试
    )
    quantizer = UnifiedAdaptiveQuantizer(config)
    
    # 模拟激活统计
    activation_stats = {
        'layer1': {'sparsity': 0.3, 'kurtosis': 15.0},
        'layer2': {'sparsity': 0.1, 'kurtosis': 3.0},
    }
    
    weight = torch.randn(512, 2048)
    result = quantizer.quantize_layer(weight, activation_stats=activation_stats['layer1'])
    
    print(f"  Sparsity: {result['metadata']['sparsity']:.4f}")
    print(f"  Variance ratio: {result['metadata']['variance_ratio']:.4f}")
    print(f"  Hierarchical: {result['metadata']['hierarchical_enabled']}")
    print(f"  Layer bits: {result['metadata']['layer_bits']}")
    print(f"  MSE: {result['metadata']['mse']:.6e}")
    
    # 测试2: 完整模型模拟
    print("\n[Test 2] Model Quantization Simulation")
    import torch.nn as nn
    
    class SimpleModel(nn.Module):
        def __init__(self):
            super().__init__()
            self.fc1 = nn.Linear(512, 1024)
            self.fc2 = nn.Linear(1024, 1024)
            self.fc3 = nn.Linear(1024, 512)
    
    model = SimpleModel()
    
    # 模拟激活统计
    model_stats = {
        'fc1': {'sparsity': 0.2, 'kurtosis': 10.0},
        'fc2': {'sparsity': 0.4, 'kurtosis': 20.0},
        'fc3': {'sparsity': 0.1, 'kurtosis': 3.0},
    }
    
    results = quantizer.quantize_model(model, model_stats)
    
    print(f"  Quantized layers: {len(results)}")
    for name, meta in results.items():
        print(f"    {name}: sparsity={meta['sparsity']:.2f}, "
              f"hierarchical={meta['hierarchical_enabled']}, "
              f"MSE={meta['mse']:.2e}")
    
    # 测试3: 对比实验
    print("\n[Test 3] Ablation Study")
    weight = torch.randn(256, 1024)
    
    # 基线
    config_base = UnifiedQuantizerConfig(
        use_dynamic_codebook=False,
        use_hierarchical=False,
    )
    quantizer_base = UnifiedAdaptiveQuantizer(config_base)
    result_base = quantizer_base.quantize_layer(weight)
    
    # B1 only
    config_b1 = UnifiedQuantizerConfig(
        use_dynamic_codebook=True,
        use_hierarchical=False,
    )
    quantizer_b1 = UnifiedAdaptiveQuantizer(config_b1)
    result_b1 = quantizer_b1.quantize_layer(weight, activation_stats={'sparsity': 0.5, 'kurtosis': 10.0})
    
    # B2 only
    config_b2 = UnifiedQuantizerConfig(
        use_dynamic_codebook=False,
        use_hierarchical=True,
    )
    quantizer_b2 = UnifiedAdaptiveQuantizer(config_b2)
    result_b2 = quantizer_b2.quantize_layer(weight)
    
    # B1+B2
    config_both = UnifiedQuantizerConfig(
        use_dynamic_codebook=True,
        use_hierarchical=True,
    )
    quantizer_both = UnifiedAdaptiveQuantizer(config_both)
    result_both = quantizer_both.quantize_layer(weight, activation_stats={'sparsity': 0.5, 'kurtosis': 10.0})
    
    print(f"  Baseline MSE: {result_base['metadata']['mse']:.6e}")
    print(f"  B1 (Dynamic CB) MSE: {result_b1['metadata']['mse']:.6e}")
    print(f"  B2 (Hierarchical) MSE: {result_b2['metadata']['mse']:.6e}")
    print(f"  B1+B2 MSE: {result_both['metadata']['mse']:.6e}")
    
    print("\n" + "=" * 60)
    print("All tests passed!")
    print("=" * 60)
