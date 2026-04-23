import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

import { buildTerminalWebSocketUrl } from "../lib/api";
import { stripTerminalResponsePayload } from "../lib/terminal-input";

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
    let handleMouseDownCapture: (() => void) | null = null;
    let handlePointerDownCapture: (() => void) | null = null;
    let handleTerminalFocusOut: ((event: FocusEvent) => void) | null = null;
    let handleTerminalInputFocus: (() => void) | null = null;
    let handleTerminalInputBlur: (() => void) | null = null;
    let handleWindowFocus: (() => void) | null = null;
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
    const helperTextarea = container.querySelector(
      ".xterm-helper-textarea",
    ) as HTMLTextAreaElement | null;

    termRef.current = term;
    fitRef.current = fitAddon;

    const isIntentionalExternalFocus = (): boolean => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body) return false;
      if (active.classList.contains("xterm-helper-textarea")) return false;
      return (
        active instanceof HTMLIFrameElement ||
        active instanceof HTMLInputElement ||
        active instanceof HTMLButtonElement ||
        active instanceof HTMLSelectElement ||
        active instanceof HTMLTextAreaElement ||
        Boolean(active.isContentEditable) ||
        active.closest('[role="dialog"]') !== null ||
        active.closest('[role="alertdialog"]') !== null
      );
    };

    const focusInteractiveTerminal = (unlockInput = false) => {
      if (!interactive) {
        return;
      }

      // When called passively (not from a direct user click on the terminal),
      // don't steal focus from intentional interactive elements such as buttons,
      // inputs, or open dialogs.
      if (!unlockInput && isIntentionalExternalFocus()) {
        return;
      }

      if (unlockInput) {
        term.options.disableStdin = false;
      }
      ensureInputOwner();
      term.focus();
    };

    const scheduleFocusInteractiveTerminal = (unlockInput = false) => {
      if (!interactive) {
        return;
      }

      focusInteractiveTerminal(unlockInput);

      const frameId = window.requestAnimationFrame(() => {
        if (!disposed) {
          focusInteractiveTerminal(unlockInput);
        }
      });
      animationFrameIds.push(frameId);

      timeoutIds.push(
        window.setTimeout(() => {
          if (!disposed) {
            focusInteractiveTerminal(unlockInput);
          }
        }, 0),
      );

      timeoutIds.push(
        window.setTimeout(() => {
          if (!disposed) {
            focusInteractiveTerminal(unlockInput);
          }
        }, 32),
      );
    };

    const wsUrl = buildTerminalWebSocketUrl(agentSessionId);
    let ws: WebSocket | null = null;
    let replayComplete = false;
    let lastReportedTerminalFocus: "in" | "out" | null = null;

    const terminalWantsFocusReports = () => {
      return (
        (
          term as Terminal & {
            modes?: { sendFocusMode?: boolean };
          }
        ).modes?.sendFocusMode ?? false
      );
    };

    const syncTerminalFocusReport = () => {
      if (!interactive) {
        return;
      }

      if (!terminalWantsFocusReports()) {
        lastReportedTerminalFocus = null;
        return;
      }

      if (ws?.readyState !== WebSocket.OPEN) {
        return;
      }

      const nextFocusState =
        document.activeElement === helperTextarea ? "in" : "out";
      if (lastReportedTerminalFocus === nextFocusState) {
        return;
      }

      if (!ensureInputOwner()) {
        return;
      }

      ws.send(nextFocusState === "in" ? "\u001b[I" : "\u001b[O");
      lastReportedTerminalFocus = nextFocusState;
    };

    const scheduleTerminalFocusReport = () => {
      timeoutIds.push(
        window.setTimeout(() => {
          if (!disposed) {
            syncTerminalFocusReport();
          }
        }, 0),
      );
    };

    // Safety net: if the WebSocket never sends replay-complete (e.g. connection
    // refused, server error, or long replay transfer), unblock stdin after 8
    // seconds so the user is never permanently locked out.
    timeoutIds.push(
      window.setTimeout(() => {
        if (!disposed) {
          enableTerminalInput();
        }
      }, 8000),
    );

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
        scheduleFocusInteractiveTerminal();
        scheduleTerminalFocusReport();
      };

      ws.onclose = () => {
        if (disposed) {
          return;
        }

        // Ensure stdin is always unblocked even if the connection dropped
        // before the server sent replay-complete. Without this, disableStdin
        // stays true permanently and the terminal silently ignores all input.
        enableTerminalInput();
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
      scheduleFocusInteractiveTerminal();
      scheduleTerminalFocusReport();
    };

    const handleTerminalFrame = (payload: string) => {
      try {
        const parsed = JSON.parse(payload) as TerminalControlFrame;
        if (parsed.__agentOrchestrator !== "terminal-control") {
          enableTerminalInput();
          term.write(payload);
          scheduleTerminalFocusReport();
          return;
        }

        if (parsed.event === "replay" && typeof parsed.data === "string") {
          term.write(parsed.data);
          scheduleTerminalFocusReport();
          return;
        }

        if (parsed.event === "replay-complete") {
          enableTerminalInput();
        }
        return;
      } catch {
        enableTerminalInput();
        term.write(payload);
        scheduleTerminalFocusReport();
      }
    };

    term.onData((data) => {
      const sanitized = stripTerminalResponsePayload(data);
      if (!sanitized) {
        return;
      }

      if (ws?.readyState === WebSocket.OPEN && ensureInputOwner()) {
        ws.send(sanitized);
      }
    });

    term.onBinary((data) => {
      const sanitized = stripTerminalResponsePayload(data);
      if (!sanitized) {
        return;
      }

      if (ws?.readyState === WebSocket.OPEN && ensureInputOwner()) {
        ws.send(
          JSON.stringify({
            type: "binary",
            data: btoa(sanitized),
          }),
        );
      }
    });

    if (interactive) {
      handleTerminalInputFocus = () => {
        scheduleTerminalFocusReport();
      };

      handleTerminalInputBlur = () => {
        scheduleTerminalFocusReport();
      };

      term.attachCustomWheelEventHandler((event) => {
        focusInteractiveTerminal(true);
        event.stopPropagation();
        return true;
      });

      handlePointerDownCapture = () => {
        focusInteractiveTerminal(true);
      };

      handleMouseDownCapture = () => {
        focusInteractiveTerminal(true);
      };

      handleTerminalFocusOut = (event) => {
        const target = event.target as HTMLElement | null;
        if (!target?.classList.contains("xterm-helper-textarea")) {
          return;
        }

        timeoutIds.push(
          window.setTimeout(() => {
            if (disposed || isIntentionalExternalFocus()) {
              return;
            }

            scheduleFocusInteractiveTerminal();
          }, 0),
        );
      };

      handleWindowFocus = () => {
        scheduleFocusInteractiveTerminal();
        scheduleTerminalFocusReport();
      };

      container.addEventListener("pointerdown", handlePointerDownCapture, true);
      container.addEventListener("mousedown", handleMouseDownCapture, true);
      container.addEventListener("focusout", handleTerminalFocusOut, true);
      window.addEventListener("focus", handleWindowFocus);
      helperTextarea?.addEventListener("focus", handleTerminalInputFocus);
      helperTextarea?.addEventListener("blur", handleTerminalInputBlur);
      scheduleFocusInteractiveTerminal();
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
      if (handlePointerDownCapture) {
        container.removeEventListener(
          "pointerdown",
          handlePointerDownCapture,
          true,
        );
      }
      if (handleMouseDownCapture) {
        container.removeEventListener(
          "mousedown",
          handleMouseDownCapture,
          true,
        );
      }
      if (handleTerminalFocusOut) {
        container.removeEventListener("focusout", handleTerminalFocusOut, true);
      }
      if (handleTerminalInputFocus) {
        helperTextarea?.removeEventListener("focus", handleTerminalInputFocus);
      }
      if (handleTerminalInputBlur) {
        helperTextarea?.removeEventListener("blur", handleTerminalInputBlur);
      }
      if (handleWindowFocus) {
        window.removeEventListener("focus", handleWindowFocus);
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
