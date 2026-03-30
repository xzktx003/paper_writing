import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

import { buildTerminalWebSocketUrl } from "../lib/api";

interface TerminalViewProps {
  agentSessionId: string;
  interactive?: boolean;
}

type TerminalContainer = HTMLDivElement & {
  __xterm?: Terminal;
};

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

export function TerminalView({
  agentSessionId,
  interactive = true,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current as TerminalContainer | null;
    const stage = interactive
      ? container
      : (stageRef.current as HTMLDivElement | null);
    if (!container || !stage) return;

    const timeoutIds: number[] = [];
    const animationFrameIds: number[] = [];
    const isPreview = !interactive;
    let handleMouseDown: (() => void) | null = null;

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
      disableStdin: !interactive,
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
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const flushResize = () => {
      if (isPreview) {
        return;
      }

      const size = pendingResizeRef.current;
      if (!size || ws.readyState !== WebSocket.OPEN) {
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

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        term.write(event.data);
      } else if (event.data instanceof Blob) {
        event.data.text().then((text) => term.write(text));
      }
    };

    ws.onopen = () => {
      flushResize();
      scheduleFit();
    };

    ws.onclose = () => {
      term.write("\r\n\x1b[33m[连接已断开]\x1b[0m\r\n");
    };

    if (interactive) {
      term.attachCustomWheelEventHandler((event) => {
        event.stopPropagation();
        return true;
      });

      handleMouseDown = () => {
        term.focus();
      };

      container.addEventListener("mousedown", handleMouseDown);

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      term.onBinary((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "binary",
              data: btoa(data),
            }),
          );
        }
      });
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
      window.removeEventListener("resize", handleWindowResize);
      resizeObserver.disconnect();
      if (handleMouseDown) {
        container.removeEventListener("mousedown", handleMouseDown);
      }
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
      for (const animationFrameId of animationFrameIds) {
        window.cancelAnimationFrame(animationFrameId);
      }
      ws.close();
      term.dispose();
      delete container.__xterm;
      termRef.current = null;
      wsRef.current = null;
      fitRef.current = null;
      pendingResizeRef.current = null;
    };
  }, [agentSessionId, interactive]);

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
      {!interactive && <div ref={stageRef} className="terminal-view-stage" />}
    </div>
  );
}
