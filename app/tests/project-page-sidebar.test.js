import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectPagePath = join(__dirname, '../apps/frontend/src/app/ProjectPage.tsx');

async function readProjectPage() {
  return readFile(projectPagePath, 'utf8');
}

describe('ProjectPage sidebar navigation', () => {
  test('exposes explicit all, active, archived, and deleted project views', async () => {
    const source = await readProjectPage();
    const navItems = source.match(/const navItems:[\s\S]*?\n  \];/)?.[0] || '';

    expect(source).toContain("type ViewFilter = 'all' | 'active' | 'archived' | 'trash'");
    expect(source).toContain("useState<ViewFilter>('all')");
    expect(navItems).toContain("key: 'all'");
    expect(navItems).toContain("t('全部项目')");
    expect(navItems).toContain("key: 'active'");
    expect(navItems).toContain("t('未归档')");
    expect(navItems).toContain("key: 'archived'");
    expect(navItems).toContain("t('已归档')");
    expect(navItems).toContain("key: 'trash'");
    expect(navItems).toContain("t('已删除')");
  });
});
