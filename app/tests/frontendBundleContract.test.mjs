import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const component = (name) => readFile(join(process.cwd(), `apps/frontend/src/app/components/${name}`), 'utf8');

describe('editor route loading contract', () => {
  it('loads heavyweight assistant panels only when their tab is selected', async () => {
    const source = await component('RightPanel.tsx');
    for (const panel of [
      'DrawPanel',
      'PaperRagPanel',
      'PipelinePanelV2',
      'ReviewReportPanel',
      'CitationVerificationPanel',
    ]) {
      expect(source).not.toMatch(new RegExp(`^import .*${panel}.*from`, 'm'));
      expect(source).toContain(`import('./${panel}')`);
    }
    expect(source).toContain('<Suspense');
  });

  it('loads xterm only when the terminal is opened', async () => {
    const source = await component('Layout.tsx');
    expect(source).not.toMatch(/^import .*TerminalPanel.*from/m);
    expect(source).toContain("import('./TerminalPanel')");
    expect(source).toContain('<Suspense');
  });

  it('does not bundle the entire CodeMirror language catalog into the editor entry', async () => {
    const source = await component('MarkdownEditor.tsx');
    expect(source).not.toContain("from '@codemirror/language-data'");
    expect(source).not.toContain('codeLanguages: languages');
  });

  it('splits editor and preview engines from the route entry and enforces a build budget', async () => {
    const center = await component('CenterPanel.tsx');
    expect(center).toContain("import('./MarkdownEditor')");
    expect(center).toContain("import('./RenderedPreviewPane')");
    expect(center).toContain("import('./DrawioEditor')");

    const config = await readFile(join(process.cwd(), 'apps/frontend/vite.config.ts'), 'utf8');
    expect(config).toContain('EDITOR_ENTRY_BUDGET_BYTES = 500 * 1024');
    expect(config).toContain("name: 'editor-entry-budget'");
    expect(config).toContain('facadeModuleId');
  });
});
