import React, { useMemo, useRef, useEffect, forwardRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { resolveProjectAssetUrl } from '../utils/previewAssets';

interface Props {
  content: string;
  projectId?: string | null;
  currentFile?: string;
  onScroll?: (ratio: number) => void;
  scrollRatio?: number;
}

interface RenderOptions {
  projectId?: string | null;
  currentFile?: string;
}

export const LatexPreview = forwardRef<HTMLDivElement, Props>(
  ({ content, projectId, currentFile = '', onScroll, scrollRatio }, ref) => {
    const innerRef = useRef<HTMLDivElement>(null);
    const scrollingRef = useRef(false);
    const containerRef = (ref as React.RefObject<HTMLDivElement>) || innerRef;
    const [fontSize, setFontSize] = useState(14);

    const rendered = useMemo(() => renderLatex(content, { projectId, currentFile }), [content, projectId, currentFile]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el || scrollRatio === undefined) return;
      scrollingRef.current = true;
      const maxScroll = el.scrollHeight - el.clientHeight;
      el.scrollTop = scrollRatio * maxScroll;
      requestAnimationFrame(() => { scrollingRef.current = false; });
    }, [scrollRatio]);

    const handleScroll = () => {
      if (scrollingRef.current || !onScroll) return;
      const el = containerRef.current;
      if (!el) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) return;
      onScroll(el.scrollTop / maxScroll);
    };

    const zoomIn = () => setFontSize(f => Math.min(f + 2, 28));
    const zoomOut = () => setFontSize(f => Math.max(f - 2, 8));
    const zoomReset = () => setFontSize(14);

    return (
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="latex-preview-container"
        style={{
          overflow: 'auto',
          height: '100%',
          background: '#f5f5f0',
          position: 'relative',
        }}
      >
        {/* Zoom controls - top right */}
        <div
          style={{
            position: 'sticky',
            top: 8,
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
            marginRight: '12px',
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

        <div
          className="latex-preview-page"
          style={{
            width: '100%',
            maxWidth: '680px',
            margin: '0 auto',
            background: '#fff',
            boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
            borderRadius: '2px',
            padding: '48px 56px',
            minHeight: 'calc(100% - 20px)',
            fontFamily: '"Computer Modern Serif", "Latin Modern Roman", "CMU Serif", "STIX Two Text", "Times New Roman", serif',
            fontSize: `${fontSize}px`,
            lineHeight: 1.6,
            color: '#1a1a1a',
            boxSizing: 'border-box',
          }}
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
        <style>{latexStyles}</style>
      </div>
    );
  }
);

LatexPreview.displayName = 'LatexPreview';

const latexStyles = `
@import url('https://cdn.jsdelivr.net/gh/aaaakshat/cm-web-fonts@latest/fonts.css');

.latex-preview-page h1 {
  font-size: 20px;
  font-weight: bold;
  text-align: center;
  margin: 20px 0 8px;
  font-family: inherit;
}
.latex-preview-page h2 {
  font-size: 16px;
  font-weight: bold;
  margin: 24px 0 8px;
  font-family: inherit;
}
.latex-preview-page h3 {
  font-size: 14.5px;
  font-weight: bold;
  margin: 18px 0 6px;
  font-family: inherit;
}
.latex-preview-page h4 {
  font-size: 14px;
  font-weight: bold;
  font-style: italic;
  margin: 14px 0 4px;
  font-family: inherit;
}
.latex-preview-page p {
  margin: 6px 0;
  text-align: justify;
  text-indent: 1.5em;
}
.latex-preview-page p.no-indent {
  text-indent: 0;
}
.latex-preview-page .latex-abstract {
  margin: 16px 32px;
  font-size: 13px;
}
.latex-preview-page .latex-abstract .abstract-title {
  text-align: center;
  font-weight: bold;
  font-size: 13px;
  margin-bottom: 6px;
}
.latex-preview-page .latex-center {
  text-align: center;
}
.latex-preview-page .latex-center p {
  text-indent: 0;
}
.latex-preview-page .latex-quote {
  margin: 10px 24px;
  font-style: italic;
  border-left: 2px solid #ccc;
  padding-left: 12px;
}
.latex-preview-page .latex-verbatim {
  font-family: "Computer Modern Typewriter", "Latin Modern Mono", "Courier New", monospace;
  font-size: 12px;
  background: #f8f8f8;
  border: 1px solid #e8e8e8;
  border-radius: 2px;
  padding: 10px 14px;
  margin: 10px 0;
  white-space: pre-wrap;
  overflow-x: auto;
}
.latex-preview-page .latex-theorem {
  margin: 14px 0;
  padding: 0;
  font-style: italic;
}
.latex-preview-page .latex-theorem .theorem-head {
  font-weight: bold;
  font-style: normal;
  margin-right: 6px;
}
.latex-preview-page .latex-proof {
  margin: 10px 0;
}
.latex-preview-page .latex-proof .proof-head {
  font-style: italic;
  margin-right: 6px;
}
.latex-preview-page .latex-proof .proof-qed {
  float: right;
}
.latex-preview-page .latex-figure {
  margin: 16px 0;
  text-align: center;
}
.latex-preview-page .latex-figure img {
  max-width: 100%;
  max-height: 400px;
  object-fit: contain;
}
.latex-preview-page .latex-figure .latex-caption {
  font-size: 12px;
  color: #333;
  margin-top: 8px;
  text-indent: 0;
}
.latex-preview-page .latex-figure .latex-caption strong {
  font-weight: bold;
}
.latex-preview-page .latex-table-wrap {
  margin: 14px 0;
  text-align: center;
}
.latex-preview-page .latex-table-wrap .latex-caption {
  font-size: 12px;
  color: #333;
  margin-bottom: 6px;
  text-indent: 0;
}
.latex-preview-page table.latex-tabular {
  border-collapse: collapse;
  margin: 8px auto;
  font-size: 13px;
}
.latex-preview-page table.latex-tabular td,
.latex-preview-page table.latex-tabular th {
  padding: 4px 10px;
  text-align: center;
}
.latex-preview-page table.latex-tabular .hline-top { border-top: 1.5px solid #000; }
.latex-preview-page table.latex-tabular .hline-bottom { border-bottom: 1.5px solid #000; }
.latex-preview-page table.latex-tabular .hline-mid { border-bottom: 0.8px solid #000; }
.latex-preview-page ul, .latex-preview-page ol {
  margin: 8px 0;
  padding-left: 28px;
}
.latex-preview-page li {
  margin: 3px 0;
  text-indent: 0;
}
.latex-preview-page hr.latex-pagebreak {
  border: none;
  border-top: 1px dashed #ccc;
  margin: 24px 0;
}
.latex-preview-page .latex-footnote {
  font-size: 11px;
  vertical-align: super;
  color: #555;
}
.latex-preview-page .latex-cite {
  color: #006621;
}
.latex-preview-page .latex-ref {
  color: #006621;
}
.latex-preview-page .latex-hrule {
  border: none;
  border-top: 0.8px solid #000;
  margin: 12px 0;
}
.latex-preview-page .katex-display {
  margin: 12px 0;
  overflow-x: auto;
}
`;

interface SectionCounters {
  section: number;
  subsection: number;
  subsubsection: number;
  figure: number;
  table: number;
  equation: number;
  theorem: number;
}

export function renderLatex(tex: string, options: RenderOptions = {}): string {
  let text = tex;
  const counters: SectionCounters = { section: 0, subsection: 0, subsubsection: 0, figure: 0, table: 0, equation: 0, theorem: 0 };

  // Remove comments (but not \%)
  text = text.replace(/(?<!\\)%.*$/gm, '');

  // Remove preamble commands
  text = text.replace(/\\(documentclass|usepackage|bibliography|bibliographystyle|maketitle|newcommand|renewcommand|def|let|setlength|addtolength|setcounter|pagestyle|thispagestyle|DeclareMathOperator)\b[^\n]*/g, '');
  text = text.replace(/\\begin\{document\}/g, '');
  text = text.replace(/\\end\{document\}/g, '');

  // Handle title/author/date/thanks
  text = text.replace(/\\title\{([^}]*)\}/g, '<h1>$1</h1>');
  text = text.replace(/\\author\{([^}]*)\}/g, '<p class="no-indent" style="text-align:center;color:#333;font-size:13px">$1</p>');
  text = text.replace(/\\date\{([^}]*)\}/g, '<p class="no-indent" style="text-align:center;color:#666;font-size:12px">$1</p>');
  text = text.replace(/\\thanks\{([^}]*)\}/g, '<span class="latex-footnote">$1</span>');

  // Handle abstract
  text = text.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g, '<div class="latex-abstract"><div class="abstract-title">Abstract</div>$1</div>');

  // Handle sections with numbering
  text = text.replace(/\\section\*\{([^}]*)\}/g, '<h2>$1</h2>');
  text = text.replace(/\\section\{([^}]*)\}/g, (_m, title) => {
    counters.section++;
    counters.subsection = 0;
    counters.subsubsection = 0;
    return `<h2>${counters.section}&nbsp;&nbsp;${title}</h2>`;
  });
  text = text.replace(/\\subsection\*\{([^}]*)\}/g, '<h3>$1</h3>');
  text = text.replace(/\\subsection\{([^}]*)\}/g, (_m, title) => {
    counters.subsection++;
    counters.subsubsection = 0;
    return `<h3>${counters.section}.${counters.subsection}&nbsp;&nbsp;${title}</h3>`;
  });
  text = text.replace(/\\subsubsection\*\{([^}]*)\}/g, '<h4>$1</h4>');
  text = text.replace(/\\subsubsection\{([^}]*)\}/g, (_m, title) => {
    counters.subsubsection++;
    return `<h4>${counters.section}.${counters.subsection}.${counters.subsubsection}&nbsp;&nbsp;${title}</h4>`;
  });
  text = text.replace(/\\paragraph\*?\{([^}]*)\}/g, '<p class="no-indent"><strong>$1.</strong> ');

  // Handle center environment
  text = text.replace(/\\begin\{center\}([\s\S]*?)\\end\{center\}/g, '<div class="latex-center">$1</div>');

  // Handle quote/quotation
  text = text.replace(/\\begin\{(quote|quotation)\}([\s\S]*?)\\end\{\1\}/g, '<div class="latex-quote">$2</div>');

  // Handle verbatim
  text = text.replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g, (_m, code) => `<pre class="latex-verbatim">${escapeHtml(code.trim())}</pre>`);

  // Handle theorem-like environments
  const theoremEnvs = ['theorem', 'lemma', 'corollary', 'proposition', 'definition', 'remark', 'example'];
  for (const env of theoremEnvs) {
    const re = new RegExp(`\\\\begin\\{${env}\\}(?:\\[([^\\]]*)\\])?([\\s\\S]*?)\\\\end\\{${env}\\}`, 'g');
    text = text.replace(re, (_m, optTitle, body) => {
      counters.theorem++;
      const label = env.charAt(0).toUpperCase() + env.slice(1);
      const titlePart = optTitle ? ` (${optTitle})` : '';
      return `<div class="latex-theorem"><span class="theorem-head">${label} ${counters.theorem}${titlePart}.</span>${body.trim()}</div>`;
    });
  }

  // Handle proof
  text = text.replace(/\\begin\{proof\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{proof\}/g, (_m, optTitle, body) => {
    const title = optTitle || 'Proof';
    return `<div class="latex-proof"><span class="proof-head">${title}.</span>${body.trim()}<span class="proof-qed">□</span></div>`;
  });

  // Handle figure environments
  text = text.replace(/\\begin\{figure\*?\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{figure\*?\}/g, (_, body) => {
    counters.figure++;
    return renderFigureEnv(body, counters.figure, options);
  });

  // Handle table environments
  text = text.replace(/\\begin\{table\*?\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{table\*?\}/g, (_, body) => {
    counters.table++;
    return renderTableEnv(body, counters.table);
  });

  // Handle standalone tabular
  text = text.replace(/\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\}/g, (_, colspec, body) => renderTabular(colspec, body));

  // Handle standalone includegraphics
  text = text.replace(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g, (_, imagePath) => renderImage(imagePath, '', options));

  // Handle itemize/enumerate
  text = text.replace(/\\begin\{enumerate\}/g, '<ol>');
  text = text.replace(/\\end\{enumerate\}/g, '</ol>');
  text = text.replace(/\\begin\{itemize\}/g, '<ul>');
  text = text.replace(/\\end\{itemize\}/g, '</ul>');
  text = text.replace(/\\item\s*/g, '<li>');

  // Handle display math: \[ ... \] and $$ ... $$
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => renderMathBlock(math));
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => renderMathBlock(math));

  // Handle equation environments
  text = text.replace(/\\begin\{(equation)\}([\s\S]*?)\\end\{\1\}/g, (_, _env, math) => {
    counters.equation++;
    return renderMathBlock(math, counters.equation);
  });
  text = text.replace(/\\begin\{(equation)\*\}([\s\S]*?)\\end\{\1\*\}/g, (_, _env, math) => renderMathBlock(math));
  text = text.replace(/\\begin\{(align|gather|multline|eqnarray)\*?\}([\s\S]*?)\\end\{\1\*?\}/g, (_, _env, math) => renderMathBlock(math));

  // Handle inline math: $...$
  text = text.replace(/\$([^$\n]+?)\$/g, (_, math) => renderMathInline(math));
  text = text.replace(/\\\((.*?)\\\)/g, (_, math) => renderMathInline(math));

  // Handle text formatting
  text = text.replace(/\\textbf\{([^}]*)\}/g, '<strong>$1</strong>');
  text = text.replace(/\\textit\{([^}]*)\}/g, '<em>$1</em>');
  text = text.replace(/\\emph\{([^}]*)\}/g, '<em>$1</em>');
  text = text.replace(/\\underline\{([^}]*)\}/g, '<u>$1</u>');
  text = text.replace(/\\texttt\{([^}]*)\}/g, '<code style="font-family:\'Computer Modern Typewriter\',monospace;font-size:12px;background:#f5f5f5;padding:1px 3px;border-radius:2px">$1</code>');
  text = text.replace(/\\textsc\{([^}]*)\}/g, '<span style="font-variant:small-caps">$1</span>');
  text = text.replace(/\\text\{([^}]*)\}/g, '$1');

  // Handle font size commands
  text = text.replace(/\{\\(tiny|scriptsize|footnotesize|small)\b([\s\S]*?)\}/g, '<span style="font-size:11px">$2</span>');
  text = text.replace(/\{\\(large|Large)\b([\s\S]*?)\}/g, '<span style="font-size:16px">$2</span>');
  text = text.replace(/\{\\(LARGE|huge|Huge)\b([\s\S]*?)\}/g, '<span style="font-size:20px">$2</span>');

  // Handle citations and references
  text = text.replace(/\\cite[tp]?\*?(?:\[[^\]]*\])?\{([^}]*)\}/g, '<span class="latex-cite">[$1]</span>');
  text = text.replace(/\\ref\{([^}]*)\}/g, '<span class="latex-ref">[ref]</span>');
  text = text.replace(/\\eqref\{([^}]*)\}/g, '<span class="latex-ref">([ref])</span>');
  text = text.replace(/\\label\{[^}]*\}/g, '');
  text = text.replace(/\\footnote\{([^}]*)\}/g, '<span class="latex-footnote">($1)</span>');

  // Handle special characters
  text = text.replace(/\\&/g, '&amp;');
  text = text.replace(/\\%/g, '%');
  text = text.replace(/\\#/g, '#');
  text = text.replace(/\\\$/g, '$');
  text = text.replace(/\\\_/g, '_');
  text = text.replace(/---/g, '—');
  text = text.replace(/--/g, '–');
  text = text.replace(/``/g, '“');
  text = text.replace(/''/g, '”');
  text = text.replace(/`/g, '‘');
  text = text.replace(/'/g, '’');
  text = text.replace(/~/g, '&nbsp;');

  // Handle line breaks
  text = text.replace(/\\\\(\[.*?\])?/g, '<br/>');
  text = text.replace(/\\newline/g, '<br/>');
  text = text.replace(/\\vspace\*?\{[^}]*\}/g, '<div style="height:12px"></div>');
  text = text.replace(/\\hspace\*?\{[^}]*\}/g, '&nbsp;');
  text = text.replace(/\\quad/g, '&emsp;');
  text = text.replace(/\\qquad/g, '&emsp;&emsp;');
  text = text.replace(/\\,/g, '&thinsp;');
  text = text.replace(/\\;/g, '&ensp;');

  // Handle rules
  text = text.replace(/\\rule\{[^}]*\}\{[^}]*\}/g, '<hr class="latex-hrule"/>');
  text = text.replace(/\\hrule/g, '<hr class="latex-hrule"/>');

  // Remove remaining unknown commands
  text = text.replace(/\\(centering|noindent|small|large|Large|LARGE|huge|Huge|normalsize|footnotesize|scriptsize|tiny|raggedright|raggedleft|flushleft|flushright)\b/g, '');
  text = text.replace(/\\(clearpage|newpage|pagebreak|linebreak)\b/g, '<hr class="latex-pagebreak"/>');
  text = text.replace(/\\(input|include)\{[^}]*\}/g, '');

  // Convert double newlines to paragraphs
  text = text.replace(/\n\s*\n/g, '</p><p>');

  // Wrap in paragraph
  text = '<p>' + text + '</p>';

  // Clean up empty paragraphs
  text = text.replace(/<p>\s*<\/p>/g, '');
  // Clean up paragraphs that only contain block elements
  text = text.replace(/<p>\s*(<(?:h[1-4]|div|pre|ul|ol|hr|figure|table)[^>]*>)/g, '$1');
  text = text.replace(/(<\/(?:h[1-4]|div|pre|ul|ol|figure|table)>)\s*<\/p>/g, '$1');

  return text;
}

function renderFigureEnv(body: string, num: number, options: RenderOptions): string {
  const imageMatch = body.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/);
  const captionMatch = body.match(/\\caption\{([^}]*)\}/);
  const imagePath = imageMatch?.[1]?.trim() || '';
  const caption = captionMatch?.[1]?.trim() || '';

  if (!imagePath) {
    return `<div class="latex-figure"><div style="padding:16px;border:1px dashed #ccc;color:#666">[Figure ${num}${caption ? ': ' + escapeHtml(caption) : ''}]</div></div>`;
  }

  const src = resolveProjectAssetUrl(options.projectId, options.currentFile || '', imagePath) || imagePath;
  const captionHtml = caption
    ? `<p class="latex-caption"><strong>Figure ${num}:</strong> ${caption}</p>`
    : '';
  return `<div class="latex-figure"><img src="${escapeAttr(src)}" alt="${escapeAttr(caption || imagePath)}"/>${captionHtml}</div>`;
}

function renderTableEnv(body: string, num: number): string {
  const captionMatch = body.match(/\\caption\{([^}]*)\}/);
  const caption = captionMatch?.[1]?.trim() || '';
  const tabularMatch = body.match(/\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\}/);

  const captionHtml = caption
    ? `<p class="latex-caption"><strong>Table ${num}:</strong> ${caption}</p>`
    : '';

  if (tabularMatch) {
    const tableHtml = renderTabular(tabularMatch[1], tabularMatch[2]);
    return `<div class="latex-table-wrap">${captionHtml}${tableHtml}</div>`;
  }

  return `<div class="latex-table-wrap">${captionHtml}<div style="padding:12px;border:1px dashed #ccc;color:#666">[Table ${num}]</div></div>`;
}

function renderTabular(_colspec: string, body: string): string {
  const rows = body.trim().split('\\\\');
  let html = '<table class="latex-tabular">';

  for (let i = 0; i < rows.length; i++) {
    let row = rows[i].trim();
    if (!row) continue;

    const hasHlineBefore = row.startsWith('\\hline');
    row = row.replace(/\\hline/g, '').trim();
    if (!row && hasHlineBefore) {
      if (i === 0) html += '<tr class="hline-marker"></tr>';
      continue;
    }

    const cells = row.split('&').map(c => c.trim());
    const isFirst = i === 0;
    const isLast = i === rows.length - 1 || (i === rows.length - 2 && !rows[rows.length - 1].trim());

    let rowClass = '';
    if (hasHlineBefore) rowClass += ' hline-top';
    if (isLast) rowClass += ' hline-bottom';

    html += '<tr>';
    for (const cell of cells) {
      const cls = rowClass.trim();
      html += `<td${cls ? ` class="${cls}"` : ''}>${cell}</td>`;
    }
    html += '</tr>';
  }

  html += '</table>';
  return html;
}

function renderImage(imagePath: string, caption: string, options: RenderOptions): string {
  const src = resolveProjectAssetUrl(options.projectId, options.currentFile || '', imagePath) || imagePath;
  const captionHtml = caption
    ? `<p class="latex-caption">${escapeHtml(caption)}</p>`
    : '';
  return `<div class="latex-figure"><img src="${escapeAttr(src)}" alt="${escapeAttr(caption || imagePath)}"/>${captionHtml}</div>`;
}

function renderMathBlock(math: string, eqNum?: number): string {
  try {
    const cleaned = math
      .replace(/\\label\{[^}]*\}/g, '')
      .replace(/\\nonumber/g, '')
      .replace(/\\notag/g, '')
      .trim();
    const html = katex.renderToString(cleaned, { displayMode: true, throwOnError: false, trust: true });
    const numHtml = eqNum ? `<span style="float:right;color:#333">(${eqNum})</span>` : '';
    return `<div style="margin:12px 0;overflow-x:auto;position:relative">${html}${numHtml}</div>`;
  } catch {
    return `<pre style="margin:12px 0;padding:8px;background:#f8f8f8;border:1px solid #e8e8e8;border-radius:2px;overflow-x:auto;font-size:12px;font-family:monospace">${escapeHtml(math)}</pre>`;
  }
}

function renderMathInline(math: string): string {
  try {
    const html = katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, trust: true });
    return html;
  } catch {
    return `<code>${escapeHtml(math)}</code>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
