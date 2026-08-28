# Llama-3.1-8B 连续尺度—局部 Assignment 联合训练实验报告

时间：2026-08-28 19:45:56 至 2026-08-29 03:45:49（Asia/Shanghai）

状态：联合校准、WikiText2 PPL 与六任务全量 `lm_eval` 全部完成；终端 `status 0`，`pipeline.status=completed`。

## 1. 实验目的

V8 的公平对照表明，同一 2.1208-bpp Vector-GSQ checkpoint 内，连续 group scale 比局部 assignment 带来更大的任务收益，而 assignment 的 PPL 漂移较小。该实验检验最直接的联合假设：若在同一软参数化中同时训练 group-scale log delta 与当前码字附近领域的 binary assignment switch，是否能结合两者优势，得到不低于 scale-only 的任务准确率并把 PPL 拉向 assignment-only。

该实验不是学习率、group size、候选数或随机 seed 扫描，而是由 V8 审稿意见直接提出的方法检验。

## 2. 实验原理

源权重仍写为 `group_scale × codeword`。对 layers 28--31 的 5,521,408 个已有 FP16 group scale 学习有界对数增量，同时为 145,465,344 个向量构造当前码字 8-way 几何邻域，以任务与文本功能梯度选出一个 alternative，并用 binary Concrete 学习“保留锚点/切换邻居”。

训练后不保存软概率。每个 epoch 把 assignment 按置信度投影成 `0、1/8、1/4、1/2、full` 的嵌套硬状态，并与该 epoch 学到的 scale 组合。满足任务 balanced-loss 改善、单任务 loss、macro 与文本 CE 约束后，按任务 loss 选择部署候选。最终候选只在从未用于任何前序训练或选择的 task/C4 audit 上验收一次；失败则 scale 与 assignment 一起精确回滚。

## 3. 实验配置

- 模型：Meta-Llama-3.1-8B-Instruct。
- 源 checkpoint：完整 32 层、224 个 Linear 的 Vector-GSQ，`d=6`、`K=4096`、group size 160、逻辑码率 2.1207557091 bpp。
- 适应层：Transformer layers 28--31。
- 任务数据：ARC-Challenge、ARC-Easy、HellaSwag、PIQA、WinoGrande 的 training split；每任务 512 train、256 validation、64 final audit，final audit 使用随机排列 offset 1024 的从未观察样本。
- 文本数据：FineWeb-Edu rows 0--4095 训练；C4 rows 4736--4863 validation；全新 C4 rows 5376--5439 final audit；sequence length 4096，teacher top-k 32。
- 优化：2 epochs；assignment LR 0.005，scale LR 0.002，scale L2 `1e-4`，`|log scale delta|<=0.08`，固定 seed 0。
- 正式测试：WikiText2 raw test，seqlength 2048；`lm_eval 0.4.4` 全量 0-shot ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande，无 `limit`。
- 设备：本机物理 GPU7，进程只可见一张 GPU；未使用 10.30.0.14。

## 4. 实验步骤

1. 从共享 Vector-GSQ checkpoint 重构硬量化权重，并验证码本、assignment、scale 与逻辑码率合同。
2. 收集浮点教师多选分数、长文本 top-k 分布和 task-adapted proposal gradients。
3. 为每个 assignment 在锚点 8-way 邻域中选择功能定向 alternative。
4. 在一个参数化中联合训练 scale log delta 与 binary switch logits 两个 epoch。
5. 每个 epoch 执行真实 hard assignment 嵌套投影，验证组合部署态。
6. 对唯一入选端点执行一次全新 task/C4 audit。
7. 固化 checkpoint 后运行 WikiText2 PPL 和六任务全量 `lm_eval`。

## 5. 选择集与独立 Audit

最终选择 epoch 1 的 `1/2` 投影，改变 1,252,415 / 145,465,344 个 assignment，即 0.860971%；5,521,408 个 scale delta 全部非零，平均绝对 log delta 为 0.033627，范围达到 `[-0.08, 0.08]`。

| 指标 | 锚点 | 联合候选 | 变化 |
|---|---:|---:|---:|
| Validation macro | 71.9531 | 72.8125 | +0.8594 pp |
| Validation balanced loss | 0.83785 | 0.79861 | -4.6832% |
| Validation C4 CE | 2.66053 | 2.59942 | -2.2968% |
| 全新 audit macro | 76.8750 | 76.8750 | 0 pp |
| 全新 audit balanced loss | 0.78410 | 0.71698 | -8.5607% |
| 全新 audit C4 CE | 2.66693 | 2.61368 | -1.9967% |

Audit Gate 通过。该结果说明候选确实改善了当前 loss 代理，但不能单独证明正式 PPL/zero-shot Pareto 改善。

## 6. 正式结果

| 端点 | PPL ↓ | Macro-6 ↑ | 公共五任务 ↑ |
|---|---:|---:|---:|
| Vector-GSQ 锚点 | **10.4960** | 67.9997 | 68.1046 |
| Assignment-only | 10.7347 | 69.4774 | 69.0744 |
| Group-scale-only | 10.9448 | **71.7223** | **72.5484** |
| **Naive joint** | 11.4098 | 69.7434 | 68.9511 |

联合端点相对锚点的 Macro-6/公共五任务提高 1.7437/0.8465 pp，但 PPL 退化 8.7063%。相对 assignment-only，它的 Macro-6 仅高 0.2660 pp，公共五任务低 0.1232 pp，PPL 再退化 6.2892%。相对 group-scale-only，它的 Macro-6/公共五任务低 1.9789/3.5972 pp，PPL 还高 4.2489%，因此被 group-scale-only 严格支配。

逐任务结果为 ARC-C 49.8294、ARC-E 78.3670、HellaSwag 69.3886、LAMBADA 73.7046、PIQA 76.7682、WinoGrande 70.4025。联合端点相对 assignment 的 Macro-6 微小优势主要来自 LAMBADA，不是跨任务一致互补。

## 7. 失败诊断

关键反证来自同一 joint epoch 的零-switch 投影：只保留 joint 过程中学到的 scale 时，validation macro 仅 70.9375%、balanced loss 0.88404；独立训练的 scale 则达到 76.3281%。选中的 joint 硬投影也只有 72.8125%，低于独立 assignment 的 74.1406%。因此问题不是“最后少保留或多保留一些 switch”，而是两个坐标在软训练态发生了补偿性耦合：scale 学会补偿连续的 assignment mixture，hard projection 改变该 mixture 后，scale 与 assignment 都不再处于各自有效的部署态邻域。

这否定的是“一个软参数化中同时联合优化即可自然互补”，而不是所有连续—离散组合。最自然的修复是部署态分阶段坐标法：先把连续 scale 固化成真实硬 checkpoint，再以它为锚点学习稀疏 assignment repair；每个阶段只优化一个坐标，最终组合只使用一次从未观察的 audit。

## 8. 部署与成本审计

- Assignment 与 FP16 group scale 均发生变化；codebook、normalizer、固定元数据与非目标状态保持精确。
- Fresh reconstruction 最大绝对误差为 0；逻辑码率仍为 2.1207557091 bpp。
- 联合校准 27,226.14 秒（7.56 小时），PPL 55.69 秒，六任务评测 1,501.42 秒。
- 校准峰值显存 37,749,899,264 bytes（35.16 GiB）。

## 9. 结论

Naive joint 是一个完整但失败的方法实验：它通过独立 loss audit、相对源锚点有任务收益，却没有把连续尺度与局部 assignment 的 Pareto 优势组合起来，并被 scale-only 严格支配。V9 应把该负结果作为核心证据，明确软—硬失配与坐标干扰；下一版本的方法创新应是部署态、分阶段、可回滚的连续—离散坐标适应，而不是继续扫描当前联合参数化的学习率、seed 或投影比例。

完整结果目录：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_joint_scale_assignment/20260828_194520_llama3_1_8b_joint_scale_assignment_l28_31_gpu7/`

紧凑 JSON：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260829_035900_llama3_1_8b_joint_scale_assignment_complete.json`
