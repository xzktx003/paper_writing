const TERMINAL_REPLAY_PATTERNS = [
  /\u001b\[(?:[?>])?[\d;]*c/g,
  /\u001b\[\??[\d;]*n/g,
  /\u001b\[\??[\d;]*R/g,
  /\u001b\[[\d;]*t/g,
  /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g,
  /\u001bP[\s\S]*?\u001b\\/g,
];

const TERMINAL_INPUT_PATTERNS = [
  /\u001b\[>[\d;]*c/g,
  /\u001b\](?:10|11);rgb:(?:[0-9a-fA-F]{2}\/[0-9a-fA-F]{2}\/[0-9a-fA-F]{2}|[0-9a-fA-F]{4}\/[0-9a-fA-F]{4}\/[0-9a-fA-F]{4})(?:\u0007|\u001b\\)/g,
  /\u001b\]4;\d+;rgb:(?:[0-9a-fA-F]{2}\/[0-9a-fA-F]{2}\/[0-9a-fA-F]{2}|[0-9a-fA-F]{4}\/[0-9a-fA-F]{4}\/[0-9a-fA-F]{4})(?:\u0007|\u001b\\)/g,
];

function stripPatterns(text: string, patterns: RegExp[]): string {
  return patterns.reduce(
    (sanitized, pattern) => sanitized.replace(pattern, ""),
    text,
  );
}

export function sanitizeReplayForTerminal(data: string): string {
  return stripPatterns(data, TERMINAL_REPLAY_PATTERNS);
}

// Live stdin MUST pass DA/DSR/OSC/DCS replies through to the PTY — xterm.js
// auto-answers capability queries from TUIs like Copilot CLI, and stripping
// those replies here makes the TUI wait forever and stop accepting input.
// The live-input exceptions are Secondary DA (`CSI > c`) and noisy OSC
// 10/11/4 rgb color replies. Shell prompts can emit Secondary DA while still
// in line-editing mode, which causes the raw terminal version reply
// (`0;276;0c`) to be echoed back into the prompt. Some terminals also reply to
// OSC color queries with rgb payloads that should not be echoed into stdin.
export function stripTerminalResponsePayload(payload: string): string {
  return stripPatterns(payload, TERMINAL_INPUT_PATTERNS);
}
