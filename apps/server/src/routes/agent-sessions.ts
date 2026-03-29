import type { FastifyInstance } from "fastify";

import type {
  LaunchRemoteAgentInput,
  LaunchLocalAgentInput,
  LaunchSshPtyInput,
  FocusAgentSessionInput,
  PtyResizeInput,
  RegisterAgentSessionInput,
  ScanDirectoryInput,
  StdinAgentSessionInput,
} from "@agent-orchestrator/shared";

import { scanAgentDirectory } from "../services/agent-scanner.js";
import { AgentSessionRegistry } from "../services/agent-session-registry.js";
import { LocalProcessRuntimeManager } from "../services/local-process-runtime-manager.js";
import { LocalTmuxAdapter } from "../services/local-tmux-adapter.js";
import { PtyRuntimeManager } from "../services/pty-runtime-manager.js";
import { SshRuntimeManager } from "../services/ssh-runtime-manager.js";

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

interface AgentSessionRoutesOptions {
  registry: AgentSessionRegistry;
  processRuntimeManager: LocalProcessRuntimeManager;
  tmuxAdapter: LocalTmuxAdapter;
  sshRuntimeManager: SshRuntimeManager;
  ptyRuntimeManager: PtyRuntimeManager;
}

export async function registerAgentSessionRoutes(
  fastify: FastifyInstance,
  options: AgentSessionRoutesOptions,
): Promise<void> {
  const {
    registry,
    processRuntimeManager,
    tmuxAdapter,
    sshRuntimeManager,
    ptyRuntimeManager,
  } = options;

  fastify.get("/api/health", async () => ({ status: "ok" }));

  fastify.get("/api/agent-sessions", async () => registry.list());

  fastify.get<{ Params: { id: string } }>(
    "/api/agent-sessions/:id",
    async (request) => {
      const agentSession = registry.get(request.params.id);

      if (agentSession.sourceType === "remote-tmux-discovered") {
        return tmuxAdapter.getDetail(agentSession);
      }

      return registry.getDetail(request.params.id);
    },
  );

  fastify.post<{ Body: RegisterAgentSessionInput }>(
    "/api/agent-sessions/register",
    async (request, reply) => {
      const agentSession = registry.register(request.body);
      reply.code(201);
      return agentSession;
    },
  );

  fastify.post<{ Body: FocusAgentSessionInput }>(
    "/api/agent-sessions/focus",
    async (request) => registry.focus(request.body),
  );

  fastify.post<{ Body: LaunchLocalAgentInput }>(
    "/api/agent-launch/local",
    async (request, reply) => {
      const agentSession = processRuntimeManager.launch(request.body);
      reply.code(201);
      return agentSession;
    },
  );

  fastify.post<{ Body: LaunchRemoteAgentInput }>(
    "/api/agent-launch/remote",
    async (request, reply) => {
      const agentSession = sshRuntimeManager.launch(request.body);
      reply.code(201);
      return agentSession;
    },
  );

  fastify.post<{ Body: LaunchLocalAgentInput }>(
    "/api/agent-launch/pty",
    async (request, reply) => {
      const agentSession = ptyRuntimeManager.launch(request.body);
      reply.code(201);
      return agentSession;
    },
  );

  fastify.post<{ Body: LaunchSshPtyInput }>(
    "/api/agent-launch/ssh-pty",
    async (request, reply) => {
      const agentSession = ptyRuntimeManager.launchRemote(request.body);
      reply.code(201);
      return agentSession;
    },
  );

  fastify.post<{ Params: { id: string }; Body: PtyResizeInput }>(
    "/api/agent-sessions/:id/resize",
    async (request) => {
      ptyRuntimeManager.resize(
        request.params.id,
        request.body.cols,
        request.body.rows,
      );

      return { ok: true };
    },
  );

  fastify.post("/api/agent-discovery/tmux/scan", async () =>
    tmuxAdapter.discover(),
  );

  fastify.post<{ Params: { id: string } }>(
    "/api/agent-sessions/:id/tmux/takeover",
    async (request) => {
      const agentSession = registry.get(request.params.id);
      return tmuxAdapter.takeOver(agentSession);
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/api/agent-sessions/:id/tmux/release",
    async (request) => {
      const agentSession = registry.get(request.params.id);
      return tmuxAdapter.release(agentSession);
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/api/agent-sessions/:id/tmux/refresh",
    async (request) => {
      const agentSession = registry.get(request.params.id);
      return tmuxAdapter.refresh(agentSession);
    },
  );

  fastify.post<{ Params: { id: string }; Body: StdinAgentSessionInput }>(
    "/api/agent-sessions/:id/stdin",
    async (request) => {
      const agentSession = registry.get(request.params.id);

      if (agentSession.sourceType === "remote-tmux-discovered") {
        return tmuxAdapter.writeInput(agentSession, request.body);
      }

      if (
        agentSession.sourceType === "remote-connect" &&
        agentSession.transportRef?.runtimeId?.startsWith("ssh:")
      ) {
        return sshRuntimeManager.writeInput(request.params.id, request.body);
      }

      return processRuntimeManager.writeInput(request.params.id, request.body);
    },
  );

  fastify.post<{ Body: ScanDirectoryInput }>(
    "/api/agent-discovery/scan",
    async (request) => scanAgentDirectory(request.body),
  );

  fastify.delete<{ Params: { id: string } }>(
    "/api/agent-sessions/:id",
    async (request, reply) => {
      const { id } = request.params;
      ptyRuntimeManager.kill(id);
      registry.remove(id);
      reply.code(204);
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/api/agent-sessions/:id/reconnect",
    async (request) => {
      const session = registry.get(request.params.id);
      if (session.sshTarget && session.transportRef?.tmuxSession) {
        return ptyRuntimeManager.reconnectRemote(request.params.id, {
          workspaceId: session.workspaceId,
          displayName: session.displayName,
          agentKind: session.agentKind,
          sshTarget: session.sshTarget,
          remoteCommand: wrapRemoteReconnectCommand(
            buildTmuxAttachCommand(
              session.transportRef.tmuxSession,
              session.transportRef.tmuxPane,
            ),
          ),
          workingDirectory: session.workingDirectory,
          tmuxSessionName: session.transportRef.tmuxSession,
          tmuxPaneId: session.transportRef.tmuxPane,
        });
      }

      if (session.sshTarget && session.remoteCommand) {
        return ptyRuntimeManager.reconnectRemote(request.params.id, {
          workspaceId: session.workspaceId,
          displayName: session.displayName,
          agentKind: session.agentKind,
          sshTarget: session.sshTarget,
          remoteCommand: session.remoteCommand,
          workingDirectory: session.workingDirectory,
          tmuxSessionName: session.transportRef?.tmuxSession,
          tmuxPaneId: session.transportRef?.tmuxPane,
        });
      }
      const cmd = session.transportRef?.tmuxSession
        ? buildTmuxAttachCommand(
            session.transportRef.tmuxSession,
            session.transportRef.tmuxPane,
          )
        : session.agentSessionId
          ? buildDirectLaunchCommand(
              session.agentKind,
              session.workingDirectory ?? "~",
              session.displayName,
              session.agentSessionId,
            )
          : buildDirectLaunchCommand(
              session.agentKind,
              session.workingDirectory ?? "~",
              session.displayName,
            );
      return ptyRuntimeManager.reconnectLocal(request.params.id, {
        workspaceId: session.workspaceId,
        displayName: session.displayName,
        agentKind: session.agentKind,
        command: cmd,
        workingDirectory: session.workingDirectory,
        tmuxSessionName: session.transportRef?.tmuxSession,
        tmuxPaneId: session.transportRef?.tmuxPane,
      });
    },
  );
}

function wrapRemoteReconnectCommand(command: string): string {
  return `zsh -i -c ${JSON.stringify(command)}`;
}
