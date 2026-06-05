# Coding Kanban Bug 修复记录

本文档根据现有仓库记忆整理历史 bug 修复记录。后续每次修复 bug，都应在本文件追加简短记录，说明现象、根因和关键修复点。

## 焦点与输入

- 聚焦视图静态区域点击后，Copilot CLI 会出现“界面还在但无法继续输入”或首字符重复。根因是 `AgentFocusView` 过度依赖 `keydown` 阶段补发事件，且把按钮/链接当作输入控件。修复为在静态区域 `pointerdown` 直接把焦点还给 xterm，并避免重复转发首字符。
- 分栏模式下，从终端点击回 VS Code iframe 后，终端会把焦点抢回。根因是 `TerminalView` 只把原生表单控件视为“有意外部焦点”。修复为把 `iframe` 纳入允许外部焦点的白名单。
- 分栏模式下，从终端切到文件浏览器编辑器或 VS Code 后，输入过程中焦点仍可能被终端抢走。根因是终端只看当前 `document.activeElement`，在 blur/focus 交接瞬间看到 `body` 就误判需要抢焦点；同时 VS Code 抽屉把 `reused` 变化当成新实例。修复为增加外部输入焦点保护窗口，并忽略 `reused` 单独变化带来的 iframe 重载。
- VS Code 分栏打开时，用户已经点回终端输入，过一会仍可能再次失焦，必须再点一次终端才能继续。根因是 `TerminalView` 只在离散 blur/focus 事件上补救，缺少对“最近一次本来就是终端”的被动失焦修复；当 VS Code iframe 生命周期让焦点短暂掉到 `body` 时，终端不会自动补回。修复为记录最近一次终端/外部焦点意图，并仅在“最近一次是终端”时启动轻量焦点修复守护。
- 终端已经进入可输入状态时，空闲一阵后仍可能再次失焦，必须补点一下才能继续输入。根因是被动焦点修复把“从未有外部输入控件接管过焦点”的场景也判成了“没有足够证据归还终端”，导致活动终端在默认输入 owner 身份下发生焦点漂移时不会自动修复。修复为让 `TerminalView` 在没有受保护外部焦点记录时默认继续修复活动终端的 helper textarea。
- VS Code / 文件浏览器分栏打开时，用户点回终端后仍可能被后台 iframe 或编辑器的程序化 `focus()` 抢走，表现为过一会又要补点终端。根因是 `TerminalView` 把当前 `document.activeElement` 是 iframe/input 直接等价为“用户有意选择外部输入”，没有区分用户点击和后台被动 focus；隐藏保活的侧栏面板也仍可参与焦点竞争。修复为把焦点所有权改成最近一次用户意图模型：只有外部指针、外部键盘输入或带用户激活的 iframe focus 才能接管；终端点击后后台 focus 不再覆盖；非 active 侧栏面板加 `inert` 并在隐藏时释放内部焦点。
- 本机连接其他服务器时，看板文件浏览器报 `All configured authentication methods failed`、看不到远端文件列表。根因是终端会走系统 `ssh`，能自动使用默认私钥；但文件浏览器走后端 `ssh2` 的 SFTP 直连，只会在 `identityFile` 显式配置时携带私钥，导致未写 `IdentityFile` 的主机全部认证失败。修复为 SFTP 认证优先使用显式 `identityFile`，否则回退到标准默认私钥，并兼容 `SSH_AUTH_SOCK`。
- 远端 SSH 会话已在线时，打开文件浏览器仍偶发空白并报 `write ECONNRESET` / `No response from server`。根因是 `SftpService` 在 SSH 连接 `ready` 前就把连接对象放进池里，导致并发的首批 `/api/fs/list` 请求复用了半初始化连接。修复为复用现有连接前先等待 `ready` 完成，并在连接失败时及时从池里移除。
- 远端 SSH 会话已退出或目标并不提供 shell（如 Gerrit SSH 接口）时，kanban 卡片终端只显示 `[连接已断开]`，看不到真实错误。根因是 PTY 退出后 runtime handle 立即删除，terminal websocket 再连接时拿不到历史回放，只能 4004 关闭并让前端退化成泛化断开提示。修复为 terminal websocket 在 runtime 已退出但 session 仍存在时，回退到 registry 的历史输出回放。

## 终端协议与 TUI 握手

- live stdin 过滤掉 DA/DSR/OSC/DCS 应答时，Copilot CLI 等 TUI 会卡在能力握手阶段并静默丢输入。修复为只清洗 replay 内容，不过滤 live stdin 的握手/状态应答。
- 终端 focus-report mock 没有先进入 raw mode，会导致 `CSI I/O` 焦点事件被行缓冲，产生假红测试。修复为在断言聚焦输入前显式把 mock stdin 切到 raw mode。
- shell/prompt 行编辑态触发的 Secondary DA 原样转发会把终端版本串回显到提示符。修复为仅过滤这类会污染 shell 提示符的 Secondary DA，应答性能力握手仍保留。
- kanban 终端偶发回显 `11;rgb:... 10;rgb:... 4;...`。根因是 OSC 10/11/4 color-query replies 通过 live stdin 泄漏到 PTY。修复为在 live stdin 路径做窄化过滤，只屏蔽这类 rgb 回包，同时保留 DA/DSR/CPR 等握手回复。

## tmux 与终端渲染

- 轻量预览下未开启完整小终端时，浏览器资源诊断仍显示 `/ws/agent-sessions` 达到数百 msg/s、数 MB/s，内存和网络持续增长。根因是每个终端输出帧都会触发后端发送一次全量会话 snapshot，前端必须持续 JSON 解析并刷新 React 状态。修复为对高频输出触发的全量看板快照做 trailing 合并广播，结构性操作仍即时刷新，同时避免 observe-only 会话输出时创建无效 awaiting_input timer。
- 选定机器扫描 tmux 会话后，按钮会在“扫描中...”和“刷新”之间频繁交替。根因是 `TmuxDiscoveryPanel` 把全局 `sessions` 列表放进自动扫描 effect 依赖，WebSocket snapshot 刷新会话列表时会反复触发 `/api/agent-discovery/tmux/scan`；并发 scan 的旧请求也可能提前把 `loading` 改回 false。修复为扫描触发只依赖稳定 host key，`sessions` 更新只重新计算已加入标记，并用请求序号/host key 丢弃过期扫描结果。
- 非交互缩略图把真实 tmux 会话 resize 成小终端，导致布局和状态栏错乱。修复为缓存主终端几何尺寸，在前端做本地缩放预览，不把缩略图尺寸回写到后端。
- SSH -> tmux 场景中，仅调用 `node-pty.resize()` 不足以让远端 tmux 感知尺寸变化。修复为补发 `SIGWINCH`，确保 ssh 把尺寸变化转发给远端 client。
- 远端新建 tmux 会话时，`copilot` / `codex` / `claude` 这类非 shell agent 会在启动命令退出后把整个 tmux session 一起带没，看起来像“只能建 shell，不能建远端 tmux”。根因是前端 `buildTmuxLaunchCommand` 与服务端实现漂移，非 shell 分支少了 keep-pane-open 包装。修复为复用带 `exec "$SHELL_BIN" -i` 的 tmux pane 命令构造，保证 agent 退出后 pane 仍留在交互 shell 中。
- 远端 `10.30.0.24` 上从看板启动 Copilot 会话时，看起来像“tmux 创建失败”，实际是该主机把 `copilot` 解析到了一个缺少 `index.js` 的 `~/.nvm/.../bin/copilot` node shim。修复为远端 Copilot 启动命令先尝试健康的 `copilot` 可执行文件；若命中损坏 shim，则回退到 `node ../lib/node_modules/@github/copilot/npm-loader.js` 直接启动 CLI。
- 远端 `10.30.0.24` 上直接创建 shell tmux 时，默认名 `10.30.0.24_shell_tmux` 会被旧版 tmux 3.0a 拒绝并报 `bad session name`。根因是默认会话名生成器在 tmux 模式下仍保留 `.`。修复为 tmux 模式下对 host label 使用更严格的名字规范化，把 `.` 一并收敛成 `_`，生成 `10_30_0_24_shell_tmux` 这类 tmux-safe 名称。

## 文件浏览器

- 新建文件/目录弹窗把草稿名称字符串当作开关，输入框清空时弹窗直接卸载。修复为显式维护弹窗状态，并在名称为空时仅禁用提交而不关闭对话框。
- 服务端构建在文件下载路由处报 `archiver` 没有导出 `ZipArchive`，改成默认导入后又在 Node ESM 运行时报 no default export。根因是 `archiver` v8 运行时导出 `ZipArchive`，但当前类型声明仍按旧的 `export = archiver` 函数形态暴露。修复为使用 namespace runtime import，并在类型层显式声明 `ZipArchive` 构造器，保留本地/远端目录下载逻辑。

## VS Code Web 与 WebSocket 生命周期

- kanban 里的内嵌 VS Code Web 在自签 HTTPS 下会出现 PNG 预览 / webview 打不开。根因不是 PNG 本身，而是 code-server 的 webview / 预览链路依赖 service worker；浏览器虽然允许你“继续访问”自签页面，但仍会因为证书不受信任而拒绝给 `/vscode/.../service-worker.js` 注册 service worker。修复为让 `restart-dev.sh` 在本机装有 `mkcert` 时优先生成浏览器信任的本地证书，并在只能回退到 OpenSSL 自签证书时明确告警。
- React StrictMode 下，CONNECTING 阶段的 WebSocket 在 effect cleanup 中被关闭，会制造“连接尚未建立就关闭”的假断开提示。修复为在 dev-only 清理路径上延后关闭，等到 `onopen` 后再真正回收。
- SSH 远端会话打开 VS Code Web 时总被判定为“不支持”。根因是 `VsCodeWebManager` 之前只实现了本地 editor 生命周期。修复为补充 SSH 远端 `code-server` 的启动/复用、健康检查，以及 `/vscode/` 代理目标切换，先支持像 `10.30.0.24` 这类可被后端直连的远端主机。
- `10.30.0.24` 上 SSH 远端会话虽然能返回 VS Code URL，但 iframe 仍然只显示 404：根因有三层叠加——tunnel helper 继承了 ssh config 里的 `RemoteForward 18888`、远端优先复用了 `.vscode-server/.../code-server` 这类返回 404 的 agent binary、而旧错误进程还持续占着 `13338` 端口。修复为让 VS Code tunnel 使用 configless ssh、远端只启动 standalone `code-server`、并在健康检查失败时先清理目标端口上的陈旧监听进程，再拉起新实例。
- SSH 远端会话在前端里依然打不开 VS Code，只剩文件浏览器可用。根因是 `App.tsx` 仍把 `vscodeAvailable` 写成了“仅本地会话可用”的布尔门禁，导致即便后端远端 `/vscode-web` 已经打通，SSH session 的 VS Code 按钮也会被禁掉。修复为让聚焦态 SSH 会话同样允许打开 VS Code Web，并同步修正文案。
- `10.30.0.23` / `10.30.0.21_host` 这类远端主机仍然打不开 VS Code：一层根因是部分机器根本没装 standalone `code-server`；另一层根因是 remote VS Code 的 configless tunnel 只规避了 ssh config 里的 `RemoteForward` 污染，却没有先解析 ssh config 里的 alias / port / identity，于是 `10.30.0.21_host` 这类别名和 `10.30.0.23` 这类靠 ssh config 改端口的主机都会把 tunnel 连错。修复为在目标机补装 standalone `code-server`，并让 tunnel 在 `ssh -F /dev/null` 前先通过 `ssh -G` 解析出真实 `hostname/port/identityfile` 再发起连接。
- 看板通过本地 `/vscode` 代理打开 VS Code Web 时，HTTPS 页面里的图片预览仍可能加载失败。根因是代理层之前只把后端看到的 `request.protocol/host` 原样转发给上游 `code-server`；当前端开发页经由 HTTPS 访问、后端实际走本地 HTTP 代理时，上游收到的却是错误的 `http + 本地端口`，从而生成了错误的预览资源来源。修复为让 `/vscode` 代理和 `/api/agent-sessions/:id/vscode-web` 一样，优先从浏览器的 `Origin/Referer` 或现有转发头推导公开 `host/protocol`，再转发给上游。
- 本地 HTTPS 开发证书已经回退到 OpenSSL 自签时，VS Code Web 的 webview / 图片预览仍会报 `Could not register service worker ... An SSL certificate error occurred`。根因是浏览器不会为不受信任的自签证书注册 service worker，而旧脚本在“复用现有证书”路径上既不会持续告警，也不会在后续装上 `mkcert` 后自动升级证书。修复为：1）修正现有证书 SAN 匹配，避免 IP SAN 误判导致行为漂移；2）为脚本生成的证书写入 metadata，复用 OpenSSL 自签证书时持续输出 VS Code 预览受限告警；3）一旦检测到 `mkcert` 已可用，自动淘汰旧自签证书并重签为受信任证书。

## 开发环境与测试基础设施

- Playwright 只复用前端 Vite 服务时，可能在 `/api` 代理已经坏掉的情况下误以为测试环境可用。修复为前后端分别做健康检查，避免复用损坏环境。
- Ubuntu 主机缺少 Playwright Chromium 运行库时，浏览器测试无法启动。现有 workaround 是下载所需 `.deb`、提取到本地目录，并通过 `LD_LIBRARY_PATH` 注入依赖。
- `pnpm -r test` 全部断言通过后仍不退出。根因是多个服务级 idle timer 没有 `.unref()`，导致 Node event loop 一直存活。修复为所有仅用于空闲清理的 timer 创建后立即 `.unref()`，并补 `hasRef() === false` 回归。
- `awaiting_input` 相关单测在高负载下可能偶发超时。修复策略是调小测试专用的 `awaitingInputIdleMs` 覆盖值，而不是放大全局默认值。
- `awaiting-input timer retries when the first idle check fires early` 测试在引入 timer `.unref()` 纪律后失败，报假 timer handle 没有 `unref`。根因是测试 mock 的 `setTimeout` 返回数字句柄，已经不符合生产代码对 Node timeout 的最小契约。修复为让假 timeout 提供并断言 `unref()`，继续覆盖早触发重试逻辑。
- `launch does not surface npm config warnings before local Copilot starts` 单测稳定超时。根因是测试直接依赖当前机器真实 `copilot` 启动文案，而不是仓库已有的 `.playwright-bin/copilot` stub。修复为在该测试内显式启用 `PLAYWRIGHT_TEST=1` 并把 stub 目录加入 `PATH`，断言 fake 或真实 Copilot 启动均不得出现 `Unknown env config`。

## 兼容性与环境探测

- shell 解析逻辑曾默认依赖 zsh，导致 Linux/macOS 某些环境无法正常启动。修复为优先读 `SHELL`，再回退到 `bash -> zsh -> sh`。
- tmux 路径曾只假设单一路径，导致 Homebrew Intel/Apple Silicon 或 PATH 安装下行为不稳定。修复为支持 `TMUX_BINARY`、Homebrew 常见路径和 `PATH` 自动探测。
- 前后端端口和 Vite 代理目标曾被硬编码，切换环境后容易错连。修复为统一改成 `HOST`、`PORT`、`WEB_HOST`、`WEB_PORT`、`WEB_BACKEND_*` 等环境变量驱动。

## 终端焦点保留

- commit `fc57a80` 引入的"保留显式用户焦点"修复过度：`rememberExternalPointerIntent` 只对"受保护目标"（input、iframe、dialog 等）记录外部点击意图，导致点击普通 div、按钮等非保护元素时终端立刻抢回焦点。`hasIntentionalExternalFocus` 里对非保护、非 body 元素直接返回 `false`，进一步放大了这个问题。修复为：1）`rememberExternalPointerIntent` 对 `.terminal-view` 以外的任意 `pointerdown` 都记录意图；2）`hasIntentionalExternalFocus` 简化为纯时间戳比较，不再区分 active element 类型。
- VS Code Web 与终端来回切换两轮后，点击 VS Code iframe 内部无法重新输入。上一轮修复只覆盖父文档能收到 `pointerdown` 的外部点击；真实 iframe 内点击不会稳定冒到父页面，导致 `lastTerminalIntentAt` 仍然更新于外部意图之后，`handleWindowFocus` / 被动焦点修复又把 xterm-helper textarea 抢回。修复为在父窗口 `blur`、被动终端聚焦前，基于当前 `document.activeElement` 补记 hovered iframe 的外部焦点意图，并补 VS Code -> 终端 -> VS Code round-trip e2e 回归用例。
