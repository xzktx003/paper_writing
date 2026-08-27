# 决赛准备包

说明：本文件用于决赛阶段准备演示、问答、落地推进和 AI 优化材料。当前没有真实现场问答、持续使用记录或官方评分，因此相关栏目保持待补。

## 1. 决赛 3 分钟演示主线

建议演示主题：从一组脱敏办公资料到可核验提交包。

| 时间 | 画面 | 评委应看到的能力 | 证据 |
| --- | --- | --- | --- |
| 00:00-00:20 | 打开项目和交付面板 | 正式工作台入口，不是静态原型 | `evidence/demo/office-demo.webm` |
| 00:20-00:45 | 导入 DOCX/PPTX/XLSX 或文本材料 | 收件箱解析、来源路径、可读性、parser | `evidence/workflow-state-samples/` |
| 00:45-01:10 | 输入一条查询 | BM25、hashed-vector、rerank 分数分解 | `evidence/E04-red-green-tests.md` |
| 01:10-01:35 | 生成证据图 | support、conflict、missing 和 coverage | `evidence/E04-red-green-tests.md` |
| 01:35-01:55 | 导入会议逐字稿 | timestamp evidence、decision、action item | `evidence/demo/office-demo.webm` |
| 01:55-02:20 | 查看评论/建议/审批 | AI 建议不直接发布，人工确认后采纳 | `evidence/E09-approval-log.md` |
| 02:20-02:45 | 填写效果字段 | 全成本口径，不虚构提效比例 | `evidence/E05-effect-measurement.csv` |
| 02:45-03:00 | 导出 submission 和 manifest | 交付包完整、文件 hash 可核验 | `evidence/submission-manifest.json` |

演示要求：

- 使用脱敏材料。
- 不展示 Token、账号、内部地址或客户信息。
- 不把 Demo 数据说成真实平均效果。
- 若 OfficeCLI 或 OCR 未配置，应展示 unavailable/fallback，而不是跳过。

## 2. 决赛附加分准备

| 项目 | 满分 | 当前状态 | 需要补齐 |
| --- | ---: | --- | --- |
| 真实落地度 | 5 | 待补 | 使用周期、真实岗位、使用次数、业务产出、反馈 |
| 问题应答成熟度 | 5 | 待现场评分 | 现场问答卡、边界说明、证据定位 |
| 后续落地推进规划 | 5 | 草案已具备 | 责任人、里程碑、资源、成本、风险、衡量指标 |
| AI 适配与优化能力 | 5 | 技术证据较强，真实迭代记录待补 | Prompt/Skill 版本、评估样本、迭代原因和结果 |

## 3. 可能问答卡

### Q1：你们如何证明不是普通 AI 写作？

回答要点：

- 普通 AI 写作侧重生成文本；本作品把来源登记、证据检索、证据图、人工审批、效果复算和导出纳入同一流程。
- 系统能显示每条检索结果的 BM25、hashed-vector、rerank 分数，并把主张标记为 support、conflict 或 missing。
- 没有证据时不会生成虚构来源，材料中保留待补或参赛方自述。

证据：`officeIntelligenceService.test.js`、`evidence/E04-red-green-tests.md`。

### Q2：如何防止 AI 幻觉进入正式材料？

回答要点：

- Brief 固定不可改变事实和审批边界。
- Evidence Index 要求关键结论绑定来源位置。
- Evidence graph 暴露缺失和冲突。
- 评论、建议和审批事件记录采纳过程。
- human approval required 默认开启。

证据：`officeTrackService.test.js`、`officeWorkflowService.test.js`、`evidence/E09-approval-log.md`。

### Q3：提效数据怎么计算？

回答要点：

- 不只计算 AI 生成时间。
- 公式为：净节省 = 人工基线 - (AI 操作 + 人工复核 + 返工 + 配置 + 维护)。
- 样本量、统计周期、任务频率、覆盖人数和质量说明必须记录。
- 没有真实样本时只写测量计划或 Demo 观察，不写固定比例。

证据：`evidence/E05-effect-measurement.csv`。

### Q4：如何复用到其他岗位？

回答要点：

- 可复制模板、SOP、Skill、效果表和导出流程。
- 必须重填 Brief、来源、证据、效果和审批记录。
- 不复制旧项目结论和旧数据。
- 初次培训建议 45-80 分钟，真实学习成本需记录。

证据：`M03-reuse-statement.md`、`M06-reuse-assets.md`、`evidence/E10-reuse-dry-run.md`。

### Q5：OfficeCLI、PDF、OCR 不可用怎么办？

回答要点：

- 内置 OOXML 可以抽取 DOCX/PPTX/XLSX 和文本。
- 外部适配器都需要显式配置绝对路径。
- 未配置时返回 unavailable 或 fallback，不伪装成功。
- PDF/扫描件需要 Docling、MarkItDown、PaddleOCR 或人工导入文本证据。

证据：`officeArtifactService.test.js`。

### Q6：会议能力是不是自动转写？

回答要点：

- 不是。
- 当前只接受用户提供的带时间戳逐字稿。
- 保留输入中已有 speaker 标签，但不宣称自动说话人分离。
- 输出 summary、decisions、action items 和 timestamp evidence。

证据：`officeIntelligenceService.test.js`。

## 4. 后续落地推进规划

| 阶段 | 目标 | 产出 | 衡量指标 |
| --- | --- | --- | --- |
| 第 1 阶段：脱敏 Demo | 跑通完整链路 | 录屏、样例项目、manifest | 是否完成 M01-M06 导出 |
| 第 2 阶段：单岗位试点 | 选择一种同类文案测量效果 | 3 个以上样本、质量说明 | 净节省分钟、返工轮次、无证据主张数 |
| 第 3 阶段：复用演练 | 让非作者按 SOP 复现 | 培训记录、复用反馈 | 独立完成率、学习时间、问题清单 |
| 第 4 阶段：规则固化 | 固化模板和维护责任 | 更新模板、SOP、Skill | 模板版本、维护人、风险关闭率 |

当前不能写“已完成试点”；上述是后续推进计划。

## 5. AI 适配与优化记录模板

| 版本 | 改动 | 评估方法 | 结果 | 下一步 |
| --- | --- | --- | --- | --- |
| v0 | 普通写作/摘要 | 人工检查 | 待补 | 作为对照 |
| v1 | Brief + 证据索引 + 审批 | 单项目 Demo | 已完成 85.76 秒字幕成片、73.76 秒原始连续录屏和 19 张分步截图 | 技术链路基线 |
| v2 | BM25 + 哈希向量 + evidence graph | 单元测试和样例查询 | 已有测试支撑 | 补真实材料检索评估 |
| v3 | 全成本效果测量 + 参赛导出 | 导出 manifest 和效果表 | 技术导出已完成；真实样本待补 | 补真实样本和周期 |

证据路径：`evidence/E17-ai-optimization-log.md`。

## 6. 决赛待补材料

| 待补材料 | 必要性 | 路径 |
| --- | --- | --- |
| 真实业务使用记录 | 决赛落地度高分所需 | `evidence/E16-landing-record.md` |
| 真实落地记录 | 决赛真实落地度 | `evidence/E16-landing-record.md` |
| 问答卡现场记录 | 问题应答成熟度 | `evidence/E11-finals-qna.md` |
| 推广责任和成本确认 | 后续落地推进 | `evidence/E18-rollout-owner-and-cost.md` |
| AI 迭代评估 | AI 适配与优化 | `evidence/E17-ai-optimization-log.md` |

## 7. 决赛陈述建议

推荐陈述：

> OpenPrism Office 的价值不是让 AI 替人直接交付材料，而是把办公长文案中最容易出问题的来源、证据、审批、效果口径和复用资产放进同一条可核验流程。当前系统能力已通过代码和测试证明，真实提效和落地数据按样本持续补齐。

避免陈述：

- “我们已经取得官方高分。”
- “已经在企业大规模落地。”
- “自动转写会议并识别说话人。”
- “无需人工审批。”
- “效率提升比例已经稳定。”
