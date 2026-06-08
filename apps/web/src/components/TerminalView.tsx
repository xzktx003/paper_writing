import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

import { buildTerminalWebSocketUrl } from "../lib/api";
import {
  computeMobilePinchFontSize,
  computeMobileTerminalScrollLines,
  loadMobileTerminalFontSize,
  measureTouchDistance,
  saveMobileTerminalFontSize,
} from "../lib/mobile-terminal-touch";
import {
  recordTerminalFrame,
  registerTerminalWebSocket,
} from "../lib/resource-diagnostics";
import {
  hasIntentionalExternalFocus,
  shouldPromoteExternalFocusToUserIntent,
  shouldRepairPassiveTerminalFocus,
} from "../lib/terminal-focus";
import { TERMINAL_SCROLLBACK_LINES } from "../lib/terminal-history-config";
import { shouldAttemptTerminalInputForward } from "../lib/terminal-input-forwarding";
import { stripTerminalResponsePayload } from "../lib/terminal-input";
import { computeTerminalWheelScrollLines } from "../lib/terminal-wheel";

interface TerminalViewProps {
  agentSessionId: string;
  interactive?: boolean;
  inputEnabled?: boolean;
  mobileTouchMode?: boolean;
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
const MOBILE_TOUCH_LISTENER_OPTIONS = {
  capture: true,
  passive: false,
} satisfies AddEventListenerOptions;

const previewGeometryCache = new Map<string, TerminalGeometry>();
const terminalInputOwners = new Map<string, TerminalInputOwner>();

export function TerminalView({
  agentSessionId,
  interactive = true,
  inputEnabled: inputEnabledProp,
  mobileTouchMode = false,
  suspended = false,
}: TerminalViewProps) {
  const inputEnabled = inputEnabledProp ?? interactive;
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const inputEnabledRef = useRef(inputEnabled);
  const terminalInputReadyRef = useRef(false);

  useEffect(() => {
    inputEnabledRef.current = inputEnabled;
    const term = termRef.current;
    if (!term) {
      return;
    }

    term.options.cursorBlink = inputEnabled;
    term.options.disableStdin = !(
      inputEnabled && terminalInputReadyRef.current
    );
  }, [inputEnabled]);

  useEffect(() => {
    if (suspended) {
      return;
    }

    const container = containerRef.current as TerminalContainer | null;
    const stage = interactive
      ? container
      : (stageRef.current as HTMLDivElement | null);
    if (!container || !stage) return;

    terminalInputReadyRef.current = false;

    const timeoutIds: number[] = [];
    const intervalIds: number[] = [];
    const animationFrameIds: number[] = [];
    const isPreview = !interactive;
    const ownerToken = Symbol(agentSessionId);
    const ownerPriority = 2;
    let handleMouseDownCapture: (() => void) | null = null;
    let handlePointerDownCapture: (() => void) | null = null;
    let handleTerminalFocusIn: ((event: FocusEvent) => void) | null = null;
    let handleTerminalFocusOut: ((event: FocusEvent) => void) | null = null;
    let handleWindowBlur: (() => void) | null = null;
    let handleWindowFocus: (() => void) | null = null;
    let handleMobileTouchStart: ((event: TouchEvent) => void) | null = null;
    let handleMobileTouchMove: ((event: TouchEvent) => void) | null = null;
    let handleMobileTouchEnd: ((event: TouchEvent) => void) | null = null;
    let handleDocumentPointerDownCapture:
      | ((event: PointerEvent) => void)
      | null = null;
    let handleDocumentFocusInCapture: ((event: FocusEvent) => void) | null =
      null;
    let handleDocumentKeyDownCapture: ((event: KeyboardEvent) => void) | null =
      null;
    let disposed = false;
    let closeAfterOpen = false;
    let lastExternalPointerIntentAt = 0;
    let lastExternalUserIntentAt = 0;
    let lastTerminalIntentAt = 0;
    let wheelScrollRemainder = 0;

    const ensureInputOwner = () => {
      if (!inputEnabledRef.current) {
        return false;
      }

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

    if (inputEnabledRef.current) {
      ensureInputOwner();
    }

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

    const initialFontSize = mobileTouchMode ? loadMobileTerminalFontSize() : 14;
    const term = new Terminal({
      cursorBlink: inputEnabledRef.current,
      fontSize: initialFontSize,
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", monospace',
      theme: {
        background: "#0e1217",
        foreground: "#f4f1ea",
        cursor: "#ff8f1f",
        selectionBackground: "rgba(255, 152, 0, 0.3)",
      },
      scrollback: TERMINAL_SCROLLBACK_LINES,
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

    const getTerminalLineHeight = () => {
      const fontSize =
        typeof term.options.fontSize === "number"
          ? term.options.fontSize
          : initialFontSize;
      const lineHeight =
        typeof term.options.lineHeight === "number"
          ? term.options.lineHeight
          : 1;

      return Math.max(8, fontSize * lineHeight);
    };

    const isProtectedExternalFocusTarget = (
      active: HTMLElement | null,
    ): boolean => {
      if (!active || active === document.body) {
        return false;
      }

      if (active.classList.contains("xterm-helper-textarea")) {
        return false;
      }

      if (active.closest('[inert], [aria-hidden="true"]')) {
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

    const nextIntentTimestamp = (current: number, competing: number) =>
      Math.max(Date.now(), current + 1, competing + 1);

    const rememberExternalUserIntent = (): void => {
      lastExternalUserIntentAt = nextIntentTimestamp(
        lastExternalUserIntentAt,
        lastTerminalIntentAt,
      );
    };

    const rememberExternalPointerIntent = (
      target: EventTarget | null,
    ): void => {
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest(".terminal-view")) {
        return;
      }

      lastExternalPointerIntentAt = Date.now();
      rememberExternalUserIntent();
    };

    const rememberTerminalIntent = (): void => {
      lastTerminalIntentAt = nextIntentTimestamp(
        lastTerminalIntentAt,
        lastExternalUserIntentAt,
      );
    };

    const targetMatchesHover = (target: HTMLElement): boolean => {
      try {
        return target.matches(":hover");
      } catch {
        return false;
      }
    };

    const hasFreshUserActivation = (): boolean => {
      const activation = (
        navigator as Navigator & {
          userActivation?: { isActive?: boolean };
        }
      ).userActivation;

      return activation?.isActive === true;
    };

    const rememberExternalFocusIfUserDriven = (
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

      const now = Date.now();
      if (
        !shouldPromoteExternalFocusToUserIntent({
          externalFocusGraceMs: EXTERNAL_FOCUS_GRACE_MS,
          hasFreshUserActivation: hasFreshUserActivation(),
          lastExternalPointerIntentAt,
          lastExternalUserIntentAt,
          lastTerminalIntentAt,
          now,
          targetIsFrame: target instanceof HTMLIFrameElement,
          targetIsHovered: targetMatchesHover(target),
        })
      ) {
        return;
      }

      rememberExternalUserIntent();
    };

    const rememberActiveExternalFocusIfUserDriven = (): void => {
      rememberExternalFocusIfUserDriven(document.activeElement);
    };

    const isIntentionalExternalFocus = (): boolean => {
      const active = document.activeElement as HTMLElement | null;

      // NOTE: HTMLButtonElement is intentionally NOT a protected target.
      // Kanban buttons (sidebar collapse, focus-back-to-grid, action toolbar
      // entries, etc.) are transient triggers; they do not accept text input.
      // Leaving a button focused makes syncTerminalFocusReport emit CSI O and
      // Copilot CLI can drop the next keystrokes. See
      // tests/e2e/copilot-focus.spec.ts.
      return hasIntentionalExternalFocus({
        activeElementIsDocumentBody: !active || active === document.body,
        activeElementProtected: isProtectedExternalFocusTarget(active),
        externalFocusGraceMs: EXTERNAL_FOCUS_GRACE_MS,
        lastExternalUserIntentAt,
        lastTerminalIntentAt,
        now: Date.now(),
      });
    };

    const focusInteractiveTerminal = (unlockInput = false) => {
      if (!interactive || !inputEnabledRef.current) {
        return;
      }

      // When called passively (not from a direct user click on the terminal),
      // don't steal focus from intentional text-entry surfaces, iframes, or
      // open dialogs.
      if (!unlockInput) {
        rememberActiveExternalFocusIfUserDriven();
        if (isIntentionalExternalFocus()) {
          return;
        }
      }

      if (unlockInput) {
        term.options.disableStdin = false;
        rememberTerminalIntent();
      }
      ensureInputOwner();
      term.focus();
    };

    const scheduleFocusInteractiveTerminal = (unlockInput = false) => {
      if (!interactive || !inputEnabledRef.current) {
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
    let terminalSocketTracker: ReturnType<
      typeof registerTerminalWebSocket
    > | null = null;
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
      if (!interactive || !inputEnabledRef.current) {
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

      terminalSocketTracker = registerTerminalWebSocket(agentSessionId);
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          handleTerminalFrame(event.data);
        } else if (event.data instanceof Blob) {
          void event.data.text().then((text) => {
            if (!disposed) {
              handleTerminalFrame(text);
            }
          });
        }
      };

      ws.onopen = () => {
        terminalSocketTracker?.markOpen();
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
        terminalSocketTracker?.markClosed();
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

    if (mobileTouchMode && interactive) {
      const touchState: {
        lastY: number;
        mode: "idle" | "pinch" | "scroll";
        scrollRemainder: number;
        startDistance: number;
        startFontSize: number;
      } = {
        lastY: 0,
        mode: "idle",
        scrollRemainder: 0,
        startDistance: 0,
        startFontSize: initialFontSize,
      };

      const shouldIgnoreMobileTouch = (target: EventTarget | null) =>
        target instanceof HTMLElement &&
        target.closest(".terminal-mobile-bottom-btn") !== null;

      const preventMobileTouchDefault = (event: TouchEvent) => {
        if (event.cancelable) {
          event.preventDefault();
        }
      };

      handleMobileTouchStart = (event) => {
        if (shouldIgnoreMobileTouch(event.target)) {
          return;
        }

        if (event.touches.length === 1) {
          preventMobileTouchDefault(event);
          touchState.mode = "scroll";
          touchState.lastY = event.touches[0]!.clientY;
          touchState.scrollRemainder = 0;
          return;
        }

        if (event.touches.length >= 2) {
          preventMobileTouchDefault(event);
          touchState.mode = "pinch";
          touchState.startDistance = measureTouchDistance(
            event.touches[0]!,
            event.touches[1]!,
          );
          touchState.startFontSize =
            typeof term.options.fontSize === "number"
              ? term.options.fontSize
              : initialFontSize;
        }
      };

      handleMobileTouchMove = (event) => {
        if (shouldIgnoreMobileTouch(event.target)) {
          return;
        }

        if (event.touches.length === 1 && touchState.mode === "scroll") {
          preventMobileTouchDefault(event);
          const nextY = event.touches[0]!.clientY;
          const deltaY = nextY - touchState.lastY;
          const result = computeMobileTerminalScrollLines({
            accumulatedDeltaY: touchState.scrollRemainder + deltaY,
            lineHeight: getTerminalLineHeight(),
          });

          touchState.lastY = nextY;
          touchState.scrollRemainder = result.remainingDeltaY;
          if (result.scrollLines !== 0) {
            term.scrollLines(result.scrollLines);
          }
          return;
        }

        if (event.touches.length >= 2) {
          preventMobileTouchDefault(event);
          const nextDistance = measureTouchDistance(
            event.touches[0]!,
            event.touches[1]!,
          );
          const nextFontSize = computeMobilePinchFontSize({
            currentDistance: nextDistance,
            startDistance: touchState.startDistance,
            startFontSize: touchState.startFontSize,
          });

          if (nextFontSize !== term.options.fontSize) {
            term.options.fontSize = nextFontSize;
            saveMobileTerminalFontSize(nextFontSize);
            fitTerminal();
            flushResize();
          }
        }
      };

      handleMobileTouchEnd = (event) => {
        if (shouldIgnoreMobileTouch(event.target)) {
          return;
        }

        if (event.touches.length === 0) {
          touchState.mode = "idle";
          touchState.scrollRemainder = 0;
          return;
        }

        if (event.touches.length === 1) {
          touchState.mode = "scroll";
          touchState.lastY = event.touches[0]!.clientY;
          touchState.scrollRemainder = 0;
          return;
        }

        touchState.mode = "pinch";
        touchState.startDistance = measureTouchDistance(
          event.touches[0]!,
          event.touches[1]!,
        );
        touchState.startFontSize =
          typeof term.options.fontSize === "number"
            ? term.options.fontSize
            : initialFontSize;
      };

      container.addEventListener(
        "touchstart",
        handleMobileTouchStart,
        MOBILE_TOUCH_LISTENER_OPTIONS,
      );
      container.addEventListener(
        "touchmove",
        handleMobileTouchMove,
        MOBILE_TOUCH_LISTENER_OPTIONS,
      );
      container.addEventListener(
        "touchend",
        handleMobileTouchEnd,
        MOBILE_TOUCH_LISTENER_OPTIONS,
      );
      container.addEventListener(
        "touchcancel",
        handleMobileTouchEnd,
        MOBILE_TOUCH_LISTENER_OPTIONS,
      );
    }

    const enableTerminalInput = () => {
      if (replayComplete) {
        return;
      }

      replayComplete = true;
      terminalInputReadyRef.current = true;
      term.options.disableStdin = !inputEnabledRef.current;
      if (inputEnabledRef.current) {
        scheduleFocusInteractiveTerminal();
        scheduleTerminalFocusReport();
      }
    };

    const handleTerminalFrame = (payload: string) => {
      recordTerminalFrame(payload);

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
      const socketOpen = ws?.readyState === WebSocket.OPEN;
      if (
        !shouldAttemptTerminalInputForward({
          inputEnabled: inputEnabledRef.current,
          sanitizedPayload: sanitized,
          socketOpen,
        })
      ) {
        return;
      }

      if (ws && (!inputEnabledRef.current || ensureInputOwner())) {
        ws.send(sanitized);
      }
    });

    term.onBinary((data) => {
      const sanitized = stripTerminalResponsePayload(data);
      const socketOpen = ws?.readyState === WebSocket.OPEN;
      if (
        !shouldAttemptTerminalInputForward({
          inputEnabled: inputEnabledRef.current,
          sanitizedPayload: sanitized,
          socketOpen,
        })
      ) {
        return;
      }

      if (ws && (!inputEnabledRef.current || ensureInputOwner())) {
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
        if (!inputEnabledRef.current) {
          return;
        }

        const helperTextarea = getHelperTextarea();
        if (
          !shouldRepairPassiveTerminalFocus({
            documentHasFocus: document.hasFocus(),
            helperAvailable: helperTextarea !== null,
            helperFocused: document.activeElement === helperTextarea,
            intentionalExternalFocus: isIntentionalExternalFocus(),
            lastExternalUserIntentAt,
            lastTerminalIntentAt,
          })
        ) {
          return;
        }

        focusInteractiveTerminal();
        syncTerminalFocusReport();
      };

      handleTerminalFocusIn = (event) => {
        if (!inputEnabledRef.current) {
          return;
        }

        const target = event.target as HTMLElement | null;
        if (!target?.classList.contains("xterm-helper-textarea")) {
          return;
        }

        rememberTerminalIntent();
        scheduleTerminalFocusReport();
      };

      term.attachCustomWheelEventHandler((event) => {
        if (event.cancelable) {
          event.preventDefault();
        }
        event.stopPropagation();

        if (inputEnabledRef.current) {
          rememberTerminalIntent();
          focusInteractiveTerminal(true);
        }

        const result = computeTerminalWheelScrollLines({
          deltaMode: event.deltaMode,
          deltaY: event.deltaY,
          lineHeight: getTerminalLineHeight(),
          pageHeight: Math.max(
            getTerminalLineHeight(),
            stage.clientHeight || term.rows * getTerminalLineHeight(),
          ),
          previousDeltaY: wheelScrollRemainder,
        });

        wheelScrollRemainder = result.remainingDeltaY;
        if (result.scrollLines !== 0) {
          term.scrollLines(result.scrollLines);
        }

        return false;
      });

      handlePointerDownCapture = () => {
        if (!inputEnabledRef.current) {
          return;
        }

        rememberTerminalIntent();
        focusInteractiveTerminal(true);
      };

      handleMouseDownCapture = () => {
        if (!inputEnabledRef.current) {
          return;
        }

        rememberTerminalIntent();
        focusInteractiveTerminal(true);
      };

      handleTerminalFocusOut = (event) => {
        if (!inputEnabledRef.current) {
          return;
        }

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
        if (!inputEnabledRef.current) {
          return;
        }

        scheduleFocusInteractiveTerminal();
        scheduleTerminalFocusReport();
      };

      handleWindowBlur = () => {
        if (!inputEnabledRef.current) {
          return;
        }

        rememberActiveExternalFocusIfUserDriven();

        timeoutIds.push(
          window.setTimeout(() => {
            if (!disposed) {
              rememberActiveExternalFocusIfUserDriven();
            }
          }, 0),
        );
      };

      handleDocumentPointerDownCapture = (event) => {
        if (!inputEnabledRef.current) {
          return;
        }

        rememberExternalPointerIntent(event.target);
      };

      handleDocumentFocusInCapture = (event) => {
        if (!inputEnabledRef.current) {
          return;
        }

        rememberExternalFocusIfUserDriven(event.target);
      };

      handleDocumentKeyDownCapture = (event) => {
        if (!inputEnabledRef.current) {
          return;
        }

        const target = event.target as HTMLElement | null;
        if (
          target &&
          !target.closest(".terminal-view") &&
          isProtectedExternalFocusTarget(target)
        ) {
          rememberExternalUserIntent();
        }
      };

      container.addEventListener("pointerdown", handlePointerDownCapture, true);
      container.addEventListener("mousedown", handleMouseDownCapture, true);
      container.addEventListener("focusin", handleTerminalFocusIn, true);
      container.addEventListener("focusout", handleTerminalFocusOut, true);
      window.addEventListener("blur", handleWindowBlur);
      window.addEventListener("focus", handleWindowFocus);
      document.addEventListener(
        "pointerdown",
        handleDocumentPointerDownCapture,
        true,
      );
      document.addEventListener("focusin", handleDocumentFocusInCapture, true);
      document.addEventListener("keydown", handleDocumentKeyDownCapture, true);
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
      if (handleMobileTouchStart) {
        container.removeEventListener(
          "touchstart",
          handleMobileTouchStart,
          MOBILE_TOUCH_LISTENER_OPTIONS,
        );
      }
      if (handleMobileTouchMove) {
        container.removeEventListener(
          "touchmove",
          handleMobileTouchMove,
          MOBILE_TOUCH_LISTENER_OPTIONS,
        );
      }
      if (handleMobileTouchEnd) {
        container.removeEventListener(
          "touchend",
          handleMobileTouchEnd,
          MOBILE_TOUCH_LISTENER_OPTIONS,
        );
        container.removeEventListener(
          "touchcancel",
          handleMobileTouchEnd,
          MOBILE_TOUCH_LISTENER_OPTIONS,
        );
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
      if (handleWindowBlur) {
        window.removeEventListener("blur", handleWindowBlur);
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
      terminalSocketTracker?.markClosed();

      term.dispose();
      delete container.__xterm;
      termRef.current = null;
      wsRef.current = null;
      fitRef.current = null;
      pendingResizeRef.current = null;
      terminalInputReadyRef.current = false;
    };
  }, [agentSessionId, interactive, mobileTouchMode, suspended]);

  return (
    <div
      ref={containerRef}
      className={`terminal-view ${interactive ? "terminal-view-live" : "terminal-view-preview"} ${inputEnabled ? "terminal-view-input-active" : "terminal-view-input-monitor"}${mobileTouchMode ? " terminal-view-mobile-touch" : ""}`}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {!interactive && !suspended && (
        <div ref={stageRef} className="terminal-view-stage" />
      )}
      {mobileTouchMode && interactive && (
        <button
          className="terminal-mobile-bottom-btn"
          onClick={() => termRef.current?.scrollToBottom()}
          title="回到终端底部并继续看最新输出"
          type="button"
        >
          底部
        </button>
      )}
    </div>
  );
}
