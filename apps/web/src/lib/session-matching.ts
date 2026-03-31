import type {
  AgentSessionRecord,
  ScanResult,
} from "@agent-orchestrator/shared";

import { buildRemoteInteractiveShellCommand } from "./platform-compat";

export type LaunchMode = "direct" | "tmux";

const kindPriority: Record<string, number> = {
  copilot: 0,
  codex: 1,
  claude: 2,
  shell: 3,
};

export function sortScanResults(results: ScanResult[]): ScanResult[] {
  return [...results].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "running" ? -1 : 1;
    }
    const ap = kindPriority[a.agentKind] ?? 99;
    const bp = kindPriority[b.agentKind] ?? 99;
    if (ap !== bp) return ap - bp;
    return a.displayName.localeCompare(b.displayName);
  });
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function formatWorkingDirectory(workingDirectory: string): string {
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
): string | undefined {
  if (agentKind === "shell") {
    return undefined;
  }

  if (sessionId) {
    return `${agentKind} --resume=${sessionId}`;
  }

  if (agentKind === "claude") {
    return `claude -n ${shellQuote(displayName)}`;
  }

  return agentKind;
}

export function buildDirectLaunchCommand(
  agentKind: string,
  workingDirectory: string,
  displayName: string,
  sessionId?: string,
): string {
  const invocation = buildAgentInvocation(agentKind, displayName, sessionId);

  if (!invocation) {
    return "";
  }

  return `cd ${formatWorkingDirectory(workingDirectory)} && ${invocation}`;
}

export function buildTmuxLaunchCommand(
  agentKind: string,
  workingDirectory: string,
  displayName: string,
  tmuxSessionName: string,
  sessionId?: string,
): string {
  if (agentKind === "shell") {
    return `tmux new-session -s ${shellQuote(tmuxSessionName)} -c ${formatWorkingDirectory(workingDirectory)}`;
  }

  return `tmux new-session -s ${shellQuote(tmuxSessionName)} ${shellQuote(buildDirectLaunchCommand(agentKind, workingDirectory, displayName, sessionId))}`;
}

export function buildRemoteDirectLaunchCommand(
  agentKind: string,
  workingDirectory: string,
  displayName: string,
  sessionId?: string,
): string {
  if (agentKind === "shell") {
    return `cd ${formatWorkingDirectory(workingDirectory)} && exec "\${SHELL:-\$(command -v bash || command -v zsh || command -v sh || printf /bin/sh)}" -i`;
  }

  return buildDirectLaunchCommand(
    agentKind,
    workingDirectory,
    displayName,
    sessionId,
  );
}

export function buildTmuxAttachCommand(
  tmuxSessionName: string,
  tmuxPaneId?: string,
): string {
  if (tmuxPaneId) {
    return `tmux select-pane -t ${shellQuote(tmuxPaneId)} && tmux attach -t ${shellQuote(tmuxSessionName)}`;
  }

  return `tmux attach -t ${shellQuote(tmuxSessionName)}`;
}

export function wrapRemoteInteractiveCommand(command: string): string {
  return buildRemoteInteractiveShellCommand(command);
}

export interface BuildDefaultSessionNameInput {
  hostLabel: string;
  agentKind: string;
  launchMode: LaunchMode;
  existingNames?: string[];
}

function normalizeSessionNameSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s/:@\\]+/g, "_")
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildUniqueSessionName(
  baseName: string,
  existingNames: string[],
): string {
  if (!existingNames.includes(baseName)) {
    return baseName;
  }

  let suffix = 2;
  let candidate = `${baseName}_${suffix}`;
  while (existingNames.includes(candidate)) {
    suffix += 1;
    candidate = `${baseName}_${suffix}`;
  }

  return candidate;
}

export function buildDefaultSessionName({
  hostLabel,
  agentKind,
  launchMode,
  existingNames = [],
}: BuildDefaultSessionNameInput): string {
  const normalizedHost = normalizeSessionNameSegment(hostLabel) || "host";
  const normalizedKind = normalizeSessionNameSegment(agentKind) || "shell";
  const transportLabel = launchMode === "tmux" ? "tmux" : "shell";

  return buildUniqueSessionName(
    `${normalizedHost}_${normalizedKind}_${transportLabel}`,
    existingNames,
  );
}

export function findExistingSession(
  result: ScanResult,
  sessions: AgentSessionRecord[],
): AgentSessionRecord | undefined {
  if (result.sessionId) {
    return sessions.find((s) => s.agentSessionId === result.sessionId);
  }
  if (result.tmuxSession) {
    const hostId = result.sshTarget?.host ?? "local";
    return sessions.find(
      (s) =>
        (s.hostId ?? "local") === hostId &&
        s.transportRef?.tmuxSession === result.tmuxSession,
    );
  }
  const hostId = result.sshTarget?.host ?? "local";
  return sessions.find(
    (s) =>
      (s.hostId ?? "local") === hostId &&
      s.workingDirectory === result.workingDirectory &&
      s.agentKind === result.agentKind,
  );
}
