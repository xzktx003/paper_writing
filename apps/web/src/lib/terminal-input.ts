// Live stdin is forwarded as-is, with two exceptions described below.
// xterm.js auto-answers capability queries (DA/DSR/OSC/DCS) from TUIs like
// Copilot CLI via term.onData, and those replies MUST reach the PTY —
// otherwise the TUI blocks on its capability handshake and silently ignores
// keystrokes. Replay content is sanitized on the server side
// (sanitizeReplayForTerminal) before it ever reaches xterm.js, so no
// stale-query auto-reply storm can happen here.
//
// Focus reports (DECSET 1004 — `\u001b[I` / `\u001b[O`) are one exception.
// xterm.js bundles its own focus tracker that fires these whenever the
// terminal DOM element receives or loses focus, but the helper textarea
// goes through brief unfocused moments during initial mount, after replay,
// and right after xterm itself processes `\u001b[?1004h`. If we forward
// those raw reports the TUI sees a spurious focus-out at startup and silently
// drops the user's first keystrokes (Copilot CLI's "I can type sometimes,
// then it stops" regression). The frontend manages focus reports explicitly
// in TerminalView.syncTerminalFocusReport, so we strip xterm's built-in ones
// here to keep a single source of truth. The other live-input exception is
// noisy OSC color replies for OSC 10/11/4, which xterm.js can emit when it
// answers palette queries with BEL (`\u0007`) or ST (`\u001b\\`) terminators.
// See tests/e2e/copilot-focus.spec.ts.
const FOCUS_REPORT_PATTERN = /\u001b\[[IO]/g;
const OSC_COLOR_REPLY_PATTERN =
  /\u001b\](?:10|11);rgb:(?:[0-9a-fA-F]{2}\/[0-9a-fA-F]{2}\/[0-9a-fA-F]{2}|[0-9a-fA-F]{4}\/[0-9a-fA-F]{4}\/[0-9a-fA-F]{4})(?:\u0007|\u001b\\)|\u001b\]4;\d+;rgb:(?:[0-9a-fA-F]{2}\/[0-9a-fA-F]{2}\/[0-9a-fA-F]{2}|[0-9a-fA-F]{4}\/[0-9a-fA-F]{4}\/[0-9a-fA-F]{4})(?:\u0007|\u001b\\)/g;

export function stripTerminalResponsePayload(payload: string): string {
  return payload
    .replace(FOCUS_REPORT_PATTERN, "")
    .replace(OSC_COLOR_REPLY_PATTERN, "");
}
