# paper_wrighting 仓库审计整改状态

日期：2026-07-22
依据：[repository_user_audit_2026-07-22_00-17-09.md](repository_user_audit_2026-07-22_00-17-09.md)

## 状态口径

- **已完成**：审计中可验证的问题已有实现和针对性回归证据。
- **已完成（带边界说明）**：原问题的正式产品路径已修复；为旧客户端或独立外部能力保留的兼容面必须被显式标识、受测且不能重新进入正式主路径。

本表记录当前工作区状态，不修改原审计报告，也不把计划或测试文件名称本身当成完成证据。

> **最终状态复核（2026-07-22 11:50）**：此前关于旧正式进程、`missing-build-metadata` 和 LAN BLOCK 的记录均为历史证据，已被本轮最终发布覆盖。正式 8787 实例现运行 build `20260722035023-f0ef1484486e-42c39da5`，鉴权、readiness、数据根、Provider readiness、桌面/手机/平板项目页与编辑器均已通过正式 LAN 验收。本文末尾“最终复核”是当前唯一有效运行态结论。

## P0

| 条目 | 状态 | 当前实现与证据 |
| --- | --- | --- |
| P0-1 局域网可见时命令执行默认无鉴权 | **已完成** | 当前源码和正式实例均 default-deny：无 Token 仅允许最小 health/Provider metadata bootstrap；`/api/config`、项目、AI、Provider probe/invoke、配置修改、Code、Terminal、Capabilities 均 fail-closed。`release:verify` 已在正式 LAN 验证无 Token 401/403 与正确 Token 200；`tests/authSecurity.test.mjs`、`tests/appConfigEnv.test.mjs` 覆盖。 |
| P0-2 Draw API Key 写入 localStorage | **已完成** | `DrawPanel.tsx` 不再持久化/回传图片 API Key，`appConfig.js` 和公开配置只暴露掩码/是否配置；`tests/llmSettingsPrivacy.test.mjs` 覆盖浏览器存储边界。 |
| P0-3 Draw 信任 projectName 拼接目录 | **已完成** | `routes/draw.js` 只接受 managed `projectId`，通过 `projectLocator.js`、`project.json.id` 和 `safeJoin` 限制路径；`tests/drawProjectBoundary.test.mjs` 覆盖跨项目、穿越和身份不匹配。 |

## P1

| 条目 | 状态 | 当前实现与证据 |
| --- | --- | --- |
| P1-1 RAG index/search 路由缺失 | **已完成** | `routes/paperRag.js` 补齐 `POST /rag/index` 和 `GET /rag/search`；`routes/__tests__/paperRag.test.js` 验证索引、检索、空查询；`tests/paperRagPanelContract.test.mjs` 验证前端契约。 |
| P1-2 显示名与磁盘目录不可对应 | **已完成** | `projectService.js` 生成“安全可读名称 + 短 UUID”目录并保留完整项目 ID；`projectLocator.js` 兼容旧 UUID/导入目录；`tests/projectService.test.mjs`、`tests/projectLocator.test.mjs`。 |
| P1-3 重命名不更新目录和 updatedAt | **已完成** | `routes/projects.js` 在项目锁内完成冲突检查、目录迁移、元数据更新时间和失败回滚；`tests/projectRoutes.test.mjs` 覆盖成功、冲突与回滚。 |
| P1-4 多套项目根目录 | **已完成** | `OPENPRISM_DATA_DIR` 成为唯一权威，`OPENPRISM_PROJECTS_DIR` 仅作缺省兼容；App Config、Draw、RAG 和项目路由统一使用 Locator；`tests/appConfig*.test.mjs`、`tests/projectLocator.test.mjs`。 |
| P1-5 缺少可扩展 LLM/CLI Provider | **已完成（Chat/Task 双边界）** | 五类 Provider registry 已接入；CLI Chat 固定只读，文件修改进入独立 Task Agent 的项目外快照 → Diff → Accept/Reject 工作流。Provider 列表现在通过非推理安装/认证探针返回 `installed/authenticated/authStatus/available`，未证明可用的 CLI 在设置页禁用。正式 LAN 已确认 Codex/Claude 安装且认证，Copilot 安装但认证不可可靠探测，因此保守禁用。专项 Provider、Task Agent、鉴权和 Playwright 通过；自动化不调用真实付费模型。 |
| P1-6 移动端项目页和编辑器不可用 | **已完成** | `App.css` 提供项目列表窄屏卡片布局；`Layout.tsx`/`Layout.module.css` 提供 Files/Editor/Assistant 互斥移动视图；`tests/mobileI18nContract.test.mjs` 和 `tests/e2e/mobile-workspace.spec.ts`。 |
| P1-7 Skills 数量/分类漂移且测试失败 | **已完成** | `skillEngine.test.mjs` 改为验证唯一性和 manifest 一致性，不再使用固定上限；`ccf-idea-reviewer.yaml` 归入合法 taxonomy；当前运行时加载 123 个 Skill，相关 Skill 测试通过。 |
| P1-8 刷新后活动会话丢失 | **已完成** | `conversationRestoration.ts` 与 `useConversations.ts` 实现项目级保存、失效回退、慢恢复和跨项目竞态隔离；`tests/conversationRestoration.test.mjs` 4 项回归通过。 |
| P1-9 E2E 依赖旧文案和固定 torq | **已完成（当前复核）** | `run-e2e-isolated.mjs` 使用随机端口/临时数据根/独立随机 Token，Playwright 默认 `fullyParallel:false`、`workers:1`、`retries:0`，并在启动前等待 `/api/ready` 与 build schema；当前隔离 Playwright 30/30 通过。 |

## P2

| 条目 | 状态 | 当前实现与证据 |
| --- | --- | --- |
| P2-1 中文依赖远程字体且 html.lang 错误 | **已完成** | `App.css` 增加 Noto/PingFang/Microsoft YaHei 等 CJK 回退；`i18n/index.ts` 同步 `document.documentElement.lang`；`mobileI18nContract.test.mjs`。 |
| P2-2 核心编辑器中英文混用 | **已完成（审计核心路径）** | Layout、ProjectTree、NewConversationDialog、PaperRagPanel 等审计实测核心文案已进入 en/zh locale，且两套 key 集合一致；`mobileI18nContract.test.mjs`。仓库仍应持续扫描新增硬编码文案。 |
| P2-3 新建项目静默选择第一个模板 | **已完成** | `ProjectPage.tsx` 显式提供空白项目并保持空值默认；`tests/templateUiContract.test.mjs`。 |
| P2-4 ACL manifest mainFile 不存在 | **已完成** | `manifest.json` 改为 `acl_latex.tex`；`templateService.js` 验证 manifest 与上传模板入口；`tests/templateContract.test.mjs`。 |
| P2-5 HTML LaTeX 预览误导 | **已完成** | `CenterPanel.tsx` 区分 Quick approximate preview / Final PDF；`LatexPreview.tsx` 为引用、未知命令和图片失败提供结构化降级；`tests/previewDegradationContract.test.mjs`。 |
| P2-6 Tectonic 六轮重跑无清晰反馈 | **已完成** | `compileService.js` 解析六轮上限为 warning，UI 区分成功/警告/失败；同一项目固定复用 `.compile/tectonic-cache`，同时保留独立 run 输出目录，失败且无 PDF 时不会复用旧成功。`compileService.test.mjs` 覆盖缓存目录稳定、重复调用参数契约和无 PDF 失败边界；真实 ACL 暖缓存连续编译两次均无下载并生成 PDF。不额外叠加外部 rerun 循环，Tectonic 内部六轮仍作为可见 warning。 |
| P2-7 RAG 自动/手动索引语义冲突 | **已完成** | `PaperRagPanel.tsx` 明示新增/上传/删除后自动索引并移除冗余手动按钮；后端显式 index 路由保留给恢复/诊断；`paperRagPanelContract.test.mjs`。 |
| P2-8 RAG 内部目录混入文件树 | **已完成** | `routes/projects.js` 的普通文件列表过滤 `.openprism`、`.compile`、`research_corpus`；证据资料从 RAG 面板管理；项目路由回归覆盖。 |
| P2-9 设置页缺 Provider/连接测试/错误反馈 | **已完成** | `SettingsModal.tsx` 提供 5 Provider 选择、连接/安装认证测试、HTTP 模型列表与 CLI 手填模型、保存/测试 loading/success/error；保存必须等待后端 2xx，失败时保留弹窗。服务访问 Token 只进 `sessionStorage`，统一覆盖同源 fetch/XHR/WebSocket。`providerSettingsContract.test.mjs`、`llmSettingsPrivacy.test.mjs` 与隔离 Playwright 覆盖。 |
| P2-10 README、环境变量、包管理/测试入口不一致 | **已完成** | README/README_ZH、`.env.example` 与根/app scripts 统一为 npm；根 `packageManager` 是 npm，唯一锁文件为 `app/package-lock.json`，旧 `pnpm-lock.yaml` 已删除。根命令完整代理 install/dev/build/start/preview/test/typecheck/check；`npm start` 兼容加载仓库根 `.env`，再以 `app/.env` 优先覆盖，任一可选文件缺失不再导致 Node 启动前退出，`toolchainContract.test.mjs` 锁定真实启动契约。 |
| P2-11 EditorPage bundle 过大 | **已完成** | RightPanel/Layout/CenterPanel 懒加载重面板、终端、编辑器和预览；MarkdownEditor 不再导入完整 language-data；Vite 500 KiB 硬预算。构建证据：约 1,347.41 KiB 降至 126.47 KiB，gzip 373.95 KiB 降至 32.98 KiB；`frontendBundleContract.test.mjs`。 |
| P2-12 Skills 空分类和元数据噪声 | **已完成** | `getPopulatedSkillCategories` 以当前 Skill 集合生成非零分类；Selector/Manager 都不再渲染空分类；`tests/skillCategoryUi.test.mjs`。 |

## P3

| 条目 | 状态 | 当前实现与证据 |
| --- | --- | --- |
| P3-1 两套项目创建/访问模型 | **已完成（强化复审）** | 正式 React 工作区的章节、AI、Review、Anti-AI、Citation、Pipeline、文件 watcher 和 Terminal 统一使用存在且身份匹配的 `projectId + relativePath + Project Locator`；这些正式论文路由不再 opt-in 任意 `externalProjectPath`。外部 Code 浏览与 MCP 保留独立绝对路径能力。Project Locator 默认要求项目存在，拒绝 symlink 根、缺失/损坏 metadata；统一 safeJoin 也拒绝路径中的 symlink 组件。 |
| P3-2 正式 UI 与大型原型并存 | **已完成（入口治理）** | Legacy Workbench 默认 404，仅显式 `OPENPRISM_ENABLE_LEGACY_WORKBENCH=true` 才启用，并有醒目标识和正式 `/projects` 入口；迁移/移除条件见 `legacy_workbench_lifecycle.md`。 |
| P3-3 模型列表接口未进入用户闭环 | **已完成** | 设置页按 Provider 声明接入模型能力：OpenAI-compatible/Anthropic 可加载模型列表，Codex/Claude/Copilot CLI 明确不伪造不稳定列表而提供手填模型；连接测试、错误状态和保存生效形成同一用户闭环。Provider 契约测试与 Playwright 已覆盖。 |
| P3-4 缺少统一能力状态页 | **已完成** | 设置页新增“系统能力”只读诊断；`/api/capabilities` 以稳定四态 schema 汇总鉴权、数据根、5 个 Provider、TeX/Pandoc、PDF/OCR、Skills、tmux 与外部检索。逐项失败隔离、响应脱敏、默认缓存、显式刷新，且不会安装、登录、联网或调用模型；单测和隔离 Playwright 已覆盖。 |
| P3-5 测试入口和发布标准不统一 | **已完成** | 根目录统一提供 `test`、`test:unit`、`test:integration`、`test:e2e`、`typecheck`、`check`、`check:full`；`typecheck` 运行真实 `tsc --noEmit`，`check` 固定按类型检查→生产构建→单测执行。隔离 runner 负责 integration/E2E 服务生命周期和清理，`toolchainContract.test.mjs` 与 `testing_release_gates.md` 锁定发布门禁。 |

## 本批次验证记录

- `tests/projectTreeCreateUi.test.mjs`：先复现 5 项中 1 项失败；改为验证 i18n key、插值参数和动作绑定后 5/5 通过。
- RAG、E2E 隔离、会话、Skills、移动/i18n、模板、编译、预览、bundle 的聚焦 Vitest：13 个文件、68 项测试全部通过。
- Preview/bundle 实现批次：相关回归 35/35，通过生产构建；EditorPage 初始 chunk 约 126.47 KiB。
- Provider、capabilities、managed API、toolchain、Tectonic 等最终收口聚焦 Vitest：15 个文件、93 项测试全部通过；managed API 批次另有 5 个相关文件、46 项测试通过。
- 根级 `npm run check`：完整通过，顺序执行真实 `tsc --noEmit`、生产构建和全量 unit；unit 最终为 58 个测试文件、340 项测试全部通过。
- `npm run build`：通过；EditorPage 126.76 KiB（gzip 33.15 KiB），500 KiB 初始入口预算通过。两个按需加载的独立重功能 chunk 仍触发 Vite 通用 500 KiB warning，但不再进入 EditorPage 首屏。
- `npm run test:integration`：隔离后端、临时数据根下 1 个文件、13 项 API 集成测试全部通过。
- `npm run test:e2e` 当前复核：随机 Token、随机端口和临时数据根下 30 项 Playwright 全部通过；默认串行，覆盖项目生命周期/注册、鉴权资源、phone/tablet、Provider probe、Skills readiness、RAG 完整增删查、Draw.io fallback、CLI Task Agent 和会话恢复。
- 根级 `npm start` 启动探针：在 `app/.env` 不存在、仓库根 `.env` 存在的真实配置布局下成功启动临时随机端口，证明启动入口不再因可选 env 文件缺失提前失败。
- ~~早期记录曾把 02:56 的 PID `575751/575763` 描述为已完成正式发布。~~ 当前复核证明该进程仍返回旧 health、缺少 `/api/ready`、未启用 Token，并被新前端 build gate 阻断；该早期结论已废止。
- 正式 loopback/LAN、鉴权三态和多视口 Playwright 必须在本轮最新代码真正重启之后重新记录，不能复用早期证据。

## 受控兼容与运营边界

- `__paper_agent__:<id>` marker 只为旧客户端保留，服务端会记录 deprecated usage 并返回 `Deprecation` / `X-OpenPrism-Deprecated-Input`；正式 React 请求不得重新使用该协议。
- 外部 Code 浏览与 MCP 的绝对 `projectPath` 是显式外部目录能力，不属于 managed paper API；它们保留独立安全边界，不能被描述成未迁移的 managed 主路径。
- CLI Provider 自动化只使用 fake spawn 和非推理 probe，不调用真实付费模型；真实账号、网络和模型效果属于部署验收。
- `/api/capabilities` 的跨平台版本命令探测必须持续保持固定参数、脱敏、短超时和单项失败隔离。
- Tectonic 持久缓存只复用依赖，不复用旧成功结果；每次编译仍必须在隔离 run 目录生成本次 PDF。
- 无 `OPENPRISM_API_TOKEN` 时，除最小 health/Provider metadata bootstrap 外的 API 全部 fail-closed；`/api/config` 也必须鉴权。正常项目使用必须配置 Token。隔离 integration/E2E 每次生成独立随机 Token，不继承正式服务凭据。
- `GET /api/projects` 和项目 tree 已改为纯读取：无 metadata 的论文目录只作为 `candidates` 返回，不自动写 `project.json`；隐藏缓存目录不会进入项目或候选列表。
- Google Fonts 在无外网环境会回退到本地系统字体；两个按需加载的编辑/预览 chunk 仍超过 Vite 通用 500 KiB 提示，但均不进入 EditorPage 首屏。
- `npm audit` 当前复核为 0 vulnerabilities；lockfile 安全下限由 `dependencySecurityContract.test.mjs` 锁定。

## 最终复核（2026-07-22 11:50）

- TypeScript：通过。
- Production build：通过；最终 build `20260722035023-f0ef1484486e-42c39da5`。
- Unit：81 files / 462 tests 通过。
- Integration：1 file / 13 tests 通过，随机端口、临时数据根和随机 Token。
- Isolated Playwright：30/30 通过，单 backend/data root 下固定 1 worker、0 retry。
- `npm audit`：0 vulnerabilities。
- `git diff --check`、启动脚本语法和 restart path 测试：通过。
- 正式重启：`scripts/restart.sh` 已只停止 Paper Writer supervisor/backend 并启动新进程；Supervisor PID `1189967`。
- `release:verify`：health/ready/auth/data root/projects/providers/Legacy 404 全部通过；正式项目数 12、Provider 数 5。
- 正式 LAN Playwright：1440×900、390×844、768×1024 的项目页和编辑器均 HTTP 200、无横向溢出、无 page error/failed request，`html.lang=zh-CN`。
- Provider：Codex 非推理 probe 返回 `authenticated`；Codex/Claude CLI 安装且认证，Copilot CLI 已安装但 auth status 为 `unknown`，设置页按保守策略禁用 Copilot。
- 系统能力：修复版本探针遗漏 HOME 导致的 Claude 假阴性后，正式能力页正确显示 Claude CLI 已安装；能力探针不执行登录或模型请求。
- 正式 `torq` RAG：旧索引通过显式 rebuild 升级为 generation/fingerprint 完整的新格式，当前 `healthy`，35/35 文件已索引、0 失败、0 零分块、470 chunks；检索类型继续明确为 `local-keyword-overlap`、`semantic:false`。
- 当前结论：原审计 P0/P1/P2/P3 条目已达到实现、测试、重启和正式 LAN 运行证据闭环，发布状态为 **PASS**。

## 相关架构说明

- [Paper RAG 契约](paper_rag_contract.md)
- [模板、编译与预览契约](template_compile_preview_contract.md)
- [前端响应式与加载边界](frontend_responsiveness_and_loading.md)
- [测试与发布门禁](testing_release_gates.md)
- [项目存储身份](project_storage_identity.md)
- [安全边界](paper_writer_security_boundaries.md)
- [Legacy Workbench 生命周期](legacy_workbench_lifecycle.md)
- [Agent Provider 架构](agent_provider_architecture.md)
- [系统能力诊断架构](system_capabilities_architecture.md)
