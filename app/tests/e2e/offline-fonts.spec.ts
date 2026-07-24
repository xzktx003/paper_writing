import { expect, test } from './fixtures';

test('core pages and LaTeX preview do not request remote font or CDN stylesheets', async ({ page, request }) => {
  const remoteFontRequests: string[] = [];
  const localCjkFontResponses: Array<{ url: string; status: number }> = [];
  page.on('request', request => {
    if (/fonts\.(?:googleapis|gstatic)\.com|cdn\.jsdelivr\.net/i.test(request.url())) {
      remoteFontRequests.push(request.url());
    }
  });
  page.on('response', response => {
    if (/noto-sans-sc-chinese-simplified-(?:400|600)-normal(?:-[^.]+)?\.woff2/i.test(response.url())) {
      localCjkFontResponses.push({ url: response.url(), status: response.status() });
    }
  });

  const createResponse = await request.post('/api/projects', { data: { name: `Offline-Font-E2E-${Date.now()}` } });
  expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
  const project = await createResponse.json() as { id: string };
  try {
    const fileResponse = await request.put(`/api/projects/${project.id}/file`, {
      data: { path: 'main.tex', content: '\\section{Offline Font Probe}\nLocal preview body.\n' },
    });
    expect(fileResponse.ok(), await fileResponse.text()).toBeTruthy();

    await page.goto(`/editor/${project.id}`);
    await page.getByTitle('刷新文件列表').click();
    await page.getByText('main.tex', { exact: true }).click();
    await expect(page.locator('.latex-preview-page')).toContainText('Offline Font Probe');
    const fontState = await page.locator('body').evaluate(async element => {
      await document.fonts.ready;
      const loaded = await document.fonts.load('400 16px "Noto Sans SC"', '中文字体实际加载检查');
      return {
        fontFamily: getComputedStyle(element).fontFamily,
        loadedFaces: loaded.length,
        check: document.fonts.check('400 16px "Noto Sans SC"', '中文字体实际加载检查'),
      };
    });

    expect(remoteFontRequests).toEqual([]);
    expect(localCjkFontResponses.some(response => response.status === 200)).toBe(true);
    expect(fontState.fontFamily.startsWith('"Noto Sans SC"')).toBe(true);
    expect(fontState.loadedFaces).toBeGreaterThan(0);
    expect(fontState.check).toBe(true);
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});
