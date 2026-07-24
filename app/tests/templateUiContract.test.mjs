import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';

describe('new project template UX contract', () => {
  it('keeps blank project as an explicit default instead of selecting manifest[0]', async () => {
    const source = await readFile(new URL('../apps/frontend/src/app/ProjectPage.tsx', import.meta.url), 'utf8');

    expect(source).not.toContain('setCreateTemplate(res.templates[0].id)');
    expect(source).toContain("value: ''");
    expect(source).toContain("label: t('空白项目')");
  });
});
