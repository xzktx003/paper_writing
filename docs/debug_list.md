# Coding Kanban Bug 修复记录

本文档根据现有仓库记忆整理历史 bug 修复记录。后续每次修复 bug，都应在本文件追加简短记录，说明现象、根因和关键修复点。

- 2026-07-22：根目录 `npm start` 转发到 app workspace 后使用 `node --env-file=.env`，在尚未创建 `app/.env` 的既有部署上会在后端启动前直接报错退出。启动脚本改为兼容读取仓库根 `.env`，再以 `app/.env` 作为优先覆盖，并使用 `--env-file-if-exists` 允许可选配置文件缺失；工具链契约测试锁定真实启动命令。

- 2026-07-22：生产构建能够通过，但仓库没有执行真实 `tsc --noEmit`，导致 Skills 描述表重复键、工作区恢复 Tab 联合缺少 `dirty/draft`、项目请求参数包含可选 `undefined` 等类型错误长期绕过发布门禁。修复为统一持久化工作区模型、明确请求参数字典类型、移除重复映射，并把 `typecheck` 接入根/app 脚本和 `check`。

- 2026-07-22：LaTeX 编译遇到缺失 `.sty/.cls/.def/.bst` 时会默认调用 `tlmgr search/install`，普通预览请求也可能修改宿主 TeX 环境并触发网络下载。修复为编译服务、单文件/全文路由和前端 API 统一加入请求级 `allowPackageInstall`；缺省关闭且仅字面布尔值 `true` 授权，自动重试继续继承同一显式授权，现有 UI 默认调用保持不安装。

- 2026-07-22：设置页把 Provider 硬编码成 `openai-compatible`，没有 CLI 可用性探测、模型能力声明、连接测试或保存失败反馈；通用 API helper 还从 `localStorage.api_token` 读取长期令牌，启用后端 Bearer 鉴权后部分 fetch/XHR/WebSocket 会失去访问能力。修复为引入统一 AgentProvider registry 和五种正式 Provider，CLI 固定命令/参数/cwd 并补齐超时、取消、输出、退出状态与 provenance；设置页等待保存/测试结果，服务访问令牌改为 sessionStorage，并统一覆盖同源 API、XHR、Terminal 与 watcher 鉴权通道。

- 2026-07-22：正式 React 工作区仍在章节、AI、审稿、Pipeline、watcher 和 Terminal 请求中混用 `__paper_agent__:<id>` / `projectPath`，导致 managed 项目身份与外部绝对路径能力边界不清。修复为统一 `projectId + relativePath + Project Locator` 主路径；旧 marker 仅作为可观测、带弃用响应头的兼容输入，managed API 拒绝外部绝对路径，Code/MCP 外部目录能力保留独立受控契约。

- Paper Writer RAG 上传 PDF 后看似进入知识库，但实际只索引文件名、大小和 MIME 等 metadata，用户问 PDF 正文内容时检索不到真实证据。根因是 `/api/projects/:id/rag/upload` 对 PDF 只写一个 `.md` metadata sidecar，`indexProjectCorpus` 又会尝试把 PDF 文件当 UTF-8 文本读取。修复为 PDF 上传时抽取真实正文并写入 `*.extracted.md`，用 `*.rag.json` 记录解析状态，索引器只索引抽取文本，并在文档状态中暴露 `parsed` / `metadata-only` / `failed`。

- `local-fs-service.test.ts` 中 chmod 测试使用 `640` 但 `validateChmodMode` 要求八进制模式必须以 `0` 开头（如 `0640`）。修复为更新测试值为 `0640`。
- `relativePaths` 解析后直接用于 `path.join(targetDirectory, relativePaths[fileIndex])`，未校验 `..` 分段，可构造 `../../../etc/passwd` 实现目录穿越上传。修复为在解析后逐条调用 `assertSafeFilesystemPath` 校验路径条目。
- `buildRemoteCommand` 对 `input.command` 仅做单引号包裹，未拦截反引号 `$() \"` 等危险 shell 元字符，攻击者可注入命令。修复为执行前用正则 `[\x00-\x1f\x7f`$\"\\]` 检测危险字符，超标则拒绝执行。
- `chmod` 路由对 mode 参数只做了 `assertSafeFilesystemPath`，但文件系统工具层的 `assertSafeFilesystemPath` 只检查 `..` 和控制字符，不校验 mode 格式（如 `0777`/`0x755`）或危险权限位（setuid/setgid/world-writable 组合）。修复为 `LocalFsService` 新增 `validateChmodMode` 校验八进制格式并阻断危险权限位组合。
- SFTP `chmod` 路由只调用 `assertSafeFilesystemPath`，未复用 `LocalFsService` 的 `validateChmodMode` 校验，导致远端 chmod 仍可接受非八进制格式和危险权限位组合。修复为将 `validateChmodMode` 提取到 `file-system-utils.ts` 共享模块，SFTP 和本地服务均使用同一校验。
- `App.tsx` 的 `handleCopyConnectCommand` 直接调用 `navigator.clipboard.writeText`，在 HTTP 页面或权限受限时失败。修复为使用已有的 `copyTextToClipboard` 工具，优先 API 失败时回退到 textarea + execCommand。
## 验证与开发环境

- `pnpm e2e` 在缺少 Playwright Chromium 系统库（如 `libatk-1.0.so.0`）的机器上会把全部浏览器用例刷成 90+ 个失败，难以判断是否为真实产品回归。根因是 e2e 入口没有浏览器启动前置检查。修复为在正式运行 Playwright 前先启动一次 headless Chromium；若缺系统库，直接输出缺失库名和 `npx playwright install` / `sudo npx playwright install-deps` 修复步骤。

## 文件浏览器

- 文件浏览器 chmod 接口会接受 `777abc` 这类非完整八进制权限字符串，并因 `parseInt(mode, 8)` 截断而实际按 `0777` 执行；路由层还会把部分参数错误归为 500。修复为新增严格权限解析，只接受 3 或 4 位八进制权限，本地和 SFTP chmod 共用同一规则，并把非法 mode、空路径、非法路径字符等参数错误映射为 400。
- 文件上传接口遇到非法 multipart JSON 字段（如损坏的 `relativePaths` 或非字符串数组）会抛出解析异常并按 500 返回。修复为对 `sshTarget`、`relativePaths` 做显式 JSON 字段解析和类型校验，非法上传参数统一按 400 返回。
- 前端文件上传在 HTTP 2xx 但响应体为空、非 JSON 或缺少 `uploadedPaths` 时，会在 `xhr.onload` 回调里直接 `JSON.parse` 或类型断言，异常逃逸出 Promise，调用方可能只看到上传卡住或泛化错误。修复为集中解析并校验上传响应结构，非法响应通过 Promise reject 返回明确错误。
- 前端通用 API helper 对所有成功响应都调用 `response.json()`，导致 `killTmuxSession` 这类后端返回 `204 No Content` 的成功操作在客户端仍抛出 JSON 解析错误。修复为成功响应解析器显式支持 204 和空响应体，同时保留非空响应的 JSON 校验。
- 前端通用 API helper 在 HTTP 失败且响应头为 JSON 时直接调用 `response.json()`，如果后端或代理返回空 JSON、损坏 JSON，会把语法错误暴露给调用方而不是稳定的 HTTP 状态错误。修复为失败响应解析器只在合法 `{ error: string }` 时使用服务端错误文案，空/损坏 JSON 回退到 `Request failed: <status>`，纯文本错误仍保留原文。
- 前端 agent session snapshot WebSocket 对每条消息都直接 `JSON.parse` 并按 snapshot 断言，代理噪声、损坏帧或未来非 snapshot 事件都可能让消息处理器抛错，导致看板停留在旧会话状态。修复为新增快照事件解析器，非法 JSON、非 snapshot 事件和畸形 payload 都被安全忽略，合法 snapshot 才更新 UI。
- 目录建议接口 `/api/directory-suggestions` 在请求体缺少 `prefix` 或 `prefix` 不是字符串时，会在 service 内调用 `.trim()` 触发 500。修复为在 service 入口校验 `prefix`，路由将该类客户端输入错误映射为 400，并补缺失/非字符串前缀回归。
- 文件浏览器 JSON 接口 `/api/fs/list`、`/api/fs/operation`、`/api/fs/preview`、`/api/fs/chmod`、`/api/fs/download` 仍有多处直接读取请求体字段，非字符串 `path`、非法 `showHidden` / `maxBytes`、错误类型的 `newPath` 或非法 SSH 端口会触发内部异常，或把坏参数交给本地文件/SFTP 服务。修复为在路由入口统一校验请求体、路径、布尔值、预览大小、操作类型和 SSH 目标；multipart 上传中的 `sshTarget` 元数据也复用同一校验。
- 文件浏览器预览区高度从 localStorage 恢复时只校验最小值，旧缓存中的超大高度会让预览区挤占文件列表；而用户拖拽时已有按容器高度夹紧的规则。修复为把预览高度夹紧逻辑抽成共用 helper，打开抽屉和容器尺寸变化时按当前布局重新夹紧，避免 stale storage 破坏列表可用空间。

## SSH 与命令参数

- SSH 命令参数构造只校验了 host、username、identityFile 等字符串字段，没有运行时校验 `port`、本地转发端口和连接超时；JSON 请求可传入字符串端口、0 或越界值并被透传给 `ssh -p` / `-L`。修复为在 `buildSshArgs` 边界强制端口为 1-65535 的整数，连接超时为正整数，并补非法端口回归测试。
- SSH 主机列表解析 `Host gpu22 gpu22-lan *.internal` 这类多 alias 配置时，会把 `gpu22 gpu22-lan *.internal` 当成一个主机名，或因为同一行含通配符而跳过可用 alias；非法 `Port` 还会解析成 `NaN` 并在 JSON 响应里变成 `null`。修复为按 alias 展开 `Host` 行、单独过滤通配 alias，并把非法端口回退到 22。

## 本地运行时

- 本地 agent / PTY 启动时，`workingDirectory` 解析没有复用文件系统路径安全规则，包含 `..` 段、空字节或换行的脏路径会进入 `statSync` / spawn cwd 解析路径。修复为在 `resolveLocalWorkingDirectory` 入口复用 `assertSafeFilesystemPath`，非法 cwd 直接回退到当前工作目录，并补路径穿越与非法字符回归。
- `/api/agent-sessions/:id/stdin` 在请求体缺少 `input` 或 `input` 不是字符串时，会把坏输入透传到 tmux、SSH、PTY 或本地 runtime，触发内部异常或 500。修复为在 stdin 路由入口统一校验 `input`，非法请求返回 400，并补缺失/非字符串输入回归。
- `PATCH /api/agent-sessions/:id` 改名接口在 `displayName` 为数字或对象时会直接调用 `.trim()`，导致内部异常和 500。修复为先校验 `displayName` 必须是字符串，非字符串返回 400，并补回归测试。
- `PATCH /api/agent-sessions/:id` 的隐藏会话字段用 `Boolean(hidden)` 强制转换，客户端误传字符串 `"false"` 也会被当作 `true` 并隐藏会话。修复为 `hidden` 只接受真实 boolean，其他类型返回 400，且不改变原会话状态。
- 多个会话详情、聚焦、stdin、删除等路由在传入不存在的 session id 时直接透传 `registry.get/focus` 的 `Unknown agent session` 异常，客户端会收到泛化 500。修复为 agent session 路由插件统一把该已知 registry 错误映射为 404，同时保留其他异常的默认处理，并补常见路由回归。

## 焦点与输入

- 文件浏览器右键文件或文件夹后点击“复制路径”在局域网 HTTP 页面会失败。根因是代码直接调用 `navigator.clipboard.writeText`，而 Clipboard API 在非安全上下文或权限受限时不可用。修复为增加剪贴板 helper，优先使用 Clipboard API，不可用或被拒绝时回退到隐藏 textarea + `execCommand('copy')`，并补右键文件/目录复制路径回归测试。
- 多屏聚焦视图中，选中不同终端后顶部标题栏和“改名”按钮仍指向最初进入聚焦页的终端。根因是标题栏直接读取 App 层 `focusedSession`，而多屏切换输入窗格在侧栏工具未打开时不会同步外层 focused session。修复为标题、状态、改名和重连按钮优先使用当前 active monitor slot 对应的 session，找不到时再回退到 `focusedSession`。
- 多屏聚焦视图从“其他会话”拖入屏幕时，浏览器拖拽缩影会混入多个其他会话预览。根因是未显式设置 drag image，浏览器默认截图包含终端预览的侧栏卡片时容易把相邻缩影一起带入拖影。修复为拖拽开始时创建只包含当前会话名称和少量输出的专用单会话拖影，拖拽结束或 drop 后清理。
- 聚焦视图静态区域点击后，Copilot CLI 会出现“界面还在但无法继续输入”或首字符重复。根因是 `AgentFocusView` 过度依赖 `keydown` 阶段补发事件，且把按钮/链接当作输入控件。修复为在静态区域 `pointerdown` 直接把焦点还给 xterm，并避免重复转发首字符。**修复：已在本版本实现。`handleKeyDown` 在转发前先检查 `active === document.body || active === null`，在点击静态区域后的短暂过渡期间（`focusActiveTerminalTextarea()` 异步调度 focus）跳过转发，由 textarea 原生 input handler 自然处理按键，避免同一按键被发两次。**
- 分栏模式下，从终端点击回 VS Code iframe 后，终端会把焦点抢回。根因是 `TerminalView` 只把原生表单控件视为“有意外部焦点”。修复为把 `iframe` 纳入允许外部焦点的白名单。
  - **修复**: `TerminalView.tsx:1104` — 在 `handlePointerDownCapture` 中增加 `isProtectedExternalFocusTarget` 检查，防止把 `iframe` 等受保护元素的点击事件误判为终端意图而抢回焦点。
- 分栏模式下，从终端切到文件浏览器编辑器或 VS Code 后，输入过程中焦点仍可能被终端抢走。根因是终端只看当前 `document.activeElement`，在 blur/focus 交接瞬间看到 `body` 就误判需要抢焦点；同时 VS Code 抽屉把 `reused` 变化当成新实例。修复为增加外部输入焦点保护窗口，并忽略 `reused` 单独变化带来的 iframe 重载。
  - **修复**: `TerminalView.tsx:1109` — 在 `handlePointerDownCapture` 保护返回分支中也调用 `rememberExternalPointerIntent`，让受保护元素（iframe）的点击同样启动 750ms 焦点保护窗口，防止后续 `scheduleFocusInteractiveTerminal` 把焦点从 VS Code 抢回。同时 `vscode-drawer-state.ts` 的 `applyVsCodeWebOpenResponse` 已忽略 `reused` 单独变化（`isSameResponse` 只比对 url/provider/workingDirectory）。
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

- tmux mouse mode 下直接拖拽会被 tmux/TUI 接管，浏览器侧 xterm 不会产生可复制 selection，导致 kanban 无法把 pane 内选择自动写入剪贴板。修复为 `TerminalView` 消费 OSC 52 clipboard 请求并调用浏览器剪贴板 API，让 tmux copy-mode 负责 pane 内选择边界，普通鼠标/二进制事件转发保持不变。
- 手机浏览器打开 Codex 长上下文终端时，用户在终端区域下拉查看历史会触发浏览器下拉刷新，或者滑动的是页面而不是 xterm 历史。根因是移动端仍复用桌面页面滚动结构，浏览器根滚动链路没有被锁住；首版终端 touch 监听只在冒泡阶段接管，遇到 xterm 内部 viewport/浏览器手势竞争时拦截不够早，且用户停留在桌面聚焦页时没有启用手机触控模式。修复为新增 `/mobile` 手机终端页，挂载时锁定 `html/body/#root` 滚动，并让 `TerminalView` 在手机触控模式下用捕获阶段的非 passive `touchstart/touchmove` 拦截单指滑动、滚动 xterm 历史，双指缩放字号；触屏设备的桌面聚焦页也启用同一逻辑。
- 手机访问 `/mobile` 进不去或 404。根因是部分当前运行入口只暴露根页面或只启动了后端，`/mobile` 这种 history route 依赖前端开发服务/静态服务提供 SPA fallback。修复为移动端按钮改用 `/?view=mobile` 根路径 query 入口，并保留 `/mobile`、`/m`、`#/mobile` 兼容解析。
- 手机端 Tab、Esc、Ctrl+C、方向键等快捷键在部分会话里会变成”控制键 + Enter”或不能作为真实按键送入 Codex。根因是手机端快捷键走已有 stdin 路由，而旧的非 PTY runtime 会给任意输入追加换行，tmux 控制路径也把输入按行拆分并总是补 Enter。修复为对 stdin payload 做控制字符识别：普通文本仍可补换行提交，Tab/Esc/Ctrl/方向键和多行粘贴按原始输入转发；tmux 接入路径把通用控制字符转换成 `send-keys` 按键名但不增加 tmux 专用快捷键按钮。
- 手机端快捷键缺少 Claude / Copilot CLI 常用控制键，`Shift+Tab`、`Ctrl+O`、`Ctrl+E` 以及行编辑组合无法从手机触发；同时新增类型里残留旧 `line-start/line-end` id，存在构建失败风险。修复为扩展快捷键表到 `Shift+Tab`、`Ctrl+U/W/K/Y/A/O/E`，并让本地 tmux 转换层把对应控制字符映射到 `BTab`、`C-o`、`C-e` 等 tmux key name，避免注入不可见 literal。
- 手机端快捷键说明弹窗缺少 `aria-modal`、`aria-labelledby` 和 Tab 聚焦陷阱，屏幕阅读器用户无法正确聚焦弹窗。修复为弹窗增加 `aria-modal=”true”`、`aria-labelledby` 指向标题、Tab 循环限制和 Escape 关闭，卸载时还原页面焦点。
- 手机端快捷键工具栏一度改成多行平铺后占用手机纵向空间，且不符合用户希望“单行左右滑动选择”的操作预期。修复为保持 `flex` 单行横向选择器，使用 `overflow-x: auto` 和 `touch-action: pan-x` 支持左右滑动，并把 `EOF` 按钮展示为真实快捷键名 `Ctrl+D`。
- 手机端输入框点“发送”后，Copilot、Claude 和 Codex 只把文字填进 Agent 输入框，需要再手动点一次 Enter 才真正提交任务。根因是移动端把文本和回车合并在同一个 stdin payload 里，部分 Agent TUI 只消费文本输入，没有把同批次的回车当作提交键。修复为“发送”和“粘贴执行”分两帧发送：第一帧 bracketed paste 文本，第二帧单独发送真实 Enter；“粘贴”仍保持只写入文本。
- 轻量预览下未开启完整小终端时，浏览器资源诊断仍显示 `/ws/agent-sessions` 达到数百 msg/s、数 MB/s，内存和网络持续增长。根因是每个终端输出帧都会触发后端发送一次全量会话 snapshot，前端必须持续 JSON 解析并刷新 React 状态。修复为对高频输出触发的全量看板快照做 trailing 合并广播，结构性操作仍即时刷新，同时避免 observe-only 会话输出时创建无效 awaiting_input timer。
- 加入大量 tmux 会话后，宫格页鼠标上下滚动明显卡顿，完整预览模式下更严重。根因是宫格一次性挂载所有卡片，完整预览会同步创建所有非交互 xterm 和 terminal WebSocket。修复为 `AgentGrid` 超过阈值后按可视区域虚拟化渲染，只挂载当前视口附近的卡片，并让虚拟行高与 CSS 卡片高度保持一致。
- Codex 产生很长输出后，切换/重开终端或从 tmux observe 刷新时只能看到最近一小段，像是丢了几百行。根因是 live PTY replay 只保留 256 KiB，tmux capture 固定 `-S -200` 且 detail 再截 200 行，registry fallback 也只留 200 条。修复为把 PTY replay、tmux capture、registry fallback 和前端 xterm scrollback 上限改成可配置默认值，并在资源诊断中展示 PTY 历史裁剪状态。
- 选定机器扫描 tmux 会话后，按钮会在“扫描中...”和“刷新”之间频繁交替。根因是 `TmuxDiscoveryPanel` 把全局 `sessions` 列表放进自动扫描 effect 依赖，WebSocket snapshot 刷新会话列表时会反复触发 `/api/agent-discovery/tmux/scan`；并发 scan 的旧请求也可能提前把 `loading` 改回 false。修复为扫描触发只依赖稳定 host key，`sessions` 更新只重新计算已加入标记，并用请求序号/host key 丢弃过期扫描结果。
- 非交互缩略图把真实 tmux 会话 resize 成小终端，导致布局和状态栏错乱。修复为缓存主终端几何尺寸，在前端做本地缩放预览，不把缩略图尺寸回写到后端。
- SSH -> tmux 场景中，仅调用 `node-pty.resize()` 不足以让远端 tmux 感知尺寸变化。修复为补发 `SIGWINCH`，确保 ssh 把尺寸变化转发给远端 client。
- 远端新建 tmux 会话时，`copilot` / `codex` / `claude` 这类非 shell agent 会在启动命令退出后把整个 tmux session 一起带没，看起来像“只能建 shell，不能建远端 tmux”。根因是前端 `buildTmuxLaunchCommand` 与服务端实现漂移，非 shell 分支少了 keep-pane-open 包装。修复为复用带 `exec "$SHELL_BIN" -i` 的 tmux pane 命令构造，保证 agent 退出后 pane 仍留在交互 shell 中。
- 远端 `10.30.0.24` 上从看板启动 Copilot 会话时，看起来像“tmux 创建失败”，实际是该主机把 `copilot` 解析到了一个缺少 `index.js` 的 `~/.nvm/.../bin/copilot` node shim。修复为远端 Copilot 启动命令先尝试健康的 `copilot` 可执行文件；若命中损坏 shim，则回退到 `node ../lib/node_modules/@github/copilot/npm-loader.js` 直接启动 CLI。
- 远端 `10.30.0.24` 上直接创建 shell tmux 时，默认名 `10.30.0.24_shell_tmux` 会被旧版 tmux 3.0a 拒绝并报 `bad session name`。根因是默认会话名生成器在 tmux 模式下仍保留 `.`。修复为 tmux 模式下对 host label 使用更严格的名字规范化，把 `.` 一并收敛成 `_`，生成 `10_30_0_24_shell_tmux` 这类 tmux-safe 名称。
- 本地 tmux 会话刚进入 focus view 后，浏览器已经通过 terminal WebSocket 发出了输入帧，但 tmux pane 里收不到 `stdin:<marker>`。根因是 WebSocket stdin 只写入 `tmux attach` 所在 PTY，attach 竞态或 pane 目标缺失时早期输入会丢失。修复为本地 tmux 会话优先通过已有 `LocalTmuxAdapter.writeInput` 的 `tmux send-keys` 队列写入目标 session/pane，并在失败时回退 PTY 写入。
- 本地 tmux 开启 mouse mode 后，在 kanban focus view 点击终端会把 `ESC[<...M` / `ESC[M...` 这类鼠标报告直接写进 pane，表现成字符码输入，点击无法被 tmux 处理。根因是 terminal WebSocket 对本地 tmux 会话统一优先走 `tmux send-keys`，鼠标报告绕过了 `tmux attach` client。修复为识别 xterm mouse report，有附着 PTY 时写回 PTY 让 tmux client 处理，没有 PTY 时不再把 mouse report 注入 pane；普通文本仍保持 `send-keys` 路径。
- 顶栏“终端字号”滑杆拖动时页面明显卡顿。根因是每个 range `input` 中间值都会立刻更新全局 `terminalFontSize`，所有挂载的 xterm 都同步执行 `fontSize`、`fit()` 和 `refresh()`。修复为拖动时只更新顶栏草稿值，鼠标松开、键盘调整结束或失焦提交后才应用到真实终端并持久化。
- 拖动顶栏“终端字号”滑杆后，Codex-like TUI 会收到 `focus-out`，松手后直接打字没有进入终端。根因是 `input[type=range]` 被终端焦点保护逻辑视为真实输入控件，鼠标提交字号后焦点仍停留在滑杆上。修复为鼠标提交字号后主动恢复当前 active terminal 的 xterm helper textarea 焦点，键盘调整滑杆仍保留控件焦点。
- 多屏 focus view 里把 sidebar session 拖到当前输入 pane，或在当前输入 pane 的下拉框切换 session 后，pane 会短暂变化又被恢复成原 focused session。根因是 `normalizeTerminalMonitorSlots` 会把 App 级 `focusedSession` 强制放回 active slot，而 active slot select/drag 在 `syncActiveTerminalWithFocus=false` 时没有同步 focused session。修复为 active slot select、拖入 active slot、从 active slot 拖出时同步 active slot/focused session，并让 sidebar 卡片单击即可切换 focus。

## 文件浏览器

- 新建文件/目录弹窗把草稿名称字符串当作开关，输入框清空时弹窗直接卸载。修复为显式维护弹窗状态，并在名称为空时仅禁用提交而不关闭对话框。
- 多会话聚焦视图中，某个终端的文件浏览器折叠后，切到其他会话再切回时会自动展开。根因是折叠状态保存在全局 UI 状态里，并在当前会话没有侧栏打开时被清零；修复为把左右分栏折叠状态保存到对应 `agentSession` 的侧栏状态中，切换会话不再互相覆盖。
- 多屏聚焦视图里，切换输入终端时文件系统/VS Code 侧栏的跟随规则不符合预期：工具已打开时没有稳定切到对应终端的工具状态，工具未打开时又可能把外层 focused session 一起切走。根因是多屏 active slot 和 App 级 `focusedSession` 总是强绑定。修复为只有文件系统或 VS Code 已打开时才把 active terminal 同步到 `focusedSession`，并把当前工具类型带到目标 session；未打开工具时只切多屏输入窗格，不切侧栏绑定。
- 多屏中快速切换终端时，文件系统侧栏偶发出现、消失或未加载到对应终端路径。根因是每个会话各自保留 `activeTool`，切换时又通过 active slot effect 和 focused session 派生侧栏开关，多个旧会话状态会抢当前抽屉归属。修复为在 App 层维护全局单一 `openSidePanelTool`，切换终端时只把该工具独占写入当前输入终端，并清空其他会话的 `activeTool`。
- 进一步排查发现，`onActiveTerminalSessionChange` 的 React effect 也参与侧栏 retarget，会和用户点击 pane 时的同步 `onSwitchFocus` 路径竞争，导致快速切换时最终目标偶发被较晚提交的 effect 覆盖。修复为 effect 只记录当前 active terminal id，文件系统/VS Code 跟随只由用户激活 pane 的同步路径执行，并补快速 A/B/A/B 切换回归。
- 文件系统/VS Code 侧栏是否显示仍被误建模成“某个终端是否开启过工具”，导致全局文件系统已经打开时，切到一个从未开过文件系统的终端仍可能不显示或按旧会话状态判断。修复为完全移除 session 级 `activeTool` 作为运行时状态，文件系统/VS Code 是否显示只由全局 `openSidePanelTool` 和用户工具按钮控制；每个 session 只保存 host、折叠等配置，切换终端只更换侧栏目标内容。
- 文件系统/VS Code 侧栏折叠状态仍然绑定到 `focusedSession` 的 per-session `sideCollapsed/mainCollapsed`，导致多屏切换终端时一会儿折叠、一会儿展开。修复为把左右分栏折叠状态收回全局 `fileBrowserUiState`，只有用户点击折叠/展开按钮才改变折叠状态，切换终端只更新侧栏内容目标。
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

- 点击 `VS Code保持状态` 后，运行中的非聚焦终端窗格仍只显示轻量预览。根因是 `vscodeIframeCacheMode` 只保留 VS Code iframe，未同步切换 `useLightweightTerminalPreview`，两个内存/保真度开关在用户工作流里分裂。修复为把 VS Code cache profile 与终端预览保真度联动：保持状态时完整渲染运行终端窗格，省内存时恢复轻量预览。

## 开发环境与测试基础设施

- Paper Writer 前端打开后不稳定或打不开。根因是临时加入 `dist/index.html` 的自动同步脚本每 2 秒枚举并 HEAD 轮询所有已加载资源，真实浏览器会持续制造大量请求并可能触发 reload/卡顿。修复为移除当前运行入口里的轮询脚本，让静态页面恢复为只加载主 JS 和 CSS；后续热同步应放到受控开发模式实现。
- Paper Writer 进入任意编辑器页后显示 `Something went wrong / missing ) after argument list`。根因是手改当前运行构建产物新增预览翻译 hook 时，多写了一个闭合大括号，`EditorPage` 懒加载模块在 Chromium 中解析失败。修复为删除多余 `}`，并用 Playwright 直接动态 import `EditorPage` 与打开 `/editor/moe_prune` 做回归验证。
- Paper Writer 预览翻译点击后报 `ENOENT ... conversations/<project>/preview-translate-*.json`。根因是前端把随机生成的临时字符串当作 conversation id 传给 `/api/ai/send`，但后端会按该 id 读取已有会话 JSON。修复为翻译前优先复用当前会话；没有当前会话时先通过 `/api/conversations/:projectId` 创建真实 `Preview Translate` 会话，再把返回的 id 传给 AI 接口。
- Paper Writer 8787 服务停掉后无法重启，导致前端完全打不开。根因是当前运行目录里的 `app/apps/backend/src` 和 ESM `package.json` 缺失，且本地 LLM 配置没有落到后端会读取的 `.env`，服务启动时先遇到源码缺失/语法恢复噪音，随后因空 API key 直接退出。修复为从覆盖率产物恢复后端源码、清理 Istanbul 标记、补回 backend ESM package 声明，并把本机 Paper Writer 配置同步到被 git 忽略的 `app/apps/backend/.env` 后用 `setsid` 后台启动。
- Paper Writer 项目页侧栏同时显示 `所有项目`、`我的项目`、`已归档`、`回收站`，分类过多且 `所有项目` 与 `我的项目` 在常规场景含义重叠。修复为当前运行构建产物只展示 `开放项目` 和 `归档项目` 两类；开放项目过滤 `!archived && !trashed`，归档项目过滤 `archived && !trashed`。
- `papers/paper-agent` 投稿目录同时保留了最终上传文件和一份重复的源码工作副本，容易让人误以为需要上传散乱的 `sec/`、`main.tex`、`references.bib`。修复为只保留三个实际投稿文件 `cover-letter.pdf`、`main.pdf`、`paper-agent-spe-latex-source.zip`，删除重复源码树，并把 `README.md` 改成投稿清单。
- Playwright 只复用前端 Vite 服务时，可能在 `/api` 代理已经坏掉的情况下误以为测试环境可用。修复为前后端分别做健康检查，避免复用损坏环境。
- 多轮 Playwright e2e 后，Vite 或后端 `tsx watch` webServer 可能因 `EMFILE` / `ENOSPC: System limit for number of file watchers reached` 启动失败。根因是测试环境反复启动 watcher，命中本机 fd/watch 上限。修复为 Playwright 启动的 web dev server 默认设置 `CHOKIDAR_USEPOLLING=1`，后端 e2e 服务改用非 watch 的 `tsx src/index.ts`，且只有显式 `PLAYWRIGHT_REUSE_EXISTING_SERVER=1` 时才复用旧服务。
- HTTPS dev server 已在 `3333` 端口运行时，Playwright e2e 仍等待 `http://127.0.0.1:3333` 直到 webServer 超时，或者浏览器因本地开发证书报 `ERR_CERT_AUTHORITY_INVALID`。根因是 e2e 配置没有按前端 HTTPS 模式切换探测协议，且 `terminal-preview` 用例缺少本地证书忽略设置。修复为支持 `PLAYWRIGHT_FRONTEND_PROTOCOL`，HTTPS 协议下开启 `ignoreHTTPSErrors`，并给终端预览 e2e 补齐 HTTPS 测试约定。
- `pnpm dev` / `restart-dev.sh` 能启动页面但 API 代理可能连错端口。根因是后端和脚本默认使用 `3200/3100`，但 `apps/web/vite.config.ts` 仍写死前端 `3000`、后端代理 `4000`，且没有复用已有的 `resolveWebDevConfig`。修复为让 Vite 配置统一走 `resolveWebDevConfig`，按 `WEB_BACKEND_PORT -> SERVER_PORT -> PORT -> 3200` 解析后端代理，并同步 `.env.example` 默认值。
- `scripts/restart-dev.sh` 重启失败，先报缺少 `scripts/dev-https-cert.mjs`，补齐后又因 Vite/tsx native watcher 命中 `EMFILE`。根因是 HTTPS 证书生成 helper 在合并后缺失，且开发脚本没有为前后端 watch 模式设置 polling。修复为恢复 `dev-https-cert.mjs`，并在后端和前端启动环境都设置 `CHOKIDAR_USEPOLLING=1`。
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

- Codex CLI 运行后，鼠标滚轮有时滚动上下文，有时变成输入框历史记录上下翻页。根因是 xterm.js 在 TUI 开启鼠标追踪或无 scrollback 路径时会把 wheel 事件转换为鼠标协议或 Up/Down 方向键序列转发给 PTY。修复为前端接管 `attachCustomWheelEventHandler`，自己计算并滚动 xterm scrollback，返回 `false` 阻止 wheel 进入 stdin；输入历史翻页只保留给键盘上下箭头。
- 多屏或完整预览场景里，某个终端偶发无法用鼠标滚轮浏览上下文。根因是滚轮接管只挂在 xterm 内部自定义 wheel handler 上，事件落在终端外层容器、缩放后的空白区域或非输入预览终端时可能漏掉。修复为在 `TerminalView` 容器捕获阶段统一接管 wheel，所有终端视图都滚动自己的 xterm scrollback，并阻止 wheel 进入 stdin。
- 运行中的终端已经接收到滚轮事件后，仍可能刚滚上去就被实时输出拉回底部，表现为“滚轮滑不动上下文”。根因是 live `term.write()` 在持续输出时会刷新底部跟随，覆盖用户刚选择的 scrollback 视口。修复为滚轮离开底部后短暂锁定用户查看的 viewport，新输出写入完成后恢复到该行；用户滚回底部或点击“底部”按钮后解除锁定。
- 仍有很多运行中终端滚轮控制不了上下文：一层根因是旧用户滚动锁只有 10 秒，长输出终端停留阅读超过 10 秒后又会被 live output 拉回底部；另一层根因是 wheel 事件可能落在终端上方的遮罩、空白层或其他 document-level 目标上，没进入 `.terminal-view` 容器。修复为把用户滚动锁改成“只要未回到底部就持续锁定”，并增加 document capture 兜底，鼠标坐标落在真实 xterm 区域内时一律滚动对应终端 scrollback。
- commit `fc57a80` 引入的"保留显式用户焦点"修复过度：`rememberExternalPointerIntent` 只对"受保护目标"（input、iframe、dialog 等）记录外部点击意图，导致点击普通 div、按钮等非保护元素时终端立刻抢回焦点。`hasIntentionalExternalFocus` 里对非保护、非 body 元素直接返回 `false`，进一步放大了这个问题。修复为：1）`rememberExternalPointerIntent` 对 `.terminal-view` 以外的任意 `pointerdown` 都记录意图；2）`hasIntentionalExternalFocus` 简化为纯时间戳比较，不再区分 active element 类型。
- VS Code Web 与终端来回切换两轮后，点击 VS Code iframe 内部无法重新输入。上一轮修复只覆盖父文档能收到 `pointerdown` 的外部点击；真实 iframe 内点击不会稳定冒到父页面，导致 `lastTerminalIntentAt` 仍然更新于外部意图之后，`handleWindowFocus` / 被动焦点修复又把 xterm-helper textarea 抢回。修复为在父窗口 `blur`、被动终端聚焦前，基于当前 `document.activeElement` 补记 hovered iframe 的外部焦点意图，并补 VS Code -> 终端 -> VS Code round-trip e2e 回归用例。
- tmux attach 类型终端有时只能滚动当前窗口可见内容，像是没有上文。根因是浏览器 xterm 只收到 `tmux attach` 后绘制的当前屏幕，旧的 tmux pane 历史没有进入 PTY replay；tmux client 初始绘制还会发送 `CSI ?1049h` 进入 xterm alternate screen，使普通 scrollback 不可见；同时默认 tmux capture/registry 上限低于前端 xterm 上限。修复为tmux attach 前先 `capture-pane` 预灌 pane 历史到 PTY replay（本地直接 capture，SSH 远端通过非交互 ssh capture），并把 tmux capture 默认提升到 20000 行、registry fallback 默认提升到 5000 条，同时在接管已有 tmux session 前设置更大的 `history-limit`。
- tmux 扫描弹层覆盖单屏终端时，在扫描结果卡片上滚轮会误滚动后方终端上下文。根因是 `TerminalView` 的 document-level wheel 兜底只按鼠标坐标命中终端区域，没排除上层 discovery 弹层；弹层覆盖在终端上时 wheel 被后方终端接管并 `preventDefault`。修复为 document-level 终端滚轮兜底遇到 `.discovery-overlay` 事件目标时直接放行，让 discovery list 自己滚动。
- `scripts/restart-dev.sh` 启动后短时间内前后端端口又断开。根因是脚本用普通 `nohup` 启动 dev server，调用 shell 结束后进程仍可能跟随 session 掉线；同时脚本没有把后端代理 host/port 显式传给 Vite。修复为用 `setsid` 脱离调用 shell、保留 HTTPS 前端默认启动，并显式把后端代理 host/port 传给 Vite。
- focus view 点击按钮后，Copilot-like TUI 会收到 `focus-out` 并丢掉紧随其后的输入。根因是按钮等非文本控件被纯时间戳逻辑误判为有意外部焦点，且 keydown 补救路径可能先发送 stdin、后发送 `focus-in`；修复为 `hasIntentionalExternalFocus` 只保护真实输入面/iframe/dialog 和短暂 body handoff，并在 `TerminalView` 发送 stdin 前同步补齐已聚焦 helper 的 focus report。
- HTTPS 前端里扫描并加入本机 tmux 后，focus view 终端可能全部黑屏。根因是前端 WebSocket URL 构造在同源默认路径下固定使用 `ws://`，而 `restart-dev.sh` 默认启动 HTTPS 页面，浏览器会阻止 insecure WebSocket mixed content。修复为 HTTPS 页面默认生成 `wss://.../ws/...`，HTTP 页面仍生成 `ws://...`，并补 URL 回归测试。
- 多屏中把已打开 Codex 的会话切入终端窗格后，输入框会多出 `[I` / `[O`，方向键会输入 `OA` / `OB` / `OC` / `OD`。根因是 active PTY replay 把历史 `focus tracking`、application cursor、mouse、bracketed paste、keypad 等终端模式开关重新发送给新挂载的 xterm，导致浏览器端模式状态被污染；同时本地 tmux stdin 优先走 `tmux send-keys` 后，focus report 和 application-cursor 箭头序列没有分别进入正确路径，前者会被注入 pane，后者会被拆成 Esc + 字面量。修复为 replay 只保留显示内容并清理模式开关，focus/mouse 控制报告改走 attached PTY，application-cursor 箭头在 tmux send-keys 路径映射成真实方向键。
- `./scripts/restart-dev.sh` 重启后仍跑到 HTTPS/3100，而不是预期的 HTTP/8484。根因是脚本和 `.env.example` 仍保留旧的 `WEB_HTTPS=1`、`WEB_PORT=3100` 默认值，前端 dev proxy 也残留后端 `3200` 默认值；同时 restart 脚本测试没有纳入根 `pnpm test`。修复为默认 HTTP、前端 8484、后端 4000，并把脚本测试加入根测试链路。
- 多屏 sidebar 双击其他会话替换当前输入 pane 时，当前 Codex 终端仍会出现 `[I`，且双击替换有时失效。根因有两层：1）本地 tmux terminal WebSocket 仍把手动 focus report `ESC [ I/O` 作为控制输入写回 attached tmux client，部分 Codex/tmux 组合会把它落成 prompt 字面量；2）sidebar card 同时绑定 click 和 dblclick，真实双击会先触发单击替换，DOM 换位后第二次点击可能落到刚换出的旧会话上，把 pane 又替换回去。修复为本地 tmux 会话直接丢弃 focus report、只保留 mouse report 走 attached PTY；sidebar 单击改为短延迟执行，双击取消单击并只替换一次。
- 当前终端右键粘贴后，Codex 输入框会出现 `[200~` / `[201~`：根因是 xterm 在 bracketed paste 模式下发送 `ESC[200~` / `ESC[201~` 起止符，本地 tmux WebSocket 路径又优先走 `tmux send-keys`，旧解析器把 `ESC` 当成 Escape 键、把 `[200~` / `[201~` 当成普通文本写进 pane。修复为在 `LocalTmuxAdapter.buildTmuxSendKeySteps` 中仅对本地 tmux send-keys 路径剥离 bracketed paste 起止符，保留粘贴正文和既有控制键映射，并补单元与真实 WebSocket+tmux 回归。
- 当前看板终端里按 `Shift+Left` 会在 Codex 输入框里出现 `[1;2D` / `D` 并可能伴随换行，同类 `Ctrl/Alt/Shift` 方向键和 Home/End/Delete/PageUp/PageDown 也存在字面量泄漏风险。根因是本地 tmux WebSocket 输入优先走 `tmux send-keys` 后，`LocalTmuxAdapter.buildTmuxSendKeySteps` 只识别普通箭头和 application-cursor 箭头，不识别 xterm 的修饰键 CSI 序列（如 `ESC[1;2D`）及常见导航键序列，于是把 `ESC` 当 Escape 键、把余下内容当普通文本注入 pane。修复为在 tmux send-keys 转换层解析 xterm 修饰键方向键、Home/End、Insert/Delete、PageUp/PageDown 和 F1-F12 tilde 序列，映射成 tmux key name；前后端过滤层补测试确保这些键序列不会被误删。
- 当前看板终端里对 Codex 会话右键粘贴多行内容时，每一行都会被当成一次回车提交：根因是上一版为避免 `[200~` / `[201~` 泄漏而剥离 bracketed paste 起止符，导致区块内真实换行继续被 `buildTmuxSendKeySteps` 映射成 tmux `Enter`。修复为完整保留 `ESC[200~ ... ESC[201~` bracketed paste 区块并整体通过 `tmux send-keys -l` 注入，区块外的 `\r` / `\n` 仍按普通 Enter 处理，确保 Codex/TUI 能按一次粘贴接收多行文本。
- Codex 会话中右键粘贴多行内容仍可能被逐行提交：根因是 xterm/WebSocket 可能把一次 bracketed paste 分成多帧发送，上一版只在单帧内识别完整 `ESC[200~ ... ESC[201~`，第一帧之后的裸文本帧失去了 paste 上下文，里面的 `\r` 又被映射成 tmux `Enter`。修复为 `LocalTmuxAdapter` 按 agent session 记录 bracketed paste open 状态，直到收到结束符前所有输入帧都走 literal；新增 WebSocket+真实 tmux 回归，断言 split paste 三帧最终按原始字节进入 pane。
- 扫描 tmux 会话时，工作目录包含 `:` 的 pane 会被漏扫或归到错误路径。根因是 `agent-scanner` 用冒号拼接 `session/pane/path/command`，而 POSIX 路径允许冒号。修复为改用 tab 分隔 tmux 输出字段，本地 `TMUX_BINARY` 进入 shell 命令前也做引用，并补真实 tmux 含冒号路径回归。
- 扫描已有 tmux 会话时，名为 `codex-*` 的 session 如果当前 pane 命令是 `sh`、`sleep` 等普通命令，会被错误标成 `sh` / `sleep` 这类非 agent kind。根因是扫描逻辑只用 session/command 判断“像 agent”，但落结果时直接保存原始 `pane_current_command`。修复为集中返回已知 agent kind 或 `shell`，并补真实 tmux session 归类回归。
- 终端 resize 接口直接信任 `cols` / `rows`，缺失、字符串、0 或超出安全整数范围的值可能传入 `node-pty.resize()`，造成运行时异常或无效终端尺寸。修复为路由层要求两个字段都是正安全整数，非法请求返回 400，并补 resize 输入校验回归。
- 加入已发现 tmux 会话接口直接解构请求体，缺失 body 会触发 500，非法 `interactionState` / `sshTarget.port` 还可能写入畸形会话记录。修复为 `/api/agent-discovery/tmux/add` 先校验必填字符串、可选字符串、合法交互状态和 SSH 端口范围，非法请求统一返回 400，并补 malformed payload 回归。
- 聚焦会话接口 `/api/agent-sessions/focus` 会把缺失或非字符串 `agentSessionId` 直接传给 registry，导致客户端输入错误走内部异常路径。修复为路由层先校验 `agentSessionId` 必须是字符串，非法请求返回 400，并补 focus payload 回归。
- 注册会话接口 `/api/agent-sessions/register` 直接把请求体写入 registry，缺失必填字段、非法 `sourceType` / `connectionState` 或错误类型的 `transportRef.processId` 都可能创建畸形 session。修复为注册路由校验必填字符串、已知枚举、可选 SSH 目标和 transport 引用字段，非法请求返回 400，并补“不创建畸形会话”回归。
- agent 启动接口 `/api/agent-launch/local`、`/api/agent-launch/remote`、`/api/agent-launch/pty`、`/api/agent-launch/ssh-pty` 直接把请求体透传给 runtime manager，缺失命令、错误类型字段或非法 SSH 端口会触发内部异常，甚至进入畸形启动流程。修复为在路由入口校验必填字符串、命令字段、SSH 目标和端口范围，非法请求返回 400 且不注册会话。
- agent 发现接口 `/api/agent-discovery/tmux/scan` 和 `/api/agent-discovery/scan` 会解构或扫描原始请求体，缺失 `path`、错误类型字段或非法 SSH 端口会触发内部异常或把坏参数交给 shell/SSH 扫描。修复为在路由入口校验发现请求体、扫描路径和 SSH 目标，非法请求返回 400。
- VS Code Web 启动时如果持久化的 `user-data/User/settings.json` 损坏，合并终端 profile 设置会直接抛出 JSON 解析异常，导致会话打不开。修复为把损坏设置按空对象恢复并重写受管终端 profile，补 malformed settings 回归。
- shell 启动环境探测如果输出标记之间是损坏 JSON，会把底层 `SyntaxError` 直接向上传播，诊断不稳定且暴露 parser 细节。修复为将 malformed startup env JSON 转换为受控的运行时探测错误，并补 malformed marked output 回归。
- terminal WebSocket 的 `{ "type": "binary" }` 控制帧直接使用 Node 宽松 base64 解码，带合法前缀和非法后缀的 `data` 仍会被部分解码并写入 PTY，客户端损坏帧可能变成真实终端输入。修复为只接受规范 base64 字符串，非法 binary frame 直接忽略，并补“不转发部分 base64”回归。
- terminal WebSocket 的 `{ "type": "resize" }` 控制帧只做 `JSON.parse` 类型断言，字符串、0 或超过安全整数范围的 `cols/rows` 会进入 PTY resize 路径，和 REST resize 接口的输入边界不一致。修复为 WebSocket resize 复用 REST 正整数校验，非法 resize 帧直接忽略，并补解析器回归。
- 前端终端接收服务端控制帧时，只要 JSON 标记了 `__agentOrchestrator: "terminal-control"` 但事件未知或 replay 数据类型错误，就会静默吞帧且不解除输入禁用状态，用户可能要等 8 秒 safety timeout 才能输入。修复为抽出控制帧解析器，未知/畸形控制帧按普通终端输出处理并立即走输入解锁路径。
- 前端布局状态恢复时用 `Boolean(parsed.sidebarCollapsed)` / `Boolean(parsed.topbarCollapsed)` 解析本地存储，字符串 `"false"` 或数字 `1` 这类陈旧/损坏值会被误当作折叠状态，导致页面启动后错误进入紧凑或沉浸布局。修复为只接受真实 boolean，其他值回退默认展开，并补本地存储回归。
- 文件浏览器按作用域恢复本地状态时用 `Boolean(parsed.showHidden)` 解析“显示隐藏文件”，陈旧存储里的字符串 `"false"` 会被误当作 `true`，导致隐藏文件意外显示。修复为抽出持久化状态解析器，只接受真实 boolean，并补合法偏好、陈旧值和损坏 JSON 回归。
- 文件浏览器侧栏 UI 状态恢复时同样用 `Boolean(parsed.mainCollapsed)` / `Boolean(parsed.sideCollapsed)` 解析折叠标记，并直接接受任意有限 `width`；陈旧字符串 `"false"` 会误折叠侧栏，`0` 或负数宽度会生成不可用布局。修复为抽出面板 UI 状态解析器，只接受真实 boolean 和不小于最小宽度的数值，并让启动恢复与拖拽 resize 共用同一最小宽度常量。
- 文件浏览器预览区高度从本地存储恢复时接受任意有限数字，`0`、负数或过小高度会把预览区压到不可用状态，而拖拽路径本身已有最小值。修复为抽出预览高度解析器，恢复时同样要求不小于最小预览高度，并补有效值、过小值、非数字和空值回归。
- 文件浏览器侧栏按会话恢复选中主机时，只检查 `selectedHost.type === "ssh"` 和 `preset` 存在，损坏缓存里的非字符串 host、字符串 port 或空 defaultPath 会被当作真实 SSH 主机继续传给文件浏览器。修复为抽出 side-panel session state 解析器，只有完整合法的 SSH preset 才恢复，否则回退本机，并补 malformed cache 回归。
- 文件浏览器/VS Code 侧栏打开状态已从会话级 `activeTool` 迁移到 App 级全局状态，但启动时仍会从旧的 `side-panel-session-state` localStorage 里读取 `activeTool`，导致 stale cache 让焦点页自动打开文件或 VS Code 侧栏。修复为集中解析初始侧栏工具并忽略 legacy `activeTool`，启动默认不从会话缓存恢复打开状态。
- 文件浏览器按作用域恢复当前路径时只用 `trim()` 判断非空，却把原始字符串写回状态；localStorage 中 `"  /workspace/project  "` 会让文件列表请求带空格的不存在路径。修复为恢复前先 trim 当前路径，全空白仍回退默认路径，并补 stale path 回归。
- agent 扫描进程列表时用 `parseInt` 解析 `pgrep` PID 字段，`123abc` 这类损坏行会被当成 PID 123 并误报运行中的 agent。修复为进程扫描和 Copilot lock 探测只接受完整的正安全整数 PID，并补 malformed PID 回归。
- SSH config 解析 `Port` 时用 `Number.parseInt`，`2222abc` 这类部分数字值会被截断成 2222 并进入 SSH 预设。修复为端口字段必须是完整数字字符串且在 1-65535 内，否则回退默认 22，并补 partial port 回归。
- tmux pane 元数据解析 attached count 时用 `Number.parseInt`，`1abc` 这类损坏值会被截断成 1，导致发现弹层把实际无法确认 attached 的会话误标为运行中。修复为 attached count 只接受完整非负安全整数，非法值按 0 处理，并补 malformed count 回归。
- VS Code Web 远程隧道解析 `ssh -G` 输出端口时也用 `Number.parseInt`，`port 10022abc` 会被截断成 10022 并覆盖调用方原始端口。修复为隧道目标端口只接受完整的 1-65535 数字字符串，非法端口行被忽略并保留原端口，并补 partial port 回归。
- `VSCODE_WEB_REMOTE_PORT` 远程 VS Code Web 首选端口解析使用 `Number.parseInt`，`14444abc` 会被截断成 14444 并进入远程启动命令和 SSH tunnel。修复为环境变量只接受完整的 1-65535 数字字符串，非法值回退默认 13338，并补 partial env port 回归。
- 远程 agent 历史扫描解析 `stat` 时间戳时使用 `parseInt`，`1710000000abc` 这类损坏输出会被截断成合法时间并显示错误 last activity。修复为远程历史 mtime 只接受完整的非负安全整数秒，非法值不写入 `lastActivity`，并补 fake SSH 回归。
- VS Code Web 本地 `port.json` 持久化端口只检查正整数，`70000` 这类越界端口会被当作 preferred port 传给分配器，可能导致启动失败或无法绑定。修复为持久化端口同样必须在 1-65535 内，非法缓存忽略并用新分配端口覆盖。
- VS Code Web 复用当前用户进程时，从 `--bind-addr` / `--port` 解析出的端口只检查正数，`70000` 这类越界端口会被误当成可复用服务，导致代理目标指向无效 TCP 端口。修复为进程列表端口也复用完整 1-65535 校验，非法进程被忽略并启动新的有效实例。
- 多屏终端监控窗格的 drop 解析会把普通 `text/plain` 拖拽内容当成 session id，外部文本拖到终端网格上可能触发布局/focus 变更路径。修复为只接受自定义 terminal monitor MIME 类型的 JSON payload，普通文本和畸形 payload 都忽略，并补解析器回归。
- VS Code Web 抽屉会立即用 localStorage 中缓存的 `url` 渲染 iframe，但缓存解析器只校验字段是字符串，损坏或被篡改的 `javascript:` / 非 Web scheme 会在后端确认前进入 iframe `src`。修复为缓存恢复只接受 HTTP(S) 绝对 URL 或根相对路径，其他 scheme 直接丢弃，并补 stale cache 回归。
- 手机端终端触摸滚动依赖测得的行高，若浏览器返回的 computed `line-height` 不可解析为数字，滚动计算会产生 `NaN`，导致滑动历史上下文失效。修复为移动端滚动 helper 在行高非有限或过小时回退到稳定默认行高，并补不可用行高回归。
- 桌面端终端滚轮接管同样假设 line height / page height 一定是有限数字；当测量值不可用时，滚轮计算会产生 `NaN`，导致滚动上下文失效或残留状态异常。修复为 terminal wheel helper 对行高和页高分别使用有限数字兜底，并补 page-mode 测量缺失回归。
- agent 宫格虚拟化窗口直接用 DOM 测量值参与列数、行数和 slice 边界计算，若宽高、scrollTop、rowHeight、gap 或 overscan 短暂变成 `NaN`，会生成 `NaN` 索引并让虚拟列表渲染空白。修复为虚拟化 helper 对所有数值输入做有限数兜底，保持稳定首屏 slice，并补坏测量回归。
- 轻量终端预览的 `maxLines` / `maxLineLength` 选项用 `Math.max(1, value)` 兜底，遇到 `NaN` 时仍会得到 `NaN`，从而取消行数和单行长度上限，可能让终端卡片渲染过多输出。修复为只接受有限正数并向下取整，非法值回退默认限制，并补无效限制回归。
- 远程 SFTP 文件预览在 `maxBytes: 0` 时仍创建 `start: 0, end: 0` 的读取流，实际会读回第一个字节，和本地预览的零字节语义不一致。修复为远程预览在零字节上限时只读取 stat 并直接返回空内容，避免发起一字节 range 读取，并补 SFTP 回归。
- 本地和 SFTP 文件预览服务直接调用时仍信任 `maxBytes` 是有限数字；`NaN` 会让本地 `Buffer.alloc(NaN)` 抛异常，远程 SFTP 则会构造非有限 range 并读回首字节。修复为抽出预览字节上限归一化，非有限、负数或 0 都按空预览处理，正数向下取整，并补本地/SFTP 服务回归。
- 文件下载响应头直接把 basename 放进 `filename="..."`；文件名包含引号时会生成畸形 `Content-Disposition`。修复为统一清洗下载文件名中的引号、反斜杠、分号和控制字符，覆盖本地/远程文件与目录 zip 下载，并补 quoted filename 回归。
- 前端下载文件名解析只识别 `filename="..."`，遇到标准 `filename*=UTF-8''...` 响应头会忽略服务端提供的 UTF-8 文件名并回退到路径 basename。修复为抽出下载文件名解析器，优先解析 RFC 5987 UTF-8 编码名，再回退 quoted/unquoted filename 和路径名，并补 encoded filename 回归。
- 前端下载文件名解析会直接采用响应头中的路径分隔符；`filename*=UTF-8''..%2Fnested%5Creport.txt` 这类值可能让浏览器收到带目录语义的建议文件名。修复为所有响应头和路径回退文件名在写入 `anchor.download` 前统一替换 `/`、`\` 和控制字符，并补 header separator 回归。
- 多屏终端监控窗格的自定义 drag payload 只检查 `sessionId` 类型，空字符串或全空白字符串也会被当成真实会话 id 进入 pane placement。修复为读取 custom MIME 后 trim 并要求非空 session id，空白 `sourceSlotId` 也丢弃，并补 malformed custom payload 回归。
- terminal WebSocket 控制帧入口用 `text.startsWith('{"type":"resize"')` / `{"type":"binary"` 判断，等价 JSON 只要字段顺序不同就会被当成普通终端输入。修复为统一解析客户端控制帧，按 `type` 分派 resize/binary，非法控制帧忽略，并补 reordered resize frame 回归。
- terminal WebSocket 客户端控制帧解析在遇到未知 `type` 的 JSON 对象时返回普通输入路径，未来扩展帧或畸形 typed 控制帧会把整段 JSON 写进 shell。修复为只要 JSON 对象带字符串 `type` 且不是已支持的 resize/binary，就按控制帧忽略；无 `type` 的 JSON 仍保留为普通终端输入。
- VS Code Web 代理直接信任 `x-forwarded-host`，`bad host` 这类畸形值会被原样转发给上游，且代理层还有解析失败后复制原始 `Host` 的旁路。修复为集中校验请求 Host：拒绝空白、路径分隔符、控制字符和无法作为 URL authority 解析的值；代理头部只使用解析层返回的安全 Host，并补 malformed forwarded host 回退 Origin 的回归。
- 文件上传接口在处理 multipart `relativePaths` 时先按相对路径创建父目录，再由写入流做本地路径校验；`../escape/file.txt` 这类值会在写入失败前先创建目标目录外的父目录，甚至可成功落到意外位置。修复为解析 `relativePaths` 时立即 trim 并复用文件系统安全路径校验，同时拒绝 POSIX/Windows 绝对路径，非法上传在任何父目录创建前返回 400，并补“不创建逃逸目录”回归。
- 焦点视图启动状态恢复时只用 `trim()` 判断 cached `focusedId` 非空，却把原始字符串写回状态；localStorage 中 `"  session-id  "` 会让应用进入 focus 模式但找不到真实会话，表现为焦点页/侧栏状态异常。修复为抽出 `parseFocusViewState`，恢复前 trim `focusedId`，损坏 JSON 或空白 id 回退默认 grid 状态，并补 stale focused id 回归。
- 目录建议接口只校验 `prefix`，但把 `sshTarget` 原样传给远程建议路径；字符串 `sshTarget`、空 host 或字符串端口会被 SSH helper 吞成“远程建议不可用”的 200 响应，掩盖客户端请求错误。修复为在 directory-suggestions 服务入口校验 SSH 目标对象、必填 host、可选字符串字段和 1-65535 端口，非法请求返回 400，并补 malformed sshTarget 回归。
- agent session 更新接口在校验 `displayName` 后会立刻重命名 tmux session，随后才校验 `hidden`；带合法 `displayName` 和非法 `hidden` 的 PATCH 会返回 400，但 tmux 会话名已经被改掉。修复为先完整校验并归一化 payload，再执行 tmux rename 和 registry update，并补“非法字段不触发 rename 副作用”回归。
- tmux attach 历史回放回归测试在全量并行测试负载下只给 fixture 5 秒输出 80 行，tmux server 繁忙时会在待测逻辑执行前超时，造成误报。修复为只放宽该 fixture readiness wait，保持后续历史回放断言不变。
- agent session 更新接口没有要求 PATCH body 必须是对象，字符串或数组这类畸形 JSON 会被当成空更新并返回 200。修复为入口先校验 request body 是普通对象，非法 body 返回 400，并补 non-object body 回归。
- 文件上传接口无 `relativePaths` 时会直接使用 multipart filename 拼接目标路径，空文件名这类畸形 metadata 会落到目录写入路径并暴露成底层文件错误。修复为 fallback filename 也复用相对上传路径校验，空白、traversal 或绝对路径在打开写流前返回 400。
- 目录建议接口已校验 `sshTarget` 字段类型，但仍允许字符串字段中包含换行、回车或 NUL；这类 payload 会被 SSH helper 拒绝后吞成“远程建议不可用”的 200 响应，掩盖客户端错误。修复为在 request-side SSH 目标解析阶段拒绝 host/username/identityFile 控制字符，非法请求直接返回 400，并补 malformed SSH string field 回归。
- 远程 SFTP 递归删除目录时没有跳过服务端可能返回的 `.` / `..` 目录项，会尝试删除当前目录或父目录路径，轻则报错，重则在异常 SFTP server 行为下越界递归。修复为 `removePathRecursive` 和递归列表一样跳过 dot entries，并补包含 `.` / `..` 的删除回归。
- 文件系统 JSON 与上传接口的 `sshTarget` 解析已校验对象、必填 host 和端口范围，但仍允许 host/username/identityFile 包含换行、回车或 NUL；坏 metadata 会进入 SFTP 路径并暴露成 500 或在 multipart 上传中被误判成功。修复为 filesystem 路由 SSH target 解析阶段拒绝控制字符，JSON 与 multipart metadata 均返回 400，并补 malformed SSH string field 回归。
- agent session 启动、发现和 tmux add 路由各自复用的 `sshTarget` 解析同样只校验类型和端口，未拒绝 host/username/identityFile 控制字符；坏 host 可在 remote launch 中冒出 500，tmux scan 可被吞成 200，tmux add 可注册出异常 SSH metadata。修复为 agent-sessions SSH target 解析阶段拒绝 NUL/CR/LF，相关启动、发现和注册入口统一返回 400，并补红绿灯回归。
- agent session 注册接口校验 `transportRef.sshPort` 时只要求 safe integer，`70000` 这类无效 TCP 端口会被写入 session metadata。修复为 nested transportRef 端口同样要求 1-65535，非法注册返回 400 且不创建畸形会话，并补 register 路由回归。
- 文件浏览器侧栏会话缓存恢复 SSH 主机时已校验字段类型和端口范围，但未拒绝 host/username/identityFile 等 preset 字符串中的换行、回车或 NUL；损坏 localStorage 可恢复出会被后端 400 拒绝的 SSH 选中主机。修复为 side-panel session state 解析阶段丢弃含控制字符的 cached SSH preset，回退本机，并补 stale cache 回归。
- 文件浏览器真实浏览器上传和“新建文件”流程中，XHR 已设置 `responseType = "json"` 却仍在成功回调读取 `responseText`；Chromium 会抛出异常，导致上传/创建实际写入成功但前端 Promise reject，列表不刷新，用户看不到新文件。修复为优先使用已解析的 `xhr.response`，只有没有 JSON 响应时才读取文本回退，并补 XHR 回归与 Playwright 本地/SSH 上传场景。
- 多屏终端在侧栏关闭时允许用户切换当前输入 pane，但焦点页标题直接显示 active terminal session；点击第二屏会让标题从原 focused session 跳到另一会话，用户还未打开文件/VS Code 侧栏就看到焦点上下文变化。修复为标题会话解析显式受 `syncActiveTerminalWithFocus` 控制：侧栏关闭时标题保持 focused session，侧栏打开时才跟随 active terminal，并补单元与 Playwright 回归。
- Copilot/Codex 类 TUI 启动时会发 DA/DSR 终端能力查询；旧路径依赖浏览器 xterm 订阅和前端时序，Playwright 串跑中 mock 会停在 `copilot-mock-handshake-timeout` 或 ready 后首轮输入无响应。修复为 PTY runtime 在服务端输出层直接识别 `ESC[c` / `ESC[6n` 并写回 `ESC[?1;2c` / `ESC[1;1R`，保证 TUI 能完成握手，并补服务端能力查询回归。
- 焦点页终端在 WebSocket replay 尚未完成、LazyTerminalView 尚未挂载或按钮/body 暂时持有焦点时，快速键入会被 xterm/input gate 丢弃，Copilot mock 表现为没有收到 `hello`/`before`，或 focus-out 后首字母被丢成 `fter`。修复为 TerminalView 对 replay 前输入做 pending 缓冲并在冲刷前同步 focus-in，AgentFocusView 通过 session bridge 队列把非编辑 UI 上的按键交还活动终端，并补 bridge/键盘映射回归与 Copilot Playwright 场景。
- 服务端已自动回答 PTY 能力查询后，浏览器端仍把 `ESC[6n` 写入 xterm 会触发 xterm 再生成一次 CPR，双击进入焦点视图时会话收到两次 cursor position reply 并退出。修复为前端渲染终端输出前剥离已由 PTY runtime 处理的 DA/DSR 查询序列，只显示可见输出，不再让浏览器生成重复协议回复。
- Paper Writer RAG 的人工摘录 Markdown 模板如果还未填写，旧索引流程会把模板说明、占位字段和固定提示当成正文 chunk，导致用户以为扫描 PDF 已有可引用证据。修复为检测未填写的文献笔记模板并标记 `template-empty`，不生成 RAG chunk，不允许作为引用证据；工作台和上传诊断会显示“模板未填写”并引导用户补充人工核对过的事实、页码和来源信息。
- Paper Writer 工作台真实入口 `/writing-workbench` 的默认静态 HTML 路径少退一级，会在生产式后端启动后查找 `app/apps/backend/frontend/public/paper-writer-workbench.html` 并返回 500。修复为指向 `app/apps/frontend/public/paper-writer-workbench.html`，并补不传自定义 `htmlPath` 的路由回归，确保真实入口能直接打开。
- Paper Writer 生产可用性门禁原来直接平均 8 个维度分数，证据、上下文和引用安全都阻塞时仍可能显示 75/100，用户会误以为“基本可用”。修复为对硬阻塞分数封顶：任务缺失最高 25，证据/引用阻塞最高 45，上下文阻塞最高 65，保证 `blocked` 状态和分数表达一致。
- Paper Writer RAG 只拦截几乎空白的人工摘录模板，用户如果随手填写少量标题或单行 Fact，仍可能生成 chunk 并被误当成引用证据。修复为新增 `manual-note-incomplete` 文本质量状态，要求人工笔记至少包含可核对的 Fact、Evidence text 和 Page/section；缺任一项都不生成 RAG chunk，并在工作台修复向导中提示补全文献笔记证据字段。
- Paper Writer 模式路由把任务里的裸 `pdf` 关键词当成工具执行信号，用户只是想“检查 RAG 里 PDF 有没有读进去”也会被推荐 Tools，混合“检查 RAG + 写 related work”还会同时出现 Agent 和 Tools 理由。修复为移除裸 `pdf` 的工具触发，新增 RAG/PDF 证据库诊断识别；纯诊断走 Chat，诊断加写作走 Agent，LaTeX 编译和脚本运行仍走 Tools。
- Paper Writer AI 输出审查只检查来源编号是否存在，单一来源证据也可能允许 AI 写“完整 related work/领域趋势/主流方案”等强综述结论。修复为把 evidencePack.coverage 接入审查：当证据覆盖为 single-source、concentrated 或 thin 时，若输出写成强综述结论则阻塞采纳，并要求补充不同来源证据或收窄为局部观点。
- Paper Writer 单句证据检查只要 claim 和证据有任意关键词重合就算匹配，带 `[1]` 的“clinical diagnosis accuracy”或“autonomous driving dominates”等外推句也可能被标为 supported。修复为计算 claim 关键词覆盖率和 missingTerms，匹配过弱时新增 `weak-evidence-match` 阻塞项，要求改写为证据直接支持的局部事实或补充更直接证据。
- Paper Writer 后端单句检查已返回 `coverage` 和 `missingTerms`，但工作台原型只显示匹配词，用户看不到 claim 哪些关键词没有被证据支持；离线 fallback 也仍按任意重合词放行弱匹配。修复为在匹配证据卡展示覆盖率和未覆盖关键词，并让本地 fallback 复用弱匹配阻塞规则。
- Paper Writer AI 输出审查和单句证据检查直接用 `Number(item.rank)` 构造可引用编号集合，证据包若出现重复 rank 或非正整数 rank，同一个 `[1]` 可能指向多个片段或不可追溯来源。修复为统一解析正整数来源编号并校验证据 rank 唯一性，发现重复/无效编号时返回 `unstable-evidence-ranks` 阻塞项。
- Paper Writer 后端已阻塞重复/非法证据编号，但工作台原型在审查接口失败时会走本地 fallback，本地 AI 输出审查、单句检查和待检查队列没有同步校验证据编号稳定性，可能让离线路径误以为 `[1]` 可追溯。修复为前端本地构造 evidence rank 索引，重复/非法编号统一生成 `unstable-evidence-ranks` 阻塞项，并给出“重新生成证据包”修订动作。
- Skill 详情接口返回 `display_name_zh`，但 Skill 导航卡片只返回 `title_zh`，外部调用方按“中文标题 + 英文副标题”统一字段渲染时会拿不到中文名称。修复为导航卡保留 `title_zh` 的同时补充 `display_name_zh`，并测试 `subtitle_en` 一起返回。
- Paper Writer 能识别扫描版 PDF 需要 OCR，但诊断只告诉用户“需要 OCR”，没有说明当前服务器是否具备 OCR 工具，也没有明确一键自动恢复尚未启用，用户容易误判是 RAG 坏了或系统会自动处理。修复为 recovery 增加 `ocrCapability`，上传诊断、文档可用性复制文本和前端恢复卡展示 OCRmyPDF/Tesseract 探测结果、自动恢复状态和下一步补救路径。
- Paper Writer 人工文献笔记质量检查只接受 `Evidence text:` 和 `Page/section:` 同一行内的值，用户从 OCR 工具复制多行原文摘录或 Markdown 引用块时会被误判为空模板/字段不完整，导致本来可引用的证据无法进入 RAG。修复为先解析 Fact/Evidence/Page 字段，并允许字段值出现在后续几行或引用块中，同时保持空模板和缺字段笔记阻塞。
- Paper Writer AI 输出审查只判断证据包里是否有任意年份/venue/DOI 信号，可能放行“Smith et al. 2024 ... [1]”这类由模型补全的文献信息，即使证据 [1] 本身没有作者或年份。修复为抽取输出中的具体作者 `et al.`、年份、DOI、arXiv 和常见 venue，并要求它们出现在对应来源编号的证据片段中；否则生成 `unsupported-bibliographic-details` 阻塞项，单句检查和前端本地 fallback 同步阻塞。
- Paper Writer 全文审查已能用 `unsupported-bibliographic-details` reject 假引用细节，但待单句检查队列仍把这类句子按普通 bibliographic risk 处理，优先级不够高。修复为 claimCheckQueue 逐句复用同一检查，将未被对应证据片段支持的作者、年份、DOI、arXiv 或 venue 标成 high priority，并把具体缺失字段写入原因。
- Paper Writer 待单句检查队列按句号切分 AI 输出时会在 `et al.` 后错误断句，把 `Smith et al. 2024 ... [1]` 变成 `2024 ... [1]`，导致队列里丢失作者 marker。修复为切分前保护 `et al.` 缩写，后端和前端本地 fallback 都保留完整作者年份句子。
- Paper Writer 对证据支持的普通表述缺少量化细节防线，AI 可以把“improve related work drafting [1]”扩写成“improve by 15% [1]”，而证据片段没有任何百分比或指标结果。修复为抽取百分比、p-value、指标数值、提升幅度、样本量等量化 marker，并要求它们出现在对应来源编号的证据片段中；否则生成 `unsupported-quantitative-details` 阻塞项，全文审查、单句检查、待检查队列和前端 fallback 同步阻塞。
- Paper Writer 单句证据检查只看关键词覆盖率，证据写 `do not improve related work drafting` 时，AI 输出 `improve related work drafting [1]` 关键词高度重合，可能被当作 supported。修复为新增保守的肯定/否定极性检查：claim 和对应证据片段共享足够关键词但 improve/support/help 等方向相反时，生成 `claim-contradicts-evidence` 阻塞项，并在待检查队列中 high priority 提示。
- Paper Writer 全文审查会把整段中的所有来源编号合并后检查作者年份和量化结果，导致第一句引用 `[1]` 时可能偷用第二句 `[2]` 里的 `Smith et al. 2024` 或 `15%` 而未被全文阻塞。修复为全文审查按句子作用域检查文献信息、量化细节和结论方向；每句话只能使用自己引用的证据片段，前端本地 fallback 同步修复。
- Paper Writer 修订提示词虽然会列出审查发现，但对模型来说仍偏通用，可能在第二版继续保留同一个未支持作者年份、未支持数字或反向结论。修复为在修订提示词中新增“必须满足的硬约束”：列出必须删除或替换的具体 marker，禁止跨来源借用元数据/数字，证据编号不稳定时要求先重建证据包，结论方向相反时要求按证据原文修正；前端 fallback 同步生成。
- Paper Writer 多轮修订缺少进展对比，用户第二次审查时只能看到当前输出是否通过，不知道上一轮阻塞项是否已解决、是否重复卡住或是否引入新阻塞。修复为新增 `revisionProgress`，前端连续审查时自动传入上一轮 review，后端和本地 fallback 都会返回已解决/重复/新增阻塞项、`stuck` 状态、退出修订循环判断和可复制进展。
- Paper Writer 对扫描版 PDF 或无法抽取正文的文档只能提示“上传 Markdown 文献笔记”，用户需要自己另存文件再走上传流程，修复链路不够顺手。修复为新增受控文本证据导入接口和前端“粘贴 OCR/摘录导入”按钮，用户可直接粘贴已核对 OCR/人工摘录文本；服务端仍执行空模板和不完整文献笔记拦截，只有包含 Fact、Evidence text 和 Page/section 的内容才进入可引用 RAG 证据。
- Paper Writer 的 OCR/人工摘录导入最初使用浏览器 `prompt`，长 OCR 文本难编辑、看不到质量要求，误提交风险高。修复为页面内导入面板：包含文件名输入、长文本 textarea、质量门槛提示、提交和取消按钮；恢复提示只负责打开并预填面板，不再用 `window.prompt` 收集长文本。
- Paper Writer OCR/人工摘录导入面板虽然替代了 prompt，但用户仍可能提交后才知道缺少 Fact、Evidence text 或 Page/section。修复为新增前端实时质量预检，编辑时直接显示三项门槛的有/缺状态，缺项时阻止提交并提示补齐；后端最终质量门槛仍保留。
- Paper Writer OCR/人工摘录导入的前端实时预检和后端最终入库判定不是同源规则，长期可能漂移。修复为新增 `/rag/text-import/preview` dry-run 接口，复用后端质量门槛和上传诊断但不写文件；导入面板新增“后端预检”按钮，正式导入前即可看到最终同源判定。
- Paper Writer 缺少不依赖浏览器的完整写作链路验证，单点测试无法证明“证据导入 -> 工作台 -> 草稿审查 -> 修订复审 -> 单句检查”能串起来。修复为新增 API 级 E2E 测试，使用临时项目和公开测试文本跑通该链路，并验证危险草稿被拒绝、修订稿清除阻塞、单句检查 supported 且仍禁止自动写入正文。
- 当前机器 Playwright Chromium 仍因缺 `libatk-1.0.so.0` 无法启动，真实浏览器点击流暂时不能作为本地验证证据。补充工作台原型页面结构级回归，验证证据上传、文本证据导入、后端预检、AI 输出审查、单句检查和修订进展控件/函数存在，并防止导入链路退回 `window.prompt`；该测试降低静态页面回归风险，但不替代完整浏览器 E2E。
- Paper Writer 扫描版 PDF 恢复诊断过去只能给一次性文字提示，用户关闭提示或继续写作后很难知道还有哪些文档没有可检索正文。修复为新增 OCR/摘录恢复队列，记录阻塞文档、服务器 OCR 能力和下一步动作；同一来源的已核对文本导入后自动把队列任务标记为完成，工作台也提供队列面板和刷新入口。
- Paper Writer OCR/摘录恢复队列最初只能记录任务，服务器即使安装了 OCRmyPDF，用户仍必须离开工作台自己生成 OCR PDF 再上传。修复为新增受控 `/rag/ocr-jobs/run` 执行入口：只在用户显式触发时运行，输出新的 `.ocr.pdf` 证据文件，不覆盖原 PDF，并重新走抽取、上传诊断和 RAG 索引；无 OCR 工具或 OCR 失败时保持队列阻塞并提示改用人工摘录导入。
- Paper Writer Skill 导航虽然已有中文标题、标签和 hover 详情，但新用户仍需要先理解 Skill 名称和分类，不能直接从“我要写 related work / introduction / 投稿检查”进入正确工作流。修复为新增任务意图诊断，把用户自然语言任务映射到中文论文任务意图、推荐 Skill、推荐任务入口、材料缺口和安全边界，并在工作台提供“一键使用推荐入口”。
- Paper Writer Skill 导航风险筛选按钮使用不存在的 `item.key` 字段，材料筛选也把对象数组直接与字符串比较，导致部分筛选点击后没有效果。修复为风险筛选使用 `level`，材料筛选按 `requires_context[].key` 匹配。
- Paper Writer 模式操作中心虽然会提示 Agent/Tools 需要人工确认，但写作提示词的“创建会话并发送”按钮仍会直接发起模型请求，用户可能误以为系统已经执行了“确认后再发送”的安全门槛。修复为后端返回结构化 `sendGate`，前端新增发送安全确认框；存在阻塞项时直接拦截发送，Agent/Tools 或需要确认的任务必须先勾选“不会自动写入/覆盖/运行命令”才会创建会话。
- Paper Writer AI 输出审查通过后缺少安全采纳路径，用户只能复制草稿，容易绕过目标章节确认、来源编号复核和“不得自动写入”的最终门槛。修复为新增安全采纳包服务、接口和工作台面板：缺少目标章节或审查仍 reject 时阻塞，通过时只返回只读人工应用包、禁止动作和 `willWrite: false` 的手动 diff plan。
- Paper Writer 安全采纳包接口如果信任客户端传入的 review，前端旧状态或伪造请求可能把未重新审查的 answer 包装成“可采纳”预览。修复为采纳包路由始终在服务端对当前 answer 重新运行 AI 输出审查，客户端 review 只作为上一轮进展参考；前端记录 review 对应的 answer 文本，生成采纳包前发现文本变化会先重新审查。
- Paper Writer 后续审查接口没有透传当前 RAG 检索词，用户在工作台用 `evidenceQuery` 找到证据后，`review-answer`、`claim-review` 或 `adoption-package` 可能重新用任务文本检索，导致证据包为空并误报 `[1]` 是假引用。修复为三个接口都接收 `evidenceQuery` / `ragQuery` / `query`，前端审查、单句检查和采纳包请求统一发送当前 RAG 检索框内容。
- Paper Writer 的生产可用性门禁没有显式纳入运行环境能力，服务器缺少 OCR 工具时，用户只能在扫描 PDF 诊断或测试日志中看到问题，容易误以为整体已生产就绪。修复为新增 `runtimeEnvironment` 和 `runtime-environment` readiness 维度：OCR 不完整但无阻塞 PDF 时显示非阻塞风险，存在需 OCR 的失败 PDF 且服务器无法自动 OCR 时作为生产阻塞项。
- Paper Writer 生成草稿和审查草稿之间缺少证据包一致性检查；如果用户换了 RAG 检索词、重建索引或上传/删除证据，旧草稿中的 `[1]` 可能在审查时指向新的片段。修复为给证据包生成指纹，并在输出审查、单句检查和安全采纳包中检测指纹漂移；漂移时阻塞引用采纳，要求重新生成证据包和重新审查。
- Paper Writer 前端最初发送“当前工作台”的证据包指纹，而不是“这条 AI 回复生成时”的证据包指纹；用户生成草稿后重新分析任务或换证据，旧 AI 回复仍可能用新指纹审查，削弱漂移检测。修复为 AI 回复成功返回时记录生成时的证据包指纹，输出审查和安全采纳包使用该指纹；从 AI claim 队列带出的单句继承该指纹，手动输入的 claim 则使用当前证据包指纹。
- Paper Writer 后端审查失败时会走前端本地 fallback，但本地输出审查、单句检查和采纳包最初没有同步证据包指纹漂移检测，可能在离线路径误放行旧 `[1]`。修复为本地 fallback 也接收 expected evidence fingerprint，指纹不一致时生成阻塞项；本地采纳包会重新跑本地审查，不再直接信任旧 review。
- Paper Writer 工作台 RAG 检索只更新页面上可见的证据列表，不更新正式工作台 `evidencePack`、证据包指纹、写作提示词和生产可用性门禁；用户看到新命中后继续生成或审查，实际可能仍使用旧证据包。修复为检索成功后自动用当前检索词重新加载工作台上下文，并补静态回归断言 `searchRagEvidence` 会调用 `loadWorkbench()`。
- Paper Writer Skill 卡虽然已有中文标题和展开详情，但鼠标悬停时缺少原生摘要，用户需要先理解卡片结构才知道“这个 Skill 到底做什么”。修复为推荐卡和导航卡增加 `title` 摘要，按中文标题、英文副标题、中文分类和基本功能组织，并补页面结构回归。
- Paper Writer 长链路测试会生成 `app/.tmp-test-home/`、`app/.tmp-v8-coverage/` 和 `app/.codegraph/`，但这些目录未被 `.gitignore` 覆盖，上传代码到 GitHub 时容易把 npm 缓存、临时会话、覆盖率 JSON 或本地 codegraph 数据库带上去。修复为把这些本地生成目录加入忽略规则，并用 `git check-ignore` 验证。
- Paper Writer 工作台上下文已按 `evidenceQuery` 生成证据包，审查和采纳接口也会透传当前检索词，但真正发送给 AI 的 `aiDraftRequest.send.rag.query` 仍默认使用任务文本；用户刚用特定 query 刷新证据包后，模型生成阶段可能重新按另一组词检索，导致草稿来源和审查证据包分叉。修复为后端草稿请求绑定 `evidenceQuery`，前端发送时构造 `activeRagRequest` 并强制使用当前 RAG 检索框或证据包 query。
- Paper Writer 工作台复制证据包、修订提示词或安全采纳包时，旧 textarea fallback 调用 `document.execCommand('copy')` 后没有检查返回值；在剪贴板被浏览器拒绝时也可能显示“已复制”，用户实际粘贴不到关键证据或采纳清单。修复为检查 `execCommand('copy')` 的布尔结果，失败时明确提示手动复制，并确保临时 textarea 一定移除。
- Paper Writer 工作台重新加载上下文时只清掉 AI 输出审查对象，没有同步清理旧单句检查、旧安全采纳包、旧 AI 回复证据包指纹和旧 claim 指纹；上传/删除证据或换检索词后，用户仍可能复制旧采纳包或用旧指纹做单句检查。修复为新增 `resetDerivedReviewState()`，在 `render()` 时统一清理所有依赖旧证据上下文的派生状态和面板。
- Paper Writer 工作台文案提示“生成或粘贴 AI 回复后审查”，但 AI 返回区不是可编辑控件，用户无法直接粘贴已有回复；如果未来手动改稿后仍保留旧审查，也会误导用户继续复制旧采纳包。修复为把 AI 返回区设为可编辑 textbox，并在 input 时调用 `invalidateAiReplyReviewState()` 清理旧审查和旧采纳包，提示重新审查。
- Paper Writer 用户在分析任务后如果继续修改任务、目标章节、上下文笔记或 RAG 检索词，再直接发送/审查/单句检查/生成采纳包，旧 `currentWorkbench` 可能与新输入混用。修复为记录分析时的输入签名，并在高风险动作前校验签名；发现变更时要求先重新点击“分析任务”。
- Paper Writer 的发送/审查门禁已能拦截旧 `currentWorkbench`，但复制写作提示词、证据包、完整工作包或修订提示词仍可能把旧证据包带到外部 Chat 继续写作。修复为高风险复制入口复用同一输入签名校验，输入变更后必须重新分析才能复制这些写作依据。
- Paper Writer 用户修改任务或 RAG 检索词后，旧 AI 审查面板里的“使用修订提示词”和“放入单句检查”仍能把旧 review prompt / claim 队列塞回当前流程。修复为这些旧审查继续操作也复用输入签名校验，输入变更后必须重新分析。
- Paper Writer 过去只在用户点击发送、审查或复制时才提示当前工作台已过期；用户编辑任务、上下文或 RAG 检索词后，页面仍展示旧提示词、旧工作包和旧审查面板，容易误以为它们对应新输入。修复为输入变化时立即标记 stale，清理旧派生状态，并让任务入口、模式提示、推荐检索词和澄清问题填入路径同步触发。
- Paper Writer 输入变化后虽然清理了旧审查、提示词和工作包，但生产可用性、流程、Skill 决策、证据包和验收清单仍保留旧面板，视觉上仍像已经针对新输入完成分析。修复为新增统一过期渲染，输入变更后把核心分析面板全部恢复为未分析占位。
- Paper Writer 切换项目和填入推荐 RAG 检索词会先触发 stale 清理，但随后状态栏被“已选择项目”或“已填入检索词”覆盖，用户看不到旧分析已失效。修复为这些成功文案也明确提示需要重新分析或重新检索。
- Paper Writer 输入过期后核心面板会清空，但发送安全确认区域仍保留旧模式、旧阻塞项或旧确认文案，用户可能误以为发送门槛仍对应当前输入。修复为 stale 状态同步重置发送安全门槛，禁用确认框并要求重新分析。
- Paper Writer “演示数据”按钮原来只调用 `render(demoData)`，不会同步项目、任务、上下文和 RAG 检索词输入框；如果用户之前填过真实任务，演示面板可能和输入框混用。修复为加载 demo 前先把左侧输入同步到演示任务状态。
- Paper Writer 用户切换后端地址或 API Token 后，旧工作台分析仍保留，后续请求可能打到新后端/新身份却沿用旧证据包和模式门槛。修复为后端地址和 Token 输入变化也触发 stale 清理，要求重新分析。
- Paper Writer 切换后端后加载项目列表如果失败，旧后端的项目选项仍留在下拉框，用户可能误选旧环境项目 ID。修复为加载项目开始时清空旧选项并显示加载中，失败时显示可手动填写项目 ID。
- Paper Writer 保存或清除 API Token 会覆盖“旧分析已失效”的状态提示，用户只看到 Token 已保存/清除，容易继续使用旧身份下的分析结果。修复为 Token 保存和清除文案都明确要求重新分析。
- Paper Writer 最近证据文档删除仍使用 `window.confirm`，原生弹窗无法展示项目、路径和删除后果，也没有先校验当前分析是否已过期；用户切换任务、项目、后端或身份后，可能从旧文档列表触发误删。修复为页面内确认条，删除入口和最终确认都复用输入签名门禁，并用静态回归禁止 `window.confirm` 回归。
- Paper Writer 后端地址和 API Token 变化虽然会触发过期提示，但 `buildWorkbenchInputSignature()` 没有包含这两个输入；部分高风险动作再次调用 `ensureWorkbenchInputsFresh()` 时仍可能把旧分析判定为新鲜。修复为把 `apiBase` 和 Token 变化标记纳入工作台输入签名，并补静态回归，确保切换后端或身份后必须重新分析。
- Paper Writer OCR/人工摘录导入面板打开后，用户如果修改任务、项目、后端地址或 Token，旧面板和旧 `sourceDocument` 仍可能保留；继续预检或导入会把旧文档摘录混入新上下文。修复为输入过期渲染时关闭导入面板并清空旧来源，同时在后端预检和正式导入前执行输入签名门禁。
- Paper Writer 高风险动作的新鲜度门禁已经覆盖项目、后端地址和 API Token，但拦截文案仍只说“任务、上下文或 RAG 检索词已变更”，用户切换后端或身份后不知道为什么被要求重新分析。修复为把门禁提示同步为“项目、后端、身份、任务、上下文或 RAG 检索词已变更”，并补静态回归。
- Paper Writer 保存或清除 API Token 时只更新状态文案“旧分析已失效”，但没有强制清理当前工作台分析；如果 Token 是通过保存按钮或密码管理器路径变化的，后续高风险门禁可能仍认为旧分析新鲜。修复为保存前规范化输入值，并用 `markWorkbenchInputsStale(..., { force: true })` 真实失效旧证据包、发送门槛和派生审查。
- Paper Writer 加载项目列表会清空下拉选项，但不会强制清理旧工作台分析；用户切换后端或身份后点击“加载项目”，页面可能同时显示新环境项目列表和旧环境证据包/Skill/发送门槛。修复为 `loadProjects()` 开始时强制 stale，刷新项目列表前先清掉旧分析面板。
- Paper Writer 请求头会对 API Token 执行 `trim()`，但工作台输入签名曾使用原始 Token 输入值；用户多输入一个首尾空格时，请求身份实际不变，页面却会误判身份变化并要求重新分析。修复为 `buildWorkbenchInputSignature()` 使用同源的 trimmed Token 标记。
- Paper Writer RAG 检索成功后会先把独立搜索结果渲染到证据列表，再调用 `loadWorkbench()` 更新正式证据包；如果工作台刷新失败，用户会看到新检索结果和旧证据包/旧发送门槛混用。修复为检索阶段只保留命中计数，必须等 `loadWorkbench()` 成功后才由正式工作台响应渲染证据和门禁。
- Paper Writer 上传证据文件时，如果文件已成功写入证据库但随后工作台刷新失败，旧逻辑会进入总 catch 并显示“上传失败”，同时旧分析面板可能继续保留。修复为上传循环完成后先展示上传诊断；只要存在成功上传，就强制旧分析失效，再刷新工作台；刷新失败时明确提示“上传已完成，但工作台刷新失败”。
- Paper Writer 重建 RAG 索引或运行服务器 OCR 时，后端可能已经改变证据库，但后续 `loadWorkbench()` 失败会被笼统显示成“索引失败”或“服务器 OCR 失败”。修复为后端动作成功后先强制旧分析失效，再刷新工作台；刷新失败时明确提示索引/OCR 已完成但工作台刷新失败。
- Paper Writer OCR/人工摘录文本证据导入成功后会继续刷新工作台和 OCR 队列；如果后续刷新失败，旧逻辑会把已写入证据库的导入误报为“文本证据导入失败”。修复为导入成功后先展示上传诊断并强制旧分析失效，刷新失败时提示“文本证据已导入，但工作台刷新失败”。
- Paper Writer 删除证据文档成功后会继续刷新工作台；如果刷新失败，旧逻辑会把已删除的文档误报为“删除失败”，并可能保留旧证据包。修复为 DELETE 成功后先清空确认条、强制旧分析失效，再刷新工作台；刷新失败时提示“文档已删除，但工作台刷新失败”。
- Paper Writer 多个两阶段动作已经写了“已完成但工作台刷新失败”的提示，但 `loadWorkbench()` 会吞掉刷新错误，外层上传、导入、索引、OCR、删除和检索流程无法真正进入刷新失败分支。修复为给 `loadWorkbench({ throwOnError: true })` 增加可选抛错模式，子流程统一使用该模式；检索也区分“检索失败”和“检索已完成但工作台刷新失败”。
- Paper Writer OCR 恢复队列入口来自旧文档卡片，如果用户切换项目、后端地址、API Token、任务或 RAG 检索词后继续点击“加入 OCR/摘录队列”或“运行服务器 OCR”，可能把旧文档任务写入新上下文，或在错误身份/后端上执行 OCR。修复为队列创建和服务器 OCR 执行都先通过工作台输入签名门禁，旧分析状态下必须重新分析后才能继续。
- Paper Writer 文本证据导入或工作台加载成功后会静默刷新 OCR 恢复队列；旧逻辑在静默刷新失败时仍会覆盖队列面板为“队列加载失败”，让用户误以为刚才的证据导入或分析失败。修复为静默刷新失败只记录 `lastSilentError` 并保留当前队列可见状态，只有用户主动刷新队列时才显示失败面板。
- Paper Writer 工作台分析请求没有代际保护，用户连续点击“分析任务”、检索后刷新工作台，或在请求进行中修改任务/项目/RAG 检索词时，较慢的旧响应可能晚返回并覆盖新输入对应的证据包、模式门槛和写作提示词。修复为 `loadWorkbench()` 记录请求序号和输入签名，响应回来时只有仍是最新请求且输入未变才允许渲染；输入变化和加载 demo 会主动作废在途请求。
- Paper Writer AI 输出审查、单句检查、安全采纳包和 AI 发送只在请求开始时检查一次新鲜度；如果用户在请求进行中改了 AI 回复、claim、目标章节或工作台输入，旧响应晚返回后仍可能渲染旧审查、旧采纳包或旧 AI 回复。修复为这些异步动作捕获请求开始时的文本、输入签名和证据包指纹，返回时不一致就丢弃旧结果并提示用户重新操作。
- Paper Writer RAG 检索请求返回前如果用户修改检索词、任务、项目、后端或身份，旧检索结果仍会继续触发工作台刷新，导致“旧命中数”文案和新证据包混在一起。修复为检索开始时记录工作台输入签名，返回时签名变化则丢弃旧检索结果，不再刷新证据包。
- Paper Writer 上传证据和重建 RAG 索引是有副作用的动作，但旧实现没有像删除/OCR 那样先校验工作台新鲜度；多文件上传过程中如果用户切换项目、后端或身份，剩余文件可能继续发往旧上下文，完成后还可能刷新新输入的工作台。修复为上传和索引入口先执行新鲜度门禁，上传过程中和上传完成后都检查输入签名变化，变化时停止剩余上传并跳过旧结果刷新；索引完成后若输入变化也只提示原上下文已完成，不渲染旧结果。
- Paper Writer 后端已生成运行环境能力报告，但前端只在“生产可用性”综合维度里间接展示 OCR 工具缺失；真实用户容易看不到“扫描 PDF 自动 OCR 不可用/需要人工兜底”的生产验证缺口。修复为新增独立“运行环境能力”面板，展示 OCR 自动恢复、OCR 工具状态、需 OCR 文档和环境下一步，并把该报告纳入完整工作包和复制入口。
- Paper Writer 的运行环境能力报告只覆盖 OCR，真实浏览器 E2E 预检仍只出现在测试日志中；用户在工作台里看不到“生产发布前必须运行 Playwright 预检和浏览器点击流”的验收门槛。修复为 `runtimeEnvironment` 新增 `browserE2eCapability`，运行环境面板、复制文本和完整工作包都会显示浏览器 E2E 未在工作台内验证、预检命令和依赖安装提示。
- Paper Writer 虽然已经把浏览器 E2E 缺口放进运行环境报告，但 `agentReadiness` 仍可能在无阻塞项且平均分较高时显示 `production-ready`，让用户误以为可正式发布。修复为新增 `productionWarnings`：浏览器 E2E 未验证时不阻塞生成可审查草稿，但生产可用性状态降为 `needs-review`，复制报告和页面都会显示“生产验收警告”及 Playwright 预检动作。
- Paper Writer 生产验收警告会生成 `run-browser-e2e-preflight` 动作，但前端通用队列按钮没有处理这个动作类型，用户点击后没有实际反馈。修复为该动作渲染成“复制浏览器 E2E 预检命令”按钮，并通过新鲜度门禁复制 `node scripts/playwright-preflight.mjs`，避免生产验收下一步成为无效按钮。
- Paper Writer 的浏览器 E2E 下一步最初只复制单条 `node scripts/playwright-preflight.mjs`，但当前机器常见失败是缺 Chromium 系统依赖，用户仍需从日志中手动拼 `npx playwright install` 和 `sudo npx playwright install-deps`。修复为 `browserE2eCapability` 提供完整生产验收命令包，复制按钮直接包含预检、依赖安装和复检步骤。
- Paper Writer 的 OCR 恢复路径只有安装提示文案，没有可复制的生产恢复命令包；用户遇到扫描 PDF 或缺 OCR 工具时仍要自己拼 `ocrmypdf`、`tesseract`、`pdftotext` 检查和系统依赖安装命令。修复为 `ocrCapability` 提供完整 OCR 生产恢复命令包，并让带 `commandPack` 的运行环境动作渲染成可复制命令包按钮。
- Paper Writer 后端运行环境复制文本已包含 OCR 命令包，但前端演示/离线兜底数据的 `runtimeEnvironment.copyText` 只包含浏览器 E2E 命令包；用户在后端不可用或演示模式下复制运行环境能力时，仍拿不到扫描 PDF 恢复步骤。修复为 demo 复制文本同步加入 OCR 能力、OCR 恢复命令包和安装提示，并用静态回归锁定。
- Paper Writer Skill 导航卡片已经展示中文标题、标签和悬停说明，但用户从分类/标签筛到某个 Skill 后只能查看或复制首问，不能像推荐卡片一样直接填入任务框开始；真实写作时“看懂了选哪个”到“开始执行”之间仍断了一步。修复为导航卡片使用 `hoverGuide.first_prompt_zh` 渲染“填入任务框”和“复制首问”按钮，并用静态回归锁定。
- Paper Writer 证据包会展示“补证据计划”，后端动作列表也声明了 `copy-expansion-plan`，但前端没有渲染复制按钮，计划本身也没有独立 `copyText`；用户发现证据覆盖偏薄后，无法一键把建议检索词、缺失来源类型和使用边界带去继续检索或交给 Agent。修复为 `evidencePack.expansionPlan` 生成独立复制文本，前端显示“复制补证据计划”按钮，并复用工作台新鲜度门禁复制。
- Paper Writer AI 输出审查会生成“待单句检查”队列，但每个候选句只显示句子和风险原因，没有就地展示该句引用或匹配的证据片段；用户逐句复核时必须回证据包手动查 [1]/[2]，容易漏看或看错证据边界。修复为队列项增加 `evidenceRefs`，优先展示显式引用的证据，未引用时展示最相关匹配片段；前端和复制队列都会显示关联证据摘要。
- Paper Writer 安全采纳包只说明“人工复制到目标章节”和禁止自动写入，但没有给出可执行的人工应用步骤；用户拿到可采纳草稿后仍可能整段覆盖、漏做 diff、或改完引用事实后忘记重新审查。修复为采纳包新增 `manualApplicationGuide`，展示定位目标、保留快照、按最小人工 diff 应用、逐条核对来源和改后重审，并提供“复制人工应用指南”按钮。
- Paper Writer 完整工作包聚合了上下文、Skill、证据、流程和提示词，但缺少一页式“交接指南”；接手的 Agent 或协作者需要自己从多个 section 里判断先处理什么、哪些材料可信、哪些动作禁止，容易跳过阻塞项或误读隐私边界。修复为 `workbenchBundle.handoffGuide` 汇总接手后先做、阻塞项、可信材料、禁止动作和继续条件，前端显示并提供“复制交接指南”。
- Paper Writer 生产可用性报告会用摘要文字说明“可以生成可审查草稿，不能宣称生产就绪”，但没有结构化区分“可审查草稿级 / 人工采纳级 / 生产发布级”；用户容易只看分数，把草稿链路可用误判成发布级生产就绪。修复为 `agentReadiness.readinessTiers` 明确三层状态、允许做什么和必须满足什么，前端生产可用性面板与复制报告都会显示该分级。
- Paper Writer 已经展示 OCR 和浏览器 E2E 缺口，但用户安装依赖后仍缺少一条明确的复验路径，不知道要重跑哪些命令、何时重新分析工作台、以及生产发布级何时才算解除阻塞。修复为 `runtimeEnvironment.recheckPlan` 生成“依赖修复后复验计划”，运行环境面板显示复验步骤、通过标准和复制按钮，复制报告也包含该计划。
- Paper Writer 复验计划提示用户运行 Playwright 预检，但后端浏览器 E2E 状态仍是硬编码的 `not-verified-in-workbench`；即使用户修复依赖并重跑预检，重新分析工作台也无法反映 ready/failed 结果。修复为 `scripts/playwright-preflight.mjs` 写入被忽略的运行时状态文件，工作台读取该文件展示最近一次预检通过或失败，并据此解除或保留生产验收警告。
- Paper Writer 把 Chromium 预检通过当成浏览器 E2E `ready`，但预检只证明浏览器能启动，不能证明真实页面点击流、上传/导入/删除、剪贴板和采纳包交互通过；用户可能在只跑预检后误判生产发布级已达标。修复为新增 `scripts/playwright-e2e-acceptance.mjs` 包装 `pnpm e2e`，写入完整 E2E 验收状态；工作台只有读到完整 E2E `passed` 才解除浏览器生产验收警告，预检通过只显示 `preflight-passed`。
- Paper Writer 在完整浏览器 E2E 通过后，如果当前样例没有扫描 PDF，缺少 OCRmyPDF/Tesseract 仍可能不再作为生产验收警告；但论文写作工具的生产发布级必须能处理扫描 PDF 恢复或至少证明 OCR 兜底可用。修复为将 OCR 自动恢复能力纳入 `runtime-environment` 生产警告：缺 OCR 时仍允许可审查草稿和人工采纳级，但生产发布级保持 blocked，并展示 OCR 安装/验收命令包。
- Paper Writer 的 OCR 生产恢复命令包要求 `pdftotext`，PDF 抽取链也优先调用 Poppler，但 `buildOcrCapability()` 只探测 OCRmyPDF/Tesseract；服务器缺少 `pdftotext` 时仍可能把 PDF/RAG 运行环境看作生产级。修复为把 `pdftotext` 纳入工具探测、能力报告和生产门禁：缺少 PDF 文本抽取工具时仍可草稿/人工采纳，但生产发布级保持 blocked。
- Paper Writer 后端已把 `pdftotext` 纳入运行环境能力，但前端“运行环境能力”和文档恢复卡仍只展示 OCR 自动恢复/OCR 工具，用户看不到普通文本 PDF 抽取能力是否可用。修复为运行环境指标卡、OCR 能力提示和本地 fallback 都显示“PDF 文本抽取：可用/未验证”，并用静态回归锁定。
- Paper Writer 会把 OCR、PDF 文本抽取和浏览器 E2E 缺口合并成一个 `runtime-environment` 生产警告；用户看到“1 个生产验收项”时仍要自己拆解到底差哪些 gate。修复为新增 `runtimeEnvironment.productionGates`，把服务器 OCR 自动恢复、PDF 文本抽取、真实浏览器 E2E 拆成独立生产 gate，前端逐项显示状态、要求、说明和对应动作，复制报告也包含 gate 明细。
- Paper Writer 复验计划用 `ocrCapability.status !== 'ready'` 判断 OCR 是否仍需修复，但 OCR 能力的真实状态值是 `tool-available` / `partial-tooling` / `not-configured`；即使 OCR、PDF 文本抽取和完整浏览器 E2E 全部通过，复验计划仍会误报 `required-before-production`。修复为根据 `productionGates` 是否全 ready 和是否仍有待 OCR 文档判断，gate 全绿时显示 `ready-to-record`。
- Paper Writer 运行环境顶层 `status` 只看 OCRmyPDF 是否可用；当 OCRmyPDF 可用但 PDF 文本抽取或完整浏览器 E2E 未通过时，顶部仍可能显示 `ready` / “运行环境可自动处理 OCR”，与下方生产 gate 矛盾。修复为顶层状态按生产 gate 聚合：硬阻塞为 `blocked`，任一 gate 未通过为 `needs-production-validation`，所有 gate 通过才是 `ready`。
- Paper Writer 完整工作包的交接指南仍用“包含 OCR 和浏览器 E2E 的生产验证缺口”概括运行环境问题，没有把服务器 OCR 自动恢复、PDF 文本抽取、真实浏览器 E2E 三个生产 Gate 逐项写给接手者。修复为交接指南按 `runtimeEnvironment.productionGates` 汇总通过数量、未通过 Gate 名称和继续条件，前端 demo 兜底数据同步三项 Gate，并用后端/静态测试锁定。
- Paper Writer Skill 推荐器会把 `p value` 拆成单字母 `p`，导致“PDF 读不出来 / RAG 不好用”里的 `PDF` 误命中统计分析；中文单字“写”也会让多个写作 Skill 同时加分，用户越不知道选哪个 Skill 越容易被带偏。修复为忽略过短拆分词，新增 RAG/PDF 诊断意图，优先引导用户查看证据库读取诊断和修复建议，而不是进入统计分析或不存在的任务入口。
- Paper Writer 模式路由把裸“实验/统计/表格”等词直接当作工具执行信号，导致“帮我写实验部分”被升级成 Tools；同时“帮我改论文”没有命中“改写/润色”等正文修改词，会被留在 Chat，Skill 推荐还会因为裸“论文”误推文献综述。修复为正文修改识别加入“修改/改论文/改一下”，Tools 只在明确运行、编译、脚本、命令、统计检验、数据处理等执行信号出现时触发，并移除裸“论文”对文献综述的 RAG 加分。
- Paper Writer 缺少面向“帮我润色/帮我改论文”的独立 Skill，真实用户最常见的语言编辑任务会被判成不明确，或者只能在 introduction/abstract 等章节 Skill 里绕路。修复为新增 `writing-polish` 论文润色 Skill、中文元数据和“论文润色 / 语言编辑”任务入口，并把 `target_section_or_file` 显示成“目标章节或段落”，避免机器字段名泄漏到用户下一步提示。
- Paper Writer 把 “rebuttal / reviewer comments / 审稿意见回复” 路由到“会议投稿检查”或判为不明确，用户想写 response letter 时会看到投稿 checklist，而不是逐条回复审稿意见的工作流。修复为新增 `reviewer-response` 审稿回复 Skill、中文意图和“审稿回复 / Rebuttal”任务入口，要求补充 reviewer comments 和目标修改位置，并禁止承诺未确认的实验、数字或正文修改。
- Paper Writer 后端新增 `writing-polish` 和 `reviewer-response` 后，前端演示/离线兜底数据仍只有 3 个任务入口，Skill 导航也只从 related work 推荐列表生成卡片；后端不可用或用户点击演示数据时，看不到“论文润色”和“审稿回复”，会误以为这些 Skill 不存在。修复为 demo 任务入口、分类计数、Skill Navigator 标签/材料筛选和离线卡片同步加入这两个 Skill，并用静态回归锁定。
- Paper Writer 内置 Skill 中 `grant-proposal`、`nature-paper2ppt`、`poster-design` 没有中文 UI 元数据，Skill 导航会把它们以英文主标题展示，其中基金申请还会被归入“投稿”而不是独立项目申请场景。修复为补齐“基金申请 / 论文转演示 / 学术海报”的中文标题、英文副标题、分类、标签、任务模板、输入输出和推荐意图，并用 Skill 引擎回归锁定。
- Paper Writer 真实论文任务“基金申请、论文汇报、学术海报”虽然已有 Skill 元数据，但工作台任务入口和演示兜底没有对应卡片；用户仍要从 Skill 列表里猜英文名，且 `conference talk` 会被“conference”误判为投稿检查。修复为新增三类任务入口、启动说明、上下文预填和演示导航卡片，并把演示汇报/海报意图放到投稿检查之前。
- Paper Writer Skill 标签仍混用 YAML 原始英文标签和中文标题，用户看到 `Related Work / Survey / Research Gap / Language Editing` 等标签时仍像在读内部配置。修复为内置 Skill 标签中文优先，测试和演示数据同步改为“相关工作、综述、研究空白、润色、审稿意见”等用户可扫读标签。
- Paper Writer 对若干常见论文任务仍会给出空入口或误路由：`conclusion` 和“统计显著性检验”能推荐 Skill 但没有 starter；“找最新相关工作”会被文献综述抢走；`cover letter / ethical statement / data availability` 会误进审稿回复或结论。修复为新增“检索最新相关工作 / Conclusion / 统计分析 / 投稿材料”入口和意图优先级，并让投稿材料只要求 venue 规则和目标声明材料，不再错误要求 compiled PDF。
- Paper Writer 对投稿收尾材料仍有误路由：`limitations` 会被 `page limit` 相关投稿检查抢走，`acknowledgements/highlights/author contributions/supplementary material` 会被带到基金、引言或引用管理，`graphical abstract` 会被当成普通摘要。修复为将 limitations 路由到 Discussion，highlights 路由到 Abstract，graphical abstract 路由到图表规划，致谢/作者贡献/补充材料路由到投稿材料检查，并扩展投稿材料入口说明。
- Paper Writer 返修阶段任务仍容易误路由：`response letter revision summary` 会进入摘要，`根据审稿意见修改 introduction` 会进入普通引言，`major/minor concerns` 会进入引用管理，`revision checklist` 会进入投稿 checklist，`rebuttal cover letter` 会进入普通投稿材料。修复为把 reviewer/revision/action item 关键词提升到审稿回复意图，并扩展“审稿回复 / Rebuttal”入口为 revision plan、正文修改矩阵和 action list 工作流。
- Paper Writer 真实写作日常任务仍会误路由或无入口：翻译、语法时态、压缩段落、降低 AI 痕迹、Nature 风格英文会进入通用澄清或图表 Skill；LaTeX/Overleaf 编译报错会误进引用管理；普通 `LaTeX table` 又容易被当成编译修复。修复为扩展 `writing-polish` 的语言编辑意图，新增 `latex-debugging` 编译修复 Skill 和 `latex-debug` 入口，并用负向规则避免没有报错信号的 LaTeX 表格任务误进编译修复。
- Paper Writer 后期写作任务仍存在低分并列误判：dataset/title/appendix 会因没有强意图落到基金申请或引用管理，`keyword list` 会被 `citation key` 抢走，`伪代码` 和 `LaTeX tabular` 会被裸“代码/LaTeX”升级到 Tools，theorem/proof 会被 LaTeX 编译修复抢走。修复为给 Results/Method/Abstract/Submission/Polish 增加后期写作强规则，并移除裸 LaTeX/代码的工具触发，只有明确编译、运行、脚本、统计检验、画图等执行动作才进 Tools。
- Paper Writer 投稿安全和采纳场景仍会误导用户：PDF metadata 匿名检查会被 RAG/PDF 诊断抢走并要求上传文献证据；`reviewers common concerns` 和“是否需要补实验”会停在 Chat；幻觉引用、单句证据核对、AI 输出审查和安全采纳包没有明确 Skill 入口。修复为新增 `evidence-review` 输出审查 Skill 和任务入口，PDF metadata/double blind 归入投稿检查，返修 concern/补实验升级到 Agent，可见动作直接指向输出审查、单句证据检查或安全采纳包。
- Paper Writer 论文项目级任务仍会让用户绕路或误路由：写作计划、paper outline、idea 到 paper structure、故事线检查和审稿前风险清单没有独立入口，ACL/NeurIPS 风格改写还会被裸“论文”带到 `paper-planning`。修复为新增 `paper-planning` 论文规划 Skill 和中文任务入口，并给目标 venue 风格改写增加 `writing-polish` 强规则和 `paper-planning` 负向规则。
- Paper Writer RAG 文档卡虽然会提示 metadata-only、扫描 PDF 或解析失败文档需要补充 Markdown/OCR 摘录，但主动作仍偏向文件上传焦点，真实用户不知道可以直接在页面里粘贴 OCR/人工摘录并预检。修复为当文档恢复诊断带有 noteTemplate 时，文档卡主修复按钮直接打开 OCR/摘录导入面板。
- Paper Writer 论文审查类任务仍有模式和意图误判：contribution 强度、baseline 差异、实验是否支撑 claim、reviewer 挑刺会停在 Chat；`paragraph` 因包含 `rag` 子串会误进 RAG 诊断；“解释这篇论文的方法”会被论文规划抢走；`abstract 是否缺贡献` 会被 contribution 抢到 Introduction。修复为显式识别独立 RAG 词、增强审查类 Agent 触发、提升方法解释和摘要级任务优先级。
- Paper Writer 中后期任务仍有多处优先级错误：method 小节标题被 Abstract 标题抢走，table 结果转正文被论文规划抢走，figure caption 支撑性检查停在 Chat，review 补实验计划被 Results 抢走，fake citation 没进入输出审查，appendix proof sketch 被投稿材料抢走。修复为补充 Method/Results/Figure/Rebuttal/Evidence Review 的强规则和负向规则，并让相关任务进入可确认 Agent 流程。
- Paper Writer 目标上下文缺口提示过度机械：用户已经在任务里写了 Figure 2、Table 4、Reviewer 2 Comment 1、Appendix A、cover-letter.md、main.tex 或 related_work.tex 时，系统仍要求“选择目标章节或文件”；同时 cover-letter.md 会被 reviewer response 抢走。修复为识别明确目标线索并解除 target_section_or_file 缺口，且让 cover-letter 文件进入投稿材料。
- Paper Writer 证据型写作任务会被普通写作词抢走：`Table 2 的结论有没有证据支撑` 会进入 Conclusion，`找和方法相反的观点` 会进入 Method，`总结 PDF 里支持 novelty 的证据` 会因 PDF 标签误进 LaTeX Debug，逐句证据编号/缺引用检查会进入 Literature Review。修复为扩展 `evidence-review` 的反例、负证据、逐句引用、citation grounding 和 AI 合并前审查规则，并在非编译语境下降低 PDF 对 LaTeX Debug 的权重。
- Paper Writer 单句与章节级证据任务边界不清：`这句话需要引用哪几篇论文` 不应要求目标文件，`给 introduction 每个 claim 配 citation` 又不应被单句 claim 检查降成 Chat 或重复要求选文件。修复为单句 citation/claim 检查放宽 `target_section_or_file`，章节级 citation mapping 保持 Agent 审查并识别已写出的章节名。
- Paper Writer 返修任务仍会被规划、工具或普通写作抢走：`reviewer 说 novelty weak` 会进入论文规划并停在 Chat，`response table` 会因 table+生成误进 Tools，rebuttal 过度承诺和 revision summary 会要求不必要的目标文件。修复为扩展 reviewer/revision 意图、给 `reviewer-response` 增加 novelty weak/response table/过度承诺强规则，并把 response table 排除出工具执行触发。
- Paper Writer 投稿材料上下文过度机械：NeurIPS checklist、匿名 appendix、camera-ready 与 anonymous 规则冲突会一律要求 compiled PDF，或者政策冲突类问题还要求目标章节。修复为区分 PDF metadata、纯 checklist/规则冲突和具体材料审查：只有 PDF metadata 要 compiled PDF，纯规则问题只要 venue rules，具体 appendix/supplementary/artifact 材料仍要求目标材料。
- Paper Writer `latexmk` 编译请求未被识别为 LaTeX Debug：`运行 latexmk 编译 main.tex 看看错误` 会被普通润色或通用工具信号抢走。修复为把 `latexmk` 纳入 LaTeX 编译错误/工具执行识别，并要求 `latex_error_log` 后再定位最小修复。
- Paper Writer 图表/统计任务会被错误入口抢走：ROC 画图会落到 Evidence Review 或 Chat，ablation 折线图被 Results 抢走，方法流程图被 Method 抢走，实验数据异常值和 mean±std 没进统计，LaTeX table 排版被 Reviewer Response 抢走，Figure 颜色被 Writing Polish 抢走。修复为新增图表与统计强意图、上下文缺口收窄和模式分流：生成/脚本/计算进 Tools，图表审查进 Agent，统计解释保留 Chat。
- Paper Writer 本地润色任务仍有不必要的上下文阻塞：`这段` 翻译、逐句表达诊断、tense consistency、压缩 30%、降低 AI 痕迹和 Figure caption 英文简化会被要求选择目标章节，或被图表 Skill 抢走。修复为把本地语言编辑优先归入 `writing-polish`，解除 `target_section_or_file` 缺口，并保留写入/保存前的 Agent 确认。
- Paper Writer 摘要级和投稿材料小任务仍过度追问目标文件：生成 title/keywords、压缩 abstract 会要求选择章节，plain `cover letter` 不会被当成明确投稿材料目标。修复为 title/keywords/abstract 只要求论文概要，`cover letter` 作为目标线索解除 `target_section_or_file`，投稿材料仍要求 venue rules。
- Paper Writer 后段交付物任务仍误路由或停在 Chat：slides/PPT/Beamer、poster、proposal/grant、camera-ready checklist、data/code/ethics statement 会被当成解释任务或被要求选择目标章节；Zotero/BibTeX 清理误进润色，未定义引用误进 evidence-review，arXiv anonymous 版本误进学术检索，benchmark paper 加证据库误进论文规划。修复为补充对应强意图、Agent 模式触发和无目标章节的交付物边界。
- Paper Writer RAG metadata 与投稿 metadata 混淆：`PDF 只有 metadata` 会被当成投稿匿名 metadata 检查，`PDF metadata 是否匿名` 又会要求目标章节；supplementary 泄露作者信息一度被错误放过目标材料。修复为区分 metadata-only 解析失败、PDF metadata 匿名检查和 supplementary/appendix 材料审查三类上下文要求。
- Paper Writer 安全采纳包端到端链路会丢目标章节：`buildPaperWorkbenchContext` 把结构化回答放在 `projectState.contextAnswers`，但 `buildAnswerAdoptionPackage` 和 adoption-package 路由返回上下文只读顶层 `contextAnswers`，导致用户已选择 `chapters/related_work.tex` 后仍被判定缺少目标章节。修复为兼容完整 Workbench context 形状，并在 API 响应中回传一致的 `targetSection`。
- Paper Writer 后端启动时会因为 `skillEngine`、`compileService`、`projectService` 等运行时代码直接导入 `yaml` 但后端包未声明该生产依赖而报 `ERR_MODULE_NOT_FOUND`。修复为把 `yaml` 加入后端 workspace dependencies，并恢复本地依赖安装，使 `scripts/restart.sh` 能启动健康检查。
- Paper Writer Draw 系统调用图片 API 时遇到 `Client network socket disconnected before secure TLS connection was established` 会直接失败并把底层 TLS 断连暴露给用户。修复为 Draw HTTP 客户端对 TLS/Socket 瞬断、DNS 临时失败和网关 502/503/504 做有限重试，支持 `OPENPRISM_DRAW_IMAGE_API_BASE` 切换图片 API 网关，并把最终错误改成可执行的网络/代理/证书检查提示。
- Paper Writer 集成终端打开时报 `Terminal backend unavailable: node-pty native module failed to load`。根因是 Linux 环境缺少 `g++`，`node-pty@1.1.0` 没有 linux-x64 预构建包，安装会退回本机编译并失败，导致后端无法加载 PTY 原生模块。修复为升级后端依赖到带 linux-x64 prebuild 的 `node-pty@1.2.0-beta.14`，并用终端 smoke test 验证可 spawn shell。
- 2026-07-22：Paper Agent 在未设置 `OPENPRISM_API_TOKEN` 时会放行 `/api/code/run`、`/api/code/exec` 和终端 WebSocket，局域网可见部署等同于暴露未认证 shell。修复为危险入口无 Token 时 fail-closed（503），配置 Token 后统一校验 Bearer 语义，健康检查保持公开。
- 2026-07-22：复审发现危险 URL 黑名单仍会漏掉项目写入、配置修改、HTTP Provider probe 和 AI Tools。鉴权改为 default-deny，仅 health、脱敏 config 和 Provider metadata 公开；HTTP 临时 endpoint/Key 必须同源成对提供，禁止把服务器 Key 回退发送到请求地址。
- 2026-07-22：Codex CLI Chat 曾以 `workspace-write` 运行且 raw JSON stdout 会进入 token 流，可能绕过 Diff 审批并重复显示回答。修复为 `read-only` Chat、能力声明 `stream:false`，原始事件只用于最终解析和诊断。
- 2026-07-22：Project Locator 默认允许不存在/损坏项目，GET 列表和 tree 还会自动写 metadata/docs，导致假空项目、缓存目录注册和读取副作用。修复为现有项目必须有匹配 metadata，拒绝项目根/路径组件 symlink；列表只返回只读 candidates，tree 不再创建目录。
- 2026-07-22：隔离 E2E 过去依赖无 Token 匿名 CRUD，无法验证真实 default-deny。Runner 现在每次生成独立随机 Token并注入 API fixture/sessionStorage；并行 mobile fixture 名称加入视口后缀，避免同毫秒同名碰撞。
- 2026-07-22：Draw 面板把图片 API Key 保存到 `localStorage` 并随生成/编辑请求回传，且后端使用客户端 `projectName` 拼接磁盘路径。修复为图片凭证仅由后端 `.env` / appConfig 持有并在公开配置中掩码；全部 Draw 文件与生成接口改用 managed `projectId`，校验 `project.json` 身份并用 `safeJoin` 限制项目边界。
- 2026-07-22：新建项目的页面名称与 `papers/` 下 UUID 目录无法对应，重命名又只改 `project.json.name`，导致磁盘目录、列表修改时间和用户认知长期漂移。修复为引入 Project Locator，生成安全可读目录名并保存 `directoryName`；重命名在项目锁内执行目录迁移、原子元数据提交、409 冲突保护和失败回滚。
- 2026-07-22：项目管理使用 `OPENPRISM_DATA_DIR`，Draw/设置却读取 `OPENPRISM_PROJECTS_DIR` 或 `$HOME/papers`，同一项目可能被不同功能解析到不同根。修复为主变量唯一权威、旧变量仅缺省回退，冲突时显式告警；App Config、项目路由、Draw 和 RAG 统一读取 Project Locator 的实际根。
- 2026-07-22：项目 blob 预览请求不存在的文件时，显式扩展名和无扩展名候选全部失败都会把 `ENOENT` 冒泡成 500，导致预览把“资源缺失”误报为服务器故障。修复为统一返回结构化 404 `{ error: "Project blob not found", path }`，并覆盖两类缺失路径回归测试。
- 2026-07-22：大型静态 Paper Writer Workbench 与正式 React UI 同时无条件公开，用户无法判断哪个是正式入口，原型也可能长期形成第二套产品。修复为原型路由默认 404，仅在 `OPENPRISM_ENABLE_LEGACY_WORKBENCH=true` 时启用；页面增加 Legacy / Prototype 提示和 `/projects` 入口，并建立逐项迁移与弃用清单。
- 2026-07-22：RAG 面板请求的 `/rag/index`、`/rag/search` 后端不存在，且上传已自动索引后 UI 仍要求再次手动索引。修复为补齐路由契约，统一为导入/删除后自动重建索引，并隐藏普通文件树中的 `.openprism`、`.compile` 和 `research_corpus` 运行目录。
- 2026-07-22：刷新编辑器后虽然会话标签仍在，活动会话却丢失；并发切换项目时旧请求还可能覆盖新项目状态。修复为按项目持久化活动会话，失效时回退最近会话，并用项目身份与取消标记隔离迟到恢复请求。
- 2026-07-22：Skills 测试用固定数量上限约束动态目录，`ccf-idea-reviewer` 分类又脱离合法 taxonomy，前端还展示零数量分类。修复为以运行时目录/生成 manifest 验证唯一性和完整性，校正分类元数据，并只渲染有内容的分类。
- 2026-07-22：390×844 下项目表格、中央编辑区和 AI 标签被固定三栏挤出视口，中文环境又缺少 CJK 回退且核心编辑器文案混用英文。修复为项目列表响应式卡片化、工作区 Files/Editor/Assistant 互斥移动视图、文档 lang 同步、CJK 字体栈和核心 locale 契约测试。
- 2026-07-22：新建项目静默选择模板数组第一项，ACL manifest 还声明了不存在的 `main.tex`。修复为空白项目显式默认，ACL 主文件改为 `acl_latex.tex`，模板读取/上传统一验证安全 ID、真实入口文件和 `\\documentclass`。
- 2026-07-22：Tectonic 生成 PDF 但达到六轮重跑上限时 UI 仍显示普通成功，无法区分可用产物与未解析引用风险。修复为解析编译日志并返回结构化成功/警告/失败诊断，前端单独展示“成功但有警告”及诊断代码。
- 2026-07-22：Tectonic 编译过去没有显式受控缓存目录，重复编译的依赖复用依赖宿主机隐式配置，新环境可能反复连接 bundle 服务。修复为将 `XDG_CACHE_HOME` 固定到项目 `.compile/tectonic-cache`；run 输出仍按 UUID 隔离，只有本次生成 PDF 才写入稳定输出。回归覆盖两次调用缓存路径稳定、参数一致以及无 PDF 不误缓存成功。
- 2026-07-22：HTML LaTeX 预览看起来像最终排版，却会残留未知命令、伪造 `[ref]` 和破损图片。修复为明确区分 Quick approximate preview 与 Final PDF，对引用、未知命令和资源失败提供结构化、可恢复的降级占位。
- 2026-07-22：EditorPage 首屏打包 Draw、RAG、审稿、终端、全部 CodeMirror 语言和预览引擎，初始 chunk 约 1.35 MB。修复为按面板/编辑器/终端懒加载、按文件类型加载编辑扩展，并用 500 KiB 构建预算阻止回归；当前 EditorPage chunk 为约 126 KiB。
- 2026-07-22：项目 Playwright 测试依赖仓库已有 `torq` 项目、过期中文文案和共享 describe 状态，无法作为发布门禁。修复为随机端口和临时数据根的隔离 runner，每项测试自建/清理项目，并提供 unit、integration、E2E 与 full-check 统一入口。
- 2026-07-22：Paper Writer 实际依赖由 `app/package-lock.json` 管理，但根目录仍声明 pnpm、保留失效的 pnpm 锁文件，且根 `start` 绕过 `app/.env`，导致安装、启动和发布门禁入口互相矛盾。修复为以 npm 作为唯一包管理器，根脚本完整代理 install/dev/build/start/preview/test/check 到 `app/` 并保留失败码，删除过时 pnpm 锁文件，同时用工具链契约测试锁定 README、环境变量和脚本一致性。
- 2026-07-22：设置页过去缺少统一能力状态，用户只能从 `/api/health`、Provider 连接测试和具体功能报错中拼凑环境问题。新增受 Token 保护的 `/api/capabilities` 与“系统能力”Tab，统一报告鉴权、项目数据根、Provider、TeX/Pandoc、PDF/OCR、Skills、tmux 和外部检索；探测逐项隔离、脱敏和缓存，不触发登录、联网或模型调用。
- 2026-07-22：能力页 E2E 曾硬编码测试 Token，且项目 CRUD 依赖无 Token 匿名写入。Runner 现删除宿主 Token、每次生成独立随机 Token并注入后端/API fixture/sessionStorage；显式 `OPENPRISM_E2E_API_TOKEN` 仅用于可复现调试。无 Token fail-closed 改由独立认证单测覆盖。
- 2026-07-22：Paper RAG 索引原先直接覆盖正式 JSON，进程中断或替换失败可能破坏索引，损坏 JSON 也会让搜索持续抛错；同项目并发重建没有顺序保证。修复为项目级索引串行锁、同目录临时文件原子替换、失败保留旧索引，并在 JSON 损坏或结构非法时隔离为 `.corrupt-*` 后从当前 corpus 自动重建。回归覆盖损坏恢复、替换失败和并发新增资料。
- 2026-07-22：模板覆盖原先先递归删除旧目录，再移动 staging 并写 manifest；任一步失败都可能丢失旧模板或让目录与 manifest 不一致，并发上传还可能互相覆盖。修复为 manifest 级串行提交、旧目录 backup rename、staging 安装、manifest 原子替换和失败回滚；回归注入 manifest rename 失败并验证旧模板/旧 manifest 保持不变，同时覆盖并发提交配对一致性。
- 2026-07-22：HTTP Provider 临时 endpoint 虽已不再混用服务器 Key，但仍可指向 loopback、私网、link-local 或云元数据地址，自动重定向也可能绕过首跳检查。修复为请求 endpoint 的协议/URL 凭据/DNS 全地址校验、私网和保留地址拒绝、逐跳重定向复核、三跳上限与短超时；管理员配置的 LAN endpoint 保持可用，临时内网网关只能通过服务器 `OPENPRISM_PROVIDER_ALLOWED_HOSTS` 明确放行。
- 2026-07-22：系统能力版本探针超时后只对直接子进程发送 SIGTERM，未创建独立进程组，也没有 SIGKILL 升级，可能残留派生进程。修复为与 CLI Provider 共用进程树终止器，能力探针使用 detached process group，超时先终止整组并在 1.5 秒后强制清理；fake process 回归验证调用链和启动参数。
- 2026-07-22：隔离测试与整改文档可能已经对应新源码，但正式进程仍运行旧后端，系统又没有 build/schema 握手，导致新前端静默连接旧 API。修复为构建时生成共享 build ID、后端启动时固定读取、health 返回 build/schema/启动时间、前端加载前强制校验，并新增独立 `/api/ready`；Playwright 回归模拟 stale backend 并确认项目工作区被阻断。
- 2026-07-22：`GET /api/config` 虽然掩码 API Key，仍匿名暴露内网模型 endpoint、模型名、CA 证书路径和项目绝对目录。修复为从公开 allowlist 移除 config；未配置 Token 时返回 503，配置后无 Bearer 返回 401，只有认证请求可读取掩码配置。
- 2026-07-22：中文论文工作区的 Center、Chat、Draw、Review、Citation、Anti-AI 和 Pipeline 主面板仍直接渲染大量英文按钮、空状态、运行状态和错误文案；原有测试只比较中英文 locale 键集合，无法发现 JSX 根本没有调用翻译函数。修复为七个主面板统一接入 `react-i18next`，补齐静态文案与运行时枚举翻译，并新增 `primaryPanelsI18n.test.mjs` 组件契约和隔离 Playwright 点击流，实际验证中文项目编辑器逐面板显示中文。
- 2026-07-22：`GET /api/projects` 已能发现没有 `project.json` 的论文目录，但前端丢弃 `candidates`，用户在 `papers` 中看到目录却无法在项目页打开；项目列表也只展示显示名，稳定 ID 与真实目录不可见。修复为候选目录只读预览、显式确认注册、单层目录/符号链接/重复注册防护和原子 metadata 写入；项目页展示并可复制项目 ID 与存储目录。隔离 Playwright 真实创建 metadata-free 目录，验证发现、预览、注册、目录不移动和列表身份展示。
- 2026-07-22：LaTeX 与 Markdown 编译会无条件把当前用户 `HOME/bin`、两个 Conda 目录和特定开发者 `/data01/home/...` 注入 `PATH` / `LD_LIBRARY_PATH`，换用户或换机器后可能加载错误工具和动态库，且 Pandoc 写死 `HOME/bin/tectonic`。修复为共享可测试的编译环境契约：默认原样继承宿主环境，只对显式 `OPENPRISM_COMPILE_PATH` / `OPENPRISM_COMPILE_LD_LIBRARY_PATH` 做去重前置，`OPENPRISM_TECTONIC_BINARY` 同时控制直接编译与 Pandoc；回归锁定空配置不变、显式路径顺序、无空项和源码无开发机路径。
- 2026-07-22：Skill UI enrichment 会无条件附加值为 `undefined` 的 `requirements`、`sideEffects`、`costClass`，readiness 又用属性是否存在判断 manifest 是否声明元数据，导致 123 个旧 Skill 全部被误报为 `ready`。修复为仅投影真实声明字段，并让 readiness 按非 `undefined` 值判断；新增回归覆盖 undefined UI projection、路由 dry-run 和真实目录统计，当前 123 个未声明 Skill 均保守显示为 `degraded`。
- 2026-07-22：Skill 管理过去只能从活动对话内的选择器进入，空项目用户必须先创建会话；搜索后“全部展开”又只比较 Set 大小，隐藏分类与可见分类数量相同会错误执行折叠。修复为空对话增加直接管理入口，并按可见分类 ID membership 计算展开状态；隔离 Playwright 验证 unavailable 不可激活、degraded 静态检查不触发 AI/Provider/Pipeline 请求。
- 2026-07-22：Paper RAG 过去只显示资料和搜索分数，用户无法判断索引是否缺失、损坏、正在重建，不能区分关键词检索与语义向量检索，也看不到具体哪个文件解析失败或没有 chunks。修复为索引写入 generation、确定性 SHA-256 fingerprint 和 `local-keyword-overlap` 检索声明，新增严格只读 health API 与前端健康卡；GET health 不会偷偷隔离或重建损坏索引，显式修复后 generation 改变、语料不变时 fingerprint 稳定。单元、路由、组件契约和隔离 Playwright 覆盖完整状态。
- 2026-07-22：核心 UI 在 `App.css` 顶部远程导入 Google Fonts，受限网络下每次打开页面都会产生失败请求、控制台噪声、首屏不确定性和第三方访问。修复为删除远程 `@import`，保留系统本地 Inter/Source Serif/JetBrains Mono 候选及 Noto CJK、苹方、微软雅黑、宋体、SF Mono 等回退；静态测试禁止重新引入 Google Fonts，隔离 Playwright 验证项目页没有远程字体请求。
- 2026-07-22：Provider 设置过去直接展示 Server Token、API Key、endpoint、CLI 和连接测试字段，首次用户容易把服务器访问令牌当成模型 Key，或误以为选择 Codex/Copilot 后即可修改论文。修复为四步配置向导，动态展示服务解锁、运行方式、HTTP/CLI 凭据和连接验证状态，并明确 CLI 只读 Chat 与后续可审查 Task Agent 的边界；组件契约和隔离 Playwright 覆盖中文说明与 Codex CLI 切换。
- 2026-07-22：Provider 设置的 Server Token、Provider、API 地址、API Key 和 Model 虽有可见 `<label>`，但没有 `htmlFor/id` 关联，读屏和 Playwright 无法按字段名定位控件。修复为五组表单控件建立稳定可访问名称，Codex CLI 切换的隔离 Playwright 通过真实 label 操作验证。
- 2026-07-22：前端源码目录长期跟踪 `SkillsSelector.tsx.bak`，该文件比当前组件多 310 行、无人引用且与现实现有大量差异，增加全文搜索、代码审查和发布归因噪声。确认无运行时或文档消费者后删除，并增加源码 artifact 测试和 `.gitignore` 规则阻止 `.bak/.orig/~` 重新进入源码树。
- 2026-07-22：仓库同时跟踪 `app/test-results/.last-run.json`（passed）和根 `test-results/.last-run.json`（failed），两个本机 Playwright 状态互相矛盾且没有运行时消费者，容易被误当成当前发布证据。删除两个状态文件并忽略 `test-results/`、`playwright-report/`；隔离 runner 已将真实输出放入每次独立临时目录。
- 2026-07-22：依赖审计存在 2 moderate、3 high、2 critical 共 7 项；其中 tar、React Router、fast-uri、brace-expansion 位于生产安装/运行路径，shell-quote 与 Vitest/Vite 位于开发路径。使用现有 semver 范围内的定向 `npm update` 升级到 tar 7.5.21、React Router 6.30.4、fast-uri 3.1.4、brace-expansion 5.0.7、shell-quote 1.10.0、Vite 8.1.5，未使用 force；整改后 `npm audit` 为 0，并增加 lockfile 安全下限测试。
- 2026-07-22：Codex/Claude/Copilot 虽已能作为 Provider，但只有只读 Chat，用户无法让 CLI 在安全边界内修改论文并审查结果。新增独立 CLI Task Agent：项目外 base/work 快照、固定 Provider 文件权限、added/modified/deleted Diff、waiting-review、显式 Accept/Reject、完整 source drift 409、持久化 rollback journal、进程树取消和跨重启历史；Chat 的 read-only 参数保持不变。回归位于 `app/tests/cliTaskAgent.test.mjs`、CLI Task 路由测试、前端契约和 `app/tests/e2e/cli-task-agent.spec.ts`。
- 2026-07-22：CLI Task Agent 接受删除文件后，`GET /api/projects/:id/file` 读取不存在文件会把 `ENOENT` 泛化为 500，浏览器无法区分“文件已删除”和服务故障。文件读取路由现在对缺失文件返回 404 `Project file not found`，隔离 Playwright 在 Accept 后验证删除语义。
- 2026-07-22：前端为满足 500 KiB chunk 预算，曾对 Markdown/unified 与整个 CodeMirror 模块图使用 Rolldown `maxSize` 机械切片；生产构建虽成功且静态资源全部返回 200，真实 Chromium 却在入口阶段抛出 `r is not a function`，打开编辑器后又抛出 `r is not a constructor`，造成项目页全白或编辑器 ErrorBoundary。修复为保留 Markdown/LaTeX 组件级动态加载，Markdown renderer 使用单一稳定组，CodeMirror 按 `view-state`、`language`、`features` 包边界分组，禁止任意尺寸切片；同步补齐生产预览 E2E 和动态 import 契约。最终所有 JS chunk 小于 500 KiB，相关单测 15/15、核心隔离 Playwright 19/19 通过。
- 2026-07-22：HTTP Provider endpoint 原先只在请求前解析并检查 DNS，随后交给全局 fetch 再次解析；攻击者可让第一次返回公网 IP、连接时返回本机/私网 IP形成 DNS rebinding，Node 24 的 `NODE_USE_ENV_PROXY` 全局 Agent还可能把 hostname交给代理重新解析。修复为返回规范化解析地址，生成请求专用 pinned lookup，并用独立 direct `http/https.Agent` 将同一地址集合注入真实 socket；HTTPS 保留原 hostname 的 SNI/证书校验，每个 redirect 重新校验和固定。新增 fake-transport 与真实本地 socket 测试，证明一次请求只发生一次 DNS 解析。
- 2026-07-22：`paperWorkbenchService.js` 同时包含写作路由和约 350 行 OCR/PDF/Playwright 运行环境 Gate 逻辑，任何生产验收文案调整都迫使维护者在 8000 行主模块中操作。先修复一条会把 Skill 显示名锁死为旧文案的脆弱测试，再把 runtime environment 子域原样抽到 `paperWorkbenchRuntimeEnvironment.js`；状态、命令包、JSON shape 和 API 行为不变，主模块由 8042 行降至约 7687 行，相关 Node/Vitest 回归 27/27 通过。
- 2026-07-22：真实浏览器未预注入全局 Authorization header 时，用户在设置页应用正确服务器 Token 后，设置弹窗会恢复，但父页面项目和模板仍保持首次 401 后的空状态，必须整页刷新。根因是 `SettingsModal` 只重载自身配置，没有通知 `ProjectPage`。修复为 Token 成功应用后回调父页面并并行重载项目、候选目录和模板；清除 Token 时同步清空已加载的受保护元数据。隔离 Playwright `real-browser-auth.spec.ts` 已锁定无需刷新恢复项目列表。
- 2026-07-22：服务 Token 只保存在 sessionStorage 时，普通 API fetch 正常，但项目图片 `<img>`、PDF `<embed>` 和直接下载 `<a>` 不会自动携带 Bearer Token，导致图片 401、PDF 不可用和下载取消。修复为统一认证 Blob 资源层：先用同源认证 fetch 获取内容，再创建和回收 object URL；Token 不进入查询参数。真实 Playwright 已验证 SVG `naturalWidth > 0` 且下载成功。
- 2026-07-22：Provider 设置内容增多后，默认桌面 E2E 视口中弹窗总高度超过 viewport，居中布局会把顶部关闭按钮推到视口之外。修复为设置弹窗限制 `100dvh - 32px` 最大高度，标题/Tab/操作区固定，正文独立滚动；真实 Token E2E 已验证关闭按钮可点击并继续进入项目编辑器。
- 2026-07-22：LaTeX 快速预览模板仍通过 jsDelivr 运行时加载 Computer Modern 字体 CSS，导致主界面 Google Fonts 已移除后，真实 `.tex` 预览仍在受限网络产生 `ERR_EMPTY_RESPONSE`。修复为删除该远程 `@import`，使用本地 KaTeX 资源和系统字体栈；离线静态测试扩展到完整 LaTeX 组件，隔离 Playwright 实际打开 `.tex` 并断言没有 Google Fonts/jsDelivr 请求。
- 2026-07-22：Draw.io iframe 地址硬编码为 diagrams.net，网络失败后永久显示 Loading；消息来源只用字符串 `includes` 判断，发送全部使用 `postMessage('*')`，且没有离线恢复。修复为服务器配置 `OPENPRISM_DRAWIO_EMBED_URL`、HTTP(S) 校验、当前 iframe source + 精确 origin 双校验和精确 target origin；6 秒未就绪或 iframe error 后显示重试、外部数据边界、自托管提示、离线 XML 编辑与下载。阻断 diagrams.net 的隔离 Playwright 已完成红绿验证。
- 2026-07-22：Draw.io 首版离线 XML 编辑入口只在错误卡上提供“下载 XML”；进入源码编辑后错误卡消失，下载动作也随之不可达。修复为离线源码模式工具栏持续保留“下载 XML”和“重试 Draw.io”，真实 E2E 已验证编辑源码后仍可见恢复动作。
- 2026-07-22：运行时源码、MCP fallback 和启动脚本把当前工作站 `10.30.0.22` 写成默认地址，换机器、换网段或 CI 时会产生错误代理/发现地址。修复为 Vite 默认代理到 `127.0.0.1:<OPENPRISM_PORT>`，启动和 MCP fallback 使用可配置 `OPENPRISM_PUBLIC_HOST`，后端监听仍保持 `0.0.0.0`；`operationalHygiene.test.mjs` 锁定源码不再包含机器 IP。
- 2026-07-22：AI、对话、文件列表和 Draw 面板无条件把 system prompt、用户消息片段、工具结果、项目绝对路径和文件样例写入控制台。修复为删除正文/路径调试输出，仅保留非敏感计数型后端 debug 日志和面向用户的错误状态；运维卫生测试锁定敏感日志标签与路径输出不再回归。
- 2026-07-22：模板磁盘中已有 arXiv 和 ICLR 2026，但 manifest 未声明，运行时只能用目录名自动生成 `arxiv`、`iclr2026__1_` 等低质量元数据；API 还返回 thesis/resume/presentation/book/letter/report 等零模板分类，并与前端自带“全部”筛选重复。修复为所有 bundled LaTeX 模板必须进入 committed manifest，补齐 arXiv/ICLR 用户文案和真实入口文件，API 只返回有模板的业务分类且不返回 synthetic `all`；模板契约测试扫描磁盘与 manifest 防止再次漂移。
- 2026-07-22：Skills `lastRun` 虽已写入持久文件，但产品调用点只覆盖 package tests，真实模型请求应用 Skill 后不会留下运行记录，文档还错误声称 store 是 process-local。修复为 AI stream/send 对项目、章节和会话实际应用的 Skill 写入脱敏 `model-guided-execution` 结果，记录耗时和可用 provenance/相对产物/副作用，不记录 Prompt、响应正文、绝对路径或凭据；文档同步更正持久化边界。
- 2026-07-22：RAG 外部检索把单来源超时/HTTP 错误捕获后直接返回空数组，用户无法区分“没有匹配论文”和“服务失败”；Semantic Scholar 引用数、arXiv 固定 0.5、Crossref/OpenAlex 原生 score 又被直接混排。修复为返回逐来源状态/耗时/数量/脱敏错误码，保留 `native_score` 但用 `source-query-rank` 生成可比较的 `normalized_score`；UI 显示来源状态卡和两类分数，隔离 Playwright 锁定部分失败场景。
- 2026-07-22：默认 Playwright 开启 30 worker 时，项目注册、RAG、会话、移动布局和 Draw.io 用例因共享隔离后端/数据根出现 7 条非稳定失败；单 worker 同套测试 30/30 通过。修复为 stateful isolated runner 默认串行，并新增 `e2eIsolationContract.test.mjs`，防止未来误开并行。
- 2026-07-22：Project Locator 每次通过稳定 ID 查找可扫描数据根全部目录，项目数量增加后产生 O(N) metadata 读取。新增经 lstat + `project.json.id` 双重校验的缓存，缓存失效时自动回退扫描；新增重复查找和手工移动恢复测试。
- 2026-07-22：Skills 运行账本原先用 `success` 同时暗示 Provider 请求完成和任务目标成功。新增 `outcome`、`verificationStatus`、`objectiveStatus`，AI/包测试记录不再伪装成科学任务已验证，前端显示明确边界。
- 2026-07-22：Skill 管理创建路由误把用户 YAML 写入内置目录，且丢弃 categories/中文元数据；删除路由也能无条件删除内置 Skill，Provider 设置还允许未验证配置直接保存。修复为数据根 `.skills/` 自定义目录、slug/重复校验、完整元数据持久化、内置删除保护、删除确认/错误反馈，以及 Provider 当前配置必须连接验证后才能保存；新增后端路由、UI 契约和配置保存回归测试。
- 2026-07-22：CLI Task Provider 列表原先只返回名称，界面默认选中 Codex，即使 CLI 未安装或未登录也能点击创建，用户只能等任务失败后才知道原因。修复为受控只读探针返回 installed/authenticated/authStatus/available/unavailableReason，路由正确 await 异步探针；前端优先选择已验证可用项、禁用不可用选项和创建按钮，并展示可执行的修复原因。
- 2026-07-22：Provider 设置页的通用 `/api/providers` 列表仍把“服务器配置了访问 Token”误当成三种 CLI 全部可用，导致未安装的 Claude CLI 也显示为可选。修复为列表端并行运行固定、非推理的安装/认证探针，只有安装且认证被明确证明时才返回 `available: true`；设置下拉框禁用未安装、未认证和认证未知的 CLI，并展示不可用原因。新增 registry、route 和 UI 契约红绿灯测试。
- 2026-07-22：正式 LAN 中 Provider readiness 已确认 Claude CLI 安装且认证，但系统能力页却显示“可执行文件未找到”。根因是能力版本探针只传 PATH/LANG，遗漏 HOME，导致依赖用户目录解析的 CLI `--version` 非零退出。修复为版本探针继承最小非秘密 HOME/XDG/证书环境，继续排除 Token/Key/密码；`capabilityService.test.mjs` 先红后绿锁定 HOME 契约。
- 2026-07-23：服务重启后，未在当前标签页保存服务器 Token 的用户会同时收到项目和模板 401；两个并发错误互相覆盖，最终页面显示“模板加载失败: Authentication required”和空项目列表，用户不知道需要解锁。修复为 API 错误保留 HTTP status/code，项目页把 401/403 归一化为缺失/无效令牌状态，展示可操作解锁卡并隐藏原始认证错误；应用正确 Token 后无需刷新恢复项目和模板。隔离真实浏览器测试先红后绿，并继续验证受保护图片和下载。
- 2026-07-23：无令牌时从项目首页打开 Provider 设置会产生未捕获的 `Authentication required` 页面异常。根因是设置页在把并发请求交给 `Promise.all` 前先等待了另一个请求，使先启动的配置请求 401 一度没有拒绝处理器。修复为同步创建配置与 Provider 请求后统一等待，并让项目/模板解锁刷新统一收口鉴权错误；真实 Playwright 覆盖无令牌打开设置、应用令牌、项目恢复、受保护资源和零 `pageerror`。
- 2026-07-23：项目首页默认隐藏 4 个已归档工程，导致用户认为 `papers/` 下项目丢失；服务器解锁又嵌在 Provider 四步向导中，编辑器只有 Modified 状态而没有明确保存入口，使无模型手动编辑看起来不可用。修复为默认显示全部非回收站工程、归档项目显式标记，锁定页直接输入服务器令牌，并增加独立保存按钮和 Ctrl/Cmd+S；项目写回不依赖模型配置。隔离 Playwright 覆盖已归档工程默认可见、无模型编辑保存和独立解锁流程。
- 2026-07-23：`papers/moe_prune` 已有合法 `project.json` 且 API 返回 `id: moe_prune`，但列表主名称显示为长论文标题 SNAP，搜索又只匹配显示名称，导致用户认为 MoE-Prune 文件夹没有映射。修复为醒目展示真实“工程文件夹”，搜索同时覆盖显示名、项目 ID 和目录名，并归一化大小写、`-`、`_` 与空格；不迁移或重写现有论文目录。
- 2026-07-23：项目侧栏只有“全部项目/已归档/回收站”，默认全部视图与未归档状态没有独立入口，用户无法快速区分正常项目、归档项目和已删除项目。修复为显式四分类：全部项目、未归档、已归档、已删除；计数和过滤分别使用 `all/active/archived/trash`，Playwright 覆盖项目从正常到归档再到删除时的跨视图可见性。
- 2026-07-24：正式服务没有通过 `OPENPRISM_COMPILE_PATH` 暴露主机已安装的 TinyTeX，自动发现只看到无法加载 `libgraphite2.so.3` 的 Tectonic，导致“编译最终 PDF”返回 `No PDF generated`。修复为在被 Git 忽略的本机 `.env` 显式配置 TinyTeX `bin/x86_64-linux`，重启后通过真实浏览器打开 `moe_prune/main.tex` 并点击“编译”；四阶段 LaTeX/BibTeX 编译退出码为 0，浏览器嵌入和认证下载均取得新的 19 页 `%PDF-1.7` 文件（1,077,293 字节）。
- 2026-07-24：最终 PDF 虽已编译成功，中央预览仍直接把受保护的 `/api/projects/.../blob` URL 交给原生 `<embed>` 和 `window.open`；浏览器原生资源请求不会读取 sessionStorage Bearer Token，因此页面显示 `{"error":"Authentication required"}`。修复为复用认证 Blob 组件：先由应用 `fetch` 携带 Token 获取 PDF，再以短生命周期 `blob:` URL 嵌入或打开新标签页。Playwright 真实点击 `moe_prune` 的“编译”后验证 PDF 请求带 Bearer、HTTP 200、`application/pdf`、1,077,293 字节、`%PDF-1.7`，页面嵌入区域可见且无鉴权错误。
- 2026-07-24：OpenAI-compatible 设置中，临时测试 `10.x` 地址会被 Provider SSRF 策略拒绝，“加载模型”又只读取后端旧配置，形成“测试不通过→不能保存→模型列表继续请求旧地址”的死锁；重启后空 Key 输入框还会把已配置凭证覆盖为空。修复为给受信任 LAN 模型地址配置精确 allowlist，统一正式运行配置；新增受保护的临时模型列表 POST 路由，前端在输入新 Key 时使用当前表单连接，在 endpoint 未变化时安全复用服务器凭证，变更 endpoint 后明确要求重输 Key。真实接口、Playwright 和 `moe_prune` 正式 AI Chat/Tools 流程验证 `gpt-5.6-sol`：连接 authenticated、加载 10 个模型、正文分析成功、`read_references` 工具返回 29 条 BibTeX。
- 2026-07-24：Draw 生图设置原先只读并要求手改 `.env`，路由又在启动时固化 Base URL/API Key/model，导致前端即使保存也无法即时生效；生成 Prompt 只读且未生成前隐藏生图步骤，最终请求还会自动拼接论文正文。另一个真实兼容性问题是当前 OpenAI-compatible 生图接口返回 `b64_json`，旧实现只接受 URL，因而上游 HTTP 200 仍被判失败。修复为前端可保存独立生图配置或复用 LLM 凭据、后端逐请求解析当前配置、同时接收 URL/Base64 图片、最终 Prompt 始终可编辑且精确传递。回归覆盖共享凭据、Base64、项目边界、凭据不入浏览器存储和 Prompt 不追加正文。
