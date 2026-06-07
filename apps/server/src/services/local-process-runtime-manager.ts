import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type {
  AgentSessionRecord,
  LaunchLocalAgentInput,
  StdinAgentSessionInput,
} from "@agent-orchestrator/shared";

import { AgentSessionRegistry } from "./agent-session-registry.js";
import { resolveLocalWorkingDirectory } from "./resolve-local-working-directory.js";
import { normalizeStdinPayload } from "./stdin-payload.js";

export class LocalProcessRuntimeManager {
  private readonly processes = new Map<
    string,
    ChildProcessWithoutNullStreams
  >();

  constructor(private readonly registry: AgentSessionRegistry) {}

  launch(input: LaunchLocalAgentInput): AgentSessionRecord {
    const childProcess = spawn(input.command, {
      cwd: resolveLocalWorkingDirectory(input.workingDirectory),
      env: process.env,
      shell: true,
      stdio: "pipe",
    });

    const agentSession = this.registry.register({
      workspaceId: input.workspaceId,
      hostId: input.hostId ?? "local",
      sourceType: "local",
      agentKind: input.agentKind,
      displayName: input.displayName,
      workingDirectory: input.workingDirectory,
      connectionState: "online",
      interactionState: "running",
      stateConfidence: "medium",
      outputPreview: `Launching: ${input.command}`,
      transportRef: {
        processId: childProcess.pid,
        runtimeId: `local:${childProcess.pid ?? "unknown"}`,
      },
    });

    this.processes.set(agentSession.id, childProcess);
    this.registry.appendOutput(
      agentSession.id,
      `Launching command: ${input.command}`,
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
        `Runtime error: ${error.message}`,
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
        `No local runtime found for agent session: ${agentSessionId}`,
      );
    }

    childProcess.stdin.write(normalizeStdinPayload(input.input));

    return this.registry.writeToSession(agentSessionId, input);
  }
}
