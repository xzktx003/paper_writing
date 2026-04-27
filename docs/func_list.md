# Coding Kanban 功能清单

本文档按当前仓库实现整理功能范围，作为后续新增功能时必须同步维护的清单。历史计划文档仅作背景，本清单以当前代码、现有接口和已经落地的交互为准。

## 1. 会话看板与聚焦工作流

- 宫格展示未隐藏的会话卡片，显示名称、状态、Agent 类型、主机、工作目录和终端缩略图。
- 支持按服务器、Agent 类型、tmux 类别、目录关键字筛选。
- 支持隐藏、恢复、删除、重命名、关闭/脱离、终止 tmux、复制 tmux attach 命令。
- 双击卡片进入聚焦视图，在主终端直接继续输入。
- 聚焦视图保留其他会话上下文，并支持右侧会话侧栏折叠。

## 2. 顶栏入口与快捷键

- 顶栏提供文件浏览器、VS Code Web、新建会话、扫描 tmux、扫描会话、快速连接 tmux、操作提示和菜单栏折叠入口。
- 菜单栏折叠状态持久化到本地存储。
- 提供 `Ctrl/⌘+E` 快速连接 tmux、`Ctrl/⌘+Shift+S` 打开 tmux 扫描等快捷操作。

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

- 使用 xterm.js 渲染终端，后端通过 WebSocket 发送 scrollback replay 与实时输出。
- 支持 replay 完成前缓冲 live frame，避免历史输出与新输出乱序。
- 支持 stdin、resize、binary 消息，binary 用于 tmux 鼠标等二进制事件。
- 支持终端焦点补救、输入所有权和缩略图几何缓存。

## 7. 文件浏览器

- 聚焦视图下支持打开文件浏览器。
- 支持本地文件系统与 SSH/SFTP 远端文件系统。
- 支持目录树、面包屑、显示隐藏文件、过滤、排序。
- 支持文本预览和编辑保存。
- 支持新建文件/目录、重命名、删除、chmod、上传、下载、拖拽上传。

## 8. VS Code Web

- 仅本地聚焦会话支持打开内嵌 VS Code Web 面板。
- 后端优先复用 `code-server`，其次支持 `openvscode-server`。
- 会话级工作区使用稳定的 `.code-workspace` 文件。
- 扩展目录优先复用用户的 `~/.vscode-server/extensions`。

## 9. VS Code 窗口观察

- 支持把本地 VS Code 窗口作为观察卡片加入看板。
- 观察卡片根据活动心跳展示运行中/等待输入等状态。
- 支持停止观察并保留记录，便于后续清理。

## 10. SSH 与环境适配

- 远端主机列表直接读取并解析当前用户的 `~/.ssh/config`。
- 本地与远端 shell 选择优先使用当前环境 `SHELL`，不足时按 `bash -> zsh -> sh` 回退。
- tmux 路径支持 `TMUX_BINARY`、Homebrew 路径和 `PATH` 自动探测。

## 11. 布局与状态持久化

- 顶栏折叠、文件浏览器布局、聚焦视图状态、侧边工具选择等 UI 状态保存在本地存储。
- 文件浏览器按会话和主机维度保存独立浏览状态。
- VS Code Web 会话缓存支持跨切换复用。