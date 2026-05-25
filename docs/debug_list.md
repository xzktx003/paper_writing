# Debug List

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
