# Paper Writing 当前仓库问题审计与优化建议

- 报告时间：2026-07-22 05:28:30（Asia/Shanghai）
- 仓库：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting`
- 正式访问地址：`http://10.30.0.22:8787`
- 审计目标：从真实使用者角度发现当前仓库在安装、启动、项目管理、LLM/CLI Provider、Skills、RAG、论文工作流、移动端、发布与维护方面的问题
- 审计方式：Playwright 实际操作、HTTP/API 只读探测、源码与测试审阅、构建产物检查、依赖审计、Git 工作区检查
- 变更边界：本轮不修改业务代码、不重启正式服务、不修改正式配置、不修改正式论文数据；唯一新增内容为本审计文档
- 数据保护校验：`papers/paper-agent-spe/project.json` 既有 diff 的 SHA-256 仍为 `afc5752ebb84e46894383ea77f151c700f973acea56858ffb696a6f48e63305e`

## 1. 结论先行

当前仓库已经不是一个简单的论文聊天 Demo，而是一个覆盖范围较广的论文工作台。项目管理、论文编辑、对话、HTTP LLM、Codex/Claude/Copilot CLI Provider、Skills、RAG、绘图、评审、引用核验、AI 写作检测、流水线、模板、编译和系统能力诊断都已经有实现。

但是，从真实使用者角度，当前仍不能被判断为“稳定可交付”。最关键的原因不是功能数量不足，而是以下四类问题同时存在：

1. **正式部署不可用**：正式前端已经更新，正式后端仍是旧版本，版本门禁导致桌面、手机和平板用户都只能看到阻断页，无法进入项目和编辑器。
2. **源码中的部分新能力仍未闭环**：CLI Provider 目前只是安全的只读 Chat，不是能完成论文修改并生成可审查 Diff 的任务 Agent；Skills 就绪度当前存在把未知能力误报为 `ready` 的真实缺陷；RAG 仍主要是词项重叠检索。
3. **产品状态与文档状态不一致**：整改状态文档声称正式服务和 LAN Playwright 已通过，但当前正式 API 和 Playwright 结果直接否定了这些陈述。
4. **工程收口不足**：当前有 160 条 Git 状态记录、96 个已跟踪文件发生修改、多个大型模块、两个超过 500 KiB 的懒加载 chunk、7 个依赖漏洞告警和被跟踪的 `.bak` 文件，增加了回归、审查与发布归因风险。

总体判断如下：

| 维度 | 当前判断 |
| --- | --- |
| 功能覆盖 | 较高 |
| 当前正式服务可用性 | 不可用，版本门禁阻断所有核心页面 |
| 当前源码基础主路径 | 可运行，隔离 Playwright 16/16 通过 |
| 正式服务安全性 | 低，旧后端仍匿名暴露配置和项目信息 |
| 项目身份与目录可理解性 | 当前源码已明显改善，正式实例尚不可见 |
| CLI Agent 完整度 | 低，只读 Chat，不具备任务修改闭环 |
| Skills 成熟度 | 中低，目录丰富，但就绪度存在错误判断且运行记录不完整 |
| RAG 成熟度 | 中低，可靠性有所加强，但检索质量和健康状态不够透明 |
| 国际化与离线可用性 | 中等，核心中文化改善，但设置页等仍混用英文并依赖 Google Fonts |
| 测试状态 | 核心隔离 E2E 通过，但 Skills 路由回归仍有 1 项失败 |
| 仓库可维护性 | 中低，改动规模和核心文件体积过大 |
| 建议发布状态 | 暂不对外承诺稳定可用 |

## 2. 证据边界

本文将结论分成三类：

- **直接证据**：Playwright 实际页面、HTTP 响应、测试输出、源码或构建产物直接显示的事实。
- **推断**：由多个直接证据共同支持，但尚未用破坏性测试、真实付费模型或生产网络条件完全证明的结论。
- **未知项**：当前仓库与安全的只读验证无法回答，需要后续专门验收。

本轮没有调用真实付费模型，没有让 Codex、Claude Code 或 Copilot 修改论文，没有执行 Skills 中可能有副作用的脚本，也没有对正式论文数据进行创建、重命名、删除或重建索引。

## 3. Playwright 与 API 实测结果

### 3.1 正式 LAN 实例：三个视口均被版本门禁阻断

**证据类型：Playwright 直接证据。置信度：高。**

Playwright 实际访问：

```text
http://10.30.0.22:8787/projects
```

测试视口：

| 设备 | 视口 | HTTP | 页面结果 | 横向溢出 |
| --- | ---: | ---: | --- | ---: |
| 桌面 | 1440×900 | 200 | 仅显示版本不一致阻断页 | 无 |
| 手机 | 390×844 | 200 | 仅显示版本不一致阻断页 | 无 |
| 平板 | 768×1024 | 200 | 仅显示版本不一致阻断页 | 无 |

三个视口实际看到的核心内容一致：

```text
前后端版本不一致
当前页面与服务器不是同一次构建。为避免使用旧接口修改论文，工作区已暂停加载。
missing-build-metadata
Frontend build 20260721211250-f0ef1484486e-5dbb6214 is not compatible with the running backend.
重新检查
管理员需要重新构建并重启前后端服务，然后再刷新页面。
```

这说明版本门禁本身在正确保护论文数据，但正式产品当前处于 P0 不可用状态：HTTP 返回 200 并不代表用户能使用系统。

### 3.2 正式 API：旧后端仍在运行

**证据类型：HTTP 与进程直接证据。置信度：高。**

```text
GET http://127.0.0.1:8787/api/health
200 {"ok":true,"authRequired":false}

GET http://127.0.0.1:8787/api/ready
404 {"error":"Not Found"}
```

当前源码的 health 路由会返回 build ID、版本、构建时间、后端启动时间和 API schema，且实现了 `/api/ready`：

- `app/apps/backend/src/routes/health.js:16-47`

正式响应没有这些字段，说明正式进程没有运行当前源码版本。

监听信息：

```text
0.0.0.0:8787
PID 575763
node src/index.js
cwd: app/apps/backend
启动时间：2026-07-22 02:56:52
```

### 3.3 正式旧后端仍匿名暴露配置与项目列表

**证据类型：HTTP 直接证据。置信度：高。**

未提供 Bearer Token 时：

```text
GET /api/config   -> 200
GET /api/projects -> 200
```

匿名 `/api/config` 返回了以下部署元数据：

- 内网 LLM endpoint；
- 当前模型名；
- CA 证书绝对路径；
- 正式论文数据根绝对路径；
- Draw endpoint；
- API Key 是否已配置。

匿名 `/api/projects` 返回了正式项目的 ID、显示名、实际目录名、回收站状态和时间信息。

当前源码已经改成非公开 API default-deny，但正式服务仍运行旧逻辑。因此这是“源码已修、部署未生效”的安全问题，而不是可以等待普通页面刷新解决的问题。

### 3.4 当前源码隔离实例：核心主路径可用

**证据类型：隔离 Playwright 直接证据。置信度：高。**

本轮使用仓库提供的隔离 runner：

- 随机本机端口；
- 随机独立 Token；
- `/tmp` 下的临时论文数据根；
- 结束后自动停止后端并删除临时数据。

实际运行 16 项 Playwright 测试，结果为 `16 passed`，覆盖：

- 前后端 build ID 不一致时 fail-closed；
- 系统能力诊断；
- 手机项目列表与编辑器；
- 平板项目列表与编辑器；
- 主编辑区和助手面板中文化；
- 发现并注册已有论文目录；
- 项目列表加载、分类和搜索；
- 项目创建、打开和删除；
- health、config 和 projects API。

由此可以确认：当前工作区源码并非整体不可运行。正式用户无法使用的主要直接原因是正式部署版本漂移。

### 3.5 手工 Playwright 使用当前源码

**证据类型：Playwright 直接证据。置信度：高。**

在另一个临时数据根中，手工创建项目 `用户审计临时工程`，后端返回：

```json
{
  "name": "用户审计临时工程",
  "directoryName": "用户审计临时工程--485b10e1"
}
```

项目页同时显示：

```text
用户审计临时工程
项目 ID: 485b10e1-4ef6-428a-a974-35f928ac923a
存储目录: 用户审计临时工程--485b10e1
```

这说明用户之前指出的“看到的工程名和 `papers` 子目录完全对不上、无法理解对应关系”在当前源码中已经得到实质改善：显示名、稳定 ID 和物理目录被明确拆分并同时展示。

但设置页仍实际出现大量英文：

```text
SERVER ACCESS TOKEN
Apply
Stored only for this browser tab session; never written to localStorage.
PROVIDER
API BASE URL
API KEY
Load models
Test connection
```

编辑器空项目首屏仍显示：

```text
>_ Basic Light
```

在手工页面和正式页面中，Google Fonts 请求均失败并产生控制台错误。

## 4. 问题优先级总表

| 优先级 | 问题 | 证据类型 | 置信度 |
| --- | --- | --- | --- |
| P0 | 正式前后端版本不一致，所有核心页面被门禁阻断 | Playwright/API | 高 |
| P0 | 正式旧后端仍匿名暴露配置和项目元数据 | API | 高 |
| P0 | 整改状态文档声称正式验收通过，与当前事实相反 | 文档/API/Playwright | 高 |
| P1 | Skills 就绪度把未声明元数据的 123 个 Skill 全部误报为 ready | 测试/运行时/源码 | 高 |
| P1 | Codex/Claude/Copilot 只是只读 Chat，不是可修改论文的 Task Agent | 源码 | 高 |
| P1 | RAG 检索仍主要依赖关键词/二元中文词项重叠 | 源码 | 高 |
| P1 | RAG UI 缺少完整索引健康、generation/fingerprint 和逐文件诊断 | 源码/UI | 高 |
| P1 | 首次启动 Token 与 Provider 配置缺少真正的一步式引导 | Playwright/源码 | 高 |
| P1 | `/api/ready` 只检查数据根和模板，不能代表整套系统可工作 | 源码 | 高 |
| P1 | HTTP Provider DNS 校验与实际 socket 连接未绑定，仍需 DNS rebinding 评估 | 源码推断 | 中 |
| P2 | 设置、Pipeline、Draw、终端主题等仍存在中英文混用 | Playwright/源码 | 高 |
| P2 | Google Fonts 外部依赖在无外网环境持续报错 | Playwright/源码 | 高 |
| P2 | 当前依赖审计有 2 moderate、3 high、2 critical，共 7 项 | `npm audit` | 高 |
| P2 | 两个懒加载 chunk 超过 500 KiB | 构建产物 | 高 |
| P2 | 多个核心模块体积过大，修改影响面难以控制 | 文件统计 | 高 |
| P2 | 工作区有 160 条状态记录，文档、源码、测试和部署难以一一对应 | Git | 高 |
| P2 | 跟踪 `.bak`、dist 和测试状态文件增加审查噪声 | Git | 高 |
| P3 | 项目身份虽已透明，但“显示名、稳定 ID、目录名”仍需要更清楚的用户解释 | Playwright/产品推断 | 中高 |

## 5. P0：正式部署与真实产品状态

### 5.1 发布过程没有形成原子闭环

当前前端 build 为：

```text
20260721211250-f0ef1484486e-5dbb6214
```

正式后端不返回 build metadata。前端和后端显然来自不同交付批次。

用户影响：

- 无法查看项目列表；
- 无法进入编辑器；
- 无法配置 Provider；
- 无法使用 RAG、Skills、编译、评审或绘图；
- “重新检查”只重复探测，不会修复服务器；
- 用户看到的是技术错误码，不知道服务负责人或恢复时间。

优化方向：

1. 把“构建前端、确认后端源码、停止旧进程、启动新进程、验证唯一监听、比对 build/schema、跑 LAN Playwright”作为一个发布事务。
2. 发布记录必须保存前端 build ID、后端 build ID、API schema、PID、启动命令、监听地址、时间和验收结果。
3. 部署失败时不得把“代码已完成”写成“正式已完成”。
4. 版本阻断页应增加后端探测结果、服务器地址、前端 build、后端 build、管理员诊断 ID和明确的用户动作。
5. 正式验收至少覆盖桌面、手机和平板的 `/projects` 与一个真实编辑器路径。

建议验收标准：

- `/api/health` 返回 build metadata 且与前端一致；
- `/api/ready` 返回 200；
- 未认证访问受保护 API 返回 401/503，而不是业务数据；
- 三种视口可以进入项目页和编辑器；
- 不再出现 `missing-build-metadata`；
- `0.0.0.0:8787` 只有一个、且属于当前仓库当前构建的监听进程。

### 5.2 状态文档已失去可信度

`docs/repository_audit_remediation_status_2026-07-22.md:73-75` 声称：

- 正式服务已完成重启；
- `/api/capabilities` 和命令执行已 fail-closed；
- LAN Playwright 已通过；
- 设置页可以显示 5 个 Provider。

当前直接证据却是：

- `/api/ready` 404；
- `/api/health` 没有 build metadata；
- `authRequired:false`；
- `/api/config` 和 `/api/projects` 可匿名读取；
- Playwright 只能看到版本阻断页。

这类文档漂移会让维护者误以为问题已经上线解决，导致重复排查、错误发布判断和安全风险漏报。

优化方向：状态文档必须把状态拆成四列：`源码实现`、`自动化通过`、`已部署`、`正式环境验收`。任何一列都不能替代下一列。

## 6. 项目显示名、稳定 ID 与磁盘目录

### 6.1 原问题在当前源码中已明显改善

**证据类型：源码与 Playwright 直接证据。置信度：高。**

当前目录命名规则为：

```text
<安全化后的项目显示名>--<稳定 ID 前 8 位>
```

代码位置：

- `app/apps/backend/src/services/projectLocator.js:35-42`
- `app/apps/backend/src/services/projectLocator.js:134-145`

项目页明确展示项目 ID 和存储目录：

- `app/apps/frontend/src/app/ProjectPage.tsx:672-682`

没有 `project.json` 的已有论文目录会进入“发现的论文目录”，用户可以确认注册，原目录和论文文件不会移动：

- `app/apps/frontend/src/app/ProjectPage.tsx:578-617`
- `app/apps/backend/src/routes/projects.js:149-183`

### 6.2 仍然存在的用户理解成本

虽然当前源码解决了“完全看不出对应关系”的问题，但系统仍同时存在三个身份：

- 项目显示名：用户可读、可重命名；
- 项目 ID：稳定 API 身份；
- 存储目录：物理文件夹名。

这种设计在工程上合理，但对非开发者仍有认知成本。尤其在用户直接进入 `/data01/home/xuzk/papers` 操作文件、复制项目、迁移目录或排查同步问题时，仍可能不知道哪个字段可以改、哪个字段不可改。

优化方向：

1. 在项目详情或帮助提示中明确解释三者职责。
2. 重命名操作前明确提示“显示名与磁盘目录是否一起变化”。
3. 提供“在文件浏览器中定位”“复制实际路径”“复制稳定 ID”。
4. 对旧 UUID 目录、导入目录和新 `name--shortId` 目录显示来源标签。
5. 增加项目身份诊断：metadata ID、当前目录、主文件和注册状态是否一致。

## 7. LLM Provider 与 Codex/Copilot/Claude CLI

### 7.1 用户提出的 CLI Provider 选项已进入当前源码

**证据类型：源码与 Playwright 直接证据。置信度：高。**

设置页已经提供：

- OpenAI-compatible API；
- Anthropic API；
- Codex CLI；
- Claude Code CLI；
- GitHub Copilot CLI。

代码位置：

- `app/apps/frontend/src/app/components/SettingsModal.tsx:9-60`
- `app/apps/backend/src/services/agentProviderRegistry.js:20-61`

因此，“只能通过 API 配置 LLM，完全没有 Codex/Copilot 选项”已经不再符合当前源码事实。

### 7.2 但 CLI 目前只是只读 Chat，不是任务 Agent

**证据类型：源码直接证据。置信度：高。**

当前 Codex 命令强制：

```text
--ephemeral --sandbox read-only
```

Claude Code 使用：

```text
--permission-mode dontAsk --tools ''
```

Copilot 使用：

```text
--available-tools '' --no-ask-user
```

CLI capability 明确声明：

```json
{
  "stream": false,
  "toolCalling": false
}
```

证据位置：

- `app/apps/backend/src/services/agentProviderRegistry.js:20-71`
- `app/apps/backend/src/services/agentProviderRegistry.js:327-355`

这是一条合理的安全边界，但它意味着用户选择 Codex、Claude Code 或 Copilot 后，得到的仍然只是“让 CLI 生成一段文本回复”，而不是“让 Agent 读取论文、修改文件、运行检查并提交一组可审查变更”。

优化方向：不要直接把现有 Chat 改成可写。应新增独立的 CLI Task Agent 工作流：

```text
选择任务
→ 创建隔离项目快照
→ CLI 只在快照中写入
→ 展示修改文件、Diff、命令与 Provider provenance
→ 等待用户 Accept / Reject
→ Accept 时原子应用
→ Reject 时保证正式项目字节不变
→ 保存任务历史、取消原因与恢复信息
```

必须具备：

- 明确的读写范围；
- 超时与进程树终止；
- 命令、网络和成本提示；
- Diff 审查；
- Accept/Reject；
- 原子应用与回滚；
- 操作审计；
- 禁止把 Chat 对话中的普通发送按钮偷偷升级成文件写入。

### 7.3 Provider 配置仍缺少新手闭环

设置页有 Token、Provider、模型、连接测试和保存功能，但首次打开产品时，用户仍需要先理解：

- 什么是服务器访问 Token；
- 它与 LLM API Key 有何区别；
- Token 从哪里获取；
- CLI Provider 依赖哪个本机可执行程序；
- CLI 是否已登录；
- API Provider 和 CLI Provider 的权限、速度、费用和数据边界有何不同。

Playwright 实际页面仍以字段表单为主，且关键提示是英文。

优化方向：首次启动提供向导：

1. 检测服务器鉴权状态；
2. 输入并验证 Server Token；
3. 选择 API 或本地 CLI；
4. 自动探测安装和登录状态；
5. 解释只读 Chat 与可写 Task Agent 的区别；
6. 做一次不收费或明确告知成本的连接测试；
7. 显示“现在可以完成哪些任务”。

## 8. Skills 系统

### 8.1 当前存在真实的“假 ready”缺陷

**证据类型：测试、运行时和源码直接证据。置信度：高。**

聚焦测试结果：

```text
Vitest: 4 files, 26 tests passed
Node route tests: 5 tests, 4 passed, 1 failed
```

失败用例：

```text
Skill routes expose conservative readiness and a read-only dry-run
Expected: degraded
Actual:   ready
```

运行时统计：

```json
{
  "total": 123,
  "counts": { "ready": 123 },
  "metadata": { "manifest": 123 }
}
```

这不是可信的就绪结果。大量旧 YAML Skill 并没有显式声明命令、凭证、网络、文件、副作用和成本，但系统把它们全部识别为拥有 manifest 级执行元数据。

根因证据：

- `skillEngine` 无条件把 `requirements`、`sideEffects`、`costClass` 属性写入 UI 对象，即使值是 `undefined`：`app/apps/backend/src/services/skillEngine.js:1173-1175`。
- `normalizeSkillExecutionProfile` 使用 `hasOwnProperty` 判断元数据是否存在：`app/apps/backend/src/services/skillReadinessService.js:52-59`。
- 因此，仅仅“拥有一个值为 undefined 的属性”也会被误认为已经声明执行元数据。

用户影响：

- 用户看到 `ready` 会误以为 Skill 可直接运行；
- 实际可能缺命令、凭证、项目文件或网络；
- 推荐系统可能把不可运行 Skill 当作首选；
- “就绪检查”失去可信度；
- 后续失败会被用户误解为模型问题或系统随机故障。

### 8.2 dry-run 和 lastRun 仍不完整

当前 dry-run 只检查：

- 命令是否存在；
- 凭证是否配置；
- Provider 是否有基础能力；
- 网络和文件是否标记为已验证。

它不会运行脚本、访问网络或调用模型，这一点是安全的。但它也意味着 dry-run 只能被称为“静态就绪检查”，不能证明 Skill 真能完成任务。

`lastRun` 当前是进程内 Map：

- 后端重启后丢失；
- `run-tests` 会记录 package test；
- 真实 LLM Skill 调用没有统一进入该记录路径。

证据位置：

- `app/apps/backend/src/services/skillReadinessService.js:137-219`
- `app/apps/backend/src/routes/skills.js:180-203`

优化方向：

1. 未显式声明执行元数据的 Skill 默认必须是 `degraded`，不能是 `ready`。
2. schema 应至少包含 commands、credentials、network、files、providerCapabilities、sideEffects、costClass。
3. 区分 `static check`、`safe probe`、`real execution`，不要都叫 dry-run。
4. 推荐结果保留语义最佳项，但要显示 blocked 原因并提供可运行备选项。
5. `lastRun` 应记录真实 Skill 执行，而不仅是 package tests。
6. 运行记录应持久化，并包含版本、输入摘要、Provider、模型、耗时、成本、产物、错误和副作用。
7. 导入 Skill 前应展示来源、license、脚本、网络目标、凭证需求和文件写入范围。
8. 用户应能筛选“已就绪”“仅本地”“需要网络”“会修改文件”“可能付费”。

建议验收标准：

- 缺少元数据的旧 Skill 显示 `degraded`；
- 缺必需命令的 Skill 显示 `unavailable` 且不可激活；
- 静态检查不调用模型、不联网、不执行脚本；
- 真实执行后 `lastRun` 可在刷新和重启后查询；
- 推荐结果不会把 unavailable Skill 伪装成可一键运行。

## 9. RAG 系统

### 9.1 当前检索本质是本地关键词重叠

**证据类型：源码直接证据。置信度：高。**

当前索引保存文档和 chunks：

- `app/apps/backend/src/services/paperRagService.js:429-487`

检索过程：

1. 对 query 分词；
2. 对每个 chunk 计算词项重叠；
3. 过滤 score 为 0 的 chunk；
4. 按 score 排序并截断。

代码位置：

- `app/apps/backend/src/services/paperRagService.js:490-514`
- `app/apps/backend/src/services/paperRagService.js:1868-1897`

评分核心是：

```text
overlap + overlap / sqrt(chunk token count)
```

中文通过连续二元字切分。当前没有语义 embedding、BM25、跨编码同义词处理、reranker 或基于论文结构的字段加权。

这并不代表该功能毫无价值。它可以作为透明、低成本、本地优先的关键词证据检索。但 UI 和文档不应让用户误以为它已经是高质量语义 RAG。

### 9.2 RAG 健康信息仍不足

当前索引包含：

- `version: 1`；
- `indexedAt`；
- documents；
- chunks。

当前 UI 主要展示文档数量、文件名、大小、检索片段、score 和行号：

- `app/apps/frontend/src/app/components/PaperRagPanel.tsx:205-279`

仍缺少一个面向用户的完整健康面板：

- 当前索引 generation；
- corpus fingerprint；
- 最近一次成功索引时间；
- 索引是否过期；
- 总文件数、成功文件数、失败文件数、总 chunk 数；
- 每个文件的 parser、抽取字符数、chunks、warning 和 error；
- healthy/degraded/corrupt/rebuilding；
- 当前查询使用的是哪个索引版本；
- 搜索是关键词模式还是语义模式。

虽然源码已经加入原子写入、损坏隔离和部分恢复逻辑，但这些可靠性能力没有完全转化成用户可理解的产品状态。

### 9.3 不应直接跳到向量数据库

在没有评测集之前直接引入 embedding 或向量数据库，无法证明复杂度和成本带来了质量提升。

建议先建立小型固定评测集：

- 20～50 篇代表性论文；
- 中英文问题；
- 同义改写；
- 引用定位；
- 跨章节证据；
- 数字、表格和结论问题；
- 无答案问题。

指标至少包括：Recall@K、MRR、证据行准确率、无答案拒答、延迟、索引时间和成本。然后按评测结果比较：

1. 当前词项重叠；
2. BM25；
3. 混合检索；
4. embedding；
5. reranking。

优化顺序应是“先让健康状态透明，再建立质量基线，再决定是否增加语义检索”。

## 10. 系统 readiness 与能力诊断

### 10.1 `/api/ready` 的定义过窄

**证据类型：源码直接证据。置信度：高。**

当前 readiness 只检查：

- 数据根可读写；
- 模板 manifest 可访问。

代码位置：

- `app/apps/backend/src/routes/health.js:16-26`

因此，即使下面全部不可用，`/api/ready` 仍可能返回 200：

- 当前 Provider 不可用；
- 编译器不可用；
- PDF/OCR 工具不可用；
- RAG 索引损坏；
- Skills 全部不可运行；
- CLI 未安装或未登录；
- 前后端 build 不一致。

优化方向：

- 保留轻量 `liveness`；
- 将 `readiness` 定义为服务基础依赖；
- 将可选能力放到 `/api/capabilities`；
- 前端展示“系统可进入”和“某项能力可执行”的差别；
- 发布验收同时检查 health、ready、build handshake 和关键 capabilities。

## 11. 安全边界仍需复核的部分

### 11.1 HTTP Provider 的 DNS rebinding 风险

**证据类型：源码推断。置信度：中。**

当前代码已经做了较好的基础 SSRF 防护：

- 只允许 HTTP/HTTPS；
- 禁止 URL 凭证；
- DNS 解析并拒绝私网、loopback、link-local 和 reserved 地址；
- 手动处理重定向，并对每个 redirect 重新校验；
- 设置 redirect 上限和超时。

证据位置：

- `app/apps/backend/src/services/llmService.js:542-654`

仍需复核的问题是：校验阶段使用一次 DNS lookup，但之后 `fetchImpl(current.href)` 会再次由网络栈解析域名。若攻击者能控制 DNS 响应，理论上可能在“校验”和“实际连接”之间切换地址。

这属于推断，不是本轮已经成功利用的漏洞。后续安全验收应验证是否需要：

- 将经过校验的 IP 固定到实际 socket；
- 校验证书 hostname；
- 每次连接重新校验 remoteAddress；
- 对 request-supplied endpoint 使用更严格 allowlist；
- 对 server-configured 内网 Provider 保持显式例外。

### 11.2 正式服务仍是当前最现实的安全问题

相比尚未验证的 DNS rebinding，正式旧后端匿名暴露 `/api/config` 和 `/api/projects` 是已经发生、可直接复现的问题，优先级更高。

## 12. 国际化、离线与界面一致性

### 12.1 设置页仍明显中英文混用

**证据类型：Playwright 直接证据。置信度：高。**

核心项目页和主面板中文化已经明显改善，但设置页的主要字段、按钮和帮助文字仍以英文出现。Pipeline 模板名称、Draw 的部分标签、终端主题等也保留英文。

用户影响：

- 非技术用户难以区分 Server Token 和 API Key；
- Provider 配置是高风险操作，中英文混用增加误配概率；
- 同一页面的语言一致性差；
- 测试只覆盖部分主面板，无法阻止其他区域重新出现硬编码英文。

优化方向：

- 所有用户可见文案进入 locale；
- 增加扫描测试，禁止主要组件直接出现未登记英文文案；
- Provider、鉴权和费用相关术语提供中英对照解释，而不是只翻译标签；
- 中文模式下默认展示中文 pipeline 名和说明，英文作为次级信息。

### 12.2 Google Fonts 是持续的外部失败源

**证据类型：Playwright与源码直接证据。置信度：高。**

三个正式视口和当前源码隔离页面都出现：

```text
https://fonts.googleapis.com/css2?family=...
net::ERR_EMPTY_RESPONSE
```

源码：

- `app/apps/frontend/src/app/App.css:1`

系统有本地字体回退，所以页面未完全失效；但这仍会：

- 制造控制台错误；
- 增加首屏不确定性；
- 在受限网络中产生超时；
- 形成第三方请求和潜在隐私问题；
- 使截图和字体布局在不同环境不稳定。

优化方向：删除外部 `@import`，优先使用系统字体，或在确有视觉要求时自托管经过许可的字体文件。

## 13. 依赖、构建体积与维护性

### 13.1 依赖漏洞告警

**证据类型：`npm audit --json` 直接证据。置信度：高。**

当前统计：

```text
moderate: 2
high:     3
critical: 2
total:    7
```

涉及：

- `brace-expansion`：high；
- `fast-uri`：high；
- `react-router` / `react-router-dom`：moderate；
- `shell-quote`：critical；
- `tar`：critical；
- Vitest 依赖中的 Vite：high。

其中 `react-router-dom` 和 `tar` 是直接依赖，其余包含传递依赖。告警不等于所有路径都可被真实利用，但不能只记录数字，需要做可达性分析：哪些包进入生产、哪些只在开发/测试、哪些处理不可信输入、升级是否会破坏现有功能。

### 13.2 两个懒加载 chunk 仍超过 500 KiB

构建产物：

```text
MarkdownEditor-DnJLy034.js      583,947 bytes
RenderedPreviewPane-DO2Eqz_I.js 510,029 bytes
```

它们已不再进入编辑器首屏主 chunk，这是改善；但首次打开编辑器或预览时仍可能产生明显加载等待，尤其是在局域网弱 Wi-Fi、手机或低性能设备上。

优化方向：

- 分离编辑器语言包、插件、worker 和不常用命令；
- 预览侧按 LaTeX/Markdown/PDF 能力进一步拆分；
- 用真实 LAN 性能指标检查首次打开耗时，而不是只看 gzip；
- 为懒加载提供清晰骨架和错误重试。

### 13.3 核心文件过大

当前主要大文件：

```text
paperWorkbenchService.js  8042 lines
App.css                   6088 lines
paperRagService.js         2587 lines
skillEngine.js             2418 lines
LatexPreview.tsx           1281 lines
DrawPanel.tsx              1127 lines
ProjectPage.tsx            1043 lines
SkillsSelector.tsx          938 lines
ProjectTree.tsx             924 lines
RightPanel.tsx              856 lines
```

用户不会直接看到“文件太长”，但会感受到其结果：

- 修改一个区域容易影响另一个区域；
- 测试定位和错误归因变慢；
- 新贡献者难以理解边界；
- i18n、安全校验和状态处理容易分散；
- 大量冲突使发布批次难以拆分。

优化方向不是机械按行数拆文件，而是按稳定边界拆分：RAG 索引/解析/检索/恢复；Workbench 项目状态/任务执行/产物；Skill 加载/推荐/执行元数据/导入；前端 panel shell/业务状态/展示组件/API adapter。

### 13.4 工作区状态过大

当前 `git status --short` 有 160 条记录；已跟踪 diff 涉及 96 个文件，约：

```text
6124 insertions
4704 deletions
```

这会产生以下风险：

- 无法快速确认某个修复对应哪个测试；
- 文档可能描述后续版本，而正式服务仍运行前一版本；
- 多个修复共享文件，回滚困难；
- 审查者难以区分用户原有改动和自动修复；
- 构建产物与源码可能不属于同一批次。

优化方向：按可验证主题拆分交付批次，每个批次记录行为、测试、风险和部署状态。当前不应在没有建立变更归属的情况下进行大规模清理或覆盖。

### 13.5 仓库噪声

当前 Git 跟踪内容包含：

- `app/apps/frontend/src/app/components/SkillsSelector.tsx.bak`；
- `app/apps/frontend/dist/index.html`；
- `app/test-results/.last-run.json`。

仓库根还存在多份测试结果、截图、运行日志和构建目录。部分可能有意作为证据保留，因此本轮没有删除。

优化方向：建立清晰的 artifact policy：

- 哪些构建产物必须提交；
- 哪些测试结果只属于 CI artifact；
- 哪些截图属于文档资产；
- `.bak` 是否禁止提交；
- 运行时状态是否统一进入被忽略目录。

## 14. 已确认改善、不要重复误判的问题

为了避免后续 Claude 或其他 Agent 重复修已经解决的问题，本轮确认当前源码已有以下改善：

1. 项目页同时显示项目名、项目 ID 和实际存储目录。
2. 新项目目录采用可读名称加短 ID，不再只有难以识别的 UUID。
3. 已有论文目录可以被发现并显式注册，原文件夹不移动。
4. Codex、Claude Code、Copilot CLI 已作为 Provider 选项出现。
5. CLI Chat 默认禁用工具和写入，避免直接改论文。
6. 当前源码有 default-deny 鉴权和配置脱敏逻辑。
7. 当前源码有前后端 build/schema 门禁和 `/api/ready`。
8. 当前源码的手机和平板工作区基本可操作，隔离 E2E 通过。
9. 核心主面板中文化较旧版本有明显改善。
10. 编译环境当前已经改成显式 `OPENPRISM_COMPILE_*` 配置，不应继续把旧的用户目录/Conda 硬编码列为当前源码缺陷。
11. RAG 索引已有原子写入、损坏恢复和项目级锁等可靠性改进。
12. 模板替换、项目 Locator、symlink 拒绝和 E2E 隔离已有针对性实现与测试。

这些改善多数尚未在正式 `8787` 实例生效，因此报告必须同时保留“当前源码状态”和“正式用户状态”两套结论。

## 15. 建议的优化优先顺序

### 第一阶段：恢复正式可用性与可信状态

1. 修复 Skills 当前失败回归，确保未知 Skill 不会假 ready。
2. 跑完整 typecheck、build、unit、integration 和 E2E。
3. 生成唯一最终 build ID。
4. 用当前源码正式重启后端，确认唯一监听。
5. 验证鉴权、config 隐私、projects 保护、ready 和 build handshake。
6. 对正式 LAN 地址跑桌面、手机和平板 Playwright。
7. 更新状态文档，使其只陈述实际部署证据。

### 第二阶段：补齐用户任务闭环

1. 新增 CLI Task Agent 的隔离 Diff/Accept/Reject 流程。
2. 完成 Skills requirements、readiness、静态检查、真实运行记录和推荐降级策略。
3. 为 RAG 增加索引健康面板和检索模式说明。
4. 增加首次启动 Token/Provider 引导。
5. 完成剩余中英文统一和离线字体处理。

### 第三阶段：质量与工程治理

1. 建立 RAG 固定评测集，再决定 BM25、embedding 和 reranking。
2. 对 7 个依赖告警做生产可达性与兼容升级。
3. 分解超大服务和前端组件。
4. 继续拆分重型懒加载 chunk，并用真实 LAN 性能验收。
5. 建立 Git 变更批次、构建产物和运行时 artifact 管理规范。
6. 对 HTTP Provider 做 DNS rebinding/socket pinning 专项安全复核。

## 16. 建议交给实施 Agent 的验收清单

后续实施 Agent 不应只根据“代码看起来存在”宣布完成，至少需要提供以下证据：

### 正式部署

- [ ] `/api/health` 带 build ID 和 schema。
- [ ] `/api/ready` 返回 200。
- [ ] 前端 build 与后端 build 一致。
- [ ] 未认证 `/api/config`、`/api/projects` 不返回敏感业务数据。
- [ ] `0.0.0.0:8787` 只有一个正确进程。
- [ ] LAN 桌面、手机、平板可进入项目和编辑器。

### 项目身份

- [ ] 新建项目显示名称、稳定 ID 和实际目录。
- [ ] 已有目录注册不移动文件。
- [ ] 重命名行为和目录变化对用户透明。
- [ ] 项目身份不匹配、损坏 metadata 和 symlink 被安全处理。

### CLI Agent

- [ ] Chat 始终只读。
- [ ] Task Agent 只在隔离快照写入。
- [ ] 展示 changed files、Diff、命令、模型与 provenance。
- [ ] Reject 后正式项目字节完全不变。
- [ ] Accept 原子应用，失败可回滚。

### Skills

- [ ] 旧 Skill 未声明元数据时为 degraded。
- [ ] 缺命令/凭证时为 unavailable。
- [ ] 静态检查不运行脚本、不联网、不调用模型。
- [ ] unavailable Skill 不能直接激活。
- [ ] 真实执行的 lastRun 可持久查询。

### RAG

- [ ] 显示 generation/fingerprint、最近成功索引时间和健康状态。
- [ ] 显示逐文件 parser、字符数、chunks、warning/error。
- [ ] 明确标注当前是关键词检索还是语义检索。
- [ ] 固定评测集可重复运行并输出 Recall@K/MRR 等指标。
- [ ] 索引损坏、重建和恢复对用户可见。

### 工程质量

- [ ] 完整测试全绿，不仅是聚焦测试。
- [ ] `npm audit` 每项都有可达性判断或升级结论。
- [ ] 构建 chunk 预算有明确例外和性能证据。
- [ ] 状态文档与正式实例一致。
- [ ] 没有新增 `.bak`、临时日志、测试状态或无归属构建产物。

## 17. 未知项与本轮限制

以下问题本轮没有伪造结论：

1. 真实 Codex、Claude Code、Copilot 账号在当前机器上是否都已登录并能成功调用。
2. 真实 API Provider 的模型效果、成本、限流和长论文上下文表现。
3. CLI Provider 在长任务取消时，所有子进程在各种平台上是否都能稳定终止。
4. RAG 对真实论文问题的召回率和引用正确率。
5. PDF/OCR 对扫描版、双栏、公式、表格和非 UTF-8 文档的总体质量。
6. 当前依赖漏洞中哪些生产路径真实可达。
7. DNS rebinding 是否能在当前 Node/fetch/网络环境中被实际利用。
8. 正式论文数据中的所有旧项目是否都能无损迁移到新的项目身份模型。

这些未知项需要专门、隔离、可重复的验证，不能由源码存在某个函数就推断为已完成。

## 18. 最终判断

当前仓库的主要矛盾已经从“功能太少”转变为“功能很多，但正式部署、执行语义、状态可信度和工程收口不一致”。

最优先的工作不是继续堆新按钮，而是先做到：

1. 正式实例运行当前、经过全量验证的同一构建；
2. 所有能力状态不再出现假 ready；
3. Chat、Task Agent、Skill、RAG 的执行边界对用户透明；
4. 项目显示名、稳定 ID 和物理目录保持可追踪；
5. 文档所写的“已完成”必须能被正式 API 和 Playwright 当场证明。

在这些条件满足前，当前仓库适合继续内部开发和隔离验证，不适合被描述为已经稳定上线的论文生产系统。
