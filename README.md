# Agent Orchestrator Kanban

一个面向 CLI Coding Agent 的终端看板。它把本地进程、SSH 远端会话、tmux 会话和目录扫描结果统一放进一个看板里，方便你在一个页面里同时观察、切换、恢复和继续操作多个 Agent。

这个项目当前更适合本地自托管和团队内部工作台场景：前端负责终端看板与交互，后端负责 PTY、WebSocket、tmux 和 SSH 编排。

## TODO

- [ ] 未测试非 mac 机器上的运行
- [ ] 重启后支持恢复历史对话
- [ ] 打包为 electron 应用
- [ ] ...

## 截图

### 宫格总览

![宫格总览](docs/readme-assets/board-overview.png)

### 聚焦终端

![聚焦终端](docs/readme-assets/focus-view.png)

### 快速连接 tmux

![快速连接 tmux](docs/readme-assets/quick-tmux-connect.png)

## 它能做什么

### 统一看板管理多个 Agent 会话

- 用宫格视图同时展示多个会话。
- 每张卡片自带终端缩略图、状态标签、工作目录和主机信息。
- 支持双击卡片进入放大视图，聚焦后可直接把键盘输入发给目标终端。

### 直接创建本地或远端会话

- 可以从左侧面板创建新会话。
- 支持直接启动和 tmux 启动两种模式。
- 当前 UI 内置的启动类型包括 `copilot`、`codex`、`claude` 和 `shell`。

### 管理 tmux 会话

- 支持本地 tmux 扫描。
- 支持把 tmux 会话直接接入到看板。
- 支持把已退出但可恢复的会话重新在 tmux 中拉起。
- 支持 Meta/Ctrl+E 打开“快速连接 tmux”弹窗，先选 SSH 主机，再填会话名和目录，直接进入聚焦视图。

### 扫描并接管已有 Agent 工作目录

- 可以扫描本地目录，也可以扫描 SSH 主机上的目录。
- 会识别已有的 Agent 会话状态，并把运行中/已停止结果展示在扫描结果里。
- 当前后端会优先识别 Copilot 的 session-state，并把匹配到的 tmux pane 与运行中会话合并展示，减少重复条目。

### 远端主机来自 SSH 配置

- 远端主机列表直接读取当前用户的 `~/.ssh/config`。
- Host、HostName、User、Port、IdentityFile 会被解析成可选目标。
- 这意味着你不需要在应用里再维护一套主机清单。

### 终端交互更贴近真实 tmux

- 支持 WebSocket 驱动的实时终端更新。
- 支持 tmux 鼠标二进制事件透传。
- 支持窗口尺寸同步，避免 SSH -> tmux 场景里尺寸不一致导致的状态栏错位。
- 缩略图不会再把真实 tmux resize 成小终端，而是复用放大视图的几何尺寸做本地缩放预览。

### 方便筛选和恢复

- 按服务器筛选。
- 按 Agent 类型筛选。
- 按 tmux 传输类别筛选。
- 按目录关键字筛选。
- 已退出但仍可重连的普通会话支持一键重连。

## 项目结构

```text
.
├─ apps/
│  ├─ server/   # Fastify + WebSocket + node-pty
│  └─ web/      # React + Vite + xterm.js
├─ packages/
│  └─ shared/   # 前后端共享类型
├─ scripts/     # 开发与演示辅助脚本
└─ tests/e2e/   # Playwright 端到端测试
```

## 技术栈

- 前端：React 19、Vite、TypeScript、xterm.js
- 后端：Fastify、@fastify/websocket、TypeScript、node-pty
- 终端与远端：PTY、SSH、tmux
- 测试：Playwright
- 包管理：pnpm workspace

## 安装要求

### 必需

- Node.js：建议使用较新的 LTS 或当前稳定版本。这个仓库当前依赖 `node-pty@1.2.0-beta.12`，在近期 Node 版本上更稳。
- pnpm：仓库使用 `pnpm@10.13.1`。

### 可选但强烈建议

- tmux：如果你要使用 tmux 创建、连接、恢复、缩略图和扫描能力。
- OpenSSH 客户端：如果你要管理远端主机。

### macOS 额外说明

如果本机没有 tmux，可以直接安装：

```bash
brew install tmux
```

## 兼容性约定

- 服务端支持部署在 Linux 和 macOS。
- 本地 PTY 与远端交互 shell 会优先使用当前环境的 `SHELL`，如果没有，再按 `bash -> zsh -> sh` 自动回退，不再假设必须有 zsh。
- 本地 tmux 会自动尝试这些位置：`TMUX_BINARY`、`/opt/homebrew/bin/tmux`、`/usr/local/bin/tmux`，最后再回退到 `PATH` 里的 `tmux`。
- 前端已按 Chromium 浏览器处理快捷键显示：mac 浏览器显示 `⌘+E`，Windows / Linux 浏览器显示 `Ctrl+E`。

## 安装步骤

### 1. 克隆仓库

```bash
git clone <your-repo-url>
cd coding_kanban
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 准备 SSH 配置（可选）

如果你需要远端看板能力，请在 `~/.ssh/config` 里准备好主机，例如：

```sshconfig
Host hm24
  HostName 10.30.0.24
  User huxing
  Port 10022
```

应用启动后会自动把这些 Host 显示在左侧主机列表里。

## 启动方式

### 推荐：一键重启开发环境

```bash
./scripts/restart-dev.sh
```

这个脚本会：

- 清理占用中的 3000/4000 端口
- 启动后端服务
- 启动前端服务，默认绑定 `0.0.0.0`，方便局域网访问
- 如果目标前端端口被其他进程占用，会自动切到下一个可用端口
- 输出前端实际 Local/Network 地址、后端健康检查地址和日志路径

启动成功后，脚本会打印：

- 前端实际本地地址（Local）
- 前端局域网地址（Network，当前环境可用时）
- 后端健康检查：http://127.0.0.1:4000/api/health

默认会优先尝试前端 3000 端口；如果被占用，Vite 会自动切到下一个可用端口，并由脚本打印最终端口。

如果你想显式指定一个起始端口，也可以这样启动：

```bash
WEB_PORT=3100 ./scripts/restart-dev.sh
```

### 备用：分别启动

```bash
pnpm --filter server dev
pnpm --filter web dev
```

### 备用：并发启动

```bash
pnpm dev
```

## 快速上手

### 新建一个本地会话

1. 打开左侧“新建会话”。
2. 填写显示名称、类型和工作目录。
3. 选择“直接创建”或“从 tmux 创建”。
4. 点击“创建会话”。

### 扫描已有会话

1. 在左侧主机列表选择“本地”或一个 SSH 主机。
2. 输入待扫描目录。
3. 点击“扫描”。
4. 在“扫描结果”里选择“接入”“连接 tmux”“恢复”或“tmux 恢复”。

### 快速连接远端 tmux

1. 按 Meta/Ctrl+E，或者点击顶部“快速连接 tmux”。
2. 输入主机名过滤列表。
3. 回车选择主机。
4. 输入 tmux 会话名和打开目录。
5. 点击“打开 tmux”。
6. 新会话会自动进入聚焦视图，也会同步加入宫格。

### 在聚焦视图里工作

1. 双击任意卡片进入聚焦视图。
2. 直接在主终端中输入。
3. `Esc` 返回宫格。
4. 侧栏会展示其他会话的终端缩略图，方便切换上下文。

## 开发命令

```bash
pnpm dev          # 并发启动前后端
pnpm dev:restart  # 用脚本清端口并重启
pnpm build        # 构建 shared/server/web
pnpm check        # 类型检查 + 生产构建
pnpm e2e          # 运行 Playwright E2E
pnpm test         # 运行所有 workspace test 脚本
pnpm format       # 格式化整个仓库
```

## 演示截图如何更新

仓库里已经提供了一个截图脚本：

```bash
node ./scripts/generate-readme-screenshots.mjs
```

它会：

- 创建一组本地演示会话
- 打开前端页面
- 生成 README 用到的 PNG 截图
- 输出到 `docs/readme-assets/`

运行前请先保证前端和后端都已经启动。

## 当前实现更适合哪些场景

- 同时跟踪多个 CLI Agent 的工作状态
- 远端开发机上的 tmux 会话切换与接管
- 在一个页面里观察本地、远端、tmux 和扫描结果
- 需要频繁在多个 Agent 之间切换上下文的日常开发工作流

## 已验证的行为

当前仓库已经有覆盖以下关键行为的 E2E：

- 直接创建和 tmux 创建
- 等待输入状态识别
- tmux 鼠标事件透传
- tmux 缩略图不回写 resize
- tmux 扫描、合并与恢复
- Meta/Ctrl+E 快速连接远端 tmux

## 故障排查

### 没看到 SSH 主机列表

- 检查 `~/.ssh/config` 是否存在。
- 确认使用的是明确的 `Host` 条目，而不是通配符条目。

### tmux 功能不可用

- 确认本机已经安装 tmux。
- 如果是 macOS，程序会自动探测 `/opt/homebrew/bin/tmux` 和 `/usr/local/bin/tmux`。
- 如果你使用了非标准路径，也可以通过环境变量 `TMUX_BINARY` 显式指定。

### 页面打不开或 API 报错

- 先执行：

```bash
./scripts/restart-dev.sh
```

- 再检查：

```bash
curl http://127.0.0.1:4000/api/health
```

### 远端 tmux 尺寸或状态栏显示异常

- 确认后端正常运行。
- 确认 tmux 会话是通过当前看板接入，而不是另一个终端窗口占用了不同的 client geometry。

## 说明

这个项目当前是一个偏工程化、偏实用主义的 Agent 控制台原型，重点在于把多终端编排、tmux 连接、目录扫描和实时终端交互整合到一个工作流里，而不是做成通用 SaaS 产品。
