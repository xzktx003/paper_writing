---
name: OpenPrism Paper Writing Workbench
description: Safe, reviewable writing steps for existing paper files and plain-language goals.
colors:
  bg: "#f8f9fc"
  paper: "#ffffff"
  panel: "rgba(255, 255, 255, 0.95)"
  panel-muted: "rgba(248, 249, 252, 0.95)"
  text: "#1a1d23"
  text-secondary: "#5f6b7a"
  muted: "#8492a6"
  accent: "#4f6ef7"
  accent-strong: "#3b5bdb"
  accent-soft: "rgba(79, 110, 247, 0.12)"
  border: "rgba(0, 0, 0, 0.08)"
  success: "#10b981"
  danger: "#ef4444"
typography:
  title:
    fontSize: "17px"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  section:
    fontSize: "12px"
    fontWeight: 720
  body:
    fontSize: "12px"
    lineHeight: 1.55
  label:
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1.55
  caption:
    fontSize: "10px"
    lineHeight: 1.5
rounded:
  control: "9px"
  field: "10px"
  band: "11px"
  pill: "999px"
spacing:
  panel-padding: "16px"
  panel-gap: "18px"
  section-gap: "9px"
  control-gap: "8px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  button-secondary:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
  badge:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.pill}"
    height: "22px"
---

# Design System: OpenPrism Paper Writing Workbench

## Overview

**Creative North Star: "A reviewable writing console."**

The shipped writing workbench turns an existing paper file plus a plain-language goal into one safe, inspectable writing step. The product thesis is narrow: help the user state the goal, see routing, readiness, evidence, and Skill selection, then carry a draft prompt into AI chat without silently changing manuscript files.

This document describes the implementation shipped in `app/apps/frontend/src/app/components/WritingWorkbenchPanel.tsx`, integrated through `RightPanel.tsx` in the official `/projects -> /editor/:projectId` workflow. Reviewed visual evidence: `.impeccable/review/desktop.png`, `.impeccable/review/mobile.png`, and `.impeccable/review/panel.png`.

**Key Characteristics:**

- Compact operational right-rail assistant, not a landing page or standalone writing product.
- Existing OpenPrism light UI: white panels, pale gray bands, restrained blue actions, green readiness/safety signals, red blocking states.
- Human review boundary is visible before output: the panel says suggestions do not overwrite files and Agent edits still require Diff acceptance.
- Evidence language stays bounded: readiness and evidence states describe what is available or missing; they must not imply official scores, verified productivity gains, or complete source coverage.

## Colors

The palette is light, quiet, and functional. Blue marks primary actions and routing, green marks safe/readiness states, red marks blockers, and neutral gray carries most text and structure.

### Primary

- **Operational Blue** (`#4f6ef7`): primary action buttons, active right-panel tab underline, focus border, routing badges.
- **Strong Operational Blue** (`#3b5bdb`): emphasized action text, active labels, scores, linked current file names.
- **Soft Operational Blue** (`rgba(79, 110, 247, 0.12)`): secondary buttons, badges, and low-pressure selected context chips.

### Status

- **Review Green** (`#10b981`): safety dot, workflow ready segments, and positive readiness affordances.
- **Blocking Red** (`#ef4444`): error callouts and blocking workflow segments.

### Neutral

- **App Background** (`#f8f9fc`): shell background and mobile lower canvas.
- **Paper Surface** (`#ffffff`): text fields, starter cards, and crisp input surfaces.
- **Panel Surface** (`rgba(255, 255, 255, 0.95)`): right rail container.
- **Muted Panel Surface** (`rgba(248, 249, 252, 0.95)`): readiness bands, evidence cards, and tab bars.
- **Primary Text** (`#1a1d23`): section titles and important values.
- **Secondary Text** (`#5f6b7a`) and **Muted Text** (`#8492a6`): guidance, explanations, snippets, and secondary metadata.
- **Hairline Border** (`rgba(0, 0, 0, 0.08)`): field borders, card borders, dividers, and tab separators.

## Typography

The workbench uses the existing app font stack through `font: inherit`. It relies on small, dense type because the right rail must coexist with file tree, source editor, and preview.

### Hierarchy

- **Panel Title** (`17px`, `750`, tight): only for `论文写作助手`.
- **Section Title** (`12px`, `720`): compact labels such as `常用论文任务`, `推荐 Skill`, and `证据状态`.
- **Body / Input** (`12px`, `1.55`): task textarea, prompt text, and main button labels.
- **Label / Hint** (`11px`, `650` or regular): field labels, safety text, helper copy, and secondary buttons.
- **Dense Metadata** (`10px`, `1.5`): card descriptions, evidence snippets, routing reasons, progress summaries.

### Named Rules

**The Right-Rail Scale Rule.** Do not use hero-scale type inside this surface. The panel competes for attention with the manuscript, so hierarchy comes from order, spacing, bands, and status color.

## Layout

The first desktop viewport is a three-pane editor: left project files, center source/preview split, and the AI assistant in the right rail with the `Writing` tab active. The primary `分析写作任务` action must be visible before scrolling.

The right rail follows a single-column operational stack:

1. Panel title and one-sentence purpose.
2. Safety boundary.
3. Goal textarea, optional evidence query, primary analyze action, and current-file polish shortcut.
4. Horizontal common-task starters.
5. Readiness band with score.
6. Mode/routing badge and seven-step workflow strip.
7. Recommended Skill.
8. Evidence state and next actions.
9. Draft handoff to AI chat.
10. Collapsed AI draft review.

On mobile, the app shell becomes tabbed (`文件`, `编辑器`, `AI 助手`) and the writing panel takes the viewport. Actions stack vertically at `max-width: 520px`. The common-task row remains horizontally scrollable; this preserves density but currently weakens discoverability.

## Elevation & Depth

Depth is mostly tonal. The workbench uses muted surface bands, borders, and soft focus shadows rather than raised cards. The only notable shadow in this surface is the field focus glow (`0 2px 10px var(--accent-soft)`) and the app's floating terminal control, which overlays content in the reviewed screenshots.

### Named Rules

**The Flat Operational Rule.** Default surfaces stay flat. Use background tone and border to separate cards; reserve motion and shadow for focus, hover, or unavoidable floating controls.

## Shapes

The form language is soft but restrained. Controls and list items use 9-11px radius, chips and workflow bars use full pills, and cards stay compact with light borders. Avoid large decorative containers and nested card stacks in the right rail.

- **Controls:** 9px radius.
- **Inputs:** 10px radius, white fill, 1px hairline border.
- **Status bands:** 10-11px radius, muted panel fill.
- **Badges and workflow bars:** 999px radius.

## Components

### Writing Workbench Panel

The panel is the design anchor for paper-writing assistance. It uses a 16px inset, 18px vertical gap, and compact single-column sections. On mobile the inset reduces to 13px.

### Safety Notice

- **Purpose:** state the non-overwrite and human-review boundary before the user enters a task.
- **Style:** pale green surface using `color-mix(in srgb, var(--success) 8%, var(--panel))`, 10px radius, 11px text, green status dot.
- **Required wording boundary:** say AI generates suggestions only; file changes require human Diff acceptance.

### Task Form

- **Goal field:** multiline textarea for the user's plain-language writing goal.
- **Evidence query:** optional single-line field for local literature retrieval keywords.
- **Current file:** shown as a right-aligned, ellipsized blue file label.
- **Primary action:** full-width blue `分析写作任务`, disabled until the task is non-empty or while loading.
- **Current-file polish:** secondary blue-soft action. The generated polish task must preserve formulas, citation keys, numbers, and LaTeX commands and request reviewable suggestions or diff.

### Common Task Starters

- **Style:** horizontal row of compact bordered cards with 150px minimum width.
- **Content:** short Chinese task title plus a two-line helper description.
- **State:** disabled starters keep their card shape with lower opacity and a title explaining why.
- **Known issue:** horizontal overflow is functional but not sufficiently discoverable in desktop and mobile screenshots.

### Readiness Band

- **Style:** two-column grid with readiness label on the left and tabular score on the right.
- **Boundary:** the readiness score is a preparation hint only. It must not be presented as an official score, guaranteed quality metric, productivity claim, or publication readiness guarantee.

### Routing And Workflow

- **Mode badge:** shows the chosen Chat/Agent/Tools route in a blue-soft pill.
- **Reason text:** explains the current route in plain language.
- **Workflow strip:** seven equal segments; green means ready/complete, red means blocking, neutral means pending.
- **Behavioral boundary:** Chat explains, Agent proposes manuscript edits, and Tools is reserved for execution-heavy work. Edit-producing actions require file/project context and review.

### Recommended Skill

- **Style:** muted card list with bold Skill title and small input/output summary.
- **Hierarchy:** show one primary recommendation first; do not force users to understand internal Skill slugs before acting.
- **Boundary:** Skill text describes fit, input, output, and risks. It must not imply hidden automatic execution.

### Evidence State

- **Style:** badge plus evidence count and bounded evidence snippets.
- **Boundary:** say `普通写作` or equivalent when evidence is not required. Only claim evidence support when actual evidence items are present. Do not imply a PDF was searched if only metadata exists.

### Draft Handoff

- **Primary command:** `带到 AI 对话`.
- **Behavior:** fills the chat prompt, switches to the recommended mode, creates or prepares the conversation, and preserves user review before send. It does not send automatically.
- **Disabled state:** use backend send-gate labels when required context is missing.

### AI Draft Review

- **Style:** collapsed native `details` section below a divider.
- **Purpose:** user can paste AI output and run an evidence-bound review for source numbering, evidence overreach, context gaps, and human-confirmation requirements.

## Do's and Don'ts

### Do:

- **Do** keep the official entry path as `/projects -> /editor/:projectId`; the writing assistant belongs in the right rail of the editor.
- **Do** make `分析写作任务` visible in the first viewport on desktop and mobile.
- **Do** show safety, routing, readiness, Skill, evidence, and draft handoff as separate scan targets.
- **Do** keep copy concrete and Chinese-first, with English academic terms only where useful (`Related Work`, `Skill`, `Diff`, `RAG`).
- **Do** describe AI output as suggestions, prompts, or reviewable diffs until the user explicitly accepts a change.
- **Do** label missing evidence, blocked workflow steps, parser gaps, and unavailable context as visible states.

### Don't:

- **Don't** overwrite paper files, apply Agent edits, or imply automatic manuscript modification from this panel.
- **Don't** claim productivity gains, official readiness, complete evidence coverage, or publication quality without measured evidence.
- **Don't** turn the panel into a marketing surface, hero layout, or decorative card stack.
- **Don't** hide the Chat/Agent/Tools boundary behind internal implementation details.
- **Don't** let horizontal-only content be the sole path to important tasks; the current starter row needs a clearer affordance.
- **Don't** allow floating terminal controls to obscure readiness, Skill, evidence, or action cards; screenshots show overlap that should be resolved in a follow-up pass.
