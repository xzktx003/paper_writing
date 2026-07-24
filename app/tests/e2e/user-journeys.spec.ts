import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { type APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';

type Project = {
  id: string;
  name: string;
  directoryName: string;
  template?: string | null;
  createdAt: string;
  updatedAt: string;
};

async function createProject(request: APIRequestContext, name: string): Promise<Project> {
  const response = await request.post('/api/projects', { data: { name } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<Project>;
}

async function deleteProject(request: APIRequestContext, id: string) {
  const response = await request.delete(`/api/projects/${id}/permanent`);
  expect([200, 404]).toContain(response.status());
}

async function listProjects(request: APIRequestContext): Promise<Project[]> {
  const response = await request.get('/api/projects');
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json() as { projects: Project[] };
  return body.projects;
}

test('real project UI creates a blank project, preserves stable identity, and rolls back a rename conflict', async ({ page, request }, testInfo) => {
  const dataRoot = process.env.OPENPRISM_DATA_DIR;
  expect(dataRoot).toBeTruthy();
  const suffix = `${testInfo.workerIndex}-${Date.now()}`;
  const originalName = `UI Lifecycle ${suffix}`;
  const renamedName = `Renamed Paper ${suffix}`;
  const conflictingName = `Conflict Target ${suffix}`;
  let project: Project | null = null;
  let conflictRoot = '';

  try {
    await page.goto('/projects');
    await page.getByRole('button', { name: '新建项目' }).click();

    const nameInput = page.getByLabel('项目名称');
    await expect(nameInput).toBeVisible();
    await expect(page.getByRole('button', { name: /空白项目/ })).toBeVisible();
    await nameInput.fill(originalName);

    const createResponse = page.waitForResponse(response => (
      response.url().endsWith('/api/projects') && response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: '创建', exact: true }).click();
    const response = await createResponse;
    expect(response.ok(), await response.text()).toBeTruthy();
    project = await response.json() as Project;

    await page.waitForURL(new RegExp(`/editor/${project.id}$`));
    expect(project.template ?? null).toBeNull();
    expect(project.directoryName).toContain('--');

    const originalRoot = path.join(dataRoot!, project.directoryName);
    const metadata = JSON.parse(await readFile(path.join(originalRoot, 'project.json'), 'utf8')) as Project;
    expect(metadata).toMatchObject({
      id: project.id,
      name: originalName,
      directoryName: project.directoryName,
      template: null,
    });

    await page.goto('/projects');
    let row = page.locator('tr', { hasText: project.id });
    await expect(row).toContainText(`项目 ID: ${project.id}`);
    await expect(row).toContainText(`存储目录: ${project.directoryName}`);
    await row.getByRole('button', { name: '重命名', exact: true }).click();
    const renameInput = page.locator('input.inline-input');
    await renameInput.fill(renamedName);
    await renameInput.press('Enter');

    row = page.locator('tr', { hasText: project.id });
    await expect(row).toContainText(renamedName);
    await expect(row).toBeVisible();
    const renamed = (await listProjects(request)).find(candidate => candidate.id === project!.id);
    expect(renamed).toBeTruthy();
    expect(renamed!.id).toBe(project.id);
    expect(renamed!.directoryName).not.toBe(project.directoryName);
    expect(new Date(renamed!.updatedAt).getTime()).toBeGreaterThan(new Date(project.updatedAt).getTime());
    await expect(stat(originalRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(path.join(dataRoot!, renamed!.directoryName))).resolves.toBeTruthy();

    const shortId = project.id.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
    conflictRoot = path.join(dataRoot!, `${conflictingName.replace(/\s+/g, '-')}--${shortId}`);
    await mkdir(conflictRoot);

    await row.getByRole('button', { name: '重命名', exact: true }).click();
    const conflictingInput = page.locator('input.inline-input');
    await conflictingInput.fill(conflictingName);
    await conflictingInput.press('Enter');
    await expect(page.getByText(/重命名失败/)).toBeVisible();

    const afterConflict = (await listProjects(request)).find(candidate => candidate.id === project!.id);
    expect(afterConflict).toMatchObject({
      id: project.id,
      name: renamedName,
      directoryName: renamed!.directoryName,
    });
    await expect(stat(path.join(dataRoot!, renamed!.directoryName))).resolves.toBeTruthy();
  } finally {
    if (conflictRoot) await rm(conflictRoot, { recursive: true, force: true });
    if (project) await deleteProject(request, project.id);
  }
});

test('a saved non-latest conversation remains active after a real browser reload', async ({ page, request }, testInfo) => {
  const project = await createProject(request, `Conversation restore ${testInfo.workerIndex}-${Date.now()}`);
  try {
    const firstResponse = await request.post(`/api/conversations/${project.id}`, {
      data: { name: 'Saved active conversation' },
    });
    const secondResponse = await request.post(`/api/conversations/${project.id}`, {
      data: { name: 'Newer conversation' },
    });
    expect(firstResponse.ok(), await firstResponse.text()).toBeTruthy();
    expect(secondResponse.ok(), await secondResponse.text()).toBeTruthy();
    const first = await firstResponse.json() as { id: string };

    await page.goto('/projects');
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: `paper-agent-active-conversation:${project.id}`,
      value: first.id,
    });
    await page.goto(`/editor/${project.id}`);

    const savedTab = page.getByRole('tab', { name: /Saved active conversation/ });
    await expect(savedTab).toHaveAttribute('aria-selected', 'true');
    await page.reload();
    await expect(savedTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.evaluate(key => localStorage.getItem(key), `paper-agent-active-conversation:${project.id}`)).resolves.toBe(first.id);
  } finally {
    await deleteProject(request, project.id);
  }
});

test('local RAG completes add, search, delete, and no-longer-found through the UI', async ({ page, request }, testInfo) => {
  const project = await createProject(request, `RAG UI journey ${testInfo.workerIndex}-${Date.now()}`);
  const uniqueEvidence = `spectral-evidence-${testInfo.workerIndex}-${Date.now()}`;
  try {
    await page.goto(`/editor/${project.id}`);
    await page.getByRole('button', { name: /RAG/ }).click();

    const filename = page.getByPlaceholder('filename.md');
    await expect(filename).toBeVisible();
    await filename.fill('ui-evidence.md');
    await page.getByPlaceholder(/粘贴论文笔记|Paste paper notes/).fill(
      `This inspectable source contains ${uniqueEvidence} for the complete browser journey.`,
    );
    await page.getByRole('button', { name: /加入资料库|Add to corpus/ }).click();
    await expect(page.getByText(/已添加并索引|Added and indexed/)).toBeVisible();
    await expect(page.getByText('ui-evidence.md').first()).toBeVisible();

    await page.getByLabel(/资料库查询|Corpus query/).fill(uniqueEvidence);
    await page.getByRole('button', { name: /搜索|Search/ }).last().click();
    await expect(page.getByText(uniqueEvidence, { exact: false }).last()).toBeVisible();
    await expect(page.getByText(/research_corpus\/ui-evidence\.md/).first()).toBeVisible();

    await page.getByRole('button', { name: /资料库|Corpus/ }).click();
    await page.getByTitle(/删除文档|Delete document/).click();
    await expect(page.getByText(/已删除|Deleted/)).toBeVisible();
    await expect(page.getByTitle(/删除文档|Delete document/)).toHaveCount(0);

    await page.getByRole('button', { name: /搜索|Search/ }).first().click();
    const searchInput = page.getByPlaceholder(/搜索内容|Search query/);
    await searchInput.fill(uniqueEvidence);
    await page.getByRole('button', { name: /搜索|Go/, exact: true }).last().click();
    await expect(page.getByText(uniqueEvidence, { exact: false })).toHaveCount(0);
    await expect(page.getByText(/执行检索后将在这里显示证据片段|Run a search to see evidence snippets/)).toBeVisible();
  } finally {
    await deleteProject(request, project.id);
  }
});

test('Provider settings run a real non-inference Codex probe and expose structured status', async ({ page }) => {
  await page.goto('/projects');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByLabel('模型提供方').selectOption('codex-cli');
  await page.getByRole('button', { name: '测试连接' }).click();

  const result = page.getByTestId('provider-probe-result');
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result).toContainText(/codex|authenticated|not authenticated|auth status unavailable/i);
});
