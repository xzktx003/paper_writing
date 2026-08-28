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
