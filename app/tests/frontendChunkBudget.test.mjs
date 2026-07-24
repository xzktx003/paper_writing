import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('frontend lazy chunk budget', () => {
  it('lazy-loads Markdown and LaTeX preview engines independently', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/RenderedPreviewPane.tsx'), 'utf8');
    expect(source).not.toMatch(/^import .*MarkdownPreview.*from/m);
    expect(source).not.toMatch(/^import .*LatexPreview.*from/m);
    expect(source).toContain("import('./MarkdownPreview')");
    expect(source).toContain("import('./LatexPreview')");
    expect(source).toContain('<Suspense');
  });

  it('enforces a 500 KiB budget for every emitted JavaScript chunk', async () => {
    const config = await readFile(join(process.cwd(), 'apps/frontend/vite.config.ts'), 'utf8');
    expect(config).toContain('JAVASCRIPT_CHUNK_BUDGET_BYTES = 500 * 1024');
    expect(config).toContain("name: 'javascript-chunk-budget'");
    expect(config).toContain('item.type !== \'chunk\'');
    expect(config).toContain('codeSplitting');
    expect(config).toContain('codemirror-view-state');
    expect(config).toContain('codemirror-language');
    expect(config).toContain('codemirror-features');
    expect(config).not.toContain("name: 'codemirror-core'");
  });
});
