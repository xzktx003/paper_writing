# Qwen3-8B Vector-GSQ 与 QTIP 同模型正式对比报告（2026-09-02 04:31 CST）

## 实验目的

在完全相同的 Qwen3-8B 基座、WikiText2 test `seqlength=2048` 和六项完整 0-shot
`lm_eval` 协议下，对比当前 Vector-GSQ checkpoint 与扩展到 Qwen3 的 QTIP 2-bit 流程，形成不依赖
跨模型公开数字的直接证据。

## 实验原理

Vector-GSQ 使用已有完整 36 层 logical checkpoint fresh reconstruction。QTIP 路径复用官方 bitshift
codebook、随机符号、正交 incoherence transform、Hessian-aware trellis LDLQ 和每个 Linear 五轮层内
fine-tuning，覆盖每层 q/k/v/o/up/gate/down 七个投影。该 Qwen3 端点完成官方 layerwise QTIP 核心，
但没有加入 LLaMA 流程中的 full-model e2e fine-tuning，因此明确标记为 QTIP-Qwen3 layerwise 适配，
不冒充官方发布 checkpoint。

## 实验步骤

1. 复用固定 RP1T token cache，构造 8192×4096 Hessian 样本和 384×4096 层内微调样本。
2. 在本地单张 A100 80GB（物理 GPU 7）上，以 FP32/TF32 累计同一 $X^TX$ 并生成全部 Hessian。
3. 按层量化七个 Linear，执行 5 epoch 层内 reconstruction fine-tuning，并审计 36×8 个产物。
4. 组装并 fresh reload 含 252 个 `QuantizedLinear` 的 HF checkpoint。
5. 运行 WikiText2 test PPL 与 ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande 全量 0-shot。

## 实验配置

- 模型：Qwen3-8B，36 层，hidden size 4096，共 252 个量化 Linear。
- QTIP：L=16、K=2、V=2、tlut_bits=9、td_x=td_y=16、scale override=0.9。
- 校准：RP1T，Hessian 8192 条、layerwise fine-tune 384 条，context length 4096，seed 0。
- 评测：WikiText2 test，PPL sequence length 2048、batch size 1；六任务完整 0-shot、无 `--limit`。
- 硬件：本地物理 GPU 7，单卡；评测峰值显存 19.576GB。
- 变体边界：无 full-model e2e fine-tuning；Hessian 为显式标注的 FP32/TF32 执行，不是上游
  FP64 逐位复现。

## 实验结果

| 方法 | 码率 | WikiText2 PPL ↓ | Macro-6 ↑ |
|---|---:|---:|---:|
| Vector-GSQ | 2.021272 bpp（logical 实测） | 13.844481 | 65.7309% |
| QTIP-Qwen3 layerwise | 2.0 bit（标称） | **11.614485** | **66.7956%** |

| 任务 | Vector-GSQ | QTIP-Qwen3 | Vector−QTIP |
|---|---:|---:|---:|
| ARC-C | **51.7918%** | 50.7679% | +1.0239 pp |
| ARC-E | **78.1987%** | 75.4209% | +2.7778 pp |
| HellaSwag | 63.4137% | **68.4824%** | -5.0687 pp |
| LAMBADA | 59.3829% | **62.6819%** | -3.2990 pp |
| PIQA | 73.7214% | **76.3330%** | -2.6115 pp |
| WinoGrande | **67.8769%** | 67.0876% | +0.7893 pp |

QTIP 的 PPL 比 Vector-GSQ 低 2.229996，Macro-6 高 1.0647 个百分点。六个单项任务并非单边胜出：
Vector-GSQ 在 ARC-C、ARC-E、WinoGrande 更高，QTIP 在 HellaSwag、LAMBADA、PIQA 更高。预注册
0.10 bpp 比较门槛内，两者标称/逻辑码率差 0.021272 bit。

## 结论

Qwen3-8B 的主要质量指标仍支持 QTIP-Qwen3 layerwise 更优：它同时取得更低 PPL 和更高 Macro-6；
因此当前 Vector-GSQ 不能在该模型上宣称整体超过 QTIP。不过 Vector-GSQ 在三项任务上胜出，说明差异
具有任务结构，不能表述为 QTIP 六项全面领先。该结论只针对当前无 full-model e2e 的 Qwen3 适配端点。

原始结果位于
`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_target_qtip/20260901_010000_qtip_2bit_formal_matrix/qwen3_8b/eval/summary.json`，
紧凑对比 JSON 为
`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260902_043133_qwen3_8b_vector_gsq_vs_qtip_matched_comparison.json`。
