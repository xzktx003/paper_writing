import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type {
  AgentSessionRecord,
  LaunchRemoteAgentInput,
  StdinAgentSessionInput,
} from "@agent-orchestrator/shared";

import { AgentSessionRegistry } from "./agent-session-registry.js";
import { buildSshArgs, formatSshDestination } from "./ssh-command.js";

function quoteForPosixShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildRemoteCommand(input: LaunchRemoteAgentInput): string {
  const remoteCommands: string[] = [];

  if (input.workingDirectory) {
    remoteCommands.push(`cd ${quoteForPosixShell(input.workingDirectory)}`);
  }

  remoteCommands.push(input.command);
  return remoteCommands.join(" && ");
}

export class SshRuntimeManager {
  private readonly processes = new Map<
    string,
    ChildProcessWithoutNullStreams
  >();

  constructor(private readonly registry: AgentSessionRegistry) {}

  launch(input: LaunchRemoteAgentInput): AgentSessionRecord {
    const sshTarget = formatSshDestination(input.sshTarget);
    const sshArgs = buildSshArgs(input.sshTarget, {
      batchMode: true,
      remoteCommand: buildRemoteCommand(input),
    });

    const childProcess = spawn("ssh", sshArgs, {
      env: process.env,
      stdio: "pipe",
    });

    const agentSession = this.registry.register({
      workspaceId: input.workspaceId,
      hostId: input.sshTarget.host,
      sourceType: "remote-connect",
      agentKind: input.agentKind,
      displayName: input.displayName,
      workingDirectory: input.workingDirectory,
      connectionState: "online",
      interactionState: "running",
      stateConfidence: "medium",
      outputPreview: `Launching over SSH: ${input.command}`,
      controlMode: "control",
      transportRef: {
        processId: childProcess.pid,
        runtimeId: `ssh:${childProcess.pid ?? "unknown"}`,
        sshHost: input.sshTarget.host,
        sshPort: input.sshTarget.port,
        sshUsername: input.sshTarget.username,
      },
    });

    this.processes.set(agentSession.id, childProcess);
    this.registry.appendOutput(
      agentSession.id,
      `Opening SSH session to ${sshTarget}`,
      "system",
    );

    childProcess.stdout.on("data", (chunk: Buffer) => {
      this.registry.appendOutput(
        agentSession.id,
        chunk.toString("utf8"),
        "stdout",
      );
    });

    childProcess.stderr.on("data", (chunk: Buffer) => {
      this.registry.appendOutput(
        agentSession.id,
        chunk.toString("utf8"),
        "stderr",
      );
    });

    childProcess.on("error", (error: Error) => {
      this.registry.appendOutput(
        agentSession.id,
        `SSH runtime error: ${error.message}`,
        "stderr",
      );
      this.registry.updateSession(agentSession.id, {
        connectionState: "degraded",
      });
    });

    childProcess.on("exit", (exitCode, signal) => {
      this.processes.delete(agentSession.id);
      this.registry.markExited(agentSession.id, exitCode, signal);
    });

    return this.registry.get(agentSession.id);
  }

  writeInput(
    agentSessionId: string,
    input: StdinAgentSessionInput,
  ): AgentSessionRecord {
    const childProcess = this.processes.get(agentSessionId);

    if (!childProcess) {
      throw new Error(
        `No SSH runtime found for agent session: ${agentSessionId}`,
      );
    }

    const payload = input.input.endsWith("\n")
      ? input.input
      : `${input.input}\n`;
    childProcess.stdin.write(payload);

    return this.registry.writeToSession(agentSessionId, input);
  }
}
