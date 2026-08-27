# OpenPrism Office 交付架构

日期：2026-08-27

## 决策

办公材料交付是正式 `/projects` React 工作台的一等能力，不复活 Legacy 静态原型。正式界面使用“收件 → 处理 → 审阅 → 审批 → 交付 → 度量”六阶段账本，把原生 Office 材料、检索证据、协同审阅、人工审批、参赛导出与效果记录接到同一项目链路。既有编辑、AI、Skills、论文 RAG、Diff、Pipeline、编译和规则审核继续复用，不复制第二套编辑器。

## 数据流

```text
React OfficeDeliveryPanel
  ├─ 旧交付合同：GET/PUT/AUDIT/EXPORT /api/projects/:id/office-track
  └─ V2 工作台：/api/projects/:id/office-track/*
       ├─ workspace + inbox/import
       ├─ artifacts/plan + artifacts/run
       ├─ connectors + recipes + runs + transitions
       ├─ review comments/suggestions + approval events
       ├─ search + evidence/graph + meetings/import
       └─ metrics
                      │
                      ▼
Fastify officeTrack + officeWorkspace routes
  ├─ managed project identity + global authentication hooks
  ├─ relative-path / enum / size / transition validation
  ├─ officeArtifactService
  │    ├─ built-in DOCX/PPTX/XLSX OOXML extraction
  │    ├─ built-in extracted-text diff
  │    └─ optional OfficeCLI/Docling/MarkItDown/PaddleOCR probes
  ├─ officeIntelligenceService
  │    ├─ BM25 + hashed token/character-ngram vector + reranker
  │    ├─ support/conflict/missing evidence graph
  │    └─ timestamped transcript decisions/actions
  ├─ officeWorkflowService
  │    └─ connectors, recipes, run state, review provenance, approvals, telemetry
  ├─ officeWorkspaceService
  │    └─ inbox/search/graph/meeting history
  └─ officeTrackService
       └─ brief/rule audit + submission/* + SHA-256 manifest
```

## 项目内状态

| 文件 | 作用 |
| --- | --- |
| `.openprism/office-track.json` | Brief、参赛材料、效果、复用资产、审核与导出状态 |
| `.openprism/office-workspace.json` | 收件箱、检索记录、证据图、会议材料 |
| `.openprism/office-workflow.json` | 连接器声明、配方、运行时间线、评论、建议、审批、遥测 |
| `submission/` | 用户明确确认后生成的参赛交付件与哈希清单 |

三个状态文件均限制在受管项目内并通过临时文件 + rename 原子写入。接口返回项目相对路径，不向浏览器暴露服务器绝对路径。

## Office 适配器边界

- 无外部工具时，应用直接读取 OOXML ZIP 中的 Word 段落/表格、PowerPoint 页面与 Excel 工作表；不执行宏，也不声称保留完整排版语义。
- `OFFICECLI_PATH` 必须是绝对、可执行文件。子进程使用固定 argv、`shell: false`、超时与 `OFFICECLI_SKIP_UPDATE=1`；路径均先由 managed project + `safeJoin` 解析。
- 对齐已验证的 OfficeCLI v1.0.145 命令：`dump`、`create`、`batch`、`merge`、`view`、`validate`。上游没有 `diff`，本应用只比较两份文件的本地抽取文本。
- `DOCLING_PATH`、`MARKITDOWN_PATH`、`PADDLEOCR_PATH` 目前是显式能力探测边界。缺失时返回 unavailable；不能把探测成功等同于所有外部连接器已完成业务执行。
- PDF 若没有已配置解析器，保持 blocked 并给出恢复动作；扫描件不伪造 OCR 成功。

## 检索、证据与会议边界

- V2 检索使用真实 BM25、128 维确定性哈希特征余弦和词覆盖/邻近度 reranker，并逐项返回分数。它不是学习型 embedding，不做模型理解能力承诺。
- 证据图只在项目已导入 chunk 上建立 `support`、`conflict`、`missing` 边；冲突优先于支持，缺失引用不会被模型补造。中英文否定只与共享动作词的局部上下文绑定，避免一段中的无关否定污染其他主张。
- 会议入口只接受用户提供的逐字稿/带时间戳文本。系统保留输入已有 speaker 标签并提取候选决定、待办和时间证据；`speakerDiarization` 固定为 `not-claimed`。

## 工作流与人工责任

- 配方必须包含 review 与 approve；状态仅允许 `triggered → processing → review → approved/rejected → published/failed` 的合法边。
- 评论、回复、建议采纳/拒绝与审批事件只能在 `review` 状态写入。进入 approved/published 需要真实 human approval event。
- local-folder、webhook、Feishu Drive/IM/Approval、email 连接器会校验参数与配置状态。V2 仅记录本地工作流发布状态；参赛文件仍在“交付”阶段人工确认后由既有导出器写入 `submission/`。
- AI、人工与数据 provenance 分开保存；状态成功不等于内容正确或外部平台投递成功。

## 效率与参赛证据

- 遥测同时记录 baseline、AI、review、retry、setup、maintenance、样本/文档量、采纳拒绝、质量、角色、频率和版本。
- 缺少真实基线、AI/复核时间或样本量时只返回 `insufficient`。净节省会扣除复核、重试、配置和维护，不用演示默认值制造提效。
- 规则审核是准备建议，不调用模型作晋级、取消资格或获奖裁决。真实录屏、用户反馈、落地周期与效果证明仍由参赛团队采集。

## 安全与验证

- 浏览器只传稳定 `projectId` 和项目相对路径；绝对路径、符号逃逸、NUL、越界尺寸和非法状态直接拒绝。
- 状态不保存模型凭据、服务器 Token 或主机路径。外部 URL 必须是公网 HTTPS；密钥只从服务器环境读取。
- 新增服务与路由测试覆盖适配器映射、OOXML 抽取、中文证据、状态门禁、持久化和失败态；Chromium E2E 覆盖六阶段桌面与 390×844 手机流程。

## 不做的承诺

- 不宣称内置神经 embedding、自动转写、自动说话人分离或通用 Office 版式无损编辑。
- 不宣称 Feishu/email/webhook 在未配置或没有执行适配器时已经投递。
- 不用样例数据生成“真实提效”“真实落地”或官方评分结论。
