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
  getCaptureStream?: (id: string) => MediaStream | null;
  onStopCapture?: (id: string) => void;
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
  getCaptureStream,
  onStopCapture,
}: AgentGridProps) {
  return (
    <div className="agent-grid-container">
      <FilterBar
        sessions={allSessions}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
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
              captureStream={getCaptureStream?.(session.id)}
              onStopCapture={onStopCapture}
            />
          ))}
        </div>
      )}
    </div>
  );
}
