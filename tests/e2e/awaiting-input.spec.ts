import { expect, test } from '@playwright/test';

test('copilot session shows awaiting-input state in yellow', async ({
  page,
  request,
}) => {
  const displayName = `E2E Awaiting ${Date.now()}`;
  let agentSessionId: string | undefined;

  try {
    const launchResponse = await request.post('/api/agent-launch/pty', {
      data: {
        workspaceId: 'default',
        displayName,
        agentKind: 'copilot',
        command: 'node ./scripts/mock-agent.mjs',
        workingDirectory: process.cwd(),
      },
    });

    expect(launchResponse.ok()).toBeTruthy();
    const payload = await launchResponse.json();
    agentSessionId = payload.id;

    await page.goto('/');

    const card = page.locator('.grid-card', {
      has: page.locator('.grid-card-name', { hasText: displayName }),
    });

    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.locator('.grid-card-badge')).toHaveText('运行中');

    await page.waitForTimeout(11_000);

    await expect(card.locator('.grid-card-badge')).toHaveText('等待输入');
    await expect(card).toHaveClass(/card-awaiting/);
    await expect(page.locator('.stat-awaiting')).toContainText('等待输入');
  } finally {
    if (agentSessionId) {
      await request.delete(`/api/agent-sessions/${agentSessionId}`);
    }
  }
});
