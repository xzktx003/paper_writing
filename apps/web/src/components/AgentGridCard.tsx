import type { AgentSessionRecord } from "@agent-orchestrator/shared";

import { getWindowCaptureDisplay } from "../lib/window-capture-label";
import { CardMoreMenu } from "./CardMoreMenu";
import { TerminalView } from "./TerminalView";
import { WindowCapturePreview } from "./WindowCapturePreview";

interface AgentGridCardProps {
  session: AgentSessionRecord;
  onDoubleClick: (id: string) => void;
  onDelete: (id: string) => void;
  onReconnect: (id: string) => void;
  onRename?: (id: string) => void;
  onRemoveFromGrid?: (id: string) => void;
  onCopyConnectCommand?: (id: string) => void;
  onKillTmux?: (id: string) => void;
  captureStream?: MediaStream | null;
  onStopCapture?: (id: string) => void;
  terminalSuspended?: boolean;
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
  onRename,
  onRemoveFromGrid,
  onCopyConnectCommand,
  onKillTmux,
  captureStream,
  onStopCapture,
  terminalSuspended = false,
}: AgentGridCardProps) {
  const stateClass = stateColors[session.interactionState] ?? "";
  const stateLabel =
    stateLabels[session.interactionState] ?? session.interactionState;
  const isTmux = session.sourceType === "remote-tmux-discovered";
  const isTmuxManaged = Boolean(session.transportRef?.tmuxSession);
  const isWindowCapture = session.sourceType === "local-window-capture";
  const isExited = session.interactionState === "exited";
  const isDetached = session.interactionState === "detached";
  const canReconnect = isExited && !isTmux && !isWindowCapture;
  const canRemoveFromGrid = isTmux || isTmuxManaged;
  const canDelete = !isTmux && (!isWindowCapture || isExited || isDetached);
  const canStopCapture =
    isWindowCapture && !isExited && !isDetached && Boolean(captureStream);

  const captureDisplay = isWindowCapture
    ? getWindowCaptureDisplay(
        session.displayName,
        session.windowCaptureMeta?.rawLabel,
      )
    : null;

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
        <div className="grid-card-title-group">
          <span className="grid-card-name">
            {captureDisplay ? captureDisplay.title : session.displayName}
          </span>
          {captureDisplay?.appName && (
            <span className="grid-card-app-name">{captureDisplay.appName}</span>
          )}
        </div>
        <div className="grid-card-header-actions">
          <button
            className="grid-card-rename"
            onClick={(e) => {
              e.stopPropagation();
              onRename?.(session.id);
            }}
            title="修改名称"
            type="button"
          >
            ✎
          </button>
          {(isTmux || isTmuxManaged) && (
            <CardMoreMenu
              sessionId={session.id}
              isTmux={isTmux || isTmuxManaged}
              onRename={(id) => onRename?.(id)}
              onCopyConnectCommand={(id) => onCopyConnectCommand?.(id)}
              onKillTmux={(id) => onKillTmux?.(id)}
            />
          )}
          <span className={`grid-card-badge badge-${session.interactionState}`}>
            {stateLabel}
          </span>
          {canRemoveFromGrid && (
            <button
              className="grid-card-remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromGrid?.(session.id);
              }}
              title="从宫格移除"
              type="button"
            >
              ⊟
            </button>
          )}
          {canDelete && (
            <button
              className="grid-card-delete"
              onClick={handleDelete}
              title="删除会话"
              type="button"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="grid-card-terminal">
        {isWindowCapture ? (
          <WindowCapturePreview
            stream={captureStream ?? null}
            interactionState={session.interactionState}
            connectionState={session.connectionState}
          />
        ) : (
          <TerminalView
            agentSessionId={session.id}
            interactive={false}
            suspended={terminalSuspended}
          />
        )}
        {canReconnect && (
          <button className="grid-card-reconnect" onClick={handleReconnect}>
            🔄 重新连接
          </button>
        )}
        {canStopCapture && (
          <button
            className="grid-card-reconnect"
            onClick={(e) => {
              e.stopPropagation();
              onStopCapture?.(session.id);
            }}
          >
            ⏹ 停止观察
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
