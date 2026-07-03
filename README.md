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
cd paper_wrighting/app
npm ci
```

### 3. Configure

```bash
cp .env.example .env
```

At minimum, configure an OpenAI-compatible model if you want AI features:

```dotenv
OPENPRISM_LLM_BASE_URL=https://api.openai.com/v1
OPENPRISM_LLM_API_KEY=replace-with-your-key
OPENPRISM_LLM_MODEL=gpt-4o

PORT=8787
OPENPRISM_COLLAB_TOKEN_SECRET=replace-with-a-random-secret
```

The editor, project manager, compilation, terminal, and local cross-check features can run without an LLM key. AI writing, deep review, and prompt generation require a configured model endpoint.

### 4. Start development mode

The Vite proxy defaults to the host configured in the repository. For a local machine, set the API origin explicitly:

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

The committed template is [`app/.env.example`](app/.env.example). Keep real secrets in `app/.env`; it is ignored by Git.

| Variable | Required | Description |
| --- | --- | --- |
| `OPENPRISM_LLM_BASE_URL` | For AI | OpenAI-compatible API base URL |
| `OPENPRISM_LLM_API_KEY` | For AI | Model provider API key |
| `OPENPRISM_LLM_MODEL` | For AI | Default model name |
| `PORT` / `OPENPRISM_PORT` | No | Backend port; default `8787` |
| `OPENPRISM_FRONTEND_PORT` / `VITE_PORT` | No | Vite development port; default `5173` |
| `OPENPRISM_API_ORIGIN` | Dev only | Vite proxy target, e.g. `http://localhost:8787` |
| `OPENPRISM_DATA_DIR` | No | Managed project storage; default is repository-level `papers/` |
| `OPENPRISM_PROJECTS_DIR` | Feature-specific | Base directory used by project-oriented drawing/settings flows |
| `OPENPRISM_API_TOKEN` | No | Enables Bearer-token protection for API routes |
| `SEMANTIC_SCHOLAR_API_KEY` | No | Improves Semantic Scholar quota for citation verification |
| `OPENPRISM_MINERU_API_BASE` | No | MinerU endpoint for PDF conversion |
| `OPENPRISM_MINERU_TOKEN` | No | MinerU access token |
| `OPENPRISM_DRAW_IMAGE_API_BASE` | No | Image-generation gateway override |
| `OPENPRISM_COLLAB_TOKEN_SECRET` | Production | Signs collaboration tokens; replace the development value |
| `OPENPRISM_COLLAB_REQUIRE_TOKEN` | No | Require collaboration token verification |
| `OPENPRISM_COLLAB_TOKEN_TTL` | No | Collaboration token lifetime in seconds |
| `OPENPRISM_TUNNEL` | No | `false`, `ngrok`, `cf`, or `localtunnel` |
| `NGROK_AUTHTOKEN` | For ngrok | ngrok authentication token |

If `OPENPRISM_API_TOKEN` is enabled, enter the same token in the web UI so requests include `Authorization: Bearer <token>`.

## User Guide

### Create or import a project

1. Open the project dashboard.
2. Create a project from a built-in template, create an empty project, or import an existing folder/archive.
3. Open the project to enter the editor.
4. Use the file tree to create, rename, upload, download, or delete files.
5. Keep the compilation entry file (`main.tex`, `paper.tex`, or `manuscript.tex`) in the project, or select a source containing `\documentclass` when compiling.

Managed projects are stored under `OPENPRISM_DATA_DIR`. By default this is `papers/` at the repository root, which is intentionally ignored by Git.

### Edit, compile, and preview

1. Open a `.tex` or Markdown file from the file tree.
2. Edit it in the center editor and save the change.
3. Choose an engine or use **Auto**.
4. Compile the current file or the full paper.
5. Inspect the PDF and compiler log. Compilation output is kept under the project's `.compile/output/` directory.
6. Use SyncTeX navigation where supported to move between source and PDF positions.

The full-paper compiler detects a main source, chooses a compatible engine, runs bibliography and repeated LaTeX passes when necessary, and preserves a downloadable PDF.

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

The catalog is now a curated set of roughly 100 Skills for AI/ML, LLM, computer-science research, and CCF-A/ICLR/ICML/NeurIPS-style submissions. Medical, materials-science, patent, humanities/history, fictional exploration, generic web-research, and functionally duplicate entries were removed. The open-source subset contains 36 AI/ML-relevant AlterLab Skills, SNL's top-tier writing workflow, AI4S, the Chinese ResearchPilot pipeline, and four individually reviewed SkillsBot entries. Complete GitHub resources remain under `app/apps/backend/skill-resources/`.

Literature search is split by real workflow rather than a broad database grab bag: query and screening strategy, arXiv, Google Scholar, Semantic Scholar, DBLP, paper reading/extraction, evidence synthesis, related-work analysis, BibTeX management, and citation verification. OpenAlex, USPTO, PubMed, materials databases, and historical-source search are not exposed as selectable Skills.

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
3. Check extraction/indexing status. Scanned or protected PDFs may require OCR or manual text import.
4. Search the corpus to confirm that useful passages are retrievable.
5. In Chat, select the documents that should remain attached to the conversation.
6. Ask the model to cite or distinguish evidence instead of inventing bibliographic details.

Do not assume a PDF is usable merely because upload succeeded. Verify extracted text and search hits first.

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
5. Generate the image prompt. The backend combines paper context, reference-figure descriptions, and the selected Skill instructions.
6. Review or edit the prompt, configure the image endpoint/key, and generate the image.
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

Built-in template manifest:

- ACL
- CVPR skeleton
- NeurIPS skeleton
- ICML skeleton

An arXiv template is also present in the template assets. Custom ZIP templates can be uploaded through the template API/UI and are added to the local manifest.

Skill definitions live in [`app/apps/backend/skills/`](app/apps/backend/skills/). Each YAML file can define its name, description, prompt, category, inputs, outputs, and task guidance. Project-specific Skill directories can be loaded for non-managed project paths.

External YAML definitions are generated by [`app/scripts/sync-open-source-skills.mjs`](app/scripts/sync-open-source-skills.mjs). To update the configured sources, run this from `app/`:

```bash
npm run skills:sync
```

[`open-source-skills.manifest.json`](app/apps/backend/skills/open-source-skills.manifest.json) records repositories, exact commits, filters, and generated files. GitHub licenses and notices remain in their resource trees. SkillsBot entries without a published license are explicitly marked for license verification. The sync script uses an explicit AI/ML allowlist so upstream updates cannot silently reintroduce unrelated or duplicate Skills.

## Development and Testing

From `app/`:

```bash
# Frontend production build
npm run build

# Main Vitest suite
npx vitest run

# A focused test file
npx vitest run tests/project-page-sidebar.test.js

# Browser E2E tests (requires Playwright browser/system dependencies)
npm run test:e2e
```

Useful checks:

```bash
curl http://localhost:8787/api/health
git diff --check
```

Some integration tests expect a running backend and test fixtures. Start the expected server/port before treating connection-refused integration failures as product regressions.

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
