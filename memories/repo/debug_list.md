# Debug List

## 2026-06-05 - AutoQuantizer Qwen3-4B result invalidated by wrong local checkpoint

- Symptom: The Qwen3-4B AutoQuantizer output duplicated Qwen3-0.6B metrics and beta counts.
- Root cause: `/data01/datasets/Qwen3-4B` is a mislabeled 0.6B checkpoint; the final experiment runner trusted the local path without checking config dimensions. The same runner also overwrote externally assigned GPUs via `CUDA_VISIBLE_DEVICES`, and its RTN implementation diverged from the validated int4 RTN baseline.
- Fix: Use the HF `Qwen/Qwen3-4B` alias for final experiments, validate expected layer/hidden sizes before quantization/evaluation, preserve an existing `CUDA_VISIBLE_DEVICES` value, and align AutoQuantizer/final-runner RTN with standard int4 round-to-nearest.

## 2026-06-03 - SPE package sanitizer reintroduced local machine strings

- Symptom: Coding Kanban SPE package docs/tools and the supporting archive
  still contained the exact local path/user fixture strings that the verifier
  was meant to keep out of the publication artifact.
- Root cause: The verifier stored the guarded strings literally and scanned
  only the curated `code/coding_kanban` tree, while the supporting archive also
  ships package docs and tools.
- Fix: Use encoded verifier constants, replace publication-facing literal
  examples with categories, scan package text plus archive text entries, and
  rebuild the generated SPE archives/checksums.

## 2026-06-01 - Release verification test drift

- Symptom: Full `npx vitest run` failed on stale export, settings privacy, and tmux websocket assertions.
- Root cause: Tests still referenced old module names and implementation details after export conversion, settings ownership, and terminal session payload changes.
- Fix: Added `exportToLatex` compatibility alias and updated tests to assert current SettingsModal privacy cleanup and tmux resumable-session behavior.

## 2026-05-27 - Citation verification engine: three core bugs fixed

- **Bug 1 — arXiv DOI not supported by CrossRef**: `10.48550/arXiv.*` DOIs return 404 on CrossRef. Fixed by adding arXiv API as 4th data source, auto-detecting the DOI prefix.
- **Bug 2 — Title search false positives**: Fake titles matched via fuzzy search. Fixed by adding Levenshtein-based `titleSimilarity()` with threshold ≥0.75 and year cross-validation.
- **Bug 3 — Semantic Scholar 429 rate limiting**: Concurrent requests triggered 429. Fixed by adding S2 request queue (1.2s interval) + exponential backoff retry (max 3) + serial batch verification.

## 2026-05-26 - Workspace divider drag range too narrow

- Symptom: Files/editor and editor/AI dividers dragged, but sidebars stopped at 200px/300px and limited editor expansion; the visible 5px handle was hard to grab.
- Root cause: layout resize used fixed large minimums and delta-only updates, without viewport-aware max width or editor minimum protection.
- Fix: add shared panel width constants, lower Files min to 120px and AI min to 180px, preserve a 360px editor minimum, and add an invisible wider resize hit area.

## 2026-05-26 - Rendered/Split preview divergence

- Symptom: Split used `MarkdownPreview`/`LatexPreview`, while Rendered used a separate `RenderedDocumentEditor`, so the same source could render differently across modes.
- Root cause: editor view mode switched both layout and rendering engine; Rendered was not simply “preview without source”.
- Fix: add shared `RenderedPreviewPane`; Split and Rendered both use it, with Rendered only hiding the source pane.

## 2026-05-28 - Compile All button count noise

- Symptom: the frontend compile-all button rendered the idle label as `Compile All (10)` or another chapter count.
- Root cause: `CenterPanel` interpolated `chaptersCount` directly into the visible action label.
- Fix: keep chapter-count logic for availability, but render the button label as `Compile All` and remove the count from the tooltip.

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
- 2026-05-31: 已有论文目录如果缺少 `project.json` 不会被 `/api/projects` 列表识别；用 `scripts/generate-paper-project-json.mjs` 扫描 `papers/` 并为缺失元数据的子目录生成兼容 `project.json`，默认跳过已有元数据以避免覆盖。
- 2026-05-31: `/api/projects` 项目列表扫描现在会自动为新上传到 `papers/` 且包含论文文件的目录生成 `project.json`，解决上传文件夹后必须手动跑脚本的问题；空目录和工具目录保持跳过。
- 2026-05-22: AI 对话的独立 Code scope 只有 UI 标记且与 Agent/Tools 语义混淆；已从新建对话入口和设计文档移除，Agent 限制为建议模式，代码读写/执行仅保留在 Tools 并增加 `code/` 路径边界校验。
- 2026-05-22: 项目路由必须在新建项目和读取 `/api/projects/:id/tree` 时确保 `docs/` 存在；`fig/` 不应被强制创建，图片目录应由导入、模板或用户手动创建。
- 2026-05-22: 移除项目文件树对 `fig/` 的强制自动创建绑定；新建项目和打开旧项目只补齐 `docs/`，`fig/` 仅在导入、模板或用户手动创建时出现。
- 2026-05-22: 删除 `fig/` 后刷新文件树不能重建该目录；项目路由应显式只调用 `ensureDocsSupportDir()`，不要恢复泛化的支持目录列表。
- 2026-05-22: 修复 LLM 配置泄露/分叉风险；API key、base URL、model 统一以仓库根目录 `.env` 为读写源，`/api/config` 只返回脱敏 key 状态，前端设置与转换流程不再从 localStorage 读取或缓存 LLM API key。
- 2026-05-22: 改进集成 Terminal 生命周期；每个项目/cwd 使用稳定 tmux session，关闭面板或刷新页面只断开当前客户端并在下次打开时重新 attach，只有 tmux session 被杀掉时才自动新建。
- 2026-05-22: 修复 Files 右键 Copy Path 在 HTTP/非安全上下文下未真正写入剪贴板、导致用户粘贴到旧选中文本/正文片段的问题；复制路径现在先规范化项目相对路径，并在 Clipboard API 不可用时使用 textarea + execCommand fallback。
- 2026-05-22: Fixed Rendered editor mode semantics. The prior implementation still used CodeMirror source lines with inline replacement widgets, which looked and behaved like source editing rather than an editable compiled preview. Rendered mode now uses a dedicated editable preview surface and keeps malformed/unsupported syntax as editable source fallback.
- 2026-06-02: Vite 开发服务必须显式绑定 `0.0.0.0`，README/Playwright/MCP discovery 默认地址应优先使用 `http://10.30.0.22:8787`；MCP `/api/mcp/info` 需按请求 Host / forwarded headers 生成客户端 URL，不能硬编码 localhost。
- 2026-06-02: React Router future flags 只应放在 `BrowserRouter`；`Routes` 不接受 `future` 属性，重复配置会导致前端 TypeScript 检查失败。
- 2026-06-02: 终端路由不能在模块导入阶段强制加载 `node-pty`；应在首次创建终端会话时懒加载，原生模块不可用时通过 WebSocket 返回错误，避免测试收集和后端启动被可选终端能力阻断。
- 2026-06-02: 依赖审计高危项通过升级 Fastify 5/官方插件、升级后端 `tar`、删除未使用 `pdfjs-dist`、升级 Vite/React 插件修复；提交前需要同时跑 `npm audit`、前端构建和全量 Vitest。
- 2026-06-06: `papers/paper-agent-spe` 的四张论文说明图曾存在框内文字溢出、连线穿字和底部图例交叉；已重排 SVG、重新导出 PDF，并将 Wiley 模板 EPS 小图标切到已有 `*-eps-converted-to.pdf`，Tectonic 需带 `LD_LIBRARY_PATH=/data01/home/xuzk/anaconda3/lib` 才能解析本机缺失的旧 OpenSSL/graphite 库。
- 2026-06-06: `papers/paper-agent-spe` 编译后参考文献消失是因为 `main.aux` 缺 `\bibstyle`，BibTeX 生成空 `.bbl`；修复为显式加载 `NJDnatbib` 数字模式、使用 `wileyNJD-Chicago-lastoo`，并把 `@online` 改为 Wiley `.bst` 支持的 `@misc`。`verify.sh` 现在会检查 PDF 中的 `[?]`、References 缺失和 author-year 标签泄漏。
- 2026-06-06: `papers/paper-agent-spe` 正文、架构图和投稿 bundle 曾残留 PDF.js/Turborepo 旧实现描述，以及 Wiley 模板日期/假 DOI；删除占位元数据后还会输出空历史字段和裸 DOI 页脚。已改为 native browser PDF viewer/embed、npm workspaces/concurrently，`USG.cls` 对空生产元数据不输出标签/DOI，并同步 `submission-upload/latex-bundle` 的正文、图、类文件、images 兼容目录和 `wiley/*.bst`，避免上传包独立编译时参考文献丢失。
