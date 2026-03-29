import type { AgentSessionRecord } from "@agent-orchestrator/shared";

import { TerminalView } from "./TerminalView";

interface AgentGridCardProps {
  session: AgentSessionRecord;
  onDoubleClick: (id: string) => void;
  onDelete: (id: string) => void;
  onReconnect: (id: string) => void;
}

const stateLabels: Record<string, string> = {
  running: "运行中",
  idle: "空闲",
  awaiting_input: "等待输入",
  detached: "已分离",
  exited: "已退出",
};

const stateColors: Record<string, string> = {
  running: "card-running",
  idle: "card-idle",
  awaiting_input: "card-awaiting",
  detached: "card-detached",
  exited: "card-exited",
};

function shortenPath(dir?: string): string {
  if (!dir) return "";
  let p = dir;
  p = p.replace(/^\/(?:data\d+\/)?home\/[^/]+\//, "~/");
  if (p.startsWith("~/")) {
    const parts = p.slice(2).split("/").filter(Boolean);
    if (parts.length > 2) {
      return "~/" + parts.slice(-2).join("/");
    }
    return p;
  }
  const parts = p.split("/").filter(Boolean);
  if (parts.length > 2) {
    return "…/" + parts.slice(-2).join("/");
  }
  return p;
}

export function AgentGridCard({
  session,
  onDoubleClick,
  onDelete,
  onReconnect,
}: AgentGridCardProps) {
  const stateClass = stateColors[session.interactionState] ?? "";
  const stateLabel =
    stateLabels[session.interactionState] ?? session.interactionState;
  const isTmux = session.sourceType === "remote-tmux-discovered";
  const isTmuxManaged = Boolean(session.transportRef?.tmuxSession);
  const isExited = session.interactionState === "exited";
  const canReconnect = isExited && !isTmux;
  const canDelete = !isTmux;

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isExited) {
      if (!window.confirm("会话仍在运行中，确定关闭？")) return;
    }
    onDelete(session.id);
  }

  function handleReconnect(e: React.MouseEvent) {
    e.stopPropagation();
    onReconnect(session.id);
  }

  return (
    <div
      className={`grid-card ${stateClass}`}
      onDoubleClick={() => onDoubleClick(session.id)}
    >
      <div className="grid-card-header">
        <span className="grid-card-name">{session.displayName}</span>
        <span className={`grid-card-badge badge-${session.interactionState}`}>
          {stateLabel}
        </span>
        {canDelete && (
          <button
            className="grid-card-delete"
            onClick={handleDelete}
            title="删除会话"
          >
            ×
          </button>
        )}
      </div>
      <div className="grid-card-terminal">
        <TerminalView agentSessionId={session.id} interactive={false} />
        {canReconnect && (
          <button className="grid-card-reconnect" onClick={handleReconnect}>
            🔄 重新连接
          </button>
        )}
      </div>
      <div className="grid-card-footer">
        <span className="grid-card-kind">{session.agentKind}</span>
        {isTmuxManaged && <span className="grid-card-tag">tmux</span>}
        <span className="grid-card-dir">
          {shortenPath(session.workingDirectory)}
        </span>
        <span className="grid-card-host">
          {session.hostId && session.hostId !== "local"
            ? session.hostId
            : "本地"}
        </span>
      </div>
    </div>
  );
}
