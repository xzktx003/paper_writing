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

  it("strips xterm.js's built-in DECSET 1004 focus-in reports so the manual focus tracker stays the single source of truth", () => {
    assert.equal(stripTerminalResponsePayload("\u001b[I"), "");
  });

  it("strips xterm.js's built-in DECSET 1004 focus-out reports for the same reason", () => {
    assert.equal(stripTerminalResponsePayload("\u001b[O"), "");
  });

  it("strips inline focus reports while preserving surrounding keystrokes", () => {
    assert.equal(stripTerminalResponsePayload("a\u001b[Ib\u001b[Oc"), "abc");
  });

  it("strips OSC color-query replies so rgb payload noise never reaches the PTY", () => {
    assert.equal(
      stripTerminalResponsePayload(
        "\u001b]11;rgb:0e0e/1212/1717\u0007\u001b]10;rgb:f4f4/f1f1/eaea\u0007",
      ),
      "",
    );
  });

  it("keeps malformed OSC 10 replies intact when the rgb payload is not canonical", () => {
    assert.equal(
      stripTerminalResponsePayload("\u001b]10;rgb:not-a-color\u0007"),
      "\u001b]10;rgb:not-a-color\u0007",
    );
  });

  it("strips OSC color-query replies terminated by ST so rgb payload noise never reaches the PTY", () => {
    assert.equal(
      stripTerminalResponsePayload(
        "\u001b]4;0;rgb:0000/0000/0000\u001b\\\u001b]4;1;rgb:ffff/ffff/ffff\u001b\\",
      ),
      "",
    );
  });

  it("keeps malformed OSC 4 replies intact when the rgb payload is not canonical", () => {
    assert.equal(
      stripTerminalResponsePayload("\u001b]4;0;rgb:bad/value\u001b\\"),
      "\u001b]4;0;rgb:bad/value\u001b\\",
    );
  });
});
