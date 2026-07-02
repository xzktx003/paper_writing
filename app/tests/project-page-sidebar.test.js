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
  test('does not expose the redundant all-projects menu item', async () => {
    const source = await readProjectPage();
    const navItems = source.match(/const navItems:[\s\S]*?\n  \];/)?.[0] || '';

    expect(source).toContain("type ViewFilter = 'mine' | 'archived' | 'trash'");
    expect(source).toContain("useState<ViewFilter>('mine')");
    expect(navItems).not.toContain("key: 'all'");
    expect(navItems).not.toContain("t('所有项目')");
    expect(navItems).toContain("key: 'mine'");
    expect(navItems).toContain("key: 'archived'");
    expect(navItems).toContain("key: 'trash'");
  });
});
