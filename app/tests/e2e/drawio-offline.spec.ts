import { expect, test } from './fixtures';

test('Draw.io network failure becomes an actionable offline XML fallback', async ({ page, request }) => {
  const createResponse = await request.post('/api/projects', { data: { name: `Drawio-Offline-E2E-${Date.now()}` } });
  expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
  const project = await createResponse.json() as { id: string };
  const xml = '<?xml version="1.0"?><mxfile><diagram id="d1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';
  try {
    const fileResponse = await request.put(`/api/projects/${project.id}/file`, {
      data: { path: 'diagram.drawio', content: xml },
    });
    expect(fileResponse.ok(), await fileResponse.text()).toBeTruthy();
    await page.route(/embed\.diagrams\.net/, route => route.abort('internetdisconnected'));

    await page.goto(`/editor/${project.id}`);
    await page.getByTitle('刷新文件列表').click();
    await page.getByText('diagram.drawio', { exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/Draw\.io/i, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Retry Draw.io' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit XML source' }).click();
    const source = page.getByLabel('Draw.io XML source');
    await expect(source).toHaveValue(xml);
    await source.fill(`${xml}\n<!-- offline edit -->`);
    await expect(page.getByRole('button', { name: 'Download XML' })).toBeVisible();
  } finally {
    await request.delete(`/api/projects/${project.id}/permanent`);
  }
});
