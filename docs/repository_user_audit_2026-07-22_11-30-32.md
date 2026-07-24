# paper_wrighting 使用者视角仓库问题审计

- 审计时间：2026-07-22 11:30:32（Asia/Shanghai）
- 仓库：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting`
- 正式 LAN 地址：`http://10.30.0.22:8787`
- 审计目的：从首次使用者、论文作者、管理员和二次开发者角度，找出当前仓库仍然影响可理解性、可靠性和交付可信度的问题
- 审计范围：只发现问题和提出改进方向；不修改业务代码、不创建或删除正式项目、不向正式 `papers/` 写入测试数据、不调用真实付费模型
- 本次唯一新增内容：本审计文档

> 本报告区分“证据”“推断”和“未知”。Playwright、HTTP、文件系统和源码中的事实属于证据；对用户影响和根因的判断属于推断；尚未通过运行或代码确认的内容明确标为未知。

## 一、结论摘要

当前仓库已经不再是“没有 Provider、Skills 或 RAG”的早期状态。正式服务能打开项目列表和编辑器，设置页也已经提供 OpenAI-compatible、Anthropic、Codex CLI、Claude Code CLI、GitHub Copilot CLI 五个选项；RAG 面板有健康状态和重建入口，项目目录也开始使用稳定身份。

但是，核心问题从“有没有功能”转移成了“功能状态是否可信、用户能否理解数据边界、发布结果是否可复现”。最需要优先处理的不是继续增加按钮，而是统一以下几组语义：

1. 显示名称、项目 ID、物理目录名和数据根之间的关系；
2. Provider 的已配置、已安装、已登录、模型可访问和可执行范围；
3. Skill 的已加载、可推荐、可执行和目标完成；
4. RAG 的文件存在、成功解析、已索引、可检索和检索质量；
5. 快速预览、真实 TeX 编译和可提交 PDF；
6. 当前源码、前端静态资源、后端进程和正式数据根之间的发布一致性。

总体判断：**仓库具备较完整的产品骨架，但仍处于“状态可信度和边界一致性”阶段。继续堆叠更多模型或 Skill，而不先修正这些状态语义，会让系统看起来更强，却更难判断什么时候真的完成了论文任务。**

## 二、本轮真实运行验证

### 2.1 服务和鉴权

对正式 LAN 服务进行 HTTP 探针，结果如下：

| 请求 | 无 Token | 正确 Token | 观察 |
|---|---:|---:|---|
| `/api/health` | 200 | 200 | 返回 `authRequired: true`、build ID 和 API schema 2 |
| `/api/ready` | 200 | 200 | `dataRoot`、`templates` 检查通过 |
| `/api/config` | 401 | 200 | 业务配置已受保护，但配置中可看到脱敏后的 endpoint/证书路径 |
| `/api/projects` | 401 | 200 | 项目列表已受保护 |
| `/api/capabilities` | 401 | 200 | 系统能力已受保护 |
| `/api/skills` | 401 | 200 | Skill catalog 已受保护 |
| `/api/providers` | 200 | 200 | Provider 元数据公开；是否应公开需要明确产品决策 |

当前健康响应中的构建信息为：

```text
build: 20260722030058-f0ef1484486e-6e243f16
apiSchemaVersion: 2
backendStartedAt: 2026-07-22T03:01:01.125Z
```

**证据结论：** 本次探测到的正式进程已经不是此前报告中的旧匿名后端；之前关于“正式服务完全被版本门禁阻断”的结论属于历史运行态，不能直接当作当前事实。发布文档必须区分历史证据和当前复核结果。

### 2.2 LAN Playwright：项目列表、编辑器和移动视口

使用 Chromium 1217、Bearer Token 和三个视口进行真实浏览器访问：

| 页面 | 视口 | 结果 | 横向溢出 | page error / failed request |
|---|---:|---|---|---|
| `/projects` | 1440×900 | 正常渲染项目列表 | 无 | 无 |
| `/projects` | 390×844 | 正常渲染项目列表 | 无 | 无 |
| `/editor/<torq-id>` | 390×844 | 正常进入文件树和编辑器 | 无 | 无 |

实际看到的核心入口包括“新建项目、导入项目、模板库、设置、AI 助手、任务、绘图、RAG、评审、引用、AI 写作检测、流水线和 Skills”。这说明主导航基本连通，但不代表每个入口的后续任务都可完成。

### 2.3 项目数据与物理目录对账

正式 `/api/projects` 返回 12 个项目；当前 `OPENPRISM_DATA_DIR` 为：

```text
/data01/home/xuzk/workspace/ai_agent/paper_wrighting/papers
```

该目录实际有 15 个一级目录，其中包括：

- 12 个带 `project.json` 的项目目录；
- `.pytest_cache`；
- `test-conv-api-1784653462802`；
- `test-conv-api-1784653754665`。

同时存在明显的身份不一致样例：

| 物理目录 | `project.json.id` | `project.json.name` | 页面/接口含义 |
|---|---|---|---|
| `60f6c414-540d-48de-955c-d33efe580c60` | 同名 UUID | `moe_prune` | 显示名和目录名不同 |
| `moe_prune` | `moe_prune` | `SNAP: Static Norm-based Amplification Proxy for Training-Free MoE Expert Skipping` | 显示名和目录名明显不同 |
| `paper-agent-spe` | `paper-agent-spe` | `Paper Agent SPE Paper` | 可读名称和目录名不同 |

**证据：** Playwright 页面同时显示“项目 ID”和“存储目录”；文件系统和 `project.json` 对账得到上述映射。

**推断：** 用户提出的“新建工程和文件夹名字对不上”并非单一前端排序问题，而是产品同时暴露了三种身份：显示名、稳定 ID、物理目录名。旧项目还混有 UUID 目录、旧 slug 目录和导入项目目录，导致用户很难凭文件夹名判断对应哪个页面工程。

## 三、按优先级汇总的问题

### P0：会影响发布可信度和数据安全

#### P0-1 发布一致性仍依赖人工重启和运行态确认

**证据：** 当前源码新增 build ID、`/api/ready` 和发布验证脚本；正式服务此前曾出现旧后端与新前端 build mismatch，本次才恢复到同一 build 响应。仓库仍有大量未提交改动，且 `app/apps/frontend/dist` 也在工作区变化中。

**用户影响推断：** 如果只更新前端静态资源或只重启后端，Deployment Gate 会阻断用户；如果没有 Gate，则可能让旧 API 被新 UI 调用，造成更隐蔽的数据修改风险。

**改进方向：** 将前端 dist、后端、build ID 和 API schema 放入不可变 release 目录，采用原子切换；部署后固定执行 `/api/health`、`/api/ready`、未授权/授权三态 API 探针和 LAN Playwright。

#### P0-2 数据根虽然已统一，但缺少用户可见的“当前数据根”和差异检查

**证据：** `/api/config` 返回仓库内 `papers` 根；该目录仍混有缓存和测试临时目录。历史报告曾观测到另一套 `/data01/home/xuzk/papers`，说明运行配置发生过数据根漂移。

**用户影响推断：** 只要启动脚本、`.env` 或 supervisor 使用不同变量，用户就会看到另一套项目，误以为项目被丢失或重命名。

**改进方向：** 启动日志和诊断页显示脱敏数据根、项目数、非项目目录数和来源变量；禁止 `OPENPRISM_DATA_DIR`、`OPENPRISM_PROJECTS_DIR` 和默认路径静默分叉；切换数据根前生成只读对账报告。

#### P0-3 所有资源类型的鉴权回归仍需统一

**证据：** 本次验证了主要 JSON API 的 401/200 行为，但尚未逐项验证图片、PDF、下载、WebSocket、SSE、终端和旧 workbench 的无 Token/错误 Token/正确 Token 三态。

**未知：** 这些资源是否全部复用同一鉴权中间件，不能仅凭 `/api/projects` 的结果推断。

**改进方向：** 建立公开健康接口白名单；对文件、流式响应、终端、WebSocket 和下载建立独立的受保护资源测试，避免 API 已加锁但旁路资源仍可读或可执行。

### P1：用户会困惑、误判或无法完成任务

#### P1-1 项目名称、ID、目录名的映射仍不符合普通用户直觉

**证据：** `projectLocator.js:70-72` 新项目物理目录按 `<slug>--<short-id>` 生成；现存项目又包括纯 UUID 目录、旧 slug 目录和显示名完全不同的导入目录。`ProjectPage.tsx:686-696` 将三者并列展示，但创建对话框没有预览最终目录。

**改进方向：** 新建项目对话框实时显示“显示名称、实际目录、稳定 ID”；明确重命名是只改显示名还是移动物理目录；列表支持按三种身份搜索；导入项目要求用户确认目录到项目的映射；提供复制实际路径和打开文件夹操作。

#### P1-2 数据根中未管理目录与正式项目没有清晰隔离

**证据：** `papers/` 下存在 `.pytest_cache` 和两个 `test-conv-api-*` 目录；API 返回项目数小于一级目录数。

**用户影响推断：** “发现已有目录”页面如果没有解释过滤规则，用户会认为系统漏掉文件夹；维护者也可能把测试残留误当成论文项目。

**改进方向：** 将“正式项目”和“未注册目录”分成两个明确区域；展示忽略原因；提供只读预览和显式注册；禁止自动把缓存、测试目录或缺少合法 `project.json` 的目录变成项目。

#### P1-3 Provider 的 `available` 仍然过于宽泛

**证据：** `/api/providers` 当前对五个 Provider 都返回 `available: true`。但 `/api/capabilities` 同时报告：

- Codex CLI：已安装，`authStatus: not-checked`；
- GitHub Copilot CLI：已安装，`authStatus: not-checked`；
- Claude Code CLI：可执行文件未找到；
- HTTP Provider：只确认 endpoint 和 credential 配置，没有发起网络或模型请求。

Playwright 实测切换到 Codex CLI 后，“测试连接”显示 `codex-cli 0.144.6 · authenticated`，这证明 Codex 当前可以完成一次非推理探针；但该证据不应自动外推到 Copilot、HTTP 模型调用或文件写入任务。

**改进方向：** API/UI 分开呈现 `supported`、`installed`、`authenticated`、`reachable`、`modelAccessible`、`visionCapable` 和 `writeScope`；无法探测时显示 `unknown`，不要显示绿色 `available`；测试连接明确“是否调用模型、是否可能产生费用、是否只读”。

#### P1-4 Codex/Copilot 的 Chat 与可修改任务边界仍需更明显

**证据：** 设置页文案说明 CLI Provider 只用于只读 Chat，需要修改文件进入独立 Task Agent；UI 已有“任务”入口，但普通用户仍需要自己理解两个入口的能力差异。

**改进方向：** 在 Chat 输入区和任务面板显示当前 Provider 的能力卡：只读/可写、是否允许工具调用、附件类型、项目写入范围、取消方式和审计产物；不可用 Provider 不应只是下拉框中的选项，而应显示安装/登录/权限原因。

#### P1-5 RAG 真实项目可能处于“有文件但不可检索”状态

**证据：** Playwright 打开项目 `1_dim_vq` 的 RAG 面板时看到：

```text
索引健康状态：降级
本地关键词证据检索
文件: 0 · 已索引: 0 · 失败: 0 · 零分块: 0 · 分块: 0
RAG 索引尚不存在
```

另一个历史真实项目复核曾看到 `文件 11 · 已索引 0 · 零分块 11 · 分块 64`。两种状态都说明“项目中有论文文件”不等于“RAG 可用”。源码 `paperRagService.js:2029-2058` 使用词项重叠评分和中文二元切分，不是 embedding/向量检索。

**改进方向：** 明确将当前能力命名为“本地关键词证据检索”；展示文档覆盖率、解析失败原因、零分块文件和索引代次；低于阈值时阻止静默注入上下文，要求用户确认或修复；为 `.tex`、PDF、中文材料和表格建立 Recall@k/空结果率评测。

#### P1-6 快速预览、TeX 编译和可提交 PDF 没有形成清晰门禁

**证据：** 在 `torq` 编辑器中，快速预览出现：

```text
unresolved command: \\nocite
unresolved command: \\appendix
unresolved command: \\onecolumn
```

系统能力接口报告 `document.tex` 为 unavailable，`pdflatex`、`xelatex`、`lualatex`、`latexmk`、`tectonic` 均未发现；Pandoc 可用。

**用户影响推断：** 用户可以编辑和查看近似渲染，但可能把近似预览误认为最终 PDF。对于投稿场景，这会把编译缺失、引用错误和版式差异推迟到提交前。

**改进方向：** 将“近似预览”和“真实编译”做成明显不同的状态；无 TeX 引擎时在创建项目和导出入口提前告警；编译诊断按错误、警告、未解析命令分组，并提供安装/远程编译能力说明。

#### P1-7 Skill 数量、Skill readiness 和目标完成仍是不同概念

**证据：** `/api/skills` 返回 123 个 Skill；`skillReadinessService.js:12-18` 已定义多种 outcome 和 `not_evaluated` 状态，说明实现承认“加载、测试、执行、目标达成”不是同一状态。当前 `docs/skill_execution_readiness.md:83-87` 仍使用过期的 `not-evaluated` 写法且只列出部分 outcome，存在文档契约漂移。

**未知：** 本次没有逐一执行 123 个 Skill，也没有在不调用付费模型的情况下证明每个 Skill 的目标完成率。

**改进方向：** manifest 统一声明命令、凭据、网络、输入输出、副作用、费用、超时和验收器；默认只推荐 ready Skill；degraded 必须显示具体阻断项；运行历史按 `(skill, projectId, conversationId, providerConfigVersion)` 分区，避免同名 Skill 在不同项目之间覆盖。

#### P1-8 会话、附件、项目导出和删除的隐私边界需要用户可见

**证据：** 当前工作区已有会话存储边界整改，路线转向项目内 `.openprism/conversations/`，并增加项目身份校验；但旧 `$HOME/.paper-writer` 会话的自动迁移策略仍未实现，且需要在用户界面解释旧数据是否会被保留、迁移或仅在永久删除时清理。

**改进方向：** 在项目设置中显示会话/附件存储位置和迁移状态；导出项目时明确是否包含会话、RAG、缓存和运行日志；永久删除前显示不可恢复项和旧遗留数据处理策略。

#### P1-9 附件类型与 Provider 输入能力必须在选择文件前说清楚

**证据：** 当前代码已开始对文本附件、PDF、图片和 CLI Provider 能力做区分，但不同 Provider 的 `imageInput`、`documentInput`、结构化内容和工具调用边界仍不是所有入口共享的一张能力表。

**改进方向：** 文件选择器按当前 Provider 动态限制；上传前显示“会提取文本/发送原图/不支持”；不支持的 DOCX、PPTX、XLSX 等格式在 UI 端给出转换建议，而不是提交后才失败。

### P2：会增加维护成本和首次使用门槛

#### P2-1 根目录仍存在多产品历史痕迹

**证据：** 根目录同时存在 Paper Agent 入口、历史 `tests/e2e/*` Coding Kanban 测试、旧文档资源和根级 Playwright shim；`app/` 才是当前工作区和 npm workspace。虽然根入口和部分旧零字节文件已经治理，但新贡献者仍需判断哪些目录属于当前产品。

**改进方向：** 根 README 只保留当前产品入口；将历史 Coding Kanban 归档到明确目录并标记不参与当前构建；根级命令全部委托 `app/`，并在 CI 中验证没有旧产品测试被误执行。

#### P2-2 文档存在大量历史审计报告，当前状态指针不够唯一

**证据：** `docs/` 下有多份同日不同时间的 `repository_*audit*.md`；旧报告中仍有“LAN BLOCK”“旧数据根”“旧后端匿名”等结论，而当前正式接口已经返回鉴权和 build metadata。

**改进方向：** 建立 `docs/current_status.md` 单一入口；历史报告统一标记 `historical/superseded`；每次复核附 build ID、服务时间、数据根和测试命令，避免 Claude 或维护者误读旧结论。

#### P2-3 工具链和发布门禁仍需命名清晰

**证据：** `check:full` 实际包含 typecheck、build、unit、integration、isolated E2E，但不自动包含 `npm audit`、正式 LAN Playwright、正式重启或发布探针；`release:verify` 是独立只读检查。

**改进方向：** 保留分层门禁，但在 README 和 CI 中明确：`check:full` 是隔离源码回归，`release:verify` 是部署探针，`release:browser` 是正式 LAN 浏览器验收；不要把任一命令单独宣称为完整发布证明。

#### P2-4 当前未提交工作区过于庞大，难以判断哪些是审计整改、实验或用户改动

**证据：** `git status --short` 显示大量后端、前端、测试、文档和构建产物变化，包含删除旧工具文件、修改 `dist`、新增多组测试和多份审计文档。

**用户影响推断：** Claude 或后续维护者难以区分“当前任务必须保留的改动”和“历史实验/临时产物”，容易误删、重复实现或把未验证代码当作稳定功能。

**改进方向：** 将整改拆成小而可回滚的提交；每个提交记录测试证据和风险；把构建产物、临时测试目录和历史报告纳入清晰的忽略/归档策略。

## 四、改进路线（只作为后续实施依据，本轮未实施）

### 第一阶段：建立可信状态

1. 建立唯一的 current status 文档和发布 build 记录；
2. 固化正式服务的唯一数据根，显示脱敏路径和目录对账；
3. 统一所有 API、文件、PDF、WebSocket、SSE、终端资源的鉴权测试；
4. 将 Provider 状态拆成 supported/installed/authenticated/reachable/modelAccessible/writeScope；
5. 把“近似预览”和“真实编译”分成两个明确门禁。

### 第二阶段：修复用户心智模型

1. 新建/导入/重命名时实时展示显示名、稳定 ID 和物理目录；
2. 分离正式项目、未注册目录、缓存和测试残留；
3. 为 RAG 展示覆盖率、失败原因、索引代次和检索类型；
4. 为 CLI Chat 与 Task Agent 显示只读/可写边界和审计产物；
5. 为附件按 Provider 动态展示支持范围。

### 第三阶段：提高能力可靠性

1. 建立 Skill manifest schema 和逐 Skill 验收器；
2. 将 Skill 运行历史按项目/会话/Provider 版本隔离；
3. 用固定小型论文集评测 RAG 的 Recall@k、引用准确率和空结果率；
4. 将测试默认隔离为 worker/项目级数据根，避免共享状态造成假失败；
5. 为正式 LAN 增加桌面、手机、平板的重复运行和失败 trace 保留。

## 五、证据边界与未完成验证

- 本次确实使用了真实 LAN Chromium，验证了项目列表、编辑器、移动视口、RAG 面板、设置页和 Codex CLI 非推理连接探针。
- 本次没有创建正式项目，因此未验证新建后物理目录生成、重命名移动、复制、归档和永久删除的完整真实旅程。
- 本次没有调用真实 LLM，不对模型输出质量、费用、上下文长度或长期稳定性作结论。
- 本次没有逐一执行 123 个 Skill，不把 catalog 数量当作能力通过率。
- 本次没有对正式文件下载、图片、PDF、SSE、WebSocket 和终端做完整三态鉴权矩阵；这些仍是发布前必须补齐的验证项。
- 本次没有修改业务代码、重启服务或清理正式数据；工作区中原有未提交改动均保留。

## 六、停止条件

本轮审计在以下证据已经收集后停止：

1. 当前正式 build、鉴权、ready 和数据根已通过 HTTP 复核；
2. 项目列表和编辑器已通过真实 LAN Playwright 的桌面/手机视口复核；
3. 项目 API 与 `papers/` 物理目录已完成只读对账；
4. Provider、RAG、TeX 能力和 Skill readiness 已有源码与运行态证据；
5. 所有结论均区分证据、推断和未知，且未实施业务修改。
