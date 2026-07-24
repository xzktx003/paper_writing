import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderLatex } from '../apps/frontend/src/app/components/LatexPreview.tsx';

describe('LaTeX quick preview degradation contract', () => {
  it('labels unresolved references, citations, commands, and assets as structured approximations', () => {
    const html = renderLatex(String.raw`
      See \cite{smith2024} and Figure \ref{fig:missing}.
      \projectmacro{important result}
      \includegraphics{figures/missing-image.png}
    `, { projectId: 'demo', currentFile: 'chapters/intro.tex' });

    expect(html).toContain('data-preview-kind="citation"');
    expect(html).toContain('smith2024');
    expect(html).toContain('data-preview-kind="reference"');
    expect(html).toContain('fig:missing');
    expect(html).toContain('data-preview-kind="command"');
    expect(html).toContain('projectmacro');
    expect(html).toContain('data-preview-kind="asset"');
    expect(html).toContain('missing-image.png');
  });

  it('does not report standard KaTeX math commands as unsupported preview commands', () => {
    const html = renderLatex(String.raw`$\alpha + \frac{1}{2} \leq \infty$`);
    expect(html).not.toContain('unresolved command: \\alpha');
    expect(html).not.toContain('unresolved command: \\frac');
    expect(html).not.toContain('unresolved command: \\leq');
  });

  it('recovers failed image loads with an inline fallback instead of an unhandled broken image', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/LatexPreview.tsx'), 'utf8');
    expect(source).toContain("addEventListener('error'");
    expect(source).toContain('latex-preview-asset-fallback');
    expect(source).toContain('data-preview-asset');
  });

  it('distinguishes the approximate HTML preview from final compiled PDF output', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/CenterPanel.tsx'), 'utf8');
    expect(source).toContain('Quick approximate preview');
    expect(source).toContain('not the final typeset result');
    expect(source).toContain('Compile final PDF');
    expect(source).toContain("previewTab === 'pdf'");
  });
});
