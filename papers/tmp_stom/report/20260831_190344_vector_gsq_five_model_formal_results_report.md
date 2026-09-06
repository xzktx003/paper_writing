# Vector-GSQ 五模型正式实验结果报告

生成时间：2026-08-31 19:03:44 CST

## 实验目的

补齐 Qwen3-4B、Qwen3-8B、Qwen3-14B、Qwen3-32B 和 LLaMA-2-7B 上本方法的完整正式证据，使每个模型同时具备全层量化 checkpoint、WikiText2 测试集 PPL 和规定六项零样本准确率，为后续同模型 QTIP 对比提供统一端点。

## 实验原理

每个 Transformer block 的 q/k/v/o/gate/up/down 七个 Linear 使用 NoWag-d6 初始化、Hessian-aware Vector-GPTQ assignment refinement 和 block-level Vector-GSQ assignment 训练。评测时从逻辑 checkpoint 重新构造全部七个 Linear，验证层覆盖、状态有限性和 fresh reconstruction 后再执行 PPL 与下游任务，避免直接复用训练进程内的临时权重。

## 实验步骤

1. 审计五个完整 checkpoint 的模型身份、层数和每层七 Linear 覆盖。
2. 复用已有同协议 WikiText2 PPL，缺失的 Qwen3-32B PPL 在本地单卡补测。
3. 在同一单卡流水线上顺序执行 Qwen3 四个规模的六项完整 `lm_eval`；不设置 `--limit`。
4. 复用已完成的 LLaMA-2-7B 同协议完整结果。
5. 将原始结果汇总为紧凑 JSON；不把不同模型、不同数据划分或 smoke 结果混入表格。

## 实验配置

- 方法：NoWag-d6 → Vector-GPTQ → Vector-GSQ，目标约 2 bit/weight，vector dimension 6。
- 模型：Qwen3-4B/8B/14B/32B、LLaMA-2-7B；全部 decoder block，`lm_head` 保持浮点。
- PPL：WikiText2 `test`，sequence length 2048，batch size 1。
- 准确率工具：`lm_eval`，0-shot，完整 ARC-Challenge、ARC-Easy、HellaSwag、LAMBADA-OpenAI、PIQA、WinoGrande。
- 本轮缺失项补测设备：本机单张 A100 80GB；各模型顺序执行，未并发占用多卡。
- Qwen3-4B/8B 使用 Vector-GPTQ top-128 checkpoint；Qwen3-14B 使用已完成 full-4096 checkpoint；表中逐项保留实际 logical effective bpp。

## 实验结果

| 模型 | Logical bpp | WikiText2 PPL ↓ | ARC-C | ARC-E | HellaSwag | LAMBADA | PIQA | WinoGrande | Macro-6 ↑ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Qwen3-4B | 2.0377 | 22.6799 | 42.24% | 65.87% | 55.73% | 46.32% | 71.00% | 61.96% | 57.18% |
| Qwen3-8B | 2.0213 | 13.8445 | 51.79% | 78.20% | 63.41% | 59.38% | 73.72% | 67.88% | 65.73% |
| Qwen3-14B | 2.0145 | 11.0321 | 53.67% | 79.42% | 70.23% | 65.19% | 77.26% | 71.98% | 69.62% |
| Qwen3-32B | 2.0111 | 9.1922 | 62.12% | 83.08% | 77.03% | 70.60% | 79.00% | 74.90% | 74.45% |
| LLaMA-2-7B | 2.0206 | 7.6439 | 37.46% | 63.89% | 64.99% | 67.92% | 74.59% | 67.01% | 62.64% |

## 结果审计

- 五个模型均覆盖全部 decoder 层及每层七个目标 Linear：Qwen3-4B/8B 各 36×7，Qwen3-14B 40×7，Qwen3-32B 64×7，LLaMA-2-7B 32×7。
- 所有 PPL 均为 WikiText2 test、sequence length 2048；六项准确率均为完整 0-shot 测试。
- Qwen3-14B 首次补测曾被路径门禁拒绝，因为默认文件仅有 0--4 层；修复后使用离线审计通过的 40 层/280 Linear 完整 checkpoint。本报告不包含那次失败路径的任何质量数值。
- 紧凑结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260831_190344_vector_gsq_five_model_formal_summary.json`。

## 结论

本方法的五模型正式矩阵已经完整，不再存在 PPL 或六项任务缺口。当前还不能据此宣称超过 QTIP：LLaMA-2-7B 的官方 QTIP 同协议评测和四个 Qwen3 的真实 QTIP 量化/评测仍需完成，最终结论必须在同模型、近似同码率、相同 WikiText2 与六任务协议下给出。
