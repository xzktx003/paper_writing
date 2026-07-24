# Paper Writing 当前仓库用户视角问题审计

- 报告时间：2026-07-22 05:03:23（Asia/Shanghai）
- 仓库：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting`
- 正式访问地址：`http://10.30.0.22:8787`
- 审计范围：当前工作区源码、当前前端构建产物、正式 8787 实例、隔离临时实例、测试与文档、依赖和仓库状态
- 审计方式：Playwright 实际操作、HTTP/API 只读探测、源码与测试审阅、构建产物检查、`npm audit`
- 审计边界：只发现问题和提出优化方向；未修改业务源码、正式配置、正式服务和论文数据
- 唯一新增内容：本审计文档
- 数据保护校验：`papers/paper-agent-spe/project.json` 既有 diff SHA-256 仍为 `afc5752ebb84e46894383ea77f151c700f973acea56858ffb696a6f48e63305e`

## 1. 结论先行

当前仓库不是“没有功能”，而是已经形成了一个功能覆盖较广的论文工作台：项目管理、编辑器、对话、HTTP/CLI Provider、RAG、Skills、Draw、Review、Citation、Anti-AI、Pipeline、模板和编译等模块都已存在。当前工作区源码还包含不少近期安全性和可靠性改进，例如 default-deny 鉴权、项目身份校验、前后端 build ID 握手、RAG 原子索引、模板事务替换、Provider 基础 SSRF 过滤、已有目录注册和主面板中文化。

但从真实使用者角度，当前系统仍不能视为稳定可交付版本。最严重的问题是：

> 当前前端已经更新，正式后端仍是旧版本；版本门禁正确地阻止了危险的混合运行，但结果是桌面、手机和平板用户现在都无法进入项目页或编辑器。

Playwright 对正式 LAN 地址的实测结果是：

- `/projects` 返回 HTTP 200，但只显示“前后端版本不一致”；
- `/editor/<projectId>` 返回 HTTP 200，但同样只显示版本阻断页；
- 桌面、390×844 手机和 768×1024 平板均无法访问任何论文功能；
- 前端报告 `missing-build-metadata`；
- 正式后端没有 `/api/ready`，并仍匿名暴露 `/api/config` 和项目列表；
- Google Fonts 在所有视口中请求失败，持续制造控制台错误。

因此，当前问题应分成三层理解：

1. **正式部署问题**：用户当前访问到的服务整体不可用，且旧后端仍暴露已经在源码中修复的安全问题。
2. **当前源码仍未闭环的问题**：CLI 只是只读 Chat、Skills 没有真实就绪度、RAG 仍是关键词检索且健康度 UI 不完整、编译环境硬编码、中文化仍有缺口等。
3. **工程治理问题**：工作区改动规模极大、文档状态与实际部署不一致、依赖漏洞和构建/备份产物尚未收口。

综合评价：

| 维度 | 当前判断 |
| --- | --- |
| 功能覆盖 | 较高 |
| 当前正式页面可用性 | 不可用，被版本门禁完全阻断 |
| 当前源码基础主路径 | 隔离实例可用 |
| 正式部署安全性 | 低，仍运行旧鉴权与旧配置接口 |
| CLI Agent 完整度 | 低，仅只读 Chat，不是可审查的任务 Agent |
| RAG 产品成熟度 | 中低，可靠性已加强，但检索质量与健康度闭环不足 |
| Skills 产品成熟度 | 中低，目录和推荐丰富，但真实可运行性不透明 |
| 仓库可维护性 | 中低，超大文件和巨量未提交改动增加归因风险 |
| 建议发布状态 | 暂不对外承诺稳定可用 |

## 2. 本次实测环境与结果

### 2.1 正式 LAN 实例 Playwright

实测地址：

```text
http://10.30.0.22:8787/projects
http://10.30.0.22:8787/editor/d962c87e-a01c-4cef-8d76-a38f127ff49d
```

Playwright Chromium 需要额外加载仓库根目录下的浏览器共享库：

```text
.playwright-deps/usr/lib/x86_64-linux-gnu
```

未加载时，Chromium 直接因缺少 `libatk-1.0.so.0` 启动失败。这说明直接使用 Playwright 和仓库隔离 runner 之间仍存在环境握手差异。

正式实例三种视口结果：

| 视口 | `/projects` | `/editor/...` | 横向溢出 | 实际可使用内容 |
| --- | ---: | ---: | ---: | --- |
| 1440×900 桌面 | 200 | 200 | 0 | 仅版本不一致阻断页 |
| 390×844 手机 | 200 | 200 | 0 | 仅版本不一致阻断页 |
| 768×1024 平板 | 200 | 200 | 0 | 仅版本不一致阻断页 |

用户实际看到：

```text
前后端版本不一致
当前页面与服务器不是同一次构建。为避免使用旧接口修改论文，工作区已暂停加载。
missing-build-metadata
Frontend build 20260721205146-f0ef1484486e-9d0451f8 is not compatible with the running backend.
重新检查
```

这是一个正确的安全门禁，但也是当前正式产品的 P0 可用性故障：所有项目和编辑功能都被阻断。

### 2.2 正式 API 只读实测

```text
GET /api/health
200 {"ok":true,"authRequired":false}

GET /api/ready
404 {"error":"Not Found"}
```

正式 `/api/providers` 仍把 Codex、Claude Code、Copilot CLI 声明为：

```json
{
  "stream": true,
  "toolCalling": false
}
```

而当前工作区源码已改为 `stream:false`。这是正式后端没有加载当前源码的直接证据。

正式 `/api/config` 仍可匿名访问，并返回：

- 内网 LLM 地址；
- 模型名称；
- CA 证书绝对路径；
- 正式论文数据根绝对路径；
- 绘图服务 endpoint。

正式 `/api/projects` 也仍可匿名返回项目列表。

### 2.3 当前源码隔离实例 Playwright

为区分“源码问题”和“正式部署问题”，本次另行启动了当前源码隔离实例：

- 随机端口：本次为 `127.0.0.1:39391`；
- 临时数据根：系统临时目录；
- 独立审计 Token；
- 临时项目：`审计临时项目`；
- 结束后自动停止进程并删除临时数据。

隔离实例确认：

- `/api/health` 带 build ID 和 API schema version；
- `/api/ready` 返回 200；
- 项目列表明确显示项目名、稳定项目 ID 和实际存储目录；
- 桌面、手机和平板均无横向溢出；
- 手机和平板编辑器提供“文件 / 编辑器 / AI 助手”互斥视图；
- Draw、RAG、Review、Citations、Anti-AI、Pipeline 均可打开；
- 主面板的核心中文化已经明显好于正式旧页面。

这说明当前源码本身并非完全不可运行；正式服务不可用的主要原因是部署版本漂移。

### 2.4 当前源码隔离实例中仍观察到的 UI 问题

设置页仍混有：

```text
SERVER ACCESS TOKEN
Apply
Stored only for this browser tab session; never written to localStorage.
PROVIDER
API BASE URL
API KEY (CONFIGURED)
Load models
Test connection
```

Pipeline 仍混有大量英文模板名和说明，例如：

```text
Writing Flow — Outline → Draft → Polish → Review — full paper writing pipeline
Paper Pipeline — Polish → Review → Revise → Compile — end-to-end paper processing
RAG Literature Review — Search corpus → RAG evidence → Write review
Claim Audit — Extract claims → RAG verify → Report
```

Draw 仍显示：

```text
PDF...
Fig
Skills
Select Skill
Basic Light
```

这些不是正式旧后端造成的；它们在当前源码隔离实例中仍可复现。

所有视口仍请求：

```text
https://fonts.googleapis.com/css2?family=...
```

并产生 `net::ERR_EMPTY_RESPONSE`。

## 3. 问题优先级总表

| 优先级 | 问题 | 当前性质 | 置信度 |
| --- | --- | --- | --- |
| P0 | 正式前后端版本不一致，所有页面被门禁阻断 | Playwright 直接证据 | 高 |
| P0 | 正式旧后端仍匿名暴露配置元数据和项目列表 | API 直接证据 | 高 |
| P0 | 整改状态文档与实际正式实例不一致 | 文档/API/Playwright 交叉证据 | 高 |
| P1 | 首次启动和 Token 配置缺少真正的引导闭环 | 源码与产品行为证据 | 高 |
| P1 | Codex/Copilot/Claude CLI 仅只读 Chat，不能完成可审查的论文修改任务 | 源码直接证据 | 高 |
| P1 | Skills 缺少 requirements/readiness/dry-run/last-run | 源码直接证据 | 高 |
| P1 | RAG 仍是关键词重叠检索，缺少清晰的检索质量口径 | 源码直接证据 | 高 |
| P1 | RAG 主面板未完整呈现索引健康度、generation 和逐文件恢复状态 | UI/源码直接证据 | 高 |
| P1 | 编译服务包含主机和用户目录硬编码 | 源码直接证据 | 高 |
| P1 | Provider 基础 SSRF 已修复，但 DNS 校验与真正连接之间仍未做地址绑定 | 源码推断 | 中 |
| P2 | 中文界面仍有设置页、Pipeline、Draw 等英文残留 | Playwright 直接证据 | 高 |
| P2 | Google Fonts 外部依赖持续产生错误和离线不确定性 | Playwright/源码直接证据 | 高 |
| P2 | 7 个依赖漏洞告警尚未完成可达性和升级收口 | `npm audit` 直接证据 | 高 |
| P2 | 两个懒加载 chunk 超过 500 KiB | 构建产物直接证据 | 高 |
| P2 | 多个核心服务和组件体积过大 | 文件规模直接证据 | 高 |
| P2 | 工作区改动规模过大，难以证明文档、测试、源码和部署的对应关系 | Git 状态直接证据 | 高 |
| P2 | 跟踪 `.bak`、构建产物和测试残留增加搜索与审查噪声 | Git/文件直接证据 | 高 |
| P3 | readiness 只检查数据根和模板，不能代表整套论文系统可用 | 源码直接证据 | 高 |

## 4. P0：正式部署当前不可用

### 4.1 前端已经更新，正式后端仍是旧版本

**证据类型：直接证据。置信度：高。**

当前源码已实现 build handshake：

- `app/apps/backend/src/config/buildInfo.js:5-27`
- `app/apps/backend/src/routes/health.js:29-48`
- `app/apps/frontend/src/api/deploymentHandshake.ts:18-31`
- `app/apps/frontend/src/app/components/DeploymentGate.tsx:13-57`

正式后端却没有返回 `build` 字段，也没有 `/api/ready`。当前前端因而正确判断为 `missing-build-metadata` 并阻止加载。

用户影响：

- 项目列表、编辑器、设置、RAG、Skills、编译和聊天全部不可进入；
- 用户看到 HTTP 200，但实际上产品不可用；
- “重新检查”只会刷新页面，无法自动恢复；
- 普通用户不知道应该联系谁、重启哪个进程、需要什么权限。

优化方法：

1. 发布动作必须把 build、后端重启、PID 检查和 post-deploy Playwright 作为一个不可分割的事务；
2. 部署完成后记录 frontend build ID、backend build ID、API schema、PID、监听地址、启动时间和验收 URL；
3. 版本阻断页显示当前前端版本、探测到的后端版本、服务地址和管理员诊断 ID；
4. 明确区分“代码已实现”“测试已通过”“已部署”“正式 LAN 已验收”；
5. 正式验收必须覆盖桌面、手机和平板，而不是只请求 `/api/health`。

验收标准：

- 正式 `/api/health` 返回与前端一致的 build ID 和 schema；
- `/api/ready` 返回 200；
- 三种视口都能进入项目列表和编辑器；
- 不再出现 `missing-build-metadata`；
- 唯一监听进程确认为本仓库当前构建。

### 4.2 正式旧后端仍暴露配置和项目元数据

**证据类型：API 直接证据。置信度：高。**

当前源码已把公开路由缩减到 health、ready、providers 和协作入口：

- `app/apps/backend/src/middleware/auth.js:1-15`
- `app/apps/backend/src/middleware/auth.js:37-67`

但正式实例仍允许匿名访问 `/api/config` 和 `/api/projects`。

用户与部署风险：

- 暴露内网 LLM endpoint；
- 暴露用户名、证书位置和论文数据根；
- 暴露模型部署信息和项目存在性；
- 安全修复只存在于工作区源码，没有保护当前正式用户。

优化方法：先完成部署一致性，再对正式 URL 验证匿名、错误 Bearer 和正确 Bearer 三组契约。不能只用隔离测试代替正式服务验证。

### 4.3 整改状态文档已经失去“当前状态”可信度

**证据类型：文档与运行状态冲突。置信度：高。**

`docs/repository_audit_remediation_status_2026-07-22.md` 记录正式服务已经重启、LAN 冒烟通过，但本次实测正式服务：

- `/api/ready` 为 404；
- `/api/health` 没有 build metadata；
- 页面被版本门禁完全阻断；
- 匿名配置接口仍公开。

这说明状态文档没有持续绑定某个可验证的 build/PID，后续变更后仍保留“已部署”的陈述。

优化方法：状态文档中的部署证据必须带 build ID、PID、启动时间、URL 和复核时间；服务或构建变化后自动失效，不应长期保留静态“已完成”。

## 5. P1：Agent、Skills、RAG 和编译尚未形成完整产品闭环

### 5.1 CLI Provider 不是完整 Task Agent

**证据类型：源码直接证据。置信度：高。**

当前已有五类 Provider，且 Codex 使用只读沙箱：

- `app/apps/backend/src/services/agentProviderRegistry.js:22-30`
- `app/apps/backend/src/services/agentProviderRegistry.js:61-71`
- `app/apps/backend/src/services/llmService.js:437-450`
- `docs/agent_provider_architecture.md:21-31`

这是正确的安全边界，但用户提出的“直接用 Codex 或 Copilot 完成任务”仍未实现。当前 CLI Provider：

- 只能返回对话文本；
- 不支持应用管理的 tool calling；
- 不能在隔离副本中修改多文件；
- 没有 changed-files 清单；
- 没有统一 diff；
- 没有逐文件 Accept/Reject；
- 没有 Reject 后原文件字节不变证明；
- 没有任务中断、恢复和审计历史。

优化方法：新增独立 `Task Agent` 模式，保留现有只读 Chat，不要简单把 `--sandbox read-only` 改成可写。

建议链路：

```text
选择 CLI Provider
→ 创建项目快照/隔离工作副本
→ CLI 只写隔离区
→ 收集 changed files、diff、命令和来源
→ 用户逐项 Accept / Reject
→ 原子应用已接受 patch
→ 保存任务状态、恢复点和审计日志
```

验收必须包括：Reject 后正式文件 hash 不变、部分接受、多文件冲突、任务中断恢复、CLI 超时和异常退出。

### 5.2 Skills “能加载”不等于“现在能运行”

**证据类型：源码直接证据。置信度：高。**

当前 Skill 系统已经提供大量元数据、分类、标签、风险、输入输出、推荐和包测试：

- `app/apps/backend/src/services/skillEngine.js:906-1040`
- `app/apps/backend/src/services/skillEngine.js:1136-1185`
- `app/apps/frontend/src/app/components/SkillPanel.tsx:15-133`

但 UI 卡片和后端统一 schema 中没有以下产品级状态：

```json
{
  "requirements": {
    "commands": [],
    "credentials": [],
    "network": [],
    "files": [],
    "providerCapabilities": []
  },
  "sideEffects": [],
  "costClass": "free|low|medium|high",
  "readiness": "ready|degraded|unavailable",
  "dryRun": {},
  "lastRun": {}
}
```

现有 `buildTaskIntentGuide()` 中的 `ready` 主要表示“意图已识别且上下文材料足够”，并不表示相关命令、凭据、网络和 Provider 能力真实可用。

用户影响：

- 看到 123 个 Skill，却不知道当前机器能运行几个；
- 不知道 Skill 会联网、写文件、运行命令还是产生费用；
- GitHub 导入成功容易被误解为功能已经可用；
- “Run tests” 与真实任务 dry-run 的含义没有统一；
- 失败后缺少可恢复动作和最近一次运行信息。

优化方法：后端统一评估 requirements 和 readiness；UI 显示 ready/degraded/unavailable、缺失项、影响范围、费用级别和最近运行。推荐排序也应降低 unavailable Skill 的优先级。

### 5.3 RAG 可靠性改善了，但检索质量仍是关键词重叠

**证据类型：源码直接证据。置信度：高。**

当前 RAG 已加入索引锁、原子写入和损坏隔离恢复，这是应保留的改进。但核心检索仍依赖 token overlap：

- `app/apps/backend/src/services/paperRagService.js:493-512`
- `app/apps/backend/src/services/paperRagService.js:1868-1895`

评分本质是查询 token 与 chunk token 的重叠数和密度。对同义表达、缩写、跨语言、语义支持/反驳关系和跨段证据能力有限。

用户影响：

- “搜不到”不一定代表资料中不存在相关证据；
- 中文问题查询英文论文时召回不稳定；
- 用户容易把 `score` 理解为语义相关度或可信度；
- 没有固定评测集，无法证明增加 embedding 或 reranker 后真的更好。

优化方法：

1. UI 明确标注“本地关键词证据检索”；
2. 建立小型人工标注检索评测集，记录 Recall@K、MRR 和无答案误命中；
3. 再评估 BM25、hybrid embedding、reranker；
4. 搜索结果区分词面命中、语义命中和引用证据质量；
5. 不应只增加向量数据库而没有前后对比数据。

### 5.4 RAG 主面板没有把后端已有诊断能力完整交给用户

**证据类型：Playwright 与源码直接证据。置信度：高。**

当前 RAG 面板主要显示：文档数量、路径、大小、搜索分数和行号：

- `app/apps/frontend/src/app/components/PaperRagPanel.tsx:51-79`
- `app/apps/frontend/src/app/components/PaperRagPanel.tsx:205-275`

但后端已经包含 parser、parseStatus、extractedTextChars、warnings、metadata-only、恢复动作等更丰富信息。主面板未系统显示：

- 当前 index generation/fingerprint；
- 最后成功索引时间；
- corpus 文件数、成功/失败文件数、总 chunk 数；
- 每个文件的 parser、字符数、chunk 数、失败原因；
- healthy/degraded/corrupt/rebuilding 状态；
- 搜索采用关键词还是语义策略；
- 一键执行的安全恢复动作及其影响。

优化方法：增加项目级索引健康卡片和逐文件诊断表；把“文件存在”“正文已抽取”“已进入索引”“可支撑引用”区分成不同状态。

### 5.5 编译服务仍硬编码机器路径

**证据类型：源码直接证据。置信度：高。**

`app/apps/backend/src/services/compileService.js:13-19` 包含：

```text
${HOME}/anaconda3/lib
${HOME}/bin/tectonic-libs
/data01/home/chenzx/anaconda3/lib
```

`app/apps/backend/src/routes/compile.js:12-13,65-67` 还会猜测：

```text
${HOME}/bin/tectonic
${HOME}/bin/tectonic-libs
```

用户影响：

- 换机器或换用户后行为不可预测；
- 可能加载错误版本动态库；
- 隐式覆盖 PATH/LD_LIBRARY_PATH，排障困难；
- 违反仓库自身“机器相关配置不得硬编码”约束。

优化方法：默认完整继承进程环境；只在显式配置时追加 `OPENPRISM_COMPILE_PATH`、`OPENPRISM_COMPILE_LD_LIBRARY_PATH` 和 `OPENPRISM_TECTONIC_BINARY`；能力页显示最终使用的可执行文件和来源，但对普通用户脱敏路径。

### 5.6 Provider 基础 SSRF 已加强，但 DNS 绑定仍需复审

**证据类型：源码推断。置信度：中。**

当前源码已检查协议、URL credential、私网/loopback/link-local/reserved IP、DNS 结果和重定向：

- `app/apps/backend/src/services/llmService.js:524-650`

这是对旧实现的重要修复。但校验阶段执行一次 DNS lookup，随后标准 `fetch` 仍可能重新解析主机名。源码中未见把实际 socket 连接绑定到已验证 IP 的 dispatcher/agent。

因此仍存在一个需要专项验证的 TOCTOU/DNS rebinding 问题：校验时返回公网 IP，实际连接时返回私网 IP。这里是高价值推断，不是本次已成功利用的漏洞。

优化方法：连接使用经过验证的解析结果或受控 dispatcher，并在 TLS/Host/SNI 语义正确的前提下固定目标地址；增加双次解析不同结果的专项测试。

## 6. P1/P2：首次使用和界面体验问题

### 6.1 Token 模型安全，但首次使用路径不够友好

**证据类型：源码与产品行为。置信度：高。**

当前源码没有 `OPENPRISM_API_TOKEN` 时会让所有非公开 API 返回 503，这是安全的 default-deny：

- `app/apps/backend/src/middleware/auth.js:37-55`

但普通使用者需要理解三套不同凭据：

- Server Access Token；
- HTTP Provider API Key；
- Codex/Claude/Copilot CLI 本机登录。

当前设置页仍以技术字段为主，没有首次启动向导，也没有明确告诉用户：Token 在哪里配置、为什么项目页不可用、配置后是否需要重启、CLI 登录和 API Key 有何区别。

优化方法：

- health 返回更明确的 `auth.mode`、`configured`、`projectApisAvailable`；
- 项目页在 503/`API_TOKEN_NOT_CONFIGURED` 时显示阻断式配置指南；
- 设置页用“访问本服务”“远程模型凭据”“本机 CLI 登录”三块分组；
- 提供管理员可复制的安全启动命令和配置检查，不在页面泄露真实 Token。

### 6.2 中文化仍未形成完整发布门禁

**证据类型：Playwright 直接证据。置信度：高。**

当前源码主面板中文化已经明显改善，但设置页、Pipeline 模板和 Draw 仍有用户可见英文。现有 locale key 对齐测试只能证明中英文 JSON key 集合一致，不能证明所有 JSX 文案都进入 `t()`。

优化方法：

1. 对主页面和关键弹窗做用户可见英文静态扫描；
2. zh-CN Playwright 覆盖项目页、设置、Chat、Draw、RAG、Review、Citation、Anti-AI、Pipeline、Terminal；
3. API、LLM、RAG 等术语可保留英文，但必须配中文含义；
4. Pipeline 模板名、描述、阶段和执行器类型都应本地化；
5. 主题名 `Basic Light` 等也需要进入翻译体系。

### 6.3 功能入口仍偏“工具箱”，缺少论文目标导航

**证据类型：产品结构推断。置信度：中高。**

用户进入项目后同时看到 Chat、Draw、RAG、Review、Citations、Anti-AI、Pipeline 和 Terminal。Skills 推荐和 Workbench 服务已积累大量任务逻辑，但主界面仍没有先回答：

- 当前处于选题、初稿、补实验、改稿还是投稿阶段；
- 当前论文缺什么材料；
- 下一步最推荐做什么；
- 哪个动作会读取、写入、运行命令或产生费用；
- 结果是否已进入论文文件。

优化方向：以“论文目标 → 材料检查 → 推荐 Skill/Provider → 影响预览 → 执行 → 审核结果”为主流程，把功能面板作为二级工具，而不是要求用户先理解整个工具箱。

## 7. P2：离线、依赖、性能和仓库工程问题

### 7.1 Google Fonts 让离线环境持续报错

**证据类型：Playwright与源码直接证据。置信度：高。**

- `app/apps/frontend/src/app/App.css:1`

正式实例和隔离实例、所有视口都记录 Google Fonts `net::ERR_EMPTY_RESPONSE`。本地字体回退避免了白屏，但：

- 页面不是完全离线自包含；
- 控制台错误会掩盖真实资源故障；
- 首屏会产生无意义网络等待；
- 不同网络环境字体表现不一致。

优化方法：默认使用系统字体或自托管字体；只有显式允许外网资源时才加载 Google Fonts；E2E 对 console error 建立严格门禁。

### 7.2 当前 `npm audit` 报告 7 个漏洞

**证据类型：命令直接证据。置信度：高。**

本次 `npm audit --json` 结果：

| 严重度 | 数量 |
| --- | ---: |
| moderate | 2 |
| high | 3 |
| critical | 2 |
| 合计 | 7 |

涉及：

- `tar`：critical，直接依赖；
- `react-router-dom`：moderate，直接依赖；
- `shell-quote`：critical，传递依赖；
- `brace-expansion`：high；
- `fast-uri`：high；
- `vite`：high，位于 Vitest 依赖树；
- `react-router`：moderate。

不能机械执行 `npm audit fix`，但也不能只记录数量。每项需要：生产可达性、输入是否可控、部署平台、修复版本、升级破坏面、临时隔离和负责人/截止时间。

特别需要优先评估 `tar`，因为仓库包含模板上传、压缩包和导入相关功能；是否真正走到受影响代码路径应以调用链和恶意夹具验证为准。

### 7.3 两个懒加载 chunk 仍超过 500 KiB

**证据类型：构建产物直接证据。置信度：高。**

当前 `app/apps/frontend/dist/assets`：

```text
MarkdownEditor-*.js       583,947 bytes
RenderedPreviewPane-*.js  510,029 bytes
```

它们已经不在 EditorPage 初始 chunk 中，这是有效优化；但首次进入编辑器/预览仍可能在 LAN 冷缓存下出现等待。

优化方法：先用真实 LAN 冷缓存测量资源下载、解析和首次可交互时间，再决定细拆、预加载或替换依赖。不能只为消除 warning 做无数据拆分。

### 7.4 核心文件过大，改动影响难以判断

**证据类型：文件规模直接证据。置信度：高。**

```text
paperWorkbenchService.js   8042 行
paperRagService.js         2587 行
skillEngine.js             2415 行
LatexPreview.tsx           1281 行
DrawPanel.tsx              1127 行
ProjectPage.tsx            1043 行
ProjectTree.tsx             924 行
SkillsSelector.tsx          913 行
RightPanel.tsx              856 行
projects.js                 799 行
```

问题不是单纯“行数不好看”，而是同一文件聚合了过多状态、解析器、恢复逻辑、推荐规则、UI 映射和协议语义。用户可见后果包括：

- 一个小改动更容易影响不相关功能；
- 测试夹具和错误语义不断膨胀；
- 后端能力、前端映射和文档容易分叉；
- 后续 Claude/Codex 很难一次读取完整上下文并安全修改。

优化方法：先用回归测试锁定行为，再按稳定边界拆分；优先抽离纯函数、schema、adapter 和 UI 子区块，避免一次性重写。

### 7.5 工作区过于脏，无法可靠归因

**证据类型：Git 状态直接证据。置信度：高。**

本次统计：

```text
tracked changed: 92
untracked: 59
deleted tracked: 1
git diff added lines: 5772
git diff deleted lines: 4642
```

`pnpm-lock.yaml` 处于删除状态；大量前后端、测试、文档和构建产物同时变化。

风险：

- 无法快速判断某问题属于用户原始修改还是某轮整改；
- 旧报告的行号和结论很快失效；
- 某组通过的测试不一定对应正式构建；
- 发布回滚和问题二分困难；
- 大量新增文件尚未形成审查边界。

优化方法：后续按“部署握手、鉴权、项目身份、RAG、Skills、CLI Agent、i18n”等问题域形成小提交；每个提交使用仓库 Lore 协议记录约束、拒绝方案、测试和未测试项。

### 7.6 跟踪备份文件和测试/构建残留

**证据类型：Git/文件直接证据。置信度：高。**

当前跟踪或存在：

- `app/apps/frontend/src/app/components/SkillsSelector.tsx.bak`；
- `app/apps/frontend/dist/index.html`；
- `app/test-results/.last-run.json`；
- 根 `test-results/.last-run.json`；
- 根/应用级构建产物目录。

影响：搜索命中旧代码、静态扫描重复计算、review 噪声、难以判断 dist 是否对应当前源码。

本次未清理，因为需要先确认哪些产物有意提交、哪些属于用户工作成果。

### 7.7 readiness 覆盖面过窄

**证据类型：源码直接证据。置信度：高。**

`app/apps/backend/src/routes/health.js:16-27` 当前 readiness 只检查：

- 数据根可读写；
- 模板 manifest 可访问。

这不能证明：

- Token 模式可用；
- 当前 Provider 可用；
- TeX/Pandoc 可用；
- RAG index 健康；
- Skills 依赖满足；
- frontend/backend schema 兼容；
- 正式项目根没有严重损坏。

优化方法：保留轻量 liveness；readiness 分层返回 core、authoring、compile、rag、provider、skills 等子状态，并区分 required 与 optional，避免一个可选 OCR 工具让整个服务不可用。

## 8. 当前源码中已明显改善、不要重复返工的部分

以下问题在当前工作区源码中已经有实现和测试，后续处理时应重点验证和部署，而不是从零重写：

1. API 已采用 public allowlist/default-deny；
2. `/api/config` 已从当前源码公开路由移除；
3. health 已加入 build metadata，新增 `/api/ready`；
4. 前端已加入 build/schema 阻断门禁；
5. HTTP Provider 已有协议、私网、DNS 和重定向基础过滤；
6. managed project 已校验项目 ID、metadata 和 symlink 边界；
7. 项目显示名、稳定 ID、实际目录已在当前项目页明确展示；
8. 无 `project.json` 的论文目录已有明确注册 UI 和后端接口；
9. `GET /api/projects` 保持只读，不再静默写 metadata；
10. Codex CLI Chat 使用 `read-only` sandbox；
11. CLI 原始 JSON 不再作为流式 token 直接显示；
12. RAG index 已加入锁、原子写入和损坏隔离恢复；
13. 模板安装已加入 staging、备份、回滚和锁；
14. capability probe 已强化进程树终止；
15. 主面板核心中文化已经完成一轮；
16. 移动端项目页和编辑器已无横向溢出；
17. 隔离 E2E 使用随机 Token、随机端口和临时数据根。

特别说明：这些属于“当前源码状态”，不代表正式 8787 已经部署。当前正式服务仍必须重新验证。

## 9. 推荐整改顺序

### 第一阶段：先恢复正式可用性和部署可信度

1. 对当前源码执行完整检查；
2. 生成唯一最终 build ID；
3. 只停止本仓库正式旧进程；
4. 重启当前后端并确认唯一监听 `0.0.0.0:8787`；
5. 验证 loopback 与 LAN 的 health/ready/build/schema；
6. 验证匿名、无 Bearer、错误 Bearer、正确 Bearer；
7. 跑桌面/手机/平板正式 Playwright；
8. 把 build ID、PID、URL 和时间写回状态文档。

### 第二阶段：完成首次使用和核心安全闭环

1. Token 首次启动向导；
2. Provider DNS rebinding/socket pinning 专项复审；
3. 移除编译环境硬编码；
4. 依赖漏洞逐项可达性评估；
5. readiness 分层。

### 第三阶段：完成 Agent、Skills 和 RAG 产品语义

1. CLI Task Agent 隔离副本 + Diff + Accept/Reject；
2. Skill requirements/readiness/dry-run/last-run；
3. RAG 健康度和逐文件解析状态 UI；
4. 建立检索评测集，再决定 semantic/hybrid；
5. 明确费用、副作用和文件写入范围。

### 第四阶段：完善体验和工程治理

1. 设置页、Pipeline、Draw 全量中文化；
2. 默认移除外网字体依赖；
3. 测量并优化两个大 chunk；
4. 按行为边界拆分超大文件；
5. 清理 `.bak` 和测试/构建残留；
6. 把巨量工作区改动拆成可审查的小提交。

## 10. 建议最终验收标准

### 正式部署

- `/api/health` 含正确 build ID、schema 和启动时间；
- `/api/ready` 返回 200，并展示分层检查结果；
- 前后端 build/schema 一致；
- 正式 PID 晚于最终构建时间；
- loopback 与 LAN 结果一致；
- 桌面、手机和平板均可进入项目与编辑器。

### 鉴权与隐私

- 匿名 `/api/config`、`/api/projects` 返回 401/503，而不是数据；
- 匿名响应不含绝对路径、内网 endpoint、证书位置和模型部署信息；
- Server Token、Provider Key、CLI 登录来源在 UI 中明确区分；
- CLI Chat 不写论文；Task Agent 只写隔离副本。

### 项目与数据

- 项目名、稳定 ID 和实际目录清晰可见；
- 现有论文目录可以明确确认后注册；
- 注册不移动原文件；
- RAG、模板和配置写入失败时旧数据仍可读；
- Task Agent Reject 后原文件 hash 不变。

### RAG 与 Skills

- RAG 显示 generation、最后成功时间、文件/chunk 数和逐文件 parser 状态；
- 明确标注关键词/语义检索策略；
- 检索质量有固定评测集；
- Skill 显示真实 ready/degraded/unavailable；
- Skill 明确依赖、凭据、联网、文件写入、副作用和费用；
- unavailable Skill 不应被当作“推荐后即可执行”。

### UI 与离线

- zh-CN 关键路径不存在整段硬编码英文；
- 默认不请求 Google Fonts 等非必要外网资源；
- Playwright console error 为零或只有明确审核过的允许项；
- 冷缓存下编辑器和预览首次打开时间达到约定预算。

### 工程质量

- typecheck、build、unit、integration、E2E 全通过；
- post-deploy E2E 针对正式 LAN 地址执行；
- 依赖漏洞有逐项结论；
- 没有无归属 `.bak`、测试残留和陈旧 dist；
- 每个整改问题有小提交、回归测试和 Lore 记录。

## 11. 证据、推断和未知项

### 直接证据

- Playwright 实际访问正式 `/projects` 和 `/editor`；
- Playwright 实际运行桌面、手机和平板视口；
- Playwright 实际启动当前源码隔离实例并打开项目、设置和六个主面板；
- 正式 API 实际返回旧 health/providers/config/projects 契约；
- 当前源码直接显示 build handshake、default-deny、CLI read-only、RAG overlap scoring 和编译路径；
- `npm audit` 实际返回 7 个漏洞；
- 当前构建产物实际有两个超过 500 KiB 的 chunk；
- Git 状态实际显示 92 个 tracked changes、59 个 untracked 文件和 1 个 tracked deletion。

### 推断

- 正式后端没有加载当前工作区最新源码：由 API schema、`/api/ready` 缺失和前端门禁共同支持，置信度高；
- DNS 校验后标准 fetch 可能存在 rebinding 时间窗：由解析与连接未绑定支持，置信度中，尚未做恶意 DNS 实验；
- 超大文件增加改动耦合和审查难度：由职责和规模支持，置信度高，但不能仅按行数决定拆分方式；
- RAG 对同义、跨语言问题的召回有限：由词项重叠算法支持，置信度高，尚缺真实论文评测数据量化程度。

### 未知项

- 正式 Codex、Claude Code、Copilot CLI 当前真实登录状态；
- 真实付费模型输出质量、费用和速率限制；
- 7 个依赖漏洞在当前生产调用链中的具体可达性；
- 大型真实论文下的 RAG Recall@K、编译耗时和浏览器性能；
- 多用户并发编辑、上传、索引、模板安装和 Task Agent 的实际竞争行为；
- `.bak`、dist 和测试残留是否有特殊归档目的；本次没有删除。

## 12. 一句话判断

当前仓库的核心矛盾已经从“缺少功能”转为“源码能力增长很快，但部署一致性、Agent 审批、Skills 就绪度、RAG 质量语义、首次使用和工程收口没有同步完成”；第一优先级不是继续增加新面板，而是先让正式 8787 与当前源码一致并恢复可用，再完成 CLI Task Agent、Skills readiness、RAG 健康度和检索评测。
