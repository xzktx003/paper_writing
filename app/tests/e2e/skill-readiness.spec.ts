import { type APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';

const degradedSkill = {
  name: 'academic-research-writing',
  display_name: '审计降级 Skill',
  display_name_zh: '审计降级 Skill',
  description: 'A legacy Skill with unverified execution metadata.',
  description_zh: '缺少显式执行元数据的旧 Skill。',
  type: 'research',
  categories: ['paper-writing'],
  subcategory: 'full-paper',
  subcategory_zh: '整篇论文',
  source: 'builtin',
  kind: 'yaml',
  execution: {
    requirements: {
      commands: [], credentials: [], network: [], files: [],
      providerCapabilities: [{ capability: 'invoke', required: true }],
    },
    sideEffects: [],
    costClass: 'medium',
    metadataSource: 'inferred',
    readiness: 'degraded',
    checks: [
      { kind: 'execution-metadata', name: 'requirements', required: true, status: 'unverified' },
      { kind: 'provider-capability', name: 'invoke', required: true, status: 'available' },
    ],
    dryRun: { status: 'not-run', checkedAt: '', checks: [] },
    lastRun: { status: 'never', kind: 'execution', checkedAt: '' },
  },
};

const unavailableSkill = {
  ...degradedSkill,
  name: 'writing-polish',
  display_name: '审计不可用 Skill',
  display_name_zh: '审计不可用 Skill',
  description_zh: '缺少必需命令，不能激活。',
  execution: {
    ...degradedSkill.execution,
    metadataSource: 'manifest',
    readiness: 'unavailable',
    requirements: {
      ...degradedSkill.execution.requirements,
      commands: [{ name: 'definitely-missing-audit-command', required: true }],
    },
    checks: [{ kind: 'command', name: 'definitely-missing-audit-command', required: true, status: 'missing' }],
  },
};

async function createProject(request: APIRequestContext) {
  const response = await request.post('/api/projects', {
    data: { name: `Skill readiness E2E ${Date.now()}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ id: string }>;
}

test('Skill management exposes conservative readiness, read-only checks, and blocks unavailable selection', async ({ page, request }) => {
  const project = await createProject(request);
  const unexpectedExecutionRequests: string[] = [];

  await page.route('**/api/skills**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === '/api/skills' && method === 'GET') {
      const response = await route.fetch();
      const catalog = await response.json() as Array<Record<string, unknown>>;
      const body = catalog.map(skill => {
        if (skill.name === degradedSkill.name) return { ...skill, ...degradedSkill };
        if (skill.name === unavailableSkill.name) return { ...skill, ...unavailableSkill };
        return skill;
      });
      await route.fulfill({ response, contentType: 'application/json', body: JSON.stringify(body) });
      return;
    }
    if (url.pathname === `/api/skills/${degradedSkill.name}` && method === 'GET') {
      const response = await route.fetch();
      const actual = await response.json();
      await route.fulfill({ response, contentType: 'application/json', body: JSON.stringify({ ...actual, ...degradedSkill, prompt: 'Read-only audit prompt.' }) });
      return;
    }
    if (url.pathname === `/api/skills/${degradedSkill.name}/dry-run` && method === 'POST') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          skill: {
            ...degradedSkill,
            execution: {
              ...degradedSkill.execution,
              dryRun: {
                status: 'degraded',
                checkedAt: '2026-07-22T05:30:00.000Z',
                checks: degradedSkill.execution.checks,
              },
            },
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  page.on('request', (outgoing) => {
    const url = new URL(outgoing.url());
    if (/\/api\/(?:ai|agent-providers\/[^/]+\/invoke|pipeline)/.test(url.pathname)) {
      unexpectedExecutionRequests.push(`${outgoing.method()} ${url.pathname}`);
    }
  });

  try {
    await page.goto(`/editor/${project.id}`);
    await page.getByRole('button', { name: /管理 Skills/ }).click();
    await expect(page.getByRole('heading', { name: /管理 Skills/ })).toBeVisible();
    await page.getByRole('button', { name: '中文', exact: true }).last().click();

    const search = page.getByPlaceholder(/搜索 Skills|Search Skills/);
    await search.fill(unavailableSkill.name);
    await page.getByText('全部展开/折叠', { exact: true }).click();
    const unavailableRow = page.getByTestId(`skill-row-${unavailableSkill.name}`).first();
    await expect(unavailableRow).toBeVisible();
    await expect(page.getByTestId(`skill-readiness-${unavailableSkill.name}`).first()).toHaveText('不可用');
    const unavailableToggle = page.getByTestId(`skill-toggle-${unavailableSkill.name}`).first();
    await expect(unavailableToggle).toHaveAttribute('aria-disabled', 'true');
    await unavailableToggle.click();
    await expect(unavailableToggle).toHaveText('');

    await search.fill(degradedSkill.name);
    const degradedRow = page.getByTestId(`skill-row-${degradedSkill.name}`).first();
    await expect(degradedRow).toBeVisible();
    await expect(page.getByTestId(`skill-readiness-${degradedSkill.name}`).first()).toHaveText('需检查');
    await degradedRow.getByTitle('详情').click();
    await expect(page.getByText('执行就绪度', { exact: true })).toBeVisible();
    await expect(page.getByText('execution-metadata: requirements — unverified', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '就绪检查', exact: true }).click();
    await expect(page.getByText(/2026-07-22T05:30:00.000Z/)).toBeVisible();
    expect(unexpectedExecutionRequests).toEqual([]);
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});
