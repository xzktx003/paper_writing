# paper_wrighting 当前仓库问题与用户体验复审

- 复审时间：2026-07-22 09:10 至 09:22（Asia/Shanghai）
- 复审对象：`/data01/home/xuzk/workspace/ai_agent/paper_wrighting` 当前工作树与正式 `8787` 服务
- 基准清单：`docs/repository_user_audit_2026-07-22_00-17-09.md` 中 P0-1 至 P3-5，共 29 项
- 复审方式：源码与测试证据审阅、隔离 API 集成测试、隔离 Playwright、正式 LAN Playwright、正式运行态 API 探针、进程与构建时间核对
- 变更边界：未修改产品源码、配置、服务进程或用户论文数据；仅新增本报告。`npm run test:e2e` 按仓库既有脚本执行了生产构建，因此刷新了前端 `dist` 构建产物。
- 特别保护：未改动用户已有修改 `papers/paper-agent-spe/project.json`

## 1. 结论先行

当前仓库不能简单描述为“29 项问题已经全部完成”。更准确的结论是：

1. **源码层面已经完成了大部分整改，架构质量明显提升。** 项目身份统一、RAG、CLI Provider、移动端、Skills readiness、能力诊断、离线预览、鉴权和构建握手等都有真实实现与自动化证据。
2. **当前正式局域网服务对用户不可用。** Playwright 实测 `http://10.30.0.22:8787/projects`，桌面和手机均只显示“前后端版本不一致 / missing-build-metadata”，项目列表和编辑器被版本门禁主动阻断。
3. **源码安全状态与正式后端状态不一致。** 当前源码默认保护 `/api/projects` 和 `/api/config`；正式 `8787` 后端却仍允许无 Token 读取这两个接口，并且 `/api/ready` 为 404，说明正式后端仍是旧版本。
4. **当前工作树的代码门禁已经转绿。** `npm run check` 完整通过：73 个测试文件、418 项 unit 全绿；14 项 integration 与 26 项 Playwright 也通过。此前观察到的下载测试过时断言已在复审期间由并行整改修正。
5. **已有整改状态文档存在过期和过度结论。** `docs/repository_audit_remediation_status_2026-07-22.md` 仍写着全量单测通过、正式服务已重启和 LAN Playwright 通过，但这些结论早于当前源码与构建，已不能代表现在的正式服务。

因此本次复审给出的总状态是：

| 维度 | 当前判断 | 说明 |
| --- | --- | --- |
| 源码实现 | **大部分完成，少数部分完成** | 29 项中多数已有实现和专项测试 |
| 类型检查/生产构建 | **通过** | 当前生产构建成功；初始 JS chunk 均低于 500 KiB |
| 单元测试门禁 | **通过** | 73 个测试文件、418 项 unit 全绿 |
| API 集成测试 | **通过** | 14/14 |
| 隔离浏览器 E2E | **通过** | 26/26，随机 Token、临时数据根、随机端口 |
| 正式服务部署 | **未完成** | 8787 后端进程启动于 02:56，早于 04:15—09:10 的关键源码和构建 |
| 正式 LAN 用户验收 | **失败** | 桌面、手机均被构建版本门禁阻断 |
| 发布结论 | **BLOCK** | 代码门禁已绿，但当前版本尚未部署，正式 LAN 仍不可用 |

## 2. 本次真实验证结果

### 2.1 隔离 Playwright：当前工作树功能可以运行

执行：

```bash
cd app
npm run test:e2e
```

最终增量复跑结果：**26/26 通过**，耗时约 14.7 秒。测试使用：

- 随机临时端口；
- `/tmp/paper-wrighting-e2e-*/papers` 临时数据根；
- 每次生成独立随机 API Token；
- Playwright Chromium；
- CLI Task 使用 mock，不调用真实付费模型。

实际覆盖的用户路径包括：

- 项目列表、搜索、创建、打开、删除；
- 发现并显式注册已有论文目录；
- phone/tablet 工作区；
- 前后端构建身份不一致时阻断工作区；
- 系统能力诊断；
- 离线字体与主要面板国际化；
- Markdown/LaTeX 懒加载预览；
- RAG 健康状态、损坏索引与显式修复；
- 外部 RAG 来源失败与成功但无结果两类状态的明确区分；
- Provider onboarding；
- 真实浏览器 Token 解锁、受保护资源预览和下载；
- CLI Task Agent 的 Diff/Reject/Accept；
- Skill readiness；
- Draw.io 网络失败后的离线 XML fallback。

这证明当前工作树不是“功能完全坏掉”，而是已经具备相当强的隔离验证能力。

### 2.2 正式 LAN Playwright：当前用户入口不可用

使用 Chromium 分别访问：

- `http://127.0.0.1:8787/projects`，1440×900；
- `http://10.30.0.22:8787/projects`，1440×900；
- `http://10.30.0.22:8787/projects`，390×844。

三种场景均返回 HTTP 200，但页面正文均为：

```text
前后端版本不一致
当前页面与服务器不是同一次构建。为避免使用旧接口修改论文，工作区已暂停加载。
missing-build-metadata
Frontend build 20260722012118-f0ef1484486e-17ac314b is not compatible with the running backend.
管理员需要重新构建并重启前后端服务，然后再刷新页面。
```

补充结果：

- `html.lang = zh-CN`；
- 桌面和手机都没有横向溢出；
- 无浏览器 console error；
- 无 requestfailed；
- 但项目列表、设置、RAG、Skills、编辑器等正式功能均无法进入。

**判断：** 版本门禁本身工作正常，避免了新前端调用旧后端并修改论文；但从用户角度，正式服务目前就是不可用状态。

### 2.3 正式后端运行态探针

正式监听进程：

```text
0.0.0.0:8787
supervisor PID 575751: bash scripts/run-server.sh
backend PID 575763: node src/index.js
backend started: 2026-07-22 02:56:52
cwd: app/apps/backend
```

关键源码/构建修改时间：

```text
apps/backend/src/config/buildInfo.js       04:15
apps/backend/src/middleware/auth.js        04:19
apps/backend/src/index.js                  09:00
apps/frontend/dist/index.html              09:10 左右重新构建
```

正式 API 实测：

| 请求 | 正式 8787 返回 | 当前源码预期 | 判断 |
| --- | --- | --- | --- |
| `GET /api/health` | 200，只有 `ok`、`authRequired:false` | 应包含 build id/version/schema/start time | 旧后端 |
| `GET /api/ready` | 404 | 应返回 readiness checks | 旧后端 |
| `GET /api/providers` | 200，CLI `stream:true`、HTTP `cancel:true` | 当前源码是 CLI `stream:false`、HTTP `cancel:false` | 旧 Provider contract |
| `GET /api/projects`，无 Token | 200，返回项目元数据 | 当前源码应 503 | 旧鉴权边界 |
| `GET /api/config`，无 Token | 200，返回模型、Base URL 和本机路径等配置 | 当前源码应 503 | 旧鉴权边界与信息暴露 |
| `GET /api/capabilities`，无 Token | 503 | 当前源码无 Token 也应受保护 | 此危险面已 fail-closed |
| `POST /api/code/exec`，空请求、无 Token | 503 | 当前源码无 Token 应受保护 | 此危险面已 fail-closed |

**证据结论：** 正式运行态不是完全回到了最初“任意命令可无鉴权执行”的状态，但它也不是当前源码所描述的 default-deny 版本。项目列表和配置仍对整个局域网匿名开放，并暴露项目元数据、模型配置、Base URL 和主机文件路径。

### 2.4 当前测试和构建门禁

| 验证 | 结果 |
| --- | --- |
| TypeScript `tsc --noEmit` | 通过（当前 `npm run check` 的前置阶段已通过） |
| Vite 生产构建 | 通过 |
| 最大初始 JS chunk | `index` 约 435.59 KiB，低于 500 KiB预算 |
| `EditorPage` | 约 131.27 KiB，gzip 34.18 KiB |
| API integration | 14/14 通过 |
| Playwright E2E | 26/26 通过 |
| `projectTreeCreateUi.test.mjs` | 5/5 通过 |
| 全量 `npm run check` | **通过：73 files / 418 tests** |

复审过程中曾观察到 `projectTreeCreateUi.test.mjs` 仍断言旧实现 `link.download = ...`，而产品代码已经使用认证下载 helper。并行整改随后把测试更新为验证 `downloadAuthenticatedFile(...)`，最终 5/5 和全量 418/418 均通过。该时间线仍说明：测试与实现同步必须被发布门禁及时捕获，但它已经不是最终工作树的未关闭问题。

## 3. 当前最重要的问题排名

| 排名 | 问题 | 严重度 | 置信度 | 直接影响 |
| ---: | --- | --- | --- | --- |
| 1 | 正式前后端版本不一致，工作区被完全阻断 | P0 | 高 | 所有正式用户无法进入项目和编辑器 |
| 2 | 正式后端仍是旧鉴权契约，匿名暴露项目与配置 | P0 | 高 | 局域网用户可读取项目元数据和机器配置 |
| 3 | 发布状态文档的测试数量和正式验收证据已经过期 | P0/P1 | 高 | 后续 Agent 或维护者会把旧服务验收误当成当前版本 |
| 4 | 多套启动路径的 env、端口、构建和验证语义不一致 | P1 | 高 | 很容易再次部署出与源码不同的服务 |
| 5 | 29 项中多项只有单测/契约测试，没有对应真实浏览器旅程 | P1 | 高 | “测试通过”不等于用户确实能完成操作 |
| 6 | CLI Provider 自动化主要使用 mock，真实登录和真实模型调用未验收 | P1 | 高 | Codex/Claude/Copilot 在目标机器上的真实可用性未知 |
| 7 | 项目重命名、会话刷新恢复、真实编译等关键路径缺专门浏览器验收 | P2 | 高 | 回归可能绕过现有 26 项 E2E |
| 8 | 部分测试采用源码字符串契约，长期仍较脆弱 | P2 | 中 | 正确重构可能造成假红，错误行为也可能漏检 |
| 9 | 工作树包含大量未提交改动，部署版本无法通过 commit 唯一复现 | P2 | 高 | 回滚、复现、审计和多人协作风险高 |
| 10 | 真实 Provider、外部工具和全部 Skills 的部署级能力仍未知 | P2 | 高 | 隔离测试通过不等于目标机器外部能力可用 |

## 4. 原 29 项问题逐项复审矩阵

状态说明：

- **实现**：当前工作树是否有对应实现；
- **单测/API**：是否有直接自动化证据；
- **浏览器**：是否有真实 Playwright 用户路径；“部分”表示只覆盖相邻能力或 mock；
- **构建**：当前生产构建是否包含并通过编译；
- **正式部署**：当前 8787 是否运行这份工作树；
- **LAN 验收**：当前正式局域网入口是否实际完成用户旅程。

所有条目的“正式部署”均按**当前完整工作树版本**判断。旧进程可能包含其中一部分早期实现，但不能据此认定当前版本已部署。

| 条目 | 实现 | 单测/API | 浏览器 | 构建 | 正式部署 | LAN 验收 | 主要证据与剩余缺口 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0-1 默认无鉴权命令执行 | 是 | 是 | 是，隔离 | 是 | **否，旧运行态** | **否** | 当前 `middleware/auth.js` default-deny；`authSecurity.test.mjs`、`real-browser-auth.spec.ts`。正式 projects/config 仍匿名开放。 |
| P0-2 Draw Key 写 localStorage | 是 | 是 | 部分 | 是 | 否 | 否 | `llmSettingsPrivacy.test.mjs` 有存储契约；缺专门浏览器检查 local/session/IndexedDB 的迁移与残留。 |
| P0-3 Draw 信任 projectName 路径 | 是 | 是 | 否 | 是 | 否 | 否 | `drawProjectBoundary.test.mjs` 覆盖 managed ID、穿越与身份不匹配；缺 UI/API 浏览器攻击路径。 |
| P1-1 RAG index/search 404 | 是 | 是 | 部分 | 是 | 否 | 否 | 后端 index/search 单测通过；E2E 覆盖 health/rebuild/repair 和外部来源状态，但仍缺从本地语料搜索输入框完成查询并核对命中内容的专门旅程。 |
| P1-2 显示名与目录不对应 | 是 | 是 | 是 | 是 | 否 | 否 | Locator 与注册已有目录 E2E；UI 能展示 project ID 和 storage directory。 |
| P1-3 重命名不迁移目录/updatedAt | 是 | 是 | 否 | 是 | 否 | 否 | API 覆盖成功、冲突、回滚；缺浏览器重命名后磁盘目录与 updatedAt 验收。 |
| P1-4 两套项目根目录 | 是 | 是 | 否 | 是 | 否 | 否 | constants/appConfig/Locator 单测；部署环境的真实根目录一致性仍需运行态确认。 |
| P1-5 缺 CLI Provider | 是 | 是 | 是，mock | 是 | 否 | 否 | Codex/Claude/Copilot registry、只读 Chat、CLI Task Diff/Accept/Reject 均有测试；真实账号、网络、模型响应和费用边界未验收。 |
| P1-6 移动端不可用 | 是 | 是 | 是 | 是 | 否 | 否 | phone/tablet E2E 通过；正式手机入口当前被版本门禁阻断。 |
| P1-7 Skills 漂移 | 是 | 是 | 是 | 是 | 否 | 否 | taxonomy、readiness、空分类和禁用选择均有测试；真实外部依赖型 Skill 执行仍未全量验证。 |
| P1-8 活动会话不恢复 | 是 | 是 | 否 | 是 | 否 | 否 | `conversationRestoration.test.mjs` 覆盖慢恢复和竞态；缺刷新页面的浏览器会话恢复测试。 |
| P1-9 E2E 不可信 | 是 | 是 | 是 | 是 | 否 | 否 | 隔离 runner 随机端口/目录/Token；当前 26/26。正式 LAN 仍失败，不能替代部署验收。 |
| P2-1 CJK 字体/语言错误 | 是 | 是 | 是 | 是 | 否 | 否 | offline-fonts E2E 无远程字体/CDN；正式门禁页中文正常，但未进入完整编辑器。 |
| P2-2 核心界面中英文混用 | 部分 | 是 | 部分 | 是 | 否 | 否 | 主要面板中英文 E2E 通过；未证明全应用、所有错误提示和新增功能均无硬编码。 |
| P2-3 新建项目静默选模板 | 是 | 是，静态契约 | 否 | 是 | 否 | 否 | UI source contract 验证空白默认；缺真实创建空白项目并检查文件树的浏览器测试。 |
| P2-4 模板 mainFile 不存在 | 是 | 是 | 否 | 是 | 否 | 否 | manifest 和替换回滚/并发有测试；缺从 UI 选择每个模板并编译的矩阵。 |
| P2-5 快速预览误导 | 是 | 是 | 是 | 是 | 否 | 否 | lazy-preview E2E 覆盖 Markdown/LaTeX；仍应把最终 PDF 作为投稿级唯一结果。 |
| P2-6 编译六轮/缓存/警告 | 是 | 是 | 否 | 是 | 否 | 否 | compileService 单测覆盖 warning、缓存和无 PDF；缺当前版本浏览器触发真实 ACL 编译。 |
| P2-7 RAG 自动/手动语义冲突 | 是 | 是 | 是 | 是 | 否 | 否 | health/rebuild/repair 语义浏览器测试；正式 RAG 页面当前不可进入。 |
| P2-8 RAG 内部目录出现在文件树 | 是 | 是 | 否 | 是 | 否 | 否 | 项目 route 过滤测试；缺真实文件树断言 `.openprism/.compile/research_corpus` 不可见。 |
| P2-9 设置缺 Provider 体验 | 是 | 是 | 是 | 是 | 否 | 否 | 5 类 Provider、连接说明、模型与只读边界有 E2E；真实 Provider probe/invoke 未验收。 |
| P2-10 工具链/README/env 不一致 | 部分 | 是 | 不适用 | 是 | **否** | 否 | npm 入口已统一，但 `npm start`、`run-server.sh`、`restart.sh` 的 env/启动语义仍不同。 |
| P2-11 bundle 过大 | 是 | 是 | 部分 | 是 | 否 | 否 | 初始 JS 均低于 500 KiB，EditorPage 约 131 KiB；重功能仍为较大异步 chunk，需持续预算。 |
| P2-12 Skills 空分类/噪声 | 是 | 是 | 是 | 是 | 否 | 否 | Skill management 浏览器测试通过；真实 123 个 Skill 的可执行性不是同一件事。 |
| P3-1 两套项目访问模型 | 是 | 是 | 部分 | 是 | 否 | 否 | 正式论文路由使用 managed project context；外部 Code/MCP 保留独立绝对路径能力，需持续防止回流。 |
| P3-2 正式 UI 与 Legacy 并存 | 是，入口治理 | 是 | 否 | 是 | 否 | 否 | 默认禁用 Legacy 并有生命周期文档；缺正式浏览器确认 404/标识/跳转。 |
| P3-3 模型列表未进入闭环 | 是 | 是 | 是 | 是 | 否 | 否 | Provider onboarding 覆盖模型输入/列表语义；真实远端模型列表兼容性未知。 |
| P3-4 缺统一能力状态页 | 是 | 是 | 是 | 是 | 否 | 否 | capabilities service、route 和 E2E 均覆盖；正式后端没有当前 build metadata，无法进入该页。 |
| P3-5 测试与发布标准不统一 | 是，代码门禁 | 是 | 是，隔离 | 是 | 否 | 否 | `check`、integration、E2E 均绿；仍缺把 restart、build identity、ready 和正式 LAN Playwright 纳入同一个原子发布门禁。 |

### 4.1 29 项状态统计

按严格的“当前完整版本”口径：

- 源码已实现：约 26 项；
- 源码部分实现或仍有边界缺口：P2-2、P2-10；P3-5 的代码测试入口已完成，但部署验收编排仍未闭环；
- 有直接单测/API 证据：29 项均有某种证据，但证据强度不同；
- 有专门或相邻 Playwright 证据：约 17 项；
- 只有单测/静态契约、缺浏览器旅程：约 12 项；
- 当前生产构建：包含全部当前源码并成功；
- 当前完整版本已部署到 8787：0 项可以严格确认；
- 当前完整版本通过正式 LAN 用户验收：0 项。

## 5. 原 29 项之外，本次新发现或重新暴露的问题

### N-1：正式服务缺少原子化发布闭环

**证据：高置信度。** 前端 `dist` 已是新构建，后端仍是 02:56 旧进程，直接导致版本门禁锁死工作区。

当前“构建前端”和“重启后端”是两个可分离动作，且正式服务静态读取新 `dist`。这意味着维护者只要运行构建但未完成后端重启，线上入口就会立刻进入不兼容状态。

建议优化：

1. 构建产物先进入版本化 staging 目录；
2. 后端启动并通过 `/api/ready` 后，再原子切换静态资源指针；
3. 发布脚本必须核对 frontend build ID 与 backend health build ID；
4. ID 不一致时发布命令自身失败，不能依赖用户打开页面才发现；
5. 保留上一版本完整前后端产物用于快速回滚。

### N-2：三套启动入口行为不一致

**证据：高置信度。** 当前存在：

- 根 `npm start`：Node `--env-file-if-exists` 加载根 `.env` 和 `app/.env`；
- `scripts/run-server.sh`：shell source 根 `.env`，循环重启；
- `scripts/restart.sh`：直接进入 backend 运行 `node src/index.js`，没有显式 source `.env`，使用 `PORT=8787`，并单独处理 CA。

不同入口可能获得不同的 Token、Host、Port、CA、Build ID 和数据根配置。正式进程来自 `run-server.sh`，而整改状态文档描述的重启行为和当前源码验证并未形成一个唯一、可复现的入口。

建议优化：只保留一个生产启动适配层，其他脚本全部调用它；启动时输出脱敏后的配置来源、build ID、data root、bind host 和 readiness 状态。

### N-3：正式匿名 config/projects 暴露仍是用户环境现实

**证据：高置信度。** 尽管当前源码已经修复，正式后端仍允许无 Token 获取：

- 项目 ID、名称、目录名、时间、归档/删除状态；
- LLM Provider、模型名、Base URL；
- CA 证书本机路径；
- projects 根目录本机路径；
- Key 是否已配置。

这不是“理论上旧版本可能有问题”，而是本次 LAN/loopback 运行态实测结果。正式服务完成升级之前，应保持 P0 风险状态。

### N-4：整改状态文档不是可自动失效的证据

`docs/repository_audit_remediation_status_2026-07-22.md` 的以下内容已经过期：

- 第 64 行的 `projectTreeCreateUi` 5/5 结论在复审中曾因后续下载实现变化短暂失效；最终测试已同步更新并重新回到 5/5；
- 第 68 行记录的是 58 个文件、340 项 unit；当前已增长为 73 个文件、418 项并全绿，旧数量不能代表当前门禁规模；
- 第 71 行只记录 13 项 E2E；当前套件已增长为 26 项；
- 第 73—75 行声称 02:56 正式重启及 LAN 冒烟通过；该证据早于 04:15—09:10 的关键源码和构建，不能代表当前版本；
- 第 84 行仍把脱敏 config 描述为无 Token 公开，而当前源码 `auth.js` 的 public allowlist 已不包含 config。

建议优化：整改状态不只写自然语言；同时生成机器可读 JSON，记录 commit、dirty hash、build ID、测试命令、测试时间、正式 PID/start time、API schema 和 LAN 截图/trace。任一源文件或 build ID 改变后，旧验收自动标记为 stale。

### N-5：测试存在“实现字符串绑定”而非行为绑定

复审过程中出现过的失败测试曾要求源码必须包含 `link.download = ...`。该断言现已修正，但这类测试模式仍值得治理，因为它：

- 会把安全 helper 重构误判为功能失败；
- 只证明字符串存在，不证明点击后成功下载；
- 容易诱导维护者保留旧实现细节；
- 与已经存在的真实浏览器下载 E2E 重叠但口径不一致。

建议优化：

- 纯函数用单测；
- React 交互用组件测试或 Playwright；
- 安全下载验证请求携带 Token、响应内容与文件名；
- 只对确实属于稳定公共契约的字符串做静态扫描。

### N-6：真实外部能力仍缺部署级验收

隔离 E2E 故意不调用真实付费模型，这是正确的测试隔离策略，但不能因此声称以下能力已经在用户机器上可用：

- Codex CLI 登录态、模型选择、真实只读 Chat；
- Claude Code CLI 登录态和输出解析；
- GitHub Copilot CLI 登录态和版本兼容；
- OpenAI-compatible/Anthropic 真实模型列表和调用；
- 外部搜索、OCR/PDF 工具、tmux 等系统依赖；
- 真实 ACL/IEEE 等模板的完整浏览器编译。

建议增加两层验收：

1. 默认离线、免费、可重复的 CI E2E；
2. 显式 opt-in 的部署 smoke，读取真实登录态但限制为无副作用、低费用或只做 `--version/auth status`。

### N-7：仓库可复现性仍受大规模 dirty worktree 影响

本次 `git status` 显示大量修改、新文件和删除文件，且当前正式进程对应的代码状态无法用单个 commit 唯一复现。用户明确要求保留的 `papers/paper-agent-spe/project.json` 也处于修改状态。

影响包括：

- 无法仅凭 commit 判断正式服务运行了什么；
- 构建 ID 虽含 commit，但 dirty 内容才是实际功能主体；
- 出现回归时难以二分和回滚；
- 多个审计文档可能描述同一工作树的不同时刻。

建议在准备发布时生成 dirty-tree 内容哈希，并把源码状态、构建产物和运行进程绑定；在用户确认前不得覆盖或回滚现有未提交改动。

## 6. 用户视角的系统改进建议

### 6.1 项目与文件身份

当前项目模型已经比初始审计时完善，但用户仍需要一个一致、可解释的界面：

- 项目卡片同时显示“项目名称”“存储目录”“项目 ID”，避免把三者混为一谈；
- 重命名时明确提示是否同步重命名目录，并展示冲突处理；
- 对 `papers/` 中尚未注册的目录显示“发现的论文目录”，由用户显式注册，不应扫描即写 metadata；
- 注册、重命名、导入、删除、恢复都应在 UI 中展示最终实际路径；
- 项目诊断页提供“一键复制项目诊断信息”，但必须脱敏。

### 6.2 LLM、Codex、Claude 与 Copilot

当前源码已经具备 5 类 Provider，这是方向正确的改进。后续产品体验应继续明确区分：

- **Chat**：只读讨论，不修改论文；
- **Task Agent**：在隔离快照中修改，用户查看 Diff 后 Accept/Reject；
- **HTTP Provider**：需要 API endpoint、模型凭证和网络；
- **CLI Provider**：复用本机安装与登录态，不要求重复填写 API Key；
- **能力状态**：安装、认证、模型可用、只读/写入、stream/cancel 必须如实声明。

关键改进不是再增加一个下拉框，而是让用户可以回答：

1. 当前到底用的是哪个 Provider、哪个模型？
2. 凭证存在哪里，浏览器是否保存了秘密？
3. 本次任务是否允许改文件？
4. 修改会立即写入论文，还是先进入 Diff？
5. 失败是未安装、未登录、网络失败、模型错误还是权限不足？

### 6.3 RAG

RAG 已从“按钮 404”进展到有索引健康与修复语义，但完整用户闭环还需要：

- 在浏览器中真实添加资料、自动索引、输入问题、查看命中片段和来源；
- 显示 index generation、fingerprint、文档数、chunk 数和最后更新时间；
- 明确区分“尚未索引”“索引过期”“索引损坏”“无结果”；
- 删除或替换资料后，用户能理解哪些结果已经失效；
- 每条回答能追溯到项目内相对路径和页码/段落；
- 内部 `.openprism` 数据绝不混入普通论文文件树。

### 6.4 Skills

123 个 Skill 的数量本身不是可用性。Skill 管理页应优先帮助用户判断：

- 当前机器是否具备依赖；
- 是否需要外部命令、网络、模型或 Key；
- 是只读分析还是会修改论文；
- 对当前项目类型是否适用；
- 最近一次 dry-run 和真实执行结果；
- 失败后如何恢复；
- 哪些 Skill 只是 prompt 模板，哪些是完整工作流。

建议以 readiness、任务阶段和副作用分组，而不是只按数量和静态分类展示。

### 6.5 编译与预览

- Quick preview 必须持续标记为近似结果；
- 最终 PDF 是投稿结果的唯一权威；
- 编译 UI 展示运行轮数、warning、缓存命中、输出文件和失败阶段；
- 不能在本次编译失败时回退展示旧 PDF；
- 为每个内置模板增加真实浏览器创建→编辑→编译→打开 PDF 的验收矩阵；
- 对离线依赖下载、Tectonic 缓存损坏、BibTeX/引用未收敛提供明确诊断。

### 6.6 发布与运行

必须把以下动作合并为一个不可分割的发布流程：

```text
确定源码快照
→ typecheck
→ production build
→ unit
→ integration
→ isolated Playwright
→ 启动候选后端
→ /api/ready
→ build ID/schema 匹配
→ 原子切换正式服务
→ LAN desktop/mobile Playwright
→ 记录 PID、build ID、证据
```

只要其中一步失败，正式状态就不能写“已完成”。

## 7. 建议的补充浏览器验收清单

以下用例是当前 26 项 E2E 之外最值得补齐的用户旅程：

1. 新建空白项目，确认没有静默套用模板；
2. 新建中文项目，核对显示名、目录名、项目 ID；
3. 重命名项目，核对 UI、磁盘目录、updatedAt 和冲突提示；
4. 刷新编辑器，恢复原活动会话和当前文件；
5. RAG 添加文本/文件后直接查询，核对命中来源；
6. RAG 删除资料后自动更新索引，旧内容不可再命中；
7. 文件树确认内部缓存目录不可见；
8. Draw 页面检查 localStorage/sessionStorage/IndexedDB 中无 API Key；
9. Draw project ID 穿越和跨项目请求被拒绝；
10. 每个内置模板完成创建、真实编译、打开本次 PDF；
11. 编译失败后不展示旧 PDF；
12. Legacy Workbench 默认 404，显式启用时有醒目标识；
13. Codex/Claude/Copilot 分别执行只读 probe 和最小真实 Chat；
14. CLI Task 修改隔离文件，Reject 不改变项目，Accept 后只应用已审查 Diff；
15. 正式 LAN 无 Token 时 projects/config/AI/Code/Terminal 均不可访问；
16. 正式 desktop/tablet/phone 完整走项目列表→编辑器→保存→刷新；
17. 前端和后端 build ID 一致，`/api/ready` 为 200；
18. 发布后重启与崩溃自动拉起仍保持相同 build ID 和 env 来源。

## 8. 证据、推断与未知边界

### 8.1 已确认事实

- 当前生产构建成功；
- 当前隔离 API integration 14/14 通过；
- 当前隔离 Playwright 26/26 通过；
- 当前 `npm run check` 通过，73 个文件、418 项 unit 全绿；
- 正式 8787 后端启动时间早于当前关键源码；
- 正式 `/api/ready` 不存在；
- 正式 health 没有 build metadata；
- 正式 projects/config 可无 Token 读取；
- 正式 LAN 桌面和手机均被 missing-build-metadata 阻断；
- 当前源码的 auth public allowlist 不包含 projects/config；
- 当前 Codex Chat 源码使用 `--sandbox read-only`；
- CLI Task Agent 使用隔离 snapshot、workspace-write 和 Diff/Accept/Reject 边界；
- 用户论文文件 `papers/paper-agent-spe/project.json` 未被本次复审修改。

### 8.2 基于证据的推断

- 当前正式服务的问题主要来自部署状态漂移，而不是当前 React 页面自身崩溃；
- 重启当前后端后，版本门禁大概率会解除，但仍必须通过实际 build ID、ready 和 LAN Playwright 验证，不能只凭推断宣布成功；
- 复审中出现过的 `projectTreeCreateUi` 失败已确认是过时测试断言，并已在最终工作树修正为 5/5；
- 多启动入口和非原子发布是造成这次漂移的主要结构性条件。

### 8.3 当前未知或未验证

- 当前真实 Codex、Claude、Copilot 登录态和模型调用效果；
- 真实付费 HTTP Provider 的模型列表、限流、超时和错误映射；
- 所有 123 个 Skill 的真实可执行性；
- 当前工作树下所有内置模板的真实浏览器编译；
- 所有界面和错误路径是否完全国际化；
- 当前依赖审计告警的实际可达性和升级兼容性；
- 正式服务重启为当前源码后，是否仍存在环境变量、数据根、CA 或 Provider 差异；
- 并发用户、长论文、大 RAG corpus 和长时间 CLI Task 的性能与稳定性。

## 9. 最终判断

当前仓库已经从最初审计时的“核心功能和安全边界明显断裂”进展到了“源码功能较完整、隔离自动化较强”的阶段。这一点应当肯定，但不能据此宣布产品已经完成整改。

现在最真实的用户状态是：

> 浏览器能够访问正式地址，但只能看到前后端版本不一致，工作区无法使用；正式后端仍暴露旧版匿名 projects/config。当前源码的 check、integration 和隔离 Playwright 已经全部转绿，但尚未部署到正式服务。

因此应把当前版本定义为：

- **源码整改：WATCH，可继续收口；**
- **代码测试门禁：PASS；**
- **正式部署：BLOCK；**
- **局域网用户验收：BLOCK。**

在完成当前后端重启、build/ready 核对和正式 LAN desktop/mobile Playwright 之前，`docs/repository_audit_remediation_status_2026-07-22.md` 中的正式验收结论仍不应作为当前发布依据。
