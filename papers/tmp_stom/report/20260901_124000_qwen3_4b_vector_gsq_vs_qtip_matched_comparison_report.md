# Qwen3-4B Vector-GSQ 与 QTIP 同模型正式对比报告（2026-09-01 12:40 CST）

## 实验目的

在完全相同的 Qwen3-4B 基座、WikiText2 test `seqlength=2048` 和六项完整 0-shot
`lm_eval` 协议下，对比当前 Vector-GSQ checkpoint 与扩展到 Qwen3 的 QTIP 2-bit 流程，避免跨模型、
跨数据集或只引用公开表格造成的不可比结论。

## 实验原理

Vector-GSQ 使用已有完整 36 层 logical checkpoint fresh reconstruction。QTIP 路径复用官方 bitshift
codebook、随机符号、正交 incoherence transform、Hessian-aware trellis LDLQ 和每个 Linear 五轮层内
fine-tuning，并覆盖每层 q/k/v/o/up/gate/down 七个投影。Qwen3-4B 的 MLP 宽度 9728 等于
`19×512`，不存在对应的实 Hadamard-19；因此小因子使用满足 $HH^T=19I$ 的确定性 scaled DCT-II，
512 维部分仍使用快速 Hadamard。该替换保持正交和可逆，但属于 Qwen3 架构适配，不冒充官方发布 checkpoint。

## 实验步骤

1. 使用固定 RP1T token cache 构造 8192×4096 Hessian 样本和 384×4096 层内微调样本。
2. 在本地单张 A100 80GB（物理 GPU 1）上以 FP32/TF32 累计同一 $X^TX$，生成 36 层四类 Hessian。
3. 按官方顺序逐层量化七个 Linear，并执行 5 epoch 层内 reconstruction fine-tuning。
4. 审计 36×8 个层产物，组装并 fresh reload 含 252 个 `QuantizedLinear` 的 HF checkpoint。
5. 运行 WikiText2 test PPL 与 ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande 全量 0-shot。

## 实验配置

- 模型：Qwen3-4B，36 层，hidden size 2560，intermediate size 9728。
- QTIP：L=16、K=2、V=2、tlut_bits=9、td_x=td_y=16、scale override=0.9。
- 校准：RP1T，Hessian 8192 条、layerwise fine-tune 384 条，context length 4096，seed 0。
- 评测：WikiText2 test，PPL sequence length 2048、batch size 1；六任务完整 0-shot、无 `--limit`。
- 硬件：本地物理 GPU 1，单卡；评测峰值显存 11.294GB。
- 变体边界：完成官方 layerwise QTIP 核心，但尚未加入官方 LLaMA 流程中的 full-model e2e fine-tuning；
  Hessian 为显式标注的 FP32/TF32 执行，不是上游 FP64 逐位复现。

## 实验结果

| 方法 | 码率 | WikiText2 PPL ↓ | Macro-6 ↑ |
|---|---:|---:|---:|
| Vector-GSQ | 2.037683 bpp（logical 实测） | 22.679947 | 57.1849% |
| QTIP-Qwen3 layerwise | 2.0 bit（标称） | **15.782585** | **60.2983%** |

| 任务 | Vector-GSQ | QTIP-Qwen3 | Vector−QTIP |
|---|---:|---:|---:|
| ARC-C | 42.2355% | **43.7713%** | -1.5358 pp |
| ARC-E | 65.8670% | **68.6869%** | -2.8199 pp |
| HellaSwag | 55.7260% | **60.8544%** | -5.1285 pp |
| LAMBADA | 46.3225% | **51.5816%** | -5.2591 pp |
| PIQA | 71.0011% | **73.1230%** | -2.1219 pp |
| WinoGrande | 61.9574% | **63.7727%** | -1.8153 pp |

QTIP 的 PPL 比 Vector-GSQ 低 6.897362，Macro-6 高 3.1134 个百分点，并在六个单项任务上全部更高。
预注册 0.10 bpp 比较门槛内，两者标称/逻辑码率差 0.037683 bit。

## 过程故障与修复

- 初始上游 FP64/32 进程数据入口停滞，没有生成 Hessian，已单独记录为基础设施失败。
- 首次完整 Hessian 后，官方 `get_hadK` 因 9728 非支持维度在 layer 0 `up_proj` 退出；加入 scaled DCT
  正交小因子后，9728/17408/25600 三种目标 Qwen3 MLP 宽度均通过正交与往返测试。
- 36 层量化完成后，Transformers 4.52 在 Torch 2.4 下从错误命名空间导入 `DTensor`；兼容层仅暴露
  Torch 已有的 legacy `DTensor` 类，checkpoint 随后成功保存、重载和评测。

## 结论

在当前同模型、同评测协议和近似 2-bit 码率下，QTIP-Qwen3 layerwise 端点明确优于当前 Vector-GSQ；
因此 Qwen3-4B 不能作为“我们的方法超过 QTIP”的证据。该结论只针对当前 Qwen3 适配变体；由于尚无
full-model e2e fine-tuning，补齐 e2e 理论上更可能进一步改善 QTIP，而不是帮助 Vector-GSQ。

原始结果位于
`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_target_qtip/20260901_010000_qtip_2bit_formal_matrix/qwen3_4b/eval/summary.json`，
紧凑对比 JSON 为
`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260901_124000_qwen3_4b_vector_gsq_vs_qtip_matched_comparison.json`。
