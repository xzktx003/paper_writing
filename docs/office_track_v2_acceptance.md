# OpenPrism Office V2 验收矩阵

本文档是办公赛道增强功能的实现与验收合同。功能只有同时满足“可执行能力、接口证据、前端入口、失败态、测试证据”五项，才视为完成。界面统一按“收件 → 处理 → 审阅 → 审批 → 交付 → 度量”闭环组织，不把能力拆成互不关联的演示页。

## A1 原生 Office 交付

- DOCX、XLSX、PPTX 在无外部工具时仍可完成本地 OOXML 结构与文本抽取。
- OfficeCLI 以可选、显式配置的外部适配器提供 inspect、create、edit、template merge、render、validate；命令使用 argv 执行且不经过 shell。由于上游没有 `diff` 命令，差异由应用内置的 OOXML 文本抽取后比较能力提供。
- 工具缺失、格式不支持、输入越界、路径越界必须返回可行动的失败原因，禁止伪造成功。
- 前端能查看工具能力、文件结构、解析来源、警告和交付操作状态。

## A2 多格式材料收件箱

- 支持 Office、PDF、TXT、Markdown、CSV、JSON 及带时间戳的会议文本；扫描件通过可选 OCR 适配器进入。
- 解析结果使用统一材料结构，包含 parser、provenance、quality、warnings、sections/chunks。
- Docling、MarkItDown、PaddleOCR 均以可探测适配器呈现，未配置时明确为 unavailable。
- 前端支持从项目相对路径导入，展示成功、部分成功和失败状态。

## A3 自动化配方与人工审批

- 配方可声明 local-folder、webhook、Feishu Drive、Feishu IM、Feishu Approval、email 连接器及其配置状态。
- 运行状态严格遵循 trigger → process → review → approved/rejected → published/failed；非法跳转必须拒绝。
- 未配置连接器不得显示已发布；发布必须保留人工审批事件。
- 前端可创建运行、推进合法步骤，并清楚区分自动处理与人工决策。

## A4 协同审阅与来源追踪

- 支持段落评论、回复、建议接受/拒绝、负责人、截止时间、AI/人工/数据来源。
- 每次审批与建议操作写入不可丢失的事件时间线，并保留语义差异摘要。
- 前端能在同一审阅视图查看讨论、建议、来源和审批状态。

## A5 效率实验证据

- 记录 baseline、AI、review、retry、setup、maintenance 时间，以及样本量、产出量、采纳/拒绝、质量、角色、频率和版本。
- 自动生成节省时间、净效率、采纳率、质量变化和样本充分性；数据不足时显示 insufficient，不形成虚假结论。
- 前端只根据真实记录生成对比结果，并能追溯原始样本。

## A6 混合检索与证据关系图

- 检索真实组合 BM25 与可解释向量余弦分数，并提供 rerank 与分数分解。
- 支持 chunk 查看/编辑数据模型与 precision、recall、MRR 等评估。
- 证据图支持 claim → support/conflict/missing/source，计算覆盖率并暴露冲突和缺口；不得生成不存在的引用。
- 前端能查看命中依据、证据关系、冲突与缺口，而不只显示总分。

## A7 会议材料接入

- 接受本地会议逐字稿和带时间戳文本，提取摘要、决策、行动项及对应时间证据。
- 可保留输入中已有 speaker 标签，但不得宣称自动说话人分离。
- 决策和行动项能进入文档生产/审阅链路，前端可定位回原始时间戳。

## 共同发布门槛

- 新增行为均有先红后绿的单元或路由测试。
- 前后端类型检查、生产构建、单元测试、集成测试、E2E 全部通过。
- 对统一操作台执行一轮桌面 + 手机截图验收；修复后最多一轮确认截图。
- 更新 `PRODUCT.md`、`README.md`、`README_ZH.md`、`docs/func_list.md`、架构说明及实验/idea 记录。
- 交付报告按 A1–A7 给出实现证据、测试证据、视觉证据和已知边界。
