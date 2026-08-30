# 论文版本上传记录

本文档是论文版本、实验证据与可执行代码之间的发布索引。每个新版本必须在论文仓库和算法仓库各形成一次可追溯的上传。

## 上传边界

- 论文仓库：`xzktx003/paper_writing`，保存论文、LaTeX 分节、审稿与修订记录、实验报告和方法调研文档。
- 算法仓库：`xzktx003/GSQ`，保存算法源码、启动脚本、测试和紧凑结果 JSON。
- 排除项：checkpoint、模型权重、token cache、数据集与大型运行日志。

## V8（2026-08-28）

- 论文主题：同一 2-bit block-scaled VQ 中，连续 group scale 与局部离散 assignment 是两种任务适应坐标。
- 关键实验：Llama-3.1-8B-Instruct 的 matched task group-scale 基线，与 assignment-only 在任务收益、PPL 漂移与部署形态上对比。
- 论文仓库分支：`feat/office-track-writing-workbench`。
- 算法仓库分支：`paper-v8-coordinate-adaptation`。
- 论文提交：`06575cc725209845197182a3ad9d1fb48c4668a8`。
- 算法提交：`ed2224b76b62d3affe3fbf43f1c3974977c6bd68`。
- 验证：71 项相关 pytest 用例通过；Python 语法、shell 语法、JSON 及 Git whitespace 检查通过；本机缺少 LaTeX 编译器，未生成 PDF。

## V9（2026-08-29）

- 论文主题：同步 soft scale 与 local assignment 会产生补偿—投影失配；连续与离散坐标应通过真实 hard checkpoint 交接。
- 关键实验：Llama-3.1-8B-Instruct naive joint 完整实验；joint 为 11.4098 PPL / 69.7434% Macro-6，被 scale-only 的 10.9448 / 71.7223% 严格支配；零-switch joint scale 的 validation Macro 为 70.9375%，定位 soft-mixture compensation。
- 论文仓库分支：`feat/office-track-writing-workbench`。
- 算法仓库分支：`paper-v9-soft-hard-mismatch`。
- 论文提交：`f66ddb93c79102a57dbc17b2cd15eb75c4feb324`。
- 算法提交：`06e6b46c7570562e9dc80eb80b1c18516ab9092f`。
- 版本标签：论文和算法仓库均为 `sage-vq-v9`，标签指向上述版本提交。
- 验证：正式 JSON completion/metrics/bpp/reconstruction、图像重生成与目检、绘图 Python 语法、LaTeX 输入与引用静态检查、Git whitespace 均通过；本机仍缺少 LaTeX 编译器，未生成 PDF。

## V10（2026-08-29）

- 论文主题：hard checkpoint handoff 能保护已审计 scale 状态，但当前一阶 8-way assignment proposal 无法形成可改善的硬集合；98.20% 逐向量负方向对应 0/8 个成功投影。
- 关键实验：Llama-3.1-8B-Instruct scale→assignment 正式完整实验；八个 changed projection 全部低于 scale validation，最终精确 no-op，正式结果保持 10.9448 PPL / 71.7223% Macro-6 / 2.1208 bpp。
- 论文仓库分支：`feat/office-track-writing-workbench`。
- 算法仓库分支：`paper-v10-hard-handoff`。
- 论文产物提交：`2b318ce78d664096369065ff188c83248fb5d087`。
- 算法提交：`85287e8dd8da4205374adc9afb3951c33bc10fef`。
- 版本标签：论文和算法仓库均为 `sage-vq-v10`；算法标签指向上述代码提交，论文标签包含产物提交及本发布索引。
- 验证：35 项聚焦 pytest 通过；Python compile、shell syntax、JSON contract、图像重生成与目检、Markdown/LaTeX 结构和 Git whitespace 均通过；本机无 LaTeX 引擎，未编译论文 PDF。

## V11（2026-08-30）

- 论文主题：四视图严格梯度共识把一阶候选率从 98.20% 筛到 48.71%，但八个真实 hard projection 仍全部失败；跨视图冲突真实存在，符号一致仍不是有限码字跳转的离散可信域。
- 关键实验：Meta-Llama-3.1-8B-Instruct 最后四层、完整固定校准协议、单张本地 GPU5；最佳 changed endpoint 相对 V10 提高 2.2656pp，但仍低于 scale source 2.4219pp，最终精确 no-op，沿用同一部署状态的 10.9448 PPL / 71.7223% Macro-6 / 2.1208 bpp。
- 论文仓库分支：`feat/office-track-writing-workbench`。
- 算法仓库分支：`paper-v11-gradient-consensus`。
- 论文产物提交：`6f89f9d07855f2f554f3dddde7dad7d2eae34a26`。
- 算法提交：`9555c86b5ed4f83df999a0da2de5c994f7351b1f`。
- 版本标签：论文和算法仓库均为 `sage-vq-v11`；算法标签指向上述代码提交，论文标签包含产物提交及本发布索引。
- 上传内容：V11 中文论文、LaTeX 主文件与七个分节/参考文献、独立 ICLR 风格评审、修订记录、正式实验报告、顶会叙事调研、Figure 1 及绘图脚本、实验/idea/功能/debug 台账；算法源码、两个单卡 launcher、聚焦测试和紧凑结果 JSON。未上传 checkpoint、模型权重、token cache 或完整运行日志。
- 验证：38 项聚焦 pytest 通过；Python compile、shell syntax、JSON parse、Markdown/LaTeX 输入与引用静态检查、图像重生成与目检、Git whitespace 均通过；本机无 LaTeX 引擎，未编译整篇论文 PDF。

## V12（2026-08-30）

- 论文主题：Scale-conditioned局部曲率能改善严格共识候选排序，却不能稳定超过聚合一阶，也不能授权任何优于冻结source的hard assignment集合；局部二阶信息不是端到端部署证书。
- 关键实验：Meta-Llama-3.1-8B-Instruct最后四层、28个Linear、三种ranking与四个matched-cardinality预算，共12个真实硬集合；本机物理GPU5单卡完成，未使用服务器14。曲率对strict consensus为4/4胜、对aggregate为2/4胜；最佳点仍低于source 5.4688pp Macro、balanced loss高18.313%，因此未访问候选audit、未写checkpoint、未启动完整训练或正式测试。
- 论文仓库分支：`feat/office-track-writing-workbench`。
- 算法仓库分支：`paper-v12-curvature-gate`。
- 论文产物提交：`53d863483ffcd9a2f37758b3e7f889031a344385`。
- 算法提交：`2c6f003c1b1b0dfea6547daa38564d566f86327c`。
- 版本标签：论文和算法仓库均为`sage-vq-v12`；算法标签指向上述代码提交，论文标签包含产物提交及本发布索引。
- 上传内容：V12中文论文、LaTeX主文件与六个分节/参考文献、独立ICLR风格评审、修订记录、正式实验报告、顶会叙事调研、PNG/PDF Figure 1、实验/idea/功能台账；算法probe、单卡launcher、输入二阶矩采集、聚焦测试、绘图脚本与紧凑结果JSON。未上传checkpoint、模型权重、token cache、数据集或完整运行日志。
- 验证：43项聚焦pytest通过；Python compile、ruff、shell syntax、JSON parse、Markdown/LaTeX结构、图像重生成与目检、Git whitespace均通过；本机无LaTeX引擎，未编译整篇论文PDF。

## V13（2026-08-30）

- 论文主题：把固定局部assignment bundle作为离散坐标，在已接受hard state下测量真实集合条件收益；当前四层设置中train与held-out任务loss改善，但text CE越过保护线，说明task-only条件收益不是跨域部署证书。
- 关键实验：Meta-Llama-3.1-8B-Instruct最后四层、28个Linear、每层七个固定curvature top-128 bundle；本机物理GPU7单卡完成，未使用服务器14。四层合计接受512个switch，train joint loss改善2.7288%、task validation balanced loss改善1.0919%，但text CE恶化0.9186%并触发预注册拒绝；audit、checkpoint、PPL和lm_eval均未启动。
- 论文仓库分支：`feat/office-track-writing-workbench`。
- 算法仓库分支：`paper-v13-set-conditional-gain`。
- 论文产物提交：`6051afc6c6dda73213bed79dbc8224ff2177cedd`。
- 算法提交：`0be0eab11a62f1c9ac2af7aebe0cfa22ceb11654`。
- 版本标签：论文和算法仓库均为`sage-vq-v13`；算法标签指向上述代码提交，论文标签包含产物提交及本发布索引。
- 上传内容：V13中文论文、LaTeX主文件与六个分节/参考文献、独立ICLR风格评审、修订记录、正式实验报告、顶会叙事调研、PNG/PDF Figure 1、实验/idea/功能/debug台账；算法因果集合条件probe、本地单卡launcher、causal-mask重放修复、batch-matched parity测试、绘图脚本、紧凑正式结果与基础设施失败摘要JSON。未上传checkpoint、模型权重、token cache、数据集或完整运行日志。
- 验证：56项聚焦pytest通过；Ruff、Python compile、shell syntax、JSON contract、LaTeX输入与引用静态检查、图像重生成与目检、Git whitespace均通过；本机无LaTeX引擎，未编译整篇论文PDF。
