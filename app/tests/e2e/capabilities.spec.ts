import { expect, test } from './fixtures';

const TOKEN = String(process.env.OPENPRISM_E2E_API_TOKEN || '').trim();

test('blocks the workspace when the frontend and backend build identities differ', async ({ page }) => {
  await page.route('**/api/health', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        build: { id: 'stale-backend-build', apiSchemaVersion: 2 },
      }),
    });
  });

  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('前后端版本不一致');
  await expect(alert).toContainText('build-id-mismatch');
  await expect(page.getByRole('button', { name: '+ 新建项目' })).toHaveCount(0);
});

test('system capability diagnostics preserve fail-closed defaults and support an explicit authenticated run', async ({ page, request }) => {
  if (!TOKEN) {
    const apiResponse = await request.get('/api/capabilities');
    expect(apiResponse.status()).toBe(503);
    await expect(apiResponse.json()).resolves.toMatchObject({
      error: expect.stringMatching(/disabled until OPENPRISM_API_TOKEN/i),
    });

    await page.goto('/projects', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '设置' }).click();
    await page.getByTestId('capabilities-tab').click();
    const panel = page.getByTestId('capabilities-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Dangerous API disabled until OPENPRISM_API_TOKEN is configured');
    await expect(panel).toContainText('请先在模型提供方设置中应用服务器访问令牌');
    return;
  }

  const apiResponse = await request.get('/api/capabilities', {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  expect(apiResponse.ok(), await apiResponse.text()).toBeTruthy();
  const apiReport = await apiResponse.json();
  expect(apiReport.schemaVersion).toBe(1);
  expect(apiReport.capabilities).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'provider.codex-cli' }),
    expect.objectContaining({ id: 'document.tex' }),
    expect.objectContaining({ id: 'skills.catalog' }),
  ]));
  expect(JSON.stringify(apiReport)).not.toContain(process.env.HOME || '__no-home__');

  await page.addInitScript((token) => {
    window.sessionStorage.setItem('paper-agent-server-access-token', token);
  }, TOKEN);
  await page.route('**/api/capabilities', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 1,
        checkedAt: '2026-07-22T02:00:00.000Z',
        cache: { cached: false, ttlMs: 30_000 },
        capabilities: [
          { id: 'document.tex', label: 'TeX engines', status: 'available', reason: 'One TeX engine is available.', checkedAt: '2026-07-22T02:00:00.000Z', details: {} },
          { id: 'document.pandoc', label: 'Pandoc conversion', status: 'unavailable', reason: 'Pandoc is not installed.', checkedAt: '2026-07-22T02:00:00.000Z', details: {} },
        ],
      }),
    });
  });

  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByTestId('capabilities-tab').click();
  const panel = page.getByTestId('capabilities-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('capability-document.tex')).toContainText('可用');
  await expect(panel.getByTestId('capability-document.pandoc')).toContainText('不可用');
  await expect(panel).toContainText('只读诊断');
});
