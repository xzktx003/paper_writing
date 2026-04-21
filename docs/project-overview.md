# Coding Kanban Project Overview

本文档按当前源码梳理仓库功能、模块边界、运行方式和注意事项。历史计划文档只作为背景，本页以 `apps/`、`packages/`、`scripts/` 和 `tests/` 中的实现为准。

## 产品定位

Coding Kanban 是一个面向 CLI Coding Agent 的本地/内网工作台。它把本地 PTY、SSH 远端 PTY、tmux 会话、扫描到的 Agent 工作目录、文件浏览器和 VS Code Web 放在同一个浏览器界面里，核心目标是：

- 同屏观察多个 Agent 会话。
- 快速切换到某个会话继续输入。
- 扫描并接入已有 tmux 或 Agent 工作目录。
- 在聚焦态旁边打开文件系统和 VS Code Web。
- 用一个后端统一处理 PTY、SSH、tmux、文件操作和 WebSocket。

`vibe-kanban/` 不属于本项目实现范围，只能作为参考，除非明确要求不要修改。

## 主要功能

### 会话看板

- 宫格展示所有未隐藏的 `AgentSessionRecord`。
- 卡片显示名称、状态、Agent 类型、主机、工作目录和终端缩略图。
- 支持按服务器、Agent 类型、tmux 类别、目录关键字筛选。
- 支持重命名、隐藏、关闭/脱离、终止 tmux、复制 tmux attach 命令。
- 已隐藏会话进入隐藏抽屉，可以恢复或删除。
- 双击卡片进入聚焦视图。
- 聚焦视图可以直接输入终端，并在侧栏保留其它会话上下文。

### 顶栏和快捷入口

- 顶栏提供：文件、VS Code、新建会话、扫描 tmux、扫描会话、快速连接 tmux、操作提示、菜单栏折叠。
- 顶栏可折叠；折叠状态保存在 `localStorage` 的 `agent-console-layout`。
- “操作提示”按钮弹出以下提示：
  - 双击卡片放大
  - Esc 返回宫格
  - macOS 为 `⌘+E` 快连 tmux，其它平台为 `Ctrl+E`
  - Tab 切换焦点
- 额外快捷键：
  - `Ctrl/⌘+E` 打开快速连接 tmux。
  - `Ctrl/⌘+Shift+S` 打开本地 tmux 扫描弹窗。
  - 聚焦视图中，非终端输入元素聚焦时不会抢走快捷键。

### 新建会话

新建会话弹窗支持本地和 SSH 目标：

- Agent 类型：`copilot`、`codex`、`claude`、`shell`。
- 启动方式：
  - direct：直接启动命令。
  - tmux：通过 `tmux new-session` 启动。
- 名称为空时，前端根据主机、Agent 类型和启动方式自动生成唯一名称。
- 本地会话走 `/api/agent-launch/pty`。
- 远端会话走 `/api/agent-launch/ssh-pty`。
- SSH 目录输入支持目录建议，远端建议依赖免密 SSH 能力。

### 快速连接 tmux

快速连接 tmux 用于快速拉起或接入本机/远端 tmux：

- 主机列表来自 `~/.ssh/config`，并额外提供“本机”虚拟主机。
- 默认命令为 `tmux new-session -A -s <session> -c <dir>`。
- 本机走 `launchPtyAgent`，远端走 `launchSshPtyAgent`。
- 成功后自动进入聚焦视图。

### tmux 扫描和管理

后端 `LocalTmuxAdapter` 支持：

- 本地 tmux 扫描。
- 远端 SSH tmux 扫描。
- 把运行中的 tmux pane 作为可控制 PTY 接入看板。
- 把非运行/观察态 tmux 作为 `remote-tmux-discovered` 记录加入看板。
- 对 tmux 会话执行 refresh、takeover、release、kill。

注意：

- tmux 会话是底层真实进程，`kill` 会杀掉底层 tmux session。
- 对运行中 tmux 的接入会通过 PTY attach，不只是静态观察。
- `transportRef.tmuxSession` 和 `transportRef.tmuxPane` 是 tmux 绑定关系的关键字段。

### 扫描已有 Agent 工作目录

目录扫描接口为 `/api/agent-discovery/scan`，由 `scanAgentDirectory` 实现。

能力包括：

- 扫描本地目录。
- 扫描 SSH 远端目录。
- 识别 Copilot session-state。
- 合并匹配到的 tmux pane，减少同一个会话重复出现。
- 扫描结果可以按 direct 或 tmux 模式加入宫格。

### 终端和 WebSocket

终端由 xterm.js 渲染，后端通过 `node-pty` 和 WebSocket 驱动。

- 终端 WebSocket：`/ws/agent-sessions/:id/terminal`。
- 会先发送 scrollback replay，再发送 `replay-complete`。
- replay 阶段会缓冲 live frame，避免新输出和历史输出乱序。
- 前端会在 replay complete 后解锁 stdin；8 秒兜底避免永久无法输入。
- 后端会过滤终端自动响应 payload，避免 CPR/设备属性响应被写回真实 PTY。
- 支持 resize 消息和 binary 消息，binary 用于 tmux 鼠标等二进制事件。
- 缩略图不直接 resize 真实 PTY，而是用缓存几何尺寸缩放预览。

### 文件浏览器

聚焦视图中可以打开文件面板：

- 本地和 SSH 远端文件列表。
- 目录树、面包屑、显示隐藏文件、过滤、排序。
- 文件预览，文本文件可编辑保存。
- 新建目录、重命名、删除、chmod。
- 上传、下载。
- 支持拖拽上传。
- 文件面板宽度、目录树宽度、预览高度等状态保存在 `localStorage`。

默认本地路径规则：

- 如果设置了 `FILE_BROWSER_DEFAULT_LOCAL_PATH`，优先使用它。
- 否则向上寻找 `pnpm-workspace.yaml`，找到则用仓库根目录。
- 找不到时使用当前进程目录。

### VS Code Web

聚焦本地会话时可以打开 VS Code Web 面板，远端 SSH 会话暂不支持。

后端 `VsCodeWebManager` 支持：

- 优先查找 `code-server`，其次 `openvscode-server`。
- 如果未找到 code-server，会尝试自动执行官方 standalone 安装脚本。
- 一个后端进程内复用一个全局 VS Code Web server。
- 每个会话生成稳定的 `.code-workspace` 文件。
- 用户配置和扩展放在持久目录；扩展目录会优先复用当前用户的 `.vscode-server/extensions`：
  - `~/.local/share/coding-kanban/vscode-web/config.yaml`
  - `~/.local/share/coding-kanban/vscode-web/user-data`
  - `~/.vscode-server/extensions`，若不存在则回退到 `~/.local/share/coding-kanban/vscode-web/extensions`
  - `~/.local/share/coding-kanban/vscode-web/workspaces`

注意：

- 旧版本曾把 code-server 配置放到 `/tmp/coding-kanban-vscode-*`，如果看到每次都要重新配置，先检查是否还有旧 code-server 进程。
- VS Code Web 面板左上角只保留重新加载按钮，不再常驻展示 provider/reused 状态标签。
- `reused` 只表示后端进程复用了同一个 VS Code Web server，不等同于浏览器 iframe 缓存。

## 架构和模块

### 顶层目录

```text
apps/web/        React + Vite + xterm.js 前端
apps/server/     Fastify + WebSocket + PTY/SSH/tmux 后端
packages/shared/ 前后端共享 DTO 和类型
tests/e2e/       Playwright 端到端测试
scripts/         本地开发、截图、测试 tmux 辅助脚本
docs/            当前文档、计划、设计说明和截图资源
memories/        仓库记忆，不是产品运行依赖
```

### 共享模型

核心类型在 `packages/shared/src/index.ts`：

- `AgentSessionRecord`：看板主模型。
- `AgentSourceType`：
  - `local`
  - `remote-connect`
  - `remote-tmux-discovered`
- `InteractionState`：
  - `running`
  - `idle`
  - `awaiting_input`
  - `detached`
  - `exited`
- `AgentTransportRef`：保存 terminal、process、tmux、runtime、SSH 等底层引用。
- `SshTarget` / `SshHostPreset`：SSH 目标和从配置解析出的主机。
- `ScanResult`：目录扫描和 tmux 扫描结果。
- `OpenVsCodeWebResponse`：VS Code Web 打开结果。
- 文件浏览器 DTO：`FileEntry`、`ListFilesInput`、`FilePreviewInput` 等。

### 后端服务边界

`apps/server/src/app.ts` 负责组装：

- `AgentSessionRegistry`：内存会话注册表、排序、订阅、状态快照。
- `PtyRuntimeManager`：本地/远端 PTY 生命周期、scrollback、输入、resize。
- `LocalProcessRuntimeManager`：旧的本地进程运行管理。
- `SshRuntimeManager`：远端连接类运行管理。
- `LocalTmuxAdapter`：tmux 发现、详情、输入、接管、释放、杀会话。
- `LocalFsService`：本地文件系统。
- `SftpService`：远端 SFTP 文件系统。
- `VsCodeWebManager`：code-server/openvscode-server 生命周期。

### 后端 HTTP 和 WebSocket

主要路由：

- `GET /api/health`
- `GET /api/agent-sessions`
- `GET /api/agent-sessions/:id`
- `POST /api/agent-sessions/register`
- `POST /api/agent-sessions/focus`
- `PATCH /api/agent-sessions/:id`
- `DELETE /api/agent-sessions/:id`
- `POST /api/agent-launch/local`
- `POST /api/agent-launch/remote`
- `POST /api/agent-launch/pty`
- `POST /api/agent-launch/ssh-pty`
- `POST /api/agent-sessions/:id/resize`
- `POST /api/agent-sessions/:id/stdin`
- `POST /api/agent-sessions/:id/reconnect`
- `POST /api/agent-discovery/tmux/scan`
- `POST /api/agent-discovery/tmux/add`
- `POST /api/agent-sessions/:id/tmux/kill`
- `POST /api/agent-sessions/:id/tmux/takeover`
- `POST /api/agent-sessions/:id/tmux/release`
- `POST /api/agent-sessions/:id/tmux/refresh`
- `POST /api/agent-discovery/scan`
- `POST /api/agent-sessions/:id/vscode-web`
- `GET /api/ssh-hosts`
- `POST /api/directory-suggestions`
- `POST /api/fs/list`
- `POST /api/fs/preview`
- `POST /api/fs/operation`
- `POST /api/fs/chmod`
- `POST /api/fs/download`
- `POST /api/fs/upload`
- `GET /ws/agent-sessions`
- `GET /ws/agent-sessions/:id/terminal`

### 前端模块

主要组件：

- `App.tsx`：全局状态、会话订阅、路由弹窗、聚焦/宫格切换、侧栏工具状态。
- `TopBar.tsx`：顶栏、操作提示、主入口、折叠。
- `AgentGrid.tsx` / `AgentGridCard.tsx`：宫格和卡片。
- `AgentFocusView.tsx`：聚焦终端和会话切换。
- `TerminalView.tsx`：xterm.js、WebSocket、replay、输入所有权、缩略图几何缓存。
- `NewSessionDialog.tsx`：新建本地/SSH/direct/tmux 会话。
- `DiscoveryDialog.tsx`、`TmuxDiscoveryPanel.tsx`、`AppDiscoveryPanel.tsx`：扫描和加入宫格。
- `QuickTmuxConnect.tsx`：快速连接 tmux。
- `FileBrowserDrawer.tsx`：文件浏览器。
- `VSCodeDrawer.tsx`：VS Code Web iframe 管理。
- `HiddenSessionsDrawer.tsx`：隐藏会话管理。
- `FilterBar.tsx`：筛选条。

前端状态持久化：

- `agent-console-layout`：顶栏折叠状态。
- `file-browser-ui-state`：文件浏览器主/侧面板尺寸和折叠。
- `side-panel-session-state`：每个会话打开的是文件还是 VS Code，以及选中的主机。
- `focus-view-state`：聚焦会话和视图模式。
- `file-browser-tree-width`、`file-browser-preview-height`：文件浏览器内部布局。

## 启动和访问

### 安装依赖

```bash
pnpm install
```

### 推荐启动

```bash
./scripts/restart-dev.sh
```

该脚本会：

- 清理 3000/4000 端口监听。
- 启动后端和前端。
- 默认开启 HTTPS。
- 生成或复用 `.dev-runtime/certs/` 下的自签证书。
- 写日志到 `.dev-runtime/server.log` 和 `.dev-runtime/web.log`。

常用变量：

```bash
WEB_PORT=3100 SERVER_PORT=4100 ./scripts/restart-dev.sh
WEB_HTTPS=0 ./scripts/restart-dev.sh
WEB_HTTPS_SAN='DNS:localhost,IP:127.0.0.1,IP:10.30.0.22' ./scripts/restart-dev.sh
```

### 手动启动

前端：

```bash
pnpm --dir apps/web dev -- --host 0.0.0.0
```

后端：

```bash
pnpm --dir apps/server dev
```

注意：

- 前端默认端口 3000，后端默认端口 4000。
- 手动启动前端默认是 HTTP，访问 `http://10.30.0.22:3000/`。
- 不要用 `https://10.30.0.22:3000/` 访问一个 HTTP dev server。
- 如果只启动前端，页面会打开，但 API、WebSocket、tmux、文件浏览器、VS Code Web 都不可用。
- Vite 前端代理 `/api` 到 `http://localhost:4000`，代理 `/ws` 到 `ws://localhost:4000`。

### 健康检查

```bash
curl http://127.0.0.1:4000/api/health
```

预期：

```json
{"status":"ok"}
```

## 环境变量和配置

### 前端

- `VITE_API_BASE_URL`：覆盖 API 基础地址。默认空字符串，使用同源代理。
- `VITE_DEV_HTTPS=1`：前端 dev server 使用 HTTPS。
- `VITE_DEV_HTTPS_CERT`、`VITE_DEV_HTTPS_KEY`：HTTPS 证书路径。

### 后端

- `HOST`、`PORT`：Fastify 监听地址和端口。
- `TMUX_BINARY`：指定 tmux 二进制路径。
- `SHELL`：本地/远端交互 shell 优先选择。
- `FILE_BROWSER_DEFAULT_LOCAL_PATH`：文件浏览器默认本地目录。
- `VSCODE_WEB_PUBLIC_HOST`：覆盖返回给浏览器的 VS Code Web host。
- `VSCODE_WEB_BIND_HOST`：VS Code Web server 绑定地址，默认 `0.0.0.0`。
- `VSCODE_WEB_EXTENSIONS_DIR`：覆盖 VS Code Web 的扩展目录；默认优先使用 `~/.vscode-server/extensions`。

### SSH

主机列表从当前用户 `~/.ssh/config` 解析，主要使用：

- `Host`
- `HostName`
- `User`
- `Port`
- `IdentityFile`

远端文件浏览、目录建议、SSH PTY、远端 tmux 都依赖 SSH 客户端可用。

## 数据和持久化

### 后端运行态

当前会话注册表是内存态。后端重启后：

- 看板里的会话记录不会自动完整恢复。
- 底层 tmux 会话仍存在，可以重新扫描加入。
- 本地 PTY 进程一般会随后端退出而结束。

README 中“重启后支持恢复历史对话”仍是 TODO。

### VS Code Web 持久数据

路径：

```text
~/.local/share/coding-kanban/vscode-web/
├─ config.yaml
├─ user-data/
├─ extensions/
└─ workspaces/
```

如果发现每次打开 VS Code 都像新环境：

1. 检查是否有旧 code-server 进程仍使用 `/tmp/coding-kanban-vscode-*`。
2. 杀掉旧进程。
3. 删除旧 `/tmp/coding-kanban-vscode-*` 目录。
4. 刷新前端，重新打开 VS Code 面板。

### 前端 localStorage

多个 UI 偏好存在浏览器本地。如果布局异常，可清理相关 key：

- `agent-console-layout`
- `file-browser-ui-state`
- `side-panel-session-state`
- `focus-view-state`
- `file-browser-tree-width`
- `file-browser-preview-height`

## 验证命令

根目录：

```bash
pnpm test
pnpm check
pnpm build
pnpm format
```

前端：

```bash
pnpm --dir apps/web test
pnpm --dir apps/web build
pnpm --dir apps/web format
```

后端：

```bash
pnpm --dir apps/server test
pnpm --dir apps/server build
pnpm --dir apps/server format
```

共享类型：

```bash
pnpm --filter @agent-orchestrator/shared build
```

E2E：

```bash
pnpm e2e
```

注意：

- Playwright 需要浏览器和系统依赖。当前某些 Linux 环境可能缺 `libatk-1.0.so.0`，会导致 Chromium 无法启动。
- E2E 会启动 server/web，并可能依赖 `.playwright-bin`、tmux 和测试辅助脚本。

## 开发注意事项

### 不要混淆项目范围

- 不要在 `vibe-kanban/` 下新增本项目代码。
- 新功能优先放在 `apps/web`、`apps/server`、`packages/shared`、`docs`、`scripts`。

### 会话是领域模型，transport 是实现细节

UI 和 API 应围绕 `AgentSessionRecord` 工作。不要让 terminal id、tmux pane id、PTY process id 变成主要产品模型。

### 远端和 shell 命令必须谨慎

- 所有路径、主机、命令参数都要避免拼接注入。
- 已有工具中尽量使用 `quoteForPosixShell`、`buildInteractiveShellCommand`、`buildTmuxCommand` 等封装。
- destructive 操作如 kill tmux、delete 文件、关闭运行中会话，UI 必须显式确认。

### tmux 行为

- attach/kill/scan 都可能影响真实用户会话。
- 远端 tmux 操作需要 SSH 可用。
- tmux mouse binary payload 需要走 binary WebSocket 分支，不能当普通 UTF-8 文本处理。

### 终端输入

- 前端会管理 terminal input owner，避免缩略图抢聚焦态输入。
- 终端 replay 未完成前默认不解锁 stdin，避免 replay 阶段误输入。
- 后端会过滤设备响应；如果新增终端控制序列，需要补充 `terminal-control-filter` 测试。

### VS Code Web

- 只支持本地会话，远端会话暂不支持。
- code-server 自动安装需要网络访问 `https://code-server.dev/install.sh`。
- code-server 返回 URL 使用请求 host 或 `VSCODE_WEB_PUBLIC_HOST`。
- 扩展默认复用当前用户的 `~/.vscode-server/extensions`；如果需要单独目录，可设置 `VSCODE_WEB_EXTENSIONS_DIR`。
- 启动时会清理继承的 `VSCODE_IPC_HOOK_CLI`，避免从 VS Code 终端拉起时误连到已有实例。
- HTTPS 前端嵌入 HTTP code-server 时可能遇到浏览器混合内容限制；内网调试时优先统一协议或使用 HTTP 前端。

### 文件浏览器

- 本地和远端文件操作共用 UI，但底层分别走 `LocalFsService` 和 `SftpService`。
- 上传限制为 500MB。
- 预览要区分 utf8 和 binary。
- 远端路径和身份要随 `sshTarget` 一起传，避免不同 SSH identity 混用。

### 设计和 UI 约束

- 当前 UI 是工作台，不是营销页。
- 避免嵌套卡片和过度装饰。
- 卡片、弹窗、工具条保持 8px 左右圆角。
- 顶栏菜单可折叠，提示信息集中在“操作提示”按钮中。
- VS Code Web 左上角只保留重新加载按钮；provider/reused 仅作为后端返回字段，不在面板上常驻展示。

## 常见问题

### 前端能打开但没有数据

确认后端是否启动：

```bash
curl http://127.0.0.1:4000/api/health
```

如果失败，启动：

```bash
pnpm --dir apps/server dev
```

### 访问 `https://10.30.0.22:3000` 没内容

手动 `pnpm --dir apps/web dev` 默认是 HTTP。应访问：

```text
http://10.30.0.22:3000/
```

要 HTTPS，请用 `scripts/restart-dev.sh` 或配置 `VITE_DEV_HTTPS`、证书路径。

### VS Code 每次都像重新配置

检查是否还有旧临时 code-server：

```bash
ps -ef | grep code-server | grep coding-kanban-vscode
```

新实现应使用：

```text
~/.local/share/coding-kanban/vscode-web/
```

旧实现可能使用：

```text
/tmp/coding-kanban-vscode-*/
```

### Playwright 无法跑

如果报缺 `libatk-1.0.so.0` 等系统库，需要安装 Playwright 浏览器依赖或在具备依赖的环境运行。

### `pnpm --filter server dev` 没启动

在当前 workspace 中，可靠方式是：

```bash
pnpm --dir apps/server dev
```

同理前端：

```bash
pnpm --dir apps/web dev -- --host 0.0.0.0
```

## 当前限制和后续方向

- 会话注册表仍以内存为主，后端重启后需要重新扫描/接入。
- VS Code Web 只支持本地会话。
- SSH 能力依赖本机 SSH 配置和免密/可用认证。
- Playwright 视觉验证依赖系统浏览器库。
- 远端路径建议和文件浏览器能力依赖 SSH/SFTP 权限。
- Electron 打包仍是 TODO。
