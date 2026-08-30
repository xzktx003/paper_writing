# Idea 记录

## 2026-08-20：Dense LLaMA Vector-GSQ 与同码率 QTIP matched comparison

- 描述：把七 Linear Vector-GSQ 主链应用到 dense LLaMA，并用同一基座、WikiText2-2048、
  六项 lm-eval 0-shot 和 effective-bpp tolerance 对比 QTIP。
- 动机：跨模型、跨 tokenizer cache 或只比较 PPL 都不能回答 Vector-GSQ 是否优于 QTIP；
  必须把模型身份、校准 token、码率和下游任务锁成一个可审计协议。
- 预期效果：得到可以直接用于论文表格的 PPL、macro accuracy、逐任务 accuracy、码率差和
  wall-time 数据，并在码率不匹配时自动拒绝胜负结论。
- 当前状态：代码、红绿灯测试、远端 launcher 和报告生成完成；Remote-14 正式
  LLaMA-3.1-8B/QTIP 数值待运行。
- 风险：旧 LLaMA 单层 Gate 误用了 Qwen token cache，已从质量证据降级；默认 QTIP
  checkpoint 以模型名中的 2-bit 标称码率记录，若论文采用包含全部元数据的 effective-bpp，
  需另行审计 QTIP checkpoint 存储并覆盖 `QTIP_EFFECTIVE_BPP`。

## 2026-07-10: EvidenceKV

- 描述：面向 RAG 的证据依赖感知 KV cache 量化。它不是简单保护 attention 高、位置近的 token，而是把更高精度分配给真正支撑答案的检索片段。
- 动机：通用 KV 压缩可能保住 perplexity，却破坏引用可信度和多跳证据利用。
- 预期效果：在相同 KV 显存和延迟预算下，提高答案事实性与引用支撑质量。
- 状态：待验证。

## 2026-07-10: SafeSubspaceQuant

- 描述：用一个很小的对比校准集识别安全、拒答或其他行为关键的低维子空间，并在量化时优先保护这些子空间。
- 动机：即使 perplexity 和常规能力评测看起来稳定，量化后模型的安全行为仍可能坍塌。
- 预期效果：在较小显存开销下，提高低比特 W/A/KV 压缩后的安全保持能力。
- 状态：待验证。
- 深挖文档：[SafeSubspaceQuant：低比特量化下的条件安全边界诊断与保护](safe_subspace_quant_deep_dive.md)。

## 2026-07-10: QuantBench-Behavior

- 描述：面向量化 LLM 的服务端感知行为鲁棒性基准，覆盖推理、代码、多语言、安全、长上下文、RAG 引用，以及延迟和显存指标。
- 动机：现有量化论文的评测矩阵不统一，也不完整，很多部署中的行为退化没有被测出来。
- 预期效果：暴露隐藏的部署回归，并形成一个可复用的公平比较工具。
- 状态：备用方向 / benchmark 方向。

## 2026-07-10: AgentRate

- 描述：面向多轮任务的 rate-distortion 记忆压缩方法，同时覆盖 KV cache、prompt context 和 agent memory。
- 动机：单轮长上下文压缩无法反映 agent 在反复压缩、长期运行中的记忆漂移问题。
- 预期效果：在固定记忆预算下，提高长程 agent 任务的可靠性。
- 状态：探索性方向 / 后续阶段方向。

## 2026-07-10: RouteStableQuant

- 描述：关注 MoE 量化后的 routing drift，特别是长上下文、多语言、安全或工具调用场景中的路由偏移。
- 动机：expert-aware MoE 量化已经很拥挤，但部署工作负载下的动态 routing drift 仍没有被充分解决。
- 预期效果：在超低比特压缩和分布漂移下，让 MoE 推理更加稳定。
- 状态：低优先级；需要更强的实证失败案例支撑。

## 2026-07-10：Quantization-Closed Unlearning

- 描述：把遗忘目标扩展到模型的整个量化闭包，要求不同位宽、格式、group size 和舍入策略都不能恢复已删除知识。
- 动机：SURE、QUAIL、DurableUn、MANSU 等已有工作主要围绕特定量化器或有限配置构造持久更新，可能存在 quantizer overfitting。
- 预期效果：形成效用受限量化器族上的最坏情况遗忘方法、unseen-quantizer 泛化评测和有限范围证书。
- 状态：已完成深度分析；高优先级，但必须先验证现有方法是否存在跨量化器转移失败。详细文档见 `docs/quantization_closed_unlearning.md`。

## 2026-07-10：ConformalQuant

- 描述：以 selective prediction 和 conformal coverage 为约束，保持量化模型的风险排序和拒答能力。
- 动机：量化可能保持平均准确率，却破坏低置信样本上的风险控制。
- 预期效果：在低精度部署中保持 coverage-risk 保证。
- 状态：待验证。

## 2026-07-10：ReasoningCostQuant

- 描述：联合优化每 token 精度、推理 token 数和工具/验证成本，降低完成正确答案的端到端成本。
- 动机：低比特 reasoning model 可能生成更长、更重复的 CoT，抵消量化加速。
- 预期效果：减少 reasoning token inflation，并保持准确率。
- 状态：高优先级，适合先做逐层精度恢复实验。

## 2026-07-10：ActionInvariantQuant

- 描述：保护 Agent 的工具选择、参数和状态转换，使关键动作在量化前后保持稳定。
- 动机：很小的数值偏移可能让 Agent 从安全动作翻转到危险动作。
- 预期效果：降低 action flip rate 和高风险参数错误。
- 状态：待验证。

## 2026-07-10：Precision Spectroscopy

- 描述：测量不同能力随连续精度变化的响应曲线，寻找跨模型稳定的能力临界精度谱。
- 动机：统一 bit-width 掩盖了不同能力的相变点和精度需求。
- 预期效果：建立模型的能力精度指纹，并预测能力坍塌顺序。
- 状态：最高优先级候选。

## 2026-07-10：Rounding Lottery

- 描述：研究相同 bit budget、MSE 和 PPL 下，不同舍入解造成的行为差异及稀疏关键舍入集合。
- 动机：量化能力可能由少量离散 rounding decisions 控制，而不是由全局重建误差决定。
- 预期效果：发现量化解空间的行为几何，并导出行为约束舍入方法。
- 状态：最高优先级，首个 smoke test 成本较低。

## 2026-07-10：Circuit Rewiring under Quantization

- 描述：研究量化后模型是否在行为近似不变时改用不同的内部 feature 或 circuit。
- 动机：FP 模型上的解释性、安全监控和 steering 结论未必能迁移到量化部署模型。
- 预期效果：建立量化后的回路一致性评测和 circuit-consistent quantization。
- 状态：待验证，机制分析成本较高。

## 2026-07-10：Beneficial Quantization Regimes

- 描述：寻找适度量化系统性提升 OOD、校准或组合泛化的条件。
- 动机：量化可能压制记忆和捷径，而不仅是造成损失。
- 预期效果：建立可预测的有益压缩区间和量化正则化理论。
- 状态：高风险探索方向。

## 2026-07-10：Behavioral Rate-Distortion

- 描述：以输出分布、偏好、动作、拒答和因果行为定义模型量化的率失真函数。
- 动机：参数 MSE 和 perplexity 不能表示部署行为是否被保留。
- 预期效果：统一应用约束型量化，并给出行为保持所需 bit rate 的理论边界。
- 状态：高价值理论方向。

## 2026-07-10：Superposition Precision Law

- 描述：研究 feature 数量、稀疏度和相干性如何决定量化所需精度及 feature survival。
- 动机：低比特失败可能来自语义 feature 超位置与碰撞，而不仅是数值 outlier。
- 预期效果：形成 feature collision-aware rotation 或 codebook。
- 状态：高理论风险方向。

## 2026-07-10：Capability Criticality Theory

- 描述：用功能 margin、路径冗余和量化噪声预测能力发生 performance cliff 的临界精度。
- 动机：现有工作观察到 computation collapse，但尚不能预测何时、在哪项能力上发生。
- 预期效果：给出可校准的能力相变公式和结构重建判据。
- 状态：高价值理论方向。

## 2026-07-10：Counterfactual Rounding

- 描述：直接优化离散舍入，使关键 counterfactual 行为关系在量化后保持不变。
- 动机：相近的重建误差可能对应完全不同的行为，舍入应优化行为而不是矩阵逼近。
- 预期效果：在不增加 bit-width 的情况下提高目标行为保持率。
- 状态：与 Rounding Lottery 联动推进。

## 2026-07-10：Disagreement-Seeking Calibration

- 描述：主动生成 FP 与量化模型分歧最大的输入，并用这些边界样本迭代校准量化器。
- 动机：普通文本校准集集中在高密度区域，难以覆盖真正的行为失败边界。
- 预期效果：用更小校准集提高跨任务量化鲁棒性。
- 状态：可快速验证的方法方向。

## 2026-07-10：ReCircuitQ

- 描述：先诊断 computation collapse，再用极小的 binary/ternary residual circuit 重建失效功能。
- 动机：2-bit 模型的结构性计算崩溃无法通过普通误差补偿修复。
- 预期效果：以功能回路为单位突破极低比特性能 cliff。
- 状态：高优先级、高工程风险。

## 2026-07-10：SyndromeQuant

- 描述：为低比特模型学习条件触发的离散行为错误字典和微型 correction atoms。
- 动机：量化错误可能集中在少量低熵功能模式，可以像错误校正码一样恢复。
- 预期效果：以很小额外 bit budget 修复多类行为错误。
- 状态：探索性方法方向。

## 2026-07-10：Capability Compiler

- 描述：根据 capability manifest，把同一 FP 模型编译成相同存储预算但能力组合不同的低比特模型。
- 动机：量化不必只生成一个近似原模型的缩小版本，也可以成为能力编程工具。
- 预期效果：实现 Math、Code、Safe、General 等可配置低比特部署版本。
- 状态：最高上限、长期范式方向。

## 2026-07-10：Semantic Bitplanes

- 描述：让增量 bitplane 按语义顺序解锁基础语言、知识、reasoning 和专业能力。
- 动机：现有 any-precision 方法的高位 bit 只是数值残差，不具备能力可解释性。
- 预期效果：支持能力级按需加载和流式精度扩展。
- 状态：高风险范式方向。

## 2026-07-10：Bit-Token Scaling

- 描述：联合研究推理 token budget 与 arithmetic precision budget 的 scaling law 和在线控制策略。
- 动机：test-time scaling 只计算 token 数，忽略提高局部精度也能增加有效计算。
- 预期效果：找到完成任务的最优 token-bit 分配。
- 状态：高价值范式方向。

## 2026-07-10：Quantization Microscope

- 描述：把逐层、逐通道和逐舍入的精度干预作为 mechanistic interpretability 工具。
- 动机：量化提供了区别于 ablation 和随机噪声的结构化、可部署干预。
- 预期效果：揭示 circuit 的必要性、冗余、备用路径和失效层级。
- 状态：方法学探索方向。

## 2026-07-13：STOM 敏感层保护与混合精度

- 描述：先用逐层激活漂移识别早期范数坍缩层和末端放大层，再只对少量敏感层
  保留 FP16/更高 bit，其余层使用 STOM。
- 动机：Qwen3-0.6B 上保护 layers 0–2 与 25–27 可将 200-step STOM PPL 从
  `4018.85` 降至 `124.85`，说明失败高度集中而非全层均匀发生。
- 预期效果：以小额 bit overhead 获得数量级质量恢复，并形成 layer criticality
  与 bit allocation 的联合准则。
- 状态：已验证有效，尚未超过 GPTQ-W2。

## 2026-07-13：传播稳定性约束的 source-to-task objective

- 描述：除单 Linear teacher-output loss 外，加入层残差输出范数、余弦和跨层
  propagation stability 约束，避免局部 validation loss 下降但全模型 PPL 变差。
- 动机：20/50/100/200-step PPL 曲线明显非单调，50-step 的逐层 validation
  改善未转化为全模型质量，说明独立 projection objective 与序列传播目标不一致。
- 预期效果：减少误差在第 2 层和第 27 层的范数坍缩/放大，提高 compute scaling
  单调性。
- 状态：待验证，高优先级。

## 2026-07-13：可信量化实验口径审计

- 描述：每个正式结果强制记录模型文件哈希、真实参数规模、target scope、量化后
  权重差、实际部署字节数与 PPL token 数；baseline 与方法必须使用相同 scope。
- 动机：本轮发现“Qwen3-4B”实际是 0.6B 副本、RTN/GPTQ 保存原权重、STOM
  隐式量化 attention、2-bit storage 仅为标签等多重口径问题。
- 预期效果：在跑大矩阵前自动阻止身份错误、伪量化和不公平比较。
- 状态：诊断需求已确认，工程化待实现。

## 2026-07-14：Outlier-Robust Scalar-Codebook GPTQ Scale Search

- 描述：固定每个 Linear 的非均匀 scalar codebook，在 GPTQ 到达每个 group 时，
  基于当前 error-updated working weights 建立正负码本朝向的覆盖 scale，并用
  80 档 shrink 与 p=2.4 reconstruction error 选择 scale，再量化离散 index。
- 动机：普通 L2 闭式 scale 会为了多数普通值放弃极少数离群 residual；这些
  residual 经 Hessian inverse 可被放大几十倍，导致 weight MSE 看似合理但 PPL
  崩坏。direct GPTQ-W2 的 p=2.4 grid search 已隐式提供这种 outlier robustness。
- 预期效果：保留非均匀码本对主体权重分布的优势，同时阻断极少数 residual 的
  跨列放大，不增加 codebook 或 scale metadata 位数。
- 状态：已验证。Qwen3-0.6B all-Linear W2 正式 PPL `186.22855`，相对可信 direct
  GPTQ-W2 `347.29895` 降低 `46.378%`；仍需在阶段三重点修复 layer 2 down projection。

## 2026-07-14：Held-out Token-NLL Hard-State Gate

- 描述：Gumbel index training 完成后，不按局部 layer-output MSE 无条件接受所有
  hard assignments；在独立 held-out calibration tokens 上比较 Stage-II 与
  Stage-III hard-state trajectory，以 token mean NLL 选择全局 prefix 或更一般的
  per-layer subset，并对未通过的模块保留 Stage-II 量化状态。
- 动机：Qwen3-0.6B 上 dense-trajectory MSE 持续改善，但 late-layer index 更新把
  all-Linear WikiText2 PPL 从 Stage-II `206.90` 推高到 `364–657`；局部 activation
  geometry 与最终语言模型 CE 明显错位。
- 预期效果：在不增加 bit width、codebook 或 scale metadata 的前提下，保留真正
  有益的 index refinement，阻断晚层累计传播退化，并为 `lm_head` 提供同口径的
  task-aligned acceptance criterion。
- 状态：prefix 版本已验证。完整 29-prefix C4 validation 选择 cutoff 7，最终
  197-Linear WikiText2 PPL `164.8653`，相对 Stage-II all-197 改善 `20.3158%`；
  任意 per-layer subset 与 head-specific CE/KL training 仍待验证。

## 2026-07-14：Assignment-Fixed Codepoint/Scale Refinement with Task-Aligned Gates

- 描述：从已验证的 hard assignments 初始化并永久固定离散 index，只训练每个
  Linear 的有序零锚非均匀 codepoints 与 signed row/block scales；Transformer
  用 held-out token-NLL prefix gate，`lm_head` 用同一 token-NLL 独立选择，而不是
  用局部 layer/head MSE 直接接受参数更新。
- 动机：Stage IV 的局部 hard MSE 可持续改善，但 10/20-step 早层状态仍会轻微
  恶化 C4 PPL，完整训练的最后一层也使 PPL 从 cutoff-27 的 `85.0217` 回升到
  `85.5703`；说明固定 index 并不能消除 task-objective mismatch。
- 预期效果：在不增加 assignment bit width、不使用 FP16 敏感层保护的前提下，
  让码点与 scale 适应真实模型 trajectory，同时用 task-aligned gate 阻断有害的
  晚层或 head 漂移。
- 状态：prefix + head gate 已验证。Qwen3-0.6B 197-Linear W2 的最终 C4 PPL
  `84.2321`、WikiText2 PPL `142.4698`，相对 Stage III 改善 `13.5841%`；任意
  per-layer subset、联合 token-CE/KL 训练和更细粒度 block acceptance 仍待验证。

## 2026-07-14：Hessian-aware Codebook GPTQ Initialization

- 描述：保持“每个 Linear 一个固定非均匀 scalar codebook”的最小 GSQ 改造，但码本
  初始化不再只优化 block-scaled weight MSE；利用 GPTQ Hessian/working residual
  对 codepoint 或候选码本进行加权选择，重点抑制 down projection 的极端误差放大。
- 动机：W2/G32 MLP-only 首轮中，codebook GPTQ 全局 weight relative-L2 仅从
  uniform 的 `0.4158` 升至 `0.4401`，但 `layer 2 down_proj` weight relative-L2
  达到 `1.6667`，局部 projection output relative-L2 从 `0.0176` 放大到 `0.2076`，
  最终 PPL 从 `39.6571` 恶化到 `67.1622`。普通全局 KMeans weight MSE 没有保护
  Hessian-sensitive residual 方向。
- 预期效果：不改变 GSQ 的概率训练流程、bit width、group size 或 `lm_head` 策略，
  先把 codebook GPTQ 初始化恢复到至少不差于 uniform GPTQ 的水平。
- 状态：待验证；当前优先级最高，不应与完整十轮 GSQ 训练同时混改。
- 跨模型证据：真实 Qwen3-4B 上 `layers 6/16/1 down_proj` 的码本误差分别达到均匀
  GPTQ 的 `18.09×/7.11×/5.74×`；恢复这三个 FP 层可追回 `89.63%` 的 PPL 差距。
  因此该方向已从单模型假设升级为跨模型高置信根因，算法修复本身仍待验证。

## 2026-07-14：GPTQ-preserving GSQ Update Audit

- 描述：在保持原 GSQ optimizer、Gumbel-Softmax 和训练目标不变的前提下，记录每层
  assignment change rate、scale drift、hard weight error 和最终 token NLL，判断何时
  概率训练偏离 GPTQ 初始化；先作为审计和诊断，不立即加入额外 gate。
- 动机：首轮 codebook GSQ 改变了 `30.713%` 权重 assignments，scale relative-L2
  漂移 `0.9707`，PPL 从 `67.1622` 恶化到 `70.4742`；uniform GSQ 的全局 weight
  relative-L2 从 `0.4158` 升到 `0.4555`，PPL 更从 `39.6571` 恶化到 `96.7384`。
- 预期效果：确定问题来自训练目标、logit/scale 更新幅度还是硬化过程，为后续是否需要
  trust region 或 held-out acceptance 提供证据，同时避免过早偏离“只替换码点”的主线。
- 状态：审计指标已验证，算法改造待定。

## 2026-07-14 18:30:42：Attention-Aware GPTQ-Preserving GSQ

- 描述：在固定全 block 七 Linear 范围下，重点约束 q/k/v/o 的 GSQ 更新不得大幅偏离
  GPTQ hard state；优先诊断 q/k 2000-step Hessian/Gumbel 路径的 assignment 与 scale
  漂移，再考虑 trust region、冻结 scale 或按最终 token NLL 接受 attention 更新。
- 动机：Qwen3-4B all-block codebook GSQ 中 q/k assignments 分别改变
  `49.71%/50.89%`，整体 scale relative-L2 `1.033`，PPL 从 codebook GPTQ
  `36.07` 恶化到 `84.07`；uniform GSQ 更从 `19.02` 恶化到 `285.17`。
- 预期效果：保持论文要求的 q/k/v/o/gate/up/down 全量化，同时避免 attention GSQ
  把可靠的 GPTQ 初始化重构成局部 MSE 更低但全模型 NLL 更差的状态。
- 状态：待验证；后续不得通过取消 attention 量化回避问题。

## 2026-07-15 00:22:19：Uniform-GSQ 子集初始化的矢量码本 GSQ

- 描述：在官方 Uniform GPTQ→GSQ 复现通过后，把每个 scalar group 的固定均匀四点
  grid 替换为固定维度的矢量码本；码本候选集合必须显式包含可表达原均匀 scalar
  组合的子集，使 Uniform GSQ 成为矢量方法可退化到的合法解，而不是另一个不匹配
  baseline。其余 staged objectives、GPTQ initialization、Gumbel assignment training、
  calibration data、训练预算和 evaluator 保持不变。
- 动机：若矢量码本的可行集合严格包含均匀 scalar grid 的笛卡尔积，则在相同目标、
  metadata/bit budget 和优化充分的前提下，其理论重建误差上限不应差于均匀量化；旧的
  per-Linear 非均匀 scalar KMeans 并不满足这一严格子集/预算论证，不能代替矢量实验。
- 预期效果：先保留 Uniform GSQ 已验证的可靠解，再通过矢量候选捕获组内相关性，降低
  Hessian-weighted reconstruction error 和最终 token NLL；若训练失败，可回退到均匀
  子集而不损失 baseline。
- 状态：待 Uniform Qwen3-4B W2/G128 正式复现完成且 GSQ PPL 低于 matched GPTQ 后
  启动；当前不得提前混入 Uniform 复现实验。

## 2026-07-16 00:36:03：NoWag-VQ 初始化的 Local-Candidate Vector-GSQ

- 描述：使用 NoWag 的双轴 L2 normalization 与 activation-Hessian-diagonal weighted
  vector k-means，初始化每个 Linear 的 vector codebook 和 hard assignments；随后新增
  vector Gumbel quantizer，在每个 subvector 的 NoWag 初始码字及 top-k 邻近码字上训练
  分配概率，继续沿用 GSQ 的 q/k、attention、MLP staged block objectives。
- 动机：NoWag-VQ 在论文中以较少校准数据获得强 one-shot VQ 结果，且其输出天然包含
  codebook 与 assignment，适合替代未来 Vector-GSQ 的初始化器。它不能直接替换当前
  Uniform GSQ 的 `(Q, per-group scales)`，因为 NoWag 使用 row/column normalization，
  没有 G32/G128 scalar grid 参数化。
- 关键约束：官方默认 `d=6, K=4096` 若为每个 subvector 建立全码本 bf16 logits，
  Qwen3-4B 单 block 仅 logits 约需 `124.46 GB`，不可行；正式版本必须采用 local top-k
  candidate，并永久保留 NoWag initial assignment 作为 hard fallback。G32 与 d=6 不整除，
  需要改用 d=2/d=4、显式 padding，或放弃 G32 scale 参数化并按真实 effective bpp 比较。
- 公平性边界：`d=6, K=4096` 与 Uniform W2 的 `4^6=4096` 个笛卡尔积码字同容量；
  learned NoWag codebook 默认是 Uniform codebook 的替代集合，不是严格超集。若不增加
  K/bpp，只能把完整 Uniform checkpoint 作为方法外部 acceptance fallback，不能声称
  单个 NoWag codebook 在理论上保证不差于 Uniform。
- 预期效果：比随机/KMeans-only vector initialization 更可靠地保护 activation-sensitive
  坐标，同时用 GSQ 的 block trajectory objective 进一步修正 NoWag one-shot assignments；
  失败时可逐 vector 回退到 NoWag hard state。
- 状态：可行性与代码逻辑已核查，待验证。第一步建议 `d=2, K=16` 做单 Linear/单 block
  闭环；正式上限方向为 `d=6, K=4096, local top-k=4/8/16`。不得直接复制 GPL-3.0
  NoWag 源码进入 Apache-2.0 GSQ，应依据论文公式独立实现。
- 详细报告：`docs/20260716_003603_nowag_as_gsq_initialization_feasibility.md`。

## 2026-07-16 01:18:01：NoWag-d1 + 可训练 G32 Group Scale 的 Scalar-Codebook GSQ

- 描述：对每个 Linear 先做 NoWag column-L2、row-L2 normalization，按输入维度做
  G32/G64/G128 分组（默认 G32），用 group absmax 初始化 scale；随后在整个 Linear 上
  运行 `d=1,K=4` 的 Hessian-aware weighted k-means，得到一个 per-Linear 非均匀四点
  codebook 和 hard assignments。GSQ 阶段固定 row/column norms 与 codebook，训练每权重
  4-way assignment logits，并把每个输出行、每个 group 的 scale 以
  `s=s0*exp(delta)` 作为受约束训练参数。
- 理论定位：`d=1` 是 VQ 的退化标量情形，Hessian 权重不会改变最近码点 assignment，
  只会改变 codepoint weighted mean；方法收益来自非均匀码点、NoWag 行列归一化、局部
  group scale 和 GSQ block objective，而非跨权重 vector correlation。
- 稳定性约束：row/column norms 主版本冻结；codebook 主版本冻结且码点有序；group scale
  使用正 log-ratio 参数化、较小学习率、前 2 epochs warm-up freeze 和默认
  `[2/3*s0,1.5*s0]` trust region。不得让 norms/codebook/scales/logits 在第一版全部无约束
  联合训练。
- Optional GPTQ：仅允许在 normalized FP weights 上运行以 NoWag codebook 为 quantizer 的
  codebook-aware GPTQ；不能把 NoWag hard weights 再送入标准 Uniform GPTQ。是否采用由
  full-Hessian objective、block hard error 和 prefix PPL 共同决定。
- 预期效果：局部 diagonal-Hessian 初始化误差高概率优于普通 Uniform/非加权 KMeans；
  加入受约束 trainable scale 与可选 codebook-aware GPTQ 后，有中等至中高概率超过
  matched Uniform GSQ，最终仍以相同 group size、真实 effective bpp 和完整 PPL 判定。
- 状态：已完成 Qwen3-0.6B、seed 0 的分阶段与正式验证。G32/G64 已否决；G128 的
  `I3 codebook-aware GPTQ + G3 trust-region scale GSQ` 在 2/4/8 blocks 和两档完整
  28-layer 实验中都超过 matched Uniform。正式 FineWeb-Edu 大校准结果为 Uniform
  PPL `53.3462`、NoWag PPL `52.4976`，相对改善 `1.5908%`；NoWag logical effective
  bpp `2.147945`，Uniform `2.125`。I1 absmax-only、I2 weighted-LS、G2/G4/G5 均否决。
- 详细文档：`docs/20260716_011801_nowag_d1_trainable_group_scale_gsq_design.md`。
- 完整实验总结：`docs/20260716_103826_qwen3_06b_nowag_d1_g128_full_experiment_summary.md`。

## 2026-07-18 01:45:57：低维码本 + 独立短序列分段的快速 Vector-GSQ

- 描述：把 NoWag-VQ 的维度从 d=6/K=4096 降到 d=3/K=64 或 d=2/K=16，
  同时把 FineWeb-Edu 的 4096-token 校准行在 embedding 前确定性拆成独立的
  1024-token 段，以 local top-4/top-8 和 1–2 个覆盖周期训练 assignment。
- 动机：d=6 正式 top-32 实验的 `20.415 h` 中约 `19.22 h` 来自 GSQ 前后向；
  全码本候选构建每个 Linear 仅约 `0.05–0.17 s`。因此单独降低 K 不能达到
  2–3 小时目标，必须同时减少每步序列计算和训练步数，并尽量保持不同 token 覆盖。
- 预期效果：d=3 保留部分矢量 shape gain，K=64 降低初始化/GPTQ 搜索成本；
  1024-token 独立分段在一个 epoch 内仍可覆盖原 4096×4096 个 token，但将每步
  上下文计算显著压缩。目标为完整 Qwen3-0.6B 28 层 ≤3 h，WikiText2 PPL ≤35。
- 对照：d=2/top-4 作为速度下界，d=6/top-4 同预算作为维度控制，GPTQ-only
  d=2/d=3 作为初始化基线。固定 seed 0，不做种子扫描。
- 历史状态：实验启动时为进行中。设计文档：
  `docs/20260718_014557_qwen3_06b_d2d3_fast_vector_gsq_design.md`。

- 最终状态：已验证。d=2 因 8-block GPTQ PPL `54.7159` 且首层 GSQ 更慢而否决；
  d=3/K64 配合 1024-token 独立分段、microbatch 32 和分层 policy，在完整
  Qwen3-0.6B 上达到 `38.7451744 PPL / 2.70598 h / 2.0270182 bpp`。相对
  d=6 最佳训练加速 `7.544×`，但 PPL 仍高 `23.81%`，因此定位为速度/码率 Pareto
  点而非 d=6 的质量替代。

## 2026-07-18 23:20:00：早层长训练、晚层保守训练的 d=3 混合 GSQ

- 描述：同一 d=3/K=64 checkpoint 内采用逐层 GSQ policy。前 N 层使用
  local top-8、1536 steps；剩余层使用 local top-16、1024 steps。比较
  `N=4/8/12`，其余 FineWeb-Edu 数据、Vector-GPTQ、mb32 和验证选择不变。
- 动机：8-block 门控中 top-8/1536 达到最优 `23.1029 PPL`，但统一应用到
  28 层得到 `39.8675`，反而差于统一 top-16/1024 的 `39.1902`；说明前层
  受益于更长局部搜索，而晚层更容易积累 assignment 漂移。统一超参不是最优。
- 预期效果：保留早层 top-8/1536 的改善，同时用晚层 top-16/1024 抑制深层
  累计偏移；运行时间约 3–3.5 小时，目标低于当前 d=3 最佳 `39.1902`。
- 历史状态：实验启动时为进行中；固定 seed 0，不做种子扫描。

- 最终状态：已验证。N=0/2/4/6/8/12 的完整 PPL 分别为
  `39.1902/40.0298/38.7452/41.6609/40.7958/39.2159`。N=4 是唯一明确优于统一
  top-16/1024 的边界，相对改善 `1.1356%`；N=6/8 明显恶化，证明深层误差交互
  强非单调。最终采用前 4 层 top-8/1536、后 24 层 top-16/1024。

## 2026-07-20 16:35:00：面向 8B–70B 的显存约束 Vector-GSQ 分级候选策略

- 描述：跨模型保持 NoWag-VQ → Vector-GPTQ → block-level Vector-GSQ 主流程，先按
  每个 block 的向量数估算 `candidate_ids`、logits、Lion 状态和 soft candidate 临时
  张量显存；8B/14B 依次门控 local top-4/8，只有显存允许且质量门控改善时才扩大到
  top-16/32。70B 使用逐 block CPU/offload 或双 GPU 执行路径，禁止整模型 BF16
  直接 `.to(cuda)`。
- 动机：当前 0.6B top-32 的峰值显存约 16.6GB，但候选概率状态随单 block 权重数近似
  线性增长；直接把同配置放大到 8B/14B 大概率 OOM。码本 K 不是 GSQ 主时间瓶颈，
  local candidate 状态才是大模型显存瓶颈。
- 预期效果：在不改变七 Linear 联合 block objective 的前提下，找到每个模型可运行的
  最大候选宽度，并通过 1-block/8-block/full-model 分级门控避免长任务末期 OOM。
- 当前状态：进行中。Qwen3-8B/14B 模型已在本地；待同步到双 A6000 执行机并完成
  显存门控。Llama-3-70B 必须先完成 offload 路径；Llama-2-7B 原始 HF 权重本地缺失。

## 2026-07-24 18:04:00：持久化逐层激活快照以消除长 resume replay

- 描述：在每个完整层 checkpoint 后，可选持久化下一层所需的 train/val/GPTQ 激活，
  并记录模型、数据 token cache、dtype、层号和量化 checkpoint 哈希；resume 时哈希完全
  匹配才直接加载，否则回退到从 embedding 顺序回放。
- 动机：本轮 8B 恢复第 14 层前需要回放 14 层，RAM 缓存下仍约 60 分钟；14B mmap
  回放 9 层约 85 分钟。该成本不属于训练本身，并会在每次重启重复发生。
- 预期效果：正常 checkpoint resume 从小时级回放降到单次激活载入时间；不改变训练
  数值协议。代价是每个持久快照约 150–190GB，需要保留策略、校验和和容量上限。
- 当前状态：待验证；本轮未实现，避免在正式运行中引入新的存储格式和超过 300GB 的
  额外长期占用。

## 2026-07-25 12:30:00：以 checkpoint 哈希保护的单份 activation resume snapshot

- 描述：不保存每层历史 activation，而只保留“最新完整 checkpoint 对应的下一层输入”
  单份 train/val/GPTQ mmap snapshot；新 checkpoint 原子替换旧 snapshot。
- 动机：本轮 8B 从第 18 层恢复仍回放约 90 分钟，14B 从第 11 层恢复约 90 分钟；
  逐层长期保存需要数 TB，但单份滚动 snapshot 只需约 150–190GB。
- 预期效果：正常重启从小时级逐层 replay 降为一次顺序 mmap 打开/校验，且容量固定；
  checkpoint、数据 token cache、dtype、shape 或层号不匹配时自动回退完整 replay。
- 当前状态：进行中；本轮已验证分阶段 Attention checkpoint 恢复，activation snapshot
  文件格式、哈希和原子替换仍待实现。

## 2026-07-27 17:07:22：FSR-VQ 函数空间残差向量量化

- 描述：把当前“VQ/Vector-GPTQ 初始化后训练 local assignment logits”的方法升级为
  Function-Space Residual Vector Quantization。新方法在真实 hard vector deployment format
  中，根据 codeword transition 对模型函数残差的边际影响构建候选图，使用 residual-aware
  hard coordinate updates 直接优化 assignments；随后在固定 codebook shape、dtype、assignment
  width 和 metadata 格式下执行 rate-neutral codebook transport，并通过 downstream-window
  hard objective 与独立 calibration validation gate 选择状态。最终可加入全模型实际字节预算下
  的逐层 rate allocation。
- 动机：当前 Vector 方法已有明显质量收益，但核心创新容易被概括为“VQ 后用
  Gumbel-Softmax 训练 assignment”；候选仍主要来自权重/Hessian 最近邻，soft convex
  combination 与 hard 部署存在 gap，码本基本冻结，也没有直接优化严格 rate--distortion。
- 核心假设：weight-space nearest codeword 不等于 function-space best codeword。某些在权重
  空间较远的码字可能通过抵消当前 block/downstream residual 获得更低模型函数误差。
- 新增创新点：任务诱导的 codeword transition graph；Linear 层精确 hard loss-delta；
  nonlinear block proposal--verify；码率中性的正则化 codebook transport；downstream-window
  objective；全模型真实 bpp 预算分配。
- 预期效果：在相同实际 bpp 下获得优于当前 soft Vector baseline 的 PPL/accuracy，并通过
  hard coordinate optimization 消除 soft-to-hard gap、降低量化训练时间。目标是在 Qwen、
  Llama、Mistral/Gemma 至少三类架构上形成更优 rate--distortion frontier。
- 当前状态：Gate 0/1 已通过，进入 function-directed candidate generator 阶段。exact Linear
  delta、hard commit/rollback 和固定格式 payload bytes 已通过 4 项红绿灯测试；Qwen3-0.6B
  layer-0 `k_proj` 的四个 token row/seed 重复实验显示，geometric top-8 对全码本 function
  optimum 的平均召回只有 `6.67%`，只覆盖 `37.76%` 的 oracle gain；在相同 top-8 内用
  exact function delta 重排，累计 SSE 改善为纯 geometric 选择的 `7.08×`。下一步优先构造
  不需要 exhaustive K=4096 扫描的 function-directed candidates，再进入 nonlinear block
  proposal--verify；codebook transport、downstream window 和 global rate allocator 仍未验证。
- 详细设计：`docs/20260727_170722_fsr_vq_iclr_method_detailed_design.md`。
- Gate 0/1 报告：`report/20260728_080519_fsr_vq_qwen3_06b_exact_linear_candidate_gate_report.md`。

### 2026-07-28 08:11:36 更新：Residual-shifted target 候选近似命中全码本 oracle

- 推导：固定输入 Linear 的 exact hard-transition quadratic 可改写为 codeword 到
  `c* = c0 - A^{-1}q` 的 Mahalanobis distance，其中 `A=S(X^T X)S`、
  `q=S X^T r`。因此 function-best codeword 是离 residual-shifted continuous target 最近的
  hard codeword，而不是离浮点权重最近的 codeword。
- 实现：使用 `diag(A)` 对 K=4096 codebook 做与普通 geometric scan 同阶的 `O(Kd)`
  top-8 搜索，再用 exact function delta 重排。
- 结果：四个 token row/seed 上，residual-target top-8 对 function oracle 的平均召回
  `99.487%`、oracle gain coverage `99.9609%`，实际 SSE gain 达到 full K=4096 oracle 的
  `99.9592%`；geometric top-8 分别只有 `6.67%` 和 `37.76%`。
- 状态：Linear candidate-generation gate 已通过。下一步转向多 Linear/多层复现和完整
  nonlinear block proposal--verify；本结果仍不是 PPL 或 full-model 结论。
- 报告：`report/20260728_081136_fsr_vq_residual_shifted_target_candidate_report.md`。

### 2026-07-28 08:15:27 更新：FSR-VQ 执行级研究协议定稿

- 描述：将 residual-shifted target 升级为 Candidate Stage 主路径，补齐从单 Linear 状态、
  exact delta、candidate metadata、nonlinear block transaction、独立 validation gate、
  quantized-prefix propagation、prefix/full-model 评测到论文表格的执行级协议。
- 动机：现有设计文档覆盖了完整研究方向，但顶部状态和部分候选描述早于 99.9609%
  oracle gain coverage 结果；后续实现必须严格区分已经证明的 Linear 性质与尚未验证的
  nonlinear/PPL 主张，并统一 train/validation 隔离、rollback 和 actual-bpp 口径。
- 当前状态：协议已完成；Linear gate 已验证。Nonlinear block、多层复制、prefix/full-model、
  transport/window/rate allocation 均为待验证，不因文档完成而改变实验状态。
- 文档：`docs/20260728_081527_fsr_vq_execution_and_paper_protocol.md`。

### 2026-07-28 08:33:06 更新：Residual target 跨层成立，输出投影成为压力测试

- 描述：在 Qwen3-0.6B layers 0/14/27 的 q/k/v/o/gate/up/down 上完成 84 个 FP-prefix
  Linear gates。Residual-target top-8 的 cell-level oracle gain coverage 均值 `99.255%`、
  中位数 `99.845%`、下四分位 `99.476%`，远高于 geometric top-8 的 `30.514%`。
- 新机制发现：function-best exact ID recall 会在 late `o_proj` 降至 `61.579%`，但 gain
  coverage 仍有 `95.232%`，说明多个 codewords 可具有近似等价 function gain；候选质量
  应以 gain coverage 为主、ID recall 为机制辅助指标。
- 下一 idea：nonlinear block proposal--verify 不只选容易的 `k_proj`，必须把 layer-27
  `o_proj` 和 `down_proj` 作为 stress cases，并比较 single-transition、per-Linear proposal
  batch 以及 adaptive top-k 是否能处理输出投影的候选退化。
- 状态：多 Linear/多层 FP-prefix Gate 已验证；quantized-prefix 和 nonlinear Block 待验证。
- 报告：`report/20260728_083306_fsr_vq_qwen3_06b_multilinear_multilayer_candidate_gate_report.md`。

### 2026-07-28 08:52:46 更新：Nonlinear block rerank 是必要的第二级离散搜索

- 描述：Residual-target 不直接提交 Linear rank-0，而是生成小型 hard proposal pool；对
  top-16 proposals 逐个运行完整 Qwen block train forward，再将 block-best proposal 送入
  四条独立 validation sequences。
- 证据：Top-1 只有 `4/16` accepted，top-16 nonlinear rerank 达到 `9/16`；train pass 从
  `9/16` 提高到 `16/16`。`15/16` 最终选择不是 Linear rank-0，证明两级目标确实不同。
- 压力模块：layer-27 `down_proj` 达到 `4/4` accepted、所有 validation sequences 改善；
  layer-0 `k_proj` 虽 `4/4` train improved，但仍 `0/4` validation accepted。
- 新 idea：用多个 train sequences 聚合 block objective，减少早层单序列过拟合；之后进行
  validation-gated accepted-transition accumulation，并刷新 residual/candidate state。
- 状态：single-transition FP-prefix nonlinear block Gate 部分验证；multi-train、multi-transition、
  quantized-prefix 和 PPL 待验证。
- 报告：`report/20260728_085246_fsr_vq_qwen3_06b_nonlinear_block_proposal_verify_report.md`。

### 2026-07-28 09:00:06 更新：Multi-train objective 修复早层泛化，但逐层最优聚合不同

- 描述：将四条 train sequences 的 Linear inputs/residuals 拼接生成 residual target，并用
  四条完整 block losses 的均值和 improved fraction 做 top-16 nonlinear rerank；再用八条
  独立 validation sequences 接受。
- 结果：layer-0 `k_proj` 从 single-train `0/4` accepted 提升为 `3/4`，证明早层失败主要
  是单序列过拟合而非候选机制失效；总体 accepted 从 `9/16` 提升为 `10/16`。
- 反例：layer-14 `k_proj` 从 `3/4` 降为 `1/4`，说明 train sequence count 需要逐层自适应，
  可研究 `1/2/4/8` sequence objective、worst-case/variance regularization 和 proposal union。
- 状态：multi-train single-transition 已验证；accepted-transition accumulation 待验证。
- 报告：`report/20260728_090006_fsr_vq_qwen3_06b_multitrain_block_generalization_report.md`。

### 2026-07-28 09:17:49 更新：Validation-gated trajectory 形成稳定 block-level optimizer

- 描述：不再只验证一个 transition，而是在当前 accepted hard state 上持续刷新 residual target
  和 proposal pool；每轮 exact nonlinear train rerank + validation gate，首次拒绝停止，并用
  完全独立 audit set 评测最终状态。
- 结果：layer-27 `down_proj` 四 seed 分别接受 `49/128/93/120` transitions，平均 audit
  improvement `6.5327%`；每个 seed 的所有八条 audit sequences 都改善。
- 机制：train loss 在停止点仍可能下降，但 validation mean/consistency 已恶化，证明 validation
  gate 是必要的 stopping rule。Seed-specific stop point 表明 transition budget 应自适应。
- 新 idea：扩展为七 Linear 交替 block optimizer；保存 deployment checkpoint delta；随后在
  source-quantized-prefix 上重跑并进入 prefix PPL。
- 状态：单 Linear multi-transition block trajectory 已验证；multi-Linear/quantized-prefix 待验证。
- 报告：`report/20260728_091749_fsr_vq_qwen3_06b_layer27_down_proj_accumulation_report.md`。

### 2026-07-28 10:05:00 更新：用 downstream-window objective 放大 PPL 对齐收益

- 新证据：seed-1 的 128 个 layer-27 `down_proj` hard transitions 在相同
  `2.2010416667` logical bpp 下把 WikiText2 PPL 从 `57.291374` 降至 `57.272774`，证明
  block-output improvement 能传递到最终 PPL，但相对幅度只有 `0.032466%`。
- Idea：把最终 nonlinear rerank objective 从当前 block output 扩展为 1/2/4 个 downstream
  blocks 的输出误差，或在最后层加入 final norm/logit KL。Candidate generation 仍使用便宜的
  exact Linear residual target，只改变小型 proposal pool 的 Stage-2 排序目标。
- 动机：保持候选搜索效率，同时减少“block MSE 大幅改善但 logits/PPL 只微幅变化”的目标错位。
- 预期实验：同一 source state、相同 candidate pool、相同 train/validation/audit split，比较
  block-only、1-block downstream、2-block downstream、logit-aware 四种 rerank；报告接受率、
  audit gain、PPL、运行时和显存。
- 当前状态：待验证。先完成其余 seed PPL，确认 block audit gain 与 PPL delta 的稳定性，再
  决定是否升级正式 objective。

### 2026-07-28 10:05:00 更新：多 seed PPL 作为 trajectory 选择校准器

- Idea：物化 seed 0/2/3 的停止态并统一评测 PPL，以独立 audit block gain、accepted count、
  stop reason 预测 PPL delta；不允许在看到 test PPL 后反向选择正式 seed。
- 动机：当前只有 seed-1 PPL，无法判断 `128 steps/budget exhausted` 是否比 validation 自然停止
  更好，也无法估计结果方差。
- 预期效果：建立不使用 WikiText2 test 选择 trajectory 的 selection protocol；若 audit gain
  与 PPL 相关，可用 calibration audit 选择 checkpoint；若不相关，转向 downstream objective。
- 当前状态：待验证，最高优先级。

### 2026-07-28 10:25:00 更新：多 Seed PPL 完成，正式转向 downstream/logit objective

- 结果：3/4 seeds 改善，mean relative PPL delta `-0.049156%`，但 seed 2 恶化
  `+0.081139%`；“通常有正信号”得到支持，“所有 trajectories 稳定改善”被否定。
- 发现：audit block gain 与 PPL delta 的四点 Pearson 为 `+0.5529`，accepted count 也不能
  预测 PPL；block-only MSE 不是充分的最终质量 surrogate。
- 决策：Candidate Stage 保留 residual target；Stage-2 比较 `w=0/1/2/4/to_logits` 的 hard
  proposal rerank，并使用独立 validation window。WikiText2 test 不参与 window 选择。
- 预注册目标：至少 3/4 seeds 改善，任何 seed 不得恶化超过 `0.02%`，mean delta 优于当前
  `-0.028162`，同时报告额外时间和显存。
- 当前状态：待实现与验证，下一主 Gate。

### 2026-07-28 10:50:00 更新：纯 Logits Gate 未通过，升级为约束式双目标搜索

- 纯 logits 结果：accepted `5/9/1/0`，2/4 PPL 改善，mean relative delta `-0.005899%`；
  方差和 worst degradation 显著优于 block-only，但平均收益不足。
- 新 idea：把 block objective 定义为 proposal utility，把独立 logit evidence 定义为 safety
  constraint。Train pool 中只保留 block 与 logit 都不恶化的 Pareto-feasible proposals，再按
  block gain 或归一化联合效用排序；validation 同时要求 block 和 logit Gate 通过。
- 动机：纯 block 收益大但有危险方向，纯 logits 安全但过早停止；约束式双目标可分离“收益”
  与“安全”，比固定加权和更容易解释，也避免权重超参数掩盖某一目标恶化。
- 下一消融：block-only、logits-only、weighted-sum、block-with-logit-guard；保持同 candidate
  pool、四 seeds、数据 split 和 PPL evaluator。
- 当前状态：待实现；纯 logits 方案已验证但被否决为最终主路径。

### 2026-07-28 12:20:00 更新：概率空间 Safety Constraint

- 双目标结果：block utility + logit guard + 32 validation sequences 达到 3/4 seeds 改善、
  mean `-0.020405%`、worst `+0.003050%`，优于 val8 的稳定性。
- 失败结果：maximin 过于保守；512-token calibration 在四 seeds 上全部恶化，说明 logit MSE
  与 PPL/NLL 的 mismatch 不是增加 token 数即可解决。
- 新 idea：将 safety constraint 改为 teacher KL 或真实 next-token NLL delta。Block gain 继续
  作为 utility，proposal 只有在独立 validation 上 probability-space metric 不恶化才允许提交。
- Teacher KL 消融：temperature `1/2/4`，full vocab 与 teacher top-k vocabulary；报告近似误差、
  显存和耗时。
- NLL 消融：train labels 仅用于 candidate safety，validation labels 决定 commit，audit labels
  只评最终 trajectory；WikiText2 test 不参与选择。
- 当前状态：待实现，优先级高于继续扩大 block 数。

### 2026-07-28 14:15:00 更新：Coarse Trajectory End-Metric Selection

- NLL/KL 结论：概率空间单步 guard 仍受 calibration corpus/domain shift 影响，不能稳定预测
  WikiText test PPL；不再继续调 temperature 或单步 fraction。
- 新方法：局部 objective 只生成 trajectory；按 `0/8/16/32/48/.../final` 物化 coarse
  snapshots，用完全 held-out、2048 sequence-length validation PPL 选择部署 checkpoint。
- 新 seeds 证据：4/4 selected states test 不恶化，2/4 改善，mean `-0.038948%`；selector
  拒绝的 seed-5 final 事后证明确实恶化 `+0.005433%`。
- 下一 idea：Multi-corpus selector，同时报告 WikiText validation、C4 validation、FineWeb
  held-out PPL；用 robust rank/最大 regret 选择，避免只优化单一 benchmark domain。
- 当前状态：单域 WikiText selector 已验证；跨域 selector、accuracy selector 待验证。

### 2026-07-28 15:20:00 更新：PPL Selector 与 Accuracy Safety 解耦

- 新证据：validation-PPL 选中的 seed4/step86 和 seed6/step58 都改善 test PPL，但六任务 macro
  分别变化 `+0.0558/-0.0656` 个百分点；两个 state 平均仅 `-0.00493` 个百分点，整体近似持平，
  但方向不一致。
- 结论：同域 PPL selector 不能作为 accuracy preservation certificate；“PPL 不退化”和
  “zero-shot accuracy 不退化”必须作为两个独立 Gate 报告。
- 新 idea：在 PPL selector 先产生 2--3 个 snapshots 的短名单后，再运行 accuracy safety audit，
  而不是对所有 transitions 做昂贵的 lm_eval。可先用 HellaSwag + LAMBADA 作为低成本筛选，
  最终 checkpoint 再运行正式六任务。
- 新 idea：下一轮启用 per-sample logging，对同一测试样本执行 paired bootstrap/McNemar；只有
  paired confidence interval 覆盖预设 non-inferiority margin，才宣称 accuracy preservation。
- 建议 non-inferiority margin：macro `-0.2` 个百分点作为首轮工程 Gate，正式论文同时报告
  每任务 paired interval，避免宏平均掩盖单任务回退。该 margin 尚未预注册验证，当前为待验证。
- 当前状态：六任务数值 reveal 已完成；严格 paired non-inferiority、accuracy-aware shortlist
  selector、跨模型复制待验证。

### 2026-07-28 16:30:00 更新：Paired Accuracy Gate 验证完成

- 结果：在 14 服务器固定环境中，seed4/step86 与 seed6/step58 的 macro paired 95% CI 分别为
  `[-0.0427,+0.2823]` 和 `[-0.1324,+0.1452]` pp，均通过 `-0.2 pp` non-inferiority margin。
- 更新判断：PPL-selected checkpoints 已获得 macro accuracy preservation 的正式配对证据，
  不再仅依赖独立 standard error；但 CI 跨零，仍没有显著 accuracy gain。
- 失败边界：per-task NI 只有 seed4 4/6、seed6 2/6 通过，不能声称每个任务均无损。
- 新 idea：accuracy safety selector 应以 macro NI 为 primary Gate、任务级 catastrophic margin
  为 secondary Gate；若要求每任务 `-0.2 pp`，当前样本量对极少 disagreement 的任务过严，
  可预注册更符合任务标准误的 task-specific margins，但不能事后按本结果调 margin。
- 新 idea：固定 remote-14 软件栈并输出 environment lockfile；框架/BF16 路径变化会翻转少量
  multiple-choice 排序，跨机 absolute accuracy 不应进入同一主结果表。
- 当前状态：Qwen3-0.6B 单 late-layer Linear 的 macro NI 已验证；七 Linear、多 block、完整模型
  和跨架构 paired NI 待验证。

### 2026-07-28 17:00:00 更新：七 Linear Block-Coordinate Sweep

- Idea：把单 Linear trajectory 扩展为一个 decoder block 内的七 Linear block-coordinate sweep。
  固定顺序为 `q/k/v/o/gate/up/down`；每阶段提交后立即物化 checkpoint，下一阶段从更新后的全部
  七 Linear hard state 重新运行 candidate generation 和 nonlinear validation。
- 动机：直接在一个进程内混合所有 Linear proposal 会显著扩大 candidate pool、显存和事务状态；
  顺序 block-coordinate 方法复用已验证的单 Linear transaction，同时保证跨 Linear interaction
  通过下一阶段的完整 block forward 重新进入 residual。
- 首轮 Gate：layer 27、FP-prefix、block objective、一个 sweep、每 Linear 最多 16 transitions、
  train rows 0--3、validation 128--135、audit 256--263、base seed 4。
- 成功条件：七阶段全部完成、checkpoint 链无断裂、至少两个不同 Linear 接受 transition、最终
  validation/audit block loss 不发生明显回退；之后物化 coarse snapshots 做 2048 validation PPL。
- 当前状态：调度器与红绿灯测试已完成；正式实验将在 `10.30.0.14` 启动。

### 2026-08-11 16:55:00 更新：七 Linear Sweep PPL Gate 已验证，转向多 Seed 稳定性

- 新证据：layer-27 七阶段累计 24 个 hard transitions；validation PPL 从 `60.511864` 降到
  `60.498249`，selector 选中 final stage07；同环境 test PPL 从 `57.291264` 降到
  `57.281593`，相对改善 `0.016879%`，logical bpp 完全不变。
- 机制发现：q_proj 对 BF16 PPL 无可见变化，k_proj 单阶段短暂恶化，v/o/down 的后续更新恢复
  并超过 Source；因此“局部 accepted transition 逐步单调改善终端 PPL”被否定，粗粒度
  end-metric snapshot selector 必须保留在正式方法中。
- 方法意义：single-Linear transaction 已扩展成完整 block 内的 hard block-coordinate chain，
  跨 Linear checkpoint reload、residual refresh、stale proposal isolation 和 validation selector
  已形成可运行闭环。
- 下一 idea：固定协议复制 seeds 5--7，报告 selected test non-degradation count、均值、方差和
  worst delta；不得根据 test 调 stage 顺序或 transition budget。达到稳定性 Gate 后再扩到连续
  2/4 blocks，形成 block-count scaling curve。
- 当前状态：单 seed 七 Linear Gate 已验证；多 seed 与 multi-block 待验证。
### 2026-08-12：单 GPU 多 Linear Vector-GPTQ 并发

- Idea：在 block 内保持 NoWag seed 隔离和 Vector-GSQ 联合目标不变，仅把七个独立
  Vector-GPTQ refinement 调度到同一 GPU 的多个 CUDA stream。
- 动机：现有 8B/14B 正式结果中 Vector-GPTQ 分别约占总墙钟 44.6%/66.2%，且单个
  Linear 内存在列方向误差传播依赖，而 Linear 之间不存在依赖。
- 预期效果：大显存且单任务未饱和时降低 GPTQ wall time；并发过高可能受计算/显存带宽
  饱和影响，或触发 OOM。
- 当前状态：进行中；代码和本地 1/2/4/7 路 Gate 脚本已完成，等待用户本地执行。

### 2026-08-12：并发加速必须以完整 Vector-GSQ 端到端质量闭环验收

- Idea：性能 Gate 只用于诊断 Vector-GPTQ wall time；正式结论必须来自完整
  NoWag-d6 → Vector-GPTQ → Vector-GSQ checkpoint，并同时报告 fresh reconstruction
  PPL、EvalScope Native 和 lm_eval 六任务。
- 动机：只跑 Vector-GPTQ 无法证明联合 GSQ 的最终质量，单看 block MSE 也无法判断语言模型
  PPL 或下游 accuracy。
- 预期效果：将系统吞吐改动和方法质量绑定到同一时间戳实验产物，避免误用中间阶段结果。
- 当前状态：完整本地脚本与 EvalScope logical-checkpoint adapter 已完成，待用户运行。

### 2026-08-12：大模型单 GPU 逐 block CPU-offload

- Idea：对 Qwen3-32B 等 BF16 权重接近单卡容量的模型，基础模型驻 CPU，只把当前 block
  搬到 GPU；hidden cache 保存在 CPU，当前 block 完成量化与传播后立即 offload。
- 动机：整模型 `.to(cuda)` 会让约 64GB 的 Qwen3-32B 权重与 Hessian、codebook、七路
  Vector-GPTQ 工作区竞争 80GB 显存，无法为 concurrency=7 留出可靠余量。
- 预期效果：把 GPU 常驻权重从整模型降到单 block，使显存主要用于当前 block 的七路并发
  初始化和联合 GSQ；代价是每层约一次 CPU↔GPU 权重传输以及更高的主存占用。
- 当前状态：runner、GPU3 专用 launcher、结构化进度日志和红绿灯测试已完成；首次实机启动因
  GPU3 被外部 vLLM 占用而安全延期，后台等待器已按用户要求停止。

### 2026-08-12 18:26:35：Vector-GPTQ 六维反馈的精确三角向量化

- Idea：把每个候选码字的六步顺序误差模拟改写为
  `project(w)=solve_triangular(U.T,w.T).T` 后的全候选平方距离矩阵；选中码字后也用同一个三角
  solve 一次得到跨组反馈误差。
- 动机：旧实现为每个 row chunk 显式构造 `[rows,4096,6]` tensor，并启动六轮逐维算子；这些
  操作与一次六维三角投影在数学上等价。
- 预期效果：保持 NoWag 码本、完整 Hessian 目标、跨组顺序依赖、assignment 与回退条件不变，
  同时减少临时工作区和 kernel/Python 循环。
- 当前状态：已实现并通过旧实现 oracle；`256×4096×6` CPU 隔离 scorer 为 `100.50×`，主要
  candidate 工作区从 `24 MiB` 降至 `4 MiB`。GPU 端到端收益与 PPL/accuracy 仍待正式远端实验。

### 2026-08-12 18:36:08：以 NoWag 码字为锚点的 Vector-GPTQ Top-128 搜索

- Idea：为 4096×6 codebook 预建每个码字的 128-way 近邻表；每个权重向量以 NoWag 初始
  assignment 为 anchor，只对 anchor 及其 127 个近邻计算精确 GPTQ loss。
- 动机：精确三角向量化消除了六步候选模拟，但仍生成 `[row_chunk,4096]` loss；局部候选把该
  矩阵缩小到 `[row_chunk,128]`，同时避免对每个权重向量重新做 4096-way shortlist。
- 预期效果：loss matrix 缩小 32 倍并降低 scorer 时间；代价是可能漏掉误差反馈后移到邻域外的
  全局最优码字，因此必须依赖完整 Hessian NoWag 回退与后续正式 PPL/accuracy 验证。
- 当前状态：默认参数、32B/local launcher、diagnostic 和红绿灯测试已接入；CPU 隔离 scorer
  `3.58×`，synthetic NoWag-like top-128 recall `99.61%`。GPU端到端及模型质量待验证。

### 2026-08-20 14:31:09：结构感知 Staged Vector-GSQ 与固定码尺度微调

- Idea：把现有七 Linear 同时最小化 full-block MSE 的 `Block-all` 路径，扩展为
  `Q 独立 -> K 独立 -> V/O attention 联合 -> MLP block 联合`；离散码固定后再微调输出行尺度。
- 动机：原始 scalar GSQ 的公开消融显示网络结构分阶段目标优于只按 Linear 或一次性 Block-all，
  scale fine-tuning 又提供显著增益。我们的 Vector-GSQ 已有 activation-aware block target 和
  quantized-prefix 传播，真正缺口是结构粒度与 continuous scale refinement，而非再做 seed sweep。
- 预期效果：减少七个 Linear 的 Gumbel assignment 相互干扰，让 V/O 和 MLP 分别对其真实网络
  输出负责；尺度阶段在不改变 codebook/assignment/bpp 的前提下吸收离散码无法表达的幅值误差。
- 风险与 Gate：阶段局部改善不保证整块改善，因此每阶段 validation 选择后仍执行整块 validation
  回退；block-local row scale 不等价于原论文全模型 global scale，需要另做跨层端到端实现。
- 当前状态：代码、CPU 行为测试、Remote-14 LLaMA-3.1-8B launcher 已完成；正式 PPL/六任务结果
  待 Remote-14 单次 matched 实验，尚不能声称超过 uniform GSQ 或 QTIP。

### 2026-08-20 21:26:46：结构感知 assignment 与 group scale 必须联合训练并按部署态 Gate

- Idea：四阶段每个 active Linear 同时优化 Gumbel assignment logits 和 row/input-group log-scale；
  phase checkpoint 对 assignment/scale 成对快照，已提交阶段以 FP16-rounded scale 冻结进入后续
  teacher/student forward，最后用完整 FP16 logical checkpoint reconstruction 做整块 Gate。
- 动机：仅 staged objective 或 assignment 固定后的 group scale refinement 都没有超过同码率
  block-all；原始 GSQ 的有效归纳偏置来自网络结构目标与连续 scale 的共同优化，而非两次割裂优化。
- 当前证据：group128 joint/full-gate PPL=6.21988058，优于同 bpp block-all/fixed-group 的
  6.22095299；group256 以 2.08199 bpp 得到 6.22265720，可公平挑战 2.125 bpp scalar GSQ。
- 风险：当前证据仅 layer 0，改善量很小；原始 scalar GSQ matched 对照与 32 层累积效应仍待验证。
- 当前状态：单层 Vector 内部对照已验证；scalar GSQ Gate 在本地 GPU6 运行中。

### 2026-08-20 21:26:46：局部 block MSE 只作安全 Gate，不作最终方法选择指标

- Idea：保留 block-MSE non-regression 作为低成本回退条件，但跨配置排序使用 held-out prefix/full
  PPL，完整模型再以 WikiText2 PPL 与六项 lm_eval 为最终标准。
- 动机：block polish 得到最低 block MSE `8.2761e-6`，PPL 却退化至 6.22595692；说明量化误差
  方向、后续层放大和语言模型 loss curvature 无法由单个 block 的均方误差充分刻画。
- 当前状态：单层反例已验证；下一步需要把 PPL-aware selector 扩展到少量前缀层，而不是对每个
  block 直接反传整模型 PPL。

### 2026-08-20 21:35:00：用 group160 充分利用 scalar GSQ 的 2.125 bpp 码率预算

- Idea：若 group256/2.08199 bpp 未超过原始 scalar GSQ，则补跑 joint staged group160；按七个
  LLaMA Linear 的真实 shape 和尾组精确计数，总 logical rate 为 2.12075571 bpp，仍不高于 2.125。
- 动机：group128/2.14449 的 PPL 最好但略超 scalar 码率，group256 虽严格低码率却留下约
  0.043 bpp 未使用。group160 是 32 的倍数，并把未使用预算缩至约 0.00424 bpp，兼顾率约束、
  实现规整性与 scale 表达能力。
- 预期效果：PPL 位于 group128 的 6.21988 与 group256 的 6.22266 之间，并有机会在不超码率时
  超过 scalar GSQ；最终仍以程序实际输出的 exact logical bpp 和 2048 PPL Gate 为准。
- 当前状态：单层原始 scalar GSQ 已成功并得到约 6.6813 PPL，group256 Vector 为 6.222657；
  完整 scalar 基线按用户要求主动中止，避免占用调优时间；group160 的完整单卡量化+2048 PPL+
  六任务入口和严格 full-model comparator 已通过红绿灯，并已于 2026-08-20 23:44 在本机物理 GPU1
  直接启动。当前优先取得我们方法的 full-model 结果，再按证据决定是否补跑完整 GSQ。

### 2026-08-21 01:52:15：SAGE-VQ——结构对齐与部署态门控的 Vector-GSQ

- Idea：把 scalar GSQ 提升到 4096 码字 VQ 时，先用 Vector-GPTQ 做 128-way hard search，再构建
  8-way local Gumbel relaxation；沿用其 Q、K、V/O attention、MLP 四阶段 dense interface teacher，
  每阶段同时优化 vector assignment 与
  deployable input-group scale，并用 hard ID + FP16-rounded scale 的原子 checkpoint 做 validation
  selection，最后 fresh reconstruct 完整 logical block 再决定提交或回滚。
- 动机：full 4096-way relaxation 的状态与计算开销过大，局部候选又可能漏掉有效 code；soft
  vector mixture 还不属于部署集合。Scalar GSQ 已提出四阶段，本文不把该顺序重复声明为 novelty。
  已有实验进一步显示最低 block MSE 可能对应更差 PPL，因此需要部署态选择而非只增加训练 steps。
- 理论预期：semantic-interface error 在局部 Lipschitz 条件下控制下游误差；assignment/scale 联合
  子空间在局部 least-squares 中不劣于任一单独子空间；soft-to-hard gap 由 codebook diameter 与
  hard-code 外概率质量界定；serialized gate 保证固定 validation 上不劣于初始 VQ state。
- 当前证据：LLaMA-3-8B layer-0 matched 2.14449 bpp 下 PPL 从 block-all/fixed-scale 的 6.22095
  降至 6.21988；仍是单层单 seed，不构成 full-model 或 SOTA 结论。
- 当前状态：英文 LaTeX v1、中文 v3、理论附录和 pre-declared full-submission matrix 已完成；
  full-model、多 seed、matched scalar GSQ 与 QTIP/QuIP#/AQLM 比较待正式验证。

### 2026-08-21 08:30：Dense-interface teacher 用于跨阶段量化误差补偿

- Idea：staged Q/K/V-O/MLP 的 teacher 始终由原始 dense network 生成；已经接受的量化权重只进入
  candidate/student forward，不进入 teacher。由后续结构阶段主动补偿上游量化误差，而不是把误差
  当作新的训练真值。
- 动机：旧实现的 V/O teacher 已包含量化Q/K，MLP teacher又包含量化attention，导致两个阶段只能
  重建自身，失去原始GSQ结构训练最关键的误差补偿语义。
- 方法验证：固定group160的layer0 PPL为6.216318；追加all-7 joint refinement反而为6.219213且
  hard gate拒绝，说明收益来自teacher语义而不是更多训练步数。
- Full证据：Meta-Llama-3-8B 32层为2.1207557 bpp、WikiText2 PPL10.497866、六任务macro
  0.642973；matched低预算 scalar GSQ为2.125 bpp、PPL670.159929、macro0.340239。
- 当前状态：已验证（单seed、低校准预算）；下一步应做多seed和官方大校准预算对照，而不是扫描group。
### 2026-08-21 08:53：用层级 rollback 搜索恢复选择题 ACC，同时保留 group160 的 PPL 收益

- Idea：以完整 dense-teacher group160 checkpoint 为 base、旧 block-all Vector-GSQ 为 donor，
  只交换完整 Transformer layer 的 logical state；预注册 early 0--3、late 28--31 和两侧同时
  rollback 三个候选，禁止看测试结果后临时改层集合。
- 动机：group160 把 WikiText2 PPL 从 10.740633 降至 10.497866，但 ARC-C/ARC-E/HellaSwag
  分别下降 1.19/1.43/0.25 个百分点，而 LAMBADA/PIQA/WinoGrande 上升。直接继续按 block MSE
  重训缺乏证据；层级混合能在不重新量化的情况下，用真实 PPL/ACC 判断能力损失集中在早层、晚层
  还是跨边界耦合。
- 预期效果：至少一个候选保持 PPL 不高于旧 Vector-GSQ 10.740633，并提高当前六任务 macro
  0.642973；重点观察 ARC-E，同时要求 PIQA 不低于当前 0.743743。若三候选均失败，则否决简单
  boundary rollback，转向训练集 prompt 的 dense-teacher logit/KL calibration，而不继续扩大盲扫。
- 当前状态：组合器、核心/本地 launcher 和 10 项红绿灯测试已完成；按用户最新指令改为本地运行，
  不连接 Remote-14。2026-08-21 09:09 握手时本机 GPU0 仍有 58245 MiB 空余显存，已选作本轮正式
  hybrid search 设备；三个候选已完成但 macro6 全部下降，简单 boundary rollback 已否决。

### 2026-08-21 11:22：任务训练集监督的末端层 group-scale 校准

- Idea：固定 group160 的 assignment/codebook，只对 layer 28--31 已存在的 row/input-group scale
  学习有界 multiplicative delta；优化各任务 training split 的正确选项归一化 log-likelihood，辅以
  dense model 的 choice-distribution KL，validation/audit 从 training split 内确定性互斥划分。
- 动机：late rollback 同时改善 ARC-E/Hella/PIQA，却因整层替换破坏 ARC-C/LAMBADA/Wino；说明末端
  层存在 ACC 可调方向，但必须使用连续、小幅、受 teacher 约束的调整而非离散整层回退。
- 预期效果：不改变 assignment/codebook/逻辑 bpp，在 training-split validation 上提高 balanced
  macro ACC；完整候选仍须通过 WikiText2 test PPL 与六任务正式 Gate，validation/test 不参与调参。
- 当前状态：已完成；QA5 +0.002487、PPL -0.006270，但 LAMBADA -0.031050 使 macro6 下降，
  因此方向部分验证、候选未接受。下一轮需加入通用长文本 teacher 分布保护。

### 2026-08-21 12:27：用未见 FineWeb-Edu 长文本 top-k teacher 约束保护 LAMBADA

- Idea：在任务正确选项监督之外，从 group160 原 token cache 的未使用行 4400--4421 预注册互斥
  train/validation/audit，采集 dense model 每个 token 的 top-32 分布；每个 task accumulation step
  加一项 teacher cross-entropy，epoch 选择还必须满足 validation text loss 相对 base 不回退超过 0.1%。
- 动机：任务 scale 已明确提高 ARC-C/Hella/PIQA 与 QA5，但 choice-level teacher KL 无法约束连续文本
  生成，LAMBADA 大幅下降；PPL 改善说明单纯 next-token NLL 也不足，需要直接保护 dense 分布。
- 预期效果：保留选择题增益的大部分，同时显著收窄 LAMBADA 回退；assignment/codebook/bpp 仍不变。
- 当前状态：小样本版已完成为安全 no-op；text proxy 改善但 ARC-C validation 单题翻转使 macro 下降。
  balanced profile 已完成并通过正式 Gate：QA5=0.646092、macro6=0.645144、PPL=10.681540，接受为
  ACC-optimized 主候选；下一步在 base 与该候选间做内部 validation 选择的 log-scale 插值。

### 2026-08-21 14:43：用内部选择集做 group-scale 对数域插值

- Idea：在 group160 base 与 accepted ACC checkpoint 之间取 alpha=0.25/0.5/0.75，保持所有离散状态
  完全一致，只在 group_scale 的 log-domain 插值；连同 alpha=0/1 用新 seed991 task training-split
  64 samples/task 和 WikiText validation 比较。
- 选择规则：候选 task macro 不低于 base 且 balanced loss 严格更低；满足者中选最小 alpha，以最大化
  PPL 回收。内部选择不访问正式 benchmark validation/test，选中后只正式评测一个 checkpoint。
- 当前状态：内部矩阵已完成并选中 alpha0.25；task macro +0.003125、balanced loss -0.009396、
  WikiText validation PPL -0.080675；正式 test PPL=10.414440、macro6=0.644425，已接受为综合主候选。

### 2026-08-21 16:50：用单层 Gate 判断是否扩大原量化校准预算

- Idea：固定当前 group160 方法，只把 calib/train/validation 从 64/8/8 增至 256/32/32，先在 layer0
  做同协议 PPL Gate；通过才启动 32 层长跑，失败则避免约 4 倍完整计算。
- 动机：公开 VPTQ 的 PPL 优势仍大，而当前 full run 使用远低于公开方法常见设置的校准预算；继续
  post-hoc alpha 扫描只能小修，无法验证主要 PPL gap 是否来自数据预算。
- 当前状态：核心 launcher 已参数化，新 budget256 gate launcher 和红绿灯测试已完成；待 GPU7 运行。
  单层 Gate 已通过（PPL 6.216318 -> 6.210145），完整 32 层 budget256 实验已获准启动。
  完整实验已完成并验证该方向：PPL 9.892660、macro6 0.651747，同时超过64/8/8、alpha0.25和
  ACC-tuned候选；接受为当前主checkpoint。下一步只等待官方4096/128/512完整实验，不再扩大盲扫。

### 2026-08-21 18:59：用官方 GSQ 论文级数据协议替代低预算主结论

- Idea：保持 dense-teacher staged Vector-GSQ、d6/group160和seed0不变，将数据与训练 horizon 对齐
  GSQ README：FineWeb-Edu 4096 train、128 validation、独立512 GPTQ，序列长4096，batch64、
  microbatch2、10 epochs（640 updates/phase）。
- 动机：64/8/8和256/32/32无法回答大校准集下的方法上限，也不能作为官方 GSQ/QTIP 的主比较。
- 资源策略：本机约834 GiB可用CPU内存，能够容纳保守约536 GiB缓存峰值；先在GPU6运行单层Gate，
  用实际墙钟时间和prefix PPL决定是否升级32层，避免直接盲跑长实验。
- 当前状态：runner参数化、官方协议gate/full入口、红绿灯与dry-run均完成；单层Gate准备启动。
  Gate已完成：PPL 6.201604，分别优于64/8/8与256/32/32；完整32层同协议实验获准在GPU1启动。

### 2026-08-22 13:20：把论文主线重构为“可部署 VQ 的计算图功能优化”

- Idea：不从标量量化方法的向量化扩展出发，而从 VQ 自身的三重错位推导方法：权重距离与功能误差
  错位、七个 Transformer Linear 与计算图角色错位、soft relaxation 与 hard checkpoint 部署错位。
- Motivation：旧 v3 把主要贡献写成 scalar-to-vector lift，会让结构阶段看起来像已有训练配方的工程迁移，
  掩盖 dense-teacher 误差补偿、functional coordinate descent 和 serialized-state selection 的统一性。
- 方法叙事：量化前缀输入 + dense 当前块 teacher；Q/K 路由接口 -> V/O attention 接口 -> gated MLP/
  block 接口；每阶段 assignment/group-scale 联合优化；hard FP16 pair 选择；完整 logical block 原子 gate。
- 预期效果：使 Motivation 从“4096 候选太多”提升为一般性的 VQ 优化问题，并让方法顺序可以直接从
  Transformer 图结构推导，而无需依赖某篇标量量化工作的先验。
- 当前状态：已完成中文 `papers/paper_zh_v4.md` 和独立英文 LaTeX `sec/sage_vq_v4/`；完整大协议实验
  明确标为进行中，不从 layer-0 结果外推 full-model 或 SOTA 结论。

### 2026-08-22 14:00：把“局部邻域 assignment training”提升为论文第一创新

- Idea：固定 VQ codebook 与 normalization，把初始 hard ID 视为 anchor；先在当前 codeword 的
  128-way 几何邻域做 curvature-aware hard refinement，再构造包含新 anchor 的 8-way
  Hessian-diagonal weighted target 邻域，只训练这 8 个候选上的 categorical logits。
- 动机：上一版仍过度强调 Q/K/V-O/MLP 顺序，使真正区别于普通 block reconstruction 的变量被埋没。
  全 4096-way logits 为 $O(NK)$ 且允许远距离跳转；完全冻结 assignment 又无法使用激活修正 ID。
- 方法定位：局部邻域将 relaxation width 从4096缩至8（512倍），anchor 强制保留并带初始 logit
  margin，因此“不改变当前 ID”始终是零步安全解；结构阶段仅提供 functional gradient，不作为核心
  顺序创新。
- 已有直接证据：LLaMA-3-8B large-protocol layer0 的 hard assignment switch rate 为29.216%，
  serialized block MSE下降39.188%；Qwen3-0.6B固定配置的M=4/8/16/32均改变约11.8%--12.0% ID。
- 当前状态：已据此重写中文/英文 v4 的标题、摘要、Motivation、Method、实验问题和结论；待补
  LLaMA同协议M=1冻结assignment与M=8/16对照，形成最直接的核心贡献消融。

### 2026-08-22 22:30：用“码本学习—二阶指派—功能指派”重构 SAGE-VQ v5

- Idea：把方法统一为两个模块、三个技术贡献。模块I在每个Linear内部执行顺序column/row尺度对齐，
  以Hessian diagonal weighted VQ学习共享codebook和初始assignment；模块II先用固定码本的
  Vector-GPTQ获得完整Hessian感知hard anchor，再在anchor-preserving局部集合上通过Gumbel
  概率与dense block functional loss训练assignment。
- Motivation：v4过度突出4096→8候选缩减，容易把论文误读为搜索加速；同时省略了VQ表示学习和
  Vector-GPTQ，使真正的创新链不完整。v5改用三层目标错位推导方法：原始尺度与共享码本错位、
  独立向量失真与二阶耦合错位、局部二次近似与Transformer非线性功能错位。
- 方法边界：当前正式runner使用每个Linear一套codebook，Linear内全部d维vectors共享；不同层和
  不同投影不共享全局codebook。初始VQ已经使用Hessian diagonal，Vector-GPTQ的新增信息是完整
  Hessian非对角耦合、codeword-atomic triangular scoring和向量误差反馈。
- 论文定位：贡献列表分列scale-aligned VQ、codebook-constrained Vector-GPTQ、function-aware
  probabilistic assignment learning；Method中后两者合并为Assignment Refinement。top-128、top-8、
  Q/K/V-O/MLP顺序与七路并行只作为实现选择。
- 验证需求：最终必须补齐同协议Raw VQ→Scale-aligned VQ→+Vector-GPTQ→+Gumbel assignment的
  A/B/C/D PPL与ACC消融，以及M=1 frozen-assignment+trainable-scale对照；在此之前不宣称超过GSQ。
- 当前状态：中文完整稿`papers/paper_zh_v5.md`、中文分章节LaTeX`sec/sage_vq_v5/`和主模板
  `template/sage_vq_iclr_v5.tex`已完成；large-protocol full run已在本地单卡完成：2.1207557 bpp、
  PPL=9.040258、六任务macro=0.667636、五任务macro=0.664777。相对32/32/256
  （train/validation/GPTQ）checkpoint，
  PPL下降8.62%、六任务提高1.589个百分点，证明大校准规模能同时改善语言建模与下游能力。

### 2026-08-24 15:30：把下游功能监督直接用于 anchor-local assignment，而不是只调 scale

- Idea：以官方规模 full checkpoint 的 hard assignment 为安全 anchor，保留每个向量已有的8-way
  局部邻域，只在末端若干block上训练categorical assignment logits；训练目标由任务training split
  的正确选项normalized NLL、dense choice-distribution KL和独立FineWeb-Edu dense token KL组成。
  选择时必须同时通过任务validation、未见文本validation和hard logical reconstruction gate。
- 动机：官方规模已经把PPL推进到9.040258、六任务macro推进到0.667636，但五任务macro 66.48%
  仍比GSQ README中不同模型的68.55% headline低2.07个百分点。此前只训练group scale的balanced
  方法在小预算checkpoint上证明任务方向存在，却只带来约0.22个百分点；论文第三个创新点本来就是
  assignment training，因此下一轮应让任务功能梯度直接决定邻域内ID，而不是继续扫描group size、
  seed或post-hoc scale系数。
- 方法边界：正式benchmark validation/test不参与训练或选择；只使用各任务training split的互斥
  train/validation/audit与原FineWeb未使用rows。初始hard ID必须始终在候选集，未通过所有Gate则
  exact回滚，logical bpp保持2.1207557。
- 预期效果：重点提高ARC-C/E与HellaSwag，同时text KL保护LAMBADA/PPL；目标是把五任务平均提高
  至至少68.55%，并保持WikiText2 PPL不高于当前9.040258或只允许预注册的微小回退。
- 当前状态：待实现红绿灯与单卡本地末端block实验；这是方法消融/优化，不是超参数扫描。
  首轮已完成为安全no-op：gradient proposal在98.22%向量上给出负一阶delta，epoch2把validation
  balanced loss降低2.68%且五任务loss全部改善，但64样本/任务macro因3个净边界翻转下降0.9375
  个百分点，text CE回退0.257%，被macro优先+0.1% text Gate拒绝。下一步固定训练本身，只把
  selector改为预注册loss-dominance+独立audit规则，判断连续loss收益能否转化为正式ACC。

### 2026-08-24 22:15：用loss-dominance与独立audit选择hard assignment checkpoint

- Idea：任务assignment训练仍固定layer28--31、8-way proposal、binary Concrete、2 epochs与所有
  loss权重；checkpoint selection从“0/1 macro字典序优先”改为连续loss主导的统计Gate。
- 规则：validation balanced loss至少相对改善0.5%；每任务loss回退不超过0.5%；64样本/任务macro
  回退不超过1个百分点；FineWeb text CE回退不超过0.5%。选中的hard state还必须在独立64/task
  audit与独立text rows上再次通过完全相同规则，否则exact回滚。
- 动机：首轮epoch2在五任务loss上全部改善，balanced loss下降2.68%，但三个净0/1边界翻转就令
  macro下降0.9375个百分点。连续normalized NLL比小样本accuracy有更高统计效率；双split和hard
  audit防止仅靠放宽Gate接受过拟合状态。
- 当前状态：已验证。epoch2通过独立audit并把正式macro6提高0.8239pp、五任务提高0.9188pp；但
  WikiText2 PPL退化1.457%。五任务67.3965%与不同模型GSQ headline 68.55%不可直接比较。该selector
  保留，下一步修正hard projection和文本guard的统计代表性。

### 2026-08-25 00:22：Confidence-projected sparse hard assignment path

- Idea：保留当前功能梯度proposal与binary Concrete训练，不再把所有正logit一次性部署。训练后按
  learned switch confidence构造从anchor到full candidate的嵌套稀疏hard path；只使用更大且互斥的
  FineWeb validation选择满足文本loss约束、同时取得任务loss改善的最稀疏有效状态，再在独立task/
  FineWeb audit上执行同一Gate。formal PPL/benchmark不参与选择。
- 动机：当前320,990个switch使macro6提高0.8239pp，证明任务方向正确；但仅4×256 token的text
  validation/audit均无法预测WikiText2 PPL，最终PPL退化1.457%。问题不是需要扫描LR或group size，
  而是soft-to-hard部署缺少受通用文本约束的投影步骤与足够统计功效。
- 预期效果：保留高置信度、任务收益集中的assignment切换，减少低置信度switch导致的通用语言
  建模扰动；目标为PPL不高于9.040258，同时五任务继续向68.55%以上推进。
- 当前状态：首次实现运行得到safe no-op，但没有真正评估projection：epoch2 loss改善2.116%，因full
  macro回退1.5625pp在projection前被过滤，`projection_history=[]`。下一轮修正source prefilter，
  只以连续balanced/per-task loss判定是否值得构造路径；macro/text仍在projected state与audit上执行。
  source Gate修复后已验证：1/4投影只改变69,353个assignment（0.0476766%），独立audit通过，
  正式PPL从9.040258改善到9.037733、macro6从66.7636%提高到67.1794%，实现PPL/ACC Pareto改善。
  当前状态更新为“已验证”；下一方法方向是以接受的稀疏状态为新anchor重新计算功能梯度与局部邻域，
  形成逐轮refresh的trust-region assignment refinement，而不是增加单轮switch密度。

### 2026-08-25 04:45：Iterative neighborhood-refresh assignment refinement

- Idea：把一次anchor-local assignment训练扩展为可串联的trust-region阶段。每一阶段只接受通过
  task/text validation与独立audit的稀疏hard checkpoint；下一阶段以该hard状态为新anchor，重新
  计算当前模型的功能梯度、当前ID附近的最优alternative与switch confidence，而不是沿用第一阶段
  的一次性一阶近似或放宽switch Gate。
- 动机：第一阶段只改变0.0477%的assignment便同时改善PPL和macro，说明高置信局部离散步有效；
  但单次gradient proposal只描述原anchor附近的一阶方向，接受hard步后剩余梯度和最优邻居已经
  改变。重新线性化可以逐步积累功能收益，同时让每个阶段的文本Gate限制语言建模漂移。
- 数据协议：seed固定为0，不做seed实验；在同一确定性任务排列上用offset=192取下一组互斥
  64/64/64 train/validation/audit，FineWeb使用互斥的80--159、4224--4287、4288--4351行。
- 当前状态：实现与24项相关回归测试已通过；准备在本机物理GPU2、单卡可见条件下启动第二阶段，
  源checkpoint为20260825_023500已接受的confidence-projected稀疏状态。
  第二阶段已验证：互斥audit Gate通过，正式macro6再提高0.3594pp、五任务提高0.3304pp，说明
  gradient refresh可持续积累任务收益；但PPL回退0.1315%。当前状态更新为“ACC方向已验证、
  PPL联合目标未完全验证”。后续固定完成stage3--5并只评测最终端点，不依据中间正式test挑选阶段。
  Stage3--5现已预注册为一个不可中途按test挑选的串行链：任务offset依次384/576/768，FineWeb
  validation/audit依次覆盖4352--4479、4480--4607、4608--4735；stage3/4不运行正式评测，stage5
  才统一测PPL和六任务。该设计把“迭代次数”从结果后调参改成固定数据预算下的完整方法路径。
  完整链现已验证结束：Stage 3接受46,861个高置信switch，Stage 4/5连续因validation Gate不满足而
  精确no-op；端点macro6为67.6877%，较同模型原始Vector-GSQ累计+0.9241pp，但PPL退化0.1710%。
  GSQ公开68.55%来自Llama-3.1-8B-Instruct，与当前Meta-Llama-3-8B base不可直接判胜负，因此不再把
  该跨模型headline作为成功门槛。当前状态更新为“同层迭代已饱和”：继续在layers28--31刷新没有依据。
  新方法方向为结构化向后扩展assignment优化frontier：冻结已经接受的末层assignment，只优化相邻
  的前一Transformer block组，使新离散步通过固定后层传播到端点loss；这不同于任意layer搜索，
  当前状态为待实现/待验证。

### 2026-08-25 10:06：Llama-3.1-8B-Instruct同模型配对验证

- Idea：不再把Meta-Llama-3-8B base结果与GSQ README的Llama-3.1-8B-Instruct headline作成功门槛；
  直接在Meta-Llama-3.1-8B-Instruct上按官方4096/128/512、4096-token协议生成我们自己的Vector-GSQ
  source checkpoint，再在同一checkpoint上执行结构感知局部assignment训练和完全相同的正式评测。
- 动机：跨模型差值同时混入base/Instruct和3.0/3.1模型差异，无法归因于量化方法。同模型流水线可
  直接与GSQ公开结果对齐，并提供assignment训练前后的内部配对增益。
- 数据与结构：Vector source使用FineWeb rows0--4095 train、4096--4223 validation、4224--4735
  GPTQ；assignment继续使用4096条FineWeb train，但selection/audit改用source从未见过的本地C4
  4736--4863/4864--5375，任务training split每项512/256/256；第一阶段只开放28--31层assignment。
- 当前状态：准备完成、待启动。Llama-3.1权重四个safetensors shard已通过精确字节数与header检查，
  tokenizer可离线加载；128k普通词表、raw backend和多语言/代码probe与Llama-3一致，差异仅为未被
  缓存使用的reserved special token命名。专用5376×4096 cache已生成，前4736行与原FineWeb缓存
  bit-exact，后640行为独立本地C4 guard；相关28项测试通过。选择空闲本地GPU2启动，不在10.30.0.14实验。
  当前状态更新为“已验证”：FP16协议Gate通过；结构感知assignment将同模型五任务macro从68.1046%
  提升到69.0744%，超过GSQ公开68.55%共0.5244pp，码率保持2.1208 bpp。选中路径只改变0.3781%
  assignment且独立audit通过，说明局部离散训练而非全局码本重训即可产生可测功能收益。边界是
  WikiText2 PPL退化2.2742%，因此验证的是headline ACC超过，不是PPL/ACC Pareto全面超过。

### 2026-08-28 03:11：把语言建模保持纳入assignment trust region（后续方向）

- Idea：在已经验证可超过GSQ五任务headline的局部assignment方法上，将通用文本teacher差异从
  checkpoint selector的事后Gate提升为每个候选离散步的显式trust-region预算；按功能收益/文本损失
  代价对switch做Pareto排序，而不是只按task switch confidence截取固定分数。
- 动机：本轮0.3781%稀疏switch使五任务提高0.9698pp，却让WikiText2 PPL退化2.2742%；validation/
  audit C4 CE都下降但未预测WikiText2变化，说明当前平均文本CE Gate与最终PPL之间仍有分布和局部
  曲率缺口。真正的方法问题是估计每个assignment切换的语言建模代价，而不是继续扫描seed、group或LR。
- 预期效果：保持已经取得的69.0744%附近下游准确率，同时将PPL拉回source 10.496附近，形成相对
  Vector-GSQ source的ACC/PPL Pareto改进；不以放宽GSQ比较口径为目标。
- 当前状态：待验证；本轮“超过GSQ headline”的目标已达到，因此不自动追加耗时正式实验。

### 2026-08-28 12:29：用功能收益/语言代价比驱动局部assignment预算

- Idea：为每个候选assignment switch同时估计下游功能收益与通用语言建模代价，以二者的Pareto比值
  分配离散切换预算；只有位于局部收益--代价前沿的switch才进入binary Concrete训练和hard projection。
- 动机：同协议QTIP在更低2.0 bpp下取得PPL 8.7971与公共五任务69.8749%，而当前SAGE-VQ为
  10.7347/69.0744%。现有task-gradient proposal能提高下游准确率，却无法预测WikiText2退化；真正
  的缺口是候选层面的语言代价估计，而不是码本大小、group、seed或训练顺序。
- 预期效果：保留局部assignment学习相对GSQ的可测准确率收益，同时压低PPL；若不能接近QTIP，至少
  给出“任务特化准确率与通用语言建模”的可解释Pareto前沿，而不把单一task endpoint包装成全面SOTA。
- 当前状态：待验证；这是下一轮方法改进候选，不启动无意义的超参数/seed消融。

### 2026-08-28 13:00：无任务标签的 teacher/text-only 局部 assignment

- Idea：复用Llama-3.1-8B-Instruct同模型Vector-GSQ硬锚点，完全移除带标签多选任务对proposal、训练、
  projection selection和audit的影响，只用FineWeb/C4 dense-teacher文本分布学习局部assignment。
- 动机：V6审稿发现，task-adapted端点与通用PTQ的GSQ/QTIP headline存在额外监督混杂。该实验直接
  检验“固定VQ表示后训练assignment”是否在task-agnostic设置仍成立，比group/seed/候选数扫描更能
  决定论文方法边界。
- 预期效果：若WikiText2/C4与零样本平均同时改善，可把方法主张扩展为通用PTQ；若只改善teacher-text
  CE或最终回滚，则应把SAGE-VQ诚实定位为task-adapted quantization，并将GSQ/QTIP只作质量参照。
- 当前状态：已否决。完整实验仅靠teacher/text信号选中0.4617%切换，C4 validation/audit CE虽下降
  1.51%/1.69%，但WikiText2 PPL退化16.81%、Macro-6下降2.0780pp、五任务下降0.8984pp。
  结论是当前top-k teacher-text代理不能支持task-agnostic assignment；论文应定位为task-adapted。

### 2026-08-28 19:20：单次审计约束的连续尺度—局部离散联合适配

- Idea：从固定Vector-GSQ锚点出发，在同一个训练/验证协议内先学习已有FP16 group scale形成连续
  功能方向，再以该状态为局部锚点学习邻域assignment；两个阶段只共享训练/validation，最终组合
  端点只执行一次独立task/text audit，失败则整体回滚，避免重复利用audit作多轮模型选择。
- 动机：严格同预算实验显示scale-only的Macro-6/五任务为71.72%/72.55%，显著超过assignment-only的
  69.48%/69.07%，但assignment-only PPL 10.735优于scale-only 10.945。证据表明两者不是强弱替代，
  而是连续高收益坐标与离散低扰动坐标。联合方法应检验assignment能否在scale锚点附近继续改善任务
  或收回PPL，而不是继续维护已被否定的assignment-only全面优势叙述。
- 预期效果：在不增加逻辑bpp、保持码本固定的前提下，取得不低于scale-only的任务macro，并把PPL
  拉向assignment-only；若assignment在scale锚点上no-op或退化，则V8应把assignment明确报告为
  Pareto消融而非主方法核心。
- 当前状态：已否决。正式联合端点Macro-6/5为69.7434%/68.9511%、PPL 11.4098，被scale-only的
  71.7223%/72.5484%、10.9448严格支配。Joint中的零-switch scale端点validation macro仅70.9375%，表明同步软松弛使
  scale对soft assignment mixture产生补偿，hard projection后两坐标同时失配。该结果否决naive simultaneous joint，
  不否决部署态分阶段组合。

### 2026-08-29 03:59：部署态连续锚点→稀疏离散修复

- Idea：不再在软assignment mixture上同步学习scale。先独立训练并固化可部署的group-scale硬checkpoint，再以
  该真实权重为局部锚点重新计算功能梯度和8-way附近领域alternative，只训练稀疏assignment repair。
- 动机：naive joint中的scale-only硬投影也显著差于独立scale，说明软—硬补偿而非坐标本身不可组合。先固化
  连续端点可以让assignment的proposal、训练与验证全部发生在同一部署态邻域。
- 预期效果：保持scale-only 71.72% Macro-6附近，用少量局部index修复LAMBADA/ARC-E或收回PPL；若最佳硬投影
  为no-op，则证明assignment是另一Pareto分支而非可叠加主模块。
- 当前状态：已否决为组合主方法。最终完整 run 在冻结scale硬锚点后实际评估两epoch共八个1/8--full硬投影；
  98.1965%向量虽有负一阶邻居，但所有changed endpoint均低于scale baseline，最终精确回滚为no-op。
  Hard handoff可以防止V9的soft compensation污染scale，却不足以证明assignment可叠加。

### 2026-08-29 18:45：Scale-conditioned curvature / gradient-consensus assignment proposal

- Idea：在已经固化的scale硬checkpoint上，不再仅用单个聚合梯度的一阶内积选择8-way alternative。
  候选必须同时满足低成本曲率近似（如分组对角Gauss--Newton/Fisher代价）或跨batch、跨任务梯度符号/
  排名一致性，再进入binary Concrete和hard-set选择。
- 动机：本轮98.1965%的向量具有负一阶alternative，但从0.9635%到14.1665%切换率的八个硬集合全部
  退化；说明主要瓶颈是proposal对集合级部署损失的预测失准，而不是候选数量、投影比例或训练轮数。
- 预期效果：显著减少“单点线性项为负、组合硬投影为正”的候选；若存在可叠加自由度，应在不破坏
  scale baseline的条件下形成小于5%切换率的非零端点。若仍no-op，则停止把assignment作为scale后续模块。
- 当前状态：共识分支已完成并被否决为充分修复。V11以4个任务分层互斥view把聚合负邻居率
  98.1973%筛到严格共识48.7101%，并将最佳changed endpoint相对V10提高2.2656pp；但两个epoch共
  八个hard projection仍0/8通过，最佳点仍低于scale source 2.4219pp且loss高7.10%，最终精确no-op。
  因此跨视图冲突是真实误差源，却不足以定义离散可信域；assignment-after-scale主路线暂停。只有候选级
  scale-conditioned Hessian/Gauss--Newton分数先在低成本probe中证明能预测真实hard loss排序，才进入下一次
  完整训练；不再增加view数或扫描seed、LR、group、epoch、projection ratio。

### 2026-08-30 05:58：Scale-conditioned局部曲率的训练前可预测性门禁

- Idea：不直接开启第三次完整assignment训练。复用V11四个互斥gradient view，在同一次反向中累计每个
  Linear输入维度的二阶矩；对实际weight jump
  $\delta=s\odot(c_{a'}-c_a)$计算对角局部activation-Hessian代价
  $q=\sum_j\mathbb E[x_j^2]\delta_j^2$，并以最差视图一阶收益除以$\sqrt q$进行排序。
- 动机：V11已经证明符号一致只能筛掉约一半虚假许可，仍无法预测有限hard set。若曲率分数连同规模真实
  validation loss的相对排序都不能改善，就没有方法依据继续做数小时Concrete训练；若能稳定改善，才说明
  二阶信息值得进入下一版selector。
- 正式检验：在同一scale硬锚点和完整512/256任务、4096×4096文本协议上，不训练参数；比较aggregate
  first-order、strict-consensus和curvature-normalized三种排序。每个Linear固定128/512/2048/8192个
  nested hard switch，共12个matched-cardinality真实部署集合。预注册门禁要求曲率排序相对两个control
  都在4个预算中至少赢3次，且平均balanced loss更低；只允许一个validation胜出候选进入一次audit。
- 预期效果与边界：该$q$是对角化Linear输出局部二次代价，不冒充完整任务loss Hessian。若predictor Gate
  失败，停止assignment-after-scale训练路线；若通过但没有直接端点，才允许启动一次完整曲率引导训练；
  不扫描曲率权重、预算、seed、LR或group。
- 当前状态：**已验证并否决为充分预测器。** 本地GPU5单卡正式run完成，耗时1.479小时、峰值25.285GiB。
  曲率排序相对strict consensus为4/4胜，相对aggregate first-order仅2/4胜，未达到预注册3/4门槛；
  最佳曲率hard set仍比source低5.4688pp Macro、balanced loss高18.313%。候选audit未访问、checkpoint
  未写、完整assignment训练未授权。结论是局部Linear输出曲率有排序信息但不能代表端到端集合交互；
  assignment-after-scale路线停止，不再扫描曲率权重或训练参数。

### 2026-08-30 08:32：Causal set-conditional hard assignment gain

- Idea：停止给每个向量独立打分后一次性叠加。固定复用V12在无调参条件下表现最好的128/Linear
  curvature bundle，把“某层某个Linear的128个硬切换”视为一个离散坐标。按layers28--31因果顺序，
  每层在此前已接受hard state条件下真实评估7个Linear bundle，只允许完整任务训练目标严格下降的最佳
  bundle进入状态；每层最多接受一个，故总切换不超过512个。
- 动机：V12证明局部曲率对strict consensus有信息却不能代表集合loss。条件搜索直接重算
  $F(S\cup B)-F(S)$，使后层选择感知前层已接受误差，而不是把独立$q_i$相加。它与CDQuant的层级二次
  reconstruction coordinate descent不同：坐标是共享码本assignment bundle，裁决目标是最后四层重放后的
  任务监督+teacher-KL，且validation/audit不参与坐标选择。
- 计算策略：为全部512×5任务训练样本的所有choice构造layer28输入hidden cache，并用32个跨任务、序列
  长度和continuation位置分层的example与完整HF forward做score parity；候选只重放最后四层。每层7次、
  共28次固定评估，不扫描bundle size、顺序、
  seed或接受阈值。局部正控制同时记录curvature cost与真实即时block-output MSE的Spearman相关。
- 预期与否决条件：若有非零training条件增益但validation失败，说明集合搜索仍过拟合training代理；若四层
  全部不接受，则source附近没有可测单bundle条件下降坐标。只有validation与新文本audit rows5568--5631
  均通过才写checkpoint并运行正式PPL/lm_eval；否则精确恢复source并结束assignment-after-scale路线。
- 当前状态：首次资源门禁失败和第二次cache-parity失败均发生在方法搜索前，不构成方法结果。逐层诊断发现
  direct DecoderLayer重放遗漏causal mask，且旧parity把batch=4重放与singleton完整前向比较，混入BF16
  batch-shape数值差。现已显式构造与HF一致的causal mask，dense teacher与搜索均使用同一shape bucket，
  parity改为同batch完整HF前向；修复后手工重放与完整前向logit逐位一致，同batch缓存score最大误差
  5.286e-4。56项聚焦测试和静态检查通过。正式本机GPU7单卡run完成：四层各接受一个bundle，训练联合
  目标改善2.7288%，held-out任务balanced loss改善1.0919%，但独立文本CE恶化0.9186%，越过0.5%门禁；
  audit/checkpoint/formal test均未触发。结论是集合条件裁决在当前四层固定bundle设置中缓解了交互计分，
  却不能自动提供跨域保持。
- 当前状态：**已验证为任务条件信号、否决为通用部署证书。** 下一方法不得扫描bundle/seed/阈值；只能把
  文本保持作为不可交易约束加入条件接受，并由candidate-unexposed文本audit裁决，否则应将assignment明确
  限定为任务适应。未访问服务器14。

### 2026-08-30 15:02：Lexicographic cross-domain conditional assignment

- Idea：保留V13的固定bundle和因果条件重放，但把接受关系从单一任务标量改为词典序/受约束裁决：候选必须
  先在固定的文本train保持代理上不退化，再在可行候选中最大化任务条件收益；任务收益不得通过增大语言分布
  偏移来“购买”。Validation与audit仍不参与坐标选择。
- 动机：V13已在当前四层固定bundle设置中缓解集合交互计分失败——四个坐标训练单调改善且task validation
  loss下降；唯一失败项是未进入接受目标的text CE（+0.9186%）。因此自然干预是改变偏序关系，而不是调
  teacher权重、bundle、seed或阈值。
- 预期效果：若固定文本train代理能筛除消费语言裕量的bundle，应保留非零task gain并通过未见text validation/
  audit；若全部候选被拒绝，则证明当前scale source附近的任务适应与语言保持在该坐标族内不可兼得。
- 当前状态：**待验证。** 需先设计不缩小官方4096×4096文本体量、又能在单卡可承受成本内测量每个bundle
  文本条件代价的缓存/低秩正控制；在该计算合同成立前不启动正式实验。
