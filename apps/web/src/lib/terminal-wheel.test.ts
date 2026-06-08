import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TERMINAL_WHEEL_DELTA_LINE,
  TERMINAL_WHEEL_DELTA_PAGE,
  TERMINAL_WHEEL_DELTA_PIXEL,
  computeTerminalWheelScrollLines,
} from "./terminal-wheel.js";

describe("computeTerminalWheelScrollLines", () => {
  it("turns wheel-down pixels into positive terminal scrollback lines", () => {
    assert.deepEqual(
      computeTerminalWheelScrollLines({
        deltaMode: TERMINAL_WHEEL_DELTA_PIXEL,
        deltaY: 48,
        lineHeight: 16,
        pageHeight: 160,
        previousDeltaY: 0,
      }),
      {
        remainingDeltaY: 0,
        scrollLines: 3,
      },
    );
  });

  it("turns wheel-up line deltas into negative terminal scrollback lines", () => {
    assert.deepEqual(
      computeTerminalWheelScrollLines({
        deltaMode: TERMINAL_WHEEL_DELTA_LINE,
        deltaY: -2,
        lineHeight: 14,
        pageHeight: 140,
        previousDeltaY: 0,
      }),
      {
        remainingDeltaY: 0,
        scrollLines: -2,
      },
    );
  });

  it("accumulates sub-line trackpad deltas without emitting stdin-like arrows", () => {
    const first = computeTerminalWheelScrollLines({
      deltaMode: TERMINAL_WHEEL_DELTA_PIXEL,
      deltaY: 5,
      lineHeight: 16,
      pageHeight: 160,
      previousDeltaY: 0,
    });
    const second = computeTerminalWheelScrollLines({
      deltaMode: TERMINAL_WHEEL_DELTA_PIXEL,
      deltaY: 12,
      lineHeight: 16,
      pageHeight: 160,
      previousDeltaY: first.remainingDeltaY,
    });

    assert.deepEqual(first, {
      remainingDeltaY: 5,
      scrollLines: 0,
    });
    assert.deepEqual(second, {
      remainingDeltaY: 1,
      scrollLines: 1,
    });
  });

  it("maps page-mode wheel events to a full terminal page", () => {
    assert.deepEqual(
      computeTerminalWheelScrollLines({
        deltaMode: TERMINAL_WHEEL_DELTA_PAGE,
        deltaY: 1,
        lineHeight: 10,
        pageHeight: 80,
        previousDeltaY: 0,
      }),
      {
        remainingDeltaY: 0,
        scrollLines: 8,
      },
    );
  });
});
