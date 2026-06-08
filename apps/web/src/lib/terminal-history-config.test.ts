import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_TERMINAL_SCROLLBACK_LINES,
  parseTerminalScrollbackLines,
} from "./terminal-history-config.js";

describe("terminal history config", () => {
  it("uses the default xterm scrollback when the env value is blank", () => {
    assert.equal(
      parseTerminalScrollbackLines(undefined),
      DEFAULT_TERMINAL_SCROLLBACK_LINES,
    );
    assert.equal(
      parseTerminalScrollbackLines("  "),
      DEFAULT_TERMINAL_SCROLLBACK_LINES,
    );
  });

  it("accepts positive integer xterm scrollback lines", () => {
    assert.equal(parseTerminalScrollbackLines("30000"), 30000);
  });

  it("falls back to the default for invalid xterm scrollback values", () => {
    assert.equal(
      parseTerminalScrollbackLines("0"),
      DEFAULT_TERMINAL_SCROLLBACK_LINES,
    );
    assert.equal(
      parseTerminalScrollbackLines("3.14"),
      DEFAULT_TERMINAL_SCROLLBACK_LINES,
    );
    assert.equal(
      parseTerminalScrollbackLines("abc"),
      DEFAULT_TERMINAL_SCROLLBACK_LINES,
    );
  });
});
