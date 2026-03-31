import { useEffect, useState } from "react";

import type {
  AgentSessionRecord,
  DiscoverTmuxInput,
  ScanResult,
} from "@agent-orchestrator/shared";

import { discoverTmuxSessions } from "../lib/api";
import { findExistingSession } from "../lib/session-matching";
import type { AddToGridItem } from "./DiscoveryDialog";
import type { SelectedHost } from "./HostDropdown";

interface TmuxItem {
  session: AgentSessionRecord;
  existingId?: string;
}

interface TmuxDiscoveryPanelProps {
  host: SelectedHost;
  sessions: AgentSessionRecord[];
  onAddToGrid: (items: AddToGridItem[]) => void;
  onFocusSession: (id: string) => void;
}

export function TmuxDiscoveryPanel({
  host,
  sessions,
  onAddToGrid,
  onFocusSession,
}: TmuxDiscoveryPanelProps) {
  const [items, setItems] = useState<TmuxItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyNew, setShowOnlyNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    scan();
  }, [host, sessions]);

  function toScanResult(session: AgentSessionRecord): ScanResult {
    return {
      agentKind: session.agentKind,
      status: session.interactionState === "running" ? "running" : "stopped",
      displayName: session.displayName,
      workingDirectory: session.workingDirectory ?? "~",
      tmuxSession: session.transportRef?.tmuxSession,
      tmuxPane: session.transportRef?.tmuxPane,
      sshTarget: session.sshTarget,
    };
  }

  async function scan() {
    setLoading(true);
    setError(null);
    try {
      const body: DiscoverTmuxInput =
        host.type === "ssh" ? { sshTarget: host.preset } : {};
      const res = await discoverTmuxSessions(body);
      if (res.unavailable) {
        setError("tmux 不可用或未安装");
        setItems([]);
        return;
      }
      const mapped: TmuxItem[] = res.items.map((s) => {
        const existing = findExistingSession(toScanResult(s), sessions);
        return { session: s, existingId: existing?.id };
      });
      setItems(mapped);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "扫描失败");
    } finally {
      setLoading(false);
    }
  }

  const filtered = items.filter((item) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const name = (
        item.session.transportRef?.tmuxSession ?? item.session.displayName
      ).toLowerCase();
      if (!name.includes(q)) return false;
    }
    if (showOnlyNew && item.existingId) return false;
    return true;
  });

  const newCount = filtered.filter((i) => !i.existingId).length;

  function toggleSelect(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleSelectAll() {
    const newIndices = filtered
      .map((item, i) => (!item.existingId ? i : -1))
      .filter((i) => i >= 0);
    const allSelected = newIndices.every((i) => selected.has(i));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const i of newIndices) next.delete(i);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const i of newIndices) next.add(i);
        return next;
      });
    }
  }

  function handleAddSelected() {
    const toAdd: AddToGridItem[] = [];
    for (const idx of selected) {
      const item = filtered[idx];
      if (item && !item.existingId) {
        toAdd.push({
          scanResult: {
            agentKind: item.session.agentKind,
            status:
              item.session.connectionState === "online" ? "running" : "stopped",
            displayName: item.session.displayName,
            workingDirectory: item.session.workingDirectory ?? "~",
            tmuxSession: item.session.transportRef?.tmuxSession,
            tmuxPane: item.session.transportRef?.tmuxPane,
            sshTarget: item.session.sshTarget,
          },
          tmuxSessionName: item.session.transportRef?.tmuxSession,
        });
      }
    }
    if (toAdd.length > 0) onAddToGrid(toAdd);
  }

  return (
    <div className="tmux-discovery-panel">
      <div className="discovery-toolbar">
        <input
          type="text"
          className="discovery-search"
          placeholder="搜索名称..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <label className="discovery-checkbox-label">
          <input
            type="checkbox"
            checked={showOnlyNew}
            onChange={(e) => setShowOnlyNew(e.target.checked)}
          />
          仅未加入
        </label>
        <button
          className="discovery-select-all-btn"
          onClick={toggleSelectAll}
          disabled={newCount === 0}
        >
          全选
        </button>
        <button
          className="discovery-refresh-btn"
          onClick={scan}
          disabled={loading}
        >
          {loading ? "扫描中..." : "刷新"}
        </button>
        <span className="discovery-count">已选 {selected.size} 项</span>
      </div>

      {error && <div className="discovery-error">{error}</div>}

      {loading && items.length === 0 && (
        <div className="discovery-loading">正在扫描 tmux 会话...</div>
      )}

      <div className="discovery-list">
        {filtered.map((item, idx) => {
          const tmuxName =
            item.session.transportRef?.tmuxSession ?? item.session.displayName;
          const isAlready = !!item.existingId;
          const isChecked = selected.has(idx);
          const stateLabel =
            item.session.interactionState === "running" ? "连接中" : "detached";
          const stateClass =
            item.session.interactionState === "running"
              ? "discovery-item-state--running"
              : "discovery-item-state--detached";

          return (
            <div
              key={tmuxName}
              className={`discovery-item${isChecked ? " discovery-item--selected" : ""}${isAlready ? " discovery-item--existing" : ""}`}
            >
              {!isAlready && (
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleSelect(idx)}
                />
              )}
              <div className="discovery-item-info">
                <div className="discovery-item-heading">
                  <span className="discovery-item-name">{tmuxName}</span>
                  <span className={`discovery-item-state ${stateClass}`}>
                    {stateLabel}
                  </span>
                </div>
                <span className="discovery-item-detail">
                  {item.session.agentKind} ·{" "}
                  {item.session.workingDirectory ?? "~"}
                </span>
              </div>
              <div className="discovery-item-actions">
                {isAlready ? (
                  <button
                    className="discovery-focus-btn"
                    onClick={() => onFocusSession(item.existingId!)}
                  >
                    聚焦到宫格
                  </button>
                ) : (
                  <button
                    className="discovery-add-btn"
                    onClick={() =>
                      onAddToGrid([
                        {
                          scanResult: {
                            agentKind: item.session.agentKind,
                            status:
                              item.session.connectionState === "online"
                                ? "running"
                                : "stopped",
                            displayName: item.session.displayName,
                            workingDirectory:
                              item.session.workingDirectory ?? "~",
                            tmuxSession: item.session.transportRef?.tmuxSession,
                            tmuxPane: item.session.transportRef?.tmuxPane,
                            sshTarget: item.session.sshTarget,
                          },
                          tmuxSessionName:
                            item.session.transportRef?.tmuxSession,
                        },
                      ])
                    }
                  >
                    加入宫格
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {!loading && !error && filtered.length === 0 && (
          <div className="discovery-empty">未发现可加入的 tmux session</div>
        )}
      </div>

      <div className="discovery-footer">
        <span className="discovery-footer-info">
          共 {items.length} 个会话，{newCount} 个未加入
        </span>
        <button
          className="discovery-add-selected-btn"
          onClick={handleAddSelected}
          disabled={selected.size === 0}
        >
          加入已选 ({selected.size})
        </button>
      </div>
    </div>
  );
}
