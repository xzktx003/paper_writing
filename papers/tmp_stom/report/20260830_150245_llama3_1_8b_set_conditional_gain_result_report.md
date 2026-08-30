# Llama-3.1-8B 因果集合条件 Assignment 增益正式实验报告

时间：2026-08-30 15:02（Asia/Shanghai）

## 1. 实验目的

V12 证明，scale-conditioned 局部曲率能够改善候选排序，却不能把逐候选分数直接相加成可靠的硬集合。本实验不再扫描单点排序、budget、seed、学习率或 group size，而直接检验集合交互：把每个 Linear 中固定的 128 个曲率候选视作一个离散 bundle，在已经接受的硬状态条件下真实评估其端到端训练边际收益。问题是：集合条件收益能否构造同时改善任务并保持语言分布的可部署 assignment 端点。

## 2. 实验原理

冻结 block-scaled shared-codebook VQ 锚点 $S_0$。对第 $\ell$ 层 Linear $m$ 的固定 bundle $B_{\ell,m}$，不再使用独立候选分数之和，而在此前已接受集合 $S_{<\ell}$ 条件下计算

$$
\Delta_{\ell,m}=F_{\mathrm{train}}(S_{<\ell})-
F_{\mathrm{train}}(S_{<\ell}\cup B_{\ell,m}),
$$

其中 $F_{\mathrm{train}}$ 是五任务等权 supervised CE 与 $0.25$ 倍 dense-teacher KL。每层真实评估 Q/K/V/O 与三个 MLP Linear 共七个 bundle，只接受 $\Delta_{\ell,m}>10^{-7}$ 的最佳项，每层最多一个。后层的比较始终包含此前已接受的硬切换，因而测量的是条件集合增益，而非独立代理的求和。

候选仍由四个互斥任务/文本 gradient views 和 scale-conditioned 曲率产生，但它只负责提出固定坐标，不负责接受。作为正控制，每层记录七个 bundle 的局部曲率成本与真实即时 block-output MSE 的 Spearman 相关。Validation 与 audit 不参与搜索。

## 3. 实验配置

| 项目 | 配置 |
|---|---|
| 模型 | Meta-Llama-3.1-8B-Instruct |
| 源状态 | 已审计 task group-scale 硬端点，2.1207557 bpp |
| VQ | $d=6$、$K=4096$、group size 160、block scale 后共享码本 |
| 开放层 | layers 28--31，共 28 个 Linear |
| 离散坐标 | 每 Linear 固定 curvature top-128 bundle |
| 搜索 | 因果层序；每层真实评估 7 个 bundle；最多接受 1 个 |
| 任务 | ARC-C、ARC-E、HellaSwag、PIQA、WinoGrande |
| 任务 train/validation/audit | 每任务 512/256/31 |
| 文本 train/validation/audit | rows 0--4095 / 4736--4863 / 5568--5631 |
| 文本长度 | 4096 |
| Proposal views | 4 个互斥任务/文本视图 |
| 训练裁决目标 | 等权任务 supervised CE + 0.25 dense-teacher KL |
| Cache | layer 28 输入；batch=4；按总长度与 continuation 起点分桶 |
| Parity | 32 个跨任务/长度/continuation 分层样本；同 batch 完整 HF 前向；阈值 0.02 |
| GPU | 本机物理 GPU7，单卡；未使用服务器 14 |
| 正式测试约束 | task/text validation 与 candidate-unexposed audit 依次通过后，才允许 checkpoint、PPL、lm_eval |

## 4. 实验步骤

1. 构造五任务互斥 train/validation/audit 与文本 train/validation/audit；只给 train 提供 dense teacher。
2. 在 dense 模型上按固定 shape bucket 计算 batch-matched task teacher，并计算长度 4096 的文本 top-k teacher。
3. 加载 2.1207557 bpp source，缓存 2560 个 train 样本、8193 个 choice 的 layer-28 输入。
4. 用 32 个分层样本把 cache 重放与完全相同 batch 的完整 HF 前向比较；只有误差和 argmax 同时通过才继续。
5. 计算四视图一阶几何与输入二阶矩；为 28 个 Linear 固定 curvature top-128 bundle。
6. 按 layers 28--31 依次评估每层七个 bundle 的真实任务训练联合目标，只接受严格下降的最佳坐标。
7. 搜索结束后才运行 task/text validation。若任一门禁失败，不读取 audit、不写 checkpoint、不运行正式 PPL/lm_eval。

## 5. 实验结果

### 5.1 Cache 合同与实现修复

最终正式 run 的 32 例 parity 覆盖 ARC-C/E 各 7 例、HellaSwag/PIQA/WinoGrande 各 6 例，序列长度 11--163，continuation 起点 7--133。Cache 与同 batch 完整 HF 前向的最大 choice-score 误差为 $1.1444\times10^{-5}$，32/32 argmax 一致，远低于 0.02 门槛。

此前一次运行在方法搜索前被 parity 正确拒绝。诊断发现 direct DecoderLayer 重放遗漏 causal mask；同时，旧 parity 把 batch=4 与 singleton BF16 前向比较，混入了最高 0.254416 的 batch-shape 数值差。修复后手工重放与完整前向的最终 logits 最大误差为 0，同 batch cache 误差为 0.0005286。失败 run 未进入搜索，不计作方法结果。

### 5.2 四个真实条件坐标全部产生训练增益

| 层 | 接受的 Linear | 切换数 | 条件训练增益 | 曲率--block MSE Spearman |
|---:|---|---:|---:|---:|
| 28 | self_attn.k_proj | 128 | 0.0045590 | 0.9643 |
| 29 | self_attn.v_proj | 128 | 0.0012241 | 0.3571 |
| 30 | mlp.gate_proj | 128 | 0.0025375 | 0.5714 |
| 31 | self_attn.v_proj | 128 | 0.0006785 | 0.8214 |

训练联合目标按因果搜索从 0.329784 依次降到 0.325225、0.324001、0.321463 和 0.320785，整体改善 2.7288%。这与 V12 的“一次性叠加后全面退化”不同：真实条件评估能够识别在当前硬状态下确有训练收益的集合。四层正控制相关为 0.357--0.964，说明局部曲率在部分层能预测即时 block distortion，却不能替代端到端裁决。

总共接受 512 个切换，占 145,465,344 个开放向量的 $3.5197\times10^{-6}$。训练 macro 从 98.9063% 降到 98.5938%（$-0.3125$ pp），但 supervised loss 的下降足以使联合目标改善；dense-teacher KL 则从 0.344850 上升到 0.420074。后者已经提示，搜索主要利用任务监督而非保持原模型分布。

### 5.3 Held-out 任务改善，但文本保护门禁失败

| Validation 指标 | Source | Selected | 变化 |
|---|---:|---:|---:|
| 五任务 balanced loss | 0.679691 | **0.672270** | $-1.0919\%$ |
| 五任务 Macro | **76.3281%** | 75.9375% | $-0.3906$ pp |
| 文本 teacher CE | **2.441416** | 2.463844 | $+0.9186\%$ |

任务门禁通过：balanced loss 改善 1.0919%，Macro 下降仍在预注册 1 pp 容忍内，五任务逐项 loss 也没有超过 0.5% 的退化。具体地，ARC-E、HellaSwag、WinoGrande 与 ARC-C loss 均下降，PIQA loss 仅上升 0.001023；Macro 的变化来自有限样本上的 ARC-C、HellaSwag、WinoGrande 各下降 0.78125 pp，PIQA 上升 0.390625 pp。

然而，独立文本 validation CE 恶化 0.9186%，超过预注册的 0.5% 上限，因此总体 validation Gate 失败。程序没有把候选暴露给 task/text audit，没有写 checkpoint，也没有运行 WikiText2 PPL 或六任务 lm_eval。该结果不能被包装为新部署端点，更不能声称超过 QTIP 或 GSQ。

![图 1：四个集合条件坐标均降低训练联合目标，但文本 validation 超过预注册退化上限。](../img/v13_conditional_gain.png)

### 5.4 资源与终态

正式搜索耗时 12,653.27 秒（3.515 小时），PyTorch 峰值 27,149,745,152 bytes（25.285 GiB）。单卡 run 在本机 GPU7 正常退出，`pipeline.status=set_conditional_gain_rejected`。Checkpoint 不存在；audit 与 formal test 均未使用。

## 6. 结论

V13 首次直接测量了离散 assignment bundle 的集合条件收益。相对于 V12 的独立排序，因果条件评估确实把四个局部 bundle 转化为单调训练增益，并在 held-out 任务 loss 上保持改善；因此“集合交互无法被独立分数表示”得到正面证据，而不再只是失败后的解释。

但 task-only 条件目标不是语言保持证书。它允许 supervised CE 的收益覆盖 teacher KL 上升，最终在未参与搜索的文本 validation 上越过安全门槛。下一方法问题不是调 bundle size、seed 或阈值，而是把跨域保持写进离散坐标的接受规则，例如用可计算的文本训练代价形成 Pareto/词典序条件裁决，并证明该裁决能预测 candidate-unexposed 文本 audit。若做不到，应把 assignment refinement 明确限定为任务适应，而非通用 PTQ。

## 7. 产物与校验

- 紧凑结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260830_150245_llama3_1_8b_set_conditional_gain_complete.json`
- 原始 summary：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_set_conditional_gain/20260830_110033_llama3_1_8b_set_conditional_gain_l28_31_gpu7/set_conditional_summary.json`
- 原始 summary SHA256：`35211ee200e54019a12308b718a24568fcc611c34078e48abe6b95f6709a9d2c`
- 基础设施失败记录：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_set_conditional_gain/20260830_094655_llama3_1_8b_set_conditional_gain_l28_31_gpu7/failure_summary.json`
- checkpoint：未生成（文本 validation Gate 失败）
