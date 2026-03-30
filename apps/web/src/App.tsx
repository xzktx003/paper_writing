import { useCallback, useEffect, useState } from "react";

import type {
  AgentSessionRecord,
  ListAgentSessionsResponse,
} from "@agent-orchestrator/shared";

import { AgentFocusView } from "./components/AgentFocusView";
import { AgentGrid } from "./components/AgentGrid";
import { BottomBar } from "./components/BottomBar";
import type { FilterState } from "./components/FilterBar";
import { QuickTmuxConnect } from "./components/QuickTmuxConnect";
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

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }

  if (element.classList.contains("xterm-helper-textarea")) {
    return true;
  }

  return Boolean(
    element.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
    ),
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<ListAgentSessionsResponse | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [quickTmuxOpen, setQuickTmuxOpen] = useState(false);
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      if (event.key.toLowerCase() !== "e") {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setQuickTmuxOpen(true);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
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

  const handleQuickTmuxConnected = useCallback(
    (session: AgentSessionRecord) => {
      setSnapshot((current) => {
        const items = current?.items ?? [];
        return {
          items: [session, ...items.filter((item) => item.id !== session.id)],
          activeAgentSessionId: session.id,
          updatedAt: new Date().toISOString(),
        };
      });
      setFocusedId(session.id);
      setViewMode("focus");
      setQuickTmuxOpen(false);

      listAgentSessions()
        .then(setSnapshot)
        .catch(() => {});
    },
    [],
  );

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
        onOpenQuickTmuxConnect={() => setQuickTmuxOpen(true)}
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

      <QuickTmuxConnect
        open={quickTmuxOpen}
        onClose={() => setQuickTmuxOpen(false)}
        onConnected={handleQuickTmuxConnected}
      />
    </main>
  );
}
