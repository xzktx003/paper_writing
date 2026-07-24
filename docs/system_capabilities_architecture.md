# 系统能力诊断架构

## 目标

设置页的“系统能力”是只读诊断入口，用来回答当前服务器能否安全完成论文项目、模型调用、编译、文档解析、Skills 和终端任务。它不会安装依赖、修改配置、登录 CLI、发起模型推理或访问外部检索网络。

## HTTP 契约

`GET /api/capabilities` 返回稳定的 `schemaVersion: 1` 报告。每个 `capabilities[]` 项至少包含：

- `id`：稳定机器标识；
- `label`：用户可读名称；
- `status`：`available`、`degraded`、`unavailable` 或 `unknown`；
- `reason`：状态原因，不要求用户理解底层异常；
- `checkedAt`：本项检测时间；
- `details`：经过最小化和脱敏的结构化细节。

单项探测失败会降为 `unknown` 或明确的 `unavailable`，不会把整个响应变成 500。响应不得包含 API Key、Token、完整环境变量、HOME 或项目数据根的绝对路径。

`GET /api/capabilities?refresh=1` 明确请求刷新缓存。普通请求复用 30 秒缓存；所有命令使用固定 executable、固定只读版本参数、`shell: false`、独立进程组和 2.5 秒超时。版本命令只继承 PATH、HOME、locale、XDG 配置/缓存路径和证书路径等最小非秘密环境；HOME 必须保留，因为部分 CLI 即使执行 `--version` 也需要解析用户安装或配置目录，否则会把已安装工具误报为不存在。超时后复用 CLI runner 的进程树终止逻辑，先发 SIGTERM，未退出时升级 SIGKILL，避免版本命令派生的子进程残留。外部检索只报告配置状态，不进行联网探测。

## 聚合范围

- 服务端 Bearer 鉴权与危险执行 fail-closed 状态；
- Project Locator 管理的数据根可读写性；
- OpenAI-compatible、Anthropic、Codex CLI、Claude Code CLI、Copilot CLI；
- pdflatex、xelatex、lualatex、latexmk、tectonic 和 Pandoc；
- pdftotext、OCRmyPDF、Tesseract；
- Skills 已加载数量和逐定义加载错误；
- tmux / 集成终端；
- Crossref 与 Semantic Scholar 配置状态。

Provider 状态复用统一 registry 的 metadata，但能力页不会调用 Provider 的认证 probe：CLI 只运行 `--version`，不会运行 `login status` / `auth status`；HTTP Provider 只检查配置是否完整，不请求模型列表或模型。需要验证真实认证和网络连接时，用户仍应在“模型提供方”页显式点击连接测试。

## 安全边界

能力探测会启动固定的本地版本命令，因此 `/api/capabilities` 与 CLI Provider probe 一样受 `OPENPRISM_API_TOKEN` 保护。没有配置服务器 Token 时返回 503 且不启动子进程；配置后必须携带精确 Bearer Token。前端 Token 只存在 `sessionStorage`。

## 验证

- `capabilityService.test.mjs` 使用依赖注入和 fake probes 验证 schema、缓存、部分失败、脱敏，以及超时后调用共享进程树终止器；
- `capabilitiesRoute.test.mjs` 验证单项不可用不导致 500，以及未配置 Token 时 fail-closed；
- `capabilitiesUiContract.test.mjs` 锁定设置页入口、状态与刷新语义；
- `e2e/capabilities.spec.ts` 在隔离服务中验证真实 API，并用确定性的混合状态报告验证“可用/不可用”UI，不触发登录、联网或模型调用。

隔离 E2E runner 会删除开发者环境中继承的 `OPENPRISM_API_TOKEN`，然后为每次运行生成独立随机 Token；显式 `OPENPRISM_E2E_API_TOKEN` 可用于可复现调试。相同 Token 会映射到隔离后端、Playwright API fixture 和浏览器 `sessionStorage`，因此项目 CRUD 与能力诊断都在真实认证边界内运行。无 Token fail-closed 由 `authSecurity.test.mjs` 独立覆盖，普通开发 Token 不会污染测试。
