# V12 顶会叙事调研：从局部二阶最优到端到端离散集合失配

时间：2026-08-30

## 研究问题

V12 不把“加入 Hessian”本身当作创新。GPTQ 已经证明二阶信息可用于逐列权重量化；BRECQ 则明确指出参数空间近似不等于模型空间近似，低比特下跨层依赖不能忽略。真正尚未回答的问题是：在 block-scaled shared-codebook VQ 已形成硬端点后，一个对 scale 和激活敏感的局部候选曲率，是否足以授权端到端 assignment 集合？

## 一级来源带来的叙事约束

1. [BRECQ, ICLR 2021](https://openreview.net/pdf?id=POWv6hDd9XH) 把低比特 PTQ 的目标从独立权重误差推向 block reconstruction，并强调跨层依赖。这要求本文不能把 Linear 对角输出曲率写成完整任务 Hessian。
2. [GPTQ, ICLR 2023](https://openreview.net/forum?id=tcbBPnfwxS) 给出了近似二阶信息与误差反馈的高效权重量化框架。本文的 Vector-GPTQ 是硬锚点背景；V12 的问题发生在锚点之后，不能声称首次使用 Hessian。
3. [MREM, NeurIPS 2022](https://proceedings.neurips.cc/paper_files/paper/2022/hash/096347b4efc264ae7f07742fea34af1f-Abstract-Conference.html) 说明模块级重构可以切断端到端训练依赖并并行化，但代理目标能否保持最终模型质量仍需实测。这支持 V12 用真实 hard validation set 审计局部代理。
4. [QTIP, NeurIPS 2024](https://proceedings.neurips.cc/paper_files/paper/2024/hash/9a3bc04e775946e2335518413109f849-Abstract-Conference.html) 与 [AQLM, ICML 2024](https://proceedings.mlr.press/v235/egiazarian24a.html) 代表极低比特下更强的表示设计。它们提醒本文：如果最终端点不改善，不能用候选诊断替代压缩性能贡献。
5. [PV-Tuning, NeurIPS 2024](https://proceedings.neurips.cc/paper_files/paper/2024/hash/ae66fb5b59e2478614314603bc32cf64-Abstract-Conference.html) 直接优化离散与连续量化参数，说明 assignment/scale 联合优化并非空白；本文只能贡献硬部署代理边界与审计方法。
6. [Quantization Error Propagation, NeurIPS 2025](https://proceedings.neurips.cc/paper_files/paper/2025/hash/df2034a516cbd617a96492cc476276c9-Abstract-Conference.html) 重新审视逐层 PTQ 中误差向后续层传播的影响。它与 V12 的证据共同指向：独立候选的局部曲率不能覆盖深网传播链。

## V12 应当采用的叙事

### 一句话主张

在 2-bit block-scaled VQ 中，scale-conditioned 局部曲率能改善候选排序，却不能授权任何端到端 hard assignment 集合；离散可信域必须建模集合级误差传播，而非逐候选二阶代价。

### 证据链

1. V10：聚合一阶在 98.20% 向量上给出负邻居，但 0/8 hard set 改善。
2. V11：四视图严格共识把资格率降到 48.71%，仍 0/8 改善；符号稳定不充分。
3. V12：在同一资格池内加入真实 scale、有限码字跳转和激活二阶矩。相对共识 4/4 胜，证明曲率有信息；相对 aggregate 仅 2/4，且所有 12 个 hard set 都输给 source，证明它仍不是部署证书。

这条链不是“逐版调参”，而是三次互斥机制检验：线性方向、跨视图稳定性、独立候选对角曲率。每一步只加入上一步缺失的信息，并由真实硬集合裁决。

## Claim 边界

可以声称：

- 首次在本项目的 block-scaled shared-codebook VQ 上建立 scale-conditioned assignment curvature probe；
- 曲率排序对 strict consensus 有稳定增益；
- 逐候选局部输出曲率不是端到端 hard-set 可信域；
- 预注册 Gate 避免了约数小时无依据的完整训练和测试集污染。

不能声称：

- 超过 QTIP、GSQ 或其他压缩 SOTA；
- 估计了完整 Transformer Hessian；
- 已经分离出所有交叉项或证明任何 assignment 训练都无效；
- 单模型最后四层结果具有跨架构普遍性。

## 下一版的方法性方向

V13 不应继续换归一化系数、预算、seed 或训练超参数。唯一合理方向是从“独立候选评分”转向“条件集合收益”：在 hard apply 后用 block/layer 输出或端到端 validation 计算小批候选的条件增益，逐步构造集合；若计算成本过高，再学习能预测该条件增益的低秩交叉代理。只有这种设计直接覆盖 V12 已识别的集合交互缺口。
