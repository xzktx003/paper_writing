# Paper Writing 当前仓库问题分析与优化建议

- 报告时间：2026-07-22 03:54:37（Asia/Shanghai）
- 仓库：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting`
- 审计对象：当前工作区源码、当前正式运行实例 `0.0.0.0:8787`、正式 LAN 页面 `http://10.30.0.22:8787`
- 审计视角：论文写作者、局域网部署者、维护者
- 审计方式：Playwright 实际操作、只读 HTTP 探测、进程与文件时间检查、源码与现有测试/文档审阅
- 审计边界：只发现和记录问题；没有修改业务源码、配置、服务进程或论文数据
- 保护校验：`papers/paper-agent-spe/project.json` 既有 diff SHA-256 在审计后仍为 `afc5752ebb84e46894383ea77f151c700f973acea56858ffb696a6f48e63305e`

## 1. 最终结论

当前仓库已经具备一个论文工作台的大部分外形和相当多的功能模块：项目管理、编辑器、对话、Draw、RAG、Review、Citation、Anti-AI、Pipeline、模板、编译、Skills、HTTP/CLI Provider 和系统能力诊断均有实现。现有隔离测试记录显示 unit、integration 和 Playwright 主路径曾全部通过。

但是，从实际使用者角度，当前状态仍不适合直接定义为“整改完成并可稳定交付”。最突出的问题不是单个按钮失效，而是存在三套不同的真实状态：

1. **当前工作区源码**已经包含 default-deny 鉴权、managed project 校验、symlink 防护、Codex CLI 只读等新实现；
2. **整改状态文档**把多项问题标记为完成；
3. **正式 8787 运行实例**仍表现为旧版本：`authRequired:false`、匿名项目列表可读、CLI capability 仍声明 `stream:true`、中文页面仍有大量英文。

因此，当前最严重的风险是：

> 测试和文档描述的是工作区新代码，用户访问到的却仍可能是旧后端或旧前端；系统没有版本握手来主动发现这种混合部署。

此外，即使只评价当前源码，仍有 HTTP Provider SSRF、公开配置元数据泄露、RAG/模板非原子写入、完整 CLI Task Agent 缺失、Skills 可运行性不透明、中文界面未完成、项目候选目录无注册闭环、能力探针进程终止不完整、依赖漏洞和仓库卫生等问题。

综合判断：

- 功能覆盖：较高；
- 基础浏览器主路径：可用；
- 当前正式部署可信度：低；
- 数据安全与故障恢复成熟度：中低；
- Codex/Copilot “直接完成论文任务”的成熟度：低，目前只是只读 Chat Provider；
- RAG 与 Skills 的产品成熟度：中低，功能存在但缺少质量、就绪度和恢复闭环；
- 建议发布状态：**暂不作为稳定版本对外承诺**。

## 2. 本次 Playwright 与 API 实测

### 2.1 Playwright 启动环境

第一次直接执行 Playwright Chromium 时失败：

```text
libatk-1.0.so.0: cannot open shared object file
```

仓库实际依赖本地目录：

```text
.playwright-deps/usr/lib/x86_64-linux-gnu
```

把该目录加入 `LD_LIBRARY_PATH` 后，Playwright 可以正常启动并访问正式 LAN 页面。

这说明仓库虽然有隔离 E2E runner，但普通使用者直接调用 Playwright 时仍容易踩到环境差异；浏览器依赖握手没有统一进入所有入口。

### 2.2 项目列表页实测

访问：

```text
http://10.30.0.22:8787/projects
```

| 视口 | HTTP | `html.lang` | 横向溢出 | 结果 |
| --- | ---: | --- | ---: | --- |
| 1440×900 | 200 | `zh-CN` | 0 | 项目表格、设置、模板、导入入口正常出现 |
| 390×844 | 200 | `zh-CN` | 0 | 项目卡片布局可用 |
| 768×1024 | 200 | `zh-CN` | 0 | 平板布局可用 |

三种视口均持续出现：

```text
GET https://fonts.googleapis.com/... net::ERR_EMPTY_RESPONSE
```

当前有本地字体回退，所以页面没有被阻断，但控制台长期存在错误噪声，也意味着页面仍不完全离线自包含。

### 2.3 设置页实测

设置页实际显示五类 Provider：

- OpenAI-compatible API
- Anthropic API
- Codex CLI
- Claude Code CLI
- GitHub Copilot CLI

但中文界面中仍直接出现：

- `SERVER ACCESS TOKEN`
- `Apply`
- `Clear`
- `Stored only for this browser tab session; never written to localStorage.`
- `PROVIDER`
- `API BASE URL`
- `API KEY (CONFIGURED)`
- `Load models`
- `Test connection`

说明“中文模式”目前主要是局部翻译，不是完整的产品本地化。

### 2.4 编辑器工作区实测

打开正式项目：

```text
http://10.30.0.22:8787/editor/d962c87e-a01c-4cef-8d76-a38f127ff49d
```

初始页面实际出现：

- `Open a file from the project tree`
- `No active conversation`
- `+ New Conversation`
- `Basic Light`

逐项点击右侧功能后观察到：

| 模块 | 实测状态 | 主要问题 |
| --- | --- | --- |
| RAG | 可以打开 | 基础资料库入口已存在，但质量、索引健康度和恢复状态不透明 |
| Draw | 可以打开 | `Generate`、`Edit`、`Settings`、`Generate Image Prompt` 等大量英文 |
| Review | 可以打开 | `No review report yet`、`Run Structured Review` 未翻译 |
| Citations | 可以打开 | 整个说明区几乎为英文 |
| Anti-AI | 可以打开 | `Quick`、`Deep`、`Scan` 和空状态为英文 |
| Pipeline | 可以打开 | 模板说明、阶段名、执行器类型和启动按钮大量英文 |

这不是只存在于旧 bundle 的偶发现象。当前源码仍能直接检索到这些硬编码文本，例如：

- `app/apps/frontend/src/app/components/CenterPanel.tsx:632`
- `app/apps/frontend/src/app/components/RightPanel.tsx:748-765`
- `app/apps/frontend/src/app/components/DrawPanel.tsx:520,723`
- `app/apps/frontend/src/app/components/ReviewReportPanel.tsx:76-79`
- `app/apps/frontend/src/app/components/CitationVerificationPanel.tsx:163,313`
- `app/apps/frontend/src/app/components/AntiAiPanel.tsx:370`
- `app/apps/frontend/src/app/components/PipelinePanelV2.tsx:135`

### 2.5 正式 API 实测

当前正式实例：

```text
GET /api/health
200 {"ok":true,"authRequired":false}

GET /api/projects
200，匿名返回正式项目列表

GET /api/config
200，匿名返回模型、endpoint、证书路径和项目根目录等元数据
```

`GET /api/config` 的实际响应包含：

```text
llm_base_url: http://10.30.0.2/v1
llm_model: gpt-5.6-sol
llm_ca_cert: /data01/home/xuzk/.claude-code/caddy-root.crt
projects_dir: /data01/home/xuzk/papers
```

API Key 本身被掩码，这是正确的；但内网 endpoint、主机目录、证书路径和模型部署信息仍然对匿名访问者公开。

当前正式 `/api/providers` 还声明 CLI `stream:true`，而当前工作区源码已将 CLI `stream` 改为 `false`。这是运行实例未加载新代码的直接证据。

## 3. 最高优先级问题

### P0-1：源码、文档和正式运行实例发生版本漂移

**证据：直接运行证据。置信度：高。**

- 正式后端进程启动时间：2026-07-22 02:56:52；
- 当前 `auth.js` 修改时间：2026-07-22 03:21:46；
- 当前前端 `dist/index.html` 修改时间：2026-07-22 03:46:13；
- 正式 API 仍返回旧鉴权和旧 Provider capability；
- 正式页面仍显示当前源码中尚未全部处理的旧英文界面。

用户影响：

- 文档说“已完成”不等于线上生效；
- 开发者可能在新前端调用旧后端，得到难以解释的 404、401、503 或错误 capability；
- 安全修复可能只存在于磁盘源码，没有进入实际服务；
- 回归测试只证明临时隔离服务器，不证明正式进程。

改进方法：

1. `/api/health` 返回后端 build ID、Git commit、构建时间、API schema version 和 readiness；
2. 前端 bundle 内嵌 frontend build ID，启动后与后端进行 handshake；
3. 不匹配时显示阻断式“前后端版本不一致”，不能静默继续；
4. 发布验收必须针对正式 PID 和 LAN URL，而不仅是隔离 E2E；
5. 整改状态文档要区分“代码已实现”“测试已通过”“正式实例已部署”“LAN 已验收”四种状态。

### P0-2：公开 `/api/config` 泄露部署元数据

**证据：API 实测 + 当前源码。置信度：高。**

- `app/apps/backend/src/middleware/auth.js:1-5` 把 `GET /api/config` 放入公开路由；
- `app/apps/backend/src/config/appConfig.js:211-223` 只掩码 Key，仍返回 base URL、CA path、项目根目录、模型名；
- 正式 API 已实测匿名返回这些信息。

虽然这不是 API Key 明文泄露，但会暴露：

- 内网 LLM 服务地址；
- 用户名和主机目录结构；
- 证书位置；
- 数据目录；
- 当前模型与第三方绘图 endpoint。

改进方法：

- 公开 bootstrap 配置只返回 UI 启动真正需要的布尔量和枚举；
- 项目根、CA 证书、endpoint、模型等信息移入认证后的管理接口；
- 浏览器设置页使用 `configured:true/false`，而不是读取服务器内部路径；
- 增加“匿名响应不得包含绝对路径、IP、URL、模型名”的回归测试。

### P0-3：HTTP Provider 仍缺少 SSRF 防护

**证据：当前源码。置信度：高。**

当前代码已经修复“客户端 endpoint + 服务器 Key 混用”问题：

- `app/apps/backend/src/services/llmService.js:453-479`

但后续仍直接对 endpoint 执行 `fetch`：

- `app/apps/backend/src/services/llmService.js:520-539`

未见以下控制：

- 只允许 `http:`/`https:`；
- 阻止 loopback、RFC1918、link-local 和云元数据地址；
- DNS 解析后的地址复核；
- 重定向目标复核；
- URL 用户信息、异常端口和 DNS rebinding 处理；
- 按 Provider 配置允许域名。

用户影响：认证用户或被盗 Token 可以利用 Provider 测试能力访问后端所在网络的内部服务。对于局域网部署，这一风险尤其明显。

### P0-4：Codex/Copilot 只是只读 Chat，还不能安全地“直接完成论文任务”

**证据：当前源码。置信度：高。**

- `app/apps/backend/src/services/agentProviderRegistry.js:27-30` 中 Codex 使用 `--sandbox read-only`；
- Claude 和 Copilot 也禁用了工具；
- `app/apps/backend/src/services/llmService.js:433-446` 明确禁止 CLI Provider 进入 application-managed tool calling；
- CLI capability 为 `toolCalling:false`、`stream:false`。

当前实现解决了“CLI 绕过应用审批直接改论文”的安全问题，但产品能力仍停留在只读问答：

- 不能在隔离副本中完成多文件修改；
- 没有 changed-files 清单；
- 没有统一 diff；
- 没有 Accept/Reject；
- 没有拒绝后字节级不变保证；
- 没有任务中断和恢复；
- 没有正式 E2E 验证 CLI Task Agent。

建议新增独立的 `Task Agent` 模式，不要把 Chat 的 sandbox 改回可写。合理链路应为：

```text
选择 Provider
  → 创建项目隔离副本/任务快照
  → CLI 在隔离区执行
  → 收集 changed files + diff + provenance
  → 用户逐文件 Accept / Reject
  → 原子应用已接受 patch
  → 保存任务历史和恢复点
```

## 4. 高优先级数据与可靠性问题

### P1-1：无 Token 时的首次使用体验会进入“看得到页面、用不了项目”的死角

**证据：当前源码行为推断。置信度：高。**

当前 `auth.js` 已正确改成 default-deny：

- `app/apps/backend/src/middleware/auth.js:37-67`

没有 `OPENPRISM_API_TOKEN` 时，除 health/providers/config/collab 外所有 API 返回 503。这是更安全的默认值，但缺少对应的产品引导：

- 没有首次启动向导；
- 没有自动生成本地 Token 的安全流程；
- 项目列表失败时不能明确区分“服务器未配置 Token”和“网络错误”；
- 设置页要求用户理解 server token、Provider key、CLI login 三套不同凭据；
- `authRequired:false` 容易被理解成“不需要鉴权”，实际上表示受保护 API 被禁用。

建议 health 使用更准确的状态：

```json
{
  "auth": {
    "mode": "disabled-until-configured",
    "configured": false,
    "projectApisAvailable": false
  }
}
```

并在项目页提供阻断式配置指引。

### P1-2：项目显示名、项目 ID、目录名的用户认知仍未闭合

**证据：当前源码 + API 数据。置信度：高。**

当前源码已经使用：

```text
<可读 slug>--<短 ID>
```

对应代码：

- `app/apps/backend/src/services/projectLocator.js:23-42`

并且重命名时会迁移目录。这比纯 UUID 明显更好。

但前端项目类型只有可选的 `dirName`：

- `app/apps/frontend/src/api/client.ts:4`

项目列表没有显式展示或解释目录名。正式数据中已存在：

```text
显示名：Aliased Project
目录名：aliased-dir-27eedc87-0ae7-40a8-a6e1-81b32d63f217
```

对使用者而言仍会出现：

- UI 中搜索项目名，在磁盘上找不到同名目录；
- 重命名后目录为什么变化不清楚；
- 项目 ID、目录名、显示名三者作用不清楚；
- 备份、迁移和手工排障时容易选错目录。

建议项目详情明确显示“项目名 / 稳定 ID / 存储目录”，提供复制路径和打开目录操作，并说明显示名重命名是否会移动目录。

### P1-3：普通论文目录只返回 `candidates`，前端没有注册闭环

**证据：当前源码。置信度：高。**

- `app/apps/backend/src/routes/projects.js:100-127` 会把没有合法 `project.json` 的目录返回到 `candidates`；
- 当前前端源码没有消费 `candidates`；
- 没有可发现的“注册现有目录为项目”接口或 UI。

结果是：后端为了避免 GET 自动写盘而安全地停止自动注册，但用户看到的效果可能只是“papers 里明明有目录，项目页却看不到”。

建议在项目页增加“发现的论文目录”区域，先预览主文件、目录、冲突和风险，再由用户明确确认注册。注册操作必须生成稳定 ID 和 metadata，不能重新引入 GET 写盘。

### P1-4：RAG 索引写入非原子，损坏后不会自动恢复

**证据：当前源码。置信度：高。**

- `app/apps/backend/src/services/paperRagService.js:1261-1268` 只在 `ENOENT` 时重建；JSON 损坏会直接抛错；
- `app/apps/backend/src/services/paperRagService.js:1271-1275` 直接 `writeFile` 覆盖正式 index；
- 多个 add/delete/index 流程都是“读当前 index → 修改 → 写回”，未见 per-project mutation queue。

风险：

- 进程中断或磁盘写失败可能留下半个 JSON；
- 并发新增、删除、重建可能互相覆盖；
- 一个损坏 index 会让列表和搜索持续失败；
- 没有 generation/fingerprint，无法判断索引是否对应当前 corpus。

建议：临时文件 + fsync/rename 原子替换、项目级串行队列、损坏文件隔离重命名、自动重建、generation/fingerprint、并发和故障注入测试。

### P1-5：模板替换可能先删除旧模板，再在后续步骤失败

**证据：当前源码。置信度：高。**

- `app/apps/backend/src/routes/health.js:81-102`

当前顺序：

```text
删除旧模板目录
→ staging rename 为正式目录
→ 更新 manifest
```

如果 rename 或 manifest 写入失败，旧模板已经被删除；并发上传同一 templateId 也没有锁。

建议使用 backup rename、staging 校验、原子 manifest、失败回滚和 templateId 级锁。验收时必须注入 rename/manifest 失败，确认旧模板内容和 manifest 保持一致。

### P1-6：能力探针超时只发 SIGTERM，不保证整个进程树退出

**证据：当前源码。置信度：高。**

- `app/apps/backend/src/services/capabilityService.js:30-64`

探针没有 detached process group，超时后只执行：

```js
child.kill('SIGTERM')
```

没有 SIGKILL 升级，也不处理子进程树。相反，CLI Provider runner 已经有进程组 + SIGTERM/SIGKILL 逻辑：

- `app/apps/backend/src/services/agentProviderRegistry.js:142-163,205-212`

建议统一为一个 fixed-command runner，避免两套生命周期语义。

### P1-7：编译服务仍有机器相关硬编码路径

**证据：当前源码。置信度：高。**

- `app/apps/backend/src/services/compileService.js:13-19`

包含：

```text
/data01/home/chenzx/anaconda3/lib
```

同时使用 `HOME` 推导多条机器路径。这违反仓库“机器相关配置不得硬编码”的规则，并可能在其他机器上加载错误动态库或产生隐蔽环境差异。

建议把额外 PATH/LD_LIBRARY_PATH 变成显式环境变量，默认只继承当前进程环境，能力页显示实际探测结果而不是隐式猜测用户目录。

### P1-8：health 只能证明进程活着，不能证明系统可用

**证据：当前源码。置信度：高。**

- `app/apps/backend/src/routes/health.js:16-20`

当前只返回：

```json
{"ok":true,"authRequired":false}
```

缺少：

- build ID / commit；
- frontend/backend compatibility；
- API schema version；
- 数据根可读写状态；
- 模板 manifest 状态；
- readiness 与 liveness 分离；
- 是否正在使用预期配置文件；
- 服务启动时间和配置加载时间。

这正是本次未能自动发现正式服务仍为旧版本的根本原因之一。

## 5. RAG、Skills 和 Agent 系统成熟度问题

### P2-1：RAG 是关键词重叠检索，不是语义检索

**证据：当前源码。置信度：高。**

- `app/apps/backend/src/services/paperRagService.js:470-490`
- `app/apps/backend/src/services/paperRagService.js:1797-1839`

当前主要通过 tokenize 和词项重叠计算 score。它可以完成基础本地搜索，但对以下场景能力有限：

- 同义表达；
- 跨语言问题；
- 术语缩写与全称；
- 方法名变化；
- 长文档中跨段证据；
- “支持/反驳某个 claim”的语义匹配。

建议先明确产品口径为“本地关键词证据检索”，然后再引入可选 embedding/hybrid retrieval、reranker、引用页码证据和检索评测集。不能只增加向量数据库而没有准确率评测。

### P2-2：RAG 缺少用户可见的索引健康度

当前 UI 提供“资料在添加、上传或删除时自动更新索引”，但用户无法清楚看到：

- 当前索引 generation；
- 最后成功时间；
- corpus 文件数 / chunk 数；
- 哪些文件解析失败；
- 哪些 PDF 只有 metadata；
- 索引是否损坏或落后；
- 重建是否进行中；
- 搜索结果是关键词还是语义结果。

建议提供“健康 / 降级 / 损坏 / 重建中”状态，逐文件显示解析器、字符数、chunk、失败原因和恢复操作。

### P2-3：Skills 数量很多，但“加载成功”不等于“现在能运行”

**证据：源码结构 + 产品实测。置信度：中高。**

当前已有 123 个 Skill 和较复杂的意图推荐逻辑，但主要解决的是：

- YAML 可加载；
- 分类合法；
- 关键词与任务意图匹配；
- 推荐排序。

仍缺少统一的运行就绪度：

- 依赖命令是否安装；
- 所需 API credential 是否存在；
- 网络是否可达；
- 需要哪些文件和权限；
- 当前 Provider 是否支持；
- 是否会写文件、执行命令或产生费用；
- dry-run 是否成功；
- 最近一次执行结果和耗时。

建议每个 Skill 暴露结构化 manifest：`requirements`、`sideEffects`、`costClass`、`readiness`、`dryRun`、`lastRun`，UI 统一显示 ready/degraded/unavailable，而不是只显示分类和描述。

### P2-4：Skills、RAG 和工作台服务文件过大，演进风险高

**证据：文件规模。置信度：高。**

```text
paperRagService.js       2529 行
skillEngine.js           2415 行
SkillsSelector.tsx        913 行
```

这些文件同时承担解析、索引、恢复、外部搜索、推荐、国际化映射、UI 展示等多种职责。结果是：

- 小改动影响面难判断；
- 测试夹具越来越重；
- 状态和错误语义容易分叉；
- 同一概念在后端、前端和本地映射表中重复维护；
- 新 Skill/RAG parser 更容易继续堆进巨型文件。

建议按稳定边界拆分，但应先锁定行为测试，再做小步拆分；优先删除重复映射和复用现有契约，不新增无必要框架。

### P2-5：Provider 设置的 fallback capability 与后端真实能力不一致

**证据：当前源码。置信度：高。**

- `app/apps/frontend/src/app/components/SettingsModal.tsx:54-64`

前端 fallback 声明：

- HTTP `cancel:true`；
- CLI `stream:true`。

当前后端 registry 则声明：

- HTTP `cancel:false`；
- CLI `stream:false`。

正常加载 metadata 后会被覆盖，但在加载前、失败或旧后端场景中，UI 会展示错误能力。建议 fallback 使用保守的 false/unknown，并显示“尚未从服务器确认”。

### P2-6：CLI Provider 的用户心智模型仍不清楚

当前设置页把 HTTP API 和本机 CLI 放在同一个 Provider 下拉框，但它们实际上有不同的：

- 凭据来源；
- 登录方式；
- 模型选择方式；
- 沙箱能力；
- 流式能力；
- 文件写入能力；
- 成本和审计方式。

建议 UI 至少区分：

```text
Remote API Provider
Local CLI Chat Provider
Task Agent Provider（未来）
```

并明确标注“只读 Chat”“可产生网络费用”“需本机登录”“不会自动修改论文”等状态。

## 6. 前端与使用体验问题

### P2-7：中文本地化没有形成发布门禁

Playwright 实测和源码均证明多个主面板存在硬编码英文。已有 locale 文件键集合一致，只能证明 locale 文件本身对齐，不能证明 JSX 都调用了 `t()`。

建议增加两类测试：

1. 静态扫描主要组件的硬编码用户可见英文；
2. zh-CN Playwright 逐个打开主面板，断言核心空状态、按钮、说明和错误文案为中文。

同时保留必要术语，例如 API、LLM、RAG，但应提供中文解释，避免把整段产品说明留为英文。

### P2-8：功能入口很多，但缺少以论文目标为中心的主流程

用户进入项目后立即看到 Chat、Draw、RAG、Review、Citations、Anti-AI、Pipeline、Terminal 等入口，但系统没有先回答：

- 你现在在写哪一篇论文；
- 当前阶段是选题、初稿、补实验、改稿还是投稿；
- 哪些材料缺失；
- 下一步最适合做什么；
- 操作会读取、修改或执行哪些内容；
- 结果是否已写入论文。

现有 Skills 推荐和 Pipeline 模板有一定基础，但仍像“功能菜单”，还不是任务导航。建议首页以任务为中心：目标 → 材料检查 → 推荐 Skill/Provider → 预览影响 → 执行 → 审核结果。

### P2-9：项目页面缺少存储位置和数据保护说明

正式项目实际位于：

```text
/data01/home/xuzk/papers
```

而仓库内同时有：

```text
paper_wrighting/papers
```

即使源码已统一权威 data root，用户仍很容易根据仓库结构误判数据位置。设置页当前甚至通过公开 config 暴露绝对路径，却没有以安全、友好的方式解释“这是实际数据根”。

建议管理员页面显示脱敏数据根、可用空间、备份状态和打开目录；普通用户只看到项目存储策略，不看到主机用户名和绝对路径。

### P2-10：错误状态仍容易退化为“空状态”

历史实测曾出现不存在项目返回空文件/空检索，当前源码已通过 managed project 404 修复。但类似风险仍存在于：

- Provider metadata 加载失败时使用乐观 fallback；
- RAG index 损坏直接异常；
- capability probe 失败统一为 unknown；
- health 只返回 ok；
- UI 多处以“暂无内容”呈现，缺少 retry、诊断 ID 和具体恢复动作。

建议统一错误 schema：`code`、`message`、`retryable`、`recoveryAction`、`requestId`、`detailsForAdmin`，并禁止把 401/403/404/503/解析失败转换成业务空列表。

### P2-11：Google Fonts 造成离线噪声和不确定性

正式 LAN Playwright 在所有视口均记录 Google Fonts 失败。当前本地字体栈保证了可用性，但建议：

- 默认不请求外网字体；
- 或把字体资源自托管；
- 或只在显式开启外网资源时加载；
- Playwright 对 console error 建立允许列表，避免真实错误被字体噪声淹没。

## 7. 测试、发布与仓库工程问题

### P2-12：隔离 E2E 通过，不等于正式部署通过

现有记录显示：

- unit：58 个文件、343 项通过；
- integration：13/13 通过；
- Playwright：13/13 通过。

这些结果有价值，但本次正式实例仍然是旧行为，证明测试门禁缺少最后一公里：

- 没有正式进程 build ID 断言；
- 没有部署后 API schema 对比；
- 没有用正式 Token 做 LAN CRUD/Provider/capability 验收；
- 没有断言正式进程启动时间晚于构建产物；
- 没有阻止“新 dist + 旧 Node 进程”组合。

建议发布门禁增加 post-deploy Playwright 和 API contract，且结果记录具体 URL、PID、build ID、commit 和时间。

### P2-13：测试对高风险故障注入仍不足

剩余需要重点覆盖：

- RAG JSON 半写、rename 失败、并发 add/delete/index；
- 模板目录替换和 manifest 更新任一步失败；
- Provider DNS rebinding、重定向、私网和云元数据；
- capability 子进程忽略 SIGTERM；
- CLI Task Reject 后原文件字节级不变；
- frontend/backend build ID 不匹配；
- zh-CN 全主面板文案；
- 未配置 Token 的首次启动引导。

### P2-14：仓库当前工作区非常脏，审计结论难以归因

本次只读检查发现大量已修改和未跟踪文件，涉及前后端、测试、文档、模板、构建产物和锁文件；`pnpm-lock.yaml` 处于删除状态。由于改动没有形成清晰提交边界，很难回答：

- 哪些是用户原有修改；
- 哪些是某一轮整改；
- 哪些已经验证；
- 哪些文档对应哪个源码快照；
- 正式服务运行的是哪个状态。

这也是旧审计报告与当前状态容易混淆的原因。建议后续按问题域形成小提交，并使用仓库规定的 Lore commit 记录约束、拒绝方案、测试和未测试项。

### P2-15：仓库提交了 `.bak` 和构建/测试残留目录

直接证据：

- 跟踪文件 `app/apps/frontend/src/app/components/SkillsSelector.tsx.bak`，约 119 KiB；
- 存在 `app/test-results`；
- 存在根 `test-results`；
- 存在根 `dist`；
- 前端 `dist/index.html` 也处于修改状态。

这些内容会造成：

- 搜索命中旧代码；
- 静态扫描重复计算；
- review 噪声；
- 构建产物和源码不一致；
- 不清楚哪些测试结果属于哪次运行。

应明确哪些产物必须提交、哪些必须 gitignore，并删除已纳入版本管理的备份副本；但本次审计未执行清理。

### P2-16：依赖漏洞仍未完成可达性评估

现有审计记录显示 `npm audit` 有：

| 严重度 | 数量 |
| --- | ---: |
| moderate | 2 |
| high | 2 |
| critical | 2 |

涉及 `tar`、`shell-quote`、`brace-expansion`、`react-router`、`react-router-dom` 和 Vite 传递依赖。不能直接执行 `npm audit fix`，但也不能只在文档中长期保留数量。需要逐项记录：生产可达性、攻击前提、修复版本、升级风险、补丁或隔离方案、计划完成时间。

### P2-17：两个重功能 chunk 仍超过 500 KiB

现有构建记录显示：

- `RenderedPreviewPane` 约 510 KiB；
- `MarkdownEditor` 约 584 KiB。

它们已经从首屏 chunk 中拆出，问题程度低于初始 bundle 过大，但首次进入预览/编辑器时仍可能出现明显等待。建议实际测量 LAN 冷缓存加载、解析和交互时间，再决定继续拆分、预加载或替换依赖，不能只按文件大小优化。

## 8. 已经改善、应保留的设计

以下是当前工作区源码中已经出现的正确方向，不应在后续优化时退回：

1. API 鉴权从危险 URL 黑名单改为公开路由 allowlist/default-deny；
2. HTTP 临时 endpoint 和服务器 Key 不再允许混合来源；
3. managed project 默认要求真实存在且 metadata ID 匹配；
4. managed project root 和路径组件拒绝 symlink；
5. `GET /api/projects` 不再自动写 `project.json`；
6. 项目目录采用可读 slug + 短 ID；
7. Codex CLI Chat 使用 `read-only` sandbox；
8. CLI 原始 JSON 不再作为流式 token 直接显示；
9. CLI runner 使用固定 executable、`shell:false`、环境变量 allowlist 和进程组终止；
10. 配置值拒绝 CR/LF/NUL，配置写入使用临时文件 + rename 和串行队列；
11. 隔离 E2E 使用随机 Token、随机端口和临时数据根；
12. 移动端项目页和工作区已经没有横向溢出；
13. API Key 不再写入 localStorage，服务访问 Token 只保存在 sessionStorage；
14. 项目定位、目录迁移和 symlink 防护已经有专项测试。

需要注意：这些是“工作区源码中的改进”，正式运行实例是否使用这些实现必须通过 build/version handshake 验证。

## 9. 推荐整改顺序

### 第一阶段：让“当前运行版本”可被证明

1. 增加 backend/frontend build ID 和 API schema handshake；
2. 明确 liveness/readiness；
3. 发布后对正式 LAN URL 做认证 API + Playwright 验收；
4. 文档状态拆成 implemented/tested/deployed/accepted；
5. 禁止在 build ID 不一致时继续正常使用。

### 第二阶段：收紧网络与配置边界

1. 缩减公开 `/api/config`；
2. 完成 Provider SSRF policy；
3. 增加 endpoint allowlist/解析/重定向测试；
4. 清除编译服务机器路径硬编码；
5. 完成首次 Token 配置向导。

### 第三阶段：保证数据写入可恢复

1. RAG 原子 index、损坏隔离、项目锁；
2. 模板 backup/rollback 和 manifest 原子更新；
3. capability process-tree kill；
4. 所有写入返回 request ID、审计事件和恢复动作；
5. 增加失败注入和并发测试。

### 第四阶段：完成 Codex/Copilot Task Agent

1. 保留只读 Chat；
2. 新增隔离任务副本；
3. changed-files + diff + provenance；
4. Accept/Reject；
5. 原子应用和恢复点；
6. fake CLI E2E，真实账号仅做部署验收。

### 第五阶段：提升 RAG、Skills 和产品体验

1. RAG 健康度、解析状态和评测集；
2. 可选 hybrid/semantic retrieval；
3. Skill requirements/readiness/dry-run/last-run；
4. 项目 candidate 注册 UI；
5. 全主面板 i18n；
6. 以论文任务为中心重组入口；
7. 清理 tracked `.bak` 和测试/构建残留。

## 10. 建议验收标准

### 发布一致性

- frontend build ID 与 backend build ID 兼容；
- 正式进程启动时间晚于本次构建；
- loopback 和 LAN 返回相同 build/schema；
- 不匹配时 UI 明确阻断。

### 安全

- 匿名响应不包含绝对路径、内网 endpoint、模型部署信息；
- 除最小 bootstrap 外所有 API default-deny；
- Provider endpoint 无法访问 loopback、私网、link-local、metadata；
- 重定向和 DNS 解析后仍执行相同策略；
- CLI Chat 不写文件；Task Agent 只能写隔离副本。

### 数据完整性

- RAG/模板/config 写入任一点失败时旧数据可读；
- 并发变更不丢失；
- 损坏 index 自动隔离并重建；
- Reject Task 后原项目文件 hash 不变；
- 所有删除/覆盖都有可见确认和恢复说明。

### 用户体验

- 首次启动无 Token 时给出明确配置路径；
- 项目名、ID、目录名可解释、可复制；
- 普通论文目录可通过明确确认注册；
- zh-CN 下所有主面板核心文案为中文；
- Skill 和 Provider 均显示真实 ready/degraded/unavailable；
- 错误不会伪装成空状态。

### 测试

- unit/typecheck/build/integration/E2E 全通过；
- SSRF、原子写、并发、进程树、版本漂移和 i18n 有专项测试；
- 隔离 E2E 后再跑正式 LAN post-deploy E2E；
- 测试报告记录 URL、PID、build ID、commit、Token 模式和时间。

## 11. 证据、推断和未知项

### 直接证据

- Playwright 实际访问项目页、设置页和编辑器各主面板；
- 正式 API 实际返回 health/projects/config/providers；
- 正式进程启动时间早于当前关键源码和前端构建产物；
- 当前源码直接显示 RAG/template 写入顺序、Provider fetch、health schema 和 capability kill 行为；
- 当前源码仍含大量硬编码英文；
- 当前工作区存在大量未提交改动、`.bak` 和测试/构建目录。

### 推断

- 正式实例没有加载当前工作区最新源码；这是由进程时间和 API contract 差异共同支持的高置信推断；
- RAG 并发写可能丢更新；这是由读改写模式且无项目队列支持的高置信推断，尚未在本次审计中故意制造数据竞争；
- 模板上传失败可能丢失旧模板；这是由删除先于替换和 manifest 写入支持的高置信推断，本次未破坏性注入失败；
- SSRF 可访问内部目标；这是由任意 endpoint 直 fetch 且无目标策略支持的高置信推断，本次未对内网服务发起恶意请求。

### 未知项

- 真实 Codex、Claude Code、Copilot 账号当前是否已登录；
- 真实付费模型的输出质量、速率限制和费用；
- 六个依赖漏洞在当前部署路径中的具体可达性；
- 大型真实论文下的 RAG 精度、编译稳定性和前端性能；
- 多用户同时编辑、上传、索引和执行 Agent 时的真实竞争行为；
- 正式数据根中的 `not-a-real-project` 和固定 UUID 目录是否可安全删除；本次未做清理。

## 12. 一句话判断

当前仓库已经从“功能缺失型原型”进展到“功能广泛但工程契约尚未完全闭合的工作台”；下一阶段最重要的不是继续添加更多面板，而是先证明正式运行版本与源码一致，再完成 Provider 网络边界、数据原子性、CLI Task 审批、项目注册、RAG/Skills 就绪度和全量中文体验。
