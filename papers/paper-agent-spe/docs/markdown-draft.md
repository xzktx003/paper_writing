# Paper Agent: A Local-First Human-in-the-Loop Agentic Workspace for Controllable Academic Writing

> Manuscript draft for Software: Practice and Experience (SPE).
> The authoritative submission source is `../main.tex`.
> Convert the LaTeX manuscript to Wiley's official SPE template before final
> submission if required by the journal portal.

## Abstract

Large language models (LLMs) are increasingly used to assist academic writing,
yet general-purpose chat interfaces disconnect model output from the scholarly
artifacts — LaTeX source, bibliographic databases, figures, compiler logs, and
reviewer feedback — that constitute a real manuscript. We present Paper Agent,
a local-first, human-in-the-loop software platform that treats each manuscript
as a filesystem-backed project and integrates AI assistance into a complete
document engineering workflow. The system combines a React/Vite frontend with a
Fastify/Node.js backend and provides permission-aware AI interaction modes
(Chat, Agent, Tools), typed workflow pipelines with human checkpoints, citation
verification against scholarly databases, LaTeX compilation, and Model Context
Protocol (MCP) interoperability. We describe the design rationale, architecture,
and implementation of Paper Agent, report on practical experience from
developing and using the system, and discuss lessons learned about building
controllable AI-assisted writing environments. The system demonstrates that
treating manuscript writing as a verifiable document engineering pipeline —
rather than an isolated text-generation task — enables researchers to retain
control over AI-generated edits while benefiting from language model assistance.

**Keywords:** academic writing, large language models, human-in-the-loop,
document engineering, LaTeX, software architecture

## 1. Introduction

Academic writing is a complex document engineering process. In disciplines that
use LaTeX, a manuscript is not merely a linear text document: it is a project
composed of source files, bibliographic databases, figures, style templates,
experimental code, compiler logs, reviewer feedback, and final PDF artifacts.
Researchers must coordinate editing, citation management, compilation, revision
tracking, and collaboration across these interconnected components.

The emergence of large language models has introduced new possibilities for AI-
assisted writing. However, general-purpose chat interfaces treat writing as an
isolated text-generation task. They separate model output from the project
context in which scholarly artifacts must be edited, cited, compiled, and
reviewed. This separation creates three practical problems:

1. **Context fragmentation.** Researchers must repeatedly copy manuscript
sections into the assistant, increasing friction and the risk of stale or
incomplete prompts.

2. **Unaudited edits.** When assistants can directly modify files, or when
changes are manually copied into a source tree, it becomes difficult to track
what was changed, by whom, and why.

3. **Unverifiable artifacts.** Generated text may introduce hallucinated
references, missing citation keys, or LaTeX changes that fail to compile.
These are document engineering failures that text-generation quality metrics
do not capture.

Existing solutions address parts of this problem — Overleaf provides
collaborative LaTeX editing, citation managers handle references, and AI chat
interfaces generate text — but no system integrates these capabilities into a
unified, controllable, local-first workspace designed for the full manuscript
lifecycle.

Paper Agent addresses this gap by treating academic writing as a software-
backed document engineering workflow. The system represents each paper as a
filesystem-backed project and provides an integrated workspace for editing,
preview, compilation, citation verification, AI assistance, human checkpoints,
and workflow orchestration. AI interaction is separated into three permission-
aware modes to give researchers fine-grained control over how and when model
output enters their manuscript.

This paper makes the following contributions:

- We describe the design and architecture of Paper Agent, a local-first
platform that integrates AI-assisted writing with project-level document
management, citation verification, and LaTeX compilation.

- We present a permission-aware interaction model (Chat, Agent, Tools) that
separates read-only discussion, reviewable edit proposals, and controlled
tool execution to reduce the risk of unintended manuscript changes.

- We report on the implementation of typed workflow pipelines with human
checkpoints, enabling auditable multi-stage writing processes that combine
AI generation, citation checking, and compilation.

- We share practical experience and lessons learned from building and using
the system, including design tradeoffs, testing strategies, and the
challenges of integrating LLMs into scholarly workflows.

## 2. Related Work

### 2.1 AI-Assisted Academic Writing

Recent advances in large language models have spurred interest in AI-assisted
scholarly writing. Systems such as ChatGPT, Claude, and similar chat interfaces
provide general-purpose text generation but lack project-level awareness of
manuscript structure, citation databases, and compilation requirements.
Specialized tools like Writefull and Paperpal offer language polishing and
grammar checking for academic text, but operate on individual passages rather
than complete manuscript projects.

Research on LLM-assisted writing has explored prompt engineering for academic
genres, fine-tuning for scientific domains, and evaluation of generated text
quality. Liang et al. surveyed the use of LLMs across the academic writing
pipeline, identifying tasks from ideation to revision. However, these studies
typically evaluate text quality in isolation rather than the end-to-end
workflow of producing compilable, verifiable scholarly documents.

### 2.2 Collaborative LaTeX Editing

Overleaf is the dominant cloud-based LaTeX editing platform, providing real-time
collaboration, version history, and integrated compilation. While Overleaf
recently introduced AI-assisted features, its architecture is cloud-centric:
manuscripts reside on remote servers, and AI integration is constrained by the
platform's service model. Local alternatives such as TeXstudio, VS Code with
LaTeX Workshop, and Emacs with AUCTeX provide powerful editing environments
but lack integrated AI assistance and workflow orchestration.

### 2.3 Agent-Based Writing Systems

The concept of AI agents — systems that can plan, use tools, and execute
multi-step tasks — has been applied to writing. Systems like AutoGen,
CrewAI, and LangGraph enable multi-agent writing workflows where different
agents handle planning, drafting, and reviewing. However, these systems
typically operate on plain text and lack integration with LaTeX project
structures, citation databases, and compilation pipelines. They also tend
to automate the writing process rather than augment it, reducing the
researcher's role to that of a reviewer of fully generated output.

### 2.4 Human-in-the-Loop AI Systems

Human-in-the-loop (HITL) approaches have been extensively studied in machine
learning, where human feedback guides model training and decision-making. In
the context of writing, HITL principles suggest that AI should propose rather
than impose changes, and that humans should retain decision authority at key
junctures. Systems like Grammarly and GitHub Copilot exemplify this approach
in specific domains (grammar checking and code generation, respectively), but
no existing system applies HITL principles systematically across the entire
academic writing workflow.

### 2.5 Software Tools for Research

Software: Practice and Experience has published numerous papers on research
software tools and platforms. Examples include scientific workflow systems,
reproducible research environments, and domain-specific development frameworks.
Paper Agent contributes to this tradition by providing a practical software
platform for AI-assisted scholarly writing, with emphasis on real-world design
decisions, implementation experience, and lessons learned from building a
system that bridges LLMs and document engineering.

## 3. System Design and Architecture

### 3.1 Design Goals

Paper Agent was designed to satisfy six key requirements:

**RG1: Local-first project model.** Manuscript content must reside on the
researcher's local filesystem as ordinary directories and files, compatible
with version control, external tools, and manual inspection. The system should
augment — not replace — existing file-based workflows.

**RG2: Permission-aware AI interaction.** AI assistance must be separated into
distinguishable modes with clear boundaries: read-only discussion, reviewable
edit proposals, and controlled tool execution. Users must be able to inspect
and approve every file change before it is applied.

**RG3: Verifiable artifact production.** The system must integrate citation
verification and LaTeX compilation so that generated manuscripts can be
checked for reference accuracy and build correctness, not just text fluency.

**RG4: Auditable workflow pipelines.** Multi-stage writing workflows (outline,
draft, review, revise, cite-check, compile) must be executable with human
checkpoints at decision points, producing a record of what was done and when.

**RG5: Interoperability.** The system must expose core capabilities (citation
verification, compilation, AI assistance) through standard protocols so that
external tools and agent clients can integrate with the platform.

**RG6: Privacy and configuration safety.** API keys and sensitive configuration
must be stored in local environment files, never exposed to the browser, and
masked in API responses.

### 3.2 Architecture Overview

Paper Agent follows a client-server architecture with a filesystem-backed
project model (Figure 1). The system comprises four main layers:

**Presentation layer** (React/Vite SPA). A three-panel browser interface
provides a project file tree, a multi-mode editor (source, split, rendered),
preview panes, an integrated terminal, and a right panel with AI chat, skills,
review, anti-AI detection, and pipeline controls.

**Application layer** (Fastify/Node.js). REST API endpoints serve project
management, file operations, AI conversation streaming, citation services,
compilation, pipeline orchestration, and MCP tool exposure.

**Service layer.** Backend services encapsulate AI provider integration
(OpenAI/Anthropic-compatible), citation verification (CrossRef, Semantic
Scholar, OpenAlex), LaTeX compilation engines, tmux terminal management, and
pipeline stage execution.

**Storage layer.** Manuscript projects are stored as directories under a
configurable `papers/` path. Each project contains source files and a
`project.json` metadata file. Configuration lives in a repository-root `.env`
file.

```
Figure 1: System Architecture

  Researcher ──► React/Vite Frontend ──► Fastify Backend
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
              papers/ (FS)              .env (Config)            External APIs
              ┌─ project-1/             - API keys               ┌─ LLM Provider
              │  ├─ main.tex            - provider               │  (OpenAI/Anthropic)
              │  ├─ references.bib      - model                  ├─ CrossRef
              │  ├─ fig/                                         ├─ Semantic Scholar
              │  └─ project.json                                 ├─ OpenAlex
              ├─ project-2/                                      └─ MinerU (optional)
              └─ ...
```

### 3.3 Key Design Decisions

**Filesystem as the source of truth.** We deliberately chose a filesystem-
backed project model over a database-backed one. This decision means that
projects are ordinary directories — they can be versioned with git, edited
with external tools, backed up, and shared without depending on Paper Agent.
The tradeoff is that the backend must handle concurrent filesystem access
and cannot rely on database transactions for consistency. We mitigate this
by using atomic file writes and validating file state before operations.

**Separation of AI permission modes.** Rather than a binary "AI on/off" toggle,
we designed three modes with escalating capabilities. Chat mode provides
read-only discussion and receives no file-writing tools. Agent mode can
propose edits but cannot apply them — changes are presented as inline diffs
for user approval. Tools mode can execute multi-step operations but is
constrained to the project's `code/` directory and requires explicit user
initiation. This design emerged from early experience showing that
researchers wanted to discuss ideas freely (Chat) before committing to
specific changes (Agent), and wanted tool capabilities available but
opt-in (Tools).

**Pipeline as typed stages with human gates.** Early versions of Paper Agent
used a linear pipeline model where stages executed sequentially. We found
that different stages require fundamentally different execution models: AI
stages need LLM context and streaming, compute stages need shell timeout
management, citation stages need API rate limiting, and compile stages need
error parsing. Pipeline 2.0 addresses this by defining typed stage executors
and making human checkpoints a first-class stage type. This design enables
the system to handle heterogeneous stages uniformly while providing
appropriate execution guarantees for each type.

**MCP as the interoperability boundary.** Rather than designing a custom API
for external integration, we adopted the Model Context Protocol (MCP) — an
open standard for tool-exposing servers. This decision means that Paper Agent
tools are immediately usable from any MCP-compatible client (Claude Desktop,
Cursor, Copilot) without additional integration work. The tradeoff is that
MCP's JSON-RPC 2.0 transport adds overhead compared to a native REST API,
but the interoperability benefit outweighs this cost for our use case.

## 4. Implementation

### 4.1 Technology Stack

Paper Agent is implemented as an npm monorepo under the `app/` directory:

- **Frontend:** React 18 with Vite bundling. CodeMirror 6 provides the source
editing surface. KaTeX renders mathematical notation in previews. PDF.js
displays compiled PDF output. The UI uses a custom theme system with light,
dark, and cyber-inspired variants.

- **Backend:** Fastify (Node.js) provides the HTTP server with built-in
validation, serialization, and plugin support. SSE (Server-Sent Events)
delivers streaming AI responses. The backend serves static frontend assets
in production mode.

- **Shared:** The `app/packages/shared/` workspace package holds TypeScript
type definitions and utility functions shared between frontend and backend.

- **Templates:** `app/templates/` contains LaTeX paper templates and metadata
used for new project creation.

### 4.2 Project Management and File Operations

The backend exposes REST endpoints for CRUD operations on paper projects.
Projects are identified by directory name under `papers/`, and metadata is
stored in a `project.json` file within each project directory. The project
listing endpoint includes auto-detection logic: when it encounters a directory
containing paper-like files (`.tex`, `.bib`, `.pdf`, `.sty`, `.cls`, `.md`)
without a `project.json`, it generates compatible metadata automatically. This
enables drag-and-drop import of existing LaTeX projects.

File operations (create, read, update, delete, upload, download, copy, move,
rename) are implemented through a service layer that validates paths against
the project root to prevent directory traversal. The file tree API returns the
complete directory structure, which the frontend renders as an interactive tree
with context menus supporting copy, cut, paste, rename, delete, and drag-and-
drop move operations. Folder download is implemented as server-side `.tar.gz`
streaming.

### 4.3 Multi-Mode Editor and Preview

The editor component supports three view modes built on CodeMirror 6:

- **Source mode:** Standard code editor with LaTeX syntax highlighting,
BibTeX citation autocomplete (typing `@` queries CrossRef), and real-time
collaboration-ready document model.

- **Split mode:** Source editor alongside a rendered preview panel. The
preview resolves project-relative image references (`![caption](fig/chart.png)`
and `\includegraphics{fig/chart}`) through the project blob API.

- **Rendered mode:** An editable preview surface where valid Markdown/LaTeX
blocks are compiled into rendered text, math, lists, and images. Edits to
rendered blocks are written back to the source file. Unparseable syntax
falls back to editable source display.

The preview layer implements a custom LaTeX subset renderer covering common
constructs: sections, abstracts, lists, quotes, verbatim, theorem/proof
environments, tables (tabular, tabularx, longtable, booktabs), math
environments, code listings, citations, and references. This design
compromise — supporting a subset rather than full LaTeX — was driven by the
observation that most manuscript editing involves these common constructs,
and attempting full LaTeX rendering in the browser would be prohibitively
complex.

### 4.4 AI Integration and Permission Modes

The AI service abstracts over provider-specific APIs (OpenAI chat completions,
Anthropic messages) behind a unified interface. Configuration is loaded from
the repository-root `.env` file, and the frontend settings panel writes changes
back through `/api/config`. API keys are never exposed to the browser; the
config endpoint returns key-present flags but masks actual values.

**Streaming.** AI responses are delivered via SSE (`POST /api/ai/stream`),
with events for tokens, tool use, tool results, completion, and errors. The
frontend renders tokens incrementally with a blinking cursor animation during
active generation. Automatic fallback to non-streaming mode ensures
compatibility when SSE connections fail.

**Context injection.** Before each AI call, the backend injects server-side
context based on the conversation's scope setting. The `chapter` scope reads
the full content of a selected project file. The `global` scope reads the
first 400 characters of each `.tex` file as a structural overview. All
non-free scopes inject `references.bib` content (up to 4000 characters).
This design ensures the model always sees relevant paper content without
requiring the user to manually copy-paste context.

**Permission modes.** Each conversation is assigned one of three modes:

- **Chat:** Receives system prompt and user messages only. No file-writing
tools, no code execution tools. Suitable for brainstorming, asking
questions about the manuscript, and discussing revisions.

- **Agent:** Receives tools for reading project files, searching citations,
and proposing edits. Proposed edits are returned as unified diffs with
original content, new content, patch, and line-change statistics. The
frontend renders these as color-coded inline diffs (green additions, red
deletions) with Accept/Reject buttons.

- **Tools:** Receives the full tool set including file read/write, shell
command execution, and multi-step operations. Tool execution is
constrained to the project's `code/` directory by default, and all tool
calls and results are displayed in the conversation for audit.

### 4.5 Pipeline Engine

Pipeline 2.0 defines a composable stage system with five typed executors:

- **AI stages:** Execute LLM-powered operations using registered skill
plugins (polishing, reviewing, drafting). Support streaming output and
retry with feedback.

- **Compute stages:** Execute shell commands with configurable timeouts.
Capture stdout, stderr, and exit codes. Used for running scripts, data
processing, and code execution.

- **Human stages:** Pause execution at a decision point. Display a prompt
and wait for user action: approve, reject with feedback, skip, or edit
the stage output before continuing.

- **Citation stages:** Run citation verification, deduplication, format
normalization, or discovery against scholarly databases. Support batch
processing with rate limiting.

- **Compile stages:** Execute LaTeX compilation using the selected engine
(pdflatex, xelatex, lualatex, latexmk, tectonic). Parse compiler output
for errors and warnings.

Five preset pipeline templates are provided: Writing Flow (Outline → Draft →
Polish → Review with human checkpoints), Paper Pipeline (Polish → Review →
Revise → Citation Check → Compile), Quick Review (Review → Revise), Citation
Pipeline (Verify → Deduplicate → Discover), and Executable Paper (Run Code →
Generate Figures → Compile). Pipelines support pause/resume, stage retry with
feedback, stage skipping, and abort with signal propagation.

Pipeline state is persisted to `~/.paper-writer/pipelines/`, enabling
recovery after server restart. This design choice — filesystem persistence
over a database — maintains consistency with the overall local-first
philosophy.

### 4.6 Citation Verification

The citation service implements a multi-strategy verification approach:

1. **DOI-based verification.** Each BibTeX entry with a DOI is checked
against CrossRef and Semantic Scholar APIs simultaneously. If both
confirm the metadata, the entry receives high confidence.

2. **Title-based fuzzy matching.** Entries without DOIs are searched by
title against CrossRef and OpenAlex. Fuzzy matching handles minor
title variations (punctuation, casing, whitespace).

3. **Local cross-checking.** The service extracts `\cite{}` commands from
`.tex` files and cross-references them against `.bib` entries to detect
missing citations (cited but not in bibliography) and uncited entries
(in bibliography but not cited).

4. **Hallucination screening.** Citations that cannot be verified against
any database are flagged as potentially hallucinated, with the
confidence level and verification sources recorded for user review.

The verification pipeline respects API rate limits through exponential backoff
and concurrent request throttling. Results are cached in memory for the
session duration to avoid redundant API calls during iterative editing.

### 4.7 Model Context Protocol Integration

Paper Agent implements the MCP specification as a JSON-RPC 2.0 server at
`POST /api/mcp`, with SSE transport for streaming tool results. Seven tools
are registered: paper search, citation verification, citation cross-checking,
LaTeX compilation, project file reading, AI polishing, and AI review.

The MCP service discovery endpoint (`GET /api/mcp/info`) returns tool schemas
and configuration examples for Claude Desktop (SSE transport) and Cursor
(HTTP POST transport). This design enables external agent clients to use
Paper Agent as a writing infrastructure service — for example, a Claude
Desktop session can verify citations in a Paper Agent project, compile the
manuscript, and review the output without leaving its native interface.

### 4.8 Testing and Quality Assurance

The repository includes automated tests covering project routes, project
service behavior, file management, configuration privacy, conversations,
compile services, pipeline stage types and executors, citation pipeline
behavior, preview asset handling, terminal sessions, rendered editing, and
frontend project-tree logic. At the time of writing, the test suite contains
31 test files with 217 tests, executed via Vitest. The frontend production
build (`npm run build`) serves as an integration smoke test.

Tests are organized by concern rather than by layer: `tests/projectRoutes.test.mjs`
tests project CRUD endpoints through the HTTP layer, while
`tests/generatePaperProjectJson.test.mjs` tests the auto-detection logic at
the service level. This organization supports targeted regression testing
when specific subsystems are modified.

## 5. Evaluation and Experience

### 5.1 Functional Verification

We verified the system through a combination of automated tests and manual
workflow exercises. The full test suite (217 tests across 31 files) passes
on Node.js v24.14.0. The frontend production build completes successfully,
though Vite reports a large chunk warning for the editor page (a known
consequence of bundling CodeMirror 6 with multiple language extensions).

Key functional scenarios validated manually:

- **Project import:** Copying a LaTeX project directory into `papers/`
correctly triggers automatic `project.json` generation and the project
appears in the dashboard.

- **Controlled AI revision:** Agent-mode conversation on a manuscript section
produces an inline diff; accepting the edit applies the change to the file;
rejecting preserves the original.

- **Citation-Compile pipeline:** A pipeline with citation verification
followed by compilation completes successfully; citation issues and compile
errors are surfaced as stage failures with actionable messages.

- **MCP interoperability:** External MCP clients can discover tools, verify
citations, and compile manuscripts through the MCP endpoint.

### 5.2 Design Tradeoffs in Practice

Several design decisions proved their value during development and testing:

**Filesystem-backed projects.** The decision to use ordinary directories for
project storage simplified debugging (files are inspectable with any tool),
enabled git-based version control of manuscripts, and allowed Paper Agent to
coexist with external LaTeX editors. The main cost — lack of transactional
guarantees — has not manifested as a practical problem because manuscript
editing is inherently sequential (one user edits one file at a time).

**Permission mode separation.** The three-mode AI interaction model was
initially met with skepticism from users who wanted a single unified
interface. However, in practice, the separation proved valuable: users
reported feeling more comfortable experimenting with AI suggestions in Chat
mode, knowing that no files could be modified, and appreciated the inline
diff review in Agent mode as a safety net. Tools mode usage remained
low — as intended, since it is designed for occasional multi-step operations
rather than routine writing.

**Pipeline human checkpoints.** The human checkpoint stage type emerged as the
most-used pipeline feature. Users consistently chose to review AI-generated
output before proceeding to the next stage, even when the pipeline allowed
automatic progression. This validates the HITL design philosophy and suggests
that future systems should make human review gates the default, not an option.

### 5.3 Challenges Encountered

**LaTeX preview fidelity.** Rendering LaTeX in the browser proved more complex
than anticipated. Full LaTeX rendering would require essentially reimplementing
a TeX engine, so we opted for a curated subset supporting the most common
manuscript constructs. Users occasionally encounter unsupported environments
(complex custom macros, tikz figures), which fall back to source display. We
address this through clear visual indicators distinguishing rendered from
fallback content.

**API rate limiting for citation verification.** Batch citation verification
against CrossRef, Semantic Scholar, and OpenAlex requires careful rate
limiting to avoid HTTP 429 responses. We implemented exponential backoff with
jitter, but the verification of large bibliographies (100+ entries) can still
take several minutes. Future work will explore local caching and bulk API
endpoints.

**LLM output variability.** The quality of AI-generated text varies
significantly across provider, model version, and even between identical
prompts due to sampling. This makes it difficult to write deterministic
pipeline tests for AI stages. We address this by testing the pipeline
infrastructure (stage transitions, error handling, persistence) separately
from AI output quality, and relying on human checkpoints for quality
assessment.

**Dependency management.** The npm ecosystem introduces a large transitive
dependency tree. During submission hardening, dependency triage removed unused
PDF.js packages, upgraded Fastify and Vite dependency chains, and brought the
current workspace to `npm audit` reporting zero vulnerabilities. Maintaining
that status remains an ongoing operational cost because the frontend and
backend both depend on rapidly changing JavaScript packages.

## 6. Discussion and Lessons Learned

### 6.1 Treating Writing as Document Engineering

The central insight from building Paper Agent is that AI-assisted academic
writing benefits from being treated as a document engineering problem rather
than a text generation problem. When the system understands manuscript
structure (chapters, sections, figures, citations, compilation), it can
provide context-aware assistance that general-purpose chat interfaces cannot.
For example, the backend can automatically inject the current chapter content
and bibliography into the AI context, verify that generated citations exist
in the `.bib` file, and confirm that edits do not break compilation — checks
that require project-level awareness.

### 6.2 The Value of Permission Boundaries

Separating AI interaction into Chat, Agent, and Tools modes created clear
mental models for users. Chat mode became the "safe space" for brainstorming;
Agent mode became the "proposal desk" for specific changes; Tools mode became
the "workshop" for multi-step operations. This separation reduced anxiety
about unintended modifications and encouraged more exploratory use of AI
assistance. The inline diff review in Agent mode was particularly effective:
users reported that seeing exactly which lines would change — and being able
to accept or reject each proposal — gave them confidence to use AI more
frequently.

### 6.3 Pipelines as Process Documentation

The pipeline engine produced an unexpected benefit: executed pipelines serve
as process documentation. A completed Writing Flow pipeline records which AI
stages were run, what human feedback was provided, which citations were
verified, and whether compilation succeeded. This audit trail is valuable for
understanding how a manuscript evolved, for onboarding new collaborators, and
for research on writing workflows. Future versions could formalize this as an
explicit provenance feature.

### 6.4 Local-First as a Practical Advantage

The local-first architecture provided tangible benefits beyond the
philosophical appeal of data ownership. Manuscripts remain ordinary directories
that can be backed up, versioned, and shared without depending on Paper Agent.
Configuration in `.env` files means that different projects can use different
LLM providers without changing application code. The ability to use external
tools (git diff, grep, shell scripts) alongside Paper Agent reduced the
pressure to implement every conceivable feature within the application.

### 6.5 MCP as an Enabling Standard

Adopting the Model Context Protocol for external interoperability was a
low-cost decision with high payoff. Implementing MCP required approximately
200 lines of server code, and it immediately made Paper Agent tools available
to any MCP-compatible client. This suggests that emerging AI interoperability
standards can significantly reduce integration costs for research software
platforms.

## 7. Limitations and Future Work

Paper Agent has several limitations that suggest directions for future work:

**LaTeX coverage.** The preview renderer supports a curated subset of LaTeX
constructs. Full LaTeX rendering would require integrating a complete TeX
engine (e.g., via WebAssembly) or deferring to server-side compilation for
preview. We plan to explore both approaches.

**Citation database coverage.** Citation verification depends on CrossRef,
Semantic Scholar, and OpenAlex. These databases have gaps in coverage,
particularly for non-English publications, preprints, and gray literature.
Integrating additional sources (e.g., DBLP for computer science, PubMed for
biomedical) would improve verification coverage.

**User studies.** We have not conducted formal user studies comparing Paper
Agent against alternative writing workflows. Controlled experiments measuring
writing speed, citation accuracy, compilation success rate, and user
satisfaction would provide evidence for the design claims made in this paper.

**Collaboration support.** The current system is designed for single-user
workflows. Real-time collaboration (similar to Overleaf) would require
operational transforms or CRDT-based synchronization, which introduces
significant complexity.

**Scalability.** The filesystem-backed project model works well for individual
manuscripts but would need enhancement for institutional deployment with
hundreds of projects and users. A hybrid model with filesystem storage and
a metadata index could address this.

**Compile error repair.** When LaTeX compilation fails, the system currently
reports errors but does not attempt automatic repair. LLM-based error
diagnosis and fix suggestion is a promising direction that aligns with the
document engineering philosophy.

## 8. Conclusion

We have presented Paper Agent, a local-first, human-in-the-loop software
platform for AI-assisted academic writing. The system treats manuscript
writing as a document engineering workflow — integrating editing, preview,
citation verification, LaTeX compilation, and AI assistance into a unified,
filesystem-backed workspace. Its permission-aware interaction model, typed
pipeline engine with human checkpoints, and MCP interoperability distinguish
it from general-purpose AI chat interfaces and existing writing tools.

Our experience building and using Paper Agent suggests three broader lessons
for software tools in academic writing. First, project-level awareness of
manuscript structure enables capabilities that text-level tools cannot provide.
Second, explicit permission boundaries increase user trust and encourage more
exploratory use of AI assistance. Third, local-first architectures provide
practical advantages in terms of tool compatibility, data ownership, and
configuration flexibility.

Paper Agent is available as open-source software under the MIT license. The
source code, documentation, and a demonstration project are accessible at
the project repository.

## Data Availability

The software repository includes a minimal redistributable demonstration paper
project under `examples/demo-paper/`. No private manuscript data or user data
is included. The source code is available at
[https://github.com/xzktx003/paper_wrighting](https://github.com/xzktx003/paper_wrighting).

## Acknowledgements

The authors thank the maintainers of the open-source tools and scholarly
infrastructure used by Paper Agent, including Node.js, React, Vite, Fastify,
CodeMirror, KaTeX, PDF.js, TeX, CrossRef, Semantic Scholar, OpenAlex, and
the Model Context Protocol communities.

## References

See `../references.bib` for the complete bibliography.
