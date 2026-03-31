import { randomUUID } from "node:crypto";

import type {
  AgentSessionRecord,
  CreateWindowCaptureSessionInput,
  CreateWindowCaptureSessionResponse,
  ObserveStateInput,
} from "@agent-orchestrator/shared";

import { AgentSessionRegistry } from "./agent-session-registry.js";

const DEFAULT_HEARTBEAT_TTL_MS = 30_000;

interface ObserveSessionEntry {
  observeToken: string;
  lastHeartbeatAt: number;
}

export class ObserveSessionManager {
  private readonly entries = new Map<string, ObserveSessionEntry>();

  constructor(
    private readonly registry: AgentSessionRegistry,
    private readonly heartbeatTtlMs = DEFAULT_HEARTBEAT_TTL_MS,
  ) {}

  createSession(
    input: CreateWindowCaptureSessionInput,
  ): CreateWindowCaptureSessionResponse {
    const observeToken = randomUUID();

    const rawLabel =
      input.windowCaptureMeta?.rawLabel?.trim() ||
      input.suggestedDisplayName?.trim() ||
      "VS Code 窗口";
    const displayName = input.suggestedDisplayName?.trim() || rawLabel;

    const agentSession = this.registry.register({
      workspaceId: "local-vscode-window-observe",
      hostId: "local",
      sourceType: "local-window-capture",
      agentKind: "vscode",
      displayName,
      controlMode: "observe",
      connectionState: "online",
      interactionState: "running",
      stateConfidence: "high",
      transportRef: {
        runtimeId: `display-capture:${randomUUID()}`,
      },
      windowCaptureMeta: { rawLabel },
    });

    this.entries.set(agentSession.id, {
      observeToken,
      lastHeartbeatAt: Date.now(),
    });

    return { agentSession, observeToken };
  }

  processObserveState(
    sessionId: string,
    input: ObserveStateInput,
  ): AgentSessionRecord {
    const entry = this.entries.get(sessionId);
    if (!entry) {
      throw new Error(`Unknown observe session: ${sessionId}`);
    }

    if (input.observeToken !== entry.observeToken) {
      throw new TokenMismatchError(sessionId);
    }

    const session = this.registry.get(sessionId);

    if (session.sourceType !== "local-window-capture") {
      throw new Error(
        `Session ${sessionId} is not a local-window-capture session`,
      );
    }

    if (input.kind === "heartbeat") {
      entry.lastHeartbeatAt = Date.now();

      const activityKey = input.screenSignature ?? input.outputPreview;
      if (activityKey !== undefined) {
        const updated = this.registry.syncCapturedScreen(
          sessionId,
          activityKey,
        );

        if (input.outputPreview === undefined) {
          return updated;
        }

        return this.registry.updateSession(sessionId, {
          outputPreview: input.outputPreview,
          interactionState: updated.interactionState,
          stateConfidence: updated.stateConfidence,
          lastHeartbeatAt: updated.lastHeartbeatAt,
          lastRefreshedAt: updated.lastRefreshedAt,
        });
      }

      return this.registry.updateSession(sessionId, {
        lastHeartbeatAt: new Date().toISOString(),
        ...(input.outputPreview !== undefined
          ? { outputPreview: input.outputPreview }
          : {}),
      });
    }

    // Transition
    this.validateTransition(
      session,
      input.connectionState,
      input.interactionState,
    );

    entry.lastHeartbeatAt = Date.now();

    const updated = this.registry.updateSession(sessionId, {
      connectionState: input.connectionState,
      interactionState: input.interactionState,
      stateConfidence: input.stateConfidence,
      ...(input.outputPreview !== undefined
        ? { outputPreview: input.outputPreview }
        : {}),
      lastHeartbeatAt: new Date().toISOString(),
    });

    // Clean up entry if session exited
    if (input.interactionState === "exited") {
      this.entries.delete(sessionId);
    }

    return updated;
  }

  sweepExpiredSessions(nowMs: number = Date.now()): string[] {
    const expired: string[] = [];

    for (const [sessionId, entry] of this.entries) {
      if (!this.registry.has(sessionId)) {
        this.entries.delete(sessionId);
        continue;
      }

      const session = this.registry.get(sessionId);

      // Only sweep sessions that are still online+running
      if (
        session.connectionState !== "online" ||
        session.interactionState === "exited" ||
        session.interactionState === "detached"
      ) {
        continue;
      }

      if (nowMs - entry.lastHeartbeatAt >= this.heartbeatTtlMs) {
        this.registry.updateSession(sessionId, {
          connectionState: "degraded",
          interactionState: "detached",
          stateConfidence: "medium",
          outputPreview: "心跳超时，观察连接已断开",
          lastHeartbeatAt: new Date(nowMs).toISOString(),
        });
        this.entries.delete(sessionId);
        expired.push(sessionId);
      }
    }

    return expired;
  }

  isRunningCapture(sessionId: string): boolean {
    if (!this.registry.has(sessionId)) {
      return false;
    }

    const session = this.registry.get(sessionId);

    return (
      session.sourceType === "local-window-capture" &&
      session.connectionState === "online" &&
      session.interactionState !== "exited" &&
      session.interactionState !== "detached"
    );
  }

  private validateTransition(
    session: AgentSessionRecord,
    nextConnection: string,
    nextInteraction: string,
  ): void {
    const current = `${session.interactionState}`;
    const next = `${nextInteraction}`;

    const allowed = [
      "running->running",
      "running->detached",
      "running->exited",
      "detached->exited",
    ];

    if (!allowed.includes(`${current}->${next}`)) {
      throw new InvalidTransitionError(session.id, current, next);
    }
  }
}

export class TokenMismatchError extends Error {
  constructor(sessionId: string) {
    super(`Token mismatch for session: ${sessionId}`);
    this.name = "TokenMismatchError";
  }
}

export class InvalidTransitionError extends Error {
  constructor(sessionId: string, from: string, to: string) {
    super(`Invalid transition for ${sessionId}: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}
