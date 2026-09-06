# Vector-GSQ 与 QTIP 五模型正式实验总报告（2026-09-06 19:54 CST）

## 实验目的

在 Qwen3-4B、Qwen3-8B、Qwen3-14B、Qwen3-32B 和 LLaMA-2-7B 上分别完成 Vector-GSQ 与
QTIP 的近 2-bit 同模型实验，并以统一的 WikiText2 和六项 0-shot 准确率协议给出可复核的总体结论。

## 实验原理

Vector-GSQ 端点采用 `NoWag-d6 + Vector-GPTQ + Vector-GSQ`，从每层 block-scaled VQ 的 logical
state 重建权重，并报告实际 logical effective bpp。LLaMA-2-7B 使用官方 QTIP-2Bit checkpoint；四个
Qwen3 端点使用官方 QTIP 的 codebook、incoherence transform、Hessian-aware trellis LDLQ 和 layerwise
fine-tuning，并新增 dense Qwen3 模型桥接。Qwen3 路径不含 full-model e2e fine-tuning，其 2 bit 为标称
码率，因此与 Vector-GSQ 的关系必须按当前端点边界陈述。

## 实验步骤

1. 对五个 Vector-GSQ checkpoint 执行全层、七 Linear、有限性和逐元素 reconstruction 审计。
2. 对 LLaMA-2-7B 加载官方 QTIP-2Bit checkpoint；对四个 Qwen3 使用同一固定 RP1T 校准 cache，按
   4B→8B→14B→32B 顺序完成 Hessian、逐层量化、HF 化和 fresh reload。
3. 每个端点运行 WikiText2 test PPL，固定 `seqlength=2048`、batch size 1。
4. 每个端点运行 ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande 完整 0-shot `lm_eval`，无
   `--limit`。
5. 校验模型身份、任务集合、协议和码率差后，计算 Vector-GSQ 减 QTIP 的有符号差值。

## 实验配置

- 模型：Qwen3-4B/8B/14B/32B 与 LLaMA-2-7B，共五个同模型 pair。
- 目标码率：约 2 bit/weight；最大可比码率差 0.10 bpp，五个 pair 均通过。
- Vector-GSQ：d=6，logical effective bpp 分别为 2.037683、2.021272、2.014459、2.011080、
  2.020614。
- QTIP-Qwen3：L=16、K=2、V=2、tlut_bits=9、td_x=td_y=16、scale override=0.9；RP1T
  Hessian/fine-tune=8192/384，context length 4096，seed 0；FP32/TF32 Hessian；无 full-model e2e。
- 评测工具：项目统一 evaluator 与 `lm_eval`；PPL 使用 WikiText2 test，sequence length 2048；准确率
  使用规定六任务完整 0-shot。
- 硬件：全部正式流程在本地单张 GPU 上顺序执行，未占用服务器 14，未并发运行多个 GPU 实验。

## 实验结果

| 模型 | Vector bpp | Vector PPL ↓ | QTIP PPL ↓ | ΔPPL（V−Q） | Vector Macro-6 ↑ | QTIP Macro-6 ↑ | ΔMacro（V−Q） |
|---|---:|---:|---:|---:|---:|---:|---:|
| LLaMA-2-7B | 2.020614 | 7.643916 | **6.286650** | +1.357266 | 62.6426% | **66.2989%** | -3.6563 pp |
| Qwen3-4B | 2.037683 | 22.679947 | **15.782585** | +6.897362 | 57.1849% | **60.2983%** | -3.1134 pp |
| Qwen3-8B | 2.021272 | 13.844481 | **11.614485** | +2.229996 | 65.7309% | **66.7956%** | -1.0647 pp |
| Qwen3-14B | 2.014459 | 11.032148 | **9.839332** | +1.192817 | 69.6229% | **71.4962%** | -1.8733 pp |
| Qwen3-32B | 2.011080 | 9.192217 | **8.531283** | +0.660933 | **74.4539%** | 74.2033% | +0.2506 pp |

| 模型 | Vector 单项胜数 | QTIP 单项胜数 | 主要判定 |
|---|---:|---:|---|
| LLaMA-2-7B | 0 | 6 | QTIP 的 PPL 与 Macro-6 均更优 |
| Qwen3-4B | 0 | 6 | QTIP 的 PPL 与 Macro-6 均更优 |
| Qwen3-8B | 3 | 3 | QTIP 的 PPL 与 Macro-6 均更优 |
| Qwen3-14B | 1 | 5 | QTIP 的 PPL 与 Macro-6 均更优 |
| Qwen3-32B | 4 | 2 | QTIP PPL 更优，Vector Macro-6 更优 |

总体上，QTIP 在 5/5 个模型上取得更低 PPL，在 4/5 个模型上取得更高 Macro-6；30 个单项比较中，
QTIP 胜 22 项，Vector-GSQ 胜 8 项。Qwen3-32B 是唯一混合端点，而且两种汇总指标的优势方向相反。

## 结论

五模型正式证据已经完整，但不支持“Vector-GSQ 整体超过 QTIP”的主张。更准确的论文结论是：当前
QTIP 在语言建模 PPL 上跨五个规模稳定领先，并在四个模型的六任务平均准确率上领先；Vector-GSQ 的
相对差距随 Qwen3 规模增大总体缩小，并在 Qwen3-32B 首次以 0.2506 个百分点反超 Macro-6、赢得 4/6
单项任务，但仍以 0.6609 PPL 落后。这是一个值得写进论文的规模相关交叉现象，而不是全面胜负。

紧凑总结果为
`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260906_195437_vector_gsq_vs_qtip_five_model_formal_summary.json`；
五个原始 QTIP 结果由
`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_target_qtip/20260901_010000_qtip_2bit_formal_matrix/matrix_summary.json`
统一索引。
