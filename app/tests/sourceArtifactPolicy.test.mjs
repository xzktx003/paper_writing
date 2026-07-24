import { readdir, readFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

describe('source artifact policy', () => {
  it('keeps editor backup files out of source directories and ignore rules', async () => {
    const sourceRoot = new URL('../apps/frontend/src/', import.meta.url);
    const entries = await readdir(sourceRoot, { recursive: true });
    const forbidden = entries
      .map(String)
      .filter(path => /(?:\.bak|\.orig|~)$/i.test(path));
    const gitignore = await readFile(new URL('../../.gitignore', import.meta.url), 'utf8');

    expect(forbidden).toEqual([]);
    expect(gitignore).toMatch(/^\*\.bak$/m);
    expect(gitignore).toMatch(/^\*\.orig$/m);
    expect(gitignore).toMatch(/^\*~$/m);
    expect(gitignore).toMatch(/^test-results\/$/m);
    expect(gitignore).toMatch(/^playwright-report\/$/m);
  });
});
