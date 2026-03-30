# VS Code Window Observe Design

## Problem statement

The real problem is not “read GitHub Copilot UI internals.” The real problem is
that the current board loses visibility when work moves from terminal or tmux
into the VS Code window, especially the Copilot chat surface. Users need to
observe one or more active local VS Code windows from the board, keep them as
first-class sessions, and quickly return to VS Code for direct interaction when
needed.

The first version must work with multiple open VS Code windows on the same
machine. It must not depend on unsupported access to Copilot internals or on a
native helper process.

## Chosen approach

Use browser-native window capture to observe local VS Code windows, one window
selection at a time, and model each captured window as an observe-only
`agentSession`.

### Rationale

- It matches the existing architecture, which already models observe-only
  sessions and live session snapshots.
- It avoids unsupported attempts to inspect Copilot webview or chat internals.
- It keeps media handling local to the current browser tab, so the backend only
  manages session metadata and state.
- It supports multiple simultaneous VS Code windows by creating one session per
  selected window.

### Alternatives considered

1. Read Copilot UI or webview contents directly.

- Rejected because supported VS Code extension APIs do not expose another
  extension’s rendered chat UI or webview DOM/content for this use case.

2. Build a native macOS helper first.

- Rejected for V1 because it adds packaging, permissions, distribution, and
  lifecycle complexity before validating product value.

3. Upload video or screenshots to the backend.

- Rejected for V1 because it turns the feature into a media transport system,
  while the immediate need is local observation by the same user in the same
  browser tab.

## Scope

### In scope

- Observe one or more local VS Code windows from the board.
- Add multiple windows by repeatedly using the browser’s native window picker.
- Represent each captured window as an independent observe-only `agentSession`.
- Show those sessions in grid view and focus view.
- Preserve a page-local single active focus model while allowing multiple active
  captures in the same browser tab.
- Provide a best-effort “return to VS Code” action from the board.
- Reuse the existing session registry and snapshot websocket.

### Out of scope

- Reading Copilot chat content, DOM, or conversation history directly.
- OCR, transcription, indexing, or semantic analysis of captured frames.
- Remote desktop or remote VS Code window observation.
- Multi-user shared viewing of the same local capture stream.
- Server-side media relay, recording, replay, or screenshot archives.
- Browser-driven keyboard or mouse control of VS Code.
- Guaranteed restoration to the exact same VS Code window instance or Copilot
  conversation tab.
- Automatic capture restoration after page refresh.

## Technical design

### Constraints and capability boundary

The V1 solution uses pure browser APIs. This creates one important UX
constraint:

- The product cannot pre-scan and enumerate all available VS Code windows in
  the web UI before the user grants capture permission.
- The user adds multiple windows by invoking the browser-native picker multiple
  times and selecting one VS Code window per invocation.

This is a deliberate tradeoff to avoid introducing a native helper.

Runtime prerequisites for V1:

- macOS desktop environment
- desktop Chromium-family browser
- secure context such as `localhost` or HTTPS
- user-granted display capture permission through the browser picker

### Session model

Add a new `AgentSourceType` value:

- `local-window-capture`

Each selected VS Code window becomes one observe-only `agentSession`.

V1 does not assume a stable browser-exposed window identity across picker
invocations. Because of that, a newly selected window creates a new session by
default. V1 does not do implicit same-window matching or silent session reuse.

Expected session shape:

- `sourceType = 'local-window-capture'`
- `agentKind = 'vscode'`
- `controlMode = 'observe'`
- `workspaceId = 'local-vscode-window-observe'`
- `hostId = 'local'`
- `workingDirectory` is empty in V1
- `displayName` uses `MediaStreamTrack.label` when available, otherwise
  `VS Code 窗口 N`
- `connectionState`, `interactionState`, `stateConfidence` continue to use the
  existing shared model, but with source-type-specific rules defined below
- `transportRef.runtimeId` stores a session-local capture identifier such as
  `display-capture:<id>` and is not treated as a durable window identity
- `outputPreview` stores lightweight status text only, not frame data

The backend remains unaware of `MediaStream` objects. Live streams exist only in
frontend memory.

### Backend API changes

Reuse existing APIs wherever possible.

#### Reused APIs

- `GET /api/agent-sessions`
- `GET /api/agent-sessions/:id`
- `WS /ws/agent-sessions`
- `DELETE /api/agent-sessions/:id` for cleanup of detached or exited metadata
  sessions only

#### New APIs

Add a dedicated creation endpoint for browser-owned capture sessions:

- `POST /api/agent-sessions/window-capture`

Request DTO:

- `suggestedDisplayName?`

Response DTO:

- `agentSession`
- `observeToken`

The dedicated endpoint exists because local browser capture sessions need an
ownership token that the generic register endpoint does not return.

Add a narrow state update endpoint for observe-only browser captures:

- `POST /api/agent-sessions/:id/observe-state`

Request DTO is a tagged union with two legal shapes.

Heartbeat request:

- `kind = 'heartbeat'`
- `observeToken`
- `outputPreview?`

Transition request:

- `kind = 'transition'`
- `observeToken`
- `connectionState`
- `interactionState`
- `stateConfidence`
- `outputPreview`

This endpoint should not accept frame content, image blobs, or arbitrary session
mutation.

The backend must reject observe-state updates unless all of the following are
true:

- the session exists
- `sourceType === 'local-window-capture'`
- `observeToken` matches the token issued when the session was created
- the requested state transition is allowed

Allowed transitions for V1:

- `running -> detached`
- `running -> exited`
- `detached -> exited`

Heartbeat requests are metadata refreshes only. They update `lastHeartbeatAt`
and optional preview text without performing a lifecycle transition.

V1 does not support arbitrary state rewrites through this endpoint.

Delete contract for `local-window-capture`:

- running sessions are not deletable through `DELETE /api/agent-sessions/:id`
- owner-triggered stop uses `observe-state` with `kind = 'transition'`, not
  delete
- detached or exited sessions may be deleted as metadata cleanup
- the backend enforces these rules; they are not just UI affordances

### Frontend state model

Split state into two layers.

#### Backend-synchronized state

Tracked through the existing snapshot channel:

- session list
- active session id
- connection and interaction state
- timestamps
- lightweight preview text

#### Browser-local state

Tracked only in the current page:

- `sessionId -> MediaStream`
- `sessionId -> capture label`
- `sessionId -> local attach status`
- `sessionId -> observeToken`
- `focusedCaptureSessionId`

This split is required because `MediaStream` cannot be shared through the
existing backend transport and should not be serialized into shared types.

`observeToken` exists only in current page memory and is never included in
shared session snapshots. If the page refreshes or crashes, the token is lost.
After token loss, the old session cannot continue heartbeat updates or send an
explicit exit transition; it must age out into `degraded + detached` on the
server side.

### UI design

#### Entry point

Add a top-level action labeled “添加 VS Code 窗口”. Each click starts one capture
attempt and allows the user to select one window in the native picker.

#### Grid view

Each captured window appears as its own card in the existing grid.

- Cards should use the returned capture label when available.
- If labels are unavailable, fall back to generated names such as “VS Code 窗口
  1”.
- A card shows lightweight capture state when the current browser page no longer
  has an attached stream.

#### Focus view

Focus view remains single-session, reusing the current active-focus model.

- For terminal sessions, render the current terminal view.
- For `local-window-capture`, render a live video preview instead of terminal
  content.

V1 does not call backend focus APIs for `local-window-capture` sessions. Focus
for captured-window sessions remains page-local UI state only.

Single source of truth for captured-window focus in V1:

- the current browser page owns focus state for captured windows
- backend `activeAgentSessionId` is not used for captured-window rendering,
  ownership, or stream selection
- other tabs or clients may list the same metadata session, but they do not
  infer that they can render or control the live stream

#### Rendering contract

`local-window-capture` must not mount `TerminalView` and must not connect to the
terminal websocket.

Frontend rendering rules:

- grid card with local stream: render a small live preview
- grid card without local stream: render a status placeholder
- focus view with local stream: render a large live preview
- focus view without local stream: render a detached/offline placeholder with
  next-action affordances

#### Return to VS Code

Provide a best-effort action that attempts to bring VS Code to the foreground
using a deep-link or app-open mechanism.

Minimal acceptance contract for V1:

- if the machine has a registered VS Code protocol handler, attempt to open the
  VS Code app
- after the attempt, show a non-blocking hint that tells the user to switch
  manually if VS Code did not come to the foreground

V1 does not guarantee reactivation of the exact same VS Code window or the exact
same Copilot chat tab.

### Lifecycle and state transitions

Each captured window has an independent lifecycle.

#### Creation

1. User clicks “添加 VS Code 窗口”.
2. Browser prompts for display capture.
3. User selects a VS Code window.
4. Frontend receives a `MediaStream`.
5. Frontend registers one observe-only session.
6. Frontend starts local stream tracking and heartbeat updates.

If the user cancels selection, no session is created.

#### Ongoing observation

- A page may maintain multiple concurrent capture streams.
- Each stream maps to a distinct session.
- Switching focus between sessions must not stop any active stream.
- Page-level focus remains local UI state. V1 does not use backend global focus
  to model whether a captured window can be rendered in another tab or client.

#### Explicit end

If the browser indicates the stream ended, the frontend:

- disposes the local stream
- marks the session `offline + exited`
- updates preview text to indicate capture ended

#### Silent detach

If the page refreshes, closes, or crashes, the local stream disappears without a
clean shutdown. In that case, the backend should detect missing heartbeat and
transition the session to `degraded + detached`.

#### Stop observing and delete behavior

V1 distinguishes “stop observing” from “delete session”.

- If the owner page still has the active stream, the primary action is “停止观察”.
- “停止观察” stops local media tracks first, then sends a transition request to
  mark the session `offline + exited`.
- Generic delete is not shown for running `local-window-capture` sessions.
- Exited or detached `local-window-capture` sessions may be deleted as metadata
  cleanup.
- Non-owner pages do not attempt to stop someone else’s active local stream;
  they may only delete detached or exited metadata sessions.

### State semantics

For `local-window-capture`, use the existing state fields with a narrower set of
meanings:

- `online + running`: capture stream is alive and attached in the current page
- `degraded + detached`: session still exists but the current observing page is
  gone or no longer attached
- `offline + exited`: capture ended explicitly

V1 should not infer `awaiting_input` or other Copilot-specific semantics from
video stillness.

`local-window-capture` is fully excluded from terminal-text inference:

- no timed `awaiting_input` transitions
- no `syncCapturedScreen` usage
- no screen-text merge window
- no output-driven interaction inference

### Heartbeats

- Frontend sends heartbeat/state updates every 10 seconds while a capture is
  alive.
- Backend marks the session degraded after roughly 25 to 30 seconds without a
  heartbeat.
- Heartbeats update metadata only.

Server-side timeout handling is performed by a dedicated `ObserveSessionManager`
that scans `local-window-capture` sessions every 5 seconds. It ignores deleted
or exited sessions and transitions only eligible sessions to `degraded +
detached`.

### Failure handling

- Permission denied: do not create a session.
- Wrong window selected: allow reselecting a window without requiring session
  deletion.
- Stream ended for one window: only that session is affected.
- Page refresh: keep the metadata session but show that live video is no longer
  attached in this browser page.
- Obscured or minimized windows: display capture may freeze or degrade; V1 does
  not attempt deeper diagnostics.
- Reselecting a window after failure or exit creates a new session in V1 unless
  a future explicit replace-flow is added.
- Owner page stop action: stop tracks first, then send transition, then keep or
  later delete the exited session card.

## Testing and validation

### Manual validation

- Add one VS Code window and verify it appears as a session.
- Add multiple VS Code windows sequentially and verify each creates an
  independent card.
- Switch among observed windows in focus mode without terminating the others.
- End sharing for one window and verify only that session transitions to exited.
- Refresh the page and verify sessions become detached after heartbeat timeout.
- Use the “return to VS Code” action and confirm best-effort app switching.

### Integration coverage to add later

- Session creation for `local-window-capture` with observe token issuance
- Observe-state heartbeat updates
- Observe-state ownership validation
- Observe-state transition validation
- Session degradation after missing heartbeat
- Focus view rendering branch for captured-window sessions

## Open questions

None for V1. The first release explicitly targets desktop Chromium-family
browsers on macOS, does not include manual rename, and treats “open the VS Code
app if possible, otherwise show a hint” as sufficient for the return-to-editor
action.