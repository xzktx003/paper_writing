# SAGE-VQ V15：独立 ICLR 风格审稿与修订处置

审稿时间：2026-08-31（Asia/Shanghai）
审稿对象：`papers/paper_zh_v15.md`、`template/sage_vq_iclr_v15.tex`、
`sec/sage_vq_v15/*`、正式实验报告、紧凑结果 JSON 与 Figure 1。

## 1. 结论与评分

- Recommendation：**Weak Reject / Borderline Reject**
- Overall：**5.5 / 10**
- Confidence：**0.82**

| 维度 | 分数 |
|---|---:|
| 写作 | 8.0 |
| 创新 | 5.8 |
| 实验 | 6.0 |
| 理论/机制 | 5.6 |
| 可复现性 | 8.3 |
| 总体 | 5.5 |

审稿人认为，V15 比 V14 更像一篇完整的机制负结果论文：V14 证明 assignment-only 的零文本退化
可行域为空；V15 进一步检验最自然的修复，即 hard assignment 后只补偿 touched group scale。补偿降低
了局部 weighted anchor error，并让 26/27 个可比动作的 text regression 下降，但 28/28 paired actions
仍不可行。该结论可信且边界克制，但没有 deployable endpoint，不能作为成功压缩方法或 SOTA 结果。

## 2. 优点

1. V8/V9/V14/V15 的问题递进能够逐步排除坐标等价、soft--hard 失配、assignment-only 动作不足和简单
   局部幅值失配。
2. Hard-first scale compensation 是对 V14 最自然、最小且可证伪的动作空间扩展。
3. 固定 scorer、bundle、seed、group size 与零文本阈值；train gate 失败后不访问 held-out/test，实验
   协议严谨。
4. 负结果不是 no-op：26/27 文本退化降低且 weighted anchor error 下降 1.9477%。
5. Figure 1 正确显示“大多数点向正确方向移动，但仍全部位于零退化边界之上”。

## 3. Blocker

### B1：没有 deployable endpoint（保留）

最终 0 switch、无 checkpoint、无 PPL、无 lm_eval。这是结果本身，不应通过复用 source benchmark 或
放宽 gate 掩盖。论文必须定位为机制边界，而非成功部署方法。

### B2：方法论文口吻过强（已修复）

贡献从“提出 hard-first local scale compensation”改为“检验并否决这一最小动作空间扩展”。摘要和引言
同步改为自然修复解释的可证伪 probe。

## 4. Major 与处置

### M1：“local”与 31.4247% 最大变化的张力（部分修复，限制保留）

论文明确 local 只指支持集。新增 28 个 action 各自组内最大 scale 变化分布：中位数 5.0238%，nearest-rank
p90/p95 为 16.5939%/18.2663%，max 31.4247%。Raw summary 没有持久化 2,133 个 group 的逐组变化，
因此没有把 action-level maximum 分布伪装成 group-level 分位数，并把逐组分布列为复现限制。

### M2：Normalizer 公式缺少 row normalizer 说明（已修复）

统一使用 column normalizer 记号 $r_j$ 与 $w_j=r_j^2$，避免与 codeword $c_k$ 冲突；补充说明 row
normalizer 在同一 row/group 内是公共正比例项，因而从一维 argmin 中抵消。补偿无正 scale 解时按候选
fail closed，而非中断全程。

### M3：机制梯级不够强（已修复）

新增 V8/V9/V14/V15 四行机制表，分别记录问题、正式结果与被排除的简单解释；同时明确该梯级没有证明
下一种高维补偿一定成功。

### M4：Figure 1 位置偏后（已修复）

LaTeX Figure 1 移到主要结果开头，引言在第一次汇报核心结果后显式引用。图注澄清左图是 27 个
task-improving 共同坐标，右图是 V15 全部 28 个 paired actions。

### M5：“完整 teacher CE”存在歧义（已修复）

摘要、引言与方法统一为“固定 teacher top-32 分布、学生端 full-vocabulary normalization 的 CE”；
不再暗示 teacher 使用未截断全分布。

## 5. Minor 与处置

- 表中补足 `Text CE` 语义，图注明确样本集合。
- 从 `template/` 目录编译的命令与本机缺少 LaTeX engine 的限制写入发布验证记录。
- BibTeX key 完整；条目元数据仍是正式投稿前需要补齐的编辑性工作。
- “免费方向”仅作为“task-improving 且 text-CE-nonregressing action”的简称，不作为经济或部署主张。

## 6. 审稿后允许的 Claim

允许：

> 在当前 Meta-Llama-3.1-8B-Instruct、最后四层、固定 curvature top-128 assignment bundle 和零
> text-train CE 退化约束下，hard-first local group-scale compensation 能降低局部 hard-weight anchor
> error，并在多数可比动作上减少 text regression，但仍不能产生 task-improving 且 exact text-feasible
> 的 paired action。

不允许声称超过 QTIP、GSQ 或 source，不允许声称产生新部署端点、assignment 全局不可行、scale
compensation 完全无效，或零退化 train gate 等价于真实部署质量保证。

## 7. 最终判断

审稿后没有可通过纯写作消除的实质 blocker：缺少正向端点是当前科学结果，而非文稿疏漏。V15 适合作为
V14 自然修复方向被严格否决的机制版本；若按 ICLR 主会方法论文衡量仍为 5.5/10 borderline reject。
