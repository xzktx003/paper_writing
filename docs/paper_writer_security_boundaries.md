# Paper Writer 安全边界

更新日期：2026-07-22

## API 认证默认值

后端继续绑定局域网可见地址，但危险能力不再因缺少配置而匿名开放：

- `/api/health` 始终公开，便于编排器与运维探活。
- 未设置 `OPENPRISM_API_TOKEN` 时，除 `/api/health`、`/api/ready` 和 Provider 元数据外，全部 API 返回 503；项目读取、写入、配置详情、模型调用、代码运行和终端都不会匿名开放。
- 设置 Token 后，除上述明确公开路径外的 API 必须携带 `Authorization: Bearer <token>`。
- 浏览器 WebSocket API 无法设置 Authorization header，因此终端握手仅在 `/api/terminal/ws` 接受 `access_token` 查询参数；普通 HTTP API 不接受查询参数代替 Bearer header。

这是一条 default-deny / fail-closed 边界：新增 API 默认受保护，不再依赖容易漏项的危险 URL 黑名单。

监听地址继续固定为 `0.0.0.0` 以满足局域网访问，但启动提示、MCP 服务发现和 Vite 代理默认值不得硬编码某台工作站的 LAN IP。`OPENPRISM_PUBLIC_HOST` 仅控制对外显示/发现地址，默认 `127.0.0.1`；LAN 部署应在被 Git 忽略的 `.env` 中显式配置当前主机地址。

生产日志不得无条件输出论文正文、system prompt、用户消息、工具结果、Provider 返回体、项目绝对根路径或样例文件路径。必要诊断只记录非敏感计数、状态码和脱敏错误分类。

`GET /api/config` 也属于受保护接口。即使 API Key 会被掩码，模型 endpoint、模型名、CA 路径和项目数据根仍属于部署元数据，不能匿名暴露。

HTTP Provider 的连接测试同样属于受保护接口。临时测试输入必须同时提供 endpoint 和 API Key；后端禁止把请求提供的 endpoint 与服务器保存的 Key 混合，避免凭据外传。

临时 Provider endpoint 还执行 SSRF 防护：只允许 http/https、禁止 URL 凭据、解析并拒绝本机/私网/link-local/metadata/reserved 地址，并在每一跳重定向前重新校验。校验后的地址集合会被固定进实际 TCP/TLS socket lookup，连接层不会再次解析 hostname；HTTPS 的 SNI 和证书验证仍使用原 hostname。Provider 使用独立 direct Agent，不允许环境代理在校验后替它重新解析目标。管理员通过服务器 `.env` 配置的 endpoint 可明确使用 LAN 服务；临时内网测试只能由管理员使用 `OPENPRISM_PROVIDER_ALLOWED_HOSTS` allowlist 放行，浏览器不能自行声明例外。

## Draw 密钥所有权

Draw 图片服务凭证属于服务器配置，不属于浏览器用户态：

- `OPENPRISM_DRAW_IMAGE_API_KEY`：服务器持有的图片 API 密钥。
- `OPENPRISM_DRAW_IMAGE_API_BASE`：服务器访问的图片 API Base URL。
- `OPENPRISM_DRAW_IMAGE_MODEL`：服务器选择的图片模型。
- `/api/config` 对 Key 只返回 `********` 和 `draw_image_api_key_set`，不得返回原文。
- 前端不得把 Key 写入 localStorage/sessionStorage，也不得把 Key 放入生成或编辑请求体。

## Draw 项目与路径边界

所有 Draw 能力使用同一条解析链：

```text
client projectId
  -> getProjectRoot(projectId)
  -> read <projectRoot>/project.json
  -> require project.json.id === projectId
  -> safeJoin(projectRoot, requestedRelativePath)
  -> image extension allow-list
```

生成、编辑、读取、下载、列表和上传均不得接受 `projectName`、绝对路径或任意磁盘根目录。即使可见名称、目录 slug 或项目重命名发生变化，稳定的项目 ID 仍是唯一外部身份。

## Draw.io 外部 iframe 边界

- `OPENPRISM_DRAWIO_EMBED_URL` 只接受绝对 HTTP(S) URL；默认值是 diagrams.net，受限网络可由管理员改为可信自托管实例。
- 前端从最终配置 URL 计算唯一允许 origin；消息必须同时来自当前 iframe `contentWindow` 且 `event.origin` 精确相等。
- 所有 `postMessage` 使用精确 target origin，禁止 `*`。
- 外部 iframe 可能接收图表 XML，错误页必须明确这一数据边界和自托管选择。
- iframe 加载失败或在限定时间内未就绪时，不允许永久 Loading；用户可重试、离线编辑当前 XML 或下载 XML，文本和项目文件仍保留在本地工作区。

## 回归验证

直接相关的红绿灯测试包括：

- `app/tests/authSecurity.test.mjs`
- `app/tests/drawProjectBoundary.test.mjs`
- `app/tests/llmSettingsPrivacy.test.mjs`
- `app/tests/appConfigEnv.test.mjs`
- `app/tests/draw-network-retry.test.js`
- `app/tests/drawioOfflineContract.test.mjs`
- `app/tests/operationalHygiene.test.mjs`
- `app/tests/e2e/drawio-offline.spec.ts`

这些测试分别约束默认认证、Bearer 语义、项目身份、路径穿越、密钥掩码、浏览器隐私以及图片网关重试行为。
