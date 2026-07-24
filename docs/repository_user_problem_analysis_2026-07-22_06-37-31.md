# Paper Writing 仓库用户问题分析与优化建议

- 分析时间：2026-07-22 06:37:31（Asia/Shanghai）
- 仓库路径：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting`
- 正式访问地址：`http://10.30.0.22:8787`
- 分析视角：首次使用者、日常论文作者、管理员、二次开发维护者
- 分析原则：只发现问题，不修改功能代码，不重启正式服务，不写入正式论文内容，不调用真实付费模型
- 证据来源：Playwright 真实浏览器操作、HTTP/API 探测、进程与监听检查、当前源码与测试审阅、类型检查、单元测试、依赖审计、Git 工作区检查

## 1. 总体结论

当前仓库不是“没有功能”，而是已经积累了较多论文工作台能力，但四个状态没有形成可靠的一致性：

```text
源码中已经实现
≠ 自动化测试已经通过
≠ 正式服务已经部署
≠ 真实用户已经验收可用
```

从真实用户角度，当前最重要的结论如下：

1. **正式 LAN 服务目前无法进入核心工作区。** 桌面、手机、平板三个 Playwright 视口全部停留在前后端版本不一致阻断页。
2. **正式旧后端仍然匿名暴露配置与项目元数据。** 无 Token 和错误 Bearer Token 访问 `/api/config`、`/api/projects` 都返回 200。
3. **当前工作区源码明显领先于正式进程。** 鉴权、build handshake、`/api/ready`、项目身份展示、CLI Provider、Skills readiness、RAG 健康诊断等能力已经在源码中出现，但正式用户当前无法使用或验证。
4. **Codex、Claude Code、GitHub Copilot 已经可作为只读 Chat Provider，但还不是可修改论文的 Task Agent。** 缺少隔离快照、文件 Diff、Accept/Reject、来源追踪、持久化任务历史和安全应用变更的完整闭环。
5. **项目名称与 `papers` 子目录不一致的原始痛点在当前源码中已有实质改善。** 当前模型区分显示名、稳定 ID 和物理目录，并支持注册已有目录；问题已经从“完全对不上”转为“身份模型仍需解释和正式部署验收”。
6. **Skills 与 RAG 都从“有入口”发展到了“有部分状态透明度”，但还没有达到完整可信执行。** Skills 真实执行记录不持久；RAG 仍是本地关键词重叠检索，缺少固定质量评测。
7. **工程交付面仍然混杂。** 当前 `git status --short` 有 176 条记录，已跟踪 diff 涉及 101 个文件、7030 行新增和 6560 行删除，并有 75 个未跟踪文件。源码、测试、文档、删除中的旧产物与正式服务不是同一批次。
8. **当前源码基础检查较健康，但不能替代正式验收。** TypeScript 类型检查通过，66 个单元测试文件、390 个测试全部通过，`npm audit` 为 0 漏洞；正式部署仍然不可用且存在匿名元数据暴露。

综合判断：当前工作区适合继续隔离开发和验证，但当前正式 LAN 实例不适合被描述为“已稳定交付”。

## 2. 证据等级与分析边界

本文对结论使用以下分类：

- **直接证据**：本轮 Playwright、HTTP、进程、文件、测试或构建产物直接证明。
- **源码证据**：当前工作区代码明确存在某项能力，但不代表正式进程已经加载。
- **高可信推断**：多个直接证据共同支持，但本轮没有进行破坏性、付费或生产压力验证。
- **未知**：在只读、安全审计边界内无法确认。

本轮没有执行以下操作：

- 没有修改任何产品功能代码；
- 没有重启 PID `575763` 的正式后端；
- 没有对正式论文文件执行写操作；
- 没有调用真实 Codex、Claude Code、Copilot 或付费 HTTP 模型；
- 没有接受、拒绝或应用任何 AI 建议到正式项目；
- 没有实施 DNS rebinding、命令注入或数据破坏性利用；
- 没有用“测试文件存在”替代真实浏览器验证。

## 3. Playwright 真实用户操作结果

### 3.1 三类设备全部被版本门禁阻断

**结论：正式环境已复现。置信度：高。**

本轮使用真实 Chromium 访问：

```text
http://10.30.0.22:8787/projects
```

结果如下：

| 设备 | 视口 | 页面 HTTP | 可进入项目列表 | 可进入编辑器 | 横向溢出 | 控制台错误 |
| --- | ---: | ---: | --- | --- | --- | --- |
| 桌面 | 1440×900 | 200 | 否 | 否 | 无 | 无 |
| 手机 | 390×844 | 200 | 否 | 否 | 无 | 无 |
| 平板 | 768×1024 | 200 | 否 | 否 | 无 | 无 |

三个视口看到的核心内容一致：

```text
前后端版本不一致
当前页面与服务器不是同一次构建。为避免使用旧接口修改论文，工作区已暂停加载。
missing-build-metadata
Frontend build 20260721223258-f0ef1484486e-dfaef32c is not compatible with the running backend.
重新检查
管理员需要重新构建并重启前后端服务，然后再刷新页面。
```

浏览器只发出了 `/api/health` 请求，该请求返回 200。页面没有继续加载项目、配置、Skills、RAG 或编辑器业务数据。

这里需要区分两个事实：

- 版本门禁本身是正确的数据保护机制，它阻止新前端调用不兼容旧接口修改论文；
- 正式产品仍然处于不可用状态，HTTP 200 不能被解释为“页面可用”。

### 3.2 阻断页响应式表现正常，但不能代表主工作区移动端可用

**结论：正式环境已复现。置信度：高。**

桌面、手机和平板的阻断页均没有横向溢出，页面尺寸与视口一致。这个结果只能证明 Deployment Gate 页面本身能适配三个视口。

由于核心工作区没有加载，本轮正式实例无法实测以下路径：

- 手机和平板的项目列表和项目卡片；
- 编辑器、预览、聊天三栏布局；
- 移动端导航、抽屉、键盘遮挡和触控目标；
- Settings、Skills、RAG、Terminal、Draw 和 Compile 面板；
- 长项目名、长目录名、长错误信息和大文件树；
- 弱网下编辑器与预览 chunk 的首次加载体验。

因此，不能以“阻断页没有横向滚动”推导“整个产品移动端已经通过”。

### 3.3 Playwright 运行环境仍存在入口一致性风险

**结论：既有直接证据，本轮已通过显式依赖路径运行。置信度：高。**

仓库在 `.playwright-deps/usr/lib/x86_64-linux-gnu` 中保存了 Chromium 所需动态库。本轮必须把该目录加入 `LD_LIBRARY_PATH` 才能稳定启动浏览器。

这说明浏览器依赖资产已经存在，但普通 Playwright 调用、preflight、截图流程和个别后端浏览器流程仍可能使用不同环境构造方式。用户或维护者容易遇到：

```text
libatk-1.0.so.0: cannot open shared object file
```

然后误判为测试完全无法运行。

优化方法：

1. 提供唯一的 Playwright 启动入口，统一浏览器路径、动态库路径、输出目录和超时策略。
2. 让 preflight、E2E、截图、GPTZero 浏览器流程复用同一个环境构造函数。
3. 在失败信息中打印浏览器版本、缺失库、依赖目录和可复制的复现命令。
4. 正式验收必须实际启动浏览器，不能只检查 Playwright 包或测试文件是否存在。

## 4. P0：正式部署不可用与匿名元数据暴露

### 4.1 正式后端没有运行当前工作区版本

**结论：正式环境已复现。置信度：高。**

当前正式监听：

```text
0.0.0.0:8787
PID 575763
启动时间 2026-07-22 02:56:52
cwd /data01/home/xuzk/workspace/ai_agent/paper_wrighting/app/apps/backend
node src/index.js
```

API 结果：

```text
GET /api/health       -> 200，32 bytes
GET /api/ready        -> 404
GET /api/config       -> 200，645 bytes
GET /api/projects     -> 200，762 bytes
GET /api/providers    -> 200，1297 bytes
GET /api/capabilities -> 503，74 bytes
```

当前源码已经在 `app/apps/backend/src/routes/health.js:44` 注册 `/api/ready`，并在 `app/apps/backend/src/config/buildInfo.js` 提供 build metadata。正式进程却返回 `/api/ready` 404，`/api/health` 也没有当前 build metadata，因此正式进程和当前源码不是同一行为批次。

用户影响：

- 所有用户在项目入口被阻断；
- 用户无法自行恢复，只能联系管理员；
- “重新检查”只是重复探测，不会切换或回滚到兼容构建；
- 页面没有发布批次、部署时间、后端 build、负责人或诊断编号；
- 当前源码中已经完成的功能对正式用户等同于不存在。

优化方法：

1. 把前端构建、后端启动、进程替换、唯一监听验证和 LAN Playwright 作为一个发布事务。
2. 发布记录必须保存前端 build ID、后端 build ID、API schema、PID、启动命令、部署时间和验收结果。
3. 阻断页展示前端 build、后端 build、schema、服务地址和可复制诊断信息。
4. 发布失败时恢复上一套前后端匹配构建，避免长期停留在“新前端 + 旧后端”。

### 4.2 正式旧后端对无 Token 和错误 Token 都返回业务数据

**结论：正式环境已复现。置信度：高。**

本轮请求结果：

```text
无 Authorization：
GET /api/config   -> 200
GET /api/projects -> 200

Authorization: Bearer definitely-invalid-audit-token：
GET /api/config   -> 200
GET /api/projects -> 200
```

响应正文没有写入报告，但响应大小证明正式接口确实返回了非空业务数据。此前同日审计已观察到 Provider endpoint、模型配置状态、数据根和项目身份等元数据。

当前工作区源码的 `app/apps/backend/src/middleware/auth.js` 已有 Bearer Token 和默认保护逻辑，但正式实例没有加载这一行为。

用户与管理员风险：

- 同网段未授权用户可枚举项目；
- 可获取内部服务和系统配置线索；
- 错误 Token 不会触发明显拒绝，容易让管理员误认为鉴权已经生效；
- 前端阻断并不能保护直接 API 请求。

优化方法：

1. 正式环境所有业务 API 默认拒绝匿名访问。
2. `/api/health` 仅暴露必要的 liveness、build/schema 和鉴权是否启用，不返回敏感路径。
3. `/api/config` 只返回前端需要的脱敏字段，不返回密钥、证书路径或内部数据根。
4. 每次发布自动验证无 Token、错误 Token、正确 Token 三种情形。
5. 不能把前端路由门禁当成后端授权边界。

## 5. 当前源码已经改善、但正式环境尚未验收的功能

### 5.1 项目名称、稳定 ID 与物理目录

**结论：源码证据明确；正式环境未知。置信度：高。**

当前源码已经建立三个不同身份：

- 显示名：面向论文作者；
- 稳定项目 ID：面向 API、引用和内部关联；
- 物理目录：面向文件系统、备份和外部工具。

`app/apps/backend/src/services/projectLocator.js:135-145` 创建项目时生成安全目录名，当前规则为显示名加稳定 ID 的短前缀。`app/apps/frontend/src/app/ProjectPage.tsx:680-681` 同时显示并允许复制实际存储目录。`app/apps/frontend/src/app/ProjectPage.tsx:583-615` 支持发现和注册已有论文目录，并明确注册不会移动论文文件。

这意味着用户最初提出的“页面工程与 `papers` 子文件夹完全对不上”在当前源码里已经得到实质改善，不能再作为“完全未修复”描述。

仍然存在的用户认知成本：

- 重命名项目时，显示名和物理目录是否同时变化；
- 哪些字段可以安全手工修改；
- 旧 UUID 目录、手工目录和新命名规则如何共存；
- 从其他机器复制目录后应选择导入、注册还是新建；
- `project.json` ID 与目录名不一致时谁是权威；
- 外部脚本应该使用稳定 ID、显示名还是路径。

优化方法：

1. 在项目详情中用一段简短说明解释三个身份的用途与可变性。
2. 显式提供“复制稳定 ID”“复制实际路径”“在文件浏览器中定位”。
3. 重命名前说明是否会移动目录以及外部工具可能受到的影响。
4. 为旧项目、注册项目和新规则项目显示来源标签。
5. 提供只读身份诊断，检查 metadata、目录、主文件和注册状态是否一致。

### 5.2 RAG 索引健康与透明度

**结论：源码证据明确；正式环境未知。置信度：高。**

旧审计中“没有 RAG health、generation、fingerprint”的结论已经过时。当前源码已经包含：

- `app/apps/backend/src/routes/paperRag.js:70` 的 `GET /api/projects/:id/rag/health`；
- `healthy/degraded/corrupt/rebuilding` 状态；
- generation；
- corpus fingerprint；
- 文件、分块、失败文件和零 chunk 文件计数；
- 逐文件 parser、字符数、chunk、warning 和 error；
- UI 中的索引修复/重建入口；
- 明确的本地检索类型标识。

`app/apps/backend/src/services/paperRagService.js:25-28` 将检索类型声明为 `local-keyword-overlap`，并明确 `semantic: false`。

仍然存在的问题：

1. 当前核心检索仍是 token overlap，不是 embedding 或语义向量检索。
2. 中文二元字和简单分词对同义改写、术语变体、跨段落语义问题的召回能力未知。
3. 没有看到固定的中英文检索质量基线，无法量化健康索引是否真的检索正确。
4. health 证明索引结构与解析状态，不证明回答证据质量。
5. 正式服务仍是旧版本，本轮无法从正式 UI 验证健康面板。

优化方法：

1. 保留当前透明、低成本、本地优先的关键词检索作为 baseline。
2. 建立固定中英文评测集，覆盖同义改写、跨章节、引用定位、表格数字、无答案问题。
3. 比较 overlap、BM25、hybrid、embedding、reranking，而不是直接引入向量数据库。
4. 输出 Recall@K、MRR、证据行准确率、无答案拒答、索引耗时、查询延迟和成本。
5. 每次回答记录使用的 RAG generation 和 fingerprint，便于复现。

### 5.3 Provider 首次启动引导与国际化

**结论：源码证据明确；正式环境未知。置信度：高。**

旧报告中“Settings 仍只有英文 Apply/Load models/Test connection”的描述已经过时。当前 `SettingsModal.tsx:312-346` 已提供四步快速设置引导，中文 locale 已包含：

- 服务器访问令牌；
- Provider 选择；
- API Key 与 Server Token 的区别；
- CLI 已安装和已登录的说明；
- 加载模型；
- 测试连接；
- Chat 与文件修改任务的权限差异。

仍然可以改进的地方：

- 首次启动向导仍位于 Settings 内，用户是否能在空白首页自然发现未知；
- CLI 登录状态目前更多依赖连接测试，没有独立的账号、版本和可用性摘要；
- “测试连接可能联网或产生费用”的风险提示需要在执行前更加显著；
- Server Token 只对当前标签页还是跨刷新持久的行为，需要清晰说明；
- 正式版本门禁阻断时用户无法进入 Settings 修复 Provider 问题。

### 5.4 离线主界面字体和依赖漏洞

**结论：当前源码与审计直接证据。置信度：高。**

旧报告中 `App.css` 引用 Google Fonts 的问题已经修正，当前 `App.css` 不再包含 `fonts.googleapis.com` 或 `fonts.gstatic.com`。

完整 `npm audit` 结果为：

```text
info: 0
low: 0
moderate: 0
high: 0
critical: 0
total: 0
```

因此，不应继续把“Google Fonts 主界面加载失败”和“已知 npm 漏洞”列为当前未解决问题。

但局部 LaTeX 预览模板仍在 `app/apps/frontend/src/app/components/LatexPreview.tsx:206` 引用 jsDelivr 上的 Computer Modern 字体，这与主界面的离线字体治理不是同一个问题。

## 6. P1：CLI Provider 已存在，但缺少真正安全可审查的 Task Agent

### 6.1 Codex、Claude Code、Copilot 选项已经存在

**结论：源码证据明确。置信度：高。**

当前 Provider 注册表已经包含：

- Codex CLI；
- Claude Code CLI；
- GitHub Copilot CLI；
- OpenAI-compatible HTTP；
- Anthropic HTTP。

所以后续工作不应再把“增加 Codex/Copilot 选项”当作从零开始的新功能。

### 6.2 当前 CLI 是刻意限制的只读 Chat

**结论：源码证据明确。置信度：高。**

`app/apps/backend/src/services/agentProviderRegistry.js` 固定使用：

```text
Codex:   exec --json --ephemeral --sandbox read-only
Claude:  --no-session-persistence --permission-mode dontAsk --tools ''
Copilot: --available-tools '' --no-ask-user --no-auto-update
```

CLI capability 还声明 `toolCalling: false`。这是合理的默认安全边界，但它只能完成文本回答，不能完成用户期望的“让 Codex/Copilot 修改论文工程并提交可审查结果”。

### 6.3 仓库中没有独立 CLI Task Agent 实现

**结论：源码与路由搜索直接证据。置信度：高。**

当前后端路由注册中没有 CLI Task 路由，仓库也没有 `cliTaskAgentService`、`waiting-review` 任务状态机或独立 Task Agent 文件。

现有聊天中的 Accept/Reject 主要针对模型返回的文本编辑提案，不等价于：

- CLI 在隔离文件系统中运行；
- 收集多文件新增、修改和删除；
- 审查完整 unified diff；
- 拒绝后证明原工程字节不变；
- 接受时检查源文件漂移；
- 原子应用并可回滚；
- 任务跨页面刷新和后端重启恢复。

建议的安全产品闭环：

```text
选择 managed projectId
→ 在项目外创建 symlink-safe 隔离快照
→ CLI 只在快照 cwd 中执行
→ 收集 changed files、unified diff 和执行 provenance
→ waiting-review
→ 用户 Accept 或 Reject
→ Accept 检查源漂移并原子应用
→ Reject 保证原项目哈希不变
→ 持久化历史、状态、错误和取消原因
```

最低安全要求：

1. 普通 Chat 永远保持只读。
2. CLI 可执行文件和参数模板由服务端固定，禁止用户提交任意 shell 字符串。
3. 输入必须使用受管理的 `projectId`，不能接受任意绝对路径。
4. 快照必须位于项目目录之外，并拒绝 symlink 逃逸。
5. 任务状态至少包含 queued、running、waiting-review、accepted、rejected、failed、cancelled。
6. 取消必须终止完整进程树。
7. 必须记录 Provider、模型、可执行文件版本、参数摘要、时间、退出码和 changed files。
8. 自动化测试使用 mock CLI，不能调用真实付费工具。

## 7. P1/P2：Skills 系统仍缺真实执行可信度

### 7.1 “所有 Skill 都显示 ready”已在当前源码改善

**结论：源码和测试证据。置信度：高。**

当前 `skillReadinessService.js` 已根据命令、凭证和 manifest 声明区分：

- ready；
- degraded；
- unavailable。

没有明确执行元数据的旧 Skill 会保守降级，而不是全部显示 ready。这一点已有单元测试保护。

### 7.2 真实执行历史仍是进程内状态

**结论：源码证据明确。置信度：高。**

`app/apps/backend/src/services/skillReadinessService.js:5-6` 定义：

```text
const dryRunState = new Map();
const lastRunState = new Map();
```

`lastRunState` 在 `:231` 写入。后端重启后这些记录会丢失，无法形成可靠审计历史。

这会带来以下用户问题：

- 页面刷新或后端重启后无法证明 Skill 最近是否成功；
- 静态 readiness 容易被用户误解为真实执行成功；
- 无法比较不同 Provider、模型或版本的执行结果；
- 失败原因、产物、费用、耗时和副作用无法长期追踪；
- 导入的 Skill 缺少统一来源、license、脚本和网络目标审查。

优化方法：

1. 明确区分 static check、safe probe、real execution 三类状态。
2. 将真实运行记录持久化，并能跨刷新、跨后端重启查询。
3. Skill manifest 标准化 commands、credentials、network、files、side effects、cost class 和 provider capabilities。
4. unavailable Skill 禁止激活，并给出缺失项和可运行替代项。
5. 导入前展示来源、版本、license、脚本、网络目标、凭证和写入范围。
6. 对每次执行保存 Provider、模型、输入摘要、产物、耗时、费用、退出状态和错误。

## 8. P1：系统状态模型仍然容易让用户误解

### 8.1 liveness、readiness、build compatibility 与 task readiness 不是一回事

**结论：源码与正式 API 证据。置信度：高。**

当前工作区 `/api/ready` 主要检查数据根和模板 manifest。即使某个 Provider、CLI、编译器、OCR、Draw.io、RAG 或 Skill 不可用，基础 readiness 仍可能成功。

系统应分别表达：

| 状态 | 回答的问题 |
| --- | --- |
| Liveness | 进程是否还能响应 |
| Readiness | 基础服务依赖是否可用 |
| Build compatibility | 前后端是否属于兼容构建 |
| Capability | Provider、编译器、OCR、RAG、Skills 等是否可用 |
| Task readiness | 用户当前选择的具体任务能否执行 |

当前正式实例的实际例子恰好说明混淆风险：`/api/health` 返回 200，但用户无法进入工作区，`/api/ready` 404，`/api/capabilities` 503。

优化方法：

1. UI 不用一个“系统正常”覆盖所有层次。
2. 项目列表只依赖基础 readiness；具体功能在进入前显示 capability 和 task readiness。
3. 错误信息说明是部署、鉴权、Provider、命令、外网还是项目数据问题。
4. 对管理员提供可复制的结构化诊断，而不是只展示一句失败。

## 9. P2：离线能力和第三方服务依赖仍不完整

### 9.1 Draw.io 依赖外部嵌入站点

**结论：源码证据明确。置信度：高。**

`app/apps/frontend/src/app/components/DrawioEditor.tsx:10` 固定使用：

```text
https://embed.diagrams.net/
```

在无外网、代理受限、第三方 CSP 变化或上游服务故障时，绘图功能可能不可用。当前页面 shell 能打开不能证明 Draw.io 能工作。

建议：

- 在 capability 中明确显示 Draw.io 外网依赖和可达性；
- 提供清晰降级页、重试和导入/导出保底路径；
- 如果产品目标包含完全离线使用，需要评估自托管或本地替代方案。

### 9.2 LaTeX 预览局部模板仍请求外部字体

**结论：源码证据明确。置信度：高。**

`LatexPreview.tsx:206` 仍包含：

```css
@import url('https://cdn.jsdelivr.net/gh/aaaakshat/cm-web-fonts@latest/fonts.css');
```

主界面 Google Fonts 已移除，但该局部预览仍可能产生外网请求、隐私暴露、加载超时和截图差异。

建议：使用本地已随构建发布的字体或系统/KaTeX 字体栈，并为离线模式添加网络请求断言。

### 9.3 多项论文能力天然依赖外部 API

**结论：源码证据明确。置信度：高。**

仓库还使用 Crossref、Semantic Scholar、OpenAlex、arXiv、MinerU、GPTZero、绘图 API 和模型 Provider。这些并非必然缺陷，但必须在用户界面中明确：

- 是否联网；
- 数据发送到哪里；
- 是否需要密钥；
- 是否可能收费；
- 超时和限流如何处理；
- 无网时还能完成哪些本地任务。

## 10. P2：前端体积与弱网体验风险

**结论：构建产物直接证据。置信度：高。**

当前已构建前端中较大的资源包括：

```text
swiftlatexpdftex.wasm                  约 1.78 MB
MarkdownEditor-DUtybKJ_.js            约 584 KB
RenderedPreviewPane-B4F7s-VD.js       约 510 KB
index-DW_fNrCE.js                     约 429 KB
TerminalPanel-7XTQx4Yd.js             约 286 KB
```

编辑器和预览是懒加载资源，因此不一定阻塞项目列表首屏，但会影响用户第一次打开编辑器、预览或本地 LaTeX 能力时的等待。

本轮正式环境被版本门禁阻断，无法测量真实 LAN 的首次交互时间。

优化方法：

1. 进一步拆分编辑器语言包、worker、插件和低频命令。
2. 按 Markdown、LaTeX、PDF 和高级预览能力拆分 RenderedPreviewPane。
3. 给大资源提供明确的加载进度、失败重试和离线缓存状态。
4. 在真实 LAN、弱 Wi-Fi、手机 CPU 条件下测量首次打开时间和可交互时间。
5. 建立 chunk 预算和回归门禁，而不是只依赖 Vite 警告。

## 11. P2：超大模块增加改动与安全审查成本

**结论：文件统计直接证据。置信度：高。**

当前主要大文件：

```text
paperWorkbenchService.js   8042 lines
App.css                    6086 lines
paperRagService.js         2748 lines
skillEngine.js             2424 lines
LatexPreview.tsx           1281 lines
DrawPanel.tsx              1127 lines
ProjectPage.tsx            1043 lines
SkillsSelector.tsx          938 lines
ProjectTree.tsx             924 lines
RightPanel.tsx              871 lines
projects.js                 799 lines
ai.js                       722 lines
```

问题不只是行数，而是以下关注点容易耦合：

- 状态管理与 UI 展示；
- 项目路径解析与业务逻辑；
- Provider 权限与对话逻辑；
- RAG 索引、检索、外部文献源和解析器；
- Skills 注册、推荐、导入、执行和 readiness；
- CSS 响应式、主题和各业务面板样式。

影响：

- 单个改动的影响面难判断；
- 安全边界更难单独审查；
- 测试容易依赖大模块内部实现；
- 多人或多 Agent 并行时共享文件冲突概率高；
- 发布归因和回滚变得困难。

优化方法：按稳定业务边界拆分，而不是机械按行数切文件。例如 RAG 可分为索引存储、解析器、检索器、外部文献源和健康诊断；Skills 可分为 registry、manifest、readiness、recommendation、import 和 execution history。

拆分前必须锁定现有行为测试，保持外部接口不变，逐步迁移，避免把结构重构与产品功能扩张放在同一批次。

## 12. P0/P2：工作区与发布归因失控

### 12.1 当前变更规模过大

**结论：Git 直接证据。置信度：高。**

当前工作区：

```text
git status --short        176 条
已跟踪 diff               101 个文件
新增                       7030 行
删除                       6560 行
未跟踪文件                 75 个
工作区删除中的文件          4 个
```

这会导致：

- 很难确认一个行为修复对应哪个测试和文档；
- 当前源码、dist、测试结果、审计文档与正式进程可能属于不同批次；
- 用户原有改动与自动化改动难以归属；
- 回滚、审查和 bisect 成本高；
- “源码已修”容易被误写成“正式已修”。

### 12.2 旧 artifact 已从工作区删除，但尚未形成提交层面的治理结果

**结论：Git 与文件直接证据。置信度：高。**

以下文件在 Git HEAD 中仍被跟踪，但当前工作区已经删除：

```text
app/apps/frontend/src/app/components/SkillsSelector.tsx.bak
app/test-results/.last-run.json
test-results/.last-run.json
```

`.gitignore` 已出现对备份和测试产物的治理改动。当前文件系统中这些旧文件确实不存在，但在最终提交前仍属于“待删除变更”，不能写成仓库历史已经完成治理。

`app/apps/frontend/dist/index.html` 仍被 Git 跟踪。是否提交 dist 必须形成明确政策：如果正式后端直接服务仓库 dist，它可能是发布资产；如果由 CI 构建，则不应与源码批次混杂。

### 12.3 正式论文项目文件必须重新建立保护基线

**结论：文件哈希直接证据。置信度：高。**

当前：

```text
papers/paper-agent-spe/project.json
SHA-256 55f3be5579a0a00fc8ae7b1bdaaedf6c20b6fad7647d4f869358f0aadc3958d5
```

该文件当前出现在 Git 修改状态中。本轮没有判断修改来自用户、其他 Agent 还是既有流程，也没有回滚或覆盖。

最终发布或任何写入型 Agent 功能上线前，必须重新确认正式论文文件的所有者、预期 diff 和保护基线，避免使用旧哈希作出错误的数据未变化声明。

## 13. 文档可信度与状态表达问题

**结论：文档、正式 API 与 Playwright 直接证据。置信度：高。**

仓库同日存在多份名称相近的审计和状态文档，例如：

- `repository_user_audit_...`
- `repository_current_user_audit_...`
- `repository_problem_analysis_...`
- `repository_current_problem_audit_...`
- `repository_current_issue_audit_...`
- `repository_audit_remediation_status_...`

部分旧文档中的问题随后已经在源码中修复，部分“已完成”描述又没有在正式实例生效。用户和维护者很难判断哪份文档是当前真相。

建议整改状态使用统一矩阵：

| 功能/问题 | 源码实现 | 自动化通过 | 已构建 | 已部署 | 正式 Playwright 验收 | 证据时间 |
| --- | --- | --- | --- | --- | --- | --- |
| 鉴权 | 是/否 | 是/否 | build ID | PID/时间 | 是/否 | 时间戳 |

规则：

1. 每个状态必须有证据链接或命令摘要。
2. 前一列不能自动推导后一列。
3. 新报告应标记旧报告 superseded，而不是继续并列增加多个“current”。
4. 状态文档不得把隔离测试通过写成正式 LAN 已通过。
5. 发布后再更新正式验收列，不能提前声明。

## 14. 当前源码验证结果

### 14.1 已通过

本轮执行：

```text
npm run typecheck
```

结果：通过。

本轮执行：

```text
npm run test:unit
```

结果：

```text
Test Files  66 passed (66)
Tests       390 passed (390)
```

本轮执行：

```text
npm audit --json
```

结果：0 vulnerabilities。

### 14.2 本轮没有重新执行的验证

为了遵守“先不改动、只发现问题”和“不重启正式服务”的边界，本轮没有执行会重建正式 dist 或替换服务的完整发布流程。

本轮没有重新执行：

- `npm run build`；
- 完整 integration suite；
- 完整隔离 E2E suite；
- 正式服务重启后的 LAN E2E；
- 真实 CLI Provider 付费调用；
- 真实外部论文 API 的稳定性和费用测试；
- 大项目性能、并发和长时间稳定性测试。

因此，390 个单元测试通过只能证明当前单元级回归基线良好，不能证明正式发布完成。

## 15. 问题优先级总表

| 优先级 | 问题 | 当前状态 | 证据类型 | 置信度 |
| --- | --- | --- | --- | --- |
| P0 | 正式前后端版本不一致，三类设备无法进入核心工作区 | 正式已复现 | Playwright/API | 高 |
| P0 | 正式旧后端无 Token、错误 Token 均可读取配置和项目元数据 | 正式已复现 | HTTP | 高 |
| P0 | 源码、构建、进程和状态文档不属于同一可追踪发布批次 | 仍存在 | Git/API/文档 | 高 |
| P0 | 正式论文项目 metadata 处于修改状态，变更归属未确认 | 仍存在 | Git/哈希 | 高 |
| P1 | CLI Provider 只有只读 Chat，没有隔离 Task Agent 闭环 | 仍存在 | 源码/路由 | 高 |
| P1 | Playwright 动态库环境没有统一为唯一入口 | 仍存在 | 实际浏览器启动 | 高 |
| P1 | 系统状态层次容易混淆，health 200 不代表工作区可用 | 仍存在 | API/源码 | 高 |
| P1 | RAG 没有固定质量评测，关键词检索能力边界无法量化 | 仍存在 | 源码/测试审阅 | 高 |
| P1 | HTTP Provider socket pinning/DNS rebinding 防护尚未专项确认 | 待专项验证 | 源码推断 | 中 |
| P2 | Skills 真实执行历史只在进程内 Map 中保存 | 仍存在 | 源码 | 高 |
| P2 | Skills manifest、来源、副作用、费用与真实产物审计不完整 | 仍存在 | 源码/产品契约 | 高 |
| P2 | Draw.io 和局部 LaTeX 字体仍依赖外部站点 | 仍存在 | 源码 | 高 |
| P2 | MarkdownEditor 和 RenderedPreviewPane chunk 超过 500 KB | 仍存在 | dist 产物 | 高 |
| P2 | 多个核心模块超过 1000 行，最大 8042 行 | 仍存在 | 文件统计 | 高 |
| P2 | 工作区 176 条状态、101 个 tracked diff、75 个 untracked | 仍存在 | Git | 高 |
| P2 | 多份同日审计文档并列，当前真相不清晰 | 仍存在 | 文档列表 | 高 |
| 已改善 | 项目名称/ID/目录完全无法对应 | 当前源码已明显改善，正式未验 | 源码/既有测试 | 高 |
| 已改善 | RAG 没有 health/generation/fingerprint | 当前源码已实现，正式未验 | 源码/单测 | 高 |
| 已改善 | 所有 Skill 都显示 ready | 当前源码已保守区分，正式未验 | 源码/单测 | 高 |
| 已改善 | Settings 关键文案中英文混用且无首次引导 | 当前源码已有四步引导与翻译，正式未验 | 源码/单测 | 高 |
| 已改善 | 主界面依赖 Google Fonts | 当前源码已移除 | 源码/测试 | 高 |
| 已改善 | npm 已知依赖漏洞 | 当前完整 audit 为 0 | npm audit | 高 |

## 16. 建议的优化顺序

### 第一阶段：恢复正式可用性和安全边界

1. 冻结功能扩张，明确一个最终候选发布批次。
2. 核对 176 条工作区状态和正式论文 metadata 的变更归属。
3. 跑完整 typecheck、unit、integration、build 和隔离 E2E。
4. 生成唯一 build ID，并保证前后端 schema 匹配。
5. 用受支持脚本替换正式旧进程，验证 `0.0.0.0:8787` 只有一个正确监听。
6. 验证无 Token、错误 Token、正确 Token 三种 API 行为。
7. 在正式 LAN 上重新跑桌面、手机、平板 Playwright，必须进入项目和编辑器。
8. 用正式证据更新唯一状态文档。

### 第二阶段：补齐用户真正需要的 Agent 与可信执行闭环

1. 新增独立 CLI Task Agent，而不是扩大 Chat 权限。
2. 实现隔离快照、Diff、Accept/Reject、漂移检测、原子应用、回滚和持久化历史。
3. 持久化 Skills 真实执行记录，完善 manifest、来源和副作用审查。
4. 建立 RAG 固定质量评测，量化是否需要 BM25、hybrid 或 embedding。
5. 在 UI 中统一展示 capability、联网、费用、数据去向和降级方式。

### 第三阶段：性能与工程治理

1. 统一 Playwright 运行入口和依赖环境。
2. 按业务边界拆分超大模块，先锁测试再重构。
3. 拆分编辑器和预览大 chunk，并建立真实 LAN 性能预算。
4. 完成 Draw.io、LaTeX 字体和外部 API 的离线/降级契约。
5. 建立 dist、test-results、截图、日志、备份文件和临时状态的 artifact policy。
6. 合并或归档重复审计文档，保留一个机器可验证的当前状态入口。

## 17. 后续验收清单

### 正式部署与鉴权

- [ ] `/api/health` 返回当前 build ID、API schema 和鉴权状态。
- [ ] `/api/ready` 返回符合当前源码契约的状态。
- [ ] 无 Token 和错误 Token 不能读取 `/api/config`、`/api/projects`。
- [ ] 正确 Bearer Token 能完成受保护操作。
- [ ] 前端 build、后端 build 与 API schema 一致。
- [ ] `0.0.0.0:8787` 只有一个属于当前发布批次的监听进程。
- [ ] 桌面、手机、平板均能进入项目列表、项目和编辑器。

### 项目身份

- [ ] 新建项目同时展示显示名、稳定 ID 和实际目录。
- [ ] 已有目录注册不会移动或删除论文文件。
- [ ] 重命名对显示名和物理目录的影响有明确说明。
- [ ] 可以复制稳定 ID 和实际路径。
- [ ] metadata、目录和主文件不一致时有只读诊断。

### CLI Task Agent

- [ ] Chat 始终保持只读。
- [ ] Task Agent 只在项目外隔离快照中写入。
- [ ] CLI 命令和参数模板由服务端固定。
- [ ] 展示新增、修改、删除文件及完整 Diff。
- [ ] Reject 后原项目所有受影响文件哈希不变。
- [ ] Accept 前检测源文件漂移。
- [ ] Accept 原子应用，失败可回滚。
- [ ] 取消终止完整进程树并留下审计记录。
- [ ] 历史跨页面刷新和后端重启存在。

### Skills

- [ ] 未声明执行元数据的旧 Skill 保守显示 degraded。
- [ ] 缺命令或凭证的 Skill 为 unavailable 且不可激活。
- [ ] 静态检查不运行脚本、不联网、不调用模型。
- [ ] 真实执行记录跨刷新和后端重启可查询。
- [ ] 导入前显示来源、版本、license、脚本、网络和写入范围。
- [ ] 每次执行保存 Provider、模型、耗时、费用、产物和错误。

### RAG

- [ ] 正式 UI 显示 healthy/degraded/corrupt/rebuilding。
- [ ] 显示 generation、fingerprint 和最近索引时间。
- [ ] 显示逐文件 parser、chars、chunks、warning/error。
- [ ] 明确标注“本地关键词证据检索，不是语义向量检索”。
- [ ] 固定评测可重复输出 Recall@K、MRR、证据行准确率和无答案指标。
- [ ] 回答记录对应的索引 generation/fingerprint。

### 工程与验证

- [ ] Playwright 通过唯一入口能在当前机器直接启动。
- [ ] 完整 typecheck、unit、integration、build、E2E 全部通过。
- [ ] 大 chunk 有预算、加载状态和弱网验收。
- [ ] 超大模块拆分前已有回归测试，拆分后外部行为不变。
- [ ] dist、test-results、备份和运行状态有明确提交政策。
- [ ] 状态文档明确区分源码、测试、构建、部署和正式验收。

## 18. 未知项与本轮限制

以下问题本轮没有足够证据下最终结论：

1. 当前机器上的 Codex、Claude Code、Copilot 是否全部安装、登录且账号可用。
2. 真实 HTTP Provider 的费用、限流、长上下文和生成质量。
3. CLI 长任务在所有异常路径下是否都能终止完整子进程树。
4. RAG 在真实论文问答中的 Recall@K、引用定位正确率和无答案表现。
5. PDF/OCR 对扫描版、双栏、公式、表格和异常编码文档的总体质量。
6. Draw.io、MinerU、GPTZero 和文献 API 在当前网络中的长期稳定性。
7. HTTP Provider 是否把已校验 DNS 地址固定到实际 socket，以及 DNS rebinding 是否可利用。
8. 正式论文目录中所有旧项目能否无损适配当前身份模型。
9. `papers/paper-agent-spe/project.json` 当前修改的作者和真实意图。
10. 主工作区在正式部署后的手机、平板、弱网和大项目性能。

这些问题需要隔离、可重复、有明确授权边界的专项验收，不能从源码存在或单元测试通过直接推导。

## 19. 最终判断

当前仓库已经解决或明显改善了一批原始问题：CLI Provider 选项、项目名称/ID/目录展示、已有目录注册、RAG 健康透明度、Skills readiness、Provider 首次引导、主界面离线字体和依赖漏洞。

但从真实用户角度，最关键的产品事实仍然是：

```text
正式页面打不开核心工作区；
正式旧 API 仍可匿名读取业务元数据；
CLI 只能只读聊天，不能安全完成文件任务；
源码、测试、构建、进程和文档没有形成同一可追踪发布事实。
```

因此，当前最优先的工作不是继续增加零散按钮，而是先恢复匹配、安全、可验证的正式发布；然后补齐 CLI Task Agent、Skills 真实执行审计和 RAG 质量评测；最后再处理大模块、前端体积、离线依赖和仓库 artifact 治理。

在正式 build/schema 一致、鉴权真实生效、桌面/手机/平板都能进入核心工作区、并且状态文档与正式证据一致之前，不应对外宣称本仓库已经稳定交付。
