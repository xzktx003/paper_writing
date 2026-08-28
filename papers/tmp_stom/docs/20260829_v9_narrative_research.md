# V9 顶会行文调研与故事重构

时间：2026-08-29

目标：把 V8 的“两种坐标不等价”推进到 V9 的“同步软联合为何不等于可部署坐标组合”，同时避免与已有连续—离散交替优化工作重复宣称。

## 1. 参考论文的章节功能

### PV-Tuning（NeurIPS 2024）

官方论文：<https://proceedings.neurips.cc/paper_files/paper/2024/file/091166620a04a289c555f411d8899049-Paper-Conference.pdf>

- Introduction 不从算法细节开始，而是先拆开“量化表示”与“学习表示的算法”，再指出社区过度投入 one-shot 表示、忽略微调优化的不对称。
- 第 3 节按“问题定义→常见方法的限制→替代算法→实现近似”展开；继续方法正式化和离散子空间不是两个并列模块，而是由同一优化失效自然导出。
- Figure 1 直接给出质量—大小 Pareto，不先画流水线。实验先验证优化方式，再扩展到多种表示和模型。
- 对 V9 的硬边界：PV-Tuning 已经明确将 scale/codebook 等连续变量与 assignment 等离散变量做交替/坐标优化。因此“先连续、再离散”本身不能作为本文首创。本文只能把新意放在固定共享码本下的 block scale—当前码字附近领域、任务功能定向、真实 hard deployment 失配与单次 audit 闭环。

### AQLM（ICML 2024）

官方页面：<https://proceedings.mlr.press/v235/egiazarian24a.html>

- 摘要用一句话给出经典 Additive Quantization 视角，紧接两项真正差异化的创新：输入自适应表示与 Transformer block 级联合优化。
- 论文不仅报 PPL，还把准确率—模型大小 Pareto 和 GPU/CPU 推理放到主结论。这说明 V9 必须严格区分“逻辑 bpp 不变”和“已实测速度”。
- 对 V9 的启发：用一个表示结构导出少数核心问题，而不是把 VQ、GPTQ、scale、Concrete、audit 写成 A+B+C 模块清单。

### QuaRot（NeurIPS 2024）

官方论文：<https://papers.nips.cc/paper_files/paper/2024/file/b5b939436789f76f08b9d0da5e81af7c-Paper-Conference.pdf>

- 先给出 outlier 是低比特失效来源，再由计算不变性导出旋转，方法仅分为浮点等价改写和后续量化两阶段。
- 消融不是随机参数穷举，而是分别回答 RTN/GPTQ、group-wise、KV cache、Hadamard 与随机正交变换各自承担的因果问题。
- 附录直接报告 Inf/NaN 失败区域。V9 因此应把 naive joint 的被支配结果放入主表和 Figure 1，不隐藏到附录。

## 2. V9 的现象句与 Figure 1

一句话现象：

> 在 block-scaled 2-bit VQ 中，连续 scale 与局部 assignment 可以分别改善任务，但把它们放入同一软松弛后，scale 会补偿尚未部署的 assignment mixture；hard projection 一旦改变 mixture，两个坐标同时退化。

Figure 1 必须两幅并列：

1. 正式 PPL--Macro-6 端点图：anchor、teacher-only、assignment、scale、naive joint 与 QTIP；
2. 硬部署 validation 诊断：独立 scale/assignment 都好于 joint hard，而 joint 里的零-switch scale 甚至低于 anchor。

这两幅图一起把“负结果”变成对失配位置的可证伪定位。

## 3. V9 各章节与段落职责

### Abstract（1 段）

1. 极低比特 VQ 的连续/离散部署变量；
2. 常见但未验证的“联合训练自然互补”假设；
3. 独立坐标与 naive joint 的核心数字；
4. 零-switch joint scale 的反证定位软—硬补偿；
5. 导出部署态坐标原则，但明确分阶段修复尚未完成正式验证。

### Introduction（6 段）

1. 从“压缩后已有哪些可部署变量”进入，不先说 Concrete；
2. 说明 continuous/discrete 同存但联合不必然可交换；
3. 给出独立 scale/assignment 的非均匀性；
4. 给出 naive joint 被 scale 支配的 surprising failure；
5. 用零-switch hard state 定位软—硬失配，引出 deployment-aligned principle；
6. 三条与证据一对一的贡献，最后一条是诚实边界。

### Related Work（3 段）

1. 极低比特表示和二阶初始化；
2. 连续—离散量化微调，以 PV-Tuning 作最直接先验，明确不声称首次坐标交替；
3. 任务适应与通用 PTQ 监督边界。

### Method（7 小节）

1. Block-scale 后共享码本 VQ；
2. Hessian-aware Vector-GPTQ 硬锚点；
3. 独立 scale 坐标；
4. 当前码字附近领域 assignment；
5. naive simultaneous joint 的软参数化；
6. 一个补偿—投影失配命题，只给充分条件/机制解释，不冒充普遍定理；
7. loss Gate、单次 audit 与部署合同。

### Experiments（用问题组织）

1. 两坐标是否等价？
2. 同步 joint 是否互补？
3. 失配发生在 soft 训练还是 hard 部署？
4. 附近领域为何还需稀疏 hard trust region？
5. 正结果是否需要任务标签？
6. 与 GSQ/QTIP/PV-Tuning 能声称什么，不能声称什么？
7. 训练成本、逻辑 bpp 与缺少 kernel 的边界。

## 4. V9 不可声称的事

- 不能声称首次交替连续与离散量化变量；PV-Tuning 已有更一般的正式化与收敛分析。
- 不能声称 naive joint 是主方法或 Pareto 改进；它被 scale-only 严格支配。
- 不能用 task-scale 72.55% 宣称超过通用 QTIP/GSQ，监督不同。
- 不能把逻辑 bpp 不变等同于推理加速；当前没有定制 kernel 吞吐数据。
- 不能把单模型、最后四层的观察推广到所有 VQ 架构。

## 5. 对 V10 的最小方法导出

V9 的证据只允许导出一个最小修正：先固化独立 scale 的真实 FP16 部署 checkpoint，再以它为锚点重算功能梯度和当前码字邻域，只学习稀疏 hard assignment repair。这与 PV-Tuning 在广义上都属坐标优化；本文后续若要形成差异化，必须靠“固定共享码本+当前码字附近领域+任务功能定向+部署态 hard Gate+一次全新 audit”的特定闭环，而不是交替顺序本身。
