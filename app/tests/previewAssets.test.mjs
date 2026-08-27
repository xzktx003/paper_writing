import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveProjectAssetUrl, resolveProjectPath, isImagePath, isPreviewableTextPath } from '../apps/frontend/src/app/utils/previewAssets.ts';
import { renderLatex } from '../apps/frontend/src/app/components/LatexPreview.tsx';
import {
  buildProjectTree,
  canCopyTreeItem,
  canMoveTreeItem,
  copyTreeItem,
  getFileSelectType,
  getUniquePastePath,
  moveTreeItem,
  removeTreeItem
} from '../apps/frontend/src/app/utils/projectTree.ts';

describe('preview asset resolution', () => {
  it('recognizes common paper, code, data, shell, and extensionless text files for live disk synchronization', () => {
    for (const filePath of [
      'main.tex', 'notes.md', 'references.bib', 'scripts/check.py', 'scripts/run.mjs',
      'src/view.jsx', 'data/results.tsv', 'notebooks/analysis.ipynb', 'styles/paper.scss',
      'scripts/deploy.zsh', 'Dockerfile', 'Makefile', 'README',
    ]) {
      expect(isPreviewableTextPath(filePath), filePath).toBe(true);
    }
    for (const filePath of ['fig/model.png', 'paper.pdf', 'archive.zip']) {
      expect(isPreviewableTextPath(filePath), filePath).toBe(false);
    }
  });

  it('resolves root fig paths through the project blob endpoint', () => {
    const url = resolveProjectAssetUrl('project-1', 'sec/intro.tex', 'fig/diagram.png');
    expect(url).toBe('/api/projects/project-1/blob?path=fig%2Fdiagram.png');
  });

  it('resolves existing TORQ img paths as project-root image paths', () => {
    const url = resolveProjectAssetUrl('project-1', 'sec/5.method.tex', 'img/fig-fram.png');
    expect(url).toBe('/api/projects/project-1/blob?path=img%2Ffig-fram.png');
    expect(resolveProjectPath('sec/5.method.tex', 'img/fig-fram')).toBe('img/fig-fram');
  });

  it('resolves relative markdown image paths from the current document folder', () => {
    expect(resolveProjectPath('docs/notes/draft.md', '../fig/sketch.webp')).toBe('docs/fig/sketch.webp');
    expect(resolveProjectPath('docs/notes/draft.md', './local.png')).toBe('docs/notes/local.png');
  });

  it('detects supported image paths', () => {
    expect(isImagePath('fig/chart.svg')).toBe(true);
    expect(isImagePath('docs/outline.md')).toBe(false);
  });

  it('renders LaTeX includegraphics as project image tags', () => {
    const html = renderLatex(String.raw`
\\begin{figure}
\\centering
\\includegraphics[width=0.8\\linewidth]{fig/result}
\\caption{Result plot}
\\end{figure}
`, { projectId: 'project-1', currentFile: 'sec/results.tex' });

    expect(html).toContain('/api/projects/project-1/blob?path=fig%2Fresult');
    expect(html).toContain('Result plot');
    expect(html).toContain('<img');
  });

  it('renders LaTeX includegraphics from the TORQ img folder', () => {
    const html = renderLatex(String.raw`
\\begin{figure}
\\includegraphics[width=0.95\\textwidth]{img/fig-fram.png}
\\caption{Framework}
\\end{figure}
`, { projectId: 'project-1', currentFile: 'sec/5.method.tex' });

    expect(html).toContain('/api/projects/project-1/blob?path=img%2Ffig-fram.png');
    expect(html).not.toContain('sec%2Fimg');
  });

  it('renders LaTeX table backgrounds as white even under dark themes', () => {
    const html = renderLatex(String.raw`
\begin{table}
\caption{Review summary}
\begin{tabular}{ll}
\\toprule
Aspect & Score \\
\midrule
Clarity & Good \\
\bottomrule
\end{tabular}
\end{table}
`);

    expect(html).toContain('class="latex-tabular"');
    expect(html).toContain('Review summary');
    const css = readFileSync(new URL('../apps/frontend/src/app/App.css', import.meta.url), 'utf8');
    expect(css).toContain('table:not(.latex-tabular)');
    expect(css).toContain('.latex-preview-page td');
    expect(css).toContain('background: #ffffff');
  });

  it('renders common official LaTeX preview constructs', () => {
    const html = renderLatex(String.raw`
\newcommand{\tool}{Paper Agent}
\section{Intro}
See \href{https://example.com}{docs} and \url{https://example.org}.
\begin{longtable}{lc}
\caption{Long results}\\
Name & Value \\
\hline
\\tool & $x^2$ \\
\end{longtable}
\begin{align}
a &= b + c \\
d &= e
\end{align}
`);

    expect(html).toContain('Paper Agent');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('Long results');
    expect(html).toContain('class="katex-display"');
  });

  it('builds a complete nested project file tree', () => {
    const tree = buildProjectTree([
      { path: 'algorithm.sty', type: 'file' },
      { path: 'appendix', type: 'dir' },
      { path: 'appendix/A.1.tex', type: 'file' },
      { path: 'tab', type: 'dir' },
      { path: 'tab/tab_main_results.tex', type: 'file' },
      { path: 'img/fig-fram.png', type: 'file' },
      { path: 'example_paper.pdf', type: 'file' },
    ]);

    expect(tree.map((node) => node.path)).toEqual([
      'appendix',
      'img',
      'tab',
      'algorithm.sty',
      'example_paper.pdf',
    ]);
    expect(tree.find((node) => node.path === 'appendix')?.children[0].path).toBe('appendix/A.1.tex');
    expect(tree.find((node) => node.path === 'tab')?.children[0].path).toBe('tab/tab_main_results.tex');
  });

  it('selects text files as editable preview files', () => {
    expect(getFileSelectType('appendix/A.1.tex')).toBe('chapter');
    expect(getFileSelectType('algorithm.sty')).toBe('chapter');
    expect(getFileSelectType('img/fig-fram.png')).toBe('other');
  });

  it('updates project tree paths for delete, move, and copy operations', () => {
    const items = [
      { path: 'docs', type: 'dir' },
      { path: 'docs/draft.md', type: 'file' },
      { path: 'fig', type: 'dir' },
      { path: 'fig/draft.md', type: 'file' },
    ];

    expect(removeTreeItem(items, 'docs').map((item) => item.path)).toEqual([
      'fig',
      'fig/draft.md',
    ]);

    expect(moveTreeItem(items, 'docs/draft.md', 'fig/draft copy.md').map((item) => item.path)).toContain('fig/draft copy.md');
    expect(copyTreeItem(items, 'docs', 'fig/docs copy').map((item) => item.path)).toEqual([
      'docs',
      'docs/draft.md',
      'fig',
      'fig/docs copy',
      'fig/docs copy/draft.md',
      'fig/draft.md',
    ]);
  });

  it('guards invalid folder drops and creates unique paste paths', () => {
    const items = [
      { path: 'docs', type: 'dir' },
      { path: 'docs/draft.md', type: 'file' },
      { path: 'fig', type: 'dir' },
      { path: 'fig/draft.md', type: 'file' },
      { path: 'fig/draft copy.md', type: 'file' },
    ];

    expect(canMoveTreeItem({ path: 'docs', type: 'dir' }, 'docs')).toBe(false);
    expect(canMoveTreeItem({ path: 'docs', type: 'dir' }, 'docs/nested')).toBe(false);
    expect(canMoveTreeItem({ path: 'docs/draft.md', type: 'file' }, 'docs')).toBe(false);
    expect(canMoveTreeItem({ path: 'docs/draft.md', type: 'file' }, 'fig')).toBe(true);
    expect(canCopyTreeItem({ path: 'docs', type: 'dir' }, 'docs/nested')).toBe(false);
    expect(canCopyTreeItem({ path: 'docs/draft.md', type: 'file' }, 'docs')).toBe(true);
    expect(getUniquePastePath(items, 'fig', 'docs/draft.md')).toBe('fig/draft copy 2.md');
  });
});
