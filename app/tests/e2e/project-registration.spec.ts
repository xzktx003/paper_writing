import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { expect, test } from './fixtures';

test('discovers and explicitly registers an existing paper directory without moving it', async ({ page }) => {
  const dataRoot = process.env.OPENPRISM_DATA_DIR;
  expect(dataRoot).toBeTruthy();
  const directoryName = `existing-paper-e2e-${Date.now()}`;
  const projectRoot = join(dataRoot!, directoryName);
  await mkdir(join(projectRoot, 'source'), { recursive: true });
  await writeFile(join(projectRoot, 'source', 'main.tex'), '\\documentclass{article}\n\\begin{document}Demo\\end{document}\n');
  await writeFile(join(projectRoot, 'references.bib'), '@article{demo,title={Demo}}\n');

  try {
    await page.goto('/projects');
    const candidateSection = page.getByRole('region', { name: '发现的论文目录' });
    await expect(candidateSection).toBeVisible();
    const candidate = candidateSection.locator('article', { hasText: directoryName });
    await expect(candidate).toContainText('source/main.tex');
    await expect(candidate).toContainText('检测到 2 个论文文件');

    await candidate.getByRole('textbox').fill('已恢复论文工程');
    page.once('dialog', (dialog) => dialog.accept());
    await candidate.getByRole('button', { name: '确认注册', exact: true }).click();

    await expect(candidateSection).toHaveCount(0);
    const row = page.locator('tr', { hasText: '已恢复论文工程' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('项目 ID');
    await expect(row).toContainText(`工程文件夹: ${directoryName}`);
    await expect(page.getByText('已注册项目“已恢复论文工程”，原目录保持不变。')).toBeVisible();

    await page.getByPlaceholder('搜索项目...').fill(directoryName.replaceAll('-', '_'));
    await expect(row).toBeVisible();

    await expect.poll(async () => {
      const response = await page.request.get('/api/projects');
      const data = await response.json();
      return data.projects.find((project: { name: string }) => project.name === '已恢复论文工程');
    }).toMatchObject({ directoryName, mainFile: 'source/main.tex' });
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
