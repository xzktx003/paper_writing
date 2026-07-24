# Paper Writing 当前仓库问题分析与改进建议

- 报告时间：2026-07-22 03:14:16（Asia/Shanghai）
- 审计对象：`paper_wrighting` 当前工作区、当前 `0.0.0.0:8787` 正式运行实例、隔离 Playwright 实例
- 审计视角：真实论文写作用户、局域网部署者、仓库维护者
- 审计边界：只发现问题，不修复功能；未修改业务源码、配置和用户论文文件
- 证据类型：Playwright 实测、HTTP 实测、文件系统观察、源码与测试审阅、构建和依赖审计
- 特别保护：`papers/paper-agent-spe/project.json` 的既有 diff 未被触碰，审计前后 diff SHA-256 均为 `afc5752ebb84e46894383ea77f151c700f973acea56858ffb696a6f48e63305e`

## 1. 结论摘要

当前仓库已经不是最初审计时“多个核心入口直接断裂”的状态。项目 CRUD、RAG index/search、五类 Provider、移动端工作区、能力诊断、会话恢复、模板编译、前端懒加载和隔离 E2E 等主体功能已经有实质实现。实际运行 `npm run test:e2e` 得到 13/13 通过，正式 LAN 页面在 1440×900、390×844 和 768×1024 下均可加载且没有横向溢出。

但是，当前版本仍不能被评价为“29 项问题全部完成”或“可以安全交付”。最核心的原因不是功能数量不够，而是以下四条产品基础契约仍未闭合：

1. **默认安全契约未闭合。** 无服务器 Token 时，系统只屏蔽少数 URL，项目删除、文件写入、配置修改、HTTP Provider 探测等大量写操作仍然匿名开放；HTTP Provider probe 还存在把服务器密钥发送到客户端指定地址的直接风险。
2. **Agent 修改审批契约未闭合。** Codex CLI 已经接入，但以 `workspace-write` 运行，能够绕过应用的 Diff/Accept/Reject 流程直接修改论文目录。
3. **项目身份与状态语义未闭合。** 新项目目录改成了“可读 slug + 短 ID”，但 UI 只显示项目名，不解释磁盘目录；不存在项目仍可能被当成空项目处理，甚至产生 `.openprism` 索引目录。
4. **测试通过与产品安全之间仍有明显空档。** 340 项单测和 13 项 Playwright 可以证明大量机械契约已改善，却没有覆盖匿名写入、密钥外传、符号链接逃逸、Codex 无审批写入、CLI 流式重复和非原子持久化等关键场景。

从使用者角度，当前产品更准确的定位是：

> 一个功能覆盖已经很广、基础主流程可以运行，但权限模型、Agent 写入边界、数据身份、错误语义和真实发布门禁仍处于工程收口阶段的论文工作台。

建议暂停继续堆叠新的侧边栏模块，先完成安全、项目身份、Agent 审批、错误状态和发布一致性五条主线。否则功能越多，潜在的数据破坏面、付费调用面和用户认知成本也越大。

## 2. 本次实际验证

### 2.1 隔离 Playwright 全量执行

实际执行：

```bash
npm run test:e2e
```

结果：

- 前端生产构建成功；
- E2E runner 使用随机端口和临时数据根；
- 项目列表、项目 CRUD、health/config/projects API、手机/平板工作区和能力页共 13 项测试全部通过；
- 总结果为 `13 passed (6.2s)`；
- 测试完成后隔离目录由 runner 清理。

这证明当前代码的基础浏览器主路径已经比原审计状态稳定，但现有 E2E 主要验证“页面能打开、按钮能切换、基本 CRUD 能完成”，并不能证明高风险权限和数据边界正确。

### 2.2 正式 LAN Playwright 实测

实际访问：

```text
http://10.30.0.22:8787/projects
```

实测视口：

| 视口 | 页面状态 | 横向溢出 | 主要结果 |
| --- | --- | --- | --- |
| Desktop 1440×900 | 200 | 无 | 项目列表、设置、编辑器可打开 |
| Phone 390×844 | 200 | 无 | Files/Editor/Assistant 三视图可切换 |
| Tablet 768×1024 | 200 | 无 | 三视图可切换 |

实际观察：

- `html.lang` 为 `zh-CN`；
- 设置页列出了 OpenAI-compatible、Anthropic、Codex CLI、Claude Code CLI、GitHub Copilot CLI；
- 未配置服务访问 Token 时，系统能力页只显示 `Dangerous API disabled until OPENPRISM_API_TOKEN is configured`；
- 编辑器中文外壳内仍出现大量英文：`Open a file from the project tree`、`No active conversation`、`New Conversation`、`Generate Image Prompt`、`Run Structured Review`、`Citation Verification`、`Composable multi-stage workflows with typed executors` 等；
- RAG 面板可以打开，显示本地资料库、外部检索、上传、自动更新索引等入口；
- Draw、Review、Citation、Anti-AI、Pipeline 面板均能加载，但产品语言和操作语义明显不统一；
- 浏览器控制台持续出现远程字体资源 `ERR_EMPTY_RESPONSE`，当前依赖本地字体回退，不阻塞页面但会制造噪声。

### 2.3 正式 API 实测

正式实例当前返回：

```text
GET /api/health
200 {"ok":true,"authRequired":false}

GET /api/providers
200，返回 5 个 Provider

GET /api/capabilities
503 Dangerous API disabled until OPENPRISM_API_TOKEN is configured

POST /api/code/exec
503 Dangerous API disabled until OPENPRISM_API_TOKEN is configured
```

但进一步探测得到：

```text
POST /api/ai/stream（无 Token、HTTP Provider）
未在认证层返回 503，而是进入业务路由后返回 500

GET /api/projects/not-a-real-project/files
200 {"files":[]}

GET /api/projects/not-a-real-project/rag/search?q=test
200 {"results":[]}
```

这三个结果说明：

- AI 路由的危险性取决于当前 Provider 名称，而不是取决于请求最终能否写文件或执行代码；
- 不存在项目被伪装成“空项目”或“无检索结果”；
- API 缺少统一、可信的项目不存在语义。

正式数据根中还存在：

```text
/data01/home/xuzk/papers/not-a-real-project/.openprism/paper-rag-index.json
```

这表明对不存在项目的读取/检索路径能够产生磁盘副作用。该目录本次未删除，以遵守“只分析、不修复或清理”的边界。

### 2.4 构建与依赖观察

生产构建成功，但仍有两个按需加载 chunk 超过 500 KiB：

```text
RenderedPreviewPane  510.02 KiB
MarkdownEditor       583.94 KiB
```

`npm --prefix app audit --json` 的当前结果：

| 严重度 | 数量 |
| --- | ---: |
| moderate | 2 |
| high | 2 |
| critical | 2 |
| 合计 | 6 |

涉及 `tar`、`shell-quote`、`brace-expansion`、`react-router`、`react-router-dom` 和 Vite 的传递依赖。这里只记录，不自动执行 `npm audit fix`，因为依赖升级需要单独评估可达性和兼容性。

## 3. 问题优先级总览

| 优先级 | 数量 | 核心主题 |
| --- | ---: | --- |
| P0 / Critical | 4 | 匿名写操作、Provider 密钥外传/SSRF、AI Tools 鉴权绕行、Codex 无审批写入 |
| P1 / High | 8 | symlink 越界、项目身份、缺失项目副作用、CLI 流式错误、项目扫描写盘、模板替换、i18n、测试门禁 |
| P2 / Medium | 8 | RAG 成熟度、Skills 可用性、能力诊断、配置原子性、编译状态、版本握手、性能和依赖 |
| P3 / Product | 4 | 信息架构、用户引导、Provider 权限表达、可观察性 |

## 4. P0：必须先解决的阻断问题

### P0-1：无 Token 时采用危险 URL 黑名单，大量匿名写操作仍然开放

**证据类型：代码证据 + 运行态推断。置信度：高。**

关键代码：

- `app/apps/backend/src/middleware/auth.js:6-22` 只列出少数危险路径；
- `app/apps/backend/src/middleware/auth.js:61-67` 在未设置 Token 时，对不在危险列表中的请求直接放行；
- `app/apps/backend/src/index.js:60` 配置 CORS `origin: true`；
- `app/apps/backend/src/index.js:111-118` 暴露会写 `.env` 的配置 PUT；
- `app/apps/backend/src/routes/projects.js` 暴露创建、重命名、复制、归档、永久删除、上传和文件写入接口。

用户影响：

- 同局域网用户可以在没有 Token 的情况下创建、修改、删除项目和论文文件；
- 恶意网页可能利用宽松 CORS，从浏览器跨域读取项目列表并发起写操作；
- 关闭 `/api/code/exec` 并不能保护论文数据完整性；
- Draw、RAG 上传、配置修改和外部服务调用仍可能造成费用或数据污染。

当前文档声称“危险能力不再匿名开放”，但实现采用黑名单，任何新增路由如果没有被手工加入列表就会默认开放。安全结论与实现模型不一致。

改进方向：

1. 全部 `/api/**` 默认要求认证，只显式公开 `/api/health` 等最小 allowlist；
2. 如果保留无 Token 本地浏览模式，至少所有 POST/PUT/PATCH/DELETE 必须 fail-closed；
3. 将权限拆成 `read`、`write`、`execute`、`provider-cost`、`admin`，永久删除和配置修改要求更高权限；
4. CORS 使用明确 origin allowlist；
5. 自动遍历全部注册路由生成认证矩阵测试，避免新增接口漏保护。

### P0-2：HTTP Provider probe 可把服务器已有 API Key 发送到客户端指定地址

**证据类型：直接代码证据。置信度：高。**

关键链路：

- `app/apps/backend/src/middleware/auth.js:16-18` 只保护 CLI Provider probe；
- `app/apps/backend/src/routes/agentProviders.js:10-13` 把请求 body 原样交给 registry；
- `app/apps/backend/src/services/llmService.js:453-470` 使用 `input.endpoint || serverEndpoint` 和 `input.apiKey || serverApiKey`；
- `app/apps/backend/src/services/llmService.js:476-495` 将 Key 放入 `Authorization` 或 `x-api-key` 请求头。

因此攻击者可以：

1. 提交自己控制的 endpoint；
2. 不提交 apiKey；
3. 让后端回退使用服务器 `.env` 中的真实 Key；
4. 在攻击者 endpoint 收到服务器密钥。

同一路径还构成 SSRF：当前没有明确阻止 loopback、私网、link-local、云元数据地址和重定向。

改进方向：

- 所有 Provider 的 probe/models/invoke/cancel 都必须认证；
- “测试服务器配置”和“测试临时输入”必须是两种互斥模式，endpoint 与 key 不能混合来源；
- 不允许把服务器 Key 发送到请求提供的 endpoint；
- 增加协议、DNS、重定向和目标地址校验；
- 使用本地恶意 HTTP server 做回归，明确断言服务器 Key 不会离开配置 origin。

### P0-3：无 Token、HTTP Provider 时，AI Tools 可以绕过危险 API 门禁

**证据类型：HTTP 实测 + 代码证据。置信度：高。**

- `app/apps/backend/src/middleware/auth.js:19-21` 只有当前 Provider 名称以 `-cli` 结尾时才保护 `/api/ai/*`；
- `app/apps/backend/src/routes/ai.js:96-130` 的 Tools 模式包含 `write_code` 和 `run_code`；
- `app/apps/backend/src/routes/ai.js:399-429`、`484-511` 会执行模型返回的工具；
- `app/apps/backend/src/routes/ai.js:578-585` 最终可以写文件或运行脚本；
- 正式实例无 Token 请求 `/api/ai/stream` 没有在认证层返回 503，而是进入业务逻辑。

此外：

- `app/apps/backend/src/routes/ai.js:328-331` 和 `437-440` 显式允许 `externalProjectPath`；
- `app/apps/backend/src/services/managedProjectContext.js:57-69` 对 external path 只验证“是绝对路径”，没有允许根限制。

这意味着“直接命令接口关闭”不等于“执行能力关闭”。如果 HTTP 模型处于 Tools 模式，它仍可能通过 AI 路由触发写文件或执行代码，并且 external path 可能指向数据根之外。

改进方向：

- `/api/ai/*` 按能力而非 Provider 名称统一进入危险 API 边界；
- 未认证时禁止 Agent/Tools，只允许明确的只读 Chat，或者全部禁用；
- 正式论文 AI 路由只接受 managed `projectId`；
- external path 仅保留给单独、明确、强认证的外部目录 capability；
- 增加无 Token AI send/stream、Tools write/run、external path 的端到端红灯测试。

### P0-4：Codex CLI 使用 workspace-write，但应用没有 Diff/Accept/Reject 边界

**证据类型：直接代码证据。置信度：高。**

`app/apps/backend/src/services/agentProviderRegistry.js:20-31` 固定执行：

```text
codex exec --json --ephemeral --sandbox workspace-write
```

Registry 返回 stdout、stderr 和 provenance，但没有：

- 修改前快照；
- changed-files 清单；
- 完整 diff；
- waiting-review 状态；
- Accept/Reject；
- 拒绝后的回滚。

`toolCalling: false` 只表示 Codex 不使用应用自己的结构化工具协议，不表示 Codex 进程不能直接写 cwd。当前架构文档中“不会绕过现有人工确认边界”的描述与实际权限不一致。

从用户角度，这是“支持 Codex 完成任务”与“把论文目录直接交给 Codex 修改”之间的关键区别。前者是所需功能，后者缺少论文写作场景必须具备的可审计性。

改进方向：

1. Chat Provider 使用真正的只读 sandbox；
2. Task Agent 在临时副本、隔离 worktree 或 patch-only 环境中运行；
3. 任务结束后生成 changed-files 和完整 diff；
4. UI 展示 Accept/Reject，并支持逐文件或逐 hunk 接受；
5. 拒绝后原始论文完全不变；
6. Claude/Copilot/Codex 使用统一权限声明，不要只显示一个 Provider 名称。

## 5. P1：高优先级完整性与体验问题

### P1-1：路径安全只防 `..`，没有防符号链接逃逸

**证据类型：代码证据。置信度：高。**

当前 `safeJoin` 主要依靠字符串前缀检查。若项目内存在：

```text
link -> /outside
```

则 `link/target.txt` 在字符串上仍位于项目目录内，但操作系统实际会写到 `/outside/target.txt`。

受影响面包括项目文件读写、删除、移动、Draw、RAG、编译输入和导入内容。当前测试只覆盖 `../` 词法穿越，没有 symlink 根目录和中间组件测试。

改进方向：使用 `realpath`/`lstat`、拒绝 symlink 组件、根目录不得是 symlink，并为创建路径增加 no-follow 语义和归档 symlink 条目校验。

### P1-2：项目名与磁盘目录问题得到改善，但用户认知仍未闭合

**证据类型：代码证据 + UI 实测。置信度：高。**

当前新建目录规则为：

```js
`${slugifyProjectName(name)}--${shortProjectId(id)}`
```

见 `app/apps/backend/src/services/projectLocator.js:23-42`。

这比纯 UUID 目录更可读，也解决了同名冲突，但仍然不等于 UI 中的项目名称。项目列表 `ProjectPage.tsx:550-586` 只显示 `project.name`，没有显示 `directoryName`、稳定 ID 或磁盘路径。

当前 API 已经存在真实别名案例：

```text
项目名：Aliased Project
目录名：aliased-dir-27eedc87-0ae7-40a8-a6e1-81b32d63f217
```

因此原始问题不是完全消失，而是从“随机 UUID 难理解”变成“系统内部有合理命名规则，但 UI 没解释”。

改进方向：

- 项目详情明确展示“显示名称、目录名称、稳定 ID、数据根”；
- 新建和重命名时预览实际目录名称；
- 提供“在文件管理器打开/复制路径”；
- 显示重命名是否会迁移目录；
- 旧项目、导入项目和 alias 项目标注来源，不让用户误以为目录一定等于显示名称。

### P1-3：不存在项目返回空结果，并可能创建目录和 RAG 索引

**证据类型：HTTP 实测 + 文件系统证据 + 代码证据。置信度：高。**

`getProjectRoot()` 默认 `allowMissing: true`，见 `projectLocator.js:49-103`。大量已存在项目路由直接调用 `getProjectRoot(id)`。

实测：

- missing `/files` 返回 200 空数组；
- missing `/rag/search` 返回 200 空数组；
- 数据根出现 `not-a-real-project/.openprism/paper-rag-index.json`。

用户影响：

- 项目 ID 拼错时看起来像“项目是空的”；
- RAG 不工作时看起来像“没有匹配资料”；
- 只读请求能够污染数据根；
- 永久删除等破坏性 API 可能针对没有合法 `project.json` 的同名目录。

改进方向：所有已存在项目操作默认 `allowMissing:false`；只有创建流程允许目标缺失；统一返回结构化 404，且错误体不泄露绝对路径。

### P1-4：GET 项目列表会写磁盘并自动注册普通目录

**证据类型：代码证据。置信度：高。**

`GET /api/projects` 扫描没有 `project.json` 的目录，只要其中存在论文相关扩展名，就会创建元数据。排除集合没有覆盖所有点目录、缓存、结果和临时目录。

这意味着“打开项目列表”不是纯读取。缓存目录可能被提升为正式项目，用户没有确认机会。此前已出现 `.pytest_cache` 被识别为项目的实际案例。

改进方向：

- GET 保持纯读取；
- 将“扫描候选目录”和“确认注册”拆成两个显式步骤；
- 默认排除所有点目录、缓存、node_modules、测试、结果和临时目录；
- 支持 ignore pattern；
- 注册前展示名称、目录、入口文件和即将写入的元数据。

### P1-5：CLI 流式输出可能显示原始 JSON并重复最终回答

**证据类型：代码证据。置信度：高。**

CLI 使用 `--json` 或 `stream-json`，进程 stdout chunk 会直接进入 `onToken`。结束后完整 stdout 又被 `parseOutput()` 提取最终文本，并再次作为 token 发送。

可能表现：

- 用户先看到原始 JSON event；
- 完成时回答重复一次；
- JSON 行被 chunk 拆开时显示残片；
- 前端 transcript 与最终 provenance 不一致。

现有测试只证明 raw stdout callback 被调用，没有证明拼接 token 等于最终文本且只出现一次。

改进方向：为每种 CLI 编写增量事件解析器，只发送文本 delta；原始 JSON 进入受限诊断日志；最终文本不得二次追加。

### P1-6：中文模式仍大量中英混用

**证据类型：Playwright 实测 + 代码证据。置信度：高。**

Playwright 在 `html.lang=zh-CN` 下实际看到：

- `Open a file from the project tree`；
- `No active conversation`；
- `+ New Conversation`；
- Draw 全部核心步骤为英文；
- Review、Citation、Anti-AI、Pipeline 大量英文说明；
- 主题名 `Basic Light` 未本地化。

对应硬编码位置包括：

- `CenterPanel.tsx:632`；
- `RightPanel.tsx:748,765`；
- `DrawPanel.tsx:520,723`；
- `ReviewReportPanel.tsx:79`；
- `CitationVerificationPanel.tsx:163,313`；
- `AntiAiPanel.tsx:370`；
- `PipelinePanelV2.tsx:135`；
- `ThemeToggle.tsx:7`。

当前 i18n 测试主要验证 key 集合和若干核心组件，没有做“中文页面不得出现已知英文硬编码”的浏览器扫描。

改进方向：建立全工作区 i18n inventory；对用户可见字符串禁止直接硬编码；Playwright 在 zh-CN/en-US 各跑一遍，并对主要面板做语言一致性断言。

### P1-7：模板替换、RAG 索引和配置写入缺少原子提交

**证据类型：代码证据。置信度：高。**

三个持久化路径有相同问题：

- 模板 ZIP 替换先删除旧目录，再 rename staging；rename 或 manifest 更新失败会丢失旧模板；
- RAG 索引全量重建后直接覆盖 JSON，没有项目锁、临时文件 rename、generation 或损坏恢复；
- `.env` 直接 writeFile，没有锁、原子替换、CR/LF 输入约束和明确的运行环境优先级。

用户影响是偶发但严重的：并发上传、进程中断或磁盘错误可能把“功能操作失败”升级为“旧数据也丢失”或“配置文件损坏”。

改进方向：统一采用 staging/backup/atomic rename/rollback；对项目、模板和配置引入合适粒度的锁与版本号；增加失败注入和并发测试。

### P1-8：现有测试门禁证明基础可用，但不能证明关键安全声明

**证据类型：测试审阅 + 实际执行。置信度：高。**

13/13 Playwright 通过与上述 Critical 问题同时成立，说明当前测试覆盖的是页面形状，不是安全和数据语义。

缺失的关键测试：

- 无 Token 下全部写接口必须失败；
- HTTP probe 不能把服务器 Key 发到恶意 endpoint；
- SSRF 私网/loopback/link-local/重定向；
- symlink 根目录和中间路径逃逸；
- Codex 修改必须形成 diff，Reject 后原文件不变；
- CLI SSE 不显示 JSON且不重复；
- missing project 一律 404且不创建目录；
- `.pytest_cache` 等目录不得自动注册；
- 模板、RAG、`.env` 失败回滚和并发；
- 前后端版本不匹配时阻断工作区。

## 6. P2：中优先级能力成熟度问题

### P2-1：RAG 已有闭环，但目前主要是关键词重叠检索

**证据类型：代码证据。置信度：高。**

`paperRagService.js:472-492` 对查询分词后，使用 `scoreChunk()` 做 token overlap 排序；代码中没有本地 embedding、BM25/IDF 或 reranker 主链路。

这不意味着 RAG 完全不可用。它适合：

- 精确术语；
- 作者名、方法名、数据集名；
- 论文中已知关键词；
- 引用出处定位。

但对同义词、缩写、跨语言、语义改写和概念性问题召回有限。UI 使用“RAG”“检索资料库”等宽泛表达，没有明确说明当前是本地关键词证据检索，用户容易把低召回误解为“资料不存在”。

改进方向：先把能力说清楚，再考虑 BM25、embedding、混合检索和 reranker；结果必须持续显示来源、行号、得分和索引时间。

### P2-2：RAG 并发索引和损坏恢复不足

新增、上传、删除和手工 index 都可能触发全量重建。没有项目级串行化和原子索引提交时，较早开始、较晚完成的任务可能覆盖新状态；进程中断可能留下半个 JSON。

建议增加项目级 mutation queue、临时文件原子 rename、corpus fingerprint、generation，以及损坏索引自动隔离重建。

### P2-3：Skills 数量和分类改善了，但“加载成功”不等于“可用”

当前系统可以加载约 123 个 Skill，分类和空分类问题已改善。但大量 Skill 的风险、耗时、上下文和 UI 元数据仍由推断或默认值生成。

用户真正需要的不是“有 123 个”，而是：

- 当前 Skill 是否 ready；
- 需要什么命令、凭据、网络和文件权限；
- 会读哪些文件、写哪些文件；
- 是否会调用付费模型或外部服务；
- 预计耗时；
- 最近一次运行是否成功；
- 失败后如何恢复。

改进方向：为每个 Skill 建立 capability manifest、依赖探测、权限声明、输入输出 schema、dry-run 和最近运行状态；设置页按 ready/degraded/unavailable 分类，而不是只按 taxonomy 分类。

### P2-4：系统能力页受 Token 整体阻断，普通用户无法获得基础诊断

正式 Playwright 实测中，未配置 Token 时能力页只有 503 文案。虽然 fail-closed 对命令探测是合理的，但从用户角度，页面无法回答：

- 为什么 Codex/Claude/Copilot 不可用；
- 是没有安装、没有登录，还是没有 Server Token；
- TeX、Pandoc、OCR、tmux、Skills 是否可用；
- 下一步应配置什么。

改进方向：把能力拆成安全的静态元数据和受保护的主动探测。匿名页面至少展示“需要 Token 才能探测”的结构化状态、配置入口和文档链接；认证后再执行命令探测。

### P2-5：Provider 已接入五类，但权限、登录和任务模式没有被用户理解

当前设置页实现了用户最初提出的 Codex/Claude/Copilot 选项，这是明确进展。但仍存在用户体验缺口：

- CLI Provider 在无 Server Token 时统一显示 unavailable；
- 设置页没有完整区分“未安装、未登录、Token 未配置、Provider 不支持模型列表”；
- Provider 下拉框没有清楚显示只读/可写/可执行/是否有 Diff 审批；
- HTTP Provider 声明 cancel，但实际 registry cancel 只管理 CLI 子进程；
- CLI 的 `stream:true` 与当前原始 JSON token 行为不匹配。

建议将 Provider 选择从“模型来源下拉框”升级为“执行后端 + 权限配置”：Chat、Task、Tools 分开，明确 read/write/execute/network/cost/diff-review。

### P2-6：编译状态可能同时表达成功和失败

如果生成了 PDF，但日志中存在 LaTeX Error，后端可能返回 `ok:true` 同时 `status:'failed'`。前端一部分逻辑按 status 显示失败，另一部分按 `ok && pdfUrl` 加载 PDF。

建议统一状态机：

- success：PDF 且无阻断错误；
- warning：PDF 且只有允许的警告；
- failed：存在阻断错误；
- `artifactAvailable` 单独表示失败产物是否可查看。

### P2-7：health 无法发现新前端 + 旧后端混合部署

`/api/health` 只返回 `ok` 和 `authRequired`，没有 build ID、API schema version、前端资产版本、启动时间或 readiness。

本仓库此前已经真实出现过新前端和旧后端混合运行，而 health 仍可返回 200。当前依赖人工重启和冒烟验证，尚未形成系统级版本握手。

改进方向：前后端共享 build ID 和 schema version；新增 readiness/version；前端启动时检查兼容性，不兼容则阻止进入工作区并提示重新部署。

### P2-8：依赖漏洞和大 chunk 仍需单独治理

依赖审计有 6 项 moderate/high/critical 告警；两个编辑/预览 chunk 超过 500 KiB。虽然这些 chunk 已经懒加载，不再阻塞首屏，但在低性能设备或局域网质量差时，首次打开编辑器和预览仍可能明显卡顿。

建议：

- 对漏洞做“是否在生产路径可达”的逐项评估；
- 不直接使用自动大版本修复；
- 继续拆分 Markdown 语言包、预览渲染器和 PDF/LaTeX 重资源；
- Playwright 增加冷缓存加载时间和低端移动设备预算。

## 7. P3：产品层面的使用问题

### P3-1：功能入口很多，但缺少以论文任务为中心的主流程

右侧同时提供 Chat、Draw、RAG、Review、Citations、Anti-AI、Pipeline、Skills、Terminal。每个模块都有能力，但新用户需要自己理解：

- 先上传资料还是先新建会话；
- 什么时候索引 RAG；
- Skill 与 Pipeline 有什么区别；
- Review、Citation、Anti-AI 谁先运行；
- Chat、Agent、Tools 模式分别会不会改文件；
- Codex/Copilot Provider 与应用内 Tools 的关系是什么。

建议增加任务型首页或向导，例如：

```text
创建/导入论文
  -> 检查模板和编译环境
  -> 添加并索引资料
  -> 选择写作任务与执行权限
  -> 生成修改建议
  -> 查看 Diff 并接受
  -> 编译与引用检查
  -> 导出
```

### P3-2：危险动作的权限和结果状态没有统一视觉语言

当前“写文件、运行代码、调用外部模型、永久删除、改服务器配置”分散在不同页面，缺少统一的风险标记、执行前确认、运行中状态、取消、结果 provenance 和审计记录。

建议建立统一 Job/Action 状态：queued/running/waiting-review/succeeded/failed/cancelled，并统一展示权限、成本、输入目录、输出文件、Provider、模型、耗时和退出状态。

### P3-3：错误信息常把系统问题伪装成业务空状态

missing project 返回空文件和空 RAG 结果，是最典型例子。类似语义会让用户反复尝试，而不是知道项目 ID、索引、权限或后端版本有问题。

建议建立统一错误码和用户文案：`PROJECT_NOT_FOUND`、`AUTH_REQUIRED`、`CAPABILITY_DISABLED`、`INDEX_CORRUPTED`、`PROVIDER_NOT_READY`、`EXTERNAL_PATH_NOT_ALLOWED` 等，并提供可操作的下一步。

### P3-4：缺少可恢复性和数据保护的显式承诺

论文工具的用户更关心“会不会丢稿”而不是模块数量。当前 UI 没有统一呈现：

- 自动保存状态；
- 最后成功持久化时间；
- Agent 修改前快照；
- 可回滚版本；
- RAG 索引是否与当前文件一致；
- 模板/配置替换失败是否已回滚。

建议把版本历史、Agent diff、恢复点和备份状态作为产品一等能力。

## 8. 已经明显改善、应保留的部分

以下工作是有效的，不应因为仍有阻断问题而推翻：

1. 新项目目录已从纯 UUID 改为可读 slug + 短 ID；
2. rename 已有目录迁移、冲突和回滚实现；
3. RAG index/search 主路由已经补齐；
4. 正式 UI 已列出五类 Provider；
5. Draw Key 已迁移为后端托管方向；
6. 移动端 Files/Editor/Assistant 三视图没有横向溢出；
7. 会话恢复已有独立逻辑和回归测试；
8. 模板入口、编译诊断和预览降级比原版本清晰；
9. EditorPage 首屏 bundle 已显著降低；
10. Legacy Workbench 默认 404；
11. npm 命令入口和隔离 E2E runner 已统一；
12. 正式服务当前前后端至少来自同一重启后的运行单元，Provider API 不再 404。

问题在于这些改进被整改状态文档汇总成“29/29 完成”，但安全和审批层仍存在直接反证。正确做法是保留实现成果，同时把 P0-1、P1-5、P3-1/P3-5 等状态重新标成未完成或部分完成。

## 9. 推荐整改顺序

### 第一阶段：立即止血

1. API 默认认证、最小公开 allowlist；
2. 关闭匿名 HTTP Provider probe/models/invoke；
3. 修复客户端 endpoint 与服务器 Key 混用和 SSRF；
4. 所有 AI Agent/Tools 路径纳入危险能力门禁；
5. Codex Chat 改成只读，Task 修改进入隔离 Diff 审批。

### 第二阶段：数据边界

1. `getProjectRoot` 对已存在项目默认 `allowMissing:false`；
2. 所有项目必须验证合法 `project.json` 身份；
3. symlink/realpath/no-follow 防护；
4. GET 项目列表改为纯读取；
5. missing project 统一 404且不得创建任何目录；
6. 项目详情显示名称、目录、ID和根路径关系。

### 第三阶段：可靠性

1. 模板、RAG、`.env` 原子提交和失败回滚；
2. CLI 流式解析和去重；
3. 编译状态机统一；
4. 前后端 build/schema 握手；
5. Provider capability metadata 与实际行为一致。

### 第四阶段：产品体验

1. 全工作区 i18n 收口；
2. RAG 能力边界和索引状态透明化；
3. Skill readiness/capability manifest；
4. 任务型论文工作流；
5. 统一 Job、Diff、权限、成本和 provenance UI。

### 第五阶段：发布门禁

建立敌对场景矩阵，至少包含：

- Token missing/wrong/correct；
- 全部写路由匿名拒绝；
- CORS 恶意 origin；
- HTTP Provider 密钥捕获和 SSRF；
- AI Tools write/run；
- external path；
- path traversal 和 symlink；
- missing/malformed project；
- 中文、同名和 rename 冲突；
- RAG 索引并发、损坏和检索；
- CLI timeout/cancel/nonzero/JSON split；
- Codex Diff Accept/Reject；
- capabilities 脱敏；
- mobile 390/768；
- conversation restore；
- preview degradation；
- Legacy 404；
- E2E runner 清理；
- 前后端版本不匹配；
- 不调用真实付费模型。

## 10. 验收标准建议

仓库下一次声称“审计问题基本全部完成”前，至少应满足：

- 无 Token 时，除 health 等明确公开接口外，全部写、执行、配置、Provider 和外部调用接口拒绝访问；
- 恶意 endpoint 永远无法获得服务器 Key，且不能访问被禁止的内网地址；
- Chat 模式无法写文件；Agent 修改必须产生 Diff，Reject 后原文件字节不变；
- 所有 managed API 只接受存在且身份匹配的 projectId；
- missing project 返回 404且磁盘零副作用；
- symlink 逃逸测试通过；
- 项目 UI 能解释显示名称、目录名和稳定 ID；
- 中文页面关键工作区不再出现未翻译英文；
- CLI 流式 token 与最终文本一致且不重复；
- 模板、RAG 和配置失败时旧状态可恢复；
- build/schema 不匹配时前端明确阻断；
- 全量 typecheck、build、unit、integration、E2E 和敌对安全场景全部通过；
- 正式 LAN 服务重启后重新做 API 与 Playwright 验收；
- 用户已有论文修改和数据根内容保持不变。

## 11. 证据与推断边界

### 直接证据

- Playwright 实际页面文字、视口、控制台和网络响应；
- 正式 API 的真实 HTTP 状态和响应体；
- 当前数据根中的目录和索引文件；
- 具体源码参数、路由、鉴权逻辑、路径解析和持久化顺序；
- 实际 E2E、构建和 npm audit 输出。

### 强推断

- 匿名写路由结合 `0.0.0.0` 与宽松 CORS，可被局域网用户或恶意网页利用；
- Provider endpoint/key 混用可导致密钥外传和 SSRF；
- `workspace-write` Codex 可以绕过应用 Diff；
- 字符串 safeJoin 无法阻止 symlink；
- 非原子替换在失败和并发条件下可能丢失旧状态。

这些推断均由直接代码路径支持，但本次为避免真实破坏、真实密钥泄露、外网调用和付费模型调用，没有在正式用户数据上执行攻击性利用。

### 当前未知

- 三种 CLI 在当前机器上的真实登录态、模型质量和长任务稳定性；
- 真实 OpenAI/Anthropic/Codex/Claude/Copilot 付费调用结果；
- 大规模论文库下 Project Locator 和 RAG 的性能上限；
- 多用户同时编辑、上传、索引、编译时的实际冲突概率；
- 六项 npm audit 漏洞在当前生产调用路径中的全部可达性。

这些未知项应通过隔离凭据、临时数据根、恶意测试服务和明确成本预算进行后续验证，不应在当前阶段被表述为“已验证完成”。

## 12. 最终判断

当前仓库的功能整改取得了明显进展，基础 E2E 也已经恢复可信度；但独立代码审查结论仍应是：

```text
REQUEST CHANGES / Architectural Status: BLOCK
```

阻断原因集中且明确：

1. 匿名写操作和 HTTP Provider 密钥边界；
2. AI Tools 的认证绕行和任意 external path；
3. Codex workspace-write 没有 Diff 审批；
4. 项目不存在、symlink 和自动注册造成的数据边界问题；
5. 现有测试无法证明上述安全声明。

因此，下一阶段应以“默认安全、修改可审计、项目身份可信、错误语义准确、发布版本一致”为主线，而不是继续增加更多面板或更多 Skill 数量。
