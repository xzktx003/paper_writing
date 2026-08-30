# Llama-3.1-8B Scale-conditioned 局部曲率预测器正式实验报告

时间：2026-08-30 07:30（Asia/Shanghai）

## 1. 实验目的

V11 已证明，四视图严格共识能把聚合一阶负候选率从 98.1973% 降至 48.7101%，却仍无法产生优于 scale 硬端点的 assignment 集合。本实验不直接训练 assignment，也不扫描 seed、学习率、group size 或曲率系数；它检验一个更前置且可证伪的问题：对真实 scale-conditioned 码字跳转加入局部激活曲率后，候选排序能否稳定预测端到端 hard validation loss。只有预测器通过，才允许启动一次完整 assignment 训练。

## 2. 实验原理

冻结部署锚点 $\hat w_i=s_{g(i)}c_{a_i}$。对候选邻居 $c$，第 $v$ 个互斥数据视图的一阶变化为

$$
\Delta_i^{(v)}(c)=\langle g_i^{(v)},\,s_{g(i)}(c-c_{a_i})\rangle.
$$

在同一次带反向传播的真实 forward 中累计 Linear 输入逐维二阶矩 $m_j=\mathbb E[x_j^2]$，并对有限码字跳转 $\delta_i=s_{g(i)}(c-c_{a_i})$ 定义对角局部输出曲率代价

$$
q_i(c)=\sum_j m_j\delta_{ij}^2.
$$

该式精确对应对角化 Linear 输出二次误差，不声称等于完整 Transformer 任务 Hessian。实验比较三个等基数排序：聚合一阶、四视图严格共识最差分数，以及

$$
r_i(c)=\frac{\max_v\Delta_i^{(v)}(c)}{\sqrt{q_i(c)+\epsilon}}.
$$

每个 Linear 固定选择 128、512、2048、8192 个切换，三种方法各产生四个 nested hard set，共 12 个真实端到端验证集合。预注册门禁要求曲率排序相对每个 control 至少赢 3/4 个预算，且四预算平均 balanced loss 更低。

## 3. 实验配置

| 项目 | 配置 |
|---|---|
| 模型 | Meta-Llama-3.1-8B-Instruct |
| 源状态 | 已审计 task group-scale 硬端点，2.1207557 bpp |
| VQ | $d=6$、$K=4096$、group size 160、block scale 后共享码本 |
| 开放层 | layers 28--31，共 28 个 Linear |
| 候选 | 当前码字 8-way 几何邻域 |
| 任务 | ARC-C、ARC-E、HellaSwag、PIQA、WinoGrande |
| 任务 train/validation/audit | 每任务 512/256/31 |
| 文本 train/validation/audit | rows 0--4095 / 4736--4863 / 5504--5567 |
| 文本长度 | 4096 |
| Gradient views | 4 个互斥任务分层视图 |
| Hard budgets | 每 Linear 128/512/2048/8192 |
| GPU | 本机物理 GPU5，单卡 |
| 正式测试约束 | 预测器、source validation、candidate-unexposed audit 依次通过后，才允许 PPL/lm_eval |

## 4. 实验步骤

1. 从冻结 scale checkpoint 重构 layers 28--31 的 145,465,344 个六维向量。
2. 用四个互斥视图计算候选一阶变化；只在真实 backward forward 中累计输入二阶矩。
3. 为每个向量的 8-way 邻域计算真实 scale-conditioned jump 与 $q_i(c)$。
4. 分别按聚合一阶、严格共识、曲率归一化排序构造四个等基数硬集合。
5. 每次应用集合后运行完整任务 validation，再精确恢复 source；所有 12 次评估共享同一锚点。
6. 检查预注册 predictor Gate。失败即停止，不访问候选 audit、不写 checkpoint、不运行正式测试。

## 5. 实验结果

### 5.1 候选池

| 统计 | 数值 |
|---|---:|
| 总向量 | 145,465,344 |
| 聚合一阶存在负邻居 | 142,842,971（98.1973%） |
| 四视图严格共识合格 | 70,856,047（48.7099%） |

曲率排序不改变严格共识的资格集合，只改变同一候选池内的优先级。因此与严格共识的差异是纯排序效应。

### 5.2 十二个 matched-cardinality 硬集合

| 每 Linear 预算 | Aggregate loss / Macro | Consensus loss / Macro | Curvature loss / Macro |
|---:|---:|---:|---:|
| 128 | 0.848070 / 67.5000% | 0.848267 / 67.1875% | **0.804163 / 70.8594%** |
| 512 | 1.138119 / 56.4063% | 1.191663 / 55.0781% | **1.078899 / 61.0156%** |
| 2048 | **1.317897 / 44.2969%** | 1.370206 / 43.1250% | 1.328956 / **45.4688%** |
| 8192 | **1.561233 / 37.0313%** | 1.612292 / 36.9531% | 1.598649 / **38.3594%** |

曲率排序对严格共识为 4/4 胜，四预算平均 loss 从 1.255607 降至 1.202667。它对聚合一阶仅为 2/4 胜，虽平均 loss 也从 1.216330 降至 1.202667，却未达到预注册的 3/4。因此 predictor Gate **失败**。

### 5.3 即使最佳曲率集合也不是部署改进

Source validation 为 Macro 76.3281%、balanced loss 0.679691。最佳曲率集合是每 Linear 128 个切换，共 3584 个向量、占全部向量 0.002464%；其 Macro 为 70.8594%，下降 5.4688 pp，balanced loss 为 0.804163，相对恶化 18.313%。其余更大预算单调暴露更严重的端到端退化。

因此，实验不能被解释为“曲率方法成功但阈值没调好”。曲率对共识排序确有信息，但局部 Linear 二次代价仍不能代表深层网络中的非线性传播、跨层敏感度与多切换交叉项。

### 5.4 资源、审计与终态

实验耗时 5325.16 秒（1.479 小时），PyTorch 峰值 27,149,745,152 bytes（25.285 GiB），程序在本机 GPU5 单卡正常退出。Predictor Gate 失败后：候选 audit 未访问、正式 test 未使用、checkpoint 未写入、完整 assignment 训练未授权，逻辑部署状态保持 source。

## 6. 结论

Scale-conditioned 对角局部激活曲率是比纯符号共识更好的候选排序器，却不是端到端离散可信域。V10--V12 已依次排除“聚合一阶足够”“跨视图符号一致足够”“独立候选对角曲率足够”。继续扫描训练超参数无法回答剩余问题；assignment-after-scale 路线在本证据下停止。

若重启离散 assignment，方法必须直接建模集合级端到端相互作用，例如小集合真实损失的 sequential conditional gain、块级重构或可校准的低秩交叉项，而不是把逐候选分数直接相加。

## 7. 产物与校验

- 紧凑结果：`code/GSQ_nowag_d1_20260716_015355/experiments/results/20260830_073000_llama3_1_8b_scale_curvature_probe_complete.json`
- 原始 summary：`code/GSQ_nowag_d1_20260716_015355/experiments/results/local_scale_curvature_probe/20260830_060218_llama3_1_8b_scale_curvature_probe_l28_31_gpu5/curvature_probe_summary.json`
- 原始 summary SHA256：`436765bcf8590403c2ac64ca78e42884e5a1d1b86a58c53b5cdabe372a6276bc`
- checkpoint：未生成（门禁失败）
