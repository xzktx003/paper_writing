# 仓库 bug 修复记录

- 聚焦视图静态区域点击后输入失效或首字符重复：`AgentFocusView` 过度依赖 `keydown` 补发，且把按钮/链接当作输入控件；修复为在 `pointerdown` 直接归还终端焦点并避免重复转发。
- 从终端切回 VS Code iframe 后焦点被终端抢回：`TerminalView` 未把 `iframe` 视为有意外部焦点；修复为把 `HTMLIFrameElement` 加入允许列表。
- 从终端切到文件浏览器编辑器或 VS Code 后，输入过程中焦点仍会被终端抢走：终端只看当前 `activeElement`，交接瞬间看到 `body` 就误抢；同时 VS Code 抽屉把 `reused` 变化当成新实例；修复为增加外部输入焦点保护窗口，并忽略 `reused` 单独变化。
- live stdin 过滤握手应答导致 Copilot CLI 等 TUI 卡死：修复为仅清洗 replay，不过滤 live stdin 的 DA/DSR/CPR 等应答。
- 终端 focus-report mock 未进入 raw mode 导致测试假红：修复为断言前先切 raw mode。
- Secondary DA 应答污染 shell 提示符：修复为只过滤会造成噪音的 Secondary DA，保留必要握手应答。
- 非交互 tmux 缩略图回写 resize 导致真实 pane 缩小：修复为缓存 live geometry，在前端做本地缩放预览。
- SSH -> tmux resize 不生效：`node-pty.resize()` 不足；修复为额外发送 `SIGWINCH`。
- 文件浏览器创建弹窗在输入清空时意外关闭：把草稿字符串误当作弹窗开关；修复为显式维护弹窗状态。
- StrictMode 下 WebSocket cleanup 造成假断开提示：CONNECTING 阶段过早 close；修复为等到 `onopen` 后再关闭。
- Playwright 只复用前端导致坏后端环境被误复用：修复为前后端分别做健康检查。
- Playwright Chromium 缺系统库时浏览器测试无法启动：沉淀了本地 `.deb` + `LD_LIBRARY_PATH` 的 rootless workaround。
- idle cleanup timer 未 `.unref()` 导致 `pnpm -r test` 不退出：修复为统一 `.unref()` 并补 `hasRef() === false` 回归。
- `awaiting_input` 单测在高负载下偶发超时：修复策略是收紧测试 override，而不是改全局默认值。
- shell 逻辑默认依赖 zsh 导致兼容性问题：修复为优先 `SHELL`，再回退到 `bash -> zsh -> sh`。
- tmux 路径只支持单一路径导致不同机器行为不稳：修复为支持 `TMUX_BINARY`、Homebrew 常见路径和 `PATH` 自动探测。
- 端口与代理硬编码导致切换环境易错连：修复为统一改成 env 驱动。
