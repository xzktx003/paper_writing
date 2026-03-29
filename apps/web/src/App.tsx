import { useCallback, useEffect, useState } from "react";

import type {
  AgentSessionRecord,
  ListAgentSessionsResponse,
} from "@agent-orchestrator/shared";

import { AgentFocusView } from "./components/AgentFocusView";
import { AgentGrid } from "./components/AgentGrid";
import { BottomBar } from "./components/BottomBar";
import type { FilterState } from "./components/FilterBar";
import { SideDrawer } from "./components/SideDrawer";
import { TopBar } from "./components/TopBar";
import {
  deleteAgentSession,
  listAgentSessions,
  reconnectAgentSession,
  subscribeAgentSessions,
} from "./lib/api";
import "./app.css";

type ViewMode = "grid" | "focus";

export default function App() {
  const [snapshot, setSnapshot] = useState<ListAgentSessionsResponse | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    host: null,
    kind: null,
    transport: null,
    dirQuery: "",
  });

  useEffect(() => {
    listAgentSessions()
      .then((data) => {
        setSnapshot(data);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));

    const unsubscribe = subscribeAgentSessions((data) => {
      setSnapshot(data);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const sessions = snapshot?.items ?? [];

  const filteredSessions = sessions.filter((s) => {
    if (filters.host && (s.hostId ?? "local") !== filters.host) return false;
    if (filters.kind && s.agentKind !== filters.kind) return false;
    if (filters.transport === "tmux" && !s.transportRef?.tmuxSession) {
      return false;
    }
    if (
      filters.dirQuery &&
      !(s.workingDirectory ?? "")
        .toLowerCase()
        .includes(filters.dirQuery.toLowerCase())
    )
      return false;
    return true;
  });

  function handleFocusSession(id: string) {
    setFocusedId(id);
    setViewMode("focus");
  }

  const handleExitFocus = useCallback(() => {
    setViewMode("grid");
    setFocusedId(null);
  }, []);

  function handleSwitchFocus(id: string) {
    setFocusedId(id);
  }

  function handleLaunched() {
    listAgentSessions()
      .then(setSnapshot)
      .catch(() => {});
  }

  async function handleDeleteSession(id: string) {
    await deleteAgentSession(id);
    listAgentSessions()
      .then(setSnapshot)
      .catch(() => {});
  }

  async function handleReconnectSession(id: string) {
    await reconnectAgentSession(id);
    listAgentSessions()
      .then(setSnapshot)
      .catch(() => {});
  }

  const focusedSession: AgentSessionRecord | undefined = focusedId
    ? sessions.find((s) => s.id === focusedId)
    : undefined;

  return (
    <main className="app-shell-v2">
      <TopBar
        sessions={sessions}
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen(!drawerOpen)}
      />

      <div className="main-layout">
        <SideDrawer
          open={drawerOpen}
          sessions={sessions}
          onLaunched={handleLaunched}
          onFocusSession={handleFocusSession}
        />

        <div className="main-content">
          {isLoading ? (
            <div className="grid-empty">
              <p>正在加载...</p>
            </div>
          ) : viewMode === "focus" && focusedSession ? (
            <AgentFocusView
              focusedSession={focusedSession}
              sessions={sessions}
              onSwitchFocus={handleSwitchFocus}
              onExit={handleExitFocus}
              onReconnect={handleReconnectSession}
            />
          ) : (
            <AgentGrid
              sessions={filteredSessions}
              allSessions={sessions}
              filters={filters}
              onFiltersChange={setFilters}
              onFocusSession={handleFocusSession}
              onDeleteSession={handleDeleteSession}
              onReconnectSession={handleReconnectSession}
            />
          )}
        </div>
      </div>

      <BottomBar />
    </main>
  );
}
