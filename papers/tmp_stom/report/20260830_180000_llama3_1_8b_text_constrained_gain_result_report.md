# Llama-3.1-8B 精确文本约束 Assignment 条件搜索正式实验报告

时间：2026-08-30 18:00（Asia/Shanghai）

## 1. 实验目的

V13在固定局部assignment bundle上测得真实任务条件收益：四个坐标都改善训练目标，held-out任务loss也下降，
但独立文本validation CE恶化0.9186%。本实验不再调整task/teacher损失权重，而将语言保持改写为候选可行性
约束：一个bundle只有在完整text-train数据上、固定top-32 teacher分布的exact full-vocabulary CE相对当前
incumbent不增加时才有资格按task gain排序。

待检验命题是：V13的失败是否只是task-only裁决遗漏文本代价；若把文本保持提前到接受规则，固定坐标族中是否
仍存在非零安全assignment动作。实验固定V13的source、最后四层、每Linear top-128 bundle、数据与顺序，不做
seed、bundle size、阈值、层序、学习率或group扫描。

## 2. 实验原理

对当前已接受硬集合$S$与候选bundle $B$，定义任务收益

$$
G_{\rm task}(B\mid S)=L_{\rm task}^{\rm train}(S)-L_{\rm task}^{\rm train}(S\cup B).
$$

先要求$G_{\rm task}>10^{-7}$，再定义不可交易的文本可行域

$$
\mathcal F(S)=\{B: L_{\rm text}^{\rm train}(S\cup B)\le L_{\rm text}^{\rm train}(S)\}.
$$

每层只在$\mathcal F(S)$内选择task loss最低的bundle；若集合为空则保持source。与加权和不同，任意task收益
都不能购买文本退化。

Text train使用全部4096条、每条4096 token。Source在layer 28输入处构建BF16 hidden cache：

$$4096\times4096\times4096\times2=137{,}438{,}953{,}472\text{ bytes}=128\text{ GiB}.$$

对task-improving候选，最后四层输出沿候选batch维合并；LM head按8192词表块累计精确full-vocab
log-sum-exp，并收集teacher top-32位置期望logit。该布局不物化完整`candidate × token × vocab` logits，
但不近似CE，计算量仍随候选数量线性增长。

## 3. 实验配置

| 项目 | 配置 |
|---|---|
| 模型 | Meta-Llama-3.1-8B-Instruct |
| Source | 已审计task group-scale硬端点，2.1207557 bpp |
| VQ | $d=6$，$K=4096$，group size 160，block scale后共享码本 |
| 开放层 | layers 28--31，28个Linear，145,465,344个六维向量 |
| 候选坐标 | 每Linear固定curvature top-128 bundle；8-way当前码字邻域 |
| Task train | ARC-C、ARC-E、HellaSwag、PIQA、WinoGrande各512条 |
| Task validation/audit | 各任务256/31条，候选零switch时保持未访问 |
| Text train | rows 0--4095，共4096×4096 token |
| Text validation/audit | 128/64条，搜索失败时不构造teacher、不评分 |
| 文本约束 | 相对当前incumbent CE退化预算严格为0 |
| Task目标 | supervised CE + 0.25 dense-teacher KL，五任务等权 |
| LM-head | 候选batch并行，词表chunk 8192，精确top-k teacher CE |
| GPU | 本机物理GPU5，单卡；未使用服务器14 |
| 正式测试 | 只有validation和audit通过才运行WikiText2-2048与六任务全量lm_eval |

## 4. 实验步骤

1. 构造互斥task/text train、validation与audit索引；搜索前只构造train teacher。
2. 加载dense teacher，收集batch-matched task score和text-train top-32分布后释放teacher。
3. 加载2.1207557-bpp source，构建任务prefix cache并通过32例same-batch完整HF parity。
4. 固定四视图curvature top-128 bundle；构建128-GiB完整text-train layer-28 prefix cache。
5. 用覆盖首尾的8条文本对cache重放和same-batch完整HF transformer执行精确CE parity。
6. 按layers 28--31评估七个task坐标；只给task-improving候选计算完整文本CE。
7. 在文本非退化可行集内执行词典序选择；空集时不改变incumbent。
8. 只有非零endpoint才依次构造validation、audit teacher、写checkpoint并运行正式测试。

## 5. 实验结果

### 5.1 缓存与数值合同通过

Task cache覆盖2560个样本、8193个choice和353,058个token。32例分层parity覆盖五任务、长度11--163与
continuation起点7--133；cache与same-batch完整HF前向的最大choice-score误差为
$1.1444\times10^{-5}$，argmax 32/32一致。

Text cache覆盖16,777,216个next-token位置，BF16 hidden恰为128GiB。8条parity按索引
0、585、1170、1755、2340、2925、3510、4095均匀覆盖首尾；chunked CE与完整HF transformer路径的最大
和平均误差均为0，低于0.001门槛。因此zero-switch不是cache错位、LM-head近似或基础设施退出造成的。

### 5.2 任务收益丰富，零退化文本可行域为空

| 层 | task-improving / 7 | text-feasible | 最大task gain（Linear） | 本层最小text CE增幅 | 曲率--MSE Spearman |
|---:|---:|---:|---:|---:|---:|
| 28 | 7 | 0 | 0.0045590（K） | +0.02976% | 0.9643 |
| 29 | 6 | 0 | 0.0047145（MLP gate） | +0.02896% | 0.3571 |
| 30 | 7 | 0 | 0.0054025（MLP up） | +0.02603% | 0.5714 |
| 31 | 7 | 0 | 0.0031168（K） | +0.00785% | 0.7143 |

28个固定bundle中，27个严格降低task-train combined loss；唯一例外是layer29 q_proj，task gain为
$-6.32\times10^{-5}$，因此按合同不计算文本CE。其余27个candidate的文本CE全部高于source
2.1035536536。全局最小绝对上升为0.000165183（+0.0078526%，layer31 down_proj），最大为0.016824409
（+0.7998089%，layer29 k_proj）。不存在任何一个同时task-improving且text-nonregressing的bundle。

![图1：进入文本计算的27个task-improving固定bundle全部位于零退化文本可行域之外；layer29 q_proj因task gain为负，按合同未计算文本CE。](../img/v14_text_feasibility.png)

### 5.3 Fail-closed终态

四层的可行集合均为空，incumbent始终等于source，accepted bundles与switches均为0。程序正常退出0并写
`pipeline.status=text_constrained_gain_rejected`，耗时13,303.33秒（3小时41分43秒），峰值显存
27,149,745,152 bytes（25.285GiB）。

因为没有候选endpoint，程序没有评分task/text validation，没有构造held-out teacher，没有读取audit，没有
写checkpoint，也没有运行WikiText2或lm_eval。V14因此没有可与QTIP、GSQ比较的新PPL或准确率，不能复用
source历史数字声称新结果。

## 6. 结论与方法边界

V13留下的解释“只要把文本保护提前到接受规则即可”在当前坐标族中被否决。条件task gain并不稀缺：27/28
个bundle为正；稀缺的是能在零文本代价下使用的动作。这个现象把剩余瓶颈从scorer和acceptance rule推进到
action space：固定128-switch bundle太粗，或者需要跨Linear/跨层补偿方向，单个局部bundle无法同时满足两类
目标。

该结论严格限定于一个Llama-3.1-8B-Instruct source、最后四层、固定curvature top-128 bundle、top-k teacher
CE和零退化train约束。它不证明所有assignment refinement、其他bundle粒度、其他层或全局组合都不可行；也不
证明text-train CE本身是部署充分证书。下一步若继续，应改变可行动作（如有原理的成对补偿坐标），而不是放宽
阈值或做seed/group/LR扫描。若无法先证明新动作空间存在非空可行域，应停止把assignment作为通用PTQ主模块。

## 7. 产物与校验

- 紧凑结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260830_172328_llama3_1_8b_text_constrained_gain_complete.json`
- 原始summary：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_text_constrained_gain/20260830_154755_llama3_1_8b_text_constrained_gain_l28_31_gpu5/text_constrained_summary.json`
- 原始summary SHA256：`57eb2589170d418379d7852c4c418f37817a1ea195c94200fa2c58f6d4211cff`
- checkpoint：未生成（零退化文本可行集为空）
- 原始236-KB日志：仅本地保留，不提交Git
