import { expect, test, type Page } from "@playwright/test";

import type {
  AgentSessionRecord,
  ListAgentSessionsResponse,
} from "@agent-orchestrator/shared";

function makeSession(
  overrides: Partial<AgentSessionRecord>,
): AgentSessionRecord {
  return {
    id: "session-default",
    workspaceId: "default",
    sourceType: "local",
    agentKind: "codex",
    displayName: "Default Session",
    workingDirectory: "/data01/home/xuzk/workspace/coding_kanban",
    connectionState: "online",
    interactionState: "running",
    outputPreview: "ready",
    ...overrides,
  };
}

function buildSnapshot(items: AgentSessionRecord[]): ListAgentSessionsResponse {
  return {
    items,
    activeAgentSessionId: items[0]?.id ?? null,
    updatedAt: new Date().toISOString(),
  };
}

async function installTrackingWebSocket(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.clear();

    const trackedWindow = window as Window & {
      __allWebSocketUrls?: string[];
      __disableTerminalMonitorDragImageForTest?: boolean;
      __terminalWebSocketUrls?: string[];
    };
    trackedWindow.__allWebSocketUrls = [];
    trackedWindow.__disableTerminalMonitorDragImageForTest = true;
    trackedWindow.__terminalWebSocketUrls = [];

    class MockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      url: string;
      readyState = MockWebSocket.OPEN;
      bufferedAmount = 0;
      extensions = "";
      protocol = "";
      binaryType: BinaryType = "blob";
      onopen: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;

      constructor(url: string | URL) {
        super();
        this.url = String(url);

        trackedWindow.__allWebSocketUrls?.push(this.url);
        if (
          this.url.includes("/ws/agent-sessions/") &&
          this.url.includes("/terminal")
        ) {
          trackedWindow.__terminalWebSocketUrls?.push(this.url);
        }

        queueMicrotask(() => {
          const event = new Event("open");
          this.dispatchEvent(event);
          this.onopen?.(event);
        });
      }

      send(_data?: unknown) {}

      close() {
        this.readyState = MockWebSocket.CLOSED;
        const event = new Event("close");
        this.dispatchEvent(event);
        this.onclose?.(event);
      }
    }

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
  });
}

async function mockSessions(
  page: Page,
  sessions: AgentSessionRecord[],
): Promise<void> {
  await installTrackingWebSocket(page);

  await page.route("**/api/ssh-hosts", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ hosts: [] }),
    });
  });

  await page.route("**/api/agent-sessions", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(buildSnapshot(sessions)),
    });
  });
}

async function terminalWebSocketUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return [
      ...((window as Window & { __terminalWebSocketUrls?: string[] })
        .__terminalWebSocketUrls ?? []),
    ];
  });
}

test("grid cards use lightweight terminal previews without opening terminal WebSockets", async ({
  page,
}) => {
  await mockSessions(page, [
    makeSession({
      id: "alpha-session",
      displayName: "Alpha Session",
      outputPreview: "alpha ready",
    }),
    makeSession({
      id: "beta-session",
      displayName: "Beta Session",
      outputPreview: "beta ready",
    }),
  ]);

  await page.goto("/");

  await expect(page.locator(".grid-card")).toHaveCount(2);
  await expect(
    page.locator(".grid-card-terminal .terminal-preview"),
  ).toHaveCount(2);
  await expect(page.locator(".grid-card-terminal .terminal-view")).toHaveCount(
    0,
  );
  await expect(page.locator(".grid-card-terminal .xterm")).toHaveCount(0);
  await expect(
    page.locator(".grid-card", { hasText: "Alpha Session" }),
  ).toContainText("alpha ready");

  expect(await terminalWebSocketUrls(page)).toEqual([]);
});

test("preview mode toggle restores full terminal previews on demand", async ({
  page,
}) => {
  await mockSessions(page, [
    makeSession({
      id: "alpha-session",
      displayName: "Alpha Session",
      outputPreview: "alpha ready",
    }),
    makeSession({
      id: "beta-session",
      displayName: "Beta Session",
      outputPreview: "beta ready",
    }),
  ]);

  await page.goto("/");

  await page.getByTestId("resource-tuning-menu-toggle").click();
  const toggle = page.getByTestId("terminal-preview-mode-toggle");
  await expect(toggle).toHaveText("轻量预览：开");
  expect(await terminalWebSocketUrls(page)).toEqual([]);

  await toggle.click();

  await expect(toggle).toHaveText("完整预览");
  await expect(page.locator(".grid-card-terminal .terminal-view")).toHaveCount(
    2,
  );
  await expect(
    page.locator(".grid-card-terminal .terminal-preview"),
  ).toHaveCount(0);
  await expect
    .poll(() => terminalWebSocketUrls(page))
    .toContainEqual(expect.stringContaining("/alpha-session/terminal"));
  expect(await terminalWebSocketUrls(page)).toContainEqual(
    expect.stringContaining("/beta-session/terminal"),
  );
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("terminal-preview-mode")),
    )
    .toBe("full");
});

test("focus view opens a real terminal only for the focused session", async ({
  page,
}) => {
  await mockSessions(page, [
    makeSession({
      id: "focused-session",
      displayName: "Focused Session",
      outputPreview: "focused ready",
    }),
    makeSession({
      id: "sidebar-session",
      displayName: "Sidebar Session",
      outputPreview: "sidebar ready",
    }),
  ]);

  await page.goto("/");

  const focusedCard = page.locator(".grid-card", {
    has: page.locator(".grid-card-name", { hasText: "Focused Session" }),
  });
  await expect(focusedCard).toBeVisible();
  await focusedCard.dblclick();

  await expect(
    page.locator(".focus-main-terminal .terminal-view-live"),
  ).toBeVisible();
  await expect(
    page.locator(".focus-sidebar-terminal .terminal-preview"),
  ).toHaveCount(1);
  await expect(
    page.locator(".focus-sidebar-terminal .terminal-view"),
  ).toHaveCount(0);
  await expect(page.locator(".focus-sidebar-card")).toContainText(
    "sidebar ready",
  );

  await expect
    .poll(() => terminalWebSocketUrls(page))
    .toContainEqual(expect.stringContaining("/focused-session/terminal"));
  expect(await terminalWebSocketUrls(page)).not.toContainEqual(
    expect.stringContaining("/sidebar-session/terminal"),
  );
});

test("focus monitor panes accept dragged sidebar sessions and swap dragged panes", async ({
  page,
}) => {
  await mockSessions(page, [
    makeSession({
      id: "alpha-session",
      displayName: "Alpha Session",
      outputPreview: "alpha ready",
    }),
    makeSession({
      id: "beta-session",
      displayName: "Beta Session",
      outputPreview: "beta ready",
    }),
    makeSession({
      id: "gamma-session",
      displayName: "Gamma Session",
      outputPreview: "gamma ready",
    }),
  ]);

  await page.goto("/");

  await page
    .locator(".grid-card", {
      has: page.locator(".grid-card-name", { hasText: "Alpha Session" }),
    })
    .dblclick();
  await page.getByRole("button", { name: /屏幕布局/ }).click();
  await page.getByRole("menuitemradio", { name: /左右双屏/ }).click();

  const firstPane = page.locator(
    '[data-terminal-pane-slot="terminal-monitor-slot-1"]',
  );
  const secondPane = page.locator(
    '[data-terminal-pane-slot="terminal-monitor-slot-2"]',
  );

  await expect(firstPane).toHaveAttribute(
    "data-terminal-pane-session",
    "alpha-session",
  );
  await expect(secondPane).toHaveAttribute(
    "data-terminal-pane-session",
    "beta-session",
  );

  await page
    .locator(".focus-sidebar-card", { hasText: "Gamma Session" })
    .dragTo(firstPane);

  await expect(firstPane).toHaveAttribute(
    "data-terminal-pane-session",
    "gamma-session",
  );
  await expect(secondPane).toHaveAttribute(
    "data-terminal-pane-session",
    "beta-session",
  );
  await expect(
    page.locator(".focus-sidebar-card", { hasText: "Alpha Session" }),
  ).toBeVisible();

  await firstPane.locator(".focus-terminal-pane-header").dragTo(secondPane);

  await expect(firstPane).toHaveAttribute(
    "data-terminal-pane-session",
    "beta-session",
  );
  await expect(secondPane).toHaveAttribute(
    "data-terminal-pane-session",
    "gamma-session",
  );
});

test("focus header follows the active monitor terminal session", async ({
  page,
}) => {
  await mockSessions(page, [
    makeSession({
      id: "alpha-session",
      displayName: "Alpha Session",
      outputPreview: "alpha ready",
    }),
    makeSession({
      id: "beta-session",
      displayName: "Beta Session",
      outputPreview: "beta ready",
    }),
  ]);

  await page.goto("/");

  await page
    .locator(".grid-card", {
      has: page.locator(".grid-card-name", { hasText: "Alpha Session" }),
    })
    .dblclick();
  await page.getByRole("button", { name: /屏幕布局/ }).click();
  await page.getByRole("menuitemradio", { name: /左右双屏/ }).click();

  await expect(page.locator(".focus-main-name")).toHaveText("Alpha Session");

  const secondPane = page.locator(
    '[data-terminal-pane-slot="terminal-monitor-slot-2"]',
  );
  await secondPane.getByRole("button", { name: "设为输入" }).click();

  await expect(page.locator(".focus-main-name")).toHaveText("Beta Session");

  let renameDefaultValue = "";
  page.once("dialog", async (dialog) => {
    renameDefaultValue = dialog.defaultValue();
    await dialog.dismiss();
  });
  await page.locator(".focus-rename-btn").click({ force: true });
  await expect.poll(() => renameDefaultValue).toBe("Beta Session");
});

test("focus sidebar drag uses a single preview for the dragged session", async ({
  page,
}) => {
  await mockSessions(page, [
    makeSession({
      id: "alpha-session",
      displayName: "Alpha Session",
      outputPreview: "alpha ready",
    }),
    makeSession({
      id: "beta-session",
      displayName: "Beta Session",
      outputPreview: "beta ready",
    }),
    makeSession({
      id: "gamma-session",
      displayName: "Gamma Session",
      outputPreview: "gamma line 1\ngamma line 2\ngamma line 3",
    }),
  ]);

  await page.goto("/");

  await page
    .locator(".grid-card", {
      has: page.locator(".grid-card-name", { hasText: "Alpha Session" }),
    })
    .dblclick();
  await page.getByRole("button", { name: /屏幕布局/ }).click();
  await page.getByRole("menuitemradio", { name: /左右双屏/ }).click();

  await page.evaluate(() => {
    const trackedWindow = window as Window & {
      __forceTerminalMonitorDragImageForTest?: boolean;
      __terminalMonitorDragImages?: Array<{
        height: number;
        previewKind: string | undefined;
        sessionId: string | undefined;
        tagName: string;
        width: number;
        x: number;
        y: number;
      }>;
      __terminalMonitorDragImagePatched?: boolean;
    };
    trackedWindow.__terminalMonitorDragImages = [];
    trackedWindow.__forceTerminalMonitorDragImageForTest = true;
    if (trackedWindow.__terminalMonitorDragImagePatched) {
      return;
    }

    const originalSetDragImage = DataTransfer.prototype.setDragImage;
    DataTransfer.prototype.setDragImage = function (
      image: Element,
      x: number,
      y: number,
    ) {
      const element = image as HTMLElement;
      const canvas = image as HTMLCanvasElement;
      trackedWindow.__terminalMonitorDragImages?.push({
        height: canvas.height,
        previewKind: element.dataset.previewKind,
        sessionId: element.dataset.sessionId,
        tagName: element.tagName,
        width: canvas.width,
        x,
        y,
      });
      return originalSetDragImage.call(this, image, x, y);
    };
    trackedWindow.__terminalMonitorDragImagePatched = true;
  });

  const draggedCard = page.locator(".focus-sidebar-card", {
    hasText: "Gamma Session",
  });
  await draggedCard.evaluate((element) => {
    const event = new DragEvent("dragstart", {
      bubbles: true,
      cancelable: true,
      dataTransfer: new DataTransfer(),
    });
    element.dispatchEvent(event);
  });

  await expect
    .poll(() =>
      page.evaluate(() => {
        return (
          (
            window as Window & {
              __terminalMonitorDragImages?: unknown[];
            }
          ).__terminalMonitorDragImages ?? []
        );
      }),
    )
    .toEqual([
      expect.objectContaining({
        previewKind: "terminal-monitor-session",
        sessionId: "gamma-session",
        tagName: "CANVAS",
        x: 132,
        y: 44,
      }),
    ]);
  await expect(
    page.locator('canvas[data-preview-kind="terminal-monitor-session"]'),
  ).toHaveAttribute("data-session-id", "gamma-session");

  await draggedCard.evaluate((element) => {
    element.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
  });
  await expect(
    page.locator('canvas[data-preview-kind="terminal-monitor-session"]'),
  ).toHaveCount(0);
});
