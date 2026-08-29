# Llama-3.1-8B Scale-Hard Assignment Repair 正式实验报告

时间：2026-08-29 18:45（Asia/Shanghai）

## 1. 实验目的

V9 已证明：同时训练 group scale 与 soft assignment 会让尺度补偿尚未部署的码字混合，hard projection 后联合端点被独立 scale 严格支配。本实验检验由该失败机制直接导出的修复：先固化独立训练、已经审计的 FP16 scale 硬 checkpoint，再冻结 scale，以这一真实部署权重为锚点重新计算当前码字 8-way 邻域中的功能候选，只训练 assignment。

成功标准预先固定为相对 scale-only：候选必须通过任务 balanced loss、Macro、单任务 loss、文本 CE 和最大切换率 Gate；不能靠更换 seed、group size、学习率或投影比例挑选结果。

## 2. 实验原理

对第 $i$ 个六维量化向量，scale-only 硬锚点为

$$
\hat w_i=s_{g(i)}c_{a_i^0}.
$$

本实验冻结 $s_g$、共享码本和 normalizer。每个当前码字 $a_i^0$ 只构造 8-way 几何附近领域，并用任务/教师/文本目标在 scale 硬状态上计算功能梯度，从邻域中选择一项一阶最优 alternative $c_i^1$：

$$
\Delta_i(c)=\langle g_i\odot s_{g(i)},c-c_{a_i^0}\rangle.
$$

Binary Concrete 仅学习“保持 $a_i^0$ / 切换到 $c_i^1$”的概率。每个 epoch 都把正 logit 按置信度排序，构造 1/8、1/4、1/2、full 四个嵌套硬集合，并以真实 int32 assignment 重构部署权重后独立评估。只有硬状态通过 Gate 才能进入最终 audit。

## 3. 实验配置

| 项目 | 配置 |
|---|---|
| 模型 | Meta-Llama-3.1-8B-Instruct |
| 源 checkpoint | 已审计的 task group-scale endpoint |
| 量化表示 | $d=6$，$K=4096$，group size 160，共享码本 |
| 逻辑码率 | 2.1207557091 bpp |
| 训练层 | 28--31，每层 7 个 Linear |
| 可训练变量 | assignment binary switch；scale/codebook/normalizer 全冻结 |
| 任务训练/验证 | ARC-C、ARC-E、HellaSwag、PIQA、WinoGrande；每项 512/256 |
| 任务 audit | 每项 31，固定 shuffle offset 1088；31 是 ARC-C train 剩余可统一使用的最大数 |
| 文本训练/验证/audit | rows 0--4095 / 4736--4863 / 5440--5503 |
| 文本长度 | 4096 |
| Epoch / LR | 2 / 0.005 |
| 教师 KL / switch penalty | 0.25 / 0.0001 |
| 最大切换率 | 5% |
| 正式 PPL | WikiText2 raw test，seqlength=2048，batch=1 |
| 正式准确率 | lm_eval 0.4.4，0-shot，全量 ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande |
| GPU | 本地物理 GPU5，单卡；峰值 31.80 GiB |
| 扫描 | 无 seed、LR、group size 或投影比例扫描 |

新 5504×4096 token cache 的前 5440 行与旧缓存 bit-exact，只新增 64 条 audit 文本；构建器在任何 prefix 不一致时拒绝写入。

## 4. 实验步骤

1. 校验 source scale checkpoint 已完成、audit 通过、assignment/codebook 未改、scale 为 FP16 且逻辑码率不变。
2. 在 source 的真实 hard weight 上重新计算 28--31 层、28 个 Linear 的 8-way 功能候选。
3. 冻结 scale，只训练 binary Concrete assignment switch 两个 epoch。
4. 每个 epoch 评估 1/8、1/4、1/2、full 四个真实硬投影，共八个候选；每个候选独立接受 Gate。
5. 若没有非零候选通过验证，则精确回滚为 source；audit 不用于强行挑选失败候选。
6. 对唯一最终状态运行 WikiText2 PPL、六任务 lm_eval 和 checkpoint 合同检查。

首轮诊断 run 暴露了 selector bug：旧逻辑只有 full endpoint 先通过 source Gate 才评估稀疏投影，这与非单调信赖域假设矛盾。修复后重新执行完整正式实验；下述结论以修复后的八投影 run 为准。

## 5. 实验结果

### 5.1 一阶提议与真实硬端点相反

145,465,344 个向量中，98.1965% 在 8-way 邻域内至少有一个负一阶变化候选；28 个 Linear 的比例均在 97.4782%--98.3283%。加权平均最优一阶变化为 $-2.0136\times10^{-7}$。若只看一阶代理，几乎整个局部离散空间都“应该改善”。

实际八个硬投影全部失败：

| Epoch | 投影 | 切换率 | Validation Macro ↑ | Balanced loss ↓ | 相对 scale Gate |
|---:|---:|---:|---:|---:|---|
| -- | scale baseline | 0 | **76.3281** | **0.679691** | 基准 |
| 1 | 1/8 | 0.9635% | 67.6563 | 0.866140 | 失败 |
| 1 | 1/4 | 1.9271% | 68.0469 | 0.835993 | 失败 |
| 1 | 1/2 | 3.8541% | 70.8594 | 0.790087 | 失败 |
| 1 | full | 7.7083% | 67.1094 | 0.910073 | 失败 |
| 2 | 1/8 | 1.7708% | 68.1250 | 0.840980 | 失败 |
| 2 | 1/4 | 3.5416% | 68.6719 | 0.829512 | 失败 |
| 2 | 1/2 | 7.0833% | 71.4063 | 0.778291 | 失败 |
| 2 | full | 14.1665% | **71.6406** | **0.736233** | 失败 |

在预注册的 5% 最大切换率内，最佳 Macro/损失候选为 epoch 1 的 1/2 投影，仍比 scale baseline 低 5.4688 pp，balanced loss 高 16.24%。放宽到超出 5% 的所有候选后，epoch 2 full 是硬结果最好的一项，也仍低 4.6875 pp、loss 高 8.32%。这不是某一个 projection fraction 恰好选错，而是当前 proposal 在 scale endpoint 上整体失准。

### 5.2 最终选择与正式结果

Selector 选择 epoch 0、零 switch；没有变化的候选进入 audit。Summary 中 `audit_gate_passed=false` 的含义是“没有非零候选需要 audit”，不是某个非零候选在 audit 上失败。预注册的 31 条/任务 audit 只记录到 scale baseline/no-op：Macro 74.8387%，balanced loss 0.731766，文本 CE 2.427897。

最终 checkpoint 与 scale-only bit-exact，因此正式结果也完全一致：

| 指标 | 结果 |
|---|---:|
| WikiText2 PPL ↓ | 10.9447565 |
| ARC-Challenge | 53.7543% |
| ARC-Easy | 78.5774% |
| HellaSwag | 77.5443% |
| LAMBADA | 67.5917% |
| PIQA | 79.5430% |
| WinoGrande | 73.3228% |
| Macro-6 | 71.7223% |
| 公共五任务 Macro | 72.5484% |
| 逻辑码率 | 2.1207557 bpp |

状态合同通过：assignment、scale、codebook、normalizer、固定元数据和非目标状态均未改变；fresh reconstruction max error 为 0。

### 5.3 时间与资源

| 阶段 | 时间 | 峰值显存 |
|---|---:|---:|
| Calibration + 8 hard projections | 23,957.27 s（6.65 h） | 31.80 GiB |
| WikiText2 PPL | 55.48 s | 16.76 GiB |
| 六任务 lm_eval | 1,587.22 s（26.45 min） | 15.91 GiB |

首轮 gate 诊断 run 用时 17,755.24 s（4.93 h）。该失败运行也保留在紧凑 JSON 中，避免重复踩到“full 先过才看 sparse”的逻辑错误。

## 6. 结论

Hard checkpoint handoff 确实修复了 V9 的一种失败：assignment 训练没有再污染 scale，最终可以无损回滚。但它没有得到比 scale-only 更好的组合端点。更强的结论是，一阶局部功能方向在 scale endpoint 上严重高估可部署收益：98.20% 的向量看似存在下降方向，而所有硬集合都退化。

因此，当前证据只支持把 scale 与 assignment 视为同一 VQ 表示中的竞争性适应接口：scale 是当前最强任务端点，assignment-only 是较低语言漂移的独立 Pareto 分支，二者不能在现有 proposal 下写成可叠加主方法。下一步若继续方法研究，应改变 proposal 的信息结构，例如加入 scale-conditioned curvature 或跨 batch/任务梯度一致性，而不是扫描学习率、group size、投影比例或 seed。

## 7. 结果位置

- 紧凑结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260829_184500_llama3_1_8b_scale_hard_assignment_repair_complete.json`
- 正式运行目录：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_scale_hard_assignment_repair/20260829_103928_llama3_1_8b_scale_hard_assignment_repair_projection_l28_31_gpu5`
- 诊断运行目录：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_scale_hard_assignment_repair/20260829_043304_llama3_1_8b_scale_hard_assignment_repair_l28_31_gpu7`
