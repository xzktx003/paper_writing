import { expect, test } from './fixtures';

test('independently lazy-loaded Markdown and LaTeX quick previews remain usable', async ({ page, request }) => {
  const createResponse = await request.post('/api/projects', { data: { name: `Lazy-Preview-E2E-${Date.now()}` } });
  expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
  const project = await createResponse.json() as { id: string };

  try {
    for (const [filePath, content] of [
      ['paper.md', '# Lazy Markdown Preview\n\nRendered markdown body.\n'],
      ['main.tex', '\\section{Lazy LaTeX Preview}\nRendered TeX body.\n'],
    ]) {
      const response = await request.put(`/api/projects/${project.id}/file`, { data: { path: filePath, content } });
      expect(response.ok(), await response.text()).toBeTruthy();
    }

    const treeResponse = await request.get(`/api/projects/${project.id}/tree`);
    expect(treeResponse.ok(), await treeResponse.text()).toBeTruthy();
    await expect(treeResponse.json()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ path: 'paper.md', type: 'file' }),
        expect.objectContaining({ path: 'main.tex', type: 'file' }),
      ]),
    });

    await page.goto(`/editor/${project.id}`);
    await expect(page.getByTitle('刷新文件列表')).toBeVisible();
    await page.getByTitle('刷新文件列表').click();
    await page.getByText('paper.md', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lazy Markdown Preview' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('paragraph').filter({ hasText: 'Rendered markdown body.' })).toBeVisible();

    await page.getByText('main.tex', { exact: true }).click();
    const latexPreview = page.locator('.latex-preview-page');
    await expect(latexPreview.getByText(/Lazy LaTeX Preview/)).toBeVisible({ timeout: 10_000 });
    await expect(latexPreview.getByText(/Rendered TeX body\./)).toBeVisible();
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});
