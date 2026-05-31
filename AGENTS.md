# 仓库指南

## 项目结构与模块职责

- `apps/web/`：React + TypeScript 前端应用。页面壳层、编排界面、会话看板、活跃 agent 详情等代码放在 `src/` 下。
- `apps/server/`：Node.js + TypeScript 后端应用。HTTP 路由、WebSocket 处理、编排服务、发现流程、运行时适配器等代码放在 `src/` 下。
- `packages/shared/`：共享类型、DTO、枚举、校验 schema 和跨端常量。这里应只放与传输层无关的公共契约。
- `packages/agent-protocol/`：agent 运行时事件 schema，以及面向适配器的注册、遥测、控制、发现协议定义。
- `packages/ui/`：当前端需要超出单应用范围的复用组件时，将通用 UI 原语沉淀到这里。
- `scripts/`：本地开发辅助脚本，例如主机初始化、tmux 检查、种子数据、发布辅助等。
- `docs/`：产品说明、设计文档、架构
### 服务边界

- 编排状态和焦点管理放在后端服务层，不要塞进传输适配器。
- 传输相关逻辑必须隔离在各自适配器内，例如 `local-process`、`remote-launch`、`remote-tmux`。
- 以 `agentSession` 作为主要领域对象，不要把 terminal ID 或 tmux pane ID 暴露为应用层主模型。

## 核心领域模型

- `workspace`：一组相关 agent 会话的逻辑容器。
- `host`：本地或远端执行目标。
- `agentSession`：编排器跟踪和控制的主要对象。
- `transportRef`：指向 PTY、进程、SSH 命令或 tmux pane 的实现细节引用。
- `telemetryEvent`：适配器发出的输出活动、心跳、提示检测、附着状态或退出信号事件。

## 构建、测试与开发命令

- 安装依赖：`pnpm install`
- 启动全部开发服务：`pnpm dev`
- 仅启动前端：`pnpm --filter web dev`
- 仅启动后端：`pnpm --filter server dev`
- 类型检查：`pnpm check`
- 代码检查：`pnpm lint`
- 测试：`pnpm test`
- 格式化：`pnpm format`

根目录的 `dev` 命令会在启动前后端之前先预构建一次 `packages/shared`。`web` 和 `server` 各自的 `dev`、`build` 脚本也会先预构建 `packages/shared`，以保证按 package 单独运行时共享类型仍保持同步。

- 本地开发命令应从 login shell 启动，例如 `zsh -l -c 'pnpm dev'`，这样 VS Code Web 及其集成终端才能继承当前用户的 shell 环境，包括 rc 文件中的 PATH 和工具链配置。
- 如果 VS Code Web 里的终端仍然打开成错误的 shell，请修改 code-server 的用户设置，让 `terminal.integrated.defaultProfile.linux` 指向解析后的用户 shell，并配好交互参数，同时继承为 code-server 准备好的 login-shell 环境。
- 如果 workspace filter 或脚本名称发生变化，请在同一次变更中同步更新本文件。

## 任务完成前的最低要求

- 运行 `pnpm format`。
- 先跑与改动最贴近的验证，再补跑受影响的更大范围检查。
- 如果改动涉及后端协议或共享类型，必须同时验证前后端类型检查。

## 编码风格与命名约定

- 默认全仓库使用 TypeScript，除非有非常充分的理由不用。
- 使用 2 空格缩进、单引号，行宽尽量控制在 80 列左右，除非可读性明显因换行受损。
- React 组件使用 PascalCase，变量和函数使用 camelCase，非组件文件名使用 kebab-case。
- 模块职责要聚焦。适配器、注册逻辑、遥测推断、路由等应拆分清楚，避免把代码堆成超大文件。
- 优先使用明确的领域名，例如 `agentSession`、`interactionState`、`activeAgentId`，避免使用 `item`、`data` 这类泛化名字。
- 不要把底层传输输出解析逻辑泄漏到 UI 组件里。

## 前端约定

- UI 组织围绕三层：编排状态层、容器视图层、展示组件层。
- 页面主模型是 `workspace -> agent sessions`，不是 `terminal -> pane`。
- 使用单活跃 agent 焦点模型。键盘输入在默认情况下必须只落到一个活跃会话，除非后续明确引入广播模式。
- `xterm.js` 或终端组件应保留给活跃会话详情区域，不要把它当成整个产品的顶层抽象。
- 状态展示必须诚实，启发式推断出的状态要和显式状态区分展示。

## 后端约定

- 明确分离 registry、telemetry、control、discovery/launch 等后端能力面。
- 适配器事件在进入路由处理或 WebSocket 广播前，必须先归一化为共享协议。
- tmux 集成必须收口在专用适配器里，不要把 tmux 命令拼接散落到无关服务中。
- 会话状态与输出更新使用 WebSocket，生命周期和配置操作使用 HTTP。
- `awaiting_input` 默认视为派生状态，除非某个适配器显式发出输入请求信号。

## 测试约定

- 为遥测推断、焦点路由、适配器归一化逻辑补充单元测试。
- 为会话注册、活跃 agent 切换、stdin 路由、发现流程补充集成测试。
- 前端行为至少覆盖看板排序、活跃 agent 指示和状态徽标，可用组件测试或集成测试实现。
- 优先测试会话编排层，不要过度依赖脆弱的底层传输实现细节。

### 终端能力握手（TUI Capability Handshake）红绿灯测试

**背景**：Copilot CLI 等 TUI 在启动时会向终端发送 Primary DA（`CSI c`）、DSR（`CSI n`）、OSC、DCS 等能力查询序列。xterm.js 会自动应答，并通过 `term.onData` 把应答发回。这些握手应答如果到不了 PTY，TUI 会永远阻塞在等待应答的状态，导致键盘输入被静默丢弃（Codex CLI 不依赖此握手，因此表现正常）。但 Secondary DA（`CSI > c`）是例外：shell/prompt 在行编辑态触发它时，原样转发容易把 `0;276;0c` 回显到命令行里形成噪音。

**必须保护的测试**（位于 `apps/server/src/services/terminal-control-filter.test.ts`、`apps/web/src/lib/terminal-input.test.ts`、`apps/server/src/routes/terminal-websocket.test.ts`）：

1. **forward device-attribute responses to the PTY for capability handshakes**  
   - 输入：`\u001b[?1;2c`（Primary DA 应答）  
   - 断言：必须原样转发到 PTY，不得被过滤为空字符串。

2. **keep DSR replies intact so TUIs receive their status answers**  
   - 输入：`\u001b[0n`（DSR 就绪状态应答）  
   - 断言：必须原样转发到 PTY。

3. **terminal websocket forwards primary device-attribute replies so TUIs can finish their capability handshake**  
   - 在真实 WebSocket 终端会话中，发送模拟的 Primary DA 应答 `\u001b[?1;2c`。  
   - 断言：终端输出中必须包含该序列（即 PTY 收到了握手应答）。

4. **terminal websocket strips secondary device-attribute replies so shell prompts do not echo terminal version noise**  
   - 在真实 WebSocket 终端会话中，发送模拟的 Secondary DA 应答 `\u001b[>0;276;0c`。  
   - 断言：终端输出中不得包含 `0;276;0c`。

**开发约束**：
- 任何修改 `stripTerminalResponsePayload` 或 `sanitizeReplayForTerminal` 的 PR，必须先跑上述测试并确认通过。
- 只有 *replay* 内容（历史回显）允许在服务端被 `sanitizeReplayForTerminal` 清洗；*live stdin* 必须保留 Primary DA、DSR、CPR 等握手/状态应答，但允许过滤会把 shell prompt 污染成噪音的 Secondary DA。
- 如需新增过滤器，必须同步新增对应的“应答被转发”测试用例，遵循先红后绿。

### Focus View 输入路由纪律

**背景**：真实用户并不总是把鼠标点回终端屏幕本体。只要焦点落到 focus view 里的标题、徽标、空白头部等“非交互静态区域”，后续普通字符就必须仍然回到活跃终端；否则 Copilot CLI 会表现成“界面还在，但就是打不进字”。另外，`button` 不是文本输入控件，不能因为它暂时持有焦点就阻止字符回到终端。

**必须保护的测试**（位于 `tests/e2e/copilot-focus.spec.ts`、`tests/e2e/tmux-enhancements.spec.ts`）：

1. **kanban terminal keeps Copilot-like TUI input working after the user clicks outside the terminal**  
   - 在 mock Copilot TUI 已启动后，点击 focus view 标题这类终端外的静态区域，然后立即输入。  
   - 断言：mock 必须收到完整的 `second`，不能丢首字、不能重复首字。

2. **browser: 点击 focus view 标题让终端失焦后，普通字符输入仍会精确回到终端**  
   - 在 tmux mock agent 会话中，点击 focus view 标题，然后直接输入一整行。  
   - 断言：tmux pane 必须收到精确的 `stdin:<marker>`，且点击标题后 `xterm-helper-textarea` 仍保持为 `document.activeElement`。

**开发约束**：
- `AgentFocusView` 的 capture-phase 键盘补救逻辑不得把 `HTMLButtonElement` 或 `HTMLAnchorElement` 当作“正在输入的控件”；否则普通字符会被留在按钮/链接焦点上，活跃终端收不到输入。
- `focus view` 内的非交互静态区域（标题、状态徽标、头部空白区等）必须在 `pointerdown` 阶段把焦点还给 `.xterm-helper-textarea`，而不是等 `keydown` 时再做补救。真正的键盘事件应当尽量直接进入 xterm，而不是依赖合成 `KeyboardEvent`。
- 如果仍需在 `keydown` 中补发事件给终端，必须 `preventDefault()` 原始事件，避免首字符被浏览器默认行为和补发事件各处理一次，形成 `ssecond` 这类重复输入。

## 安全与配置要求

- 严禁提交主机凭证、SSH 密钥或任何机器相关敏感信息。
- 本地覆盖配置放在被 git 忽略的 `.env` 文件中。
- 后端执行命令前，必须校验主机、路径、启动参数等所有输入。
- tmux 和 shell 命令参数必须做清洗或严格约束，防止命令注入。
- 中断、重启、接管附着等破坏性操作，必须在 UI 上显式呈现，不得隐式触发。

### 环境变量与端口可配置性纪律

- `HOST`、`PORT`、`WEB_HOST`、`WEB_PORT`、`WEB_BACKEND_HOST`、`WEB_BACKEND_PORT`、`WEB_HTTPS`、`FILE_BROWSER_DEFAULT_LOCAL_PATH`、`VSCODE_WEB_*` 等“用户会选择/机器相关”的配置，**严禁硬编码到源码**。新增此类配置时：
  1. 在 `apps/server/src/*` 或 `apps/web/vite.config.ts` 中通过 `process.env.XXX ?? 默认值` 读取；
  2. 在 `.env.example` 里新增一行带注释的模板；
  3. 在 `scripts/restart-dev.sh` 里如果有对应的 shell 变量，使用 `${VAR:-${ENV_VAR:-默认值}}` 的方式从 env 中 fallback。
- `.env` 必须保持被 `.gitignore` 忽略（规则：`.env` + `.env.*` + `!.env.example`）。提交前执行 `git check-ignore -v .env .env.example`，确认 `.env` 被忽略且 `.env.example` 可被提交。

### 后台定时器必须 `.unref()` 以避免阻塞测试退出

- 任何仅用于“空闲清理 / 延迟状态迁移”的 `setTimeout` / `setInterval`（如 `VsCodeWebManager.idleTimer`、`SftpService` 连接池的 `idleTimer`、`AgentSessionRegistry` 的 `awaitingInputTimers`），创建后**必须立即调用 `.unref()`**。这类定时器的职责是“在 HTTP 服务仍在跑时做清理”，不应单独 keep Node event loop 活着。
- 违反此规则会导致 `node --test` 在所有测试通过之后进程仍不退出，使 `pnpm -r test` / CI 整条链路被挂死；历史回归见 `memories/repo/e2e.md`。
- 对应回归测试必须断言 `timer.hasRef() === false`：
  1. `apps/server/src/services/vscode-web-manager.test.ts` — “ensureSession registers an unref-ed idle timer so `node --test` can exit after suites finish”
  2. `apps/server/src/services/agent-session-registry.test.ts` — “awaiting_input timer is unref-ed so it cannot block Node process exit”
- 新增此类 timer 时，同步补一条 `.hasRef() === false` 的单测，先红后绿。

## 文档维护要求

- 引入新的适配器、协议事件或编排状态规则时，要在 `docs/` 中记录架构决策。
- 如果项目结构、命令名称或核心工作流发生变化，必须同步更新本文件。


# .AGENTS.md

以下内容是当前仓库的执行级补充规则，与上面的仓库指南同时生效。

## 必须遵守

1. 前端地址必须局域网可见
- 前端开发服务必须绑定 `0.0.0.0`，禁止只绑定 `127.0.0.1` 或 `localhost`。
- 对外说明、联调、截图、测试记录中，优先使用局域网可访问地址，例如 `https://10.30.0.22:3100`。
- 如果同网段设备无法访问该地址，则视为联调准备未完成。

2. 前端默认使用 HTTPS
- 开发环境优先使用 HTTPS 地址，例如 `https://10.30.0.22:3100`。
- 任何涉及回调、跨域、Cookie、WebSocket 的验证，都不能只在 `http://localhost` 场景下验收。

3. 变更范围必须受控
- 新功能代码必须写入本项目约定目录，例如 `apps/web`、`apps/server`、`packages/*`。

4. 安全与配置必须合规
- 严禁提交任何密钥、凭证、Token、SSH 私钥或机器相关敏感信息。
- 本地差异配置写入 `.env*`，并保持 git 忽略。
- 后端执行命令、路径和主机参数时，必须做输入校验与注入防护。

5. 提交前必须完成最小验证
- 至少运行与改动直接相关的检查；涉及跨端或共享类型时，必须同时验证前后端类型检查。
- 常用命令包括：`pnpm check`、`pnpm test`、`pnpm lint`、`pnpm format`。

6. 不得破坏现有工作区状态
- 不得回滚或覆盖与当前任务无关的改动。
- 未经明确指令，不得使用破坏性 git 命令，例如 `git reset --hard`。

7. 新功能必须同步功能清单与红绿灯测试
- 每次新增功能，必须同步更新 `docs/func_list.md`，确保功能清单与当前实现一致。
- 如果新增功能改变了产品概览、架构边界或使用方式，也必须同步更新 `docs/project-overview.md`。
- 每次新增功能，必须新增或更新对应的红绿灯测试，遵循先红后绿，并将其纳入该功能的最小验收范围。

8. 每次修复 bug 必须同步记录到 bug 清单
- `docs/debug_list.md` 是面对仓库读者的 bug 修复记录。
- `memories/repo/debug_list.md` 是仓库级 bug 记忆镜像。
- 每次解决一个 bug，都必须至少在 `docs/debug_list.md` 中追加一条简短记录；如适合沉淀为仓库记忆，也同步更新 `memories/repo/debug_list.md`，写明问题现象、根因或关键修复点，便于后续排查和防回归。

9. 涉及设计逻辑或功能行为的代码改动必须做红绿灯测试
- 任何影响设计逻辑、交互流程、协议语义、状态流转或功能行为的代码改动，都必须补充或更新对应测试。
- 没有现成测试时，默认先写一个能复现问题或需求的失败用例，再让实现转绿。
- 只有纯文档、纯注释、纯样式且不改变行为的改动，才可以不补红绿灯测试。

## 推荐执行习惯

- 在文档、注释和 PR 描述中明确写出“局域网访问地址 + 端口 + 协议（HTTPS）”。
- 任何需要协作联调的前端改动，默认附上可复现的访问方式，包括示例地址、启动命令和验证步骤。
