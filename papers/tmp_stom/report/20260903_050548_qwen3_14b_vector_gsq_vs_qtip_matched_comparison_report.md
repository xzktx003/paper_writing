# Qwen3-14B Vector-GSQ 与 QTIP 同模型正式对比报告（2026-09-03 05:05 CST）

## 实验目的

在完全相同的 Qwen3-14B 基座、WikiText2 test `seqlength=2048` 和六项完整 0-shot
`lm_eval` 协议下，对比当前 Vector-GSQ checkpoint 与扩展到 Qwen3 的 QTIP 2-bit 流程，形成不依赖
跨模型公开数字的直接证据。

## 实验原理

Vector-GSQ 使用已有完整 40 层 logical checkpoint fresh reconstruction。QTIP 路径复用官方 bitshift
codebook、随机符号、正交 incoherence transform、Hessian-aware trellis LDLQ 和每个 Linear 五轮层内
fine-tuning，覆盖每层 q/k/v/o/up/gate/down 七个投影。Qwen3-14B 的 MLP 奇因子维度使用满足正交缩放
合同的 DCT-II 小因子，与其余快速 Hadamard 维组合。该端点完成官方 layerwise QTIP 核心，但没有加入
LLaMA 流程中的 full-model e2e fine-tuning，因此明确标记为 QTIP-Qwen3 layerwise 适配，不冒充官方发布
checkpoint。

## 实验步骤

1. 复用固定 RP1T token cache，构造 8192×4096 Hessian 样本和 384×4096 层内微调样本。
2. 在本地单张 A100 80GB（物理 GPU 7）上，以 FP32/TF32 累计同一 $X^TX$ 并生成全部 Hessian。
3. 按层量化七个 Linear，执行 5 epoch 层内 reconstruction fine-tuning，并审计 40×8 个产物。
4. 组装并 fresh reload 含 280 个 `QuantizedLinear` 的 HF checkpoint。
5. 运行 WikiText2 test PPL 与 ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande 全量 0-shot。

## 实验配置

- 模型：Qwen3-14B，40 层，hidden size 5120，共 280 个量化 Linear。
- QTIP：L=16、K=2、V=2、tlut_bits=9、td_x=td_y=16、scale override=0.9。
- 校准：RP1T，Hessian 8192 条、layerwise fine-tune 384 条，context length 4096，seed 0。
- 评测：WikiText2 test，PPL sequence length 2048、batch size 1；六任务完整 0-shot、无 `--limit`。
- 硬件：本地物理 GPU 7，单卡；评测峰值显存 32.742GB。
- 时间：2026-09-02 04:31 左右启动，2026-09-03 04:23 正常退出；正式评测耗时 4282.70 秒。
- 变体边界：无 full-model e2e fine-tuning；Hessian 为显式标注的 FP32/TF32 执行，不是上游
  FP64 逐位复现。

## 实验结果

| 方法 | 码率 | WikiText2 PPL ↓ | Macro-6 ↑ |
|---|---:|---:|---:|
| Vector-GSQ | 2.014459 bpp（logical 实测） | 11.032148 | 69.6229% |
| QTIP-Qwen3 layerwise | 2.0 bit（标称） | **9.839332** | **71.4962%** |

| 任务 | Vector-GSQ | QTIP-Qwen3 | Vector−QTIP |
|---|---:|---:|---:|
| ARC-C | 53.6689% | **56.5700%** | -2.9010 pp |
| ARC-E | **79.4192%** | 78.7037% | +0.7155 pp |
| HellaSwag | 70.2251% | **73.8598%** | -3.6347 pp |
| LAMBADA | 65.1853% | **68.9695%** | -3.7842 pp |
| PIQA | 77.2579% | **78.1828%** | -0.9249 pp |
| WinoGrande | 71.9811% | **72.6914%** | -0.7103 pp |

QTIP 的 PPL 比 Vector-GSQ 低 1.192817，Macro-6 高 1.8733 个百分点。Vector-GSQ 仅在 ARC-E 高
0.7155 个百分点，QTIP 在其余五项更高。预注册 0.10 bpp 比较门槛内，两者标称/逻辑码率差
0.014459 bit。

## 结论

Qwen3-14B 的同模型证据支持 QTIP-Qwen3 layerwise 更优：它同时取得更低 PPL 和更高 Macro-6，并在
六个单项任务中的五项领先。因此当前 Vector-GSQ 不能在该模型上宣称整体超过 QTIP。该结论只针对当前
无 full-model e2e 的 Qwen3 适配端点；QTIP 的 2.0 为标称码率，Vector-GSQ 的 2.014459 为 logical 实测。

原始结果位于
`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_target_qtip/20260901_010000_qtip_2bit_formal_matrix/qwen3_14b/eval/summary.json`，
紧凑对比 JSON 为
`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260903_050548_qwen3_14b_vector_gsq_vs_qtip_matched_comparison.json`。
