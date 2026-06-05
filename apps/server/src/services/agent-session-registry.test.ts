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

type FakeTimeout = NodeJS.Timeout & {
  id: number;
  unrefCalled: boolean;
};

function installFakeTimers(startMs = 1_000) {
  const originalNow = Date.now;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const scheduled = new Map<
    FakeTimeout,
    { callback: () => void; delay: number }
  >();
  let now = startMs;
  let nextHandle = 1;

  Date.now = () => now;
  globalThis.setTimeout = ((callback: () => void, delay?: number) => {
    const handle = {
      id: nextHandle++,
      unrefCalled: false,
      unref(this: FakeTimeout) {
        this.unrefCalled = true;
        return this;
      },
    } as unknown as FakeTimeout;
    scheduled.set(handle, {
      callback,
      delay: Number(delay ?? 0),
    });
    return handle;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((handle: NodeJS.Timeout) => {
    scheduled.delete(handle as FakeTimeout);
  }) as typeof clearTimeout;

  return {
    scheduled,
    fireTimeout(handle: FakeTimeout) {
      const timeout = scheduled.get(handle);
      assert.ok(timeout, `expected timeout ${handle.id} to be scheduled`);
      assert.equal(handle.unrefCalled, true);
      scheduled.delete(handle);
      now += timeout.delay;
      timeout.callback();
    },
    restore() {
      Date.now = originalNow;
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    },
    setNow(nextNow: number) {
      now = nextNow;
    },
  };
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

test("awaiting-input timer retries when the first idle check fires early", () => {
  const originalNow = Date.now;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  let now = 1_000;
  let nextHandle = 1;
  type FakeTimeout = NodeJS.Timeout & {
    id: number;
    unrefCalled: boolean;
  };
  const scheduled = new Map<
    FakeTimeout,
    { callback: () => void; delay: number }
  >();

  Date.now = () => now;
  globalThis.setTimeout = ((callback: () => void, delay?: number) => {
    const handle = {
      id: nextHandle++,
      unrefCalled: false,
      unref(this: FakeTimeout) {
        this.unrefCalled = true;
        return this;
      },
    } as unknown as FakeTimeout;
    scheduled.set(handle, {
      callback,
      delay: Number(delay ?? 0),
    });
    return handle;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((handle: NodeJS.Timeout) => {
    scheduled.delete(handle as FakeTimeout);
  }) as typeof clearTimeout;

  const fireTimeout = (handle: FakeTimeout) => {
    const timeout = scheduled.get(handle);
    assert.ok(timeout, `expected timeout ${handle.id} to be scheduled`);
    assert.equal(handle.unrefCalled, true);
    scheduled.delete(handle);
    timeout.callback();
  };

  try {
    const registry = new AgentSessionRegistry(60);
    const session = createSession(registry);

    registry.appendOutput(session.id, "prompt> ", "stdout");

    assert.equal(scheduled.size, 1);
    const [firstHandle] = [...scheduled.keys()];
    now = 1_059;
    fireTimeout(firstHandle);

    assert.equal(registry.get(session.id).interactionState, "running");
    assert.equal(
      scheduled.size,
      1,
      "expected an early idle check to re-arm the timer",
    );

    const [retryHandle] = [...scheduled.keys()];
    now = 1_061;
    fireTimeout(retryHandle);

    assert.equal(registry.get(session.id).interactionState, "awaiting_input");
  } finally {
    Date.now = originalNow;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
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

test("bursty terminal output coalesces session snapshots behind an unref-ed timer", () => {
  const timers = installFakeTimers();

  try {
    const registry = new AgentSessionRegistry(60_000, 250);
    const snapshots: string[] = [];
    registry.subscribe((snapshot) => {
      snapshots.push(snapshot.items[0]?.outputPreview ?? "<empty>");
    });
    const session = registry.register({
      workspaceId: "test",
      hostId: "local",
      sourceType: "remote-tmux-discovered",
      agentKind: "shell",
      displayName: "snapshot-throttle",
      interactionState: "running",
    });

    assert.deepEqual(snapshots, ["<empty>", "<empty>"]);

    registry.appendOutput(session.id, "frame 1\n", "stdout");
    registry.appendOutput(session.id, "frame 2\n", "stdout");
    registry.appendOutput(session.id, "frame 3\n", "stdout");

    assert.equal(
      snapshots.length,
      2,
      "output bursts should not emit one full snapshot per frame",
    );
    assert.equal(timers.scheduled.size, 1);

    const [timer] = [...timers.scheduled.keys()];
    assert.equal(timer.unrefCalled, true);
    assert.ok(
      timers.scheduled.get(timer)!.delay > 0,
      "trailing snapshot should wait for the throttle window",
    );

    timers.fireTimeout(timer);
    assert.deepEqual(snapshots, ["<empty>", "<empty>", "frame 3"]);
  } finally {
    timers.restore();
  }
});

test("immediate session updates cancel pending coalesced snapshots and publish the latest state", () => {
  const timers = installFakeTimers();

  try {
    const registry = new AgentSessionRegistry(60_000, 250);
    const snapshots: string[] = [];
    registry.subscribe((snapshot) => {
      const item = snapshot.items[0];
      snapshots.push(
        item ? `${item.displayName}:${item.outputPreview ?? "<empty>"}` : "",
      );
    });
    const session = registry.register({
      workspaceId: "test",
      hostId: "local",
      sourceType: "remote-tmux-discovered",
      agentKind: "shell",
      displayName: "snapshot-throttle",
      interactionState: "running",
    });

    registry.appendOutput(session.id, "frame 1\n", "stdout");
    assert.equal(
      snapshots.length,
      2,
      "high-frequency output should wait for the trailing snapshot",
    );
    assert.equal(timers.scheduled.size, 1);

    registry.updateSession(session.id, {
      displayName: "snapshot-renamed",
    });

    assert.equal(
      timers.scheduled.size,
      0,
      "immediate updates should cancel pending trailing snapshots",
    );
    assert.equal(snapshots.at(-1), "snapshot-renamed:frame 1");
  } finally {
    timers.restore();
  }
});
