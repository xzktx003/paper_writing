# 评委评审说明

作品名称：OpenPrism Office  
申报赛道：办公场景  
团队及负责人：提交前按报名平台信息填写  
说明性质：本文件帮助评委快速理解作品、材料边界和证据位置；其中建议分为参赛准备度自评，不代表官方评分。

## 1. 一句话说明

OpenPrism Office 面向项目申报书、技术方案、研究总结、评审说明和答辩稿等办公长文案，把资料导入、证据定位、AI 草拟、冲突检查、人工审批、效果复算和参赛导出整合为一个可核验工作台。

## 2. 作者做了什么

作者基于现有本地项目工作台完成了办公赛道改造，重点不是单纯让 AI 写作，而是让 AI 生成内容能被来源、流程和人工责任约束：

1. 增加办公材料交付模板，包含 Brief、来源登记、证据索引、效果测量表、SOP、Skill 和 submission 说明。
2. 在正式 React 项目工作台中增加“交付”面板，按收件、处理、审阅、审批、交付、度量组织流程。
3. 增加办公材料状态、材料登记、证据等级、效果指标、复用资产、决赛准备字段。
4. 增加 DOCX、PPTX、XLSX 和文本材料的本地抽取能力，并为 PDF 和外部适配器不可用情况提供显式 fallback。
5. 增加受控 OfficeCLI 规划执行边界，使用固定 argv、`shell: false` 和最小环境变量。
6. 增加 BM25 + 哈希向量 + rerank 的本地混合检索，返回可解释分数分解。
7. 增加 claim 到 support、conflict、missing 的证据关系图。
8. 增加带时间戳会议逐字稿输入，提取摘要、决定、待办和时间证据。
9. 增加人工审批、评论、建议决策和工作流留痕。
10. 增加按比赛规则生成 M01-M06、初赛说明、决赛准备包和 manifest 的导出器。

## 3. 材料导航

| 编号 | 文件 | 评审用途 | 当前状态 |
| --- | --- | --- | --- |
| M01 | `M01-proposal.md` | 看作品方案、原流程、新流程、AI 介入点和边界 | 已完成；真实岗位材料仍可增强 |
| M02 | `evidence/demo/office-demo-submission.mp4`、`office-demo-submission.srt`、`slides/`、`office-demo.mp4`、`office-demo.webm`、`coverage.json` | 先看 165.791 秒 PPT+配音+逐句字幕成片，必要时回查 73.76 秒原始连续录屏与 19 张分步截图 | 已完成 10 张输入/人工流程/前后对照 PPT、6 段逐步实操、AAC 中文讲解、可编辑 SRT、逐字稿、封面、原始录屏和功能成功日志 |
| M03 | `M03-reuse-statement.md` | 看复用岗位、部署条件、学习成本和推广边界 | 已完成；独立用户复用待验证 |
| M04 | `M04-significance.md` | 看业务意义、质量控制意义和数字化价值 | 已完成 |
| M05 | `M05-effect-evidence.md`、`evidence/E05-effect-measurement.csv` | 看流程变化、受控评估和真实试点接口 | 受控证据已完成；业务样本待实际试点 |
| M06 | `M06-reuse-assets.md` | 看标准化资产、SOP、模板、代码和维护计划 | 已完成并有技术复用演练 |
| R01 | `reviewer-guide.md` | 快速评审说明 | 本文件 |
| R02 | `initial-score-guide.md` | 初赛四模块准备度建议 | 已写草案 |
| F01 | `finals-pack.md` | 决赛演示、问答、落地、推广和优化准备 | 已完成准备稿；真实落地和现场问答待发生 |

## 4. 证据位置索引

| 结论 | 建议证据位置 | 当前边界 |
| --- | --- | --- |
| 系统有办公模板资产 | `app/templates/office-track-writing/`；`M06-reuse-assets.md` | 代码和目录可证明 |
| 系统有交付状态与导出器 | `app/apps/backend/src/services/officeTrackService.js`；`officeTrackService.test.js` | 代码和测试可证明 |
| 系统有 Office 材料解析和受控 OfficeCLI 边界 | `officeArtifactService.js`；`officeArtifactService.test.js` | 代码和测试可证明；外部工具可用性取决于环境配置 |
| 系统有混合检索和证据图 | `officeIntelligenceService.js`；`officeIntelligenceService.test.js` | 代码和测试可证明；哈希向量不是学习型 embedding |
| 系统有会议逐字稿输入 | `officeIntelligenceService.js`；`officeIntelligenceService.test.js` | 只处理用户提供的 transcript，不做自动转写 |
| 系统有 workspace 和 workflow 留痕 | `officeWorkspaceService.js`、`officeWorkflowService.js` 及测试 | 代码和测试可证明 |
| 系统可以导出 submission 包和 manifest | `officeTrackService.js`；`evidence/submission-manifest.json` | 演示项目已真实导出；静态包另有根级 manifest |
| 真实提效幅度 | `evidence/E05-effect-measurement.csv` | 当前待补，不能写固定比例 |
| 真实用户、周期和业务产出 | `evidence/E16-landing-record.md` | 当前待补，不能写已全面落地 |

## 5. 四模块评审提示

### 5.1 提效成效

已有材料可以支持“流程上减少资料查找、证据整理、风险检查和交付组包成本”的定性判断，但不能支持确定性提效比例。建议评委重点核验：

- 3 分钟录屏是否真实展示完整链路。
- M05 是否提供基线、AI、人工复核、返工、配置、维护、样本量和周期。
- 前后任务目标和质量要求是否一致。
- 质量说明是否记录错误、返工和审批结果。

当前风险：缺真实效果表时，提效分只能按流程和 Demo 支撑判断，置信度应降低。

### 5.2 场景价值

场景价值较强，原因是办公长文案在项目申报、技术汇报、评审材料和会议纪要转报告中具有稳定需求，且证据、审批和口径一致性是高频痛点。建议评委核验真实材料是否来自实际工作任务，而不是单次概念演示。

### 5.3 方案创新性

作品创新点在于“证据化办公写作闭环”：

- 本地 Office/文本收件箱。
- 混合检索与分数解释。
- 主张级 support/conflict/missing 图。
- 人工审批工作流。
- 比赛规则导出和建议分。
- 全成本提效测量。

该能力超过普通问答、摘要或改写。但若演示只展示单次文本生成，创新性证据会被削弱。

### 5.4 可推广性

可推广性基础较好，因为已有模板、SOP、Skill、效果表、导出材料和测试。建议评委核验：

- 普通目标用户能否按 SOP 独立完成一次脱敏项目。
- 部署是否说明外部适配器、模型、OCR、权限和维护成本。
- 是否有复用演练或培训记录。

## 6. 材料处理提醒

提交前必须人工检查：

1. 是否包含绝对路径、主机名、端口、内部地址。
2. 是否包含 Token、API Key、账号、私钥。
3. 是否包含个人信息、客户信息、合同、报价、财务或业务敏感截图。
4. 是否把系统建议分写成官方成绩。
5. 是否把待补证据写成已经验证。
6. 是否把单次 Demo 写成长期落地。

当前主文档已避免虚构企业试点、用户数、效率比例和官方评分。

## 7. 建议追问

1. 请现场展示从导入材料到导出 submission 的完整链路，指出 manifest 如何证明文件版本。
2. 请解释某一条关键结论如何通过 evidence graph 找到 support、conflict 或 missing。
3. 请说明没有真实效果样本时，系统如何避免编造提效比例。
4. 请说明 OfficeCLI 未配置或 PDF 无法解析时系统如何 fail closed。
5. 请说明复用到另一个部门时哪些字段必须重新填写，哪些资产可以复制。
6. 请说明人工审批记录如何防止 AI 草稿直接对外发布。
7. 请说明决赛阶段如何补真实落地记录、用户反馈和优化迭代。

## 8. 评审结论建议

在真实演示、效果表和落地记录补齐前，本作品可以作为“办公赛道高竞争力候选材料草案”提交内部预审，但不宜在正式材料中写：

- “已稳定提升 xx%”
- “已覆盖 xx 用户”
- “已在企业全面落地”
- “AI 初审/官方评分 xx 分”
- “无需人工复核”

更合适的表述是：系统已形成证据化办公材料工作流和可复用交付包；真实提效、用户覆盖和落地周期按待补证据持续补齐。
