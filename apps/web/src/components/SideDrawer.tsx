import { useEffect, useState } from "react";

import type {
  AgentSessionRecord,
  LaunchLocalAgentInput,
  LaunchSshPtyInput,
  ScanDirectoryInput,
  ScanResult,
  SshHostPreset,
  SshTarget,
} from "@agent-orchestrator/shared";

import {
  discoverTmuxSessions,
  getSshHosts,
  launchPtyAgent,
  launchSshPtyAgent,
  scanDirectory,
} from "../lib/api";

interface SideDrawerProps {
  open: boolean;
  sessions: AgentSessionRecord[];
  onLaunched: () => void;
  onFocusSession: (id: string) => void;
}

type SelectedHost = { type: "local" } | { type: "ssh"; preset: SshHostPreset };
type LaunchMode = "direct" | "tmux";

const kindPriority: Record<string, number> = {
  copilot: 0,
  codex: 1,
  claude: 2,
  shell: 3,
};

function sortScanResults(results: ScanResult[]): ScanResult[] {
  return [...results].sort((a, b) => {
    // running first
    if (a.status !== b.status) {
      return a.status === "running" ? -1 : 1;
    }
    // then by kind priority
    const ap = kindPriority[a.agentKind] ?? 99;
    const bp = kindPriority[b.agentKind] ?? 99;
    if (ap !== bp) return ap - bp;
    // then alphabetically
    return a.displayName.localeCompare(b.displayName);
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function formatWorkingDirectory(workingDirectory: string): string {
  if (workingDirectory === "~" || workingDirectory === "~/") {
    return "~";
  }

  if (workingDirectory.startsWith("~/")) {
    const suffix = workingDirectory
      .slice(2)
      .split("/")
      .filter(Boolean)
      .map((segment) => shellQuote(segment))
      .join("/");

    return suffix ? `~/${suffix}` : "~";
  }

  return shellQuote(workingDirectory);
}

function buildAgentInvocation(
  agentKind: string,
  displayName: string,
  sessionId?: string,
): string {
  if (sessionId) {
    return `${agentKind} --resume=${sessionId}`;
  }

  if (agentKind === "claude") {
    return `claude -n ${shellQuote(displayName)}`;
  }

  return agentKind;
}

function buildDirectLaunchCommand(
  agentKind: string,
  workingDirectory: string,
  displayName: string,
  sessionId?: string,
): string {
  return `cd ${formatWorkingDirectory(workingDirectory)} && ${buildAgentInvocation(agentKind, displayName, sessionId)}`;
}

function buildTmuxLaunchCommand(
  agentKind: string,
  workingDirectory: string,
  displayName: string,
  tmuxSessionName: string,
  sessionId?: string,
): string {
  return `tmux new-session -s ${shellQuote(tmuxSessionName)} ${shellQuote(buildDirectLaunchCommand(agentKind, workingDirectory, displayName, sessionId))}`;
}

function buildTmuxAttachCommand(
  tmuxSessionName: string,
  tmuxPaneId?: string,
): string {
  if (tmuxPaneId) {
    return `tmux select-pane -t ${shellQuote(tmuxPaneId)} && tmux attach -t ${shellQuote(tmuxSessionName)}`;
  }

  return `tmux attach -t ${shellQuote(tmuxSessionName)}`;
}

function wrapRemoteInteractiveCommand(command: string): string {
  return `zsh -i -c ${JSON.stringify(command)}`;
}

function buildDefaultSessionName(
  agentKind: string,
  launchMode: LaunchMode,
): string {
  if (launchMode !== "tmux") {
    return `${agentKind} 新会话`;
  }

  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  return `${agentKind} 新会话 ${timestamp}`;
}

function findExistingSession(
  result: ScanResult,
  sessions: AgentSessionRecord[],
): AgentSessionRecord | undefined {
  // Match by sessionId → agentSessionId
  if (result.sessionId) {
    const match = sessions.find((s) => s.agentSessionId === result.sessionId);
    if (match) return match;
  }
  // Match by tmuxSession
  if (result.tmuxSession) {
    const match = sessions.find(
      (s) => s.transportRef?.tmuxSession === result.tmuxSession,
    );
    if (match) return match;
  }
  // Match by host+cwd+kind combo
  const hostId = result.sshTarget?.host ?? "local";
  return sessions.find(
    (s) =>
      (s.hostId ?? "local") === hostId &&
      s.workingDirectory === result.workingDirectory &&
      s.agentKind === result.agentKind,
  );
}

export function SideDrawer({
  open,
  sessions,
  onLaunched,
  onFocusSession,
}: SideDrawerProps) {
  // Panel open state
  const [hostsOpen, setHostsOpen] = useState(true);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [newSessionOpen, setNewSessionOpen] = useState(false);

  // Host selection
  const [sshHosts, setSshHosts] = useState<SshHostPreset[]>([]);
  const [selectedHost, setSelectedHost] = useState<SelectedHost>({
    type: "local",
  });
  const [scanPath, setScanPath] = useState("~/");

  // Scan
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

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

  async function handleScan() {
    setScanning(true);
    setScanMessage(null);

    try {
      const sshTarget = currentSshTarget();
      const input: ScanDirectoryInput = {
        path: scanPath || "~/",
        hostId:
          selectedHost.type === "ssh" ? selectedHost.preset.name : undefined,
        sshTarget,
      };
      const response = await scanDirectory(input);
      setScanResults(sortScanResults(response.results));
      setScanMessage(`扫描完成: 发现 ${response.results.length} 个 Agent`);
      setResultsOpen(true);
    } catch (error) {
      setScanMessage(
        `扫描失败: ${error instanceof Error ? error.message : "未知错误"}`,
      );
    } finally {
      setScanning(false);
    }
  }

  async function handleDiscoverTmux() {
    try {
      const result = await discoverTmuxSessions();
      if (result.unavailable) {
        setStatusMessage("本机 tmux 不可用");
      } else {
        setStatusMessage(`发现 ${result.items.length} 个 tmux 会话`);
        onLaunched();
      }
    } catch {
      setStatusMessage("tmux 扫描失败");
    }
  }

  async function handleAddScanResult(
    result: ScanResult,
    mode: LaunchMode = "direct",
  ) {
    try {
      const shouldResumeInTmux = mode === "tmux" && Boolean(result.sessionId);
      const tmuxSessionName = result.tmuxSession
        ? result.tmuxSession
        : result.sessionName || result.displayName;
      const localTmuxAttachInput: LaunchLocalAgentInput & {
        tmuxPaneId?: string;
      } = {
        workspaceId: "default",
        displayName: result.displayName,
        agentKind: result.agentKind,
        command: buildTmuxAttachCommand(
          result.tmuxSession ?? tmuxSessionName,
          result.tmuxPane,
        ),
        tmuxSessionName: result.tmuxSession,
        tmuxPaneId: result.tmuxPane,
      };

      if (result.sshTarget) {
        let remoteCommand: string;
        if (result.tmuxSession) {
          remoteCommand = wrapRemoteInteractiveCommand(
            buildTmuxAttachCommand(result.tmuxSession, result.tmuxPane),
          );
        } else {
          let inner: string;
          if (result.sessionId) {
            inner = shouldResumeInTmux
              ? buildTmuxLaunchCommand(
                  result.agentKind,
                  result.workingDirectory,
                  result.displayName,
                  tmuxSessionName,
                  result.sessionId,
                )
              : buildDirectLaunchCommand(
                  result.agentKind,
                  result.workingDirectory,
                  result.displayName,
                  result.sessionId,
                );
          } else {
            inner = buildDirectLaunchCommand(
              result.agentKind,
              result.workingDirectory,
              result.displayName,
            );
          }
          remoteCommand = wrapRemoteInteractiveCommand(inner);
        }

        const sshLaunchInput: LaunchSshPtyInput & { tmuxPaneId?: string } = {
          workspaceId: "default",
          displayName: result.displayName,
          agentKind: result.agentKind,
          sshTarget: result.sshTarget,
          remoteCommand,
          workingDirectory: result.workingDirectory,
          agentSessionId: result.sessionId,
          tmuxSessionName:
            result.tmuxSession || shouldResumeInTmux
              ? tmuxSessionName
              : undefined,
          tmuxPaneId: result.tmuxPane,
        };

        await launchSshPtyAgent(sshLaunchInput);
      } else if (result.tmuxSession) {
        await launchPtyAgent(localTmuxAttachInput);
      } else if (result.sessionId) {
        const cmd = shouldResumeInTmux
          ? buildTmuxLaunchCommand(
              result.agentKind,
              result.workingDirectory,
              result.displayName,
              tmuxSessionName,
              result.sessionId,
            )
          : result.workingDirectory
            ? buildDirectLaunchCommand(
                result.agentKind,
                result.workingDirectory,
                result.displayName,
                result.sessionId,
              )
            : `${result.agentKind} --resume=${result.sessionId}`;
        await launchPtyAgent({
          workspaceId: "default",
          displayName: result.displayName,
          agentKind: result.agentKind,
          command: cmd,
          workingDirectory: result.workingDirectory,
          tmuxSessionName: shouldResumeInTmux ? tmuxSessionName : undefined,
        });
      } else {
        await launchPtyAgent({
          workspaceId: "default",
          displayName: result.displayName,
          agentKind: result.agentKind,
          command: buildDirectLaunchCommand(
            result.agentKind,
            result.workingDirectory,
            result.displayName,
          ),
          workingDirectory: result.workingDirectory,
        });
      }

      setStatusMessage(`已接入: ${result.displayName}`);
      onLaunched();
    } catch {
      setStatusMessage(`接入失败: ${result.displayName}`);
    }
  }

  async function handleNewSession() {
    if (!newName && !newKind) return;

    const name = newName || buildDefaultSessionName(newKind, launchMode);
    const dir = newDir || "~/";
    const tmuxSessionName = launchMode === "tmux" ? name : undefined;
    const command =
      launchMode === "tmux"
        ? buildTmuxLaunchCommand(newKind, dir, name, name)
        : buildDirectLaunchCommand(newKind, dir, name);

    try {
      if (selectedHost.type === "ssh") {
        const target = currentSshTarget()!;
        const remoteCommand = wrapRemoteInteractiveCommand(command);

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

            <div className="host-scan-row">
              <input
                className="drawer-input"
                data-testid="scan-path-input"
                placeholder="扫描路径 (默认 ~/)"
                value={scanPath}
                onChange={(e) => setScanPath(e.target.value)}
              />
              <button
                className="drawer-btn primary"
                data-testid="scan-button"
                onClick={handleScan}
                disabled={scanning}
              >
                {scanning ? "…" : "扫描"}
              </button>
            </div>
            {selectedHost.type === "local" && (
              <button className="drawer-btn small" onClick={handleDiscoverTmux}>
                扫描本地 tmux
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Section 2: Scan Results ── */}
      <div className="drawer-collapsible">
        <button
          className="drawer-collapsible-header"
          onClick={() => setResultsOpen(!resultsOpen)}
        >
          <span>{resultsOpen ? "▼" : "▶"} 扫描结果</span>
          <span className="drawer-collapsible-count">{scanResults.length}</span>
        </button>
        {resultsOpen && (
          <div className="drawer-collapsible-body">
            {scanMessage && <p className="drawer-message">{scanMessage}</p>}
            {scanResults.length === 0 && !scanMessage && (
              <p className="drawer-message">选择主机后点击「扫描」</p>
            )}
            <div className="scan-results-list" data-testid="scan-results-list">
              {scanResults.map((result, index) => {
                const existing = findExistingSession(result, sessions);
                const canResumeInTmux =
                  result.status === "stopped" && Boolean(result.sessionId);

                return (
                  <div key={index} className="scan-result-item">
                    <div className="scan-result-info">
                      <span className="scan-result-name">
                        {result.displayName}
                      </span>
                      <span
                        className={`scan-result-status status-${result.status}`}
                      >
                        {result.status === "running" ? "运行中" : "已停止"}
                      </span>
                    </div>
                    <span className="scan-result-kind">
                      {result.agentKind}
                      {result.tmuxSession ? " · tmux" : ""}
                      {result.workingDirectory
                        ? ` · ${result.workingDirectory}`
                        : ""}
                    </span>
                    {existing ? (
                      <button
                        className="drawer-btn small btn-focus"
                        onClick={() => onFocusSession(existing.id)}
                      >
                        已在宫格 → 聚焦
                      </button>
                    ) : canResumeInTmux ? (
                      <div className="scan-result-actions">
                        <button
                          className="drawer-btn small"
                          onClick={() => handleAddScanResult(result, "direct")}
                        >
                          恢复
                        </button>
                        <button
                          className="drawer-btn small"
                          onClick={() => handleAddScanResult(result, "tmux")}
                        >
                          tmux 恢复
                        </button>
                      </div>
                    ) : (
                      <button
                        className="drawer-btn small"
                        onClick={() => handleAddScanResult(result)}
                      >
                        {result.tmuxSession
                          ? "连接 tmux"
                          : result.status === "running"
                            ? "接入"
                            : "恢复"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 3: New Session ── */}
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
              placeholder="显示名称 (可选)"
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
    </aside>
  );
}
