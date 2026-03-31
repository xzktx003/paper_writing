import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";

import type { AgentSessionSnapshotEvent } from "@agent-orchestrator/shared";

import { registerAgentSessionRoutes } from "./routes/agent-sessions.js";
import { registerSshHostsRoutes } from "./routes/ssh-hosts.js";
import { AgentSessionRegistry } from "./services/agent-session-registry.js";
import { LocalProcessRuntimeManager } from "./services/local-process-runtime-manager.js";
import { LocalTmuxAdapter } from "./services/local-tmux-adapter.js";
import { ObserveSessionManager } from "./services/observe-session-manager.js";
import { PtyRuntimeManager } from "./services/pty-runtime-manager.js";
import { SshRuntimeManager } from "./services/ssh-runtime-manager.js";

export function buildServer(): {
  app: ReturnType<typeof Fastify>;
  registry: AgentSessionRegistry;
} {
  const app = Fastify({ logger: true });
  const registry = new AgentSessionRegistry();
  const processRuntimeManager = new LocalProcessRuntimeManager(registry);
  const tmuxAdapter = new LocalTmuxAdapter(registry);
  const sshRuntimeManager = new SshRuntimeManager(registry);
  const ptyRuntimeManager = new PtyRuntimeManager(registry);
  const observeSessionManager = new ObserveSessionManager(registry);

  app.register(cors, {
    origin: true,
  });

  app.register(websocket);

  app.register(async (instance) => {
    await registerAgentSessionRoutes(instance, {
      registry,
      processRuntimeManager,
      tmuxAdapter,
      sshRuntimeManager,
      ptyRuntimeManager,
      observeSessionManager,
    });

    await registerSshHostsRoutes(instance);

    instance.get("/ws/agent-sessions", { websocket: true }, (socket) => {
      const unsubscribe = registry.subscribe((snapshot) => {
        const event: AgentSessionSnapshotEvent = {
          type: "snapshot",
          payload: snapshot,
        };

        socket.send(JSON.stringify(event));
      });

      socket.on("close", () => {
        unsubscribe();
      });
    });

    instance.get<{ Params: { id: string } }>(
      "/ws/agent-sessions/:id/terminal",
      { websocket: true },
      (socket, request) => {
        const { id } = request.params;

        const buildTerminalControlFrame = (
          event: "replay" | "replay-complete",
          data?: string,
        ) =>
          JSON.stringify({
            __agentOrchestrator: "terminal-control",
            event,
            data,
          });

        if (!ptyRuntimeManager.has(id)) {
          socket.close(4004, "没有找到 PTY 会话");
          return;
        }

        let replaying = true;
        const bufferedLiveFrames: string[] = [];
        const unsubscribe = ptyRuntimeManager.subscribe(
          id,
          (data) => {
            if (replaying) {
              bufferedLiveFrames.push(data);
              return;
            }

            socket.send(data);
          },
          { replay: false },
        );

        const replay = ptyRuntimeManager.getScrollback(id);
        if (replay) {
          socket.send(buildTerminalControlFrame("replay", replay));
        }
        socket.send(buildTerminalControlFrame("replay-complete"));
        replaying = false;

        for (const frame of bufferedLiveFrames) {
          socket.send(frame);
        }
        bufferedLiveFrames.length = 0;

        socket.on("message", (message: Buffer | string) => {
          const writeToRuntime = (payload: string) => {
            try {
              ptyRuntimeManager.write(id, payload);
            } catch {
              // The browser can still flush a final input frame after the
              // PTY has exited or the session has been deleted.
            }
          };

          const text =
            typeof message === "string" ? message : message.toString("utf8");

          if (text.startsWith('{"type":"resize"')) {
            try {
              const parsed = JSON.parse(text) as {
                type: string;
                cols: number;
                rows: number;
              };

              ptyRuntimeManager.resize(id, parsed.cols, parsed.rows);
            } catch {
              /* ignore malformed resize */
            }

            return;
          }

          if (text.startsWith('{"type":"binary"')) {
            try {
              const parsed = JSON.parse(text) as {
                type: string;
                data: string;
              };

              const payload = Buffer.from(parsed.data, "base64").toString(
                "latin1",
              );
              writeToRuntime(payload);
            } catch {
              /* ignore malformed binary frame */
            }

            return;
          }

          writeToRuntime(text);
        });

        socket.on("close", () => {
          unsubscribe();
        });
      },
    );
  });

  // Sweep expired window-capture sessions every 5 seconds
  const sweepInterval = setInterval(() => {
    observeSessionManager.sweepExpiredSessions();
  }, 5_000);

  app.addHook("onClose", () => {
    clearInterval(sweepInterval);
  });

  return { app, registry };
}
