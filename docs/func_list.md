# Coding Kanban 功能清单

本文档按当前仓库实现整理功能范围，作为后续新增功能时必须同步维护的清单。历史计划文档仅作背景，本清单以当前代码、现有接口和已经落地的交互为准。

## Paper Agent 安全边界（2026-07-22）

- Paper Agent 后端未配置 `OPENPRISM_API_TOKEN` 时，只保留存活/就绪检查和 Provider 元数据；`/api/config`、项目读写、模型调用、配置修改、代码执行与终端全部返回 503。配置 Token 后，除公开端点外统一校验精确的 Bearer Token。
- Draw 图片 API 的 Key、Base URL 和模型由后端 `.env` / appConfig 托管；认证后的配置响应仅返回掩码与 `draw_image_api_key_set` 状态，浏览器不持久化或回传图片 API Key。
- Draw 的生成、编辑、图片读取、下载、列表和上传接口只接受 managed `projectId`。后端通过 `getProjectRoot` 与 `project.json.id` 双重确认项目身份，并通过 `safeJoin` 把所有文件访问限制在项目根目录内。

## Paper Agent 审计整改能力（2026-07-22）

- 仓库提供根级 `npm run typecheck`，执行前端真实 `tsc --noEmit`；`npm run check` 固定按“类型检查 → 生产构建 → 单元测试”运行，任一阶段失败都会保留非零退出码。
- 生产构建生成前后端共享 build ID；前端在渲染工作区前校验 `/api/health` 中的 build ID 和 API schema，不一致时阻断操作。`/api/ready` 独立验证项目数据根和模板 manifest。
- 设置页提供“系统能力”只读诊断 Tab；受保护的 `/api/capabilities` 统一汇总鉴权模式、Project Locator 数据根、5 个 Provider、TeX/Pandoc、PDF/OCR、Skills、tmux 和外部检索配置。结果使用稳定四态 schema、逐项原因和检测时间，默认缓存且刷新也不会安装依赖、登录 CLI、联网或调用模型。
- LLM 执行层提供统一 AgentProvider registry，正式支持 OpenAI-compatible API、Anthropic API、Codex CLI、Claude Code CLI 和 GitHub Copilot CLI；每个 Provider 暴露 metadata/capabilities、probe、模型列表能力声明、invoke/stream、cancel 和 provenance。设置页支持 Provider 选择、CLI 安装/认证状态测试、模型加载或手填，以及保存/测试的 loading、success、error 状态。
- CLI Provider 的 executable 与参数数组完全由后端固定，工作目录只能由 managed `projectId` 经 Project Locator 解析；子进程使用最小环境白名单、超时/Abort、进程树终止和 stdout/stderr/exit status 记录。未配置 `OPENPRISM_API_TOKEN` 时 CLI probe/invoke/cancel fail-closed，前端显示不可用。
- 论文工作区新增独立“任务”Tab，为 Codex CLI、Claude Code CLI 和 GitHub Copilot CLI 提供可审查的文件修改任务；普通 Chat 继续使用只读参数，不会因 Task Agent 上线而获得写权限。
- CLI Task Agent 使用 managed `projectId` 在 `<OPENPRISM_DATA_DIR>/.openprism-cli-tasks` 创建项目外 `base/work` 快照，拒绝 symlink 和 `project.json` 修改；CLI 结束后展示 added/modified/deleted 文件、文本 unified diff、Provider/模型/版本/参数摘要/exit code。用户必须勾选已审查全部文件才能 Accept，也可 Reject 或取消运行中的进程树。
- CLI Task Accept 会校验完整 source fingerprint；原项目在任务期间发生任何漂移均返回 409。应用过程持久化 rollback journal，中途失败恢复已经移动或安装的文件；Reject 只记录决策，原项目字节不变。任务历史可跨页面刷新和后端重启恢复。
- 前端服务访问令牌只保存在 `sessionStorage`，同源 `/api/` fetch 会统一附加 Bearer；Terminal、文件 watcher 和 EventSource 等浏览器不能自定义握手头的通道使用受限 query-token 兼容。保存 Provider 配置必须等待后端成功，失败时设置弹窗保持打开。
- 设置页成功应用服务器访问令牌后，会立即重新加载父页面的项目列表、候选目录和模板，不要求用户刷新页面；清除令牌时同步清空浏览器内已加载的受保护项目元数据。设置弹窗受当前视口高度约束，标题、关闭按钮和操作区保持可达，长内容在弹窗正文内部滚动。
- 项目图片、PDF 和文件下载统一使用认证 fetch 获取 Blob，再通过短生命周期 object URL 预览或下载；Bearer Token 不写入资源 URL，资源切换和组件卸载时回收 object URL。
- 正式 React 论文工作区的章节、AI、Review、Anti-AI、Citation、Pipeline、文件 watcher 和 Terminal 主路径统一发送 managed `projectId`，文件操作使用项目内 `relativePath`。旧 `__paper_agent__:<id>` marker 仅作为带弃用响应头和日志的兼容输入；外部 Code/MCP 绝对路径能力保持独立受控，不与 managed 项目 API 混用。
- RAG 面板采用“导入即自动重建索引”的单一语义；后端同时提供受测的 `/rag/index` 与 `/rag/search` 契约，搜索结果保留来源路径与证据片段。项目普通文件树默认隐藏 `.openprism`、`.compile` 和 `research_corpus`，证据资料统一从 RAG 面板管理。
- 编辑器会按项目恢复最后活动会话；保存的会话失效时回退到最近更新的有效会话，并隔离并发项目切换产生的迟到请求。
- Skills 数量和分类以运行时目录及生成 manifest 为准，不再用固定上限断言；分类不合法会在测试中失败，前端不会展示数量为零的空分类。
- 390×844 等窄屏下，项目列表改为可操作的响应式布局；论文工作区提供 Files / Editor / Assistant 三个互斥移动视图。文档语言随 i18n 切换，字体栈包含本地 CJK 回退；Center、Chat、Draw、Review、Citation、Anti-AI 和 Pipeline 主面板的核心按钮、空状态、错误及运行时状态均通过中英文 locale 管理，并由静态契约与隔离 Playwright 逐面板验收。
- 新建项目默认明确选择“空白项目”，不会再静默套用 manifest 第一项模板。模板 manifest 的 `mainFile` 必须真实存在，上传模板会从含 `\\documentclass` 的 TeX 文件中检测入口，并拒绝未知或不安全模板 ID。
- 编译返回结构化 `success` / `warning` / `failed` 诊断；产生 PDF 但达到 Tectonic 六轮上限时显示“成功但有警告”，不再伪装成无条件成功。
- LaTeX 缺包自动安装默认关闭：普通单文件/全文编译不会执行 `tlmgr search` 或 `tlmgr install`。只有调用方在本次编译请求中显式发送布尔值 `allowPackageInstall: true` 才允许最多受限次数的缺包查找、安装和重试；字符串 `"true"`、数字或缺省值均不授权。当前 UI 默认调用不发送该字段，因此保持 fail-closed。
- Tectonic 在同一项目内持久复用 `.compile/tectonic-cache` 依赖缓存；每次运行仍使用隔离输出目录，只有本次真实生成 PDF 才更新稳定预览，避免旧产物掩盖失败。
- 编译工具链默认原样继承服务进程的 `PATH` / `LD_LIBRARY_PATH`，不再猜测用户 HOME、Conda 或其他主机目录；非标准 TeX/Pandoc 路径、动态库路径和 Tectonic executable 分别通过 `OPENPRISM_COMPILE_PATH`、`OPENPRISM_COMPILE_LD_LIBRARY_PATH`、`OPENPRISM_TECTONIC_BINARY` 显式配置，并同时作用于直接 LaTeX 与 Markdown/Pandoc 编译。
- LaTeX HTML 区明确标为 Quick approximate preview，无法解析的引用、命令和图片使用结构化降级占位；Final PDF 只代表真实 LaTeX 编译结果。
- LaTeX 快速预览不再运行时请求 Google Fonts、jsDelivr 或其他远程字体样式表，使用随构建发布的 KaTeX 资源和系统字体回退；静态契约与打开真实 `.tex` 文件的隔离 Playwright 同时禁止远程字体/CDN 请求。
- Draw.io 嵌入地址由服务器 `OPENPRISM_DRAWIO_EMBED_URL` 配置，浏览器只接受当前 iframe 的精确 origin，并以同一精确 origin 发送消息。外部编辑器在 6 秒内未就绪或加载失败时，工作区显示错误、重试、自托管提示、离线 XML 编辑和 XML 下载，不再永久停留在 Loading。
- 编辑器路由按需加载 Draw、RAG、Review、Citations、Pipeline、Anti-AI、Terminal、编辑器与预览引擎；Vite 对 EditorPage 初始 chunk 设置 500 KiB 硬预算。
- 项目 E2E 通过独立临时 `OPENPRISM_DATA_DIR`、随机端口和测试自建项目运行，结束后统一清理。`test:unit`、`test:integration`、`test:e2e`、`check`、`check:full` 构成仓库发布验证入口。

## 1. 会话看板与聚焦工作流

- 宫格展示未隐藏的会话卡片，显示名称、状态、Agent 类型、主机、工作目录和轻量终端文本预览。
- 支持按服务器、Agent 类型、tmux 类别、目录关键字筛选。
- 支持隐藏、恢复、删除、重命名、关闭/脱离、终止 tmux、复制 tmux attach 命令。
- 宫格筛选行在卡片上方展示小号“等待输入 / 运行中”统计徽标，位置紧邻已隐藏会话入口。
- 双击卡片进入聚焦视图，在主终端直接继续输入。
- 聚焦视图支持单屏、左右双屏、上下双屏、左中右三屏、四屏、六屏、八屏终端监控模式；多窗格只用于同时观察，键盘输入只发送到带高亮边框和“当前输入”醒目角标的一个窗格，不支持广播输入。
- 聚焦视图多屏模式下，仅当前输入窗格的标题栏支持右键菜单，可执行单屏展示、关闭看板展示该窗口或彻底删除该终端；“关闭看板展示该窗口”会从当前窗格移除该会话，并优先用右侧“其他会话”的第一个会话补位；进入单屏展示后，同一右键菜单首项会替换为“还原多屏展示”，恢复进入单屏前的窗格布局；终端内容区和非选中窗格不触发该自定义菜单。
- 聚焦视图右侧“其他会话”卡片支持右键菜单，可执行关闭看板展示该窗口或彻底删除该终端；关闭看板展示会隐藏该会话但不终止底层终端。
- 聚焦视图支持鼠标拖拽排布：右侧其他会话卡片可拖入任意分屏窗格，分屏窗格头部可相互拖动并交换会话位置。
- 聚焦视图保留其他会话上下文，右侧会话侧栏使用轻量终端文本预览并支持折叠。

## 2. 顶栏入口与快捷键

- 顶栏按“端切换品牌 / 主操作 / 当前会话工具 / 工具菜单 / 资源调节 / 窗口控制”分组：桌面标题显示为“电脑端 Coding Kanban”，旁边提供“手机端 Coding Kanban”切换入口；常驻新建会话、扫描菜单、文件、VS Code、工具菜单、资源调节、全屏和折叠入口；扫描 tmux 与扫描会话收纳到“扫描”，操作提示收纳到“工具”。
- 菜单栏折叠状态持久化到本地存储。
- 开发入口默认使用 HTTPS 协议；`restart-dev.sh` 输出局域网可访问的 HTTPS 前端地址，并自动准备开发证书。
- 顶栏常驻“终端字号”滑杆，支持在 10px 到 24px 之间拖动调整所有内置 xterm 终端字号，并持久化到本地存储。
- 顶栏“工具”菜单提供 Agent 完成通知开关；浏览器授权后，已知会话从 `running` 进入 `idle` 或 `exited` 时会发送系统通知，提示当前看板任务已经完成并需要查看。
- 顶栏“资源调节”菜单提供终端预览模式切换，可在默认轻量预览和旧版完整小终端预览之间切换，并收纳 VS Code 省内存/保持状态、释放 VS Code 缓存和资源诊断。
- 顶栏“资源调节”菜单提供资源诊断面板，按需展示 xterm 实例数、终端 WebSocket 数、会话快照吞吐、终端实时流吞吐、终端历史缓冲裁剪状态、VS Code iframe 当前/隐藏数量、主线程长任务、VS Code 代理 HTTP/WS 吞吐和 Chromium JS heap 指标，用于定位浏览器内存、网络增长、长输出丢失与 VS Code iframe 卡顿来源。
- 提供 `Ctrl/⌘+E` 快速连接 tmux、`Ctrl/⌘+Shift+S` 打开 tmux 扫描、`Alt+Q` 从聚焦视图返回宫格等快捷操作。

## 3. 新建会话

- 支持本机和 SSH 主机两类目标。
- Agent 类型支持 `copilot`、`codex`、`claude`、`shell`。
- 启动方式支持 `direct` 和 `tmux`。
- 显示名称留空时，前端根据主机、Agent 类型和启动方式自动生成唯一默认名。
- 本地会话通过 `/api/agent-launch/pty` 启动，远端会话通过 `/api/agent-launch/ssh-pty` 启动。

## 4. tmux 接入、扫描与管理

- 支持本地 tmux 扫描。
- 支持 SSH 远端 tmux 扫描。
- 支持快速连接本机或远端 tmux，会话存在即 attach，不存在即创建。
- 支持将已运行的 tmux pane 接入为可交互 PTY。
- 支持对 tmux 会话执行 `refresh`、`takeover`、`release`、`kill`。

## 5. Agent 工作目录扫描

- 支持扫描本地目录与 SSH 远端目录。
- 支持识别 Copilot `session-state`。
- 支持把扫描结果与 tmux pane 进行合并，减少重复卡片。
- 扫描结果支持按 direct 或 tmux 模式加入宫格。

## 6. 终端交互与 WebSocket

- 聚焦主终端使用 xterm.js 渲染，后端通过 WebSocket 发送 scrollback replay 与实时输出。
- 终端历史保留上限可配置：后端 live PTY replay 默认保留 4 MiB，tmux observe/refresh 默认捕获最近 20000 行，registry fallback 默认保留 5000 条输出记录，前端 xterm 默认保留 20000 行；tmux attach 会在连接前把 pane 历史预灌到 PTY replay，资源诊断会提示 PTY replay 是否已发生裁剪。
- 所有内置 xterm 终端共用顶栏字号设置；滑杆拖动中只更新顶栏显示，鼠标松开、键盘调整结束或失焦提交后才对聚焦主终端、多屏监控终端、完整预览终端和手机端终端生效，并重新 fit/resize。
- 提供手机端终端控制页，默认入口为 `/?view=mobile`，兼容 `/mobile`、`/m` 和 `#/mobile`；复用现有会话和终端通道，以单会话全屏终端、底部快捷键条和多行输入框为主，解决手机缺少 `Ctrl+C`、`Esc`、方向键、稳定软键盘输入和终端历史滑动的问题；快捷键条提供”说明”按钮，可弹出各快捷键用途说明；说明弹窗支持 `aria-modal`、`aria-labelledby`、Tab 聚焦陷阱和 Escape 关闭。
- 手机端快捷键条发送通用终端控制字符，不提供 tmux 专用快捷键专区；`Ctrl+C/D`、`Esc`、`Tab`、`Shift+Tab`、方向键、`Ctrl+L`、`Ctrl+U/W/K/Y/A/O/E` 等控制键按原始 stdin 转发，不会被额外追加 Enter，并覆盖 Claude / Copilot CLI 常用的焦点切换、面板打开和行编辑快捷键。
- 手机端输入框的“发送”和“粘贴执行”会先以 bracketed paste 把文本写入 Agent 输入框，再单独发送一次真实 `Enter`，确保 Copilot、Claude 和 Codex 直接接收为任务提交；“粘贴”仍只写入文本，不自动执行。
- 手机端标题区提供同一套 Agent 完成通知开关；手机浏览器支持并授权通知时，页面保持打开即可在任务完成后收到系统通知。
- 手机端终端页锁定浏览器根页面滚动，终端区域用捕获阶段的非 passive touch 监听接管上下滑动，触屏设备在桌面聚焦页也启用同一终端手势控制，避免 Codex 长上下文下拉时触发浏览器下拉刷新；单指滑动滚动 xterm scrollback，双指 pinch 调整终端字号，并提供”底部”按钮返回最新输出。
- 手机端快捷键工具栏保持单行横向选择器布局，用户可左右滑动选择较多的 Claude / Copilot 快捷键；字号持久化到 localStorage，reload 后保持上次缩放级别。
- 默认轻量预览模式下，宫格卡片和聚焦右侧栏不打开真实终端 WebSocket，只展示轻量文本预览，避免多会话时浏览器内存和网络流量随卡片数量线性膨胀。
- 可切换到完整预览模式，恢复宫格卡片和聚焦右侧栏的旧版小终端预览。
- 前端会对会话快照 WebSocket、终端实时 WebSocket、挂载中的 xterm/终端视图和 JS heap 做轻量采样，资源诊断面板只在打开时刷新，避免诊断自身形成持续负载。
- 后端会对高频终端输出触发的看板全量快照做合并广播；结构性操作仍即时刷新，避免轻量预览场景下 `/ws/agent-sessions` 因逐帧输出形成网络和 JSON 解析风暴。
- 支持 replay 完成前缓冲 live frame，避免历史输出与新输出乱序。
- 支持 stdin、resize、binary 消息，binary 用于 tmux 鼠标等二进制事件。
- 支持终端输出发起的 OSC 52 剪贴板写入；tmux copy-mode 可通过 pane 内选择把内容写入浏览器剪贴板，前端只接受 clipboard target 且限制 payload 大小。
- 支持终端焦点补救和输入所有权；真实 stdin 默认只落到当前聚焦主终端，多终端监控模式下也只落到当前输入窗格；鼠标滚轮固定滚动终端 scrollback 上下文，不作为 Codex CLI 输入历史翻页事件转发，输入历史仍通过键盘上下箭头完成。

## 7. 文件浏览器

- 聚焦视图下支持打开文件浏览器。
- 支持本地文件系统与 SSH/SFTP 远端文件系统。
- 支持面包屑、返回上级目录、显示隐藏文件、过滤、排序。
- 支持文本预览和编辑保存。
- 支持新建文件/目录、重命名、删除、chmod、上传、下载、拖拽上传。
- 右键菜单支持上传到当前目录或选中目录、下载、重命名、删除、复制路径、chmod。

## 8. VS Code Web

- 本地与 SSH 聚焦会话都支持打开内嵌 VS Code Web 面板。
- 本地后端优先复用 `code-server`，其次支持 `openvscode-server`；SSH 远端首版通过 SSH 启动/复用远端 `code-server`。
- 本地会话使用稳定的 `.code-workspace` 文件；SSH 远端会话直接打开远端工作目录。
- 扩展目录优先复用用户的 `~/.vscode-server/extensions`。
- 浏览器侧 iframe 默认使用 VS Code 省内存模式，只保留当前打开的 iframe；可切换到保持状态模式，最多保留最近 8 个 iframe。
- 支持一键释放 VS Code iframe 缓存，卸载非当前 iframe 以回收浏览器内存。

## 9. SSH 与环境适配

- 远端主机列表直接读取并解析当前用户的 `~/.ssh/config`。
- 本地与远端 shell 选择优先使用当前环境 `SHELL`，不足时按 `bash -> zsh -> sh` 回退。
- tmux 路径支持 `TMUX_BINARY`、Homebrew 路径和 `PATH` 自动探测。

## 10. 布局与状态持久化

- 顶栏折叠、文件浏览器布局、聚焦视图状态、侧边工具选择等 UI 状态保存在本地存储。
- 前端提供轻量 UI 动效：顶栏菜单、资源诊断、主机下拉、卡片、抽屉和弹窗使用 opacity/transform 入场与悬停过渡，并遵循 `prefers-reduced-motion` 降级。
- 聚焦视图终端监控布局模式保存在本地存储，重新进入时保持 `屏幕布局` 菜单中的单屏、左右双屏、上下双屏、左中右三屏、四屏、六屏或八屏选择。
- 文件浏览器按会话和主机维度保存独立浏览状态。
- VS Code Web 会话缓存支持跨切换复用。
- VS Code iframe 缓存模式保存在本地存储，默认省内存；自动超时卸载暂未默认启用，保留为下一阶段策略。

## 12. Paper Writer 项目工作区

- Paper Writer 项目侧栏明确展示 `全部项目`、`未归档`、`已归档`、`已删除` 四类入口，并在每个入口显示独立数量。
- `全部项目` 包含所有未删除项目；`未归档` 只包含正常使用且未归档项目；`已归档` 只包含归档但未删除项目；`已删除` 只包含待恢复或永久删除项目。四种状态过滤互相独立，不再复用含义模糊的 `mine` 状态。
- 删除、归档、取消归档、恢复、永久删除等项目操作保留在项目行内或已删除视图内。
- 文章编辑页的预览窗口在 `pdf`、`diff` 同级提供 `翻译` 按钮，可直接调用现有大模型接口翻译当前渲染预览对应的稿件内容，并在预览区域显示译文、加载态和错误信息。
- 文章编辑页右侧 AI 区域中，`Skill` 不再作为与 `Chat` 并列的顶层 tab 展示；它绑定在 chat 窗口内，点击 chat 头部的 `Skill` 按钮会展开 skill 选项，选择后直接创建并进入带该 skill 的 chat 会话。
- Chat 输入区支持两种大模型接入模式：默认 `Built-in LLM` 继续走现有 `/api/ai/send`、`/api/ai/stream` 后端；`Bash Agent` 模式允许配置 `copilot`、`codex`、`claude` 等 bash 命令，并随 chat 请求把 `mode` 和 `bashCommand` 发送给后端执行层。
- 当前运行的 Paper Writer 静态构建入口包含前端资源自动同步逻辑，会轮询已加载的 `/assets/*.js` 和 `/assets/*.css` 资源签名；运行产物变化后页面会自动刷新，避免每次改前端后都需要手动刷新浏览器。
- Paper Writer RAG 上传 PDF 时会尝试抽取真实正文并生成 `*.extracted.md` sidecar 与 `*.rag.json` 解析诊断；索引器只把真实抽取文本写入 chunk，不再把 PDF 二进制或文件 metadata 当正文索引。文档列表会暴露 `parseStatus`、`parser`、`extractedTextChars`、`chunks`、`extractionError` 等状态，便于前端区分 `parsed`、`metadata-only` 和 `failed`。
- Paper Writer 工作台静态原型的 Evidence Library 支持一次选择或拖拽上传多篇 PDF、BibTeX 和文献笔记；前端会逐个调用现有 RAG 上传接口，上传后汇总成功、失败、已解析、metadata-only 和解析失败数量，并自动刷新证据库状态。
- Paper Writer RAG 上传接口新增 `uploadReview` 上传后诊断，会按文件返回中文状态、解析器、chunks、抽取字符数、是否阻塞引用写作、`recovery` 恢复诊断、下一步动作、成功标准和可复制诊断文本；`recovery.noteTemplate` 会在扫描版需 OCR、加密/损坏 PDF、缺少抽取结果或需要人工摘录时提供 Markdown 文献笔记模板，要求用户填写人工核对过的题名、元数据、方法、结果、局限和可引用事实；工作台原型的多文件上传结果会逐文件展示“可检索 / 暂不能引用 / 解析失败”等卡片，并把复制笔记模板、补充 Markdown 文献笔记、替换可复制文本 PDF、重建索引、查看文档状态等修复动作渲染为安全按钮，帮助用户上传 PDF 后立刻知道这篇文献能不能用于论文引用以及下一步怎么修。
- Paper Writer RAG 索引器会识别未填写或证据字段不完整的 Markdown 人工摘录模板，给文档打上 `contentQuality.status = "template-empty"` 或 `"manual-note-incomplete"`，不为其生成 RAG chunks，也不会把模板字段名、缺页码事实或缺原文摘录的弱笔记当成可引用证据；工作台文档可用性和修复向导会把这类文档标为引用写作阻塞项，提示用户补全可核对的 `Fact`、`Evidence text` 和 `Page/section` 后重新上传或重建索引。
- Paper Writer RAG 上下文接口返回兼容旧字段的 `context`，同时返回结构化 `evidence`，包含查询、上下文文本、命中片段、来源路径、行号和评分，供前端证据抽屉展示引用来源。
- Paper Writer AI 接口支持显式或自动 RAG 证据注入：请求携带 `rag.enabled` 或用户问题明显涉及文献、证据、PDF、引用时，后端会检索项目证据库，将命中片段注入模型上下文，并在普通响应、SSE `rag_context` 事件和 `done` 事件中返回 `ragEvidence`；旧的 `ragContext` 字符串仍保留兼容。
- Paper Writer AI RAG 注入新增通用 `ragUsageGuidance`，普通 `/api/ai/send` 和 `/api/ai/stream` 在启用 RAG 时会把“只使用命中片段、事实陈述带来源编号、不得推断作者/年份/venue/DOI、区分证据和推测”等规则注入模型消息，并在响应字段返回该指导文本，避免绕过工作台时丢失引用边界。
- Paper Writer Skill 列表和详情接口都返回中文主标题、英文副标题、中文分类、标签、任务意图、输入、输出、适用/不适用场景、风险等级和上下文需求等 UI 元数据；新增 `/api/skills/recommend`，可根据用户自然语言任务返回推荐 skill、推荐理由和缺失上下文提示。后端同时提供 Skill 分类分组数据，便于前端渲染“写作 / 文献 / 引用 / 实验 / 图表 / 投稿”等筛选 chips。
- Paper Writer 工作台聚合接口新增 `skills.navigator` Skill 导航模型，会把全部 Skill 整理成中文分类、标签 chips、风险筛选、上下文需求筛选和中文优先 Skill 卡片；卡片包含输入、输出、适用/不适用场景、任务模板和推荐高亮，帮助用户按论文任务理解 Skill，而不是记英文 Skill id。
- Paper Writer 工作台聚合接口新增 `skills.decisionGuide` Skill 决策指南，会把首选 Skill 的推荐原因、不适用边界、下一步动作、需要确认的问题和备选 Skill 的“什么时候选/取舍”整理成可展示和可复制的中文说明；工作台原型会在推荐卡片前展示该指南，降低用户不知道该选哪个 Skill 的成本。
- Paper Writer 工作台聚合接口新增 `skills.compareGuide` Skill 对比模型，会把前 2-3 个推荐 Skill 按中文标题、英文副标题、分数、风险、输入、产出、什么时候选、不要选、取舍和缺少材料并排比较；工作台原型新增“Skill 对比”区域，支持一键填入候选 Skill 的首问模板和复制完整对比说明。
- Paper Writer 工作台聚合接口新增 `modeDecisionGuide` 模式决策指南，会解释为什么当前任务推荐 Chat / Agent / Tools 中的某一种、为什么暂不选另外两种、什么时候应该切换模式，以及 Chat 不改文件、Agent 先草稿/diff、Tools 先命令计划和确认的安全边界；工作台原型新增“模式决策”面板和复制按钮。
- Paper Writer 模式路由会把“检查 RAG/PDF 有没有读进去、是否索引、是否解析成功”识别为证据库诊断任务，而不是仅因出现 `PDF` 就切到 Tools；纯诊断默认走 Chat/工作台状态面板，诊断加写作任务走 Agent 并先显示 RAG 健康、文档可用性和修复向导，真正的编译、运行脚本、实验统计和图表生成才进入 Tools。
- Paper Writer 工作台聚合接口新增 `modeActionCenter` 模式操作中心，会把当前 Chat / Agent / Tools 推荐模式转成可直接渲染的主按钮、按钮启用状态、阻塞原因、模式切换卡、发送前检查、确认门槛、禁止动作和可复制操作说明；工作台原型新增“模式操作中心”面板，模式切换按钮只会填入提示或预览，不会自动发送、运行命令或改文件。
- Paper Writer 工作台聚合接口新增 `paperWorkflowGuide` 论文写作流程向导，会把描述任务、准备 RAG 证据、确认上下文、选择 Skill、审查写作计划、生成可审查草稿和审查 AI 输出串成有顺序的步骤，标出当前步骤、阻塞项、建议动作和成功标准；工作台原型新增顶部“论文写作流程”面板和复制按钮，让第一次使用的用户知道下一步该做什么。
- Paper Writer 工作台聚合接口新增 `actionQueue` 操作队列，会把论文流程当前步骤、模式主操作、阻塞项、澄清问题、RAG 修复计划、检索改写、Skill 决策和证据包动作合并为按优先级排序的中文下一步清单；工作台原型新增“操作队列”面板和复制按钮，让用户优先看到 3-8 个最该执行的动作，而不是在多个面板之间自行判断。
- Paper Writer 工作台聚合接口新增 `agentReadiness` 生产可用性门禁，会从任务明确性、RAG 证据可用性、上下文完整度、Skill 可发现性、Chat/Agent/Tools 模式边界、引用安全、输出审查闭环和操作队列八个维度给出分数、阻塞项、采纳门槛和可复制评估；工作台原型新增“生产可用性”面板和“重新评估生产可用性”按钮，用户补齐上下文后可重新检查阻塞是否解除，按钮只重新分析工作台状态，不会发送模型请求、运行工具或写文件。
- Paper Writer Skill UI 元数据新增 `hoverGuide`，为 Skill 推荐卡和导航卡提供“这个 Skill 能做什么、开始前确认什么、预期产出、风险边界、首问模板”的中文快速判断；工作台原型在 hover/focus 详情里优先展示该摘要，再展示输入、输出、适用和不适用列表。
- Paper Writer 工作台静态原型的 Skill 导航支持点击中文分类、常用标签、风险等级和所需材料筛选 Skill 卡片；筛选后会显示匹配数量、当前筛选条件和清除筛选按钮，卡片仍保持中文主标题、英文副标题和 hover/focus 详情。
- Paper Writer Skill API 新增 `/api/skills/navigation`，GET 可直接返回中文 Skill 导航，POST 可根据用户任务和项目状态返回推荐结果并高亮对应 Skill，供独立 Skill Picker 不经过工作台也能渲染分类、标签、上下文需求、风险筛选和中文优先卡片。
- Paper Writer Skill 元数据新增中文 `task_templates`，推荐结果新增结合当前任务生成的 `suggestedTask`。工作台原型会在 Skill 详情中展示推荐任务模板，并支持一键填入任务框或复制模板，降低用户不知道如何向 Skill 提问的门槛。
- Paper Writer 新增 `/api/projects/:id/writing-workbench/context` 工作台聚合接口：给定用户任务后，一次性返回项目 RAG 健康摘要、最近证据文档、RAG 命中片段、UI 提示、Skill 分类和推荐 Skill，供 chat 头部 Skill Picker、证据抽屉和新手任务入口直接使用。该接口还返回 `taskRouting`，用于区分当前任务更适合 `chat`、`agent` 还是 `tools`，并给出中文理由、风险等级、是否需要确认、缺失上下文、缺失上下文中文说明和下一步动作。
- Paper Writer 工作台聚合接口新增 `contextReadiness`，把推荐 Skill、任务路由和项目状态合成为“可以开始 / 需要补上下文 / 建议补充上下文”的准备度诊断，列出必需资料、建议资料、是否已满足和补齐动作。
- Paper Writer 工作台聚合接口新增 `contextAnswers` 结构化上下文答案，前端可把用户确认的目标章节、论文主张、方法说明、实验结果或投稿规则随任务一起发送；后端会把这些答案计为已补齐上下文，解除相应阻塞，并写入上下文摘要和写作提示词。
- Paper Writer 工作台聚合接口新增 `clarificationQuestions` 澄清问题模型，会把缺失的目标章节、文献证据、论文主张、实验结果、投稿规则等上下文转成用户可直接回答的中文问题、示例占位和补齐动作；工作台原型新增“需要澄清的问题”面板，并支持一键把问题导向目标章节或补充上下文输入框后重新分析。
- Paper Writer 工作台聚合接口新增 `contextBrief` 上下文摘要，会把用户任务、推荐模式、推荐 Skill、可能目标章节、上下文准备度、假设风险和仍需回答的问题整理成可复制 Markdown；工作台原型新增“上下文摘要”面板和复制按钮，发送给 AI 的写作提示词也会内置该摘要。
- Paper Writer 工作台聚合接口新增 `draftPlan` 写作计划，会根据任务类型、推荐 Skill、证据包和上下文摘要生成可审查的章节/段落结构、每部分目标、证据使用方式、约束、预期输出和风险；每个计划步骤可带 `evidenceAssignments`，把命中的来源编号分配到具体段落目标，并说明该证据能怎么用、不能扩展到哪里；工作台原型新增“写作计划”面板、证据分配展示和复制按钮，帮助用户先审结构再让 Agent 生成正文或 diff。
- Paper Writer 工作台聚合接口新增 `citationPolicy` 引用安全策略，会根据任务是否涉及文献/引用、RAG 是否命中证据，返回“可基于证据写作 / 需要重新检索证据 / 缺少引用证据 / 未使用证据”等状态、必须遵守的引用规则和禁止行为；工作台原型会展示这些规则，并把它们写入发送给 AI 的提示词，防止编造引用。
- Paper Writer 工作台聚合接口新增 `acceptanceChecklist` 输出验收清单，会根据 Chat/Agent/Tools 模式、上下文准备度、引用安全策略和 RAG 命中状态生成阻塞项与建议项；工作台原型会展示清单，并把它写入提示词，帮助用户判断 AI 输出是否可采纳。
- Paper Writer 工作台聚合接口新增 `writingPrompt` 后端生成 Markdown 工作包，统一合并任务、推荐模式、推荐 Skill、RAG 证据、引用安全、上下文准备度、下一步动作和验收清单；工作台原型优先使用该字段作为复制/发送给 AI 的提示词，减少正式前端重复拼装逻辑。
- Paper Writer 工作台聚合接口新增 `aiDraftRequest`，返回创建会话和调用 `/api/ai/send` 的建议请求模板，包括模式、active skills、RAG 参数和 `writingPrompt` 消息正文；该模板只允许用户显式点击后使用，避免任务分析自动触发模型调用。
- Paper Writer 工作台聚合接口新增 `workbenchBundle` 完整工作包，会把上下文摘要、Skill 决策、证据库修复计划、证据写作包、写作计划、验收清单和最终 AI 提示词组合成可复制 Markdown 与紧凑 JSON 摘要；工作台原型新增“完整工作包”面板和复制按钮，方便把当前状态带到新会话、Agent 或协作者。
- Paper Writer 工作台聚合接口新增 `uiModel` 前端渲染模型，统一返回面板顺序、主操作、Chat / Agent / Tools 模式选项、Skill Picker 中文优先展示规则、Evidence Drawer 状态和各面板状态 tone，帮助正式前端直接渲染“下一步该做什么”而不重复推导业务规则。
- Paper Writer 工作台聚合接口新增 `taskStarters` 论文任务入口，面向不知道如何选择 Skill 的用户提供“写 Related Work / Research Gap、搭建 Introduction 逻辑、解释 Method / Algorithm、分析 Results / Discussion、压缩 Abstract、整理引用和 BibTeX、设计论文图表、投稿前检查”等中文场景卡片；每个入口包含推荐模式、推荐 Skill、标签、上下文需求、一键填入任务框的 prompt、禁用原因和救场动作，并新增 `contextPrefill`、`nextStep_zh` 与 `startGuide` 启动说明包，让前端点击入口时能预填目标章节占位、补充上下文草稿、展示为什么选这个入口/缺什么材料/预期产出/发送前检查，并提供可复制的安全启动 prompt。
- Paper Writer 新增“论文润色 / 语言编辑”内置 Skill 和任务入口：用户输入“帮我润色”“帮我改论文”时会推荐 `writing-polish`，要求先确认目标章节、段落或粘贴文本；润色 prompt 明确保留引用、数字、LaTeX 命令和技术术语，不新增事实、不自动覆盖正文，并提供修改说明和含义变化风险提示。
- Paper Writer 扩展“论文润色 / 语言编辑”任务入口覆盖真实写作日常请求：翻译成英文论文表达、英文段落中文解释、语法/时态检查、压缩段落、降低 AI 痕迹、检查是否太像 AI 写作、改成 Nature/目标期刊英文风格都会推荐 `writing-polish`，并在 Skill 导航标签、hover 说明、任务模板和前端 demo 中中文优先展示。
- Paper Writer 新增“修复 LaTeX / Overleaf 报错”内置 Skill 和任务入口：用户输入 LaTeX 编译错误、Overleaf 报错、PDF 编译失败等任务时会推荐 `latex-debugging`，要求先提供 `latex_error_log` 和目标 `.tex` 文件或章节；输出第一处 blocking error 解释、最小修复建议、可审查 patch 和重新编译计划，运行编译命令或改文件前仍必须确认。
- Paper Writer 论文后期打磨路由继续细化：dataset 描述、实验设置、ablation、LaTeX tabular 表格转换会进入 Results/Discussion；算法伪代码、theorem/proof 严谨性、公式符号一致性会进入 Method；title/keywords 会进入 Abstract 级压缩表达；appendix、supplementary appendix、reproducibility checklist 会进入投稿材料检查；caption 改写和 bullet points 改成论文段落会进入可审查 Agent 草稿，而不是停在 Chat 或误进 Tools。
- Paper Writer 新增“输出审查 / Evidence Review”内置 Skill 和“审查 AI 输出 / 证据核对”任务入口，覆盖幻觉引用、related work 引用是否有证据支持、单句 claim 与 RAG 证据核对、AI 输出能否采纳和安全采纳包生成；该入口只生成审查结论、修订计划、单句证据检查或只读人工采纳包，不会自动写入论文正文。
- Paper Writer 新增“审稿回复 / Rebuttal”内置 Skill 和任务入口：用户输入“帮我写 rebuttal”“回复 reviewer comments”“写审稿意见回复”时会推荐 `reviewer-response`，要求先粘贴审稿意见和确认目标修改位置；输出逐条回复草稿、修改 action list 和风险提示，禁止承诺未确认的新实验、数字、正文修改或 venue 规则。
- Paper Writer Skill 导航继续补齐中文优先元数据：`grant-proposal` 显示为“基金申请”并归入“项目申请”，`nature-paper2ppt` 显示为“论文转演示”，`poster-design` 显示为“学术海报”，避免内置 Skill 在中文导航里裸露英文标题或被误归到投稿检查。
- Paper Writer 工作台聚合接口新增 `interactionPlan` Chat / Agent / Tools 执行预案，把推荐模式展开为步骤、主按钮文案、阻塞原因、可见警告、确认门槛、禁止动作和预期输出；Agent 模式要求正文写入、引用事实采纳和草稿合并前确认，Tools 模式要求运行脚本、编译 LaTeX、写入/删除/覆盖/移动文件前确认。工作台原型已展示该预案，并把主发送按钮文案切换为后端推荐动作。
- Paper Writer 工作台的 `modeActionCenter` 新增 `sendGate` 发送门槛：结构化返回当前是否可发送、是否必须勾选安全确认、阻塞原因和禁止动作。工作台原型在写作提示词面板新增发送安全确认框；Agent/Tools 或需要确认的任务未勾选时不会创建会话或发送模型请求，阻塞状态也会直接拦截发送。
- Paper Writer 工作台聚合接口新增 `evidencePack` 证据写作包，会把 RAG 命中片段整理成可复制 Markdown、来源编号、可支持用途、不能支持的内容和引用指令；没有命中证据时返回上传资料或换关键词的 fallback 动作。工作台原型新增“证据写作包”面板和复制按钮，帮助用户把证据安全带入写作提示词。
- Paper Writer 工作台聚合接口支持 `evidenceQuery`，前端可把当前 RAG 检索框内容传入工作台，让证据包、写作计划和生产可用性门禁按用户刚选择的推荐检索词重新计算；工作台原型的推荐 query 现在同时提供“填入”和“检索”动作，检索完成后提示用户重新评估生产可用性。
- Paper Writer 证据写作包每条证据新增 `quality` 可用性判断，会根据片段长度、来源路径、行号和检索评分给出“可直接用于局部引用 / 可用于草稿，采纳前核对 / 只能作为线索”等中文等级、质量分、警告、推荐用法和句型模板；工作台原型会在片段旁展示该判断，减少用户误把弱证据写成强引用。
- Paper Writer 证据写作包新增 `coverage` 覆盖度诊断，会统计命中片段来自多少个来源、最高单一来源占比、每个来源对应的片段编号，并在来源过少或证据过于集中时给出中文警告和写作建议；工作台原型会在证据写作包面板展示覆盖度，写作提示词和复制证据包也会带上该诊断。
- Paper Writer 证据写作包新增 `expansionPlan` 补证据计划，会根据任务、当前检索词、命中片段和覆盖度生成建议检索词、建议补充的来源类型和动作；工作台原型会把建议检索词显示为可点击按钮，一键填入 RAG 检索框，帮助用户从“证据不够”直接进入下一轮补证据。
- Paper Writer 工作台生成的 `writingPrompt.text` 和 `aiDraftRequest.send.userMessage` 已内置 `# 证据写作包` 章节，会把证据包使用规则、每条证据可支持内容、不能支持内容和引用说明一并发送给 AI，避免只传原始 RAG 片段导致过度引用或假引用。
- Paper Writer 工作台新增 `/api/projects/:id/writing-workbench/review-answer` AI 输出审查接口，可把 AI 返回内容与当前任务、引用安全策略、证据写作包、上下文准备度和验收清单对照，标记缺少来源编号、使用不存在来源编号、无证据时编造引用、证据覆盖不足却写强综述结论、未经确认的 Agent/Tools 风险等问题，并返回“可采纳 / 需修改 / 不建议采纳”的中文审查结论、下一步动作、`revisionPlan` 分步修订计划、`revisionLoop` 多轮修订状态、`claimCheckQueue` 待单句检查队列和 `adoptionGate` 采纳门槛；工作台原型在 AI 返回后会自动审查，也支持手动点击“审查当前输出”，并展示可复制的修订计划、修订闭环、可一键放入单句检查框的重点 claim 和“不可自动写入正文”的采纳边界。
- Paper Writer 工作台新增 `/api/projects/:id/writing-workbench/claim-review` 单句证据检查接口，可把用户准备写入论文的一句话与当前 `evidencePack` 对照，检查缺少来源编号、引用未知编号、没有直接匹配证据、证据匹配太弱、超出片段支持边界和未支持的作者/年份/venue/DOI 信息，并返回匹配证据、关键词覆盖率、缺失关键词、风险点、建议改写、`writeGate` 写入门槛和可复制检查结果；工作台原型新增“单句证据检查”面板，帮助用户在写入正文前确认某句话能否被 RAG 证据支持，并明确即使 supported 也不能自动写入正文，必须人工核对原文、来源编号和目标段落。
- Paper Writer 工作台新增 `/api/projects/:id/writing-workbench/adoption-package` 安全采纳包接口：在 AI 输出审查通过并填写目标章节后，只生成可复制的只读采纳包、人工采纳清单、禁止动作、来源编号摘要和 `manual-diff-plan`；返回值始终保持 `canWriteToPaper: false`、`willWrite: false`，工作台原型新增“安全采纳包”面板和复制按钮，帮助用户把审查通过的草稿安全地手动应用到论文，避免系统或复制路径绕过最终人工确认。
- Paper Writer 的输出审查、单句检查和安全采纳包接口都会接收 `evidenceQuery` / `ragQuery` / `query`，工作台前端会把当前 RAG 检索框内容随请求发送，确保“生成上下文时用的证据包”和“后续审查/采纳时用的证据包”一致，避免用户换关键词检索后审查接口又退回任务文本检索。
- Paper Writer 工作台上下文新增 `runtimeEnvironment` 运行环境能力说明，会暴露服务器 OCR 工具检测结果、是否可运行受控 OCR 队列、当前需要 OCR 的 PDF 列表、RAG 文档摘要和下一步兜底动作；`agentReadiness` 新增“运行环境是否支持生产恢复”维度，没有 OCR 工具但当前无扫描 PDF 时作为非阻塞风险显示，存在扫描版/不可抽取 PDF 且服务器无法 OCR 时作为生产可用性阻塞项。
- Paper Writer 证据写作包新增稳定 `fingerprint`，写作提示词和复制证据包都会显示“证据包指纹”。输出审查、单句检查和安全采纳包请求会携带生成草稿时的证据包指纹；后端重新构建证据包后若发现指纹不一致，会生成 `evidence-pack-drift` / `evidence-pack-changed` 阻塞项，要求重新生成证据包和重新审查，避免 RAG 索引或检索词变化后 `[1]` 指向不同片段。
- Paper Writer AI 输出审查和单句证据检查会校验证据包编号稳定性：只有正整数且唯一的 evidence rank 可作为 `[1]`、`[2]` 引用；证据包出现重复编号或无效编号时会返回 `unstable-evidence-ranks` 阻塞项，要求重新生成证据包后再审查，避免同一个来源编号指向多个片段。
- Paper Writer 工作台原型的单句证据检查结果会在每条匹配证据旁展示关键词覆盖率和未覆盖关键词；离线 fallback 检查也会用同样的弱匹配规则生成 `weak-evidence-match` 阻塞项，避免后端返回覆盖率后前端只显示“匹配词”而无法解释为什么一句 claim 不被证据支持。
- Paper Writer 工作台原型的本地 fallback 审查同步校验证据编号稳定性：当后端审查接口不可用时，前端仍会阻塞重复/非法 evidence rank，并在 AI 输出修订计划、待单句检查队列和单句证据检查中提示重新生成证据包，避免离线兜底路径放松引用安全规则。
- Skill 导航卡片同时返回 `title_zh` 和 `display_name_zh` 中文标题，以及 `subtitle_en` 英文副标题；页面继续使用中文标题优先，外部调用方也可以按 Skill 详情接口一致的字段读取中文名称。
- Paper Writer Skill 系统新增“任务意图诊断”：把用户自然语言任务（例如写 related work / research gap、搭建 introduction、整理 BibTeX、投稿前检查）识别为中文论文任务意图，返回推荐 Skill、推荐任务入口、置信度、命中的用户词、缺少材料、下一步动作、备选 Skill 和安全边界；工作台会在推荐 Skill 面板顶部展示该诊断，并支持一键使用对应论文任务入口或复制诊断结果。
- Paper Writer RAG 的扫描版 PDF 恢复诊断新增 `ocrCapability`：上传诊断、文档引用可用性和前端恢复卡会展示服务器是否检测到 OCRmyPDF/Tesseract、当前是否启用自动 OCR 恢复，以及应该上传 OCR 后 PDF 还是人工 Markdown 文献笔记；即使检测到 OCR 工具，也会明确 `automaticRecoveryAvailable = false`，避免用户误以为系统会自动改写原 PDF。
- Paper Writer RAG 的人工文献笔记支持 OCR 后常见的多行摘录格式：`Evidence text:` 和 `Page/section:` 的值可以写在下一行或 Markdown 引用块中；空模板和缺少事实/原文证据/页码字段的笔记仍会被阻塞，完整多行 OCR 笔记会进入索引、文档卡显示可引用，并可生成 evidencePack。
- Paper Writer AI 输出审查和单句证据检查新增 `unsupported-bibliographic-details` 阻塞项：输出中的具体作者 `et al.`、年份、DOI、arXiv 编号和常见 venue 必须出现在对应来源编号的证据片段中；不能因为证据包其他片段包含年份或 venue，就放行当前引用片段没有支持的 Smith et al. 2024 等文献信息。前端本地 fallback 也会执行同类检查，并在修订计划中要求删除外推字段。
- Paper Writer 的 AI 输出待单句检查队列会把 `unsupported-bibliographic-details` 对应句子升级为 high priority，并在原因里列出未被对应证据片段支持的作者、年份、DOI、arXiv 或 venue；前端本地 fallback 同步升级，避免全文审查已经 reject 但用户没有优先逐句修复假引用细节。
- Paper Writer 待单句检查队列会在切分 AI 输出前保护 `et al.` 缩写，避免把 `Smith et al. 2024 ... [1]` 错切成缺少作者的 `2024 ... [1]`；前端本地 fallback 与后端一致。
- Paper Writer AI 输出审查和单句证据检查新增 `unsupported-quantitative-details` 阻塞项：百分比、p-value、指标数值、提升幅度、样本量等量化 marker 必须出现在对应来源编号的证据片段中；例如证据只说 improve drafting 时，AI 输出不能写 `by 15% [1]`。修订计划和待单句检查队列会要求删除外推数字，前端本地 fallback 同步执行。
- Paper Writer AI 输出审查、单句证据检查和待单句检查队列新增 `claim-contradicts-evidence` 阻塞项：当 claim 与对应证据片段关键词高度重合，但肯定/否定方向相反时会 reject，例如证据写 `do not improve`，AI 不能写成 `improve [1]`；修订计划会要求按证据原文修正结论方向，前端本地 fallback 同步执行。
- Paper Writer 全文 AI 输出审查现在按句子作用域执行证据边界检查：同一段里每句话只能使用自己引用的 `[n]` 证据片段来支撑作者年份、venue、DOI、量化结果和结论方向，不能用第二句话的 `[2]` 去支撑第一句话的 `[1]`；后端审查和前端本地 fallback 保持一致。
- Paper Writer AI 输出审查结果新增 `revisionPrompt` 修订提示词，审查状态为“需修改”或“不建议采纳”时会把审查发现、引用安全规则、可用证据、验收清单和原始 AI 输出组合成可复用 prompt；同时新增 `revisionLoop`，提示当前需要重写、修订还是人工终审，列出必须重新审查的场景和退出条件；工作台原型提供“使用修订提示词”“复制修订提示词”和“复制修订闭环”按钮，所有按钮都只更新预览或复制文本，必须等待用户再次显式点击发送，避免审查后自动请求模型。
- Paper Writer 修订提示词新增“必须满足的硬约束”区块，会把审查发现转成模型必须执行的具体约束：列出必须删除或替换的未支持作者年份、venue、DOI、arXiv、百分比、p-value、指标数值和提升幅度；提醒不能借用其他来源片段的元数据或数字；证据编号不稳定时要求先重建证据包而不是生成可引用正文；结论方向相反时要求按证据原文修正。后端和前端本地 fallback 同步生成该区块。
- Paper Writer AI 输出审查新增 `revisionProgress` 多轮修订进展对比：第二次及以后审查会比较上一轮和当前轮的阻塞项，展示已解决阻塞、重复阻塞、新增阻塞、是否可退出修订循环、下一步动作和可复制的修订进展；如果同类阻塞重复出现，会标记为 `stuck` 并提示必须用修订提示词重写重复阻塞项。前端会自动把上一轮审查随下一次“审查输出”请求传给后端，后端不可用时本地 fallback 也会生成同样结构。
- Paper Writer RAG 新增 `/api/projects/:id/rag/text-import` 受控文本证据导入接口，用于把用户已核对的 OCR 文本或人工摘录 Markdown 直接导入 `research_corpus` 并自动重建索引；导入后复用上传诊断和文献笔记质量门槛，空模板或缺少 Fact / Evidence text / Page section 的笔记不会进入可引用证据。工作台在扫描版 PDF、加密 PDF 或正文不可抽取的恢复提示旁提供“粘贴 OCR/摘录导入”按钮。
- Paper Writer 工作台将 OCR/人工摘录导入从浏览器 prompt 升级为页面内导入面板：恢复提示中的“粘贴 OCR/摘录导入”会打开文件名输入框和长文本 textarea，预填文献笔记模板，用户可编辑核对后再提交；提交按钮调用 `/rag/text-import`，取消按钮会清空并关闭面板，切换任务时也会关闭旧面板，避免把旧文档摘录误导入新任务。
- Paper Writer OCR/人工摘录导入面板新增前端实时质量预检：用户粘贴或编辑文本时会立即显示 Fact、Evidence text、Page/section 三个门槛的通过/缺失状态；缺项时提交按钮不会调用后端，并提示补齐缺失字段。最终是否入库仍以后端上传诊断和文献笔记质量门槛为准。
- Paper Writer RAG 新增 `/api/projects/:id/rag/text-import/preview` 文本证据 dry-run 预检接口：复用后端文献笔记质量门槛和上传诊断，返回是否可导入、预计 chunks、诊断状态和成功标准，但不写入 `research_corpus`、不重建索引。OCR/人工摘录导入面板新增“后端预检”按钮，用户可在正式导入前看到最终同源判定。
- Paper Writer RAG 新增 `/api/projects/:id/rag/ocr-jobs` OCR/摘录恢复队列接口：当 PDF 扫描版、加密或正文不可抽取时，用户可把文档加入队列，队列会记录来源文档、恢复原因、服务器 OCR 能力、下一步动作、可复制文献笔记模板和是否阻塞引用写作；队列只记录恢复任务，服务器 OCR 必须通过 `/rag/ocr-jobs/run` 显式触发。通过 `/rag/text-import` 导入同一来源的已核对 OCR/人工摘录文本后，相关队列任务会自动标记为 `imported`。
- Paper Writer 工作台原型新增“OCR / 摘录恢复队列”侧栏模块：文档恢复诊断旁提供“加入 OCR/摘录队列”，队列卡片展示 blocked/no-tool、needs-user-text、queued、imported 等状态，并提供粘贴 OCR/摘录导入、复制模板和复制路径入口；分析任务后自动刷新队列，也支持手动刷新。
- Paper Writer RAG 新增 `/api/projects/:id/rag/ocr-jobs/run` 受控服务器 OCR 执行接口：当服务器检测到 OCRmyPDF 时，可对队列中的 PDF 生成新的 `*.ocr.pdf` 证据文件并重新走 PDF 抽取、上传诊断和 RAG 索引；原 PDF 不会被覆盖。若服务器缺少 OCRmyPDF 或 OCR 后仍无可引用 chunk，队列会保持阻塞并引导用户改用已核对 OCR/人工摘录导入。
- Paper Writer 工作台 OCR/摘录恢复队列支持直接“运行服务器 OCR”：状态为 queued 且服务器具备 OCR 能力时显示运行按钮，运行结果会展示 OCR 输出文档、上次错误和下一步动作；成功后自动重新分析工作台，让新证据进入 RAG 健康、证据包和引用安全门槛。
- Paper Writer 新增 API 级端到端生产链路测试：覆盖后端预检 OCR/人工摘录证据、正式导入 RAG、生成写作工作台上下文、审查危险草稿并拒绝未支持作者年份/量化细节、携带上一轮 review 复审修订稿、确认阻塞项已解决，以及对修订后的单句 claim 运行证据检查但仍禁止自动写入正文。
- Paper Writer 工作台原型路由测试新增页面结构级回归：在真实浏览器依赖不可用时，仍会验证静态页面包含证据上传、OCR/人工摘录导入面板、后端预检、AI 输出审查、单句检查、修订进展等关键控件和处理函数，并断言导入链路没有退回 `window.prompt`。
- Paper Writer 工作台聚合接口在 `rag.health` 中提供用户级证据库诊断，包括 `healthy`、`needs-attention`、`unusable` 状态、中文说明、健康分和问题列表，让前端优先展示“当前证据能不能放心写论文”，而不是只展示 chunks 等技术指标。
- Paper Writer 工作台聚合接口在 `rag.repairGuide` 中提供证据库修复向导，会把空证据库、PDF 解析失败、metadata-only 文档、没有可检索正文和当前任务检索无命中转成用户可执行的修复卡片，包含受影响文档、推荐动作和修复成功标准；新增 `repairPlan` 和可复制 `copyText`，把修复项整理为阻塞优先的执行顺序，标明哪些问题会阻塞引用写作；工作台原型已展示该向导、“复制修复计划”和可点击修复动作，帮助用户知道该重新上传 PDF、补 Markdown 笔记、重建索引还是换关键词，并直接进入对应控件。
- Paper Writer 工作台聚合接口新增 `rag.documentReadinessGuide` 文档引用可用性向导，会基于文档解析元数据把每个证据文档标记为“可用于引用检索 / 可作为文本线索 / 只有文件信息 / 解析失败”，给出是否阻塞引用写作、推荐动作和成功标准；工作台原型的最近文档列表会展示该状态并支持复制文档可用性报告。
- Paper Writer 工作台聚合接口新增 `rag.queryAssistant` RAG 检索助手，会根据当前任务、检索命中、证据覆盖度、PDF 解析状态和证据库健康情况，把空库、解析不可用、无命中、证据偏薄等状态转成中文检索建议；工作台原型新增独立“RAG 检索助手”面板，展示可点击推荐检索词、补来源步骤和可复制检索计划。
- Paper Writer 工作台聚合接口新增 `rag.queryRewriteGuide` RAG 检索改写指南，会把当前任务和命中状态改写成“主题范围 / 方法对比 / 局限与 Gap / 实验与结果 / 引用线索”等分组查询；工作台原型会在 RAG 检索助手中展示这些分组，每个 query 可一键填入检索框，并支持复制完整改写方案。
- Paper Writer 工作台聚合接口额外返回 `workflowHints`，把空证据库、PDF 解析失败、仅 metadata 文档、证据检索无命中、缺目标章节、推荐 Skill 和可复制证据等状态转成中文“下一步动作”，方便前端直接渲染救场提示。
- Paper Writer 前端实现契约记录在 `docs/paper_writer_ux_contract.md`，覆盖任务工作台、Skill Picker、Evidence Library、Chat 证据抽屉和 Chat / Agent / Tools 模式边界。
- Paper Writer 保留无构建依赖的 Legacy 工作台静态原型 `app/apps/frontend/public/paper-writer-workbench.html`，但默认不公开；仅当 `OPENPRISM_ENABLE_LEGACY_WORKBENCH=true` 时，后端才通过 `/writing-workbench` 和 `/paper-writer-workbench.html` 提供迁移期兼容访问。页面显示 Legacy / Prototype banner 和正式 `/projects` 入口，正式 React UI 不链接原型；独有功能迁移与弃用条件见 `docs/legacy_workbench_lifecycle.md`。
- Paper Writer 工作台原型的 RAG 检索现在会在命中结果展示后自动重新加载工作台上下文，让正式 `evidencePack`、证据包指纹、写作提示词和生产可用性门禁同步使用当前检索词；用户不再需要额外点击“重新评估生产可用性”才能让后续生成、审查和安全采纳使用刚检索到的证据。
- Paper Writer Skill 推荐卡和 Skill 导航卡新增原生悬停摘要，`title` 中按“中文标题 / 英文副标题 / 中文分类 / 基本功能”组织信息；页面内仍保留 hover/focus 展开的详细输入、产出、适合和不适合说明，帮助用户不用记英文 Skill 名就能判断该选哪个。
- 仓库上传准备新增本地生成物忽略规则：`app/.codegraph/`、`app/.tmp-test-home/` 和 `app/.tmp-v8-coverage/` 不再出现在待上传文件中，避免把测试 home、npm 缓存、覆盖率 JSON 或本地代码图数据库误提交到 GitHub。
- Paper Writer AI 草稿请求现在会把正式证据包使用的 `evidenceQuery` 写入 `aiDraftRequest.send.rag.query`，工作台前端发送时也会用当前 RAG 检索框或证据包 query 构造 `activeRagRequest`；生成、输出审查、单句检查和安全采纳包使用同一检索语义，避免用户刷新证据包后模型生成阶段仍按任务文本重新检索。
- Paper Writer 工作台的复制操作增强了失败检测：Clipboard API 不可用时会走 textarea fallback，但现在必须确认 `document.execCommand('copy')` 返回成功；如果浏览器拒绝剪贴板写入，会明确提示用户手动复制，不再误报“已复制证据包/修订提示词/安全采纳包”。
- Paper Writer 工作台在重新分析任务、上传/删除证据、重建索引或刷新检索词后，会统一调用 `resetDerivedReviewState()` 清理旧 AI 输出审查、单句检查、证据包指纹和安全采纳包，避免用户在新证据上下文下继续复制旧审查结果或旧采纳包。
- Paper Writer 工作台的“AI 返回”区域现在支持直接粘贴或手动编辑已有 AI 回复；一旦用户编辑该内容，工作台会调用 `invalidateAiReplyReviewState()`，自动失效旧输出审查和旧安全采纳包，并提示必须重新审查，避免手动改稿后继续沿用旧审查结论。
- Paper Writer 工作台会记录“分析任务”时的项目、任务、上下文和 RAG 检索词签名；如果用户之后修改这些输入却直接点击发送、审查 AI 输出、单句检查或生成安全采纳包，页面会要求先重新分析任务，避免旧 `evidencePack`、旧写作提示词和新输入混用。
- Paper Writer 工作台的高风险复制入口也会复用输入签名门禁；复制写作提示词、证据包、完整工作包、修订提示词、Skill/模式决策和 RAG 检索计划前，如果任务、上下文或检索词已经变化，会先要求重新分析任务，避免用户把旧工作包粘贴到外部 Chat 继续写作。
- Paper Writer 工作台从旧 AI 审查结果继续操作时也会校验输入签名；点击“使用修订提示词”或把待检查 claim 放入单句检查框前，如果任务、上下文或 RAG 检索词已变化，会要求重新分析任务，避免旧审查队列驱动新任务。
- Paper Writer 工作台会在用户编辑项目、任务、目标章节、补充上下文或 RAG 检索词时立即标记当前分析结果过期，清理旧审查、旧采纳包、旧提示词覆盖和旧完整工作包，并提示重新点击“分析任务”；任务入口、模式提示、推荐检索词和澄清问题等程序化填入路径也会触发同一过期标记。
- Paper Writer 工作台的过期状态现在会清空核心分析面板，包括生产可用性、论文流程、模式操作中心、上下文摘要、写作计划、Skill 决策/导航、RAG 证据包、验收清单和完整工作包；用户修改输入后不会继续看到旧任务的“可用性/证据/Skill”结论。
- Paper Writer 工作台在切换项目或填入推荐 RAG 检索词后，会保留明确的“旧分析已失效，请重新分析/检索”提示，不再用普通操作成功文案覆盖 stale 提醒。
- Paper Writer 工作台在分析过期时会同步重置发送安全门槛，禁用发送确认框并提示必须重新分析后才能创建会话或发送给 AI，避免旧模式/旧阻塞项继续显示在发送区域。
- Paper Writer 工作台的“演示数据”按钮会同步左侧项目 ID、任务、上下文和 RAG 检索词，再渲染 demo 工作台，避免演示面板和用户原先输入混用。
- Paper Writer 工作台会把后端地址和 API Token 变化也视为分析过期信号；切换后端或身份后必须重新分析任务，避免旧后端/旧用户的证据包、Skill 决策和发送门槛被用于新环境。
- Paper Writer 工作台加载项目列表时会先清空旧项目下拉选项并显示加载中；加载失败时改为“项目列表加载失败，可手动填写项目 ID”，避免切换后端后继续选择旧后端残留项目。
- Paper Writer 工作台保存或清除 API Token 后会明确提示旧分析已失效并要求重新分析，避免用户以为 Token 持久化只是配置动作而当前证据包/发送门槛仍可继续使用。
- Paper Writer 最近证据文档删除从浏览器原生确认框升级为页面内确认条：删除前校验当前项目、任务、上下文和 RAG 检索词没有过期，并展示待删项目、路径、删除后果、确认和取消按钮；确认后才调用删除接口并刷新工作台，避免切换任务或后端身份后误删旧证据文档。
- Paper Writer OCR/人工摘录导入面板会跟随工作台过期状态一起关闭；后端预检和正式导入前也会校验当前项目、任务、上下文、RAG 检索词、后端地址和 Token 标记，避免旧文档摘录被导入到新任务或新身份的证据库。
- Paper Writer 论文任务入口扩展到“基金申请 / Research Proposal”“论文转演示 / Slides”“学术海报 / Poster”，并和 Skill 意图路由、上下文预填、启动说明、演示数据和 Skill 导航卡片同步；用户可以从中文场景卡直接开始，不必先知道 `grant-proposal`、`nature-paper2ppt`、`poster-design` 的英文 Skill 名。
- Paper Writer Skill 标签改为中文优先展示：相关工作、研究空白、引言、动机、润色、审稿意见、基金、海报等作为主要筛选标签，保留 BibTeX、DOI、PPT、Beamer、Rebuttal 等必要学术/工具术语，减少用户在标签区看到内部英文配置的概率。
- Paper Writer 论文任务入口继续补齐真实写作场景：新增“检索最新相关工作”“写 Conclusion / Future Work”“统计分析 / 显著性检验”“投稿材料 / 声明检查”四个入口，并同步 Skill 意图路由、上下文缺口、启动说明和前端演示数据；`帮我找最新相关工作` 会先进入学术检索，`cover letter / ethical statement / data availability` 会进入投稿材料检查，`conclusion` 和统计检验不再返回空任务入口。
- Paper Writer 投稿和收尾场景路由继续细化：`limitations / limitation section` 进入 Discussion 写作，`highlights` 进入摘要压缩，`graphical abstract` 进入图表规划，`acknowledgements / author contributions / supplementary material / supporting information` 进入投稿材料检查；投稿材料入口文案同步覆盖致谢、作者贡献、补充材料、伦理、数据/代码可用性和利益冲突声明。
- Paper Writer 审稿回复入口从“写 rebuttal”扩展为返修工作流入口：`reviewer comments / revision plan / revision checklist / revision summary / major concerns / minor concerns / action items / rebuttal cover letter` 都会进入“审稿回复 / Rebuttal”，输出逐条意见拆解、revision plan / 正文修改矩阵、rebuttal 草稿和补实验 action list，避免返修任务被摘要、引言、投稿 checklist 或普通 cover letter 抢走。
- Paper Writer 新增“论文规划 / Outline”内置 Skill 和任务入口：用户输入“制定论文写作计划”“生成论文 outline”“把 idea 变成 paper structure”“检查论文故事线”“列出审稿人可能会问的问题”时会推荐 `paper-planning`，输出 paper outline、故事线、贡献图谱、证据/实验依赖、写作 roadmap 和 reviewer 风险清单；前端任务入口、Skill 导航标签、上下文筛选和悬停说明同步中文优先展示。
- Paper Writer Skill API 和管理 UI 新增执行就绪度契约：返回 commands、credentials、network、files、Provider capabilities、side effects、cost class、`ready/degraded/unavailable`、静态 `dryRun` 与 `lastRun`。未显式声明执行元数据的旧 YAML Skill 保守显示为 `degraded`，缺必需依赖时显示 `unavailable` 并禁止直接激活；“就绪检查”只做只读静态检查，不运行脚本、不联网、不调用模型。详细边界见 `docs/skill_execution_readiness.md`。
- Provider 设置列表现在使用只读安装/认证探针生成 CLI readiness，不再仅凭服务器 Token 把 Codex、Claude 或 Copilot 标记为可用；未安装、未认证或认证未知的 CLI 会显示原因并在下拉框中禁用，HTTP Provider 仍必须通过显式连接测试后才能保存。
- 项目首页在浏览器标签页没有服务器访问令牌、或令牌无效时，不再把项目/模板 401 显示成空项目和原始 `Authentication required` 错误；页面显示明确的“需要服务器访问令牌”解锁卡，区分缺失与无效令牌，并可直接打开设置输入令牌。应用正确令牌后项目、候选目录和模板无需刷新即可重新加载。
- 项目首页默认“全部项目”会显示 `papers/` 下所有未进入回收站的受管工程，包括已归档工程；归档工程仍保留状态标识和独立筛选。服务器令牌可直接在锁定卡片中输入，不再要求先进入模型设置。模型配置完全可选；没有可用模型时仍可打开文件、手动编辑，并通过保存按钮或 Ctrl/Cmd+S 写回项目。
- 项目列表将真实“工程文件夹”作为显式身份展示，并支持按显示名称、稳定项目 ID、真实目录名搜索；搜索会归一化大小写、连字符、下划线和空格，因此 `MoE-Prune` 可定位实际目录 `moe_prune`，即使其项目显示名称是论文标题。
- Paper Writer Skill `lastRun` 账本持久化到数据根的权限受限 JSON，并接入真实 AI 请求：项目、章节和会话实际应用的 Skill 在模型请求成功或失败后记录 `model-guided-execution`、模式、耗时、Provider/model/version provenance、可审查的项目相对产物、成本（如 Provider 提供）和副作用；账本不保存用户 Prompt、模型正文、绝对路径或凭据，且运行成功不会自动把元数据不足的 Skill 从 degraded 提升为 ready。
- 没有活动对话时，AI 助手空状态也提供“管理 Skills”入口，用户无需先创建无意义会话即可检查安装条件；Skill 搜索后的“全部展开/折叠”按当前可见分类的真实 membership 判断，不再因隐藏分类数量相同而误判为已展开。
- Paper Writer 目标 venue 风格改写继续归入“论文润色 / 语言编辑”：`帮我把论文改成 ACL 风格`、`NeurIPS 风格` 等请求会推荐 `writing-polish`，要求确认目标段落/章节并保留事实、引用、数字、LaTeX 命令和技术术语；不会因为句子里有“论文”而误进入 `paper-planning`。
- Paper Writer RAG 文档可用性卡的主修复动作支持直接打开页面内 OCR/人工摘录导入面板：当文档是 metadata-only、扫描 PDF 或需要补充人工摘录且后端已生成 Markdown 文献笔记模板时，用户可从文档卡点击“粘贴 OCR/摘录导入”进入质量预检和后端 dry-run，不必先去文件选择器里手动找入口。
- Paper Writer Chat / Agent / Tools 模式路由继续细化：贡献强度检查、baseline 差异比较、实验是否支撑 claim、reviewer 视角挑刺、abstract 是否缺贡献、段落能否放进正文等会进入可确认的 Agent 审查流程；纯解释任务如“解释这篇论文的方法”“这句话是什么意思”仍保留 Chat。`paragraph` 不再因包含字符串 `rag` 被误判为 RAG 诊断。
- Paper Writer 中后期写作任务路由继续补齐：method 小节标题和 appendix proof sketch 进入 Method/Algorithm，table/ablation 结果转正文进入 Results，figure caption 支撑性检查进入图表 Agent，related work 按主题重组进入文献综述 Agent，review 补实验计划进入审稿回复，fake citation 检查进入输出审查。
- Paper Writer 上下文缺口提示会识别任务文本里的明确目标线索：`.tex/.md/.bib/.pdf` 文件名、Figure/Table 编号、Reviewer Comment 编号、Appendix 编号和“当前/选中”内容都会作为目标定位，不再额外要求用户选择目标章节；泛泛的 related work 写作仍会继续要求明确目标章节和证据来源。
- Paper Writer 证据型写作路由继续扩展：找支持 claim 的论文、找反例/negative evidence、逐句证据编号、检查哪些句子缺引用、给章节每个 claim 配 citation、Table/Figure 结论证据支撑、AI related work 合并前审查、PDF 中 novelty 支撑证据提取都会进入 `evidence-review` 输出审查和证据安全闭环；单句“这句话需要引用哪几篇论文 / 当前 claim 证据够不够”保持 Chat 内轻量单句检查。
- Paper Writer 证据审查上下文提示更贴近用户表达：`introduction` 等章节级 citation mapping 会被当作已给出目标章节，不再重复要求选择文件；泛泛“根据证据写 related work”仍要求确认目标章节，避免自动把草稿写入错误位置。
- Paper Writer 返修工作流路由继续细化：`novelty weak`、`response table`、rebuttal 承诺转正文修改 checklist、过度承诺检查、revision summary 和 Reviewer 2 补实验计划都会进入 `reviewer-response`，保持 Agent 模式和人工确认门槛；response table 不再因包含 `table + 生成` 被误升级到 Tools。
- Paper Writer 投稿材料上下文提示更细：NeurIPS/checklist 填写和 camera-ready/anonymous 规则冲突只要求 venue rules，不再机械要求 compiled PDF 或目标文件；匿名 appendix、supplementary material 泄露作者信息、artifact appendix 等具体材料审查仍要求目标材料位置。
- Paper Writer LaTeX 工具路由识别 `latexmk` 编译请求：`运行 latexmk 编译 main.tex 看看错误` 会进入 `latex-debugging` 和 Tools 模式，要求粘贴/提供 LaTeX 报错日志，并保持运行命令前确认。
- Paper Writer 图表与统计工作流路由继续细化：CSV/ROC/matplotlib/plot.py/柱状图/折线图等生成类任务进入 `nature-figure` + Tools；Figure 流程图、caption、颜色、排版太宽、编号和引用一致性检查进入 `nature-figure` + Agent；t-test、p-value、异常值、results.csv、mean±std 等统计计算进入 `statistical-analysis`，而 confidence interval 报告解释保留 Chat。
- Paper Writer 本地语言编辑入口继续低摩擦化：`这段/这句` 翻译、逐句表达诊断、tense consistency、压缩 30%、降低 AI 痕迹、保留 citation/LaTeX 公式、Figure caption 英文简化都会进入 `writing-polish`，不再要求用户先选择目标文件；需要写入或保存时仍保持 Agent 模式和人工确认。
- Paper Writer 摘要级短输出和投稿材料目标识别更贴近用户习惯：生成 title/keywords 或压缩 abstract 只要求补论文概要，不再额外要求目标章节；plain `cover letter` 会被视为投稿材料目标，只要求 venue rules，不再机械要求选择 `target_section_or_file`。
- Paper Writer 论文生命周期后段任务路由继续打磨：slides/PPT/Beamer、poster、proposal/grant、camera-ready checklist、data/code/ethics availability statement 都进入 Agent 工作流但不再要求目标章节；Zotero/BibTeX 清理和未定义引用检查进入 `reference-management`；arXiv anonymous 版本转换进入投稿检查；benchmark paper 加入证据库进入学术检索。
- Paper Writer RAG 与投稿 metadata 语义进一步区分：`PDF 只有 metadata / metadata-only` 会进入 RAG 证据库修复入口，而 `PDF metadata 是否匿名` 进入投稿检查并要求 compiled PDF；supplementary/appendix 是否泄露作者信息仍要求目标材料，避免在没有材料的情况下给出虚假安全结论。
- Paper Writer 安全采纳包会从完整 Workbench context 读取已确认目标章节：当用户已通过结构化上下文选择 `target_section_or_file` 后，review-answer、adoption-package 和 API 返回上下文会保持同一个目标章节；采纳包仍只生成可人工应用的预览和 diff 计划，不会自动写入论文文件。
- Paper Writer RAG 新增只读 `/api/projects/:id/rag/health` 与“RAG 索引健康状态”卡：明确声明当前是 `local-keyword-overlap` 本地关键词证据检索而非语义向量检索，显示 healthy/degraded/corrupt/rebuilding、最近索引时间、generation、SHA-256 corpus fingerprint、文件/分块统计和逐文件 parser/chars/chunks/warnings/error；“修复 / 重建索引”作为显式恢复动作，每次生成新 generation，语料不变时 fingerprint 保持稳定。health GET 对缺失或损坏索引严格只读，不创建、隔离或重建文件。
- Paper Writer 核心前端移除 Google Fonts 远程 `@import`，使用系统本地的无衬线、CJK、衬线和等宽字体回退；项目页和编辑器在离线、内网或受限网络中不再发送 `fonts.googleapis.com` / `fonts.gstatic.com` 请求。静态契约和隔离 Playwright 同时锁定无远程字体请求及 CJK 字体栈。
- Paper Writer Provider 设置页新增四步首次配置向导：分别展示服务器访问令牌、Provider 类型、模型/CLI 凭据和连接验证状态；明确服务器 Token 不是模型 API Key，HTTP Provider 需要 endpoint 与凭据，CLI Provider 依赖服务器已安装且已登录的 executable，并提示当前 CLI 仅用于只读 Chat，修改文件必须进入独立可审查 Task Agent。隔离 Playwright 实际切换 Codex CLI 验证中文说明和权限边界。
- Paper Writer 源码 artifact 策略禁止在前端源码树保留编辑器备份文件；删除无人引用且明显落后于当前组件的 `SkillsSelector.tsx.bak`，并在 `.gitignore` 与测试中锁定 `*.bak`、`*.orig`、`*~`，避免备份副本继续污染搜索、审查和打包归因。
- Paper Writer Playwright 运行状态不再提交到仓库：删除根目录和 `app/` 下互相矛盾的 `.last-run.json`，统一忽略 `test-results/` 与 `playwright-report/`；隔离 E2E runner 继续把每次结果放到独立 `/tmp` 目录并在结束后清理，正式验收证据应由 CI artifact 或明确文档保存，而不是提交易过期的本机状态。
- Paper Writer 依赖安全基线新增 lockfile 回归：按生产/开发路径定向升级 tar、React Router、fast-uri、brace-expansion、shell-quote 和 Vite，`npm audit` 从 7 项（2 moderate、3 high、2 critical）降为 0；`dependencySecurityContract.test.mjs` 检查所有已安装副本不低于修复版本，`docs/dependency_security.md` 记录可达性、版本和最终发布复查要求。
- Paper Writer 运行地址默认值改为部署可移植配置：后端仍绑定 `0.0.0.0` 保证 LAN 可见，Vite 开发代理默认连接 loopback 后端，启动提示和 MCP 发现地址通过 `OPENPRISM_PUBLIC_HOST` 配置；源码与脚本不再固化当前工作站 IP。生产日志同时执行内容最小化，不输出论文 Prompt、消息、工具结果或项目路径，仅保留非敏感计数型诊断。
- Paper Writer 模板 catalog 以 committed manifest 为用户事实：ACL、CVPR、NeurIPS、ICML、arXiv 和 ICLR 2026 均声明真实入口文件、名称和说明；测试会扫描 bundled LaTeX 目录并拒绝未登记模板。模板 API 只返回当前有模板的业务分类，“全部”筛选由前端唯一生成，避免空分类和重复分类按钮。
- Paper Writer RAG 外部多源检索返回逐来源透明状态：Semantic Scholar、arXiv、Crossref、OpenAlex 分别显示可用/无匹配/失败、耗时、结果数和脱敏错误码，单源失败不会被伪装成空结果。结果保留来源原始分数及其口径，跨来源排序只使用来源内归一化排名，避免把引用数和不同数据库 relevance score 当作同一尺度；真实 Chromium 已验证成功与失败来源可同时呈现。
- 2026-07-22：受管项目新增统一 Project Locator。新建、ZIP 导入、arXiv 导入和项目复制都会保留完整 UUID 作为稳定 `id`，同时用“安全可读名称 + 8 位 UUID”生成 `directoryName`；支持中文、空格、纯符号回退、超长名称截断和同名项目隔离，`project.json` 统一记录 `id/name/directoryName/createdAt/updatedAt`。
- 2026-07-22：项目重命名会同步迁移磁盘目录并刷新 `updatedAt`，稳定 ID 不变；目标目录已存在时返回 409 且保留原项目，元数据写入失败时尽可能把目录回滚到原位置。项目列表同时返回 `directoryName` 和兼容字段 `dirName`，两者均以实际目录为准。
- 2026-07-22：项目页会把数据根中含论文文件但缺少 `project.json` 的普通目录显示为“发现的论文目录”，只读预览文件数、建议主文件和样例路径；用户明确确认后才生成稳定 UUID 与原子 metadata，注册过程不会移动原目录或论文文件。项目列表同时展示项目显示名、稳定项目 ID 和实际存储目录，并支持复制 ID/目录。
- 2026-07-22：`OPENPRISM_DATA_DIR` 成为项目存储唯一权威根目录；旧 `OPENPRISM_PROJECTS_DIR` 仅在主变量缺失时作为启动兼容别名，两者冲突时主变量优先并输出明确警告。项目、Draw 和 RAG 通过同一 Project Locator 解析 managed `projectId`，`/api/config.projects_dir` 只读反映当前实际根目录。
- 2026-07-22：前端生产构建增加全 JS chunk 500 KiB 硬预算，并采用运行时安全的稳定依赖分组：Markdown 与 LaTeX quick preview 独立懒加载，Markdown renderer 保持单组，CodeMirror 按 view/state、language/parser、commands/search/autocomplete 三个边界拆分。生产浏览器回归会真实打开项目、编辑器和两类预览，防止“构建成功但页面空白”的分包回归。
- 2026-07-22：HTTP Provider endpoint 安全策略增加 DNS-to-socket pinning。临时连接测试会拒绝私网/本机/metadata/reserved 解析结果，并把已校验 IP 集合直接用于实际 TCP/TLS 连接；不会在校验后重新解析，也不会被 Node 环境代理重新解析。每个重定向目标独立校验、固定和限跳，HTTPS 保持原 hostname 的 SNI 与证书校验。
- 2026-07-22：Paper Workbench 的运行环境能力形成独立后端子域，集中生成 OCR 自动恢复、PDF 文本抽取、真实浏览器 E2E 三项 production gate、Playwright 状态读取、依赖修复复验计划和复制文本；主工作台服务只消费稳定 guide，API 字段和用户行为保持不变。
- 2026-07-22（当前复核）：隔离 Playwright 使用单一临时后端和数据根时，默认 E2E 配置固定 `fullyParallel: false`、`workers: 1`，避免项目注册、RAG 重建、会话恢复和 Draw.io 网络模拟在共享状态上互相竞争；`e2eIsolationContract.test.mjs` 锁定该门禁。后续若要恢复并行，必须先实现每 worker 独立后端、端口、数据根和 Token。
- 2026-07-22（当前复核）：Project Locator 新增经过 metadata 身份校验的 `projectId -> projectRoot` 缓存；路径不存在、身份不匹配或被手工移动时自动失效并回退扫描，重命名与已有目录注册会更新缓存。`projectLocator.test.mjs` 覆盖重复查找不重复扫描和手工移动恢复。
- 2026-07-22（当前复核）：Skills 运行账本区分 Provider 请求结果与目标验证结果：`outcome` 使用 `provider_completed/provider_failed/provider_skipped`，另有 `verificationStatus` 和 `objectiveStatus`；成功返回模型不再被 UI 描述成论文目标已通过。
- 2026-07-22（当前复核）：Skill 管理将用户创建的 YAML Skill 写入数据根下的 `.skills/`，与内置 Skill 目录隔离；创建会持久化 categories、中文名称/描述、中文分类和子分类，要求合法 slug 并拒绝重复名称。内置 Skill 在 API 和 UI 两层均受保护，删除自定义 Skill 前需确认并显示成功/失败反馈；Provider 设置保存前必须完成当前配置的连接验证。
- 2026-07-22（当前复核）：CLI Task Agent 的 Provider 列表现在区分 `installed`、`authenticated`、`authStatus` 和真正的 `available`；列表使用受控只读探针，不因服务 Token 未配置而隐瞒安装状态。前端默认优先选择已验证可用的 Provider，不可用项显示原因并禁止创建任务。
- 2026-07-24：HTTP Provider 的“加载模型”支持使用设置表单中尚未保存的 endpoint 与 API Key，通过受保护的 `POST /api/providers/:providerId/models` 获取当前连接的模型列表；如果表单保持已保存地址且 Key 输入框为空，则安全复用服务器已保存凭证。修改 endpoint 后必须重新输入模型 Key。受信任的 LAN 模型地址仍需通过 `OPENPRISM_PROVIDER_ALLOWED_HOSTS` 精确放行。
- 2026-07-24：Draw 设置页支持前端保存独立的生图 Base URL、API Key 和模型，也可显式复用语言模型的 Base URL/API Key；凭据只进入受认证的后端配置接口，不写入 localStorage。最终生图 Prompt 始终是可编辑文本框，既可接收 AI 草稿也可直接手写，生成请求严格执行最终文本；OpenAI-compatible 图片接口同时支持 URL 与 `b64_json` 响应，结果保存到当前项目 `draw/`。
- 2026-07-24：编辑器“最终 PDF”标签改为只读加载最近一次持久化编译产物，点击标签或切换预览不再触发 LaTeX 编译；重新编译只能由“编译/重新编译最终 PDF”按钮显式触发。Skill 选择器支持在同一弹层中复选多个可用 Skill，并通过“添加已选”一次性加入当前会话或 Draw 工作流。
- 2026-07-24：AI Chat/Agent/Tools 流式响应使用分阶段 Provider 超时：响应头默认等待 15 秒，建立响应后只在连续 120 秒没有新数据时中断，持续生成的长回答不设 15 秒总时长上限；两项可由 `OPENPRISM_PROVIDER_RESPONSE_HEADERS_TIMEOUT_MS` 和 `OPENPRISM_PROVIDER_STREAM_IDLE_TIMEOUT_MS` 配置。流式错误会明确失败并保留已生成的中断回答，不会静默当成成功或自动重复提交用户消息。
