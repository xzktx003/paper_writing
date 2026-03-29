import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const TMUX_BINARY = '/opt/homebrew/bin/tmux';
const COPILOT_SESSION_ROOT = path.join(os.homedir(), '.copilot', 'session-state');

function runTmux(args: string[]): string {
  return execFileSync(TMUX_BINARY, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function killTmuxSession(sessionName: string): void {
  try {
    execFileSync(TMUX_BINARY, ['kill-session', '-t', sessionName], {
      stdio: 'ignore',
    });
  } catch {
    // ignore cleanup failures
  }
}

function createCopilotSessionState(options: {
  sessionId: string;
  sessionName: string;
  workingDirectory: string;
  running: boolean;
}): string {
  const sessionDir = path.join(COPILOT_SESSION_ROOT, options.sessionId);
  fs.rmSync(sessionDir, { recursive: true, force: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, 'workspace.yaml'),
    [
      `id: ${options.sessionId}`,
      `cwd: ${options.workingDirectory}`,
      `name: ${options.sessionName}`,
      `updated_at: ${new Date().toISOString()}`,
    ].join('\n'),
  );

  if (options.running) {
    fs.writeFileSync(
      path.join(sessionDir, `inuse.${process.pid}.lock`),
      '',
    );
  }

  return sessionDir;
}

function removeCopilotSessionState(sessionId: string): void {
  fs.rmSync(path.join(COPILOT_SESSION_ROOT, sessionId), {
    recursive: true,
    force: true,
  });
}

async function findSessionByDisplayName(
  request: APIRequestContext,
  displayName: string,
) {
  const response = await request.get('/api/agent-sessions');
  if (!response.ok()) {
    return undefined;
  }

  const payload = await response.json();
  return payload.items.find(
    (item: {
      id: string;
      displayName: string;
      interactionState: string;
      transportRef?: { tmuxSession?: string };
    }) => item.displayName === displayName,
  ) as
    | {
        id: string;
        displayName: string;
        interactionState: string;
        transportRef?: { tmuxSession?: string };
      }
    | undefined;
}

async function deleteSessionIfPresent(
  request: APIRequestContext,
  displayName: string,
): Promise<void> {
  const session = await findSessionByDisplayName(request, displayName);
  if (session) {
    await request.delete(`/api/agent-sessions/${session.id}`);
  }
}

async function getSessionOutputEntries(
  request: APIRequestContext,
  agentSessionId: string,
): Promise<string[]> {
  const response = await request.get(`/api/agent-sessions/${agentSessionId}`);
  expect(response.ok()).toBeTruthy();

  const payload = await response.json();
  return payload.outputEntries.map((entry: { text: string }) => entry.text);
}

async function getLastReportedTtySize(
  request: APIRequestContext,
  agentSessionId: string,
): Promise<{ rows: number; cols: number } | null> {
  const entries = await getSessionOutputEntries(request, agentSessionId);
  const text = entries.join('');
  const matches = [...text.matchAll(/tty-size:(\d+)x(\d+)/g)];
  const last = matches.at(-1);

  if (!last) {
    return null;
  }

  return {
    rows: Number(last[1]),
    cols: Number(last[2]),
  };
}

async function installWebSocketSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sentFrames: string[] = [];
    (
      window as typeof window & { __terminalMouseFrames?: string[] }
    ).__terminalMouseFrames = sentFrames;

    const originalSend = window.WebSocket.prototype.send;
    window.WebSocket.prototype.send = function patchedSend(data: unknown) {
      if (typeof data === 'string' && !data.includes('"type":"resize"')) {
        sentFrames.push(data);
      }

      return originalSend.call(this, data);
    };
  });
}

test('browser: 普通对话终端可以用鼠标滚轮浏览历史', async ({
  page,
  request,
}) => {
  const displayName = `E2E Scroll ${Date.now()}`;
  let sessionId: string | undefined;

  try {
    await page.setViewportSize({ width: 1600, height: 1200 });

    const launchResponse = await request.post('/api/agent-launch/pty', {
      data: {
        workspaceId: 'default',
        displayName,
        agentKind: 'copilot',
        command: 'node ./scripts/mock-terminal-agent.mjs scroll',
        workingDirectory: process.cwd(),
      },
    });

    expect(launchResponse.ok()).toBeTruthy();
    sessionId = (await launchResponse.json()).id;

    await page.goto('/');

    const card = page.locator('.grid-card', {
      has: page.locator('.grid-card-name', { hasText: displayName }),
    });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.dblclick();

    const viewport = page.locator('.focus-main .xterm-viewport');
    await expect(viewport).toBeVisible({ timeout: 15000 });
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const terminal = document.querySelector(
            '.focus-main .terminal-view',
          ) as HTMLDivElement & {
            __xterm?: {
              buffer?: { active?: { viewportY?: number } };
            };
          } | null;

          return terminal?.__xterm?.buffer?.active?.viewportY ?? 0;
        }),
      )
      .toBeGreaterThan(0);

    const before = await page.evaluate(() => {
      const terminal = document.querySelector(
        '.focus-main .terminal-view',
      ) as HTMLDivElement & {
        __xterm?: {
          buffer?: { active?: { viewportY?: number } };
        };
      } | null;

      return terminal?.__xterm?.buffer?.active?.viewportY ?? 0;
    });
    await page.locator('.focus-main .terminal-view').hover();
    await page.mouse.wheel(0, -1200);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
      const terminal = document.querySelector(
        '.focus-main .terminal-view',
      ) as HTMLDivElement & {
        __xterm?: {
          buffer?: { active?: { viewportY?: number } };
        };
      } | null;

      return terminal?.__xterm?.buffer?.active?.viewportY ?? 0;
    });

    expect(after).toBeLessThan(before);
  } finally {
    if (sessionId) {
      await request.delete(`/api/agent-sessions/${sessionId}`);
    }
  }
});

test('browser: 调整窗口大小会把新的终端尺寸同步到 PTY', async ({
  page,
  request,
}) => {
  const displayName = `E2E Initial Resize ${Date.now()}`;
  let sessionId: string | undefined;

  try {
    await page.setViewportSize({ width: 1280, height: 820 });

    const launchResponse = await request.post('/api/agent-launch/pty', {
      data: {
        workspaceId: 'default',
        displayName,
        agentKind: 'copilot',
        command: 'node ./scripts/mock-terminal-agent.mjs size',
        workingDirectory: process.cwd(),
      },
    });

    expect(launchResponse.ok()).toBeTruthy();
    sessionId = (await launchResponse.json()).id;

    await page.goto('/');

    const card = page.locator('.grid-card', {
      has: page.locator('.grid-card-name', { hasText: displayName }),
    });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.dblclick();
    await page.waitForTimeout(1200);

    await expect
      .poll(() => getLastReportedTtySize(request, sessionId!), {
        timeout: 15000,
      })
      .not.toBeNull();

    const initialSize = await getLastReportedTtySize(request, sessionId!);
    expect(initialSize).not.toBeNull();

    await page.setViewportSize({ width: 1600, height: 1200 });

    await expect
      .poll(async () => {
        const size = await getLastReportedTtySize(request, sessionId!);
        if (!size || !initialSize) {
          return null;
        }

        return size.cols > initialSize.cols || size.rows > initialSize.rows
          ? size
          : null;
      }, {
        timeout: 15000,
      })
      .not.toBeNull();

    const resizedSize = await getLastReportedTtySize(request, sessionId!);

    expect(initialSize).not.toBeNull();
    expect(resizedSize).not.toBeNull();
    expect(resizedSize!.rows).toBeGreaterThanOrEqual(initialSize!.rows);
    expect(resizedSize!.cols).toBeGreaterThan(initialSize!.cols);
  } finally {
    if (sessionId) {
      await request.delete(`/api/agent-sessions/${sessionId}`);
    }
  }
});

test('browser: tmux 终端会转发鼠标二进制事件', async ({ page, request }) => {
  const sessionName = `e2e-mouse-${Date.now()}`;
  const displayName = `E2E Mouse Tmux ${Date.now()}`;

  let launchedSessionId: string | undefined;

  killTmuxSession(sessionName);

  try {
    runTmux([
      'new-session',
      '-d',
      '-s',
      sessionName,
      '-c',
      process.cwd(),
      'node ./scripts/mock-terminal-agent.mjs mouse',
    ]);

    const launchResponse = await request.post('/api/agent-launch/pty', {
      data: {
        workspaceId: 'default',
        displayName,
        agentKind: 'copilot',
        command: `tmux attach -t '${sessionName}'`,
        workingDirectory: process.cwd(),
        tmuxSessionName: sessionName,
      },
    });

    expect(launchResponse.ok()).toBeTruthy();
    launchedSessionId = (await launchResponse.json()).id;

    await installWebSocketSpy(page);
    await page.goto('/');

    const card = page.locator('.grid-card', {
      has: page.locator('.grid-card-name', { hasText: displayName }),
    });
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.locator('.grid-card-tag')).toHaveText('tmux');

    await card.dblclick();
    const terminal = page.locator('.focus-main .terminal-view');
    const screen = page.locator('.focus-main .terminal-view .xterm-screen');
    await expect(terminal).toBeVisible({ timeout: 15000 });
    await expect(screen).toBeVisible({ timeout: 15000 });

    const before = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __terminalMouseFrames?: string[];
          }
        ).__terminalMouseFrames?.length ?? 0,
    );

    await screen.click({ position: { x: 80, y: 40 } });
    await page.mouse.wheel(0, -300);

    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                __terminalMouseFrames?: string[];
              }
            ).__terminalMouseFrames?.length ?? 0,
        ),
      )
      .toBeGreaterThan(before);

    const frames = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __terminalMouseFrames?: string[];
          }
        ).__terminalMouseFrames ?? [],
    );
    expect(
      frames.some(
        (frame) => frame.includes('"type":"binary"') || frame.includes('\u001b') || frame.includes('[M'),
      ),
    ).toBeTruthy();
  } finally {
    if (launchedSessionId) {
      await request.delete(`/api/agent-sessions/${launchedSessionId}`);
    }
    killTmuxSession(sessionName);
  }
});

test('browser: 扫描结果会合并 tmux 运行态并支持 tmux 恢复', async ({
  page,
  request,
}) => {
  const runningSessionId = `e2e-running-${Date.now()}`;
  const runningSessionName = `e2e-running-tmux-${Date.now()}`;
  const stoppedSessionId = `e2e-stopped-${Date.now()}`;
  const stoppedSessionName = `e2e-stopped-tmux-${Date.now()}`;

  killTmuxSession(runningSessionName);
  killTmuxSession(stoppedSessionName);

  createCopilotSessionState({
    sessionId: runningSessionId,
    sessionName: runningSessionName,
    workingDirectory: process.cwd(),
    running: true,
  });
  createCopilotSessionState({
    sessionId: stoppedSessionId,
    sessionName: stoppedSessionName,
    workingDirectory: process.cwd(),
    running: false,
  });

  let attachedRunningId: string | undefined;
  let resumedStoppedId: string | undefined;

  try {
    runTmux([
      'new-session',
      '-d',
      '-s',
      runningSessionName,
      '-c',
      process.cwd(),
      'sleep 120',
    ]);

    await page.goto('/');

    await expect(page.getByTestId('host-list')).toBeVisible();

    const hostStyles = await page.getByTestId('host-list').evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return {
        overflowY: styles.overflowY,
        maxHeight: styles.maxHeight,
      };
    });

    expect(hostStyles.overflowY).toBe('auto');
    expect(hostStyles.maxHeight).not.toBe('none');

    await page.getByTestId('scan-path-input').fill(process.cwd());
    await page.getByTestId('scan-button').click();

    await expect(page.locator('.drawer-message')).toContainText('扫描完成', {
      timeout: 15000,
    });

    const scanStyles = await page
      .getByTestId('scan-results-list')
      .evaluate((element) => {
        const styles = window.getComputedStyle(element);
        return {
          overflowY: styles.overflowY,
          maxHeight: styles.maxHeight,
        };
      });

    expect(scanStyles.overflowY).toBe('auto');
    expect(scanStyles.maxHeight).not.toBe('none');

    const runningItem = page.locator('.scan-result-item', {
      hasText: runningSessionName,
    });
    await expect(runningItem).toContainText('copilot');
    await expect(runningItem).toContainText('tmux');
    await runningItem.getByRole('button', { name: '连接 tmux' }).click();

    await expect
      .poll(async () => findSessionByDisplayName(request, runningSessionName), {
        timeout: 15000,
      })
      .toMatchObject({
        displayName: runningSessionName,
        transportRef: {
          tmuxSession: runningSessionName,
        },
      });

    attachedRunningId = (await findSessionByDisplayName(request, runningSessionName))?.id;

    const runningCard = page.locator('.grid-card', {
      has: page.locator('.grid-card-name', { hasText: runningSessionName }),
    });
    await expect(runningCard).toBeVisible({ timeout: 15000 });
    await expect(runningCard.locator('.grid-card-tag')).toHaveText('tmux');

    const stoppedItem = page.locator('.scan-result-item', {
      hasText: stoppedSessionName,
    });
    await expect(
      stoppedItem.getByRole('button', { name: /^恢复$/ }),
    ).toBeVisible();
    await expect(
      stoppedItem.getByRole('button', { name: /^tmux 恢复$/ }),
    ).toBeVisible();
    await stoppedItem.getByRole('button', { name: /^tmux 恢复$/ }).click();

    await expect
      .poll(async () => findSessionByDisplayName(request, stoppedSessionName), {
        timeout: 15000,
      })
      .toMatchObject({
        displayName: stoppedSessionName,
        transportRef: {
          tmuxSession: stoppedSessionName,
        },
      });

    resumedStoppedId = (await findSessionByDisplayName(request, stoppedSessionName))?.id;
  } finally {
    if (attachedRunningId) {
      await request.delete(`/api/agent-sessions/${attachedRunningId}`);
    }
    if (resumedStoppedId) {
      await request.delete(`/api/agent-sessions/${resumedStoppedId}`);
    }

    await deleteSessionIfPresent(request, runningSessionName);
    await deleteSessionIfPresent(request, stoppedSessionName);
    removeCopilotSessionState(runningSessionId);
    removeCopilotSessionState(stoppedSessionId);
    killTmuxSession(runningSessionName);
    killTmuxSession(stoppedSessionName);
  }
});