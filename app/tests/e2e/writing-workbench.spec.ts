import { type APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';

async function createPaperProject(request: APIRequestContext) {
  const response = await request.post('/api/projects', {
    data: { name: `Writing Workbench E2E ${Date.now()}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const project = await response.json() as { id: string };
  const file = await request.put(`/api/projects/${project.id}/file`, {
    data: {
      path: 'main.tex',
      content: String.raw`\documentclass{article}
\begin{document}
Our method improves accuracy by 2.4\% on the supplied benchmark \cite{demo2026}.
\end{document}`,
    },
  });
  expect(file.ok(), await file.text()).toBeTruthy();
  return project;
}

test('paper writing workbench turns a file-aware polish task into a reviewable Agent draft', async ({ page, request }) => {
  const project = await createPaperProject(request);
  try {
    await page.goto(`/editor/${project.id}`);
    await page.getByText('main.tex', { exact: true }).click();
    await page.getByTestId('right-panel-writing-tab').click();

    const panel = page.getByTestId('writing-workbench-panel');
    await expect(panel).toContainText('论文写作助手');
    await expect(panel).toContainText('只生成建议，不会自动修改论文文件');
    await panel.getByRole('button', { name: '润色当前文件' }).click();

    await expect(panel).toContainText('论文润色 / 语言编辑');
    await expect(panel).toContainText('Agent 建议修改');
    await expect(panel).toContainText('保留公式、引用键、数字和 LaTeX 命令');

    const useDraft = panel.getByRole('button', { name: '带到 AI 对话' });
    await expect(useDraft).toBeEnabled();
    await useDraft.click();

    const assistant = page.locator('[data-workspace-panel="assistant"]');
    const composer = assistant.locator('textarea').last();
    await expect(composer).toBeVisible();
    await expect(composer).toHaveValue(/保留公式、引用键、数字和 LaTeX 命令/);
    await expect(assistant).toContainText('agent');
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});
