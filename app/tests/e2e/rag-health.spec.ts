import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { type APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';

async function createProject(request: APIRequestContext) {
  const response = await request.post('/api/projects', {
    data: { name: `RAG health E2E ${Date.now()}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ id: string; directoryName: string }>;
}

test('RAG corpus exposes local retrieval health and rebuild provenance', async ({ page, request }) => {
  const project = await createProject(request);
  try {
    const addResponse = await request.post(`/api/projects/${project.id}/rag/documents`, {
      data: {
        filename: 'health-evidence.md',
        content: 'RAG health evidence explains local keyword retrieval and inspectable citation chunks.',
      },
    });
    expect(addResponse.ok(), await addResponse.text()).toBeTruthy();

    const firstHealthResponse = await request.get(`/api/projects/${project.id}/rag/health`);
    expect(firstHealthResponse.ok(), await firstHealthResponse.text()).toBeTruthy();
    const firstHealth = await firstHealthResponse.json() as { generation: string; fingerprint: string };

    await page.goto(`/editor/${project.id}`);
    await page.getByRole('button', { name: /RAG/ }).click();
    const healthCard = page.getByTestId('rag-health-card');
    await expect(healthCard).toBeVisible();
    await expect(page.getByTestId('rag-health-status')).toHaveText('健康');
    await expect(healthCard).toContainText('本地关键词证据检索');
    await expect(healthCard).toContainText('不是语义向量检索');
    await expect(page.getByTestId('rag-health-counts')).toContainText('文件: 1');
    await expect(page.getByTestId('rag-health-counts')).toContainText('分块: 1');

    await page.getByTestId('rag-file-diagnostics').click();
    await expect(page.getByTestId('rag-file-diagnostics')).toContainText('research_corpus/health-evidence.md');
    await expect(page.getByTestId('rag-file-diagnostics')).toContainText('utf8-text');

    await page.getByTestId('rag-rebuild-index').click();
    await expect(page.getByText(/RAG 索引已修复，新代次/)).toBeVisible();

    const secondHealthResponse = await request.get(`/api/projects/${project.id}/rag/health`);
    const secondHealth = await secondHealthResponse.json() as { generation: string; fingerprint: string };
    expect(secondHealth.generation).not.toBe(firstHealth.generation);
    expect(secondHealth.fingerprint).toBe(firstHealth.fingerprint);
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});

test('RAG health shows a corrupt index without mutating it until explicit repair', async ({ page, request }) => {
  const project = await createProject(request);
  const dataRoot = process.env.OPENPRISM_DATA_DIR;
  expect(dataRoot).toBeTruthy();
  const indexDir = join(dataRoot!, project.directoryName, '.openprism');
  const indexPath = join(indexDir, 'paper-rag-index.json');
  try {
    await mkdir(indexDir, { recursive: true });
    await writeFile(indexPath, '{broken');

    await page.goto(`/editor/${project.id}`);
    await page.getByRole('button', { name: /RAG/ }).click();
    await expect(page.getByTestId('rag-health-status')).toHaveText('损坏');
    await expect(page.getByTestId('rag-health-card')).toContainText('RAG 索引已损坏');
    expect(await readFile(indexPath, 'utf8')).toBe('{broken');
    expect(await readdir(indexDir)).toEqual(['paper-rag-index.json']);

    await page.getByTestId('rag-rebuild-index').click();
    await expect(page.getByTestId('rag-health-status')).toHaveText('降级');
    await expect(page.getByTestId('rag-health-card')).toContainText('当前没有已索引的资料');
    await expect(page.getByTestId('rag-health-card')).not.toContainText('RAG 索引已损坏');
    expect(JSON.parse(await readFile(indexPath, 'utf8'))).toMatchObject({
      generation: expect.any(String),
      fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});

test('external RAG search distinguishes a failed source from a successful source with no ambiguity', async ({ page, request }) => {
  const project = await createProject(request);
  try {
    await page.route('**/api/projects/*/rag/external-search?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [{
            title: 'Inspectable source result',
            authors: ['A. Researcher'],
            year: 2026,
            source: 'semantic-scholar',
            citation_count: 12,
            native_score: 12,
            native_score_basis: 'citation-count',
            normalized_score: 1,
            relevance_score: 1,
            score_basis: 'source-query-rank',
          }],
          sources: [
            { id: 'semantic-scholar', status: 'ok', latencyMs: 34, count: 1, error: '' },
            { id: 'arxiv', status: 'error', latencyMs: 10001, count: 0, error: 'HTTP_503' },
          ],
        }),
      });
    });

    await page.goto(`/editor/${project.id}`);
    await page.getByRole('button', { name: /RAG/ }).click();
    await page.getByRole('button', { name: /外部|External/ }).click();
    const externalQuery = page.getByPlaceholder(/标题、作者或主题|title, author, or topic/i);
    await externalQuery.fill('inspectable retrieval');
    await externalQuery.locator('xpath=..').locator('button').click();

    await expect(page.getByTestId('external-source-semantic-scholar')).toContainText(/来源可用|Source available/);
    await expect(page.getByTestId('external-source-arxiv')).toContainText(/来源失败|Source failed/);
    await expect(page.getByTestId('external-source-arxiv')).toContainText('HTTP_503');
    await expect(page.getByText('Inspectable source result')).toBeVisible();
    await expect(page.getByText(/归一化来源内排名|Normalized source rank/)).toBeVisible();
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});
