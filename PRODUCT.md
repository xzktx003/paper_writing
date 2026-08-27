# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Primary: research operations, technical management, project application, and knowledge-work staff who turn many source documents into a defensible long-form office deliverable.
- Secondary: reviewers, managers, and compliance owners who need to verify claims, evidence, revisions, permissions, and delivery readiness without reconstructing the author's process.
- The branch-specific audience and jobs are inferred from the user's explicit request to adapt the repository for office-track copywriting and from the supplied competition rules.

## Product Purpose

OpenPrism Office is a local-first, human-controlled workspace for producing high-evidence office materials. It takes a user from brief and source collection through AI-assisted drafting, claim and data review, revision, approval, final rendering, and a reusable delivery package.

Success means that a user can complete a real office-writing task faster while preserving evidence traceability, factual boundaries, human sign-off, and a reproducible record of the measured improvement. The product must never invent effect data merely to make a submission look stronger.

## Positioning

The product is not a generic chat box or a one-click text generator. Its distinct mechanism is an evidence-bound writing pipeline: every important claim can be linked to a source, unsafe or unsupported output is blocked from silent adoption, revisions remain reviewable, and the same project records the baseline, actual effort, quality outcomes, reusable assets, and delivery evidence.

## Operating Context

- Typical materials: project proposals, technical reports, research summaries, review briefs, implementation plans, technical disclosures, and competition submission packages.
- Typical source inputs: DOCX, PPTX, XLSX, Markdown, LaTeX, PDF, images, tables exported as text/CSV, notes, meeting transcripts, citations, and project files.
- Typical workflow: collect project-relative materials in the Inbox; extract locally; retrieve and map claim evidence; draft with task-specific Skills; review paragraph suggestions and provenance; record a human approval; render or export the final artifact; measure the complete before/after effort; export the delivery and evidence package.
- Deployment is browser-based and must remain usable on a LAN. External models, scholarly databases, OCR, image generation, and tunnels are opt-in integrations whose data boundaries must be visible.

## Capabilities and Constraints

- Preserve the current React/Fastify application, managed-project filesystem, local-first storage, authenticated APIs, Provider registry, Skills, evidence retrieval, diff approval, review, Pipeline, compile, and export foundations.
- Provide one six-stage office ledger—Inbox, Produce, Review, Approve, Deliver, Measure—alongside the existing brief, rule audit, reusable-asset, and submission-export records.
- Keep Chat read-only by default. Any file modification or adoption requires a visible diff or explicit human confirmation.
- The office Inbox includes built-in local OOXML text/structure extraction for DOCX, PPTX, and XLSX. PDF extraction and scanned-document OCR remain dependent on an explicitly configured adapter; unavailable tools must stay visible as unavailable.
- Office evidence search combines real BM25, a deterministic hashed token/character-ngram vector cosine score, and an explainable reranker. It is a local semantic-like retrieval signal, not a learned embedding model or a claim of neural understanding.
- Optional OfficeCLI execution is enabled only through an absolute `OFFICECLI_PATH`; supported upstream operations are dump/inspect, create, batch edit, template merge, render, and validate. The application provides local extracted-text diff because OfficeCLI has no diff command.
- Workflow recipes preserve review and human-approval gates. Local, webhook, Feishu, and email connectors are declarations with readiness checks; external connectors are not claimed as operational when credentials or execution adapters are absent.
- Meeting intake accepts supplied transcript text and timestamps, preserves supplied speaker labels, and extracts candidate decisions/actions. It does not perform transcription or speaker diarization.
- Every quantitative improvement claim must include baseline, after value, unit, sample size, measurement period, calculation, and whether review, retry, configuration, and maintenance time were included.
- Competition readiness is an auditable product surface, not a promise of qualification or award.

## Brand Commitments

- Working branch name: **OpenPrism Office**.
- Chinese descriptor: **可核验的 AI 办公材料工作台**.
- Voice: precise, calm, evidence-led, operational, and explicit about unknowns.
- Preserve the OpenPrism configuration namespace and the existing favicon until the user supplies a replacement identity asset.
- Avoid claims such as "zero errors", "fully automatic", "guaranteed high score", or fabricated productivity percentages.

## Evidence on Hand

- Working source for managed projects, AI modes, Skills, evidence retrieval, citation checks, review, Pipeline, compilation, and local security boundaries.
- Automated verification commands and a broad unit/integration/Chromium suite.
- Backend workbench APIs and tests for context preparation, answer review, single-claim review, and non-writing adoption packages.
- Competition rule source: the user-supplied external file `AI材料审核与评分规则.md`, audited on 2026-08-27. Its machine-specific absolute path is intentionally not persisted in the repository.
- No verified multi-user office pilot, measured productivity baseline, long-term usage record, customer testimonial, or award result is currently on hand. Future UI and submission copy must label demonstration data as sample data until real evidence replaces it.

## Product Principles

1. Evidence before eloquence: polished language never outranks source support.
2. Human authority is visible: AI proposes, reviewers decide, and adoption is auditable.
3. Measure the whole workflow: configuration, review, retries, and maintenance count as work.
4. One task, one deliverable trail: brief, sources, drafts, decisions, output, metrics, and reusable assets stay connected.
5. Honest readiness: missing, inferred, contradicted, and verified states are never collapsed into a generic success badge.

## Accessibility & Inclusion

- Maintain keyboard-operable controls, semantic headings and labels, visible focus, status announcements, reduced-motion support, and responsive desktop/tablet/phone layouts.
- Chinese and English interfaces must remain structurally equivalent; the office-track submission and default templates prioritize clear Simplified Chinese while retaining English keys.
