import test from "node:test";
import assert from "node:assert/strict";

import { buildServer } from "../app.js";

async function buildApp() {
  const { app } = buildServer();
  await app.ready();
  return app;
}

test("POST /api/agent-sessions/window-capture creates session with observeToken", async () => {
  const app = await buildApp();

  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/window-capture",
      payload: { suggestedDisplayName: "VS Code 窗口 1" },
    });

    assert.equal(res.statusCode, 201);

    const body = JSON.parse(res.payload);
    assert.ok(body.agentSession);
    assert.ok(body.observeToken);
    assert.equal(body.agentSession.sourceType, "local-window-capture");
    assert.equal(body.agentSession.controlMode, "observe");
    assert.equal(body.agentSession.displayName, "VS Code 窗口 1");
  } finally {
    await app.close();
  }
});

test("POST /api/agent-sessions/:id/observe-state heartbeat with valid token", async () => {
  const app = await buildApp();

  try {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/window-capture",
      payload: {},
    });

    const { agentSession, observeToken } = JSON.parse(createRes.payload);

    const heartbeatRes = await app.inject({
      method: "POST",
      url: `/api/agent-sessions/${agentSession.id}/observe-state`,
      payload: {
        kind: "heartbeat",
        observeToken,
        outputPreview: "capturing...",
      },
    });

    assert.equal(heartbeatRes.statusCode, 200);

    const body = JSON.parse(heartbeatRes.payload);
    assert.equal(body.outputPreview, "capturing...");
  } finally {
    await app.close();
  }
});

test("POST /api/agent-sessions/:id/observe-state with wrong token returns 403", async () => {
  const app = await buildApp();

  try {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/window-capture",
      payload: {},
    });

    const { agentSession } = JSON.parse(createRes.payload);

    const res = await app.inject({
      method: "POST",
      url: `/api/agent-sessions/${agentSession.id}/observe-state`,
      payload: {
        kind: "heartbeat",
        observeToken: "wrong-token",
      },
    });

    assert.equal(res.statusCode, 403);
  } finally {
    await app.close();
  }
});

test("POST /api/agent-sessions/:id/observe-state invalid transition returns 400", async () => {
  const app = await buildApp();

  try {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/window-capture",
      payload: {},
    });

    const { agentSession, observeToken } = JSON.parse(createRes.payload);

    const res = await app.inject({
      method: "POST",
      url: `/api/agent-sessions/${agentSession.id}/observe-state`,
      payload: {
        kind: "transition",
        observeToken,
        connectionState: "online",
        interactionState: "idle",
        stateConfidence: "high",
      },
    });

    assert.equal(res.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("DELETE running local-window-capture session returns 409", async () => {
  const app = await buildApp();

  try {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/window-capture",
      payload: {},
    });

    const { agentSession } = JSON.parse(createRes.payload);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/agent-sessions/${agentSession.id}`,
    });

    assert.equal(deleteRes.statusCode, 409);
  } finally {
    await app.close();
  }
});

test("DELETE exited local-window-capture session succeeds", async () => {
  const app = await buildApp();

  try {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/window-capture",
      payload: {},
    });

    const { agentSession, observeToken } = JSON.parse(createRes.payload);

    // Transition to exited first
    await app.inject({
      method: "POST",
      url: `/api/agent-sessions/${agentSession.id}/observe-state`,
      payload: {
        kind: "transition",
        observeToken,
        connectionState: "offline",
        interactionState: "exited",
        stateConfidence: "high",
        outputPreview: "capture ended",
      },
    });

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/agent-sessions/${agentSession.id}`,
    });

    assert.equal(deleteRes.statusCode, 204);
  } finally {
    await app.close();
  }
});

test("POST /api/agent-sessions/window-capture persists windowCaptureMeta.rawLabel", async () => {
  const app = await buildApp();

  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/window-capture",
      payload: {
        suggestedDisplayName: "coding_kanban - Visual Studio Code",
        windowCaptureMeta: {
          rawLabel: "coding_kanban - Visual Studio Code",
        },
      },
    });

    assert.equal(res.statusCode, 201);

    const body = JSON.parse(res.payload);
    assert.ok(body.agentSession.windowCaptureMeta);
    assert.equal(
      body.agentSession.windowCaptureMeta.rawLabel,
      "coding_kanban - Visual Studio Code",
    );
  } finally {
    await app.close();
  }
});

test("GET /api/agent-sessions roundtrip preserves windowCaptureMeta", async () => {
  const app = await buildApp();

  try {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/window-capture",
      payload: {
        suggestedDisplayName: "my-project — Code",
        windowCaptureMeta: { rawLabel: "my-project — Code" },
      },
    });

    assert.equal(createRes.statusCode, 201);
    const { agentSession } = JSON.parse(createRes.payload);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/agent-sessions",
    });

    assert.equal(listRes.statusCode, 200);
    const list = JSON.parse(listRes.payload);
    const found = list.items.find(
      (s: { id: string }) => s.id === agentSession.id,
    );
    assert.ok(found);
    assert.ok(found.windowCaptureMeta);
    assert.equal(found.windowCaptureMeta.rawLabel, "my-project — Code");
  } finally {
    await app.close();
  }
});

test("POST /api/agent-sessions/window-capture legacy payload without windowCaptureMeta still gets rawLabel", async () => {
  const app = await buildApp();

  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/window-capture",
      payload: { suggestedDisplayName: "legacy-client-label" },
    });

    assert.equal(res.statusCode, 201);

    const body = JSON.parse(res.payload);
    assert.ok(body.agentSession.windowCaptureMeta);
    assert.equal(
      body.agentSession.windowCaptureMeta.rawLabel,
      "legacy-client-label",
    );
    assert.equal(body.agentSession.displayName, "legacy-client-label");
  } finally {
    await app.close();
  }
});

test("POST /api/agent-sessions/window-capture whitespace rawLabel falls back to suggestedDisplayName", async () => {
  const app = await buildApp();

  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/window-capture",
      payload: {
        suggestedDisplayName: "fallback-name",
        windowCaptureMeta: { rawLabel: "   " },
      },
    });

    assert.equal(res.statusCode, 201);

    const body = JSON.parse(res.payload);
    assert.equal(body.agentSession.windowCaptureMeta.rawLabel, "fallback-name");
    assert.equal(body.agentSession.displayName, "fallback-name");
  } finally {
    await app.close();
  }
});

test("POST /api/agent-sessions/window-capture empty payload gets default label", async () => {
  const app = await buildApp();

  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/window-capture",
      payload: {},
    });

    assert.equal(res.statusCode, 201);

    const body = JSON.parse(res.payload);
    assert.ok(body.agentSession.windowCaptureMeta);
    assert.equal(body.agentSession.windowCaptureMeta.rawLabel, "VS Code 窗口");
    assert.equal(body.agentSession.displayName, "VS Code 窗口");
  } finally {
    await app.close();
  }
});

test("PATCH /api/agent-sessions/:id renames a regular session", async () => {
  const app = await buildApp();

  try {
    const regRes = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/register",
      payload: {
        workspaceId: "default",
        agentKind: "claude",
        displayName: "normal-session",
        sourceType: "local",
      },
    });

    const session = JSON.parse(regRes.payload);

    const renameRes = await app.inject({
      method: "PATCH",
      url: `/api/agent-sessions/${session.id}`,
      payload: { displayName: "renamed-session" },
    });

    assert.equal(renameRes.statusCode, 200);
    const renamed = JSON.parse(renameRes.payload);
    assert.equal(renamed.displayName, "renamed-session");
  } finally {
    await app.close();
  }
});

test("PATCH /api/agent-sessions/:id renames a capture session without changing rawLabel", async () => {
  const app = await buildApp();

  try {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/window-capture",
      payload: {
        suggestedDisplayName: "window:57802:0",
        windowCaptureMeta: { rawLabel: "window:57802:0" },
      },
    });

    const { agentSession } = JSON.parse(createRes.payload);

    const renameRes = await app.inject({
      method: "PATCH",
      url: `/api/agent-sessions/${agentSession.id}`,
      payload: { displayName: "我的 VS Code 窗口" },
    });

    assert.equal(renameRes.statusCode, 200);
    const renamed = JSON.parse(renameRes.payload);
    assert.equal(renamed.displayName, "我的 VS Code 窗口");
    assert.equal(renamed.windowCaptureMeta.rawLabel, "window:57802:0");
  } finally {
    await app.close();
  }
});

test("PATCH /api/agent-sessions/:id rejects blank displayName", async () => {
  const app = await buildApp();

  try {
    const regRes = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/register",
      payload: {
        workspaceId: "default",
        agentKind: "claude",
        displayName: "normal-session",
        sourceType: "local",
      },
    });

    const session = JSON.parse(regRes.payload);

    const renameRes = await app.inject({
      method: "PATCH",
      url: `/api/agent-sessions/${session.id}`,
      payload: { displayName: "   " },
    });

    assert.equal(renameRes.statusCode, 400);
    const body = JSON.parse(renameRes.payload);
    assert.ok(body.error.includes("displayName"));
  } finally {
    await app.close();
  }
});

test("POST /api/agent-sessions/:id/focus-window rejects non-capture session", async () => {
  const app = await buildApp();

  try {
    // Register a normal session (not window-capture)
    const regRes = await app.inject({
      method: "POST",
      url: "/api/agent-sessions/register",
      payload: {
        workspaceId: "default",
        agentKind: "claude",
        displayName: "normal-session",
        sourceType: "local",
      },
    });

    const session = JSON.parse(regRes.payload);

    const focusRes = await app.inject({
      method: "POST",
      url: `/api/agent-sessions/${session.id}/focus-window`,
    });

    assert.equal(focusRes.statusCode, 400);
    const body = JSON.parse(focusRes.payload);
    assert.ok(body.error.includes("window-capture"));
  } finally {
    await app.close();
  }
});
