import { useEffect, useState } from "react";

import type {
  AgentSessionRecord,
  LaunchLocalAgentInput,
  SshHostPreset,
  SshTarget,
} from "@agent-orchestrator/shared";

import { getSshHosts, launchPtyAgent, launchSshPtyAgent } from "../lib/api";
import type { LaunchMode } from "../lib/session-matching";
import {
  buildDirectLaunchCommand,
  buildTmuxLaunchCommand,
  buildRemoteDirectLaunchCommand,
  wrapRemoteInteractiveCommand,
  buildDefaultSessionName,
} from "../lib/session-matching";
import type { SelectedHost } from "./HostDropdown";

interface SideDrawerProps {
  open: boolean;
  collapsed: boolean;
  sessions: AgentSessionRecord[];
  onLaunched: () => void;
  onFocusSession: (id: string) => void;
  onToggleCollapsed: () => void;
}

export function SideDrawer({
  open,
  collapsed,
  sessions,
  onLaunched,
  onFocusSession,
  onToggleCollapsed,
}: SideDrawerProps) {
  // Panel open state
  const [hostsOpen, setHostsOpen] = useState(true);
  const [newSessionOpen, setNewSessionOpen] = useState(false);

  // Host selection
  const [sshHosts, setSshHosts] = useState<SshHostPreset[]>([]);
  const [selectedHost, setSelectedHost] = useState<SelectedHost>({
    type: "local",
  });

  // New session form
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState("copilot");
  const [newDir, setNewDir] = useState("");
  const [launchMode, setLaunchMode] = useState<LaunchMode>("direct");

  // Status
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    getSshHosts()
      .then((res) => setSshHosts(res.hosts))
      .catch(() => {});
  }, []);

  if (!open) return null;

  if (collapsed) {
    return (
      <aside className="side-drawer side-drawer--collapsed">
        <button
          className="drawer-icon-btn"
          onClick={onToggleCollapsed}
          title="展开面板"
        >
          ▶
        </button>
        <button className="drawer-icon-btn" title="主机">
          🖥
        </button>
        <button
          className="drawer-icon-btn"
          onClick={() => {
            onToggleCollapsed();
            setNewSessionOpen(true);
          }}
          title="新建会话"
        >
          ＋
        </button>
      </aside>
    );
  }

  function currentSshTarget(): SshTarget | undefined {
    if (selectedHost.type === "ssh") {
      return {
        host: selectedHost.preset.host,
        port: selectedHost.preset.port,
        username: selectedHost.preset.username,
        identityFile: selectedHost.preset.identityFile,
      };
    }
    return undefined;
  }

  const defaultHostLabel =
    selectedHost.type === "local"
      ? "local"
      : selectedHost.preset.host || selectedHost.preset.name;
  const defaultSessionName = buildDefaultSessionName({
    hostLabel: defaultHostLabel,
    agentKind: newKind,
    launchMode,
    existingNames: sessions.map((session) => session.displayName),
  });

  async function handleNewSession() {
    if (!newKind) return;

    const name = newName.trim() || defaultSessionName;
    const dir = newDir || "~/";
    const tmuxSessionName = launchMode === "tmux" ? name : undefined;
    const command =
      launchMode === "tmux"
        ? buildTmuxLaunchCommand(newKind, dir, name, name)
        : buildDirectLaunchCommand(newKind, dir, name);

    try {
      if (selectedHost.type === "ssh") {
        const target = currentSshTarget()!;
        const remoteCommand =
          launchMode === "tmux"
            ? command
            : wrapRemoteInteractiveCommand(
                buildRemoteDirectLaunchCommand(newKind, dir, name),
              );

        await launchSshPtyAgent({
          workspaceId: "default",
          displayName: name,
          agentKind: newKind,
          sshTarget: target,
          remoteCommand,
          workingDirectory: dir,
          tmuxSessionName,
        });
      } else {
        const input: LaunchLocalAgentInput = {
          workspaceId: "default",
          displayName: name,
          agentKind: newKind,
          command,
          workingDirectory: dir,
          tmuxSessionName,
        };
        await launchPtyAgent(input);
      }
      setStatusMessage(`已创建: ${name}`);
      setNewName("");
      setNewDir("");
      onLaunched();
    } catch {
      setStatusMessage(`创建失败: ${name}`);
    }
  }

  return (
    <aside className="side-drawer">
      {/* ── Section 1: Hosts ── */}
      <div className="drawer-collapsible">
        <button
          className="drawer-collapsible-header"
          onClick={() => setHostsOpen(!hostsOpen)}
        >
          <span>{hostsOpen ? "▼" : "▶"} 主机</span>
          <span className="drawer-collapsible-count">
            {sshHosts.length + 1}
          </span>
        </button>
        {hostsOpen && (
          <div className="drawer-collapsible-body">
            <div className="host-list" data-testid="host-list">
              <label
                className={`host-item ${selectedHost.type === "local" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="host"
                  checked={selectedHost.type === "local"}
                  onChange={() => setSelectedHost({ type: "local" })}
                />
                <span className="host-name">🖥 本地</span>
              </label>
              {sshHosts.map((h) => (
                <label
                  key={h.name}
                  className={`host-item ${selectedHost.type === "ssh" && selectedHost.preset.name === h.name ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="host"
                    checked={
                      selectedHost.type === "ssh" &&
                      selectedHost.preset.name === h.name
                    }
                    onChange={() => setSelectedHost({ type: "ssh", preset: h })}
                  />
                  <span className="host-name">🌐 {h.name}</span>
                  <span className="host-detail">
                    {h.username ? `${h.username}@` : ""}
                    {h.host}
                    {h.port !== 22 ? `:${h.port}` : ""}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 2: New Session ── */}
      <div className="drawer-collapsible">
        <button
          className="drawer-collapsible-header"
          data-testid="new-session-toggle"
          onClick={() => setNewSessionOpen(!newSessionOpen)}
        >
          <span>{newSessionOpen ? "▼" : "▶"} 新建会话</span>
        </button>
        {newSessionOpen && (
          <div className="drawer-collapsible-body">
            <input
              className="drawer-input"
              data-testid="new-session-name"
              placeholder={`默认: ${defaultSessionName}`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <select
              className="drawer-input"
              data-testid="new-session-kind"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value)}
            >
              <option value="copilot">copilot</option>
              <option value="codex">codex</option>
              <option value="claude">claude</option>
              <option value="shell">shell</option>
            </select>
            <select
              className="drawer-input"
              data-testid="new-session-mode"
              value={launchMode}
              onChange={(e) => setLaunchMode(e.target.value as LaunchMode)}
            >
              <option value="direct">直接创建</option>
              <option value="tmux">从 tmux 创建</option>
            </select>
            <input
              className="drawer-input"
              data-testid="new-session-dir"
              placeholder="工作目录 (默认 ~/)"
              value={newDir}
              onChange={(e) => setNewDir(e.target.value)}
            />
            {launchMode === "tmux" && (
              <p className="drawer-message" data-testid="new-session-tmux-note">
                tmux session 名将使用当前显示名称；未填写时会自动生成唯一名称
              </p>
            )}
            <p className="drawer-message">
              目标主机:{" "}
              {selectedHost.type === "local"
                ? "本地"
                : selectedHost.preset.name}
            </p>
            <button
              className="drawer-btn primary"
              data-testid="create-session"
              onClick={handleNewSession}
            >
              创建会话
            </button>
          </div>
        )}
      </div>

      {statusMessage && <p className="drawer-status">{statusMessage}</p>}
      <button
        className="drawer-collapse-btn"
        onClick={onToggleCollapsed}
        title="折叠面板"
      >
        ◀ 折叠
      </button>
    </aside>
  );
}
