import React, { useMemo, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { resolveProjectAssetUrl } from '../utils/previewAssets';

interface Props {
  content: string;
  onChange: (content: string) => void;
  format: 'markdown' | 'latex';
  projectId?: string | null;
  currentFile?: string;
}

interface RenderOptions {
  projectId?: string | null;
  currentFile?: string;
}

export interface RenderedBlock {
  id: string;
  kind: 'heading' | 'paragraph' | 'list' | 'math' | 'image' | 'source' | 'spacer' | 'hidden';
  start: number;
  end: number;
  level?: number;
  text: string;
  html?: string;
  editable: boolean;
  toSource?: (text: string) => string;
}

interface SourceLine {
  from: number;
  to: number;
  next: number;
  text: string;
}

export function RenderedDocumentEditor({ content, onChange, format, projectId, currentFile = '' }: Props) {
  const options = useMemo(() => ({ projectId, currentFile }), [projectId, currentFile]);
  const blocks = useMemo(() => parseRenderedDocument(content, format, options), [content, format, options]);
  const [fontSize, setFontSize] = useState(15);

  const zoomIn = () => setFontSize(f => Math.min(f + 2, 28));
  const zoomOut = () => setFontSize(f => Math.max(f - 2, 8));
  const zoomReset = () => setFontSize(15);

  const commitBlock = (block: RenderedBlock, element: HTMLElement) => {
    if (!block.editable || !block.toSource) return;
    const editedText = readEditableText(element);
    if (editedText === block.text) return;
    const replacement = block.toSource(editedText);
    onChange(content.slice(0, block.start) + replacement + content.slice(block.end));
  };

  return (
    <div className="rendered-document-editor" data-render-mode="rendered-preview" style={{ ...styles.container, fontSize, position: 'relative' }}>
      {/* Zoom controls - top right */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(4px)',
          padding: '4px 8px',
          borderRadius: '6px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          float: 'right',
          marginBottom: '8px',
        }}
      >
        <button
          onClick={zoomOut}
          title="缩小"
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', color: '#666', padding: '2px 6px', borderRadius: '4px', lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget.style.background = '#ddd')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          A-
        </button>
        <button
          onClick={zoomReset}
          title="重置"
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '11px', color: '#888', padding: '2px 4px', borderRadius: '4px', minWidth: '36px', textAlign: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#ddd')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          {fontSize}px
        </button>
        <button
          onClick={zoomIn}
          title="放大"
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: '#666', padding: '2px 6px', borderRadius: '4px', lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget.style.background = '#ddd')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          A+
        </button>
      </div>
      {blocks.filter((block) => block.kind !== 'hidden').map((block) => (
        <RenderedBlockView key={block.id} block={block} onCommit={commitBlock} />
      ))}
    </div>
  );
}

function RenderedBlockView({ block, onCommit }: { block: RenderedBlock; onCommit: (block: RenderedBlock, element: HTMLElement) => void }) {
  const [dirty, setDirty] = useState(false);
  const commitIfDirty = (element: HTMLElement) => {
    if (!dirty) return;
    setDirty(false);
    onCommit(block, element);
  };

  if (block.kind === 'spacer') {
    return <div data-rendered-block="spacer" style={{ height: 10 }} />;
  }

  if (block.kind === 'heading') {
    const Tag = (`h${Math.min(Math.max(block.level || 2, 1), 6)}` as keyof JSX.IntrinsicElements);
    return (
      <Tag
        data-rendered-block="heading"
        contentEditable={block.editable}
        suppressContentEditableWarning
        onInput={() => setDirty(true)}
        onBlur={(event) => commitIfDirty(event.currentTarget as HTMLElement)}
        style={{ ...styles.heading, ...(block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3) }}
      >
        {block.text}
      </Tag>
    );
  }

  if (block.kind === 'paragraph' || block.kind === 'list') {
    const Tag = block.kind === 'list' ? 'li' : 'p';
    return (
      <Tag
        data-rendered-block={block.kind}
        contentEditable={block.editable}
        suppressContentEditableWarning
        onInput={() => setDirty(true)}
        onBlur={(event) => commitIfDirty(event.currentTarget as HTMLElement)}
        style={block.kind === 'list' ? styles.listItem : styles.paragraph}
        dangerouslySetInnerHTML={{ __html: block.html || escapeHtml(block.text) }}
      />
    );
  }

  if (block.kind === 'source') {
    return (
      <pre
        data-rendered-block="source-fallback"
        contentEditable={block.editable}
        suppressContentEditableWarning
        onInput={() => setDirty(true)}
        onBlur={(event) => commitIfDirty(event.currentTarget as HTMLElement)}
        style={styles.sourceFallback}
      >
        {block.text}
      </pre>
    );
  }

  if (block.kind === 'math') {
    return <div data-rendered-block="math" style={styles.math} dangerouslySetInnerHTML={{ __html: block.html || escapeHtml(block.text) }} />;
  }

  if (block.kind === 'image') {
    return <div data-rendered-block="image" style={styles.figure} dangerouslySetInnerHTML={{ __html: block.html || escapeHtml(block.text) }} />;
  }

  return null;
}

export function parseRenderedDocument(content: string, format: 'markdown' | 'latex', options: RenderOptions = {}): RenderedBlock[] {
  return format === 'latex' ? parseLatexBlocks(content, options) : parseMarkdownBlocks(content, options);
}

function parseMarkdownBlocks(content: string, options: RenderOptions): RenderedBlock[] {
  const lines = splitSourceLines(content);
  const blocks: RenderedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.text.trim();

    if (!trimmed) {
      blocks.push(spacerBlock(line));
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line.text);
    if (heading) {
      const level = heading[1].length;
      blocks.push({
        id: blockId('md-heading', line),
        kind: 'heading',
        start: line.from,
        end: line.to,
        level,
        text: heading[2],
        editable: true,
        toSource: (text) => `${'#'.repeat(level)} ${oneLine(text)}`,
      });
      i += 1;
      continue;
    }

    const image = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(trimmed);
    if (image) {
      blocks.push(imageBlock('md-image', line, image[2], image[1] || image[2], options));
      i += 1;
      continue;
    }

    const displayMathStart = trimmed.startsWith('$$');
    if (displayMathStart) {
      const endIndex = findMarkdownDisplayMathEnd(lines, i);
      const group = joinLineTexts(lines, i, endIndex);
      const math = group.replace(/^\s*\$\$/, '').replace(/\$\$\s*$/, '');
      const html = renderMath(math, true, true);
      blocks.push(html
        ? mathBlock('md-math', lines[i], lines[endIndex], html, math)
        : sourceBlock('md-invalid-math', lines[i], lines[endIndex], group));
      i = endIndex + 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const endIndex = findFenceEnd(lines, i);
      blocks.push(sourceBlock('md-fence', lines[i], lines[endIndex], joinLineTexts(lines, i, endIndex)));
      i = endIndex + 1;
      continue;
    }

    const list = /^(\s*)([-*+]\s+|\d+\.\s+)(.+)$/.exec(line.text);
    if (list) {
      const marker = list[1] + list[2];
      blocks.push({
        id: blockId('md-list', line),
        kind: 'list',
        start: line.from,
        end: line.to,
        text: list[3],
        html: renderMarkdownInline(list[3]),
        editable: true,
        toSource: (text) => marker + oneLine(text),
      });
      i += 1;
      continue;
    }

    const paragraphStart = i;
    while (i + 1 < lines.length && isMarkdownParagraphContinuation(lines[i + 1].text)) i += 1;
    const paragraphEnd = i;
    const text = joinLineTexts(lines, paragraphStart, paragraphEnd);
    blocks.push({
      id: blockId('md-paragraph', lines[paragraphStart]),
      kind: 'paragraph',
      start: lines[paragraphStart].from,
      end: lines[paragraphEnd].to,
      text,
      html: renderMarkdownInline(text).replace(/\n/g, '<br/>'),
      editable: true,
      toSource: (edited) => edited,
    });
    i += 1;
  }

  return blocks;
}

function parseLatexBlocks(content: string, options: RenderOptions): RenderedBlock[] {
  const lines = splitSourceLines(content);
  const blocks: RenderedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.text.trim();

    if (!trimmed) {
      blocks.push(spacerBlock(line));
      i += 1;
      continue;
    }

    if (isHiddenLatexLine(trimmed)) {
      blocks.push({ id: blockId('tex-hidden', line), kind: 'hidden', start: line.from, end: line.to, text: line.text, editable: false });
      i += 1;
      continue;
    }

    const heading = /^\\(title|section|subsection|subsubsection|paragraph)\*?\{([^}]*)\}/.exec(trimmed);
    if (heading) {
      const command = heading[1];
      const level = command === 'title' ? 1 : command === 'section' ? 2 : command === 'subsection' ? 3 : command === 'subsubsection' ? 4 : 5;
      blocks.push({
        id: blockId('tex-heading', line),
        kind: 'heading',
        start: line.from,
        end: line.to,
        level,
        text: heading[2],
        editable: true,
        toSource: (text) => `\\${command}{${escapeLatexText(oneLine(text))}}`,
      });
      i += 1;
      continue;
    }

    const figureStart = /^\\begin\{figure\*?\}/.test(trimmed);
    if (figureStart) {
      const endIndex = findLatexEnvironmentEnd(lines, i, 'figure');
      const figure = joinLineTexts(lines, i, endIndex);
      blocks.push(latexFigureBlock(lines[i], lines[endIndex], figure, options));
      i = endIndex + 1;
      continue;
    }

    const mathEnv = /^\\begin\{(equation|align|gather|multline)\*?\}/.exec(trimmed);
    if (mathEnv) {
      const endIndex = findLatexEnvironmentEnd(lines, i, mathEnv[1]);
      const group = joinLineTexts(lines, i, endIndex);
      const math = group.replace(new RegExp(`^\\\\begin\\{${mathEnv[1]}\\*?\\}`), '').replace(new RegExp(`\\\\end\\{${mathEnv[1]}\\*?\\}$`), '');
      const html = renderMath(math, true, true);
      blocks.push(html
        ? mathBlock('tex-math-env', lines[i], lines[endIndex], html, math)
        : sourceBlock('tex-invalid-math', lines[i], lines[endIndex], group));
      i = endIndex + 1;
      continue;
    }

    if (trimmed.startsWith('\\[')) {
      const endIndex = findLatexDisplayMathEnd(lines, i);
      const group = joinLineTexts(lines, i, endIndex);
      const math = group.replace(/^\s*\\\[/, '').replace(/\\\]\s*$/, '');
      const html = renderMath(math, true, true);
      blocks.push(html
        ? mathBlock('tex-display-math', lines[i], lines[endIndex], html, math)
        : sourceBlock('tex-invalid-display-math', lines[i], lines[endIndex], group));
      i = endIndex + 1;
      continue;
    }

    const includeGraphics = /^\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/.exec(trimmed);
    if (includeGraphics) {
      blocks.push(imageBlock('tex-image', line, includeGraphics[1], includeGraphics[1], options));
      i += 1;
      continue;
    }

    const item = /^(\s*)\\item\s+(.+)$/.exec(line.text);
    if (item) {
      const prefix = `${item[1]}\\item `;
      blocks.push({
        id: blockId('tex-list', line),
        kind: 'list',
        start: line.from,
        end: line.to,
        text: item[2],
        html: renderLatexInline(item[2]),
        editable: true,
        toSource: (text) => prefix + oneLine(escapeLatexText(text)),
      });
      i += 1;
      continue;
    }

    if (/^\\(begin|end)\{(document|abstract|itemize|enumerate)\}/.test(trimmed)) {
      blocks.push({ id: blockId('tex-hidden-env', line), kind: 'hidden', start: line.from, end: line.to, text: line.text, editable: false });
      i += 1;
      continue;
    }

    if (/^\\[a-zA-Z]+/.test(trimmed)) {
      blocks.push(sourceBlock('tex-unsupported', line, line, line.text));
      i += 1;
      continue;
    }

    const paragraphStart = i;
    while (i + 1 < lines.length && isLatexParagraphContinuation(lines[i + 1].text)) i += 1;
    const paragraphEnd = i;
    const text = joinLineTexts(lines, paragraphStart, paragraphEnd);
    blocks.push({
      id: blockId('tex-paragraph', lines[paragraphStart]),
      kind: 'paragraph',
      start: lines[paragraphStart].from,
      end: lines[paragraphEnd].to,
      text,
      html: renderLatexInline(text).replace(/\n/g, '<br/>'),
      editable: true,
      toSource: (edited) => edited,
    });
    i += 1;
  }

  return blocks;
}

function splitSourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let from = 0;
  while (from < source.length) {
    const newline = source.indexOf('\n', from);
    const next = newline === -1 ? source.length : newline + 1;
    const raw = source.slice(from, newline === -1 ? next : newline).replace(/\r$/, '');
    lines.push({ from, to: from + raw.length, next, text: raw });
    from = next;
  }
  if (!source.length) lines.push({ from: 0, to: 0, next: 0, text: '' });
  return lines;
}

function isMarkdownParagraphContinuation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !/^(#{1,6})\s+/.test(text)
    && !/^!\[[^\]]*\]\([^)]+\)\s*$/.test(trimmed)
    && !/^```/.test(trimmed)
    && !/^\$\$/.test(trimmed)
    && !/^(\s*)([-*+]\s+|\d+\.\s+)/.test(text);
}

function isLatexParagraphContinuation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !/^\\(title|section|subsection|subsubsection|paragraph|begin|end|includegraphics|item)\b/.test(trimmed)
    && !/^\\\[/.test(trimmed)
    && !isHiddenLatexLine(trimmed);
}

function isHiddenLatexLine(trimmed: string): boolean {
  return /^%/.test(trimmed)
    || /^\\(documentclass|usepackage|input|bibliography|bibliographystyle|maketitle|newcommand|renewcommand|def|let|setlength|addtolength|setcounter|pagestyle|thispagestyle|author|date)\b/.test(trimmed);
}

function findMarkdownDisplayMathEnd(lines: SourceLine[], start: number): number {
  for (let i = start; i < lines.length; i += 1) {
    const text = lines[i].text.trim();
    if (i === start && text.replace(/^\$\$/, '').includes('$$')) return i;
    if (i > start && text.endsWith('$$')) return i;
  }
  return start;
}

function findLatexDisplayMathEnd(lines: SourceLine[], start: number): number {
  for (let i = start; i < lines.length; i += 1) {
    if ((i === start && lines[i].text.trim().replace(/^\\\[/, '').includes('\\]')) || (i > start && lines[i].text.trim().endsWith('\\]'))) return i;
  }
  return start;
}

function findFenceEnd(lines: SourceLine[], start: number): number {
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^```/.test(lines[i].text.trim())) return i;
  }
  return start;
}

function findLatexEnvironmentEnd(lines: SourceLine[], start: number, env: string): number {
  const endPattern = new RegExp(`^\\\\end\\{${env}\\*?\\}`);
  for (let i = start + 1; i < lines.length; i += 1) {
    if (endPattern.test(lines[i].text.trim())) return i;
  }
  return start;
}

function joinLineTexts(lines: SourceLine[], start: number, end: number): string {
  return lines.slice(start, end + 1).map((line) => line.text).join('\n');
}

function spacerBlock(line: SourceLine): RenderedBlock {
  return { id: blockId('spacer', line), kind: 'spacer', start: line.from, end: line.to, text: '', editable: false };
}

function sourceBlock(prefix: string, first: SourceLine, last: SourceLine, source: string): RenderedBlock {
  return {
    id: blockId(prefix, first),
    kind: 'source',
    start: first.from,
    end: last.to,
    text: source,
    editable: true,
    toSource: (text) => text,
  };
}

function mathBlock(prefix: string, first: SourceLine, last: SourceLine, html: string, sourceText: string): RenderedBlock {
  return { id: blockId(prefix, first), kind: 'math', start: first.from, end: last.to, text: sourceText, html, editable: false };
}

function imageBlock(prefix: string, line: SourceLine, imagePath: string, alt: string, options: RenderOptions): RenderedBlock {
  const src = resolveProjectAssetUrl(options.projectId, options.currentFile || '', imagePath) || imagePath;
  return {
    id: blockId(prefix, line),
    kind: 'image',
    start: line.from,
    end: line.to,
    text: alt,
    html: `<figure style="margin:14px 0;text-align:center"><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" style="max-width:100%;max-height:420px;object-fit:contain;border:1px solid var(--border);border-radius:6px;background:#fff"/>${alt ? `<figcaption style="margin-top:8px;color:var(--text-secondary);font-size:12px">${escapeHtml(alt)}</figcaption>` : ''}</figure>`,
    editable: false,
  };
}

function latexFigureBlock(first: SourceLine, last: SourceLine, figure: string, options: RenderOptions): RenderedBlock {
  const imageMatch = figure.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/);
  const captionMatch = figure.match(/\\caption\{([^}]*)\}/);
  if (!imageMatch) return sourceBlock('tex-figure-source', first, last, figure);
  const imagePath = imageMatch[1].trim();
  const caption = captionMatch?.[1]?.trim() || imagePath;
  const src = resolveProjectAssetUrl(options.projectId, options.currentFile || '', imagePath) || imagePath;
  return {
    id: blockId('tex-figure', first),
    kind: 'image',
    start: first.from,
    end: last.to,
    text: caption,
    html: `<figure style="margin:14px 0;text-align:center"><img src="${escapeAttr(src)}" alt="${escapeAttr(caption)}" style="max-width:100%;max-height:420px;object-fit:contain;border:1px solid var(--border);border-radius:6px;background:#fff"/>${caption ? `<figcaption style="margin-top:8px;color:var(--text-secondary);font-size:12px">${escapeHtml(caption)}</figcaption>` : ''}</figure>`,
    editable: false,
  };
}

function blockId(prefix: string, line: SourceLine): string {
  return `${prefix}-${line.from}-${line.to}`;
}

function renderMarkdownInline(text: string): string {
  return renderMathSegments(text, /(?:\$([^$\n]+?)\$|\\\((.*?)\\\))/g, (plain) => {
    let html = escapeHtml(plain);
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    return html;
  });
}

function renderLatexInline(text: string): string {
  return renderMathSegments(text, /(?:\$([^$\n]+?)\$|\\\((.*?)\\\))/g, (plain) => {
    let html = escapeHtml(plain);
    html = html.replace(/\\textbf\{([^}]*)\}/g, '<strong>$1</strong>');
    html = html.replace(/\\(?:textit|emph)\{([^}]*)\}/g, '<em>$1</em>');
    html = html.replace(/\\texttt\{([^}]*)\}/g, '<code>$1</code>');
    html = html.replace(/\\cite[tp]?\*?\{([^}]*)\}/g, '<span style="color:var(--accent)">[$1]</span>');
    html = html.replace(/\\ref\{([^}]*)\}/g, '<span style="color:var(--accent)">[ref:$1]</span>');
    return html;
  });
}

function renderMathSegments(text: string, regex: RegExp, renderPlain: (plain: string) => string): string {
  let html = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    html += renderPlain(text.slice(last, match.index));
    const math = match[1] ?? match[2] ?? '';
    const rendered = renderMath(math, false, true);
    html += rendered ? `<span contenteditable="false" class="rendered-inline-math">${rendered}</span>` : escapeHtml(match[0]);
    last = match.index + match[0].length;
  }
  html += renderPlain(text.slice(last));
  return html;
}

function renderMath(math: string, displayMode: boolean, strict: boolean): string | null {
  try {
    return katex.renderToString(math.replace(/\\label\{[^}]*\}/g, '').trim(), {
      displayMode,
      throwOnError: strict,
      trust: true,
    });
  } catch {
    return null;
  }
}

function readEditableText(element: HTMLElement): string {
  if (element.tagName === 'PRE') return element.textContent || '';
  return (element.innerText || element.textContent || '').replace(/\u00a0/g, ' ').trimEnd();
}

function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').trim();
}

function escapeLatexText(text: string): string {
  return text.replace(/[{}]/g, '');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    overflow: 'auto',
    padding: '18px 28px 40px',
    background: 'var(--paper)',
    color: 'var(--text)',
    fontFamily: 'serif',
    lineHeight: 1.8,
    fontSize: 15,
    outline: 'none',
  },
  heading: {
    outline: 'none',
    lineHeight: 1.35,
    fontWeight: 700,
    margin: '14px 0 8px',
  },
  h1: {
    fontSize: '2em',
    textAlign: 'center',
    borderBottom: '1px solid var(--border)',
    paddingBottom: 8,
  },
  h2: {
    fontSize: '1.55em',
    borderBottom: '1px solid var(--border)',
    paddingBottom: 4,
  },
  h3: {
    fontSize: '1.25em',
  },
  paragraph: {
    margin: '8px 0',
    outline: 'none',
    minHeight: '1.4em',
    whiteSpace: 'pre-wrap',
  },
  listItem: {
    margin: '4px 0 4px 24px',
    outline: 'none',
    whiteSpace: 'pre-wrap',
  },
  sourceFallback: {
    margin: '10px 0',
    padding: '8px 10px',
    background: 'var(--panel-muted)',
    border: '1px dashed var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    outline: 'none',
  },
  math: {
    margin: '12px 0',
    overflowX: 'auto',
    textAlign: 'center',
  },
  figure: {
    margin: '12px 0',
  },
};
