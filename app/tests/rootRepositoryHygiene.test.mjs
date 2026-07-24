import { describe, expect, it } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd(), '..');

describe('repository root Paper Writer entry contract', () => {
  it('does not expose the retired Google/Coding Kanban entry points', async () => {
    const index = await readFile(path.join(repoRoot, 'index.html'), 'utf8');
    const sourceReadme = await readFile(path.join(repoRoot, 'src/README.md'), 'utf8');
    const playwright = await readFile(path.join(repoRoot, 'playwright.config.ts'), 'utf8');
    expect(index).toContain('Paper Agent');
    expect(index).not.toContain('<title>Google</title>');
    expect(sourceReadme).toContain('app/apps/frontend');
    expect(sourceReadme).not.toContain('Coding Kanban');
    expect(playwright).toContain("./app/playwright.config.ts");
    expect(playwright).not.toContain('pnpm --filter');
  });

  it('keeps the retired zero-byte command artifacts absent', async () => {
    for (const name of ['pnpm', 'tsc', 'tsx', 'server@0.1.0', 'test_output.txt', 'test_results.json', 'pnpm-workspace.yaml']) {
      await expect(stat(path.join(repoRoot, name))).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });
});
