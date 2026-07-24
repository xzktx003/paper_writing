<div align="center">

<img src="app/apps/frontend/public/favicon.svg" alt="Paper Agent 标志" width="72" />

# Paper Agent

**一个本地优先、由 AI 辅助的科研论文写作、审阅与编译工作台。**

[English](README.md) | [简体中文](README_ZH.md)

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520.19-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify)](https://fastify.dev/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

Paper Agent 将真实论文项目涉及的 LaTeX/Markdown 源文件、参考文献库、图片、PDF、编译日志和证据文档统一放进一个项目工作区。它集成了 CodeMirror 编辑器、PDF 与资源预览、可控 AI 辅助、可复用 Skills、RAG、引文核验、工作流 Pipeline，以及与项目目录绑定的终端。

项目强调“由人确认”：AI 提议的文件修改会先以差异形式展示，只有用户接受后才会写入。论文项目与密钥默认保留在本机；只有在你主动配置外部模型、学术数据库、图片生成、OCR 或协作隧道时，相关数据才可能发送至对应服务。

> [!IMPORTANT]
> 当前应用位于 [`app/`](app/) 目录。安装、开发、构建和测试命令都应在该目录中执行。

## 界面预览

<div align="center">
  <img src="asserts/editor-with-file.png" alt="Paper Agent 编辑工作区" width="88%" />
  <br />
  <sub>文件树、LaTeX 源码、渲染预览与 AI 工作区</sub>
  <br /><br />
  <img src="asserts/anti-ai-panel.png" alt="Paper Agent Anti-AI 检查面板" width="88%" />
  <br />
  <sub>基于规则的写作分析与可检查的修改建议</sub>
</div>

## 功能概览

| 模块 | 当前能力 |
| --- | --- |
| 项目工作区 | 多项目面板、文件树、上传/下载、文本与二进制文件预览、项目级运行数据 |
| 编辑器 | 使用 CodeMirror 编辑 LaTeX、Markdown、BibTeX、代码及配置文件，支持搜索、标签页和未保存状态提示 |
| AI 助手 | Chat、Agent、Tools 三种模式，流式响应，图片/文件附件，会话持久化，以及修改差异确认 |
| Skills | 可搜索的中英双语 Skill 库，覆盖论文写作、调研、审稿、LaTeX 排错、引文、统计、绘图与投稿等场景 |
| 论文编译 | 支持 `pdflatex`、`xelatex`、`lualatex`、`latexmk`、`tectonic`，自动发现主文件和引擎，执行 BibTeX 编译并生成 SyncTeX/PDF |
| 证据库与 RAG | 上传 PDF/文本、提取与索引、检索、按会话选择文档，为有依据的写作提供上下文 |
| 引文核验 | 自动识别主 `.tex` 与其引用的 `.bib`，递归处理 `\input`/`\include`，并查询 CrossRef、Semantic Scholar、OpenAlex 和 arXiv |
| 论文检查 | 结构化审稿、规则/LLM Anti-AI 分析、可选 GPTZero，以及论点和证据检查工作流 |
| Pipeline | AI、Human、Compile、Citation、Compute 等阶段，支持重试、暂停、继续、跳过与人工审批节点 |
| 科研绘图 | 提示词生成、参考图上下文、图片生成与编辑，并将结果保存到当前项目 |
| 模板 | 内置 ACL，并提供 CVPR、NeurIPS、ICML 骨架；支持上传 ZIP 模板和实验性的模板迁移 |
| 终端与自动化 | 项目目录绑定的 tmux 终端、受控命令执行，以及基于 HTTP/SSE 的 MCP 工具 |
| 协作基础设施 | 配置完成后可使用基于令牌的协作路由和实时文档能力 |

## 系统架构

```text
浏览器（React + Vite + CodeMirror）
        │ HTTP / SSE / WebSocket
        ▼
Fastify 后端
  ├─ 项目、文件、会话与鉴权
  ├─ LLM 路由、Skills、审稿与 Pipeline
  ├─ LaTeX 编译与 SyncTeX
  ├─ RAG、PDF 提取与检索
  ├─ 引文和参考文献核验
  ├─ 图片生成与模板迁移
  ├─ 终端、tmux 与协作
  └─ MCP JSON-RPC 与 SSE 传输
        │
        ▼
本地论文目录（默认：./papers，已被 Git 忽略）
```

主要技术栈：

- 前端：React 18、TypeScript、Vite 8、CodeMirror 6、KaTeX、xterm.js。
- 后端：Node.js、Fastify 5、WebSocket/SSE、YAML Skills。
- 文档工具链：TeX Live/TinyTeX 或 Tectonic、BibTeX、SyncTeX，以及可选的 Pandoc、Poppler/OCR 工具。
- 所有外部集成都需要显式配置。

## 快速开始

### 1. 环境要求

必需：

- Node.js 20.19 或更高版本。
- npm 9 或更高版本。
- Git。

如果需要在本机编译 LaTeX，还需要安装以下任一种工具链：

- 完整 TeX Live；
- TinyTeX；
- Tectonic。

建议同时提供 `bibtex` 和 `synctex`。项目会自动检查可用引擎，但不会替你安装缺失的 LaTeX 宏包。

按需安装：

- `pandoc`：文档转换和部分导出流程。
- `pdftotext` / Poppler：PDF 文本提取。
- `tmux`：集成终端的会话保持。
- Playwright 浏览器与系统依赖：GPTZero 自动化和浏览器 E2E 测试。
- MinerU 或其他 OCR 服务：扫描型 PDF 的高级解析。

### 2. 克隆并安装依赖

```bash
git clone https://github.com/xzktx003/paper_wrighting.git
cd paper_wrighting
npm run install
```

仓库在 `app/` 下使用 npm workspaces 管理前后端，`app/package-lock.json` 是唯一依赖锁文件。根脚本是统一入口，会把命令及其失败码原样转发到 `app/`；不要再使用旧版文档中的 pnpm 命令。

### 3. 创建配置文件

```bash
cp app/.env.example app/.env
```

至少配置一个 OpenAI 兼容模型端点：

```dotenv
OPENPRISM_LLM_PROVIDER=openai-compatible
OPENPRISM_LLM_BASE_URL=https://api.openai.com/v1
OPENPRISM_LLM_API_KEY=your-api-key
OPENPRISM_LLM_MODEL=your-model-name
PORT=8787
```

你也可以将 `OPENPRISM_LLM_BASE_URL` 指向本地或内网中的 OpenAI 兼容服务。设置页还可选择 `anthropic`、`codex-cli`、`claude-cli` 或 `copilot-cli`。CLI Provider 只使用服务器已安装且已登录的固定命令，前端不能指定 executable 或参数模板；启用前必须配置 `OPENPRISM_API_TOKEN`，并在设置页输入同一个服务访问令牌。令牌只保存在当前浏览器会话的 `sessionStorage`，不会写入 `localStorage`。旁边的“系统能力”Tab 会以只读、缓存方式诊断 Provider、项目数据根、TeX/Pandoc、PDF/OCR、Skills、tmux 和外部检索，不会自动登录或调用模型。详细边界见 [Agent Provider 架构](docs/agent_provider_architecture.md)和[系统能力诊断架构](docs/system_capabilities_architecture.md)。请不要提交 `.env`，该文件已被 `.gitignore` 忽略。

Provider 设置页顶部提供四步快速向导，明确区分 Paper Writer 的“服务器访问令牌”和模型提供方的“API Key”：HTTP 提供方需要 endpoint 与凭据，CLI 提供方依赖服务器已安装且已登录的命令；保存前由用户显式运行连接测试。这里的 CLI 仍是只读 Chat Provider，需要修改文件的 CLI 任务必须进入独立的快照、Diff、Accept/Reject Task Agent 工作流。

在受管理项目中打开“AI 助手 → 任务”，即可使用可审查的 CLI Task Agent。后端会在项目外创建隔离快照，以固定文件权限运行选定 CLI，并返回新增、修改、删除文件、unified diff 和执行来源信息。Reject 永远不会修改原项目；Accept 在用户确认已审查全部文件后才可用，并会先检查原项目是否发生漂移，再通过持久化回滚日志应用变更。任务历史可跨页面刷新和后端重启恢复。详细说明见 [CLI Task Agent](docs/cli_task_agent.md)。

### 4. 启动开发环境

以下命令统一从仓库根目录执行：

```bash
OPENPRISM_API_ORIGIN=http://localhost:8787 npm run dev
```

默认地址：

- 前端：<http://localhost:5173>
- 后端：<http://localhost:8787>

`OPENPRISM_API_ORIGIN` 用于告诉 Vite 开发服务器将 API 和 WebSocket 请求转发到哪个后端。未设置时默认转发到 `127.0.0.1` 上的 `OPENPRISM_PORT` / `PORT`；后端位于其他主机时再显式设置，不在源码中固化某台机器的局域网地址。

若后端端口不是 `8787`，需要让两处配置保持一致：

```bash
PORT=9000 OPENPRISM_API_ORIGIN=http://localhost:9000 npm run dev
```

### 5. 构建并运行生产模式

```bash
npm run build
npm start
```

`npm run build` 会生成前端静态资源，`npm start` 会转发到 app workspace：为兼容既有部署，会先加载仓库根目录 `.env`（如存在），再以 `app/.env` 作为优先的本地覆盖；任一可选文件缺失都不会再让启动命令提前退出。生产部署时，请确认反向代理正确转发普通 HTTP、SSE 和 WebSocket 连接。

## 配置项说明

常用环境变量如下，完整示例见 [`app/.env.example`](app/.env.example)。

| 变量 | 作用 | 默认/说明 |
| --- | --- | --- |
| `PORT` | 后端监听端口 | `8787` |
| `OPENPRISM_PUBLIC_HOST` | 启动和服务发现输出使用的主机名/IP | 默认 `127.0.0.1`；LAN 部署在 `.env` 中设置当前主机地址，源码不硬编码机器 IP |
| `OPENPRISM_DATA_DIR` | 论文项目的唯一权威存放根目录 | 未设置时使用仓库根目录下的 `papers/` |
| `OPENPRISM_PROJECTS_DIR` | 旧版兼容别名 | 仅当 `OPENPRISM_DATA_DIR` 未设置时采用；两者冲突时主变量优先并输出警告 |
| `OPENPRISM_COMPILE_PATH` | TeX/Pandoc 子进程的额外命令路径 | 可选；只把显式路径前置到继承的 `PATH`，默认不猜测用户 HOME |
| `OPENPRISM_COMPILE_LD_LIBRARY_PATH` | 编译器额外动态库路径 | 可选；只把显式路径前置到继承的 `LD_LIBRARY_PATH` |
| `OPENPRISM_TECTONIC_BINARY` | 指定 Tectonic 可执行文件 | 可选；直接 LaTeX 和 Pandoc 编译共用，默认从 `PATH` 查找 `tectonic` |
| `OPENPRISM_API_ORIGIN` | Vite 开发代理的后端地址 | 本地开发建议设为 `http://localhost:8787` |
| `OPENPRISM_ENABLE_LEGACY_WORKBENCH` | Legacy 静态工作台开关 | 默认关闭；只有精确设置为 `true` 才启用迁移期兼容页，正式入口仍为 `/projects` |
| `OPENPRISM_LLM_PROVIDER` | 模型执行后端 | `openai-compatible`、`anthropic`、`codex-cli`、`claude-cli` 或 `copilot-cli` |
| `OPENPRISM_LLM_BASE_URL` | OpenAI 兼容 API 根地址 | 必须包含正确的 `/v1` 路径（如果服务要求） |
| `OPENPRISM_LLM_API_KEY` | 模型 API 密钥 | 请只放在 `app/.env` 中 |
| `OPENPRISM_LLM_MODEL` | 默认模型名称 | 由你的服务商决定 |
| `OPENPRISM_API_TOKEN` | 后端 API 访问令牌 | 正常使用必须配置；缺失时除存活/就绪检查和 Provider 元数据外，全部 API fail-closed，`/api/config` 也要求认证 |
| `OPENPRISM_PROVIDER_ALLOWED_HOSTS` | 临时 Provider 内网 host allowlist | 可选；逗号分隔，只由管理员放行确需测试的内网网关，临时 endpoint 默认拒绝私网和本机地址 |
| `OPENPRISM_PROVIDER_RESPONSE_HEADERS_TIMEOUT_MS` | Provider 响应头等待上限 | 可选，默认 `60000`；为推理模型和长输入预留首 token 等待时间，只限制建立请求并等到响应头，不限制持续正常输出的回答总时长 |
| `OPENPRISM_PROVIDER_STREAM_IDLE_TIMEOUT_MS` | Provider 流空闲上限 | 可选，默认 `120000`；只有连续无新数据达到该时长才中断，持续 token 会重置空闲窗口 |
| `OPENPRISM_COLLAB_TOKEN_SECRET` / `OPENPRISM_COLLAB_REQUIRE_TOKEN` / `OPENPRISM_COLLAB_TOKEN_TTL` | 协作签名、校验开关和有效期 | 仅启用协作时需要 |
| `OPENPRISM_MINERU_API_BASE` / `OPENPRISM_MINERU_TOKEN` | MinerU/OCR 服务地址与凭据 | 仅高级 PDF 解析需要 |
| `OPENPRISM_DRAW_IMAGE_API_KEY` / `OPENPRISM_DRAW_IMAGE_API_BASE` / `OPENPRISM_DRAW_IMAGE_MODEL` | 后端绘图凭据、网关和模型 | 可在 Draw 设置页通过受认证接口保存，密钥不得进入浏览器存储 |
| `OPENPRISM_DRAW_IMAGE_USE_LLM_CREDENTIALS` | 生图复用语言模型凭据 | 设为 `true` 时复用语言模型 Base URL/API Key，生图模型名称仍独立配置 |
| `OPENPRISM_DRAWIO_EMBED_URL` | Draw.io 嵌入地址 | 可选；默认使用 diagrams.net，受限网络建议改为管理员控制的可信 HTTP(S) 自托管实例 |
| `OPENPRISM_TUNNEL` / `NGROK_AUTHTOKEN` | 隧道模式与 ngrok 凭据 | 仅相应部署方式需要 |

修改后端 `.env` 后需要重启服务；修改 `OPENPRISM_API_ORIGIN` 后需要重启 Vite 开发服务器。

编译子进程默认原样继承服务进程的 `PATH` 和 `LD_LIBRARY_PATH`。只有 TeX、Pandoc 或 Tectonic 安装在非标准位置时，才需要配置上述编译专用变量；系统不再自动猜测某个用户的 `HOME/bin`、Conda 目录或其他主机路径。空配置不会产生多余的 `:` 路径项。

每次生产构建都会生成前后端共享的 build ID。浏览器加载工作区前会读取 `/api/health`，如果后端缺少构建元数据、API schema 不兼容或 build ID 不同，将阻止继续使用并提示管理员重新构建、重启。`/api/ready` 独立检查项目数据根和模板 manifest，不再把“进程仍存活”误当成“系统已经可用”。

依赖安全以提交的 `app/package-lock.json` 为准；`tests/dependencySecurityContract.test.mjs` 锁定已知 advisory 的安全版本下限。升级前先用 `npm explain` 区分生产与开发路径，再做当前 semver 范围内的定向更新，禁止把不可控的 `npm audit fix --force` 当成默认方案。当前可达性记录与发布检查见 [`docs/dependency_security.md`](docs/dependency_security.md)。

体量较大的静态 Paper Writer Workbench 已明确归类为默认关闭的 Legacy / Prototype，并不是第二套正式应用。它的独有功能迁移清单、验收条件和最终移除策略记录在 [Legacy Workbench 生命周期](docs/legacy_workbench_lifecycle.md)。React `/projects` 是唯一正式产品入口，正式界面不会链接该原型。

## 详细使用教程

### 创建或导入项目

1. 打开项目首页，选择空白项目或内置模板。
2. 设置项目名称；系统会在 `OPENPRISM_DATA_DIR` 下创建“安全可读名称 + 短 UUID”目录，并在 `project.json` 中保留完整 UUID 作为稳定 ID。
3. 如果数据根中已经存在含 `.tex`、`.bib`、PDF 或 Markdown 的普通论文目录但没有 `project.json`，项目首页会在“发现的论文目录”中只读预览目录、文件数和建议主文件。只有你明确确认后，系统才会在原目录写入稳定项目 ID；注册不会移动或删除原有论文文件。
4. 项目列表会同时显示项目名称、稳定项目 ID 和实际存储目录。名称用于界面识别，ID 用于 API 和项目身份，存储目录对应磁盘中的真实子目录；ID 和目录均可复制用于备份与排障。
5. 如已有压缩包或远程论文，可上传 `.tex`、`.bib`、图片、PDF，直接导入 ZIP，或通过 arXiv ID / URL 拉取源码。
6. 打开项目后，在左侧文件树中新建、重命名、移动、上传或下载文件。
7. 建议让每篇论文保持独立目录，避免编译产物、会话和证据库相互混用。

编辑器右侧的“最终 PDF”只展示最近一次已经生成的 PDF，不会因为打开或反复点击标签而重新编译。需要更新 PDF 时，点击顶部“编译/重新编译”或 PDF 面板中的“重新编译最终 PDF”。Skill 选择器支持先在弹层里勾选多个 Skill，再点击“添加已选”一次加入。

项目源文件在本地目录中是普通文件，可以继续使用 Git、命令行或其他编辑器管理。

正式 React 工作区会向章节、AI/审稿、引文、Pipeline、文件 watcher 和 Terminal API 发送 managed `projectId` 与项目内相对路径。旧 `__paper_agent__:<id>` marker 只作为可观测、带弃用提示的旧客户端兼容输入；绝对 `projectPath` 仅保留给边界独立的外部 Code/MCP 目录能力，不是 managed 论文 API 的捷径。

### 编辑、编译与预览

1. 在文件树中打开主 `.tex` 文件。
2. 点击编译按钮；后端会尝试发现主文件并选择合适引擎。
3. 如果论文显式使用 XeLaTeX/LuaLaTeX，或模板对引擎有要求，请在项目编译设置中指定。
4. 编译日志会显示缺失宏包、语法错误、BibTeX 错误及执行命令。
5. 成功后在预览区查看 PDF；SyncTeX 可用于源码与 PDF 定位。

典型编译流程会根据项目内容执行 LaTeX、BibTeX 和额外 LaTeX 轮次。**快速预览**明确属于近似渲染，会为未解析引用、命令或图片显示结构化占位；**最终 PDF**才是权威排版结果。已经生成 PDF 但仍有重跑/引用警告时，界面会显示“编译成功但有警告”，而不是无条件成功。编译失败时先处理日志中出现的第一个错误，后续错误通常只是连锁结果。

### 使用 Chat、Agent 与 Tools 模式

右侧 AI 面板提供三种工作方式：

- **Chat**：讨论论文、解释文本、分析错误，不默认修改文件；可通过只读工具查看受管项目内任意安全文件。
- **Agent**：允许模型读取整个项目的安全文件并提出跨文件修改；修改会先显示差异，等待你接受或拒绝。
- **Tools**：用于更明确的工具调用，例如检索、文件读取、编译、引文核验和审稿。

建议流程：

1. 新建对话时，当前编辑器选中的文件默认作为“首要参考文件”优先注入；也可以改选其他项目文件、选择不指定首要文件的项目范围或自由上下文。首要文件只是优先参考，不会限制 AI 查看其他安全项目文件。
2. 通过回形针添加图片、PDF 或其他上下文文件。
3. 给出约束，例如目标会议、字数、不能改变的结论和引用格式。
4. 检查 AI 返回的依据与差异，不要直接接受未经核对的事实和引用。
5. 接受修改后重新编译，并检查 PDF、引文和图表编号。

### 使用 Skills

点击聊天输入区或 Draw 面板中的 **Select Skill**。选择器采用三级结构：**科研大类 → 任务小类 → 具体 Skill**。例如展开“论文写作”后，会先看到“大纲与规划、摘要、Introduction、Related Work、Method、实验与结果、语法与润色”等小类；继续展开小类，才会显示 Skill 名称及其真实功能说明。点击具体 Skill 后，它会出现在已选列表中，并向模型注入对应的规则、检查项和工作步骤。

Skill 目录由运行时与生成 manifest 驱动，不再在文档和测试中维护容易漂移的固定上限（当前检出版本运行时加载 123 个 Skill）。CI 验证 Skill ID 唯一、生成 manifest 一致和分类 taxonomy 合法；前端计数来自同一运行时目录，并隐藏数量为零的分类。批量导入的医学、材料、人文历史、探险剧情、通用网页研究和同功能重复项已移除。开源部分包括面向 AI/ML 的 AlterLab Skill、SNL 顶会写作流程、AI4S、ResearchPilot 中文科研流程、逐项审核的 SkillsBot Skill，以及下表中的热门 GitHub Skill。迁移的是完整上游资源，而不是只有一段摘要提示词；文件位于 `app/apps/backend/skill-resources/`。

| GitHub 来源 | 仓库 Star¹ | 已接入能力 | 许可证 |
|---|---:|---|---|
| `handsomestWei/patent-disclosure-skill` | 3,374 | AI/软件项目专利挖掘、现有技术差异化、技术交底书、一致性检查与 DOCX 交付 | MIT |
| `huggingface/skills` | 10,761 | AI 论文阅读，以及论文与模型、数据集、Space 等研究产物的发布关联 | Apache-2.0 |
| `uditgoenka/autoresearch` | 5,235 | 围绕指标执行修改、评估、保留或回滚，并按边界条件停止的自主实验循环 | MIT |

¹ Star 是 2026-07-03 的仓库快照，只作为来源热度与可追溯信息，不等同于质量保证。热门 Skill 会在选择器中显示该信息。

文献检索不再使用“大而全”的数据库列表，而是按实际用途拆分为：检索式与筛选策略、arXiv、Google Scholar、Semantic Scholar、DBLP、Hugging Face AI 论文页面、论文阅读与信息提取、综述与证据综合、Related Work、BibTeX 管理和引用真实性核验。OpenAlex、USPTO 检索、PubMed、材料数据库及历史史料检索不再作为可选 Skill 展示。专利方向只保留面向项目代码和技术材料的“专利挖掘与技术交底书”完整流程，不引入泛化的专利数据库 Skill。

常见用法包括：

- 论文段落润色、摘要压缩与学术风格调整；
- related work 调研和文献差距分析；
- LaTeX 编译诊断与模板检查；
- 统计方法、实验设计与图表建议；
- 审稿意见生成、rebuttal 与投稿前检查。

一次优先选择最贴近当前任务的 Skill。Skill 提供的是过程约束，并不能替代对引用、实验结果和投稿规范的人工确认。

使用建议：

1. 先展开与任务最接近的大类，再按小类缩小范围，不要同时启用大量含义重叠的 Skill。
2. 中文/英文按钮会同时切换大类、小类、Skill 名称和功能说明。
3. Chat 中选中的 Skill 作用于对话及 Agent 修改任务；Draw 中选中的 Skill 作用于“生成图片描述”阶段。
4. Draw 会把绘图 Skill 的布局、图形类型、视觉风格和检查规则注入提示词；最终图片仍由配置的图片模型生成。
5. 如果修改了 YAML Skill，重启后端或重新加载 Skill 列表后再测试。

### 建立 RAG 证据库

1. 打开右侧 **RAG** 标签页。
2. 上传论文 PDF、笔记或文本资料。
3. 查看“RAG 索引健康状态”：面板会显示索引代次、确定性的语料指纹、文件/分块统计，以及每个文件的解析器、警告和失败原因。文档新增、上传或删除后会自动重建索引；“修复 / 重建索引”只用于恢复和诊断，不是日常必点步骤。扫描 PDF 可能需要 OCR/MinerU。
4. 先在面板中检索关键词确认真实可命中，再在当前会话中勾选要使用的文档。内置检索是透明的本地关键词/词项重叠检索，不是语义向量检索。`.openprism`、`.compile` 和 `research_corpus` 默认不显示在普通源码树中，证据资料统一从 RAG 面板管理。
5. 提问时要求模型区分“证据中的内容”和“推断”，并附上可核查的出处。

RAG 提高的是上下文可访问性，不代表生成内容必然准确。不要因为 PDF 上传成功就假定正文可用，应检查逐文件解析状态、抽取字符数、可检索分块和真实命中。`GET /api/projects/:id/rag/health` 是严格只读诊断：索引缺失或损坏时只报告状态，不会在 GET 中偷偷隔离或重建；搜索和普通资料操作仍保留已有自动恢复行为。最终论述应回到原始论文核对。

### 移动端工作区

当视口不超过 800 px 时，编辑器不会继续压缩桌面三栏，而会切换为互斥的 **文件 / 编辑器 / AI 助手** 三个主视图；项目列表也会从窄表格切换为适合触控的项目卡片。语言切换会同步文档 `lang`。核心 UI CSS 不再请求 Google Fonts 或其他远程字体样式表，统一使用操作系统本地字体栈及 CJK、等宽字体回退，在无外网或受限网络中也能保持导航可读和布局稳定。

### 核验引文与参考文献

打开 **Citations** 标签页，可使用：

- **Verify All Citations**：解析正文与 BibTeX，并尝试通过外部学术数据库验证条目。
- **Cross-Check Only**：只检查正文引用键、BibTeX 条目和未引用条目之间的一致性，不依赖完整的外部核验。

系统不会把参考文献文件写死为 `references.bib`。它会从项目的编译主文件出发，递归分析 `\input`/`\include`，并读取 `\bibliography{...}` 或 `\addbibresource{...}` 所指向的 `.bib` 文件。

使用前请确认：

1. 项目中存在可识别的主 `.tex` 文件。
2. 主文件或其子文件中包含正确的参考文献声明。
3. `.bib` 路径相对于声明它的 TeX 文件可解析。
4. 完整核验需要访问 CrossRef、Semantic Scholar、OpenAlex 或 arXiv；网络受限时可先使用 Cross-Check Only。

外部服务可能限流或超时。界面会显示进行状态，并允许停止长时间任务；数据库“未找到”不等于文献一定不存在，仍需人工核对 DOI、标题和作者。

### 生成与编辑科研图片

1. 打开 **Draw** 标签页。
2. 在 **Skills** 中依次展开“科研绘图”和具体小类，选择架构图、科学示意图、统计图或发表级排版等 Skill。
3. 加载当前论文的 `.tex` 内容，并描述图片类型、布局、文字、配色和目标用途。
4. 如需保持风格或结构，添加项目 PDF 中的参考图片。
5. 可以点击生成图片描述，让后端组合论文内容、参考图说明和所选 Skill 的完整规则；也可以跳过这一步，直接手写最终生图 Prompt。
6. 最终 Prompt 始终可编辑。Draw 设置页支持独立填写生图 Base URL、API Key、模型，或直接复用语言模型的 Base URL/API Key。生成时只发送文本框中的最终 Prompt，不会自动追加论文正文。
7. 检查坐标轴、标签、数值、字体和版权问题；结果会保存到当前项目的 `draw/` 目录。

`.drawio` 文件使用配置的外部或自托管 Draw.io iframe，外部编辑器可能接收图表 XML。若编辑器在就绪超时内无法加载，页面会显示重试、离线 XML 编辑和 XML 下载，不会永久停在加载状态。受限网络应通过 `OPENPRISM_DRAWIO_EMBED_URL` 指向管理员控制的可信 HTTP(S) 自托管实例。LaTeX 快速预览与核心界面均不再请求远程字体样式表。

图片功能需要配置对应的绘图模型或网关。Skill 负责约束和增强提示词，不会代替图片 API，也不会自行执行未接入的上游脚本。生成式图片适合示意图和视觉草稿；包含实验数据的图表应由可复现代码生成。

### Review 与 Anti-AI

- **Review**：按论文结构、论证、实验、可复现性、写作和引用等维度生成检查意见。
- **Anti-AI**：提供规则或模型辅助的文本模式分析；GPTZero 集成为可选功能。

这些结果是启发式信号，不应被当作作者身份、学术不端或论文质量的确定结论。应逐条回到正文和证据进行判断。

### 运行 Pipeline

Pipeline 用于把多步论文任务组织成可恢复流程。一个典型流程可以是：

```text
检索/分析 → AI 草拟 → 人工确认 → 引文核验 → LaTeX 编译 → 最终检查
```

1. 在 **Pipeline** 标签页选择或创建流程。
2. 配置每个阶段的输入、输出与失败策略。
3. 对关键内容加入 Human 审批阶段。
4. 启动后查看实时日志；失败阶段可以重试、跳过，流程也可暂停和继续。
5. 完成后检查实际文件差异、编译产物与引文报告。

### 使用集成终端

底部终端与当前项目目录绑定，适合运行 Git、LaTeX、脚本和数据处理命令。安装 `tmux` 后可获得更稳定的会话保持。执行删除、覆盖或批量转换命令前，仍应先确认当前目录和参数。

### 模板迁移

模板迁移用于尝试把现有论文内容映射到另一套会议/期刊模板。由于不同模板的宏、标题结构、匿名规则和参考文献样式差异很大，该功能属于实验性工作流；迁移后必须重新编译并人工检查全文。

## MCP 集成

后端提供 MCP JSON-RPC/SSE 接口，可供兼容的智能体客户端调用项目工具。当前工具包括：

| 工具 | 用途 |
| --- | --- |
| `paper_search` | 检索论文或学术条目 |
| `verify_citations` | 通过外部来源核验参考文献 |
| `cross_check_citations` | 对照正文引用键与 BibTeX 条目 |
| `compile_latex` | 编译指定项目的 LaTeX |
| `read_project_file` | 读取项目内文件 |
| `ai_polish` | 对选定文本提出润色建议 |
| `ai_review` | 执行 AI 辅助论文审阅 |

如启用了 `OPENPRISM_API_TOKEN`，MCP 客户端也必须携带对应凭据。不要将具有项目读写或命令执行能力的端点直接暴露到公网。

## 模板与 Skills

内置项目模板清单当前包含 ACL、arXiv、ICLR 2026，并提供 CVPR、NeurIPS、ICML 项目骨架。所有随仓库分发且可作为 LaTeX 入口的模板都必须在 manifest 中声明真实主文件和面向用户的名称/说明；模板画廊只返回当前有内容的分类，“全部”筛选由前端统一提供。你也可以上传自己的 ZIP 模板作为项目起点。

后端 Skills 位于 [`app/apps/backend/skills/`](app/apps/backend/skills/)，采用 YAML 描述。添加或修改 Skill 时，应保证：

- 标识符唯一，名称和描述清晰；
- 指令只覆盖一个明确任务；
- 文件或工具权限与任务所需范围一致；
- 中英文展示字段保持一致；
- 用真实项目测试模型输出和文件修改行为。

Skill 被成功加载只代表它可以出现在目录中，不代表当前机器已经具备执行条件。Skill 管理页会显示 `ready`、`degraded` 或 `unavailable`，以及命令、凭证、网络、项目文件、Provider 能力、副作用和费用级别。没有显式执行元数据的旧 Skill 会保守显示为 `degraded`；“就绪检查”是只读静态检查，不会运行脚本、访问网络或调用模型。执行元数据格式和边界见 [`docs/skill_execution_readiness.md`](docs/skill_execution_readiness.md)。

开源 Skill 由 [`app/scripts/sync-open-source-skills.mjs`](app/scripts/sync-open-source-skills.mjs) 生成，不应直接批量修改生成的 YAML。更新上游版本时，在仓库根目录执行：

```bash
npm --prefix app run skills:sync
```

同步清单记录了来源仓库、精确 commit、过滤数量和文件列表：[`open-source-skills.manifest.json`](app/apps/backend/skills/open-source-skills.manifest.json)。GitHub 来源保留许可证和第三方声明；SkillsBot 未公开标注许可证的条目会在 YAML 中明确标记“请核对原作者许可”。同步脚本使用显式 AI/ML 白名单，避免上游仓库更新后重新引入无关或重复 Skill。

## 开发与测试

以下命令统一从仓库根目录执行：

```bash
# 前端生产构建
npm run build

# 单元测试（排除需要服务的 integration）
npm run test:unit

# 真实 TypeScript 门禁（tsc --noEmit）
npm run typecheck

# 隔离 API 集成测试
npm run test:integration

# 运行单个测试文件
npm --prefix app exec vitest run tests/project-page-sidebar.test.js

# 浏览器 E2E（需要 Playwright 浏览器和系统依赖）
npm run test:e2e

# 构建 + 单测，或完整发布门禁
npm run check
npm run check:full
```

集成测试和浏览器测试会在随机 loopback 端口启动隔离后端，使用临时 `OPENPRISM_DATA_DIR`，自行创建测试项目，并在成功或失败后清理进程与数据；不会依赖开发者 `papers/` 中的固定项目。

当前隔离浏览器 runner 只拥有一个有状态后端和一个临时数据根，因此 Playwright 明确使用 `fullyParallel: false`、`workers: 1`。这样可以避免项目注册、RAG 重建、会话恢复和 Draw.io 网络模拟互相竞争。除非未来为每个 worker 提供独立后端、端口、数据根和 Bearer Token，否则不要手动提高 worker 数。隔离测试通过也不能替代正式重启后的 LAN 验收；正式环境仍必须验证前后端 build ID、`/api/ready`、鉴权和权威数据根一致。

Skills 运行记录会区分“Provider 请求已完成”和“论文目标已验证”：`provider_completed` 只表示适配器返回，只有真正 evaluator 写入目标状态后才能显示目标通过。Skill 被加载或模型返回 HTTP 200，都不代表科学结论正确。

前端和后端分别位于 npm workspace 中，根入口也提供了对应代理：

```bash
npm run dev:frontend
npm run dev:backend
```

## 仓库结构

```text
paper_wrighting/
├── app/
│   ├── apps/
│   │   ├── frontend/       # React/Vite 用户界面
│   │   └── backend/        # Fastify API、编译、AI 与工具服务
│   ├── package.json        # npm workspaces 与顶层脚本
│   └── .env.example        # 环境变量示例
├── asserts/                # README 使用的图片资源（保留现有目录名）
├── papers/                 # 默认本地项目数据，不提交到 Git
├── README.md               # English documentation
├── README_ZH.md            # 中文文档
└── LICENSE
```

## 常见问题

### 前端无法连接后端

确认后端端口与开发代理一致，然后重启两个进程：

```bash
PORT=8787 OPENPRISM_API_ORIGIN=http://localhost:8787 npm run dev
```

若使用远程主机，还要检查防火墙、反向代理、SSE 和 WebSocket 转发。

### 模型列表或 AI 请求失败

检查 `LLM_BASE_URL`、`LLM_API_KEY` 和 `LLM_MODEL`。许多兼容服务要求基础地址包含 `/v1`，模型名称也必须与服务端完全一致。修改 `.env` 后重启后端。

### 出现 `pdflatex.fmt` 或缺少 `.sty`

这表示 TeX 安装不完整或当前进程使用了错误的 TeX 环境。先运行 `which pdflatex`、`kpsewhich dashrule.sty` 和 `pdflatex --version` 确认路径，再通过当前 TeX 发行版安装缺失宏包并刷新格式/文件数据库。不要混用系统 TeX 与 Conda/TinyTeX 的可执行文件和 Perl 脚本。

### 引文核验一直很慢

完整核验会访问多个外部数据库，可能受网络、限流和服务状态影响。先用 **Cross-Check Only** 排除本地引用键问题，再重试完整核验；必要时停止任务并检查后端日志。

### 提示找不到参考文献文件

确认编译主文件中存在 `\bibliography{path/name}` 或 `\addbibresource{path/name.bib}`，文件名大小写正确，路径相对于声明所在的 TeX 文件有效。系统会动态发现引用的 `.bib`，不会固定查找 `references.bib`。

### PDF/RAG 没有提取到有效文本

先确认 PDF 是否包含可选择的文本。扫描版 PDF 需要 OCR；安装 Poppler 或配置 MinerU 后重新导入。加密、损坏或字体编码异常的 PDF 也可能无法正常解析。

### 修改后界面仍是旧版本

开发模式下重启 Vite；生产模式下重新执行 `npm run build` 并重启后端。必要时清除浏览器缓存，确认服务实际使用的是新的 `apps/frontend/dist`。

## 隐私与安全

- `papers/`、`.env`、运行时文件和前端构建产物已从 Git 中忽略。
- 不要把 API 密钥写入源码、Skill 或论文项目文件。
- 外部 LLM、学术数据库、OCR 和绘图服务可能接收你提交的文本或文件，请先确认其数据政策。
- 远程部署时应启用访问令牌、TLS、网络访问控制和可信反向代理。
- AI 生成的引用、数值、结论和文件修改都必须人工核验。

## 参与贡献

欢迎提交问题和改进。提交代码前建议：

1. 从当前分支创建功能分支。
2. 保持改动范围明确，并为行为变化添加测试。
3. 运行相关测试与 `npm run build`。
4. 在 Pull Request 中说明用户影响、配置变化和验证方式。

报告问题时，请附上复现步骤、浏览器与 Node 版本、相关后端日志，以及去除密钥和论文敏感内容后的最小示例。

## 许可证

本项目采用 [MIT License](LICENSE)。
