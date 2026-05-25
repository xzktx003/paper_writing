# Function List

## Project Workspace

- The frontend theme selector includes Basic Light, GitHub Dark, Dracula, and a "赛博科技" (Cyber Tech) theme with zone-specific coloring: cyan for Files, green for Terminal, purple for AI Assistant, and blue for Editor.
- Project creation and import create a root-level `docs/` folder for free-form notes, ideas, outlines, and draft documents.
- Existing projects receive `docs/` automatically the next time their file tree is opened. `fig/` is no longer created automatically; image folders only appear when imported or created by the user.
- The project file tree supports arbitrary files under `docs/`; users can create, upload, edit, rename, and delete those files through the existing project file APIs.
- The project file tree blank/root context menu supports Paste, New File, New Folder, and Upload; folder context menus target child creation/upload/paste inside that folder; file context menus do not show create actions. New files are created empty, opened immediately, and existing paths are not overwritten.
- The editor file tree supports VS Code-style context actions for files and folders: copy path, copy, cut, paste, rename, and delete.
- File/folder rename uses inline editing: right-click Rename turns the filename into an editable input field with Enter to confirm and Escape to cancel.
- Files and folders can be dragged from the editor file tree into another folder, or onto the explicit project-root drop target, to move them inside the same project.
- The divider between the editor file tree and Skills panel can be dragged vertically to resize both areas.
- The integrated terminal opens a project-bound tmux session, reattaches to the same session after closing/reopening or refreshing the page, and creates a new tmux session only if the previous one was killed.
- Markdown preview resolves project image references such as `![caption](fig/chart.png)` through the project blob API.
- LaTeX preview renders `\includegraphics{fig/chart}` and figure captions using project images, with extensionless image paths resolved by the backend.
- The editor file tree shows the complete project directory tree, including root files and folders such as `appendix/`, `tab/`, `img/`, `.sty`, `.bib`, `.tex`, and `.pdf` files.

## Project Management

- Projects can be listed, renamed, copied, archived, moved to trash, restored, and permanently deleted.
- Project listings include both the display name from `project.json.name` and the backing directory name.
- Project deletion is tolerant of missing or invalid `project.json` metadata and supports projects whose directory name differs from their project ID.


## Configuration

- LLM provider, API key, base URL, model, and Claude-compatible fallback values are read from and written back to the repository-root `.env` file.
- `/api/config` returns only non-secret settings plus key-present flags; API keys are masked and are never echoed to the frontend.
- The frontend settings panel writes updates through `/api/config` and does not persist LLM API keys, base URLs, or model names in browser localStorage.

- Chapter editing supports three view modes: Source for plain CodeMirror source, Split for source plus preview, and Rendered for an Obsidian-like editable preview surface. Rendered mode displays compiled Markdown/LaTeX headings, paragraphs, lists, math, and images as normal document preview content; editable text blocks write changes back to the underlying source, while invalid or unsupported syntax remains visible as editable source fallback.

## AI Assistant

- New AI conversations support three modes only: Chat, Agent, and Tools.
- Chat mode is read-only discussion and does not receive file-writing or code-execution tools.
- Agent mode can inspect paper context and propose edits for user confirmation, but it does not directly write files or run code.
- Tools mode is the only AI conversation mode that can perform multi-step tool work, including controlled operations under the project `code/` directory.
- Vision/image analysis is integrated into the AI chat input: users can attach images via the 🖼️ button or Ctrl+V paste, preview them before sending, and the AI receives them as multimodal vision content.
- The standalone Agent, Vision, Paper Search, Web Search, and Plot left-panel tabs have been removed; Agent lives in chat conversations, Vision is integrated into chat input, and Paper/Web Search/Plot are no longer available.

## BibTeX Citation Search

- Editor supports BibTeX citation autocomplete: type `@` followed by search keywords to search CrossRef academic paper database.
- Search results display paper title, authors, year, journal, and DOI information.
- Selected citations can be inserted as formatted BibTeX entries.
- API endpoint `/api/bibtex/search` queries CrossRef for academic papers.
- API endpoint `/api/bibtex/bibtex` retrieves full BibTeX entry by DOI.

## UI Animations & Transitions

- Comprehensive animation system with fade-in, slide, scale, bounce, and shimmer effects.
- Staggered message reveal animation in chat view for sequential message appearance.
- Typing indicator with animated dots during AI response generation.
- Loading skeleton with shimmer effect for content loading states.
- Hover effects: lift, scale, and press feedback on interactive elements.
- Theme transitions with smooth color and background changes.
- LaTeX preview content change animation with subtle shimmer effect.
- Respects `prefers-reduced-motion` accessibility setting.

## AI Assistant — SSE Streaming

- AI chat supports real-time SSE (Server-Sent Events) streaming; tokens appear incrementally as the model generates them.
- Streaming endpoint `POST /api/ai/stream` provides `token`, `tool_use`, `tool_result`, `done`, and `error` events.
- Streaming cursor animation (blinking vertical bar) shows during active generation.
- Automatic fallback to non-streaming `POST /api/ai/send` if SSE connection fails.
- Both Anthropic and OpenAI-compatible providers support streaming with tool use (agent/tools modes).

## AI Assistant — Auto Context Injection

- New conversations automatically inject relevant context based on `context_scope`:
  - `chapter` scope: reads the full content of any project file — type a path directly (e.g., `sec/intro.tex`, `appendix/A.1.tex`) or browse via the 📂 file picker.
  - `global` scope: reads the first 400 chars of each `.tex` file as a paper structure overview.
  - All non-free scopes: injects `references.bib` content (up to 4000 chars) into the context window.
- Context injection happens server-side before each AI call, ensuring the model always sees the relevant paper content.

## AI Assistant — Structured Review Report

- `POST /api/review/structured` endpoint generates a structured peer review with JSON output.
- Review includes: overall score (0-100), editorial decision (accept/minor_revision/major_revision/reject), dimension scores (methodology, novelty, clarity, reproducibility, writing_quality), per-issue severity/location/suggestion, summary (Markdown), and revision checklist.
- ReviewReportPanel displays: score ring chart, decision badge, dimension bars with issue lists, Markdown summary, and interactive revision checklist with checkboxes.
- Triggered from the "📋 Review" tab in the right panel.

## AI Assistant — Inline Diff Visualization

- `propose_edit` tool now returns unified diff with `original`, `new_content`, `patch`, and `stats` (added/removed line counts).
- InlineDiffViewer component renders side-by-side line numbers with color-coded additions (green) and deletions (red).
- Collapsible mode: shows summary bar (filename + +/- counts), click to expand full diff.
- Accept/Reject buttons for proposed edits; accept applies the change to the file.
- Supports both compact (300px max) and full (500px max) display modes.

## AI Assistant — Anti-AI Detection

- `POST /api/anti-ai/detect` endpoint analyzes text for AI writing patterns.
- Detection includes: flagged terms (high/medium/low severity with line locations), sentence patterns (hedging, throat-clearing, passive voice, list intros, mechanical transitions), vocabulary diversity (type-token ratio), sentence length variety (avg/stdDev/min/max), and paragraph uniformity.
- Overall AI writing score (0-100) with color-coded gauge: Low AI (green) / Moderate (yellow) / High AI (red).
- Generates actionable suggestions with original → replacement mappings.
- AntiAiPanel displays: score gauge, stats grid, flagged term badges (expandable), pattern list, and suggestion cards.
- Triggered from the "🔍 Anti-AI" tab in the right panel.

## AI Assistant — Paper Writing Pipeline

- `POST /api/pipeline/start` creates a multi-stage pipeline; built-in pipelines: `paper-pipeline` (Polish → Review → Revise → Finalize) and `quick-review` (Review → Revise).
- Pipeline engine (`pipelineEngine.js`) manages stage state (pending/running/completed/failed), persists to `~/.paper-writer/pipelines/`, and supports approve/retry with feedback.
- `POST /api/pipeline/:id/run-stage` executes the current stage using its associated skill (nature-polishing, academic-paper-reviewer, etc.).
- `POST /api/pipeline/:id/advance` advances to the next stage (approved=true) or retries with feedback (approved=false).
- PipelinePanel displays: stage progress ring (○/⟳/✓/✗), stage details, output preview (Markdown for polish, ReviewReport for review), feedback textarea, Approve & Next / Revise & Retry buttons.
- Triggered from the "⚡ Pipeline" tab in the right panel.
