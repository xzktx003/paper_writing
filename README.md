# Coding Kanban

面向 CLI Coding Agent 的本地/内网工作台。

Coding Kanban 把本地 PTY、SSH 远端 PTY、tmux 会话、Agent 工作目录扫描、文件浏览器和 VS Code Web 放在同一个浏览器界面里。核心目标不是做一个公网 SaaS，而是在自己的开发机或内网服务器上，把“观察多个 Agent → 切换焦点 → 接管终端 → 查看/编辑文件 → 打开 VS Code Web”压缩成一个连续工作流。

## 适合谁

- 同时跑多个 `copilot`、`codex`、`claude` 或 shell 任务的人。
- 经常在本机、SSH 远端、tmux 会话之间切换的人。
- 希望用浏览器统一观察和接管 CLI Agent 的团队或个人。
- 需要在终端旁边直接查看文件、改配置、打开 VS Code Web 的开发场景。

不建议把它直接暴露到公网。后端会执行 PTY、SSH、tmux 和文件系统操作，应部署在可信本地或内网环境。

## 当前能力

### 会话看板

- 宫格展示未隐藏会话，包含名称、状态、Agent 类型、主机、目录和轻量终端预览。
- 支持按服务器、Agent 类型、tmux 类别、目录关键字筛选。
- 支持隐藏、恢复、重命名、关闭/脱离、终止 tmux、复制 tmux attach 命令。
- 筛选行显示小号“等待输入 / 运行中”统计徽标。
- 双击卡片进入聚焦视图；`Alt+Q` 返回宫格。

### 聚焦终端与多屏监控

- 聚焦视图使用真实 xterm.js 终端继续输入。
- 支持单屏、左右双屏、上下双屏、左中右三屏、四屏、六屏、八屏监控布局。
- 多窗格只用于同时观察多个终端；键盘输入只发送到标记为“输入中”的一个窗格，不做广播输入。
- 右侧其他会话卡片可拖入任意监控窗格；窗格头部也可拖拽交换位置。
- 右侧“其他会话”侧栏可折叠，保留上下文但不长期占空间。

### 终端预览与资源控制

- 默认使用轻量终端预览：宫格卡片和聚焦侧栏不创建真实 xterm，也不打开终端 WebSocket。
- 可切换到完整预览模式，恢复卡片和侧栏的小终端实时预览。
- 终端 WebSocket 支持 scrollback replay、live frame 缓冲、stdin、resize 和 binary 消息。
- 后端会合并高频终端输出触发的会话快照，降低浏览器 JSON 解析和 React 更新压力。
- 顶栏资源诊断可查看 xterm 数量、终端 WebSocket 数、会话快照吞吐、终端实时流吞吐、VS Code iframe 数和 Chromium JS heap。

### 新建、扫描和接入会话

- 新建会话支持本机和 SSH 主机。
- Agent 类型支持 `copilot`、`codex`、`claude`、`shell`。
- 启动方式支持 `direct` 和 `tmux`。
- 支持扫描本地或远端 tmux，并把已运行 pane 接入为可交互终端。
- 支持扫描本地或 SSH 远端工作目录，识别 Copilot `session-state`，并和 tmux pane 合并减少重复卡片。
- 快速连接 tmux 通过快捷键打开：macOS 为 `⌘+E`，Windows/Linux 为 `Ctrl+E`；会话存在即 attach，不存在即创建。

### 文件浏览器

- 聚焦视图可打开文件浏览器。
- 支持本地文件系统和 SSH/SFTP 远端文件系统。
- 支持面包屑、返回上一级目录、显示隐藏文件、过滤、排序。
- 支持文本预览和编辑保存。
- 支持新建文件/目录、重命名、删除、chmod、上传、下载、拖拽上传。
- 右键菜单支持上传到当前目录或选中目录、下载、重命名、删除、复制路径、chmod。

### VS Code Web

- 聚焦本地会话和 SSH 远端会话时都可以打开内嵌 VS Code Web。
- 本地优先复用 `code-server`，其次支持 `openvscode-server`。
- SSH 远端通过 SSH 启动/复用远端 `code-server`，再由当前后端统一代理到 `/vscode/`。
- 默认复用用户的 `~/.vscode-server/extensions` 扩展目录。
- iframe 默认使用省内存模式，只保留当前 iframe。
- 可切换到保持状态模式，最多保留最近 8 个 iframe。
- 提供“释放 VS Code 缓存”按钮，卸载非当前 iframe 回收浏览器内存，不停止后端 code-server 进程。

## 截图与演示

> 截图素材位于 `docs/readme-assets/`。如果界面和截图不一致，以当前源码和 `docs/func_list.md` 为准。

![架构总览](docs/readme-assets/architecture-overview.svg)

![使用工作流](docs/readme-assets/usage-workflow.svg)

![宫格总览](docs/readme-assets/board-overview.png)

![聚焦终端](docs/readme-assets/focus-view.png)

演示视频：

<video src="docs/readme-assets/20260423_151840.mp4" controls muted playsinline width="100%"></video>

如果当前 Markdown 渲染器不支持内嵌视频，可以直接打开：

[docs/readme-assets/20260423_151840.mp4](docs/readme-assets/20260423_151840.mp4)

## 快速启动

### 环境要求

必需：

- Node.js：建议 Node.js 20 或更新版本。
- pnpm：仓库声明使用 `pnpm@10.13.1`。

按需安装：

- `tmux`：使用 tmux 创建、扫描、接管、恢复时需要。
- OpenSSH 客户端：连接 SSH 远端时需要。
- `openssl`：生成 HTTPS 自签证书时需要。
- `mkcert`：推荐安装，可生成浏览器信任的本地开发证书，VS Code Web 预览和 webview 更稳定。

常见系统安装：

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install -y tmux openssh-client openssl

# Fedora / RHEL
sudo dnf install -y tmux openssh-clients openssl

# macOS
brew install tmux mkcert nss
mkcert -install
```

### 安装依赖

```bash
git clone <your-repo-url>
cd coding_kanban
pnpm install
```

### 配置环境变量

推荐复制模板：

```bash
cp .env.example .env
```

常用配置：

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `HOST` | 后端 Fastify 监听地址 | `0.0.0.0` |
| `PORT` | 后端 REST + WebSocket 端口 | `4000` |
| `WEB_HOST` | Vite 前端监听地址 | `0.0.0.0` |
| `WEB_PORT` | Vite 前端端口 | `3000` |
| `WEB_BACKEND_HOST` | 前端代理到后端的主机 | `localhost` |
| `WEB_BACKEND_PORT` | 前端代理到后端的端口 | `4000` |
| `WEB_HTTPS` | 是否启用前端 HTTPS | `1` |
| `FILE_BROWSER_DEFAULT_LOCAL_PATH` | 文件浏览器默认本地目录 | 自动探测仓库根目录 |
| `VSCODE_WEB_EXTENSIONS_DIR` | VS Code Web 扩展目录 | `~/.vscode-server/extensions` 或内置目录 |
| `VSCODE_WEB_PUBLIC_HOST` | 浏览器访问 `/vscode` 的公共主机名 | 当前请求 Host |
| `VSCODE_WEB_BIND_HOST` | 本地 code-server 绑定地址 | `0.0.0.0` |
| `VSCODE_WEB_REMOTE_BIND_HOST` | SSH 远端 code-server 绑定地址 | `127.0.0.1` |
| `VSCODE_WEB_REMOTE_PORT` | SSH 远端 code-server 固定端口 | `13338` |

说明：

- `.env` 会被 git 忽略，适合写本机端口、路径和主机配置。
- `scripts/restart-dev.sh` 会读取 `.env`。
- 如果没有 `.env`，`restart-dev.sh` 自身默认前端 `3100`、后端 `3200`。
- 如果直接复制 `.env.example`，其中 `WEB_PORT=3000`、`PORT=4000` 会覆盖脚本默认值。

### 推荐启动方式

```bash
./scripts/restart-dev.sh
```

脚本会做这些事：

- 释放目标端口上的旧前后端进程。
- 启动后端。
- 启动前端并绑定 `0.0.0.0`，方便局域网访问。
- 默认启用 HTTPS。
- 优先使用 `mkcert` 证书；不可用时回退到 OpenSSL 自签证书。
- 输出 Local / Network 前端地址、后端健康检查地址和日志路径。

如果只想本机 HTTP 调试：

```bash
WEB_HTTPS=0 ./scripts/restart-dev.sh
```

如果要从手机或同网段机器访问，请保持 HTTPS，并使用脚本输出的 `Network` 地址，例如：

```text
https://10.30.0.22:3100
```

### 备用启动方式

```bash
pnpm dev
```

或分别启动：

```bash
pnpm --filter server dev
pnpm --filter web dev
```

健康检查：

```bash
curl http://127.0.0.1:3200/api/health
```

如果你用 `.env` 改了端口，请替换成实际后端端口。

## 基本使用流程

### 新建一个本地 Agent

1. 点击“新建会话”。
2. 选择“本机”。
3. 选择 `copilot`、`codex`、`claude` 或 `shell`。
4. 输入工作目录。
5. 选择 `direct` 或 `tmux`。
6. 创建后双击卡片进入聚焦视图。

### 连接 SSH 远端

先配置 `~/.ssh/config`：

```sshconfig
Host devbox
  HostName 10.30.0.24
  User your-user
  Port 22
```

然后在新建会话、扫描会话、扫描 tmux 或快速连接 tmux 时选择该主机。

### 扫描 tmux

1. 点击“扫描 tmux”或按 `Ctrl/⌘+Shift+S`。
2. 选择本机或 SSH 主机。
3. 将已有 tmux pane 加入看板或聚焦已有会话。

### 快速连接 tmux

1. 按 `⌘+E` 或 `Ctrl+E`。
2. 选择本机或 SSH 主机。
3. 输入 tmux session 名和目录。
4. 系统运行 `tmux new-session -A -s <session> -c <dir>`。

### 打开文件浏览器

1. 双击卡片进入聚焦视图。
2. 点击顶栏“文件”。
3. 使用面包屑或名称旁的上箭头切目录。
4. 预览、编辑、上传、下载或右键管理文件。

### 打开 VS Code Web

1. 双击本地或 SSH 会话进入聚焦视图。
2. 点击顶栏“VS Code”。
3. 根据需要切换“VS Code 省内存 / VS Code 保持状态”。
4. 如果浏览器内存偏高，点击“释放 VS Code 缓存”卸载非当前 iframe。

## 仓库结构

```text
apps/web/                React + Vite + xterm.js 前端
apps/server/             Fastify + WebSocket + PTY/SSH/tmux 后端
packages/shared/         前后端共享 DTO、类型和协议
packages/agent-protocol/ Agent 运行时协议定义
packages/ui/             预留的跨应用 UI 原语
scripts/                 开发、重启、证书、截图和辅助脚本
tests/e2e/               Playwright 端到端测试
docs/                    功能说明、项目概览、设计文档和截图资源
memories/                仓库级排障记忆，不参与产品运行
```

## 技术栈

- 前端：React 19、Vite、TypeScript、xterm.js。
- 后端：Fastify、@fastify/websocket、node-pty、ssh2、TypeScript。
- 文件系统：本地 FS + SSH/SFTP。
- 终端：本地 PTY、SSH PTY、tmux attach/scan/control。
- 测试：Node test runner、Playwright。
- 包管理：pnpm workspace。

## 常用命令

```bash
pnpm dev          # 并发启动前后端
pnpm dev:restart  # 调用 scripts/restart-dev.sh
pnpm build        # 构建 shared / server / web
pnpm check        # 类型检查 + 构建
pnpm test         # 运行所有 workspace test
pnpm e2e          # 运行 Playwright E2E
pnpm format       # 格式化全仓库
```

更常用的定向验证：

```bash
pnpm --filter web test
pnpm --filter server test
pnpm --filter shared build
```

## README 截图更新

截图脚本：

```bash
node ./scripts/generate-readme-screenshots.mjs
```

运行前请先启动前后端。脚本默认读取：

- 前端：`https://localhost:3100`
- 后端：`http://127.0.0.1:3200`

如需覆盖：

```bash
README_BASE_URL=https://localhost:3000 \
README_API_URL=http://127.0.0.1:4000 \
node ./scripts/generate-readme-screenshots.mjs
```

Linux 上如缺少浏览器依赖：

```bash
npx playwright install
sudo npx playwright install-deps
```

建议使用一套干净的临时开发服务生成截图，避免真实会话混入 README 素材。

## 故障排查

### 页面打不开

```bash
./scripts/restart-dev.sh
curl http://127.0.0.1:3200/api/health
```

如果复制了 `.env.example`，后端端口可能是 `4000`。

### 手机或局域网设备访问不了

- 确认前端绑定 `0.0.0.0`，不要只绑定 `localhost`。
- 使用 `restart-dev.sh` 输出的 `Network` 地址。
- 保持 `WEB_HTTPS=1`。
- 检查防火墙是否放行前端端口。

### SSH 主机列表为空

- 检查 `~/.ssh/config` 是否存在。
- 使用明确的 `Host` 条目，避免只依赖通配符。
- 确认当前用户可读取该文件。

### tmux 功能不可用

- 确认系统已安装 `tmux`。
- 如果 tmux 不在标准路径，设置 `TMUX_BINARY`。
- SSH 远端 tmux 需要远端主机也安装 tmux。

### VS Code Web 打不开

- 确认本机或远端能启动 `code-server`。
- 本地找不到时会尝试 `openvscode-server` 或自动安装 `code-server` standalone。
- SSH 远端依赖后端能建立 SSH 本地转发。
- 如遇预览/webview 异常，优先使用 `mkcert` 生成受信任 HTTPS 证书。
- 可检查 `VSCODE_WEB_EXTENSIONS_DIR`、`VSCODE_WEB_PUBLIC_HOST`、`VSCODE_WEB_BIND_HOST`、`VSCODE_WEB_REMOTE_BIND_HOST`、`VSCODE_WEB_REMOTE_PORT`。

### 浏览器内存继续增长

- 优先保持“轻量预览”模式。
- VS Code iframe 使用“省内存”模式；需要保留编辑器状态时再切到“保持状态”。
- 用“释放 VS Code 缓存”卸载非当前 iframe。
- 打开“资源诊断”查看增长来源：xterm、终端 WebSocket、会话快照、终端实时流、VS Code iframe 或 JS heap。

## 当前边界

- 会话状态主要在当前后端进程内存中，服务重启后恢复历史对话仍是后续目标。
- VS Code iframe 自动超时卸载暂未默认启用。
- 多终端监控不支持广播输入，设计上只允许一个“输入中”窗格。
- 本项目面向可信内网环境；不要把执行能力直接暴露到公网。

## 进一步文档

- 功能清单：`docs/func_list.md`
- 项目概览：`docs/project-overview.md`
- Bug 修复记录：`docs/debug_list.md`
- 文件浏览器设计背景：`docs/specs/2026-04-20-file-browser-architecture.md`
