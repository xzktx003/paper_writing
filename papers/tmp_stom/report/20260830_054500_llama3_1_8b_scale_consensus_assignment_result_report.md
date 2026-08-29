# Llama-3.1-8B 四视图梯度共识 Assignment 正式实验报告

时间：2026-08-30 05:45（Asia/Shanghai）

## 1. 实验目的

V10 在已审计的 scale 硬端点上发现：98.20% 的六维量化向量都能从当前码字的 8-way 附近领域中找到负一阶邻居，但两轮共八个真实 hard projection 全部退化。单个聚合梯度对七个邻居取最小值，会把采样噪声和任务冲突放大成近乎必然的“负方向”。本实验不扫描 seed、学习率、group size 或投影比例，只检验一个可证伪机制：要求同一邻居在互斥数据视图中一致下降，能否把 V10 的虚假 proposal 转化为非零可部署收益。

## 2. 实验原理

以冻结的 scale 硬状态

$$
\hat w_i=s_{g(i)}c_{a_i}
$$

为锚点。完整训练数据确定性划分为四个互斥视图；每个任务在每个视图中保留相同样本数，文本按行轮转分片。对视图 $v$、邻居 $c$ 定义

$$
\Delta_i^{(v)}(c)=\langle g_i^{(v)}\odot s_{g(i)},c-c_{a_i}\rangle.
$$

邻居只有在所有视图中都满足 $\Delta_i^{(v)}(c)<0$ 才有资格成为 alternative；若有多个合格邻居，则最小化最差视图分数

$$
c_i^\star=\arg\min_c\max_v\Delta_i^{(v)}(c).
$$

没有共同下降邻居的向量令 alternative 等于 anchor，因而权重扰动精确为零。通过这一 proposal 后仍采用与 V10 完全相同的 binary Concrete 训练、两轮 1/8、1/4、1/2、full 硬投影、任务/text Gate 和独立 audit；因此 V10 与 V11 的差异只来自 proposal 信息结构。

## 3. 实验配置

| 项目 | 配置 |
|---|---|
| 模型 | Meta-Llama-3.1-8B-Instruct |
| 源 checkpoint | 已审计 task group-scale endpoint |
| 表示 | $d=6$，$K=4096$，group size 160，共享码本，2.1207557 bpp |
| 训练层 | 28--31，每层 7 个 Linear |
| Proposal | 当前码字 8-way 邻域；4 个互斥、任务分层 gradient views |
| 每个 proposal view | 每任务 128 条，共 640 条任务样本；1024 条长文本 |
| 任务 train/validation/audit | 每项 512/256/31；audit offset 1088 |
| 文本 train/validation/audit | rows 0--4095 / 4736--4863 / 5504--5567 |
| 文本长度 | 4096 |
| Epoch / LR | 2 / 0.005 |
| 最大切换率 | 5% |
| 评测门禁 | 非零候选先通过 validation、candidate-unexposed audit 与状态合同，才运行正式 PPL/lm_eval |
| 正式 PPL 协议 | WikiText2 raw test，seqlength 2048，batch 1 |
| 正式准确率协议 | lm_eval 0.4.4，0-shot，全量 ARC-C/E、HellaSwag、LAMBADA、PIQA、WinoGrande |
| GPU | 本机物理 GPU5，单卡 |
| 扫描 | 无 seed、LR、group、候选数或投影比例扫描 |

任务 audit 在 V10 中读取过 baseline，但从未暴露给任何 changed candidate；本文称其为“candidate-unexposed”，不称 fresh。文本 audit rows 5504--5567 是本轮新扩展窗口，缓存前 5504 行与旧缓存 bit-exact。

## 4. 实验步骤

1. 校验 scale source 已完成、通过 audit，且 assignment/codebook 不变、group scale 为 FP16、逻辑码率固定。
2. 将 2560 条任务训练样本和 4096 条文本训练样本划分为四个互斥视图；所有样本恰好使用一次。
3. 对四个视图分别计算 layers 28--31 的权重梯度；只保留跨视图共同下降的当前码字邻居。
4. 冻结 scale、codebook 和 normalizer，只训练 assignment binary switch 两轮。
5. 对每轮的 1/8、1/4、1/2、full 共八个真实 int32 投影逐一评估。
6. 若没有 changed endpoint 通过 validation Gate，则回滚为源状态，不让 audit 或正式 test 参与失败候选选择。
7. 校验最终 logical state、固定元数据与重构精度。只有非零候选被接受时才运行新的正式 PPL/lm_eval。

## 5. 实验结果

### 5.1 共识筛选修复了约一半虚假许可

| Proposal 统计 | 结果 |
|---|---:|
| 总向量数 | 145,465,344 |
| 聚合梯度下存在负邻居 | 98.1973% |
| 四视图严格共识合格 | 48.7101% |
| 合格向量 | 70,856,267 |
| 无共识、精确冻结向量 | 74,609,077 |
| 28 个 Linear 共识率范围 | 37.4745%--74.9129% |
| 选中邻居加权平均一阶变化 | $-3.1715\times10^{-7}$ |
| 选中邻居加权平均最差视图变化 | $-1.8309\times10^{-7}$ |

严格共识候选池只有聚合负方向池的 49.60%。因此 V10 的 98.20% 确实约有一半来自跨数据视图不稳定；共识不是无效过滤器。然而，剩余 48.71% 仍是一个极宽的离散可行域，远不能保证有限步或集合级改善。

### 5.2 八个真实硬投影仍全部失败

| Epoch | 投影 | 切换率 | Validation Macro $\uparrow$ | Balanced loss $\downarrow$ | 相对 scale Gate |
|---:|---:|---:|---:|---:|---|
| -- | scale baseline | 0 | **76.3281%** | **0.679691** | 基准 |
| 1 | 1/8 | 0.6980% | 65.6250% | 0.902381 | 失败 |
| 1 | 1/4 | 1.3961% | 67.6563% | 0.904748 | 失败 |
| 1 | 1/2 | 2.7921% | 69.6094% | 0.821650 | 失败 |
| 1 | full | 5.5843% | 68.5938% | 0.862776 | 失败 |
| 2 | 1/8 | 1.0126% | 64.2969% | 0.930973 | 失败 |
| 2 | 1/4 | 2.0252% | 66.4063% | 0.918392 | 失败 |
| 2 | 1/2 | 4.0503% | 71.3281% | 0.775270 | 失败 |
| 2 | full | 8.1007% | **73.9063%** | **0.727951** | 失败 |

在预注册 5% 切换率内，最好的 changed endpoint 是 epoch 2 的 1/2 投影，Macro 仍低 5.00 pp，loss 高 14.06%。放宽速率看所有点，epoch 2 full 比 V10 最佳 changed endpoint 提高 2.2656 pp，loss 降低 1.12%，说明共识筛选改善了 proposal 质量；但它仍比 scale baseline 低 2.4219 pp，loss 高 7.10%，无法部署。

### 5.3 最终状态与正式测试

选择器返回 epoch 0、零切换；没有 changed candidate 进入 audit。最终任务 audit 与 baseline 相同：Macro 74.8387%，balanced loss 0.731766；新文本 audit CE 为 2.440649。

Assignment、group scale、codebook、normalizer、固定元数据、逻辑码率和非目标状态均保持精确；fresh reconstruction 最大误差为 0。输出文件因增加实验元数据而哈希不同，但部署张量与 scale source 完全一致。

预注册协议规定，只有非零候选通过内部 Gate 才运行新的正式 benchmark。本轮没有 changed checkpoint，因此没有重复执行一份数值必然相同的 WikiText2/lm_eval。最终端点沿用已完成并有原始 JSON 的 scale-source 正式结果：PPL 10.9447565，Macro-6 71.7223%，公共五任务 72.5484%，2.1207557 bpp。这是“相同部署状态的结果复用”，不是一次新的独立测量。

### 5.4 时间与资源

完整校准、两轮训练与八个硬投影耗时 24,078.20 秒（6.688 小时），PyTorch 峰值分配 34,149,809,664 bytes（31.80 GiB）。只使用一张 A100 GPU；终端正常退出，`pipeline.status=calibration_noop`。

## 6. 机制结论

V11 区分了两个此前混在一起的误差来源：

1. **跨数据视图符号冲突真实存在。** 严格共识把候选池约减半，并改善最佳 changed endpoint。
2. **符号共识仍不是离散可信域。** 四个视图都预测负的一阶项，仍不能覆盖码字有限跳转的二阶曲率和多个切换共同作用的交叉项。

因此，不再继续把 assignment 当作 scale 后的可叠加主模块，也不扫描训练超参数。若后续再次开启这一方向，唯一有方法依据的入口是显式估计候选有限步二阶代价以及集合交互，而不是增加视图数或调松 Gate。

## 7. 产物与校验

- 紧凑结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260830_054500_llama3_1_8b_scale_consensus_assignment_complete.json`
- 原始 summary：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_scale_consensus_assignment/20260829_222233_llama3_1_8b_scale_consensus_assignment_l28_31_gpu5/calibration_summary.json`
- 原始 summary SHA256：`15762e01f18d459b65681dc8c618a448eff04543ee7ec681ca69f1830bacc201`
- 输出 checkpoint SHA256：`e8d91749bdf6f3bc2d6c4de0c49d201dc57bcec21cf606c6f09503e5802c8b68`
- 源 checkpoint SHA256：`2f5970ece14d4f23295cac7993fb8de2273d9241d51b289717725fdaf1db3c2e`
- Token cache SHA256：`ee8acec64b7daa9584cf72a6f1a32b31adc3abdf7bc9d4e29c0d8006a3a50dcb`
