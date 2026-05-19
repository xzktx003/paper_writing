import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

import { buildTerminalWebSocketUrl } from "../lib/api";
import { shouldRepairPassiveTerminalFocus } from "../lib/terminal-focus";
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

const EXTERNAL_FOCUS_GRACE_MS = 750;
const PASSIVE_FOCUS_REPAIR_INTERVAL_MS = 500;

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
    const intervalIds: number[] = [];
    const animationFrameIds: number[] = [];
    const isPreview = !interactive;
    const ownerToken = Symbol(agentSessionId);
    const ownerPriority = interactive ? 2 : 1;
    let handleMouseDownCapture: (() => void) | null = null;
    let handlePointerDownCapture: (() => void) | null = null;
    let handleTerminalFocusIn: ((event: FocusEvent) => void) | null = null;
    let handleTerminalFocusOut: ((event: FocusEvent) => void) | null = null;
    let handleWindowFocus: (() => void) | null = null;
    let handleDocumentPointerDownCapture:
      | ((event: PointerEvent) => void)
      | null = null;
    let handleDocumentFocusInCapture: ((event: FocusEvent) => void) | null =
      null;
    let handleDocumentKeyDownCapture:
      | ((event: KeyboardEvent) => void)
      | null = null;
    let disposed = false;
    let closeAfterOpen = false;
    let lastProtectedExternalFocusAt = 0;
    let lastTerminalIntentAt = 0;

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
    const getHelperTextarea = () =>
      container.querySelector(
        ".xterm-helper-textarea",
      ) as HTMLTextAreaElement | null;

    termRef.current = term;
    fitRef.current = fitAddon;

    const isProtectedExternalFocusTarget = (
      active: HTMLElement | null,
    ): boolean => {
      if (!active || active === document.body) {
        return false;
      }

      if (active.classList.contains("xterm-helper-textarea")) {
        return false;
      }

      return (
        active instanceof HTMLIFrameElement ||
        active instanceof HTMLInputElement ||
        active instanceof HTMLSelectElement ||
        active instanceof HTMLTextAreaElement ||
        Boolean(active.isContentEditable) ||
        active.closest('[role="dialog"]') !== null ||
        active.closest('[role="alertdialog"]') !== null
      );
    };

    const rememberProtectedExternalFocus = (
      target: EventTarget | null,
    ): void => {
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest(".terminal-view")) {
        return;
      }

      if (!isProtectedExternalFocusTarget(target)) {
        return;
      }

      lastProtectedExternalFocusAt = Date.now();
    };

    const rememberTerminalIntent = (): void => {
      lastTerminalIntentAt = Date.now();
    };

    const isIntentionalExternalFocus = (): boolean => {
      const active = document.activeElement as HTMLElement | null;
      if (isProtectedExternalFocusTarget(active)) {
        return true;
      }

      if (!active || active === document.body) {
        return (
          Date.now() - lastProtectedExternalFocusAt < EXTERNAL_FOCUS_GRACE_MS
        );
      }

      // NOTE: HTMLButtonElement is intentionally NOT in this whitelist.
      // Kanban buttons (sidebar collapse, focus-back-to-grid, action toolbar
      // entries, etc.) are transient triggers — they do not accept text
      // input, so the terminal must be allowed to reclaim focus right away.
      // If we leave a button focused, syncTerminalFocusReport reports
      // CSI O (focus-out) to the embedded TUI and Copilot CLI silently
      // drops the next keystrokes ("input dies after I click any button"
      // regression). See tests/e2e/copilot-focus.spec.ts.
      return false;
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
        lastProtectedExternalFocusAt = 0;
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

      // The first sync after a TUI opts into focus tracking (DECSET 1004)
      // must optimistically report focus-in. Otherwise a transient
      // `document.activeElement !== helperTextarea` observed while the
      // terminal is still being (re)mounted or while xterm is flushing its
      // handshake reply would be reported as focus-out, and TUIs like
      // Copilot CLI then silently drop the user's first keystrokes until a
      // focus-in ever comes back. Subsequent focus/blur events on the
      // helper textarea will correct this if the terminal is in fact not
      // focused.
      if (lastReportedTerminalFocus === null) {
        if (!ensureInputOwner()) {
          return;
        }
        ws.send("\u001b[I");
        lastReportedTerminalFocus = "in";
        return;
      }

      const nextFocusState =
        document.activeElement === getHelperTextarea() ? "in" : "out";
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
      const repairPassiveFocusDrift = () => {
        const helperTextarea = getHelperTextarea();
        if (
          !shouldRepairPassiveTerminalFocus({
            documentHasFocus: document.hasFocus(),
            helperAvailable: helperTextarea !== null,
            helperFocused: document.activeElement === helperTextarea,
            intentionalExternalFocus: isIntentionalExternalFocus(),
            lastProtectedExternalFocusAt,
            lastTerminalIntentAt,
          })
        ) {
          return;
        }

        focusInteractiveTerminal();
        syncTerminalFocusReport();
      };

      handleTerminalFocusIn = (event) => {
        const target = event.target as HTMLElement | null;
        if (!target?.classList.contains("xterm-helper-textarea")) {
          return;
        }

        rememberTerminalIntent();
        scheduleTerminalFocusReport();
      };

      term.attachCustomWheelEventHandler((event) => {
        rememberTerminalIntent();
        focusInteractiveTerminal(true);
        event.stopPropagation();
        return true;
      });

      handlePointerDownCapture = () => {
        rememberTerminalIntent();
        focusInteractiveTerminal(true);
      };

      handleMouseDownCapture = () => {
        rememberTerminalIntent();
        focusInteractiveTerminal(true);
      };

      handleTerminalFocusOut = (event) => {
        const target = event.target as HTMLElement | null;
        if (!target?.classList.contains("xterm-helper-textarea")) {
          return;
        }

        scheduleTerminalFocusReport();

        // If focus moved to a transient element (e.g. a button) we must
        // reclaim it immediately so the next keystroke reaches the terminal
        // rather than being swallowed by the button or dropped by a TUI that
        // saw a spurious focus-out.  A setTimeout deferral is too late for
        // fast typists or Playwright-driven tests.
        const related = event.relatedTarget as HTMLElement | null;
        const isTransient =
          related instanceof HTMLButtonElement ||
          related?.closest("button") != null;

        if (isTransient && !disposed && !isIntentionalExternalFocus()) {
          focusInteractiveTerminal(true);
          syncTerminalFocusReport();
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

      handleDocumentPointerDownCapture = (event) => {
        rememberProtectedExternalFocus(event.target);
      };

      handleDocumentFocusInCapture = (event) => {
        rememberProtectedExternalFocus(event.target);
      };

      handleDocumentKeyDownCapture = (event) => {
        const target = event.target as HTMLElement | null;
        if (target && isProtectedExternalFocusTarget(target)) {
          lastProtectedExternalFocusAt = Date.now();
        }
      };

      container.addEventListener("pointerdown", handlePointerDownCapture, true);
      container.addEventListener("mousedown", handleMouseDownCapture, true);
      container.addEventListener("focusin", handleTerminalFocusIn, true);
      container.addEventListener("focusout", handleTerminalFocusOut, true);
      window.addEventListener("focus", handleWindowFocus);
      document.addEventListener(
        "pointerdown",
        handleDocumentPointerDownCapture,
        true,
      );
      document.addEventListener("focusin", handleDocumentFocusInCapture, true);
      document.addEventListener(
        "keydown",
        handleDocumentKeyDownCapture,
        true,
      );
      intervalIds.push(
        window.setInterval(
          repairPassiveFocusDrift,
          PASSIVE_FOCUS_REPAIR_INTERVAL_MS,
        ),
      );
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
      if (handleTerminalFocusIn) {
        container.removeEventListener("focusin", handleTerminalFocusIn, true);
      }
      if (handleDocumentPointerDownCapture) {
        document.removeEventListener(
          "pointerdown",
          handleDocumentPointerDownCapture,
          true,
        );
      }
      if (handleDocumentFocusInCapture) {
        document.removeEventListener(
          "focusin",
          handleDocumentFocusInCapture,
          true,
        );
      }
      if (handleDocumentKeyDownCapture) {
        document.removeEventListener(
          "keydown",
          handleDocumentKeyDownCapture,
          true,
        );
      }
      if (handleWindowFocus) {
        window.removeEventListener("focus", handleWindowFocus);
      }
      window.clearTimeout(connectTimeoutId);
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
      for (const intervalId of intervalIds) {
        window.clearInterval(intervalId);
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
