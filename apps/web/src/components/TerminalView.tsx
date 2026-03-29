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

export function TerminalView({
  agentSessionId,
  interactive = true,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current as TerminalContainer | null;
    if (!container) return;
    const timeoutIds: number[] = [];

    const term = new Terminal({
      cursorBlink: interactive,
      fontSize: interactive ? 14 : 10,
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
    term.open(container);
    container.__xterm = term;

    termRef.current = term;
    fitRef.current = fitAddon;

    const wsUrl = buildTerminalWebSocketUrl(agentSessionId);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const flushResize = () => {
      const size = pendingResizeRef.current;
      if (!size || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      ws.send(JSON.stringify({
        type: 'resize',
        cols: size.cols,
        rows: size.rows,
      }));
    };

    const fitTerminal = () => {
      try {
        fitAddon.fit();
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
        timeoutIds.push(nestedFrameId);
      });
      timeoutIds.push(frameId);

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

    term.attachCustomWheelEventHandler((event) => {
      event.stopPropagation();
      return true;
    });

    container.addEventListener("mousedown", () => {
      term.focus();
    });

    if (interactive) {
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
      pendingResizeRef.current = { cols, rows };
      flushResize();
    });

    scheduleFit();

    if (typeof document !== 'undefined' && 'fonts' in document) {
      void document.fonts.ready.then(() => {
        scheduleFit();
      });
    }

    const handleWindowResize = () => {
      scheduleFit();
    };
    window.addEventListener('resize', handleWindowResize);

    const resizeObserver = new ResizeObserver(() => {
      scheduleFit();
    });
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      resizeObserver.disconnect();
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
        window.cancelAnimationFrame(timeoutId);
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
      className="terminal-view"
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    />
  );
}
