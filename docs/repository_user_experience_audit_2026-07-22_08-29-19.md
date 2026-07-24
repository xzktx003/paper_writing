# Paper Writing 仓库当前用户问题与改进审计

- 审计时间：2026-07-22 08:29:19（Asia/Shanghai）
- 仓库路径：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting`
- Git commit：`f0ef1484486ef3cace679d3c4fb480ed17532244`
- 正式访问地址：`http://10.30.0.22:8787`
- 正式后端进程：PID `575763`，启动时间 `2026-07-22 02:56:52`
- 审计视角：首次使用者、日常论文作者、管理员、后续维护者
- 审计边界：只发现问题和提出优化方向；不修改业务代码、不重启服务、不改写正式论文、不调用真实付费模型
- 证据来源：正式 LAN Playwright、隔离 Playwright、HTTP 探测、当前源码、测试、进程、数据目录、Git 工作区与现有文档

## 1. 总体判断

当前仓库已经不再是“完全缺功能”的状态。项目身份模型、CLI Provider、可审查 CLI Task Agent、Skills readiness、RAG health、构建版本握手、移动端布局、默认拒绝鉴权等方向，在当前源码中都有实质实现。

但从真实用户角度，当前版本仍不具备正式可用条件。最主要的问题不是单个按钮，而是以下四个层次仍未一致：

```text
当前工作区源码
≠ 当前 frontend dist
≠ 正式 8787 后端进程
≠ 用户实际看到的数据根和项目列表
```

本轮最重要的结论是：

1. 正式桌面、手机、平板均被“前后端版本不一致”页面阻断，用户无法进入项目列表或编辑器。
2. 正式后端仍是旧进程：`/api/ready` 为 404，`authRequired:false`，无 Token 和错误 Token 都能访问配置、项目和 Provider 元数据。
3. 正式后端的数据根是 `/data01/home/xuzk/papers`，而用户实际论文主要位于仓库的 `paper_wrighting/papers`；因此“UI 项目与 papers 子目录对不上”的现场原因仍然存在。
4. 当前源码的真实 Token 首次配置流程有缺陷：应用 Token 后只刷新设置弹窗，不刷新父页面项目列表，用户仍看到空表。
5. 当前源码的图片、PDF 和文件下载仍有鉴权断层：普通 `fetch` 能带 session Token，但 `<img>`、`<embed>` 和直接下载链接不会自动携带 Bearer Token。
6. Draw.io 和 LaTeX 预览仍依赖运行时外网。本轮实测 jsDelivr 和 diagrams.net 都失败；LaTeX 可回退显示，Draw.io 则永久停在 Loading。
7. Codex、Claude Code、Copilot 的接入方向已经实现，不应再按“完全没有 CLI Provider”重复开发；但正式环境因未配置服务 Token 而不可用，真实账号/版本/质量也尚未完成正式验收。
8. Skills 有 123 个、加载错误为 0，但 123 个全部是 `degraded`，没有任何一个被证明为 `ready`；真实模型引导执行也没有进入持久运行账本。
9. RAG 的索引健康、generation、fingerprint、损坏诊断已经改善，但核心检索仍是关键词重叠，不是语义向量 RAG；外部多源检索的失败和评分也缺少透明度。
10. 类型检查、405 项单元测试、9 项选定隔离 E2E 和依赖审计都通过，但一个专门覆盖真实浏览器 Token 流程的 E2E 仍失败，说明“测试数量多”不等于首用闭环已经成立。
11. 仓库有 198 条工作区状态记录，105 个文件进入 tracked diff；同一天存在多份互相覆盖的审计文档，源码、文档、dist 和运行实例的事实容易继续漂移。

综合结论：当前工作区适合作为正在整改的开发版本，但不应标记为“正式可用”“全部整改完成”或“已经通过用户验收”。

## 2. 证据说明

本文把结论分成四类：

- **实测证据**：本轮 Playwright、HTTP、测试命令或文件系统直接观察到。
- **源码证据**：当前源码明确存在某种实现，但不代表正式进程已经加载。
- **推断**：由相同浏览器机制或多个证据得出的高可信结论。
- **未知**：在不写正式数据、不重启、不调用付费模型的边界内无法确认。

正式论文保护基线保持不变：

```text
papers/paper-agent-spe/project.json
SHA-256: 55f3be5579a0a00fc8ae7b1bdaaedf6c20b6fad7647d4f869358f0aadc3958d5
```

## 3. Playwright 实际使用结果

### 3.1 正式 LAN：桌面、手机、平板全部被版本门禁阻断

本轮使用真实 Chromium 分别访问 `http://10.30.0.22:8787`：

| 设备 | 视口 | 导航结果 | 用户实际看到的内容 | 横向溢出 | 页面脚本错误 |
| --- | ---: | ---: | --- | ---: | ---: |
| 桌面 | 1440×900 | 200 | 前后端版本不一致 | 无 | 无 |
| 手机 | 390×844 | 200 | 前后端版本不一致 | 无 | 无 |
| 平板 | 768×1024 | 200 | 前后端版本不一致 | 无 | 无 |

页面显示：

```text
前后端版本不一致
当前页面与服务器不是同一次构建。为避免使用旧接口修改论文，工作区已暂停加载。
missing-build-metadata
Frontend build 20260721233147-f0ef1484486e-a87e0bb3 is not compatible with the running backend.
```

这说明两个事实同时成立：

- 新增的部署保护页面能够阻止新前端误用旧后端，这是正确的安全退化；
- 对最终用户而言，正式系统依然完全不可操作，项目、Provider、Skills、RAG 和编辑器均不可达。

与 07:23 的旧审计相比，之前的全局空白页已经被修复，因此不能继续把“空白页”当作当前问题；当前问题已经变成“正式前后端没有作为同一发布单元完成部署”。

### 3.2 当前源码：真实 Token 首用流程失败

隔离 Playwright 使用：

- 临时项目数据根；
- 随机本地端口；
- 随机测试 Token；
- 一个明确移除 Playwright 全局 Authorization header 的全新浏览器 context。

真实步骤：

1. 浏览器无 Token 打开项目页；
2. 项目和模板请求被保护；
3. 用户打开设置；
4. 输入正确服务 Token；
5. 点击“应用”；
6. 等待项目列表出现已有项目。

实际结果：

```text
1 failed
Expected table to contain: Real-Auth-E2E-...
Received: 名称标签最后修改操作
```

源码原因清楚：

- `SettingsModal.tsx:214-218` 的 `applyAccessToken()` 只保存 Token 并执行弹窗内部 `reload()`；
- `ProjectPage.tsx:106-130` 的项目和模板只在页面挂载时加载；
- `ProjectPage.tsx:1040` 给 `SettingsModal` 只传入 `open/onClose`，没有“Token 已应用后重新加载父页面”的回调。

用户体验后果：

- 首次访问会看到空项目表，而不是明确的“需要 Token”状态；
- 正确输入 Token 后，设置弹窗可能看起来成功，但项目仍不出现；
- 用户只能靠手动刷新整页恢复；
- 普通 E2E 通过 `extraHTTPHeaders` 预先加 Token，会绕过这个首用缺陷。

### 3.3 当前源码：受保护图片和下载在真实浏览器中失败

隔离 Playwright 使用 sessionStorage 中的服务 Token，但没有 Playwright 全局请求头。创建临时 SVG 后进入编辑器：

```text
GET /api/projects/:id/blob -> 401
img element count          -> 1
img.naturalWidth           -> 0
download failure           -> canceled
```

这不是 Token 本身无效，因为同页面的 `fetch` 请求均为 200：

- conversations：200；
- project tree：200；
- project file：200；
- project files：200。

源码证据：

- `CenterPanel.tsx:425-438` 直接把受保护 API URL 赋给 `<img src>` 和 `<embed src>`；
- `ProjectTree.tsx:128-137` 创建 `<a href="/api/.../download">` 并直接点击；
- 浏览器的图片、嵌入和导航请求不会读取应用的 sessionStorage，也不会经过全局 `fetch` 包装器。

已实测图片和下载失败。PDF 使用相同的直接 `<embed src>` 机制，因此“PDF 在 Token 模式下也会失败”是高可信机制推断，尚未在本轮用真实 PDF 文件单独复测。

### 3.4 当前源码：外部依赖失败时 Draw.io 永久 Loading

隔离 Playwright 创建了临时 `.tex` 和 `.drawio` 文件，进入编辑器并实际打开：

```text
https://cdn.jsdelivr.net/.../fonts.css -> net::ERR_EMPTY_RESPONSE
https://embed.diagrams.net/...         -> net::ERR_EMPTY_RESPONSE
```

结果：

- LaTeX 正文仍能依靠回退字体显示；
- Draw.io 8 秒后仍显示 `Loading Draw.io editor...`；
- 页面没有出现失败原因、超时、重试、离线模式或 XML 源码入口。

源码证据：

- `LatexPreview.tsx:206` 硬编码 jsDelivr 字体 CSS；
- `DrawioEditor.tsx:10` 硬编码 diagrams.net；
- `DrawioEditor.tsx:29` 声明了 `error` state，但当前流程没有把网络失败写入该状态；
- `DrawioEditor.tsx:35-37` 使用 `includes()` 判断消息 origin；
- `DrawioEditor.tsx:45-157` 多次使用 `postMessage(..., '*')`；
- iframe 没有就绪超时和失败降级。

### 3.5 已通过的当前源码浏览器场景

以下 9 项隔离 Playwright 通过：

- 手机项目列表和编辑器可操作；
- 平板项目列表和编辑器可操作；
- Provider 设置说明服务 Token、模型凭据、CLI 登录和只读范围；
- 系统能力页的 build mismatch 阻断；
- 系统能力页的 fail-closed 和显式认证路径；
- RAG health 和 rebuild provenance；
- 损坏 RAG 索引只读诊断和显式修复；
- Skills readiness、只读检查和 unavailable 禁用；
- 核心页面不请求 Google Fonts。

这批通过项证明当前源码的多个方向已经改善。但离线字体测试只禁止 Google Fonts，没有禁止 jsDelivr，因此它通过时，LaTeX 仍然实际请求远程字体。

## 4. 问题优先级总表

| 编号 | 优先级 | 问题 | 证据类型 | 当前用户影响 |
| --- | --- | --- | --- | --- |
| P0-1 | P0 | 正式前后端版本不一致，所有设备被阻断 | LAN Playwright | 整个系统不可进入 |
| P0-2 | P0 | 正式旧后端无 Token/错误 Token 仍开放业务元数据 | HTTP 实测 | LAN 暴露项目与配置事实 |
| P0-3 | P0 | 正式数据根与仓库论文目录不是同一目录 | API + 文件系统 | UI 项目与实际 papers 不一致 |
| P0-4 | P0 | Token 应用后父页面不刷新 | 隔离 Playwright + 源码 | 首次配置后仍显示空项目表 |
| P0-5 | P0 | 图片/PDF/下载绕过 session Token | 隔离 Playwright + 源码 | 受保护资源不能预览或下载 |
| P1-1 | P1 | Draw.io 外网失败后永久 Loading | 隔离 Playwright + 源码 | 图表编辑完全卡死 |
| P1-2 | P1 | LaTeX 预览仍请求远程字体 | 隔离 Playwright + 源码 | 离线不完整、隐私和稳定性下降 |
| P1-3 | P1 | CLI Provider 源码已实现，但正式环境不可用且未做真实验收 | API + CLI + 测试边界 | 用户仍无法在正式 UI 使用 Codex/Copilot |
| P1-4 | P1 | Skills 123/123 degraded，真实执行账本未闭环 | 运行时审计 + 源码 | “存在 Skill”不等于“可可靠执行” |
| P1-5 | P1 | RAG 是关键词检索，外部多源失败被静默降为空 | 源码 | 召回质量和故障解释不足 |
| P1-6 | P1 | 项目身份虽已改善，但旧目录、测试目录和正式根长期混杂 | 文件系统 + 源码 | 用户仍难理解“项目到底在哪里” |
| P2-1 | P2 | 模板目录与 manifest 不一致，分类多数为空 | 文件系统 + manifest | 用户看到空分类、可用模板少 |
| P2-2 | P2 | 调试日志无条件输出 Prompt、消息和文件信息 | 源码 | 隐私、日志噪声和诊断风险 |
| P2-3 | P2 | 机器 IP 和 public host 仍有硬编码默认值 | 源码 + 文档 | 换机器、换网段和部署迁移困难 |
| P2-4 | P2 | 常规 check 不包含浏览器 E2E | package scripts | 首屏/首用浏览器回归可能漏过 |
| P2-5 | P2 | 文档状态与代码状态漂移 | 文档 + 源码 | 后续维护者会基于过期事实决策 |
| P2-6 | P2 | 工作区过度混杂，无法形成可追溯发布候选 | Git 状态 | 回滚、复现和审查困难 |
| P3-1 | P3 | 多个核心模块过大 | 文件规模 | 维护成本和回归概率持续升高 |
| P3-2 | P3 | 缺少任务级质量指标和真实 Provider 兼容矩阵 | 测试边界 | 功能“能启动”但质量未知 |

## 5. P0：正式发布状态不可用

### 5.1 正式后端没有加载当前源码的鉴权和 readiness

正式 API 实测：

```text
GET /api/health -> 200 {"ok":true,"authRequired":false}
GET /api/ready  -> 404 {"error":"Not Found"}
```

无 Token与错误 Token 的结果相同：

| API | 无 Token | 明显错误 Token |
| --- | ---: | ---: |
| `/api/config` | 200 | 200 |
| `/api/projects` | 200 | 200 |
| `/api/providers` | 200 | 200 |

而当前源码 `middleware/auth.js:1-67` 已经采用：

- 只公开 health、ready、providers 和受限 collab 路由；
- 未配置 Token 时关闭所有非公开 API；
- 缺 Token 返回 401；
- 错 Token 返回 403。

因此这里不是“当前源码完全没鉴权”，而是“正式进程仍运行旧快照”。发布后必须重新执行无 Token、错误 Token、正确 Token 三类验收，不能以源码测试代替运行态验证。

### 5.2 正式数据根配置错位是项目名/目录错配的直接现场原因

正式 `/api/config` 返回：

```text
projects_dir = /data01/home/xuzk/papers
```

正式根目录只有 4 个子目录，其中只有 2 个有可识别 `project.json`。正式 `/api/projects` 也只返回 2 个项目，并且名称明显像测试或迁移样例。

仓库 `paper_wrighting/papers` 有 15 个子目录，包含：

- `MSAVQ`；
- `moe_prune`；
- `moe_prune_v2`；
- `paper-agent`；
- `paper-agent-spe`；
- `perblock`；
- `torq`；
- 其他论文与测试目录。

两处目录不是同一个位置。因此用户在仓库中看到论文文件夹，却在 Web UI 中看不到，是配置事实，不是前端展示错觉。

优化方向：

1. 明确唯一权威变量 `OPENPRISM_DATA_DIR`，旧 `OPENPRISM_PROJECTS_DIR` 只做兼容读。
2. 启动页和能力页显示实际数据根、是否存在、项目数和候选目录数。
3. 数据根变更必须先做只读差异预览，禁止隐式移动或删除论文。
4. 对旧正式根中的测试样例进行人工确认后再迁移、归档或删除。
5. 发布验收必须比较“UI 项目、API directoryName、权威数据根真实子目录”。

## 6. P0：Token 鉴权在浏览器资源层没有形成闭环

当前 Token 存储在 `sessionStorage`，普通同源 API `fetch` 会由 `serverAccess.ts` 添加 Bearer header。这一方向能避免把 Token 写入 URL，也能限制 Token 只在当前标签页存在。

问题是浏览器资源请求不经过该包装器：

```text
fetch('/api/...')          -> 可以加 Authorization
<img src="/api/...">      -> 不会读取 sessionStorage
<embed src="/api/...">    -> 不会读取 sessionStorage
<a href="/api/...">       -> 不会读取 sessionStorage
```

优化方向：

1. 提供统一的 authenticated Blob loader。
2. 图片和 PDF 使用带 Token 的 `fetch` 获取 Blob，再创建 object URL。
3. 下载使用带 Token 的 `fetch`，成功后用临时 object URL 触发下载。
4. 组件卸载或资源切换时回收 object URL。
5. 不要把 Token 放入查询参数。
6. 为图片、PDF、下载、编译产物和 Draw 图片建立同一鉴权资源契约。

最小验收：

- 浏览器 context 不配置全局 Authorization；
- 只通过设置页或 sessionStorage 提供 Token；
- 图片 `naturalWidth > 0`；
- PDF 可渲染；
- 下载成功且内容 hash 一致；
- 网络记录中受保护资源无 401；
- URL 中无 Token。

## 7. P1：CLI Provider 已实现，但“正式可用”仍未成立

当前机器安装版本：

```text
Codex CLI 0.144.6
Claude Code 2.1.139
GitHub Copilot CLI 1.0.73
```

当前源码已有：

- OpenAI-compatible API；
- Anthropic API；
- Codex CLI；
- Claude Code CLI；
- GitHub Copilot CLI；
- CLI Chat 使用只读能力；
- CLI Task 在隔离快照运行，展示 Diff，再 Accept/Reject。

这意味着用户最初提出的“直接使用 Codex 或 Copilot 完成任务”已经有正确的架构雏形，不应再次平行实现另一套 Provider 系统。

仍未闭环的部分：

1. 正式后端没有配置 `OPENPRISM_API_TOKEN`，三种 CLI Provider 在正式 API 中都显示 unavailable。
2. 正式 UI 又被 build mismatch 阻断，用户无法进入设置或任务面板。
3. Copilot CLI 没有稳定的非交互 auth status，当前只能报告 auth unknown。
4. 当前自动化主要使用 mock CLI，没有调用真实付费模型验证输出质量。
5. CLI Chat capability 明确为 `stream:false`，长回答的实时反馈有限。
6. 真实 CLI 版本升级后，参数、JSON 输出和权限语义可能变化，需要兼容矩阵。
7. Task Accept 后，已打开编辑器、文件树、预览、RAG fingerprint 和编译状态需要统一刷新验证。

优化方向：

- UI 明确区分 API Provider、只读 CLI Chat、可审查 CLI Task。
- Provider 卡片显示 installed、version、auth、scope、stream、tools、write boundary。
- 真实 CLI 探针默认只读、短超时、无付费请求。
- 为三种 CLI 建立版本兼容 fixture 和结构化输出 parser 测试。
- Task Agent 的 Accept/Reject 必须继续保持文件 hash、漂移检测和回滚证据。

## 8. P1：Skills 仍是“可发现目录”，不是成熟执行平台

本轮真实运行时统计：

```text
Skills:      123
Load errors: 0
Ready:       0
Degraded:    123
Unavailable: 0
```

当前 readiness 的积极意义是：系统不再把“YAML 能加载”误报为“功能已经可执行”。但用户仍会面对 123 个 Skill，却没有任何一个达到已验证 ready。

当前边界：

- dry-run 只检查静态声明，不执行 Skill 脚本、不调用模型、不证明输出质量；
- `recordSkillRun()` 的产品调用点目前在 Skills 包测试路由，用 `kind: package-tests` 记录；
- 真实模型引导的 Skill 调用没有写入该 ledger；
- 缺少项目级 artifact、成本、模型、版本、输入摘要、写入副作用和重试链路；
- 大量 legacy Skill 依赖推断元数据，风险和前置条件不够精确。

文档还有事实漂移：`skillReadinessService.js` 已把运行历史持久化到数据根的 `.openprism-skill-runs.json`，但 `docs/skill_execution_readiness.md:56` 仍写“process-local”。准确表述应是：包测试 lastRun 已可持久化，但真实模型执行尚未接入持久账本。

优化方向：

1. 不追求一次性让 123 个全部 ready，先选择 5—10 个高价值论文流程。
2. 每个正式可执行 Skill 必须有显式 requirements、side effects、cost class、artifact contract 和失败恢复。
3. 写文件 Skill 统一走隔离快照和 Diff 审批。
4. run ledger 记录 Provider、模型、Skill 版本、耗时、成本、产物、状态和副作用。
5. UI 分开显示“可发现、推荐、静态可运行、最近真实成功”。
6. 建立固定论文 fixture 和质量评分，不只验证 YAML/schema。

## 9. P1：RAG 的可靠性提高，但检索质量仍有明显边界

当前已有：

- 自动索引；
- generation；
- corpus fingerprint；
- `healthy/degraded/corrupt/rebuilding`；
- 逐文件 parser、chars、chunks、warning 和 error；
- 损坏索引只读检测和显式修复；
- 原子替换和并发相关测试。

但本地检索在 `paperRagService.js:2029-2037` 仍按 query term overlap 打分，契约明确为：

```text
kind: local-keyword-overlap
semantic: false
```

用户层面的限制：

- 同义词、缩写、概念改写、跨语言召回较弱；
- `healthy` 只说明索引结构健康，不代表检索答案质量高；
- 缺少 Recall@K、MRR、证据覆盖率、引用正确率和无答案拒答率。

外部多源检索还有两个具体问题：

1. `searchExternalSources()` 捕获单源异常后只写服务器 console，并返回空数组；UI 无法区分“确实没有论文”和“Semantic Scholar/ArXiv/Crossref/OpenAlex 请求失败”。
2. 不同来源的 `relevance_score` 语义不一致：Semantic Scholar 用引用数近似，ArXiv 固定 0.5，Crossref/OpenAlex 又使用各自得分，最后直接混排。

优化方向：

- 本地 health 与检索质量分开显示。
- 每条外部结果保留 source-native score 和 normalized score。
- 返回 per-source status、latency、rate-limit、timeout 和 error，而不是静默空数组。
- 建立小型论文检索基准，再决定是否增加可选 embedding/hybrid adapter。
- UI 始终明确“本地关键词检索”，不要把它宣传成向量语义 RAG。

## 10. P1：Draw.io 与预览的离线和安全边界不足

Draw.io 当前同时存在可用性和消息边界问题：

- URL 硬编码，无法由管理员切换自托管实例；
- 网络失败没有超时、重试、错误页和离线源码编辑；
- 使用 `event.origin.includes()`，不是从配置 URL 推导的精确 origin；
- 使用 `postMessage(..., '*')`；
- 用户图表数据会进入第三方 iframe，但 UI 缺少明确的数据边界说明。

建议：

1. 用 `OPENPRISM_DRAWIO_EMBED_URL` 或等价安全配置指定地址。
2. 从配置 URL 解析唯一允许 origin，接收和发送消息都使用精确 origin。
3. iframe 超时后显示错误、重试、查看/下载 XML、切换自托管说明。
4. 外部网络不可用时，不影响文本编辑、文件树、本地预览、编译和 RAG。
5. 在设置和能力页显示 Draw.io 是 external/self-hosted/offline 哪一种状态。

LaTeX 预览应删除运行时 jsDelivr 字体依赖，使用仓库本地字体或可靠系统字体栈。离线 E2E 应拒绝所有远程字体和 CDN stylesheet，而不只检查 Google Fonts。

## 11. P2：项目身份模型已改善，但历史数据仍然混杂

当前源码已经把三种概念分开：

- 显示名 `name`；
- 稳定项目 ID `id`；
- 实际目录 `directoryName`。

新目录使用“可读 slug + 短 ID”，已有目录通过候选发现和显式注册接入，`GET /api/projects` 当前也不再自动写入候选目录。这些是正确改进。

但现有数据仍有历史混杂：

- 仓库 `papers/.pytest_cache` 已经存在 `project.json`，并曾被注册为正式项目；
- 仓库中有两个 `test-conv-api-*` 测试目录；
- 同一论文含 UUID 目录、可读目录和显示名不一致的组合；
- 正式根另有 `not-a-real-project` 等样例目录；
- 用户需要同时理解 name、ID、directoryName、绝对路径四个概念。

优化方向：

- 提供只读“项目身份诊断”页面；
- 显示 metadata ID、显示名、物理目录、主文件、注册来源和异常；
- 默认排除所有点目录、缓存、测试、临时和结果目录；
- 迁移前只展示预览与冲突，不自动移动或删除；
- 重命名明确提示物理目录是否会移动及对外部 shell/脚本的影响。

## 12. P2：模板目录、manifest 与分类不一致

`app/templates/manifest.json` 只公开 4 个模板：ACL、CVPR、NeurIPS、ICML；但磁盘中还存在完整 `arxiv` 目录，却未进入 manifest。

manifest 同时公开 8 个分类：all、academic、thesis、resume、presentation、book、letter、report，而当前 4 个模板全部属于 academic。结果是用户会看到多个长期空分类。

优化方向：

- manifest 只返回有内容的分类，或给空分类明确显示“暂无模板/即将支持”；
- 将 arXiv 模板补入 manifest，或者记录排除原因；
- skeleton 模板与完整官方模板在 UI 明确区分；
- 模板卡显示来源、版本、许可证、引擎、入口文件和是否已真实编译验证。

## 13. P2：日志、配置和部署可移植性仍需治理

### 13.1 无条件 DEBUG 日志

当前仍有无条件日志：

- `routes/ai.js` 输出 system prompt、消息数量、用户消息片段和 RAG 上下文状态；
- `useConversations.ts` 输出用户消息、工具名和工具结果片段；
- `DrawPanel.tsx` 输出文件列表、模型、图片和生成流程；
- `routes/projects.js` 输出项目根、匹配 pattern 和文件样例。

这些日志可能暴露论文内容、文件布局、模型输入和工具输出，也会让正式日志噪声过大。

建议使用显式 debug flag、结构化 logger、字段脱敏和采样；默认生产模式不记录正文和 Prompt。

### 13.2 硬编码机器地址

当前仍可见：

- `vite.config.ts` 默认 API origin 为 `http://10.30.0.22:8787`；
- `backend/src/index.js` 默认 public host 为 `10.30.0.22`；
- `routes/mcp.js` fallback host 包含 `10.30.0.22:8787`；
- `scripts/run-server.sh` 和 `scripts/restart.sh` 包含固定 IP。

服务绑定 `0.0.0.0` 是局域网可见所必需，但 public URL、LAN IP 和代理目标应由环境变量决定，不能把当前机器地址作为源码默认事实。

## 14. P2：测试门禁仍没有覆盖真实首用闭环

本轮结果：

```text
TypeScript typecheck: 通过
Unit tests:          69 files / 405 tests 全部通过
Selected E2E:        9 passed
Real browser auth:   1 failed
npm audit:           0 vulnerabilities
```

`npm run check` 当前只包含：

```text
typecheck -> build -> unit
```

只有 `check:full` 才包含 integration 和 E2E。这样容易出现：类型正确、单元测试全绿、生产构建成功，但首用 Token、图片下载或外部 iframe 仍在真实浏览器失败。

建议的发布门禁至少包括：

1. 生产 bundle 首屏启动 smoke；
2. 无 Token、错误 Token、正确 Token 三态；
3. 设置页应用 Token 后无需刷新即可恢复项目；
4. 图片、PDF 和下载走真实浏览器 Token；
5. 外网阻断下 Draw.io 明确降级；
6. 桌面、手机、平板无 pageerror、无失败同源请求、无横向溢出；
7. build ID、API schema、正式 PID 和数据根一致。

## 15. P2/P3：文档与工作区缺少单一可信状态

当前工作区：

```text
modified:  101
deleted:   4
untracked: 93
total:     198
tracked diff: 105 files, +7423 / -6940
```

同一天已经存在多份名称接近的 repository audit/problem analysis/user audit 文档。07:23 的报告仍记录全局空白页和 Skills lastRun process-local；到 08:29，空白页已修复，Skills store 已持久化，但正式部署和真实执行仍未完成。

这类状态漂移会造成：

- 后续模型引用旧报告重复修复已经解决的问题；
- 状态文档写“已完成”，但正式进程仍未部署；
- 无法知道某个测试结果对应哪个 dist、哪个 PID、哪个数据根；
- 大型混合 diff 难以审查、回滚和定位回归。

建议建立唯一 canonical release/status 文档，并把状态拆成：

```text
implemented
tested-unit
tested-browser
built
deployed
LAN-accepted
```

每个状态必须绑定 commit、build ID、时间、命令、PID、数据根和已知限制。旧报告顶部应标记 superseded，而不是继续并列为当前事实。

## 16. P3：超大模块提高维护和回归成本

当前文件规模：

| 文件 | 行数 |
| --- | ---: |
| `paperWorkbenchService.js` | 7687 |
| `App.css` | 6086 |
| `paperRagService.js` | 2748 |
| `skillEngine.js` | 2424 |
| `LatexPreview.tsx` | 1281 |
| `DrawPanel.tsx` | 1127 |
| `SkillsSelector.tsx` | 938 |

用户不会直接看到行数，但会承受组合回归、加载性能、CSS 覆盖、测试难度和修改风险。

优化时应遵守：先锁行为测试，再按领域边界小步拆分；不要为了行数制造新的抽象层，也不要在当前功能仍有 P0 浏览器缺陷时进行大规模重构。

## 17. 已经改善、不要重复开发的部分

以下能力在当前源码中已经有实质实现：

1. Codex、Claude Code、Copilot CLI Provider。
2. CLI Chat 的只读沙箱。
3. 隔离式 CLI Task Agent、快照、Diff、Accept/Reject、漂移检测和回滚。
4. 默认拒绝的当前源码鉴权模型。
5. 前后端 build ID/API schema 握手与 Deployment Gate。
6. 项目显示名、稳定 ID、物理目录分离。
7. 已有目录候选发现和显式注册。
8. RAG generation、fingerprint、health 和损坏修复。
9. Skills readiness 和保守的 degraded/unavailable 表达。
10. 移动端和平板基本工作区。
11. frontend chunk 空白页回归修复。
12. npm 单包管理器和 0 漏洞依赖审计。

后续重点应是把这些能力接入同一个真实可运行的正式发布，而不是再次增加同名但平行的实现。

## 18. 推荐整改顺序

### 第一阶段：P0，恢复正式可用

1. 修复 Token 应用后的父页面刷新和明确 auth-required 状态。
2. 统一图片、PDF、下载的 authenticated Blob 资源层。
3. 完成全量构建和浏览器验证。
4. 确认正确数据根，制定只读迁移/注册方案。
5. 配置强服务 Token。
6. 只重启本仓库正式服务，并验证唯一 listener。
7. 执行 loopback/LAN 的无 Token、错 Token、正确 Token验收。
8. 桌面、手机、平板完成项目列表与编辑器 smoke。

### 第二阶段：P1，完成核心论文闭环

1. Draw.io 可配置、自托管、超时和离线降级。
2. 移除 LaTeX 运行时远程字体。
3. 真实验证 Codex/Claude/Copilot 的只读 probe、Chat 和隔离 Task。
4. 建立少量真正 ready 的核心 Skills 与持久真实 run ledger。
5. 为 RAG 建立质量基准和外部来源状态透明度。
6. 验证项目创建、中文名、重命名、已有目录注册和冲突恢复。

### 第三阶段：P2/P3，降低长期成本

1. 清理无条件 DEBUG 日志和硬编码机器地址。
2. 统一模板 manifest 与分类。
3. 把浏览器首用 smoke 纳入发布门禁。
4. 建立 canonical 状态文档和可追溯发布候选。
5. 清理确认无用的测试项目和历史数据，但必须先人工确认并采用可恢复操作。
6. 在回归测试保护下小步拆分超大模块。

## 19. 最终验收标准

只有同时满足以下条件，才应对外称为“可用”：

### 正式发布

- `/api/ready` 返回成功；
- frontend build、backend build 和 API schema 兼容；
- 正式端口只有一个本仓库 listener；
- 正式页面不再显示 deployment mismatch；
- 正式数据根与管理员选择一致。

### 鉴权

- 无 Token 不能访问业务 API；
- 错误 Token 返回 403；
- 设置页应用正确 Token 后无需刷新即可恢复；
- Token 不进入 URL、日志或本地持久存储；
- 图片、PDF、下载和编译产物全部可用。

### 项目

- UI 同时显示名称、ID、目录；
- UI 项目与数据根物理目录可解释对应；
- 已有目录注册不移动原论文；
- 点目录、测试目录和缓存不会进入正式项目；
- 重命名和迁移有预览、冲突和回滚。

### Provider 与 Agent

- API 和 CLI Provider 清晰分组；
- Codex/Claude/Copilot 显示安装、版本、认证和权限范围；
- Chat 不写文件；
- Task 只修改隔离快照；
- Accept 前显示完整 Diff；
- Reject 保持原文件 hash；
- Accept 后编辑器、文件树、预览、RAG 和编译状态一致刷新。

### Skills 与 RAG

- 不把 degraded 说成 ready；
- 至少若干核心 Skills 有真实成功记录和 artifact；
- 真实 run 有 Provider、模型、版本、耗时、成本和副作用；
- RAG 显示实际检索模式、来源、generation 和失败状态；
- 有固定检索质量基准。

### 浏览器与离线

- 桌面 1440×900、手机 390×844、平板 768×1024 均可完成核心流程；
- 无 pageerror、无失败同源请求、无水平溢出；
- 阻断外网时文本编辑、本地预览、编译和本地 RAG 仍可用；
- Draw.io 显示明确错误和恢复入口，而不是永久 Loading。

## 20. 最终结论

当前仓库的技术方向比早期版本成熟很多，尤其是 CLI Provider、可审查 Task Agent、项目身份、RAG health、Skills readiness 和部署握手。当前最需要避免的是继续横向增加大量新功能，同时让正式运行实例、鉴权资源层、数据根和真实首用流程保持断裂。

从用户角度，当前事实可以概括为：

```text
正式地址能打开，但工作区被版本不一致阻断；
当前源码能通过多数测试，但真实 Token 首用、受保护资源和 Draw.io 仍失败；
UI 项目与仓库 papers 不一致，根因是正式数据根指向了另一处目录。
```

因此最合理的下一步不是重新设计一整套系统，而是先把已经实现的能力收敛成一个数据根正确、前后端一致、Token 闭环、受保护资源可用、外网失败可解释、可以被 Playwright 完整走通的正式发布候选。

## 21. 审计后整改进展

本报告完成后，同一工作区已经对 P0-4 和 P0-5 开始红绿整改：

- Token 成功应用后，项目列表、候选目录和模板会立即重新加载；清除 Token 时同步清空受保护元数据。
- 图片、PDF 和下载已改为认证 fetch + Blob object URL，不再让原生资源请求绕过 session Token。
- Provider 设置弹窗增加视口最大高度和正文内部滚动，默认桌面视口下的关闭按钮保持可达。
- `tests/e2e/real-browser-auth.spec.ts` 已从“项目列表无法恢复”的红灯推进为全流程绿色，覆盖 Token 应用、项目打开、受保护 SVG 预览和下载。
- LaTeX 快速预览已删除 jsDelivr 字体 `@import`；隔离 Playwright 实际打开 `.tex` 文件并确认无 Google Fonts/jsDelivr 请求。
- Draw.io 已支持服务器配置或自托管 embed URL、精确 iframe source/origin、精确 postMessage target、6 秒就绪超时、错误提示、重试、离线 XML 编辑和 XML 下载；阻断 diagrams.net 的隔离 Playwright 已转绿。

这些改动尚未完成正式 8787 后端重启与 LAN 验收，因此不能改变本文对正式部署 P0-1、P0-2、P0-3 的结论。
