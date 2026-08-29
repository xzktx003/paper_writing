# V10 顶会行文调研与故事重构

时间：2026-08-29

## 1. 必须正面承认的最直接先验

### PV-Tuning（NeurIPS 2024）

官方论文：<https://proceedings.neurips.cc/paper_files/paper/2024/file/091166620a04a289c555f411d8899049-Paper-Conference.pdf>

PV-Tuning 已把量化优化形式化为连续 value 参数与离散 partition/index 参数之间的交替坐标更新，并在小子空间里用真实梯度提出离散变化。因此 V10 不能把“连续后离散”“训练 assignment”或“功能梯度候选”单独宣称为新颖。V10 真正可辨识的证据是：在固定共享码本、block scale 与当前码字 8-way 邻域这个具体部署表示中，即便以真实 hard scale checkpoint 交接，98.20% 的负一阶局部方向也不能组成一个改善的 hard assignment 集合。

这要求论文把方法贡献从“又一个 coordinate descent”降为更精确的问题发现：部署坐标是否可叠加，取决于 proposal 在当前硬状态下对集合级损失的预测是否可信。Hard handoff 只是避免 soft compensation 的必要条件，不是充分条件。

### AQLM（ICML 2024）

官方页面：<https://proceedings.mlr.press/v235/egiazarian24a.html>

AQLM 的叙事从极低比特表示能力不足出发，把输入自适应表示和 block-level refinement 写成少数核心差异，并用真实质量—大小 Pareto 支撑主张。对 V10 的启发是：不要把 block scale、Vector-GPTQ、Concrete、projection、audit 写成平行模块。它们应围绕同一问题组织：硬量化表示中有哪些可部署自由度，单独优化和组合优化为何出现不一致。

## 2. V10 的核心现象

一句话现象：

> 在已经任务适应的 scale 硬端点上，98.20% 的局部码字都存在负一阶邻居，但从 0.96% 到 14.17% 的八个真实硬切换集合全部使任务验证退化；一阶可改进性不等于部署集合可改进性。

这个现象把 V9 的“soft--hard 状态失配”推进了一步：即使训练和部署从同一个 hard scale 状态出发，逐向量一阶 proposal 仍可能被曲率与交互项系统性误导。

## 3. 章节职责

### Abstract

1. 一个 VQ checkpoint 同时暴露连续 scale 与离散 assignment；
2. V9 已知同步软联合失败，本版检验最自然的 hard handoff；
3. 给出 98.20% 一阶负候选与八个 hard endpoint 全失败的反差；
4. 给出安全 no-op 与正式 scale-only 结果；
5. 将主张限制为坐标竞争/代理失准，不包装 SOTA。

### Introduction

1. 从“可训练部署坐标不等于可叠加部署坐标”切入；
2. 用单坐标 Pareto 说明问题不是哪个坐标绝对更强；
3. 回顾同步 joint 的补偿失配；
4. 导出 hard handoff 这个最小修复；
5. 用 98.20% versus 0/8 形成 surprising result；
6. 提出当前结论和下一条可证伪假设。

### Method

方法只保留一条链：block-scaled shared-codebook representation → Hessian-aware hard anchor → deployable coordinate interfaces → hard handoff → first-order local proposal → nested hard-set Gate。重点解释逐向量线性项为什么不能保证集合级改善：

$$
\Delta \mathcal L(S)=\sum_{i\in S}g^\top\delta_i+\frac12\delta_S^\top H(\xi)\delta_S.
$$

V10 不把这个式子写成证明当前失败唯一来自 Hessian；它只是给出与数据一致、下一轮可检验的机制。

### Experiments

按问题组织：hard handoff 是否保住 scale？一阶 proposal 是否预测 hard set？稀疏投影是否能修复 full endpoint？最终部署端点是什么？与 QTIP/GSQ/PV-Tuning 能比较什么？

## 4. Figure 1 设计

- 左图：同模型正式 PPL--Macro 端点。Scale-hard repair 与 scale-only 完全重合，说明安全回滚，但没有组合增益；assignment-only 仍是独立低漂移分支。
- 右图：八个 hard projection 的 switch rate--validation Macro 路径。所有点低于 scale baseline；标注 98.20% negative-first-order rate，直接展示“局部线性预测丰富、部署集合收益为空”的矛盾。

## 5. 不可声称的事

- 不能声称 scale 普遍耗尽了 assignment 的所有自由度；只在该模型、最后四层、8-way proposal 和当前监督协议成立。
- 不能声称 hard handoff 方法改善了最终质量；它的正价值是避免破坏并给出可验证 no-op。
- 不能声称首次连续—离散坐标优化；PV-Tuning 已覆盖更一般问题。
- 不能把 98.20% 负一阶率直接解释成 Hessian 因果证明；仍缺二阶统计与跨 batch 梯度一致性测量。
- 不能用 task-adapted scale 与无任务标签 QTIP/GSQ 宣称同监督 SOTA。

## 6. V11 的最小新假设

下一版本不做 seed、LR、group 或投影比例扫描。唯一值得正式检验的新假设是：候选必须在 scale-conditioned 状态下同时满足二阶代价或跨 batch/任务梯度符号一致性，才能进入 binary assignment 训练。若该 proposal 仍回滚，应停止把 assignment 作为 scale 后续模块，并将论文收束为部署坐标选择与代理失效研究。
