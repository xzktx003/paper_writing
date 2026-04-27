import { execFileSync } from 'node:child_process';
import {
  accessSync,
  constants,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { chromium } from '@playwright/test';

const baseUrl = process.env.README_BASE_URL ?? 'https://localhost:3000';
const apiBaseUrl = process.env.README_API_URL ?? 'http://127.0.0.1:4000';
const outputDir = path.resolve(process.cwd(), 'docs/readme-assets');

function isExecutablePath(filePath) {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveTmuxBinary() {
  if (process.env.TMUX_BINARY) {
    return process.env.TMUX_BINARY;
  }

  const candidates = [
    '/opt/homebrew/bin/tmux',
    '/usr/local/bin/tmux',
    '/usr/bin/tmux',
    '/bin/tmux',
  ];

  return candidates.find(isExecutablePath) ?? 'tmux';
}

const tmuxBinary = resolveTmuxBinary();

const demoSessions = [
  {
    displayName: 'README Copilot Demo',
    agentKind: 'copilot',
    command: 'node ./scripts/mock-terminal-agent.mjs scroll',
    workingDirectory: process.cwd(),
  },
  {
    displayName: 'README Awaiting Demo',
    agentKind: 'copilot',
    command: 'node ./scripts/mock-agent.mjs',
    workingDirectory: process.cwd(),
  },
  {
    displayName: 'README Tmux Demo',
    agentKind: 'shell',
    command: `tmux new-session -A -s readme-demo`,
    workingDirectory: process.cwd(),
    tmuxSessionName: 'readme-demo',
  },
];

function runTmux(args) {
  return execFileSync(tmuxBinary, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function killTmuxSession(sessionName) {
  try {
    runTmux(['kill-session', '-t', sessionName]);
  } catch {
    // ignore cleanup failures
  }
}

function createScanDemoFixture() {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'readme-agent-scan-'));
  const copilotDir = path.join(rootDir, 'project-copilot');
  const claudeDir = path.join(rootDir, 'project-claude');
  const sessionId = `readme-scan-${Date.now()}`;
  const homeDir = process.env.HOME ?? process.cwd();
  const sessionDir = path.join(homeDir, '.copilot', 'session-state', sessionId);

  mkdirSync(copilotDir, { recursive: true });
  mkdirSync(path.join(claudeDir, '.claude'), { recursive: true });
  mkdirSync(sessionDir, { recursive: true });

  writeFileSync(
    path.join(sessionDir, 'workspace.yaml'),
    [
      `id: ${sessionId}`,
      `cwd: ${copilotDir}`,
      'name: README Scan Copilot',
      `updated_at: ${new Date().toISOString()}`,
    ].join('\n'),
  );
  writeFileSync(path.join(sessionDir, `inuse.${process.pid}.lock`), '');

  return {
    rootDir,
    cleanup() {
      rmSync(rootDir, { recursive: true, force: true });
      rmSync(sessionDir, { recursive: true, force: true });
    },
  };
}

async function chooseLocalHost(page, triggerPattern) {
  await page.getByRole('button', { name: triggerPattern }).click();
  await page.getByRole('button', { name: /本机/ }).click();
}

async function waitForVsCodeDrawer(page) {
  const frame = page.getByTestId('vscode-web-frame');
  const errorState = page.locator('.vscode-drawer-state--error');

  try {
    await Promise.race([
      frame.waitFor({ state: 'visible', timeout: 45_000 }),
      errorState.waitFor({ state: 'visible', timeout: 45_000 }),
    ]);
  } catch {
    return false;
  }

  await page.waitForTimeout(1_500);
  return await frame.isVisible().catch(() => false);
}

async function requestJson(pathname, init) {
  const headers = { ...(init?.headers ?? {}) };
  if (init?.body && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    headers,
    ...init,
  });

  if (!response.ok) {
    throw new Error(`${pathname} failed: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function listSessions() {
  const payload = await requestJson('/api/agent-sessions');
  return payload.items;
}

async function deleteSessionByDisplayName(displayName) {
  const sessions = await listSessions();
  const target = sessions.find((session) => session.displayName === displayName);

  if (!target) {
    return;
  }

  await requestJson(`/api/agent-sessions/${target.id}`, {
    method: 'DELETE',
  });
}

async function setSessionHiddenByDisplayName(displayName, hidden) {
  const sessions = await listSessions();
  const target = sessions.find((session) => session.displayName === displayName);

  if (!target) {
    return;
  }

  await requestJson(`/api/agent-sessions/${target.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ hidden }),
  });
}

async function ensureDemoSessions() {
  for (const session of demoSessions) {
    await deleteSessionByDisplayName(session.displayName);
  }

  killTmuxSession('readme-demo');

  for (const session of demoSessions) {
    await requestJson('/api/agent-launch/pty', {
      method: 'POST',
      body: JSON.stringify({
        workspaceId: 'default',
        ...session,
      }),
    });
  }

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const sessions = await listSessions();
    const ready = demoSessions.every((session) =>
      sessions.some((item) => item.displayName === session.displayName),
    );

    if (ready) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('demo sessions did not appear in time');
}

async function cleanupDemoSessions() {
  for (const session of demoSessions) {
    try {
      await deleteSessionByDisplayName(session.displayName);
    } catch {
      // ignore cleanup failures
    }
  }

  killTmuxSession('readme-demo');
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await ensureDemoSessions();
  const scanFixture = createScanDemoFixture();

  const sshHostsPayload = await requestJson('/api/ssh-hosts');
  const preferredHost = sshHostsPayload.hosts.find((host) => host.name === 'hm24');

  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1100 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.grid-card');
    await page.waitForTimeout(6_000);

    await page.screenshot({
      path: path.join(outputDir, 'board-overview.png'),
      fullPage: true,
    });

    await chooseLocalHost(page, /扫描会话/);
    const appDiscoveryDialog = page.locator('.discovery-dialog');
    await appDiscoveryDialog.waitFor();
    await appDiscoveryDialog.locator('.discovery-path-input').fill(scanFixture.rootDir);
    await appDiscoveryDialog.getByRole('button', { name: '扫描' }).click();
    await page.locator('.discovery-item-name', { hasText: 'README Scan Copilot' }).waitFor();
    await page.screenshot({
      path: path.join(outputDir, 'app-discovery-dialog.png'),
      fullPage: true,
    });
    await appDiscoveryDialog.getByRole('button', { name: '关闭' }).click();
    await appDiscoveryDialog.waitFor({ state: 'hidden' });

    await chooseLocalHost(page, /扫描 tmux/);
    const tmuxDiscoveryDialog = page.locator('.discovery-dialog');
    await tmuxDiscoveryDialog.waitFor();
    await page.locator('.discovery-item-name', { hasText: 'readme-demo' }).waitFor();
    await page.screenshot({
      path: path.join(outputDir, 'tmux-discovery-dialog.png'),
      fullPage: true,
    });
    await tmuxDiscoveryDialog.getByRole('button', { name: '关闭' }).click();
    await tmuxDiscoveryDialog.waitFor({ state: 'hidden' });

    const topBar = page.locator('.top-bar');
    await topBar.getByTestId('new-session-toggle').click();
    await page.getByRole('button', { name: /本机/ }).click();
    await page.waitForSelector('[data-testid="new-session-dialog"]');
    await page.getByTestId('new-session-name').fill('README Shell Session');
    await page.getByTestId('new-session-kind-shell').click();
    await page.getByTestId('new-session-dir').fill(process.cwd());
    await page.screenshot({
      path: path.join(outputDir, 'new-session-dialog.png'),
      fullPage: true,
    });
    await page
      .locator('[data-testid="new-session-dialog"]')
      .getByRole('button', { name: '关闭' })
      .click();
    await page.waitForSelector('[data-testid="new-session-dialog"]', {
      state: 'hidden',
    });

    const copilotCard = page.locator('.grid-card', {
      has: page.locator('.grid-card-name', { hasText: 'README Copilot Demo' }),
    });
    await copilotCard.dblclick();
    await page.waitForSelector('.focus-main');
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(outputDir, 'focus-view.png'),
      fullPage: true,
    });

    await page.getByTestId('file-browser-toggle').click();
    await page.getByTestId('file-browser-drawer').waitFor();
    await page.getByTestId('file-entry-README.md').click();
    await page.locator('.file-browser-preview-text').waitFor();
    await page.screenshot({
      path: path.join(outputDir, 'file-browser-drawer.png'),
      fullPage: true,
    });

    await page.getByTestId('vscode-toggle').click();
    if (await waitForVsCodeDrawer(page)) {
      await page.screenshot({
        path: path.join(outputDir, 'vscode-drawer.png'),
        fullPage: true,
      });
    }

    await page.getByRole('button', { name: '返回宫格' }).click();
    await page.waitForSelector('.grid-card');

    await page.getByRole('button', { name: /快速连接 tmux/ }).click();
    await page.waitForSelector('[data-testid="quick-tmux-connect-dialog"]');

    const hostSearch = page.getByTestId('quick-tmux-host-search');
    if (preferredHost) {
      await hostSearch.fill(preferredHost.name);
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid="quick-tmux-session-name"]');
      await page.getByTestId('quick-tmux-session-name').fill('demo-docs-tmux');
      await page.getByTestId('quick-tmux-working-directory').fill('~/');
    } else {
      await hostSearch.fill('ssh host');
    }

    await page.screenshot({
      path: path.join(outputDir, 'quick-tmux-connect.png'),
      fullPage: true,
    });

    await page.getByRole('button', { name: '关闭' }).click();
    await page.waitForSelector('[data-testid="quick-tmux-connect-dialog"]', {
      state: 'hidden',
    });

    await setSessionHiddenByDisplayName('README Awaiting Demo', true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.grid-card');
    await page.locator('.hidden-sessions-btn').click();
    await page.waitForSelector('.hidden-drawer');
    await page.screenshot({
      path: path.join(outputDir, 'hidden-sessions-drawer.png'),
      fullPage: true,
    });
  } finally {
    await browser?.close().catch(() => {});
    scanFixture.cleanup();
    await cleanupDemoSessions();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});