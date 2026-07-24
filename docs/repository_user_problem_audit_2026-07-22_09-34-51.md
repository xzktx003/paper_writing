# paper_wrighting 当前仓库用户问题与改进审计

- 审计时间：2026-07-22 09:34:51（Asia/Shanghai）
- 仓库：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting`
- 正式地址：`http://10.30.0.22:8787`
- 审计视角：首次使用者、日常论文作者、系统管理员、后续维护者
- 审计边界：只发现问题、验证问题并提出优化方法；未修改业务代码、运行配置、正式项目数据，未重启服务，未调用真实付费模型
- 证据来源：正式 LAN Playwright、隔离 Playwright、正式 HTTP/API 探针、进程环境、文件系统、当前源码、测试与现有文档

## 1. 结论先行

当前仓库不能再简单描述为“缺少 Codex/Copilot、没有 RAG、没有 Skills 管理”。这些方向在当前源码中已经有实质实现：

- Provider 已包含 OpenAI-compatible、Anthropic、Codex CLI、Claude Code CLI、GitHub Copilot CLI；
- 普通只读 Chat 与可修改文件的 CLI Task Agent 已经分离；
- 项目已经引入稳定 ID、可读目录名、显式注册已有目录与目录重命名逻辑；
- RAG 已经具备索引健康、generation、fingerprint、损坏诊断、外部来源状态；
- Skills 已有 readiness、dry-run、last-run、成本和副作用元数据；
- 当前源码的隔离 Playwright 套件 26/26 通过。

但从真实用户角度，当前正式系统仍然不能交付使用。最主要的问题是四个“事实层”没有统一：

```text
当前工作区源码
≠ 当前 frontend dist
≠ 正式 8787 后端进程
≠ 用户真正存放论文的仓库 papers/ 目录
```

本轮最重要的实测结论如下：

1. 正式桌面、手机、平板入口均被 `missing-build-metadata` 阻断，用户无法进入项目列表、编辑器、Provider、Skills 或 RAG。
2. 正式页面所有中文都显示为方框；CSS 中写有中文字体名称，但浏览器没有得到真实 CJK 字形。
3. 正式后端仍是旧版本：`/api/ready` 为 404，`/api/health` 返回 `authRequired:false`，无 Token 和错误 Token 都可以读取项目、配置、Provider 和 Skills。
4. 正式数据根是 `/data01/home/xuzk/papers`，仓库实际论文目录是 `paper_wrighting/papers`。前者只有 4 个子目录，后者有 15 个，因此“页面上的项目与 papers 子文件夹对不上”仍是当前运行事实。
5. 当前源码的隔离浏览器 26/26 通过，说明大部分整改代码可以运行；正式站点失败说明问题集中在发布、启动、配置和运行态一致性，而不是单纯缺少组件。
6. Codex、Claude、Copilot CLI 均已安装，但现有自动化没有证明三个真实 CLI 已登录、能从正式 UI 调用、能稳定解析结果，或能完成真实论文任务。
7. Skills 共 123 个，加载错误为 0，但 123/123 都是 `degraded`，执行元数据全部来自推断，123/123 的 `lastRun` 都是 `never`。
8. 本地 RAG 明确是关键词/词项重叠检索，不是语义向量 RAG；对同义词、跨语言和无字面重叠的问题，召回能力有限。
9. 当前还存在旧绝对路径项目 API、自动安装 TeX 包、启动脚本竞争、RAG Vision 配置断链等源码级风险，不能因为单测和隔离 E2E 通过就忽略。

综合判断：

| 维度 | 当前状态 | 用户含义 |
| --- | --- | --- |
| 当前源码实现 | 大部分核心能力已存在 | 不应重复从零实现 Provider、项目身份、RAG health 等功能 |
| 隔离浏览器验证 | 26/26 通过 | 临时数据根、随机 Token 环境下主要功能可运行 |
| 正式 LAN 入口 | 失败 | 所有真实用户被版本门禁阻断 |
| 正式安全边界 | 失败 | 旧后端匿名暴露项目与配置元数据 |
| 正式数据一致性 | 失败 | UI 使用的数据根不是仓库 `papers/` |
| 中文可读性 | 失败 | Playwright 截图为方框字形 |
| CLI Provider 真实验收 | 未完成 | 代码存在，真实登录、调用与兼容性未知 |
| Skills 真实就绪 | 未完成 | 目录可加载不等于任务可成功执行 |
| 发布结论 | **BLOCK** | 当前版本不应标记为正式可用或“全部问题已完成” |

## 2. 本轮实际验证

### 2.1 正式 LAN Playwright：三个视口全部被阻断

本轮使用真实 Chromium 访问 `http://10.30.0.22:8787/projects`，而不是只读源码或只看单测。

| 设备 | 视口 | HTTP | 页面结果 | 横向溢出 | Console/Page error |
| --- | ---: | ---: | --- | --- | --- |
| Desktop | 1440×900 | 200 | `前后端版本不一致 / missing-build-metadata` | 无 | 无 |
| Mobile | 390×844 | 200 | 同上 | 无 | 无 |
| Tablet | 768×1024 | 200 | 同上 | 无 | 无 |

三种视口正文一致：

```text
前后端版本不一致
当前页面与服务器不是同一次构建。为避免使用旧接口修改论文，工作区已暂停加载。
missing-build-metadata
Frontend build 20260722012118-f0ef1484486e-17ac314b is not compatible with the running backend.
```

截图证据：

- `/tmp/paper-wrighting-audit-20260722-0932-desktop.png`
- `/tmp/paper-wrighting-audit-20260722-0932-mobile.png`
- `/tmp/paper-wrighting-audit-20260722-0932-tablet.png`

结论应分成两层：

- **证据：** 部署门禁本身生效，避免新前端误用旧后端修改论文。
- **用户结果：** 正式系统仍然完全不可操作，不能因为“门禁按设计工作”就把正式验收判为成功。

### 2.2 中文字体 Playwright：CSS 声明存在，但真实字形缺失

Playwright 读取到的 body 字体栈是：

```text
Inter, "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", ...
```

但三张正式截图中所有中文均显示为方框。当前入口 `app/apps/frontend/src/main.tsx:1-9` 只导入应用 CSS，没有导入已经安装的 `@fontsource/noto-sans-sc`；依赖虽已写入 `app/apps/frontend/package.json:20`，却没有进入浏览器字体加载链路。

现有字体测试也存在假绿风险：

- `app/tests/offlineFonts.test.mjs:15-19` 只检查 CSS 字符串包含字体名称；
- `app/tests/e2e/offline-fonts.spec.ts:24-29` 只检查 computed `font-family` 包含这些名称；
- 两者都没有确认字体资源请求成功、`document.fonts.check()` 返回 true，或中文 glyph 实际可渲染。

因此“字体名出现在 CSS 中”不能作为“中文字体可用”的证据。

### 2.3 正式 API 探针：运行的是旧鉴权与旧 health 契约

正式进程：

```text
listener: 0.0.0.0:8787
backend PID: 575763
supervisor: scripts/run-server.sh
OPENPRISM_PROJECTS_DIR=/data01/home/xuzk/papers
OPENPRISM_API_TOKEN: absent
```

实际返回：

| 请求 | 无 Token | 错误 Token | 当前用户影响 |
| --- | ---: | ---: | --- |
| `/api/health` | 200，`authRequired:false` | 200 | 正式后端没有当前 build metadata |
| `/api/ready` | 404 | 404 | 当前 readiness 契约未部署 |
| `/api/projects` | 200 | 200 | 匿名读取项目 ID、名称、目录名和状态 |
| `/api/config` | 200 | 200 | 匿名读取 Provider、模型、Base URL、本机路径等配置事实 |
| `/api/providers` | 200 | 200 | 匿名读取 Provider 能力元数据 |
| `/api/skills` | 200 | 200 | 匿名读取完整 Skill 目录 |
| `/api/capabilities` | 503 | 503 | 这一危险面保持 fail-closed |

这说明当前正式运行态并不是当前源码所描述的 default-deny 版本。源码修复已经存在，不等于用户访问的服务已经安全。

### 2.4 项目根目录对比：问题是“根目录指错”，不只是显示名问题

文件系统实测：

```text
/data01/home/xuzk/papers
  4 个子目录

/data01/home/xuzk/workspace/ai_agent/paper_wrighting/papers
  15 个子目录
```

正式 `/api/projects` 只返回 2 个 managed 项目，其中一个还处于 trashed 状态。仓库 `papers/` 中的 `MSAVQ`、`moe_prune_v2`、`paper-agent-spe`、`torq` 等论文并不在正式服务的数据根内。

因此用户看到的“工程名称、工程数量、文件夹名称对不上”至少包含三种不同现象：

1. 正式服务扫描的是另一个根目录；
2. managed project 的显示名、稳定 ID 和目录名本来就是三个不同字段；
3. 仓库论文目录中还有未注册目录、缓存目录和测试遗留目录。

当前源码已经让 UI 展示项目 ID 和存储目录，并提供“发现并注册已有目录”流程；但正式服务未部署这份版本，且数据根仍未统一，所以问题在用户现场仍然存在。

### 2.5 当前源码隔离 Playwright：26/26 通过

本轮直接运行：

```bash
cd app
node scripts/run-e2e-isolated.mjs --reporter=line
```

结果：26/26 通过，使用随机端口、临时 `/tmp/.../papers` 数据根和随机 API Token。覆盖包括：

- 项目列表、搜索、创建、打开、删除；
- 显式注册已有论文目录；
- 手机和平板工作区；
- Token 首次应用、受保护资源预览和下载；
- RAG health、损坏索引与外部来源状态；
- Skills readiness；
- Draw.io 离线 XML fallback；
- CLI Task Agent 的 Diff、Reject、Accept；
- 部署 build mismatch 门禁。

这批结果证明“当前源码大部分能力可以运行”，但不能替代正式服务、真实数据根、真实 CLI、真实外部网络和真实编译工具链验收。

### 2.6 CLI、Skills、依赖状态

本机 CLI 只读版本探针：

```text
codex    codex-cli 0.144.6
claude   2.1.139 (Claude Code)
copilot  GitHub Copilot CLI 1.0.73
```

这只证明 executable 存在，不证明登录成功或实际调用成功。

Skills 当前状态：

```json
{
  "count": 123,
  "loadErrors": 0,
  "readiness": { "degraded": 123 },
  "lastRuns": { "never": 123 },
  "metadataSources": { "inferred": 123 }
}
```

依赖审计：`npm audit --json` 当前为 0 个已知漏洞。这是积极结果，但不能覆盖应用自身鉴权、路径、进程和配置边界问题。

## 3. 问题优先级总表

| 编号 | 优先级 | 问题 | 证据类型 | 当前影响 |
| --- | --- | --- | --- | --- |
| P0-1 | P0 | 正式前后端版本不一致，所有真实用户被门禁阻断 | LAN Playwright + API | 整个正式工作区不可用 |
| P0-2 | P0 | 正式旧后端无 Token/错误 Token 仍开放项目、配置和 Skills | HTTP 实测 | 局域网信息暴露 |
| P0-3 | P0 | 正式数据根与仓库 `papers/` 完全不同 | 进程环境 + 文件系统 + API | UI 项目与真实论文不一致 |
| P0-4 | P0 | supervisor 与 `restart.sh` 可能竞争启动同一端口 | 进程 + 脚本证据 | 重启可能报告成功但仍运行旧后端 |
| P0-5 | P0 | 旧 `/api/paper/*` 继续接受绝对路径，绕过 managed project 身份，并存在 symlink 越界风险 | 源码证据 + 高置信推断 | 重新产生第二套项目模型和路径边界风险 |
| P1-1 | P1 | 中文字体真实缺失，页面显示方框 | Playwright 截图 + 源码 | 中文用户无法阅读界面 |
| P1-2 | P1 | 三套启动入口的 env、端口、CA、数据根语义不一致 | 脚本/配置证据 | 同仓库不同命令启动出不同系统 |
| P1-3 | P1 | 发布不是原子操作，前端可先更新而后端仍旧 | 运行态实测 + 脚本 | 再次出现 build mismatch 的概率高 |
| P1-4 | P1 | RAG Vision 路由读取 `fastify.appConfig`，但注册时未注入该对象 | 源码证据 | 设置页新配置可能对图片理解不生效 |
| P1-5 | P1 | 编译缺包时会无确认执行 `tlmgr install`，最多五次 | 源码证据 | 普通编译可能修改主机 TeX 环境 |
| P1-6 | P1 | Provider `available` 只表示服务器策略允许，不表示已安装/已登录/可调用 | 源码 + 测试边界 | 用户可能选中后到首次调用才失败 |
| P1-7 | P1 | CLI Provider 自动化使用说明页和 mock Task Agent，真实三 CLI 未验收 | Playwright/测试证据 | “代码支持”不等于正式可用 |
| P1-8 | P1 | 123 个 Skills 全部 degraded，且从未真实执行 | 运行时只读审计 | Skill 数量大但可信可用性低 |
| P1-9 | P1 | 模板 manifest 损坏时 `/api/ready` 可能仍为绿，错误被静默吞掉 | 源码证据 | 模板消失但用户不知道原因 |
| P2-1 | P2 | 本地 RAG 是词法重叠，不是语义向量检索 | 源码/契约 | 同义词、跨语言和概念查询召回有限 |
| P2-2 | P2 | Skill 的 `success` 只证明模型请求成功，不证明 Skill 目标完成 | 源码证据 | 用户容易把“调用完成”误解为“科研任务已验证” |
| P2-3 | P2 | Project Locator 正常请求会 O(N) 扫描全部项目 metadata | 源码证据 | 项目多或网络盘时延迟会放大 |
| P2-4 | P2 | 多项关键功能只有单测/静态契约，没有真实浏览器旅程 | 测试覆盖分析 | 自动化绿灯仍可能漏过用户回归 |
| P2-5 | P2 | Playwright 直接入口与隔离 runner 的动态库环境不一致 | 实际启动失败 + runner 源码 | 开发者直接跑测试时先遇到环境错误 |
| P2-6 | P2 | 工作区极度 dirty，同日多份状态文档互相覆盖 | Git/文档证据 | 发布不可复现，旧结论容易被误用 |
| P3-1 | P3 | 多个核心模块过大，职责集中 | 文件规模 | 修改成本和回归面持续增加 |
| P3-2 | P3 | 模板发现、RAG 外部源和部分兼容逻辑错误处理过度静默 | 源码证据 | 用户只看到“没有结果”，难以诊断 |
| P3-3 | P3 | 未使用的 `resolveProjectReference()` 默认允许 legacy path | 源码证据 | 未来调用方容易误用危险兼容入口 |

## 4. 重点问题、原因与优化方法

### P0-1/P0-2：正式服务不是当前源码版本

**证据：高置信。** 当前源码已有 `/api/ready`、build metadata 和 default-deny 鉴权；正式服务却没有这些行为。

优化方法：

1. 把 frontend、backend、build ID、API schema 作为同一发布单元；
2. 发布前在 staging 目录完成构建，不要直接覆盖当前服务正在读取的 `dist`；
3. 新后端启动并通过 `/api/ready` 后，再原子切换静态资源；
4. 发布命令必须核对 frontend build ID 与 backend build ID，一致才成功；
5. 正式验收必须同时检查无 Token、错误 Token、正确 Token 三条路径；
6. 旧验收文档应绑定 build ID、PID、启动时间和 dirty hash，任一变化后自动标记 stale。

验收标准：正式桌面、手机、平板能进入项目页；`/api/ready` 返回 200；无 Token 不能读取受保护业务数据；前后端 build/schema 一致。

### P0-3：工程、目录与数据根不一致

**证据：高置信。** 正式根 `/data01/home/xuzk/papers` 与仓库 `papers/` 是两个不同目录。

当前源码已经改善了项目身份模型：项目显示名、稳定 UUID 和真实目录名可以不同，重命名会迁移目录并更新 `updatedAt`。因此优化重点不是重新把三者强行做成同一个字符串，而是让用户明确知道它们的关系，并确保唯一权威根目录。

优化方法：

1. 明确一个 authoritative data root；
2. 首次启动显示当前数据根并要求管理员确认；
3. 项目列表持续显示“名称 / ID / 存储目录”；
4. 对 root 中未注册的论文目录展示“待注册”，不自动写 metadata；
5. 增加数据根迁移/导入工具，先预览差异再执行；
6. 默认排除 `.pytest_cache`、测试目录和隐藏缓存；
7. 发布验收必须对比 API 返回的 `projects_dir` 与预期真实目录。

### P0-4：两个生命周期所有者可能互相竞争

`scripts/run-server.sh:29-43` 是无限重启 supervisor；`scripts/restart.sh:31-52` 只杀 Node 子进程，然后自行启动另一个 Node。它不会停止 supervisor。

高置信推断：执行 `restart.sh` 时，supervisor 与 restart 脚本可能同时拉起后端并竞争 8787。`restart.sh:85-102` 只看 health 是否返回 `ok:true`，可能命中了不是自己启动的进程。

优化方法：生产环境只能有一个生命周期所有者。统一为 systemd/supervisor 或单一 launcher；restart 必须验证监听 PID、cwd、build ID、ready 和 schema，而不是只检查一个模糊 health。

### P0-5：旧 `/api/paper/*` 重新引入第二套项目模型

`app/apps/backend/src/routes/paperProjects.js:5-31` 仍允许客户端提交绝对 `path`；`app/apps/backend/src/index.js:91` 无条件注册这些路由。它们只使用 `paper.yaml`，不会生成 managed project 的 `project.json`。

此外，`app/apps/backend/src/utils/pathSecurity.js:35-41` 的 `assertWithinDataDir()` 只做字符串前缀检查，没有像 `safeJoin()` 那样检查路径组成部分中的符号链接。

优化方法：

1. 默认关闭 `/api/paper/*`，或迁移为只接受 `projectId`；
2. 如必须保留兼容，使用同一 Project Locator 和 metadata identity；
3. 对 realpath 与每个路径组成部分做 symlink 检查；
4. 增加“数据根内 symlink 指向根外”攻击回归测试；
5. 给兼容 API 明确弃用时间、调用计数和迁移文档。

### P1-1：中文字体测试验证了“名称”，没有验证“字形”

优化方法：

1. 从前端入口明确导入本地 Noto Sans SC 字体资源；
2. 只打包实际使用的字重和中文子集；
3. E2E 等待 `document.fonts.ready`；
4. 断言字体资源请求 200、`document.fonts.check('16px Noto Sans SC', '中文测试')` 为 true；
5. 用固定中文 glyph probe 或截图基线阻止方框字体假绿；
6. 保持禁止 Google Fonts、jsDelivr 等远程字体依赖。

### P1-2/P1-3：启动与发布入口不一致

当前存在：

- `app/package.json:21`：同时加载根 `.env` 和 `app/.env`；
- `scripts/run-server.sh:7-16`：只 source 根 `.env`，使用 `OPENPRISM_PORT`；
- `scripts/restart.sh:15-49`：不加载 `.env`，硬编码 8787，并使用 `PORT`；
- `restart.sh` 停服务后才构建，构建失败会造成停机；
- 正式后端固定监听 `0.0.0.0`，脚本展示地址则由另一套变量决定。

优化方法：保留一个生产 launcher，其他入口都调用它；统一 env 加载顺序、Token、data root、host、port、CA 和 build ID；先构建和验证，再切换进程；输出脱敏的配置来源摘要。

### P1-4：RAG Vision 配置链断开

`app/apps/backend/src/routes/paperRag.js:130-135` 和 `177-188` 从 `fastify.appConfig` 读取配置；但 `app/apps/backend/src/index.js:105` 注册 RAG routes 时没有传入 `appConfig`，也没有看到 decorate。设置页保存后普通 LLM 会重新初始化，但 RAG Vision 可能仍只看到启动时环境变量。

优化方法：所有模型能力统一通过 Provider registry/config service 获取当前配置；RAG route 不直接读取 Fastify 隐式属性或裸环境变量。增加“启动后在设置页切换 Provider/模型，再立即执行 vision probe”的集成与浏览器测试。

### P1-5：编译会隐式改变主机工具链

`app/apps/backend/src/services/compileService.js:70` 允许最多五次自动安装；`168-185` 会执行 `tlmgr search/install`。API 没有 `allowPackageInstall` 字段。

优化方法：默认只报告缺包和建议命令；只有用户明确勾选“允许本次安装”才执行；显示安装位置、包名、网络行为和回滚边界；生产环境可提供禁用自动安装的策略开关。

### P1-6/P1-7：CLI Provider 已实现，但真实可用性仍未知

积极证据：Codex Chat 使用 read-only sandbox，Claude/Copilot 禁用 tools，修改项目的 Task Agent 在隔离快照中执行，并要求 Diff 审查后 Accept。

当前缺口：

- `agentProviderRegistry.js:368-374` 中 CLI 的 `available` 只取决于服务器是否设置 API Token；
- executable 与登录态只在主动 probe 时检查；
- `provider-onboarding.spec.ts:3-17` 只验证说明文案和选择框；
- `cli-task-agent.spec.ts:22-24` 使用 `mock-cli`，没有调用真实 Codex/Claude/Copilot；
- CLI 不支持稳定模型列表，stream 实际是一次性 invoke 包装；
- 本轮只验证了三个 CLI 的版本，未调用真实模型。

优化方法：把状态拆成 `enabledByPolicy / installed / authenticated / invokeReady / lastProbeAt`；正式验收对三个 CLI 各做一次无写权限的最小真实调用，并记录版本与响应 schema；真实 Task Agent 应在专用测试项目和明确成本上限内验收。

### P1-8/P2-2：Skills 的目录规模大，但可执行与有效性没有闭环

当前 123 个 Skill 都是 `degraded`、`metadataSource=inferred`、`lastRun=never`。前端只禁止 unavailable，degraded 仍可选。AI route 在整个模型请求成功后，把所有 applied Skills 统一记为 success；这只证明请求没有报错，不证明 Skill 目标达成。

优化方法：

1. 为高频 Skill 补显式 requirements、网络、凭证、输入/输出、成本和副作用；
2. 把状态拆成 `prompt_applied / provider_completed / artifacts_verified / objective_passed`；
3. 为引用核验、格式检查、实验审计等 Skill 增加专属 evaluator；
4. 先治理 10—20 个核心 Skill，不追求“123 个都显示可用”；
5. UI 应显示最近一次真实运行、产物、失败原因和验证层级。

### P1-9：模板 readiness 只检查文件存在

`app/apps/backend/src/routes/health.js:18-25` 只 access manifest；`templateService.js` 对 JSON 解析、扫描和入口检测多处静默 catch。结果可能是 `/api/ready` 为绿，但模板列表变空。

优化方法：readiness 必须实际解析 manifest、验证 schema、逐项验证 mainFile；错误要进入结构化 diagnostics，不能吞掉。每个内置模板至少完成“UI 创建 → 文件树 → 真实编译 → PDF”矩阵验收。

### P2-1：RAG 功能已经可解释，但还不是用户通常期待的语义 RAG

`docs/paper_rag_contract.md:35` 和 `paperRagService.js` 明确声明 `local-keyword-overlap`、`semantic=false`。这是诚实的设计，但能力边界明显。

优化方法：保留当前词法检索作为离线、可解释基线，增加可选 embedding + BM25/词法混合检索；记录 embedding model、维度、generation 和 corpus fingerprint；建立真实论文查询集评测 recall@k、MRR、引用定位正确率和跨语言召回。

### P2-3：项目定位是线性扫描

`app/apps/backend/src/services/projectLocator.js:103-119` 在目录名不等于完整项目 ID 时遍历整个数据根并逐个读取 `project.json`。新目录默认是可读 slug + 短 ID，因此正常请求经常进入扫描路径。

优化方法：维护原子 `projectId → directoryName` 索引，或建立有失效策略的内存缓存；创建、注册、重命名、删除时更新；提供索引重建和一致性检查。

### P2-4：仍缺少的真实用户旅程

现有 26 项 Playwright 已经比早期可靠很多，但以下仍主要依赖单测、API 测试或字符串契约：

1. 项目重命名后，UI 名称、磁盘目录和 `updatedAt` 同步，并验证目标冲突；
2. 刷新浏览器后恢复活动会话；
3. 从 UI 创建真正空白项目并核对文件树；
4. 每个 bundled template 的创建与真实编译；
5. 本地 RAG 从添加语料、构建索引、输入查询到命中来源的完整旅程；
6. 真实文件树不显示 `.openprism`、`.compile`、`research_corpus`；
7. Legacy Workbench 默认 404，以及显式启用后的明显标识；
8. Draw 路径穿越、跨项目访问和存储残留的真实浏览器/API 攻击路径；
9. 三个真实 CLI Provider 的登录探针与最小 invoke；
10. 中文 glyph 真实渲染，而非 font-family 字符串检查。

### P2-5：Playwright 环境握手仍不统一

直接启动 Playwright Chromium 会缺少 `libatk-1.0.so.0`；隔离 runner 则在 `app/scripts/run-e2e-isolated.mjs:14,61-76` 自动注入仓库 `.playwright-deps`。因此 `npx playwright test`、预检脚本和隔离 runner 的结果可能不同。

优化方法：所有 E2E 入口复用同一个浏览器环境解析器；预检也使用相同 `LD_LIBRARY_PATH`；失败时区分产品失败与浏览器依赖失败。

### P2-6/P3-1：可复现性和维护成本

当前工作区有大量 tracked/untracked 修改，同一天存在多份“已完成”“仍阻断”的审计与状态文档。核心文件规模也较大：

```text
paperWorkbenchService.js  7687 行
paperRagService.js        2797 行
skillEngine.js            2424 行
LatexPreview.tsx          1280 行
DrawPanel.tsx             1111 行
ProjectPage.tsx           1061 行
SkillsSelector.tsx         938 行
```

优化方法：

- 发布证据绑定 commit + dirty diff hash + build ID；
- 状态文档采用机器可读 manifest，并能自动失效；
- 按领域拆分 RAG、Workbench、Skills 和预览模块；
- 优先拆失败模式和状态所有权，不做纯文件搬家式重构；
- 保持回归测试后再逐步缩小模块。

## 5. 与原始问题的当前对应关系

### “可以直接使用 Codex 或 Copilot 完成任务”

当前源码已经有 Codex、Claude、Copilot CLI Provider，也有隔离快照的 CLI Task Agent。因此优化方向不是再增加一个简单下拉框，而是完成：

- 正式部署；
- 服务 Token；
- 安装/登录/可调用状态分离；
- 真实 CLI 兼容验收；
- 成本、超时、取消和 provenance 展示；
- Chat 只读与 Task 写入权限的清晰分界。

### “新建工程和 papers 子文件夹名字对不上”

当前源码采用“显示名 + 稳定 ID + 可读目录名”三层身份，这是合理设计，不应简单要求三个值完全相同。真正未解决的是：

- 正式服务的数据根指向了另一个目录；
- 用户没有一个清晰的根目录确认和迁移流程；
- 未注册目录、测试目录和 managed 项目混杂；
- 正式版本没有部署，用户看不到新的 ID/目录展示和注册流程。

### “其他 Skills、RAG 等系统有待完善”

判断完全成立，但应拆成可验证目标：

- Skills：从“目录能加载”升级为“依赖可检查、执行可追踪、产物可验证、目标可评价”；
- RAG：从“关键词 overlap”升级为“词法 + embedding 混合检索”，并有真实论文任务评测；
- Provider：从“选项存在”升级为“已安装、已登录、可调用、可取消、结果兼容”；
- 模板/编译：从“mainFile 存在”升级为“每模板真实创建和编译”；
- 发布：从“代码和测试分别通过”升级为“同一 build 在正式 LAN 完成用户旅程”。

## 6. 建议实施顺序

### 第一阶段：恢复正式可用与安全边界

1. 统一生产生命周期所有者，消除 supervisor/restart 竞争；
2. 统一唯一生产 launcher 和 env 加载；
3. 统一 authoritative data root；
4. 配置正式 API Token；
5. 原子部署当前前后端并核对 build/schema/ready；
6. 修复并验证本地 CJK 字体；
7. 完成 desktop/mobile/tablet 正式 LAN 验收。

### 第二阶段：关闭源码级高风险缺口

1. 关闭或迁移 `/api/paper/*`；
2. 补 symlink 越界防护；
3. 让 RAG Vision 使用统一 Provider/config；
4. TeX 自动安装改为显式确认；
5. readiness 实际解析模板；
6. Provider 状态拆分并持久化 probe 结果。

### 第三阶段：补用户旅程和可信能力

1. 增加项目重命名、会话恢复、空白项目、内部目录隐藏 E2E；
2. 建立全部模板创建/编译矩阵；
3. 三个真实 CLI 各做最小调用验收；
4. 选择核心 Skills 增加 evaluator；
5. 建立 RAG 查询评测集和混合检索。

### 第四阶段：可维护性与性能

1. Project Locator 建索引；
2. 拆分 paperRagService、paperWorkbenchService、skillEngine；
3. 统一 Playwright 环境握手；
4. 发布证据机器化并自动失效；
5. 清理测试遗留目录与过期审计文档。

## 7. 需要明确保留的未知项

在“不修改正式数据、不重启、不调用付费模型”的边界下，本轮不能确认：

- Codex、Claude、Copilot 当前是否已经登录；
- 三个真实 CLI 的最小模型调用是否成功；
- 当前 LLM 网关的真实模型质量、费用和超时；
- 全部 123 个 Skills 的任务级有效性；
- RAG 在真实论文语料上的 recall/precision；
- 每个 bundled template 在当前 TeX 工具链上的真实编译结果；
- `tlmgr install` 实际修改用户级还是系统级 TeX；
- 是否还有外部客户端依赖 `/api/paper/*`；
- 生产重启后 Token、data root、build ID 和 CLI 状态是否一致。

这些项不能写成“已完成”，也不能写成“确定失败”；应在后续实施阶段用受控测试逐项消除未知。

## 8. 最终判断

当前仓库的主要矛盾已经不是“完全没有功能”，而是：

```text
功能实现速度
>
发布一致性、真实用户验收、能力就绪度和长期可维护性
```

短期最优先事项不是继续堆叠新面板，而是先让当前已有功能以同一个 build、同一个数据根、同一个鉴权契约和可读中文字体稳定交付。之后再把 Codex/Copilot、Skills 和 RAG 从“入口存在”推进到“真实可调用、结果可验证、失败可解释”。

在完成正式重启、数据根统一、Token 配置、CJK 字体和多视口 LAN 验收之前，当前版本应保持 **BLOCK / 不可正式交付** 状态。
