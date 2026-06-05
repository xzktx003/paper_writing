import type { AgentSessionRecord } from "@agent-orchestrator/shared";

import { AgentGridCard } from "./AgentGridCard";
import { FilterBar, type FilterState } from "./FilterBar";

interface AgentGridProps {
  sessions: AgentSessionRecord[];
  allSessions: AgentSessionRecord[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onFocusSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onReconnectSession: (id: string) => void;
  onRenameSession?: (id: string) => void;
  onHideSession?: (id: string) => void;
  onCopyConnectCommand?: (id: string) => void;
  onKillTmux?: (id: string) => void;
  suspendedSessionId?: string | null;
  hiddenCount?: number;
  onShowHidden?: () => void;
  useLightweightTerminalPreview?: boolean;
}

export function AgentGrid({
  sessions,
  allSessions,
  filters,
  onFiltersChange,
  onFocusSession,
  onDeleteSession,
  onReconnectSession,
  onRenameSession,
  onHideSession,
  onCopyConnectCommand,
  onKillTmux,
  suspendedSessionId,
  hiddenCount = 0,
  onShowHidden,
  useLightweightTerminalPreview = true,
}: AgentGridProps) {
  const runningCount = sessions.filter(
    (session) => session.interactionState === "running",
  ).length;
  const awaitingCount = sessions.filter(
    (session) => session.interactionState === "awaiting_input",
  ).length;

  return (
    <div className="agent-grid-container">
      <div className="agent-grid-toolbar">
        <FilterBar
          sessions={allSessions}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
        <div className="agent-grid-toolbar-actions">
          {hiddenCount > 0 && (
            <button
              className="hidden-sessions-btn"
              onClick={onShowHidden}
              type="button"
            >
              已隐藏 ({hiddenCount})
            </button>
          )}
          {awaitingCount > 0 && (
            <span
              className="stat-item stat-awaiting grid-status-chip"
              data-testid="grid-stat-awaiting"
            >
              🟡 {awaitingCount} 等待输入
            </span>
          )}
          {runningCount > 0 && (
            <span
              className="stat-item stat-running grid-status-chip"
              data-testid="grid-stat-running"
            >
              🟢 {runningCount} 运行中
            </span>
          )}
        </div>
      </div>
      {sessions.length === 0 ? (
        <div className="grid-empty">
          <p>
            {allSessions.length > 0
              ? "没有匹配的会话，试试调整筛选条件"
              : "暂无 Agent 会话"}
          </p>
          {allSessions.length === 0 && <p>点击左侧面板启动或扫描 Agent</p>}
        </div>
      ) : (
        <div className="agent-grid">
          {sessions.map((session) => (
            <AgentGridCard
              key={session.id}
              session={session}
              onDoubleClick={onFocusSession}
              onDelete={onDeleteSession}
              onReconnect={onReconnectSession}
              onRename={onRenameSession}
              onHide={onHideSession}
              onCopyConnectCommand={onCopyConnectCommand}
              onKillTmux={onKillTmux}
              terminalSuspended={session.id === suspendedSessionId}
              useLightweightTerminalPreview={useLightweightTerminalPreview}
            />
          ))}
        </div>
      )}
    </div>
  );
}
