import test from "node:test";
import assert from "node:assert/strict";

import { AgentSessionRegistry } from "./agent-session-registry.js";

function createSession(registry: AgentSessionRegistry) {
  return registry.register({
    workspaceId: "test",
    hostId: "local",
    sourceType: "local",
    agentKind: "copilot",
    displayName: "Awaiting Input Test",
    interactionState: "running",
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForInteractionState(
  registry: AgentSessionRegistry,
  sessionId: string,
  expectedState: "running" | "awaiting_input",
  timeoutMs = 3_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (registry.get(sessionId).interactionState === expectedState) {
      return;
    }

    await wait(10);
  }

  assert.equal(registry.get(sessionId).interactionState, expectedState);
}

test("marks direct sessions awaiting_input after screen stays unchanged", async () => {
  const registry = new AgentSessionRegistry(20);
  const session = createSession(registry);

  const updated = registry.appendOutput(session.id, "first frame\n", "stdout");

  assert.equal(updated.interactionState, "running");
  assert.equal(updated.stateConfidence, "medium");

  await waitForInteractionState(registry, session.id, "awaiting_input");
  assert.equal(registry.get(session.id).stateConfidence, "medium");
});

test("user input resets inactivity timer and later returns to awaiting_input", async () => {
  const registry = new AgentSessionRegistry(25);
  const session = createSession(registry);

  registry.appendOutput(session.id, "first frame\n", "stdout");
  await wait(10);

  registry.noteUserInput(session.id, "hello");
  assert.equal(registry.get(session.id).interactionState, "running");

  await wait(10);
  assert.equal(registry.get(session.id).interactionState, "running");

  await waitForInteractionState(registry, session.id, "awaiting_input");
});

test("repeated identical terminal redraws do not keep sessions running", async () => {
  const registry = new AgentSessionRegistry(60);
  const session = createSession(registry);

  registry.appendOutput(session.id, "prompt> ", "stdout");
  await wait(25);

  registry.appendOutput(session.id, "\u001b[2K\rprompt> ", "stdout");
  await waitForInteractionState(registry, session.id, "awaiting_input");
});

test("identical redraws do not reorder sessions in the board", async () => {
  const registry = new AgentSessionRegistry(60);
  const first = createSession(registry);
  const second = registry.register({
    workspaceId: "test",
    hostId: "local",
    sourceType: "local",
    agentKind: "copilot",
    displayName: "Second Session",
    interactionState: "running",
  });

  registry.appendOutput(first.id, "first prompt> ", "stdout");
  await wait(5);
  registry.appendOutput(second.id, "second prompt> ", "stdout");

  const before = registry.list().items.map((item) => item.id);

  registry.appendOutput(first.id, "\u001b[2K\rfirst prompt> ", "stdout");

  assert.deepEqual(
    registry.list().items.map((item) => item.id),
    before,
  );
});

test("heartbeat updates do not reorder sessions without new output", () => {
  const registry = new AgentSessionRegistry(60);
  const first = registry.register({
    workspaceId: "default",
    hostId: "local",
    sourceType: "local",
    agentKind: "shell",
    displayName: "Session 1",
    interactionState: "running",
  });
  const second = registry.register({
    workspaceId: "default",
    hostId: "local",
    sourceType: "local",
    agentKind: "shell",
    displayName: "Session 2",
    interactionState: "running",
  });

  const before = registry.list().items.map((item) => item.id);

  registry.syncCapturedScreen(second.id, "frame 2");

  assert.deepEqual(before, [first.id, second.id]);
  assert.deepEqual(
    registry.list().items.map((item) => item.id),
    before,
  );
});

test("tmux observe-only sessions stay detached even when screen is unchanged", async () => {
  const registry = new AgentSessionRegistry(20);
  const session = registry.register({
    workspaceId: "tmux",
    hostId: "local-tmux",
    sourceType: "remote-tmux-discovered",
    agentKind: "copilot",
    displayName: "tmux pane",
    controlMode: "observe",
    interactionState: "detached",
  });

  registry.syncCapturedScreen(session.id, "stable frame");
  await wait(50);
  const updated = registry.syncCapturedScreen(session.id, "stable frame");

  assert.equal(updated.interactionState, "detached");
  assert.equal(updated.stateConfidence, "high");
});

test("awaiting_input timer is unref-ed so it cannot block Node process exit", () => {
  const registry = new AgentSessionRegistry(60_000);
  const session = registry.register({
    workspaceId: "test",
    hostId: "local",
    sourceType: "local",
    agentKind: "copilot",
    displayName: "unref-check",
    interactionState: "running",
  });

  registry.syncCapturedScreen(session.id, "frame-a");

  const timers = (
    registry as unknown as {
      awaitingInputTimers: Map<string, NodeJS.Timeout>;
    }
  ).awaitingInputTimers;

  const timer = timers.get(session.id);
  assert.ok(timer, "expected an awaiting_input timer to be scheduled");
  assert.equal(
    timer?.hasRef(),
    false,
    "awaiting_input timer must be unref-ed to avoid blocking `node --test` shutdown",
  );
});
