# 论文写作工具设计文档

## 概述

基于 OpenPrism fork 改造的本地论文写作工具。核心理念：编辑器优先，AI 是辅助侧边栏。支持 Markdown/LaTeX 双模式编辑、多文件章节管理、三层 Skill 系统、多对话窗口、代码/实验模块。纯本地部署，数据不出本地。

## 技术栈

| 层 | 技术 | 来源 |
|---|---|---|
| 前端框架 | React 18 + TypeScript | OpenPrism |
| 构建工具 | Vite 5 | OpenPrism |
| 后端框架 | Fastify 4 (Node.js, ESM) | OpenPrism |
| 编辑器 | CodeMirror 6 | OpenPrism |
| AI/LLM | @anthropic-ai/sdk (Claude API) | 替换 LangChain |
| PDF 渲染 | pdfjs-dist | OpenPrism |
| 实时通信 | WebSocket (fastify-websocket) | OpenPrism |
| LaTeX 编译 | pdflatex/xelatex/tectonic | OpenPrism |
| 终端 | xterm.js + node-pty | 新增 |
| Markdown→LaTeX | Pandoc | 新增 |
| 代码执行 | Node.js child_process | 新增 |

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     前端 (React 18 + Vite)                       │
├──────────┬────────────────────────┬─────────────────────────────┤
│  左栏     │       中栏              │         右栏                 │
│  项目树   │  Markdown/LaTeX/Code   │  多 Tab 对话管理器            │
│  章节管理  │  编辑器 (CodeMirror 6)  │  [对话1] [对话2] [对话3] [+] │
│  Skill 面板│                        │  独立上下文 + Skill 绑定      │
├──────────┴────────────────────────┴─────────────────────────────┤
│                      WebSocket (文件变更推送)                      │
├─────────────────────────────────────────────────────────────────┤
│                    后端 (Fastify 4 + Node.js)                     │
├─────────┬──────────┬───────────┬──────────┬─────────────────────┤
│  Skill  │  File    │  Claude   │  LaTeX   │  Code               │
│  Engine │  Manager │  API 层   │  Compile │  Executor           │
└─────────┴──────────┴───────────┴──────────┴─────────────────────┘
```

## 项目目录结构

```
my-paper/
├── paper.yaml              # 项目配置
├── chapters/               # 论文章节（每章一个文件）
│   ├── 01-introduction.md
│   ├── 02-related-work.md
│   ├── 03-methodology.md
│   ├── 04-experiments.md
│   └── 05-conclusion.md
├── code/                   # 代码与实验
│   ├── config.yaml         # 实验配置
│   ├── src/                # 实验代码
│   ├── notebooks/          # Jupyter notebooks
│   ├── results/            # 实验结果
│   └── figures/            # 代码生成的图表
├── figures/                # 论文图片
├── references.bib          # 参考文献
├── skills/                 # 用户自定义 skill
│   └── my-custom-skill.yaml
└── output/                 # 导出结果
    ├── paper.tex
    └── paper.pdf
```

## 项目配置 (paper.yaml)

```yaml
title: "My Research Paper"
authors: ["Author Name"]
template: "acl2024"
editor_mode: markdown  # markdown | latex

chapters:
  - file: 01-introduction.md
    skills: [hook-writing, literature-review]
  - file: 02-related-work.md
    skills: [literature-review, citation-management]
  - file: 03-methodology.md
    skills: [technical-writing, formula-check]
  - file: 04-experiments.md
    skills: [data-analysis, figure-caption]
  - file: 05-conclusion.md
    skills: [abstract-generator]

global_skills: [academic-tone, apa-citation, consistency-check]

code:
  language: python
  entry: src/main.py
```

## 模块设计

### 1. 双模式编辑器

**Markdown 模式（默认）：**
- CodeMirror 6 + `@codemirror/lang-markdown`
- 实时预览（中栏下方分栏，编辑器占上半、预览占下半）
- 支持学术 Markdown 扩展：数学公式（KaTeX）、脚注、引用、表格

**LaTeX 模式：**
- 复用 OpenPrism 现有 LaTeX 语言支持
- PDF 实时预览（pdfjs-dist）

**代码模式：**
- CodeMirror 6 + 对应语言模式（Python/R/Julia/Shell）
- 点击 `code/` 目录下文件时自动切换

**切换方式：**
- 编辑器顶部 tab 标识当前模式
- 根据打开的文件自动切换（.md → Markdown, .tex → LaTeX, .py → Code）

**导出流程：**
- Markdown → Pandoc → LaTeX（套用 template 目录中的模板）→ PDF
- LaTeX → 直接编译 → PDF

### 2. 章节管理

**左栏项目树：**
- 树形展示 `chapters/` 下所有文件，按 paper.yaml 中定义的顺序排列
- 支持拖拽排序（更新 paper.yaml）
- 右键菜单：新建章节、重命名、删除、复制
- 显示每章绑定的 skill 标签

**章节操作：**
- 新建章节：创建文件 + 自动追加到 paper.yaml
- 合并导出：按 paper.yaml 顺序拼接所有章节 → 单一文档 → 编译

### 3. Skill 系统

#### 三层架构

| 层级 | 作用 | 注入时机 |
|------|------|---------|
| 全局规则 | 学术写作规范、引用格式 | 所有 AI 请求都注入 system prompt |
| 章节绑定 | 章节特定的写作指导 | 处理该章节时自动注入 |
| 手动触发 | 用户按需执行的工具 | 用户从面板选择时注入 |

#### Skill 文件格式

```yaml
name: literature-review
display_name: "文献综述助手"
description: "帮助撰写文献综述，确保引用充分、逻辑连贯"
type: writing          # writing | review | analysis | utility | code
trigger: both          # auto | manual | both
                       # auto: 章节绑定时自动加载
                       # manual: 仅手动触发
                       # both: 两种方式都支持

prompt: |
  你是一个学术文献综述专家。在帮助用户撰写时，请遵循以下规则：
  1. 确保每个论点都有对应的引用支撑
  2. 按主题而非时间顺序组织文献
  3. 指出研究空白（research gap）
  4. 使用批判性分析而非简单罗列

parameters:
  - name: citation_style
    type: select
    default: "apa"
    options: [apa, ieee, acm, gb-t-7714]
  - name: max_papers
    type: number
    default: 20
```

#### Skill 加载优先级

AI 请求时 system prompt 组装顺序：
1. 基础 system prompt（角色定义）
2. 全局 skill prompts（paper.yaml 中 global_skills）
3. 当前章节绑定的 skill prompts
4. 手动触发的 skill prompt（如果有）
5. 用户消息

#### 内置 Skill 库（移植自 Claude Scholar）

**写作类：**
- section-drafter: 章节起草
- hook-writing: 开头吸引读者
- technical-writing: 技术写作规范
- prose-polisher: 文字润色
- nature-writing: Nature 级写作风格
- abstract-generator: 摘要生成

**审阅类：**
- consistency-checker: 全文一致性检查
- logic-reviewer: 逻辑审查
- technical-reviewer: 技术审查
- writing-reviewer: 写作质量审查
- latex-layout-auditor: LaTeX 排版审查

**研究类：**
- literature-review: 文献综述
- research-analyst: 研究分析
- paper-crawler: 论文检索
- brainstormer: 头脑风暴

**工具类：**
- citation-management: 引用管理
- formula-check: 公式检查
- figure-caption: 图表标题
- data-analysis: 数据分析
- code-generator: 实验代码生成

#### 用户自定义 Skill

用户在 `skills/` 目录下创建 `.yaml` 文件即可，格式同上。工具启动时自动扫描加载。

### 4. 多对话窗口系统

**核心概念：** 右栏是一个多 tab 对话管理器，每个 tab 是一个独立的 AI 对话。

**对话属性：**

```typescript
interface Conversation {
  id: string;
  name: string;              // 用户命名，如 "写 Introduction"、"实验代码"
  context_scope: ContextScope;
  active_skills: string[];   // 该对话额外激活的 skill
  history: Message[];        // 独立的对话历史
  mode: 'chat' | 'agent' | 'tools';
}

type ContextScope =
  | { type: 'global' }                    // 整篇论文
  | { type: 'chapter'; file: string }     // 某个章节
  | { type: 'code'; path?: string }       // code/ 目录
  | { type: 'free' }                      // 不绑定文件
```

**创建对话时：**
- 弹出简单表单：名称、context scope、初始 skill 选择
- 也可以快捷创建：右键章节 → "新建对话（聚焦此章节）"

**对话行为：**
- 每个对话独立的历史记录，互不干扰
- context scope 决定 AI 能"看到"哪些文件内容
- 对话可以随时切换 skill 组合
- 支持同时开多个对话，tab 切换
- 对话可关闭、可恢复（历史持久化到本地）

**AI 在不同 scope 下的能力：**

| Scope | AI 可读取 | AI 可修改 | 典型用途 |
|-------|----------|----------|---------|
| global | 所有章节 + references.bib | 任意章节 | 全文审阅、一致性检查 |
| chapter | 当前章节 + references.bib | 当前章节 | 聚焦写作 |
| code | code/ 目录 + 可选读取 chapters/ | code/ 下文件 | 写代码、跑实验 |
| free | 无自动加载 | 无 | 头脑风暴、自由讨论 |

### 5. AI 集成

**替换 LangChain 为 Anthropic SDK：**

OpenPrism 使用 LangChain + OpenAI-compatible API。改造为直接使用 `@anthropic-ai/sdk`，原因：
- 减少依赖层级
- 更好地利用 Claude 的 tool use 能力
- 支持 extended thinking

**三种交互模式（保留 OpenPrism 设计）：**

1. **Chat 模式** — 纯对话，不修改文档。用于讨论思路、问问题、头脑风暴
2. **Agent 模式** — AI 生成修改建议（diff），展示给用户确认后应用
3. **Tools 模式** — AI 可调用多个工具，执行复杂多步任务

**AI 工具列表：**

```typescript
const tools = [
  // 文件操作
  { name: 'read_chapter', description: '读取指定章节内容' },
  { name: 'list_chapters', description: '列出所有章节' },
  { name: 'propose_edit', description: '提出对章节的修改（diff 形式，需用户确认）' },

  // 代码操作
  { name: 'read_code', description: '读取 code/ 下的文件' },
  { name: 'write_code', description: '写入/修改 code/ 下的文件' },
  { name: 'run_code', description: '执行代码脚本，返回 stdout/stderr' },
  { name: 'list_results', description: '列出实验结果文件' },

  // 研究工具
  { name: 'search_arxiv', description: '搜索 arXiv 论文' },
  { name: 'get_bibtex', description: '获取论文的 BibTeX 条目' },
  { name: 'read_references', description: '读取 references.bib' },

  // 实用工具
  { name: 'compile_latex', description: '编译 LaTeX 生成 PDF' },
  { name: 'export_paper', description: '合并章节并导出' },
];
```

### 6. 代码与实验模块

**编辑：**
- 左栏项目树展示 `code/` 目录
- 点击代码文件 → 中栏切换为代码编辑器（CodeMirror 6 + 语言模式）
- 支持 Python、R、Julia、Shell

**执行：**
- AI 通过 `run_code` 工具执行脚本
- 后端通过 `child_process.spawn` 执行，限制超时（默认 5 分钟）
- stdout/stderr 实时流式返回到对话窗口
- 生成的文件（图表、数据）自动出现在项目树中

**工作流（用户驱动）：**
1. 用户在"代码"对话窗口中指示 AI："根据 methodology 章节的描述，帮我实现模型代码"
2. AI 读取 methodology 章节 → 生成代码 → 写入 `code/src/`
3. 用户确认后，指示 AI 运行代码
4. AI 执行代码，返回结果
5. 用户可以让 AI 根据结果生成图表、或将结果写入 experiments 章节

### 7. 内嵌终端

**实现：**
- 使用 xterm.js 在前端嵌入完整终端
- 后端通过 node-pty 创建伪终端，WebSocket 双向通信
- 位置：中栏底部可折叠面板（类似 VS Code 的集成终端）

**功能：**
- 完整的 shell 环境（bash/zsh），可运行任意命令
- 可以直接运行 `claude` CLI 做重型任务
- 可以运行 `git`、`python`、`pip install` 等
- 支持多终端 tab
- 终端中对文件的修改会被文件监听捕获，编辑器自动刷新

**与 AI 对话面板的分工：**
- AI 对话面板：轻量交互（润色、补全、章节写作），结构化的 skill 驱动
- 内嵌终端：重型/自由操作（跑 Claude Code、复杂脚本、环境配置、git 操作）

### 8. 文件监听

- 后端 `fs.watch` 监听整个项目目录（chapters/、code/、figures/）
- 文件变化通过 WebSocket 推送事件到前端
- 前端收到事件后：
  - 如果是当前打开的文件：提示 "文件已在外部修改，是否重新加载？"
  - 如果是项目树中的文件：刷新项目树
  - 如果是 code/results/ 或 code/figures/：更新结果面板

## 前端页面结构

```
App
├── ProjectListPage          # 项目列表（选择/创建论文项目）
└── EditorPage               # 主编辑页面
    ├── LeftPanel
    │   ├── ProjectTree      # 章节 + code 文件树
    │   └── SkillPanel       # Skill 管理（查看/启用/配置）
    ├── CenterPanel
    │   ├── EditorTabs       # 打开的文件 tab
    │   ├── MarkdownEditor   # Markdown 编辑器
    │   ├── LatexEditor      # LaTeX 编辑器
    │   ├── CodeEditor       # 代码编辑器
    │   ├── PreviewPanel     # Markdown 预览 / PDF 预览
    │   └── TerminalPanel    # 内嵌终端（底部可折叠，多 tab）
    └── RightPanel
        ├── ConversationTabs # 对话 tab 栏
        ├── ChatView         # 当前对话的消息列表
        ├── InputArea        # 用户输入框
        └── ToolResults      # 工具执行结果展示
```

## 后端路由结构

```
routes/
├── projects.js      # 项目 CRUD、paper.yaml 管理
├── chapters.js      # 章节文件读写、排序、合并导出
├── skills.js        # Skill 列表、加载、配置
├── conversations.js # 对话 CRUD、历史持久化
├── ai.js            # Claude API 调用（chat/agent/tools）
├── code.js          # 代码文件读写、执行
├── terminal.js      # 终端 WebSocket（node-pty）
├── compile.js       # LaTeX 编译（复用 OpenPrism）
├── arxiv.js         # arXiv 搜索（复用 OpenPrism）
├── export.js        # 合并导出（Markdown→LaTeX→PDF）
└── ws.js            # WebSocket（文件变更推送）
```

## 后端服务结构

```
services/
├── skillEngine.js        # Skill 加载、解析、prompt 组装
├── fileManager.js        # 文件操作、fs.watch 监听
├── claudeService.js      # Anthropic SDK 封装、tool use 处理
├── codeExecutor.js       # 代码执行（child_process + 超时控制）
├── compileService.js     # LaTeX 编译（复用 OpenPrism）
├── exportService.js      # Pandoc 转换 + 合并导出
├── conversationStore.js  # 对话历史持久化（本地 JSON 文件）
└── arxivService.js       # arXiv 搜索（复用 OpenPrism）
```

## 数据持久化

所有数据存储在本地文件系统：

```
~/.paper-writer/
├── config.yaml          # 全局配置（Claude API key、默认模板等）
├── projects/            # 项目索引
└── conversations/       # 对话历史（按项目分目录）
    └── {project-id}/
        ├── conv-001.json
        └── conv-002.json
```

论文项目本身就是一个普通文件夹，可以用 git 管理版本。

## 改造步骤概要

1. Fork OpenPrism，剥离不需要的功能（实时协作 Yjs、tunneling、ngrok）
2. 替换 LangChain 为 @anthropic-ai/sdk
3. 增加 Markdown 编辑模式（@codemirror/lang-markdown + 预览）
4. 重构左栏为论文项目树 + Skill 面板
5. 实现 Skill Engine（加载、解析、prompt 组装）
6. 移植 Claude Scholar 内置 skill 库
7. 实现多对话窗口系统（替换 OpenPrism 单一 chat 面板）
8. 增加 code/ 模块（代码编辑 + 执行）
9. 增加内嵌终端（xterm.js + node-pty）
10. 实现导出流程（Markdown → Pandoc → LaTeX → PDF）
11. 文件监听 + WebSocket 推送

## 不做的事情

- 不做实时协作（去掉 Yjs）
- 不做云端部署/多用户
- 不做论文↔代码自动一致性检查
- 不做 skill 市场/社区分享
