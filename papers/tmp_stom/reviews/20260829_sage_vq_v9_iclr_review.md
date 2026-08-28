# ICLR 风格评审：SAGE-VQ V9

## 1. 总结

V9 检验了 V8 最关键且最危险的假设：同一 block-scaled VQ 中，连续 group scale 与局部离散 assignment 能否在共享软松弛中直接互补。作者在完全匹配的 Llama-3.1-8B-Instruct、最后四层、任务/长文本监督和 2.1208-bpp 合同下训练 naive joint，并用一次新的 task/C4 audit 验收。结果是否定的：joint 得到 69.74% Macro-6 和 11.4098 PPL，被 scale-only 的 71.72%/10.9448 严格支配。只保留 joint 尺度、清零 assignment switch 时，验证 Macro 为 70.94%，还低于锚点 71.95%，而独立尺度达到 76.33%。论文据此将失败归因于尺度对 soft codeword mixture 的补偿在 hard projection 后失效。

论文没有把负结果掩饰成成功联合算法，而将其转化为部署态坐标交接原则：不同坐标须通过真实 hard checkpoint 交接。它同时补充真实 PPL--Macro Figure 1，并明确 PV-Tuning 已经提出一般的连续--离散交替优化，因此“坐标下降”本身不能作为创新。

## 2. 优点

1. **关键联合假设被完整证伪。** 实验包含完整校准、独立 audit、2048 PPL、六任务全量评测、checkpoint 合同与时间/显存，不是依靠 smoke 或 validation 宣布负结论。
2. **Hard-state 反证具有诊断力。** 零切换 joint scale 明显弱于独立 scale，排除了“只是 projection 比例不佳”的简单解释，并把问题定位到训练态 mixture 与部署态原型之间。
3. **对 prior art 的处理比前版成熟。** 论文明确承认 PV-Tuning 的 P/V 交替坐标框架，不再把连续--离散交替包装成首次提出；差异被限定到固定共享码本、乘性 group scale、当前码字邻域和 hard deployment audit。
4. **故事由现象驱动。** 表示分解自然引出两种部署坐标，单坐标非均匀性引出联合问题，联合失败再导出最小方法原则，章节因果关系清楚。
5. **Figure 1 真正承担主张。** 左图展示同模型 PPL--Macro 端点和监督边界，右图展示 hard-state 干扰；读者无需在多个表格间自行拼接结论。
6. **边界诚实。** QTIP 仍是更强通用 PTQ，task-scale 使用目标任务标签，分阶段修复尚未运行，论文均明确说明。

## 3. 主要问题

### W1. V9 仍是强机制诊断，而不是一个成立的新方法

论文证明 naive joint 不工作，并提出 hard-checkpoint handoff 原则，但没有正式结果证明该原则产生优于 scale-only 的端点。当前最强可用方法仍是简单 scale-only。若以方法论文投稿，审稿人会要求“原则落实后的算法和收益”；若后续修复仍被 scale 支配，主张应降为部署坐标选择/负结果研究。

### W2. 与 PV-Tuning 的方法差异尚未转化为比较证据

V9 在文字上划清了边界，但没有运行 PV-Tuning 风格的交替更新或其公开 checkpoint。仅强调当前码字 8-way 邻域、任务功能方向和单次 audit 还不足以证明实质性算法优势。下一版至少需要在方法流程中精确定义 hard handoff 与 PV 的 P/V step 在状态、候选域和验收目标上的区别，并用对应消融证明这些差异必要。

### W3. 机制证据仍停留在端点级

零切换反证很强，但还没有直接展示组级 soft--hard residual $R_g$ 与 hard loss 退化之间的相关性，也没有显示哪些层/Linear 的 scale 补偿最严重。当前“补偿--投影失配”是受端点支持的最佳解释，而非被细粒度统计唯一确认的因果机制。

### W4. 单模型、最后四层限制了现象外推

V9 只证明这一 checkpoint 和结构区域存在失配。共享乘性 scale 与 assignment 的相互作用可能随模型族、层位置和码本训练方式改变。在分阶段方法尚未成功前不必盲目扩展规模，但最终稿至少需要第二模型或第二结构区域。

### W5. Task-adapted 外部基线依然缺失

QTIP/GSQ 没有使用目标任务标签，只能定位通用 PTQ 质量；LoTA-QAF 和 PV-Tuning 没有统一监督下的数字。论文内部比较公平，但尚不能回答相对其他 task-adapted quantization 接口是否值得使用。

### W6. 下一阶段 audit 预算需要预先定义

当前 fresh task audit 已消耗每任务 offset 1024 后的 64 个样本。若下一版根据 V9 结果设计方法后复用该 audit，它将不再是真正未观察数据。应在运行前固定新的不重叠 audit；ARC-Challenge training split 剩余样本有限，必要时降低每任务 audit 数并如实报告统计强度，不能改用 benchmark test 做方法选择。

## 4. 次要问题

1. 应在图注中明确虚线“observed frontier”只是这些已测端点的连线，不是完整 Pareto front。
2. Joint 的全部尺度 delta 非零，但饱和到 $\pm0.08$ 的比例尚未报告；这可帮助区分约束饱和和 mixture 补偿。
3. 正文中的 $R_g$ 是诊断量，但实验尚未计算它；最终稿需标为待验证统计或补齐数值。
4. 当前机器没有 LaTeX 编译器，PDF 页数、浮动体和 overfull box 未验证。
5. LoTA-QAF 和 GSQ 为 2025/2026 工作，最终投稿前需再次用官方元数据复核。

## 5. 评分

| 维度 | 分数 / 10 | 说明 |
|---|---:|---|
| 写作 | 9.2 | 现象、反例、机制和边界形成清晰因果链 |
| 创新 | 5.8 | 特定 soft--hard 失配有辨识度，但 hard handoff 尚未成为验证方法，且受 PV-Tuning prior 限制 |
| 实验 | 8.2 | 联合正式实验、fresh audit、完整评测和真实图显著增强；缺成功方法、机制统计与模型广度 |
| 理论 | 5.8 | 失配形式化合理，但尚无充分条件、界或组级实证 |
| 可复现 | 9.3 | 代码、checkpoint、JSON、合同、成本和失败结果齐全；缺 PDF 编译 |
| 总体 | **5.5** | **边缘拒绝 / Borderline Reject** |

**审稿置信度：4/5。** V9 是可信且有研究品味的负结果版本，但顶会方法论文仍需要把部署态原则转化为一个不被 scale-only 支配的正式端点。

## 6. 下一轮优先级

1. 以独立 scale 的真实 FP16 checkpoint 为锚点，冻结 scale，重新收集功能梯度与当前码字 8-way alternative，只训练稀疏 assignment repair；不做 LR、group 或 seed 扫描。
2. 在实验启动前固定未重叠 audit。若 ARC-C training split 只剩 31 条，则统一使用每任务最后 31 条并披露样本量；文本使用新的 C4 行。
3. 成功标准必须相对 scale-only：Macro 不低于 scale，或在相近 Macro 下显著降低 PPL。若最佳 hard projection 为 no-op 或仍被严格支配，停止把 assignment 作为联合主模块。
4. 从 joint 训练状态计算 group-level $R_g$、scale delta、soft--hard reconstruction gap 与 hard loss proxy 的关系，检验补偿机制而不是只依赖端点解释。
5. 方法成立后再扩展第二模型/层范围和统一 task-adaptation 外部基线；否则保持为单模型机制研究。
