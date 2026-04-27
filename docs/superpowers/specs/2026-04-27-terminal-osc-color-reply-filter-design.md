# Terminal OSC color-reply filter design

## Problem

Kanban terminals can occasionally show raw payloads such as
`11;rgb:... 10;rgb:... 4;...`. These are xterm.js replies to OSC color-query
sequences, not product messages. We already allow live stdin terminal replies to
pass through so Copilot CLI and similar TUIs can complete capability handshakes,
but that broad allowance also lets this specific color-query reply leak into the
visible terminal.

## Constraints

- Do not broadly strip live stdin DA/DSR/OSC/DCS replies; that previously broke
  TUI capability handshakes and caused lost input.
- Keep the existing Secondary DA special-case filter.
- Apply the same targeted live-input behavior on both the frontend and backend
  terminal input filters so browser-originated input stays consistent.

## Recommended approach

Extend the existing live-input special-case filter with one more narrow branch:
strip only OSC color-query replies that match the noisy palette/foreground/
background response shapes we have observed (`OSC 10`, `OSC 11`, and `OSC 4`
reply payloads). Leave Primary DA, DSR, CPR, and other live terminal replies
untouched.

## Data flow

1. xterm.js auto-replies to a terminal color query.
2. `stripTerminalResponsePayload` runs in the web client before sending stdin.
3. The matching OSC color-reply payload is removed instead of being sent.
4. The backend keeps the same guard in its own `stripTerminalResponsePayload`
   before PTY write.
5. Non-matching handshake/status replies still reach the PTY normally.

## Tests

- Add frontend unit coverage proving the OSC color-query reply is stripped.
- Add backend unit coverage proving the OSC color-query reply is stripped.
- Add terminal websocket coverage proving the noisy `rgb:` payload does not
  appear in terminal output.
- Preserve existing regression coverage for Primary DA, DSR, CPR, and Secondary
  DA behavior.
