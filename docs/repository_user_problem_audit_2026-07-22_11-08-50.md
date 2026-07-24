# paper_wrighting 当前仓库用户问题与改进审计

- 审计时间：2026-07-22 11:08:50（Asia/Shanghai）
- 审计对象：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting`
- 真实入口：`http://10.30.0.22:8787`
- 审计视角：首次使用者、论文作者、管理员、二次开发者、发布维护者
- 审计范围：只发现和分析问题；本轮不修改业务代码、不创建/删除正式论文、不调用真实付费模型
- 本轮仓库写入：仅新增本审计文档

本文将“证据”和“推断”分开。浏览器与 HTTP 结果是运行态证据；源码、配置和文档是静态证据；优化部分是基于证据提出的设计方向，不代表本轮已经实施。

## 1. 结论先行

当前 Paper Writer 已经具备较完整的产品骨架：项目管理、编辑器、Provider 选择、CLI Provider、Skills 面板、RAG 面板、评审和绘图入口均能在正式 LAN 页面中看到。但是，用户仍会遇到“看起来有功能、真正完成任务却没有可靠证明”的问题，主要集中在五个层面：

1. **仓库入口不唯一。** 根目录仍混入 Google 首页快照、Coding Kanban 文档、旧 Playwright 配置和旧测试；用户或 Claude 从仓库根目录开始，很容易运行错误产品、错误命令或错误测试。
2. **项目身份有三套名称。** 页面显示名、`project.json.id`、`papers/` 物理目录名可以完全不同；例如 `moe_prune` 页面显示名与 UUID 目录、`SNAP: ...` 显示名与 `moe_prune` 目录并存。当前实现能够找到项目，但普通用户仍会认为项目和文件夹“对不上”。
3. **Provider 的“可用”语义不够真实。** 设置页提供 OpenAI-compatible、Anthropic、Codex CLI、Claude Code CLI、GitHub Copilot CLI 五种选择；能力探针却只确认 CLI 可执行文件和版本，未确认登录、模型访问和实际调用权限。用户容易把“已安装”误认为“已登录且可用”。
4. **Skills 数量与可靠能力不是一回事。** 正式 `/api/skills` 返回 123 个 Skill，但本次实测 123/123 都是 `degraded`；大多数元数据来源是 `inferred`，运行历史仍然是按 Skill 名称覆盖的全局快照，不是当前项目/会话的可追溯历史。
5. **RAG 和文档编译存在产品边界误导。** RAG 面板明确写了“本地关键词证据检索，不是语义向量检索”，但当前项目中 11 个资料零分块、索引元数据不完整；编辑器快速预览对 `\nocite`、`\appendix`、`\onecolumn` 显示 unresolved command，且系统能力探针显示没有 TeX 引擎。用户可以编辑，却不能据此相信最终 PDF 可复现。

总体判断：**当前源码已经从“功能缺失”进入“状态可信度、边界一致性和发布卫生”阶段；如果不先统一这些语义，继续堆叠更多 Skills 或模型选项会增加复杂度，而不会同比提高论文产出可靠性。**

## 2. 本轮真实 Playwright / HTTP 验证

### 2.1 LAN 项目列表：可进入，但项目身份仍造成认知负担

使用 Chromium 1217，带正式服务器 Bearer Token，分别访问桌面 1440×900、手机 390×844、平板 768×1024：

| 视口 | HTTP | 结果 | 横向溢出 | page error / failed request |
| --- | ---: | --- | --- | --- |
| Desktop 1440×900 | 200 | 项目列表正常渲染 | 无 | 无 |
| Phone 390×844 | 200 | 项目列表正常渲染 | 无 | 无 |
| Tablet 768×1024 | 200 | 项目列表正常渲染 | 无 | 无 |

页面真实显示了“项目 ID”和“存储目录”两行信息。例如：

```text
名称：moe_prune
项目 ID：60f6c414-540d-48de-955c-d33efe580c60
存储目录：60f6c414-540d-48de-955c-d33efe580c60
```

仓库 `papers/` 下有 15 个一级目录，其中 12 个具有 `project.json`，另外还存在 `.pytest_cache`、测试临时目录等非项目目录。API 返回 12 个项目，页面一次显示 8 个并提示“显示 8 / 12 个项目”。

**证据：** Playwright 页面正文、`GET /api/projects`、`papers/*/project.json` 对比。

**推断：** 当前项目发现逻辑并非随机丢目录；最主要的用户困惑来自“显示名 / 稳定 ID / 物理目录名”三者并列，以及未管理目录与正式项目共享同一数据根。

### 2.2 创建项目：表单可以打开，但目录映射解释不足

Playwright 点击“+ 新建项目”可打开对话框，字段包括“项目名称、模板、取消、创建”，没有提交创建，未改变正式数据。

**问题：** 表单没有在用户输入名称时明确展示最终物理目录、稳定 ID 生成规则、是否会创建或移动目录。用户直到项目创建后才会在列表看到目录名，尤其对中文名、重名、重命名和导入项目容易产生“名称不一致”的误解。

**源码证据：** `app/apps/backend/src/services/projectLocator.js:53-71,206-217` 生成 `<slugified-display-name>--<short-project-id>`；`app/apps/frontend/src/app/ProjectPage.tsx:677-699,749` 同时展示名称、ID 和目录。

### 2.3 编辑器：核心工作区可用，但快速预览不能代表最终编译

Playwright 打开已有项目 `torq`（项目 ID `c2b87dfc-af29-42ef-b088-0f28aa9d65c3`）后，桌面和手机都能看到文件树、编辑器、AI 助手、RAG、评审和 PDF 相关入口，无 page error，无横向溢出。

快速预览实际显示：

```text
Approximation notice
unresolved command: \\nocite
unresolved command: \\appendix
unresolved command: \\onecolumn
```

同一项目文件树包含大量实验、缓存、日志、临时文件和多个 PDF；这对研究者有价值，但没有明显的“论文源文件 / 实验产物 / 系统文件”分层。

**能力证据：** `GET /api/capabilities` 报告 `document.tex = unavailable`，`pdflatex`、`xelatex`、`lualatex`、`latexmk`、`tectonic` 均未发现；Pandoc 可用。

**用户影响：** 快速近似预览能帮助编辑结构，但用户若没有看到明确的最终编译门禁，很容易把近似渲染当成可提交 PDF。

### 2.4 设置与 Provider：选项已经存在，真实性分层仍不足

Playwright 打开“设置”后实际看到五个 Provider：

- OpenAI-compatible API
- Anthropic API
- Codex CLI
- Claude Code CLI
- GitHub Copilot CLI

`GET /api/providers` 报告五者 `available: true`；但 `GET /api/capabilities` 的更细探针显示：

- Codex CLI：已安装，版本 `0.144.6`，`authStatus: not-checked`
- GitHub Copilot CLI：已安装，版本 `1.0.73`，`authStatus: not-checked`
- Claude Code CLI：当前正式进程中未找到固定 CLI 可执行文件
- HTTP Provider：只确认地址和凭据配置，未发起网络或模型请求

**结论：** 用户提出的“直接用 Codex 或 Copilot 完成任务”在界面层已经有入口，但“能选”不等于“已登录、能访问模型、能执行当前任务、能写入当前项目”。这些状态必须分开呈现。

### 2.5 RAG：面板能打开，但当前真实项目不可检索

Playwright 点击编辑器中的“🔎 RAG”，面板显示：

```text
RAG 索引健康状态：降级
本地关键词证据检索
使用透明的词项重叠检索，不是语义向量检索。
文件：11 · 已索引：0 · 失败：0 · 零分块：11 · 分块：64
索引元数据不完整，请重建以补充代次和指纹来源信息。
```

逐文件诊断中，PDF 和 10 个 TEX 文件均显示 `×`，且全部没有可检索分块。面板提供“刷新、修复 / 重建索引、上传、搜索”等操作，但当前用户必须自行推断为什么“分块总数为 64”同时“已索引为 0、零分块为 11”。

**源码证据：** `app/apps/backend/src/services/paperRagService.js:651-675,2029-2058` 是 token 重叠评分，不是 embedding/向量检索；`app/apps/frontend/src/app/components/PaperRagPanel.tsx:243-355` 将健康状态和诊断展示在面板中。

**推断：** 当前 RAG 更准确的产品定位是“本地字面证据检索”；在索引健康为 degraded 时，不应让 AI 助手静默把它当作完整上下文来源。

## 3. 按优先级汇总的问题

### P0：会直接破坏交付可信度

#### P0-1 正式发布必须把前端、后端、build ID、API schema 作为一个原子单元

本轮正式服务已经能返回 `authRequired: true`、build ID 和 `/api/ready`，说明当前进程与前端已完成一次有效对齐；但仓库此前曾出现前后端 build mismatch，且隔离测试专门增加了 readiness 和 build 校验。这说明发布流程对“旧进程 + 新静态资源”非常敏感。

**优化方向：** 发布目录使用不可变 build 目录；supervisor 只切换一个 release 指针；启动前后都校验 `/api/health`、`/api/ready`、前端 build meta 和 API schema；失败时回滚到完整上一版本，而不是只重启其中一端。

#### P0-2 鉴权边界必须覆盖所有业务面

当前正式探针已验证业务 API 的无 Token / 错误 Token / 正确 Token 三态，但仍应把健康探针、文件下载、图片、PDF、WebSocket、SSE、终端和旧 workbench 入口纳入同一发布验收。任何一条旁路都可能泄露论文内容或执行能力。

**优化方向：** 建立“公开健康接口白名单 + 其余默认拒绝”的路由合同；对每类资源做 401/403/200 回归；日志中记录拒绝原因但不记录 Token。

#### P0-3 数据根必须唯一且可见

当前 `/api/config` 已返回仓库内 `paper_wrighting/papers`，但数据根切换、旧目录迁移和非项目目录清理仍缺少面向用户的差异报告。正式服务曾经使用过另一套 `/data01/home/xuzk/papers`，这是“页面项目与仓库目录对不上”的直接来源。

**优化方向：** 启动时解析唯一权威数据根；在设置或诊断页显示脱敏路径、可写性、项目数和非项目目录数；切换数据根前只读比较 `project.json.id/name/directoryName`，禁止静默迁移。

### P1：当前用户会困惑、误判或丢失上下文

#### P1-1 项目显示名、稳定 ID、物理目录名没有形成清晰的身份模型

**证据：** `projectLocator.js:70-71` 生成带短 ID 的目录；项目列表同时显示名称、ID、目录；仓库中 `moe_prune` 的显示名为 `moe_prune` 但目录是完整 UUID，`SNAP: ...` 的显示名对应 `moe_prune` 目录。

**优化方向：** 创建对话框实时显示“显示名称 / 实际目录 / 稳定 ID”；重命名时明确“只改显示名”还是“移动物理目录”；提供复制实际路径和打开文件夹操作；列表支持按显示名、目录名、ID 搜索；导入时要求用户确认映射。

#### P1-2 RAG 的健康、覆盖率和召回质量没有形成可操作门禁

**证据：** 本轮实际项目为 11 个文档、0 个已索引、11 个零分块；检索实现是关键词重叠。

**优化方向：** 将 `ready/degraded/blocked` 与“可检索文档覆盖率、解析失败数、索引代次、语料指纹”绑定；低于阈值时禁用“将 RAG 结果注入 Prompt”或要求用户确认；为中文、LaTeX、PDF、表格各建立小型评测集，报告 Recall@k、引用准确率和空结果率；未来再增加 embedding/hybrid，而不是直接把关键词检索命名为语义 RAG。

#### P1-3 Provider 状态应拆分为 supported / installed / authenticated / model-accessible / writable-scope

**证据：** `/api/providers` 的 `available` 与 `/api/capabilities` 的 `authStatus: not-checked` 同时存在；Claude CLI 在设置选项中存在但正式探针报告未安装。

**优化方向：** 设置页为每个 Provider 显示独立状态灯和证据来源；“测试连接”必须标注是否实际调用模型、是否产生费用；CLI 使用非交互、超时、无副作用的 login/model probe；没有可靠 probe 时显示“未知”，不能显示绿色“可用”。

#### P1-4 Skills 123 个全部 degraded，且运行历史不是项目/会话级审计

**证据：** 正式 `GET /api/skills` 统计为 `degraded: 123`；首个 Skill 的 `metadataSource` 为 `inferred`，必需执行元数据为 `unverified`。`skillReadinessService.js` 的运行状态以 Skill 名称为主要 key，scope 虽已记录但不能阻止同名 Skill 在不同项目/会话间相互覆盖。

**优化方向：** 先定义 manifest schema，逐批补齐命令、凭据、网络、文件、输出、副作用、费用和超时；默认只推荐 ready Skill；degraded 必须显示具体阻断项；ledger 使用 `(skill, projectId, conversationId, providerConfigVersion)` 作为作用域，并保留有界 append-only 历史、结果产物和失败原因。

#### P1-5 会话存储绕过受管项目数据根

**证据：** `app/apps/backend/src/services/conversationStore.js:5,22-27` 将会话写入 `$HOME/.paper-writer/conversations/<projectId>`；`routes/conversations.js:19-39` 直接使用路由参数，没有调用 Project Locator 验证项目存在和身份。

**风险推断：** 项目导出/删除/迁移与会话、附件、RAG 选择可能不一致；同一 UUID 在不同数据根之间可能串数据；删除项目不必然删除会话隐私数据。路由参数和文件路径也应继续做边界回归验证。

**优化方向：** 会话放在项目受管状态目录或受管数据根的明确 namespace；所有读写先解析并验证项目身份；项目导出/删除定义会话和附件策略；迁移旧 `$HOME` 数据时提供一次性、可审计迁移工具。

#### P1-6 Skills 导入和测试执行有供应链与命令执行风险

**证据：** `skillEngine.js:539-575` 直接从 GitHub ref 下载 manifest、脚本和测试；`skillEngine.js:723-747` 使用 `execSync(command.join(' '))` 并将完整 `process.env` 传给测试脚本。

**风险推断：** 未固定 commit SHA、未记录内容哈希或签名，导入内容随后可执行；拼接命令且启用 shell，文件名特殊字符可能改变命令语义；第三方测试脚本可看到服务器环境中的 API/Token。

**优化方向：** 默认只允许固定 commit SHA；记录下载清单、哈希、来源和用户确认；执行使用 `execFile`/`execFileSync` 的参数数组和 `shell:false`；采用最小环境变量、临时工作目录、资源/时间/网络限制；导入后先预览 diff 和 manifest，再允许执行。

#### P1-7 附件能力与 Provider 实际输入不一致

**证据：** `routes/conversations.js:41-63` 实际只接受 PDF 并抽取文本；AI UI 的附件文案覆盖 PDF、DOC、TXT 等；CLI Provider 的 prompt 转换只保留文本 block，图片附件对 CLI 会被静默丢弃。

**优化方向：** UI `accept`、提示和后端能力保持一致；对 DOC/TXT/MD/JSON/CSV 要么实现真实抽取并显示解析状态，要么明确拒绝；Provider manifest 声明附件能力，CLI 不支持图片时在发送前阻止并解释原因。

#### P1-8 Provider 向导允许保存未验证或已知失败的配置

**证据：** `SettingsModal.tsx:350-354` 文案要求保存前验证，但 `SettingsModal.tsx:461-465` 的保存按钮只在 loading 时禁用，不要求 `connectionReady`，也不要求最近一次 probe 与当前配置 fingerprint 一致。用户可以在从未测试、测试失败或修改地址/模型后直接保存。

**优化方向：** 默认保存应绑定配置完整性和最近一次成功 probe；若产品必须支持离线保存，应明确标记“未验证配置”，显示失败原因、上次成功时间和配置指纹，并在首次运行前再次确认。

#### P1-9 Skills 的创建、删除和导入流程缺少真实闭环

**证据：** `SkillPanel.tsx:246-279` 允许用户选择分类，但 `skillApi.ts:120` 与 `routes/skills.js:110-127` 没有完整接收/持久化 categories 等元数据；删除按钮在 `SkillPanel.tsx:504-510` 对内置 Skill 也可见，后端 `routes/skills.js:134-145` 直接 unlink，缺少删除确认、内置 Skill 保护和合法名称校验。现有 E2E 主要覆盖 readiness mock，不覆盖真实创建、删除、导入、更新和 package tests。

**优化方向：** 以 manifest schema 作为唯一 DTO；创建后回读并显示实际 YAML；内置 Skill 禁止删除或明确“隐藏”；删除必须确认、可恢复或至少显示影响范围；导入/更新/package test 走临时数据根并补齐红绿灯与真实浏览器验收。

#### P1-10 RAG 上传成功提示存在本地化状态错误，真实文件上传覆盖不足

**证据：** `PaperRagPanel.tsx:154-166,489-491` 以 `uploadStatus.startsWith('Uploaded')` 判断成功颜色，中文成功文案不会以 `Uploaded` 开头，可能被渲染为失败颜色；全仓 E2E 没有 `setInputFiles` 的真实 PDF/DOCX 上传路径，现有 UI 旅程主要是粘贴文本。

**优化方向：** 用结构化状态枚举而不是显示文案判断颜色；为 PDF、TXT、DOCX、空文件、损坏文件、扫描 PDF/OCR 缺失分别验收；上传后展示解析状态、分块数、索引代次和失败原因。

### P2：仓库卫生、可维护性和长期演进问题

#### P2-1 根目录存在另一套 Coding Kanban 产品残留

**证据：** 根 `index.html:1` 是日文 Google 首页快照；`src/README.md` 描述 Coding Kanban；根 `playwright.config.ts` 和 `tests/e2e/*` 使用 `pnpm --filter server/web`；真正 Paper Writer 测试位于 `app/playwright.config.ts`、`app/tests/e2e`。根 `package.json` 又声明 npm，根还存在 `pnpm-workspace.yaml` 及多个空/遗留文件。

**用户影响：** Claude 或新贡献者从根目录运行 `npx playwright test`、查看 `src/README.md` 或直接打开 `index.html`，会得到与 Paper Writer 无关的产品说明或失败命令。

**优化方向：** 确定唯一入口（建议根 README 明确所有命令委托到 `app/`）；将旧产品移到 `legacy/` 或删除前先确认无消费者；增加 stale-root-artifacts 合同测试，禁止旧入口、旧包名和旧测试重新进入发布路径。

#### P2-2 项目文件树缺少论文工作区分层

**证据：** 实际 `torq` 项目同时包含 `.git`、`.omx`、实验目录、日志、缓存、PDF、模板、源文件和临时备份；编辑器默认把这些内容放在同一文件树中。

**优化方向：** 提供“论文源文件 / 参考资料 / 实验产物 / 系统与缓存”视图；默认隐藏 `.git`、`.omx`、缓存和大体积产物；文件类型和任务上下文筛选；大目录采用懒加载和搜索优先。

#### P2-3 最终 PDF 能力没有与编辑器入口形成清晰门禁

**证据：** 当前快速预览明确是 approximation，且系统能力中无 TeX 引擎；界面同时提供“编译”和“最终 PDF”。

**优化方向：** 区分“近似预览 / 可编译 / 最终 PDF 已验证”三种状态；编译前显示缺失引擎和宏包；把日志、错误行、依赖和产物版本绑定到一次构建记录；没有 TeX 引擎时不要只在 API 能力页隐含提示。

#### P2-4 外部文献检索的能力状态仍是 degraded

**证据：** `/api/capabilities` 报告 Crossref 可用、Semantic Scholar 未配置可选 API key，整体 `retrieval.external = degraded`。

**优化方向：** UI 解释每个来源的覆盖范围、限流、凭据和失败回退；引用导入后保存 DOI/arXiv ID、来源、抓取时间和原始元数据，避免把网络检索结果当作永久事实。

#### P2-5 “当前状态”文档互相矛盾，维护者无法知道哪个结论有效

**证据：** `docs/` 同一天存在多份 `repository_*2026-07-22*.md`；较早文档仍把正式 8787 描述为旧后端、旧数据根和 LAN BLOCK，而本轮实时探针已得到 `authRequired:true`、build `20260722030058-f0ef1484486e-6e243f16`、`/api/ready ready:true`。`docs/func_list.md` 仍把部分 legacy workbench 和已移除的 bash agent 能力写成当前功能。

**优化方向：** 保留一份 `current-status`，旧报告统一加 `superseded` 头和指向；每份审计报告记录 build ID、服务启动时间和测试命令；功能清单按源码/路由自动校验，legacy 能力单列。

#### P2-6 根目录包管理、入口和测试工具链不唯一

**证据：** 根 `package.json` 声明 npm 并委托到 `app/`，但同时存在 `pnpm-workspace.yaml`、根 `playwright.config.ts`、旧 `tests/e2e`、空的 `pnpm`/`tsx`/`tsc`/`server@0.1.0` 等遗留文件。根 `index.html` 是 Google 首页快照，`src/README.md` 是 Coding Kanban 说明。

**优化方向：** 明确唯一开发入口；根命令全部委托到 `app/`；旧产品迁移到 `legacy/` 或删除前完成消费者确认；增加 forbidden-stale-root-artifacts 检查，避免 Claude 从错误工作流开始。

#### P2-7 `check:full` 名称高于实际覆盖范围

**证据：** `app/package.json:29-30` 的 `check:full` 包含 typecheck、build、unit、integration、E2E，但不包含 npm audit、lint、format、正式重启和 LAN 验收；`docs/testing_release_gates.md` 却将其描述为完整门禁。Playwright `retries:0` 与 `trace:on-first-retry` 组合也不会在失败时产生 retry trace。

**优化方向：** 将“代码门禁、隔离 E2E、正式 LAN 发布验收、安全审计”拆为明确阶段；脚本输出证据文件和 build ID；失败时收集 trace/video/log；不要用 `check:full` 这个名字掩盖未执行的发布检查。

#### P2-8 配置模板会制造“凭据已配置”假象

**证据：** `app/.env.example` 使用 `OPENPRISM_LLM_API_KEY=your-api-key-here`；配置解析会把非空占位符视为已配置。模板还包含固定的 `OPENPRISM_COLLAB_TOKEN_SECRET=change-me-in-production`，运行时存在固定 fallback，属于默认密钥风险。

**优化方向：** 示例值使用空值或明确 `REPLACE_ME_DISABLED` 并在解析层拒绝；启动时若仍使用默认 secret 必须阻断或显著告警；提供随机生成命令，不在仓库或日志中打印真实凭据。

#### P2-9 元数据损坏的项目会从列表静默消失

**证据：** `routes/projects.js:120-146` 对缺少 id/name 或损坏 JSON 的目录多为 `continue` / warn；用户看不到“损坏项目、缺失元数据、重复 ID、未管理目录”的诊断入口。当前 `papers/` 还有两个 `test-conv-api-*` 测试残留目录。

**优化方向：** 项目发现结果应带 `managed/invalid/unmanaged/duplicate` 诊断状态；列表提供只读修复预览和明确确认；测试临时数据必须永远使用临时根，发布根启动前检查并标记残留目录。

## 4. 建议的整改顺序（只作为后续执行参考）

1. **发布与数据边界：** 固化原子发布、统一数据根、完成全路由鉴权和 LAN 三视口门禁。
2. **身份与存储：** 统一项目 resolver；明确显示名/目录/ID；把会话、附件、RAG 元数据纳入受管项目生命周期。
3. **可用性真实性：** Provider 五态模型；TeX 编译门禁；RAG 健康门禁与文档覆盖率；Skills manifest 与项目/会话级 ledger。
4. **安全与供应链：** Skill 固定版本、哈希、审批、沙箱和最小环境；附件能力和 CLI 输入能力严格对齐。
5. **仓库卫生：** 清理根目录另一套产品残留，建立唯一命令入口和 stale-artifact 合同测试。
6. **体验优化：** 文件树分层、移动端工作区导航、创建/导入/重命名映射预览、可解释的失败恢复和诊断。

## 5. 验收建议

后续任何修复都不应只以单元测试通过为完成标准，至少需要：

- 正式 LAN Desktop / Phone / Tablet Playwright：无 build mismatch、无 page error、无 failed request、无横向溢出；
- 项目列表与实际 `papers/` 的 `project.json.id/name/directoryName` 只读对账；
- Provider 的 supported/installed/authenticated/model-accessible/writable-scope 分层验证；不调用真实付费模型的 dry-run 与明确的实际 probe；
- RAG：成功索引、零分块、损坏索引重建、删除后召回、中文/LaTeX/PDF 评测；
- Skills：ready/degraded/unavailable 三态、包导入审批、命令注入回归、项目/会话隔离和历史追溯；
- TeX 引擎缺失、近似预览和最终 PDF 失败路径；
- 根目录命令、文档、测试和静态入口不会再指向 Coding Kanban 或 Google 快照；
- 生产重启后重新执行 `/api/health`、`/api/ready`、401/403/200 鉴权矩阵和三视口浏览器验收。

## 6. 结论边界

本报告确认的是 2026-07-22 11:08:50 的仓库和正式 LAN 运行态。它没有证明真实模型调用质量、论文内容科学性、PDF 最终排版质量或 Copilot/ Codex 在所有账户环境中的登录状态。上述事项需要在不泄露凭据、不调用付费模型、并使用独立测试数据的前提下单独验收。
