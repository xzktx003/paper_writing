# Paper RAG 契约

日期：2026-07-22

## 用户语义

RAG 采用单一的自动索引模型：新增、上传或删除资料后，后端立即重建当前项目索引。前端不得在资料已显示为 indexed 后再要求用户执行一遍含义不明的手动索引。

## HTTP 契约

- `POST /api/projects/:id/rag/index`：显式重建索引，返回 `documents`、`chunks`、`indexedAt`、`generation`、`fingerprint` 和 `retrieval`。该接口用于恢复、诊断和自动化，不作为普通上传后的必点步骤。
- `GET /api/projects/:id/rag/health`：只读返回 `healthy/degraded/corrupt/rebuilding`、检索模式、索引代次、语料指纹、文件/分块统计、逐文件解析诊断和 issues。该 GET 不创建、隔离或重建索引。
- `GET /api/projects/:id/rag/search?q=...&limit=...`：返回结构化证据结果；空查询返回 400，limit 被限制在安全范围内。
- `GET /api/projects/:id/rag/external-search?...`：同时返回 `results` 和逐来源 `sources`。每个来源必须报告 `ok/empty/error`、`latencyMs`、`count` 和脱敏错误码，不能把超时、限流或 HTTP 失败静默折叠成“无结果”。
- 所有路由只通过 managed `projectId` 和 Project Locator 解析项目根目录。

## 文件可见性

- `.openprism`：RAG 索引运行数据，普通文件树隐藏。
- `.compile`：编译运行数据，普通文件树隐藏。
- `research_corpus`：由 RAG 面板管理的证据资料目录，普通论文源码树隐藏。

隐藏不等于删除。资料仍保存在项目根目录内，可备份、迁移，并通过 RAG API 管理。

## 索引可靠性

- 同一项目的索引重建必须串行执行，避免并发重建互相覆盖。
- `paper-rag-index.json` 必须通过同目录临时文件和原子 rename 替换；替换失败时旧索引保持可读，临时文件必须清理。
- 索引 JSON 无法解析或缺少 `documents` / `chunks` 基本结构时，后端将旧文件隔离为 `paper-rag-index.json.corrupt-*`，再从当前 corpus 自动重建。
- 搜索和资料列表只能读取旧的完整版本或新的完整版本，不得观察到半写 JSON。
- 损坏隔离文件用于诊断，不进入普通论文文件树，也不作为检索输入。

## 检索与健康语义

- 当前内置检索固定声明为 `local-keyword-overlap`，属于本地关键词/词项重叠证据检索，`semantic = false`；不得在 UI 或文档中称为语义向量检索。
- 每次成功重建生成新的 `generation` UUID，用于区分索引代次；语料与分块内容不变时，SHA-256 `fingerprint` 必须保持稳定。
- `healthy` 只用于存在可搜索 chunks、没有失败文件、没有零 chunk 文件且索引元数据完整的状态；空库、旧索引元数据不完整、解析失败或零 chunk 文件均为 `degraded`。
- health 的逐文件诊断至少包含 path、kind、parser、parseStatus、bytes、chars、chunks、warnings 和 error。
- health 读取损坏索引时返回 `corrupt`，但不修改原 JSON；需要恢复时由用户显式点击“修复 / 重建索引”，或由原有搜索/资料操作的自动恢复路径处理。

## 外部多源检索语义

- Semantic Scholar、arXiv、Crossref 和 OpenAlex 的原始分数不是同一量纲。结果保留 `native_score` / `native_score_basis`，但跨来源排序只使用各来源返回顺序生成的 `normalized_score`，`score_basis = source-query-rank`。
- 单个来源失败不阻止其他来源返回结果；UI 必须显示失败来源和错误码，使用户能区分“该库无匹配”与“该库不可用”。
- `native_score`、引用数和 normalized rank 仅用于检索候选排序，不是论文质量、真实性或可引用性的证明；用户仍需打开原始来源核对题名、作者、年份、DOI 和正文。

## 回归证据

- `apps/backend/src/routes/__tests__/paperRag.test.js`
- `tests/paperRag.test.mjs`
- `tests/paperRagPanelContract.test.mjs`
- `tests/e2e/rag-health.spec.ts`
- `tests/projectRoutes.test.mjs`（内部目录过滤）

其中 `tests/paperRag.test.mjs` 还覆盖损坏索引恢复、只读 health 不写文件、原子替换失败保留旧索引、并发新增资料不丢文档、generation 变化、fingerprint 稳定、失败/零 chunk 计数和外部来源部分失败；隔离 Playwright 会真实创建临时项目、打开 RAG 健康卡、验证重建 provenance，并在一个来源成功、一个来源失败时检查来源状态卡。

2026-07-22 当前复核：隔离 Playwright 的本地 RAG 添加、搜索、删除完整 UI 旅程已覆盖；测试 runner 默认串行以避免 RAG 重建与其他项目测试共享状态。当前检索 profile 仍是 `local-keyword-overlap`（`semantic: false`），文档和 UI 不得把它宣传为 embedding/语义向量检索。
