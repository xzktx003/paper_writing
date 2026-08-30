# SAGE-VQ V13 独立 ICLR 风格评审

- 评审日期：2026-08-30
- 评审对象：`papers/paper_zh_v13.md`、V13 LaTeX 分节、正式结果 JSON 与对应实现
- 建议：**Weak Reject / Borderline Reject**
- 总体评分：**5.0 / 10**
- 评审置信度：**0.78**

## 1. 工作概述

论文研究约 2.12 bpp 的 block-scaled shared-codebook VQ。在 Vector-GPTQ 硬锚点之后，方法把每个 Linear 的固定 curvature top-128 邻域 bundle 视作离散坐标，并在已接受硬状态下真实测量 $F(S\cup B)-F(S)$。Llama-3.1-8B-Instruct 最后四层各接受一个 128-switch bundle；训练联合目标下降 2.7288%，held-out 任务 loss 下降 1.0919%，但文本 validation CE 上升 0.9186%，超过预注册 0.5% 上限，因而候选被拒绝。

## 2. 证据核验

论文中的核心数字与紧凑正式结果一致：运行完成且为有效方法结果；使用本机单张 GPU7、耗时 3.515 小时、峰值 25.285 GiB，未使用服务器 14。32 个同 batch 完整前向 parity 样本最大 choice-score 误差为 $1.1444\times10^{-5}$，argmax 32/32 一致。四层分别接受 K、V、MLP gate、V projection，合计 512 个 assignment。任务门禁通过，文本门禁失败；audit 未访问、checkpoint 未写、正式 PPL 与 lm_eval 未运行。论文没有把失败候选冒充部署端点，也没有宣称超过 QTIP 或 GSQ。

## 3. 优点

1. **问题推进是可检验的。** V12 只说明独立曲率排序不能授权硬集合；V13 直接在 incumbent 状态上测量 bundle 条件收益，确实补上了集合交互这一缺口。
2. **失败路径严谨。** 文本门禁失败即停止，避免读取 audit 或用正式 benchmark 反向选择方法。
3. **实现审计较强。** 显式 causal mask、同 batch composition 和完整 HF 前向 parity 修复了 direct DecoderLayer 重放中的关键混淆因素。
4. **叙事边界诚实。** 主要发现不是“取得新 SOTA”，而是 task-only 真实边际收益仍不足以保证跨域语言保持。
5. **复现信息完整。** 模型、数据拆分、层、邻域、bundle、GPU、时长、显存、终态和未执行步骤均有记录。

## 4. 主要问题

1. **没有可部署新端点。** 文本 CE 越线后没有 checkpoint、PPL、lm_eval 或 audit 结果，因而论文仍缺少能够与强 PTQ 基线竞争的主要结果。
2. **创新性有限。** 方法在优化视角上接近固定 proposal 上的贪心离散坐标下降。集合条件真实评估是合理且必要的修正，但尚不足以构成强方法创新，除非下一步给出非平凡的约束接受机制或更一般的效率/理论结果。
3. **实验范围窄。** 只有一个 8B Instruct 模型的最后四层、固定 bundle。尚不能证明全层、跨模型或不同任务域上的稳定性。
4. **基线不可直接排名。** 当前选择使用目标任务标签，而 QTIP/GSQ 是通用 PTQ；V13 又没有产生部署候选，因此没有同设置的 QTIP/GSQ Pareto 比较。
5. **正控制统计很弱。** 每层曲率--block MSE Spearman 只基于七个 Linear bundle。该统计可作为实现和方向检查，不能支撑普遍的排序规律。
6. **理论仍是解释性。** Taylor 交叉项能解释独立代理为何失败，但没有给出条件搜索何时保持跨域损失的充分条件、界或可证明接受准则。

## 5. 因果重放缺陷的影响范围

旧 direct DecoderLayer 重放缺少 causal mask 是实质性实现缺陷。V13 正式运行在搜索前通过了修复后的同 batch parity，因此本版正式结论有效。更早只依赖该重放 helper 的代理结论不能被本次修复追溯性认证；已有完整 Hugging Face 硬模型 validation、PPL 或 lm_eval 结果不受该 helper 缺陷影响。论文应保留这一区分，不能笼统写成“所有旧结果均已验证”。

## 6. 表述边界

“解决集合交互计分”过强。证据只支持：**在最后四层、固定 curvature bundle 与缓存任务目标的设置中，集合条件评估把四个 bundle 转化为单调训练收益，并得到同方向的 held-out 任务 loss；它缓解了 V12 暴露的主要交互计分缺口。** 这不等价于全模型、跨域或通用 PTQ 上的解决。

摘要应尽早说明这是诊断性失败而非部署成功。正控制的 $n=7$ 限制、旧 replay-only 证据的影响边界、以及不存在同设置 QTIP/GSQ 排名，都应在正文保留。

## 7. 下一版建议

只建议一个方法性后续：把条件接受改成**词典序、跨域约束的离散坐标裁决**。候选提出仍固定；选择时先要求独立的 text-train 保持损失不回退或受严格预算约束，再在可行候选中最大化 task-train 条件增益。Task/text validation 与 candidate-unexposed audit 必须保持完全不可见，不能把 validation 当约束数据。若 4096$\times$4096 文本代价无法在不近似失真的前提下有效实现，应先完成计算合同与 parity 设计，而不是启动调参实验。

若这一最小约束方法仍不能形成通过 validation/audit 的硬端点，应停止把 assignment refinement 作为通用 PTQ 主路线，并明确定位为任务适应机制。

## 8. 分项评分

| 维度 | 分数 | 说明 |
|---|---:|---|
| 写作 | 7.5 | 主线清晰、负结果诚实；个别“解决/修复”表述原先过强 |
| 创新 | 5.5 | 条件集合裁决合理，但与贪心坐标下降接近 |
| 实验 | 5.0 | 协议严谨，但单模型/四层且无部署端点与正式 benchmark |
| 理论 | 4.5 | 有交叉项解释，无保持条件或理论保证 |
| 可复现 | 8.0 | 正式 JSON、parity、资源和终态合同充分 |
| 总体 | 5.0 | Borderline reject；机制诊断有价值，投稿主结果仍不足 |
