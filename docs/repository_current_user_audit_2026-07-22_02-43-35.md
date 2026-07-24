# Paper Writing 当前仓库用户体验、运行态与系统完整性审计

- 审计时间：2026-07-22 02:36–02:43（Asia/Shanghai）
- 审计对象：`paper_wrighting` 当前工作区、当前 `8787` 正式运行实例、隔离 Playwright 测试实例
- 审计立场：从真实使用者、部署维护者和二次开发者三个视角判断“现在是否真的可用”，不把代码中存在入口等同于已交付
- 审计方式：Playwright 浏览器实测、HTTP/API 实测、磁盘项目映射检查、关键源码与测试审阅、生产构建观察、依赖安全审计
- 变更范围：只新增本报告；未修改业务代码、配置、测试、运行服务或论文项目数据
- 特别保护：未触碰工作区中已有修改 `papers/paper-agent-spe/project.json`

## 1. 一句话结论

当前工作区中的新实现相比此前版本已经补齐了 Provider、RAG、项目定位、移动端、能力诊断和安全门禁等大量能力，隔离 Playwright 也能 13/13 通过；但是用户当前实际访问的 `8787` 服务仍运行旧后端，新前端与旧后端混合部署，导致设置页直接出现 `Not Found`，并且未鉴权命令执行仍可成功。

因此，当前仓库不能简单评价为“功能已修复”或“测试已通过”。更准确的判断是：

> 工作区代码进入了大规模整改后的集成阶段，但运行态、发布态、数据态和质量门禁尚未收敛为同一个可信版本。

从用户角度，当前最先需要解决的不是继续增加更多面板，而是建立“同一版本、默认安全、数据边界明确、真实主流程可验证”的发布闭环。

## 2. 关键实测结果

### 2.1 隔离 Playwright：当前代码的基础浏览器门禁通过

实际执行：

```bash
npm run test:e2e
```

结果：

- Vite 生产构建成功；
- 隔离后端使用随机端口和 `/tmp` 临时数据根；
- Chromium 共运行 13 个用例；
- 13/13 通过，耗时约 5.8 秒；
- 覆盖项目列表、搜索、创建、打开、删除、health/config/projects API、390×844 手机布局、768×1024 平板布局、无 Token 时 capabilities fail-closed。

这证明当前工作区代码至少具备基础可构建性和一组可重复的浏览器冒烟能力。

但该结果不能证明完整论文工作流可用。现有 13 个 E2E 没有覆盖真实编辑保存、真实 LaTeX 编译、RAG 上传与检索、会话刷新恢复、Provider 保存与真实调用、CLI Agent 修改文件、审查/Pipeline/Draw 等主流程，详见 P1-7。

### 2.2 正式运行实例：前端与后端版本不一致

当前监听状态：

```text
0.0.0.0:8787
PID 2767938
启动时间：2026-07-08
进程：node src/index.js
工作目录：app/apps/backend
```

只读 API 验证：

```text
GET /api/health        -> 200 {"ok":true}
GET /api/providers     -> 404 {"error":"Not Found"}
GET /api/capabilities  -> 404 {"error":"Not Found"}
```

但浏览器加载到的前端已经包含五种 Provider 和“系统能力”Tab。Playwright 打开正式实例的设置页后，实际看到：

```text
OpenAI-compatible API
Anthropic API
Codex CLI
Claude Code CLI
GitHub Copilot CLI
...
Not Found
```

浏览器控制台同时记录了 404。直接证据表明：前端 `dist` 已更新，而长期运行的后端没有重启。当前用户拿到的是一个不兼容的前后端组合。

### 2.3 正式运行实例：未鉴权命令执行仍然成功

在不携带 Authorization Header 的情况下，对当前 8787 实例执行只读命令：

```http
POST /api/code/exec
Content-Type: application/json

{
  "projectPath": ".../papers/torq",
  "command": "pwd"
}
```

返回：

```text
HTTP 200
code: 0
stdout: .../papers/torq/code
```

这不是推断，而是正式运行实例的实测结果。当前进程绑定 `0.0.0.0`，因此该风险不仅存在于本机 loopback。

当前工作区源码中的 `middleware/auth.js` 已对命令执行做了 fail-closed 修复，但修复尚未进入正式运行进程。这进一步说明“源码已修”和“用户已安全”是两个不同状态。

### 2.4 正式项目列表：缓存目录被识别为论文项目

Playwright 打开 `/projects` 后，项目列表实际出现：

```text
.pytest_cache
```

磁盘检查确认 `papers/.pytest_cache/project.json` 已存在，并被赋予正式项目 ID。当前项目列表 API 会扫描数据根；若目录没有 `project.json`，但在两层内发现 `.md/.tex/.pdf/.bib/.sty/.cls`，会自动创建项目元数据。`.pytest_cache` 中通常包含 README，因此会被误识别。

这说明一个看似只读的 `GET /api/projects` 具有写磁盘副作用，并会把工具缓存、临时目录或其他含 Markdown 的目录“升级”为正式论文项目。

### 2.5 浏览器离线/受限网络表现：Google Fonts 请求失败

正式实例在桌面和 390×844 手机视口均没有发生页面级横向溢出，但浏览器控制台都出现：

```text
GET https://fonts.googleapis.com/... net::ERR_EMPTY_RESPONSE
```

源码 `app/apps/frontend/src/app/App.css:1` 仍通过 `@import` 请求 Google Fonts。系统已有 CJK fallback，因此页面不一定完全不可读，但“local-first”产品仍依赖外部字体网络，首次渲染、字体一致性、隐私和离线体验都不稳定。

### 2.6 依赖审计：存在 6 个已知漏洞

实际执行：

```bash
npm --prefix app audit --json
```

结果：

| 严重度 | 数量 | 主要包 |
|---|---:|---|
| Critical | 2 | `tar`、`shell-quote` |
| High | 2 | `brace-expansion`、`vite` |
| Moderate | 2 | `react-router`、`react-router-dom` |

其中 `tar` 是直接依赖，且仓库具有归档导入/解包功能，不能只按“开发依赖告警”处理。报告不主张直接运行自动升级，而是要求先确认真实调用路径、可利用输入面和兼容升级版本。

## 3. 问题优先级总览

| ID | 优先级 | 问题 | 证据强度 |
|---|---|---|---|
| P0-1 | P0 | 正式实例仍允许未鉴权命令执行 | 实测，高 |
| P0-2 | P0 | 无 Token 时只关闭少量“危险路由”，项目/配置/RAG/Draw 等写接口仍默认开放 | 代码 + E2E，高 |
| P0-3 | P0 | 新前端与旧后端混合部署，没有版本兼容握手 | Playwright + API，高 |
| P0-4 | P0 | 项目列表 GET 会扫描并写入数据根，已把 `.pytest_cache` 变成项目 | Playwright + 磁盘 + 代码，高 |
| P0-5 | P0 | 依赖树存在 2 个 Critical、2 个 High、2 个 Moderate 漏洞 | `npm audit`，高 |
| P1-1 | P1 | 真实项目身份仍存在名称、ID、目录三者不一致，只有新项目规则改善 | 磁盘，高 |
| P1-2 | P1 | Codex/Claude/Copilot 已接入，但还不是完整、可审计的任务 Agent 体验 | 代码，高 |
| P1-3 | P1 | RAG 已可运行，但本质是词项重叠检索，不是语义 RAG | 代码，高 |
| P1-4 | P1 | 123 个 Skills 的分类与推荐高度依赖正则推断，可发现性和质量保证不足 | 代码 + 清单，高 |
| P1-5 | P1 | 工作区存在大规模未提交集成改动，缺少可识别的发布单元 | Git + 运行态，高 |
| P1-6 | P1 | health 仅证明进程存活，不能识别前后端版本、迁移状态或能力兼容性 | API + 代码，高 |
| P1-7 | P1 | E2E 数量少且覆盖浅，大量“UI 测试”只是源码字符串契约 | 测试代码，高 |
| P1-8 | P1 | 关键写作质量没有评价集：RAG 准确率、Skill 推荐和引用真实性未形成质量门禁 | 测试/文档，高 |
| P2-1 | P2 | 远程 Google Fonts 与 local-first 定位冲突 | Playwright + 代码，高 |
| P2-2 | P2 | 生产构建仍有两个大于 500 KiB 的懒加载 chunk | 构建输出，高 |
| P2-3 | P2 | 主机 `10.30.0.22` 和端口仍在多处源码/脚本中硬编码 | 代码，高 |
| P2-4 | P2 | 根目录仍保留 Coding Kanban/pnpm/旧 Playwright 体系，和当前 npm+app 架构冲突 | 仓库结构，高 |
| P2-5 | P2 | 跟踪了 `.bak` 和 Playwright `.last-run.json` 等本地产物 | Git，高 |
| P2-6 | P2 | 中文界面仍有较多英文设置文案和原始 `Not Found` 错误 | Playwright，高 |
| P2-7 | P2 | 配置写入直接重写 `.env`，缺少原子替换和并发保护 | 代码，中高 |
| P2-8 | P2 | 数据根中存在测试残留目录，真实项目与工具/实验目录边界不清 | 磁盘，高 |

## 4. P0：必须优先处理的问题

### P0-1：运行中的正式服务仍处于未鉴权命令执行状态

**证据：实测。置信度：高。**

当前 8787 实例不带 Token 执行 `pwd` 返回 HTTP 200。当前源码虽然已经在 `app/apps/backend/src/middleware/auth.js:49-80` 实现新的安全逻辑，但正式进程自 7 月 8 日启动后没有加载这些代码。

**用户影响：**

- 同网段访问者可能调用命令、终端或旧版写接口；
- 用户看到的新设置页会产生“安全能力已经上线”的错觉；
- 代码审查和测试报告可能说“已修复”，但实际用户仍暴露在旧风险中。

**改进方向：**

1. 把安全修复是否部署作为 P0 发布门禁，不再用源码状态替代运行态状态；
2. 重启前校验 PID、工作目录、配置、监听端口和数据根；
3. 重启后必须从 LAN 地址重新验证 health、未授权请求、正确 Token、错误 Token；
4. 启动日志和 health 返回构建版本，便于确认当前运行的具体代码；
5. 前端发现后端版本过旧时，应显示整页阻断提示，而不是在设置弹窗里显示 `Not Found`。

### P0-2：当前源码的“无 Token fail-closed”范围仍不完整

**证据：代码 + E2E。置信度：高。**

`app/apps/backend/src/middleware/auth.js:6-21` 只把以下入口标记为危险：

- code run/exec；
- terminal；
- capabilities；
- Provider invoke/cancel 和部分 CLI probe；
- CLI Provider 下的 AI 路由。

当没有配置 Token 时，`auth.js:61-67` 对其余 API 直接放行。当前 E2E 正是在无 Token 模式下创建和永久删除项目，这从侧面证明项目写接口仍是公开的。

仍默认开放的高影响入口包括但不限于：

- `POST/DELETE /api/projects...`：创建、归档、删除或永久删除项目；
- `PUT /api/config`：修改 Provider、模型、Base URL，并重写 `.env`；
- RAG 文档上传、删除、OCR、索引等写操作；
- Draw 生成和文件写入；
- 其他不在危险列表中的项目文件写接口。

**用户影响：** 即使命令执行被关闭，同网段用户仍可能删除论文、篡改模型配置、消耗图片/模型额度或污染 RAG 资料。

**改进方向：**

1. 不应维护一个容易漏项的“危险 URL 列表”；
2. 应默认保护所有非只读 API，公开接口采用显式 allowlist；
3. 至少按 read/write/execute/admin 四类 capability 分权；
4. 所有 POST/PUT/PATCH/DELETE 默认要求认证；
5. 对项目永久删除、配置修改、外部付费调用增加二次确认和审计记录；
6. 增加遍历所有已注册路由的安全契约测试，防止新路由忘记加入列表。

### P0-3：没有前后端版本一致性机制，已发生真实混合部署

**证据：Playwright + API。置信度：高。**

前端包含 `/api/providers` 和 `/api/capabilities` 的 UI，当前后端却对二者返回 404。health 仍返回 200，因此普通健康检查无法发现部署失败。

**改进方向：**

1. 构建时生成统一 `buildId`、Git SHA、API schema version；
2. `/api/health` 或 `/api/version` 返回后端版本、启动时间、schema version、数据迁移状态；
3. 前端构建内嵌期望的 API schema version；
4. 首次加载时执行兼容性握手，不兼容时停止进入工作区；
5. 发布脚本采用“build → 启动新进程 → readiness → 原子切换 → 关闭旧进程”；
6. 验证真实 LAN URL，而不只验证临时测试服务器。

### P0-4：项目发现接口有写副作用，并把非项目目录转成项目

**证据：Playwright + 磁盘 + 代码。置信度：高。**

`app/apps/backend/src/routes/projects.js:113-145` 在处理 `GET /api/projects` 时扫描 `DATA_DIR`。对于没有 `project.json` 的目录，会调用 `createProjectMetaForUploadedFolder()`；该函数在发现论文扩展名后直接写 `project.json`（`projects.js:91-109`）。

当前排除集合只有 `.git`、`.playwright-deps`、`node_modules`、`.compile`，没有通用排除顶层隐藏目录。因此 `.pytest_cache` 被识别为正式项目。

**问题本质：**

- GET 接口不再是幂等只读操作；
- “任意含 Markdown/PDF 的目录”与“用户确认导入的项目”没有区分；
- 一次打开项目页就可能修改磁盘；
- 测试目录、实验结果、缓存和下载目录可能污染项目清单。

**改进方向：**

1. `GET /api/projects` 必须纯读取；
2. 项目必须由显式创建/导入/注册动作产生；
3. 对未注册目录提供“发现候选项目”列表，而不是自动写元数据；
4. 默认排除所有点目录、缓存目录、结果目录和用户配置的 ignore pattern；
5. 项目注册前展示将使用的名称、目录、ID、入口文件和修改内容；
6. 增加 `.pytest_cache`、`.git`、`node_modules`、`results`、临时目录等红灯用例。

### P0-5：依赖安全告警与归档输入面重叠

**证据：`npm audit`。置信度：高。**

当前有 6 个已知漏洞，其中 `tar` 为直接依赖且包含解压/解析 DoS 类 Critical 告警。仓库支持 ZIP、tar/arXiv 源码等外部归档输入，依赖风险与真实攻击面存在交集。

**改进方向：**

1. 先用依赖图确认每个漏洞的运行时可达性；
2. 对直接处理用户归档的 `tar` 优先升级并补恶意归档回归；
3. 限制归档总大小、条目数量、单条目大小、压缩比、路径和解压耗时；
4. 对仅开发态可达的 Vite 告警与生产态依赖分开处置；
5. 把 `npm audit --omit=dev` 和完整 audit 都纳入定期报告，但不要无审查地自动 `audit fix --force`。

## 5. P1：阻塞产品化的问题

### P1-1：新项目命名规则改善了，但真实存量项目仍没有统一身份

**证据：磁盘。置信度：高。**

当前数据根至少存在以下三种情况：

| 磁盘目录 | project.json.id | 显示名称 | 关系 |
|---|---|---|---|
| `60f6c414-...` | 同一 UUID | `moe_prune` | 目录不可读 |
| `moe_prune` | `moe_prune` | 很长的 SNAP 论文标题 | 三者不一致 |
| `paper-agent-spe` | `paper-agent-spe` | `Paper Agent SPE Paper` | 目录与显示名不一致 |
| `.pytest_cache` | 随机 UUID | `.pytest_cache` | 非项目被注册 |

新代码采用“可读 slug + 短 UUID”的目录，只解决未来创建行为；现有项目没有迁移视图、别名解释或一致性诊断，因此用户最初提出的“看到的工程与 papers 子文件夹对不上”在真实数据中仍然存在。

**改进方向：**

1. 设置页提供“项目存储映射”诊断：显示名称、ID、真实目录、来源、兼容状态；
2. 提供只预览、不执行的迁移计划；
3. 对旧 UUID 目录、旧可读目录、自定义 ID 分别制定迁移策略；
4. 迁移必须支持冲突检测、回滚、符号链接/别名过渡和外部工具引用检查；
5. 项目卡片可提供“在磁盘中显示”与“复制真实路径”。

### P1-2：CLI Provider 已接入，但“直接让 Codex/Copilot 完成任务”仍缺少产品级控制面

**证据：代码。置信度：高。**

当前已支持 `codex-cli`、`claude-cli`、`copilot-cli`，这是正确方向。CLI 固定 executable、参数、cwd 和环境白名单，也比客户端任意传命令安全。

但当前能力仍更接近“把 CLI 当成 Chat completion 后端”：

- `CLI_CAPABILITIES.toolCalling = false`（`agentProviderRegistry.js:63-71`）；
- CLI Provider 的 `chatWithTools` 明确拒绝，只允许 Chat mode（`llmService.js:433-445`）；
- Codex 使用 `--ephemeral --sandbox workspace-write`，能够写项目，但 UI 没有对应的文件变更计划、diff 审批、逐步进度、回滚和任务恢复；
- Claude/Copilot 禁用工具，而 Codex 自己可写工作区，三种 Provider 的实际行为不对称；
- 没有跨刷新任务恢复、后台任务队列、成本/Token 统计、会话继续或产物验收；
- 自动化只做 probe/契约验证，没有真实、无付费或 mock CLI 的“修改文件 → 展示 diff → 用户采纳/拒绝”浏览器闭环。

**改进方向：**

1. 明确区分 Chat Provider 与 Task Agent Provider；
2. Task Agent 统一状态机：queued/running/waiting-review/succeeded/failed/cancelled；
3. 默认使用只读分析或 patch proposal，不允许静默写主文件；
4. 每次写入展示文件列表、diff、命令、provenance 和可回滚快照；
5. 统一 Codex/Claude/Copilot 的 capability 声明，不能只靠同一 Provider 下拉框掩盖行为差异；
6. 用 mock CLI 做完整 E2E，再把真实 CLI 登录态测试作为部署验收项；
7. 对付费调用显示 Provider、模型、预计成本和取消能力。

### P1-3：RAG 核心链路已打通，但检索能力仍停留在轻量关键词层

**证据：代码。置信度：高。**

`paperRagService.js:470-495` 的检索流程是：

1. 对 query 分词；
2. 对所有 chunk 做词项集合重叠计分；
3. 没有词项重叠则返回空；
4. 按 `overlap + density` 排序。

`scoreChunk()` 和 `tokenize()` 位于 `paperRagService.js:1810-1839`。中文使用连续二元字符，英文只按字母数字 token；没有 embedding、BM25/IDF、reranker、同义词、术语归一化或跨语言语义匹配。

**用户影响：**

- 用户换一种表达方式可能完全检索不到；
- 中英文混合论文、缩写和全称、方法名与描述性 query 的召回不稳定；
- chunks 全量保存在 JSON 并逐条计算，语料扩大后性能和并发能力有限；
- 分数不是可解释的概率，也没有离线检索质量基准。

**改进方向：**

1. 保留当前 lexical 作为离线 fallback；
2. 增加可插拔 embedding/vector backend；
3. 默认采用 hybrid retrieval：BM25/关键词 + embedding + rerank；
4. 建立论文场景 query 集，测 Recall@K、MRR、引用覆盖率和错误来源率；
5. 在 UI 明确当前使用“关键词检索”还是“语义检索”；
6. 增量索引而不是每次全量重建；
7. 为证据 chunk 保存页码、章节、解析器、文档版本和稳定指纹。

### P1-4：Skills 数量很多，但推荐和分类仍较脆弱

**证据：代码 + 目录。置信度：高。**

当前 `app/apps/backend/skills` 有 123 个条目。数量丰富并不等于用户能有效选择。

`skillEngine.js:1353-1448` 通过名称、描述和 tags 的正则表达式推断中文分类、学术分类和子分类。fallback 还会自动生成通用 inputs、outputs、best_for 和低风险标签。该方式能快速整理第三方 Skill，但存在：

- 同一个词可能触发错误分类；
- 自动生成的元数据看起来完整，却不一定反映 Skill 的真实依赖和行为；
- 123 个 Skill 容易出现功能重复、名称近似和选择疲劳；
- 缺少每个 Skill 的安装依赖、外部服务、网络、密钥、写文件、执行命令等 capability 声明；
- 没有以真实任务为基础的推荐准确率评测；
- 第三方 Skill 更新后可能改变行为，但当前主要验证 manifest 数量与结构一致性。

**改进方向：**

1. 以 manifest 中的显式 schema 为权威，正则推断只用于导入草稿；
2. 引入 risk、permissions、dependencies、network、secrets、writes、commands 等字段；
3. 将 Skill 状态分为 installed/ready/degraded/unavailable；
4. 合并高度重复 Skill，默认只展示精选核心集，高级模式再展示全部；
5. 建立 30–50 个真实论文任务的推荐金标集；
6. 展示“为什么推荐”“需要什么输入”“将产生什么副作用”；
7. 第三方 Skill 更新必须经过 schema 验证和行为回归。

### P1-5：大量未提交改动使“当前版本”不可识别

**证据：Git 状态。置信度：高。**

当前工作区包含大量已修改和未跟踪的前后端、测试和文档文件，另有用户论文元数据修改。运行中的后端来自旧进程，前端 dist 则来自新构建。

**用户影响：**

- 无法通过 commit 判断运行版本；
- 重启可能一次性带入大量尚未审查的变化；
- 出现回归后难以定位是哪一批修改导致；
- 文档中的“29/29 已完成”描述的是工作区实现，不等于一个已发布、可回滚的版本。

**改进方向：**

1. 将整改拆成可审查的主题提交或至少形成 release candidate 快照；
2. 业务代码、生成 dist、用户论文数据必须分离；
3. 发布记录包含 commit、构建时间、迁移说明、配置差异和验证清单；
4. 不允许从含无关用户论文改动的工作区直接发布；
5. 建立 staging 实例验证后再替换 8787 正式进程。

### P1-6：health 检查过于弱，无法发现当前这种故障

**证据：API。置信度：高。**

当前正式实例 `/api/health` 返回 `{"ok":true}`，但 Provider 和 capabilities 路由不存在，未鉴权命令执行仍开放。health 只说明 Fastify 能响应，不说明产品可用或安全。

**改进方向：**

- liveness：进程是否存活；
- readiness：数据根可读写、关键路由注册、前后端 schema 匹配；
- version：buildId/Git SHA/启动时间；
- securityMode：Token 是否配置、危险能力是否关闭；
- dependency summary：TeX、Pandoc、OCR、CLI Provider 的聚合状态；
- 不在公开 health 中泄露路径或密钥，只返回稳定状态码和脱敏摘要。

### P1-7：E2E 通过，但不能作为完整发布门禁

**证据：测试代码。置信度：高。**

当前 E2E 只有三个 spec、13 个测试：

- `projects.spec.ts`：项目页和 API 冒烟；
- `mobile-workspace.spec.ts`：手机/平板切换与无横向溢出；
- `capabilities.spec.ts`：无 Token 503；有 Token 分支中，浏览器展示部分使用 route mock，而不是真实 capability 响应。

大量所谓“UI contract”测试只是读取 `.tsx/.css/.ts` 源码并断言字符串存在。例如 `providerSettingsContract.test.mjs` 只确认源文件包含 Provider 名称、`await` 和状态 setter；`mobileI18nContract.test.mjs` 只确认 CSS 中存在 media query 和字体名称。这些测试可防止明显删除，但不能证明真实交互正确。

**缺少的关键 E2E：**

1. 从 UI 新建中文/同名项目，并核对真实目录；
2. 编辑、保存、刷新、恢复 tab 和活动会话；
3. 上传证据、自动索引、搜索、引用到 AI 上下文；
4. 真实设置 Provider、失败保持弹窗、重载后生效；
5. mock Codex/Claude/Copilot 的任务调用、取消、超时和 diff；
6. 真实 LaTeX 编译成功、warning、失败、缺图；
7. 未授权项目删除/配置修改必须失败；
8. 前后端版本不匹配时必须阻断；
9. `.pytest_cache` 不得出现在项目列表；
10. LAN URL 冒烟，而不是只测 127.0.0.1 临时服务器。

### P1-8：系统验证“功能存在”，但没有验证学术质量

**证据：测试和实现范围。置信度：高。**

论文写作系统的核心风险不是只有 404 或页面溢出，还包括：

- RAG 找错证据；
- 引文与 claim 不匹配；
- Skill 推荐错误；
- AI 改写丢失数字、公式或引用；
- 同一任务多次运行结果不稳定；
- CLI Agent 修改了不应修改的文件。

当前测试主要覆盖结构、路由和机械行为，没有形成一组稳定的学术任务 benchmark。

**改进方向：** 建立小型、可人工复核的黄金项目，包含中英文论文、PDF、BibTeX、公式、表格、缺图和错误引用；每次发布测检索召回、引用支持率、保真率、Skill 推荐、编译成功率和 Agent 越权修改率。

## 6. P2：体验、可维护性与仓库卫生问题

### P2-1：外部字体依赖破坏离线一致性

`App.css:1` 仍引用 Google Fonts。Playwright 已实际观察到请求失败。

建议将必要字体本地化或完全使用系统字体栈；若保留外部字体，应设置合理的 CSP、preconnect、fallback 和可关闭选项，并确保无网络时不产生明显布局变化。

### P2-2：懒加载后首屏改善明显，但重功能 chunk 仍很大

生产构建输出：

```text
EditorPage                126.76 KiB
RenderedPreviewPane       510.02 KiB
MarkdownEditor            583.94 KiB
```

首屏从约 1.3 MiB 降到 126 KiB 是有效改进，但 Markdown 编辑器和预览仍触发 Vite 500 KiB 告警。弱网或首次打开具体功能时仍可能明显卡顿。

建议继续拆分语言包、编辑器插件、预览解析器，并用真实浏览器记录 interaction-to-ready，而不只看 chunk 大小。

### P2-3：机器相关地址仍被硬编码

发现的主要位置：

- `app/apps/backend/src/index.js:146`：默认 `10.30.0.22`；
- `app/apps/frontend/vite.config.ts:65`：默认代理到 `10.30.0.22:8787`；
- `scripts/run-server.sh:16`；
- `scripts/restart.sh:101`；
- `app/apps/backend/src/routes/mcp.js:26`。

这与仓库规则中的“用户/机器相关配置严禁硬编码”直接冲突，也会让其他机器、容器、VPN 或多网卡环境出现错误地址。

建议运行时自动从请求 Host、显式环境变量或网卡探测中选择展示地址；源码默认值使用 loopback 或空值，LAN 地址只作为文档示例。

### P2-4：根目录仍混有另一套 Coding Kanban 工程遗留

根目录当前 `package.json` 已改为 npm 代理到 `app/`，但仍存在：

- `src/README.md` 描述 Coding Kanban、`apps/web`、`apps/server` 和 pnpm；
- 根 `playwright.config.ts` 仍启动 `pnpm --filter server/web`；
- 根 `tests/e2e/` 是 tmux、terminal、VS Code Web、Coding Kanban 测试；
- `pnpm-workspace.yaml`、根 `node_modules/.pnpm` 仍存在；
- 根和 `app/` 各有 Playwright 配置、测试结果目录和依赖树。

对新使用者而言，无法判断哪个入口是当前产品、哪些命令仍有效、哪些测试属于历史系统。

建议明确做一次仓库边界决策：

1. 若 Coding Kanban 仍是组成部分，应恢复清晰 monorepo 结构和统一命令；
2. 若已迁移到 Paper Agent，应把旧代码、测试和文档归档或移出主仓库；
3. 根目录只保留一套 package manager、Playwright 配置和启动说明；
4. CI 应验证不存在指向已不存在目录的命令。

### P2-5：存在应清理的跟踪文件和备份文件

已确认：

- `app/apps/frontend/src/app/components/SkillsSelector.tsx.bak` 被 Git 跟踪，约 119 KiB；
- `app/test-results/.last-run.json` 和 `test-results/.last-run.json` 被 Git 跟踪；
- 根和 app 下存在重复测试结果目录；
- `.gitignore` 中还有拼写疑似错误的 `.playwright-debs/`。

这类文件会制造搜索噪声、误导代码审阅，并可能让静态扫描同时命中新旧实现。

### P2-6：国际化已改善，但实际中文界面仍混入英文和原始后端错误

正式设置页在中文模式下实际显示 `SERVER ACCESS TOKEN`、`PROVIDER`、`API BASE URL`、`API KEY`、`Load models`、`Test connection`、`Not Found` 等内容。

其中一部分来自运行态版本错配，一部分说明翻译 key 的中文值仍可能复用英文。建议增加 Playwright 文案快照或关键页面“中文不得出现未允许英文 key”的检查，并把原始 HTTP 错误映射为用户可理解的诊断。

### P2-7：配置文件写入缺少原子性和并发控制

`appConfig.js:124-175` 读取 `.env`、合并值后直接 `writeFile()` 覆盖。没有临时文件 + rename、文件锁、版本号或并发冲突检测。

如果两个请求同时保存设置，或写入过程中进程退出，配置可能丢失或部分覆盖。建议使用原子替换、保存前 schema 校验、并发版本字段，并记录“需要重启”还是“已热生效”。

### P2-8：真实项目根混合了论文、实验、缓存和测试残留

当前 `papers/` 中既有长期论文项目，也有 `.pytest_cache`、实验型大目录、归档项目和 `test-conv-api-*` 残留目录。即使这些测试目录没有进入 UI，也说明测试与真实数据根曾经混用。

建议：

- 测试强制使用临时数据根；
- 正式数据根只允许注册项目；
- 实验输出与论文工作区分层；
- 提供只读的数据根健康检查，报告孤儿目录、重复 ID、缺失 metadata、隐藏目录和测试残留；
- 清理必须由用户确认，不能由审计自动删除。

## 7. 推荐改进路线

### 阶段 0：先让正式运行态安全且版本一致

1. 不带 Token 时禁止所有写、执行、配置和付费外部调用；
2. 从 staging 启动当前工作区构建，验证后再切换 8787；
3. 加入前后端 buildId/schema 握手；
4. 从 LAN 地址复测未授权、错误 Token、正确 Token；
5. 确认正式进程只存在一个，并能明确定位 PID、日志和版本。

### 阶段 1：修正数据根与项目身份

1. 移除 GET 列表的自动写 metadata 行为；
2. 排除隐藏/缓存/结果/测试目录；
3. 新增项目存储映射和健康诊断；
4. 为存量项目生成迁移预览，不自动迁移；
5. 建立 ID、显示名、目录名和入口文件的唯一契约。

### 阶段 2：把 Provider 变成真正的可控 Agent 后端

1. Chat 和 Task Agent 分离；
2. 增加任务状态、进度、diff、审批、取消、恢复和回滚；
3. 为 Codex/Claude/Copilot 建立同构 capability schema；
4. 使用 mock CLI 完成无付费 E2E；
5. 真实 CLI 登录态和版本作为部署验收，而不是单元测试假设。

### 阶段 3：提高 RAG 与 Skills 的质量，而不是继续堆数量

1. RAG 增加 hybrid/semantic retrieval 与增量索引；
2. 建立论文检索黄金 query 集；
3. Skills 使用显式权限和依赖 manifest；
4. 默认精选核心 Skills，去重并解释推荐原因；
5. 用真实任务评价推荐准确率和输出质量。

### 阶段 4：收敛仓库、测试和发布工程

1. 清理或归档 Coding Kanban/pnpm/旧 Playwright 遗留；
2. 删除 `.bak` 和被跟踪的测试结果文件；
3. 升级有真实运行时风险的依赖；
4. E2E 覆盖完整论文主旅程；
5. CI 产出版本化构建物和发布证据；
6. health/readiness/version 分离。

## 8. 建议新增的红绿灯验收用例

### 安全

- 无 Token：所有 POST/PUT/PATCH/DELETE 返回 503 或 401；
- 无 Token：Draw、RAG 上传、项目删除、配置保存均不能执行；
- 错误 Token 返回 403；
- 正确 Token 可执行被授权能力；
- 新增任意写路由但未声明 auth policy 时测试自动失败。

### 部署一致性

- 前端 buildId 与后端 buildId 一致时进入工作区；
- 不一致时显示阻断页；
- readiness 在关键路由缺失时失败；
- LAN URL 上完成同样验证。

### 项目发现与身份

- `.pytest_cache`、`.git`、`node_modules`、`results` 永远不进入项目列表；
- GET 项目列表前后磁盘哈希不变；
- 中文名、空格、符号、同名项目映射明确；
- 存量 UUID 目录在 UI 显示真实映射；
- 重命名、迁移冲突和回滚可验证。

### Provider/Agent

- mock Codex 提交 patch，UI 展示 diff，拒绝后文件不变；
- 取消和超时能杀死进程树；
- 刷新后恢复任务状态；
- CLI 不得修改项目根外文件；
- Provider 能力差异在 UI 明确展示。

### RAG

- 同义表达仍能召回同一证据；
- 中英文 query 可命中对应段落；
- 文档更新后只增量更新相关 chunk；
- 搜索结果显示页码、章节、版本和解析器；
- 建立 Recall@K/MRR 最低阈值。

### 完整论文旅程

- 新建项目 → 编辑 → 保存 → 上传证据 → 检索 → AI 草稿 → 引用核验 → 编译 PDF → 刷新恢复；
- 手机和平板至少完成打开文件、编辑短文本、发送 Chat、查看编译结果；
- 失败场景必须给用户明确、可执行的恢复建议。

## 9. 已确认、推断与未验证边界

### 已确认

- 当前隔离 Playwright 13/13 通过；
- 当前正式后端缺少 providers/capabilities 路由；
- 当前正式实例未鉴权执行 `pwd` 成功；
- 正式前端设置页出现 `Not Found`；
- `.pytest_cache` 被列为项目并存在 `project.json`；
- 当前源码无 Token 时仍放行未列为 dangerous 的 API；
- RAG 使用本地词项重叠评分；
- CLI Provider 不支持 application-managed tool calling；
- Google Fonts 请求在实际浏览器中失败；
- 构建存在两个超过 500 KiB 的懒加载 chunk；
- npm audit 报告 6 个漏洞；
- 仓库存在硬编码 LAN 地址、旧 Coding Kanban/pnpm 测试体系、跟踪的 `.bak` 和 `.last-run.json`。

### 高可信推断

- 当前发布流程允许前端构建物被更新而后端进程保持旧版本；
- 只依赖现有 E2E 不能阻止类似混合部署；
- 123 个 Skills 在没有显式 capability/质量评分时会增加选择成本；
- 关键词 RAG 在同义词、跨语言和术语变体上召回会明显弱于 hybrid retrieval；
- 未保护的项目/配置/RAG/Draw 写接口在 LAN 环境具有真实破坏或成本风险。

### 本轮未验证

- 未调用真实付费 LLM、图片模型、MinerU、GPTZero 或外部搜索；
- 未让真实 Codex/Claude/Copilot 修改论文文件；
- 未执行项目永久删除、配置修改、RAG 文档删除等破坏性正式实例操作；
- 未修改或迁移任何存量项目目录；
- 未验证多用户并发写、断电恢复、长时间 Agent 稳定性；
- 未对 123 个 Skills 逐个运行依赖和行为测试；
- 未对 RAG 计算正式 Recall@K/MRR；
- 未进行完整无障碍审计、跨浏览器 Firefox/WebKit 验证或弱网性能测试。

## 10. 最终建议

当前最不应做的事情是继续以“新增一个面板/再接一个 Skill”作为主要进度指标。仓库已经不缺功能入口，真正缺少的是以下四个产品契约：

1. **运行契约：** 用户访问的前端和后端必须来自同一可识别版本；
2. **安全契约：** LAN 可见时，所有写入、执行、配置和付费调用默认受保护；
3. **数据契约：** 项目必须显式注册，名称、ID、目录和真实文件位置可解释；
4. **质量契约：** 测试不仅证明按钮存在，还要证明完整论文任务正确、可恢复、不会越权。

建议把 P0-1 至 P0-5 作为下一次正式使用前的硬门禁；完成后再推进项目迁移、Agent 任务控制面、语义 RAG 和 Skills 精选。只有当正式 8787 实例通过 LAN Playwright 主旅程、版本握手和全写接口鉴权测试后，才能认为当前整改真正交付给了使用者。
