import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { stripTerminalResponsePayload } from "./terminal-input.js";

describe("stripTerminalResponsePayload", () => {
  it("forwards device-attribute responses so TUIs (e.g. Copilot CLI) finish their capability handshake", () => {
    assert.equal(stripTerminalResponsePayload("\u001b[?1;2c"), "\u001b[?1;2c");
  });

  it("keeps normal arrow-key input intact", () => {
    assert.equal(stripTerminalResponsePayload("\u001b[A"), "\u001b[A");
  });

  it("keeps cursor position report replies intact", () => {
    assert.equal(
      stripTerminalResponsePayload("\u001b[12;42R"),
      "\u001b[12;42R",
    );
  });

  it("keeps DSR status replies intact so interactive prompts get their answers", () => {
    assert.equal(stripTerminalResponsePayload("\u001b[0n"), "\u001b[0n");
  });

  it("strips noisy OSC color-reply messages terminated by BEL", () => {
    // OSC 4;... BEL
    assert.equal(stripTerminalResponsePayload("\u001b]4;1;rgb:ff/00/ff\u0007"), "");
    // Surrounded by keystrokes
    assert.equal(stripTerminalResponsePayload("a\u001b]4;1;rgb:ff/00/ff\u0007b"), "ab");
  });

  it("strips noisy OSC color-reply messages terminated by ST", () => {
    // OSC 4;... ST (ESC \)
    assert.equal(stripTerminalResponsePayload("\u001b]4;1;rgb:ff/00/ff\u001b\\"), "");
    // Surrounded by keystrokes
    assert.equal(stripTerminalResponsePayload("a\u001b]4;1;rgb:ff/00/ff\u001b\\b"), "ab");
  });

  it("strips xterm.js's built-in DECSET 1004 focus-in reports so the manual focus tracker stays the single source of truth", () => {
    assert.equal(stripTerminalResponsePayload("\u001b[I"), "");
  });

  it("strips xterm.js's built-in DECSET 1004 focus-out reports for the same reason", () => {
    assert.equal(stripTerminalResponsePayload("\u001b[O"), "");
  });

  it("strips inline focus reports while preserving surrounding keystrokes", () => {
    assert.equal(stripTerminalResponsePayload("a\u001b[Ib\u001b[Oc"), "abc");
  });
});
