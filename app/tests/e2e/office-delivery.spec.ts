import { type APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';

async function expectNoOverlap(first: ReturnType<import('@playwright/test').Page['getByTestId']>, second: ReturnType<import('@playwright/test').Page['getByTestId']>) {
  const [a, b] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  const overlaps = a && b ? a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y : false;
  expect(overlaps).toBe(false);
}

async function createProject(request: APIRequestContext, suffix: string) {
  const response = await request.post('/api/projects', { data: { name: `Office V2 E2E ${suffix} ${Date.now()}` } });
  expect(response.ok(), await response.text()).toBeTruthy();
  const project = await response.json() as { id: string; name: string };
  const file = await request.put(`/api/projects/${project.id}/file`, {
    data: {
      path: 'sources/pilot.txt',
      content: '财务部门已批准报销材料自动整理试点。所有对外交付必须经过人工确认。首次演练未减少材料整理耗时，缺少证据时不得宣称提效。',
    },
  });
  expect(file.ok(), await file.text()).toBeTruthy();
  return project;
}

test('office operations complete intake, production, review, approval, delivery, and measurement with honest states', async ({ page, request }) => {
  const project = await createProject(request, 'desktop');
  try {
    await page.goto(`/editor/${project.id}`);
    await page.getByTestId('right-panel-delivery-tab').click();
    const panel = page.getByTestId('office-delivery-panel');
    await expect(panel).toContainText('办公材料作业台');
    await expect(panel).toContainText('Built-in OOXML reader');
    await expect(panel).toContainText('OfficeCLI');
    await expect(panel).toContainText('未配置');

    await panel.locator('#office-title').fill('可核验项目申报材料');
    await panel.locator('#office-team').fill('技术管理部');
    await panel.locator('#office-scenario').fill('每月汇总项目资料并形成可审查的申报文案');
    await panel.locator('#office-users').fill('项目申报负责人、材料审核人');
    await panel.locator('#office-tasks').fill('作品方案\n三分钟演示讲稿\n效果证明');
    await panel.locator('#office-value').fill('AI 辅助整理和起草，证据定位与人工审批决定最终采纳。');
    await panel.locator('#office-frequency').fill('每月 4 次');
    await panel.locator('#office-original-process').fill('逐份检索、复制数据、人工汇总和交叉检查。');
    await panel.locator('#office-pain-points').fill('来源分散\n数字容易丢失上下文');
    await panel.locator('#office-reuse').fill('通过模板、SOP 与配方复用。');
    await panel.locator('#office-significance').fill('降低高证据办公材料的检索与返工成本。');
    await panel.locator('#office-delivery-standard').fill('重要结论可定位，终稿须人工审批。');
    await panel.locator('#office-dependencies').fill('本地项目资料');
    await panel.locator('#office-constraints').fill('不得自动发布\n不得虚构提效数据');
    await panel.locator('#office-import-path').fill('sources/pilot.txt');
    await panel.getByTestId('office-import-material').click();
    await expect(panel.getByTestId('office-inbox-item')).toContainText('plain-text');
    await expect(panel.getByTestId('office-inbox-item')).toContainText('ready');

    await panel.getByTestId('office-stage-produce').click();
    await panel.locator('#office-artifact-input').fill('sources/pilot.txt');
    await panel.getByTestId('office-artifact-plan').click();
    await expect(panel.getByTestId('office-artifact-result')).toContainText('validate');
    await panel.getByTestId('office-artifact-run').click();
    await expect(panel.getByTestId('office-artifact-result')).toContainText('unavailable');
    await panel.getByTestId('office-create-run').click();
    await expect(panel).toContainText('triggered');
    await panel.getByRole('button', { name: '进入处理' }).click();
    await panel.getByRole('button', { name: '提交审阅' }).click();
    await expect(panel).toContainText('review');
    await panel.locator('#office-meeting-transcript').fill('[00:01:00] 王敏：讨论证据缺口。\n[00:02:00] 李强：决定：保留人工审批门禁。\n[00:03:00] 王敏：待办：陈晨负责于2026-08-30前补齐效果表。');
    await panel.getByTestId('office-import-meeting').click();
    await expect(panel).toContainText('决定 1 · 待办 1');
    await expect(panel).toContainText('not-claimed');

    await panel.getByTestId('office-stage-review').click();
    await panel.locator('#office-search-query').fill('报销材料试点批准');
    await panel.getByTestId('office-search').click();
    await expect(panel).toContainText('BM25');
    await expect(panel).toContainText('sources/pilot.txt');
    await panel.locator('#office-claims').fill('报销材料自动整理试点已批准。\n报销材料整理耗时已经减少。');
    await panel.getByTestId('office-build-graph').click();
    await expect(panel.getByTestId('office-evidence-graph')).toContainText('support');
    await expect(panel.getByTestId('office-evidence-graph')).toContainText('conflict');
    await panel.getByTestId('office-add-evidence').click();
    const evidence = panel.getByTestId('office-evidence-0');
    await evidence.getByLabel('需证明的结论').fill('所有对外交付必须经过人工确认');
    await evidence.getByLabel('来源路径').fill('sources/pilot.txt');
    await evidence.getByLabel('精确位置').fill('line:1');
    await evidence.getByLabel('证据等级').selectOption('E1');
    await panel.locator('#office-comment-body').fill('请把提效结论限定在真实样本范围内。');
    await panel.locator('#office-suggested-text').fill('基于真实样本记录净节省时间。');
    await panel.getByTestId('office-add-comment').click();
    await expect(panel).toContainText('pending');
    await panel.getByRole('button', { name: '接受建议' }).click();
    await expect(panel).toContainText('accepted');

    await panel.getByTestId('office-stage-approve').click();
    await panel.getByTestId('office-approve-run').click();
    await expect(panel).toContainText('approved');
    await panel.getByTestId('office-publish-run').click();
    await expect(panel).toContainText('published');

    await panel.getByTestId('office-stage-measure').click();
    await panel.locator('#office-baselineMinutes').fill('120');
    await panel.locator('#office-aiMinutes').fill('45');
    await panel.locator('#office-reviewMinutes').fill('20');
    await panel.locator('#office-retryMinutes').fill('5');
    await panel.locator('#office-setupMinutes').fill('10');
    await panel.locator('#office-maintenanceMinutes').fill('2');
    await panel.locator('#office-sample').fill('2');
    await panel.locator('#office-measure-status').selectOption('measured');
    await panel.getByLabel('采纳次数').fill('8');
    await panel.getByLabel('拒绝次数').fill('2');
    await panel.getByTestId('office-record-metric').click();
    await expect(panel.getByTestId('office-efficiency-summary')).toContainText('sufficient');
    await expect(panel.getByTestId('office-efficiency-summary')).toContainText('38');

    await panel.getByTestId('office-save').click();
    await expect(panel.getByRole('status')).toContainText('.openprism/office-track.json');
    await expectNoOverlap(panel.getByTestId('office-save'), page.getByTestId('terminal-toggle'));

    await panel.getByTestId('office-stage-deliver').click();
    await panel.locator('#office-demo').fill('导入来源；检索证据；审阅建议；人工批准；导出交付包。');
    await panel.locator('#office-questions').fill('如何避免无依据数字？');
    await panel.locator('#office-checks').fill('确认来源已脱敏');
    await panel.getByTestId('office-run-audit').click();
    await expect(panel).toContainText('提效成效');
    await expect(panel).toContainText('待补材料，不形成总建议分');
    await panel.getByTestId('office-export-confirm').check();
    await panel.getByTestId('office-export').click();
    await expect(panel).toContainText('submission/M01-proposal.md');
    await expect(panel).toContainText('submission/submission-manifest.json');
    await expectNoOverlap(panel.getByTestId('office-export'), page.getByTestId('terminal-toggle'));

    const restored = await request.get(`/api/projects/${project.id}/office-track/workspace`);
    expect(restored.ok(), await restored.text()).toBeTruthy();
    const restoredBody = await restored.json();
    expect(restoredBody.workspace.inbox).toHaveLength(1);
    expect(restoredBody.workspace.meetings).toHaveLength(1);
    expect(restoredBody.workflow.runs[0].status).toBe('published');
    expect(restoredBody.workflow.efficiency.evidenceStatus).toBe('sufficient');
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});

test('phone viewport can operate the six-stage ledger without horizontal page overflow', async ({ page, request }) => {
  const project = await createProject(request, 'phone');
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/editor/${project.id}`);
    const workspaceViews = page.getByRole('navigation', { name: '工作区视图' });
    await workspaceViews.getByRole('button', { name: 'AI 助手', exact: true }).click();
    await page.getByTestId('right-panel-delivery-tab').click();
    const panel = page.getByTestId('office-delivery-panel');
    await panel.locator('#office-title').fill('移动端办公材料');
    await panel.locator('#office-import-path').fill('sources/pilot.txt');
    await panel.getByTestId('office-import-material').click();
    await expect(panel.getByTestId('office-inbox-item')).toBeVisible();
    await panel.getByTestId('office-stage-review').click();
    await expect(panel.getByText('混合检索')).toBeVisible();
    await panel.getByTestId('office-save').click();
    await expect(panel.getByRole('status')).toContainText('.openprism/office-track.json');
    const viewport = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
    await expectNoOverlap(panel.getByTestId('office-save'), page.getByTestId('terminal-toggle'));
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});
