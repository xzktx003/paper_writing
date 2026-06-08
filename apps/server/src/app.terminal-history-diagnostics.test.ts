import assert from "node:assert/strict";
import test from "node:test";

import type { TerminalHistoryDiagnosticsResponse } from "@agent-orchestrator/shared";

import { buildServer } from "./app.js";

test("GET /api/diagnostics/terminal-history reports configured history limits", async () => {
  const { app } = buildServer({
    terminalHistoryConfig: {
      terminalRegistryOutputEntries: 321,
      terminalScrollbackBytes: 123456,
      terminalTmuxCaptureLines: 654,
    },
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/diagnostics/terminal-history",
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as TerminalHistoryDiagnosticsResponse;
    assert.equal(payload.pty.maxScrollbackBytes, 123456);
    assert.equal(payload.registry.maxOutputEntries, 321);
    assert.equal(payload.tmux.captureLines, 654);
    assert.equal(payload.pty.activeSessions, 0);
    assert.equal(payload.pty.truncatedSessionCount, 0);
  } finally {
    await app.close();
  }
});
