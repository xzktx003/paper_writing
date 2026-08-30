# V14 顶会叙事与文章组织调研

时间：2026-08-30

## 1. 调研范围与证据来源

本版按`papers/research_taste.md`的“现象—机制—最小干预—真实证据—诚实边界”顺序重构，不把失败结果包装成
新SOTA。外部写作结构只参考正式论文页或作者开源仓库：

- AQLM（ICML 2024）：[论文](https://openreview.net/pdf?id=5mCaITRTmO)。Figure 1先给模型规模--PPL Pareto，
  Introduction从极低比特的真实部署困难推进到input-adaptive additive quantization与block joint optimization，
  最后以kernel和端到端生成闭环。
- QuIP#（ICML 2024）：[PMLR正式页面](https://proceedings.mlr.press/v235/tseng24a.html)。摘要采用三项技术链，
  每一项分别回答incoherence速度/理论、球形分布与码本shaping、端到端fidelity，随后报告质量与推理速度。
- QTIP（NeurIPS 2024）：[正式论文页](https://proceedings.neurips.cc/paper_files/paper/2024/hash/6de2e84b8da47bb2eb5e2ac96c63d2b0-Abstract-Conference.html)。
  摘要以“VQ码本随维度指数增长”这一具体资源墙导出trellis code；Introduction先量化实际内存带宽，再说明
  VQ高维的指数复杂度，方法因此具有必然性。
- QuIP（NeurIPS 2023）：[正式论文页](https://proceedings.neurips.cc/paper_files/paper/2023/hash/0df38cd13520747e1e64e5b123a78ef8-Abstract-Conference.html)。
  先提出weight/Hessian incoherence这一可检验现象，再自然导出随机正交预处理与adaptive rounding。
- PV-Tuning（NeurIPS 2024）：[正式论文页](https://proceedings.neurips.cc/paper_files/paper/2024/hash/091166620a04a289c555f411d8899049-Abstract-Conference.html)。
  将离散量化变量的直接优化作为核心对象，因此V14不能把“训练assignment”本身写成首次贡献。
- GSQ（2026预印本）：[arXiv](https://arxiv.org/abs/2604.18556)与
  [官方仓库](https://github.com/IST-DASLab/GSQ)。它以scalar kernel兼容性和可扩展性对比VQ/trellis路线；
  由于尚非已确认顶会论文，本版只作相关工作与实验协议参照，不把其叙事当作接收先验。

Exa检索在本轮返回429，后续证据改用上述官方论文页与作者仓库；没有引用聚合博客或跨模型二手表格。

## 2. V14应该独立成立的Figure 1现象

V13的Figure 1是“任务条件搜索成功、held-out文本门禁失败”。V14不能只把门禁提前后再讲一遍。新的独立观察是：

> 在固定的28个局部assignment bundle上，27个能改善task train，但这27个的完整text-train CE全部上升；
> 零退化文本可行域在进入validation之前已经为空。

Figure 1左图用task gain--text CE增幅散点直接显示空象限，右图给出`28 → 27 → 0 → 0`漏斗。该现象可被
单个text-nonregressing task-improving候选反证，符合`research_taste.md`对可证伪观察的要求。

## 3. 标题、摘要和Introduction的段落职责

### 标题

采用结论式标题“任务收益不是语言保持方向：2-bit Block-Scaled VQ中Assignment局部可行域的坍塌”。避免
“Text-Constrained SAGE-VQ”式方法命名，因为V14没有产生新部署端点。

### 摘要（一个紧凑段落，约350--450中文字符）

1. 资源问题：2-bit VQ需要在硬assignment空间恢复质量；
2. 既有缺口：V13真实task gain仍破坏text validation；
3. 最小干预：固定候选，使用完整text-train CE定义零退化可行域；
4. 核心数字：27/28 task-improving，0/27 text-feasible；
5. 终态：0 switch、无checkpoint/validation/test；
6. 边界：问题在当前动作空间，不是全局不可能性。

### Introduction（六段）

1. 解释极低比特VQ中“局部assignment自由度”的诱惑与硬索引交互；
2. 交代block scale、共享码本、Vector-GPTQ硬锚点，使问题对象自包含；
3. 用V10--V13的证据链排除“一阶噪声、共识不足、曲率不足、集合计分不足”；
4. 提出V14唯一问题：把文本保持设为不可交易约束能否保留非零task gain；
5. 报告27/28与0/27及最小0.00785%代价，解释局部可行域为空；
6. 三条贡献只覆盖feasibility test、正式负观察、下一动作空间边界。

## 4. Method与Experiment的组织

Method不应按Q/K/V/O/MLP训练顺序写。顺序只是执行合同。章节按数学对象组织：

1. block-scaled shared-codebook VQ与Vector-GPTQ锚点；
2. 当前码字8-way邻域和固定bundle proposal；
3. text-constrained词典序可行域；
4. 完整文本prefix cache与精确chunked CE；
5. train/validation/audit的不可见性和fail-closed终态。

Experiment按问题组织，而不是按日志时间：

1. cache重放是否可信；
2. task gain是否真的存在；
3. task gain与text保持是否有交集；
4. 结果为什么不是部署端点；
5. 结论在哪些范围外不成立。

## 5. 禁止的过度声明

- 不写“assignment refinement不可能”，只写固定V13 bundle、最后四层和零退化CE下不可行；
- 不把零switch称为成功模型，也不复用source PPL/lm_eval作为V14结果；
- 不声称超过QTIP或GSQ；两者的正式/开源结果只定义比较标准；
- 不把8行cache parity写成4096行逐行完整模型校验；完整数据参与目标，parity抽检覆盖8行；
- 不把top-k teacher CE称为完整dense分布CE；它对给定截断teacher分布的词表归一化是精确的；
- 不把最小0.00785%退化解释为“可以忽略”，因为本版预注册预算就是零；也不事后扫描非零预算。

## 6. V14对下一版的约束

V14已否决在同一固定bundle集合内仅靠重排序寻找零退化端点。下一版若继续assignment主线，必须改变动作空间且先提出
有原理的非空可行性检验；候选是跨Linear成对补偿，而不是放宽text budget或做更小bundle网格搜索。若独立
审稿仍判定缺乏可用方法和跨模型证据，则论文总体定位应收缩为task-adapted VQ的机制与失败边界。
