import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import path from "node:path";

declare const process: {
  cwd(): string;
};

async function launchMockSession(
  request: APIRequestContext,
  displayName: string,
  workingDirectory: string,
) {
  const response = await request.post("/api/agent-launch/pty", {
    data: {
      workspaceId: "default",
      displayName,
      agentKind: "shell",
      command: `node ${JSON.stringify(path.join(process.cwd(), "scripts/mock-terminal-agent.mjs"))} scroll`,
      workingDirectory,
    },
  });

  expect(response.ok()).toBeTruthy();
  return (await response.json()).id as string;
}

async function deleteSessionIfPresent(
  request: APIRequestContext,
  sessionId?: string,
) {
  if (!sessionId) {
    return;
  }

  await request.delete(`/api/agent-sessions/${sessionId}`).catch(() => {});
}

async function focusSession(page: Page, displayName: string) {
  await page.goto("/");
  const targetCard = page.locator(".grid-card", {
    has: page.locator(".grid-card-name", { hasText: displayName }),
  });
  await expect(targetCard).toBeVisible({ timeout: 15_000 });
  await targetCard.dblclick();
  await expect(page.locator(".focus-main-name")).toContainText(displayName);
}

async function switchFocusedSession(page: Page, displayName: string) {
  const sidebarCard = page.locator(".focus-sidebar-card", {
    has: page.locator("span", { hasText: displayName }),
  });
  await expect(sidebarCard).toBeVisible();
  await sidebarCard.dblclick();
  await expect(page.locator(".focus-main-name")).toContainText(displayName);
}

test("vscode web drawer is scoped per focused session and replaces the old capture entry point", async ({
  page,
  request,
}) => {
  const sessionAName = `vscode-web-a-${Date.now()}`;
  const sessionBName = `vscode-web-b-${Date.now()}`;
  let sessionAId: string | undefined;
  let sessionBId: string | undefined;

  await page.route("**/api/agent-sessions/*/vscode-web", async (route) => {
    const url = new URL(route.request().url());
    const sessionId = url.pathname.split("/").slice(-2)[0];
    const payload =
      sessionId === sessionAId
        ? {
            provider: "code-server",
            url: "data:text/html,<html><body>editor-a</body></html>",
            reused: false,
            workingDirectory: "/tmp/project-a",
          }
        : {
            provider: "code-server",
            url: "data:text/html,<html><body>editor-b</body></html>",
            reused: false,
            workingDirectory: "/tmp/project-b",
          };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  try {
    sessionAId = await launchMockSession(
      request,
      sessionAName,
      "/tmp/project-a",
    );
    sessionBId = await launchMockSession(
      request,
      sessionBName,
      "/tmp/project-b",
    );

    await page.goto("/");
    await expect(page.getByTestId("vscode-toggle")).toBeDisabled();
    await expect(
      page.locator(".top-bar-action", { hasText: "添加 VS Code 窗口" }),
    ).toHaveCount(0);

    await focusSession(page, sessionAName);
    await expect(page.getByTestId("vscode-toggle")).toBeEnabled();
    await page.getByTestId("vscode-toggle").click();

    const drawerA = page.getByTestId("vscode-web-drawer");
    await expect(drawerA).toBeVisible();
    await expect(page.getByTestId("vscode-web-frame")).toHaveAttribute(
      "src",
      /editor-a/,
    );

    const frameBodyA = page
      .frameLocator(`iframe[title="VS Code - ${sessionAName}"]`)
      .locator("body");
    await expect(frameBodyA).toContainText("editor-a");
    await frameBodyA.evaluate((body) => {
      body.textContent = "sticky-a";
    });

    await page.getByTestId("file-browser-toggle").click();
    await expect(page.getByTestId("file-browser-drawer")).toBeVisible();
    await page.getByTestId("vscode-toggle").click();
    await expect(frameBodyA).toContainText("sticky-a");

    await switchFocusedSession(page, sessionBName);
    await expect(page.getByTestId("vscode-web-drawer")).toHaveCount(0);

    await page.getByTestId("vscode-toggle").click();
    const drawerB = page.getByTestId("vscode-web-drawer");
    await expect(drawerB).toBeVisible();
    await expect(page.getByTestId("vscode-web-frame")).toHaveAttribute(
      "src",
      /editor-b/,
    );

    await switchFocusedSession(page, sessionAName);
    await expect(page.getByTestId("vscode-web-drawer")).toBeVisible();
    await expect(page.getByTestId("vscode-web-frame")).toHaveAttribute(
      "src",
      /editor-a/,
    );
    await expect(frameBodyA).toContainText("sticky-a");

    await page.reload();
    await expect(page.locator(".focus-main-name")).toContainText(sessionAName);
    await expect(page.getByTestId("vscode-web-drawer")).toBeVisible();
    await expect(page.getByTestId("vscode-web-frame")).toHaveAttribute(
      "src",
      /editor-a/,
    );

    await page.getByRole("button", { name: "返回宫格" }).click();
    await expect(page.getByTestId("vscode-web-drawer")).toHaveCount(0);
    await expect(page.getByTestId("vscode-toggle")).toBeDisabled();
  } finally {
    await deleteSessionIfPresent(request, sessionAId);
    await deleteSessionIfPresent(request, sessionBId);
  }
});

test("vscode split view keeps editor focus after clicking back from the terminal", async ({
  page,
  request,
}) => {
  const sessionName = `vscode-web-focus-${Date.now()}`;
  const typedMarker = `left-editor-${Date.now()}`;
  let sessionId: string | undefined;

  await page.route("**/api/agent-sessions/*/vscode-web", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "code-server",
        url: `data:text/html,${encodeURIComponent(
          "<html><body><textarea id=editor autofocus style='width:100%;height:160px'></textarea></body></html>",
        )}`,
        reused: false,
        workingDirectory: "/tmp/vscode-focus",
      }),
    });
  });

  try {
    sessionId = await launchMockSession(request, sessionName, "/tmp/project-a");

    await focusSession(page, sessionName);
    await page.getByTestId("vscode-toggle").click();

    const terminalScreen = page.locator(
      ".focus-main .terminal-view .xterm-screen",
    );
    await expect(terminalScreen).toBeVisible({ timeout: 15_000 });
    await terminalScreen.click({ position: { x: 90, y: 50 } });

    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            document.activeElement?.classList.contains(
              "xterm-helper-textarea",
            ) ?? false,
        ),
      )
      .toBeTruthy();

    const editorTextarea = page
      .frameLocator(`iframe[title="VS Code - ${sessionName}"]`)
      .locator("#editor");
    await editorTextarea.click();
    await page.keyboard.type(typedMarker);

    await expect(editorTextarea).toHaveValue(typedMarker);
    await expect
      .poll(async () =>
        page.evaluate(
          (title) =>
            document.activeElement instanceof HTMLIFrameElement &&
            document.activeElement.title === title,
          `VS Code - ${sessionName}`,
        ),
      )
      .toBeTruthy();
  } finally {
    await deleteSessionIfPresent(request, sessionId);
  }
});
