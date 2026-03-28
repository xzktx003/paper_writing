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

test("marks direct sessions awaiting_input after screen stays unchanged", async () => {
  const registry = new AgentSessionRegistry(20);
  const session = createSession(registry);

  const updated = registry.appendOutput(session.id, "first frame\n", "stdout");

  assert.equal(updated.interactionState, "running");
  assert.equal(updated.stateConfidence, "medium");

  await wait(35);

  assert.equal(registry.get(session.id).interactionState, "awaiting_input");
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

  await wait(25);
  assert.equal(registry.get(session.id).interactionState, "awaiting_input");
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
  await wait(30);
  const updated = registry.syncCapturedScreen(session.id, "stable frame");

  assert.equal(updated.interactionState, "detached");
  assert.equal(updated.stateConfidence, "high");
});
