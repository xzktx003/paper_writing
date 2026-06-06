import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import type { AgentSessionRecord } from "@agent-orchestrator/shared";

import { FocusSidebarSessionCard } from "./FocusSidebarSessionCard";
import { LazyTerminalView } from "./LazyTerminalView";
import { TerminalPreview } from "./TerminalPreview";
import {
  TERMINAL_MONITOR_LAYOUT_OPTIONS,
  areTerminalMonitorSlotsEqual,
  getTerminalMonitorSlotIds,
  isTerminalMonitorLayoutMode,
  normalizeTerminalMonitorSlots,
  placeTerminalMonitorSlotSession,
  setTerminalMonitorSlotSession,
  type TerminalMonitorLayoutMode,
  type TerminalMonitorSlot,
} from "../lib/terminal-layout";

interface AgentFocusViewProps {
  focusedSession: AgentSessionRecord;
  sessions: AgentSessionRecord[];
  onSwitchFocus: (id: string) => void;
  onExit: () => void;
  onReconnect: (id: string) => void;
  onRename?: (id: string) => void;
  useLightweightTerminalPreview?: boolean;
}

const stateLabels: Record<string, string> = {
  running: "运行中",
  idle: "空闲",
  awaiting_input: "等待输入",
  detached: "已分离",
  exited: "已退出",
};

const TERMINAL_MONITOR_LAYOUT_STORAGE_KEY = "terminal-monitor-layout-mode";
const DEFAULT_TERMINAL_MONITOR_SLOT_ID = "terminal-monitor-slot-1";
const FOCUS_HEADER_COLLAPSED_STORAGE_KEY = "focus-header-collapsed";
const TERMINAL_MONITOR_DRAG_MIME =
  "application/x-coding-kanban-terminal-session";

interface TerminalMonitorDragPayload {
  sessionId: string;
  sourceSlotId?: string;
}

function loadTerminalMonitorLayoutMode(): TerminalMonitorLayoutMode {
  try {
    const raw = localStorage.getItem(TERMINAL_MONITOR_LAYOUT_STORAGE_KEY);
    return isTerminalMonitorLayoutMode(raw) ? raw : "single";
  } catch {
    return "single";
  }
}

function saveTerminalMonitorLayoutMode(mode: TerminalMonitorLayoutMode): void {
  try {
    localStorage.setItem(TERMINAL_MONITOR_LAYOUT_STORAGE_KEY, mode);
  } catch {
    // ignore storage failures
  }
}

function loadFocusHeaderCollapsed(): boolean {
  try {
    return localStorage.getItem(FOCUS_HEADER_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveFocusHeaderHeaderCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(FOCUS_HEADER_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // ignore storage failures
  }
}

function readTerminalMonitorDragPayload(
  dataTransfer: DataTransfer,
): TerminalMonitorDragPayload | null {
  const raw =
    dataTransfer.getData(TERMINAL_MONITOR_DRAG_MIME) ||
    dataTransfer.getData("text/plain");
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TerminalMonitorDragPayload>;
    return typeof parsed.sessionId === "string"
      ? {
          sessionId: parsed.sessionId,
          sourceSlotId:
            typeof parsed.sourceSlotId === "string"
              ? parsed.sourceSlotId
              : undefined,
        }
      : null;
  } catch {
    return { sessionId: raw };
  }
}

export function AgentFocusView({
  focusedSession,
  sessions,
  onSwitchFocus,
  onExit,
  onReconnect,
  onRename,
  useLightweightTerminalPreview = true,
}: AgentFocusViewProps) {
  const [terminalLayoutMode, setTerminalLayoutMode] =
    useState<TerminalMonitorLayoutMode>(loadTerminalMonitorLayoutMode);
  const [activeSlotId, setActiveSlotId] = useState(
    DEFAULT_TERMINAL_MONITOR_SLOT_ID,
  );
  const [terminalSlots, setTerminalSlots] = useState<TerminalMonitorSlot[]>(
    () =>
      normalizeTerminalMonitorSlots({
        mode: terminalLayoutMode,
        sessions,
        preferredSessionId: focusedSession.id,
        preferredSlotId: DEFAULT_TERMINAL_MONITOR_SLOT_ID,
      }),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(
    loadFocusHeaderCollapsed,
  );
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);
  const layoutMenuRef = useRef<HTMLDivElement | null>(null);
  const sessionById = useMemo(() => {
    return new Map(sessions.map((session) => [session.id, session]));
  }, [sessions]);
  const renderedSessionIds = new Set(
    terminalSlots
      .map((slot) => slot.sessionId)
      .filter((sessionId): sessionId is string => Boolean(sessionId)),
  );
  const usedSessionIds = renderedSessionIds;
  const otherSessions = sessions.filter(
    (session) => !renderedSessionIds.has(session.id),
  );
  const activeSlotAvailable = terminalSlots.some(
    (slot) => slot.id === activeSlotId,
  );
  const safeActiveSlotId = activeSlotAvailable
    ? activeSlotId
    : (terminalSlots[0]?.id ?? DEFAULT_TERMINAL_MONITOR_SLOT_ID);
  const activeLayoutOption =
    TERMINAL_MONITOR_LAYOUT_OPTIONS.find(
      (option) => option.mode === terminalLayoutMode,
    ) ?? TERMINAL_MONITOR_LAYOUT_OPTIONS[0]!;

  useEffect(() => {
    saveTerminalMonitorLayoutMode(terminalLayoutMode);
  }, [terminalLayoutMode]);

  useEffect(() => {
    saveFocusHeaderHeaderCollapsed(headerCollapsed);
  }, [headerCollapsed]);

  useEffect(() => {
    if (!layoutMenuOpen) {
      return;
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (
        target &&
        layoutMenuRef.current &&
        !layoutMenuRef.current.contains(target)
      ) {
        setLayoutMenuOpen(false);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLayoutMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [layoutMenuOpen]);

  useEffect(() => {
    const availableSlotIds = getTerminalMonitorSlotIds(terminalLayoutMode);
    const nextActiveSlotId = availableSlotIds.includes(activeSlotId)
      ? activeSlotId
      : availableSlotIds[0]!;

    if (nextActiveSlotId !== activeSlotId) {
      setActiveSlotId(nextActiveSlotId);
    }

    setTerminalSlots((current) => {
      const next = normalizeTerminalMonitorSlots({
        mode: terminalLayoutMode,
        sessions,
        preferredSessionId: focusedSession.id,
        preferredSlotId: nextActiveSlotId,
        previousSlots: current,
      });

      return areTerminalMonitorSlotsEqual(current, next) ? current : next;
    });
  }, [activeSlotId, focusedSession.id, sessions, terminalLayoutMode]);

  function getActiveTerminalTextarea(): HTMLTextAreaElement | null {
    return document.querySelector(
      '[data-active-terminal-pane="true"] .xterm-helper-textarea',
    ) as HTMLTextAreaElement | null;
  }

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (
      active?.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="dialog"], [role="alertdialog"]',
      )
    ) {
      return;
    }

    getActiveTerminalTextarea()?.focus();
  }, [focusedSession.id, safeActiveSlotId, terminalLayoutMode, terminalSlots]);

  function activateSlot(slot: TerminalMonitorSlot) {
    if (!slot.sessionId) {
      return;
    }

    setActiveSlotId(slot.id);
    if (slot.sessionId !== focusedSession.id) {
      onSwitchFocus(slot.sessionId);
    }
  }

  function handlePanePointerDownCapture(
    slot: TerminalMonitorSlot,
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        'button, input, textarea, select, a, [contenteditable="true"], [contenteditable=""]',
      )
    ) {
      return;
    }

    activateSlot(slot);
  }

  function handleSelectSlotSession(slotId: string, sessionId: string) {
    if (!sessionId) {
      return;
    }

    setTerminalSlots((current) =>
      setTerminalMonitorSlotSession(current, slotId, sessionId),
    );
    setActiveSlotId(slotId);
    if (sessionId !== focusedSession.id) {
      onSwitchFocus(sessionId);
    }
  }

  function placeSessionInSlot(
    slotId: string,
    sessionId: string,
    sourceSlotId?: string,
  ) {
    if (!sessionById.has(sessionId)) {
      return;
    }

    setTerminalSlots((current) =>
      placeTerminalMonitorSlotSession(current, slotId, sessionId, sourceSlotId),
    );
    setActiveSlotId(slotId);
    if (sessionId !== focusedSession.id) {
      onSwitchFocus(sessionId);
    }
  }

  function startSessionDrag(
    sessionId: string,
    event: React.DragEvent<HTMLElement>,
    sourceSlotId?: string,
  ) {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        'button, input, textarea, select, a, [contenteditable="true"], [contenteditable=""]',
      )
    ) {
      event.preventDefault();
      return;
    }

    const payload: TerminalMonitorDragPayload = {
      sessionId,
      sourceSlotId,
    };
    const serialized = JSON.stringify(payload);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(TERMINAL_MONITOR_DRAG_MIME, serialized);
    event.dataTransfer.setData("text/plain", serialized);
  }

  function handleSlotDragOver(
    slotId: string,
    event: React.DragEvent<HTMLDivElement>,
  ) {
    if (!event.dataTransfer.types.includes(TERMINAL_MONITOR_DRAG_MIME)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverSlotId(slotId);
  }

  function handleSlotDrop(
    slotId: string,
    event: React.DragEvent<HTMLDivElement>,
  ) {
    const payload = readTerminalMonitorDragPayload(event.dataTransfer);
    if (!payload) {
      return;
    }

    event.preventDefault();
    setDragOverSlotId(null);
    placeSessionInSlot(slotId, payload.sessionId, payload.sourceSlotId);
  }

  function handleSidebarSwitchFocus(sessionId: string) {
    const slotId = safeActiveSlotId;
    setTerminalSlots((current) =>
      setTerminalMonitorSlotSession(current, slotId, sessionId),
    );
    setActiveSlotId(slotId);
    if (sessionId !== focusedSession.id) {
      onSwitchFocus(sessionId);
    }
  }

  function handleLayoutModeChange(mode: TerminalMonitorLayoutMode) {
    setTerminalLayoutMode(mode);
    setLayoutMenuOpen(false);
    const slotIds = getTerminalMonitorSlotIds(mode);
    if (!slotIds.includes(activeSlotId)) {
      setActiveSlotId(slotIds[0] ?? DEFAULT_TERMINAL_MONITOR_SLOT_ID);
    }
  }

  function handleFocusViewPointerDownCapture(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    // Static header/text regions inside focus view are effectively part of the
    // terminal workspace. If the user clicks them, keep the terminal ready for
    // immediate typing instead of leaving focus on the document body and
    // relying on synthetic key forwarding.
    if (target.closest(".focus-terminal-pane-terminal")) {
      return;
    }

    if (
      target.closest(
        'button, input, textarea, select, a, [contenteditable="true"], [contenteditable=""], [role="dialog"], [role="alertdialog"]',
      )
    ) {
      return;
    }

    getActiveTerminalTextarea()?.focus();
  }

  useEffect(() => {
    function isInActiveTerminal(node: HTMLElement | null): boolean {
      return Boolean(
        node?.closest(
          '[data-active-terminal-pane="true"] .focus-terminal-pane-terminal',
        ) ||
        (node?.classList.contains("xterm-helper-textarea") &&
          node.closest('[data-active-terminal-pane="true"]')),
      );
    }

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const active = document.activeElement as HTMLElement | null;

      if (e.key === "Escape") {
        // Esc is reserved for dialog-like interactions; never use it to exit focus mode.
        if (!isInActiveTerminal(target) && !isInActiveTerminal(active)) {
          e.stopPropagation();
        }
        return;
      }

      const isExitShortcut =
        e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey &&
        (e.code === "KeyQ" || e.key.toLowerCase() === "q");

      if (isExitShortcut) {
        e.preventDefault();
        e.stopPropagation();
        onExit();
        return;
      }

      // Buttons and anchors are not text-entry surfaces. If they keep focus,
      // printable keys must be redirected back into the active terminal
      // instead of being dropped on the floor while a TUI like Copilot is
      // waiting for stdin.
      const inInput =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        active?.isContentEditable ||
        active?.closest('[role="dialog"]') !== null ||
        active?.closest('[role="alertdialog"]') !== null;
      if (
        !inInput &&
        !isInActiveTerminal(target) &&
        !isInActiveTerminal(active)
      ) {
        const textarea = getActiveTerminalTextarea();
        if (textarea) {
          e.preventDefault();
          textarea.focus();
          const forwarded = new KeyboardEvent("keydown", {
            key: e.key,
            code: e.code,
            keyCode: e.keyCode,
            which: e.which,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
            repeat: e.repeat,
            bubbles: true,
            cancelable: true,
            composed: true,
          });
          textarea.dispatchEvent(forwarded);
          e.stopPropagation();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onExit, safeActiveSlotId]);

  return (
    <div
      className={`focus-view${sidebarCollapsed ? " focus-view--sidebar-collapsed" : ""}`}
      onPointerDownCapture={handleFocusViewPointerDownCapture}
    >
      <div className="focus-main">
        <div
          className={`focus-main-header${headerCollapsed ? " focus-main-header--collapsed" : ""}`}
        >
          <button
            className="focus-header-collapse-btn"
            onClick={() => setHeaderCollapsed((c) => !c)}
            title={headerCollapsed ? "展开标题栏" : "折叠标题栏"}
            type="button"
          >
            {headerCollapsed ? "▼" : "▲"}
          </button>
          <span className="focus-main-name">{focusedSession.displayName}</span>
          {!headerCollapsed && (
            <>
              <span
                className={`grid-card-badge badge-${focusedSession.interactionState}`}
              >
                {stateLabels[focusedSession.interactionState] ??
                  focusedSession.interactionState}
              </span>
              <button
                className="focus-rename-btn"
                onClick={() => onRename?.(focusedSession.id)}
                type="button"
              >
                ✎ 改名
              </button>
              <div
                aria-label="终端监控布局"
                className="focus-layout-menu"
                ref={layoutMenuRef}
              >
                <button
                  aria-expanded={layoutMenuOpen}
                  aria-haspopup="menu"
                  className="focus-layout-menu-trigger"
                  onClick={() => setLayoutMenuOpen((current) => !current)}
                  title="选择终端监控屏幕布局"
                  type="button"
                >
                  屏幕布局
                  <span className="focus-layout-menu-current">
                    {activeLayoutOption.label}
                  </span>
                  <span className="focus-layout-menu-count">
                    {activeLayoutOption.capacity}
                  </span>
                  <span
                    aria-hidden="true"
                    className="focus-layout-menu-chevron"
                  >
                    ▾
                  </span>
                </button>
                {layoutMenuOpen && (
                  <div className="focus-layout-menu-options" role="menu">
                    {TERMINAL_MONITOR_LAYOUT_OPTIONS.map((option) => (
                      <button
                        key={option.mode}
                        aria-checked={terminalLayoutMode === option.mode}
                        className={`focus-layout-option${terminalLayoutMode === option.mode ? " focus-layout-option--active" : ""}`}
                        onClick={() => handleLayoutModeChange(option.mode)}
                        role="menuitemradio"
                        title={`${option.label}监控 ${option.capacity} 个终端`}
                        type="button"
                      >
                        <span>{option.label}</span>
                        <strong>{option.capacity}</strong>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="focus-exit-btn" onClick={onExit} title="Alt+Q">
                返回宫格
              </button>
              {focusedSession.interactionState === "exited" &&
                focusedSession.sourceType !== "remote-tmux-discovered" && (
                  <button
                    className="focus-reconnect-btn"
                    onClick={() => onReconnect(focusedSession.id)}
                  >
                    🔄 重新连接
                  </button>
                )}
            </>
          )}
        </div>
        <div className="focus-main-terminal">
          <div
            className={`focus-terminal-layout focus-terminal-layout--${terminalLayoutMode}`}
          >
            {terminalSlots.map((slot, index) => {
              const session = slot.sessionId
                ? sessionById.get(slot.sessionId)
                : null;
              const isActiveInputPane = Boolean(
                session && slot.id === safeActiveSlotId,
              );

              return (
                <div
                  key={slot.id}
                  className={`focus-terminal-pane${isActiveInputPane ? " focus-terminal-pane--active" : ""}${dragOverSlotId === slot.id ? " focus-terminal-pane--drag-over" : ""}`}
                  data-active-terminal-pane={
                    isActiveInputPane ? "true" : "false"
                  }
                  data-terminal-pane-slot={slot.id}
                  data-terminal-pane-session={session?.id}
                  onDragLeave={() => {
                    if (dragOverSlotId === slot.id) {
                      setDragOverSlotId(null);
                    }
                  }}
                  onDragOver={(event) => handleSlotDragOver(slot.id, event)}
                  onDrop={(event) => handleSlotDrop(slot.id, event)}
                  onPointerDownCapture={(event) =>
                    handlePanePointerDownCapture(slot, event)
                  }
                >
                  <div
                    className="focus-terminal-pane-header"
                    draggable={Boolean(session)}
                    onDragStart={(event) => {
                      if (session) {
                        startSessionDrag(session.id, event, slot.id);
                      }
                    }}
                  >
                    <span className="focus-terminal-pane-index">
                      {index + 1}
                    </span>
                    <select
                      aria-label={`选择第 ${index + 1} 个监控终端`}
                      className="focus-terminal-session-select"
                      onChange={(event) =>
                        handleSelectSlotSession(slot.id, event.target.value)
                      }
                      value={session?.id ?? ""}
                    >
                      {!session && <option value="">无可用会话</option>}
                      {sessions.map((candidate) => {
                        const usedElsewhere =
                          usedSessionIds.has(candidate.id) &&
                          candidate.id !== session?.id;

                        return (
                          <option
                            key={candidate.id}
                            disabled={usedElsewhere}
                            value={candidate.id}
                          >
                            {candidate.displayName}
                            {usedElsewhere ? "（已显示）" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      className={`focus-terminal-input-btn${isActiveInputPane ? " focus-terminal-input-btn--active" : ""}`}
                      disabled={!session || isActiveInputPane}
                      onClick={() => activateSlot(slot)}
                      type="button"
                    >
                      {isActiveInputPane ? "输入中" : "设为输入"}
                    </button>
                  </div>
                  <div className="focus-terminal-pane-terminal">
                    {session ? (
                      <Suspense
                        fallback={<TerminalPreview session={session} />}
                      >
                        <LazyTerminalView
                          key={session.id}
                          agentSessionId={session.id}
                          interactive={true}
                          inputEnabled={isActiveInputPane}
                        />
                      </Suspense>
                    ) : (
                      <div className="focus-terminal-empty">暂无可监控会话</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {otherSessions.length > 0 && (
        <>
          <div className="focus-sidebar-toggle">
            <button
              className="focus-sidebar-toggle-btn"
              data-testid="focus-sidebar-collapse-toggle"
              onClick={() => setSidebarCollapsed((current) => !current)}
              title={sidebarCollapsed ? "展开右侧其他会话" : "折叠右侧其他会话"}
              type="button"
            >
              {sidebarCollapsed ? "⟨" : "⟩"}
            </button>
          </div>
          {!sidebarCollapsed && (
            <div className="focus-sidebar">
              <h3 className="focus-sidebar-title">其他会话</h3>
              {otherSessions.map((session) => (
                <FocusSidebarSessionCard
                  key={session.id}
                  session={session}
                  onDragStart={startSessionDrag}
                  onRename={onRename}
                  onSwitchFocus={handleSidebarSwitchFocus}
                  useLightweightTerminalPreview={useLightweightTerminalPreview}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
