# Agent Provider 架构与安全边界

更新日期：2026-07-22

## 目标

Paper Writer 使用统一 AgentProvider registry 管理模型执行后端。当前正式 Provider 为：

| Provider ID | 类型 | 模型列表 | 流式 | 取消 | 应用托管 Tool Calling |
| --- | --- | --- | --- | --- | --- |
| `openai-compatible` | HTTP | 支持 | 支持 | 不支持请求级取消 | 支持 |
| `anthropic` | HTTP | 支持 | 支持 | 不支持请求级取消 | 支持 |
| `codex-cli` | 本地 CLI | 不提供稳定列表，允许手填 | 最终响应（非增量） | 支持 | 不支持 |
| `claude-cli` | 本地 CLI | 不提供稳定列表，允许手填 | 最终响应（非增量） | 支持 | 不支持 |
| `copilot-cli` | 本地 CLI | 不提供稳定列表，允许手填 | 最终响应（非增量） | 支持 | 不支持 |

Registry 对外暴露 metadata/capabilities、probe、listModels、invoke、stream、cancel 和 provenance。能力不支持时必须返回明确的 capability 错误，不能伪造空结果让前端误判成功。

## CLI 固定执行契约

- Codex Chat 使用后端固定的 `codex exec --json --ephemeral --sandbox read-only ...`，不能直接修改受管论文目录。
- Claude Code 使用后端固定的 `claude --print --output-format stream-json --no-session-persistence ...`。
- GitHub Copilot 使用后端固定的 `copilot --prompt ... --output-format json --no-custom-instructions ...`。
- 客户端传入的 `executable`、`args`、参数模板和 `cwd` 一律忽略。
- CLI 请求必须携带 managed `projectId`；后端通过 Project Locator 解析真实根目录且要求项目存在。
- 子进程使用 `spawn` 参数数组和 `shell: false`，不会拼接 shell 字符串。
- 进程采用独立进程组；超时、Abort 或显式 cancel 会先终止进程树，必要时升级为强制终止。
- 子进程环境只保留 PATH、HOME、locale、证书路径等基础项，以及该 Provider 明确允许的认证变量；不会继承 `OPENPRISM_API_TOKEN`、数据库密码或无关云凭据。
- stdout/stderr 有大小上限，并在进入响应前按环境秘密值和常见凭据形状脱敏。

CLI Provider 的普通对话仍只保证只读 Chat 类 invoke。应用自己的 Agent/Tools 模式依赖结构化 Tool Calling 和“先展示 diff、再由用户接受”的审批语义，因此 Chat Provider 继续声明 `toolCalling: false`、`stream: false`。CLI 的 JSON/stream-json stdout 只作为受限诊断和最终文本解析来源，不会把原始事件直接发送到用户消息。

需要修改论文时，用户必须进入独立的 CLI Task Agent Tab。Task Agent 在项目外创建 `base/` 与 `work/` 快照，CLI 只在 `work/` 中运行；结束后展示 added/modified/deleted 文件和 unified diff，状态进入 `waiting-review`。Reject 不触碰原项目；Accept 先校验完整 source fingerprint，再使用持久化 rollback journal 应用变更。详细契约见 [CLI Task Agent 架构与安全契约](cli_task_agent.md)。

## Probe 与认证

Probe 不发送模型请求：

- 三种 CLI 均使用 `--version` 判断安装状态。
- Codex 使用 `codex login status` 检查非交互认证状态。
- Claude Code 使用 `claude auth status --json` 检查非交互认证状态。
- Copilot CLI 当前没有稳定的只读 auth-status 命令；仅在固定支持的认证环境变量存在时报告可用，否则返回 `available: null`，不会触发登录流程。

`GET /api/providers` 不再把服务器已配置 `OPENPRISM_API_TOKEN` 等同于 CLI 可用。服务器启用 Token 时，Provider 列表并行执行上述只读安装/认证探针，并返回 `installed`、`authenticated`、`authStatus`、`version`、`available` 和 `unavailableReason`。只有“可执行文件存在且认证被明确证明”时 CLI 才是 `available`；认证无法可靠探测时保守返回 `unknown` 和不可用。设置页禁用不可用 CLI 选项，避免用户在任务执行失败后才发现 CLI 未安装或未登录。

任何 Provider probe/models/invoke/cancel，以及 AI 请求，都要求服务器配置 `OPENPRISM_API_TOKEN`。未配置时后端返回 503，且不会启动子进程或外部 HTTP 请求。HTTP Provider 的连接测试只调用模型列表接口，不产生模型推理费用；临时 endpoint 与临时 Key 必须成对提供，禁止回退混用服务器 Key。

浏览器提供的临时 HTTP endpoint 还必须通过目标地址策略：

- 只允许绝对 `http:` / `https:` URL，禁止 URL 内嵌用户名或密码；
- DNS 的全部解析结果都不能是 loopback、RFC1918、carrier-grade NAT、link-local、云元数据、multicast 或 reserved 地址；
- 校验得到的地址集合会生成请求专用 `lookup`，实际 TCP/TLS socket 只能连接该集合，不会在校验后再次做系统 DNS 解析；HTTPS 仍使用原 hostname 作为 SNI 和证书校验名称；
- 每个 HTTP 重定向目标在跟随前重新执行相同校验，最多三跳；
- 请求使用短超时和 `redirect: manual`，不能让底层 fetch 自动绕过策略；每一跳都会重新固定该目标的解析结果；
- Provider 连接使用专用 direct Agent，不继承 Node `NODE_USE_ENV_PROXY` 全局 Agent，避免环境代理重新解析 hostname 绕过 socket pinning；需要代理的部署应配置受控 Provider 网关 endpoint，而不能让浏览器请求选择任意代理；
- 管理员在 `.env` 中明确配置的 Provider endpoint 被视为受信任部署配置，可以使用 LAN 地址；
- 若认证用户确实需要临时测试内网网关，管理员可通过 `OPENPRISM_PROVIDER_ALLOWED_HOSTS` 精确允许 host 或 `*.example.com` 子域，不能由浏览器请求自行放宽。

设置页另有统一的[系统能力诊断](system_capabilities_architecture.md)。它复用 registry metadata，但为了保证普通诊断不触发登录流程，只检查三种 CLI 的固定 `--version`，不会运行这里的认证 probe；HTTP Provider 也只检查配置完整性，不请求模型列表或模型。能力诊断同样受服务器 Token 保护并使用短时缓存。

## 前端凭据边界

- LLM API Key 由后端 `.env` / appConfig 托管；认证后的配置响应只返回掩码和 `*_api_key_set`，`/api/config` 不属于公开 bootstrap 接口。
- 服务访问令牌由用户在设置页输入，只写入 `sessionStorage`，关闭浏览器会话后失效。
- 启动时安装的同源 fetch 包装只对当前 origin 的 `/api/` 请求附加 Bearer，不会把令牌发送到外部 URL。
- XMLHttpRequest 上传/SSE、Terminal WebSocket、文件 watcher WebSocket 和 EventSource 使用同一会话令牌；query-token 只允许在后端明确列出的握手端点。
- 保存配置必须等待后端 2xx 后才能关闭弹窗；错误时保留表单和错误信息。

## Provenance

每次 CLI 执行记录并返回：Provider ID、CLI 版本、模型、开始时间、耗时、exit code、signal 和归一化 exit status。响应不包含 API Key、服务访问令牌或未过滤的进程环境。AI 主对话在完成事件/响应中附带 `providerProvenance`，便于故障定位和结果来源审计。

## 测试策略

自动化测试不得调用真实付费模型。CLI 单测注入 fake `spawn`，覆盖：

- 固定 executable/参数数组，拒绝客户端 executable/args/cwd；
- projectId 经 Project Locator 解析；
- 环境白名单和凭据脱敏；
- stdout/stderr、流式回调、exit code、signal、timeout、Abort 和 cancel；
- 无服务器 Token 时 probe/invoke/cancel 不启动进程；
- 临时 HTTP endpoint 的协议、URL 凭据、私网/DNS 地址和重定向目标策略；
- DNS 校验结果与真实 socket 连接只解析一次，后续 DNS 漂移不能把请求重绑定到本机或内网；
- Provider 设置页、sessionStorage 和统一同源 Bearer 契约。

## Provider 状态与 Skill 运行结果边界（2026-07-22 当前复核）

Provider 状态必须区分支持、可执行文件已安装、CLI 已登录、模型可访问和当前权限范围。`--version` 只能证明 executable 存在，不能证明登录或模型调用成功；没有可靠的非交互 auth probe 时应显示 `unknown/not-checked`。Skill 账本中的 `provider_completed` 同样只表示一次 Provider 请求完成，不得作为目标质量或论文事实验证。
