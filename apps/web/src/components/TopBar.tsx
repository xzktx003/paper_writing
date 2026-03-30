import type { AgentSessionRecord } from "@agent-orchestrator/shared";

interface TopBarProps {
  sessions: AgentSessionRecord[];
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  onOpenQuickTmuxConnect: () => void;
}

export function TopBar({
  sessions,
  drawerOpen,
  onToggleDrawer,
  onOpenQuickTmuxConnect,
}: TopBarProps) {
  const runningCount = sessions.filter(
    (s) => s.interactionState === "running",
  ).length;
  const awaitingCount = sessions.filter(
    (s) => s.interactionState === "awaiting_input",
  ).length;
  const totalCount = sessions.length;

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button
          className="drawer-toggle"
          onClick={onToggleDrawer}
          title={drawerOpen ? "收起面板" : "展开面板"}
        >
          {drawerOpen ? "◀" : "▶"}
        </button>
        <h1 className="top-bar-title">Agent 控制台</h1>
      </div>
      <div className="top-bar-stats">
        <button className="top-bar-action" onClick={onOpenQuickTmuxConnect}>
          快速连接 tmux
          <span className="top-bar-shortcut">⌘/Ctrl+E</span>
        </button>
        <span className="stat-item">
          共 <strong>{totalCount}</strong> 个会话
        </span>
        {runningCount > 0 && (
          <span className="stat-item stat-running">
            🟢 {runningCount} 运行中
          </span>
        )}
        {awaitingCount > 0 && (
          <span className="stat-item stat-awaiting">
            🟡 {awaitingCount} 等待输入
          </span>
        )}
      </div>
    </header>
  );
}
