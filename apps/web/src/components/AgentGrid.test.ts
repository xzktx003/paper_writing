import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AgentSessionRecord } from "@agent-orchestrator/shared";

import { AgentGrid } from "./AgentGrid.js";

function makeSession(
  overrides: Partial<AgentSessionRecord> = {},
): AgentSessionRecord {
  return {
    id: overrides.id ?? "session-default",
    workspaceId: "default",
    sourceType: "local",
    agentKind: "codex",
    displayName: "Default Session",
    workingDirectory: "/data01/home/xuzk/workspace/coding_kanban",
    connectionState: "online",
    interactionState: "idle",
    outputPreview: "ready",
    ...overrides,
  };
}

describe("AgentGrid", () => {
  it("shows running and awaiting-input counts as compact grid toolbar chips", () => {
    const sessions = [
      makeSession({
        id: "running-session",
        displayName: "Running Session",
        interactionState: "running",
      }),
      makeSession({
        id: "awaiting-session",
        displayName: "Awaiting Session",
        interactionState: "awaiting_input",
      }),
      makeSession({
        id: "idle-session",
        displayName: "Idle Session",
        interactionState: "idle",
      }),
    ];

    const markup = renderToStaticMarkup(
      createElement(AgentGrid, {
        sessions,
        allSessions: sessions,
        filters: {
          host: null,
          kind: null,
          transport: null,
          dirQuery: "",
        },
        hiddenCount: 2,
        onDeleteSession: () => {},
        onFiltersChange: () => {},
        onFocusSession: () => {},
        onReconnectSession: () => {},
        onShowHidden: () => {},
      }),
    );

    assert.match(markup, /class="agent-grid-toolbar-actions"/);
    assert.match(markup, /class="hidden-sessions-btn"[^>]*>已隐藏 \(2\)/);
    assert.match(
      markup,
      /class="stat-item stat-awaiting grid-status-chip"[^>]*>🟡 1 等待输入/,
    );
    assert.match(
      markup,
      /class="stat-item stat-running grid-status-chip"[^>]*>🟢 1 运行中/,
    );
  });
});
