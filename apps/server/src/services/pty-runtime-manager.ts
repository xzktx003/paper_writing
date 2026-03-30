import * as pty from "node-pty";

import type {
  AgentSessionRecord,
  LaunchLocalAgentInput,
  LaunchSshPtyInput,
} from "@agent-orchestrator/shared";

import { AgentSessionRegistry } from "./agent-session-registry.js";

type PtyDataListener = (data: string) => void;

const MAX_SCROLLBACK_BYTES = 256 * 1024; // 256 KB replay buffer

interface PtyHandle {
  ptyProcess: pty.IPty;
  dataListeners: Set<PtyDataListener>;
  scrollback: string[];
  scrollbackBytes: number;
}

export class PtyRuntimeManager {
  private readonly handles = new Map<string, PtyHandle>();

  constructor(private readonly registry: AgentSessionRegistry) {}

  launch(input: LaunchLocalAgentInput): AgentSessionRecord {
    const shell = process.env.SHELL ?? "/bin/zsh";

    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: input.workingDirectory ?? process.cwd(),
      env: process.env as Record<string, string>,
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
      outputPreview: `启动中: ${input.command}`,
      controlMode: "control",
      transportRef: {
        processId: ptyProcess.pid,
        tmuxSession: input.tmuxSessionName,
        tmuxPane: input.tmuxPaneId,
        runtimeId: `pty:${ptyProcess.pid}`,
      },
    });

    const handle: PtyHandle = {
      ptyProcess,
      dataListeners: new Set(),
      scrollback: [],
      scrollbackBytes: 0,
    };

    this.handles.set(agentSession.id, handle);

    ptyProcess.onData((data: string) => {
      if (!this.registry.has(agentSession.id)) {
        return;
      }

      this.appendScrollback(handle, data);

      for (const listener of handle.dataListeners) {
        listener(data);
      }

      this.registry.appendOutput(agentSession.id, data, "stdout");
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.handles.delete(agentSession.id);

      if (!this.registry.has(agentSession.id)) {
        return;
      }

      this.registry.markExited(agentSession.id, exitCode, null);
    });

    // Send initial command if provided
    if (input.command) {
      ptyProcess.write(input.command + "\n");
    }

    return this.registry.get(agentSession.id);
  }

  launchRemote(input: LaunchSshPtyInput): AgentSessionRecord {
    const args = ["-t"];

    if (input.sshTarget.port) {
      args.push("-p", String(input.sshTarget.port));
    }

    if (input.sshTarget.identityFile) {
      args.push("-i", input.sshTarget.identityFile);
    }

    const userHost = input.sshTarget.username
      ? `${input.sshTarget.username}@${input.sshTarget.host}`
      : input.sshTarget.host;
    args.push(userHost, input.remoteCommand);

    const ptyProcess = pty.spawn("ssh", args, {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: process.env.HOME ?? process.cwd(),
      env: process.env as Record<string, string>,
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
      outputPreview: `SSH → ${userHost}: ${input.remoteCommand}`,
      controlMode: "control",
      transportRef: {
        processId: ptyProcess.pid,
        tmuxSession: input.tmuxSessionName,
        tmuxPane: input.tmuxPaneId,
        runtimeId: `ssh-pty:${ptyProcess.pid}`,
        sshHost: input.sshTarget.host,
        sshPort: input.sshTarget.port,
        sshUsername: input.sshTarget.username,
      },
      agentSessionId: input.agentSessionId,
      sshTarget: input.sshTarget,
      remoteCommand: input.remoteCommand,
    });

    const handle: PtyHandle = {
      ptyProcess,
      dataListeners: new Set(),
      scrollback: [],
      scrollbackBytes: 0,
    };

    this.handles.set(agentSession.id, handle);

    ptyProcess.onData((data: string) => {
      if (!this.registry.has(agentSession.id)) {
        return;
      }

      this.appendScrollback(handle, data);

      for (const listener of handle.dataListeners) {
        listener(data);
      }

      this.registry.appendOutput(agentSession.id, data, "stdout");
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.handles.delete(agentSession.id);

      if (!this.registry.has(agentSession.id)) {
        return;
      }

      this.registry.markExited(agentSession.id, exitCode, null);
    });

    return this.registry.get(agentSession.id);
  }

  write(agentSessionId: string, data: string): void {
    const handle = this.handles.get(agentSessionId);

    if (!handle) {
      throw new Error(`没有找到 PTY 运行时: ${agentSessionId}`);
    }

    this.registry.noteUserInput(agentSessionId, data);
    handle.ptyProcess.write(data);
  }

  resize(agentSessionId: string, cols: number, rows: number): void {
    const handle = this.handles.get(agentSessionId);

    if (!handle) {
      return;
    }

    handle.ptyProcess.resize(cols, rows);

    try {
      // Some interactive programs, especially ssh -> tmux, only propagate the
      // new window size after the foreground process receives SIGWINCH.
      process.kill(handle.ptyProcess.pid, "SIGWINCH");
    } catch {
      /* ignore processes that have already exited */
    }
  }

  subscribe(agentSessionId: string, listener: PtyDataListener): () => void {
    const handle = this.handles.get(agentSessionId);

    if (!handle) {
      throw new Error(`没有找到 PTY 运行时: ${agentSessionId}`);
    }

    // Replay scrollback buffer to the new subscriber
    if (handle.scrollback.length > 0) {
      const replay = handle.scrollback.join("");
      listener(replay);
    }

    handle.dataListeners.add(listener);

    return () => {
      handle.dataListeners.delete(listener);
    };
  }

  has(agentSessionId: string): boolean {
    return this.handles.has(agentSessionId);
  }

  kill(agentSessionId: string): void {
    const handle = this.handles.get(agentSessionId);
    if (handle) {
      handle.ptyProcess.kill();
      this.handles.delete(agentSessionId);
    }
  }

  reconnectRemote(
    agentSessionId: string,
    input: LaunchSshPtyInput,
  ): AgentSessionRecord {
    this.kill(agentSessionId);

    const args = ["-t"];
    if (input.sshTarget.port) {
      args.push("-p", String(input.sshTarget.port));
    }
    if (input.sshTarget.identityFile) {
      args.push("-i", input.sshTarget.identityFile);
    }
    const userHost = input.sshTarget.username
      ? `${input.sshTarget.username}@${input.sshTarget.host}`
      : input.sshTarget.host;
    args.push(userHost, input.remoteCommand);

    const ptyProcess = pty.spawn("ssh", args, {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: process.env.HOME ?? process.cwd(),
      env: process.env as Record<string, string>,
    });

    const handle: PtyHandle = {
      ptyProcess,
      dataListeners: new Set(),
      scrollback: [],
      scrollbackBytes: 0,
    };
    this.handles.set(agentSessionId, handle);

    this.registry.updateSession(agentSessionId, {
      connectionState: "online",
      interactionState: "running",
      stateConfidence: "medium",
      outputPreview: `重新连接中: SSH → ${userHost}`,
      transportRef: {
        processId: ptyProcess.pid,
        tmuxSession: input.tmuxSessionName,
        tmuxPane: input.tmuxPaneId,
        runtimeId: `ssh-pty:${ptyProcess.pid}`,
        sshHost: input.sshTarget.host,
        sshPort: input.sshTarget.port,
        sshUsername: input.sshTarget.username,
      },
    });

    ptyProcess.onData((data: string) => {
      if (!this.registry.has(agentSessionId)) {
        return;
      }

      this.appendScrollback(handle, data);
      for (const listener of handle.dataListeners) {
        listener(data);
      }
      this.registry.appendOutput(agentSessionId, data, "stdout");
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.handles.delete(agentSessionId);

      if (!this.registry.has(agentSessionId)) {
        return;
      }

      this.registry.markExited(agentSessionId, exitCode, null);
    });

    return this.registry.get(agentSessionId);
  }

  reconnectLocal(
    agentSessionId: string,
    input: LaunchLocalAgentInput,
  ): AgentSessionRecord {
    this.kill(agentSessionId);

    const shell = process.env.SHELL ?? "/bin/zsh";
    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: input.workingDirectory ?? process.cwd(),
      env: process.env as Record<string, string>,
    });

    const handle: PtyHandle = {
      ptyProcess,
      dataListeners: new Set(),
      scrollback: [],
      scrollbackBytes: 0,
    };
    this.handles.set(agentSessionId, handle);

    this.registry.updateSession(agentSessionId, {
      connectionState: "online",
      interactionState: "running",
      stateConfidence: "medium",
      outputPreview: `重新连接中: ${input.command}`,
      transportRef: {
        processId: ptyProcess.pid,
        tmuxSession: input.tmuxSessionName,
        tmuxPane: input.tmuxPaneId,
        runtimeId: `pty:${ptyProcess.pid}`,
      },
    });

    ptyProcess.onData((data: string) => {
      if (!this.registry.has(agentSessionId)) {
        return;
      }

      this.appendScrollback(handle, data);
      for (const listener of handle.dataListeners) {
        listener(data);
      }
      this.registry.appendOutput(agentSessionId, data, "stdout");
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.handles.delete(agentSessionId);

      if (!this.registry.has(agentSessionId)) {
        return;
      }

      this.registry.markExited(agentSessionId, exitCode, null);
    });

    if (input.command) {
      ptyProcess.write(input.command + "\n");
    }

    return this.registry.get(agentSessionId);
  }

  private appendScrollback(handle: PtyHandle, data: string): void {
    handle.scrollback.push(data);
    handle.scrollbackBytes += data.length;

    while (
      handle.scrollbackBytes > MAX_SCROLLBACK_BYTES &&
      handle.scrollback.length > 1
    ) {
      const removed = handle.scrollback.shift()!;
      handle.scrollbackBytes -= removed.length;
    }
  }
}
