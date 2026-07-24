# CLI Task Agent 架构与安全契约

更新日期：2026-07-22

## 目标

CLI Task Agent 为 Codex CLI、Claude Code CLI 和 GitHub Copilot CLI 提供独立于普通 Chat 的文件修改工作流。普通 Chat 的只读参数保持不变；Task Agent 不会把 Chat 的“发送”按钮升级为隐式写文件。

```text
managed projectId
→ 项目外隔离快照
→ CLI 只在快照 cwd 中运行
→ changed files + unified diff + provenance
→ waiting-review
→ Accept / Reject
→ Accept 前检查原项目漂移并执行可回滚应用
→ Reject 不触碰原项目
→ 持久化历史
```

## API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/cli-task-providers` | 列出可用于 Task Agent 的固定 CLI Provider |
| `GET` | `/api/projects/:id/cli-tasks` | 查询项目任务历史 |
| `POST` | `/api/projects/:id/cli-tasks` | 创建隔离任务 |
| `GET` | `/api/projects/:id/cli-tasks/:taskId` | 查询任务状态与 Diff |
| `POST` | `/api/projects/:id/cli-tasks/:taskId/accept` | 接受并安全应用变更 |
| `POST` | `/api/projects/:id/cli-tasks/:taskId/reject` | 拒绝，不修改原项目 |
| `POST` | `/api/projects/:id/cli-tasks/:taskId/cancel` | 取消排队或运行中的任务 |

所有接口都处于全局 Bearer Token 鉴权之后。客户端只能提供 Provider ID、模型名、任务文本和受限 timeout；不能提供 executable、参数数组、shell 字符串、cwd、快照路径或原项目绝对路径。

## 状态机

- `queued`：快照已创建，等待启动 CLI；
- `running`：CLI 正在隔离快照中运行；
- `waiting-review`：CLI 已结束，Diff 等待用户审查；
- `applying`：后端正在用回滚日志应用已接受变更；
- `accepted`：变更已应用到原项目；
- `rejected`：用户拒绝，原项目未修改；
- `failed`：快照、CLI、Diff 或应用阶段失败；
- `cancelled`：任务被用户取消或进程树被终止。

后端重启时，历史任务从磁盘恢复。重启前仍处于 `queued` / `running` 的任务会标记为 `failed`；处于 `applying` 的任务会先尝试按持久化 journal 回滚，再标记失败。

## 快照与路径边界

- 任务持久化根目录默认为 `<OPENPRISM_DATA_DIR>/.openprism-cli-tasks`，项目列表忽略该隐藏目录。
- 每个任务拥有不可变 `base/` 和 CLI 工作目录 `work/`。
- `base/` 记录任务创建时的原始文件和 SHA-256 tree fingerprint。
- `work/` 是 CLI 唯一工作目录，也是生成最终 Diff 和 Accept 数据的来源。
- Task storage 的真实路径必须位于 managed project 真实路径之外。
- Task storage 和项目树中的 symlink 均被拒绝；socket、device 等非普通文件也被拒绝。
- `project.json` 是项目身份文件，Task Agent 不允许修改。
- API 响应不返回 task root、base root、snapshot root 或原项目绝对路径。

## Provider 固定权限

### Codex CLI

```text
codex exec --json --ephemeral --sandbox workspace-write
  --ignore-user-config --ignore-rules --skip-git-repo-check
  -C <snapshot>
```

不会使用 `danger-full-access`，也不会加入额外可写目录。

### Claude Code CLI

```text
--permission-mode dontAsk
--tools Read,Edit,Write
--allowedTools Read,Edit,Write
--disable-slash-commands
--strict-mcp-config --mcp-config '{}'
```

不开放 Bash、MCP、浏览器或网络工具。

### GitHub Copilot CLI

```text
-C <snapshot>
--available-tools=read,write
--allow-tool=read
--allow-tool=write
--disable-builtin-mcps
--disallow-temp-dir
```

不会使用 `--allow-all`、`--allow-all-paths`、`--allow-all-tools` 或 `--yolo`。

三种 Provider 都使用参数数组、`shell: false`、最小环境白名单和独立进程组。客户端任务文本只作为一个参数传入，不会拼接为 shell 命令。

## Diff 与审查

任务结束后，后端重新扫描 `base/` 和 `work/`，按 SHA-256 和文件 mode 识别 added、modified、deleted。小于 1 MiB 且不包含 NUL 的文本文件生成 unified diff；二进制或大文件只展示状态和前后字节数。

前端展示全部 changed files。Accept 按钮默认禁用，只有用户勾选“已审查每一个变更文件”后才能操作。

## Reject 保证

Reject 只更新任务记录，不复制 `work/` 文件、不删除原文件、不更新项目 metadata。原项目文件哈希保持不变，拒绝原因和时间会持久化。

## Accept、漂移检测与回滚

Accept 前，后端重新扫描原项目，并与任务创建时的完整 baseline fingerprint 比较。任意文件新增、修改、删除或 mode 变化都会返回 `409 CLI_TASK_SOURCE_DRIFT`，不会覆盖用户在任务运行期间做出的编辑。

通过漂移检查后：

1. 后端持久化 `applying` journal；
2. 原文件先移动到任务 rollback 目录；
3. 新文件通过同文件系统临时文件复制并 rename 到目标；
4. 每个 operation 的 backup/installed 状态持续写入 journal；
5. 任一步失败时按相反顺序删除已安装文件并恢复 backup；
6. 全部成功后标记 `accepted`，再清理 rollback 数据。

多文件应用无法成为单个文件系统 rename，但持久化 journal 和逐步回滚保证失败不会被当成成功，也避免只应用一半后失去恢复依据。

## Provenance 与隐私

任务记录包括 Provider ID、模型、executable、CLI 版本、隔离策略、脱敏参数摘要、时间、exit code、signal、changed files、stdout/stderr 和 Accept/Reject 决策。

参数摘要使用 `[TASK_PROMPT]` 和 `[SNAPSHOT]`。stdout/stderr 会按环境秘密值和常见 Token 形状脱敏，并把项目/快照绝对路径替换为占位符。

## 取消

运行中的 CLI 使用 detached process group。取消和超时先对整个进程组发送 SIGTERM，等待后升级为 SIGKILL。取消结果持久化为 `cancelled`，不会生成可接受的 Diff。

## 测试

自动化不调用真实付费 CLI。固定 mock CLI 覆盖：项目外快照、symlink 拒绝、三类 Diff、Reject 哈希不变、Accept、source drift、应用中途失败回滚、进程树取消、历史恢复、managed projectId、Chat 只读参数，以及 Playwright 的“创建 → Diff → Reject → 再创建 → Accept → 刷新历史”。

主要回归：

- `app/tests/cliTaskAgent.test.mjs`
- `app/apps/backend/src/routes/__tests__/cliTasks.test.js`
- `app/tests/cliTaskUiContract.test.mjs`
- `app/tests/e2e/cli-task-agent.spec.ts`

## 当前限制

- Task history 默认保留在本地数据根中，当前版本尚未提供 UI 删除/归档策略；管理员需要将其纳入磁盘容量治理。
- Task Agent 依赖服务器已经安装并登录相应 CLI。
- Provider 自身的模型行为仍不可信，安全性依赖快照、固定工具权限、Diff 审查和 Accept 门禁，而不是依赖提示词承诺。
- 接受变更后，已经打开的编辑器标签可能仍显示旧内存内容；前端会发出 `paper-writer:cli-task-applied` 事件，后续文件同步层应统一消费该事件或用户刷新工作区。
