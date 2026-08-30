# SAGE-VQ V14 独立 ICLR 主会风格评审

时间：2026-08-30

## Summary

本文研究 2-bit block-scaled shared-codebook VQ 中，Vector-GPTQ 硬锚点之后的局部 assignment bundle 是否
存在“既改善任务、又不损害语言保持”的可用方向。V13 已发现固定 curvature top-128 bundle 的因果条件搜索
可以得到真实 task-train gain，并改善 held-out task loss，但会导致 text validation CE 恶化。V14 进一步把
文本保持从加权项/事后 gate 改为不可交易的 train-time 可行性约束：只有 task-train objective 严格改善且
完整 text-train 数据上固定 top-32 teacher 分布的 exact full-vocabulary CE 不增加的 bundle 才可接受。

正式结果为清晰负观察：固定 28 个 V13 bundle，27/28 个严格改善 task-train objective，但 0/27 满足
text-train CE 零退化；accepted switches=0。程序未访问 validation/audit/formal test，未写 checkpoint。
论文将结论限定为当前模型、最后四层、固定 top-128 bundle 粒度和零文本退化约束下的局部可行域坍塌。

总体上，V14 比 V13 的问题定义更锋利，claim 边界也更成熟。它是一个严谨的机制性负结果，但仍缺少可部署
新端点、跨模型证据和正向方法收益。按 ICLR 主会方法论文标准，建议 **Weak Reject / Borderline Reject**。

## Strengths

1. **核心观察清晰且可证伪。** “27/28 task-improving，但 0/27 text-feasible”是一个干净现象。只要一个
   候选同时满足 task gain 和 text non-regression，核心结论就会被推翻；正式实验没有观察到。
2. **V13 审稿意见落实较好。** V13 建议把 text guard 从加权目标或事后 validation gate 改为 lexicographic
   constrained acceptor。V14 按此完成，并固定候选，不做 seed、bundle、阈值、LR 或 group 扫描。
3. **协议纪律强。** 搜索失败后没有偷看 validation/audit，也没有复用 source PPL/lm_eval 冒充 V14 新结果。
4. **计算合同可信。** Task cache parity 为 32 例、最大 score error `1.1444e-05`、argmax 32/32；text cache
   parity 为 8 行、最大/平均 CE error 为 0。报告、论文和 JSON 数字一致。
5. **叙事符合研究品味。** 论文以可画为 Figure 1 的现象为中心，而不是堆方法模块；负结果边界清楚。

## Weaknesses

### Fatal Weaknesses

1. **没有产生可部署端点。** V14 最终 0 switch，没有 checkpoint、PPL、lm_eval、validation 或 audit。因此
   它不能作为新压缩方法与 QTIP/GSQ/AQLM/QuIP# 竞争。若作为主会方法论文，这是最致命短板。
2. **贡献仍是诊断性负结果，而非正向算法。** Text-constrained filtering 是合理实验，但不是强方法创新。
   论文证明当前固定 bundle 空间为空，却没有给出新的非空 action space 或可部署改进。

### Major Weaknesses

1. **零退化约束可能过严。** 最小 text CE 相对上升只有 +0.00785%。作者正确地没有事后扫描阈值，但审稿人
   仍会追问：零预算是机制探针还是实际部署需求？若允许预注册的 0.01% 预算，是否已有候选并通过 held-out？
2. **实验范围窄。** 只有 Meta-Llama-3.1-8B-Instruct、最后四层、固定 V13 top-128 bundle，不能外推到
   全模型、Base、LLaMA-2、70B、更小 bundle、single-switch 或跨层组合。
3. **不能否决所有 scorer/接受规则。** V14 只能否决在固定 V13 bundle 与零退化约束下通过同一动作集合
   重排序找到非零端点；其他粒度、非零预注册预算与补偿组合仍未检验。
4. **理论仍是解释性。** 论文指出 action space 问题，但尚无补偿动作产生非空可行域的充分/必要条件，也未
   分析 task/text 梯度夹角、Pareto frontier 或 bundle 粒度效应。

### Minor Weaknesses

1. 原始摘要中“完整 text-train teacher CE”可能被误解为 dense teacher full-distribution CE，应明确为固定
   top-32 teacher 分布上的 exact full-vocabulary CE。
2. Figure 1 应说明 27 个点是在 task-improving 后才计算 text CE，layer-29 q_proj 未进入文本计算。
3. LaTeX related work 中有一个英文句点格式问题。

## Questions for Authors

1. 零退化 CE 约束的实际部署含义是什么？它是必要性探针，还是最终部署也必须满足的硬约束？
2. 若独立预注册 0.01% 等极小非零预算，是否会产生非零 endpoint，并通过 held-out validation/audit？
3. 0/27 是否来自 bundle 粒度过粗？Single-switch 或更小结构是否可能存在可行方向？
4. 早层/中层是否可能有更好的 task/text trade-off？
5. Top-32 teacher CE 与 dense distribution CE、WikiText2 PPL 和生成质量的相关性如何？

## Required Revisions

1. 摘要明确固定 top-32 teacher 分布与 exact full-vocabulary CE。
2. 收紧“否决 scorer/接受规则”为“否决在固定动作集合内仅靠重排序获得零退化端点”。
3. 明确零退化是机制性 feasibility probe，不是现实部署唯一阈值。
4. 给出下一 action space 的最小 train 可行性条件，之后才允许 validation/audit。
5. 图注说明 layer-29 q_proj 因 task gain 为负而未计算 text CE。

## Scores

| 维度 | 分数 / 10 | 说明 |
|---|---:|---|
| 写作 | 8.0 | 主线清晰、边界诚实；需精确区分 top-k teacher CE |
| 创新 | 5.5 | 词典序约束实验合理，但不是强算法创新 |
| 实验 | 5.5 | 协议严谨、数字可信；但单模型/四层/无 endpoint |
| 理论 | 4.5 | 机制解释清楚，但缺补偿动作的理论条件 |
| 可复现性 | 8.5 | JSON、报告、cache parity、终态合同充分 |
| 总体 | 5.5 | 强负结果诊断；作为方法论文仍不足 |

## Final Recommendation

**Weak Reject / Borderline Reject，5.5/10，置信度 0.80。**

V14 已把故事从“又一次 assignment 失败”提升为明确机制边界：当前固定 local assignment bundle 空间里，
task gain 丰富但 text-zero-cost 方向为空。这是有价值的负观察，写法克制、证据可信。但主会接收通常还需要
正向方法收益、跨模型稳定性，或更强的社区级反直觉结论；当前稿件仍没有可部署端点。

## 作者后审修订记录

本次独立评审后，V14 在不改变实验或结论的前提下完成以下事实与边界修订：

- 摘要、引言与结论统一改为“固定 top-32 teacher 分布上的 exact full-vocabulary CE”；
- 将“否决 scorer/接受规则”收紧为“否决在同一固定动作集合内仅靠重排序寻找零退化端点”；
- 明确零预算是无交易方向的机制 probe，非零容忍度必须另行预注册；
- Figure 1 图注明确 layer-29 q_proj 因 task gain 为负未进入文本计算；
- 新动作预注册条件写为 train 上 $G_{\rm task}(A)>0$ 且 $T(S\cup A)\le T(S)$，之后才能访问 held-out。

这些修改提高了表述精度，但不修复“无部署端点、单模型最后四层、缺正向方法”的核心拒稿原因，因此总体
评分保持 5.5/10。

独立审稿人对上述五项修订复核结论为 `PASS`；随后仅补齐中文稿结论的 top-32/full-vocabulary 限定并统一
“评分器/动作空间”的中文标题，不改变评分或实验结论。
