<div align="center">

# 🎓 Paper Agent

**AI 驱动的学术论文全流程写作助手**

_从选题、检索、综述、写作、润色到投稿 —— 一个本地部署的智能论文工作台_

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520-green.svg)](https://nodejs.org)
[![Skills](https://img.shields.io/badge/Skills-60+-orange.svg)](#-60-科研技能系统)

</div>

---

Paper Agent 是一个**本地优先**的 Web 应用，将学术论文的完整生命周期浓缩到一个浏览器界面中。它集成了 LLM 多模型对话、CodeMirror 编辑器、LaTeX 编译引擎、内置终端、以及覆盖科研全流程的 **60+ 技能系统**——帮助研究者从灵感萌芽到论文发表，全程高效推进。

> 💡 **本地部署，数据不出校园网。** 所有论文数据、对话记录、编译产物均存储在本地文件系统，支持接入任意 OpenAI 兼容 API 或 Claude API。

---

## ✨ 为什么选择 Paper Agent？

<table>
<tr>
<td width="50%">

### 🔬 覆盖完整科研流程

不再需要在多个工具之间来回切换。Paper Agent 将选题、文献检索、综述、写作、统计分析、绘图、润色、投稿回复、学术海报/幻灯片制作整合为统一的工作流。

</td>
<td width="50%">

### 🧠 60+ 专业科研技能

每个技能都是经过精心设计的 Prompt 工程模板，覆盖 Nature / Science / NeurIPS / ACL 等顶刊顶会的写作规范。一键调用，让 AI 按照学术标准输出。

</td>
</tr>
<tr>
<td>

### 🔒 本地优先，数据安全

论文数据、LLM 对话、编译缓存全部存储在本地。支持自建 LLM 代理，适合高校、实验室和对数据安全有要求的场景。

</td>
<td>

### ⚡ 极致的编辑体验

基于 CodeMirror 6 的 Markdown/LaTeX 编辑器，支持分屏预览、SyncTeX 源码-PDF 跳转、AI 内联建议 diff 对比、一键接受/拒绝。

</td>
</tr>
</table>

---

## 🖼️ 界面预览

<div align="center">

![Paper Agent Editor](docs/readme-assets/board-overview.png)

_多章节编辑 · AI 对话 · LaTeX 编译预览 · 内置终端 —— 四合一工作界面_

</div>

---

## 🚀 核心功能

### 📝 项目与章节管理
- 创建、归档、标签管理论文项目
- 多章节结构化写作，支持 NeurIPS / ACL / Plain 等 LaTeX 模板
- Markdown + LaTeX 混合编辑，分屏实时预览
- SyncTeX 源码行号到 PDF 页面的精确定位

### 🤖 AI 智能写作助手
- **多模型支持**：OpenAI 兼容 API（GPT-4o / DeepSeek / Qwen 等）+ Claude API
- **上下文感知对话**：每个章节独立对话历史，AI 自动感知当前章节上下文
- **内联编辑建议**：AI 在源码中插入修改建议，以 diff 形式展示，一键接受或拒绝
- **代码执行沙箱**：从编辑器直接运行实验代码，结果自动回填
- **MCP 协议集成**：支持 Model Context Protocol 扩展工具链

### 💻 内置终端
- 基于 xterm.js + tmux 的完整终端体验
- WebSocket 实时通信，支持 scrollback replay
- 可挂载已有 tmux 会话或创建新会话
- 可调大小的分屏终端面板

### 📊 LaTeX 编译与预览
- 多引擎支持：`pdflatex` / `xelatex` / `lualatex`
- BibTeX / BibLaTeX 参考文献自动管理
- 增量编译 + 错误日志定位
- PDF 内嵌预览 + SyncTeX 导航

### 📤 导出与协作
- 一键导出 PDF / DOCX / HTML
- WebSocket 多用户实时协作
- BibTeX 引用导入与格式化
- AI 使用声明自动生成

---

## 🔬 60+ 科研技能系统

Paper Agent 内置 **60 个专业科研技能**，覆盖从选题到发表的完整学术工作流。每个技能都是经过精心设计的 Prompt 模板，确保 AI 输出符合学术规范。

<details>
<summary><b>📚 选题与检索 (Topic Selection & Search)</b></summary>

| 技能 | 说明 |
|------|------|
| Scientific Brainstorming | SCAMPER / 逆向头脑风暴 / 第一性原理选题 |
| Research Ideation | 5W1H 框架化研究选题 |
| Idea Mining | 从文献空白、趋势和跨领域机会中挖掘研究想法 |
| Hypothesis Formulation | 结构化科学假设生成 |
| Academic Search & Retrieval | 系统性文献检索（arXiv / PubMed / Scholar） |
| Literature Search | PRISMA 框架文献检索策略 |
| Daily Paper Generator | 每日论文摘要（arXiv / bioRxiv） |

</details>

<details>
<summary><b>📖 综述与统筹 (Review & Orchestration)</b></summary>

| 技能 | 说明 |
|------|------|
| Literature Review | 叙事性 / 系统性 / 范围性文献综述 |
| Systematic Review | PRISMA 系统性综述方法论 |
| ARS Full Pipeline | 完整学术工作流编排 |
| Academic Pipeline | 研究到发表的全流程管理 |
| Paper Storyline | 从分散想法到连贯叙事的结构化 |

</details>

<details>
<summary><b>✍️ 写作与润色 (Writing & Polishing)</b></summary>

| 技能 | 说明 |
|------|------|
| Abstract Writing | 结构化 / 非结构化摘要生成 |
| Introduction Writing | CARS 模型引言写作 |
| Methodology Writing | 可复现的方法论章节 |
| Results & Analysis | APA 格式统计结果报告 |
| Discussion Writing | 研究解读、局限性与未来方向 |
| Conclusion Writing | 结论与影响声明 |
| Nature Writing | Nature 风格学术散文 |
| ML Paper Writing | 顶会 ML/AI 论文写作 |
| Nature Polishing | Nature 期刊级英文润色 |
| Anti-AI Writing | 去除 AI 写作痕迹 |
| Grant Proposal | 基金申请书写作 |

</details>

<details>
<summary><b>📊 统计与绘图 (Statistics & Visualization)</b></summary>

| 技能 | 说明 |
|------|------|
| Statistical Analysis | 假设检验决策树、效应量、多重比较 |
| Statistical Reporting | APA 格式统计报告 |
| Meta-Analysis | 跨研究结果合并 |
| Nature Figure Design | Nature 期刊标准图表（色盲友好） |
| Scientific Visualization | matplotlib / seaborn 出版级图表 |
| Publication Charts | 论文图表与表格设计 |

</details>

<details>
<summary><b>📬 投稿与汇报 (Submission & Presentation)</b></summary>

| 技能 | 说明 |
|------|------|
| Reviewer Response | 逐条审稿人回复信 |
| Paper Self-Review | 投稿前质量自检清单 |
| Conference Submission | 会议投稿格式 / 双盲 / Rebuttal |
| Nature Data Availability | Nature 数据可用性声明 |
| Paper to PPT/Beamer | 论文转演讲幻灯片 |
| Academic Poster Design | 学术海报设计 |

</details>

<details>
<summary><b>🔧 工具 (Utilities)</b></summary>

| 技能 | 说明 |
|------|------|
| Citation Verification | 引用准确性验证 |
| Reference Management | BibTeX / BibLaTeX 管理 |
| LaTeX Template Organizer | LaTeX 模板整理 |
| ARS Format Convert | LaTeX / DOCX / PDF / Markdown 格式转换 |
| ARS Disclosure | AI 使用声明生成 |
| Doc Co-authoring | 协作文档创作 |

</details>

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 19 · Vite · CodeMirror 6 · xterm.js · GSAP · react-i18next |
| **后端** | Fastify · @fastify/websocket · node-pty · SSH2 |
| **AI/LLM** | OpenAI 兼容 API · Claude API · MCP 协议 |
| **编译** | LaTeX (pdflatex/xelatex/lualatex) · BibTeX · SyncTeX |
| **存储** | 本地文件系统 · JSON 配置 |
| **包管理** | npm workspaces (apps/backend + apps/frontend) |

---

## 📁 项目结构

```
paper_wrighting/
├── app/                              # 📦 Paper Agent 主应用
│   ├── apps/
│   │   ├── backend/                  # Fastify API 服务
│   │   │   ├── src/
│   │   │   │   ├── index.js          # 入口
│   │   │   │   ├── routes/           # API 路由
│   │   │   │   │   ├── ai.js         # LLM 对话与补全
│   │   │   │   │   ├── compile.js    # LaTeX 编译
│   │   │   │   │   ├── skills.js     # 技能引擎 API
│   │   │   │   │   ├── terminal.js   # PTY 终端 WebSocket
│   │   │   │   │   ├── export.js     # PDF/DOCX 导出
│   │   │   │   │   └── ...
│   │   │   │   ├── services/         # 业务逻辑层
│   │   │   │   │   ├── llmService.js # LLM 多提供商抽象
│   │   │   │   │   ├── skillEngine.js# 技能加载与注册
│   │   │   │   │   ├── compileService.js
│   │   │   │   │   └── ...
│   │   │   │   └── config/           # 应用配置
│   │   │   └── skills/               # 60+ YAML 技能定义
│   │   └── frontend/                 # React SPA
│   │       └── src/app/
│   │           ├── EditorPage.tsx     # 论文编辑器
│   │           ├── LandingPage.tsx    # 项目列表首页
│   │           └── components/
│   │               ├── CenterPanel.tsx    # 编辑器 + 预览
│   │               ├── TerminalPanel.tsx  # xterm.js 终端
│   │               └── Layout.tsx         # 三栏布局
│   └── package.json
├── apps/                             # 🔧 Coding Kanban (CLI Agent 工作台)
│   ├── server/                       # TypeScript Fastify 后端
│   ├── web/                          # React + xterm.js 前端
│   └── ../packages/shared/           # 共享类型与 DTO
├── docs/                             # 📄 文档
├── papers/                           # 📂 用户论文项目数据
├── tests/                            # 🧪 E2E 测试 (Playwright)
└── scripts/                          # ⚙️ 开发与部署脚本
```

---

## 🏁 快速开始

### 环境要求

| 依赖 | 版本 | 用途 |
|------|------|------|
| Node.js | ≥ 20 | 运行时 |
| npm | 任意 | `app/` 工作区包管理 |
| pnpm | ≥ 10 | 根目录 Coding Kanban 工作区 |
| tmux | 任意 | 内置终端 |
| texlive | 任意 | LaTeX 论文编译 |

### 安装与启动

```bash
# 1. 克隆仓库
git clone https://github.com/xzktx003/paper_wrighting.git
cd paper_wrighting

# 2. 安装并启动 Paper Agent
cd app
npm install
npm run dev

# 3. 打开浏览器
#    后端 API: http://localhost:8787
#    前端页面: http://localhost:5173
```

### 生产部署

```bash
cd app
npm run build       # 构建前端静态资源
npm start           # 启动后端，自动托管前端
# 访问 http://localhost:8787
```

---

## ⚙️ 配置

通过环境变量或 API 配置 LLM 提供商：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 8787 | 后端服务端口 |
| `LLM_BASE_URL` | - | OpenAI 兼容 API 地址 |
| `LLM_API_KEY` | - | API 密钥 |
| `LLM_MODEL` | gpt-5.5 | 模型名称 |
| `CLAUDE_BASE_URL` | - | Claude API 地址 |
| `CLAUDE_API_KEY` | - | Claude API 密钥 |
| `CLAUDE_MODEL` | claude-sonnet-4.6 | Claude 模型名称 |

---

## 📡 API 概览

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/projects` | GET/POST | 论文项目管理 |
| `/api/projects/:id/chapters` | GET/POST | 章节管理 |
| `/api/ai/chat` | POST | AI 对话（上下文感知） |
| `/api/ai/completion` | POST | 内联代码补全 |
| `/api/skills` | GET | 查询所有可用技能 |
| `/api/skills/:name/run` | POST | 执行指定技能 |
| `/api/compile` | POST | LaTeX 编译 |
| `/api/export` | POST | 导出 PDF/DOCX |
| `/api/terminal/ws` | WebSocket | 终端实时通信 |

---

## 🧩 自定义技能

在 `app/apps/backend/skills/` 下创建 YAML 文件即可添加自定义技能：

```yaml
name: my-research-skill
display_name: "我的研究技能"
description: "自定义科研工作流技能"
type: research
trigger: manual
tags: [custom, research]
prompt: |
  # 角色定义
  你是一位学术研究助手...

  # 任务要求
  1. 分析用户提供的研究问题
  2. 提出 3-5 个可行的研究方向
  3. 评估每个方向的新颖性、可行性和影响力
  ...
```

技能将在后端重启时自动加载，通过 `GET /api/skills` 查询。

---

## 🤝 致谢

- [CodeMirror](https://codemirror.net/) — 可扩展的代码编辑器
- [xterm.js](https://xtermjs.org/) — 终端模拟器
- [Fastify](https://www.fastify.io/) — 高性能 Web 框架
- [OpenAI](https://platform.openai.com/) — LLM API 兼容接口
- [Anthropic](https://www.anthropic.com/) — Claude API

---

## 📄 License

[MIT](LICENSE)
