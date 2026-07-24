import { readFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

describe('offline font contract', () => {
  it('keeps the core UI independent from remote font stylesheets', async () => {
    const css = await readFile(new URL('../apps/frontend/src/app/App.css', import.meta.url), 'utf8');
    const entry = await readFile(new URL('../apps/frontend/src/main.tsx', import.meta.url), 'utf8');
    const html = await readFile(new URL('../apps/frontend/index.html', import.meta.url), 'utf8');
    const latexPreview = await readFile(new URL('../apps/frontend/src/app/components/LatexPreview.tsx', import.meta.url), 'utf8');
    const surface = `${css}\n${html}\n${latexPreview}`;

    expect(surface).not.toMatch(/fonts\.googleapis\.com/i);
    expect(surface).not.toMatch(/fonts\.gstatic\.com/i);
    expect(surface).not.toMatch(/cdn\.jsdelivr\.net/i);
    expect(surface).not.toMatch(/@import\s+url\(\s*['"]?https?:\/\//i);
    expect(entry).toContain("@fontsource/noto-sans-sc/chinese-simplified-400.css");
    expect(entry).toContain("@fontsource/noto-sans-sc/chinese-simplified-600.css");
    expect(css).toMatch(/font-family:\s*"Noto Sans SC"/);
    expect(css).toContain('Noto Sans CJK SC');
    expect(css).toContain('PingFang SC');
    expect(css).toContain('Microsoft YaHei');
    expect(css).toContain('Noto Serif CJK SC');
    expect(css).toContain('SF Mono');
  });
});
