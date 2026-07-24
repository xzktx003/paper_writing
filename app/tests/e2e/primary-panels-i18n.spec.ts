import { type APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';

async function createProject(request: APIRequestContext) {
  const response = await request.post('/api/projects', {
    data: { name: `主面板中文验收-${Date.now()}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ id: string; name: string }>;
}

test('zh-CN renders the primary editor and assistant panel copy in Chinese', async ({ page, request }) => {
  const project = await createProject(request);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/editor/${project.id}`);

    await expect(page.getByText('请从项目树中打开文件', { exact: true })).toBeVisible();
    await expect(page.getByText('当前没有活动对话', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /新建对话/ })).toBeVisible();

    await page.getByRole('button', { name: /绘图/ }).click();
    await expect(page.getByText('步骤 1：生成图片提示词', { exact: true })).toBeVisible();
    await expect(page.getByText('论文内容', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /评审/ }).click();
    await expect(page.getByText('尚无评审报告', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /执行结构化评审/ })).toBeVisible();

    await page.getByRole('button', { name: /引用/ }).click();
    await expect(page.getByText('引用核验', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /核验所有引用/ })).toBeVisible();

    await page.getByRole('button', { name: /AI 写作检测/ }).click();
    await expect(page.getByRole('button', { name: '快速', exact: true })).toBeVisible();
    await expect(page.getByText('还没有快速扫描结果，请点击上方“重新扫描”开始。', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /流水线/ }).click();
    await expect(page.getByText('由类型化执行器组成的可组合多阶段工作流', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /启动流水线/ })).toBeVisible();
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});
