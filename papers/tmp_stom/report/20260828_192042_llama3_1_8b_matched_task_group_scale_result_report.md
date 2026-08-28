# Llama-3.1-8B-Instruct 同预算 task group-scale 公平对照实验报告

时间：2026-08-28 17:23:10--19:20:42（Asia/Shanghai）

状态：完整训练、WikiText2 PPL、六任务 `lm_eval` 全部完成，终端 exit 0
设备：本机物理 GPU 2，进程仅暴露这一张 GPU

## 实验目的

V7 的主要审稿缺口是缺少“同一源 checkpoint、同一任务监督、同一文本保护预算、同一部署码率”的任务适配基线。本实验冻结 Vector-GSQ 的码本和离散 assignment，只训练 checkpoint 中已经存在的 FP16 group scale，以检验 V7 的局部 assignment 收益究竟来自其离散训练机制，还是任意任务监督后的低成本量化参数适配都能取得。

## 实验原理

每个量化权重块已经由共享码本向量、离散 assignment、row/column normalizer 与 group scale 重构。本基线仅为 layers 28--31 的 28 个 Linear 引入连续 `log_delta`，部署时执行

`group_scale <- FP16(group_scale * exp(log_delta))`。

码本、assignment、normalizer 与已有字段布局不变，因此逻辑 bpp 不增加。优化目标与 assignment-only 实验一致：training-split 多选监督、dense-teacher KL、FineWeb/C4 top-32 teacher-text cross-entropy。验证候选必须相对锚点达到至少 0.5% balanced-loss 改善，并限制 macro、单任务 loss 与文本 CE 回退；最终还必须在独立 audit 上再次通过同一规则，否则精确回滚到源 checkpoint。

## 实验配置

- 模型：Meta-Llama-3.1-8B-Instruct。
- 源模型：同模型全 32 层 Vector-GSQ，d=6、K=4096、group size=160、逻辑码率 2.1207557091 bpp。
- 可训练范围：decoder layers 28--31，七类 Linear 同时安装 scale delta；其余层冻结。
- 任务数据：ARC-Challenge、ARC-Easy、HellaSwag、PIQA、WinoGrande 的 training split，每任务 512 train / 256 validation / 256 audit，seed 0、offset 0，三者互斥。
- 文本数据：FineWeb token cache rows 0--4095 作训练；source quantizer 未见过的本地 C4 rows 4736--4863 作 validation，4864--5375 作 audit；每行 4096 token，teacher top-k=32。
- 优化：2 epochs，Adam，learning rate 0.002，gradient accumulation 4，teacher-KL weight 0.25，text weight 0.25，`|log_delta| <= 0.08`。
- PPL：WikiText2 test，sequence length=2048，batch size=1。
- 准确率：`lm_eval` 0-shot 全量 ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande，无 `limit`。
- 测试工具：项目 logical checkpoint evaluator 与 lm-evaluation-harness。
- 设备约束：仅本机物理 GPU 2 可见，不使用 10.30.0.14，不并行占用第二张 GPU。

## 实验步骤

1. 加载同模型 Vector-GSQ source checkpoint 与 dense BF16 teacher。
2. 在互斥任务 training split 上采集 teacher 多选分数，在 4096 条长文本上采集 top-32 teacher 分布。
3. 冻结所有原模型参数，仅优化 layers 28--31 的 group-scale `log_delta`。
4. 每个 epoch 在 task validation 与 C4 validation 上执行 loss-dominance 选择。
5. 将单一验证候选放到独立 task/C4 audit；通过后把 delta 折叠回原 FP16 scale 字段。
6. 对落盘 checkpoint 运行 WikiText2 2048 PPL 和六任务全量 `lm_eval`。

## 实验结果

### 内部选择与部署合同

- 最优 epoch：2；独立 audit Gate：通过。
- task validation macro：71.9531% -> 76.3281%；balanced loss：0.83785 -> 0.67988。
- task audit macro：69.7656% -> 76.0156%；balanced loss：0.85980 -> 0.67907。
- C4 validation CE：2.66053 -> 2.44109；C4 audit CE：2.71407 -> 2.48685。
- 训练 scale delta 数：5,521,408，全部非零，mean |delta|=0.04323，范围达到预注册的 [-0.08, 0.08]。
- assignment、codebook 未改变；group scale 保持 FP16；逻辑码率仍为 2.1207557091 bpp；fresh reconstruction 全部精确。

### 正式评测

| 方法 | PPL ↓ | ARC-C | ARC-E | Hella | LAMBADA | PIQA | Wino | Macro-6 | 公共五任务 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Vector-GSQ source | 10.4960 | 47.27 | 76.09 | 70.14 | 67.48 | 77.09 | 69.93 | 68.00 | 68.10 |
| assignment-only | 10.7347 | 49.66 | 79.42 | 69.93 | 71.49 | 77.15 | 69.22 | 69.48 | 69.07 |
| **group-scale-only** | **10.9448** | **53.75** | **78.58** | **77.54** | **67.59** | **79.54** | **73.32** | **71.72** | **72.55** |

相对 source，group-scale-only 的 Macro-6 提高 3.7225pp、公共五任务提高 4.4438pp，PPL 退化约 4.28%。相对 assignment-only，任务平均分别提高 2.2449pp 和 3.4740pp，但 PPL 再退化约 1.96%。

## 结论

公平对照否定了“局部 assignment 在同预算任务适配中天然优于已有连续量化参数”的强叙述。group scale 是更强的任务准确率适配坐标；assignment 则以更小的语言建模扰动提供中间 Pareto 点。V8 不应继续宣称 assignment-only 的全面优势，而应把发现改写为：同一低比特 VQ checkpoint 内存在连续尺度与离散邻域两种功能坐标，它们产生不同的 task-accuracy/PPL 前沿。下一项方法实验应联合两者，并用单次独立 audit 验证互补性；这比扫描 group size、seed 或学习率更能决定论文方法成立与否。

## 产物

- 正式 checkpoint 与原始结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_matched_task_group_scale/20260828_172310_llama3_1_8b_matched_task_group_scale_l28_31_gpu2/`
- 完成摘要：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260828_192042_llama3_1_8b_matched_task_group_scale_complete.json`
- 本报告：`report/20260828_192042_llama3_1_8b_matched_task_group_scale_result_report.md`
