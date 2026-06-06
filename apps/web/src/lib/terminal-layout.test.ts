import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TERMINAL_MONITOR_LAYOUT_OPTIONS,
  areTerminalMonitorSlotsEqual,
  getTerminalMonitorLayoutCapacity,
  isTerminalMonitorLayoutMode,
  normalizeTerminalMonitorSlots,
  placeTerminalMonitorSlotSession,
  setTerminalMonitorSlotSession,
} from "./terminal-layout.js";

const sessions = [
  { id: "agent-1" },
  { id: "agent-2" },
  { id: "agent-3" },
  { id: "agent-4" },
  { id: "agent-5" },
  { id: "agent-6" },
  { id: "agent-7" },
  { id: "agent-8" },
];

describe("terminal monitor layout", () => {
  it("caps monitor panes to the selected layout size", () => {
    assert.equal(getTerminalMonitorLayoutCapacity("single"), 1);
    assert.equal(getTerminalMonitorLayoutCapacity("dual"), 2);
    assert.equal(getTerminalMonitorLayoutCapacity("dual-vertical"), 2);
    assert.equal(getTerminalMonitorLayoutCapacity("triple"), 3);
    assert.equal(getTerminalMonitorLayoutCapacity("quad"), 4);
    assert.equal(getTerminalMonitorLayoutCapacity("six"), 6);
    assert.equal(getTerminalMonitorLayoutCapacity("eight"), 8);

    const slots = normalizeTerminalMonitorSlots({
      mode: "quad",
      sessions,
      preferredSessionId: "agent-1",
    });

    assert.equal(slots.length, 4);
    assert.deepEqual(
      slots.map((slot) => slot.sessionId),
      ["agent-1", "agent-2", "agent-3", "agent-4"],
    );
  });

  it("fills a left-middle-right three-pane layout", () => {
    assert.equal(isTerminalMonitorLayoutMode("triple"), true);
    assert.equal(
      TERMINAL_MONITOR_LAYOUT_OPTIONS.some(
        (option) => option.mode === "triple",
      ),
      true,
    );

    const slots = normalizeTerminalMonitorSlots({
      mode: "triple",
      sessions,
      preferredSessionId: "agent-3",
      previousSlots: [
        { id: "terminal-monitor-slot-1", sessionId: "agent-1" },
        { id: "terminal-monitor-slot-2", sessionId: "agent-2" },
      ],
      preferredSlotId: "terminal-monitor-slot-3",
    });

    assert.deepEqual(
      slots.map((slot) => slot.sessionId),
      ["agent-1", "agent-2", "agent-3"],
    );
  });

  it("treats vertical dual layout as an independent two-pane mode", () => {
    assert.equal(isTerminalMonitorLayoutMode("dual-vertical"), true);
    assert.equal(
      TERMINAL_MONITOR_LAYOUT_OPTIONS.some(
        (option) => option.mode === "dual-vertical",
      ),
      true,
    );

    const slots = normalizeTerminalMonitorSlots({
      mode: "dual-vertical",
      sessions,
      preferredSessionId: "agent-3",
      previousSlots: [
        { id: "terminal-monitor-slot-1", sessionId: "agent-1" },
        { id: "terminal-monitor-slot-2", sessionId: "agent-2" },
        { id: "terminal-monitor-slot-3", sessionId: "agent-3" },
        { id: "terminal-monitor-slot-4", sessionId: "agent-4" },
      ],
      preferredSlotId: "terminal-monitor-slot-2",
    });

    assert.deepEqual(
      slots.map((slot) => slot.sessionId),
      ["agent-1", "agent-3"],
    );
  });

  it("fills six unique terminal panes in six-pane mode", () => {
    assert.equal(isTerminalMonitorLayoutMode("six"), true);
    assert.equal(
      TERMINAL_MONITOR_LAYOUT_OPTIONS.some((option) => option.mode === "six"),
      true,
    );

    const slots = normalizeTerminalMonitorSlots({
      mode: "six",
      sessions,
      preferredSessionId: "agent-6",
      previousSlots: [
        { id: "terminal-monitor-slot-1", sessionId: "agent-1" },
        { id: "terminal-monitor-slot-2", sessionId: "agent-2" },
        { id: "terminal-monitor-slot-3", sessionId: "agent-3" },
        { id: "terminal-monitor-slot-4", sessionId: "agent-4" },
      ],
      preferredSlotId: "terminal-monitor-slot-6",
    });

    assert.deepEqual(
      slots.map((slot) => slot.id),
      [
        "terminal-monitor-slot-1",
        "terminal-monitor-slot-2",
        "terminal-monitor-slot-3",
        "terminal-monitor-slot-4",
        "terminal-monitor-slot-5",
        "terminal-monitor-slot-6",
      ],
    );
    assert.deepEqual(
      slots.map((slot) => slot.sessionId),
      ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5", "agent-6"],
    );
  });

  it("fills eight unique terminal panes in eight-pane mode", () => {
    assert.equal(isTerminalMonitorLayoutMode("eight"), true);
    assert.equal(
      TERMINAL_MONITOR_LAYOUT_OPTIONS.some((option) => option.mode === "eight"),
      true,
    );

    const slots = normalizeTerminalMonitorSlots({
      mode: "eight",
      sessions,
      preferredSessionId: "agent-8",
      previousSlots: [
        { id: "terminal-monitor-slot-1", sessionId: "agent-1" },
        { id: "terminal-monitor-slot-2", sessionId: "agent-2" },
        { id: "terminal-monitor-slot-3", sessionId: "agent-3" },
        { id: "terminal-monitor-slot-4", sessionId: "agent-4" },
        { id: "terminal-monitor-slot-5", sessionId: "agent-5" },
        { id: "terminal-monitor-slot-6", sessionId: "agent-6" },
      ],
      preferredSlotId: "terminal-monitor-slot-8",
    });

    assert.deepEqual(
      slots.map((slot) => slot.id),
      [
        "terminal-monitor-slot-1",
        "terminal-monitor-slot-2",
        "terminal-monitor-slot-3",
        "terminal-monitor-slot-4",
        "terminal-monitor-slot-5",
        "terminal-monitor-slot-6",
        "terminal-monitor-slot-7",
        "terminal-monitor-slot-8",
      ],
    );
    assert.deepEqual(
      slots.map((slot) => slot.sessionId),
      [
        "agent-1",
        "agent-2",
        "agent-3",
        "agent-4",
        "agent-5",
        "agent-6",
        "agent-7",
        "agent-8",
      ],
    );
  });

  it("keeps the focused session visible when reducing layout size", () => {
    const slots = normalizeTerminalMonitorSlots({
      mode: "dual",
      sessions,
      preferredSessionId: "agent-4",
      previousSlots: [
        { id: "terminal-monitor-slot-1", sessionId: "agent-1" },
        { id: "terminal-monitor-slot-2", sessionId: "agent-2" },
        { id: "terminal-monitor-slot-3", sessionId: "agent-3" },
        { id: "terminal-monitor-slot-4", sessionId: "agent-4" },
      ],
      preferredSlotId: "terminal-monitor-slot-2",
    });

    assert.deepEqual(
      slots.map((slot) => slot.sessionId),
      ["agent-1", "agent-4"],
    );
  });

  it("deduplicates sessions so one pane cannot mirror another pane", () => {
    const slots = normalizeTerminalMonitorSlots({
      mode: "quad",
      sessions,
      preferredSessionId: "agent-1",
      previousSlots: [
        { id: "terminal-monitor-slot-1", sessionId: "agent-1" },
        { id: "terminal-monitor-slot-2", sessionId: "agent-1" },
        { id: "terminal-monitor-slot-3", sessionId: "agent-2" },
        { id: "terminal-monitor-slot-4", sessionId: "agent-2" },
      ],
    });

    assert.deepEqual(
      slots.map((slot) => slot.sessionId),
      ["agent-1", "agent-3", "agent-2", "agent-4"],
    );
  });

  it("moves a selected session instead of broadcasting it into two panes", () => {
    const slots = setTerminalMonitorSlotSession(
      [
        { id: "terminal-monitor-slot-1", sessionId: "agent-1" },
        { id: "terminal-monitor-slot-2", sessionId: "agent-2" },
      ],
      "terminal-monitor-slot-2",
      "agent-1",
    );

    assert.deepEqual(slots, [
      { id: "terminal-monitor-slot-1", sessionId: null },
      { id: "terminal-monitor-slot-2", sessionId: "agent-1" },
    ]);
  });

  it("places a sidebar session into a monitor pane without duplicating it", () => {
    const slots = placeTerminalMonitorSlotSession(
      [
        { id: "terminal-monitor-slot-1", sessionId: "agent-1" },
        { id: "terminal-monitor-slot-2", sessionId: "agent-2" },
      ],
      "terminal-monitor-slot-2",
      "agent-3",
    );

    assert.deepEqual(slots, [
      { id: "terminal-monitor-slot-1", sessionId: "agent-1" },
      { id: "terminal-monitor-slot-2", sessionId: "agent-3" },
    ]);
  });

  it("swaps two occupied monitor panes when dragging a pane onto another pane", () => {
    const slots = placeTerminalMonitorSlotSession(
      [
        { id: "terminal-monitor-slot-1", sessionId: "agent-1" },
        { id: "terminal-monitor-slot-2", sessionId: "agent-2" },
      ],
      "terminal-monitor-slot-2",
      "agent-1",
      "terminal-monitor-slot-1",
    );

    assert.deepEqual(slots, [
      { id: "terminal-monitor-slot-1", sessionId: "agent-2" },
      { id: "terminal-monitor-slot-2", sessionId: "agent-1" },
    ]);
  });

  it("compares normalized slots without forcing redundant React state writes", () => {
    assert.equal(
      areTerminalMonitorSlotsEqual(
        [{ id: "terminal-monitor-slot-1", sessionId: "agent-1" }],
        [{ id: "terminal-monitor-slot-1", sessionId: "agent-1" }],
      ),
      true,
    );
    assert.equal(
      areTerminalMonitorSlotsEqual(
        [{ id: "terminal-monitor-slot-1", sessionId: "agent-1" }],
        [{ id: "terminal-monitor-slot-1", sessionId: "agent-2" }],
      ),
      false,
    );
  });
});
