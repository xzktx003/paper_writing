import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

import { buildTerminalWebSocketUrl } from "../lib/api";

interface TerminalViewProps {
  agentSessionId: string;
  interactive?: boolean;
  suspended?: boolean;
}

type TerminalContainer = HTMLDivElement & {
  __xterm?: Terminal;
};

interface TerminalInputOwner {
  token: symbol;
  priority: number;
}

interface TerminalControlFrame {
  __agentOrchestrator: "terminal-control";
  event: "replay" | "replay-complete";
  data?: string;
}

interface TerminalGeometry {
  cols: number;
  rows: number;
  width: number;
  height: number;
}

const DEFAULT_PREVIEW_GEOMETRY: TerminalGeometry = {
  cols: 120,
  rows: 30,
  width: 1180,
  height: 760,
};

const previewGeometryCache = new Map<string, TerminalGeometry>();
const terminalInputOwners = new Map<string, TerminalInputOwner>();

export function TerminalView({
  agentSessionId,
  interactive = true,
  suspended = false,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);

  useEffect(() => {
    if (suspended) {
      return;
    }

    const container = containerRef.current as TerminalContainer | null;
    const stage = interactive
      ? container
      : (stageRef.current as HTMLDivElement | null);
    if (!container || !stage) return;

    const timeoutIds: number[] = [];
    const animationFrameIds: number[] = [];
    const isPreview = !interactive;
    const ownerToken = Symbol(agentSessionId);
    const ownerPriority = interactive ? 2 : 1;
    let handleMouseDown: (() => void) | null = null;
    let disposed = false;
    let closeAfterOpen = false;

    const ensureInputOwner = () => {
      const currentOwner = terminalInputOwners.get(agentSessionId);
      if (
        !currentOwner ||
        currentOwner.token === ownerToken ||
        currentOwner.priority <= ownerPriority
      ) {
        terminalInputOwners.set(agentSessionId, {
          token: ownerToken,
          priority: ownerPriority,
        });
        return true;
      }

      return false;
    };

    ensureInputOwner();

    const cachePreviewGeometry = (cols: number, rows: number) => {
      if (isPreview) {
        return;
      }

      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) {
        return;
      }

      previewGeometryCache.set(agentSessionId, {
        cols,
        rows,
        width,
        height,
      });
    };

    const applyPreviewLayout = () => {
      if (!isPreview) {
        return;
      }

      const geometry =
        previewGeometryCache.get(agentSessionId) ?? DEFAULT_PREVIEW_GEOMETRY;
      const scale = Math.min(
        container.clientWidth / geometry.width || 1,
        container.clientHeight / geometry.height || 1,
      );

      stage.style.width = `${geometry.width}px`;
      stage.style.height = `${geometry.height}px`;
      stage.style.left = "50%";
      stage.style.top = "50%";
      stage.style.transformOrigin = "center center";
      stage.style.transform = `translate(-50%, -50%) scale(${Math.max(scale, 0.01)})`;
    };

    const term = new Terminal({
      cursorBlink: interactive,
      fontSize: 14,
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", monospace',
      theme: {
        background: "#0e1217",
        foreground: "#f4f1ea",
        cursor: "#ff8f1f",
        selectionBackground: "rgba(255, 152, 0, 0.3)",
      },
      scrollback: 5000,
      disableStdin: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    applyPreviewLayout();
    term.open(stage);
    container.__xterm = term;

    termRef.current = term;
    fitRef.current = fitAddon;

    const wsUrl = buildTerminalWebSocketUrl(agentSessionId);
    let ws: WebSocket | null = null;
    let replayComplete = false;
    const connectTimeoutId = window.setTimeout(() => {
      if (disposed) {
        return;
      }

      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          handleTerminalFrame(event.data);
        } else if (event.data instanceof Blob) {
          event.data.text().then((text) => handleTerminalFrame(text));
        }
      };

      ws.onopen = () => {
        if (disposed || closeAfterOpen) {
          ws?.close();
          return;
        }

        flushResize();
        scheduleFit();
      };

      ws.onclose = () => {
        if (disposed) {
          return;
        }

        term.write("\r\n\x1b[33m[连接已断开]\x1b[0m\r\n");
      };
    }, 0);

    const flushResize = () => {
      if (isPreview) {
        return;
      }

      const size = pendingResizeRef.current;
      if (!size || ws?.readyState !== WebSocket.OPEN) {
        return;
      }

      ws.send(
        JSON.stringify({
          type: "resize",
          cols: size.cols,
          rows: size.rows,
        }),
      );
    };

    const fitTerminal = () => {
      try {
        applyPreviewLayout();
        fitAddon.fit();
        if (term.cols > 0 && term.rows > 0) {
          cachePreviewGeometry(term.cols, term.rows);
        }
        term.refresh(0, Math.max(term.rows - 1, 0));
      } catch {
        /* container may not be measurable yet */
      }
    };

    const scheduleFit = () => {
      const frameId = window.requestAnimationFrame(() => {
        fitTerminal();

        const nestedFrameId = window.requestAnimationFrame(() => {
          fitTerminal();
        });
        animationFrameIds.push(nestedFrameId);
      });
      animationFrameIds.push(frameId);

      timeoutIds.push(window.setTimeout(fitTerminal, 32));
      timeoutIds.push(window.setTimeout(fitTerminal, 96));
    };

    const enableTerminalInput = () => {
      if (replayComplete) {
        return;
      }

      replayComplete = true;
      term.options.disableStdin = false;
    };

    const handleTerminalFrame = (payload: string) => {
      try {
        const parsed = JSON.parse(payload) as TerminalControlFrame;
        if (parsed.__agentOrchestrator !== "terminal-control") {
          enableTerminalInput();
          term.write(payload);
          return;
        }

        if (parsed.event === "replay" && typeof parsed.data === "string") {
          term.write(parsed.data);
          return;
        }

        if (parsed.event === "replay-complete") {
          enableTerminalInput();
        }
        return;
      } catch {
        enableTerminalInput();
        term.write(payload);
      }
    };

    term.onData((data) => {
      if (ws?.readyState === WebSocket.OPEN && ensureInputOwner()) {
        ws.send(data);
      }
    });

    term.onBinary((data) => {
      if (ws?.readyState === WebSocket.OPEN && ensureInputOwner()) {
        ws.send(
          JSON.stringify({
            type: "binary",
            data: btoa(data),
          }),
        );
      }
    });

    if (interactive) {
      term.attachCustomWheelEventHandler((event) => {
        event.stopPropagation();
        return true;
      });

      handleMouseDown = () => {
        term.focus();
      };

      container.addEventListener("mousedown", handleMouseDown);
    }

    term.onResize(({ cols, rows }) => {
      if (!isPreview) {
        cachePreviewGeometry(cols, rows);
        pendingResizeRef.current = { cols, rows };
        flushResize();
      }
    });

    scheduleFit();

    if (typeof document !== "undefined" && "fonts" in document) {
      void document.fonts.ready.then(() => {
        scheduleFit();
      });
    }

    const handleWindowResize = () => {
      scheduleFit();
    };
    window.addEventListener("resize", handleWindowResize);

    const resizeObserver = new ResizeObserver(() => {
      scheduleFit();
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleWindowResize);
      resizeObserver.disconnect();
      if (handleMouseDown) {
        container.removeEventListener("mousedown", handleMouseDown);
      }
      window.clearTimeout(connectTimeoutId);
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
      for (const animationFrameId of animationFrameIds) {
        window.cancelAnimationFrame(animationFrameId);
      }

      const currentOwner = terminalInputOwners.get(agentSessionId);
      if (currentOwner?.token === ownerToken) {
        terminalInputOwners.delete(agentSessionId);
      }

      if (ws?.readyState === WebSocket.CONNECTING) {
        closeAfterOpen = true;
      } else if (ws?.readyState === WebSocket.OPEN) {
        ws.close();
      }

      term.dispose();
      delete container.__xterm;
      termRef.current = null;
      wsRef.current = null;
      fitRef.current = null;
      pendingResizeRef.current = null;
    };
  }, [agentSessionId, interactive, suspended]);

  return (
    <div
      ref={containerRef}
      className={`terminal-view ${interactive ? "terminal-view-live" : "terminal-view-preview"}`}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {!interactive && !suspended && (
        <div ref={stageRef} className="terminal-view-stage" />
      )}
    </div>
  );
}
