import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { parseRenderedDocument } from '../apps/frontend/src/app/components/RenderedDocumentEditor.tsx';

describe('rendered editor mode', () => {
  it('routes Split and Rendered modes through the same preview pane and only hides source in Rendered', async () => {
    const center = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/CenterPanel.tsx'), 'utf8');
    expect(center).toContain("useState<'source' | 'split' | 'rendered'>('split')");
    expect(center).toContain("(['source', 'split', 'rendered'] as const)");
    expect(center).toContain("mode === 'rendered' ? 'Rendered' : mode");
    expect(center).toContain("editorViewMode === 'source' || editorViewMode === 'split'");
    expect(center).toContain("editorViewMode === 'split' || editorViewMode === 'rendered'");
    expect(center).toContain('<RenderedPreviewPane');
    expect(center).not.toContain('<RenderedDocumentEditor');
    expect(center).not.toContain('renderMode={editorViewMode ===');
  });

  it('uses MarkdownPreview and LatexPreview as the single rendered preview implementation', async () => {
    const previewPane = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/RenderedPreviewPane.tsx'), 'utf8');
    expect(previewPane).toContain("import('./MarkdownPreview')");
    expect(previewPane).toContain("import('./LatexPreview')");
    expect(previewPane).toContain('<Suspense');
    expect(previewPane).toContain("filename.endsWith('.tex')");
    expect(previewPane).toContain('<LatexPreview');
    expect(previewPane).toContain('<MarkdownPreview');
  });

  it('keeps Source mode as plain CodeMirror without live preview decorations', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/MarkdownEditor.tsx'), 'utf8');
    expect(source).toContain('EditorState.create');
    expect(source).toContain('lineNumbers()');
    expect(source).not.toContain('ViewPlugin.fromClass');
    expect(source).not.toContain('Decoration.replace');
    expect(source).not.toContain('cm-live-preview');
  });

  it('parses markdown into editable rendered preview blocks instead of visible source markers', () => {
    const blocks = parseRenderedDocument('# Introduction\n\nA **bold** claim with $E=mc^2$.', 'markdown');
    const heading = blocks.find((block) => block.kind === 'heading');
    const paragraph = blocks.find((block) => block.kind === 'paragraph');

    expect(heading?.text).toBe('Introduction');
    expect(heading?.toSource?.('Related Work')).toBe('# Related Work');
    expect(paragraph?.html).toContain('<strong>bold</strong>');
    expect(paragraph?.html).toContain('katex');
    expect(paragraph?.html).not.toContain('**bold**');
  });

  it('renders LaTeX headings as editable preview text and leaves invalid math as editable source fallback', () => {
    const blocks = parseRenderedDocument('\\section{Method}\n\\[\\notARealCommand{\\]\n', 'latex');
    const heading = blocks.find((block) => block.kind === 'heading');
    const fallback = blocks.find((block) => block.kind === 'source');

    expect(heading?.text).toBe('Method');
    expect(heading?.toSource?.('Experiments')).toBe('\\section{Experiments}');
    expect(fallback?.editable).toBe(true);
    expect(fallback?.text).toContain('notARealCommand');
  });
});
