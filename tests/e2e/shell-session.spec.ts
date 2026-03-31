import { expect, test, type APIRequestContext } from '@playwright/test';

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};

const backendBaseUrl = process.env.PLAYWRIGHT_BACKEND_URL ?? '';

function backendPath(path: string): string {
  if (!backendBaseUrl) {
    return path;
  }

  return new URL(path, backendBaseUrl).toString();
}

async function findSessionByDisplayName(
  request: APIRequestContext,
  displayName: string,
) {
  const response = await request.get(backendPath('/api/agent-sessions'));
  expect(response.ok()).toBeTruthy();

  const payload = await response.json();
  return payload.items.find(
    (item: { id: string; displayName: string }) =>
      item.displayName === displayName,
  ) as { id: string; displayName: string } | undefined;
}

async function getSessionOutput(
  request: APIRequestContext,
  agentSessionId: string,
): Promise<string> {
  const response = await request.get(
    backendPath(`/api/agent-sessions/${agentSessionId}`),
  );
  expect(response.ok()).toBeTruthy();

  const payload = await response.json();
  return payload.outputEntries
    .map((entry: { text: string }) => entry.text)
    .join('\n');
}

test('browser: shell session launches an interactive shell instead of running a nonexistent shell binary', async ({
  page,
  request,
}) => {
  const displayName = `E2E Shell ${Date.now()}`;
  let sessionId: string | undefined;

  try {
    await page.goto('/');

    await page.getByTestId('new-session-toggle').click();
    await page.getByTestId('new-session-host-option-local').click();
    await page.getByTestId('new-session-name').fill(displayName);
    await page.getByTestId('new-session-kind').selectOption('shell');
    await page.getByTestId('new-session-mode-direct').click();
    await page.getByTestId('new-session-dir').fill(process.cwd());
    await page.getByTestId('create-session').click();
    await expect(page.getByTestId('new-session-dialog')).toHaveCount(0);

    const shellCard = page.locator('.grid-card', {
      has: page.locator('.grid-card-name', { hasText: displayName }),
    });
    await expect(shellCard).toBeVisible({ timeout: 15000 });

    await expect
      .poll(async () => findSessionByDisplayName(request, displayName), {
        timeout: 15000,
      })
      .toBeTruthy();

    sessionId = (await findSessionByDisplayName(request, displayName))?.id;
    expect(sessionId).toBeTruthy();

    const marker = `__E2E_SHELL_OK_${Date.now()}__`;
    const stdinResponse = await request.post(
      backendPath(`/api/agent-sessions/${sessionId}/stdin`),
      {
        data: {
          input: `printf '${marker}\\n'`,
        },
      },
    );
    expect(stdinResponse.ok()).toBeTruthy();

    await expect
      .poll(async () => getSessionOutput(request, sessionId!), {
        timeout: 15000,
      })
      .toContain(marker);

    expect(await getSessionOutput(request, sessionId!)).not.toContain(
      'command not found: shell',
    );
  } finally {
    if (sessionId) {
      await request.delete(backendPath(`/api/agent-sessions/${sessionId}`));
    }
  }
});

test('browser: grid preview forwards terminal protocol replies needed by interactive prompts', async ({
  page,
  request,
}) => {
  const displayName = `E2E Preview CPR ${Date.now()}`;
  let sessionId: string | undefined;

  try {
    const launchResponse = await request.post(backendPath('/api/agent-launch/pty'), {
      data: {
        workspaceId: 'default',
        displayName,
        agentKind: 'copilot',
        command: 'copilot --resume=cpr-probe',
        workingDirectory: process.cwd(),
      },
    });

    expect(launchResponse.ok()).toBeTruthy();
    sessionId = (await launchResponse.json()).id;

    await page.goto('/');

    const shellCard = page.locator('.grid-card', {
      has: page.locator('.grid-card-name', { hasText: displayName }),
    });
    await expect(shellCard).toBeVisible({ timeout: 15000 });

    await expect
      .poll(async () => getSessionOutput(request, sessionId!), {
        timeout: 10000,
      })
      .toContain('cpr-response:');

    expect(await getSessionOutput(request, sessionId!)).not.toContain(
      'cpr-timeout',
    );
  } finally {
    if (sessionId) {
      await request.delete(backendPath(`/api/agent-sessions/${sessionId}`));
    }
  }
});

test('browser: double-click focus transition does not inject duplicate CPR replies into the session', async ({
  page,
  request,
}) => {
  const displayName = `E2E Focus CPR ${Date.now()}`;
  let sessionId: string | undefined;

  try {
    const launchResponse = await request.post(backendPath('/api/agent-launch/pty'), {
      data: {
        workspaceId: 'default',
        displayName,
        agentKind: 'copilot',
        command: 'copilot --resume=cpr-burst',
        workingDirectory: process.cwd(),
      },
    });

    expect(launchResponse.ok()).toBeTruthy();
    sessionId = (await launchResponse.json()).id;

    await page.goto('/');

    const sessionCard = page.locator('.grid-card', {
      has: page.locator('.grid-card-name', { hasText: displayName }),
    });
    await expect(sessionCard).toBeVisible({ timeout: 15000 });

    await expect
      .poll(async () => getSessionOutput(request, sessionId!), {
        timeout: 10000,
      })
      .toContain('cpr-burst-start');

    await sessionCard.dblclick();
    await expect(page.locator('.focus-main-name')).toContainText(displayName);

    await expect
      .poll(async () => getSessionOutput(request, sessionId!), {
        timeout: 15000,
      })
      .toContain('cpr-burst-complete:');

    const output = await getSessionOutput(request, sessionId!);
    expect(output).not.toContain('cpr-duplicate');
    expect(output).not.toContain('cpr-invalid');
    expect(output).not.toContain('cpr-timeout');
  } finally {
    if (sessionId) {
      await request.delete(backendPath(`/api/agent-sessions/${sessionId}`));
    }
  }
});
