import { expect, test } from '@playwright/test';

const TOKEN = String(process.env.OPENPRISM_E2E_API_TOKEN || '').trim();

test('a real browser session unlocks protected projects, previews assets, and downloads files', async ({
  baseURL,
  browser,
  request,
}) => {
  expect(TOKEN).not.toBe('');
  expect(baseURL).toBeTruthy();

  const createResponse = await request.post('/api/projects', {
    data: { name: `Real-Auth-E2E-${Date.now()}` },
  });
  expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
  const project = await createResponse.json() as { id: string; name: string };

  try {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48"><rect width="96" height="48" fill="#2563eb"/></svg>';
    const fileResponse = await request.put(`/api/projects/${project.id}/file`, {
      data: { path: 'figure.svg', content: svg },
    });
    expect(fileResponse.ok(), await fileResponse.text()).toBeTruthy();

    // Create a plain browser context with no Playwright-level extraHTTPHeaders.
    // The only credential available to the application is the token entered in
    // the real Settings UI and stored in sessionStorage.
    const context = await browser.newContext({ extraHTTPHeaders: {} });
    const page = await context.newPage();
    let phase = 'initial-load';
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(`${phase}: ${error.stack || error.message}`));
    const protectedResponses: Array<{ path: string; status: number; type: string }> = [];
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith(`/api/projects/${project.id}`)) {
        protectedResponses.push({
          path: url.pathname,
          status: response.status(),
          type: response.request().resourceType(),
        });
      }
    });

    await page.goto(`${baseURL}/projects`, { waitUntil: 'networkidle' });
    await expect(page.locator('table')).not.toContainText(project.name);
    const accessLock = page.getByTestId('server-access-lock');
    await expect(accessLock).toBeVisible();
    await expect(accessLock).toContainText('需要服务器访问令牌');
    await expect(page.getByText(/模板加载失败.*Authentication required/)).toHaveCount(0);

    phase = 'unlocking-projects';
    await accessLock.getByLabel('服务器访问令牌').fill(TOKEN);
    phase = 'applying-token';
    await accessLock.getByRole('button', { name: '解锁并加载项目', exact: true }).click();
    await expect(page.locator('table')).toContainText(project.name);

    phase = 'opening-project';
    const row = page.locator('tr', { hasText: project.name });
    await row.getByRole('button', { name: '打开', exact: true }).click();
    await page.waitForURL(new RegExp(`/editor/${project.id}$`));
    phase = 'loading-project-files';
    await page.getByTitle('刷新文件列表').click();

    const file = page.getByText('figure.svg', { exact: true });
    await file.click();
    const image = page.locator('img[alt="figure.svg"]');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);

    await file.click({ button: 'right' });
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('下载', { exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('figure.svg');
    expect(await download.failure()).toBeNull();

    expect(protectedResponses.some((item) => item.type === 'image' && item.status === 401)).toBeFalsy();
    expect(pageErrors).toEqual([]);
    await context.close();
  } finally {
    const deleteResponse = await request.delete(`/api/projects/${project.id}/permanent`);
    expect([200, 404]).toContain(deleteResponse.status());
  }
});
