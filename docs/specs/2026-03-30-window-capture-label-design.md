# Window Capture Label Parsing Design

## Problem statement

The current window-capture flow only preserves the browser-provided capture
label and stores it directly as `displayName`. This makes captured VS Code
windows visible in the UI, but the raw label can be difficult to read and is
not structured into a human-friendly window title and app name.

The real problem is not window control. It is that window-capture sessions are
hard to read in the UI because the only fact currently preserved is an
unstructured browser label.

## Chosen approach

Persist the raw browser capture label as source data for window-capture
sessions, but keep parsing in the frontend as a best-effort presentation
enhancement.

Specifically:

- Add an optional `windowCaptureMeta.rawLabel` field to the shared
  `AgentSessionRecord` contract.
- In v1, keep `displayName` equal to the raw browser label for
  `local-window-capture` sessions.
- Derive `parsedWindowTitle`, `parsedAppName`, and parse confidence in the
  frontend only.
- Show parsed values only in window-capture-specific UI, while also exposing
  the raw label in a capture-specific metadata block inside the focus view.

## Rationale

- The browser `track.label` is the only reliable fact currently available in
  the existing flow.
- E2E tests already prove that label format is unconstrained, so parsing must
  be defensive and optional.
- `displayName` is used broadly across the product. Reinterpreting it as a
  parsed field would create unnecessary global blast radius.
- This approach keeps the fact layer stable and limits new behavior to
  window-capture UI only.

## Scope

- Persist raw capture label for `local-window-capture` sessions.
- Add frontend-only parsing for title/app-name extraction.
- Improve readability in capture cards and focus view.
- Add raw-label diagnostics in a capture-specific focus-view metadata block.
- Add tests for raw-label persistence and conservative parsing behavior.

## Non-goals

- Using parsed title/app-name for window focus or matching logic.
- Making parsing authoritative on the backend.
- Changing display rules for non-window-capture sessions.
- Designing a cross-platform native window-control subsystem.

## Technical design

### 1. Data model

Extend the shared session model with an optional nested capture metadata object
instead of adding more source-specific top-level fields.

Proposed shape:

```ts
interface WindowCaptureMeta {
  rawLabel: string;
}

interface CreateWindowCaptureSessionInput {
  suggestedDisplayName?: string;
  windowCaptureMeta?: WindowCaptureMeta;
}

interface RegisterAgentSessionInput {
  // existing fields
  windowCaptureMeta?: WindowCaptureMeta;
}

interface AgentSessionRecord {
  // existing fields
  windowCaptureMeta?: WindowCaptureMeta;
}
```

Reasoning:

- Keeps source-specific data scoped to capture sessions.
- Leaves room for future capture-only metadata without polluting the generic
  session record.
- Avoids redefining `displayName` semantics for the rest of the app.
- Makes the required persistence path explicit across create input, registry
  registration, and list/snapshot serialization.
- In v1, the public create-session path is the only producer of
  `windowCaptureMeta` for window-capture sessions; the register contract is
  extended only so internal registry writes and shared DTOs remain aligned.

### 2. Session creation flow

The frontend already receives `track.label` from the browser capture track.
That value should continue to be collected at capture time, but should be sent
to the backend as explicit raw metadata instead of only as an implied display
name.

Creation behavior:

- Browser returns `track.label`.
- Frontend sends both:
  - `suggestedDisplayName`, which remains equal to the raw label in v1
  - the raw capture label inside capture metadata
- Backend stores `windowCaptureMeta.rawLabel` when present.
- Backend sets `displayName` to the raw label in v1 so existing UI, sorting,
  and current focus-window fallback behavior continue to work.
- If older clients do not send `windowCaptureMeta`, the server must still
  accept the request and fall back to `suggestedDisplayName` as the effective
  raw label.
- Empty string or whitespace-only `windowCaptureMeta.rawLabel` should be treated
  as missing and fall back to `suggestedDisplayName`.
- When that fallback happens for a newly created `local-window-capture`
  session, the server should also persist the normalized fallback value into
  `windowCaptureMeta.rawLabel` so later list/detail rendering has a consistent
  factual source.

This keeps the current experience stable while separating fact from derived UI.

### 3. Parsing strategy

Parsing remains frontend-only and best-effort.

Derived fields:

- `parsedWindowTitle?: string`
- `parsedAppName?: string`
- `parseConfidence: 'high' | 'low'`

Confidence contract:

- Only `high` confidence may expose `parsedWindowTitle` and `parsedAppName`.
- `low` confidence means both parsed fields must be treated as absent and the
  UI must fall back to the raw label.

Rules:

- Always preserve and display the raw label as the factual source.
- Only split when the right-hand suffix matches a known application name.
- Only split on the last recognized separator.
- Supported separators in v1:
  - ` - `
  - ` — `
  - ` – `
- Supported app-name suffixes in v1 should be intentionally short and focused:
  - `Visual Studio Code`
  - `Code`
- If no safe parse is possible, return low confidence and keep using the raw
  label.

This parser is intentionally conservative: no parse is better than a wrong
parse.

### 4. UI behavior

Only window-capture-specific views should use parsed presentation.

Grid card and focus view:

- Primary text should prefer `parsedWindowTitle` when confidence is high.
- Secondary text should show `parsedAppName` when available.
- If parsing fails, fall back to the raw label.

Capture-specific metadata block in focus view:

- Show the raw label explicitly.
- Show parsed app name and parsed title when available.
- If parsing confidence is low, the raw label remains the primary diagnostic
  value.

Explicit v1 surfaces:

- Apply parsed presentation to grid cards.
- Apply parsed presentation to the focus-view main header.
- Apply parsed presentation to focus-view sidebar cards.
- Add the raw-label diagnostics block only inside the focus view.
- Do not change the global focus bar, side drawer, or non-capture session
  displays in v1.

Non-window-capture sessions:

- No display changes.

### 5. Backward compatibility

- Existing sessions without `windowCaptureMeta` should continue to work.
- Frontend should fall back to `displayName` as the raw label when
  `windowCaptureMeta.rawLabel` is absent.
- Older create-session payloads without `windowCaptureMeta` must remain
  accepted in v1.
- The parser should be written so that older stored sessions still render
  correctly without migration.

### 6. Test strategy

Unit tests:

- Parser returns title/app name only for recognized suffix patterns.
- Parser falls back safely for unknown labels.
- Parser handles all supported separators.

Server tests:

- Window-capture session creation stores `windowCaptureMeta.rawLabel`.
- Older payloads without raw metadata remain accepted and still create a
  usable session.
- Create -> list roundtrip preserves `windowCaptureMeta.rawLabel`.
- The create-session path normalizes fallback raw labels into
  `windowCaptureMeta.rawLabel` when only `suggestedDisplayName` is provided.

Frontend/E2E tests:

- Capture card shows parsed title when label format is recognized.
- Focus view metadata block shows raw label.
- Unknown label formats still render safely using fallback text.

## Open questions

- Whether the detail view should show parse confidence explicitly in v1, or
  keep confidence internal to rendering logic.
- Whether real-world browser label samples from macOS Chrome, Windows Chrome,
  and Edge should be collected before expanding the known-suffix list beyond
  VS Code.