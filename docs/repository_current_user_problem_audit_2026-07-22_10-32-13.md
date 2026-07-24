# paper_wrighting 当前仓库用户问题审计与优化建议

- 审计时间：2026-07-22 10:32:13（Asia/Shanghai）
- 仓库：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting`
- 正式地址：`http://10.30.0.22:8787`
- 审计视角：首次使用者、论文作者、管理员、二次开发维护者
- 审计边界：只发现和分析问题；不修改业务代码、不重启正式服务、不写入正式论文、不调用真实付费模型
- 本轮唯一仓库写入：新增本审计文档
- 证据来源：正式 LAN Playwright、隔离 Playwright、HTTP 探针、进程环境、文件系统、当前源码、TypeScript、Vitest、依赖审计和 Git 工作区

> 本文是 2026-07-22 10:32 时点的增量复核报告。若与今天更早的审计报告冲突，以本文的 build ID、测试结果、PID 和时间为准。本文特别纠正了两项过期结论：当前新建项目表单的可访问名称已经补齐；Provider 连接、会话恢复和完整 RAG UI 旅程也已经有新的浏览器覆盖。

## 1. 结论先行

当前仓库的主要矛盾已经不是“源码里完全没有 Codex、Copilot、Skills、RAG 或稳定项目身份”，而是以下四层状态没有形成一个可信、可复现的产品交付：

```text
当前工作区源码
  ≠ 当前正式后端进程
  ≠ 正式服务的数据根
  ≠ 默认并行测试所证明的稳定性
```

最严重的问题是正式站点不可用。桌面、手机和平板三个真实 Chromium 视口均被“前后端版本不一致”页面阻断；正式后端仍匿名暴露项目和配置元数据；正式数据根仍指向 `/data01/home/xuzk/papers`，而不是仓库中的 `paper_wrighting/papers`。因此，用户看到的项目与仓库 `papers/` 子目录对不上，并不是错觉，而是正式运行配置确实指向了另一套目录。

当前源码的基础质量明显好于正式运行态：TypeScript 通过，78 个测试文件、438 个单元测试通过，依赖审计为 0 漏洞；隔离 Playwright 在单 worker 下 30/30 通过。但是，默认 30 worker 并行运行同一套 E2E 时只有 23/30 通过，7 条用例因共享后端和共享临时数据根发生竞争。这意味着“串行功能可用”已经得到证明，但“默认并行测试稳定、发布结果可重复”还没有得到证明。

### 当前状态概览

| 维度 | 当前状态 | 用户含义 |
| --- | --- | --- |
| 正式 LAN 入口 | **阻断** | 用户无法进入项目列表和编辑器 |
| 正式鉴权 | **旧后端未启用** | 匿名或错误 Token 仍能读取业务元数据 |
| 正式数据根 | **错位** | 页面项目不对应仓库 `papers/` |
| 当前源码 | 基础能力较完整 | 不应再从零重复实现 Provider、RAG health、稳定项目 ID 等能力 |
| 浏览器测试（串行） | 30/30 通过 | 单用户、隔离、顺序执行的核心旅程可用 |
| 浏览器测试（默认并行） | 23/30 通过 | 测试隔离不足，绿灯不稳定 |
| Provider | API + Codex/Claude/Copilot CLI 已有 | 正式 UI 当前不可进入；安装、登录、可调用仍需分别表达 |
| Skills | 治理框架存在，干净环境 0 ready | “有 123 个 Skill”不等于“有 123 个可靠能力” |
| RAG | 本地关键词重叠检索 | 可做字面证据查找，不能宣称语义向量检索 |
| 发布结论 | **BLOCK** | 当前不应标记为正式可用或完成交付 |

## 2. 本轮实际 Playwright 复核

### 2.1 正式 LAN：三个视口全部被版本门禁阻断

实际访问：

```text
http://10.30.0.22:8787/projects
```

| 设备 | 视口 | HTTP | 页面结果 | 横向溢出 | Page error / failed request |
| --- | ---: | ---: | --- | --- | --- |
| Desktop | 1440×900 | 200 | 前后端版本不一致 | 无 | 无 |
| Phone | 390×844 | 200 | 前后端版本不一致 | 无 | 无 |
| Tablet | 768×1024 | 200 | 前后端版本不一致 | 无 | 无 |

三个视口的核心正文一致：

```text
前后端版本不一致
当前页面与服务器不是同一次构建。为避免使用旧接口修改论文，工作区已暂停加载。
missing-build-metadata
Frontend build 20260722022228-f0ef1484486e-0bd19752 is not compatible with the running backend.
```

直接观察：

- 本地 `Noto Sans SC` 字体已加载，中文字体检查通过；
- 三个视口均无横向溢出；
- 没有浏览器 page error 或请求失败；
- 当前唯一可见阻断是正式后端缺少与前端匹配的 build metadata。

结论边界：Deployment Gate 本身是在正确地阻止新前端调用旧 API；但从用户角度，正式产品仍然完全不可使用。

### 2.2 隔离 Playwright：默认并行复现 7 个失败

执行：

```bash
cd app
node scripts/run-e2e-isolated.mjs --reporter=line
```

运行方式：30 条测试、30 个 worker，共享同一个隔离后端和同一个临时 `papers` 根目录。

结果：

```text
23 passed
7 failed
```

失败范围：

1. 手机工作区未找到“工作区视图”导航；
2. 已有目录注册后发现区没有按预期消失；
3. 非最新会话的激活状态未在预期时间出现；
4. RAG 健康状态停留在 `Loading...`；
5. RAG 损坏索引重建后的状态没有按预期变化；
6. RAG UI 添加资料后没有出现成功提示；
7. Draw.io 离线 fallback 没有出现预期 alert。

### 2.3 单 worker 复核：同一套测试 30/30 通过

执行：

```bash
cd app
node scripts/run-e2e-isolated.mjs --workers=1 --reporter=line
```

结果：

```text
30 passed (1.2m)
```

高可信推断：上述 7 个失败主要来自测试之间共享后端状态、共享数据根、共享资源竞争或高并发时序压力，而不是七个稳定、独立的产品功能回归。但它仍然是正式问题，因为仓库默认配置启用了 `fullyParallel: true`，自动化绿灯会随 worker 数和机器负载变化。

优化方向：

- 每个测试或每个 worker 使用独立数据根、独立后端端口和独立 Token；或明确将有共享状态的 suite 标记为串行；
- 不要让 RAG 重建、项目发现注册、会话状态和 Draw.io 网络模拟共享同一后端状态；
- CI 必须固定 worker 策略，并增加一次重复运行或 flaky 检测；
- 把“30 worker 失败、1 worker 通过”作为测试隔离缺陷，而不是简单调大 timeout 掩盖。

## 3. P0：正式运行态问题

### P0-1 正式前后端不是同一发布批次

**证据：直接；置信度：高。**

当前正式进程：

```text
supervisor PID: 575751
backend PID:    575763
listener:       0.0.0.0:8787
start time:     2026-07-22 02:56:52
```

正式 `/api/health` 仍只返回：

```json
{"ok":true,"authRequired":false}
```

当前源码 `app/apps/backend/src/routes/health.js:33-52` 已定义 build metadata 和 `/api/ready`；正式进程没有这些响应，说明正式后端没有加载当前源码批次。

用户影响：所有正式用户都无法进入项目列表、编辑器、Provider、Skills 和 RAG 页面。

优化方向：frontend dist、backend、build ID、API schema 必须作为同一个原子发布单元；发布后强制验证前端 build ID 等于后端 build ID，并运行 LAN 浏览器验收。

### P0-2 正式旧后端没有启用业务 API 鉴权

**证据：直接；置信度：高。**

| Endpoint | 无 Token | 错误 Token |
| --- | ---: | ---: |
| `/api/health` | 200 | 200 |
| `/api/ready` | 404 | 404 |
| `/api/projects` | 200 | 200 |
| `/api/config` | 200 | 200 |
| `/api/providers` | 200 | 200 |
| `/api/skills` | 200 | 200 |
| `/api/capabilities` | 503 | 503 |
| `/paper-writer-workbench.html` | 404 | 404 |

正式进程环境中没有 `OPENPRISM_API_TOKEN`。当前源码已经朝 default-deny 和 Token 首次应用方向整改，但尚未部署到正式实例。

用户影响：同一局域网中的匿名访问者仍可枚举项目、Provider、Skills 和配置元数据。

优化方向：正式实例配置强随机 Token；除最小健康探针外的业务 API 默认拒绝；发布验收固定检查 401/403/200 三态；终端、下载、图片、PDF、WebSocket 和 SSE 必须使用同一鉴权边界。

### P0-3 正式数据根与仓库 `papers/` 明确不一致

**证据：直接；置信度：高。**

正式进程：

```text
OPENPRISM_PROJECTS_DIR=/data01/home/xuzk/papers
```

用户所指的仓库目录：

```text
/data01/home/xuzk/workspace/ai_agent/paper_wrighting/papers
```

两处目录当前数量和内容均不同：

```text
正式数据根：4 个一级目录
仓库 papers：15 个一级目录
```

正式目录中可见 `not-a-real-project`、`uploaded-paper-*` 等条目；仓库目录中则有 `paper-agent-spe`、`MSAVQ`、`moe_prune`、`torq` 等。页面项目与仓库子目录对不上，首先应解释为正式服务读取了另一套数据根，而不是项目列表组件随机丢失目录。

优化方向：

- 产品 UI 显示当前数据根的脱敏路径、来源和可写状态；
- 启动时打印并校验唯一权威数据根；
- 不允许 `OPENPRISM_DATA_DIR`、`OPENPRISM_PROJECTS_DIR` 和默认路径静默分叉；
- 提供“发现已有目录 → 预览 → 显式注册”，不要自动迁移或改名用户论文；
- 正式切换数据根前生成只读差异报告，确认哪些目录是论文、测试残留或未管理目录。

## 4. P1：产品模型与核心能力边界

### P1-1 项目显示名、稳定 ID 和物理目录仍会违背普通用户直觉

**证据：源码；置信度：高。**

`app/apps/backend/src/services/projectLocator.js:23-42` 明确生成：

```text
<slugified-display-name>--<short-project-id>
```

这种设计有利于重名、稳定引用和安全重命名，但用户看到“项目名 A”，文件系统看到“A--8位ID”，仍会自然认为二者没有对应上。

优化方向：项目列表同时显示“显示名称、存储目录、项目 ID”；复制路径和打开目录作为明确操作；重命名时解释是否会移动物理目录；不要让用户猜测 slug 和短 ID 规则。

### P1-2 Project Locator 正常查找可能 O(N) 扫描全部项目

**证据：源码；置信度：高。**

`projectLocator.js:67-119` 先尝试 `dataDir/id`，失败后读取数据根下所有目录，并逐个读取 `project.json`。当前新项目的物理目录通常不是完整 UUID，因此按 ID 查找很容易进入全量扫描。

用户影响：项目数量增加、网络盘或机械盘延迟升高后，打开项目、API 路由和频繁文件操作可能变慢。

优化方向：维护经过校验的 `projectId -> directoryName` 索引或缓存；创建、注册、重命名时更新；缺失或不匹配时回退扫描并自修复，保留恢复能力。

### P1-3 Provider 已支持 CLI，但“安装、登录、模型可用”仍是不同层次

**证据：源码与非推理 probe；置信度：高。**

当前源码已有 OpenAI-compatible、Anthropic、Codex CLI、Claude Code CLI 和 GitHub Copilot CLI。当前主机上 Codex 与 Claude CLI 已安装且认证可用；Copilot CLI 已安装，但缺少可靠的非交互登录状态命令。当前 Provider 设置页已经有真实非推理“测试连接”，并且未知/未认证状态不再给绿色成功。

剩余问题：`app/apps/backend/src/services/capabilityService.js:193-216` 的系统能力探针仍主要执行 `--version`，明确把登录状态标为 `not-checked`。因此“系统能力可用”和“Provider 连接已验证”仍是两套语义。

优化方向：统一状态模型，至少区分 `supported / installed / authenticated / model-accessible / writable-scope`；Copilot 无可靠 auth probe 时必须显示“未知”，不能用“已安装”替代“可调用”。

### P1-4 Skills 目录丰富，但干净环境仍然 0 ready

**证据：源码和既有隔离实测；置信度：高。**

`app/apps/backend/src/services/skillReadinessService.js:175-180` 对没有显式执行元数据的 Skill 标记 `metadataSource: inferred`；`238-245` 将其要求标记为 `unverified`；`286-288` 最终把有未验证必需项的 Skill 标为 `degraded`。

干净环境观察：

- 默认 Provider 未配置：123/123 `unavailable`；
- 选择已安装的 Codex CLI 后：123/123 `degraded`；
- `ready`：0。

这说明当前实现具备目录、筛选、readiness、dry-run 和 run ledger，但 Skill 资产本身还没有逐项补齐可靠执行契约。

优化方向：先定义 Skill manifest schema，再分批把高价值 Skill 补齐命令、凭据、网络、输入文件、输出产物、费用、超时和副作用；UI 默认只推荐 ready，degraded 必须解释具体未验证项；“模型请求完成”与“任务目标通过”不能共用一个 success。

### P1-5 RAG 是本地关键词检索，不是语义向量 RAG

**证据：源码；置信度：高。**

`app/apps/backend/src/services/paperRagService.js:25-29` 明确声明：

```text
kind: local-keyword-overlap
semantic: false
```

`2029-2037` 的评分由查询词与 chunk token 的重叠数和密度组成，没有 embedding 或向量相似度。

用户影响：同义词、改写、跨语言、概念相关但字面不同的证据容易漏召回。当前 UI 已更诚实地标注“不是语义向量检索”，这是正确的，但产品宣传和文档也必须保持一致。

优化方向：保留本地 lexical 模式作为可解释、离线、低成本基线；若增加语义检索，应显式增加 embedding Provider、索引版本、重建、成本、隐私、hybrid 排序和评测集，而不是只改名为“语义 RAG”。

### P1-6 `/api/ready` 的含义过窄

**证据：源码；置信度：高。**

`app/apps/backend/src/routes/health.js:17-30` 当前只检查：

- 数据根可读写；
- 模板目录/manifest 有效。

它不证明 Provider 登录、模型访问、TeX 编译、OCR、Pandoc、Skills 或 RAG 已可用。

优化方向：保留轻量 readiness，但把结果拆成分层能力矩阵；发布门禁只使用稳定、必要的核心项，其他能力以 `available / degraded / unavailable / unknown` 展示，避免一个布尔值制造“整个系统已就绪”的错觉。

## 5. P1/P2：测试与交付可信度

### P1-7 默认并行 E2E 与共享状态模型冲突

**证据：直接；置信度：高。**

同一源码、同一机器、同一测试集合：

```text
30 workers: 23 passed, 7 failed
1 worker:   30 passed, 0 failed
```

这比单纯的“偶发慢”更值得重视，因为失败跨越项目注册、移动端、会话、RAG 和 Draw.io，符合共享后端/共享数据根竞争的特征。

优化方向：真正做到 worker 级隔离，或降低并行范围；CI 明确记录 worker 数、随机端口、数据根和 Token；增加重复运行和 flaky 报告。

### P2-1 隔离绿灯与正式 LAN 验收之间仍有断层

**证据：直接；置信度：高。**

隔离串行 30/30 通过，同时正式站点完全阻断。这证明当前测试能够验证源码，却不能证明正式部署已经更新、鉴权已启用或数据根正确。

优化方向：发布流水线必须在正式重启后追加 loopback + LAN 的只读验收，校验进程数量、监听地址、build ID、schema、数据根、Token 三态和多视口页面。

### P2-2 模板和真实编译仍缺少代表性矩阵

**证据：测试边界；置信度：中高。**

当前已有模板 manifest、入口文件和 package-install 安全测试，但本轮没有看到覆盖中英文、BibTeX/Biber、常见图表、缺包失败、无 shell escape、不同 TeX 引擎的真实模板矩阵结果。

优化方向：建立小而固定的代表性模板集，记录引擎、依赖、期望 PDF、失败诊断和是否允许安装包；默认无网络、无自动安装、无 shell escape。

## 6. P2：用户体验与维护性

### P2-3 首次使用路径仍然信息密度过高

**证据：界面结构和功能面；置信度：中高。**

项目编辑器同时承载文件树、编辑、预览、聊天、CLI Task Agent、Skills、RAG、引用核验、Anti-AI、绘图、Pipeline、终端和编译。高级用户会觉得强大，首次用户则难以判断“写论文的下一步是什么”。

优化方向：提供任务导向的渐进式入口，例如“导入/创建 → 选择 Provider → 写作 → 查证据 → 编译 → 审阅”；高级工具保持可发现，但不应与首要写作路径竞争视觉优先级。

### P2-4 中英文界面仍有漏网的硬编码字符串

**证据：源码搜索；置信度：高。**

当前已有主要面板 i18n 浏览器测试，但仍能找到 `Loading...`、`Featured`、`No project open`、`Thinking...`、`Click to expand diff`、`Something went wrong`、部分 Draw.io title/aria-label 等硬编码英文。

用户影响：中文界面在加载、错误、预览和少数工具中会突然切回英文；可访问名称也可能与视觉语言不一致。

优化方向：建立静态硬编码字符串检查和关键页面双语快照；aria-label、title、错误边界、loading/empty state 与正文使用同一 i18n 来源。

### P2-5 仓库命名存在持续拼写负担

**证据：仓库和文档；置信度：高。**

仓库、远程 URL 和安装命令都使用 `paper_wrighting`，其中 `wrighting` 是 `writing` 的常见拼写错误；产品名又同时出现 `Paper Agent`、`Paper Writer`、历史 `OpenPrism`。这会增加搜索、口头沟通、脚本路径和品牌认知成本。

优化方向：短期明确“仓库技术名称”和“产品显示名称”的映射；长期如需改名，提供兼容跳转、迁移说明和旧路径检测，不应直接破坏已有 clone、脚本和部署目录。

### P2-6 工作区极度 dirty，难以形成可复现发布

**证据：Git；置信度：高。**

本轮观察：

```text
git status --short: 222 条
tracked diff: 111 files changed
8437 insertions, 7245 deletions
```

其中同时混合鉴权、Provider、CLI Task Agent、RAG、Skills、项目身份、UI、测试、文档、构建产物和论文元数据。即使功能本身正确，也难以回答“正式服务究竟部署了哪一组变更”。

优化方向：按可独立验证的主题拆分提交和发布批次；构建产物采用明确策略；论文数据与应用代码分离；每批变更记录 build ID、验证命令和已知风险。

### P2-7 同日审计文档过多，结论容易相互冲突

**证据：文件系统；置信度：高。**

`docs/` 中同一天已有多份 `repository_*audit*` 和 `repository_*analysis*` 文档。较早文档中的中文字体、可访问名称、Provider 测试或 E2E 数量已经被后续源码改变。

优化方向：保留历史证据，但增加一个权威索引，标记 `current / superseded / remediation-status`；每份报告写明 build ID、后端 PID、数据根和测试时间，禁止无上下文地复用旧结论。

### P2-8 核心模块体积过大

**证据：源码规模；置信度：高。**

```text
paperWorkbenchService.js  7687 行 / 329 KiB
paperRagService.js        2797 行 / 103 KiB
ProjectPage.tsx           1081 行 / 48 KiB
App.css                   约 120 KiB
SkillsSelector.tsx        约 80 KiB
```

用户影响是间接的：高耦合增加回归概率，修复一个功能时更难判断会影响哪些工作流；维护者更难建立清晰边界。

优化方向：先用现有测试锁定行为，再按领域边界拆分；优先提取纯函数、协议适配器、状态机和渲染子组件，避免仅为了“文件变小”引入更多抽象层。

## 7. 已完成整改、不应继续当作当前缺陷的问题

以下早期问题在当前源码中已有明确实现或浏览器证明，不应再从零重复开发：

- Codex CLI、Claude Code CLI、GitHub Copilot CLI Provider 已存在；
- Provider 设置页已有真实非推理连接测试，未知/未认证状态不会得到绿色验证；
- 新建项目表单已经有语义 label、dialog 和模板选择可访问语义；
- 会话恢复已经有真实浏览器刷新旅程；
- RAG 已有“添加 → 搜索 → 删除 → 再搜索”的完整 UI 旅程；
- 稳定项目 ID、显示名和物理目录三层身份已实现；
- 已有目录发现和显式注册已实现；
- Token 保护、受保护图片/PDF/下载、CLI Task Agent Diff/Accept/Reject 已实现于当前源码；
- 本地中文字体已加载，当前三个正式视口没有横向溢出；
- Legacy workbench 默认 404，Legacy `/api/paper/*` 默认关闭；
- TeX 包安装默认禁止，必须显式授权；
- Draw.io 有离线 XML fallback；
- RAG health、generation、fingerprint 和损坏恢复已实现；
- build ID/API schema Deployment Gate 已实现并正在正确阻止新旧版本混用。

注意：这些结论描述的是当前源码或隔离环境，不代表正式 8787 进程已经部署它们。

## 8. 优先级总表

| 优先级 | 问题 | 证据 | 当前建议 |
| --- | --- | --- | --- |
| P0 | 正式前后端 build 不一致 | 三视口 Playwright | 作为原子发布重新构建并重启后验收 |
| P0 | 正式业务 API 无 Token 保护 | HTTP 三态探针 | 部署当前鉴权并配置强 Token |
| P0 | 正式数据根指向另一套 `papers` | 进程环境 + 目录对比 | 确定唯一权威数据根并显式展示 |
| P1 | 默认并行 E2E 7/30 失败 | 30 worker 与 1 worker 对照 | worker 级隔离或显式串行 |
| P1 | 项目显示名与目录名不直观 | 项目目录生成规则 | UI 同时展示名称、目录和 ID |
| P1 | Project Locator O(N) 扫描 | `projectLocator.js` | 校验缓存/索引 + 扫描回退 |
| P1 | Provider 状态语义分散 | Provider probe + capability probe | 统一安装/登录/可调用状态模型 |
| P1 | 123 Skills 中 0 ready | readiness 逻辑和干净环境 | 分批补 manifest 执行契约 |
| P1 | RAG 仅关键词重叠 | `paperRagService.js` | 保持诚实命名；语义检索单独设计 |
| P1 | readiness 仅检查数据根和模板 | `health.js` | 增加分层能力诊断 |
| P2 | 隔离测试与正式发布脱节 | 30/30 vs 正式阻断 | 增加发布后 LAN 验收 |
| P2 | 真实模板编译矩阵不足 | 测试边界 | 建立固定代表性矩阵 |
| P2 | 首次用户路径过密 | 功能信息架构 | 渐进式、任务导向入口 |
| P2 | 硬编码英文仍存在 | 源码搜索 | i18n 静态门禁和双语验收 |
| P2 | 名称 `paper_wrighting` 拼写负担 | 仓库 URL/目录 | 明确命名映射，谨慎迁移 |
| P2 | 工作区 222 条状态 | Git | 拆分可验证提交和发布批次 |
| P2 | 审计文档过多 | `docs/` | 建立权威 current/superseded 索引 |
| P2 | 核心模块过大 | 文件规模 | 测试保护下按领域拆分 |

## 9. 建议整改顺序

1. 先把正式数据根、Token、frontend build、backend build 和 API schema 固定为一个发布配置；在这之前不要继续宣称正式可用。
2. 修复 E2E worker 隔离，使默认测试命令稳定，而不是依赖 `--workers=1` 才通过。
3. 建立正式发布后的 LAN 验收：桌面、手机、平板、鉴权三态、数据根、build ID、受保护资源。
4. 统一项目身份展示和 Provider 状态语义，降低用户理解成本。
5. 分批治理 Skills manifest；不要以 Skill 数量代替 ready 数量。
6. 明确 RAG 的 lexical 基线边界，再决定是否加入 hybrid/semantic 检索。
7. 补真实模板编译矩阵、i18n 门禁和测试重复运行。
8. 最后处理大文件拆分、审计文档治理、仓库命名和提交结构。

## 10. 本轮验证记录

```text
正式 LAN Playwright：
  Desktop 1440×900：阻断于 missing-build-metadata
  Phone   390×844：阻断于 missing-build-metadata
  Tablet  768×1024：阻断于 missing-build-metadata
  当前 frontend build：20260722022228-f0ef1484486e-0bd19752

隔离 Playwright（默认并行）：
  23 passed / 7 failed

隔离 Playwright（--workers=1）：
  30 passed / 0 failed

TypeScript：
  passed

Vitest：
  78 files passed
  438 tests passed

npm audit：
  0 vulnerabilities

git diff --check：
  passed
```

测试过程使用随机端口、`/tmp` 临时数据根和随机 Token；没有向 `/data01/home/xuzk/papers` 或仓库 `papers/` 写入测试论文。

## 11. 未知项与限制

- 本轮没有调用真实付费模型，因此没有证明 Codex、Claude 或 Copilot 对具体论文任务的质量、费用和长任务稳定性；
- 没有接受 CLI Task Agent 的正式文件改动；
- 没有执行全量真实模板编译矩阵；
- 没有验证 OCR 在多页扫描论文上的准确率和资源占用；
- 没有做多用户并发、长时间 soak、网络中断恢复或大规模项目数量压测；
- 没有修改、重启或迁移正式服务，因此正式阻断、匿名访问和数据根错位仍保持原状。

## 12. 最终判断

从使用者角度，当前仓库已经有相当多实质能力，特别是 CLI Provider、项目身份、受控 Task Agent、RAG 健康、Skills readiness、移动布局和发布门禁；继续把它描述成“完全没有这些功能”已经不准确。

但当前正式产品仍不可用，原因不是单个按钮或单个 API，而是发布批次、鉴权和数据根三项基础运行契约同时失配。与此同时，默认并行 E2E 的 7 个失败说明仓库的自动化可信度仍受共享状态影响。最合理的当前结论是：

```text
源码基础能力：可验证、较完整
串行核心旅程：通过
默认并行稳定性：未通过
正式 LAN 可用性：未通过
正式安全与数据一致性：未通过
发布结论：BLOCK
```
