# Debug List

## 2026-05-22 - Restart script resolved app paths under `scripts/`

- Symptom: `sh scripts/restart.sh` tried to enter `scripts/app/apps/frontend` and `scripts/app/apps/backend`, then reported success against an already-running service.
- Root cause: the script treated its own directory as the repository root.
- Fix: derive `REPO_ROOT` from `scripts/..`, validate expected directories before restart, detach the backend start with `setsid` when available, and add a shell regression test for root and `scripts/` invocation paths.

## 2026-05-22 - Project delete failed when `project.json` was missing

- Symptom: deleting project `c2b87dfc-af29-42ef-b088-0f28aa9d65c3` returned HTTP 500 with `ENOENT` while opening `papers/<id>/project.json`.
- Root cause: the soft-delete route read `project.json` unconditionally before marking the project as trashed. A follow-up issue also showed project IDs can differ from their directory names, for example `project.json.id=c2b87dfc...` under `papers/torq`, so deleting by ID was a no-op against a non-existent `papers/<id>` directory.
- Fix: make project deletion tolerant of missing or invalid metadata, resolve project roots by scanning `project.json.id` when the direct directory does not exist, and treat already-removed project directories as successful no-ops.
- Regression: added a Fastify route test and a Playwright delete-flow script. On this machine, browser launch is blocked by missing GTK/ATK system libraries, so the Playwright script falls back to Playwright APIRequest validation.

- 2026-05-22: AI Assistant 工具路径必须通过 getProjectRoot(projectId) 解析，不能直接拼 DATA_DIR/id；torq 这类目录名与 project.json id 不一致的项目会否则报 ENOENT。

- 2026-05-22: Terminal WS 不能假设系统有 `script` 命令；spawn 必须监听 `error`，OpenPrism cwd 也需用 getProjectRoot() 解析真实项目目录。
- 2026-05-22: AI 对话的独立 Code scope 只有 UI 标记且与 Agent/Tools 语义混淆；已从新建对话入口和设计文档移除，Agent 限制为建议模式，代码读写/执行仅保留在 Tools 并增加 `code/` 路径边界校验。
- 2026-05-22: 项目路由必须在新建项目和读取 `/api/projects/:id/tree` 时确保 `docs/` 存在；`fig/` 不应被强制创建，图片目录应由导入、模板或用户手动创建。
- 2026-05-22: 移除项目文件树对 `fig/` 的强制自动创建绑定；新建项目和打开旧项目只补齐 `docs/`，`fig/` 仅在导入、模板或用户手动创建时出现。
- 2026-05-22: 删除 `fig/` 后刷新文件树不能重建该目录；项目路由应显式只调用 `ensureDocsSupportDir()`，不要恢复泛化的支持目录列表。
- 2026-05-22: 修复 LLM 配置泄露/分叉风险；API key、base URL、model 统一以仓库根目录 `.env` 为读写源，`/api/config` 只返回脱敏 key 状态，前端设置与转换流程不再从 localStorage 读取或缓存 LLM API key。
- 2026-05-22: 改进集成 Terminal 生命周期；每个项目/cwd 使用稳定 tmux session，关闭面板或刷新页面只断开当前客户端并在下次打开时重新 attach，只有 tmux session 被杀掉时才自动新建。
- 2026-05-22: 修复 Files 右键 Copy Path 在 HTTP/非安全上下文下未真正写入剪贴板、导致用户粘贴到旧选中文本/正文片段的问题；复制路径现在先规范化项目相对路径，并在 Clipboard API 不可用时使用 textarea + execCommand fallback。
- 2026-05-22: Fixed Rendered editor mode semantics. The prior implementation still used CodeMirror source lines with inline replacement widgets, which looked and behaved like source editing rather than an editable compiled preview. Rendered mode now uses a dedicated editable preview surface and keeps malformed/unsupported syntax as editable source fallback.
