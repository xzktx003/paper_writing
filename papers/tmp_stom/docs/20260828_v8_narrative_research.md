# V8 顶会论文叙事研究记录（2026-08-28）

## 目标

V8 不沿用“再增加一个训练模块”的写法，而按 `research_taste.md` 的现象—机制—最小干预—真实 Pareto 顺序重构。研究问题是：同一 2-bit block-scaled VQ checkpoint 已经包含连续 group scale 与离散 codeword assignment 两种可部署坐标，它们是否承担不同的任务适应功能？

## 参照论文与可迁移的叙事结构

| 论文 | 顶会 | 叙事起点 | 方法如何由观察导出 | 对 V8 的具体借鉴 |
|---|---|---|---|---|
| AWQ | MLSys 2024 | 权重重要性高度非均匀，少量 salient weights 决定量化质量 | 用 activation 信号识别关键权重，再做最小的等价缩放保护 | 先展示 scale/assignment 功能非均匀性，再定义坐标特定干预；不从训练流程起笔 |
| QTIP | NeurIPS 2024 | 极低比特误差受表示几何和结构化码约束 | 非相干处理与 trellis 直接针对失效机制 | 把 Vector-GSQ 仅作为硬锚点构造；主贡献放在压缩后适应坐标，不与锚点模块拼盘 |
| PV-Tuning | NeurIPS 2024 | 极低比特离散变量上 STE 不是可靠优化接口 | 连续参数与离散信赖域交替优化 | assignment 章节强调真实硬 index、局部邻域和独立 audit，而不是“使用 Gumbel”本身 |
| LoTA-QAF | NeurIPS 2025 | 量化 checkpoint 的任务微调受格式与部署合并约束 | 用可无损合并的低比特适配变量连接训练与部署 | 明确区分部署零额外 bpp 与适配时间/显存；group-scale 是同格式最强内部公平基线 |

## 章节与段落角色

- 标题：直接给出可证伪发现——同一码率下，两类坐标形成不同 task/PPL Pareto；不堆模块名。
- 摘要（约 180--230 英文词等价信息量）：资源墙 1 句；旧假设 1 句；matched 观察 2 句；统一框架 2 句；核心数字 2 句；边界 1 句。
- 引言（6 段）：极低比特部署场景；任务适应问题；径向 scale/局部 prototype 坐标观察；为何旧 assignment-only 故事不成立；最小统一方法；三条证据化贡献。
- 相关工作（3 段）：通用 PTQ 表示；离散/连续低比特优化；任务适应量化。每段最后一句明确本文边界。
- 方法（5 小节）：问题形式化；硬锚点（压缩写）；连续 scale 坐标；附近领域 assignment 坐标；共享 objective 与单次 audit；机制解释。
- 实验按问题组织：坐标非均匀性是否存在？监督是否必要？assignment 为何必须稀疏？与通用 PTQ 的边界？成本和失败在哪里？
- Figure 1 设计：横轴 WikiText2 PPL，纵轴 Macro-6；标出 source、task-assignment、task-scale、text-only assignment、QTIP 参照。可证伪命题是 assignment 与 scale 不是等价参数化，而是落在不同的质量—任务区域。

## V8 相对 V7 的叙事决策

1. 不隐藏 group-scale-only 明显超过 assignment-only 的结果。
2. 将 block-scale VQ 的表示写成“共享码本原型 × group scale”，自然导出连续尺度与局部原型两种坐标。
3. assignment 的创新仍完整保留：当前码字附近领域、功能梯度选邻居、binary Concrete、稀疏 hard projection、独立 audit。
4. 训练顺序不是贡献；Vector-GPTQ 是锚点构造，不作为主创新排名。
5. V8 不在缺少联合实验时声称连续—离散联合优越，只把联合方法列为下一版必须验证的假设。

## 目标长度

- 中文主稿：约 6,500--8,000 中文字，主表 4--5 个。
- 双栏 LaTeX：摘要 1 段；引言约 1.0--1.3 页；相关工作约 0.6 页；方法约 2 页；实验约 3 页；结论约 0.25 页。
- 当前环境无 LaTeX 编译器，页数仅为结构目标，必须在最终投稿环境复核浮动体和 overfull box。
