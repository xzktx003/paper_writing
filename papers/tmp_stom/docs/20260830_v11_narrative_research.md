# V11 顶会行文调研与故事重构

时间：2026-08-30

## 1. 检索范围与直接先验

本版通过 Agent Reach / Exa 检索并核对顶会原始论文，重点不是寻找可以套用的术语，而是分析强论文如何把“失败假设—机制证据—最小方法”组织成闭环。

### GPTQ（ICLR 2023）

论文：<https://arxiv.org/abs/2210.17323>；代码：<https://github.com/IST-DASLab/gptq>

GPTQ 的引言先给出大模型推理的资源墙，再指出已有逐权重二阶方法无法扩展，随后用“统一列顺序、lazy batch update、Cholesky”三步把精度问题和运行效率同时闭环。对 V11 的启发是：一阶符号失准不能只写成实验噪声；必须说明缺失的量——有限码字跳转的二阶代价——为什么正好对应失败现象。实验也应先验证机制，再报告最终端点和成本。

### AQLM（ICML 2024）

论文：<https://proceedings.mlr.press/v235/egiazarian24a.html>

AQLM 从极低比特表示能力不足出发，用加性码本与 block-level refinement 回答同一个问题，并以质量—模型大小 Pareto 验证。对 V11 的约束是：block scale、Vector-GPTQ、Concrete 与共识不能写成四个平行创新。论文的唯一主轴应是“部署坐标上的局部信号是否能预测真实离散步”。

### PV-Tuning（NeurIPS 2024）

论文：<https://proceedings.neurips.cc/paper_files/paper/2024/file/091166620a04a289c555f411d8899049-Paper-Conference.pdf>

PV-Tuning 先质疑极端量化中未经理解的 STE，再系统比较量化感知微调策略，最后提出连续 value 与离散 partition/code 的交替优化。它已经覆盖“训练 assignment”“真实梯度离散步”和“连续—离散坐标”。V11 不能以这些一般概念声称新颖；可辨识贡献只能是：在固定 block-scaled shared-codebook VQ 中，直接测出聚合负方向、跨视图共识和硬部署成功之间的漏斗，并据此否定符号一致性作为充分可信域。

### QTIP（NeurIPS 2024 Spotlight）

论文：<https://proceedings.neurips.cc/paper_files/paper/2024/file/6de2e84b8da47bb2eb5e2ac96c63d2b0-Paper-Conference.pdf>；代码：<https://github.com/Cornell-RelaxML/qtip>

QTIP 从低维 VQ 的码本指数爆炸切入，以 trellis、incoherence 和硬件友好 code 形成“表示—算法—系统”闭环。对 V11 的启发是：当前工作没有真实 kernel，不能把 2.1208 bpp 写成吞吐优势；QTIP 仍是更强的通用 PTQ 质量/系统参照。任务标签适应后的准确率更高也不能写成同监督 SOTA。

## 2. V11 的新观察

一句话现象：

> 四个互斥数据视图的严格符号共识把一阶可提议向量从 98.20% 减到 48.71%，并改善了最佳 changed hard endpoint；但八个真实投影仍全部低于冻结 scale，说明跨视图冲突解释约一半虚假许可，剩余失败必须由有限步曲率与集合交互解释，而不能继续归因于梯度噪声。

这比 V10 的“98.20% 对 0/8”多了一层机制辨识：

1. 若共识几乎不减少候选，min-of-neighbors 偏差假设会被否定；实际候选约减半，说明该偏差真实存在。
2. 若共识后出现非零通过点，则符号稳定性是足够的最小修复；实际仍 0/8，否定这一充分性。
3. V11 因而把下一问题从“曲率或一致性”收缩为“曲率与集合交互”。

## 3. 章节职责

### 标题与摘要

标题陈述可证伪结论“符号一致仍非离散可信域”，不把共识包装成成功算法。摘要依次写资源场景、V10 失败、四视图干预、48.71% 与 0/8 的核心数字、最终安全回滚及下一机制。

### Introduction

1. 约 2-bit VQ 暴露 scale 与 assignment 两种部署坐标；
2. 单坐标可训练不等于组合可部署；
3. V10 的 98.20% 暗示 aggregate-gradient min selection 偏差；
4. 导出唯一最小干预：互斥、任务分层四视图严格共识；
5. 给出“筛掉一半但仍 0/8”的 surprising result；
6. 贡献限定为机制辨识、部署合同和负结果，不声称新 Pareto。

### Method

保留一条链：block scale 共享 VQ → Hessian-aware Vector-GPTQ 硬锚点 → scale/assignment 坐标 → hard handoff → 单聚合梯度偏差 → 四视图 robust proposal → hard projection Gate。共识公式必须明确“同一邻居在每个视图都负”与“最小化最差视图”，并解释无共识时的精确冻结。

### Experiments

以问题组织：共识是否真的过滤冲突？是否改善 hard endpoint？是否越过 source？最终状态与正式测试如何解释？成本和失败边界是什么？Figure 1 左侧画 98.20→48.71→0 的漏斗，右侧画 V10/V11 全部 hard points 与 scale baseline。

## 4. 不可声称的事

- 不能声称四视图共识改善最终质量；最终仍是 no-op。
- 不能声称所有 assignment 适应都无效；assignment-only 仍是独立 Pareto 分支。
- 不能声称曲率已被直接测量；V11 只排除了“跨视图符号冲突足以解释失败”。
- 不能声称超过 QTIP；监督、码率和部署实现不同。
- 不能把复用 scale-source 正式指标写成一次新 benchmark run。
- 不能继续通过增加视图数、调整 LR、group、seed 或 projection ratio 延长该路线。

## 5. V12 的最小研究门槛

V11 已按 V10 审稿建议完成 gradient-consensus 分支且仍 no-op。下一版若继续方法实验，必须直接估计每个有限码字步的 scale-conditioned Hessian/Gauss--Newton 代价，并在训练前证明该分数能区分真实 hard loss；否则停止 assignment-after-scale 路线，把论文收束为部署坐标选择与代理失效研究。第二模型和同监督外部基线只有在出现非零新端点后才值得投入完整算力。
