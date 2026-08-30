# SAGE-VQ 论文版本—评审—修改跟踪表

本表记录每个中文论文版本的核心叙事、评审意见、后续修复和分项评分。V1--V5 未逐版生成独立 reviewer 文件，分数为 2026-08-28 基于现存稿件和实验产物的回溯评估；V6 起采用独立 ICLR 风格评审。所有分数均为 10 分制，`总体`近似投稿成熟度而非简单均值。

| 版本 | 日期 | 核心叙事 | 主要评审意见 | 下一版落实的修复 | 写作 | 创新 | 实验 | 理论 | 可复现 | 总体 |
|---|---|---|---|---|---:|---:|---:|---:|---:|---:|
| V1 | 2026-07 | 高吞吐、可恢复的逐层 GSQ 训练 | 更像系统实现报告；方法问题不聚焦；并行、恢复与量化创新混杂；缺完整 LLaMA 证据 | V2 转向残差目标和硬搜索，弱化纯工程吞吐 | 3.5 | 2.5 | 2.0 | 2.0 | 4.0 | 3.0 |
| V2 | 2026-07 | FSR-VQ：残差移位目标与事务式硬搜索 | 有算法对象但故事被局部搜索细节占据；与 VQ 表示的关系弱；缺全模型结果 | V3 引入尺度对齐、共享码本和部署态离散学习 | 4.5 | 4.0 | 2.5 | 3.5 | 4.5 | 4.0 |
| V3 | 2026-08 | 结构对齐与部署态 Gumbel 优化 | 方法模块过多，呈 A+B+C；把 Q/K/V/O/MLP 顺序写得像主要创新；正式结果不足 | V4 将主线收束为当前码字邻域中的 assignment 学习 | 5.0 | 5.0 | 3.0 | 4.0 | 5.0 | 4.5 |
| V4 | 2026-08 | 局部码字邻域中训练可部署 assignment | Motivation 较清楚，但过度强调训练顺序和校准数值选择；省略 block scale VQ 与 Vector-GPTQ | V5 恢复尺度对齐共享 VQ、二阶硬锚点和 assignment 三者关系 | 6.0 | 5.5 | 3.5 | 4.5 | 5.0 | 5.0 |
| V5 | 2026-08-22 | 从尺度对齐码本到功能感知 assignment | 三阶段较完整，但仍像模块堆叠；错误地把最终实现写成 8 类 categorical Gumbel；没有 Llama-3.1 matched、QTIP 统一复现和 PPL 代价 | V6 以“最近码字不等于功能最优”的现象为主轴；按真实代码改为功能梯度定向 + binary Concrete + 稀疏投影；补同模型完整结果 | 6.5 | 6.0 | 4.5 | 5.0 | 5.5 | 5.5 |
| V6 | 2026-08-28 | 最近码字不是功能最优；assignment 是稀疏信赖域 | 现象、真实方法与审计明显增强；但 task-label supervision 使 GSQ/QTIP 排名不完全公平；缺 text-only 完整实验、阶段消融和二阶交互解释；QTIP 总体支配 | V7 首先校正为 task-adapted 定位；补 teacher/text-only 同模型实验；用既有投影分析一阶预测—真实硬损失偏差；加入二阶余项解释 | 8.0 | 6.5 | 6.0 | 4.5 | 8.0 | 5.0 |
| V7 | 2026-08-28 | 少量码字切换决定任务适应；固定 VQ 表示上的离散信赖域 | 监督定位、公平负对照和二阶解释使论文达到边缘接收；仍缺同监督task-adaptation基线、70B/跨模型广度、锚点阶段消融；PPL与两任务退化 | 下一轮优先对比同监督同预算任务适应方法；无实验预算时继续收缩锚点贡献并完成官方模板编译 | 8.7 | 6.8 | 7.2 | 6.0 | 8.7 | 6.0 |
| V8 | 2026-08-28 | 同一 VQ 表示中的连续 scale 与局部 assignment 形成不同 task/PPL 适应坐标 | 同监督scale-only显著超过assignment-only，论文诚实转为双坐标非均匀性；但尚无联合端点，scale更快且任务分数更高；缺第二模型、真实Figure 1和外部task-adaptation基线 | 下一版先验证单次独立audit约束的scale+assignment联合方法；失败则把assignment降为Pareto消融，不做seed/group/LR扫描 | 9.0 | 6.5 | 7.8 | 6.0 | 9.0 | 5.5 |
| V9 | 2026-08-29 | 同步软联合产生尺度补偿--硬投影失配；部署坐标必须经真实 hard checkpoint 交接 | 联合正式实验被scale-only在PPL和两种任务平均上严格支配；零switch反证定位soft mixture补偿；已补Figure 1并正面承认PV-Tuning先验，但尚无成功hard-handoff方法、组级机制统计或第二模型 | 下一版固定独立scale硬checkpoint，重新计算8-way功能邻居并只训练稀疏assignment repair；预注册剩余不重叠audit，成功标准直接相对scale-only | 9.2 | 5.8 | 8.2 | 5.8 | 9.3 | 5.5 |
| V10 | 2026-08-29 | Hard handoff保护scale但不产生组合增益；98.20%逐向量负一阶方向无法形成改善的hard set | 两epoch八个hard projection全部低于scale baseline，最终bit-exact no-op；现象可信且selector bug完整修复，但实用方法仍是scale-only，缺曲率/梯度一致性直接统计、第二模型和同监督外部基线 | 下一版只检验scale-conditioned curvature或跨batch/任务gradient-consensus proposal；不做LR/group/seed/projection扫描，若仍no-op则停止把assignment作为scale后续主模块 | 9.3 | 5.5 | 8.5 | 5.8 | 9.5 | 5.5 |
| V11 | 2026-08-30 | 四视图严格共识将负一阶候选从98.20%筛至48.71%，却仍0/8通过；符号稳定不是离散可信域 | 机制漏斗、负结果与精确回滚证据强，且相对V10只改变proposal；但最终方法仍是scale-only，曲率与集合交互尚未直接测量，仅覆盖单模型最后四层，缺同监督外部基线和真实kernel | 下一版仅允许先做候选级scale-conditioned curvature排序probe；若不能预测单步/小集合hard loss，停止完整assignment训练并将论文定位为代理失效与部署坐标边界研究 | 9.4 | 5.7 | 8.8 | 6.6 | 9.6 | 5.5 |
| V12 | 2026-08-30 | Scale-conditioned局部曲率对严格共识4/4胜，却未过aggregate predictor Gate；局部二阶信息不是端到端部署证书 | Matched-cardinality硬集合和预注册失败路径可信，且直接测量了V11缺失的局部曲率；但仍无新Pareto端点，只覆盖单模型最后四层，集合交互仍是遗漏项解释而未直接估计 | 下一版停止独立候选ranking；仅做小集合sequential conditional gain，并加入Linear/block reconstruction正控制，直接检验局部正确而传播失效 | 9.5 | 5.8 | 8.9 | 7.0 | 9.7 | 5.5 |
| V13 | 2026-08-30 | 因果集合条件评估把四个固定局部bundle转化为单调train收益和held-out任务loss改善，但text CE越过保护线；task-only条件收益仍非跨域部署证书 | 直接估计了V12缺失的集合交互，并以causal mask、同batch parity和正控制保证机制证据；但方法接近贪心坐标下降，仅一个8B模型最后四层，无部署端点、正式benchmark或同设置QTIP/GSQ排名，且每层正控制仅$n=7$ | 下一版只做text-train不可交易约束下的词典序条件接受，validation/audit保持不可见；先完成4096序列成本与parity合同，不做seed/bundle/阈值调参；若仍失败则停止通用PTQ assignment主路线 | 7.5 | 5.5 | 5.0 | 4.5 | 8.0 | 5.0 |
| V14 | 2026-08-30 | 固定28个局部bundle中27个改善task train，但0/27满足完整text-train零退化；任务收益丰富而当前动作空间的零文本代价可行域为空 | 词典序约束、4096×4096完整文本、128GiB cache与fail-closed协议可信；但零switch、无checkpoint/validation/formal benchmark，仅单模型最后四层，约束过滤不是强算法创新，零预算和bundle粒度仍可能过严 | 下一版不得继续重排同一bundle或事后放宽阈值；只有构造有原理的补偿动作，并先在train上证明正task gain与非增text CE，才允许新实验；否则停止通用PTQ assignment主路线 | 8.0 | 5.5 | 5.5 | 4.5 | 8.5 | 5.5 |

## 评分口径

- **写作：** motivation 是否由现象自然推出，章节功能是否清晰，结论边界是否诚实。
- **创新：** 是否提出可区分于既有 VQ、GSQ、PV-Tuning 的核心机制，而非模块重组或超参数变化。
- **实验：** 是否包含完整模型、同模型公平强基线、PPL/下游任务、有效消融与负结果。
- **理论：** 是否有清晰问题形式化、机制解释和可证或可检验推论。
- **可复现：** 协议、数据、代码、硬 checkpoint、审计和失败结果是否完整可追踪。
- **总体：** 以 ICLR/ICML/NeurIPS/AAAI 主会审稿标准衡量的当前成熟度。

## 版本规则

1. 每次新增中文主稿，在 `papers/` 中递增版本号，不覆盖旧稿。
2. 每版完成后生成 `reviews/<timestamp>_*_review.md`，并把分数和核心意见回填本表。
3. 下一版必须逐条对应上一版主要意见；无法补齐的实验缺口必须在局限中显式保留。
4. smoke、截断数据和无效解码结果不得进入正式表格；完整失败实验可作为方法边界或工程复现证据。
