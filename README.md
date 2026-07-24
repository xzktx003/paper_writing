<div align="center">

<img src="app/apps/frontend/public/favicon.svg" alt="Paper Agent logo" width="72" />

# Paper Agent

**A local-first, AI-assisted workspace for writing, reviewing, and compiling research papers.**

[English](README.md) | [简体中文](README_ZH.md)

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520.19-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify)](https://fastify.dev/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

Paper Agent brings the files involved in a real paper—LaTeX or Markdown sources, bibliography databases, figures, PDFs, compiler logs, and evidence documents—into one project workspace. It combines a CodeMirror editor, PDF/asset preview, controlled AI assistance, reusable Skills, RAG, citation verification, workflow pipelines, and a project-bound terminal.

The project is designed around human review: AI-proposed edits are shown as diffs and remain pending until the user accepts them. Research projects and secrets stay local unless you explicitly configure an external model, scholarly API, image service, OCR service, or collaboration tunnel.

> [!IMPORTANT]
> The active application lives in [`app/`](app/). Run installation, development, build, and test commands from that directory.

## Screenshots

<div align="center">
  <img src="asserts/editor-with-file.png" alt="Paper Agent editor workspace" width="88%" />
  <br />
  <sub>File tree, LaTeX source, rendered preview, and AI workspace</sub>
  <br /><br />
  <img src="asserts/anti-ai-panel.png" alt="Paper Agent Anti-AI review panel" width="88%" />
  <br />
  <sub>Rule-based writing analysis with reviewable suggestions</sub>
</div>

## Highlights

| Area | What is available |
| --- | --- |
| Project workspace | Multi-project dashboard, file tree, upload/download, text and binary previews, and project-local runtime data |
| Editing | CodeMirror editing for LaTeX, Markdown, BibTeX, code, configuration files, search, tabs, and dirty-state tracking |
| AI assistant | Chat, Agent, and Tools modes; streaming responses; image/file attachments; persistent conversations; reviewable diffs |
| Skills | A searchable bilingual Skill catalog for writing, research, review, LaTeX debugging, citations, statistics, figures, submission, and more |
| Compilation | `pdflatex`, `xelatex`, `lualatex`, `latexmk`, and `tectonic`; automatic main-file/engine detection; BibTeX passes; SyncTeX; PDF output |
| Evidence and RAG | PDF/text upload, extraction and indexing, retrieval, per-conversation document selection, and evidence-oriented writing support |
| Citation verification | Automatic main `.tex` and bibliography discovery; recursive `\input`/`\include`; CrossRef, Semantic Scholar, OpenAlex, and arXiv checks |
| Review tools | Structured paper review, rule/LLM Anti-AI analysis, optional GPTZero integration, and evidence/claim review workflows |
| Pipelines | Typed AI, Human, Compile, Citation, and Compute stages with retry, pause, resume, skip, and approval checkpoints |
| Figures | Prompt generation, reference-figure context, image generation, editing, and project-local figure storage |
| Templates | ACL plus CVPR, NeurIPS, and ICML skeletons; ZIP template upload; experimental template transfer workflow |
| Terminal and automation | Project-bound tmux terminal, controlled command execution, and MCP tools over HTTP/SSE |
| Collaboration | Token-based collaboration routes and real-time document infrastructure when collaboration is configured |

## Architecture

```text
Browser (React + Vite + CodeMirror)
        │ HTTP / SSE / WebSocket
        ▼
Fastify backend
  ├─ projects, files, conversations, auth
  ├─ LLM routing, Skills, review, pipelines
  ├─ LaTeX compilation and SyncTeX
  ├─ RAG/PDF extraction and retrieval
  ├─ citation and bibliography verification
  ├─ figure generation and template transfer
  ├─ terminal/tmux and collaboration
  └─ MCP JSON-RPC and SSE transports
        │
        ▼
Local project folders (default: ./papers, ignored by Git)
```

Main technologies:

- Frontend: React 18, TypeScript, Vite 8, CodeMirror 6, KaTeX, xterm.js.
- Backend: Node.js, Fastify 5, WebSocket/SSE, YAML-based Skills.
- Document toolchain: TeX Live/TinyTeX or Tectonic, BibTeX, SyncTeX, optional Pandoc/Poppler/OCR tools.
- External integrations are optional and configured explicitly.

## Quick Start

### 1. Prerequisites

Required:

- Node.js 20.19+ (Node.js 22 LTS is recommended).
- npm 9+.
- Git.

Required for local PDF compilation—install at least one:

- TeX Live/TinyTeX providing `pdflatex`, `xelatex`, or `lualatex`.
- `latexmk` for automated multi-pass builds.
- Tectonic as a lightweight alternative.

Useful optional tools:

- `tmux` for the persistent integrated terminal.
- `pandoc` for Markdown export/conversion.
- `pdftotext` (Poppler) for reliable PDF extraction.
- `tesseract` and `ocrmypdf` for scanned PDFs.
- Playwright/Chromium dependencies for GPTZero automation and browser E2E tests.

> [!NOTE]
> Some Conda `texlive-core` builds provide engines but omit LaTeX formats and packages. If `pdflatex.fmt` or common `.sty` files are missing, install a complete TeX Live/TinyTeX distribution instead of relying on an engine-only package.

### 2. Clone and install

```bash
git clone https://github.com/xzktx003/paper_wrighting.git
cd paper_wrighting
npm run install
```

The repository uses npm workspaces under `app/`, with `app/package-lock.json` as the only dependency lockfile. Root scripts are the canonical entry point and forward failures unchanged to that workspace.

### 3. Configure

```bash
cp app/.env.example app/.env
```

At minimum, configure an OpenAI-compatible model if you want AI features:

```dotenv
OPENPRISM_LLM_BASE_URL=https://api.openai.com/v1
OPENPRISM_LLM_API_KEY=replace-with-your-key
OPENPRISM_LLM_MODEL=gpt-4o
OPENPRISM_LLM_PROVIDER=openai-compatible

PORT=8787
OPENPRISM_COLLAB_TOKEN_SECRET=replace-with-a-random-secret
```

The editor, project manager, compilation, terminal, and local cross-check features can run without an LLM key. AI writing, deep review, and prompt generation require a configured model endpoint.

The Settings dialog can also select `anthropic`, `codex-cli`, `claude-cli`, or `copilot-cli`. CLI providers use a server-installed, already-authenticated executable; the executable and all safety arguments are fixed by the backend. Configure `OPENPRISM_API_TOKEN` to protect the service, then enter that server token directly on the locked Projects page. It is retained only in `sessionStorage` and is attached to same-origin API/WebSocket requests. Model Provider setup is optional: projects can be opened, edited, and saved manually without any working model configuration. The adjacent **System capabilities** tab gives cached, read-only diagnostics for providers, project storage, TeX/Pandoc, PDF/OCR, Skills, tmux, and literature retrieval without signing in or calling a model. See [Agent Provider architecture](docs/agent_provider_architecture.md) and [System capability diagnostics](docs/system_capabilities_architecture.md).

The Projects sidebar separates **All Projects**, **Active**, **Archived**, and **Deleted**. All Projects includes every non-deleted managed project; Active excludes archived projects; Archived excludes deleted projects; Deleted is the recoverable trash view. Each view has its own count and preserves the existing archive, restore, and permanent-delete actions.

The Provider tab explicitly states that model setup is optional and separate from ordinary project/file editing. It separates the Paper Writer **server access token** from a model provider **API key**, explains that HTTP providers need an endpoint and credential while CLI providers depend on a server-installed and already signed-in executable, and asks users to run the opt-in connection test before saving Provider settings. CLI providers on this screen remain read-only Chat providers; a file-changing CLI task must use the separate snapshot/Diff/Accept/Reject Task Agent workflow.

Inside a managed project, open **AI Assistant → Tasks** to use the reviewable CLI Task Agent. The backend creates an isolated snapshot outside the project, runs the selected CLI with fixed file permissions, and returns additions, modifications, deletions, unified diffs, and execution provenance. Reject never changes the project. Accept is disabled until every changed file has been reviewed; it then checks that the original project has not drifted and applies changes with a persisted rollback journal. Task history survives refreshes and backend restarts. See [CLI Task Agent](docs/cli_task_agent.md).

### 4. Start development mode

All commands below run from the repository root. The Vite proxy defaults to the loopback backend on `OPENPRISM_PORT`/`PORT`; set the API origin explicitly when the backend runs elsewhere:

```bash
OPENPRISM_API_ORIGIN=http://localhost:8787 npm run dev
```

Open:

- Frontend: <http://localhost:5173>
- Backend health check: <http://localhost:8787/api/health>

To run either side separately:

```bash
npm run dev:backend
OPENPRISM_API_ORIGIN=http://localhost:8787 npm run dev:frontend
```

### 5. Build and run production mode

```bash
npm run build
npm start
```

The Fastify server serves the built frontend and API from the same port:

```text
http://localhost:8787
```

## Configuration Reference

The committed template is [`app/.env.example`](app/.env.example). Keep real secrets in `app/.env`; it is ignored by Git. `npm start` forwards to the app workspace and loads a repository-root `.env` when present for compatibility, then loads `app/.env` as the preferred local override. Missing optional files no longer make the start command exit before the server boots.

| Variable | Required | Description |
| --- | --- | --- |
| `OPENPRISM_LLM_BASE_URL` | For AI | OpenAI-compatible API base URL |
| `OPENPRISM_LLM_PROVIDER` | For AI | `openai-compatible`, `anthropic`, `codex-cli`, `claude-cli`, or `copilot-cli` |
| `OPENPRISM_LLM_API_KEY` | For AI | Model provider API key |
| `OPENPRISM_LLM_MODEL` | For AI | Default model name |
| `PORT` / `OPENPRISM_PORT` | No | Backend port; default `8787` |
| `OPENPRISM_PUBLIC_HOST` | No | Address printed in startup/discovery output; default `127.0.0.1`. Set the current LAN hostname/IP in deployment configuration rather than source code |
| `OPENPRISM_FRONTEND_PORT` / `VITE_PORT` | No | Vite development port; default `5173` |
| `OPENPRISM_API_ORIGIN` | Dev only | Vite proxy target, e.g. `http://localhost:8787` |
| `OPENPRISM_DATA_DIR` | No | Authoritative managed-project storage root; default is repository-level `papers/` |
| `OPENPRISM_PROJECTS_DIR` | Legacy settings | Compatibility alias used only when `OPENPRISM_DATA_DIR` is absent; conflicting values produce a warning and the primary variable wins |
| `OPENPRISM_COMPILE_PATH` | No | Path-list prepended to the inherited `PATH` for TeX and Pandoc subprocesses; no user-home paths are guessed by default |
| `OPENPRISM_COMPILE_LD_LIBRARY_PATH` | No | Path-list prepended to the inherited `LD_LIBRARY_PATH` for explicitly installed compiler libraries |
| `OPENPRISM_TECTONIC_BINARY` | No | Explicit Tectonic executable used by direct LaTeX and Pandoc compilation; default is `tectonic` resolved from `PATH` |
| `OPENPRISM_ENABLE_LEGACY_WORKBENCH` | No | Enables the migration-only static workbench only when set to `true`; disabled by default, and the supported UI remains `/projects` |
| `OPENPRISM_API_TOKEN` | Required for normal use | Protects every non-public API with a Bearer token; without it, project access, writes, model calls, execution, and terminal routes are disabled |
| `OPENPRISM_PROVIDER_ALLOWED_HOSTS` | No | Comma-separated administrator allowlist for authenticated temporary HTTP Provider endpoints that must reach an internal host; private targets are otherwise rejected |
| `SEMANTIC_SCHOLAR_API_KEY` | No | Improves Semantic Scholar quota for citation verification |
| `OPENPRISM_MINERU_API_BASE` | No | MinerU endpoint for PDF conversion |
| `OPENPRISM_MINERU_TOKEN` | No | MinerU access token |
| `OPENPRISM_DRAW_IMAGE_API_KEY` | For Draw generation/editing | Server-only image-generation credential; never returned to or stored by the browser |
| `OPENPRISM_DRAW_IMAGE_API_BASE` | No | Server-side image-generation gateway override |
| `OPENPRISM_DRAW_IMAGE_MODEL` | No | Server-side image model; set this to a model exposed by the configured endpoint |
| `OPENPRISM_DRAW_IMAGE_USE_LLM_CREDENTIALS` | No | When `true`, Draw reuses the language-model Base URL and API Key while keeping an independently configurable image model |
| `OPENPRISM_DRAWIO_EMBED_URL` | No | Trusted HTTP(S) Draw.io embed URL; defaults to diagrams.net and may point to an administrator-controlled self-hosted instance |
| `OPENPRISM_COLLAB_TOKEN_SECRET` | Production | Signs collaboration tokens; replace the development value |
| `OPENPRISM_COLLAB_REQUIRE_TOKEN` | No | Require collaboration token verification |
| `OPENPRISM_COLLAB_TOKEN_TTL` | No | Collaboration token lifetime in seconds |
| `OPENPRISM_TUNNEL` | No | `false`, `ngrok`, `cf`, or `localtunnel` |
| `NGROK_AUTHTOKEN` | For ngrok | ngrok authentication token |

The large static Paper Writer Workbench is a disabled-by-default legacy prototype, not a second supported application. Its remaining unique features, migration acceptance criteria, and removal policy are tracked in [Legacy Workbench lifecycle](docs/legacy_workbench_lifecycle.md). The React workspace at `/projects` is the only supported product entry, and it intentionally does not link to the prototype.

Compilation subprocesses inherit the server's `PATH` and `LD_LIBRARY_PATH` unchanged. If TeX, Pandoc, or Tectonic is installed in a non-standard location, configure the compile-specific variables above instead of relying on a particular user's `HOME`, Conda installation, or `/usr/local/bin`. Empty overrides do not alter the inherited environment.

Set `OPENPRISM_API_TOKEN`, then enter the same token in the unlock card on the Projects page so requests include `Authorization: Bearer <token>`. This server access step does not require configuring a model. Without a configured server token, only liveness/readiness and Provider metadata remain public; project access, configuration details, model calls, execution, and terminal APIs fail closed. `/api/config` is authenticated because it contains deployment metadata such as model endpoints and local paths.

Every production build generates a shared build ID for the frontend and backend. The browser checks `/api/health` before loading the workspace and blocks use when the backend is missing build metadata, has an incompatible API schema, or belongs to a different build. `/api/ready` separately verifies that the managed data root and template manifest are available.

Dependency security is evaluated from the committed `app/package-lock.json`. Known advisory floors are enforced by `tests/dependencySecurityContract.test.mjs`; use targeted in-range updates after `npm explain`, not an uncontrolled `npm audit fix --force`. The current dependency reachability notes and required release checks are recorded in [`docs/dependency_security.md`](docs/dependency_security.md).

Draw image generation is project-bound. Every Draw read, list, upload, download, generate, and edit request carries a managed `projectId`; the backend resolves it through project metadata and confines file access to that project root. The Draw Settings tab can save an independent Base URL, API Key, and model through the authenticated backend config API, or reuse the language-model Base URL and API Key. Keys remain backend-only and are never persisted in browser storage.

## User Guide

### Create or import a project

1. Open the project dashboard.
2. Create a project from a built-in template, create an empty project, or import an existing folder/archive.
3. Open the project to enter the editor.
4. Use the file tree to create, rename, upload, download, or delete files.
5. Keep the compilation entry file (`main.tex`, `paper.tex`, or `manuscript.tex`) in the project, or select a source containing `\documentclass` when compiling.

Managed projects are stored under the Project Locator's authoritative `OPENPRISM_DATA_DIR`. By default this is `papers/` at the repository root, which is intentionally ignored by Git. New projects use a readable safe directory name plus a short UUID suffix (for example, `My-Paper--79692122`) while retaining the full UUID in `project.json` as their stable identity. Renaming a project updates both its display name and directory transactionally; older UUID-only and imported folders remain discoverable through metadata.

If the data root already contains a paper directory with supported files but no `project.json`, the project dashboard shows it under **Discovered paper directories** with a read-only file count, suggested main file, and sample paths. Registration is an explicit confirmed action: it atomically writes a stable UUID metadata file into the existing directory without moving or deleting paper files. Managed project rows show the display name, stable project ID, and actual storage directory separately so backups and filesystem troubleshooting do not depend on guessing the UI-name-to-folder mapping.

The supported React workspace sends managed `projectId` values and project-relative file paths to chapters, AI/review, citation, Pipeline, watcher, and terminal APIs. The old `__paper_agent__:<id>` marker is accepted only as an observable deprecated-client compatibility input. Absolute `projectPath` remains available only to the separately bounded external Code/MCP directory capabilities; it is not a managed-paper API shortcut.

### Edit, compile, and preview

1. Open a `.tex` or Markdown file from the file tree.
2. Edit it in the center editor and save the change.
3. Choose an engine or use **Auto**.
4. Compile the current file or the full paper.
5. Inspect the PDF and compiler log. Compilation output is kept under the project's `.compile/output/` directory.
6. Use SyncTeX navigation where supported to move between source and PDF positions.

The full-paper compiler detects a main source, chooses a compatible engine, runs bibliography and repeated LaTeX passes when necessary, and preserves a downloadable PDF. **Quick Preview** is explicitly approximate and uses structured placeholders for unresolved references, commands, or images; **Final PDF** is the authoritative typeset result. A generated PDF with unresolved rerun warnings is reported as “succeeded with warnings” rather than unconditional success.

### Use Chat, Agent, and Tools modes

- **Chat**: explanation and discussion without proposing file changes.
- **Agent**: drafting, rewriting, review, and proposed edits. Changes appear as diffs for acceptance or rejection.
- **Tools**: tasks that need controlled command execution or project tools.

Recommended flow:

1. Create or select a conversation.
2. Set its scope to a chapter, global paper context, or free context.
3. Open **Select Skill** and choose the relevant Skill.
4. Optionally attach PDFs/images or select RAG documents.
5. Describe the target file, intended change, constraints, and expected output.
6. Review every proposed diff before accepting it.

### Use Skills effectively

Skills encode task-specific instructions and safety boundaries. The catalog includes academic writing, paper planning, literature review/search, polishing, rebuttal, reviewer response, LaTeX debugging, bibliography management, citation verification, statistical analysis, figure design, slides, posters, grants, and submission checks.

The selector uses a three-level hierarchy: **research category → task subcategory → Skill**. Opening Paper Writing, for example, first shows subcategories such as outline and planning, abstract, introduction, related work, methods, experiments and results, and language polishing. Open a subcategory to see the individual Skills and their task-specific descriptions. This same selector is available in Chat and Draw.

The catalog is runtime- and manifest-driven rather than documented with a fragile fixed upper bound (the current checkout loads 123 Skills). CI verifies unique IDs, generated-manifest consistency, and the allowed category taxonomy; the UI derives counts from the same runtime catalog and hides empty categories. Medical, materials-science, humanities/history, fictional exploration, generic web-research, and functionally duplicate entries were removed. The open-source subset contains AI/ML-relevant AlterLab Skills, SNL's top-tier writing workflow, AI4S, the Chinese ResearchPilot pipeline, individually reviewed SkillsBot entries, and the popular GitHub Skills below. Complete upstream resources—not prompt summaries—remain under `app/apps/backend/skill-resources/`.

| GitHub source | Repository stars¹ | Included capability | License |
|---|---:|---|---|
| `handsomestWei/patent-disclosure-skill` | 3,374 | AI/software patent mining, prior-art differentiation, technical disclosure, consistency checks, and DOCX delivery | MIT |
| `huggingface/skills` | 10,761 | AI paper reading plus publication and model/dataset/Space artifact linking | Apache-2.0 |
| `uditgoenka/autoresearch` | 5,235 | Metric-driven modify, evaluate, keep-or-revert experiment loops with bounded stopping | MIT |

¹ Repository-star snapshots were checked on 2026-07-03. They are provenance/popularity signals, not a quality guarantee. The selector displays this metadata for imported popular Skills.

Literature search is split by real workflow rather than a broad database grab bag: query and screening strategy, arXiv, Google Scholar, Semantic Scholar, DBLP, Hugging Face AI paper pages, paper reading/extraction, evidence synthesis, related-work analysis, BibTeX management, and citation verification. OpenAlex, USPTO search, PubMed, materials databases, and historical-source search are not exposed as selectable Skills. Patent work is represented only by the dedicated project-to-disclosure workflow above, not by a generic patent database Skill.

Usage notes:

1. Start from the closest category and subcategory instead of enabling many overlapping Skills.
2. The EN/中文 switch changes category, subcategory, Skill name, and description labels together.
3. Chat selections guide conversation and Agent edits. Draw selections guide the image-prompt generation stage.
4. In Draw, selected Skills contribute their complete prompt instructions, including layout, chart type, visual style, and validation rules; the configured image endpoint still performs image generation.
5. Restart the backend or reload the catalog after changing YAML Skill definitions.

Good prompt:

```text
Use the Literature Review Skill. Revise sec/2.related-work.tex using only the
selected RAG documents. Preserve existing citation keys, identify the research
gap explicitly, and return a reviewable diff rather than replacing the file.
```

### Build a RAG evidence library

1. Open **RAG** in the right panel.
2. Upload PDFs, BibTeX, Markdown, plain text, or supported research material.
3. Check the **RAG index health** card. It reports the current generation, deterministic corpus fingerprint, file/chunk counts, and per-file parser warnings or failures. Documents are indexed automatically after add, upload, or delete; **Repair / rebuild index** is a recovery action, not a routine required step.
4. Search the corpus to confirm that useful passages are retrievable. The built-in retrieval mode is transparent local keyword/token-overlap search, not semantic vector retrieval. `.openprism`, `.compile`, and `research_corpus` are intentionally hidden from the ordinary source tree; manage evidence through the RAG panel.
5. In Chat, select the documents that should remain attached to the conversation.
6. Ask the model to cite or distinguish evidence instead of inventing bibliographic details.

Do not assume a PDF is usable merely because upload succeeded. Verify the per-file parser status, extracted characters, searchable chunks, and actual search hits first. `GET /api/projects/:id/rag/health` is read-only: it reports a missing or corrupt index without silently rebuilding or quarantining it; search and ordinary document operations retain the existing automatic recovery behavior.

### Mobile workspace

At widths up to 800 px, the project editor switches from the desktop three-column layout to mutually exclusive **Files**, **Editor**, and **Assistant** views. Use the workspace tabs to move between them; the project dashboard also changes from a compressed table to touch-friendly project cards. The language selector updates the document language. Core UI CSS does not request Google Fonts or another remote font stylesheet; it uses an OS-local stack with CJK and monospace fallbacks so navigation remains readable and deterministic on offline or restricted networks.

### Verify citations

Open **Citations** in the right panel:

- **Cross-Check Only** performs a fast local comparison between citations in the paper and entries in the bibliography.
- **Verify All Citations** also queries scholarly services and can take longer.

Paper Agent detects the same main `.tex` file used for compilation, recursively follows `\input` and `\include`, and resolves bibliography declarations such as:

```tex
\bibliography{references}
\addbibresource{bib/library.bib}
```

It reports citations missing from `.bib`, bibliography entries never cited by the paper, DOI/title matches, confidence, and provider errors. External verification has a visible timer, a client timeout, and a Stop action. A Semantic Scholar API key is recommended for larger bibliographies.

### Generate figures

1. Open **Draw**.
2. Expand **Scientific Figures**, open the appropriate subcategory, and select a Skill for architecture diagrams, scientific schematics, statistical plots, or publication layout.
3. Load relevant `.tex` content and describe the intended figure.
4. Optionally attach reference figures from project PDFs.

`.drawio` files use the configured external or self-hosted Draw.io embed. The external editor may receive the diagram XML. If it cannot load within the readiness timeout, the editor shows Retry, offline XML editing, and XML download instead of remaining on a loading screen. Restricted deployments should configure `OPENPRISM_DRAWIO_EMBED_URL` to a trusted self-hosted HTTP(S) instance. LaTeX quick preview and the core UI do not fetch remote font stylesheets.
5. Generate an image-prompt draft, or skip this step and write the final prompt directly.
6. Edit the final prompt freely, configure an independent image endpoint/key or reuse the language-model credentials, and generate the image. The final textarea is sent exactly as written without automatically appending paper content.
7. The result is saved in the current project's `draw/` folder for use from LaTeX.

Skills constrain and enrich the prompt; they do not replace the image API or automatically execute upstream scripts that are not integrated into Paper Agent. Generated figures should still be checked for labels, factual accuracy, typography, accessibility, and venue requirements.

### Review and Anti-AI tools

- **Review** produces structured manuscript feedback.
- **Anti-AI / Quick** applies rule-based signals.
- **Anti-AI / Deep** uses the configured LLM.
- **GPTZero** requires its browser automation dependencies and is an external service.

AI-detection scores are heuristic and should not be treated as proof of authorship.

### Run a Pipeline

Open **Pipeline** and choose a preset or configured workflow. Pipelines may contain:

- AI stages for Skill-guided generation.
- Human checkpoints for approve/reject/edit/skip decisions.
- Compile stages for PDF validation.
- Citation stages for bibliography checks.
- Compute stages for controlled commands.

Use pause/resume, retry with feedback, and stage-level logs to keep long workflows reviewable.

### Use the integrated terminal

Open the bottom terminal panel. When `tmux` is installed, Paper Agent associates terminal sessions with the project so they can survive UI refreshes. Treat terminal access as local shell access: do not expose it publicly without authentication and transport security.

### Template transfer

Template transfer supports direct LaTeX migration and a MinerU-assisted PDF path. It can copy assets, map source sections, attempt compilation fixes, and optionally inspect layout. This feature is experimental: always compare the output against the source and the target venue's official template.

## MCP Integration

Paper Agent exposes MCP-compatible JSON-RPC and SSE endpoints:

```text
POST /api/mcp
GET  /api/mcp/sse
POST /api/mcp/message
GET  /api/mcp/info
```

Available tools include:

- `paper_search`
- `verify_citations`
- `cross_check_citations`
- `compile_latex`
- `read_project_file`
- `ai_polish`
- `ai_review`

With the server running, open `/api/mcp/info` for generated endpoint examples. Protect MCP endpoints with `OPENPRISM_API_TOKEN` before exposing them outside a trusted network.

## Templates and Skills

Loading a Skill into the catalog does not prove that it can execute on the current machine. Skill management reports `ready`, `degraded`, or `unavailable` together with command, credential, network, project-file, Provider-capability, side-effect, and cost metadata. Legacy Skills without explicit execution metadata remain conservatively `degraded`. The readiness check is static and read-only: it does not run scripts, access the network, or call a model. See [`docs/skill_execution_readiness.md`](docs/skill_execution_readiness.md) for the schema and execution boundary.

Built-in template manifest:

- ACL
- CVPR skeleton
- NeurIPS skeleton
- ICML skeleton
- ICLR 2026
- arXiv preprint

Every bundled LaTeX template is declared in the committed manifest with its real entry file and user-facing metadata. The gallery returns only categories that currently contain templates; the synthetic “All” filter is owned by the UI. Custom ZIP templates can be uploaded through the template API/UI and are added to the local manifest.

Skill definitions live in [`app/apps/backend/skills/`](app/apps/backend/skills/). Each YAML file can define its name, description, prompt, category, inputs, outputs, and task guidance. Project-specific Skill directories can be loaded for non-managed project paths.

External YAML definitions are generated by [`app/scripts/sync-open-source-skills.mjs`](app/scripts/sync-open-source-skills.mjs). To update the configured sources from the repository root:

```bash
npm --prefix app run skills:sync
```

[`open-source-skills.manifest.json`](app/apps/backend/skills/open-source-skills.manifest.json) records repositories, exact commits, filters, and generated files. GitHub licenses and notices remain in their resource trees. SkillsBot entries without a published license are explicitly marked for license verification. The sync script uses an explicit AI/ML allowlist so upstream updates cannot silently reintroduce unrelated or duplicate Skills.

## Development and Testing

All commands below run from the repository root:

```bash
# Frontend production build
npm run build

# Unit suite (excludes server-backed integration tests)
npm run test:unit

# Real TypeScript gate (tsc --noEmit)
npm run typecheck

# Isolated API integration suite
npm run test:integration

# A focused test file
npm --prefix app exec vitest run tests/project-page-sidebar.test.js

# Browser E2E tests (requires Playwright browser/system dependencies)
npm run test:e2e

# Build + unit, or the complete release gate
npm run check
npm run check:full
```

Useful checks:

```bash
curl http://localhost:8787/api/health
git diff --check
```

The integration and browser suites start an isolated backend on a random loopback port, use a temporary `OPENPRISM_DATA_DIR`, create their own fixtures, and clean up the process and data even after failure. They never rely on projects under the developer's `papers/` directory.

The isolated browser runner owns one stateful backend and one temporary data root, so Playwright is intentionally configured with `fullyParallel: false` and `workers: 1`. This prevents project registration, RAG rebuilds, conversation restoration, and Draw.io network simulations from racing. Do not increase worker count unless each worker receives its own backend, port, data root, and bearer token. A successful isolated run does not replace post-restart LAN acceptance: production must still verify matching frontend/backend build IDs, `/api/ready`, authentication, and the authoritative data root.

Skill run history distinguishes a completed Provider request from a verified paper objective. `provider_completed` means the adapter returned; `objectiveStatus: not-evaluated` is shown until a real evaluator proves the task result. A loaded Skill or a successful model HTTP response is not a scientific correctness guarantee.

## Repository Layout

```text
paper_wrighting/
├─ app/
│  ├─ apps/backend/          Fastify API, services, Skills, compilation, RAG
│  ├─ apps/frontend/         React/Vite application
│  ├─ templates/             Built-in LaTeX templates
│  ├─ tests/                 Vitest and Playwright tests
│  ├─ .env.example           Safe configuration template
│  └─ package.json           Active workspace scripts
├─ asserts/                  README screenshots
├─ docs/                     Design, UX, function, and debugging notes
├─ scripts/                  Repository tooling and acceptance helpers
├─ papers/                   Local projects (ignored by Git)
├─ README.md                 English documentation
└─ README_ZH.md              Simplified Chinese documentation
```

## Troubleshooting

### The frontend cannot reach the backend

Start development mode with the correct proxy target:

```bash
OPENPRISM_API_ORIGIN=http://localhost:8787 npm run dev
```

Confirm `curl http://localhost:8787/api/health` returns `{"ok":true}`.

### AI model or model list fails

Check `OPENPRISM_LLM_BASE_URL`, key, and model name. The base URL must be the API root expected by the provider, commonly ending in `/v1`.

### `pdflatex.fmt` or a `.sty` file is missing

Your TeX installation is incomplete. Install a complete TeX Live/TinyTeX distribution, regenerate formats, or install the missing CTAN package with `tlmgr`. Restart Paper Agent after changing `PATH`.

### Citation verification is slow

Use **Cross-Check Only** for immediate local results. Full verification contacts several external services and is affected by network latency and rate limits. Configure `SEMANTIC_SCHOLAR_API_KEY`, watch the elapsed timer, or use Stop. Large entries are processed with bounded concurrency and per-entry timeouts.

### A bibliography is reported missing

Ensure the detected main file contains `\bibliography{...}` or `\addbibresource{...}` and that the referenced path is inside the project. The Citations panel displays the detected main file and bibliography paths.

### PDF/RAG extraction returns no useful text

Try `pdftotext`, OCR, or manual text import. Scanned, encrypted, malformed, and image-only PDFs may not contain a usable text layer.

### The UI still shows an older version

Run `npm run build`, restart the backend, and hard-refresh the browser. Production assets are served from `app/apps/frontend/dist/`.

## Privacy and Security

- `papers/`, `.env`, runtime state, caches, logs, and build artifacts are ignored by Git.
- Never commit manuscripts, reviewer material, private PDFs, tokens, or API keys.
- AI/model requests and optional scholarly/image/OCR services send the requested content to the configured provider.
- Set `OPENPRISM_API_TOKEN` and a strong collaboration secret before LAN or internet exposure.
- Use HTTPS through a trusted reverse proxy or tunnel for remote access.
- Review AI output, citations, generated figures, commands, and proposed diffs before adoption.

## Contributing

Issues and focused pull requests are welcome:

1. Create a branch.
2. Keep changes scoped and preserve user project data.
3. Add or update tests for behavior changes.
4. Run the relevant Vitest suite and frontend build.
5. Describe configuration, migration, and security implications in the pull request.

Repository: <https://github.com/xzktx003/paper_wrighting>

## License

Released under the [MIT License](LICENSE).
