# Paper Writing 仓库用户体验与系统问题审计

- 审计时间：2026-07-22 09:58:31（Asia/Shanghai）
- 仓库路径：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting`
- 正式访问地址：`http://10.30.0.22:8787`
- 审计视角：首次使用者、日常论文作者、管理员、二次开发维护者
- 审计原则：只发现问题，不修改产品代码，不重启正式服务，不写入正式论文，不调用真实付费模型
- 证据来源：Playwright 真实 Chromium 操作、隔离 E2E、HTTP 探测、进程与监听检查、当前源码、类型检查、单元测试、依赖审计、Git 工作区检查

## 1. 执行摘要

当前仓库已经不再是一个只有基础 API 模型配置的原型。当前工作区源码已经包含：

- OpenAI-compatible、Anthropic、Codex CLI、Claude Code CLI、GitHub Copilot CLI 五类 Provider；
- 只读 Chat 与可修改文件的隔离 CLI Task Agent 两条不同路径；
- 稳定项目 ID、显示名称、物理目录三层项目身份；
- 已有 `papers` 子目录发现与注册；
- Skills readiness、RAG 健康诊断、外部文献检索状态；
- 前后端 build ID / API schema 兼容性门禁；
- Bearer Token 保护、临时浏览器会话 Token；
- 桌面、手机和平板工作区适配；
- Markdown、LaTeX 懒加载预览。

但从真实用户角度，当前最重要的事实不是“功能很多”，而是四种状态没有形成一致的交付闭环：

```text
源码已经实现
≠ 单元测试已经通过
≠ 隔离浏览器测试已经通过
≠ 正式 LAN 实例已经部署并可用
```

本轮最重要的结论如下：

1. **正式 LAN 服务当前完全不能进入项目工作区。** 桌面、手机、平板三个真实 Chromium 视口都停留在“前后端版本不一致”阻断页。
2. **正式后端仍是旧批次，并且匿名暴露配置、项目与 Provider 元数据。** 无 Token 和明显错误 Token 请求 `/api/config`、`/api/projects`、`/api/providers` 都返回 200。
3. **当前工作区构建产物本身并未整体损坏。** 使用同一构建批次、随机端口、临时数据根和随机 Token 的隔离 Playwright 共 20 项全部通过。
4. **Codex、Claude Code、GitHub Copilot 选项已经存在。** 因此“增加直接使用 Codex/Copilot”的原始诉求，当前源码已有较完整的基础实现；真正剩余的问题是正式部署、安装/登录状态、可用性表达和 Chat/Task 两种模式的用户认知。
5. **项目名称与 `papers` 子目录不一致的问题仍然存在，但现在是明确的设计选择。** 新建“审计体验项目 2026-07-22”实际创建目录 `审计体验项目-2026-07-22--3df97369`。系统通过稳定 ID 避免同名冲突，UI 也显示物理目录，但这仍不符合“看到的工程名就是文件夹名”的直觉。
6. **Skills 数量多但成熟度不足。** 当前加载 123 个 Skills，123 个全部是 `degraded`；旧 Skill 多数缺少显式执行元数据。UI 仍允许选择 degraded Skill，用户容易把“能选择”误解为“已验证可执行”。
7. **RAG 已提高透明度，但核心仍是本地关键词重叠检索。** 系统明确标注不是语义向量检索；当前机器还缺少 PDF 文本抽取/OCR 工具，外部检索也处于 degraded。
8. **核心运行能力与 `/api/ready` 的含义不一致。** 隔离环境 `/api/ready` 返回 ready，但能力检查显示所有后端 TeX 引擎不可用、PDF OCR 不可用、Claude CLI 不可用。当前 ready 只证明数据根和模板可用，不代表论文编译、OCR、模型或检索链路可用。
9. **编辑器信息架构偏重。** 首屏同时出现文件树、编辑区、8 个 AI 功能 Tab、Skills、Terminal；进入编辑器后没有醒目的项目名称/目录身份，也缺少按任务组织的首次引导。
10. **仓库交付状态过于混杂。** 当前 `git status --short` 有 218 条记录，其中 110 条已跟踪修改、108 个未跟踪项；已跟踪 diff 涉及 110 个文件、8372 行新增和 7232 行删除。大量同日审计文档互相描述不同时间点，读者很难判断哪份是当前事实。

综合判断：**当前源码具备继续产品化的基础，隔离核心流程也能工作；但正式部署不可用、正式旧后端未保护、能力状态表达不统一、项目身份仍违背用户直觉、Skills/RAG 成熟度不足。当前版本不应被描述为“已经稳定交付”。**

## 2. 证据等级与审计边界

本文使用以下证据分类：

- **直接证据**：本轮浏览器、HTTP、进程、测试或文件命令直接观察到的事实。
- **源码证据**：当前工作区源码明确实现某种行为，但不代表正式进程已经加载。
- **高可信推断**：多个直接证据共同支持，但本轮没有进行破坏性或付费验证。
- **未知**：在只读、安全边界内无法确认。

本轮没有执行：

- 没有修改任何前后端产品代码；
- 没有运行会覆盖当前 `dist` 的生产构建；
- 没有重启、停止或替换正式 PID `575763`；
- 没有在正式 `papers` 数据根创建、重命名、移动或删除项目；
- 没有调用真实 Codex、Claude Code、Copilot 或收费 HTTP 模型；
- 没有在正式论文上接受 CLI Task Agent 变更；
- 没有执行命令注入、路径穿越或破坏性安全利用；
- 没有把“测试文件存在”当成“用户功能可用”。

本轮唯一新增的仓库文件是本文档。

## 3. Playwright 真实使用结果

### 3.1 正式 LAN：桌面、手机、平板全部被版本门禁阻断

Playwright 使用真实 Chromium 访问：

```text
http://10.30.0.22:8787/projects
```

结果：

| 设备 | 视口 | 页面 HTTP | 核心工作区 | 横向溢出 | 页面异常 |
| --- | ---: | ---: | --- | --- | --- |
| 桌面 | 1440×900 | 200 | 不可进入 | 无 | 无 JS pageerror |
| 手机 | 390×844 | 200 | 不可进入 | 无 | 无 JS pageerror |
| 平板 | 768×1024 | 200 | 不可进入 | 无 | 无 JS pageerror |

三个视口看到相同内容：

```text
前后端版本不一致

当前页面与服务器不是同一次构建。为避免使用旧接口修改论文，工作区已暂停加载。

missing-build-metadata
Frontend build 20260722014952-f0ef1484486e-bc4257b6 is not compatible with the running backend.

重新检查

管理员需要重新构建并重启前后端服务，然后再刷新页面。
```

这需要区分两个结论：

- 门禁本身是正确的数据保护行为，`DeploymentGate` 会阻止新前端调用不兼容旧 API 修改论文；
- 对最终用户而言，正式产品仍然完全不可用，HTTP 200 不能被解释为“服务正常”。

源码证据：

- `app/apps/frontend/src/app/components/DeploymentGate.tsx:18-29`：读取 `/api/health` 并检查 build 兼容性；
- `app/apps/frontend/src/app/components/DeploymentGate.tsx:49-56`：不兼容时只显示阻断页；
- `app/apps/frontend/src/api/deploymentHandshake.ts:22-30`：缺少 build metadata、schema 不一致、build ID 不一致都会阻断。

### 3.2 正式后端进程与 API 状态

直接观察：

```text
监听地址：0.0.0.0:8787
PID：575763
启动时间：2026-07-22 02:56:52
工作目录：app/apps/backend
命令：node src/index.js
```

HTTP 结果：

| Endpoint | 匿名请求 | 明显错误 Token | 响应大小/备注 |
| --- | ---: | ---: | --- |
| `/api/health` | 200 | 200 | `{"ok":true,"authRequired":false}` |
| `/api/ready` | 404 | 404 | 正式进程没有当前 readiness 路由 |
| `/api/config` | 200 | 200 | 645 bytes |
| `/api/projects` | 200 | 200 | 762 bytes |
| `/api/providers` | 200 | 200 | 1297 bytes |
| `/api/capabilities` | 503 | 503 | 当前新能力路由未正常工作 |

当前源码已经不是这个行为：

- `app/apps/backend/src/routes/health.js:36-52` 已返回 build metadata 并提供 `/api/ready`；
- `app/apps/backend/src/middleware/auth.js:37-66` 已对非公开 API 实施 fail-closed Bearer Token 保护；
- 没有 Token 时当前源码会对受保护 API 返回 503，而不是匿名返回业务数据。

因此，正式实例明确落后于当前工作区源码。

### 3.3 隔离 Playwright：20 项核心流程全部通过

为了区分“部署问题”和“当前构建问题”，本轮使用仓库已有隔离脚本启动：

- 随机本地端口；
- `/tmp` 临时 `papers` 数据根；
- 随机 Bearer Token；
- 当前工作区后端源码；
- 当前 `dist` 前端构建；
- 测试结束自动删除临时目录。

覆盖范围：

- 项目列表、搜索、打开、删除；
- API 项目创建和列表显示；
- 已有论文目录发现与注册；
- Provider 设置引导；
- Skills readiness；
- RAG 健康、损坏索引显式修复、外部来源状态；
- CLI Task Agent 的快照、Diff、Reject、Accept；
- 手机和平板工作区切换；
- Markdown 与 LaTeX 懒加载预览。

结果：

```text
20 tests
20 passed
0 failed
```

该结果证明：

- 当前 `dist` 与当前后端在同一 build 批次下可以运行；
- 当前核心功能不是“全面坏掉”；
- 正式不可用的首要原因是发布/进程批次不一致；
- E2E 隔离通过仍不能证明真实 Provider 登录、真实 TeX 工具链或正式 LAN 发布可用。

### 3.4 探索式 Playwright：实际创建项目并查看主要界面

本轮在 `/tmp` 隔离数据根实际创建：

```text
显示名称：审计体验项目 2026-07-22
项目 ID：3df97369-dfca-4a6f-9384-f1eb9f4303ac
物理目录：审计体验项目-2026-07-22--3df97369
```

实际写入临时项目：

- `main.tex`
- `paper.md`
- `references.bib`

实际打开并观察：

- 项目列表；
- Settings / Provider 设置；
- 编辑器三栏工作区；
- Skills 管理；
- Provider 与系统能力 API；
- 项目文件树；
- 右侧 Chat、Task、Draw、RAG、Review、Citation、AI 检测、Pipeline 入口。

临时项目和临时服务已在审计后删除。

## 4. 问题优先级总览

| 优先级 | 问题 | 用户影响 | 证据强度 |
| --- | --- | --- | --- |
| P0 | 正式前后端 build 不一致，核心工作区完全不可进入 | 所有正式用户不可用 | 直接证据，高 |
| P0 | 正式旧后端匿名暴露配置、项目、Provider 元数据 | 同网段未授权访问风险 | 直接证据，高 |
| P1 | 发布生命周期没有形成原子、可验证闭环 | 源码通过但正式长期停留旧版本 | 直接证据 + 源码，高 |
| P1 | 项目显示名与物理目录仍不一致 | 用户找不到对应文件夹、脚本和备份易混淆 | Playwright + 源码，高 |
| P1 | Provider“可选”“已安装”“已登录”“可调用”状态混在一起 | 用户选中后才发现不可用 | API + UI，高 |
| P1 | 123 个 Skills 全部 degraded，仍可被选择 | 能选择不等于能可靠执行 | API + 源码，高 |
| P1 | RAG 仍是关键词重叠，缺语义检索和质量基准 | 召回质量受措辞影响 | 源码，高 |
| P1 | `/api/ready` 不代表论文核心能力 ready | 运维容易误判服务可用 | API + 源码，高 |
| P1 | 当前机器无 TeX 引擎、无 OCR/PDF 文本工具 | 编译、PDF 摄取能力不完整 | capability API，高 |
| P2 | 编辑器功能密度高、项目上下文弱 | 新用户学习成本高、容易点错入口 | Playwright + UI 源码，中高 |
| P2 | 全局服务器配置与项目级配置边界不够清楚 | 多项目/LAN 多用户容易互相影响 | 源码 + UI，中 |
| P2 | 隔离 E2E 与正式 LAN 发布验收断开 | 测试全绿但正式仍不可用 | 直接证据，高 |
| P2 | 工作区改动过多、同日审计文档重复 | 难以评审、回滚和判断当前真相 | Git 直接证据，高 |

## 5. P0：正式发布不可用

### 5.1 现象

正式地址对三种设备都只显示版本阻断页，用户无法：

- 查看项目；
- 新建或导入项目；
- 打开编辑器；
- 配置 Provider；
- 使用 Codex/Copilot；
- 管理 Skills；
- 使用 RAG；
- 编译、预览、评审或导出论文。

### 5.2 根因判断

**直接证据：** 正式 `/api/health` 只有 `ok` 和 `authRequired`，缺少当前源码应返回的 build metadata；正式 `/api/ready` 为 404。

**高可信推断：** 正式 PID 在较早时间启动，此后前端 `dist` 已更新，但后端进程没有随同一 build 一起替换，形成“新前端 + 旧后端”。

### 5.3 现有保护的优点

版本门禁避免了更危险的情况：新前端继续调用旧接口写论文，造成协议误解或数据损坏。这个保护应保留。

### 5.4 改进方向

1. 把 build、后端进程替换、端口唯一性、health、ready、鉴权和 Playwright LAN smoke 组成一个发布事务。
2. 发布成功条件不能只是“进程存在”或“HTTP 200”，必须包括：
   - 前端 build ID = 后端 build ID；
   - API schema 匹配；
   - `/api/ready` 为 200；
   - `/projects` 能渲染核心 heading；
   - 浏览器无 `pageerror`；
   - 无 Token/错误 Token/正确 Token 三类鉴权结果符合预期。
3. 阻断页增加可复制诊断信息：前端 build、后端 build、schema、PID/启动时间、服务地址和发布批次。
4. “重新检查”不要只是刷新页面；可以重新请求 health，并明确显示状态是否变化。
5. 发布失败时恢复上一套前后端匹配的构建，不让正式实例长期停留在不可用组合。
6. 为正式 LAN 地址增加独立的发布后 Playwright，不要只运行临时隔离环境。

## 6. P0：正式旧后端匿名暴露业务元数据

### 6.1 现象

匿名请求和明显错误 Bearer Token 请求以下接口都返回 200：

- `/api/config`
- `/api/projects`
- `/api/providers`

前端版本门禁只能阻止普通浏览器 UI 继续加载，不能保护直接 API 请求。

### 6.2 当前源码状态

当前源码已经做了正确方向的保护：

- 非公开 API 需要 Bearer Token；
- 未配置 Token 时 fail-closed 返回 503；
- 无认证返回 401；
- 错误 Token 返回 403；
- WebSocket query token 仅允许在明确的受管端点使用。

但正式进程没有加载这些变化。

### 6.3 改进方向

1. 首先解决部署漂移，让正式实例加载当前鉴权实现。
2. 发布门禁必须实际验证匿名、错误 Token、正确 Token 三种请求。
3. `/api/config` 只返回前端真正需要的脱敏字段。
4. `/api/projects` 永远不应匿名枚举论文项目。
5. `/api/providers` 即使保持公开，也应只返回最低限度的产品能力描述，不暴露机器安装、路径或登录细节。
6. 正式 LAN 服务必须默认生成或要求配置高强度 Token，不应因为“只在内网”而关闭认证。

## 7. P1：项目名称与 `papers` 子目录仍不符合用户直觉

### 7.1 当前行为

`projectLocator` 当前目录规则：

```text
slugified display name + "--" + stable project ID 前 8 位
```

源码：

- `app/apps/backend/src/services/projectLocator.js:23-42`：名称 slug 化并拼接短 ID；
- `app/apps/backend/src/services/projectLocator.js:134-145`：新项目创建时使用该目录名；
- `app/apps/backend/src/services/projectLocator.js:228-274`：项目重命名时物理目录也随之移动；
- `app/apps/backend/src/services/projectLocator.js:158-210`：注册已有目录时保留原目录名；
- `app/apps/frontend/src/app/ProjectPage.tsx:592-634`：UI 可以发现并注册未管理的论文目录。

### 7.2 为什么当前设计有合理性

- 稳定 ID 可以避免同名项目冲突；
- 显示名可以自由修改；
- API 不依赖用户可变名称；
- 旧目录可以原地注册，不强制移动论文；
- UI 已同时显示项目 ID 和存储目录，透明度比旧设计更好。

### 7.3 为什么用户仍会不满意

用户看到“审计体验项目 2026-07-22”，到 `papers` 下却找到：

```text
审计体验项目-2026-07-22--3df97369
```

对用户来说，这仍然是“工程名和文件夹名对不上”。尤其会影响：

- 在终端中手动 `cd`；
- 外部编辑器、Git、备份脚本和同步工具；
- 与同事口头沟通文件夹；
- 迁移旧项目；
- 项目重命名后的外部引用；
- 判断某个 `papers` 子目录是否已经在 UI 注册。

### 7.4 改进方向

1. 新建项目弹窗实时显示“显示名称、实际文件夹、稳定 ID”三个字段。
2. 允许用户选择目录策略：
   - `名称`：目录尽量与显示名完全一致，冲突时提示用户处理；
   - `名称--短ID`：当前安全默认；
   - 自定义 slug：高级用户显式填写。
3. 把“重命名显示名称”和“同时重命名物理目录”拆成两个动作，避免无意移动目录。
4. 项目列表提供“复制完整路径”“在终端打开”“打开所在目录”。
5. 编辑器顶部持续显示项目名称和物理目录，避免进入后丢失身份上下文。
6. 对已有 `papers` 子目录建立清晰状态：未注册、已注册、元数据损坏、ID 冲突。
7. 提供迁移预览和冲突报告，不自动批量重命名历史目录。

## 8. P1：Codex/Copilot 已有实现，但 Provider 可用性表达仍混乱

### 8.1 当前已有能力

Settings 中实际显示五个选项：

- OpenAI-compatible API
- Anthropic API
- Codex CLI
- Claude Code CLI
- GitHub Copilot CLI

CLI Provider 使用固定可执行文件，不允许浏览器传入任意命令路径或参数模板。当前只读 Chat 还设置了较严格的限制：

- Codex 使用 `--sandbox read-only`；
- Claude Code 使用 `--permission-mode dontAsk --tools ''`；
- Copilot 禁止自定义 instructions、禁用工具并禁止自动更新；
- 环境变量采用 allowlist；
- 输出会做 Token/Key 脱敏；
- 支持超时和取消。

源码：`app/apps/backend/src/services/agentProviderRegistry.js:20-81`、`133-170`、`189-269`。

文件修改任务则走单独的 CLI Task Agent：复制基线和隔离工作快照，生成 Diff，用户确认后才应用；隔离 E2E 已验证 Reject 不修改原项目、Accept 才应用。

### 8.2 当前机器的真实能力状态

隔离实例 `/api/capabilities` 显示：

| Provider | 状态 | 说明 |
| --- | --- | --- |
| OpenAI-compatible | available | 仅确认 endpoint/credential 已配置，未做网络请求 |
| Anthropic | available | 仅确认 endpoint/credential 已配置，未做网络请求 |
| Codex CLI | available | 已安装 `codex-cli 0.144.6`，登录状态未检查 |
| Claude Code CLI | unavailable | 固定 CLI 可执行文件未找到 |
| GitHub Copilot CLI | available | 已安装 `GitHub Copilot CLI 1.0.73`，登录状态未检查 |

### 8.3 用户问题

`/api/providers` 返回的是“系统支持哪些 Provider 及其能力”，五个都显示 `available: true`；`/api/capabilities` 才显示机器实际安装状态。Settings 下拉框也把五个 Provider 都作为正常选项展示。

这里至少混合了五种不同语义：

1. 产品代码支持该 Provider；
2. 服务器安装了对应 CLI；
3. CLI 已登录；
4. 模型/网络当前可达；
5. 当前操作需要只读 Chat 还是文件修改 Task Agent。

用户会在“选中并尝试连接”之后才理解这些差异。

### 8.4 改进方向

1. Provider 卡片统一展示五段状态：支持、安装、登录、连通、权限模式。
2. 下拉框中直接显示：
   - `Codex CLI（已安装，登录未验证）`
   - `Claude Code CLI（未安装）`
   - `Copilot CLI（已安装，登录未验证）`
3. 未安装 Provider 不应伪装成普通可用选项；可以保留但禁用，并给出服务器安装说明。
4. 把“只读问答”和“修改论文文件”放在用户任务层解释，不让用户先理解内部架构名词。
5. Provider 测试连接输出结构化结果：可执行文件、版本、认证、模型、网络、耗时、失败原因。
6. 给 Codex/Copilot 增加首次运行向导，并说明凭据在服务器而不是浏览器。
7. 正式发布验收至少执行非付费 probe；真实模型调用作为管理员显式可选测试。

## 9. P1：Skills 有 123 个，但全部处于 degraded

### 9.1 当前事实

隔离实例：

```text
Skills 总数：123
ready：0
degraded：123
unavailable：0
```

种类：

```text
YAML：122
package：1
builtin：122
imported：1
```

多数 Skill 的 `metadataSource` 是 `inferred`，而不是明确 manifest。

### 9.2 当前实现的优点

- 已有 readiness 模型：ready / degraded / unavailable；
- 能检查命令、凭据、网络、文件和 Provider capability；
- 能显示费用等级、副作用、dry-run 和 last-run；
- 不可用 Skill 会被阻止选择；
- dry-run 是只读检查，不会偷偷执行模型任务；
- last-run 状态已经支持持久化，而不是纯内存历史。

源码：

- `app/apps/backend/src/services/skillReadinessService.js:150-295`：推断执行要求并计算 readiness；
- `app/apps/backend/src/services/skillReadinessService.js:302-323`：dry-run 和 last-run 状态；
- `app/apps/frontend/src/app/components/SkillsSelector.tsx:8-19`：只有 unavailable 被禁止选择，degraded 仍可选择。

### 9.3 主要问题

1. 123 个全部 degraded，说明 readiness 体系已经建立，但 Skill 资产还没有完成迁移。
2. “需检查”仍允许直接选择，用户可能理解为“基本可用”。
3. 静态 prerequisites 通过不等于 Prompt 质量、工具调用、输出格式和安全边界通过。
4. 分类很多、数量很大，但缺少面向论文阶段的推荐路径。
5. Skill 描述、能力、费用、副作用和真实运行证据没有形成一个可比较的评分体系。
6. 缺少每个 Skill 的最小输入、预期输出、失败案例和回归样例。

### 9.4 改进方向

1. 逐个补齐显式 manifest：输入、输出、依赖、网络、凭据、副作用、费用、适用 Provider。
2. degraded Skill 默认不加入自动推荐；用户显式展开风险说明后才可启用。
3. 每个核心 Skill 至少提供：
   - 一个成功样例；
   - 一个缺依赖失败样例；
   - 一个格式校验；
   - 一个安全边界测试；
   - 一个质量评测样例。
4. 优先治理高频核心链路，不要同时维护 123 个“看起来都能用”的入口。
5. 按论文工作流组织：选题 → 检索 → 证据 → 大纲 → 写作 → 引用 → 审稿 → 投稿检查。
6. 记录 Skill 实际运行的 Provider、模型、版本、输入摘要、输出摘要、耗时、费用和结果状态。
7. 建立 verified 核心 Skill 白名单，其余保留为实验性目录。

## 10. P1：RAG 透明度提高，但检索能力仍有限

### 10.1 当前实现

本地检索 profile 明确为：

```text
kind: local-keyword-overlap
label: Local keyword evidence retrieval
```

UI 也明确写出：

```text
Transparent token-overlap search; not semantic vector retrieval.
```

源码：

- `app/apps/backend/src/services/paperRagService.js:26-27`；
- `app/apps/frontend/src/app/components/PaperRagPanel.tsx:258-270`。

当前已经具备：

- 文档自动索引；
- index generation 和 fingerprint；
- 索引健康、损坏、空索引、零 chunk 诊断；
- 显式 repair/rebuild；
- 文档行号和分数；
- 外部来源分别显示成功、失败、空结果；
- Crossref / Semantic Scholar 等来源状态；
- 结果来源和 rank 透明度。

### 10.2 当前机器状态

- External retrieval：degraded；
- Crossref 可用但未做网络 probe；
- Semantic Scholar 未配置可选 API Key；
- PDF text / OCR：unavailable；
- `pdftotext`、`ocrmypdf`、`tesseract` 均未发现。

### 10.3 用户影响

1. 同义表达、缩写、跨语言问题容易召回不足。
2. 长文档只靠 token overlap 时，相关段落排序质量有限。
3. PDF 摄取在当前机器上可能无法产生可引用文本 chunk。
4. 外部来源状态是配置级判断，不等于真实网络和 API 当前可用。
5. 用户看到“RAG”容易预期语义向量能力，而实际是透明关键词检索。

### 10.4 改进方向

1. 保留当前关键词检索作为可解释基线，增加可选本地 embedding 与 hybrid retrieval。
2. 默认支持 BM25/关键词 + 向量 + reranker 的可配置组合。
3. 建立固定论文检索评测集：问题、相关 chunk、目标引用、Recall@K、MRR、误引率。
4. 每次索引或检索算法变化都跑质量回归，不只检查 API 200。
5. UI 明确展示当前 retrieval profile，不只显示“RAG”。
6. PDF 上传前先展示机器 OCR/Text 能力；不可用时给出可执行的管理员修复方案。
7. 外部检索区分：已配置、网络可达、认证成功、查询成功、结果为空。
8. 对每条 AI 回答强制保留 evidence chunk、文件、行号、索引 generation 和引用采用状态。

## 11. P1：readiness 语义不足以代表“论文系统可用”

### 11.1 当前现象

隔离实例：

```text
GET /api/ready -> 200
ready: true
checks: dataRoot=true, templates=true
```

同一实例的 capability 状态：

- 所有后端 TeX 引擎 unavailable；
- PDF/OCR unavailable；
- Claude CLI unavailable；
- external retrieval degraded；
- 123 Skills 全部 degraded。

### 11.2 根因

`app/apps/backend/src/routes/health.js:17-30` 的 readiness 只检查：

- 数据根可读写；
- 模板目录有效。

它没有检查论文系统的关键用户能力。

### 11.3 改进方向

1. 保留 liveness：进程是否活着。
2. 保留基础 readiness：数据根和模板是否可用。
3. 新增产品 readiness profile：
   - `workspace-ready`
   - `compile-ready`
   - `rag-ready`
   - `provider-ready`
   - `task-agent-ready`
   - `collaboration-ready`
4. UI 不显示笼统“系统正常”，而显示按功能分组的红黄绿灯。
5. 发布门禁至少要求 workspace-ready；产品功能入口按对应 capability 降级或禁用。
6. 不能因为数据根可写就把缺 TeX、缺 OCR 的论文系统称为 fully ready。

## 12. P1：当前机器缺少论文核心工具链

能力探测结果：

```text
pdflatex: unavailable
xelatex: unavailable
lualatex: unavailable
latexmk: unavailable
tectonic: unavailable
pandoc: available (3.1.11)
pdftotext: unavailable
ocrmypdf: unavailable
tesseract: unavailable
```

这意味着：

- Pandoc 转换可以使用；
- 浏览器内 SwiftLaTeX 预览与后端正式编译不是同一能力；
- 服务端标准 TeX 编译在当前机器上不可用；
- 扫描 PDF、复杂 PDF 证据摄取能力不足。

改进方向：

1. 安装向导必须在首页或设置中显示工具链状态。
2. 提供最小、完整、GPU/科研服务器等安装 profile。
3. 编译按钮在能力不可用时应提前禁用并解释，不要等用户提交后失败。
4. 明确区分：快速浏览器预览、后端正式 PDF 构建、投稿级工具链。
5. 缺包自动安装必须保持默认关闭，只在请求级显式授权后执行。
6. 工具链状态要进入发布验收，不应只写在环境文档里。

## 13. P2：编辑器功能密度高，用户任务路径不清晰

### 13.1 实际首屏

进入临时项目编辑器后，首屏可见：

- 文件树；
- 中央编辑区；
- AI Assistant；
- Chat；
- Task；
- Draw；
- RAG；
- Review；
- Citation；
- AI Writing Detection；
- Pipeline；
- Manage Skills；
- Terminal。

中央区默认只显示“请从项目树中打开文件”。进入编辑器后的主要文字中没有醒目的项目名称和物理目录。

### 13.2 用户问题

1. 新用户不知道第一步应该配置模型、选文件、建对话、选 Skill 还是准备 RAG。
2. Chat、Task、Pipeline、Skill 之间的关系不直观。
3. Review、Citation、AI Detection 都属于质量检查，但分散成独立入口。
4. Terminal 是高风险能力，却以右下角小按钮长期存在。
5. 项目身份在编辑器中弱化，多个标签页或相似项目容易混淆。
6. 手机/平板 E2E 证明能切换视图，但没有证明长文档、软键盘、复杂 Diff 和大文件树的实际效率。

### 13.3 改进方向

1. 增加项目级 onboarding checklist：
   - 选择主文件；
   - 检查编译能力；
   - 配置 Provider；
   - 准备证据库；
   - 创建首个任务。
2. 以用户任务分组导航：写作、证据、质量、自动化、高级工具。
3. 编辑器顶部固定显示项目名称、目录、主文件、编译状态和 Provider 状态。
4. Chat 明确标注“只读建议”；Task 明确标注“可修改文件，需审查 Diff”。
5. Terminal 移入“高级工具”，首次打开增加风险说明。
6. 空白中央区给出可操作的最近文件、主文件、快速开始，而不只是提示用户去点文件树。
7. 为不同角色提供简化模式：论文作者模式、管理员模式、开发者模式。

## 14. P2：全局配置边界不够清楚

Settings 中可以修改 Provider、API endpoint、API Key、模型等。后端通过 `.env` 持久化服务器级配置，而不是项目级配置。

这对单机单用户是合理的，但正式服务绑定 `0.0.0.0` 并通过 LAN 使用后，会出现新的用户认知问题：

- 一个用户保存 Provider 配置，可能影响其他项目和其他浏览器用户；
- 用户可能误以为配置只属于当前项目；
- “服务器访问 Token”和“模型 API Key”虽已有说明，仍需要持续强化；
- CLI 登录属于服务器账户，不属于当前浏览器用户。

改进方向：

1. Settings 明确标注“服务器全局配置”而不是泛称“设置”。
2. 项目级模型偏好与服务器级凭据分离。
3. 多用户部署时引入用户/工作区隔离，或明确声明只支持可信单用户 LAN。
4. 每次全局配置变更记录操作者、时间、字段和前后状态摘要，不记录密钥明文。
5. 保存前明确提示影响范围。

## 15. P2：测试通过与正式可用之间仍有断层

本轮质量结果：

```text
TypeScript typecheck：通过
单元测试：78 files / 438 tests 全部通过
隔离 Playwright：20 / 20 全部通过
npm audit --omit=dev：0 vulnerabilities
正式 LAN Playwright：核心工作区不可进入
```

这组结果说明测试本身不是无价值，而是缺少最后一公里：

- 单元测试保护逻辑；
- 隔离 E2E 保护同批次构建；
- 没有门禁保证正式运行进程已经切到该批次。

改进方向：

1. CI 阶段：typecheck、unit、build、isolated E2E。
2. 发布阶段：构建 ID 记录、进程替换、唯一端口、health、ready。
3. 发布后：对正式 LAN 地址运行只读 Playwright smoke。
4. smoke 至少验证：
   - 登录/Token 引导；
   - 项目列表 heading；
   - 打开一个专用 smoke 项目；
   - 无 pageerror；
   - build/schema 匹配；
   - 鉴权三态；
   - 关键 capability 状态可读。
5. 任何一步失败都应回滚或标记发布失败，而不是留下 HTTP 200 的不可用服务。

## 16. P2：仓库状态与文档治理混乱

本轮 Git 快照：

```text
git status 条目：218
已跟踪状态：110
未跟踪：108
tracked diff：110 files changed
新增：8372 lines
删除：7232 lines
```

同时存在多份同日审计文档，分别记录了不同时间的：

- 版本门禁；
- 前端空白页；
- E2E 失败；
- E2E 通过；
- 不同 build ID；
- 不同单元测试数量。

这些文档可能在各自时间点都正确，但缺少“当前有效、历史失效、已被后续证据覆盖”的生命周期标记。

用户和维护者风险：

- 难以确认哪份报告是最新事实；
- 并行修改之间可能互相覆盖；
- 很难做小范围 review；
- 回滚范围不清晰；
- 测试数字和功能声明容易过期；
- 文档写“已完成”但正式部署仍未完成。

改进方向：

1. 设一个唯一 canonical 状态页，其他审计作为历史附件。
2. 每份报告标注：审计时间、Git SHA、worktree dirty 状态、build ID、正式 PID。
3. 被新证据覆盖的报告顶部加 `Superseded by ...`。
4. 大改动拆成独立 commit/PR：安全、项目身份、Provider、Skills、RAG、前端性能、发布运维。
5. 减少同时修改同一批核心文件的并行代理数量。
6. 清理未跟踪临时产物和重复报告前先人工确认，不做自动删除。

## 17. 已经明显改善、不要重复建设的部分

以下能力在当前源码中已经有实质实现，后续不应再按“完全不存在”设计：

### 17.1 CLI Provider

- Codex CLI、Claude Code CLI、GitHub Copilot CLI 已注册；
- 有固定命令、环境 allowlist、输出脱敏、超时和取消；
- Chat 默认只读。

### 17.2 可修改文件的 CLI Task Agent

- 快照隔离；
- 基线 fingerprint；
- 文件 Diff；
- Accept/Reject；
- 原项目漂移检查；
- 回滚目录；
- 任务持久化；
- E2E 已覆盖接受和拒绝。

### 17.3 项目身份

- 显示名称、稳定 ID、物理目录已经分开；
- UI 显示 ID 和目录；
- 支持注册已有 `papers` 目录且不移动原文件；
- 目录和 ID 有安全校验。

### 17.4 RAG 可观测性

- index health；
- generation/fingerprint；
- 失败文件和 zero-chunk；
- 显式修复；
- 外部来源逐来源状态。

### 17.5 安全边界

- 当前源码业务 API 默认 Token 保护；
- Settings 密钥脱敏；
- CLI 命令固定；
- 缺包自动安装已改为默认关闭、请求级显式授权；
- Task Agent 在隔离快照中修改并要求人工确认。

这些能力的主要剩余任务是：部署到正式实例、统一状态语义、补齐成熟度、改善用户引导和建立真实发布验收。

## 18. 建议的改进顺序

### 第一阶段：恢复正式可用并封住安全缺口

1. 以原子流程发布当前前后端同一 build。
2. 验证正式 `/api/health` build metadata 和 `/api/ready`。
3. 验证无 Token 401/503、错误 Token 403、正确 Token 200。
4. 对 `http://10.30.0.22:8787/projects` 跑真实 LAN Playwright。
5. 确认旧 PID、旧 supervisor、旧端口没有残留。

### 第二阶段：让系统能力对用户诚实可见

1. 统一 Provider metadata 与机器 capability 状态。
2. 首页/设置显示 TeX、OCR、Provider、RAG、Skills 红黄绿灯。
3. 将 `/api/ready` 拆成产品能力 readiness。
4. 不可用功能提前禁用并给出修复路径。

### 第三阶段：解决项目身份和核心工作流体验

1. 新建项目时显示/选择目录名策略。
2. 拆分显示名重命名与目录移动。
3. 编辑器顶部固定项目身份和主文件。
4. 增加首次使用 checklist 和任务式导航。

### 第四阶段：治理 Skills 与 RAG 成熟度

1. 优先把核心 Skills 从 degraded 提升到 verified ready。
2. 建立 Skill manifest、回归样例和运行 provenance。
3. 增加 hybrid/semantic RAG，但保留关键词透明基线。
4. 建立检索质量评测集和引用正确性指标。
5. 补齐 PDF text/OCR 工具链。

### 第五阶段：稳定仓库交付

1. 冻结并拆分当前大规模工作区改动。
2. 建立唯一 canonical 状态页。
3. 清理重复/过期报告并标注 superseded，不直接删除历史证据。
4. 建立 CI → 发布 → 正式 LAN smoke → 回滚的完整流水线。

## 19. 建议验收指标

### 正式可用性

- `/projects` 桌面、手机、平板均可进入；
- 前后端 build ID、API schema 一致；
- 正式浏览器无 `pageerror`；
- 发布后 smoke 100% 通过。

### 安全

- 匿名业务 API 0 个返回业务数据；
- 错误 Token 100% 拒绝；
- CLI Provider 仅固定命令；
- 文件修改任务 100% 经过 Diff 与确认；
- 缺包安装默认 0 次隐式执行。

### 项目身份

- 新建前 100% 显示最终物理目录；
- 项目列表和编辑器都可复制目录；
- 显示名修改默认不移动目录，除非用户显式选择；
- 已有目录注册不移动文件。

### Provider

- 支持/安装/登录/连通/权限五种状态独立显示；
- 不可用 Provider 不被标成可用；
- Chat 与 Task Agent 权限差异在首次使用前可见。

### Skills

- 核心 Skill ready 比例达到明确目标；
- degraded Skill 不参与默认自动推荐；
- 每个核心 Skill 有成功、失败、安全和质量回归样例。

### RAG

- 固定评测集上记录 Recall@K、MRR、引用命中率和误引率；
- 每个答案可追溯到文件、行号、chunk、index generation；
- PDF 上传前可见 OCR/Text 能力；
- 外部来源逐来源显示配置、网络、认证、查询和结果状态。

## 20. 未知项与本轮限制

以下内容仍是未知，不能从本轮结果中推断为可用：

1. 正式部署当前真实 Token 是否已配置在其他 supervisor 环境；正式 API 行为显示没有生效。
2. Codex CLI 和 Copilot CLI 是否已经登录并具有模型访问权；本轮只确认安装，未调用模型。
3. Claude Code CLI 在目标正式环境是否计划安装；当前隔离能力探测为未安装。
4. OpenAI-compatible 和 Anthropic endpoint 是否真实可达；本轮没有发出付费或模型请求。
5. 大型 LaTeX 工程、复杂宏包、BibTeX/Biber、中文字体和投稿模板的真实编译表现；当前机器无后端 TeX 引擎。
6. 扫描 PDF、复杂双栏 PDF、公式和表格 OCR 质量；当前机器无 OCR 工具。
7. 多用户并发编辑、协作 Token、断线恢复和冲突合并的长期稳定性。
8. 数百/数千文件项目的文件树、索引、预览和 Task Agent 快照性能。
9. CLI Task Agent 长期任务存储的容量、清理、配额和隐私保留策略。
10. 正式 LAN 弱网、断网和跨设备刷新后的会话恢复体验。

## 21. 最终判断

当前仓库已经完成了不少关键基础建设，尤其是：CLI Provider、隔离 Task Agent、项目稳定身份、RAG 健康诊断、Skills readiness、鉴权和 build 门禁。这些能力证明项目正在从功能原型向可治理系统演进。

但用户现在面对的正式现实仍然是：

```text
正式页面不可进入
正式旧 API 未保护
项目名与目录仍不完全一致
Provider 状态语义不统一
Skills 全部 degraded
RAG 仍是关键词检索
TeX/OCR 核心工具链缺失
测试与正式发布没有闭环
工作区和审计文档高度混杂
```

因此，下一步不应该继续盲目增加更多入口。最优先的是把已经实现的能力用同一 build 安全发布，让正式实例通过真实 LAN Playwright；随后统一项目身份、Provider/能力状态、Skills readiness 和 RAG 质量语义。只有这些基础闭环稳定后，新增更多 Skills、更多 Agent 或更多面板才会真正提升用户价值。
