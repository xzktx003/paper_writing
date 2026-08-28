# M01 作品方案文档

作品名称：OpenPrism Office  
申报赛道：办公场景  
参赛团队及负责人：提交前按报名平台信息填写（不得用“受控演示团队”代替真实报名信息）  
材料版本：2026-08-28 replacement-v3
作品定位：可核验的 AI 办公材料工作台  
当前材料状态：方案、165.791 秒 PPT+配音+逐句字幕讲解成片、73.76 秒原始连续录屏、19 张分步截图、技术评估和复用资产已完成；真实业务效果样本和落地记录仍需在实际试点后补充。

## 1. 要解决的问题

在项目申报书、技术方案、研究总结、评审说明、答辩稿等长文案办公任务中，写作难点通常不只是“把话写顺”，而是：

1. 资料来源分散，Word、PPT、Excel、会议纪要和文本记录需要反复人工翻找。
2. 关键主张缺少证据定位，评审、复核和后续答辩时难以说明“这个结论来自哪里”。
3. 同一份材料在多轮修改后容易出现数字口径不一致、旧结论残留、引用来源失效。
4. 通用 AI 聊天可以生成流畅文本，但很容易把未核验信息写成事实。
5. 提效材料经常只写“生成更快”，没有把人工复核、返工、配置和维护成本计入。
6. 好用的 Prompt、模板和 SOP 没有沉淀，换一个项目或同事后难以复用。

OpenPrism Office 的核心目标是把办公长文案从“聊天式生成”改造成“资料登记、证据检索、主张审查、人工审批、度量复算、材料导出”的可核验流程。

证据位：`evidence/E01-problem-and-baseline.md`，需补充真实原流程访谈、脱敏样例或任务记录。

## 2. 原流程

典型原流程如下：

1. 人工收集历史方案、通知文件、评审意见、会议纪要、表格数据和模板。
2. 人工阅读资料，复制关键段落或数字到临时笔记。
3. 在 Word 或 Markdown 中起草正文。
4. 反复查找来源，补页码、章节、截图或表格位置。
5. 负责人逐段复核事实、数字和表述。
6. 发现矛盾后回到源文件重新查证。
7. 另行整理演示稿、复用说明、效果说明和评委材料。

该流程的问题是检索、写作、复核和交付割裂。AI 即使能帮助起草，也很难保证每个主张都有来源，也很难自动形成比赛规则所需的材料完整性、证据等级、提效口径和风险说明。

证据位：`evidence/E01-problem-and-baseline.md`，当前为流程分析；实际耗时需用 `evidence/E05-effect-measurement.csv` 补齐。

## 3. 新流程

OpenPrism Office 在项目工作台中提供六阶段账本：

1. 收件：导入 DOCX、PPTX、XLSX、PDF、Markdown、TXT、CSV、JSON 等材料，记录来源、可读性、解析器和质量状态。
2. 处理：规划受控 Office 操作，执行本地配方，导入带时间戳的会议逐字稿。
3. 审阅：用混合检索查找证据，生成 claim 到 support、conflict、missing 的证据关系图，记录段落评论和采纳决定。
4. 审批：保留人工审批事件，AI 结果只有经过人工确认后才进入交付状态。
5. 交付：按比赛规则导出 M01-M06、评委说明、初赛评分表、决赛准备包和 SHA-256 manifest。
6. 度量：记录基线耗时、AI 操作耗时、人工复核、返工、配置、维护、样本量、周期和质量说明。

该流程不宣称自动完成外部投递，也不把本地 published 状态冒充为外部平台已接收。系统生成的是本地参赛交付包和审核建议，最终提交、评分、晋级或获奖结论均由人工和组委会决定。

证据位：

- `evidence/demo/office-demo-submission.mp4`：165.791 秒 1080p H.264/AAC 提交成片，内含 10 张 PPT 讲解页、6 段真实操作、中文配音、57 条逐句字幕和真实性边界；逐项说明系统输入、系统输出、典型人工做法与效率机制。
- `evidence/demo/office-demo-submission.srt`、`office-demo-submission-transcript.md`、`presentation-slides.json` 与 `slides/`：可编辑字幕、逐字稿、讲解页元数据和 10 张独立讲解页。
- `evidence/demo/office-demo.mp4` 和 `office-demo.webm`：73.76 秒未经跳剪的连续浏览器录屏，使用受控 DOCX 样例。
- `evidence/demo/coverage.json` 与 19 张分步截图：每一阶段至少覆盖输入、执行、结果或风险中的两个状态，并记录逐帧证明文本。
- `evidence/logs/officecli-verification.txt`：本次演示使用的 OfficeCLI 1.0.145 版本、SHA-256 与 `ok / validate` 结果。
- `evidence/workflow-state-samples/`：`.openprism/office-track.json`、`.openprism/office-workspace.json`、`.openprism/office-workflow.json` 的脱敏样例。
- `evidence/submission-manifest.json`：演示项目导出包哈希清单。

## 4. AI 介入点

OpenPrism Office 中 AI 或智能算法介入的位置是受控的：

| 介入点 | 具体作用 | 人工边界 |
| --- | --- | --- |
| Brief 约束 | 固定任务目标、读者、不可改变事实、审批人和敏感边界 | Brief 由用户填写和确认 |
| 材料理解 | 抽取 Office/文本材料中的段落、表格、幻灯片文本和来源元数据 | 不可读材料标记为 unavailable 或 partial |
| 混合检索 | BM25 + 128 维确定性哈希向量 + rerank，返回分数分解 | 向量是本地哈希特征，不宣称神经 embedding |
| 证据关系图 | 将主张标成 support、conflict 或 missing | 不为 missing 主张生成虚构来源 |
| 会议输入 | 从用户提供的带时间戳逐字稿提取摘要、决定、待办和时间证据 | 不宣称自动转写或说话人分离 |
| 草稿与审查 | 辅助生成办公文案、风险提示和评委说明 | 对外材料必须人工审批 |
| 效果复算 | 计算含复核、返工、配置和维护成本的净节省 | 没有样本时只写待补或测量计划 |

证据位：`evidence/E04-red-green-tests.md`，可放后端和前端测试输出。

## 5. 核心设计

### 5.1 证据优先，而不是生成优先

系统要求先登记材料和证据，再让 AI 起草或审查。每个关键结论都应绑定文件、页码/章节、时间戳、表格范围、代码符号或截图位置。缺少证据时，材料中写“待补充”“参赛方自述”或“尚待人工确认”，不把推断写成事实。

### 5.2 生成物与来源分离

参赛导出文件位于 `submission/`。系统禁止把固定的 `submission/M01-*.md` 等生成文件反向登记为来源，避免“生成物证明生成物”的自证循环。

### 5.3 安全可控的 Office 处理

内置 OOXML 抽取可读取 DOCX、PPTX、XLSX 的正文、表格和幻灯片文本。可选 OfficeCLI 适配器只接受绝对可执行路径，使用固定 argv、`shell: false`、超时和最小环境变量；本次受控演示已配置并真实返回 `ok / validate`，版本为 1.0.145；没有配置时仍返回 unavailable，不伪装成功。

### 5.4 人工审批门禁

AI 的结果是草稿、建议和风险提示，不是自动发布。系统记录评论、建议、采纳、驳回和审批事件，确保最终交付仍由人负责。

### 5.5 效果全成本口径

提效计算不只看模型生成时间，而是把 AI 操作、人工复核、返工重试、首次配置和维护更新全部计入。没有真实样本和周期时，材料只能写“测量计划”或“Demo 观察”。

## 6. 当前已实现能力

| 能力 | 当前实现边界 | 证据位 |
| --- | --- | --- |
| 办公模板项目 | `app/templates/office-track-writing/` 包含 Brief、来源登记、证据索引、效果 CSV、SOP、Skill、submission README | `evidence/E06-reuse-assets.md` |
| 交付状态 | `.openprism/office-track.json` 保存 Brief、材料、证据、效果、复用资产、决赛准备字段 | `evidence/workflow-state-samples/` |
| Workspace 留痕 | `.openprism/office-workspace.json` 保存 inbox、search、evidence graph、meeting | `evidence/workflow-state-samples/` |
| 工作流留痕 | `.openprism/office-workflow.json` 保存连接器、配方、运行、评论、建议、审批、遥测 | `evidence/workflow-state-samples/` |
| Office 收件箱 | 内置 DOCX/PPTX/XLSX OOXML 抽取，文本 diff；PDF 无适配器时显式提示 fallback | `evidence/E04-red-green-tests.md` |
| 原生 Office 操作 | 可选 OfficeCLI 支持 inspect/create/edit/template-merge/render/validate；未配置时阻断 | `evidence/E04-red-green-tests.md` |
| 混合检索 | BM25 + 哈希向量余弦 + rerank，返回 score breakdown | `evidence/E04-red-green-tests.md` |
| 证据图 | 支持 support/conflict/missing、coverage、冲突和缺口列表 | `evidence/E04-red-green-tests.md` |
| 会议输入 | 接受用户提供的 timestamp transcript，提取 summary、decisions、action items、timestamp evidence | `evidence/E04-red-green-tests.md` |
| 参赛导出 | 生成 M01-M06、评委说明、初赛/决赛准备文件和 manifest hash | `evidence/submission-manifest.json` |

## 7. 预期收益

在真实数据补齐前，本作品只能声明以下可观察收益，不声明固定提效比例：

1. 减少资料定位和证据回查的重复劳动。
2. 降低 AI 文案中无来源主张、数字口径不一致和材料自证循环的风险。
3. 将“起草、审查、审批、导出、度量”集中到同一项目账本，减少跨工具整理成本。
4. 让评委能直接看到材料完整性、证据等级、风险提醒和评分依据。
5. 通过模板、SOP、Skill 和检查表提升复用可能性。

真实提效幅度需由 `evidence/E05-effect-measurement.csv` 按同类任务、相同质量要求、样本量、统计周期和全成本口径补充。

## 8. 边界与风险

1. 不内置自动音频转写，不宣称自动说话人分离。
2. 本地哈希向量不是学习型 embedding，不应宣传成大模型语义向量库。
3. 未配置 OfficeCLI、Docling、MarkItDown、OCR 等外部工具时，部分二进制材料处理会返回 unavailable。
4. 没有真实用户、使用周期和业务产出记录时，不能写“已全面落地”。
5. 没有效果样本时，不能写确定性提效百分比。
6. 对外提交前必须脱敏，移除 Token、账号、内部地址、客户信息和未授权截图。
7. 系统建议分只是参赛准备建议，不代表组委会或人工评委评分。

## 9. 提交前待补

| 待补项 | 必要性 | 建议证据路径 |
| --- | --- | --- |
| 真实业务效果测量 | 强烈建议，影响提效成效高分档 | `evidence/E05-effect-measurement.csv` |
| 脱敏输入与输出样例 | 支撑场景和实操真实性 | `evidence/E08-sanitized-samples/` |
| 人工审批记录 | 支撑安全边界和质量控制 | `evidence/E09-approval-log.md` |
| 复用演练记录 | 支撑可推广性 | `evidence/E10-reuse-dry-run.md` |
| 决赛问答材料 | 决赛附加分准备 | `evidence/E11-finals-qna.md` |
