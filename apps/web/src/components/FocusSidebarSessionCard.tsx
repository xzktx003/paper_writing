import { Suspense } from "react";

import type { AgentSessionRecord } from "@agent-orchestrator/shared";

import { LazyTerminalView } from "./LazyTerminalView";
import { TerminalPreview } from "./TerminalPreview";

interface FocusSidebarSessionCardProps {
  session: AgentSessionRecord;
  onSwitchFocus: (id: string) => void;
  onRename?: (id: string) => void;
  onDragStart?: (
    sessionId: string,
    event: React.DragEvent<HTMLDivElement>,
  ) => void;
  onContextMenu?: (
    session: AgentSessionRecord,
    event: React.MouseEvent<HTMLDivElement>,
  ) => void;
  useLightweightTerminalPreview?: boolean;
}

const stateLabels: Record<string, string> = {
  running: "运行中",
  idle: "空闲",
  awaiting_input: "等待输入",
  detached: "已分离",
  exited: "已退出",
};

export function FocusSidebarSessionCard({
  session,
  onSwitchFocus,
  onRename,
  onDragStart,
  onContextMenu,
  useLightweightTerminalPreview = true,
}: FocusSidebarSessionCardProps) {
  return (
    <div
      className={`focus-sidebar-card card-${session.interactionState}`}
      data-terminal-sidebar-menu-scope="other-session"
      data-session-id={session.id}
      draggable={Boolean(onDragStart)}
      onContextMenu={(event) => onContextMenu?.(session, event)}
      onDragStart={(event) => onDragStart?.(session.id, event)}
      onDoubleClick={() => onSwitchFocus(session.id)}
    >
      <div className="focus-sidebar-card-header">
        <span>{session.displayName}</span>
        <div className="focus-sidebar-card-actions">
          <button
            className="grid-card-rename"
            onClick={(event) => {
              event.stopPropagation();
              onRename?.(session.id);
            }}
            title="修改名称"
            type="button"
          >
            ✎
          </button>
          <span className={`grid-card-badge badge-${session.interactionState}`}>
            {stateLabels[session.interactionState] ?? session.interactionState}
          </span>
        </div>
      </div>
      <div className="focus-sidebar-terminal">
        {useLightweightTerminalPreview ? (
          <TerminalPreview session={session} variant="sidebar" />
        ) : (
          <Suspense
            fallback={<TerminalPreview session={session} variant="sidebar" />}
          >
            <LazyTerminalView agentSessionId={session.id} interactive={false} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
