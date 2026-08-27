# M06 标准化资产清单

作品名称：OpenPrism Office  
资产用途：支撑办公材料工作流复用、培训、审核和提交。  
当前状态：系统模板和主材料已形成；真实复用演练、培训记录和业务样例仍需补充。

## 1. 资产总览

| 编号 | 资产 | 位置 | 类型 | 状态 | 用途 |
| --- | --- | --- | --- | --- | --- |
| A01 | 办公写作交付模板 | `app/templates/office-track-writing/` | template | 已存在 | 初始化办公材料项目结构 |
| A02 | Brief 模板 | `app/templates/office-track-writing/brief.md` | template | 已存在 | 固定任务、读者、边界和审批 |
| A03 | 来源登记表 | `app/templates/office-track-writing/sources/register.md` | checklist | 已存在 | 登记来源、权限、可读性和版本 |
| A04 | 证据索引模板 | `app/templates/office-track-writing/evidence/index.md` | checklist | 已存在 | 绑定 claim、来源位置、证据等级 |
| A05 | 效果测量表 | `app/templates/office-track-writing/metrics/effect.csv` | dataset | 已存在 | 记录全成本提效数据 |
| A06 | 复用 SOP | `app/templates/office-track-writing/reuse/SOP.md` | sop | 已存在 | 指导跨项目部署与复用 |
| A07 | Skill 草案 | `app/templates/office-track-writing/reuse/Skill.md` | prompt/workflow | 已存在 | 沉淀提示词、约束和步骤 |
| A08 | 提交说明 | `app/templates/office-track-writing/submission/README.md` | readme | 已存在 | 说明导出材料和待补项 |
| A09 | 参赛主文档包 | `docs/competition/submission_90plus/` | documentation | 本次新增 | 形成可提交中文材料口径 |
| A10 | 自动导出器 | `app/apps/backend/src/services/officeTrackService.js` | workflow | 已实现 | 生成 submission 文件和 manifest |
| A11 | Office 材料服务 | `app/apps/backend/src/services/officeArtifactService.js` | adapter | 已实现 | 抽取 DOCX/PPTX/XLSX/文本，受控 OfficeCLI 操作 |
| A12 | 智能证据服务 | `app/apps/backend/src/services/officeIntelligenceService.js` | retrieval/graph | 已实现 | 混合检索、证据图、会议输入 |
| A13 | Workspace 留痕服务 | `app/apps/backend/src/services/officeWorkspaceService.js` | state | 已实现 | 保存 inbox/search/graph/meeting |
| A14 | 工作流服务 | `app/apps/backend/src/services/officeWorkflowService.js` | workflow | 已实现 | 保存配方、运行、评论、审批、遥测 |

证据位：`evidence/E06-reuse-assets.md`。

## 2. 面向普通用户的资产

### 2.1 Brief 模板

让用户在写作前明确：

- 文案类型和目标读者。
- 真实业务问题。
- 原流程和痛点。
- 不可改变的事实、数字和语气。
- 敏感信息边界。
- 人工审批人。

复用价值：避免 AI 在目标不清、证据不足或责任不明的情况下直接生成对外材料。

### 2.2 来源登记表

记录每份输入材料：

- 文件名和项目相对路径。
- 材料类型。
- 来源负责人。
- 是否可用于正式材料。
- 是否已脱敏。
- 可读状态和备注。

复用价值：让后续检索、审查和导出都能回到真实来源。

### 2.3 证据索引模板

每条证据至少记录：

- 支持的主张。
- 来源文件。
- 页码、章节、时间戳、表格范围或代码符号。
- 证据等级 E0-E3。
- 核验状态。

复用价值：把“这句话有没有来源”变成可检查的表格，而不是靠记忆。

### 2.4 效果测量表

记录字段包括：

- `baselineMinutes`
- `aiMinutes`
- `reviewMinutes`
- `retryMinutes`
- `setupMinutes`
- `maintenanceMinutes`
- `sampleSize`
- `measurementStatus`
- `qualityNotes`

复用价值：防止只比较“模型生成时间”和“人工总时间”，保证提效口径更可信。

## 3. 面向管理员和维护者的资产

### 3.1 复用 SOP

SOP 说明：

1. 首次部署流程。
2. 复用到新场景时哪些内容必须重填。
3. 培训建议。
4. 维护边界。
5. 风险控制。

### 3.2 Skill 草案

Skill 草案用于沉淀办公材料写作规则，例如：

- 先列证据缺口，再起草。
- 没有证据时标记待补。
- 不把建议分写成官方评分。
- 不绕过人工审批。
- 不复用旧项目数据证明新结论。

### 3.3 参赛主文档包

本目录下的 M01、M03、M04、M06、reviewer-guide、initial-score-guide、finals-pack 可作为比赛提交文本材料的主文档基础。参赛方需要根据真实录屏、效果数据和落地记录更新待补证据位。

## 4. 自动化和代码资产

| 服务 | 能力 | 验证方式 |
| --- | --- | --- |
| `officeTrackService` | 状态清洗、规则审核、建议分、导出、manifest | `officeTrackService.test.js` |
| `officeArtifactService` | DOCX/PPTX/XLSX/文本抽取、PDF fallback、OfficeCLI 规划执行、diff | `officeArtifactService.test.js` |
| `officeIntelligenceService` | BM25 + 哈希向量检索、rerank、评估、证据图、会议输入 | `officeIntelligenceService.test.js` |
| `officeWorkspaceService` | 项目内 inbox/search/graph/meeting 原子持久化 | `officeWorkspaceService.test.js` |
| `officeWorkflowService` | 连接器、配方、运行状态、评论、建议、审批、遥测 | `officeWorkflowService.test.js` |

证据位：`evidence/E04-red-green-tests.md`，可粘贴相关测试命令和通过结果。

## 5. 可复现检查表

复用者拿到资产后，应能完成：

1. 新建办公材料项目。
2. 填写 Brief。
3. 登记至少 2 份来源材料。
4. 导入一份 Office 或文本材料并看到可读状态。
5. 运行一次证据检索，查看 BM25、vector、rerank 分数。
6. 为 3 条主张生成 support/conflict/missing 关系。
7. 导入一段带时间戳会议逐字稿。
8. 记录一次人工审批。
9. 填写一组效果测量字段。
10. 导出 submission 包并检查 manifest。

上述检查应作为 `evidence/E10-reuse-dry-run.md` 的复用演练记录。未完成前，不应宣称普通用户已经独立复现。

## 6. 维护计划

| 维护项 | 触发条件 | 负责人建议 |
| --- | --- | --- |
| 比赛规则更新 | 评分细则、必交材料或证据等级变化 | 参赛材料负责人 |
| 模板更新 | 新增文案类型或发现模板缺口 | 产品/业务负责人 |
| 适配器更新 | OfficeCLI、Docling、MarkItDown、OCR 版本变化 | 技术维护者 |
| 安全规则更新 | 出现新的敏感信息类型或合规要求 | 安全/数据负责人 |
| 效果口径更新 | 统计周期、样本设计或质量指标变化 | 业务负责人 |

## 7. 待补证据

| 待补项 | 说明 | 路径 |
| --- | --- | --- |
| 模板截图或目录清单 | 证明资产真实存在 | `evidence/E06-reuse-assets.md` |
| 复用演练记录 | 证明他人可照着复现 | `evidence/E10-reuse-dry-run.md` |
| 培训反馈 | 支撑学习成本 | `evidence/E12-training-record.md` |
| 维护责任确认 | 支撑长期推广 | `evidence/E15-maintenance-owner.md` |
