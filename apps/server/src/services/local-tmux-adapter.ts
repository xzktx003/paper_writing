import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

import type {
  AgentOutputEntry,
  AgentSessionDetailResponse,
  AgentSessionRecord,
  DiscoverTmuxSessionsResponse,
  StdinAgentSessionInput,
} from "@agent-orchestrator/shared";

import { AgentSessionRegistry } from "./agent-session-registry.js";

const TMUX_BINARY = "/opt/homebrew/bin/tmux";

interface TmuxPaneInfo {
  sessionName: string;
  paneId: string;
  currentCommand: string;
  currentPath: string;
}

function parsePaneInfo(stdout: string): TmuxPaneInfo[] {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sessionName, paneId, currentCommand, currentPath] =
        line.split("\t");

      return {
        sessionName,
        paneId,
        currentCommand,
        currentPath,
      };
    });
}

function pickPreview(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)
    ?.slice(0, 160);
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

    const { stdout } = await this.runTmux([
      "list-panes",
      "-a",
      "-F",
      "#{session_name}\t#{pane_id}\t#{pane_current_command}\t#{pane_current_path}",
    ]);

    const discoveredSessions: AgentSessionRecord[] = [];

    for (const paneInfo of parsePaneInfo(stdout)) {
      const capture = await this.capturePane(paneInfo.paneId);
      const outputPreview =
        pickPreview(capture) ?? `${paneInfo.currentCommand} is attached`;

      const agentSession = this.registry.upsertByTransportRef(
        `tmux:${paneInfo.paneId}`,
        {
          workspaceId: paneInfo.sessionName,
          hostId: "local-tmux",
          sourceType: "remote-tmux-discovered",
          agentKind: paneInfo.currentCommand,
          displayName: `tmux:${paneInfo.sessionName}:${paneInfo.paneId}`,
          workingDirectory: paneInfo.currentPath,
          connectionState: "online",
          interactionState: "detached",
          stateConfidence: "medium",
          outputPreview,
          controlMode: "observe",
          transportRef: {
            tmuxSession: paneInfo.sessionName,
            tmuxPane: paneInfo.paneId,
            runtimeId: `tmux:${paneInfo.paneId}`,
          },
        },
      );

      discoveredSessions.push(agentSession);
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

  private runTmux(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(TMUX_BINARY, args, {
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
          reject(new Error(stderr || `tmux exited with code ${code}`));
          return;
        }

        resolve({ stdout, stderr });
      });
    });
  }
}
