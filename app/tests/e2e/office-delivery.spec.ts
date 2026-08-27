import { type APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';

async function expectNoOverlap(first: ReturnType<import('@playwright/test').Page['getByTestId']>, second: ReturnType<import('@playwright/test').Page['getByTestId']>) {
  const [a, b] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  const overlaps = a && b
    ? a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    : false;
  expect(overlaps).toBe(false);
}

async function createProject(request: APIRequestContext, suffix: string) {
  const response = await request.post('/api/projects', {
    data: { name: `Office Delivery E2E ${suffix} ${Date.now()}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ id: string; name: string }>;
}

test('formal workspace records evidence, audits gaps, and exports without a configured model', async ({ page, request }) => {
  const project = await createProject(request, 'desktop');
  try {
    await page.goto(`/editor/${project.id}`);
    await page.getByTestId('right-panel-delivery-tab').click();
    const panel = page.getByTestId('office-delivery-panel');
    await expect(panel).toBeVisible();

    await panel.locator('#office-title').fill('可核验项目申报材料');
    await panel.locator('#office-team').fill('技术管理部');
    await panel.locator('#office-scenario').fill('每月汇总项目资料并形成可审查的申报文案');
    await panel.locator('#office-frequency').fill('每月 4 次，连续执行');
    await panel.locator('#office-original-process').fill('负责人逐份检索材料、复制数据、人工汇总后再交叉检查。');
    await panel.locator('#office-pain-points').fill('来源分散\n数字容易丢失上下文\n复核链路难追踪');
    await panel.locator('#office-users').fill('项目申报负责人、材料审核人');
    await panel.locator('#office-tasks').fill('作品方案\n三分钟演示讲稿\n复用说明\n效果证明');
    await panel.locator('#office-value').fill('AI 辅助整理和起草，证据定位与人工审批决定最终采纳。');
    await panel.locator('#office-reuse').fill('通过模板、SOP 和检查清单迁移到相邻岗位。');
    await panel.locator('#office-significance').fill('降低高证据材料的检索与返工成本。');
    await panel.locator('#office-delivery-standard').fill('所有关键结论可定位，所有数字可复算，终稿须人工审批。');
    await panel.locator('#office-dependencies').fill('本地项目资料\nOpenAI 兼容模型（可选）');
    await panel.locator('#office-constraints').fill('不得上传未脱敏内部资料\n不得自动发布');

    await panel.getByTestId('office-stage-evidence').click();
    await panel.getByTestId('office-add-material').click();
    const material = panel.getByTestId('office-material-0');
    await material.getByLabel('名称').fill('作品方案');
    await material.getByLabel('项目相对路径').fill('main.md');

    await panel.getByTestId('office-add-evidence').click();
    const evidence = panel.getByTestId('office-evidence-0');
    await evidence.getByLabel('需证明的结论').fill('所有 AI 修改都需人工确认');
    await evidence.getByLabel('来源路径').fill('reuse/SOP.md');
    await evidence.getByLabel('精确位置').fill('人工审批步骤');
    await evidence.getByLabel('证据等级').selectOption('E1');
    await evidence.getByLabel('状态').selectOption('verified');

    await panel.getByTestId('office-stage-effect').click();
    await panel.getByLabel('原流程耗时（分钟）').fill('120');
    await panel.getByLabel('AI 操作耗时（分钟）').fill('45');
    await panel.getByLabel('人工复核耗时（分钟）').fill('20');
    await panel.getByLabel('重试耗时（分钟）').fill('10');
    await panel.getByLabel('样本量').fill('3');
    await panel.getByLabel('指标单位').fill('分钟/份');
    await panel.getByLabel('统计周期').fill('2026-08 演示样本');
    await panel.getByLabel('任务频率').fill('每月 4 次');
    await panel.getByLabel('覆盖人数').fill('2');
    await panel.getByLabel('测量状态').selectOption('measured');
    await panel.getByTestId('office-add-asset').click();
    const asset = panel.getByTestId('office-asset-0');
    await asset.getByLabel('名称').fill('办公材料复用 SOP');
    await asset.getByLabel('项目相对路径').fill('reuse/SOP.md');
    await asset.getByLabel('状态').selectOption('ready');

    await panel.getByTestId('office-save').click();
    await expect(panel.getByRole('status')).toContainText('.openprism/office-track.json');

    await panel.getByTestId('office-stage-delivery').click();
    await panel.locator('#office-demo').fill('导入来源；生成草稿；核验证据；人工确认；导出交付包。');
    await panel.locator('#office-questions').fill('如何避免无依据数字？\n如何保护内部材料？');
    await panel.locator('#office-checks').fill('确认来源已脱敏\n确认展示完整人审链路');
    await panel.getByTestId('office-run-audit').click();
    await expect(panel.getByText(/提效成效/)).toBeVisible();
    await expect(panel).toContainText('待补材料，不形成总建议分');
    await expect(panel).toContainText('分析路径');
    await expectNoOverlap(panel.getByTestId('office-save'), page.getByTestId('terminal-toggle'));
    await expectNoOverlap(panel.getByTestId('office-export'), page.getByTestId('terminal-toggle'));
    await expect(panel).toContainText('比赛就绪度仅用于准备，不代表官方评分或获奖结果');

    await panel.getByTestId('office-export-confirm').check();
    await panel.getByTestId('office-export').click();
    await expect(panel).toContainText('submission/M01-proposal.md');
    await expect(panel).toContainText('submission/submission-manifest.json');

    const stored = await request.get(`/api/projects/${project.id}/office-track`);
    expect(stored.ok(), await stored.text()).toBeTruthy();
    const body = await stored.json();
    expect(body.state.brief.title).toBe('可核验项目申报材料');
    expect(body.state.evidence[0].status).toBe('verified');
    expect(body.state.effect.reviewMinutes).toBe(20);
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});

test('phone viewport can open Delivery, edit the brief, and save', async ({ page, request }) => {
  const project = await createProject(request, 'phone');
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/editor/${project.id}`);
    const workspaceViews = page.getByRole('navigation', { name: '工作区视图' });
    await workspaceViews.getByRole('button', { name: 'AI 助手', exact: true }).click();
    await page.getByTestId('right-panel-delivery-tab').click();
    const panel = page.getByTestId('office-delivery-panel');
    await panel.locator('#office-title').fill('移动端办公材料');
    await panel.getByTestId('office-save').click();
    await expect(panel.getByRole('status')).toContainText('.openprism/office-track.json');
    const viewport = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
    await expectNoOverlap(panel.getByTestId('office-save'), page.getByTestId('terminal-toggle'));
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});
