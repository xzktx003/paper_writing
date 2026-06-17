"""
AdaCode: Distribution-Adaptive Codebook Learning for LLM Weight Quantization

Core method: Dynamic Codebook (B1) — activation-conditioned quantization
Theory: PAC-Bayes optimal codebook modulation via activation sparsity
"""

from .codebook import AdaCodebook, compute_optimal_codebook
from .quantizer import (
    AdaCodeQuantizer,
    RiskAwareCodebookRouter,
    quantize_model_weights,
    compute_layer_betas,
)
from .method2_actadacode import (
    ActAdaCodeConfig,
    collect_activation_second_moments,
    train_actadacode_layer,
    quantize_model_method2,
)
from .ggd import estimate_ggd_params, ggd_pdf, ggd_cdf

# RobustCode
from .robustcode import (
    RobustCodeQuantizer,
    compute_dro_beta,
    compute_auto_epsilon,
    beta_uncertainty,
    dro_gamma_from_epsilon,
    quantize_model_robustcode,
)

# B1: Dynamic Codebook (Activation-Conditioned Quantization)
from .dynamic_codebook import (
    DynamicCodebookMixer,
    ActivationStatisticsCollector,
    CodebookConfig,
)

__version__ = "0.4.0"
