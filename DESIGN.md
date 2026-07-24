# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-07-25
- Primary product surfaces:
  - Coding Kanban: multi-agent terminal/workspace console under `apps/`.
  - Paper Writer: paper authoring backend and shipped frontend bundle under `app/`.
  - Paper Writer focus for this design pass: RAG, PDF ingestion, skill selection, Chat/Agent/Tools mode clarity.
- Evidence reviewed:
  - `README.md`
  - `docs/func_list.md`
  - `app/apps/backend/src/routes/paperRag.js`
  - `app/apps/backend/src/services/paperRagService.js`
  - `app/apps/backend/src/routes/skills.js`
  - `app/apps/backend/src/services/skillEngine.js`
  - `app/apps/backend/src/routes/ai.js`
  - `app/apps/backend/skills/*.yaml`
  - `app/apps/frontend/src/app/components/CenterPanel.tsx`
  - `app/apps/frontend/src/app/components/RenderedPreviewPane.tsx`
  - `app/apps/frontend/src/app/components/LatexPreview.tsx`
  - `app/apps/frontend/src/app/components/ChatView.tsx`
  - `app/apps/frontend/src/app/hooks/useConversations.ts`
  - `app/apps/frontend/src/app/utils/conversationActivity.ts`
  - `docs/template_compile_preview_contract.md`

## Brand
- Personality:
  - Quiet, research-focused, trustworthy, and operational.
  - The UI should feel like a paper cockpit, not a marketing site or generic chatbot.
- Trust signals:
  - Show what evidence was read, what was ignored, and why.
  - Make file privacy and project boundaries explicit.
  - Prefer deterministic status labels over vague AI promises.
- Avoid:
  - Hidden magic skill activation with no explanation.
  - English-only skill names for Chinese paper-writing workflows.
  - Large decorative panels that compete with the editor, citations, and evidence.
  - Upload flows that imply PDF content was indexed when only metadata was indexed.

## Product goals
- Goals:
  - Help a researcher move from private papers and drafts to reliable paper sections, citations, reviews, and revisions.
  - Make RAG feel inspectable: users can see source documents, extraction status, indexed chunks, retrieval hits, and cited snippets.
  - Make Skill selection obvious without requiring users to know internal skill names.
  - Make Chat, Agent, and Tools modes easy to distinguish by capability and risk.
- Non-goals:
  - Public SaaS collaboration.
  - Uploading or publishing private paper material by default.
  - Fully autonomous editing without visible diff and user approval.
- Success signals:
  - A user can upload a PDF and verify that real text, figures/tables captions, bibliography, and page spans were extracted.
  - A user can type a task in natural Chinese and get 3-5 recommended skills with reasons.
  - A user can hover or focus a skill and understand input, output, when to use it, and risks within 5 seconds.
  - A user can tell whether a response used draft context, RAG context, skill prompt, or tool output.

## Personas and jobs
- Primary personas:
  - PhD student or researcher writing a paper in Chinese/English.
  - Research engineer preparing experiments, tables, figures, and ablations.
  - Advisor or senior author reviewing claims, citations, and positioning.
- User jobs:
  - Read PDFs and build a trusted project-local literature memory.
  - Draft introduction, related work, method, results, discussion, abstract, and rebuttal-like responses.
  - Verify citations and avoid hallucinated claims.
  - Convert rough notes, experiment logs, and figures into manuscript-ready text.
  - Ask an agent to inspect project files and propose edits safely.
- Key contexts of use:
  - Private local research folders with unpublished manuscripts.
  - Iterative writing sessions where the user does not remember which skill to choose.
  - Mixed Chinese UI preference with English academic output requirements.

## Information architecture
- Primary navigation:
  - Project home
  - Editor
  - Chat/Agent panel
  - RAG / Evidence Library
  - Skill Library
  - Compile / PDF preview
  - Review / citation checks
- Core routes/screens:
  - Editor page with right-side AI panel.
  - Evidence Library for corpus upload, parsing, indexing, search, and retrieval diagnostics.
  - Skill picker embedded in the chat header and available as a full library view.
  - Agent activity view showing tool calls, proposed edits, and evidence used.
- Content hierarchy:
  - Primary: current paper file, selected task, answer/proposed diff.
  - Secondary: evidence snippets, selected skill, active mode.
  - Tertiary: logs, parser diagnostics, skill prompt internals.

## Design principles
- Principle 1: Evidence before eloquence.
  - Every RAG-backed answer should expose its source snippets and confidence.
- Principle 2: Recommend before asking users to choose.
  - The system should infer candidate skills from the user task and show ranked choices.
- Principle 3: Mode boundaries must be visible.
  - Chat explains, Agent inspects and proposes edits, Tools can execute controlled file/code actions.
- Principle 4: Private by default.
  - Local private folders like `papers/` must never be uploaded or indexed without explicit project-level action.
- Principle 5: Preview modes must preserve their semantic boundary.
  - Quick Preview is a source-driven browser rendering that updates with the current LaTeX text and may approximate unsupported commands, references, packages, fonts, layout, and figures.
  - Final PDF is the last explicitly compiled LaTeX artifact. Opening it reads the existing PDF and must not trigger compilation.
  - The presence of a compiled PDF must never replace or mask Quick Preview.
- Tradeoffs:
  - PDF parsing should be slower but truthful rather than fast and metadata-only.
  - Skill UI should initially use curated metadata over fully automatic taxonomy if metadata quality is uneven.
  - Advanced skill prompt details should be available, but hidden behind disclosure by default.

## Visual language
- Color:
  - Neutral editor base with restrained semantic accents.
  - Use distinct accents for modes: Chat, Agent, Tools, RAG evidence, warnings.
  - Avoid a one-hue palette; evidence and risk states need different colors.
- Typography:
  - Chinese labels first for user-facing controls, English skill slug as small secondary text.
  - Keep dense operational panels readable; no hero-scale text inside tool surfaces.
- Spacing/layout rhythm:
  - Compact, scan-friendly panels.
  - Skill cards should be short rows or small tiles, not large marketing cards.
- Shape/radius/elevation:
  - Use 4-8px radius, light borders, minimal shadows.
  - Cards only for repeated items, popovers, and concrete tools.
- Motion:
  - Subtle opacity/transform transitions only.
  - Respect reduced motion.
- Imagery/iconography:
  - Use familiar icons for search, upload, parser status, citation, warning, edit, and run.
  - Do not use decorative generated imagery in the working interface.

## Components
- Existing components to reuse:
  - Backend skill registry from `skillEngine.js`.
  - RAG corpus/index/search endpoints in `paperRag.js`.
  - Chat/Agent/Tools mode guidance in `ai.js`.
  - Existing skill YAML files as source data.
- New/changed components:
  - Editor preview tabs:
    - `Quick Preview` always renders current source through `RenderedPreviewPane` / `LatexPreview`.
    - `Final PDF` alone may render `AuthenticatedPdf` and expose explicit compile/recompile actions.
    - Switching to `Final PDF` may load the previous artifact but never compiles implicitly.
  - Skill metadata schema:
    - `display_name_zh`
    - `subtitle_en`
    - `task_intents`
    - `user_questions`
    - `inputs`
    - `outputs`
    - `best_for`
    - `not_for`
    - `risk_level`
    - `estimated_time`
    - `requires_context`
  - Skill picker:
    - Search box accepting natural Chinese tasks.
    - Category chips: 写作, 文献, 引用, 实验, 图表, 投稿, 润色, 审稿.
    - Ranked recommendations with reason labels.
    - Hover/focus popover with basic function, input, output, example prompt, and warning.
    - Compare mode for 2-3 similar skills.
  - RAG Evidence Library:
    - Document list with parse/index state.
    - PDF extraction preview.
    - Search test box with top chunks and page/line source.
    - Re-index button with parser diagnostics.
  - Chat evidence drawer:
    - Shows selected skill prompt summary.
    - Shows injected file context.
    - Shows RAG snippets used in the answer.
    - Shows omitted/failed documents.
  - Chat work-process disclosure:
    - Represents verifiable request phases, RAG preparation, tool calls, bounded tool-result summaries, answer generation, completion, and failure; it is not a private chain-of-thought viewer.
    - Remains collapsed by default for each request. Its summary shows the step count and current activity; the user explicitly expands the ordered timeline.
    - Tool inputs and results are summarized and redacted on the server before SSE delivery. File contents, edit bodies, credentials, tokens, and unrestricted command output must not appear in the disclosure.
    - Failed and interrupted activities remain visible so users can identify where execution stopped.
- Variants and states:
  - Skill card states: recommended, selected, disabled, missing required context, advanced, imported.
  - RAG document states: uploaded, parsing, parsed, indexed, failed, stale, too large, metadata-only.
  - Chat response states: no evidence, evidence-backed, proposed edit, tool result, needs user approval.
  - Chat work-process states: preparing, running, tool active, completed, failed; completed steps retain duration when available.
- Token/component ownership:
  - Product labels and skill taxonomy should live in backend metadata and be returned by `/api/skills`.
  - Frontend should not hard-code skill definitions beyond rendering categories and states.

## Frontend API contracts
- Skill list:
  - `GET /api/skills`
  - Returns an array of UI-ready skill summaries.
  - Required display fields: `display_name_zh`, `subtitle_en`, `category_zh`, `tags`, `task_intents`, `inputs`, `outputs`, `best_for`, `not_for`, `risk_level`, `estimated_time`, `requires_context`.
- Skill detail:
  - `GET /api/skills/:name`
  - Returns the same UI metadata shape as the list item for hover/focus popovers and detail drawers.
  - The first visible title should be `display_name_zh`; `subtitle_en` is secondary text.
- Skill recommendation:
  - `POST /api/skills/recommend`
  - Body: `{ "task": "帮我写 related work", "projectState": { "hasRagDocuments": true, "hasReferences": true }, "limit": 5 }`.
  - Returns ranked `{ skill, score, reasons, missingContext }` items.
  - Frontend should show recommendation reasons as visible labels, not only hidden tooltips.
- Writing workbench context:
  - `POST /api/projects/:id/writing-workbench/context`
  - Body: `{ "task": "帮我根据这些 PDF 写 related work", "skillLimit": 5, "evidenceLimit": 3 }`.
  - Returns one UI-ready object containing `projectState`, `skills.categories`, `skills.recommendations`, `rag.summary`, `rag.recentDocuments`, `rag.evidence`, and `rag.uiHints`.
  - Also returns `taskRouting` with `mode`, `modeLabel_zh`, `confidence`, `risk_level`, `requiresConfirmation`, `reasons`, `missingContext`, and `nextActions`.
  - Use this endpoint for the chat-header Skill Picker, Evidence Library summary strip, empty states, and "what should I use for this task?" recommendations.
  - Use `taskRouting.mode` to preselect Chat / Agent / Tools. Chat is for explanation and advice, Agent is for proposed manuscript edits, and Tools is for execution-heavy work such as compile, code, statistics, or figure/table generation.
  - Render `taskRouting.reasons` and `taskRouting.nextActions` visibly near the input box so the user understands why the system chose a mode.
  - `rag.uiHints[]` should render as visible status callouts, for example empty library, metadata-only documents, parse failures, or no evidence hit.
- RAG context/evidence:
  - `POST /api/projects/:id/rag/context`
  - Body: `{ "query": "graph neural retrieval", "limit": 5 }`.
  - Returns `{ context, evidence }`; `context` is a backward-compatible string and `evidence.results[]` contains ranked snippets with `source.path`, `source.title`, `source.lineStart`, `source.lineEnd`, `score`, and `text`.
- AI with RAG:
  - `POST /api/ai/send` and `POST /api/ai/stream` accept optional `rag`.
  - When RAG is used, responses retain old `ragContext` string and add `ragEvidence` with the structured evidence object.
  - Streaming emits `rag_context` with `{ evidence }`, then includes `ragEvidence` again in `done`.
  - Streaming `tool_use` and `tool_result` events expose only `{ name, activity }`, where `activity` is a bounded, server-redacted summary. Raw tool input and raw tool output are not a frontend contract.
- RAG document state:
  - Document rows should render `parseStatus`, `parser`, `extractedTextChars`, `chunks`, `extractionError`, and `warnings`.
  - `parsed` means extracted text was indexed; `metadata-only` means the file is saved but not searchable as full text; `failed` means parsing failed and the error should be shown.

## Accessibility
- Target standard:
  - WCAG 2.1 AA for core writing flows.
- Keyboard/focus behavior:
  - Skill cards must be keyboard navigable.
  - Hover details must also appear on focus.
  - Popovers must not trap focus unless modal.
- Contrast/readability:
  - Evidence snippets and warnings require high contrast.
  - Long academic text should use comfortable line height and avoid dense all-caps labels.
- Screen-reader semantics:
  - Skill recommendation reasons should be readable as text, not only color.
  - Parser status should announce progress and errors.
  - The work-process summary is a real button with `aria-expanded` and `aria-controls`; it must be keyboard operable and must not auto-expand while the model is running.
- Reduced motion and sensory considerations:
  - Avoid continuous loading animations in editor and evidence panels.

## Responsive behavior
- Supported breakpoints/devices:
  - Desktop first for paper writing.
  - Tablet acceptable for reading/review.
  - Mobile should focus on chat, quick review, and notifications, not full manuscript editing.
- Layout adaptations:
  - Desktop: editor center, AI/evidence right panel, file/project left panel.
  - Narrow screens: tabs for Editor / Chat / Evidence / Skills.
- Touch/hover differences:
  - Skill hover popover must become tap-to-open on touch devices.

## Interaction states
- Loading:
  - RAG parsing should show current phase: upload, text extraction, chunking, indexing.
  - Chat should show whether it is waiting on model, RAG search, or tool call.
  - Chat work stays compact: the collapsed header shows the current activity, and the complete ordered trace appears only after explicit expansion.
- Empty:
  - Empty RAG library should offer "上传 PDF/文献" and "从 arXiv/CrossRef 搜索".
  - Empty skill search should show task examples.
- Error:
  - PDF parser failures should state whether text extraction failed, file too large, encrypted PDF, no OCR, or parser unavailable.
  - Skill unavailable state should explain missing project context or backend error.
- Success:
  - After PDF indexing, show extracted character count, chunk count, page range coverage, and example snippets.
  - After selecting a skill, show the active skill chip in the chat header.
  - Quick Preview shows source-derived HTML even when a compiled PDF exists; Final PDF shows the authenticated compiled artifact and its cached/fresh status.
- Disabled:
  - Disable RAG-backed answer toggle when no indexed chunks exist.
  - Disable edit-producing agent actions until a project/file context is selected.
- Offline/slow network:
  - External search should show source-by-source timeout/failure instead of a single empty result.

## Content voice
- Tone:
  - Chinese UI labels by default; English academic terminology can appear as subtitles.
  - Direct, concrete, and workflow-oriented.
- Terminology:
  - "技能" for Skill.
  - "证据库" or "文献证据库" for RAG corpus.
  - "解析" for document parsing.
  - "索引" for chunk/index creation.
  - "引用证据" for citation-backed snippets.
  - "建议修改" for proposed edits.
- Microcopy rules:
  - Do not say "PDF 已索引" unless extracted text was actually indexed.
  - Use "仅保存文件信息，未抽取正文" for metadata-only uploads.
  - Skill descriptions should answer "适合什么时候用" before internal mechanics.
  - Use “工作过程” for execution activity. Do not label activity logs as “思维链” or imply access to hidden model reasoning; model-authored `<think>` content, when present, is labeled only as a model-provided reasoning summary.

## Implementation constraints
- Framework/styling system:
  - Current root product uses React/Vite/Fastify under `apps/`.
  - Paper Writer backend is Fastify under `app/apps/backend`.
  - Full Paper Writer frontend source was not present in this workspace snapshot; implementation may require restoring frontend source or editing the upstream source repository, not only built assets.
- Design-token constraints:
  - Keep operational UI compact and consistent with existing tool surfaces.
- Performance constraints:
  - PDF parsing can be asynchronous; indexing must not block the whole editor.
  - RAG search should return enough diagnostics without flooding the chat prompt.
- Compatibility constraints:
  - Existing API routes should remain backward compatible where possible.
  - Private directories like `papers/` remain git-ignored.
- Test/screenshot expectations:
  - Add backend tests for PDF upload states and RAG search behavior.
  - Add frontend/component tests for skill recommendation, hover/focus popover, and disabled states when RAG has no indexed text.
  - Add one manual smoke path: upload a small PDF, parse, search, ask a RAG-backed question, inspect cited snippets.

## Open questions
- [ ] Should Paper Writer UI default language be Chinese for all users, or follow browser/project locale? Owner: product. Impact: skill metadata and UI labels.
- [ ] Which PDF parser should be the default: local `pdftotext`, PDF.js, MinerU, or a fallback chain? Owner: engineering. Impact: reliability, privacy, install burden.
- [ ] Should RAG support embeddings/vector search now, or first ship transparent lexical search plus real PDF extraction? Owner: engineering/product. Impact: quality and complexity.
- [ ] Should skill activation allow multiple simultaneous skills or force one primary skill plus optional context skills? Owner: product. Impact: prompt predictability.
- [ ] Should Agent mode be allowed to apply edits automatically after trust is established, or always require diff approval? Owner: product. Impact: safety and speed.
