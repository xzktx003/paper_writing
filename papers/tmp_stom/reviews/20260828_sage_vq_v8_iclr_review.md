# ICLR 风格评审：SAGE-VQ V8

## 1. 总结

V8 研究一个比 V7 更公平也更困难的问题：同一 2-bit block-scaled VQ checkpoint 中，已有 FP16 group scale 与离散 codeword assignment 是否是等价的任务适应坐标。论文以同一 Llama-3.1-8B-Instruct 锚点、最后四层、每任务 512/256/256、4096-token 文本保护、2 epochs、相同 validation/audit Gate 比较两个分支。Scale-only 把 Macro-6 从 68.00% 提升至 71.72%，assignment-only 提升至 69.48%；前者 PPL 退化 4.28%，后者退化 2.27%。论文据此把主张从“assignment 是更强适应方法”改为“连续尺度与局部离散索引形成不同 task/PPL 区域”。

离散分支仍是 V7 的完整方法：当前码字 8-way 几何邻域、功能梯度选择一个 alternative、binary Concrete switch、嵌套 hard projection 和独立 audit。V8 还保留 teacher/text-only 失败对照与 QTIP/GSQ 质量参照，并明确没有运行 scale+assignment 联合端点。

## 2. 优点

1. **对决定性反证处理诚实。** 新基线明显超过 assignment，论文没有隐藏、弱化或用不同表格规避，而是重写标题、摘要、方法对象和结论。这显著提高可信度。
2. **现象优先的故事优于 V7。** “共享原型 × group scale”自然暴露连续尺度与离散原型两类坐标；同一表示内的功能非均匀性比“使用 binary Concrete 训练 index”更像可推广的研究问题。
3. **公平内部比较很强。** 两分支复用同模型、同锚点、同层、同任务与长文本预算、同验证阈值、同独立 audit 和同逻辑码率；差异可主要归因于适应坐标。
4. **Assignment 机制仍有辨识度。** 当前码字附近领域、功能定向 alternative 与稀疏 hard projection 共同定义真实部署状态；1/8 到 full 的非单调结果直接支持离散信赖域。
5. **真实 Pareto 与失败边界清楚。** Scale 任务增益更大但 PPL 更差；assignment 在 LAMBADA/ARC-E 更好；text-only 代理改善但正式质量恶化；QTIP 仍是更强通用 PTQ。论文没有用平均分掩盖这些事实。
6. **复现证据完整。** 原始 JSON、完整 checkpoint、2048 PPL、六任务全量 lm_eval、独立 audit、dtype/bpp/fresh reconstruction 和时间均可追踪。

## 3. 主要问题

### W1. 当前仍是“两条单分支诊断”，不是完成的双坐标方法

V8 把 SAGE-VQ 重述为 scale--assignment gated 框架，但没有联合训练或联合端点。现有证据只能证明两坐标不同，不能证明 framework 比直接训练 group scale 更有价值。由于 scale-only 更快、任务分数更高，实际用户在当前表格下没有理由选择复杂 assignment，除非特别重视 PPL 或 LAMBADA。下一版必须验证联合互补性；否则方法名称应进一步降格为诊断研究。

### W2. 现象只在一个模型和最后四层出现

“两类坐标功能非均匀”是比 V7 更强、更一般的命题，却仍只有 Llama-3.1-8B-Instruct 一点证据。若另一模型、前层或全层得到相反排序，论文主轴会改变。至少需要第二模型或第二结构区域的验证；在资源有限时，可先把主张限定为“该 checkpoint/层范围的机制发现”。

### W3. 缺少真正的 Figure 1 与坐标级诊断

文中提出 PPL–Macro 图，但当前仓库没有对应图像。更重要的是，只有四个端点不足以说明机制。建议报告 scale delta 与 task/text gradient 的相关性、assignment confidence 与真实 hard gain 的关系、各层/Linear 的收益分布。否则“密集径向 vs 稀疏原型”仍部分是结果后解释。

### W4. “同预算”需要更细致限定

部署 bpp、数据和 epoch 相同，但优化维度与计算并不相同：scale 有 5.52M 连续变量，assignment 训练 145M binary logits/候选且耗时约 4.3 倍。V8 已报告时间，但标题和表注应使用“同监督与同部署存储”，避免读者把它理解为同训练 FLOPs/参数预算。

### W5. 与外部任务适应基线仍不充分

LoTA-QAF 被放在相关工作，但没有可比结果；QTIP/GSQ 无任务监督，只能作通用质量参照。内部 scale baseline 回答了 V7 最关键的公平性问题，却仍不能说明相对量化感知 adapter、QAT 或 PV-Tuning 式更新的竞争力。

### W6. 理论解释尚未区分两坐标的真实曲率

二阶 Taylor 解释了 assignment 集合为何可能非单调，但没有证明 scale 的联合曲率更温和，也没有量化两坐标在 Hessian 度量下的扰动。当前“连续可密集、离散需稀疏”是合理机制假设，不应写成理论结论。

## 4. 次要问题

1. `SAGE-VQ` 在 V8 被重新解释为 scale--assignment gated，需在最终英文稿中给出稳定全称，避免版本间语义漂移。
2. Scale delta 全部非零且部分达到 ±0.08 边界，应该报告饱和比例；这可能揭示当前约束是否过紧，但不应立即扫描阈值调参。
3. Group scale 是已有 FP16 字段，所以逻辑 bpp 不变；主文还应说明这些字段是否已计入 2.1208 bpp，避免“免费参数”误解。
4. 当前没有 LaTeX 编译器，页数、浮动体、中文双栏表格和 overfull box 未验证。
5. LoTA-QAF 的书目信息应在最终提交前用官方 proceedings 元数据复核完整作者列表。

## 5. 评分

| 维度 | 分数 / 10 | 说明 |
|---|---:|---|
| 写作 | 9.0 | 现象优先、反证诚实、边界明确；标题与章节角色较成熟 |
| 创新 | 6.5 | 双坐标非均匀性有价值，但尚无联合算法或跨模型稳定性 |
| 实验 | 7.8 | 同监督 scale 公平基线显著增强证据；缺联合端点、外部 task-adaptation 与模型广度 |
| 理论 | 6.0 | 二阶解释合理但仍是机制假设，未比较两坐标曲率 |
| 可复现 | 9.0 | 完整代码、checkpoint、数据合同、测试与结果；缺 PDF 编译和外部基线实现 |
| 总体 | **5.5** | **边缘拒绝 / Borderline Reject** |

**审稿置信度：4/5。** V8 比 V7 更可信、更有研究品味，但新公平基线同时移除了 assignment-only 的竞争优势。论文现在有一个强观察，却还缺由观察自然导出的最终联合方法。

## 6. 下一轮优先级

1. 首先实现并完整评测单次独立 audit 约束的 scale+assignment 联合端点；不做 seed/group/LR 扫描。
2. 若联合端点不能超过 scale-only，应接受反证，把 assignment 降为 Pareto/机制消融，并把论文中心转为 deployment-coordinate selection。
3. 生成真实 Figure 1：PPL–Macro Pareto，加上各层/Linear 的坐标收益分布；图必须包含失败的 text-only 点。
4. 在联合结论确定后，再决定是否值得投入第二模型；不要在主方法尚未成立前无目的扩展规模。
5. 最终环境补 LaTeX 编译、页数和浮动体检查。
