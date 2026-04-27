import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizeReplayForTerminal,
  stripTerminalResponsePayload,
} from "./terminal-control-filter.js";

test("forward device-attribute responses to the PTY for capability handshakes", () => {
  // Copilot CLI probes the terminal with Primary DA (CSI c); xterm.js
  // auto-answers via term.onData. The reply MUST reach the PTY or the TUI
  // stays blocked waiting for capabilities and never accepts keystrokes.
  const sanitized = stripTerminalResponsePayload("\u001b[?1;2c");

  assert.equal(sanitized, "\u001b[?1;2c");
});

test("strip secondary device-attribute replies so shell prompts do not echo terminal version noise", () => {
  const sanitized = stripTerminalResponsePayload("\u001b[>0;276;0c");

  assert.equal(sanitized, "");
});

test("keep normal keyboard escape sequences intact", () => {
  const sanitized = stripTerminalResponsePayload("\u001b[A");

  assert.equal(sanitized, "\u001b[A");
});

test("keep CPR replies intact for interactive prompts", () => {
  const sanitized = stripTerminalResponsePayload("\u001b[12;42R");

  assert.equal(sanitized, "\u001b[12;42R");
});

test("keep DSR replies intact so TUIs receive their status answers", () => {
  const sanitized = stripTerminalResponsePayload("\u001b[0n");

  assert.equal(sanitized, "\u001b[0n");
});

test("strip OSC color-query replies so shell prompts do not echo rgb payload noise", () => {
  const sanitized = stripTerminalResponsePayload(
    "\u001b]11;rgb:0e0e/1212/1717\u0007\u001b]10;rgb:f4f4/f1f1/eaea\u0007",
  );

  assert.equal(sanitized, "");
});

test("keep malformed OSC 10 replies intact when the rgb payload is not canonical", () => {
  const sanitized = stripTerminalResponsePayload(
    "\u001b]10;rgb:not-a-color\u0007",
  );

  assert.equal(sanitized, "\u001b]10;rgb:not-a-color\u0007");
});

test("strip OSC 4 rgb replies so palette queries do not echo color noise", () => {
  const sanitized = stripTerminalResponsePayload(
    "\u001b]4;0;rgb:1111/2222/3333\u001b\\",
  );

  assert.equal(sanitized, "");
});

test("keep malformed OSC 4 replies intact when the rgb payload is not canonical", () => {
  const sanitized = stripTerminalResponsePayload(
    "\u001b]4;0;rgb:bad/value\u001b\\",
  );

  assert.equal(sanitized, "\u001b]4;0;rgb:bad/value\u001b\\");
});

test("sanitize replay removes window and cursor report sequences", () => {
  const replay =
    "prompt> \u001b[>cprompt redraw\u001b[6n\u001b[18t\u001b[12;42Rstill here";

  const sanitized = sanitizeReplayForTerminal(replay);

  assert.equal(sanitized, "prompt> prompt redrawstill here");
});
