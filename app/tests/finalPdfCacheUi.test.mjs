import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('Final PDF cached-preview contract', () => {
  it('loads the latest compiled PDF without compiling when the Final PDF tab is opened', async () => {
    const source = await readFile(new URL('../apps/frontend/src/app/components/CenterPanel.tsx', import.meta.url), 'utf8');
    const client = await readFile(new URL('../apps/frontend/src/api/client.ts', import.meta.url), 'utf8');

    expect(source).toContain('getLatestCompiledPdf');
    expect(source).toContain('loadLatestCompiledPdf');
    expect(source).toContain("if (tab === 'pdf') void loadLatestCompiledPdf()");
    expect(source).not.toContain("if (tab === 'pdf' && !compiledPdfUrl && !compilingAll) handleCompileAll()");
    expect(client).toContain("method: 'GET'");
    expect(client).toContain('/api/compile/latest?');
  });

  it('only recompiles from an explicit compile action', async () => {
    const source = await readFile(new URL('../apps/frontend/src/app/components/CenterPanel.tsx', import.meta.url), 'utf8');

    expect(source).not.toContain('handleContentChangeWithAutoCompile');
    expect(source).toContain("compileAllResult?.ok ? t('Recompile') : t('Compile')");
    expect(source).toContain("t('Recompile final PDF')");
  });

  it('never replaces the LaTeX quick preview with a previously compiled PDF', async () => {
    const source = await readFile(new URL('../apps/frontend/src/app/components/CenterPanel.tsx', import.meta.url), 'utf8');

    expect(source).toContain("previewTab === 'pdf' && compiledPdfUrl");
    expect(source).not.toContain("(previewTab === 'pdf' || previewTab === 'preview') && compiledPdfUrl");
    expect(source).toContain("previewTab === 'preview'");
    expect(source).toContain('<RenderedPreviewPane');
  });
});
