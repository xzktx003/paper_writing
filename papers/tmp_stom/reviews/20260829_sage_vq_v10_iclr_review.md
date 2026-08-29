# ICLR 风格评审：SAGE-VQ V10

## 1. 总结

V10 回答了 V9 最关键的未决问题：如果先把独立 scale 固化成真实 FP16 hard checkpoint，再冻结 scale、重算当前码字附近领域并只训练 assignment，能否避免同步 soft joint 的补偿—投影失配并取得组合收益？论文在 Meta-Llama-3.1-8B-Instruct 最后四层执行完整实验，对两个 epoch 的 1/8、1/4、1/2 和 full 共八个真实 int32 投影逐一 Gate。

结果是可信的负结论。Hard handoff 保持 scale 不被破坏，最终可 bit-exact 回滚；但 98.1965% 向量存在负一阶邻居时，八个 hard set 的验证 Macro 仍全部低于 scale baseline，最佳 changed loss 也高 8.32%。论文据此把 scale 与 assignment 定位为当前方法下的竞争性部署接口，并将下一问题收缩为 scale-conditioned curvature 或跨 batch/任务梯度一致性。

V10 还公开了一个 selector bug：旧逻辑只有 full endpoint 先通过才评估 sparse projections。修复后的完整重跑和测试使“0/8 成功”结论成立。这种对失败路径和实现错误的披露提升了可信度。

## 2. 优点

1. **上一版提出的关键假设被直接、完整检验。** Hard handoff 不是口头原则；它从独立审计 scale checkpoint 出发，重算 proposal、训练 assignment、评估八个硬状态并运行正式 PPL/六任务测试。
2. **核心现象有辨识度。** “98.20% 逐向量负一阶邻居，但 0/8 集合级硬投影改善”比单纯报告 no-op 更有研究价值，清楚暴露线性 proposal 与部署集合损失之间的鸿沟。
3. **区分了两类失败。** V9 的同步 joint 是 soft mixture 污染 scale；V10 冻结 scale 后仍失败，则指向 proposal/集合几何。论文没有把它们笼统归为优化不稳定。
4. **部署合同严格。** Assignment、scale、codebook、normalizer、元数据、逻辑 bpp 和 fresh reconstruction 均审计；无候选通过时输出与 source bit-exact。
5. **负结果边界诚实。** 论文没有把 no-op 包装成性能提升，也没有声称 scale 普遍耗尽 assignment 自由度；QTIP/GSQ 的监督差异和 PV-Tuning 的直接先验均被正面说明。
6. **可复现链条完整。** 代码、launcher、cache prefix 合同、35 项聚焦测试、紧凑 JSON、时间/显存、图源、报告和论文均可追踪。

## 3. 主要问题

### W1. 最终实用方法仍然是 scale-only

Hard-handoff 模块的质量输出是 no-op。它证明了一种安全失败机制和一个 proposal 缺口，却没有形成新的 Pareto endpoint。以传统“新压缩算法”标准投稿时，审稿人很可能认为主方法只是 scale-only 加失败检测。论文更接近机制/诊断研究，除非 V11 的新 proposal 获得非零可部署收益。

### W2. 与 PV-Tuning 的方法重叠仍限制创新评分

连续/离散坐标、真实梯度离散步和交替更新已有直接先验。当前特定差异——共享码本、8-way anchor-local 候选、任务 Gate 和 hard audit——带来强负证据，但还未展示优于一般 P/V update 的算法优势。V10 正确承认了这一点，却无法仅靠边界声明消除创新缺口。

### W3. “一阶失准”的机制仍缺直接二阶测量

98.20% 对 0/8 是很强的现象，但无法区分以下原因：候选一阶项数值过小且噪声主导；各 batch/任务梯度互相冲突；对角曲率代价为正；同组或跨层交互项过大；binary-Concrete logit 排序未保留原始一阶排序。论文当前只给 Taylor 展开，尚未计算任何一个机制统计。

### W4. 结论只有单模型、最后四层

“坐标竞争”可能依赖 scale 已适应的层、任务监督、码本训练方式和邻域定义。论文已限制措辞，但顶会完整性仍需要第二模型、第二层段或至少未适应 scale 的结构对照。考虑当前方法为 no-op，不建议先盲目扩模型；应先证明机制增强 proposal 有效。

### W5. 缺同监督 task-adapted 外部基线

QTIP/GSQ 是通用 PTQ，不能回答使用同样任务标签和计算预算时，已有量化适应方法是否优于 scale-only 或 local assignment。LoTA-QAF/PV-Tuning 仍只有文字比较。论文的内部因果比较公平，外部竞争力尚不清楚。

### W6. Audit 的统计强度与复用说明必须更醒目

Task audit 只有 31 条/任务，这是 ARC-C train 剩余窗口的客观限制。首轮诊断 run 只读取了 baseline/no-op，没有 changed candidate；修复后复用同一 candidate-unexposed audit，逻辑上未用它做方法选择，但“fresh”一词容易引发质疑。正文应明确称“预注册、未暴露给非零候选的 audit”，而不是暗示整个数据从未被程序读取。

## 4. 次要问题

1. Figure 1 右图只画 Macro，建议附录同时画 balanced loss，避免读者认为结论依赖离散准确率方差。
2. 应报告 proposal 一阶值的分位数、符号稳定率和训练后 logit 与原始 $\Delta_i$ 的 Spearman 相关。
3. 5% 之外的三个点不具备预注册可接受资格，主表应继续标明它们只是机制诊断。
4. 逻辑 bpp 未增加不等同于真实内核速度；当前仍无吞吐/延迟结论。
5. 本机缺 LaTeX 编译器，尚未验证版面、浮动体、页数与 overfull box。
6. GSQ 和 LoTA-QAF 的 2025/2026 元数据需在正式投稿前通过官方版本再次核验。

## 5. 评分

| 维度 | 分数 / 10 | 说明 |
|---|---:|---|
| 写作 | 9.3 | 现象—修复—反例—边界的因果链很清楚，方法步骤与不可声称项明确 |
| 创新 | 5.5 | 一阶/硬集合反差有辨识度，但最终算法 no-op，且连续—离散优化受 PV-Tuning 强先验限制 |
| 实验 | 8.5 | 两次完整 run、八投影、正式 PPL/六任务、bug 修复和状态合同充分；缺模型广度与同监督外部基线 |
| 理论 | 5.8 | Taylor 解释合理但仍是机制假设，缺曲率/一致性直接统计 |
| 可复现 | 9.5 | 代码、测试、JSON、报告、协议、成本、失败和 selector 修复均完整；缺 LaTeX 编译 |
| 总体 | **5.5** | **边缘拒绝 / Borderline Reject** |

**审稿置信度：4/5。** 结果可信且研究品味较好，但当前更像一个高质量的负结果与方法诊断。若按新量化方法投稿，需要 V11 把失效机制转化为非零 Pareto 改进；否则应调整论文类别和主张。

## 6. 下一轮优先级

1. 不做 LR、group、seed 或 projection-ratio 扫描。先在相同 scale hard checkpoint 上保存 per-batch/per-task gradient summary，测量 alternative 符号一致率与一阶幅值信噪比。
2. 为 8-way alternative 加一个低成本 scale-conditioned curvature 代价，或只保留跨 batch/任务稳定为负的 consensus 候选；保持其余协议不变，直接比较 proposal 质量。
3. 在正式长训练前只允许不读取 benchmark test 的 validation-level method Gate；若 changed hard set 仍不能接近 scale validation，不再运行正式 lm_eval。
4. 若新 proposal 得到非零候选，使用新的、明确未暴露 audit 并补第二模型/层段；若仍 no-op，停止组合路线，把 assignment 固定为独立 Pareto 消融。
5. 方法成功后再补同监督 PV-Tuning/LoTA-QAF 对照与真实推理成本；当前阶段优先解决核心机制，而不是扩大表格。
