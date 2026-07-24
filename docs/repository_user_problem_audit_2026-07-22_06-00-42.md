# Paper Writing 仓库用户问题审计与改进建议

- 审计时间：2026-07-22 06:00:42（Asia/Shanghai）
- 审计仓库：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting`
- 正式 LAN 地址：`http://10.30.0.22:8787`
- 审计视角：首次使用者、日常论文作者、系统管理员、二次开发维护者
- 审计边界：只发现和分析问题；不修改产品代码、不重启正式服务、不写入正式论文数据、不调用真实付费模型、不让 CLI Agent 或 Skill 执行可能产生副作用的任务
- 证据来源：Playwright 真实浏览器操作、HTTP/API 探测、进程与监听检查、源码与测试审阅、聚焦测试、Git 工作区与构建产物检查

## 1. 结论摘要

当前仓库已经具备较丰富的论文工作台能力，包括项目管理、编辑、对话、HTTP LLM、Codex/Claude/Copilot CLI Provider、Skills、RAG、编译、绘图、评审、引用核验、AI 写作检测和流水线等。问题的核心已经不是“完全没有功能”，而是“正式部署、产品闭环、能力可信度和工程治理没有同步收口”。

从真实使用者角度，当前最重要的结论是：

1. **正式服务当前不可进入核心工作区。** 桌面、手机和平板 Playwright 都只能看到前后端版本不一致阻断页。
2. **正式旧后端仍匿名暴露配置和项目元数据。** 当前源码虽已有 default-deny 鉴权，但正式运行进程没有部署这些变化。
3. **Codex、Claude Code、Copilot 已经成为可选 Provider，但只是只读 Chat，不是能修改论文并提交可审查 Diff 的 Task Agent。**
4. **项目名称与物理目录的映射在当前源码中已明显改善。** 系统现在分别展示显示名、稳定 ID 和存储目录；该项不应再被描述为“完全没有解决”，但仍需要更清晰的用户解释和迁移诊断。
5. **Skills 的“全部假 ready”缺陷已在当前工作区源码中修复并通过聚焦测试，正式环境尚未验证。** 仍然缺少真实执行记录持久化、完整 manifest、来源/副作用审查和端到端执行可信度。
6. **RAG 当前仍以本地关键词/词项重叠为核心检索方式。** 索引可靠性已有改善，但缺少索引健康、generation、fingerprint、逐文件解析诊断和可重复的检索质量评测。
7. **工程交付状态过于庞大和混杂。** 当前 `git status --short` 有 163 条记录，已跟踪 diff 涉及 96 个文件，并存在超大模块、外部字体请求、较大前端 chunk、被跟踪的 `.bak` 和测试状态文件。
8. **仓库中的“已完成”文档与正式实例不一致。** 源码实现、自动化通过、已经部署、正式环境验收必须拆开记录。

综合判断：当前工作区源码适合继续隔离开发和验证，但当前正式实例不应被描述为稳定可用或已经完成安全验收。

## 2. 证据等级与边界

本文使用以下标记：

- **直接证据**：Playwright 页面、HTTP 响应、进程、源码、测试输出或 Git 状态直接证明。
- **推断**：由多个直接证据支持，但本轮未做破坏性利用、真实付费调用或生产级压力测试。
- **未知**：当前安全的只读审计无法确认，必须通过后续专项验收回答。

本轮没有把“代码中存在某个函数”直接等同于“正式用户已经能用”；也没有把“测试存在”直接等同于“当前机器和正式部署已通过”。

## 3. Playwright 真实使用结果

### 3.1 正式 LAN 页面在三个视口全部被阻断

**证据：Playwright 直接证据。置信度：高。**

本轮真实访问：

```text
http://10.30.0.22:8787/projects
```

| 视口 | 尺寸 | HTTP | 页面结果 | 横向溢出 |
| --- | ---: | ---: | --- | --- |
| 桌面 | 1440×900 | 200 | 版本不一致阻断页 | 无 |
| 手机 | 390×844 | 200 | 版本不一致阻断页 | 无 |
| 平板 | 768×1024 | 200 | 版本不一致阻断页 | 无 |

三个视口看到的主要文本一致：

```text
前后端版本不一致
当前页面与服务器不是同一次构建。为避免使用旧接口修改论文，工作区已暂停加载。
missing-build-metadata
Frontend build 20260721215154-f0ef1484486e-27b02e56 is not compatible with the running backend.
重新检查
管理员需要重新构建并重启前后端服务，然后再刷新页面。
```

结论：版本门禁本身是正确的数据保护机制，但正式产品当前处于不可用状态。HTTP 200 只能证明静态前端返回成功，不能证明项目、编辑器、RAG、Skills 或 Provider 可用。

### 3.2 Playwright 重跑依赖没有被统一封装

**证据：Playwright 启动与仓库文件直接证据。置信度：高。**

直接运行仓库缓存的 Chromium 时，首次失败：

```text
libatk-1.0.so.0: cannot open shared object file
```

仓库实际包含：

```text
.playwright-deps/usr/lib/x86_64-linux-gnu/libatk-1.0.so.0
```

在显式设置该目录到 `LD_LIBRARY_PATH` 后，Playwright 成功启动并完成三个视口访问。

这说明仓库具备本地依赖资产，但通用 Playwright preflight 和普通调用没有自动统一使用它。后续维护者可能看到“缺系统库”并误判为完全无法运行，而后端的个别服务又单独设置了相同依赖路径，形成不一致。

改进建议：

1. 提供唯一的 Playwright 启动入口，统一设置浏览器、依赖目录、输出目录和错误诊断。
2. preflight、E2E、截图脚本、GPTZero 浏览器流程复用同一环境构造函数。
3. CI 和正式验收输出浏览器版本、依赖来源、运行命令和结果文件位置。
4. 验收标准不能只检查测试文件存在，必须证明当前机器能实际启动浏览器。

### 3.3 同日隔离源码实例的既有实测

**证据：同日已有隔离 Playwright 运行记录。置信度：高。**

此前同日使用临时数据根、随机 Token 和随机本机端口执行的隔离主路径测试为 `16 passed`，覆盖项目创建/删除、项目列表、已有目录注册、手机和平板工作区、主面板国际化、能力诊断和 build handshake。

这证明“当前工作区源码整体完全不能运行”并不准确。正式用户当前不可用的直接原因主要是部署版本漂移，而不是所有源码路径都已经损坏。

## 4. P0：正式部署版本漂移与匿名数据暴露

### 4.1 正式后端不是当前工作区构建

**证据：HTTP、进程和源码直接证据。置信度：高。**

正式监听：

```text
0.0.0.0:8787
PID 575763
cwd /data01/home/xuzk/workspace/ai_agent/paper_wrighting/app/apps/backend
node src/index.js
```

API 响应：

```text
GET /api/health -> 200 {"ok":true,"authRequired":false}
GET /api/ready  -> 404 {"error":"Not Found"}
```

当前源码的 `app/apps/backend/src/routes/health.js` 已实现 build metadata 和 `/api/ready`，正式进程却没有这些行为。因此正式后端运行的是旧逻辑。

用户影响：

- 所有核心页面被 Deployment Gate 阻断；
- 用户无法进入项目、编辑器或设置页；
- “重新检查”只能重复发现不一致，不能恢复服务；
- 状态页显示的是技术原因，没有发布批次、负责人、恢复时间或诊断编号。

改进建议：

1. 把前端构建、后端构建、进程替换、唯一监听验证、build/schema 比对和 LAN Playwright 作为一个发布事务。
2. 保存 build ID、schema、PID、启动命令、监听地址、部署时间和验收结果。
3. 阻断页展示前端 build、后端 build、API schema、服务器地址和可复制诊断信息。
4. 发布失败时自动回到上一套匹配构建，避免“新前端 + 旧后端”长期共存。

验收标准：

- `/api/health` 返回前后端共享 build ID 和兼容 schema；
- `/api/ready` 返回 200；
- 桌面、手机、平板都能进入项目列表和编辑器；
- `0.0.0.0:8787` 只有一个属于当前发布批次的进程；
- 不再出现 `missing-build-metadata`。

### 4.2 正式旧后端匿名暴露配置和项目元数据

**证据：HTTP 直接证据。置信度：高。**

未提供 Token 时：

```text
GET /api/config   -> 200
GET /api/projects -> 200
```

此前响应中已经观察到内网 Provider endpoint、模型名、证书路径、数据根路径、Draw endpoint、API Key 配置状态，以及正式项目的 ID、显示名、目录名和时间信息。

当前工作区源码已经增加 default-deny 鉴权和配置隐私处理，但没有部署到正式进程。因此这属于“源码已有修复、正式风险仍然存在”。

改进建议：

1. 未认证访问所有业务 API 默认拒绝。
2. `/api/health` 只返回必要健康信息，不返回敏感路径和配置。
3. `/api/config` 只返回前端确实需要的脱敏字段。
4. 正式发布验收必须包含无 Token、错误 Token、正确 Bearer Token 三类请求。

## 5. 项目名称、稳定 ID 与磁盘目录

### 5.1 用户原始痛点在当前源码中已实质改善

**证据：源码和同日隔离 Playwright 直接证据。置信度：高。**

当前新项目目录采用：

```text
<安全化后的显示名>--<稳定 ID 前 8 位>
```

项目页面同时显示：

- 用户可读项目名；
- 稳定项目 ID；
- 实际存储目录。

已有但没有 `project.json` 的论文目录可以被发现并显式注册，注册不会移动原文件。相关实现集中在：

- `app/apps/backend/src/services/projectLocator.js`
- `app/apps/backend/src/routes/projects.js`
- `app/apps/frontend/src/app/ProjectPage.tsx`

因此，“页面项目和 `papers` 子目录完全对不上且没有解释”不再是当前源码的完整描述。

### 5.2 仍然存在三个身份带来的认知成本

**证据：产品结构直接证据；用户影响为高可信推断。**

系统同时存在：

- 显示名：面向用户，可重命名；
- 稳定 ID：面向 API 和内部引用；
- 物理目录：面向备份、文件系统和外部工具。

仍未完全回答的用户问题包括：

- 改项目名时目录是否一起改；
- 哪个字段可以手工修改；
- 旧 UUID 目录和新目录规则如何共存；
- 从其他机器复制目录后如何重新注册；
- metadata ID 与目录名不一致时谁是权威；
- 如何一键在文件系统中定位项目。

改进建议：

1. 在项目详情中解释三个身份的用途与可变性。
2. 提供“复制实际路径”“复制稳定 ID”“在文件浏览器中定位”。
3. 重命名前明确说明是否只改显示名。
4. 为旧目录、导入目录、新规则目录显示来源标签。
5. 增加只读身份诊断：metadata、目录、主文件和注册状态是否一致。

## 6. LLM、Codex、Claude Code 与 Copilot

### 6.1 CLI Provider 选项已经存在

**证据：源码直接证据。置信度：高。**

当前设置组件支持：

- OpenAI-compatible API；
- Anthropic API；
- Codex CLI；
- Claude Code CLI；
- GitHub Copilot CLI。

相关位置：

- `app/apps/frontend/src/app/components/SettingsModal.tsx`
- `app/apps/backend/src/services/agentProviderRegistry.js`

因此，后续改进不应重复实现“增加 CLI 选项”，而应补齐 CLI 的任务执行闭环。

### 6.2 当前 CLI 只是安全的只读 Chat

**证据：源码和测试直接证据。置信度：高。**

Codex 固定使用：

```text
--ephemeral --sandbox read-only
```

Claude Code 固定使用：

```text
--permission-mode dontAsk --tools ''
```

Copilot 固定使用：

```text
--available-tools '' --no-ask-user
```

CLI capability 还明确声明 `toolCalling: false`。这条安全边界是合理的，但用户选择 CLI 后，只能得到文本回复，不能让 Agent 在可控范围内修改论文、运行检查并给出可审查结果。

改进建议：新增独立于 Chat 的 CLI Task Agent：

```text
创建隔离快照
→ CLI 只在快照内写入
→ 收集 changed files、Diff、命令、Provider/模型 provenance
→ waiting review
→ Accept / Reject
→ Accept 原子应用，Reject 保证原项目字节不变
→ 保存历史、取消原因、恢复信息
```

必须避免把普通聊天“发送”按钮直接升级为隐式文件写入。

### 6.3 首次启动配置仍不够面向普通用户

**证据：源码、同日 Playwright 页面。置信度：高。**

用户需要自行理解 Server Access Token、LLM API Key、CLI 登录状态、Provider 能力、费用和数据边界之间的区别。设置页仍出现 `Apply`、`Load models`、`Test connection` 等英文文案。

改进建议：提供首次启动向导：

1. 检测服务器是否要求 Token；
2. 输入并验证 Server Token；
3. 选择 API 或本地 CLI；
4. 自动探测 CLI 安装和登录状态；
5. 解释 Chat 与 Task Agent 的权限差异；
6. 明确连接测试是否联网、是否收费；
7. 最后给出“当前可完成能力”清单。

## 7. Skills 系统

### 7.1 “123 个 Skill 全部假 ready”已在工作区修复

**证据：当前源码和本轮聚焦测试。置信度：高。**

旧问题根因是 UI enrich 阶段无条件生成值为 `undefined` 的 `requirements`、`sideEffects` 和 `costClass` 属性，readiness 层又把属性存在误认为 manifest 已声明。

当前实现已经只在值真实存在时投影这些字段，并让没有显式执行元数据的 YAML Skill 保守显示为 `degraded`。本轮实测：

```text
Vitest: 4 files, 27/27 passed
Node Skills route tests: 5/5 passed
```

相关文件：

- `app/apps/backend/src/services/skillReadinessService.js`
- `app/apps/backend/src/services/skillEngine.js`
- `app/apps/frontend/src/app/components/SkillPanel.tsx`
- `app/tests/skillReadiness.test.mjs`
- `app/tests/e2e/skill-readiness.spec.ts`

注意：正式服务仍是旧版本，因此不能推断正式 UI 已经展示正确结果。

### 7.2 Skills 仍未形成完整执行可信度

**证据：源码直接证据。置信度：高。**

当前静态检查不会运行脚本、联网或调用模型，这是安全边界；但它也不能证明 Skill 真能完成任务。`lastRunState` 仍是后端进程内 `Map`：重启后丢失，且未证明所有真实 Skill 执行路径都会统一写入。

仍需补齐：

- 标准 manifest：commands、credentials、network、files、provider capabilities、side effects、cost class；
- `static check`、`safe probe`、`real execution` 的明确区分；
- 真实执行记录持久化；
- Skill 版本、来源、license、脚本、网络目标和写入范围审查；
- unavailable Skill 禁止激活；
- 推荐结果说明 blocked 原因并给出可运行替代项；
- 执行产物、费用、耗时、Provider、模型和错误审计。

## 8. RAG 系统

### 8.1 当前检索仍是本地词项重叠

**证据：源码直接证据。置信度：高。**

当前流程是：分词、计算 query 与 chunk 的 token overlap、过滤零分、按分数排序。中文采用连续二元字 token。核心位置：

- `app/apps/backend/src/services/paperRagService.js` 的 `searchCorpus`、`scoreChunk`、`tokenize`。

仓库中出现的 `semantic-scholar` 是外部文献来源名称，不代表本地检索已经是 semantic embedding RAG。

这套实现适合作为透明、低成本、本地优先的关键词证据检索，但产品必须明确说明它不是语义向量检索。

### 8.2 缺少用户可见的索引健康模型

**证据：源码与 UI 直接证据。置信度：高。**

当前没有发现以下完整契约：

- `GET /api/projects/:id/rag/health`；
- generation；
- corpus fingerprint；
- healthy/degraded/corrupt/rebuilding；
- 成功、失败、零 chunk 文件计数；
- 每个文件的 parser、chars、chunks、warning 和 error；
- 当前查询对应的索引版本。

当前 UI 主要显示文档数量、文件名、大小、检索 score 和行号。索引已经有原子写入、损坏隔离和项目锁等可靠性能力，但用户看不到这些状态。

改进建议：先增加健康透明度，再讨论向量数据库。建议契约至少包含：

```json
{
  "status": "healthy|degraded|corrupt|rebuilding",
  "retrieval": {
    "kind": "local-keyword-overlap",
    "semantic": false
  },
  "generation": "...",
  "fingerprint": "...",
  "indexedAt": "...",
  "counts": {
    "files": 0,
    "indexedFiles": 0,
    "failedFiles": 0,
    "zeroChunkFiles": 0,
    "chunks": 0
  },
  "documents": [],
  "issues": []
}
```

### 8.3 先建立检索评测，再决定 BM25/embedding/reranking

**推断。置信度：高。**

没有固定评测集时，直接增加向量数据库只能证明复杂度增加，不能证明论文问答质量提高。建议建立中英文、同义改写、引用定位、跨章节、数字表格和无答案问题的固定 fixture，比较：

1. 当前 overlap；
2. BM25；
3. hybrid；
4. embedding；
5. reranking。

指标至少包括 Recall@K、MRR、证据行准确率、无答案拒答、延迟、索引时间和成本。

## 9. 系统 readiness 与能力状态

### 9.1 `/api/ready` 的语义仍然偏窄

**证据：源码直接证据。置信度：高。**

当前源码中的 readiness 主要检查数据根和模板 manifest。即使 Provider、编译器、OCR、RAG 或 CLI 不可用，基础 `/api/ready` 仍可能成功。

建议把状态分层：

- liveness：进程仍能响应；
- readiness：服务基础依赖可用；
- build compatibility：前后端属于兼容构建；
- capabilities：Provider、编译、OCR、RAG、Skills 等可选能力；
- task readiness：某个具体任务现在是否真的可执行。

UI 不应把这些不同层次统一显示为一个“系统正常”。

## 10. 国际化、离线和第三方依赖

### 10.1 仍存在中英文混用

**证据：源码与同日页面直接证据。置信度：高。**

设置页仍使用 `Apply`、`Load models`、`Test connection` 等英文；主题仍显示 `Basic Light`。Provider 配置涉及鉴权、费用和权限，语言混用会增加误配风险。

改进建议：所有用户可见文案进入 locale，并增加主要组件的硬编码文案扫描测试；技术术语提供解释，而不只是机械翻译标签。

### 10.2 Google Fonts 在受限网络中持续失败

**证据：Playwright 控制台和源码直接证据。置信度：高。**

`app/apps/frontend/src/app/App.css:1` 仍从 `fonts.googleapis.com` 导入字体。本轮三个视口均记录资源加载错误。页面有系统字体回退，因此没有完全失效，但仍带来：

- 控制台噪声；
- 首屏不确定性和超时；
- 第三方请求与隐私暴露；
- 不同网络下截图和布局差异。

建议删除外部 `@import`，使用系统字体栈，或自托管经过许可的字体。

### 10.3 Draw.io 仍依赖外部嵌入站点

**证据：源码直接证据。置信度：高。**

`DrawioEditor.tsx` 使用 `https://embed.diagrams.net/`。这意味着无外网、受限网络、第三方 CSP 或上游变更可能让绘图能力不可用。该依赖应在能力诊断和 UI 中明确展示，不应把页面 shell 可打开等同于绘图服务可用。

## 11. 安全边界中的剩余问题

### 11.1 HTTP Provider 仍需 DNS rebinding/socket pinning 专项验证

**证据：源码支持的推断。置信度：中。**

当前源码已校验协议、URL 凭证、DNS 结果、私网/loopback/link-local/reserved 地址，并对重定向重新校验。这是明显改善。

仍需确认校验时的 DNS 地址是否与实际 socket 连接绑定。若校验 lookup 和 fetch 连接分别解析，理论上仍存在 DNS 响应切换窗口。本轮没有实施利用，因此不能写成“已确认漏洞”。

专项验收应检查：

- 是否将已校验 IP 固定到连接；
- TLS hostname 是否仍正确校验；
- 是否核验连接后的 remoteAddress；
- 用户输入 endpoint 与管理员配置的内网 endpoint 是否采用不同策略；
- redirect 每一跳是否继续执行相同约束。

### 11.2 当前最现实的风险仍是旧部署

相比尚未利用的 DNS rebinding，正式旧后端当前匿名返回 `/api/config` 和 `/api/projects` 是已发生、可复现的问题，应优先处理。

## 12. 前端体积与性能

**证据：构建产物。置信度：高。**

最新已构建前端包含两个超过 500 KiB 的懒加载 chunk：

```text
MarkdownEditor-DnJLy034.js         约 584 KiB
RenderedPreviewPane-DO2Eqz_I.js    约 510 KiB
```

它们不一定阻塞项目列表首屏，但首次进入编辑器或预览可能在弱 Wi-Fi、手机和低性能设备上产生等待。

改进建议：

1. 拆分编辑器语言包、worker、插件和不常用命令。
2. 预览按 Markdown、LaTeX、PDF 能力进一步懒加载。
3. 使用真实 LAN 网络条件测量首次打开耗时、交互可用时间和失败重试，而不是只看 gzip 大小。
4. 为懒加载和失败状态提供可理解的骨架、进度与重试。

## 13. 仓库可维护性与发布归因

### 13.1 工作区变更规模过大

**证据：Git 直接证据。置信度：高。**

当前：

```text
git status --short: 163 条
已跟踪 diff: 96 个文件
约 6168 insertions / 4706 deletions
```

这会导致：

- 难以确认一个行为修复对应哪个测试；
- 源码、文档、构建产物和正式部署容易属于不同批次；
- 回滚和代码审查成本高；
- 用户原有改动与自动化改动难以区分；
- “已修复”容易被误写成“已部署”。

### 13.2 核心模块体积过大

当前主要大文件：

```text
paperWorkbenchService.js  8042 lines
App.css                   6088 lines
paperRagService.js         2587 lines
skillEngine.js             2424 lines
LatexPreview.tsx           1281 lines
DrawPanel.tsx              1127 lines
ProjectPage.tsx            1043 lines
SkillsSelector.tsx          938 lines
ProjectTree.tsx             924 lines
RightPanel.tsx              871 lines
```

问题不只是行数，而是状态、权限、安全校验、i18n、数据访问和展示容易混在同一模块中。建议按稳定业务边界拆分，而不是机械按行数拆文件。

### 13.3 被跟踪的备份、构建和测试状态文件

当前 Git 跟踪包含：

```text
app/apps/frontend/src/app/components/SkillsSelector.tsx.bak
app/apps/frontend/dist/index.html
app/test-results/.last-run.json
test-results/.last-run.json
```

它们可能有历史原因，本轮未删除。仓库需要明确 artifact policy：哪些构建产物必须提交、哪些只属于 CI artifact、哪些运行状态必须忽略、是否禁止 `.bak`。

### 13.4 论文项目文件在审计期间出现新状态

**证据：哈希直接证据。置信度：高。**

当前：

```text
papers/paper-agent-spe/project.json
SHA-256: 55f3be5579a0a00fc8ae7b1bdaaedf6c20b6fad7647d4f869358f0aadc3958d5
```

此前审计检查点记录的是另一哈希。本文不判断变化来自用户、其他 Agent 还是其他流程，也没有回滚或覆盖。它说明在最终发布前必须重新建立变更归属和数据保护基线，不能继续引用旧哈希声称“正式论文 diff 未变化”。

## 14. 文档可信度问题

**证据：文档、API 和 Playwright 直接证据。置信度：高。**

`docs/repository_audit_remediation_status_2026-07-22.md` 中存在“正式服务已重启”“LAN Playwright 已通过”等陈述，但当前正式事实是：

- `/api/ready` 404；
- `/api/health` 没有 build metadata；
- `authRequired:false`；
- `/api/config` 与 `/api/projects` 可匿名读取；
- 三个视口只能看到版本阻断页。

建议所有整改状态使用四个独立字段：

| 状态 | 含义 |
| --- | --- |
| 源码实现 | 代码中已经存在 |
| 自动化通过 | 指定测试在指定构建上通过 |
| 已部署 | 正式进程已替换为该构建 |
| 正式验收 | 正式 API 和真实 Playwright 已验证 |

任何前一列都不能自动推导后一列。

## 15. 问题优先级总表

| 优先级 | 问题 | 当前状态 | 证据 | 置信度 |
| --- | --- | --- | --- | --- |
| P0 | 正式前后端版本不一致，核心页面全部阻断 | 仍存在 | Playwright/API | 高 |
| P0 | 正式旧后端匿名暴露配置和项目元数据 | 仍存在 | API | 高 |
| P0 | 状态文档与正式事实不一致 | 仍存在 | 文档/API/Playwright | 高 |
| P1 | CLI Provider 只有只读 Chat，没有 Task Agent Diff/Accept/Reject 闭环 | 仍存在 | 源码/测试 | 高 |
| P1 | RAG 仍是本地词项重叠，缺健康状态和质量基线 | 仍存在 | 源码/UI | 高 |
| P1 | 首次启动 Token、Provider、CLI 登录和权限引导不足 | 仍存在 | UI/源码 | 高 |
| P1 | Playwright 运行依赖入口不统一 | 仍存在 | 实际启动/源码 | 高 |
| P1 | `/api/ready` 不能代表完整任务可执行 | 仍存在 | 源码 | 高 |
| P1 | 论文项目文件基线哈希发生变化，变更归属待核对 | 新发现 | 文件哈希 | 高 |
| P2 | Skills 真实执行记录和 manifest 没有完整闭环 | 仍存在 | 源码 | 高 |
| P2 | Skills 全部假 ready | 工作区已修，正式未验 | 测试/源码 | 高 |
| P2 | 项目名与目录完全无法对应 | 工作区已明显改善，正式未验 | 源码/既有 Playwright | 高 |
| P2 | Google Fonts 和 Draw.io 外部依赖影响离线使用 | 仍存在 | Playwright/源码 | 高 |
| P2 | 设置页等中英文混用 | 仍存在 | UI/源码 | 高 |
| P2 | 两个懒加载 chunk 超过 500 KiB | 仍存在 | 构建产物 | 高 |
| P2 | 工作区 163 条状态、96 文件 tracked diff | 仍存在 | Git | 高 |
| P2 | 多个核心模块过大 | 仍存在 | 文件统计 | 高 |
| P2 | `.bak`、dist、测试状态文件治理不清 | 仍存在 | Git | 高 |
| P2 | HTTP Provider DNS rebinding/socket pinning | 待专项验证 | 源码推断 | 中 |

## 16. 建议优化顺序

### 第一阶段：恢复正式可用性和可信发布状态

1. 冻结当前功能扩张，明确最终发布批次。
2. 核对所有未提交变更和论文项目文件归属。
3. 跑完整 typecheck、lint、unit、integration、build 和隔离 E2E。
4. 生成唯一最终 build ID。
5. 用当前构建替换正式旧进程，验证唯一监听。
6. 验证鉴权、配置隐私、project API、ready 和 build handshake。
7. 对正式 LAN 地址运行桌面、手机和平板 Playwright。
8. 按正式证据更新状态文档。

### 第二阶段：补齐用户任务闭环

1. 新增安全的 CLI Task Agent 隔离快照、Diff、Accept/Reject 流程。
2. 增加 RAG health、generation、fingerprint 和逐文件诊断。
3. 建立 RAG 固定质量评测集。
4. 完成 Skills manifest、真实执行记录和来源/副作用审查。
5. 增加首次启动 Token/Provider 向导。
6. 完成剩余国际化和离线依赖降级。

### 第三阶段：工程治理

1. 对依赖告警做生产可达性分析和兼容升级。
2. 按业务边界拆分超大模块。
3. 继续拆分编辑器和预览 chunk，并用真实 LAN 性能验收。
4. 建立 build、test result、screenshot、runtime state 和 `.bak` 的 artifact policy。
5. 对 HTTP Provider 做 DNS rebinding/socket pinning 专项安全审查。
6. 将发布状态改为可机器验证的记录，而不是仅靠人工 Markdown 声明。

## 17. 后续实施验收清单

### 正式部署

- [ ] `/api/health` 返回 build ID、schema 和鉴权状态。
- [ ] `/api/ready` 返回 200。
- [ ] 无 Token 和错误 Token 不能读取 `/api/config`、`/api/projects`。
- [ ] 前端 build 与后端 build 一致。
- [ ] `0.0.0.0:8787` 只有一个正确进程。
- [ ] LAN 桌面、手机、平板能进入项目和编辑器。

### 项目身份

- [ ] 新建项目同时显示名称、稳定 ID 和实际目录。
- [ ] 已有目录注册不移动论文文件。
- [ ] 重命名行为对显示名和物理目录的影响明确。
- [ ] 用户能复制实际路径和稳定 ID。
- [ ] metadata/目录/主文件不一致有只读诊断。

### CLI Task Agent

- [ ] Chat 始终只读。
- [ ] Task Agent 只在隔离快照写入。
- [ ] 展示 changed files、Diff、命令、Provider、模型和 provenance。
- [ ] Reject 后原项目字节完全不变。
- [ ] Accept 原子应用，失败可回滚。
- [ ] 取消能终止完整进程树并留下审计记录。

### Skills

- [ ] 未声明元数据的旧 Skill 为 degraded。
- [ ] 缺命令/凭证的 Skill 为 unavailable 且不可激活。
- [ ] 静态检查不运行脚本、不联网、不调用模型。
- [ ] 真实执行记录可跨刷新和后端重启查询。
- [ ] 导入前显示来源、license、脚本、网络、凭证和写入范围。

### RAG

- [ ] 显示 healthy/degraded/corrupt/rebuilding。
- [ ] 显示 generation、fingerprint 和最近成功索引时间。
- [ ] 显示逐文件 parser、chars、chunks、warning/error。
- [ ] 明确标注“本地关键词检索，不是语义向量检索”。
- [ ] 固定评测可重复输出 Recall@K、MRR、证据行准确率和无答案指标。

### 工程与验证

- [ ] Playwright 通过唯一入口可在当前机器直接启动。
- [ ] 完整测试全绿，而不只是聚焦测试。
- [ ] 每项依赖告警都有生产可达性或升级结论。
- [ ] 状态文档的源码、测试、部署、正式验收四列与事实一致。
- [ ] 没有无归属的 `.bak`、运行日志和测试状态文件。

## 18. 未知项与本轮限制

本轮没有对以下事项作无证据结论：

1. Codex、Claude Code、Copilot 当前机器账号是否全部已登录并能成功调用。
2. 真实 API Provider 的费用、限流、长论文上下文和生成质量。
3. CLI 长任务取消是否在所有异常路径都能终止子进程。
4. RAG 对真实论文问题的 Recall@K、引用正确率和无答案表现。
5. PDF/OCR 对扫描版、双栏、公式、表格和异常编码文档的总体质量。
6. 依赖漏洞中哪些路径真实进入生产并处理不可信输入。
7. DNS rebinding 是否能在当前 Node/fetch/网络条件下被实际利用。
8. 正式论文数据中的所有旧项目能否无损迁移到新身份模型。
9. 当前论文项目文件哈希变化的作者和具体意图。

这些问题需要隔离、可重复、具有明确授权边界的专项验收。

## 19. 最终判断

当前仓库的问题不是简单的“缺几个按钮”，而是四个层次没有一致：

```text
源码已经实现
≠ 自动化已经通过
≠ 正式构建已经部署
≠ 真实用户已经验收可用
```

最优先应解决正式版本漂移和匿名数据暴露，然后补齐 CLI Task Agent、RAG 健康与质量基线、Skills 真实执行可信度和首次启动引导。项目名称与目录映射、CLI Provider 选项、Skills 保守 readiness 等已有源码改善，应在部署后验证，而不应重复从零实现。

在正式 build/schema 一致、鉴权生效、三个视口可进入核心工作区、状态文档与正式证据一致之前，本仓库适合内部开发和隔离验证，不适合对外宣称已经稳定交付。
