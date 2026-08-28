# 同一码率，两种适应坐标：2-bit VQ 中连续尺度与局部码字切换的任务—语言建模分工

**Same Bitrate, Two Adaptation Coordinates: Task–Language Trade-offs between Continuous Scales and Local Codeword Switches in 2-bit VQ**

匿名作者

## 摘要

已有极低比特量化主要优化如何表示浮点权重；当一个 2-bit checkpoint 需要适配目标任务时，通常默认所有可训练量化参数只是可互换的优化接口。本文揭示这一假设并不成立。Block-scaled VQ 的部署权重天然分解为共享码本原型与 group scale，因此同时暴露连续尺度坐标和离散原型索引坐标。在完全相同的 Llama-3.1-8B-Instruct 锚点、最后四层、任务监督、4096-token 文本保护和 2.1208-bpp 部署合同下，只训练已有 FP16 group scale 将六任务平均从 68.00% 提升至 71.72%（+3.72 pp），但 WikiText2 PPL 退化 4.28%；只训练当前码字附近领域的 assignment 则提升至 69.48%（+1.48 pp），PPL 仅退化 2.27%。这说明连续尺度负责更强的任务重定向，而局部离散切换提供较低扰动的中间 Pareto 点。基于该观察，我们将 SAGE-VQ 重述为一种 scale–assignment gated 适配框架：以尺度对齐 VQ 和 Vector-GPTQ 建立硬锚点；连续分支学习可折叠的 group-scale delta；离散分支冻结码本与尺度，用功能梯度在当前码字的 8-way 邻域中选择一个替代项，以 binary Concrete 学习保持/切换，再经嵌套稀疏硬投影与独立 task/text audit 输出真实索引。无任务标签的完整对照虽改善 held-out teacher 代理，却使 PPL 退化 16.81%、六任务下降 2.08 pp，进一步限定了结论：这是任务适应而非通用 PTQ。本文的核心发现不是某一坐标全面更强，而是同一 VQ 表示内部存在功能显著非均匀的连续—离散自由度；联合利用它们是下一步需要独立验证的方法问题。

**关键词：** 任务自适应量化；大语言模型压缩；向量量化；码字指派；连续—离散优化

## 1 引言

约 2 bit/parameter 的极端压缩迫使量化从逐元素舍入转向结构化表示。GPTVQ、AQLM、QuIP# 与 QTIP 通过高维码字、加性码本、非相干变换或 trellis 扩大有限比特下的表示能力 [2–5]。它们主要回答“如何把浮点模型压缩成高质量低比特 checkpoint”。然而，模型一旦部署到特定任务，另一个问题随即出现：在不恢复浮点权重、不增加逻辑码率的条件下，checkpoint 内哪些已有变量最适合承担任务适应？

Block-scaled VQ 为这个问题提供了一个可分析的最小对象。一个权重向量由共享码本中的原型和一个 group scale 共同重构。前者由离散 assignment 选择，后者是连续乘法系数。直觉上，两者都能改变权重，因而可能只是两种等价的可训练参数化。若这一假设成立，训练 assignment 的价值只在优化器偏好，而不构成新的压缩后适应机制。

我们的同预算实验否定了这种等价性。在同一 Llama-3.1-8B-Instruct 2.1208-bpp 锚点上，开放最后四层已有的 group scale 后，5,521,408 个连续 delta 几乎全部非零，并带来 +3.72 pp 的六任务平均收益；开放 assignment 后，一阶代理虽为约 98% 目标向量找到下降邻居，最终只有 0.378% 的硬切换通过独立 audit，收益为 +1.48 pp。更强的 scale 适应同时造成更大的 PPL 退化，而稀疏 assignment 落在锚点与 scale 端点之间。也就是说，连续尺度与离散原型切换不是重复坐标：前者提供密集、组级的幅值重标定，后者提供稀疏、局部的原型重定向。

这一观察也迫使我们修正 assignment-only 的强叙述。局部码字切换确实可训练、可部署、可在零额外 bpp 下改善目标任务，但它并不是同预算下最强的任务适应接口。相反，它的研究价值在于揭示一种不同的低扰动坐标。若论文只与未使用任务标签的 GSQ/QTIP 比较，或只报告 assignment 相对锚点的正增益，就会把监督收益与坐标选择混在一起。

基于这一证据，我们将 SAGE-VQ 定义为 scale–assignment gated 适配框架，而不是三个串联模块。尺度对齐共享 VQ 与 Vector-GPTQ 仅负责产生稳定硬锚点。任务适应阶段有两个相互可比的部署分支：scale 分支只学习现有 FP16 group scale 的对数增量；assignment 分支只学习当前码字与一个功能梯度选中邻居之间的 binary Concrete switch。二者使用相同任务、teacher、长文本数据与 loss-dominance Gate，候选必须在独立 audit 上复现改进，否则精确回滚。这样，性能差异可以归因于适应坐标，而非数据、码率或评测差异。

本文贡献如下：

- 发现 block-scaled VQ 中连续尺度与离散 assignment 的任务适应能力高度非均匀：同监督、同层、同码率下，scale 产生更大任务增益和更大 PPL 漂移，assignment 形成低扰动中间 Pareto 点。
- 提出可审计的双坐标适配框架。尤其对离散坐标，在当前码字的 8-way 附近领域内以功能梯度定向邻居，用 binary Concrete 训练保持/切换，并用稀疏硬投影处理联合离散风险。
- 建立同模型公平证据链：锚点、task-assignment、task-scale、teacher/text-only assignment 均从同一 checkpoint 出发；完整报告 WikiText2 2048 PPL、六任务全量 `lm_eval`、独立 audit 与部署字段审计。
- 明确方法边界：task-scale 的准确率甚至数值超过无标签 QTIP，但使用了目标任务监督且 PPL 更差，不能称通用 2-bit SOTA；当前结果支持任务适应坐标的发现，不支持连续—离散联合优越性。

## 2 相关工作

### 2.1 极低比特表示与非均匀性

GPTQ 用校准激活 Hessian 近似量化扰动并将误差反馈到剩余权重 [1]。AWQ 发现少量 activation-salient 权重主导量化质量，以等价缩放保护关键部分 [6]；OmniQuant、QuaRot 和 SpinQuant 分别学习尺度或旋转以改善量化条件 [7–9]。GPTVQ、AQLM、QuIP# 和 QTIP 进一步设计向量、加性、格或 trellis 表示 [2–5]。本文不提出新的通用码本，而研究已有 block-scaled VQ checkpoint 内部的适应非均匀性。

### 2.2 离散变量与可部署优化

GSQ 用 Gumbel-Softmax 学习标量量化网格上的 assignment [10,11]。PV-Tuning 指出极低比特微调中 STE 可能次优，并交替优化连续变量与离散信赖域 [12]。SAGE-VQ 的离散分支同样承认硬状态不能由连续代理直接替代，但限制更窄：码本、scale 和 alternative 均固定；每个向量只在当前码字和一个功能定向邻居间选择；最终只保存真实 int32 assignment。创新不在首次使用 Concrete [13]，而在“当前码字附近领域—功能定向—嵌套硬投影—独立审计”的完整部署闭环。

### 2.3 任务自适应量化

量化感知微调允许目标任务更新浮点影子权重或大量量化参数。LoTA-QAF 在量化模型上学习可无损合并的低比特适配变量，强调训练格式与部署格式的一致性 [14]。本文更关注坐标归因：不新增 adapter，不恢复浮点权重，只比较 checkpoint 中已经序列化的 group scale 与 assignment。两者部署存储均不增加，但适配耗时并不为零；因此“零额外 bpp”不等于“免费训练”。

## 3 方法

### 3.1 一个表示，两种可部署坐标

将 Linear 权重划分为 $d$ 维向量 $w_i$。共享码本为 $\mathcal C=\{c_1,\ldots,c_K\}$，向量 $i$ 的离散索引为 $a_i$，所属尺度组为 $g(i)$。忽略为数值稳定加入的 row/column normalizer，部署权重写为

$$
\hat w_i=s_{g(i)}c_{a_i}.
$$

固定码本后，这一表示暴露两类坐标：连续尺度 $s_g$ 改变一组向量的共同幅值；离散索引 $a_i$ 切换单个向量使用的原型。给定硬锚点 $(s^0,a^0)$，我们分别研究

$$
\mathcal A_s=\{(s,a^0)\},\qquad
\mathcal A_a=\{(s^0,a):a_i\in\mathcal N(a_i^0)\}.
$$

公平比较要求两个空间使用相同适应层、任务训练/验证/audit、文本 teacher、优化轮数、逻辑码率与正式评测。

### 3.2 共享硬锚点：尺度对齐 VQ 与 Vector-GPTQ

不同 block 的动态范围会破坏共享码本。锚点构造先令 $u_i=w_i/s_{g(i)}$，在统一域最小化 Hessian 加权重构误差

$$
\sum_i\omega_i\|u_i-c_{a_i}\|_2^2.
$$

本文使用 $d=6$、$K=4096$、group size 160。固定码本后，Vector-GPTQ 先取几何 top-128，再以向量化二阶目标选码字，并把当前量化误差通过逆 Hessian 反馈到剩余列。该阶段产生完整 32 层、224 个 Linear 的 2.1208-bpp 锚点。它是后续适应的共同起点，而非本文任务适应结论的独立胜负项。

### 3.3 连续尺度分支

对目标层每个已有 group scale 学习对数增量 $r_g$：

$$
\tilde s_g=s_g^0\exp(r_g),\qquad |r_g|\le \rho.
$$

所有 codebook、assignment、normalizer 与非目标层冻结。训练结束后，$\tilde s_g$ 直接折叠回原 FP16 `group_scale` 字段，因此不新增部署张量或逻辑 bpp。该坐标是组级密集更新：一次 $r_g$ 同时影响组内多个向量，适合快速改变任务 logit，但也可能把通用语言模型分布整体推离锚点。

### 3.4 当前码字附近领域的离散 Assignment 分支

对每个锚点码字 $a_i^0$ 构造包含自身的 8-way 几何邻域 $\mathcal N(a_i^0)$。收集任务监督、浮点教师 KL 与通用文本 guard 对权重的梯度 $g_i$，用一阶变化

$$
\Delta_i(c)=\langle g_i\odot s_{g(i)}^0,c-c_{a_i^0}\rangle
$$

选择最有利邻居 $c_i^1$。几何邻域限制扰动半径，功能梯度决定方向；每个向量由此只剩“保持当前码字/切换到邻居”两个状态。

为每个向量学习 switch logit $z_i$：

$$
p_i=\sigma((z_i+\epsilon_i)/\tau),\qquad
\tilde w_i=s_{g(i)}^0[(1-p_i)c_{a_i^0}+p_i c_i^1].
$$

只有 $z_i$ 可训练。最终不保存概率，而将 $z_i>0$ 的候选按置信度排序，构造 1/8、1/4、1/2、full 嵌套硬投影。这样训练对象是软 switch，研究对象和部署对象始终是真实 assignment。

### 3.5 共享目标、验证和独立 Audit

两个分支使用相同目标

$$
\mathcal L=\mathcal L_{\mathrm{sup}}
+\lambda_{\mathrm{KL}}\mathcal L_{\mathrm{teacher}}
+\lambda_{\mathrm{text}}\mathcal L_{\mathrm{text}}
+\mathcal R,
$$

其中 scale 分支的 $\mathcal R$ 是对数尺度 $L_2$，assignment 分支的 $\mathcal R$ 是 switch 概率惩罚。验证候选必须使 balanced task loss 至少相对锚点改善 0.5%，macro 最多回退 1 pp，任一任务 loss 和文本 CE 最多相对回退 0.5%。单一候选还要在互斥 audit 上通过同一规则，否则恢复 $(s^0,a^0)$。最后审计未训练字段、dtype、逻辑 bpp 与 fresh reconstruction。

### 3.6 为什么离散分支稀疏而尺度分支密集？

设 assignment 切换集合 $S$ 引起扰动 $\delta_S=\sum_{i\in S}\delta_i$。二阶展开为

$$
\mathcal L(W+\delta_S)=\mathcal L(W)+\sum_{i\in S}g^\top\delta_i+
\frac12\delta_S^\top H(\xi)\delta_S.
$$

即使每个局部切换一阶下降，联合交叉项仍可随 $S$ 增大而抵消收益。assignment 的原型跳变是逐向量且不连续的，因此需要稀疏 hard trust region。Scale delta 则在固定原型上形成有界、组共享的连续路径，优化器可以用小步共同调整大量坐标。该解释预测：更多 assignment 切换未必更好，而 scale 可以密集非零；实验同时观察到两者。

## 4 实验

### 4.1 协议

主模型为 Meta-Llama-3.1-8B-Instruct。共同锚点覆盖 32 层、224 个 Linear，FineWeb-Edu 使用 4096 train/128 validation、Vector-GPTQ 512 条，序列长度 4096。任务适应只开放 layers 28–31。Task-assignment 和 task-scale 均使用五个任务 training split 中每任务 512 train、256 validation、256 audit；文本使用 4096 条 FineWeb 训练、互斥 C4 128 validation/512 audit，长度 4096，teacher top-k=32。两者均训练 2 epochs，固定 seed 0，不扫描 group、学习率或 seed。

PPL 在 WikiText2 raw test 上以 seqlength 2048 测量。准确率使用 lm-eval 0.4.4 全量 0-shot ARC-C、ARC-E、HellaSwag、LAMBADA、PIQA、WinoGrande，无 `limit`。公共五任务口径去掉 LAMBADA，以对齐 GSQ 报告。所有正式实验只使用一张 A100 80GB。

### 4.2 核心问题：两种坐标是否等价？

| 适应状态 | 任务标签 | 部署改动 | PPL ↓ | Macro-6 ↑ | 公共五任务 ↑ |
|---|:---:|---|---:|---:|---:|
| Vector-GSQ 锚点 | 否 | 无 | **10.4960** | 67.9997 | 68.1046 |
| teacher/text-only assignment | 否 | 0.4617% index | 12.2604 | 65.9217 | 67.2062 |
| task-assignment | 是 | 0.3781% index | 10.7347 | 69.4774 | 69.0744 |
| **task-scale** | **是** | 5.52M FP16 scale | 10.9448 | **71.7223** | **72.5484** |

同一监督预算下，task-scale 相对锚点的 Macro-6/五任务增益为 +3.7225/+4.4438 pp，task-assignment 为 +1.4777/+0.9698 pp；前者分别多 2.2449/3.4740 pp。另一方面，task-scale 的 PPL 相对锚点退化 4.2757%，task-assignment 只退化 2.2742%。两者因此不是等价参数化：scale 是高任务收益、高语言漂移端点，assignment 是较低收益、较低漂移端点。Figure 1 应直接画出这一 PPL–Macro Pareto，而不是首先展示流水线。

### 4.3 逐任务分工

| 任务 | 锚点 | task-assignment | task-scale | scale 相对 assignment |
|---|---:|---:|---:|---:|
| ARC-C | 47.2696 | 49.6587 | **53.7543** | +4.0956 |
| ARC-E | 76.0943 | **79.4192** | 78.5774 | -0.8418 |
| HellaSwag | 70.1354 | 69.9263 | **77.5443** | +7.6180 |
| LAMBADA | 67.4753 | **71.4923** | 67.5917 | -3.9006 |
| PIQA | 77.0947 | 77.1491 | **79.5430** | +2.3939 |
| WinoGrande | 69.9290 | 69.2186 | **73.3228** | +4.1042 |

Scale 的优势主要来自 HellaSwag、ARC-C、WinoGrande 和 PIQA；assignment 在 ARC-E 与 LAMBADA 更好。特别是 LAMBADA，assignment 相对锚点提高 4.0171 pp，而 scale 几乎不变。这种任务依赖进一步说明两个坐标携带不同功能方向，而非一个优化更充分的简单强弱关系。

### 4.4 独立 Audit 与部署合同

Task-scale 的 validation macro 从 71.9531% 升至 76.3281%，独立 audit 从 69.7656% 升至 76.0156%；C4 validation/audit CE 分别从 2.66053/2.71407 降至 2.44109/2.48685，epoch 2 通过 Gate。5,521,408 个 scale delta 全部非零，mean absolute log-delta 为 0.04323。落盘后 assignment 和 codebook bit-exact，scale 保持 FP16，fresh reconstruction 精确，逻辑 bpp 仍为 2.1207557。

Task-assignment 的验证只接受 full 正 switch 的 1/8，即 549,997/145,465,344 个 index。它的 task audit 从 69.7656% 升至 71.5625%，固定码本、scale、normalizer 和非目标层全部 bit-exact。两条链都通过相同强度的独立审计，因而主表差异不能由 checkpoint 选择宽松程度解释。

### 4.5 为什么 Assignment 必须位于附近领域且保持稀疏？

| Assignment 投影 | 切换率 | Validation Acc ↑ | Balanced loss ↓ | 文本 CE ↓ |
|---|---:|---:|---:|---:|
| 锚点 | 0 | 71.9531 | 0.83785 | 2.66053 |
| **1/8** | **0.3781%** | **74.1406** | 0.78548 | **2.48025** |
| 1/4 | 0.7562% | 73.6719 | **0.77777** | 2.51655 |
| 1/2 | 1.5124% | 73.4375 | 0.77915 | 2.63600 |
| full | 3.0248% | 71.5625 | 0.81238 | 2.97347 |

所有 alternative 都来自当前码字的同一 8-way 附近领域且由负一阶方向选出，但更多 hard switch 不单调改善。Full 相比 1/8 准确率低 2.5781 pp、文本 CE 高 19.88%。这直接支持“局部候选是必要条件，但联合可部署解仍需稀疏信赖域”的方法动机。

### 4.6 监督来源负对照

Teacher/text-only assignment 保持相同锚点、候选宽度、更新步数与文本预算，但任务标签不进入 proposal、训练、projection selection 或 audit。它把 C4 validation/audit teacher CE 改善 1.5143%/1.6906%，却让 WikiText2 PPL 退化 16.8100%、Macro-6 下降 2.0780 pp，六项任务无一改善。代理改善与正式质量同时恶化，排除了“附近领域 assignment 自动提高通用 PTQ”的解释。

### 4.7 与公开方法的边界

| 方法 | 目标任务监督 | bpp | PPL ↓ | 公共五任务 ↑ | 比较角色 |
|---|:---:|---:|---:|---:|---|
| GSQ（公开） | 否 | 2.13 | — | 68.5500 | 同模型公开质量点 |
| QTIP（统一复现） | 否 | **2.00** | **8.7971** | 69.8749 | 通用 PTQ 前沿 |
| task-assignment | 是 | 2.1208 | 10.7347 | 69.0744 | 离散任务适应 |
| task-scale | 是 | 2.1208 | 10.9448 | **72.5484** | 连续任务适应 |

Task-scale 的任务平均数值高于 QTIP，但它使用目标任务 training split，且 PPL 显著更差，不能据此声称通用 PTQ SOTA。LoTA-QAF 等任务适应方法使用不同量化格式、adapter 状态与任务集合，公开数字不能直接填入同一表。本文最强公平结论是同一 VQ checkpoint 内部的坐标比较，而非跨监督方法排名。

### 4.8 成本与局限

32 层锚点量化约 54.58 小时。Task-scale 校准 1.49 小时、PPL 56 秒、六任务 26.62 分钟；task-assignment 校准约 6.45 小时。两者都不增加部署 bpp，但后者训练时需要全量 switch logits 和局部候选，适配成本明显更高。因此不能把“零额外部署存储”写成“免费适应”。

严格同模型证据目前只有一个 8B Instruct 模型，且只开放最后四层；没有 70B、跨模型族和长上下文生成证据。任务训练与测试同族，不主张跨任务迁移。本文尚未运行连续 scale 与局部 assignment 的联合端点，因此只能证明两种坐标分工，不能证明联合方法支配任一单分支。没有定制 kernel，逻辑 bpp 不等于实测吞吐。

## 5 讨论

### 5.1 对论文方法论的修正

公平基线改变了核心结论。若只看 assignment 相对锚点的 +1.48 pp，它像是主要创新；加入同预算 scale 后，更准确的认识是：任务适应首先利用了 block-scaled VQ 中已有的连续自由度，附近领域 assignment 则提供另一条更稀疏的离散路径。强论文不应把后者包装成全面更强，而应解释两种路径为何落在不同 Pareto 区域。

### 5.2 下一步可证伪假设

最自然的后续不是调 group size、seed 或邻域宽度，而是验证连续—离散互补性。一个有效联合方法应在共享 train/validation 上学习 scale 与 assignment，只对最终组合端点执行一次独立 audit；成功标准是不低于 task-scale 的任务 macro，同时将 PPL 拉向 task-assignment。若 assignment 在 scale 锚点上 no-op 或退化，则应把它保留为机制消融，而不是主方法必需模块。

## 6 结论

本文研究已有 2-bit block-scaled VQ checkpoint 中哪些部署变量真正承担任务适应。完全匹配的实验显示，连续 group scale 与当前码字附近领域的离散 assignment 不是等价参数化：scale 带来更大的任务增益与更大的 PPL 漂移；assignment 通过 0.378% 的稀疏硬切换提供较低扰动的中间点。SAGE-VQ 用共享锚点、坐标特定训练、loss-dominance 验证与独立 audit 把这一差异变成可归因证据。无标签负对照进一步说明收益来自任务监督，而非通用 PTQ。当前最可信的贡献是发现并刻画连续—离散适应坐标的功能非均匀性；联合利用二者仍是下一版本必须验证的开放问题。

## 参考文献

[1] Frantar, E., Ashkboos, S., Hoefler, T., & Alistarh, D. GPTQ. ICLR, 2023.

[2] van Baalen, M., et al. GPTVQ: The Blessing of Dimensionality for LLM Quantization. 2024.

[3] Egiazarian, V., et al. Extreme Compression of Large Language Models via Additive Quantization. ICML, 2024.

[4] Tseng, A., et al. QuIP#: Even Better LLM Quantization with Hadamard Incoherence and Lattice Codebooks. ICML, 2024.

[5] Tseng, A., Sun, Q., Hou, D., & De Sa, C. QTIP. NeurIPS, 2024.

[6] Lin, J., et al. AWQ. MLSys, 2024.

[7] Shao, W., et al. OmniQuant. ICLR, 2024.

[8] Ashkboos, S., et al. QuaRot. NeurIPS, 2024.

[9] Liu, Z., et al. SpinQuant. ICLR, 2025.

[10] Dadgarnia, A., et al. GSQ: Highly-Accurate Low-Precision Scalar Quantization for LLMs via Gumbel-Softmax Sampling. 2026.

[11] Jang, E., Gu, S., & Poole, B. Categorical Reparameterization with Gumbel-Softmax. ICLR, 2017.

[12] Malinovskii, V., et al. PV-Tuning: Beyond Straight-Through Estimation for Extreme LLM Compression. NeurIPS, 2024.

[13] Maddison, C. J., Mnih, A., & Teh, Y. W. The Concrete Distribution. ICLR, 2017.

[14] Goodman, K., et al. LoTA-QAF: Lossless Ternary Adapters for Quantization-Aware Fine-Tuning. NeurIPS, 2025.
