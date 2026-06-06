import { test, expect, type Page } from '@playwright/test';

const FRONTEND_URL = process.env.BASE_URL || process.env.OPENPRISM_PUBLIC_URL || 'http://10.30.0.22:8787';
const BACKEND_URL = process.env.BACKEND_URL || process.env.OPENPRISM_PUBLIC_URL || 'http://10.30.0.22:8787';

/* ── helpers ─────────────────────────────────────────────── */

/** 导航到项目列表页 */
async function goToProjects(page: Page) {
  await page.goto(`${FRONTEND_URL}/projects`, { waitUntil: 'networkidle' });
}

/** 通过后端 API 创建一个临时项目，返回 { id, name } */
async function createProjectViaApi(name: string) {
  const res = await fetch(`${BACKEND_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  expect(res.ok).toBeTruthy();
  return res.json() as Promise<{ id: string; name: string }>;
}

/** 通过后端 API 删除项目（移到回收站） */
async function deleteProjectViaApi(id: string) {
  await fetch(`${BACKEND_URL}/api/projects/${id}`, { method: 'DELETE' });
}

/** 通过后端 API 彻底清除项目目录 */
async function purgeProjectViaApi(id: string) {
  // 先尝试后端 purge；如果没有该接口，直接删目录
  try {
    await fetch(`${BACKEND_URL}/api/projects/${id}/purge`, { method: 'DELETE' });
  } catch {
    // ignore —— cleanup best-effort
  }
}

/* ── 测试套件 ────────────────────────────────────────────── */

test.describe('项目列表页', () => {
  test('页面能正常加载', async ({ page }) => {
    await goToProjects(page);
    await expect(page.locator('h1')).toHaveText('所有项目');
  });

  test('侧边栏导航包含所有分类', async ({ page }) => {
    await goToProjects(page);
    const sidebar = page.locator('aside, [role="complementary"]').first();
    await expect(sidebar).toContainText('所有项目');
    await expect(sidebar).toContainText('我的项目');
    await expect(sidebar).toContainText('已归档');
    await expect(sidebar).toContainText('回收站');
  });

  test('能看到已有的项目', async ({ page }) => {
    await goToProjects(page);
    // 至少应该显示 torq 项目
    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('torq');
  });

  test('搜索框能过滤项目', async ({ page }) => {
    await goToProjects(page);
    const search = page.getByPlaceholder('搜索项目...');
    await search.fill('torq');
    await expect(page.locator('table')).toContainText('torq');
    await search.fill('nonexistent_xyz_12345');
    // 搜索无结果时应显示空或提示
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(0);
  });
});

test.describe('项目 CRUD 操作', () => {
  const projectName = `Playwright E2E Test ${Date.now()}`;
  let projectId: string;

  test('通过 API 创建项目后能在列表中看到', async ({ page }) => {
    const project = await createProjectViaApi(projectName);
    projectId = project.id;

    await goToProjects(page);
    const table = page.locator('table');
    await expect(table).toContainText(projectName);
  });

  test('点击"打开"能进入项目编辑器', async ({ page }) => {
    // 确保项目已创建（如果上一个测试跳过了）
    if (!projectId) {
      const project = await createProjectViaApi(projectName);
      projectId = project.id;
    }

    await goToProjects(page);
    const row = page.locator('tr', { hasText: projectName });
    await row.waitFor({ timeout: 15_000 });
    await row.getByRole('button', { name: '打开' }).click();

    // 应跳转到编辑器页面
    await page.waitForURL(/\/editor\//, { timeout: 15_000 });
    await expect(page.url()).toContain('/editor/');
  });

  test('删除项目后项目消失', async ({ page }) => {
    // 确保项目存在
    if (!projectId) {
      const project = await createProjectViaApi(projectName);
      projectId = project.id;
    }

    await goToProjects(page);
    const row = page.locator('tr', { hasText: projectName });
    await row.waitFor({ timeout: 15_000 });

    // 点击删除按钮
    page.on('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: '删除' }).click();

    // 等待项目从列表消失
    await expect(row).toHaveCount(0, { timeout: 15_000 });
  });

  test.afterAll(async () => {
    // 清理：删除测试项目
    if (projectId) {
      await purgeProjectViaApi(projectId);
    }
  });
});

test.describe('后端 API 健康检查', () => {
  test('/api/health 返回 ok', async () => {
    const res = await fetch(`${BACKEND_URL}/api/health`);
    expect(res.ok).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  test('/api/config 返回配置', async () => {
    const res = await fetch(`${BACKEND_URL}/api/config`);
    expect(res.ok).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('claude_model');
  });

  test('/api/projects 返回项目列表', async () => {
    const res = await fetch(`${BACKEND_URL}/api/projects`);
    expect(res.ok).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('projects');
    expect(Array.isArray(data.projects)).toBeTruthy();
  });
});
