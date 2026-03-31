import { useEffect, useMemo, useRef, useState } from "react";

import type {
  LaunchLocalAgentInput,
  SshHostPreset,
  SshTarget,
} from "@agent-orchestrator/shared";

import {
  getDirectorySuggestions,
  launchPtyAgent,
  launchSshPtyAgent,
} from "../lib/api";
import type { LaunchMode } from "../lib/session-matching";
import {
  buildDefaultSessionName,
  buildDirectLaunchCommand,
  buildRemoteDirectLaunchCommand,
  buildTmuxLaunchCommand,
  wrapRemoteInteractiveCommand,
} from "../lib/session-matching";
import type { SelectedHost } from "./HostDropdown";

interface NewSessionDialogProps {
  open: boolean;
  sshHosts: SshHostPreset[];
  onClose: () => void;
  onLaunched: () => void;
}

type NewSessionStep = "host" | "details";

function hostOptionTestId(hostName: string): string {
  return `new-session-host-option-${hostName}`;
}

export function NewSessionDialog({
  open,
  sshHosts,
  onClose,
  onLaunched,
}: NewSessionDialogProps) {
  const [step, setStep] = useState<NewSessionStep>("host");
  const [selectedHostValue, setSelectedHostValue] = useState("local");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState("copilot");
  const [newDir, setNewDir] = useState("");
  const [launchMode, setLaunchMode] = useState<LaunchMode>("direct");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [directorySuggestions, setDirectorySuggestions] = useState<string[]>(
    [],
  );
  const [directorySuggestionsEnabled, setDirectorySuggestionsEnabled] =
    useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const suggestionRequestRef = useRef(0);

  const selectedHost = useMemo<SelectedHost>(() => {
    if (selectedHostValue === "local") {
      return { type: "local" };
    }

    const preset = sshHosts.find((item) => item.name === selectedHostValue);
    return preset ? { type: "ssh", preset } : { type: "local" };
  }, [selectedHostValue, sshHosts]);

  useEffect(() => {
    if (!open) {
      setStep("host");
      setSelectedHostValue("local");
      setNewName("");
      setNewKind("copilot");
      setNewDir("");
      setLaunchMode("direct");
      setSubmitting(false);
      setStatusMessage(null);
      setDirectorySuggestions([]);
      setDirectorySuggestionsEnabled(false);
      return;
    }

    const timerId = window.setTimeout(() => {
      if (step === "details") {
        nameInputRef.current?.focus();
      }
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || submitting) {
        return;
      }

      event.preventDefault();
      onClose();
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(timerId);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, step, submitting]);

  useEffect(() => {
    if (!open || step !== "details") {
      return;
    }

    const prefix = newDir.trim();
    if (!prefix) {
      setDirectorySuggestions([]);
      setDirectorySuggestionsEnabled(false);
      return;
    }

    const requestId = suggestionRequestRef.current + 1;
    suggestionRequestRef.current = requestId;

    const timerId = window.setTimeout(() => {
      const sshTarget = currentSshTarget();
      getDirectorySuggestions({
        prefix,
        ...(sshTarget ? { sshTarget } : {}),
      })
        .then((result) => {
          if (suggestionRequestRef.current !== requestId) {
            return;
          }

          setDirectorySuggestionsEnabled(result.enabled);
          setDirectorySuggestions(result.suggestions);
        })
        .catch(() => {
          if (suggestionRequestRef.current !== requestId) {
            return;
          }

          setDirectorySuggestionsEnabled(false);
          setDirectorySuggestions([]);
        });
    }, 160);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [newDir, open, selectedHostValue, step, sshHosts]);

  if (!open) {
    return null;
  }

  function currentSshTarget(): SshTarget | undefined {
    if (selectedHost.type !== "ssh") {
      return undefined;
    }

    return {
      host: selectedHost.preset.host,
      port: selectedHost.preset.port,
      username: selectedHost.preset.username,
      identityFile: selectedHost.preset.identityFile,
    };
  }

  function chooseHost(nextValue: string) {
    setSelectedHostValue(nextValue);
    setStatusMessage(null);
    setDirectorySuggestions([]);
    setDirectorySuggestionsEnabled(false);

    if (nextValue === "local") {
      setNewDir("");
    } else {
      const preset = sshHosts.find((item) => item.name === nextValue);
      setNewDir(preset?.defaultPath || "~/");
    }

    setStep("details");
  }

  function handleBackToHosts() {
    if (submitting) {
      return;
    }
    setStep("host");
    setStatusMessage(null);
    setDirectorySuggestions([]);
  }

  const showDirectorySuggestions =
    directorySuggestionsEnabled && directorySuggestions.length > 0;

  const currentTargetLabel =
    selectedHost.type === "local" ? "本地" : selectedHost.preset.name;

  async function handleCreate() {
    if (submitting) {
      return;
    }

    const rawDir = newDir.trim();
    const name = newName.trim() || buildDefaultSessionName(newKind, launchMode);
    const hasExplicitLocalDir =
      selectedHost.type === "local" && rawDir.length > 0;
    const localWorkingDirectory = hasExplicitLocalDir ? rawDir : undefined;
    const tmuxSessionName = launchMode === "tmux" ? name : undefined;

    setSubmitting(true);
    setStatusMessage(null);

    try {
      if (selectedHost.type === "ssh") {
        const remoteWorkingDirectory =
          rawDir || selectedHost.preset.defaultPath || "~/";
        const command =
          launchMode === "tmux"
            ? buildTmuxLaunchCommand(
                newKind,
                remoteWorkingDirectory,
                name,
                tmuxSessionName ?? name,
              )
            : buildDirectLaunchCommand(newKind, remoteWorkingDirectory, name);
        const target = currentSshTarget();
        if (!target) {
          throw new Error("missing ssh target");
        }

        const remoteCommand = wrapRemoteInteractiveCommand(
          launchMode === "tmux"
            ? command
            : buildRemoteDirectLaunchCommand(
                newKind,
                remoteWorkingDirectory,
                name,
              ),
        );

        await launchSshPtyAgent({
          workspaceId: "default",
          displayName: name,
          agentKind: newKind,
          sshTarget: target,
          remoteCommand,
          workingDirectory: remoteWorkingDirectory,
          tmuxSessionName,
        });
      } else {
        const command =
          launchMode === "tmux"
            ? buildTmuxLaunchCommand(
                newKind,
                localWorkingDirectory ?? ".",
                name,
                tmuxSessionName ?? name,
              )
            : buildDirectLaunchCommand(
                newKind,
                localWorkingDirectory ?? ".",
                name,
              );
        const input: LaunchLocalAgentInput = {
          workspaceId: "default",
          displayName: name,
          agentKind: newKind,
          command,
          workingDirectory: localWorkingDirectory,
          tmuxSessionName,
        };
        await launchPtyAgent(input);
      }

      onLaunched();
      onClose();
    } catch {
      setStatusMessage(`创建失败: ${name}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="new-session-backdrop"
      onClick={() => !submitting && onClose()}
    >
      <div
        aria-modal="true"
        className="new-session-dialog"
        data-testid="new-session-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="new-session-header">
          <div>
            <p className="new-session-kicker">创建</p>
            <h2 className="new-session-title">
              {step === "host" ? "选择服务器" : "新建会话"}
            </h2>
          </div>
          <button
            className="new-session-close"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </div>

        {step === "host" ? (
          <>
            <div
              className="new-session-host-step"
              data-testid="new-session-host-step"
            >
              <p className="new-session-message">
                先选择要启动会话的服务器，再填写名称、Agent 和启动方式。
              </p>
              <div className="new-session-host-list">
                <button
                  className="new-session-host-card"
                  data-testid={hostOptionTestId("local")}
                  onClick={() => chooseHost("local")}
                  type="button"
                >
                  <span className="new-session-host-title">🖥 本地</span>
                  <span className="new-session-host-detail">
                    在当前机器上直接启动会话
                  </span>
                </button>
                {sshHosts.map((host) => (
                  <button
                    key={host.name}
                    className="new-session-host-card"
                    data-testid={hostOptionTestId(host.name)}
                    onClick={() => chooseHost(host.name)}
                    type="button"
                  >
                    <span className="new-session-host-title">
                      🌐 {host.name}
                    </span>
                    <span className="new-session-host-detail">
                      {host.username ? `${host.username}@` : ""}
                      {host.host}
                      {host.port ? `:${host.port}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="new-session-actions">
              <button
                className="drawer-btn"
                disabled={submitting}
                onClick={onClose}
                type="button"
              >
                取消
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="new-session-target-row">
              <button
                className="new-session-secondary-btn"
                disabled={submitting}
                onClick={handleBackToHosts}
                type="button"
              >
                重新选择服务器
              </button>
              <p
                className="new-session-message"
                data-testid="new-session-current-host"
              >
                当前目标: {currentTargetLabel}
              </p>
            </div>

            <div
              className="new-session-grid"
              data-testid="new-session-details-step"
            >
              <label className="new-session-field new-session-field--wide">
                <span className="new-session-label">显示名称</span>
                <input
                  ref={nameInputRef}
                  className="drawer-input"
                  data-testid="new-session-name"
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="显示名称 (可选)"
                  value={newName}
                />
              </label>

              <label className="new-session-field">
                <span className="new-session-label">Agent</span>
                <select
                  className="drawer-input"
                  data-testid="new-session-kind"
                  onChange={(event) => setNewKind(event.target.value)}
                  value={newKind}
                >
                  <option value="copilot">copilot</option>
                  <option value="codex">codex</option>
                  <option value="claude">claude</option>
                  <option value="shell">shell</option>
                </select>
              </label>

              <div className="new-session-field">
                <span className="new-session-label">启动方式</span>
                <div className="new-session-mode-toggle">
                  <button
                    className={`new-session-mode-btn${launchMode === "direct" ? " is-active" : ""}`}
                    data-testid="new-session-mode-direct"
                    onClick={() => setLaunchMode("direct")}
                    type="button"
                    aria-pressed={launchMode === "direct"}
                  >
                    直接创建
                  </button>
                  <button
                    className={`new-session-mode-btn${launchMode === "tmux" ? " is-active" : ""}`}
                    data-testid="new-session-mode-tmux"
                    onClick={() => setLaunchMode("tmux")}
                    type="button"
                    aria-pressed={launchMode === "tmux"}
                  >
                    从 tmux 创建
                  </button>
                </div>
              </div>

              <label className="new-session-field new-session-field--wide">
                <span className="new-session-label">工作目录</span>
                <div className="new-session-dir-wrap">
                  <input
                    className="drawer-input"
                    data-testid="new-session-dir"
                    onChange={(event) => setNewDir(event.target.value)}
                    placeholder="工作目录 (默认 ~/ 或 SSH 默认目录)"
                    value={newDir}
                  />
                  {showDirectorySuggestions && (
                    <div
                      className="directory-suggestions"
                      data-testid="directory-suggestions"
                    >
                      {directorySuggestions.map((suggestion, index) => (
                        <button
                          key={suggestion}
                          className="directory-suggestion-item"
                          data-testid={`directory-suggestion-item-${index}`}
                          onClick={() => setNewDir(suggestion)}
                          type="button"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </label>
            </div>

            {launchMode === "tmux" && (
              <p
                className="new-session-message"
                data-testid="new-session-tmux-note"
              >
                tmux session 名将使用当前显示名称；未填写时会自动生成唯一名称
              </p>
            )}

            {statusMessage && (
              <p className="new-session-error">{statusMessage}</p>
            )}

            <div className="new-session-actions">
              <button
                className="drawer-btn"
                disabled={submitting}
                onClick={onClose}
                type="button"
              >
                取消
              </button>
              <button
                className="drawer-btn primary"
                data-testid="create-session"
                disabled={submitting}
                onClick={handleCreate}
                type="button"
              >
                {submitting ? "创建中..." : "创建会话"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
