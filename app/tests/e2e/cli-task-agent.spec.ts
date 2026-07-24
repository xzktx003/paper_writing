import { expect, test } from './fixtures';

test('CLI Task Agent keeps Chat read-only and requires Diff review before Reject or Accept', async ({ page, request }) => {
  const createResponse = await request.post('/api/projects', { data: { name: `CLI-Task-E2E-${Date.now()}` } });
  expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
  const project = await createResponse.json() as { id: string };

  try {
    for (const [filePath, content] of [
      ['paper.md', '# Paper\n\nOriginal paper text.\n'],
      ['remove.txt', 'remove this file\n'],
    ]) {
      const response = await request.put(`/api/projects/${project.id}/file`, { data: { path: filePath, content } });
      expect(response.ok(), await response.text()).toBeTruthy();
    }

    await page.goto(`/editor/${project.id}`);
    await page.getByRole('button', { name: /任务/ }).click();
    const panel = page.getByTestId('cli-task-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('CLI 只修改隔离快照');
    await panel.getByLabel('CLI 提供方').selectOption('mock-cli');
    await panel.getByLabel('文件修改任务').fill('E2E_REVISE_PAPER');
    await panel.getByRole('button', { name: '创建可审查任务' }).click();

    await expect(panel.getByText('等待审查').last()).toBeVisible({ timeout: 15_000 });
    await expect(panel).toContainText('MODIFIED · paper.md');
    await expect(panel).toContainText('ADDED · agent-output/evidence.md');
    await expect(panel).toContainText('DELETED · remove.txt');
    await expect(panel.getByTestId('cli-task-diff').filter({ hasText: 'Revised by the isolated CLI Task Agent.' })).toBeVisible();

    const beforeReject = await request.get(`/api/projects/${project.id}/file?path=paper.md`);
    await expect(beforeReject.json()).resolves.toMatchObject({ content: '# Paper\n\nOriginal paper text.\n' });
    await panel.getByRole('button', { name: '拒绝且不修改项目' }).click();
    await expect(panel.getByText('已拒绝').last()).toBeVisible();
    const afterReject = await request.get(`/api/projects/${project.id}/file?path=paper.md`);
    await expect(afterReject.json()).resolves.toMatchObject({ content: '# Paper\n\nOriginal paper text.\n' });

    await panel.getByLabel('文件修改任务').fill('E2E_REVISE_PAPER_AGAIN');
    await panel.getByRole('button', { name: '创建可审查任务' }).click();
    await expect(panel.getByText('等待审查').last()).toBeVisible({ timeout: 15_000 });
    await panel.getByLabel('我已审查每一个变更文件，并理解“接受”会修改原项目。').check();
    await panel.getByRole('button', { name: '接受并应用变更' }).click();
    await expect(panel.getByText('已接受').last()).toBeVisible({ timeout: 10_000 });

    const acceptedPaper = await request.get(`/api/projects/${project.id}/file?path=paper.md`);
    await expect(acceptedPaper.json()).resolves.toMatchObject({ content: '# Paper\n\nRevised by the isolated CLI Task Agent.\n' });
    const added = await request.get(`/api/projects/${project.id}/file?path=agent-output%2Fevidence.md`);
    expect(added.ok(), await added.text()).toBeTruthy();
    const deleted = await request.get(`/api/projects/${project.id}/file?path=remove.txt`);
    expect(deleted.status()).toBe(404);

    await page.reload();
    await page.getByRole('button', { name: /任务/ }).click();
    await expect(page.getByTestId('cli-task-panel').getByText('已接受').last()).toBeVisible();
    await expect(page.getByTestId('cli-task-panel').getByText('已拒绝').last()).toBeVisible();
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});
