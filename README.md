<div align="center">

<img src="asserts/landing-page-en.png" alt="Paper Agent" width="90%"/>

# Paper Agent

### AI-Powered Academic Writing Platform

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[中文](README_ZH.md) | [English](README.md)

---

### Research Software Submission Package

Paper Agent is being prepared for submission to Software: Practice and Experience
(SPE). The manuscript and supporting materials are collected in
[`papers/paper-agent-spe/`](papers/paper-agent-spe/).

---

### Highlights

| 🤖 AI Assistant | ✍️ Compile & Preview | 📚 Templates |
|:---:|:---:|:---:|
| Chat / Agent / Tools<br>Multi-step tool calls | TexLive / Tectonic / Auto<br>PDF preview & download | ACL / CVPR / NeurIPS / ICML<br>One-click conversion |

| 🔄 Template Transfer | ⚡ Pipeline | 🔍 Anti-AI Detection |
|:---:|:---:|:---:|
| Legacy (LaTeX→LaTeX) / MinerU (PDF→MD→LaTeX)<br>LLM migration + auto compile fix + VLM check | Multi-stage workflow engine<br>AI / Human / Compile / Citation | Rule scan + LLM deep analysis<br>+ GPTZero third-party detection |

| 🔧 Advanced Editing | 🗂️ Project Management | ⚙️ Configuration |
|:---:|:---:|:---:|
| AI autocomplete / Diff / Diagnose | Multi-project + file tree + upload | OpenAI-compatible endpoint<br>Local-first privacy |

| 🔍 Search | 📊 Charting | 🧠 Recognition |
|:---:|:---:|:---:|
| WebSearch / PaperSearch | Chart from tables | Formula/Chart recognition |

| 👥 Collaboration | 📝 Peer Review | |
|:---:|:---:|:---:|
| Multi-user real-time editing<br>Cursor sync & online management | AI Review Report / Consistency<br>Missing Citations / Compile Summary | |

| 📚 Citation Verification | 🔌 MCP Server | |
|:---:|:---:|:---:|
| CrossRef / Semantic Scholar / OpenAlex<br>Triple-DB verify + hallucination detection | Standard MCP protocol<br>7 tools exposed | |

---

<a href="#-quick-start" target="_self">
  <img alt="Quickstart" src="https://img.shields.io/badge/🚀-Quick_Start-2F80ED?style=for-the-badge" />
</a>
<a href="#-core-features" target="_self">
  <img alt="Features" src="https://img.shields.io/badge/✨-Features-orange?style=for-the-badge" />
</a>
<a href="#-contributing" target="_self">
  <img alt="Contributing" src="https://img.shields.io/badge/🤝-Contributing-purple?style=for-the-badge" />
</a>
<a href="#wechat-group" target="_self">
  <img alt="WeChat" src="https://img.shields.io/badge/💬-WeChat_Group-07C160?style=for-the-badge" />
</a>

</div>

## 📢 News

> [!TIP]
> 🆕 <strong>2025-05 · Citation Verification & MCP Protocol</strong><br>
> New citation verification engine integrating CrossRef, Semantic Scholar, and OpenAlex APIs — detects hallucinated citations with DOI-based and title-fuzzy verification. MCP (Model Context Protocol) server now available, exposing 7 core tools (paper_search, verify_citations, compile_latex, etc.) compatible with Claude Desktop, Cursor, and Copilot.

> [!TIP]
> 🆕 <strong>2025-05 · Anti-AI Detection & Pipeline</strong><br>
> New Anti-AI detection panel with three modes: Rule Scan (Quick), LLM Deep Analysis (Deep), and GPTZero third-party detection. Pipeline 2.0 workflow engine is now available with multi-stage orchestration (AI / Human / Compile / Citation / Compute) and 5 built-in preset templates.

> [!WARNING]
> 🚧 <strong>Template Transfer is under testing</strong><br>
> The Template Transfer feature is currently in beta and may contain known or unknown bugs. If you encounter any issues, please report them via [Issues](https://github.com/xzktx003/paper_wrighting/issues).

> [!TIP]
> 🆕 <strong>2025-02 · Template Transfer (Dual Mode)</strong><br>
> Two transfer modes are now available: Legacy mode (LaTeX→LaTeX direct migration) and MinerU mode (PDF→Markdown→LaTeX via MinerU API). Both modes feature LLM-powered content migration, automatic compile error fixing, and optional VLM-based layout checking.

> [!TIP]
> 🆕 <strong>2025-02 · Real-time Collaboration</strong><br>
> Multi-user simultaneous editing is now available, powered by CRDT with automatic conflict resolution and cursor sync. Current version requires a server with a public IP; invite remote collaborators via token-based links.

---

## ✨ Core Features

Paper Agent is a local-first LaTeX + AI workspace for academic writing, optimized for fast editing, controlled changes, and privacy.

### 🤖 AI Assistant

- **Chat mode**: read-only Q&A, no tools or file changes
- **Agent mode**: propose paper edits for confirmation, no direct writes or code execution
- **Tools mode**: multi-step tools, cross-file work, and controlled `code/` operations
- **Tasks**: polish, rewrite, restructure, translate, custom
- **Autocomplete**: Option/Alt + / or Cmd/Ctrl + Space, Tab to accept
- **Vision analysis**: paste images in chat (Ctrl+V or 🖼️ button) for multimodal AI understanding
- **SSE streaming**: real-time token-by-token streaming for AI responses, supports Anthropic and OpenAI-compatible providers
- **Auto context injection**: new conversations automatically inject current chapter content or full paper structure overview
- **Inline diff preview**: Agent/Tools edits shown with line-by-line color coding (green for additions, red for deletions), accept or reject with one click

### ✍️ Compile & Preview

- **Engines**: TexLive / Tectonic / Auto fallback
- **Preview toolbar**: zoom, fit width, 100%, download PDF
- **Compile log**: error parsing + one-click diagnose + jump to error
- **Views**: PDF / Figures / Diff
- **Markdown preview**: GFM tables / task lists / strikethrough / math / project image resolution
- **LaTeX preview**: supports `\includegraphics`, figure captions, math environments, code listings, and common layout constructs

### 📚 Template System

- **Built-ins**: ACL / CVPR / NeurIPS / ICML
- **Conversion**: one-click template switch with content preserved

### 🔄 Template Transfer

- **Dual mode**: Legacy (LaTeX→LaTeX) and MinerU (PDF→Markdown→LaTeX)
- **MinerU integration**: parse PDF via MinerU API, extract Markdown + images, then fill into target template
- **LLM-powered migration**: AI analyzes source/target structure, drafts transfer plan, and applies content mapping
- **Auto compile fix**: automatically detect and fix LaTeX compilation errors with retry loop
- **VLM layout check**: optional visual layout validation using VLM to detect overflow, overlap, and spacing issues
- **Asset handling**: automatic copy of images, bib files, and style files from source to target

### 🗂️ Project Management

- **Projects panel**: manage multiple projects
- **File tree**: create/rename/delete/upload/drag
- **VS Code-style actions**: right-click for copy path, copy, cut, paste, inline rename
- **Integrated terminal**: project-bound tmux session, auto-reattach after close/refresh
- **BibTeX**: quick create `references.bib`

### ⚙️ Configuration

- **LLM Base URL**: OpenAI-compatible, supports custom base URL
- **Env-backed settings**: LLM provider, key, base URL, and model are stored in repository `.env` and API keys are masked in the UI
- **TexLive config**: customizable TexLive resources
- **Language switch**: toggle 中文/English in the top bar
- **Editor themes**: Basic Light / GitHub Dark / Dracula / Cyber Tech (zone-specific coloring: cyan for Files, green for Terminal, purple for AI Assistant, blue for Editor)

### 🔍 Search & Reading

- **WebSearch**: online search with summaries
- **PaperSearch**: academic paper search with citation info
- **BibTeX citation search**: type `@` + keywords in the editor to search CrossRef academic database, displays paper title, authors, year, journal, and DOI, one-click insert formatted BibTeX entry

### 📊 Charts & Recognition

- **Table-to-chart**: generate charts directly from tables
- **Smart recognition**: formulas and charts auto-detected

### 📝 Peer Review

- **AI Quality Check**: automated paper quality assessment
- **Full Review Report**: generate detailed reviewer-style review comments
- **Consistency Check**: terminology and symbol consistency detection
- **Missing Citations**: find statements that need citations
- **Compile Log Summary**: summarize compile errors and fix suggestions

### 🔍 Anti-AI Detection

- **Rule Scan (Quick)**: fast assessment based on word frequency, sentence patterns, vocabulary diversity, and paragraph uniformity
- **LLM Deep Analysis (Deep)**: LLM-powered analysis across five dimensions — lexical diversity, argument structure, sentence variation, specificity, and transition patterns
- **GPTZero Detection**: automated third-party detection via Playwright browser automation
- **Rewrite Suggestions**: auto-generate replacement suggestions to make AI-typical phrasing sound more natural
- **Multi-dimensional Scoring**: overall score + per-dimension breakdown + flagged passages + human trait identification

### ⚡ Pipeline 2.0

- **Composable Stages**: 5 typed executors — AI (LLM skill), Compute (shell), Human (checkpoint), Citation (reference management), Compile (LaTeX)
- **Preset Templates**: Writing Flow, Paper Pipeline, Quick Review, Citation Pipeline, Executable Paper
- **Human Checkpoints**: approve / reject / skip / edit actions with feedback
- **Writing Flow**: Outline → Draft → Polish → Review with interactive review gates
- **Citation Management**: verify, format, deduplicate, and discover references automatically
- **Executable Paper**: run experiments → generate figures → compile PDF in one pipeline
- **Controls**: pause/resume, retry with feedback, skip stage, abort signal propagation

### 👥 Real-time Collaboration

- **Multi-user editing**: multiple users edit the same document simultaneously with real-time sync
- **Cursor & selection sync**: each user's cursor displayed in a distinct color, visible in real time
- **Online user list**: collaboration panel shows currently connected users and their status
- **Invite to collaborate**: invite others via link or token to join the editing session

### 📚 Citation Verification Engine

- **Triple-database verification**: integrates CrossRef, Semantic Scholar, and OpenAlex APIs
- **DOI-based verification**: citations with DOI are verified directly against APIs; 2+ API confirmations = "verified"
- **Title fuzzy search**: citations without DOI are matched via title search across CrossRef and OpenAlex
- **Confidence levels**: high (multi-API), medium (single API), low (title match), none (unverifiable)
- **Cross-reference check**: automatically detects .tex citations missing from .bib, and .bib entries never cited
- **Hallucination detection**: identifies AI-fabricated references to prevent academic misconduct
- **Batch verification**: concurrent API calls with rate limiting
- Integrated into the right panel as "📚 Citations" tab with interactive result views

### 🔌 MCP Protocol Standard

- **Standard MCP protocol**: JSON-RPC 2.0 implementation compatible with all MCP clients
- **Dual transport**: HTTP POST (`POST /api/mcp`) + SSE streaming (`GET /api/mcp/sse`)
- **7 MCP tools**: paper_search, verify_citations, cross_check_citations, compile_latex, read_project_file, ai_polish, ai_review
- **Service discovery**: `GET /api/mcp/info` returns tool list and client configuration examples
- **Compatible clients**: Claude Desktop, Cursor, GitHub Copilot, and other MCP-compatible tools

---

## 🎨 Showcase

### 🖥️ Three-Panel Workspace

<div align="center">
<br>
<img src="asserts/editor-with-file.png" alt="Three-panel workspace" width="90%"/>
<br>
<sub>Left: File tree & tools | Center: LaTeX editor | Right: AI assistant & preview</sub>
<br><br>
</div>

### ✍️ Editor View

<div align="center">
<br>
<img src="asserts/editor-main.png" alt="Editor view" width="90%"/>
<br>
<sub>LaTeX editor with synchronized preview</sub>
<br><br>
</div>

### 🗂️ Projects Page

<div align="center">
<br>
<img src="asserts/projects-page.png" alt="Projects page" width="85%"/>
<br>
<sub>Multi-project management with template selection</sub>
<br><br>
</div>

### 📝 Peer Review

<div align="center">
<br>
<img src="asserts/review-panel.png" alt="Peer Review" width="85%"/>
<br>
<sub>AI Quality Check: Review Report / Consistency / Missing Citations / Compile Summary</sub>
<br><br>
</div>

### 🔍 Anti-AI Detection

<div align="center">
<br>
<img src="asserts/anti-ai-panel.png" alt="Anti-AI Detection" width="85%"/>
<br>
<sub>Rule scan + LLM deep analysis + GPTZero third-party detection</sub>
<br><br>
</div>

### ⚡ Pipeline

<div align="center">
<br>
<img src="asserts/pipeline-panel.png" alt="Pipeline" width="85%"/>
<br>
<sub>Multi-stage workflow: Polish → Review → Revise → Compile with human checkpoints</sub>
<br><br>
</div>

---

## 🚀 Quick Start

### 📋 Requirements

#### Basic Environment
- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **OS**: Windows / macOS / Linux

#### LaTeX Compilation Environment (Required)

Paper Agent requires a LaTeX engine to generate PDFs. Choose one of the following options based on your OS:

**Option 1: TexLive (Recommended)**
- **Linux (Ubuntu/Debian)**:
  ```bash
  sudo apt-get update
  sudo apt-get install texlive-full
  ```
- **Linux (CentOS/RHEL)**:
  ```bash
  sudo yum install texlive texlive-*
  ```
- **macOS**:
  ```bash
  brew install --cask mactex
  ```
- **Windows**: Download [TexLive](https://www.tug.org/texlive/) installer

**Option 2: Tectonic (Lightweight)**
- **Linux/macOS**:
  ```bash
  curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh
  ```
- **Windows**: Download [Tectonic](https://tectonic-typesetting.github.io/) installer

> **Note**: TexLive full installation is ~5-7GB, Tectonic is lighter but with fewer features. TexLive is recommended for Linux servers.

### 📦 Install & Run

#### Development Deployment

```bash
# 1. Clone repository
git clone https://github.com/xzktx003/paper_wrighting.git
cd paper_wrighting/app

# 2. Install dependencies
npm ci

# 3. Start dev server (frontend + backend)
npm run dev
```

Access:
- **App / Backend**: http://10.30.0.22:8787
- **Vite Dev Frontend**: http://10.30.0.22:5173
- **Health Check**: http://10.30.0.22:8787/api/health

#### Production Deployment

```bash
# 1. Build frontend and backend
cd paper_wrighting/app
npm run build

# 2. Start production server
npm start
```

#### Complete Linux Server Deployment Example

```bash
# 1. Install Node.js (Ubuntu example)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install TexLive
sudo apt-get update
sudo apt-get install -y texlive-full

# 3. Verify installation
node --version  # Should show >= 18.0.0
pdflatex --version  # Should show TexLive version

# 4. Clone and deploy project
git clone https://github.com/xzktx003/paper_wrighting.git
cd paper_wrighting/app
npm ci
npm run build

# 5. Configure environment variables (optional)
cat > .env << EOF
OPENPRISM_LLM_BASE_URL=https://api.openai.com/v1
OPENPRISM_LLM_API_KEY=your-api-key
OPENPRISM_LLM_MODEL=gpt-4o
OPENPRISM_DATA_DIR=./data
PORT=8787
EOF

# 6. Start service
npm start

# 7. Use PM2 for process management (recommended)
sudo npm install -g pm2
pm2 start npm --name "paper-agent" -- start
pm2 save
pm2 startup
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root (optional):

```bash
# LLM Configuration
OPENPRISM_LLM_BASE_URL=https://api.openai.com/v1
OPENPRISM_LLM_API_KEY=your-api-key
OPENPRISM_LLM_MODEL=gpt-4o

# Data storage path
OPENPRISM_DATA_DIR=./data

# Backend service port
PORT=8787

# MinerU API Configuration (for PDF→MD→LaTeX transfer)
OPENPRISM_MINERU_API_BASE=https://mineru.net/api/v4
OPENPRISM_MINERU_TOKEN=your-mineru-token
```

### LLM Configuration

Paper Agent supports any **OpenAI-compatible** endpoint, including custom base URL:

**Method 1: Environment Variables**
```bash
# .env file
OPENPRISM_LLM_BASE_URL=https://api.openai.com/v1
OPENPRISM_LLM_API_KEY=your-api-key
OPENPRISM_LLM_MODEL=gpt-4o
```

**Method 2: Frontend Settings Panel**
- Click the "Settings" button in the frontend interface
- Fill in Base URL, API Key, and Model
- Configuration is saved to the repository `.env` through the backend; existing API keys are masked in API responses and are not cached in browser localStorage

**Supported Third-party Services:**
- OpenAI: `https://api.openai.com/v1`
- Azure OpenAI: `https://your-resource.openai.azure.com/openai/deployments/your-deployment`
- Other compatible services (e.g. local LLM servers)

### LaTeX Compilation Configuration

**Supported Compilation Engines:**
- `pdflatex` - Standard LaTeX engine
- `xelatex` - Supports Unicode and Chinese
- `lualatex` - Supports Lua scripting
- `latexmk` - Automated build tool
- `tectonic` - Modern lightweight engine

**Configuration Method:**
1. Select compilation engine in frontend "Settings" panel
2. Set to "Auto" for automatic fallback to available engines
3. Customize TexLive resource path

### Data Storage Configuration

Default data storage is in `./data` directory, can be modified via environment variable:

```bash
OPENPRISM_DATA_DIR=/var/paper-agent/data
```

**Directory Structure:**
```
data/
├── projects/           # User projects
│   ├── project-1/
│   │   ├── main.tex
│   │   └── references.bib
│   └── project-2/
└── templates/          # Template cache
```

---

## 👥 Collaboration Guide

Paper Agent includes a built-in real-time collaboration system based on CRDT (Yjs) + WebSocket, allowing multiple users to edit the same document simultaneously without any third-party service.

### Collaboration Environment Variables

Add the following to your `.env` file:

```bash
# Token signing secret (must change for production)
OPENPRISM_COLLAB_TOKEN_SECRET=your-secure-random-string

# Require token for collaboration (default: true, set false for local dev)
OPENPRISM_COLLAB_REQUIRE_TOKEN=true

# Token TTL in seconds (default: 86400 = 24 hours)
OPENPRISM_COLLAB_TOKEN_TTL=86400
```

### How to Use

1. **Deploy**: Deploy Paper Agent to a server with a public IP, configure a domain and HTTPS
2. **Generate invite**: Click "Generate Invite Link" in the collaboration panel on the editor page
3. **Share link**: Send the generated link to your collaborator
4. **Join**: Collaborator opens the link, token is verified automatically, and they enter the editor
5. **Edit together**: Multiple cursors visible in real time, edits sync automatically, conflicts resolved by CRDT

<details>
<summary><strong>Nginx Reverse Proxy (Recommended, For Public Servers)</strong></summary>

Collaboration requires WebSocket. Nginx must be configured with upgrade headers:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

> **Tip**: Local access (127.0.0.1) bypasses token verification by default, suitable for local development.

</details>

<details>
<summary><strong>No Public Server? Use Tunnel (ngrok)</strong></summary>

You can collaborate remotely without a public server. Paper Agent has built-in tunnel support — one command exposes your local service to the internet.

#### Quick Start (ngrok, Recommended)

1. Sign up for a free [ngrok](https://dashboard.ngrok.com/get-started/your-authtoken) account and get your authtoken
2. Run the following commands:

```bash
export NGROK_AUTHTOKEN=your_token_here
npm run tunnel:ngrok
```

3. On startup, the terminal prints a public URL. Share it with your collaborator:

```
  Paper Agent started at http://10.30.0.22:8787

  Tunnel active (ngrok):
  Public URL: https://xxxx.ngrok-free.app
  Share this URL to collaborate remotely!
```

4. Your collaborator opens the URL in their browser and starts editing in real-time

#### Other Tunnel Options

| Option | Command | Notes |
|--------|---------|-------|
| localtunnel | `npm run tunnel` | Zero-config, but may be unstable |
| Cloudflare Tunnel | `npm run tunnel:cf` | Requires [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) installed |

> **Note**: Tunnel is off by default. Regular `npm start` does not create a tunnel. You can also set it via env var: `OPENPRISM_TUNNEL=ngrok npm start`

</details>

---

## 🎯 Usage Guide (Quick)

1. **Create Project**: Create new project in Projects panel and select template
2. **Write Paper**: Edit LaTeX in Files tree
3. **AI Edits**: Switch to Agent / Tools, generate diff and confirm
4. **Compile & Preview**: Click "Compile PDF", preview on right side
5. **Export PDF**: Click "Download PDF" in preview toolbar

---

## 📁 Project Structure

```
paper_wrighting/
├── apps/
│   ├── frontend/           # React + Vite frontend
│   │   ├── src/
│   │   │   ├── app/App.tsx    # Main application logic
│   │   │   ├── app/TransferPanel.tsx  # Template transfer UI
│   │   │   ├── app/components/AntiAiPanel.tsx  # Anti-AI detection panel
│   │   │   ├── app/components/PipelinePanelV2.tsx  # Pipeline panel
│   │   │   ├── app/components/CitationVerificationPanel.tsx  # Citation verification panel
│   │   │   ├── app/api/client.ts  # API calls
│   │   │   ├── app/api/conversationApi.ts  # Conversation/citation API
│   │   │   └── latex/         # TexLive integration
│   └── backend/            # Fastify backend
│       └── src/
│           ├── index.js       # API / compile / LLM proxy
│           ├── routes/
│           │   ├── transfer.js     # Transfer API endpoints
│           │   ├── antiAi.js       # Anti-AI detection endpoints
│           │   ├── review.js       # Peer review endpoint
│           │   ├── pipelineV2.js   # Pipeline workflow endpoints
│           │   ├── citationVerification.js  # Citation verification endpoints
│           │   └── mcp.js          # MCP protocol endpoints
│           └── services/
│               ├── llmService.js           # LLM call service
│               ├── gptzeroService.js       # GPTZero Playwright detection
│               ├── mineruService.js        # MinerU API integration
│               ├── citationVerificationService.js  # Citation verification service
│               ├── mcpServer.js            # MCP protocol server
│               ├── pipeline/              # Pipeline engine
│               │   ├── pipelineEngine.js  # Core pipeline engine
│               │   ├── presets.js         # Preset pipeline templates
│               │   └── executors/         # Stage executors
│               └── transferAgent/          # LangGraph transfer workflows
│                   ├── graph.js            # Legacy transfer graph
│                   ├── graphMineru.js       # MinerU transfer graph
│                   ├── state.js            # Transfer state schema
│                   └── nodes/              # Workflow nodes
├── templates/              # LaTeX templates (ACL/CVPR/NeurIPS/ICML)
├── data/                   # Project storage directory (default)
└── README.md
```

---

## 🗺️ Roadmap

<table>
<tr>
<th width="35%">Feature</th>
<th width="15%">Status</th>
<th width="50%">Description</th>
</tr>
<tr>
<td><strong>👥 Real-time Collaboration</strong></td>
<td><img src="https://img.shields.io/badge/✅-Done-success?style=flat-square" alt="Done"/></td>
<td>Multi-user real-time editing with cursor sync and online user management (currently requires a server with public IP)</td>
</tr>
<tr>
<td><strong>📚 Template Transfer (Dual Mode)</strong></td>
<td><img src="https://img.shields.io/badge/✅-Done-success?style=flat-square" alt="Done"/></td>
<td>Legacy (LaTeX→LaTeX) and MinerU (PDF→MD→LaTeX) dual-mode template transfer with LLM-powered migration, auto compile fix, and VLM layout check</td>
</tr>
<tr>
<td><strong>🔍 Anti-AI Detection</strong></td>
<td><img src="https://img.shields.io/badge/✅-Done-success?style=flat-square" alt="Done"/></td>
<td>Three detection modes: Rule Scan (Quick), LLM Deep Analysis (Deep), GPTZero third-party detection, with rewrite suggestions and multi-dimensional scoring</td>
</tr>
<tr>
<td><strong>⚡ Pipeline 2.0</strong></td>
<td><img src="https://img.shields.io/badge/✅-Done-success?style=flat-square" alt="Done"/></td>
<td>Multi-stage workflow engine with 5 typed executors (AI / Human / Compile / Citation / Compute), 5 built-in preset templates, pause/resume/retry/skip controls</td>
</tr><tr>
<td><strong>📚 Citation Verification</strong></td>
<td><img src="https://img.shields.io/badge/✅-Done-success?style=flat-square" alt="Done"/></td>
<td>CrossRef / Semantic Scholar / OpenAlex triple-database verification, DOI + title fuzzy search, .tex ↔ .bib cross-check, hallucination detection</td>
</tr>
<tr>
<td><strong>🔌 MCP Protocol</strong></td>
<td><img src="https://img.shields.io/badge/✅-Done-success?style=flat-square" alt="Done"/></td>
<td>Standard MCP JSON-RPC 2.0, 7 tools (paper_search / verify_citations / compile_latex etc.), compatible with Claude Desktop / Cursor / Copilot</td>
</tr><tr>
<td><strong>🌐 Serverless Collaboration</strong></td>
<td><img src="https://img.shields.io/badge/⏳-Planned-yellow?style=flat-square" alt="Planned"/></td>
<td>Local collaboration without a public server: built-in tunnel integration (ngrok / Cloudflare Tunnel) and WebRTC-based P2P direct connection</td>
</tr>
<tr>
<td><strong>🔍 Enhanced WebSearch</strong></td>
<td><img src="https://img.shields.io/badge/⏳-Planned-yellow?style=flat-square" alt="Planned"/></td>
<td>Integrate third-party Search APIs (e.g. Google / Baidu / SerpAPI) for improved search quality and coverage</td>
</tr>
<tr>
<td><strong>📸 Version Snapshots & Rollback</strong></td>
<td><img src="https://img.shields.io/badge/⏳-Planned-yellow?style=flat-square" alt="Planned"/></td>
<td>Project version management with snapshot saving and one-click rollback</td>
</tr>
<tr>
<td><strong>📖 Citation Search Assistant</strong></td>
<td><img src="https://img.shields.io/badge/⏳-Planned-yellow?style=flat-square" alt="Planned"/></td>
<td>Auto-search related papers and generate BibTeX citations</td>
</tr>
</table>

---

## 🤝 Contributing

Welcome to submit Issues or PRs:
1. Fork the repository
2. Create a new branch
3. Commit your changes
4. Submit a PR

Development commands:
```bash
npm run dev
npm run dev:frontend
npm run dev:backend
npm run build
```

---

## 📄 License

MIT License. See [LICENSE](LICENSE).

---

## 🙏 Acknowledgments

- Tectonic
- CodeMirror
- PDF.js
- LangChain
- React / Fastify

---

<div align="center">

**If this project helps you, please give us a Star!**

[![GitHub stars](https://img.shields.io/github/stars/xzktx003/paper_wrighting?style=social)](https://github.com/xzktx003/paper_wrighting/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/xzktx003/paper_wrighting?style=social)](https://github.com/xzktx003/paper_wrighting/network/members)

<br>

<a name="wechat-group"></a>
<img src="asserts/wechat.png" alt="Paper Agent WeChat Community" width="300"/>
<br>
<sub>Scan to join the community WeChat group</sub>

<p align="center">
  <em>Made with ❤️ by Paper Agent Team</em>
</p>

</div>
