import { type APIRequestContext, type Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function createProject(request: APIRequestContext, suffix: string) {
  const response = await request.post('/api/projects', {
    data: { name: `Mobile E2E ${suffix} ${Date.now()}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ id: string; name: string }>;
}

async function assertNoViewportOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    root: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(metrics.root).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);
}

for (const viewport of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`${viewport.name}: project list and editor remain operable`, async ({ page, request }) => {
    const project = await createProject(request, viewport.name);
    try {
      await page.setViewportSize(viewport);
      await page.goto('/projects');
      await expect(page.getByRole('heading', { name: '我的项目' })).toBeVisible();
      await expect(page.getByText(project.name, { exact: true })).toBeVisible();
      await assertNoViewportOverflow(page);

      await page.goto(`/editor/${project.id}`);
      const tabs = page.getByRole('navigation', { name: '工作区视图' });
      await expect(tabs).toBeVisible();

      for (const label of ['文件', '编辑器', 'AI 助手']) {
        await tabs.getByRole('button', { name: label, exact: true }).click();
        await expect(tabs.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
        await assertNoViewportOverflow(page);
      }
    } finally {
      await request.delete(`/api/projects/${project.id}/permanent`);
    }
  });
}
