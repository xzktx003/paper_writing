import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

import type {
  AgentOutputEntry,
  AgentSessionDetailResponse,
  AgentSessionRecord,
  DiscoverTmuxSessionsResponse,
  SshTarget,
  StdinAgentSessionInput,
} from "@agent-orchestrator/shared";

import { AgentSessionRegistry } from "./agent-session-registry.js";
import { quoteForPosixShell, resolveTmuxBinary } from "./runtime-compat.js";

const TMUX_BINARY = resolveTmuxBinary();

interface TmuxPaneInfo {
  sessionName: string;
  attachedCount: number;
  windowActive: boolean;
  paneActive: boolean;
  paneId: string;
  currentCommand: string;
  currentPath: string;
}

export interface TmuxSessionInfo {
  sessionName: string;
  paneId: string;
  currentCommand: string;
  currentPath: string;
  isAttached: boolean;
  interactionState: "running" | "detached";
}

export function parsePaneInfo(stdout: string): TmuxPaneInfo[] {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [
        sessionName,
        attachedCount,
        windowActive,
        paneActive,
        paneId,
        currentCommand,
        currentPath,
      ] = line.split("\t");

      return {
        sessionName,
        attachedCount: Number.parseInt(attachedCount ?? "0", 10) || 0,
        windowActive: windowActive === "1",
        paneActive: paneActive === "1",
        paneId,
        currentCommand,
        currentPath,
      };
    })
    .filter(
      (paneInfo) =>
        Boolean(paneInfo.sessionName) &&
        Boolean(paneInfo.paneId) &&
        Boolean(paneInfo.currentPath),
    );
}

function pickPaneScore(paneInfo: TmuxPaneInfo): number {
  if (paneInfo.windowActive && paneInfo.paneActive) {
    return 3;
  }

  if (paneInfo.paneActive) {
    return 2;
  }

  if (paneInfo.windowActive) {
    return 1;
  }

  return 0;
}

export function summarizeTmuxSessions(
  paneInfos: TmuxPaneInfo[],
): TmuxSessionInfo[] {
  const grouped = new Map<string, TmuxPaneInfo[]>();

  for (const paneInfo of paneInfos) {
    const items = grouped.get(paneInfo.sessionName) ?? [];
    items.push(paneInfo);
    grouped.set(paneInfo.sessionName, items);
  }

  return [...grouped.entries()]
    .map(([sessionName, panes]) => {
      const chosenPane = [...panes].sort((left, right) => {
        const scoreDiff = pickPaneScore(right) - pickPaneScore(left);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        return left.paneId.localeCompare(right.paneId);
      })[0];

      const isAttached = panes.some((pane) => pane.attachedCount > 0);

      return {
        sessionName,
        paneId: chosenPane.paneId,
        currentCommand: chosenPane.currentCommand,
        currentPath: chosenPane.currentPath,
        isAttached,
        interactionState: isAttached
          ? ("running" as const)
          : ("detached" as const),
      };
    })
    .sort((left, right) => {
      if (left.isAttached !== right.isAttached) {
        return left.isAttached ? -1 : 1;
      }

      return left.sessionName.localeCompare(right.sessionName);
    });
}

export function isNoTmuxServerError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /no server running|failed to connect to server/i.test(message);
}

function pickPreview(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)
    ?.slice(0, 160);
}

function buildTmuxStatusPreview(sessionInfo: TmuxSessionInfo): string {
  const stateLabel =
    sessionInfo.interactionState === "running" ? "连接中" : "detached";
  return `tmux:${sessionInfo.sessionName} · ${sessionInfo.currentCommand} · ${stateLabel}`;
}

export class LocalTmuxAdapter {
  constructor(private readonly registry: AgentSessionRegistry) {}

  async discover(): Promise<DiscoverTmuxSessionsResponse> {
    try {
      await this.runTmux(["-V"]);
    } catch {
      return {
        items: [],
        unavailable: true,
      };
    }

    let stdout = "";

    try {
      ({ stdout } = await this.runTmux([
        "list-panes",
        "-a",
        "-F",
        "#{session_name}\t#{session_attached}\t#{window_active}\t#{pane_active}\t#{pane_id}\t#{pane_current_command}\t#{pane_current_path}",
      ]));
    } catch (error) {
      if (isNoTmuxServerError(error)) {
        return {
          items: [],
          unavailable: false,
        };
      }

      throw error;
    }

    const discoveredSessions: AgentSessionRecord[] = [];

    for (const sessionInfo of summarizeTmuxSessions(parsePaneInfo(stdout))) {
      let outputPreview = buildTmuxStatusPreview(sessionInfo);

      try {
        const capture = await this.capturePane(sessionInfo.paneId);
        outputPreview = pickPreview(capture) ?? outputPreview;
      } catch {
        // Pane can disappear during discovery; keep a status-based preview.
      }

      const runtimeId = `tmux:${sessionInfo.sessionName}`;

      discoveredSessions.push({
        id: `preview:${runtimeId}`,
        workspaceId: sessionInfo.sessionName,
        hostId: "local",
        sourceType: "remote-tmux-discovered",
        agentKind: sessionInfo.currentCommand,
        displayName: `tmux:${sessionInfo.sessionName}`,
        workingDirectory: sessionInfo.currentPath,
        connectionState: "online",
        interactionState: sessionInfo.interactionState,
        stateConfidence: "medium",
        outputPreview,
        controlMode: "observe",
        transportRef: {
          tmuxSession: sessionInfo.sessionName,
          tmuxPane: sessionInfo.paneId,
          runtimeId,
        },
        lastHeartbeatAt: new Date().toISOString(),
      });
    }

    return {
      items: discoveredSessions,
      unavailable: false,
    };
  }

  async getDetail(
    agentSession: AgentSessionRecord,
  ): Promise<AgentSessionDetailResponse> {
    const paneId = agentSession.transportRef?.tmuxPane;

    if (!paneId) {
      return this.registry.getDetail(agentSession.id);
    }

    const capture = await this.capturePane(paneId);
    const outputEntries: AgentOutputEntry[] = capture
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-200)
      .map((line) => ({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        stream: "stdout",
        text: line,
      }));

    return this.registry.replaceOutputEntries(agentSession.id, outputEntries);
  }

  async writeInput(
    agentSession: AgentSessionRecord,
    input: StdinAgentSessionInput,
  ): Promise<AgentSessionRecord> {
    if (agentSession.controlMode !== "control") {
      throw new Error("tmux session is observe-only until takeover is enabled");
    }

    const paneId = agentSession.transportRef?.tmuxPane;

    if (!paneId) {
      throw new Error(
        `No tmux pane found for agent session: ${agentSession.id}`,
      );
    }

    const lines = input.input.replace(/\r/g, "").split("\n");

    for (const line of lines) {
      if (line) {
        await this.runTmux(["send-keys", "-t", paneId, "-l", line]);
      }

      await this.runTmux(["send-keys", "-t", paneId, "Enter"]);
    }

    return this.registry.writeToSession(agentSession.id, input);
  }

  async takeOver(
    agentSession: AgentSessionRecord,
  ): Promise<AgentSessionDetailResponse> {
    const detail = await this.getDetail(agentSession);
    this.registry.updateSession(agentSession.id, {
      controlMode: "control",
      stateConfidence: "medium",
      lastRefreshedAt: new Date().toISOString(),
    });
    const currentAgentSession = this.registry.syncCapturedScreen(
      agentSession.id,
      detail.outputEntries.map(({ text }) => text).join("\n"),
    );

    return {
      agentSession: currentAgentSession,
      outputEntries: detail.outputEntries,
    };
  }

  async release(
    agentSession: AgentSessionRecord,
  ): Promise<AgentSessionDetailResponse> {
    const detail = await this.getDetail(agentSession);
    const currentAgentSession = this.registry.updateSession(agentSession.id, {
      controlMode: "observe",
      interactionState: "detached",
      stateConfidence: "high",
      lastRefreshedAt: new Date().toISOString(),
    });

    return {
      agentSession: currentAgentSession,
      outputEntries: detail.outputEntries,
    };
  }

  async refresh(
    agentSession: AgentSessionRecord,
  ): Promise<AgentSessionDetailResponse> {
    const detail = await this.getDetail(agentSession);
    const combinedOutput = detail.outputEntries
      .map(({ text }) => text)
      .join("\n");
    const outputPreview =
      pickPreview(combinedOutput) ?? agentSession.outputPreview;

    const currentAgentSession = this.registry.updateSession(agentSession.id, {
      outputPreview,
      lastRefreshedAt: new Date().toISOString(),
      stateConfidence: "medium",
    });

    const syncedAgentSession = this.registry.syncCapturedScreen(
      currentAgentSession.id,
      combinedOutput,
    );

    return {
      agentSession: syncedAgentSession,
      outputEntries: detail.outputEntries,
    };
  }

  private async capturePane(paneId: string): Promise<string> {
    const { stdout } = await this.runTmux([
      "capture-pane",
      "-p",
      "-t",
      paneId,
      "-S",
      "-200",
    ]);

    return stdout;
  }

  async discoverRemote(
    sshTarget: SshTarget,
  ): Promise<DiscoverTmuxSessionsResponse> {
    const tmuxCmd =
      "tmux list-panes -a -F '#{session_name}\t#{session_attached}\t#{window_active}\t#{pane_active}\t#{pane_id}\t#{pane_current_command}\t#{pane_current_path}'";

    let stdout: string;
    try {
      stdout = await this.runRemoteCommand(sshTarget, tmuxCmd);
    } catch (error) {
      if (isNoTmuxServerError(error)) {
        return { items: [], unavailable: false };
      }

      return { items: [], unavailable: true };
    }

    if (!stdout.trim()) {
      return { items: [], unavailable: false };
    }

    const discoveredSessions: AgentSessionRecord[] = [];

    for (const sessionInfo of summarizeTmuxSessions(parsePaneInfo(stdout))) {
      const hostId = sshTarget.host;
      const runtimeId = `tmux:${hostId}:${sessionInfo.sessionName}`;

      discoveredSessions.push({
        id: `preview:${runtimeId}`,
        workspaceId: sessionInfo.sessionName,
        hostId,
        sourceType: "remote-tmux-discovered",
        agentKind: sessionInfo.currentCommand,
        displayName: `tmux:${sessionInfo.sessionName}`,
        workingDirectory: sessionInfo.currentPath,
        connectionState: "online",
        interactionState: sessionInfo.interactionState,
        stateConfidence: "medium",
        outputPreview: buildTmuxStatusPreview(sessionInfo),
        controlMode: "observe",
        transportRef: {
          tmuxSession: sessionInfo.sessionName,
          tmuxPane: sessionInfo.paneId,
          runtimeId,
          sshHost: sshTarget.host,
          sshPort: sshTarget.port,
          sshUsername: sshTarget.username,
        },
        sshTarget,
        lastHeartbeatAt: new Date().toISOString(),
      });
    }

    return { items: discoveredSessions, unavailable: false };
  }

  async killSession(
    tmuxSessionName: string,
    sshTarget?: SshTarget,
  ): Promise<void> {
    if (sshTarget) {
      await this.runRemoteCommand(
        sshTarget,
        `tmux kill-session -t ${quoteForPosixShell(tmuxSessionName)}`,
      );
    } else {
      await this.runTmux(["kill-session", "-t", tmuxSessionName]);
    }
  }

  private runRemoteCommand(
    sshTarget: SshTarget,
    command: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const args: string[] = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=5"];
      if (sshTarget.port) {
        args.push("-p", String(sshTarget.port));
      }
      if (sshTarget.identityFile) {
        args.push("-i", sshTarget.identityFile);
      }
      const userHost = sshTarget.username
        ? `${sshTarget.username}@${sshTarget.host}`
        : sshTarget.host;
      args.push(userHost, command);

      const childProcess = spawn("ssh", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      childProcess.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      childProcess.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      childProcess.on("error", reject);
      childProcess.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `ssh exited with code ${code}`));
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  private runTmux(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const env = {
        ...(process.env as Record<string, string | undefined>),
      };
      delete env.TMUX;
      delete env.TMUX_PANE;

      const childProcess = spawn(TMUX_BINARY, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: env as Record<string, string>,
      });

      let stdout = "";
      let stderr = "";

      childProcess.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      childProcess.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      childProcess.on("error", reject);
      childProcess.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `tmux exited with code ${code}`));
          return;
        }

        resolve({ stdout, stderr });
      });
    });
  }
}
