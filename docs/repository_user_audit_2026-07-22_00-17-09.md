# Paper Agent 仓库使用体验与系统完整性审计

- 审计时间：2026-07-21 23:51 至 2026-07-22 00:17（Asia/Shanghai）
- 审计对象：`paper_wrighting` 当前工作区
- 审计方式：用户旅程实测、Playwright 浏览器验证、API 验证、代码与配置审阅、关键单测/E2E/生产构建验证
- 变更范围：只新增本报告；未修改产品实现、配置或用户论文数据
- 审计原则：区分“实测证据”“代码证据”“推断”和“未验证项”，不把存在入口或函数等同于功能可用

## 1. 结论摘要

当前仓库已经具备论文项目管理、编辑、LaTeX 编译、AI 对话、Skills、RAG、引文核验、Pipeline、Draw 和终端等大量模块，生产构建也能成功完成。问题不在于“完全没有功能”，而在于功能增长速度已经超过了产品契约、配置边界、测试闭环和安全边界的收敛速度。

从使用者角度看，当前系统最突出的问题可以归纳为五类：

1. **核心功能存在前后端契约断裂。** RAG 文本可以添加成功，但“Index corpus”和“Search”两个核心按钮实际请求不存在的后端路由，均返回 404。用户看到的是一个完整的 RAG 面板，但核心检索链路无法从 UI 跑通。
2. **项目的用户名称、内部 ID、磁盘目录和功能专用路径没有形成统一模型。** 新建项目显示中文名称，但磁盘目录直接使用 UUID；重命名只改元数据，不改目录，也不更新时间；Draw 又使用另一套 `OPENPRISM_PROJECTS_DIR`。用户无法凭磁盘目录识别项目，不同功能还可能把文件写入不同根目录。
3. **LLM 配置仍是单一 HTTP API 思维。** UI 固定写入 `openai-compatible`，只有 Base URL、API Key、Model 三个文本框。当前机器已经安装 Codex、Claude 和 Copilot CLI，但系统没有 CLI Agent Provider、可用性检测、登录态复用或统一执行后端抽象。
4. **功能表面很丰富，但状态恢复、移动端、国际化和测试可信度不足。** 刷新编辑器后不会自动恢复活动会话；移动端项目页和编辑器基本不可用；中文在无系统 CJK 字体的 Linux/Playwright 环境中显示为方框；项目 E2E 测试依赖固定的 `torq` 项目并与当前 UI 文案不一致。
5. **安全默认值与“局域网可见”要求冲突。** 服务绑定 `0.0.0.0`，但 API Token 默认可不配置；在本次隔离实例上，未携带任何鉴权信息即可调用命令执行 API 并成功执行 `pwd`。Draw 还会把图片 API Key 明文保存在浏览器 `localStorage`，并使用未规范化的 `projectName` 拼接保存路径。

综合判断：当前版本更接近“多个强功能模块已经接入的研发工作台”，尚未达到“默认安全、路径一致、核心流程可靠、测试可作为发布门禁”的稳定产品状态。应先修复 P0/P1 契约和边界问题，再继续增加新模块。

## 2. 审计范围与实际验证方法

### 2.1 隔离运行环境

为避免改动现有 `papers/` 数据，本次审计启动了独立后端实例：

- 地址：`http://127.0.0.1:8791`
- 监听：后端同时监听 `0.0.0.0`
- 隔离数据目录：`/tmp/paper-wrighting-audit-20260721-6fNqjf`
- 浏览器：Playwright Chromium，桌面视口和 390×844 移动视口
- 测试项目：`用户可见项目名-中文 空格-20260721`
- 测试项目 ID：`79692122-28ae-40c5-b445-1c438b57a7a5`

本次在隔离目录中执行了以下真实用户操作：

- 打开项目列表页；
- 打开设置窗口；
- 通过页面创建项目；
- 检查页面名称、API 元数据和磁盘目录；
- 重命名项目并再次核对磁盘目录和元数据；
- 打开 ACL 模板文件；
- 执行真实 LaTeX 编译；
- 创建会话；
- 打开 Skills 选择器与 Skills 管理器；
- 选择 `Paper Planning` Skill，并验证其写入会话；
- 在 RAG 中添加文本证据；
- 点击 RAG 索引和检索；
- 在桌面与移动视口检查项目页和编辑器；
- 通过无鉴权 API 执行无害命令 `pwd`，验证默认安全边界。

### 2.2 验证命令和结果

| 验证项 | 结果 |
| --- | --- |
| `npm run build`（`app/`） | 通过；Vite 成功构建，但报告编辑器主 chunk 约 1.35 MB，超过 500 kB 警戒线 |
| 关键 Vitest：项目、RAG、Skills、设置隐私、会话等 8 个文件 | 54 通过，2 失败 |
| Skills 测试失败 1 | 实际 123 个 Skill，测试要求不超过 110 |
| Skills 测试失败 2 | `ccf-idea-reviewer` 使用了不在允许集合内的分类 |
| 项目 Playwright E2E | 6 通过，4 失败 |
| E2E 失败原因 | 文案仍断言“所有项目”；固定依赖 `torq` 项目；搜索测试同样依赖 `torq` |
| ACL 实际编译 | 成功生成 PDF；但 TeX 最多重跑 6 轮并报告一致性警告 |
| RAG 添加文本 | 成功，生成 1 个 chunk |
| RAG 索引按钮 | 失败，`POST /rag/index` 返回 404 |
| RAG 搜索按钮 | 失败，`GET /rag/search` 返回 404 |
| 未鉴权命令执行 | 成功，`POST /api/code/exec` 返回 200 并执行 `pwd` |

## 3. 问题优先级总览

| 优先级 | 数量 | 主要问题 |
| --- | ---: | --- |
| P0 | 3 | 局域网未鉴权命令执行；Draw 密钥明文持久化；Draw 路径拼接缺少统一安全解析 |
| P1 | 9 | RAG 核心路由断裂；项目名称/目录不一致；双项目根目录；无 CLI Provider；移动端不可用；Skills 漂移；活动会话不恢复；测试门禁失真；设置缺少验证和失败反馈 |
| P2 | 12 | 中英混用；CJK 字体缺失；项目更新时间错误；默认模板不透明；模板主文件元数据不一致；预览请求 500；空分类；文档变量错误；包管理入口混乱；大 bundle；隐藏运行目录暴露；RAG UI 语义重复 |
| P3 | 5 | 新旧项目 API 并存；功能原型与正式 UI 重叠；测试脚本入口缺失；模型列表接口未利用；模块状态和能力缺少统一可观测性 |

## 4. P0：必须优先处理的问题

### P0-1：服务局域网可见时，命令执行 API 默认可以无鉴权访问

**证据类型：实测证据 + 代码证据。置信度：高。**

实测中，隔离实例绑定 `0.0.0.0:8791`，未设置 `OPENPRISM_API_TOKEN`。不携带 Authorization Header 调用：

```http
POST /api/code/exec
Content-Type: application/json

{
  "projectPath": "<隔离项目绝对路径>",
  "command": "pwd"
}
```

返回 HTTP 200，并在项目 `code/` 目录中执行成功。

对应代码：

- `app/apps/backend/src/index.js:191`：固定监听 `0.0.0.0`。
- `app/apps/backend/src/middleware/auth.js:8-11`：没有配置 API Token 时直接不注册认证钩子。
- `app/apps/backend/src/routes/code.js:31-37`：暴露 `/api/code/exec`。
- `app/apps/backend/src/services/codeExecutor.js:125-139`：最终通过 `bash -c` 执行命令。
- `README_ZH.md` 只把 Token 描述为远程部署时“建议配置”，没有把局域网暴露与命令执行能力绑定为强制安全门禁。

**用户影响：**

- 同网段中的其他设备可能读取、修改项目文件或执行命令；
- 如果端口被反向代理、隧道或误暴露，风险进一步扩大；
- “本地优先”会让用户误以为默认配置天然安全，但实际监听范围是整个局域网。

**改进建议：**

1. 当监听地址不是 loopback 时，启动过程必须要求有效 Token，或自动生成一次性 Token 并在 UI 中明确展示；
2. 把命令执行、文件写入、终端、配置修改拆成独立 capability，不应只靠一个全局 Token；
3. 默认关闭 `/api/code/exec`、Tools 写入和 Compute 命令执行，用户显式启用后才开放；
4. 命令执行不再使用字符串加 `bash -c`，改为结构化 `{ executable, args, cwd }`；
5. 增加真实局域网未授权请求的红灯测试，而不是只测函数级白名单。

### P0-2：Draw API Key 明文保存在浏览器 localStorage

**证据类型：代码证据。置信度：高。**

- `app/apps/frontend/src/app/components/DrawPanel.tsx:115-125` 从 `localStorage['draw_api_settings']` 读取包含 `apiKey` 的完整对象；
- `app/apps/frontend/src/app/components/DrawPanel.tsx:145-147` 每次配置变化都把包含 API Key 的对象重新写入 localStorage；
- `app/apps/frontend/src/app/components/DrawPanel.tsx:128-151` 保存的多组配置同样包含完整 `settings`，因此也可能重复保存密钥；
- 主 LLM 设置已经明确禁止在浏览器缓存密钥，但 Draw 没有遵循同一规则。

**用户影响：**

- 同源脚本、浏览器扩展、XSS 或共享浏览器会话可以读取图片 API Key；
- 用户可能以为所有密钥都只保存在后端 `.env`，实际 Draw 使用了不同安全策略。

**改进建议：**

- Draw 只在后端保存密钥，前端只接收 `api_key_set: true/false`；
- 多配置保存只保存 Provider、Base URL、Model 和显示名称，不保存密钥；
- 增加回归测试，扫描 `localStorage`、sessionStorage、IndexedDB 和前端日志中是否出现 Key；
- 对已经保存过的 `draw_api_settings` 和 `draw_saved_settings` 提供自动清理迁移。

### P0-3：Draw 使用请求中的 projectName 直接拼接目录

**证据类型：代码证据 + 安全推断。置信度：高。**

- `app/apps/backend/src/routes/draw.js:267-279` 使用 `path.join(papersDir, projectName, 'draw')` 确定写入目录；
- `app/apps/backend/src/routes/draw.js:410-412`、`539-553`、`580-594`、`643-677` 在生成、读取、下载、列出和上传等多个路径继续使用同样方式；
- 这些路径没有统一经过 `safeJoin(DATA_DIR, ...)` 或项目 ID 解析；
- Draw 使用的根目录还是 `OPENPRISM_PROJECTS_DIR`，而项目管理使用 `OPENPRISM_DATA_DIR`。

**推断：** 如果调用方绕过正常前端直接构造 `projectName`，存在越出预期项目目录或访问错误项目目录的风险。由于本轮只做发现，不执行路径攻击验证。

**改进建议：**

- Draw API 只接收 `projectId`，后端通过 `getProjectRoot(projectId)` 得到真实目录；
- 禁止客户端传绝对路径或目录名；
- 所有读写统一经过 `safeJoin(projectRoot, 'draw', relativePath)`；
- 增加 `..`、绝对路径、URL 编码穿越、符号链接等红灯测试。

## 5. P1：阻塞核心体验的问题

### P1-1：RAG 核心检索链路在 UI 中不可用

**证据类型：Playwright 实测 + 前后端契约对照。置信度：高。**

真实操作结果：

1. 在 RAG 面板添加 `attention-evidence.md` 成功；
2. 后端文档列表显示 `parseStatus: indexed`、`chunks: 1`；
3. 点击 `Index corpus`，界面显示 `Index failed: Not Found`；
4. 请求为 `POST /api/projects/:id/rag/index`，返回 404；
5. 输入唯一检索词后点击 `Search`，界面显示 `Search failed: Not Found`；
6. 请求为 `GET /api/projects/:id/rag/search`，返回 404。

前端契约：

- `app/apps/frontend/src/app/api/paperRagApi.ts:49-50` 请求 `/rag/index`；
- `app/apps/frontend/src/app/api/paperRagApi.ts:59-60` 请求 `/rag/search`。

后端实际路由：

- `app/apps/backend/src/routes/paperRag.js:35-53` 有文档增删查；
- `app/apps/backend/src/routes/paperRag.js:197-202` 有 `/rag/context`；
- 文件中没有注册 `/rag/index` 和 `/rag/search`。

现有测试为什么没有发现：

- `app/tests/paperRag.test.mjs` 直接测试 `indexProjectCorpus`、`searchCorpus` 等 service；
- route 测试主要覆盖 OCR 和文本导入；
- 没有测试前端实际调用的 `/rag/index`、`/rag/search` 契约。

**改进建议：**

- 先明确 API 方案：补齐两个路由，或让前端统一调用 `/rag/context`；
- 建立共享路由契约/类型，不允许前端手写不存在的路径；
- 增加 Playwright 红灯测试：上传文本 → 索引 → 检索唯一词 → 显示来源路径与行号；
- RAG 面板应显示结构化错误，不应只显示后端通用 `Not Found`。

### P1-2：项目显示名称与磁盘目录名称确实不一致

**证据类型：Playwright 实测 + 文件系统证据。置信度：高。**

创建项目名称：

```text
用户可见项目名-中文 空格-20260721
```

实际目录：

```text
79692122-28ae-40c5-b445-1c438b57a7a5/
```

`project.json`：

```json
{
  "id": "79692122-28ae-40c5-b445-1c438b57a7a5",
  "name": "用户可见项目名-中文 空格-20260721"
}
```

对应代码：

- `app/apps/backend/src/routes/projects.js:141-149` 创建 UUID，并直接用 UUID 作为目录名；
- `app/apps/backend/src/routes/projects.js:125-128` 列表接口额外返回真实 `dirName`，但前端列表没有展示；
- `app/apps/backend/src/services/projectService.js:6-33` 先按 ID 目录找，再扫描所有目录中的 `project.json` 回退匹配。

这不是纯粹的视觉问题。当前实现已经同时存在“目录名等于 ID”和“目录名不等于 ID、通过扫描元数据解析”两种模式，说明仓库历史数据模型并未完全统一。

**改进建议：**

采用明确的四字段模型：

| 字段 | 规则 |
| --- | --- |
| `project_id` | UUID，创建后不可变，只用于内部关联 |
| `display_name` | 用户可修改，允许中文和空格 |
| `directory_name` | 可辨识且安全，例如 `paper-title--79692122` |
| `project_path` | 只由后端根据根目录和 `directory_name` 计算，不接受客户端任意绝对路径 |

兼容旧项目时，后端可以继续通过 `project.json` 解析，但新建项目应生成可辨识目录；UI 还应提供“在文件管理器中打开”和“复制实际路径”。

### P1-3：项目重命名没有更新目录，也没有更新 updatedAt

**证据类型：Playwright 实测 + 代码证据。置信度：高。**

将项目重命名为 `重命名后的论文工程` 后：

- 页面名称和 `project.json.name` 已改变；
- 目录仍为原 UUID；
- `updatedAt` 仍等于最初 `createdAt`；
- 项目列表仍按旧时间显示“最后修改”。

代码 `app/apps/backend/src/routes/projects.js:270-275` 只替换 `name`，不更新 `updatedAt`。

**改进建议：**

- 先决定重命名是否只改显示名；如果目录不随重命名，UI 必须明确说明；
- 无论是否改目录，项目元数据变更都应更新 `updatedAt`；
- 如果未来支持目录重命名，必须使用事务式迁移、冲突检测和失败回滚。

### P1-4：项目存储存在两套根目录配置

**证据类型：代码证据 + 当前运行配置证据。置信度：高。**

- 项目管理使用 `OPENPRISM_DATA_DIR`：`app/apps/backend/src/config/constants.js:7`；
- Draw 使用 `OPENPRISM_PROJECTS_DIR`：`app/apps/backend/src/routes/draw.js:16-24`；
- App Config 默认把 `projects_dir` 设为 `$HOME/papers`：`app/apps/backend/src/config/appConfig.js:84`；
- 本次运行中 `/api/config.projects_dir` 指向用户主目录下的 `papers`，但实际项目由 `DATA_DIR` 写入仓库根目录的 `papers/`；
- 中文 README 使用了并不存在的裸变量名 `DATA_DIR`，英文 README 才区分两个变量。

**用户影响：**

- 用户在设置或文档中看到的项目目录可能不是实际项目目录；
- Draw 图片可能保存到另一个根目录；
- 备份、迁移和故障排查容易漏数据。

**改进建议：**

- 只保留一个权威项目根目录；
- Draw、RAG、会话、编译产物、Pipeline 和终端全部从 `projectId` 解析项目根；
- 删除 `projects_dir` 与 `DATA_DIR` 的双轨语义，或明确一个仅是迁移别名；
- 启动时打印实际生效目录，并在设置页只读显示。

### P1-5：LLM Provider 没有形成可扩展的执行后端

**证据类型：代码证据 + 环境探测。置信度：高。**

当前设置页只有：

- API Base URL；
- API Key；
- Model。

`app/apps/frontend/src/app/components/SettingsModal.tsx:47-58` 在保存时固定写入：

```json
{ "llm_provider": "openai-compatible" }
```

后端 `app/apps/backend/src/services/llmService.js:404-424` 只区分：

- `openai-compatible`；
- 其他值全部走 Anthropic。

本机环境探测结果：

- `codex`：已安装；
- `claude`：已安装；
- `copilot`：已安装；
- `gh`：已安装。

仓库没有 Codex、Claude Code 或 Copilot CLI Provider，也没有复用其登录状态。

**建议的目标边界：**

```text
用户任务
  → UnifiedAgentRequest
      ├─ HTTP LLM Provider
      │    ├─ OpenAI-compatible
      │    └─ Anthropic Messages
      └─ CLI Agent Provider
           ├─ Codex CLI
           ├─ Claude Code
           ├─ Copilot CLI
           └─ Custom executable adapter
```

统一接口至少包含：

- `probe()`：检测命令是否存在、是否已登录、版本和能力；
- `run()`：结构化输入、项目工作目录、允许工具、超时和取消信号；
- `stream()`：输出 token、状态、工具调用和 stderr；
- `cancel()`：终止进程树；
- `capabilities`：是否支持图片、工具、文件编辑、结构化输出；
- `provenance`：记录 Provider、模型/命令、版本、开始结束时间和退出码。

CLI Provider 不能实现为任意 shell 字符串。应使用固定 executable 和参数数组，工作目录限制在项目根，并为文件修改增加 diff/审批边界。

### P1-6：移动端项目页和编辑器不可用

**证据类型：Playwright 实测 + CSS 证据。置信度：高。**

在 390×844 视口下：

- 项目页左侧栏固定占 240 px，主内容被挤到右侧；
- 项目表格只剩极窄区域，主要字段和操作不可见；
- `body` 和 `.project-shell` 使用 `overflow: hidden`，用户无法通过横向滚动补救；
- 编辑器只剩文件树和 AI 面板，中央编辑区完全不可见；
- AI 顶部多个标签互相重叠；
- 文件名被严重截断。

CSS 证据：

- `app/apps/frontend/src/app/App.css:4085-4103` 项目 Shell 固定横向布局，侧栏固定 240 px；
- `app/apps/frontend/src/app/App.css:4331-4394` 表格各列设置较大的最小宽度；
- 仅 Landing Page 有明确的 600 px 响应式规则；项目页和编辑器缺少对应适配。

**改进建议：**

- 小屏项目页使用可收起抽屉侧栏，项目表格切换卡片列表；
- 编辑器小屏改为 Files / Editor / Assistant 三个互斥主视图；
- 顶部功能 Tab 允许横向滚动或放入菜单；
- 增加 390×844、768×1024 的 Playwright 截图与可操作性测试。

### P1-7：Skills 数量和分类已经漂移，测试处于失败状态

**证据类型：运行时 API + 单测。置信度：高。**

- 运行时 `/api/skills` 返回 123 个 Skill；
- README_ZH 声称“共保留 104 个”；
- Skills 选择器显示的主要分类计数合计为 122，并保留 `Grant Writing (0)`；
- `app/tests/skillEngine.test.mjs` 要求 Skill 数量不超过 110，因此失败；
- `ccf-idea-reviewer` 分类不在测试允许的十个学术分类中，因此第二个测试失败。

正向证据：Skill 选择和持久化基础链路可用，选择 `Paper Planning` 后，会话详情中的 `active_skills` 正确包含 `paper-planning`。

**改进建议：**

- 为 Skills 建立生成式目录清单，README 数量、UI 分类和测试都从同一份 manifest 生成；
- CI 中验证每个 Skill 的唯一 ID、分类、子分类、中文名称、来源、许可证和资源路径；
- 隐藏数量为 0 的分类；
- 增加选中 Skill 后对最终 system prompt 的集成测试，而不只测试 `assemblePrompt()` 函数。

### P1-8：刷新后不会恢复活动会话

**证据类型：Playwright 实测。置信度：高。**

创建“审计测试会话”后，当前页面可正常使用。刷新或重新进入编辑器时：

- 会话标签仍存在；
- 右侧主体显示 `No active conversation`；
- 用户必须再次点击会话标签才能继续；
- Skills、输入框和上下文选择在重新激活前不可见。

**改进建议：**

- 保存每个项目最后活动的会话 ID；
- 进入项目时优先恢复最后活动会话，若不存在则选中最近更新会话；
- 增加刷新恢复、删除活动会话后回退、跨标签页更新的 E2E。

### P1-9：项目 E2E 不能作为可信发布门禁

**证据类型：实际测试运行。置信度：高。**

`app/tests/e2e/projects.spec.ts` 共 10 项，本次 6 通过、4 失败：

1. 当前页面标题是“我的项目”，测试仍要求“所有项目”；
2. 侧栏测试仍要求已删除的“所有项目”入口；
3. “已有项目”测试硬编码要求存在 `torq`；
4. 搜索测试同样硬编码搜索 `torq`。

测试还把项目 ID 放在同一 describe 的变量中，而全局配置 `fullyParallel: true`。虽然本次用单 worker 执行，默认并行时仍存在测试间状态依赖风险。

**改进建议：**

- 每个测试自行创建唯一项目并清理，不依赖仓库已有数据；
- 文案断言使用稳定的 role/label 或产品契约，不依赖过期文案；
- 对共享 CRUD 场景使用 serial describe，其他场景保持并行；
- E2E 必须使用独立临时 `OPENPRISM_DATA_DIR`；
- 将 RAG、Provider 设置、Skills 和会话恢复加入真实浏览器门禁。

## 6. P2：明显影响体验和维护的问题

### P2-1：中文界面依赖宿主机字体，Playwright/Linux 中显示为方框

**证据类型：Playwright 截图 + 网络错误 + CSS。置信度：高。**

桌面和移动截图中，大量中文字符显示为方框。控制台同时出现 Google Fonts 请求 `ERR_EMPTY_RESPONSE`。

- `app/apps/frontend/src/app/App.css:1` 在线加载 Google Fonts；
- 加载的 Inter、Source Serif 4、JetBrains Mono 本身不是中文字体；
- `body` 字体栈只有 `Inter`, `Helvetica Neue`, `sans-serif`，没有明确 CJK 字体回退；
- `app/apps/frontend/index.html:2` 固定为 `<html lang="en">`，切换中文时没有同步文档语言。

**改进建议：**

- 增加系统 CJK 字体栈，如 `PingFang SC`, `Microsoft YaHei`, `Noto Sans CJK SC`, `Source Han Sans SC`；
- 核心 UI 不依赖外部 Google Fonts 才能可读；
- 根据 i18n 状态更新 `document.documentElement.lang`；
- E2E 镜像安装或内置一套可复现的中文字体。

### P2-2：项目页是中文，编辑器核心模块大量使用英文

**证据类型：Playwright 实测。置信度：高。**

中文模式下仍显示：

- `Files`, `Upload`, `Open a file from the project tree`；
- `AI Assistant`, `Chat`, `Draw`, `RAG`, `Review`, `Citations`, `Pipeline`；
- RAG 中的 `Corpus`, `Search`, `External`, `Upload`；
- Skills 管理器中大部分分类英文；
- 新建会话弹窗完全英文；
- 错误直接显示 `Not Found`。

建议为所有用户可见字符串统一使用 i18n key，并在 CI 中扫描 JSX 硬编码字符串。

### P2-3：新建项目默认静默选择第一个模板，没有明确的空白项目

**证据类型：代码证据 + Playwright 实测。置信度：高。**

- `app/apps/frontend/src/app/ProjectPage.tsx:111-119` 模板加载后自动选择第一项；
- 当前第一项是 ACL；
- 用户只输入项目名并点击创建，也会复制 ACL 模板；
- 新建弹窗没有明显的“空白项目”选项。

用户容易把“新建项目”理解为建立空项目，但实际得到完整 ACL 示例论文。

建议增加明确的 `Blank` 模板，并让默认值由设置或用户最近选择决定。

### P2-4：模板 manifest 的主文件与模板真实文件不一致

**证据类型：文件证据。置信度：高。**

`app/templates/manifest.json` 把 ACL 的 `mainFile` 声明为 `main.tex`，但实际复制出的文件是：

- `acl_latex.tex`；
- `acl_lualatex.tex`；
- `acl.sty`；
- `acl_natbib.bst`；
- `custom.bib`。

没有 `main.tex`。目前编辑器依赖运行时发现逻辑绕过了该问题，但 manifest 已经不是可信契约。

建议每个模板增加自动验收：创建项目后，`mainFile` 必须存在并能完成一次最小编译。

### P2-5：LaTeX 即时渲染预览与真实 PDF 差异明显

**证据类型：Playwright 实测。置信度：高。**

打开 ACL 示例时，HTML Rendered Preview 中出现：

- `\And`、`\texttt` 等命令残留；
- 交叉引用显示为 `[ref]`；
- 表格和图注内容变形；
- 对 `example-image-golden`、`example-image-a` 的 blob 请求返回 500。

真实 LaTeX 编译最终成功，因此问题集中在前端近似解析器与资源解析，不是源文件本身必然不可编译。

建议明确区分“快速近似预览”和“编译 PDF”，对不支持的命令给出提示，不要呈现为看似最终的排版结果。

### P2-6：ACL 编译成功，但默认流程最多重跑 6 轮

**证据类型：实际编译日志。置信度：高。**

Tectonic 日志多次出现：

- `internal consistency problem when checking if acl_latex.bbl changed`；
- `TeX rerun seems needed, but stopping at 6 passes`。

最终 PDF 生成成功，但一次空白模板编译已经触发较长的多轮流程和大量下载。建议缓存依赖、改进 BibTeX 稳定性判断，并在 UI 中区分警告与失败。

### P2-7：RAG 的 UI 语义与后端自动行为不一致

**证据类型：实测 + 代码。置信度：高。**

添加文本后文档已经显示 `indexed`、`chunks: 1`，但 UI 仍要求用户点击 `Index corpus`。这个按钮又请求不存在的接口。

建议明确采用一种模式：

- 自动索引：上传成功即索引，不再显示全局 Index；或
- 手动索引：上传只保存，用户点击后统一构建索引。

不要同时存在“自动已索引”和“手动再索引”的两套心智模型。

### P2-8：RAG 内部运行目录直接出现在用户文件树

**证据类型：Playwright 实测。置信度：高。**

添加 RAG 文档后，文件树出现 `.openprism` 和 `research_corpus`。其中 `.openprism/paper-rag-index.json` 属于运行时内部索引，普通用户不应在论文文件树中直接处理。

建议：

- 默认隐藏 `.openprism`、`.compile` 等内部目录；
- `research_corpus` 可以作为独立“资料库”入口展示，而不是与论文源码混在同一层；
- 提供“显示内部文件”高级开关。

### P2-9：设置页没有 Provider、连接测试、模型加载和保存失败反馈

**证据类型：Playwright 实测 + 代码。置信度：高。**

- `/api/models` 已存在，但设置 UI 没有使用；
- Provider 不可选择；
- Base URL 占位符写的是 Anthropic，但保存固定为 OpenAI-compatible；
- 保存按钮没有 `await`，请求失败时仍立即关闭窗口；
- 没有 URL 校验、模型探测、超时提示或配置状态。

建议设置页至少提供：Provider、连接测试、模型列表/手填模式、密钥已配置状态、错误详情和生效状态。

### P2-10：README、环境变量和包管理入口不一致

**证据类型：文件证据。置信度：高。**

- 根 `package.json` 声明 `packageManager: pnpm@10.13.1`，但 README_ZH 要求进入 `app/` 使用 npm；
- 根目录只有 `start`，`app/` 才有 `dev/build/e2e`；
- README_ZH 写 `DATA_DIR`，代码只读取 `OPENPRISM_DATA_DIR`；
- `app/.env.example` 没有 `OPENPRISM_PROJECTS_DIR`，但 Draw 启动时要求它存在；
- `app/package.json` 没有统一的 `test`、`lint`、`typecheck`、`check` 脚本。

建议根目录提供唯一入口并代理到 `app/`，同时建立 `npm run check` 聚合构建、类型、单测和 E2E 预检。

### P2-11：生产 bundle 过大

**证据类型：构建输出。置信度：高。**

构建成功，但 `EditorPage` JavaScript 约 1.35 MB，gzip 后约 373 kB，并触发 Vite 大 chunk 警告。大量编辑器语言、Draw、Pipeline、RAG 和审稿模块可能一起进入编辑器首屏。

建议对重功能面板和 CodeMirror 语言包做按需加载，优先降低首次进入项目的下载与解析成本。

### P2-12：空分类和元数据噪声降低 Skills 可用性

**证据类型：Playwright 实测。置信度：高。**

Skills 选择器和管理器都显示 `Grant Writing (0)`。用户点击后没有内容，却占据一级分类位置。部分 Skill 的中文名称也呈现为英文名称加通用后缀，分类和描述质量不完全一致。

建议隐藏空分类，并把“能否执行、需要什么依赖、输出是什么”作为列表的第一信息，而不是只展示数量和长描述。

## 7. P3：架构与长期维护问题

### P3-1：存在两套项目创建/访问模型

- `/api/projects` 使用受管项目 ID 与 `project.json`；
- `/api/paper-projects` 和章节 API 仍接受 `projectPath`；
- 前端同时存在 `src/api/client.ts` 和 `src/app/api/projectApi.ts` 两套项目 API；
- AI 使用 `__paper_agent__:<id>` 这种字符串协议在 ID 与路径之间转换。

建议逐步收敛到 `projectId + relativePath`，停止让浏览器传任意绝对项目路径。

### P3-2：正式产品 UI 与大型原型页面并存

`app/apps/frontend/public/paper-writer-workbench.html` 包含另一套体量很大的工作台和验收状态逻辑。它与 React 正式 UI 的功能可能重叠，增加文档、功能清单和维护边界的不确定性。

建议明确原型、兼容页和正式入口的生命周期，不再让原型承担事实上的功能规范。

### P3-3：模型列表接口存在但没有进入用户闭环

后端 `/api/models` 可以请求 Provider 模型列表，设置页和新建会话只显示当前默认模型。建议把模型探测能力接入设置页，并缓存探测结果和失败原因。

### P3-4：缺少统一的能力状态页

当前功能依赖 TeX、BibTeX、Pandoc、tmux、Playwright、OCR、外部文献源、LLM、Draw API 等，但用户没有一个地方能看到哪些可用、哪些缺失、哪些仅部分工作。

建议增加 Capability Dashboard：

- Provider 与登录状态；
- 编译引擎；
- RAG 解析器/OCR；
- Skills 载入数量与错误；
- 终端/tmux；
- 外部检索源；
- 数据目录和权限；
- 安全模式与 API 鉴权状态。

### P3-5：测试入口和发布标准没有统一

仓库有大量测试文件，但 `app/package.json` 没有 `test`、`lint`、`typecheck` 或 `check` 聚合脚本。测试数量多不等于发布门禁有效；当前 Skills 与项目 E2E 已经失败，生产构建仍可单独通过。

建议定义唯一的本地/CI 验收命令，并把核心红灯测试纳入其中。

## 8. 建议的改进路线

### 阶段 0：安全止血与核心契约修复

目标：让当前已有功能达到“默认安全、核心链路可运行”。

1. 非 loopback 监听时强制认证；
2. 默认关闭命令执行能力；
3. 清除 Draw localStorage 密钥；
4. Draw 全部改用 `projectId` 和安全路径解析；
5. 修复 RAG `/index`、`/search` 契约；
6. 添加对应 Playwright 红灯测试；
7. 修复当前 2 个 Skills 单测和 4 个项目 E2E。

### 阶段 1：统一项目身份与数据目录

目标：消除名称、ID、目录和功能专用路径的分裂。

1. 明确 `project_id/display_name/directory_name/project_path`；
2. 合并 `OPENPRISM_DATA_DIR` 与 `OPENPRISM_PROJECTS_DIR`；
3. 所有 API 只接受 `projectId + relativePath`；
4. 提供旧项目扫描、校验和迁移工具；
5. UI 显示实际路径并支持打开目录；
6. 重命名、复制、归档、删除、恢复统一更新时间和审计记录。

### 阶段 2：建立统一 Agent Provider 层

目标：同时支持 API LLM 与本地 CLI Agent。

首批建议支持：

- OpenAI-compatible API；
- Anthropic API；
- Codex CLI；
- Claude Code；
- GitHub Copilot CLI；
- 受控 Custom CLI。

实现顺序建议：

1. 先定义 Provider contract 和 capability；
2. 迁移现有两个 HTTP Provider；
3. 接入 Codex CLI 作为首个 CLI 适配器；
4. 完成进程流式输出、取消、超时、退出码和 diff；
5. 再接 Claude Code、Copilot；
6. 设置页展示探测结果和现有登录态，而不是要求重复填 API Key。

### 阶段 3：收敛 Skills 生命周期

目标：从“很多 Skill”转向“可发现、可验证、可执行、可追踪”。

1. 单一 manifest 生成 README、分类和 UI 数量；
2. 校验来源、许可证、资源文件和分类；
3. 展示依赖、输入、输出、风险与预计耗时；
4. 记录每次执行实际激活的 Skill 和版本；
5. 增加 Skill 执行结果而不是只验证 prompt 拼接；
6. 对需要 CLI、网络或特定 API 的 Skill 做 capability gate。

### 阶段 4：完善 RAG 证据闭环

目标：让 RAG 真正服务论文引用，而不是只做文本搜索。

1. 上传后显示解析、索引、失败和恢复状态；
2. 支持项目隔离、增量更新、删除同步和重建；
3. 结果保留文件、页码、章节、行号和 chunk ID；
4. 对引用写作增加“证据不足禁止生成确定性引用”的门禁；
5. 把 RAG 文档选择、检索结果和最终 AI 回答做可追溯关联；
6. 增加 PDF、扫描 PDF、Markdown、BibTeX 的端到端用例；
7. 明确关键词、向量和混合检索策略。目前代码表现更接近本地文本检索，UI 不应暗示已经具备完整向量数据库能力。

### 阶段 5：体验、国际化与可观测性

1. 修复移动端信息架构；
2. 完成中文字符串覆盖和 CJK 字体回退；
3. 恢复活动会话；
4. 提供能力状态页；
5. 为设置保存、模型探测、外部服务失败提供明确反馈；
6. 隐藏运行时内部目录；
7. 拆分编辑器 bundle。

## 9. 推荐的红绿灯验收用例

### 项目身份

1. 用中文、空格和特殊字符创建项目；
2. 页面显示名正确；
3. 目录名安全、可辨识、唯一；
4. 重命名后 `updatedAt` 更新；
5. 复制、删除、恢复后 ID 与目录一一对应；
6. 重启服务后仍能正确解析。

### RAG

1. 上传包含唯一 token 的 Markdown；
2. 文档状态显示可检索；
3. 搜索唯一 token；
4. 页面展示命中片段、来源路径和定位信息；
5. 删除文档后再次搜索不得命中；
6. 不存在路由或后端失败时显示可操作错误。

### Provider

1. 探测 Codex/Claude/Copilot 是否安装和登录；
2. 未安装时显示安装提示，不显示可选状态；
3. CLI 任务支持流式输出和取消；
4. 取消后没有残留子进程；
5. Agent 修改先生成 diff，不直接覆盖论文；
6. Provider、版本、模型/命令写入任务记录。

### 安全

1. 局域网监听且无 Token 时服务拒绝启动或进入只读模式；
2. 未授权请求不能读取文件、写文件、执行命令或修改配置；
3. `projectName=../../...` 不得越出项目目录；
4. 浏览器存储中不得出现 API Key；
5. 日志和错误响应不得泄露 Key；
6. shell 元字符、环境变量注入和符号链接逃逸均被拒绝。

### 移动端

1. 390×844 下能创建和打开项目；
2. Files、Editor、Assistant 三个主视图都能切换；
3. 功能 Tab 不重叠；
4. 主操作按钮可见并可点击；
5. 不依赖横向页面滚动访问核心功能。

## 10. 已确认、推断和未验证边界

### 已确认

- 项目显示名称与实际目录不一致；
- 重命名不更新目录和 `updatedAt`；
- RAG 添加文本成功，但 Index/Search UI 均 404；
- Skill 选择和会话持久化基础链路可用；
- Skills 数量/分类测试失败；
- 刷新后活动会话不恢复；
- 项目 E2E 有 4 个失败；
- 移动端布局不可用；
- 中文在当前 Linux Playwright 环境中显示为方框；
- 无 Token 时命令执行 API 可访问；
- Draw API Key 被写入 localStorage；
- 生产构建成功，但存在大 chunk 警告；
- ACL 可以真实编译出 PDF。

### 高可信推断

- Draw 的 `projectName` 路径拼接可能造成目录越界或错误项目访问；
- 双项目根目录可能导致 Draw 与项目管理的数据分离；
- CLI Provider 可以复用本机现有登录态，明显降低用户配置成本；
- 现有 service 单测无法保护前端路由契约。

### 本轮未验证

- 未真实发送 LLM 对话，避免产生外部费用和修改建议；
- 未调用图片生成 API，避免外部费用；
- 未执行恶意命令或路径穿越攻击；
- 未实际导入远程 arXiv 项目；
- 未完整跑通 Review、Citation、Anti-AI 和每种 Pipeline stage；
- 未测试多人协作和隧道部署；
- 未对所有 123 个 Skill 逐个执行，只验证加载、分类测试、选择和 prompt 持久化链路。

这些未验证项不影响本报告中已经通过实测或直接代码证据确认的问题，但后续正式发布审计仍应覆盖。

## 11. 最终建议

短期不要继续以“再增加一个面板或再导入一批 Skills”为主要方向。当前最值得投入的是收敛已有能力：

1. 先修安全默认值和 RAG 断路；
2. 统一项目身份与存储目录；
3. 把 Codex/Claude/Copilot 作为正式 Provider 接入，而不是临时 shell 命令；
4. 让 Skills 数量、分类、文档和测试重新一致；
5. 把真实 Playwright 用户旅程设为功能完成标准；
6. 只有核心流程稳定后，再扩充 RAG、Pipeline 和更多 Skills。

仓库目前最需要的不是更多功能名，而是让用户能明确知道：项目实际存在哪里、任务实际由谁执行、资料是否真的被检索、Skill 是否真的生效、操作失败在哪里，以及系统在局域网中是否安全。
