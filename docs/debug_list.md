# Debug List

## 2026-06-01 - Release verification test drift

- Symptom: Full `npx vitest run` failed on three stale checks: `exportToLatex` no longer existed after export service naming moved to `markdownToLatex`, the LLM privacy test still inspected `ProjectPage.tsx` after settings moved to `SettingsModal.tsx`, and the tmux terminal test still expected the old websocket id payload/comment.
- Root cause: Tests were locking old implementation details while the live behavior had moved to new module boundaries and resumable tmux session payloads.
- Fix: Restored `exportToLatex` as a compatibility alias, pointed the privacy test at `SettingsModal.tsx`, and updated the tmux test to assert current `session/backend/resumed` payload and delayed cleanup semantics.

## 2026-05-27 - 引用验证引擎三个核心 Bug 修复

- **Bug 1 — arXiv DOI 不被 CrossRef 支持**:
  - 现象：`10.48550/arXiv.1706.03762` 格式的 DOI 在 CrossRef 返回 404，导致真实论文被标为 "doi_not_found"
  - 根因：arXiv 自注册的 DOI (`10.48550`) 不在 CrossRef 索引中
  - 修复：增加 arXiv API (`export.arxiv.org/api/query`) 作为第四数据源；检测到 `10.48550/arXiv.*` 前缀时自动切换到 arXiv API 查询，解析 Atom XML 获取标题/年份/作者
  - 验证结果：`vaswani2017attention` 从 ❌ doi_not_found → ✅ verified (confidence: high)

- **Bug 2 — 标题搜索误报严重**:
  - 现象："A Completely Fake Paper That Does Not Exist At All" 被 CrossRef/OpenAlex 标题搜索匹配为 "verified"
  - 根因：API 返回关键词模糊匹配的 Top-N 结果，未验证标题精确匹配
  - 修复：增加 `titleSimilarity()` 函数（归一化 Levenshtein 编辑距离），阈值 ≥0.75 才算 verified；同时增加年份交叉校验（偏差 >1 年降级）
  - 验证结果：假标题相似度 0.188 < 0.75 → 正确标记为 unverifiable

- **Bug 3 — Semantic Scholar 429 限流**:
  - 现象：并发请求 S2 时全部返回 HTTP 429
  - 根因：S2 免费层限流 1 req/sec，无请求队列
  - 修复：增加 S2 请求队列（最小间隔 1.2s）+ 指数退避重试（1s→2s→4s，最多 3 次）+ 支持 `SEMANTIC_SCHOLAR_API_KEY` 环境变量；批量验证改为串行执行
  - 验证结果：4 个条目串行验证 15s 完成，无 429 错误

## 2026-05-26 - Files/AI Assistant 分界线拖动范围过窄

- 现象：Files 与编辑区、AI Assistant 与编辑区之间的横向分界线可拖动，但侧栏宽度被固定最小值限制，Files 最小 200px、AI Assistant 最小 300px，导致编辑区扩展空间不足；细分界线也不易抓取。
- 根因：`Layout.tsx` 的拖拽逻辑只按增量更新侧栏宽度，并直接用较大的硬编码最小宽度截断；没有按视口宽度和编辑区最低宽度动态计算最大可拖动范围。
- 修复：引入统一面板宽度常量和 `clampPanelWidth`，Files 最小宽度降至 120px、AI Assistant 降至 180px，同时保留编辑区 360px 最低宽度；分界线增加不可见抓取热区，提升拖动命中率。

## 2026-05-26 - Rendered 与 Split 使用两套预览实现

- 现象：Split 模式右侧使用 `MarkdownPreview`/`LatexPreview`，Rendered 模式走独立 `RenderedDocumentEditor` 解析链路，导致同一 Markdown/LaTeX 文件在两个模式下可能显示与能力不一致。
- 根因：视图模式同时承担“布局切换”和“渲染引擎切换”两种职责，Rendered 不是隐藏源码栏，而是替换成另一套预览系统。
- 修复：新增统一 `RenderedPreviewPane`，由 Split 与 Rendered 共同复用；Rendered 模式只隐藏源码编辑器，预览内容仍走与 Split 相同的 Markdown/LaTeX 预览实现。

## 2026-05-26 - 赛博科技主题下预览表格底色错误

- 现象：打开 `reviews/review_summary.md` 预览并切换到“赛博科技”主题后，表格继承全局暗色主题的 `table/th/td/tr:hover` 样式，导致论文/评审预览区域的表格底色不是白色。
- 根因：`App.css` 中赛博主题对所有 `table`、`th`、`td`、`tr:hover` 做了全局暗色覆盖，覆盖了预览组件模拟纸张的白色底色。
- 修复：将赛博主题表格覆盖限定为非 `.latex-tabular` 表格，并为 `.latex-preview-page` 的表格相关节点显式固定白底深字；Markdown 表格渲染也显式给 `table/thead/tbody/tr/td` 设置白底，避免暗色主题渗透。

## 2026-05-26 - 预览编译语法覆盖不足

- 现象：相较常见官方预览能力，仓库 Markdown/LaTeX 预览缺少部分 Markdown 扩展与 LaTeX 论文常用结构支持，例如 raw HTML、heading anchor、longtable/tabularx、链接、简单宏展开、更多数学环境等。
- 根因：Markdown 预览只启用 GFM/math/KaTeX；LaTeX 预览依赖轻量正则渲染，已覆盖基础结构但缺少若干官方预览常见语法分支。
- 修复：Markdown 增加 frontmatter、soft breaks、directive、raw HTML、slug/autolink headings 支持；LaTeX 增加简单零参数宏展开、flush/字号环境、tabularx/tabulary/array/longtable、table-only 命令清理、更多 math 环境、URL/href 和更多文字格式支持，并添加回归测试。

## 2026-05-26 - 右键文件夹上传文件被传到同级目录而非文件夹内

- 现象：在 Files 面板右键点击文件夹 → Upload，文件被上传到与文件夹同级的位置（如右击 `img/` 传文件，文件出现在 `img/` 旁边而非 `img/` 内部）。
- 根因：`triggerUpload` 用共享 state/ref 来桥接"设目标路径"与"在 onChange 中消费"两段逻辑，存在闭包脱节。无论 `useState` 还是 `useRef`，这种共享态的间接传参模式本质上不健壮，多个上传间还有竞态风险。
- 修复：彻底重构上传机制 — 每次 `triggerUpload` 动态创建 `<input>` 元素，`targetFolder` 通过闭包直接捕获在 `change` 事件处理函数中，用完即销毁。消除共享状态、ref、闭包过期、竞态等多类问题。

## 2026-05-26 - User message disappearing & thinking collapse

- Symptom 1: User messages were hidden immediately after sending — the first streaming token callback used `history.slice(0, -1)` which removed the user message (not a non-existent placeholder).
- Fix 1: Track `assistantStarted` flag; on first token append a new assistant entry, on subsequent tokens replace the last (assistant) entry.
- Symptom 2: AI thinking/reasoning content (`` tags from DeepSeek-style models) was displayed inline, cluttering the chat.
- Fix 2: ChatView now parses `...` and `<thinking>...</thinking>` blocks, renders them as collapsed "💭 Thinking" buttons that expand on click.

## 2026-05-26 - Chapter scope: support any project file

- Symptom: AI conversation "Chapter" scope was hardcoded to `sec/` or `chapters/` directories; users couldn't select arbitrary files like `tab/`, `appendix/`, or root `.tex` files.
- Fix:
  - Backend `buildContextMessages`: "chapter" scope now accepts any project-relative file path. Paths with `/` are resolved directly; bare filenames try `sec/` → `chapters/` → root for backward compat.
  - Frontend `NewConversationDialog`: replaced hardcoded chapter `<select>` with a free-form text input + 📂 Browse file picker showing all project text files.
  - `RightPanel` and `Layout` now pass `projectFiles` from `config.files` through to the dialog.

## 2026-05-26 - Dark theme chat text color & Ctrl+V paste image

- Symptom: Chat messages displayed black text `#1a1a1a` in cyber-tech/primer-dark/dracula dark themes, making content unreadable against dark backgrounds.
- Root cause: Dark theme `.markdown-body` overrides in App.css hardcoded light-theme colors (`color: #1a1a1a`, `background: #f5f5f5` etc.) for all dark themes.
- Fix: Changed all dark theme `.markdown-body` overrides to use CSS variables (`--text`, `--bg-secondary`, `--border`, `--accent-strong`, `--text-secondary`) so they adapt correctly per theme.
- Also added Ctrl+V clipboard paste support for images in chat input: paste events on the textarea detect `image/*` clipboard items and attach them as image previews.

## 2026-05-26 - File rename & UI simplification

- Symptom: Right-click rename on files/folders didn't work — `window.prompt()` was blocked or failed silently in some browser contexts.
- Fix: Replaced `window.prompt()` with inline rename editing. Clicking "Rename" now turns the filename into an editable `<input>` field with Enter/Escape key handling and auto-focus with name selection.
- Also removed standalone Agent, Vision, Paper Search, Web Search, and Plot tabs from the left panel:
  - Agent is redundant with the AI chat's Agent/Tools conversation modes.
  - Vision is now integrated into the AI chat input as an image attachment button (🖼️), sending base64 images as multimodal content to the LLM.
  - Paper Search, Web Search, and Plot features deleted entirely (frontend components + backend routes + services).
- Updated `docs/func_list.md` and `docs/debug_list.md`.

## 2026-05-22 - Restart script resolved app paths under `scripts/`

- Symptom: `sh scripts/restart.sh` tried to enter `scripts/app/apps/frontend` and `scripts/app/apps/backend`, then reported success against an already-running service.
- Root cause: the script treated its own directory as the repository root.
- Fix: derive `REPO_ROOT` from `scripts/..`, validate expected directories before restart, detach the backend start with `setsid` when available, and add a shell regression test for root and `scripts/` invocation paths.

## 2026-05-22 - Project delete failed when `project.json` was missing

- Symptom: deleting project `c2b87dfc-af29-42ef-b088-0f28aa9d65c3` returned HTTP 500 with `ENOENT` while opening `papers/<id>/project.json`.
- Root cause: the soft-delete route read `project.json` unconditionally before marking the project as trashed. A follow-up issue also showed project IDs can differ from their directory names, for example `project.json.id=c2b87dfc...` under `papers/torq`, so deleting by ID was a no-op against a non-existent `papers/<id>` directory.
- Fix: make project deletion tolerant of missing or invalid metadata, resolve project roots by scanning `project.json.id` when the direct directory does not exist, and treat already-removed project directories as successful no-ops.
- Regression: added a Fastify route test and a Playwright delete-flow script. On this machine, browser launch is blocked by missing GTK/ATK system libraries, so the Playwright script falls back to Playwright APIRequest validation.

- 2026-05-22: 修复 AI Assistant 在目录名与 project.json id 不一致的项目中误访问 `papers/<uuid>/chapters` 的问题；AI 路由改用 `getProjectRoot()` 解析真实项目目录，并增强工具错误处理、`.bib` 自动查找、`list_code` 工具。

- 2026-05-22: 修复 Terminal WS 在缺少系统 `script` 命令时触发 `spawn script ENOENT` 并导致后端进程崩溃；无 `script` 时降级直接启动 shell，并处理 child process error。Terminal cwd 也改用 `getProjectRoot()` 支持目录名与 id 不一致。
- 2026-05-22: 移除 AI 新建对话中的独立 Code scope 半成品入口；Chat/Agent/Tools 改为明确分工，Agent 不再暴露代码写入/执行工具，代码任务统一收敛到 Tools 模式并限制在 `code/` 目录内。

- 2026-05-22: 实现 LLM provider 抽象层，支持 Anthropic 和 OpenAI-compatible 两种后端。默认使用 OpenAI-compatible (gpt-5.5)。配置项：llm_provider、llm_api_key、llm_base_url、llm_model。注意 OpenAI SDK 的 baseURL 需要包含 /v1 后缀。
- 2026-05-22: 修复项目创建和旧项目文件树打开时未确保 `docs/` 支撑目录存在的问题；创建项目和读取文件树都会补齐 `docs/`，避免文件树/项目路由回归测试缺失目录。
- 2026-05-22: 移除项目文件树对 `fig/` 的强制自动创建绑定；新建项目和打开旧项目只补齐 `docs/`，`fig/` 仅在导入、模板或用户手动创建时出现。
- 2026-05-22: 修复用户删除 `fig/` 文件夹后刷新文件树又出现的问题；项目路由改为显式只补齐 `docs/` 支撑目录，并新增删除 `fig/` 后再次读取 `/api/projects/:id/tree` 不重建该目录的回归测试。

- 2026-05-22: 刷新前端经常白屏。根因：`@fastify/static` 的 `wildcard: false` 在服务启动时扫描 dist 目录并注册路由；前端重建后 Vite 生成新的 hash 文件名（如 `index-DpphMQBV.js`），这些新文件未被注册，请求 fallthrough 到 `setNotFoundHandler` 返回 index.html（Content-Type: text/html），浏览器 MIME 类型严格检查拒绝执行 JS 脚本。修复：改为 `wildcard: true` 动态匹配文件系统。
- 2026-05-22: 修复 LLM 配置泄露/分叉风险；API key、base URL、model 统一以仓库根目录 `.env` 为读写源，`/api/config` 只返回脱敏 key 状态，前端设置与转换流程不再从 localStorage 读取或缓存 LLM API key。
- 2026-05-22: 改进集成 Terminal 生命周期；每个项目/cwd 使用稳定 tmux session，关闭面板或刷新页面只断开当前客户端并在下次打开时重新 attach，只有 tmux session 被杀掉时才自动新建。
- 2026-05-22: 修复 Files 右键 Copy Path 在 HTTP/非安全上下文下未真正写入剪贴板、导致用户粘贴到旧选中文本/正文片段的问题；复制路径现在先规范化项目相对路径，并在 Clipboard API 不可用时使用 textarea + execCommand fallback。
- 2026-05-22: Fixed Rendered editor mode semantics. The prior implementation still used CodeMirror source lines with inline replacement widgets, which looked and behaved like source editing rather than an editable compiled preview. Rendered mode now uses a dedicated editable preview surface and keeps malformed/unsupported syntax as editable source fallback.
- 2026-05-31: 修复已有论文目录缺少 `project.json` 时不会出现在 Projects 列表的问题；新增 `scripts/generate-paper-project-json.mjs`，可扫描 `papers/` 子目录并为缺失元数据的论文工程生成兼容前端识别的 `project.json`，默认不覆盖已有项目元数据。
- 2026-05-31: 进一步修复“上传/复制论文文件夹到 `papers/` 后仍需手动跑脚本”的体验问题；`GET /api/projects` 现在会在扫描项目列表时为包含论文文件但缺少 `project.json` 的新目录自动创建兼容元数据，同时跳过空目录和工具目录。

## 2026-05-25 - Sprint 1/2 系统稳定性修复

- **对话存储并发保护** (`conversationStore.js`): 引入 per-file Promise 锁队列，`updateConversation` 和 `appendMessage` 使用 `acquireLock/release` 包裹，防止快速发送多条消息时读-改-写竞态导致数据丢失。
- **LaTeX 编译超时** (`compileService.js`): `runSpawn` 增加 120s 超时机制，超时后 SIGKILL 子进程并返回明确错误信息。
- **SSE 流式连接泄漏** (`routes/ai.js`): 客户端断开时通过 AbortController 中止 LLM 请求，signal 传递到 Anthropic/OpenAI SDK 的 stream 调用。
- **project.json 并发写** (`routes/projects.js`): 引入 per-project 锁队列 + `updateProjectMeta` 辅助函数，重构 rename/tags/archive/trash/file-order/file-save 路由。
- **静默 catch 修复**: TransferPanel、AppContext、PipelinePanel、SkillPanel、NewConversationDialog 等组件的 `.catch(() => {})` 改为 `.catch(err => console.error(...))` 并保留错误上下文。
- **AI 错误分类** (`routes/ai.js`): 新增 `classifyAIError` 函数，将 401/402/403/404/429/500/503 及网络错误映射为用户可理解的中文提示。
- **防抖 timer 清理** (`LatexPreview.tsx`): 使用 `rafRef = useRef<number>()` 并在 useEffect cleanup 中 `cancelAnimationFrame`。
- **fs.watch 清理** (`fileManager.js`): 增加 `watcher.on('error')` 自动关闭 + `unwatchAll()` 导出，Fastify `onClose` hook 调用 `unwatchAll()`。
- **Rendered 模式写回保护** (`RenderedDocumentEditor.tsx`): 使用 `parsedContentRef` 追踪解析时的源内容，`commitBlock` 时若源已变更则跳过写回。
- **propose_edit Accept/Reject UI**: `useConversations` hook 新增 `PendingEdit` 状态管理，ChatView 使用 InlineDiffViewer 展示 diff 并提供 Accept/Reject 按钮。

## 2026-05-25 - Pipeline 2.0 实现

- 新增 Pipeline 2.0 Stage 系统，支持 5 种类型化执行器: AI (LLM skill)、Compute (shell 命令)、Human (人机交互检查点)、Citation (引用管理)、Compile (LaTeX 编译)。
- 5 个预设管线模板: Writing Flow、Paper Pipeline、Quick Review、Citation Pipeline、Executable Paper。
- Human checkpoint 支持 approve/reject/skip/edit 四种操作，pipeline 在 human 阶段自动暂停等待用户决策。
- 支持 pause/resume、retry with feedback、stage skip、abort signal 传播。
- V2 API 挂载于 `/api/v2/pipeline/*`，V1 路由保持向后兼容。
- 前端 PipelinePanelV2 组件: 类型化图标、可展开 stage 详情、human checkpoint 交互 UI。
- 80 个测试用例覆盖: stageTypes 验证、presets 完整性、engine 生命周期、writing flow 全流程、compute/compile/citation 执行器。


# Paper Agent 代码修复报告

## P0-1: 修复 code.js 命令注入漏洞 (RCE)

**问题**: `routes/code.js` 的 `/api/code/exec` 端点将用户传入的 `command` 直接传给 `bash -c`，攻击者可执行任意系统命令。

**修复方案**:
1. 新建 `utils/pathSecurity.js`，提供 `validateCommand()` 函数
2. 使用正则黑名单拦截危险 shell 模式：`;` `|` `&&` `||` `` ` `` `$(` `>` `<` `sudo` `rm -rf` `dd` `mkfs` 等
3. 限制命令长度上限 2000 字符

**修改文件**:
- `apps/backend/src/utils/pathSecurity.js` (新建)
- `apps/backend/src/routes/code.js` (重写)

**测试结果**:
```
Test 5: valid command → OK
Test 6: command injection "ls; rm -rf /" → BLOCKED
Test 7: pipe injection "cat file | bash" → BLOCKED
Test 8: backtick injection "echo `whoami`" → BLOCKED
```

---

## P0-2: 修复 code.js + chapters.js 路径遍历漏洞

**问题**: `filePath`/`filename` 参数未校验，攻击者可通过 `../../etc/passwd` 读写任意文件。

**修复方案**:
1. `safeJoin(base, ...segments)` — 确保解析后的路径不逃逸出 base 目录
2. `assertWithinDataDir(projectPath)` — 确保 projectPath 在 DATA_DIR 内
3. 在 `code.js` 和 `chapters.js` 的所有端点入口处调用校验

**修改文件**:
- `apps/backend/src/utils/pathSecurity.js` (safeJoin + assertWithinDataDir)
- `apps/backend/src/routes/code.js` (每个端点加校验)
- `apps/backend/src/routes/chapters.js` (每个端点加校验)

**测试结果**:
```
Test 1: valid path "/data/projects/code/main.py" → OK
Test 2: path traversal "../../etc/passwd" → BLOCKED: Path traversal detected
Test 3: valid project path → OK
Test 4: invalid project path "/etc/passwd" → BLOCKED: Invalid project path
```

---

## P0-3: 加基础认证中间件

**问题**: 所有 API 对任何能访问端口的人完全开放，无任何认证机制。

**修复方案**:
1. 新建 `middleware/auth.js`，基于 Bearer Token 认证
2. 通过环境变量 `OPENPRISM_API_TOKEN` 配置，未设置时不启用（兼容本地开发）
3. 白名单路径：`/api/health`、`/api/collab/` 免认证
4. 在 `index.js` 中注册为全局 `onRequest` hook，在所有路由之前执行

**修改文件**:
- `apps/backend/src/middleware/auth.js` (新建)
- `apps/backend/src/index.js` (注册 hook)

**测试结果**:
```
No token: 401
Wrong token: 403
Correct token: 200
Health (no token): 200
```

---

## P1-4: 修复 WebSocket 广播逻辑

**问题**: 文件变更事件广播给所有已连接客户端，不区分 projectPath。客户端 A 监控项目 X，也会收到项目 Y 的变更事件。且 watcher 清理逻辑有 bug：只有当全局 clients 为空时才清理，多项目场景下 watcher 永远不会被释放。

**修复方案**:
1. 用 `Map<projectPath, Set<ws>>` 替代全局 `Set<ws>`，按项目隔离客户端
2. 文件变更事件只广播给同一 projectPath 的客户端
3. 当某项目的最后一个客户端断开时，立即清理该项目的 watcher
4. 缺少 projectPath 参数时直接关闭连接（4000 错误码）

**修改文件**:
- `apps/backend/src/routes/ws.js` (重写)

**测试结果**:
```
WS module imported successfully
```

---

## P1-5: API 层统一错误处理

**问题**: 
- 前端 `conversationApi.ts`、`projectApi.ts`、`skillApi.ts`、`bibtex.ts` 中所有 fetch 调用不检查 `res.ok`，4xx/5xx 响应被当作正常 JSON 解析
- 后端无全局错误处理器，未捕获的异常返回 Fastify 默认格式

**修复方案**:
1. 新建 `api/fetchClient.ts`，提供 `apiFetch`/`apiPost`/`apiPut`/`apiDelete` 封装
   - 自动检查 `res.ok`，非 2xx 抛出 `ApiError`（含 status 和 message）
   - 自动附加 `Authorization` header（从 localStorage 读取 token）
   - 处理 `res.body` 为 null 的边界情况
2. 重写所有 4 个前端 API 文件使用 `fetchClient`
3. 后端 `index.js` 添加 `setErrorHandler`，统一返回 `{ error, statusCode }` 格式
4. 删除未使用的 `PipelinePanel.tsx`（V1 组件，无引用）

**修改文件**:
- `apps/frontend/src/app/api/fetchClient.ts` (新建)
- `apps/frontend/src/app/api/conversationApi.ts` (重写，移除 V1 API)
- `apps/frontend/src/app/api/projectApi.ts` (重写)
- `apps/frontend/src/app/api/skillApi.ts` (重写)
- `apps/frontend/src/app/api/bibtex.ts` (重写)
- `apps/frontend/src/app/components/RightPanel.tsx` (移除 V1 导入)
- `apps/frontend/src/app/components/PipelinePanel.tsx` (删除)
- `apps/backend/src/index.js` (添加 setErrorHandler)

**测试结果**:
```
TypeScript 编译通过（仅剩 MarkdownEditor.tsx 预存的 async Command 类型问题，P1-7 修复）
后端模块导入正常
```

---

## P1-6: 对话历史加长度限制

**问题**: `conversationStore.js` 的 `appendMessage` 只追加不裁剪，JSON 文件无限增长，最终超出 LLM token 限制并拖慢文件 I/O。

**修复方案**:
1. 添加 `MAX_HISTORY_LENGTH = 100` 常量
2. 在 `appendMessage` 中，当历史超过上限时进行滑动窗口裁剪
3. 保留所有 system 消息（不参与裁剪），只裁剪 user/assistant 消息的旧部分

**修改文件**:
- `apps/backend/src/services/conversationStore.js`

**测试结果**:
```
History length after 120 appends: 100
First msg: msg 20 (旧消息被正确裁剪)
Last msg: msg 119 (最新消息保留)
Test passed
```

---

## P1-7: AI 补全加 AbortController + 防抖

**问题**: 
- `triggerAICompletion` 是 async 函数，返回 `Promise<boolean>` 而非 `boolean`，不符合 CodeMirror `Command` 类型签名
- 无 AbortController，快速触发时发出大量并发请求
- 无防抖，每次按键都立即发请求
- `pendingGhostText` 是模块级全局变量，组件销毁时不清理

**修复方案**:
1. 将 `triggerAICompletion` 改为同步函数（返回 `boolean`），内部用 `.then()` 处理异步
2. 添加 `AbortController`，新请求发出前取消旧请求
3. 添加 300ms 防抖（`DEBOUNCE_MS`），避免频繁触发
4. 组件销毁时（useEffect cleanup）abort 进行中的请求并清除 timer
5. `dismissGhostText` 时也 abort 进行中的请求

**修改文件**:
- `apps/frontend/src/app/components/MarkdownEditor.tsx` (重写)

**测试结果**:
```
TypeScript 编译零错误通过（之前的 async Command 类型错误已修复）
```

---

## P2-8: 删除 Pipeline V1 全部代码

**问题**: Pipeline V1 和 V2 共存，V1 路由、引擎、前端面板同时存在但 V1 已无人使用。增加维护负担和代码混淆。

**修复方案**:
1. 删除 `routes/pipeline.js`（V1 路由）
2. 删除 `services/pipelineEngine.js`（V1 引擎）
3. 从 `index.js` 移除 V1 的 import 和注册
4. 前端 `PipelinePanel.tsx`（V1 组件）已在 P1-5 中删除
5. 前端 `conversationApi.ts` 中 V1 API 函数已在 P1-5 中移除

**删除文件**:
- `apps/backend/src/routes/pipeline.js`
- `apps/backend/src/services/pipelineEngine.js`
- `apps/frontend/src/app/components/PipelinePanel.tsx` (P1-5 已删)

**修改文件**:
- `apps/backend/src/index.js` (移除 V1 import 和注册)

**测试结果**:
```
PipelineV2 module OK (V2 不受影响)
```

---

## P2-9: 抽取 readProjectContent 共享函数

**问题**: `review.js`、`antiAi.js`（3 次）、`pipelineV2.js` 中各自实现了相同的"读取项目 .tex 内容"逻辑（~20 行），总计 5 处重复代码。

**修复方案**:
1. 新建 `services/contentReader.js`，提供统一的 `readProjectContent(resolvedPath, chapterScope)` 函数
2. 逻辑：优先 `sec/` → `chapters/` → 项目根目录；支持 chapterScope 单文件读取
3. 替换 `review.js`、`antiAi.js`（3 个端点）、`pipelineV2.js` 中的重复实现

**修改文件**:
- `apps/backend/src/services/contentReader.js` (新建)
- `apps/backend/src/routes/review.js` (移除本地 readPaperContent，使用共享函数)
- `apps/backend/src/routes/antiAi.js` (3 处内联读取逻辑替换为 readProjectContent)
- `apps/backend/src/routes/pipelineV2.js` (移除本地 readPipelineInput，使用共享函数)

**测试结果**:
```
All refactored modules imported successfully
```

---

## P2-10: 拆分巨型组件（初步）

**问题**: `ProjectPage.tsx`(1034行)、`LatexPreview.tsx`(1103行)、`ProjectTree.tsx`(836行) 严重违反单一职责原则。

**修复方案**（初步拆分，降低风险）:
1. 从 `ProjectPage.tsx` 提取 `SettingsModal` 为独立组件
   - 包含 LLM 配置的加载、保存、表单逻辑
   - 移除 ProjectPage 中 ~70 行 LLM 相关工具函数 + ~50 行模态框 JSX
2. ProjectPage 从 1034 行减少到 912 行

**新建文件**:
- `apps/frontend/src/app/components/SettingsModal.tsx`

**修改文件**:
- `apps/frontend/src/app/ProjectPage.tsx` (移除内联设置面板，使用 SettingsModal 组件)

**测试结果**:
```
TypeScript 编译零错误通过
ProjectPage: 1034 → 912 行 (-12%)
```

**后续建议**: 进一步拆分 TemplateGalleryModal、ImportDialog、CreateProjectDialog 等，以及 LatexPreview 的 renderLatex 逻辑。

---

## P2-11: 内联样式迁移到 CSS Modules（Layout 示范）

**问题**: 所有组件使用内联 `style={{}}` 对象，hover 效果只能通过 onMouseEnter/onMouseLeave 模拟，代码膨胀且无法复用。

**修复方案**:
1. 新建 `Layout.module.css`，定义所有交互元素的样式类（按钮、resize handle、terminal 控件等）
2. 使用 CSS `:hover` 伪类替代 JS 事件模拟
3. 重写 `Layout.tsx`，将 12 处 onMouseEnter/onMouseLeave 模式替换为 CSS 类名引用
4. 保留布局相关的 inline style（flex、width 等动态值），仅迁移交互样式

**新建文件**:
- `apps/frontend/src/app/components/Layout.module.css`

**修改文件**:
- `apps/frontend/src/app/components/Layout.tsx` (重写，使用 CSS Modules)

**测试结果**:
```
TypeScript 编译零错误通过
消除 12 处 onMouseEnter/onMouseLeave hover 模拟
```

**后续建议**: 按相同模式迁移 RightPanel、ProjectTree 等组件。

---

## P2-12: AppContext 拆分优化

**问题**: 单一 AppContext 包含文件管理、对话管理、技能管理、终端状态等所有状态。context value 每次渲染都创建新对象引用，导致所有消费者不必要地重渲染。`OpenFile`/`PendingEdit` 接口在多处重复定义。

**修复方案**:
1. 新建 `types/index.ts`，统一定义 `OpenFile` 和 `PendingEdit` 接口
2. 移除 AppContext 中的重复接口定义，改为从 `types/` 导入
3. 用 `useMemo` 包裹 context value，只在依赖真正变化时才创建新引用
4. 将内联箭头函数（`acceptEdit`、`toggleTerminal`）提取为 `useCallback`，避免每次渲染创建新函数

**新建文件**:
- `apps/frontend/src/app/types/index.ts`

**修改文件**:
- `apps/frontend/src/app/context/AppContext.tsx` (useMemo + useCallback + 类型导入)

**测试结果**:
```
TypeScript 编译零错误通过
```

**后续建议**: 进一步拆分为 FileContext + ConversationContext + SkillContext，各自独立 Provider。

---

## 2026-05-28: Remove Compile All chapter count from button label

**问题**: Frontend `Compile All` action displayed the chapter count in the button text, for example `Compile All (10)`, adding unnecessary visual noise.

**修复方案**:
1. Keep the existing compile-all availability logic based on chapter count.
2. Change the visible idle button label to `Compile All`.
3. Remove the chapter count from the button tooltip.

**修改文件**:
- `app/apps/frontend/src/app/components/CenterPanel.tsx`

**测试结果**:
```
npm --workspace apps/frontend run build
```

---

## P3-13: 加 Error Boundary

**问题**: 整个应用没有 React Error Boundary。如果任何组件渲染时抛出异常（如 LatexPreview 处理畸形 LaTeX），整个应用白屏崩溃。

**修复方案**:
1. 新建 `ErrorBoundary.tsx` 组件，捕获渲染异常并显示友好错误界面
2. 提供 "Try Again" 按钮重置错误状态
3. 在 `App.tsx` 中添加两层 ErrorBoundary：
   - 全局顶层：防止整个应用崩溃
   - 每个路由页面级：单个页面崩溃不影响导航

**新建文件**:
- `apps/frontend/src/app/components/ErrorBoundary.tsx`

**修改文件**:
- `apps/frontend/src/app/App.tsx` (包裹 ErrorBoundary)

**测试结果**:
```
TypeScript 编译零错误通过
```

---

## P3-14: 路由级 lazy loading

**问题**: `App.tsx` 直接同步导入所有页面组件，首屏加载全部代码，影响初始加载速度。

**修复方案**:
1. 使用 `React.lazy()` + `import()` 动态导入所有页面组件
2. 添加 `Suspense` 包裹，提供 Loading 占位符
3. 每个页面独立打包为单独 chunk，按需加载

**修改文件**:
- `apps/frontend/src/app/App.tsx` (lazy + Suspense)

**测试结果**:
```
TypeScript 编译零错误通过
```

---

## P3-15: 补充 .env.example 和 DATA_DIR 修复

**问题**: 
- `DATA_DIR` 硬编码为 `/data01/home/xuzk/...`，其他环境无法使用
- 无 `.env.example`，新开发者不知道需要配置哪些环境变量

**修复方案**:
1. 将 `constants.js` 中 `DATA_DIR` 默认值改为 `path.join(REPO_ROOT, 'data')`（相对路径）
2. 新建 `.env.example`，列出所有可配置环境变量及说明

**修改文件**:
- `apps/backend/src/config/constants.js` (DATA_DIR 默认值)

**新建文件**:
- `app/.env.example`

**测试结果**:
```
REPO_ROOT: .../paper_wrighting/app
DATA_DIR: .../paper_wrighting/app/data (正确使用相对路径)
```

---

## P3-16: 修复 workspace 配置，统一类型定义

**问题**: 
- `packages/shared/` 没有 `package.json`，npm workspace 无法识别该包
- `OpenFile`、`PendingEdit` 等接口在 AppContext、CenterPanel、useConversations 中重复定义

**修复方案**:
1. 为 `packages/shared/` 添加 `package.json`（name: `@paper-agent/shared`）
2. 扩展 `types.ts`，统一定义 `OpenFile`、`PendingEdit`、`ConversationMessage` 等共享类型
3. 配置 `exports` 字段使 TypeScript 和 Node.js 都能正确解析

**新建文件**:
- `packages/shared/package.json`

**修改文件**:
- `packages/shared/types.ts` (扩展共享类型)

**测试结果**:
```
npm install --workspace packages/shared → 成功
import '@paper-agent/shared' → OK
TypeScript 编译零错误通过
```
