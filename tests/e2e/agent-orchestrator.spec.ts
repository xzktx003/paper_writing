import { expect, test, type APIRequestContext } from '@playwright/test';

declare const process: {
  cwd(): string;
};

async function launchMockSession(
  request: APIRequestContext,
  displayName: string,
): Promise<string> {
  const response = await request.post('/api/agent-launch/pty', {
    data: {
      workspaceId: 'default',
      displayName,
      agentKind: 'copilot',
      command: 'node ./scripts/mock-terminal-agent.mjs scroll',
      workingDirectory: process.cwd(),
    },
  });

  expect(response.ok()).toBeTruthy();
  return (await response.json()).id;
}

async function deleteSessionIfPresent(
  request: APIRequestContext,
  agentSessionId?: string,
): Promise<void> {
  if (!agentSessionId) {
    return;
  }

  await request.delete(`/api/agent-sessions/${agentSessionId}`);
}

test('v2: 启动 PTY Agent 并在宫格中显示', async ({ page, request }) => {
  const displayName = `测试终端-E2E-${Date.now()}`;
  let sessionId: string | undefined;

  try {
    sessionId = await launchMockSession(request, displayName);

    await page.goto('/');
    await expect(page.locator('.top-bar-title')).toContainText('Coding Kanban');

    const myCard = page.locator('.grid-card', {
      has: page.locator('.grid-card-name', { hasText: displayName }),
    });
    await expect(myCard).toBeVisible({ timeout: 15000 });
    await expect(myCard.locator('.grid-card-name')).toContainText(displayName);
  } finally {
    await deleteSessionIfPresent(request, sessionId);
  }
});

test('v2: 双击放大终端并可交互', async ({ page, request }) => {
  const displayName = `交互测试-${Date.now()}`;
  let sessionId: string | undefined;

  try {
    sessionId = await launchMockSession(request, displayName);

    await page.goto('/');

    const targetCard = page.locator('.grid-card', {
      has: page.locator('.grid-card-name', { hasText: displayName }),
    });
    await expect(targetCard).toBeVisible({ timeout: 15000 });
    await targetCard.dblclick();

    await expect(page.locator('.focus-main')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.focus-main-name')).toContainText(displayName);
    await expect(page.locator('.focus-exit-btn')).toContainText('返回宫格');

    await page.locator('.focus-exit-btn').click();

    await expect(page.locator('.focus-main')).not.toBeVisible();
    await expect(targetCard).toBeVisible();
  } finally {
    await deleteSessionIfPresent(request, sessionId);
  }
});

test('v2: 通过 Discovery Dialog 扫描 tmux', async ({ page }) => {
  await page.goto('/');

  // Open tmux discovery via keyboard shortcut
  await page.keyboard.press('Meta+Shift+KeyS');

  // Dialog should appear
  await expect(page.locator('.discovery-dialog')).toBeVisible();

  // Should have refresh/search controls in tmux panel
  await expect(
    page.locator('.discovery-dialog-title'),
  ).toContainText('发现 tmux 会话');

  // Close with ESC
  await page.keyboard.press('Escape');
  await expect(page.locator('.discovery-dialog')).not.toBeVisible();
});

test('v2: 顶栏新建会话弹层可以打开和关闭', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.side-drawer')).toHaveCount(0);

  await page.getByTestId('new-session-toggle').click();
  await expect(page.getByTestId('new-session-dialog')).toBeVisible();

  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByTestId('new-session-dialog')).toHaveCount(0);
});

test('v2: 顶栏显示会话统计', async ({ page, request }) => {
  const displayName = `统计测试-${Date.now()}`;
  let sessionId: string | undefined;

  try {
    await page.goto('/');
    await expect(page.locator('.top-bar-title')).toContainText('Coding Kanban');

    // Wait for stat to be populated with a real count
    const statLocator = page.locator('.stat-item').first();
    await expect(statLocator).toContainText(/共 \d+ 个会话/, {
      timeout: 10000,
    });

    const statsText = await statLocator.textContent();
    const currentCount = parseInt(
      statsText?.match(/共 (\d+) 个会话/)?.[1] ?? '0',
      10,
    );

    sessionId = await launchMockSession(request, displayName);

    await expect(page.locator('.stat-item').first()).toContainText(
      `共 ${currentCount + 1} 个会话`,
      { timeout: 15000 },
    );
  } finally {
    await deleteSessionIfPresent(request, sessionId);
  }
});