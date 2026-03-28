import { execFileSync } from 'node:child_process';

import { expect, test, type APIRequestContext } from '@playwright/test';

const TMUX_BINARY = '/opt/homebrew/bin/tmux';

function killTmuxSession(sessionName: string): void {
  try {
    execFileSync(TMUX_BINARY, ['kill-session', '-t', sessionName], {
      stdio: 'ignore',
    });
  } catch {
    // ignore missing sessions during cleanup
  }
}

async function findSessionByDisplayName(
  request: APIRequestContext,
  displayName: string,
) {
  const response = await request.get('/api/agent-sessions');
  expect(response.ok()).toBeTruthy();

  const payload = await response.json();
  return payload.items.find(
    (item: {
      id: string;
      displayName: string;
      transportRef?: { tmuxSession?: string };
    }) => item.displayName === displayName,
  ) as
    | {
        id: string;
        displayName: string;
        transportRef?: { tmuxSession?: string };
      }
    | undefined;
}

test('browser: direct and tmux creation both work from the new session form', async ({
  page,
  request,
}) => {
  const directName = `E2E Direct ${Date.now()}`;
  const tmuxName = `E2E Tmux ${Date.now()}`;
  const workingDirectory = process.cwd();
  let directSessionId: string | undefined;
  let tmuxSessionId: string | undefined;

  killTmuxSession(tmuxName);

  try {
    await page.goto('/');

    await page.getByTestId('new-session-toggle').click();

    await page.getByTestId('new-session-name').fill(directName);
    await page.getByTestId('new-session-kind').selectOption('copilot');
    await page.getByTestId('new-session-mode').selectOption('direct');
    await page.getByTestId('new-session-dir').fill(workingDirectory);
    await page.getByTestId('create-session').click();

    const directCard = page.locator('.grid-card', {
      has: page.locator('.grid-card-name', { hasText: directName }),
    });

    await expect(directCard).toBeVisible({ timeout: 15000 });

    await expect
      .poll(async () => findSessionByDisplayName(request, directName), {
        timeout: 15000,
      })
      .toMatchObject({
        displayName: directName,
      });

    const directSession = await findSessionByDisplayName(request, directName);
    directSessionId = directSession?.id;
    expect(directSession?.transportRef?.tmuxSession).toBeFalsy();

    await page.getByTestId('new-session-name').fill(tmuxName);
    await page.getByTestId('new-session-kind').selectOption('copilot');
    await page.getByTestId('new-session-mode').selectOption('tmux');
    await page.getByTestId('new-session-dir').fill(workingDirectory);

    await expect(page.getByTestId('new-session-tmux-note')).toContainText(
      'tmux session 名将使用当前显示名称',
    );

    await page.getByTestId('create-session').click();

    const tmuxCard = page.locator('.grid-card', {
      has: page.locator('.grid-card-name', { hasText: tmuxName }),
    });

    await expect(tmuxCard).toBeVisible({ timeout: 15000 });

    await expect
      .poll(async () => findSessionByDisplayName(request, tmuxName), {
        timeout: 15000,
      })
      .toMatchObject({
        displayName: tmuxName,
        transportRef: {
          tmuxSession: tmuxName,
        },
      });

    const tmuxSession = await findSessionByDisplayName(request, tmuxName);
    tmuxSessionId = tmuxSession?.id;
  } finally {
    if (directSessionId) {
      await request.delete(`/api/agent-sessions/${directSessionId}`);
    }

    if (tmuxSessionId) {
      await request.delete(`/api/agent-sessions/${tmuxSessionId}`);
    }

    killTmuxSession(tmuxName);
  }
});