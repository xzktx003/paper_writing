import { useCallback, useEffect, useRef, useState } from "react";

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
  createWindowCaptureSession,
  deleteAgentSession,
  focusAgentWindow,
  listAgentSessions,
  reconnectAgentSession,
  sendObserveState,
  subscribeAgentSessions,
  updateAgentSession,
} from "./lib/api";
import { requestWindowCapture, stopCapture } from "./lib/window-capture";
import "./app.css";

type ViewMode = "grid" | "focus";

interface CaptureEntry {
  stream: MediaStream;
  observeToken: string;
  label: string;
}

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

  // Window capture local store
  const captureStoreRef = useRef<Map<string, CaptureEntry>>(new Map());
  const [captureStoreVersion, setCaptureStoreVersion] = useState(0);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  function getCaptureStore(): Map<string, CaptureEntry> {
    return captureStoreRef.current;
  }

  function bumpCaptureVersion() {
    setCaptureStoreVersion((v) => v + 1);
  }

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

  // Heartbeat effect for active captures
  useEffect(() => {
    heartbeatIntervalRef.current = setInterval(() => {
      const store = getCaptureStore();
      for (const [sessionId, entry] of store) {
        sendObserveState(sessionId, {
          kind: "heartbeat",
          observeToken: entry.observeToken,
        }).catch(() => {});
      }
    }, 10_000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, []);

  // Cleanup captures on unmount
  useEffect(() => {
    return () => {
      const store = getCaptureStore();
      for (const [, entry] of store) {
        stopCapture(entry.stream);
      }
    };
  }, []);

  const handleAddWindowCapture = useCallback(async () => {
    const result = await requestWindowCapture();
    if (!result) return;

    try {
      const { agentSession, observeToken } = await createWindowCaptureSession({
        suggestedDisplayName: result.label,
        windowCaptureMeta: { rawLabel: result.label },
      });

      const entry: CaptureEntry = {
        stream: result.stream,
        observeToken,
        label: result.label,
      };

      getCaptureStore().set(agentSession.id, entry);
      bumpCaptureVersion();

      // Listen for track ended
      const track = result.stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          sendObserveState(agentSession.id, {
            kind: "transition",
            observeToken,
            connectionState: "offline",
            interactionState: "exited",
            stateConfidence: "high",
            outputPreview: "窗口共享已结束",
          }).catch(() => {});
          getCaptureStore().delete(agentSession.id);
          bumpCaptureVersion();
        };
      }

      listAgentSessions()
        .then(setSnapshot)
        .catch(() => {});
    } catch {
      stopCapture(result.stream);
    }
  }, []);

  const handleStopCapture = useCallback(async (sessionId: string) => {
    const store = getCaptureStore();
    const entry = store.get(sessionId);
    if (entry) {
      stopCapture(entry.stream);
      await sendObserveState(sessionId, {
        kind: "transition",
        observeToken: entry.observeToken,
        connectionState: "offline",
        interactionState: "exited",
        stateConfidence: "high",
        outputPreview: "观察已停止",
      }).catch(() => {});
      store.delete(sessionId);
      bumpCaptureVersion();
    }
    listAgentSessions()
      .then(setSnapshot)
      .catch(() => {});
  }, []);

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

  const handleRenameSession = useCallback(
    async (id: string) => {
      const session = sessions.find((item) => item.id === id);
      if (!session) {
        return;
      }

      const promptMessage =
        session.sourceType === "local-window-capture" &&
        session.windowCaptureMeta?.rawLabel
          ? `输入新的会话名称\n原始标签：${session.windowCaptureMeta.rawLabel}`
          : "输入新的会话名称";

      const nextName = window.prompt(promptMessage, session.displayName);
      if (nextName === null) {
        return;
      }

      const displayName = nextName.trim();
      if (!displayName) {
        window.alert("名称不能为空");
        return;
      }

      if (displayName === session.displayName) {
        return;
      }

      await updateAgentSession(id, { displayName }).catch(() => {});
      listAgentSessions()
        .then(setSnapshot)
        .catch(() => {});
    },
    [sessions],
  );

  const handleFocusWindow = useCallback(async (sessionId: string) => {
    await focusAgentWindow(sessionId).catch(() => {});
  }, []);

  const focusedSession: AgentSessionRecord | undefined = focusedId
    ? sessions.find((s) => s.id === focusedId)
    : undefined;

  const getCaptureStreamForSession = useCallback(
    (id: string): MediaStream | null => {
      return getCaptureStore().get(id)?.stream ?? null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [captureStoreVersion],
  );

  return (
    <main className="app-shell-v2">
      <TopBar
        sessions={sessions}
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen(!drawerOpen)}
        onOpenQuickTmuxConnect={() => setQuickTmuxOpen(true)}
        onAddWindowCapture={handleAddWindowCapture}
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
              onRename={handleRenameSession}
              captureStream={getCaptureStreamForSession(focusedSession.id)}
              onStopCapture={handleStopCapture}
              onFocusWindow={handleFocusWindow}
              getCaptureStream={getCaptureStreamForSession}
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
              onRenameSession={handleRenameSession}
              getCaptureStream={getCaptureStreamForSession}
              onStopCapture={handleStopCapture}
              onFocusWindow={handleFocusWindow}
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
