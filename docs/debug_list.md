# Coding Kanban Bug 修复记录

本文档根据现有仓库记忆整理历史 bug 修复记录。后续每次修复 bug，都应在本文件追加简短记录，说明现象、根因和关键修复点。

## 焦点与输入

- 聚焦视图静态区域点击后，Copilot CLI 会出现“界面还在但无法继续输入”或首字符重复。根因是 `AgentFocusView` 过度依赖 `keydown` 阶段补发事件，且把按钮/链接当作输入控件。修复为在静态区域 `pointerdown` 直接把焦点还给 xterm，并避免重复转发首字符。
- 分栏模式下，从终端点击回 VS Code iframe 后，终端会把焦点抢回。根因是 `TerminalView` 只把原生表单控件视为“有意外部焦点”。修复为把 `iframe` 纳入允许外部焦点的白名单。
- 分栏模式下，从终端切到文件浏览器编辑器或 VS Code 后，输入过程中焦点仍可能被终端抢走。根因是终端只看当前 `document.activeElement`，在 blur/focus 交接瞬间看到 `body` 就误判需要抢焦点；同时 VS Code 抽屉把 `reused` 变化当成新实例。修复为增加外部输入焦点保护窗口，并忽略 `reused` 单独变化带来的 iframe 重载。

## 终端协议与 TUI 握手

- live stdin 过滤掉 DA/DSR/OSC/DCS 应答时，Copilot CLI 等 TUI 会卡在能力握手阶段并静默丢输入。修复为只清洗 replay 内容，不过滤 live stdin 的握手/状态应答。
- 终端 focus-report mock 没有先进入 raw mode，会导致 `CSI I/O` 焦点事件被行缓冲，产生假红测试。修复为在断言聚焦输入前显式把 mock stdin 切到 raw mode。
- shell/prompt 行编辑态触发的 Secondary DA 原样转发会把终端版本串回显到提示符。修复为仅过滤这类会污染 shell 提示符的 Secondary DA，应答性能力握手仍保留。

## tmux 与终端渲染

- 非交互缩略图把真实 tmux 会话 resize 成小终端，导致布局和状态栏错乱。修复为缓存主终端几何尺寸，在前端做本地缩放预览，不把缩略图尺寸回写到后端。
- SSH -> tmux 场景中，仅调用 `node-pty.resize()` 不足以让远端 tmux 感知尺寸变化。修复为补发 `SIGWINCH`，确保 ssh 把尺寸变化转发给远端 client。

## 文件浏览器

- 新建文件/目录弹窗把草稿名称字符串当作开关，输入框清空时弹窗直接卸载。修复为显式维护弹窗状态，并在名称为空时仅禁用提交而不关闭对话框。

## VS Code Web 与 WebSocket 生命周期

- React StrictMode 下，CONNECTING 阶段的 WebSocket 在 effect cleanup 中被关闭，会制造“连接尚未建立就关闭”的假断开提示。修复为在 dev-only 清理路径上延后关闭，等到 `onopen` 后再真正回收。

## 开发环境与测试基础设施

- Playwright 只复用前端 Vite 服务时，可能在 `/api` 代理已经坏掉的情况下误以为测试环境可用。修复为前后端分别做健康检查，避免复用损坏环境。
- Ubuntu 主机缺少 Playwright Chromium 运行库时，浏览器测试无法启动。现有 workaround 是下载所需 `.deb`、提取到本地目录，并通过 `LD_LIBRARY_PATH` 注入依赖。
- `pnpm -r test` 全部断言通过后仍不退出。根因是多个服务级 idle timer 没有 `.unref()`，导致 Node event loop 一直存活。修复为所有仅用于空闲清理的 timer 创建后立即 `.unref()`，并补 `hasRef() === false` 回归。
- `awaiting_input` 相关单测在高负载下可能偶发超时。修复策略是调小测试专用的 `awaitingInputIdleMs` 覆盖值，而不是放大全局默认值。

## 兼容性与环境探测

- shell 解析逻辑曾默认依赖 zsh，导致 Linux/macOS 某些环境无法正常启动。修复为优先读 `SHELL`，再回退到 `bash -> zsh -> sh`。
- tmux 路径曾只假设单一路径，导致 Homebrew Intel/Apple Silicon 或 PATH 安装下行为不稳定。修复为支持 `TMUX_BINARY`、Homebrew 常见路径和 `PATH` 自动探测。
- 前后端端口和 Vite 代理目标曾被硬编码，切换环境后容易错连。修复为统一改成 `HOST`、`PORT`、`WEB_HOST`、`WEB_PORT`、`WEB_BACKEND_*` 等环境变量驱动。