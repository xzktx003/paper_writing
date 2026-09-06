# Qwen3-32B Vector-GSQ 与 QTIP 同模型正式对比报告（2026-09-06 19:54 CST）

## 实验目的

在完全相同的 Qwen3-32B 基座、WikiText2 test `seqlength=2048` 和六项完整 0-shot
`lm_eval` 协议下，对比当前 Vector-GSQ checkpoint 与扩展到 Qwen3 的 QTIP 2-bit 流程，补齐五个目标
模型中的最后一个 QTIP 端点。

## 实验原理

Vector-GSQ 使用已有完整 64 层 logical checkpoint fresh reconstruction。QTIP 路径复用官方 bitshift
codebook、随机符号、正交 incoherence transform、Hessian-aware trellis LDLQ 和每个 Linear 五轮层内
fine-tuning，覆盖每层 q/k/v/o/up/gate/down 七个投影。Qwen3-32B 的 MLP 奇因子宽度使用满足正交缩放
合同的 DCT-II 小因子，与其余快速 Hadamard 维组合。该端点完成官方 layerwise QTIP 核心，但没有加入
LLaMA 流程中的 full-model e2e fine-tuning，因此标记为 QTIP-Qwen3 layerwise 适配，不冒充官方发布
checkpoint。

## 实验步骤

1. 复用固定 RP1T token cache，构造 8192×4096 Hessian 样本和 384×4096 层内微调样本。
2. 在本地单张 A100 80GB（物理 GPU 7）上，以 FP32/TF32 累计同一 $X^TX$，完成 16 个 Hessian split。
3. 按层量化七个 Linear，执行 5 epoch 层内 reconstruction fine-tuning，并审计 64×8 个层产物。
4. 组装并 fresh reload 含 448 个 `QuantizedLinear` 的 HF checkpoint。
5. 运行 WikiText2 test PPL 与 ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande 全量 0-shot。

## 实验配置

- 模型：Qwen3-32B，64 层，hidden size 5120，共 448 个量化 Linear。
- QTIP：L=16、K=2、V=2、tlut_bits=9、td_x=td_y=16、scale override=0.9。
- 校准：RP1T，Hessian 8192 条、layerwise fine-tune 384 条，context length 4096，seed 0。
- 评测：WikiText2 test，PPL sequence length 2048、batch size 1；六任务完整 0-shot、无 `--limit`。
- 硬件：本地物理 GPU 7，单卡 A100 80GB；评测峰值显存 68.788GB（64.063GiB）。
- 时间：运行目录创建于 2026-09-03 05:08；Hessian 于 2026-09-04 02:59 完成，量化于
  2026-09-06 17:42 完成，正式评测于 19:33 正常退出；评测耗时 6619.26 秒。
- 完整性：16/16 Hessian split、64/64 层、513 个量化文件（64×8+config）、448 个 manifested
  `QuantizedLinear`、HF 三个权重分片均通过审计。
- 变体边界：无 full-model e2e fine-tuning；Hessian 为显式标注的 FP32/TF32 执行，不是上游
  FP64 逐位复现。量化后段触发 Torch Dynamo cache-limit fallback，增加耗时但未产生错误或缩小协议。

## 实验结果

| 方法 | 码率 | WikiText2 PPL ↓ | Macro-6 ↑ |
|---|---:|---:|---:|
| Vector-GSQ | 2.011080 bpp（logical 实测） | 9.192217 | **74.4539%** |
| QTIP-Qwen3 layerwise | 2.0 bit（标称） | **8.531283** | 74.2033% |

| 任务 | Vector-GSQ | QTIP-Qwen3 | Vector−QTIP |
|---|---:|---:|---:|
| ARC-C | **62.1160%** | 60.2389% | +1.8771 pp |
| ARC-E | **83.0808%** | 81.6919% | +1.3889 pp |
| HellaSwag | 77.0265% | **79.7351%** | -2.7086 pp |
| LAMBADA | **70.5997%** | 69.7652% | +0.8345 pp |
| PIQA | 78.9989% | **79.5974%** | -0.5985 pp |
| WinoGrande | **74.9013%** | 74.1910% | +0.7103 pp |

QTIP 的 PPL 比 Vector-GSQ 低 0.660933；Vector-GSQ 的 Macro-6 比 QTIP 高 0.2506 个百分点，并在
六个单项任务中的四项领先。两者逻辑/标称码率差 0.011080 bit，位于预注册 0.10 bpp 可比门槛内。

## 结论

Qwen3-32B 是五模型矩阵中唯一的混合结果：QTIP 保持更低的语言建模困惑度，Vector-GSQ 则取得略高的
六任务平均准确率和 4/6 单项胜出。因此不能把该端点写成任何一方“全面超过”另一方；准确表述是
Vector-GSQ 在当前下游准确率聚合上略优，但 PPL 仍落后。这个结论仅针对当前无 full-model e2e 的
QTIP-Qwen3 layerwise 适配端点。

原始结果位于
`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_target_qtip/20260901_010000_qtip_2bit_formal_matrix/qwen3_32b/eval/summary.json`，
紧凑对比 JSON 为
`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260906_195437_qwen3_32b_vector_gsq_vs_qtip_matched_comparison.json`。
