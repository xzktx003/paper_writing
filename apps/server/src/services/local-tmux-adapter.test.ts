import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTmuxSendKeySteps,
  isNoTmuxServerError,
  parsePaneInfo,
  summarizeTmuxSessions,
} from "./local-tmux-adapter.js";

test("parsePaneInfo reads pane metadata including attach state", () => {
  const panes = parsePaneInfo(
    [
      "dev\t1\t1\t1\t%1\tcopilot\t/Users/hx/dev",
      "ops\t0\t1\t1\t%2\tshell\t/Users/hx/ops",
    ].join("\n"),
  );

  assert.equal(panes.length, 2);
  assert.equal(panes[0].sessionName, "dev");
  assert.equal(panes[0].attachedCount, 1);
  assert.equal(panes[0].paneActive, true);
  assert.equal(panes[1].currentCommand, "shell");
});

test("summarizeTmuxSessions groups panes by session and prefers active pane", () => {
  const sessions = summarizeTmuxSessions(
    parsePaneInfo(
      [
        "dev\t1\t0\t0\t%7\tshell\t/Users/hx/dev/a",
        "dev\t1\t1\t1\t%8\tcopilot\t/Users/hx/dev/b",
        "ops\t0\t1\t1\t%3\tshell\t/Users/hx/ops",
      ].join("\n"),
    ),
  );

  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].sessionName, "dev");
  assert.equal(sessions[0].paneId, "%8");
  assert.equal(sessions[0].interactionState, "running");
  assert.equal(sessions[1].sessionName, "ops");
  assert.equal(sessions[1].interactionState, "detached");
});

test("isNoTmuxServerError classifies missing server errors", () => {
  assert.equal(
    isNoTmuxServerError(
      new Error("no server running on /private/tmp/tmux-501/default\n"),
    ),
    true,
  );
  assert.equal(
    isNoTmuxServerError(new Error("failed to connect to server")),
    true,
  );
  assert.equal(
    isNoTmuxServerError(new Error("command not found: tmux")),
    false,
  );
});

test("buildTmuxSendKeySteps preserves text submit while keeping paste raw", () => {
  assert.deepEqual(buildTmuxSendKeySteps("hello codex\r"), [
    { kind: "literal", value: "hello codex" },
    { kind: "keys", keys: ["Enter"] },
  ]);

  assert.deepEqual(buildTmuxSendKeySteps("hello codex"), [
    { kind: "literal", value: "hello codex" },
  ]);
});

test("buildTmuxSendKeySteps maps mobile control keys without appending Enter", () => {
  assert.deepEqual(buildTmuxSendKeySteps("\t"), [
    { kind: "keys", keys: ["Tab"] },
  ]);
  assert.deepEqual(buildTmuxSendKeySteps("\x03"), [
    { kind: "keys", keys: ["C-c"] },
  ]);
  assert.deepEqual(buildTmuxSendKeySteps("\x1b[A"), [
    { kind: "keys", keys: ["Up"] },
  ]);
});
