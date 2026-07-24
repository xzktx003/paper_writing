import { type APIRequestContext, type Page } from '@playwright/test';
import { expect, test as authenticatedBase } from './fixtures';

type Project = { id: string; name: string };
type ProjectFixtures = { testProject: Project };

async function goToProjects(page: Page) {
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '全部项目' })).toBeVisible();
}

async function createProjectViaApi(request: APIRequestContext, name: string): Promise<Project> {
  const response = await request.post('/api/projects', { data: { name } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<Project>;
}

async function deleteProjectViaApi(request: APIRequestContext, id: string) {
  const response = await request.delete(`/api/projects/${id}/permanent`);
  expect([200, 404]).toContain(response.status());
}

const test = authenticatedBase.extend<ProjectFixtures>({
  testProject: async ({ request }, use, testInfo) => {
    const safeTitle = testInfo.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 36);
    const project = await createProjectViaApi(request, `E2E-${testInfo.workerIndex}-${safeTitle}-${Date.now()}`);
    try {
      await use(project);
    } finally {
      await deleteProjectViaApi(request, project.id);
    }
  },
});

test.describe('项目列表页', () => {
  test('页面能正常加载', async ({ page }) => {
    await goToProjects(page);
    await expect(page.locator('table')).toBeVisible();
  });

  test('侧边栏导航包含当前分类', async ({ page }) => {
    await goToProjects(page);
    const sidebar = page.locator('aside').first();
    await expect(sidebar).toContainText('全部项目');
    await expect(sidebar).toContainText('未归档');
    await expect(sidebar).toContainText('已归档');
    await expect(sidebar).toContainText('已删除');
  });

  test('显示测试自己创建的项目', async ({ page, testProject }) => {
    await goToProjects(page);
    await expect(page.locator('table')).toContainText(testProject.name);
  });

  test('默认列表也显示 papers 下已归档的工程', async ({ page, request, testProject }) => {
    const archiveResponse = await request.patch(`/api/projects/${testProject.id}/archive`, { data: { archived: true } });
    expect(archiveResponse.ok(), await archiveResponse.text()).toBeTruthy();
    await goToProjects(page);
    await expect(page.locator('tr', { hasText: testProject.name })).toBeVisible();
  });

  test('全部、未归档、已归档和已删除四个视图互相区分', async ({ page, request, testProject }) => {
    const projectRow = () => page.locator('tr', { hasText: testProject.name });
    const openView = async (name: string) => {
      await page.locator('.sidebar-nav-item', { hasText: name }).click();
      await expect(page.getByRole('heading', { name })).toBeVisible();
    };

    await goToProjects(page);
    await expect(projectRow()).toBeVisible();
    await openView('未归档');
    await expect(projectRow()).toBeVisible();

    const archiveResponse = await request.patch(`/api/projects/${testProject.id}/archive`, { data: { archived: true } });
    expect(archiveResponse.ok(), await archiveResponse.text()).toBeTruthy();
    await page.reload();
    await openView('未归档');
    await expect(projectRow()).toHaveCount(0);
    await openView('已归档');
    await expect(projectRow()).toBeVisible();
    await openView('全部项目');
    await expect(projectRow()).toBeVisible();

    const trashResponse = await request.patch(`/api/projects/${testProject.id}/trash`, { data: { trashed: true } });
    expect(trashResponse.ok(), await trashResponse.text()).toBeTruthy();
    await page.reload();
    await openView('全部项目');
    await expect(projectRow()).toHaveCount(0);
    await openView('已删除');
    await expect(projectRow()).toBeVisible();
  });

  test('搜索框能过滤测试自己创建的项目', async ({ page, testProject }) => {
    await goToProjects(page);
    const search = page.getByPlaceholder('搜索项目...');
    await search.fill(testProject.name);
    await expect(page.locator('table')).toContainText(testProject.name);

    await search.fill(`missing-${testProject.id}`);
    await expect(page.locator('table tbody tr')).toHaveCount(0);
    await expect(page.getByText('暂无项目。')).toBeVisible();
  });
});

test.describe('项目 CRUD 操作', () => {
  test('通过 API 创建项目后能在列表中看到', async ({ page, testProject }) => {
    await goToProjects(page);
    await expect(page.locator('tr', { hasText: testProject.name })).toBeVisible();
  });

  test('点击“打开”能进入项目编辑器', async ({ page, testProject }) => {
    await goToProjects(page);
    const row = page.locator('tr', { hasText: testProject.name });
    await row.getByRole('button', { name: '打开', exact: true }).click();

    await page.waitForURL(new RegExp(`/editor/${testProject.id}$`));
  });

  test('不配置模型也能手动编辑并保存项目文件', async ({ page, request, testProject }) => {
    const initialContent = '# Manual editing\nBefore save.\n';
    const savedContent = '# Manual editing\nSaved without a model.\n';
    const createFileResponse = await request.put(`/api/projects/${testProject.id}/file`, {
      data: { path: 'manual.md', content: initialContent },
    });
    expect(createFileResponse.ok(), await createFileResponse.text()).toBeTruthy();

    await goToProjects(page);
    await page.locator('tr', { hasText: testProject.name }).getByRole('button', { name: '打开', exact: true }).click();
    await page.waitForURL(new RegExp(`/editor/${testProject.id}$`));
    await page.getByText('manual.md', { exact: true }).click();
    const editor = page.locator('.cm-content');
    await expect(editor).toBeVisible();
    await editor.fill(savedContent);

    const saveButton = page.getByTestId('manual-save-button');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(saveButton).toBeDisabled();

    await expect.poll(async () => {
      const response = await request.get(`/api/projects/${testProject.id}/file`, { params: { path: 'manual.md' } });
      return (await response.json()).content;
    }).toBe(savedContent);
  });

  test('删除项目后项目从当前列表消失', async ({ page, testProject }) => {
    await goToProjects(page);
    const row = page.locator('tr', { hasText: testProject.name });
    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: '删除', exact: true }).click();

    await expect(row).toHaveCount(0);
  });
});

test.describe('后端 API 健康检查', () => {
  test('/api/health 返回 ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  test('/api/config 返回公开配置', async ({ request }) => {
    const response = await request.get('/api/config');
    expect(response.ok(), await response.text()).toBeTruthy();
    await expect(response.json()).resolves.toHaveProperty('claude_model');
  });

  test('/api/projects 返回项目数组', async ({ request }) => {
    const response = await request.get('/api/projects');
    expect(response.ok(), await response.text()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data.projects)).toBeTruthy();
  });
});
