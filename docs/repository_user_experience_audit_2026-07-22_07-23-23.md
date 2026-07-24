# Paper Writing 仓库当前用户体验与系统问题审计

- 审计时间：2026-07-22 07:23:23（Asia/Shanghai）
- 仓库路径：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting`
- 正式访问地址：`http://10.30.0.22:8787`
- 审计视角：首次使用者、日常论文作者、系统管理员、仓库维护者
- 审计边界：只发现和分析问题；不修改产品代码；不重启正式服务；不写入正式论文；不调用真实付费模型
- 证据来源：隔离 Playwright、正式 LAN Playwright、HTTP/API 探测、当前构建产物、源码、测试、文档、进程和 Git 工作区

## 1. 总体结论

当前仓库已经实现了不少正确方向上的能力，包括：Codex、Claude Code、GitHub Copilot CLI Provider，隔离式 CLI Task Agent，项目显示名/稳定 ID/存储目录区分，已有目录注册，Skills readiness，RAG health，构建版本握手和移动端布局等。

但是，从真实使用者角度，当前版本仍然不能交付，核心原因不是“功能少”，而是下面四个状态彼此脱节：

```text
源码中存在功能
≠ 单元测试全部通过
≠ 生产构建能在浏览器运行
≠ 正式 LAN 服务已加载当前安全后端
```

本轮最重要的结论如下：

1. **当前前端生产构建是全局空白页。** 入口 HTML 和静态资源均返回 200，但浏览器在首屏模块初始化阶段抛出 `TypeError: r is not a function`，React 根节点保持空白。
2. **隔离 Playwright 的 19 项核心场景中，16 项失败。** 项目列表、项目注册、编辑器、手机、平板、Provider 设置、Skills、RAG、CLI Task Agent、Markdown/LaTeX 预览全部不可操作；只有 3 项纯 API 检查通过。
3. **正式 LAN 的桌面、手机、平板也全部复现空白页。** 因此这不是测试选择器过时，也不是单一业务页面故障，而是当前静态构建的启动级回归。
4. **正式后端仍然是旧运行批次。** `/api/ready` 返回 404，`/api/health` 没有 build/schema 元数据，并明确返回 `authRequired:false`。
5. **正式旧后端仍匿名暴露配置和项目元数据。** `/api/config`、`/api/projects`、`/api/providers` 对无 Token 和明显错误 Token 都返回 200。
6. **用户提出的“直接使用 Codex/Copilot，不只依赖 API”在当前源码中已经有实现。** 目前共有 OpenAI-compatible、Anthropic、Codex CLI、Claude Code CLI、GitHub Copilot CLI 五类 Provider；另有带快照、Diff、Accept/Reject 的 Task Agent。但由于前端空白和正式后端过旧，正式用户现在无法使用这些能力。
7. **“项目名与 papers 子目录对不上”在当前源码中已有明显改善。** 新模型区分显示名、稳定项目 ID 和可辨识存储目录，并支持注册已有目录；但当前 UI 不可达，正式旧服务也没有完成验证，所以不能向用户宣称该问题已经正式解决。
8. **Skills 和 RAG 的透明度有所提高，但能力成熟度仍有限。** 123 个旧 Skills 按当前契约全部是 `degraded`；readiness 只做静态只读检查；运行历史仍是进程内记录。RAG 核心仍是本地关键词重叠检索，不是语义向量检索。
9. **测试门禁存在明显断层。** 类型检查通过、依赖审计为 0 漏洞，但单元测试已有 1 项失败，浏览器 E2E 大面积失败；静态“源码包含某字符串”的测试没有保护生产 bundle 的运行时正确性。
10. **仓库交付状态非常混杂。** 当前约有 191 条已跟踪状态记录、89 个未跟踪文件，已跟踪 diff 涉及 102 个文件、约 7213 行新增和 6579 行删除；审计状态文档仍把多项功能写成“已完成”，与当前真实浏览器结果冲突。

综合判断：当前工作区可以继续作为开发分支使用，但不应被描述为“可用版本”“已完成整改”或“可以正式交付”。

## 2. 证据等级与审计边界

本文使用四类结论标识：

- **直接证据**：本轮浏览器、HTTP、进程、文件、测试命令直接观察到的结果。
- **源码证据**：当前工作区源码明确实现了某项能力，但不代表正式进程或浏览器已能使用。
- **高可信推断**：多个直接证据共同支持，但没有执行破坏性验证。
- **未知**：在“不修改、不重启、不调用真实付费服务”的边界内无法确认。

本轮没有执行：

- 没有运行会覆盖当前 `dist` 的生产构建命令；
- 没有修改任何前后端产品代码；
- 没有重启或终止正式 PID `575763`；
- 没有在正式 `papers` 数据根创建、重命名或删除项目；
- 没有调用真实 Codex、Claude Code、Copilot 或收费 HTTP 模型；
- 没有接受任何 Task Agent 变更到正式论文；
- 没有执行路径穿越、命令注入或数据破坏性利用。

正式论文保护基线仍然成立：

```text
papers/paper-agent-spe/project.json
SHA-256: 55f3be5579a0a00fc8ae7b1bdaaedf6c20b6fad7647d4f869358f0aadc3958d5
```

## 3. Playwright 实际使用结果

### 3.1 隔离环境核心场景

隔离运行使用随机本地端口、临时 `papers` 数据根和独立 Token，没有访问正式论文数据。

执行范围：

- 项目列表与 CRUD；
- 已有论文目录发现和注册；
- Provider 首次配置说明；
- Skills readiness；
- RAG health 和修复；
- 手机与平板工作区；
- CLI Task Agent；
- Markdown 与 LaTeX 懒加载预览。

结果：

```text
19 tests
3 passed
16 failed
```

通过的 3 项均为纯 API 检查：

- `/api/health` 返回成功；
- `/api/config` 返回公开配置；
- `/api/projects` 返回项目数组。

失败的 16 项浏览器场景包括：

| 用户流程 | 结果 | 用户看到的实际情况 |
| --- | --- | --- |
| 打开项目列表 | 失败 | 页面空白，找不到“我的项目” |
| 搜索项目 | 失败 | 项目列表未渲染 |
| API 创建后在列表查看 | 失败 | API 成功，但 UI 空白 |
| 打开项目编辑器 | 失败 | 编辑器未渲染 |
| 删除后刷新列表 | 失败 | UI 无法操作 |
| 注册已有论文目录 | 失败 | 找不到“发现的论文目录”区域 |
| 手机工作区 | 失败 | 页面空白 |
| 平板工作区 | 失败 | 页面空白 |
| Provider 设置引导 | 失败 | 找不到“设置”按钮 |
| Skills 管理 | 失败 | 找不到“管理 Skills”入口 |
| RAG health | 失败 | 找不到 RAG 面板按钮 |
| RAG 损坏修复 | 失败 | 找不到 RAG 面板按钮 |
| CLI Task Agent | 失败 | 找不到“任务”Tab |
| Markdown 预览 | 失败 | 编辑器入口即空白 |
| LaTeX 预览 | 失败 | 编辑器入口即空白 |

这批失败不能被归因于 16 个按钮或选择器同时变化。手工 Playwright probe 证明 `body.innerText` 和 `#root.innerHTML` 都为空。

### 3.2 浏览器错误与资源状态

手工 Playwright 收集结果：

```text
Navigation: 200
Document title: Paper Agent
body.innerText: ""
#root.innerHTML: ""
pageerror:
TypeError: r is not a function
at /assets/markdown-renderer-Bc4aC2l2.js:1:11312
```

同时确认：

- `index-BmmTmhPY.js` 返回 200；
- `rolldown-runtime-QTnfLwEv.js` 返回 200；
- 所有 `markdown-renderer-*` 预加载 chunk 返回 200；
- `katex-renderer-*` JS/CSS 返回 200；
- 主 CSS 返回 200；
- 没有 404 静态资源。

因此问题不是资源缺失，而是 JavaScript 模块的初始化顺序、导出引用或分包循环在运行时失效。

### 3.3 正式 LAN 三种设备

访问地址：

```text
http://10.30.0.22:8787/projects
```

| 设备 | 视口 | HTTP | 页面正文 | 浏览器错误 |
| --- | ---: | ---: | --- | --- |
| 桌面 | 1440×900 | 200 | 空 | `r is not a function` |
| 手机 | 390×844 | 200 | 空 | `r is not a function` |
| 平板 | 768×1024 | 200 | 空 | `r is not a function` |

三个视口都没有横向溢出，但空白页没有任何实际响应式验收价值。当前不能据此判断主工作区在手机和平板上是否可用。

## 4. P0：当前生产 bundle 在浏览器启动阶段崩溃

**证据类型：Playwright 直接证据 + 构建产物 + Git diff。置信度：高。**

当前 `dist/index.html` 在入口阶段预加载多个 `markdown-renderer-*` chunk。`app/apps/frontend/vite.config.ts:99-124` 使用 Rolldown `codeSplitting.groups`，把 Markdown 相关包按正则分到 `markdown-renderer` 组，并设置 `maxSize` 再拆成多个 chunk。

浏览器错误正好发生在其中一个自动分组的 Markdown chunk：

```text
markdown-renderer-Bc4aC2l2.js:1:11312
TypeError: r is not a function
```

Git diff 还表明，本批次同时把 `RenderedPreviewPane` 中的 Markdown 和 LaTeX Preview 改为动态导入。

最可信解释是：**人为 vendor 分组与 `maxSize` 再拆分破坏了 Markdown/unified 生态内部的模块初始化关系，生成了语法合法、体积合规、但运行时错误的 bundle。**

这里需要谨慎区分：

- 直接证据已经证明错误位于自动生成的 `markdown-renderer` chunk；
- 当前证据高度支持分包配置是触发因素；
- 本轮没有修改配置做 A/B 构建，因此没有把“删除某一组后恢复”作为直接证据。

用户影响：

- 首页、项目页、编辑器和所有设置入口全部不可用；
- HTTP 200、health 200 和静态文件 200 会产生错误的“服务正常”假象；
- React `ErrorBoundary` 无法捕获 React 启动前的 ES module 初始化错误；
- “重新加载页面”不会恢复；
- Provider、项目身份、Skills、RAG、Task Agent 等后续功能即使源码正确，对用户也等同于不存在。

改进方向：

1. 先建立生产 bundle 的最小浏览器启动门禁：打开 `/projects`，断言 `#root` 非空、无 `pageerror`、关键 heading 可见。
2. 分包优化必须以“浏览器可运行”为第一约束，chunk 大小只是第二约束。
3. 优先保留组件级动态导入，减少对依赖图做宽泛正则强拆。
4. 若必须拆 vendor，应按稳定依赖边界定义组，并为每组增加真实 import/runtime smoke test。
5. 生产构建完成后必须立即运行 Playwright，不允许只看 Vite 构建成功和文件大小。
6. 应增加入口级致命错误页或 `window.onerror` bootstrap fallback，避免完全空白且无诊断信息。

## 5. P0：正式后端仍是旧批次，并匿名暴露元数据

**证据类型：正式进程与 HTTP 直接证据。置信度：高。**

当前正式监听：

```text
0.0.0.0:8787
PID 575763
cwd /data01/home/xuzk/workspace/ai_agent/paper_wrighting/app/apps/backend
node src/index.js
启动时间：2026-07-22 02:56:52
```

正式 API：

```text
GET /api/health -> 200 {"ok":true,"authRequired":false}
GET /api/ready  -> 404 {"error":"Not Found"}
```

无 Token 和错误 Token 的结果相同：

| API | 无 Token | 错误 Token |
| --- | ---: | ---: |
| `/api/config` | 200，645 bytes | 200，645 bytes |
| `/api/projects` | 200，762 bytes | 200，762 bytes |
| `/api/providers` | 200，1297 bytes | 200，1297 bytes |

当前工作区源码已经加入新的鉴权、build metadata 和 `/api/ready`，但正式进程没有体现这些行为。

用户和管理员风险：

- 同网段用户可以绕过空白前端直接访问旧 API；
- 项目枚举、Provider 和内部配置元数据仍可匿名获取；
- 错误 Token 也不会触发拒绝，容易让管理员误判鉴权已经启用；
- 新前端和旧后端不是同一批次，任何功能验证都可能得到混合结果；
- 空白前端不是安全边界，不能保护后端数据。

改进方向：

1. 发布必须是“最终构建 + 后端重启 + 唯一监听 + build/schema 握手 + LAN Playwright”的同一事务。
2. 业务 API 默认拒绝匿名请求；错误 Token 必须返回 401/403。
3. `/api/health` 只做 liveness，同时返回最小 build/schema/auth 元数据。
4. `/api/ready` 必须检查前后端 build、数据根、鉴权和必要依赖。
5. 发布前自动执行无 Token、错误 Token、正确 Token 三类探测。
6. 不允许把“源码已有鉴权测试”当成“正式运行实例已安全”。

## 6. P0：交付状态、审计状态与真实结果不一致

**证据类型：Git 状态、文档与测试直接证据。置信度：高。**

当前工作区：

```text
已跟踪状态记录：约 191
未跟踪文件：89
删除记录：4
tracked diff：102 files changed
新增：约 7213 行
删除：约 6579 行
```

`docs/repository_audit_remediation_status_2026-07-22.md` 将多项能力标为“已完成”，并记录隔离 Playwright 已通过；但本轮当前构建实测为 16 项浏览器失败。

同一状态文档还记录旧依赖审计有多个高危/严重告警，而本轮 `npm audit --json` 已是 0。这说明状态文档描述的是不同时间切片，未随仓库继续变化同步更新。

用户影响：

- 阅读文档的人会误以为当前版本已正式可用；
- 后续模型可能以过期“已完成”结论为真，跳过必要验证；
- 发布负责人难以知道哪组源码、测试、dist 和后端进程属于同一批次；
- 大量未提交改动使问题定位、回滚和责任边界变得困难。

改进方向：

1. 状态文档必须带 build ID、commit、生成时间、验证命令和有效期。
2. 一旦当前验证失败，应把对应条目降级为“回归/阻断”，不能继续保留“已完成”。
3. 把源码实现、自动化通过、正式部署、人工验收拆成四个独立状态字段。
4. 每个发布候选必须从可识别的 Git 状态构建，不能从无法复现的混杂工作区直接发布。
5. `dist`、后端进程和文档必须能追溯到同一 build ID。

## 7. P1：测试门禁没有阻止启动级回归

**证据类型：命令直接证据 + 测试源码。置信度：高。**

本轮检查：

```text
TypeScript typecheck: 通过
npm audit: 0 vulnerabilities
Unit tests: 68 files passed, 1 file failed
Unit assertions: 400 passed, 1 failed
Playwright: 3 passed, 16 failed
```

单元测试失败位置：

```text
tests/renderedEditorMode.test.mjs
```

原因是旧测试仍要求同步 import，而实现已经改成动态 import。这个失败本身不是空白页根因，但说明变更没有完成测试同步和全量收口。

更重要的是，`tests/frontendChunkBudget.test.mjs:5-22` 主要检查源码是否包含动态 import、预算常量和配置字符串。它能证明“写了分包配置”，不能证明“分包产物在浏览器可执行”。

当前门禁结构还有一个运营风险：

- `npm run check` 包含类型检查、构建和单元测试；
- 只有 `npm run check:full` 才包含 E2E；
- 如果发布者只运行 `check`，浏览器启动回归只有在单元测试恰好失败时才会被挡住；
- 即使修复了过时单测，若不运行 E2E，当前空白页仍可能漏过。

改进方向：

1. 把“生产 bundle 打开 `/projects` 无 pageerror”作为构建后的必跑 smoke test。
2. 将首屏 E2E 纳入普通 `check` 或独立 `check:release`，不要只放在耗时完整套件。
3. 静态源码契约只能补充，不能替代运行时测试。
4. 对分包配置增加产物依赖图检查和真实浏览器 import 检查。
5. 并行 E2E 失败时应优先聚合共同 `pageerror`，避免输出 16 个表面选择器超时掩盖一个根因。
6. 发布报告应分别列出 typecheck、unit、integration、browser smoke、full E2E，而不是笼统写“测试通过”。

## 8. P1：CLI Provider 和 Task Agent 已实现，但当前不可达且仍有产品边界

**证据类型：源码与文档证据；正式 UI 不可验证。置信度：高。**

用户之前提出“不要只能通过 API 配置 LLM，也可以直接使用 Codex 或 Copilot”。当前源码已经覆盖这一方向：

| Provider | 普通 Chat | 文件修改 Task |
| --- | --- | --- |
| OpenAI-compatible API | 支持 | 不属于 CLI Task Agent |
| Anthropic API | 支持 | 不属于 CLI Task Agent |
| Codex CLI | 只读 Chat | 隔离快照 `workspace-write` |
| Claude Code CLI | 只读 Chat | 仅 Read/Edit/Write 文件工具 |
| GitHub Copilot CLI | 只读 Chat | 隔离目录 read/write |

相关证据：

- `app/apps/backend/src/services/agentProviderRegistry.js:20-71`：三种 CLI Chat Provider；
- `app/apps/backend/src/services/cliTaskAgentService.js:48-94`：三种 CLI Task Provider；
- `app/apps/frontend/src/app/components/SettingsModal.tsx:54-63`：五类 Provider 展示；
- `docs/cli_task_agent.md`：快照、Diff、Accept/Reject、漂移检测和回滚契约。

这项功能现在的问题不是“没有做”，而是：

1. 当前前端空白，用户无法进入设置或任务面板；
2. 正式后端是旧批次，无法确认是否注册了新的 Task API；
3. 自动化使用 mock CLI，没有验证真实账号登录、真实 CLI 版本兼容、网络和模型输出质量；
4. 普通 CLI Chat 明确 `stream:false`，长任务只能等待完整结束，交互体验弱于真正流式聊天；
5. Task history 没有 UI 删除/归档和容量治理；
6. Accept 后已打开的编辑器标签可能仍显示旧内存内容；当前只是发送 `paper-writer:cli-task-applied` 事件，尚无统一刷新消费者；
7. 真实 Provider 的权限语义可能随 CLI 版本变化，需要版本兼容矩阵和启动时能力探测。

改进方向：

1. 先恢复基础 UI，再做真实 CLI 的只读安装/登录/版本验收。
2. 在设置页明确区分“API Provider”“只读 CLI Chat”“可审查 CLI Task”。
3. 为 CLI 任务提供实时状态和可取消的日志流，而不是仅最终结果。
4. 完成 Accept 后统一刷新文件树、已打开标签、预览、RAG fingerprint 和编译状态。
5. 增加历史归档、保留期、磁盘配额和敏感日志清理。
6. 每种 CLI 维护支持版本、固定权限和回归探针。

## 9. P1：项目名称、稳定 ID 和磁盘目录模型已改善，但尚未形成可验收体验

**证据类型：源码证据；正式写操作未执行。置信度：高。**

当前源码已经不再简单使用“页面名称”和“目录名”混为一个字段：

- `projectLocator.js` 根据显示名和稳定 ID 生成安全、可辨识的 `directoryName`；
- 项目重命名会计算新目录名、迁移目录并更新 `updatedAt`；
- 项目页同时显示项目名称、项目 ID 和存储目录；
- 已存在但没有 `project.json` 的论文目录可以先发现，再由用户确认注册；
- 注册已有目录时不移动原论文文件。

这比最初的“UI 看到的工程和 papers 子目录完全对不上”明显更合理。

仍存在的用户问题：

1. 当前空白页使这些说明和复制入口全部不可见；
2. 正式旧后端是否使用新目录规则未知；
3. 为保护正式论文，本轮没有在正式数据根创建或重命名项目，所以不能宣称正式迁移已验收；
4. 用户仍需要理解显示名、稳定 ID、目录名、绝对路径四个概念；
5. 重命名会移动物理目录，可能影响外部编辑器、脚本、Overleaf 同步或已有 shell cwd；
6. 旧 UUID 目录、手工目录、新可辨识目录可能长期共存；
7. 缺少批量身份诊断和迁移预览。

改进方向：

1. 在项目卡片和详情页用简短说明解释三种身份的用途和是否可变。
2. 重命名前明确提示“会移动目录”，并列出可能失效的外部引用。
3. 提供只读“项目身份诊断”：metadata ID、目录、主文件、注册来源、外部引用风险。
4. 提供旧项目迁移预览和冲突报告，不默认自动移动。
5. 发布后必须用隔离数据做创建、中文名、空格、重命名、注册已有目录和冲突回滚 Playwright。

## 10. P1：Skills 仍是“目录与静态 readiness”，不是完整可追踪执行系统

**证据类型：源码和契约文档。置信度：高。**

`docs/skill_execution_readiness.md` 已明确区分：

```text
目录可见
≠ 语义推荐
≠ 静态 readiness
≠ 真实执行
```

当前关键事实：

- 旧 Skills 缺少显式执行 metadata 时统一为 `degraded`；
- 契约引入时，123 个 legacy Skills 全部处于 `degraded`；
- `dry-run` 只检查命令、凭据存在性、Provider 能力和文件条件；
- `dry-run` 不执行脚本、不调用模型、不访问网络、不证明输出质量；
- `lastRun` 是进程内记录，不是持久审计日志；
- 当前 UI 空白，用户连静态 readiness 也无法查看。

用户影响：

- “能看到 Skill”容易被误解为“点击就能可靠完成任务”；
- 无法回答某次真实执行用了哪个 Provider、模型、Skill 版本、耗时、成本和副作用；
- 后端重启后运行历史可能丢失；
- 缺少统一 artifact、日志、失败原因和重试入口；
- 大量 `degraded` Skill 会让用户面对很大的目录，但缺少可信的可执行集合。

改进方向：

1. 先选少量高价值论文工作流，补齐明确 execution manifest 和真实执行适配器。
2. 持久化 run ledger：Provider、模型、Skill 版本、输入摘要、输出 artifact、耗时、成本、状态和副作用。
3. UI 清晰区分“可发现”“推荐”“静态可运行”“最近真实成功”。
4. 提供按项目、论文阶段和准备状态筛选，不让 123 个 Skill 平铺给用户。
5. 为每个可执行 Skill 建立最小真实 fixture 和质量验收，不只做元数据测试。
6. 所有写文件 Skill 应复用 Task Agent 的快照、Diff 和 Accept/Reject 模型。

## 11. P1：RAG 的可靠性元数据已改善，但检索能力和质量评估仍不足

**证据类型：源码和契约文档；当前 UI 不可验证。置信度：高。**

当前已有的正确能力：

- 自动索引；
- generation；
- corpus fingerprint；
- `healthy/degraded/corrupt/rebuilding`；
- 逐文件 parser、chars、chunks、warnings 和 error；
- 原子索引替换；
- 损坏检测和显式修复；
- managed project 边界。

但是 `paperRagService.js:25-29` 明确声明：

```text
kind: local-keyword-overlap
semantic: false
```

这意味着当前 RAG 本质上仍是词项重叠检索，不是 embedding、向量检索或混合检索。

用户影响：

- 同义词、改写、跨语言和概念相关性召回较弱；
- 论文中的术语变体、缩写和隐式论证容易漏检；
- `healthy` 只说明索引结构和 chunk 状态健康，不代表检索答案质量好；
- 当前没有固定问题集、Recall@K、MRR、引用正确率或证据覆盖率报告；
- 当前 UI 空白，health、重建 provenance 和搜索来源都无法实际操作。

改进方向：

1. UI 始终显示“本地关键词检索”，不要用“智能语义 RAG”误导用户。
2. 建立小型论文检索基准：唯一事实、同义改写、跨段落证据、中文/英文混合和无答案问题。
3. 在稳定后再引入可选 embedding/hybrid adapter，而不是直接替换现有离线模式。
4. 检索结果必须显示文件、位置、chunk、得分构成和索引 generation。
5. 将检索质量和索引健康分为两个独立维度。
6. RAG rebuild、CLI Task Accept、文件保存和外部文件变更应统一触发一致的失效/刷新策略。

## 12. P2：外部网络依赖削弱离线可用性和可控性

**证据类型：源码证据。置信度：高。**

当前仍存在：

- `LatexPreview.tsx:205-206` 从 jsDelivr 动态导入字体 CSS；
- `DrawioEditor.tsx:10` 使用 `https://embed.diagrams.net` iframe；
- Draw 图片服务默认地址为 `https://www.right.codes/draw/v1`；
- RAG 文献搜索依赖 Semantic Scholar、arXiv、Crossref、OpenAlex 等外部服务。

用户影响：

- 无外网、代理限制、DNS 故障或第三方限流时，功能表现不稳定；
- iframe 与远程字体可能受 CSP、浏览器隐私策略和组织网络策略影响；
- 外部服务故障容易被用户误认为本地项目损坏；
- diagrams.net iframe 的数据边界和隐私说明不足。

改进方向：

1. 本地打包预览字体，移除核心预览对运行时 CDN 的依赖。
2. Draw.io 提供离线/自托管选项，并在 UI 明确显示外部网络和数据边界。
3. 外部文献搜索按 Provider 独立显示可用性、限流、超时和最近错误。
4. 离线时保持编辑、文件树、本地预览、编译和本地 RAG 可用。
5. 能力状态页区分“本地功能可用”和“第三方网络服务可用”。

## 13. P2：超大模块增加回归概率和维护成本

**证据类型：文件规模直接证据。置信度：高。**

当前主要超大文件：

| 文件 | 规模 |
| --- | ---: |
| `paperWorkbenchService.js` | 8042 行，约 353 KB |
| `App.css` | 6086 行，约 123 KB |
| `paperRagService.js` | 2748 行，约 104 KB |
| `skillEngine.js` | 2424 行，约 120 KB |
| `SkillsSelector.tsx` | 约 82 KB |
| `LatexPreview.tsx` | 约 53 KB |
| `DrawPanel.tsx` | 约 53 KB |

用户不会直接看到“文件太大”，但会间接承受：

- 一个优化容易影响不相关页面；
- 测试难以覆盖真实组合；
- 新维护者难以判断边界；
- bundle 分拆容易采用正则强拆等高风险手段；
- CSS 选择器互相覆盖和移动端回归更难定位。

改进方向：

1. 拆分前先锁定现有行为测试，避免为拆而拆。
2. `paperWorkbenchService` 按 evidence、review、routing、state、presentation projection 分边界。
3. `paperRagService` 按 corpus、parser、index、search、health、external search 分边界。
4. `skillEngine` 按 registry、taxonomy、recommendation、readiness、execution adapter 分边界。
5. `App.css` 按页面/组件域拆分，保留 token 和全局 reset。
6. 每次只拆一个边界，保持 diff 小并做浏览器回归。

## 14. P2：完全空白页缺少用户可理解的失败恢复

**证据类型：Playwright 直接证据。置信度：高。**

当前浏览器只显示空白，没有：

- 错误标题；
- build ID；
- 重新检查按钮；
- 诊断编号；
- 清缓存建议；
- 管理员联系信息；
- 错误日志下载；
- 安全只读降级入口。

现有 React ErrorBoundary 放在 React 应用内部，无法处理入口模块在 `createRoot` 之前失败的情况。

改进方向：

1. `index.html` 提供非空 bootstrap fallback。
2. 在入口脚本加载后设置“已启动”标志；超时未设置时显示静态错误卡。
3. 捕获 `window.onerror` 和 `unhandledrejection`，展示脱敏错误、build ID 和重试方式。
4. Service Worker 或缓存策略存在时，提供明确的刷新/清缓存动作。
5. 即使主工作区崩溃，也应保留只读 health/diagnostics 页面。

## 15. 已经改善、不能重复当作“完全未做”的事项

为了避免后续整改重复劳动，以下方向在当前源码中已经有实质实现：

1. **CLI Provider**：Codex、Claude Code、Copilot 已进入 Provider registry。
2. **安全 Task Agent**：已有项目外快照、Diff、Accept/Reject、漂移检测和回滚。
3. **项目身份**：显示名、稳定 ID、目录名已经分离；UI 计划同时展示。
4. **已有目录注册**：可以发现未注册论文目录并显式注册，不移动原文件。
5. **RAG health**：已有 generation、fingerprint、损坏状态和逐文件诊断。
6. **Skills readiness**：已经避免把“加载成功”误报成“可执行”。
7. **鉴权源码**：当前工作区已有更严格的默认拒绝模型，只是正式旧进程没有加载。
8. **依赖安全**：本轮 `npm audit` 为 0 漏洞。
9. **隔离 E2E runner**：随机端口、临时数据根和随机 Token 的方向正确。

后续工作重点应是让这些能力在同一个可运行、可部署、可验收的版本中形成闭环，而不是再次平行实现一套同名功能。

## 16. 优先级排序

### P0：停止交付，先恢复最小可运行版本

1. 修复生产 bundle 的 `r is not a function` 启动错误。
2. 增加 `/projects` 生产 bundle Playwright smoke gate。
3. 运行类型、单元、集成、E2E 全套检查。
4. 生成唯一 build ID，重启正式后端到同一批次。
5. 验证 `/api/ready`、build/schema 和默认拒绝鉴权。
6. 正式 LAN 桌面/手机/平板重新验收。

### P1：恢复后验证核心论文闭环

1. 项目创建、中文名称、目录展示、重命名、已有目录注册。
2. Provider 设置、CLI 安装/登录探测、只读 Chat。
3. CLI Task 创建、Diff、Reject、Accept、编辑器刷新。
4. Skills readiness、真实可执行小集合和持久历史。
5. RAG 上传、索引、health、搜索、来源展示和质量基准。
6. 保存、预览、编译、PDF 和错误恢复。

### P2：降低长期回归和运维风险

1. 移除核心运行时 CDN/iframe 单点依赖或提供离线替代。
2. 小步拆分超大模块。
3. 建立发布候选、Git 状态、dist、后端进程和文档的一致追踪。
4. 增加磁盘容量、Task history、RAG artifact 和日志生命周期治理。
5. 建立真实用户任务级质量指标，而不只统计测试数量。

## 17. 建议的验收标准

修复后，至少满足以下条件才能称为“可用”：

### 浏览器启动

- `/projects` 的 `#root` 非空；
- 无 `pageerror`、无失败 JS/CSS；
- 桌面、手机、平板均可进入项目列表；
- 发生入口错误时显示可理解的诊断页，而不是空白。

### 项目

- 创建后 UI 同时显示名称、ID、目录；
- 中文、空格和长名称有确定规则；
- 重命名提示目录移动影响；
- 已有目录注册不移动论文文件；
- 不写入用户未确认的候选目录。

### Provider 与 Agent

- API 与 CLI Provider 清晰分组；
- CLI 安装、版本、登录状态可只读检查；
- Chat 不写文件；
- Task Agent 只改快照；
- Accept 前必须逐文件审查；
- Reject 保持原文件 hash；
- Accept 后编辑器、预览、RAG 和文件树刷新一致。

### Skills

- 不把 degraded 说成 ready；
- 至少若干核心 Skill 有真实执行 adapter；
- 真实 run 有持久 provenance 和 artifact；
- 写文件 Skill 走可审查 Diff。

### RAG

- 显示实际检索模式；
- 上传后可搜索唯一事实；
- 显示来源和索引 generation；
- 损坏索引不被静默覆盖；
- 有固定质量测试集。

### 发布与安全

- 正式 `/api/ready` 成功；
- 前后端 build/schema 一致；
- 无 Token 和错误 Token 无法访问业务 API；
- 正式端口只有一个本仓库 listener；
- 正式论文保护 hash 不变；
- 所有证据绑定到明确 build ID 和时间。

## 18. 最终判断

当前仓库的主要问题已经从“功能缺失”转变为“功能、测试、构建、运行实例和文档状态没有形成一致交付”。

从使用者角度，最直观的事实非常简单：

```text
打开正式地址后是空白页。
```

在这个 P0 问题解决之前，任何 Provider、项目目录、Skills、RAG、Task Agent、移动端或预览能力都不能被正式用户使用。与此同时，正式旧后端仍然匿名返回项目和配置元数据，使“前端不可用”与“后端仍暴露”同时发生。

因此，下一阶段不应继续横向增加新功能。应先恢复一个浏览器真正可运行、后端真正安全、版本真正一致、核心论文流程可以被 Playwright 实际完成的发布候选；之后再逐项提升 Skills、RAG、CLI Task 和复杂论文工作流的成熟度。
