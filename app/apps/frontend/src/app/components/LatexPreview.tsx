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

type PreviewIssue = {
  kind: 'citation' | 'reference' | 'command';
  value: string;
};

const APPROXIMATED_COMMANDS = new Set([
  'documentclass', 'usepackage', 'bibliography', 'bibliographystyle', 'maketitle',
  'newcommand', 'renewcommand', 'def', 'let', 'setlength', 'addtolength', 'setcounter',
  'pagestyle', 'thispagestyle', 'DeclareMathOperator', 'title', 'author', 'date', 'thanks',
  'begin', 'end', 'section', 'subsection', 'subsubsection', 'paragraph', 'caption', 'label',
  'includegraphics', 'item', 'textbf', 'textit', 'emph', 'underline', 'texttt', 'textsc',
  'textsf', 'sffamily', 'textrm', 'rmfamily', 'mathbf', 'bfseries', 'mathit', 'itshape',
  'sout', 'href', 'url', 'text', 'cite', 'citet', 'citep', 'ref', 'eqref', 'footnote',
  'centering', 'noindent', 'small', 'large', 'Large', 'LARGE', 'huge', 'Huge',
  'normalsize', 'footnotesize', 'scriptsize', 'tiny', 'raggedright', 'raggedleft',
  'flushleft', 'flushright', 'clearpage', 'newpage', 'pagebreak', 'linebreak', 'newline',
  'vspace', 'hspace', 'quad', 'qquad', 'rule', 'hrule', 'input', 'include',
  'frac', 'dfrac', 'tfrac', 'sqrt', 'sum', 'prod', 'int', 'iint', 'iiint', 'oint',
  'lim', 'log', 'ln', 'exp', 'sin', 'cos', 'tan', 'min', 'max', 'argmin', 'argmax',
  'left', 'right', 'middle', 'big', 'Big', 'bigg', 'Bigg', 'overline', 'underline',
  'hat', 'widehat', 'bar', 'vec', 'dot', 'ddot', 'tilde', 'widetilde', 'mathbf',
  'mathrm', 'mathsf', 'mathtt', 'mathcal', 'mathbb', 'mathfrak', 'boldsymbol', 'operatorname',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta',
  'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho',
  'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
  'infty', 'partial', 'nabla', 'forall', 'exists', 'neg', 'pm', 'mp', 'times', 'div',
  'cdot', 'circ', 'bullet', 'le', 'leq', 'ge', 'geq', 'ne', 'neq', 'approx', 'sim',
  'simeq', 'equiv', 'propto', 'in', 'notin', 'subset', 'subseteq', 'supset', 'supseteq',
  'cup', 'cap', 'setminus', 'land', 'lor', 'oplus', 'otimes', 'to', 'rightarrow',
  'leftarrow', 'leftrightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow',
]);

export const LatexPreview = forwardRef<HTMLDivElement, Props>(
  ({ content, projectId, currentFile = '', onScroll, scrollRatio }, ref) => {
    const innerRef = useRef<HTMLDivElement>(null);
    const scrollingRef = useRef(false);
    const containerRef = (ref as React.RefObject<HTMLDivElement>) || innerRef;
    const [fontSize, setFontSize] = useState(14);
    const [isRendering, setIsRendering] = useState(false);
    const [prevContent, setPrevContent] = useState(content);
    const rafRef = useRef<number>(0);

    // Detect content changes for animation
    useEffect(() => {
      if (content !== prevContent) {
        setIsRendering(true);
        const timer = setTimeout(() => {
          setIsRendering(false);
          setPrevContent(content);
        }, 150);
        return () => clearTimeout(timer);
      }
    }, [content, prevContent]);

    const rendered = useMemo(() => renderLatex(content, { projectId, currentFile }), [content, projectId, currentFile]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const cleanups: Array<() => void> = [];
      container.querySelectorAll<HTMLImageElement>('img[data-preview-asset]').forEach((asset) => {
        const showFallback = () => {
          asset.hidden = true;
          const fallback = asset.parentElement?.querySelector<HTMLElement>('.latex-preview-asset-fallback');
          if (fallback) fallback.hidden = false;
        };
        asset.addEventListener('error', showFallback);
        if (asset.complete && asset.naturalWidth === 0) showFallback();
        cleanups.push(() => asset.removeEventListener('error', showFallback));
      });
      return () => cleanups.forEach(cleanup => cleanup());
    }, [rendered]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el || scrollRatio === undefined) return;
      scrollingRef.current = true;
      const maxScroll = el.scrollHeight - el.clientHeight;
      el.scrollTop = scrollRatio * maxScroll;
      rafRef.current = requestAnimationFrame(() => { scrollingRef.current = false; });
      return () => cancelAnimationFrame(rafRef.current);
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
        className={`latex-preview-container ${isRendering ? 'animate-shimmer' : ''}`}
        style={{
          overflow: 'auto',
          height: '100%',
          background: '#f5f5f0',
          position: 'relative',
        }}
      >
        {/* Zoom controls - top right */}
        <div
          className="animate-fade-in"
          style={{
            position: 'sticky',
            top: 8,
            zIndex: 10,
            display: 'flex',
            gap: '4px',
            alignItems: 'center',
            background: 'var(--panel)',
            backdropFilter: 'blur(4px)',
            padding: '4px 8px',
            borderRadius: '6px',
            boxShadow: 'var(--shadow)',
            float: 'right',
            marginRight: '12px',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            border: '1px solid var(--border)',
          }}
        >
          <button
            onClick={zoomOut}
            title="缩小"
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px', lineHeight: 1 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            A-
          </button>
          <button
            onClick={zoomReset}
            title="重置"
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--muted)', padding: '2px 4px', borderRadius: '4px', minWidth: '36px', textAlign: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            {fontSize}px
          </button>
          <button
            onClick={zoomIn}
            title="放大"
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px', lineHeight: 1 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
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
            background: '#ffffff',  // 保持白色背景（模拟纸张）
            boxShadow: 'var(--shadow)',
            borderRadius: '2px',
            padding: '48px 56px',
            minHeight: 'calc(100% - 20px)',
            fontFamily: '"Computer Modern Serif", "Latin Modern Roman", "CMU Serif", "STIX Two Text", "Times New Roman", serif',
            fontSize: `${fontSize}px`,
            lineHeight: 1.6,
            color: '#1a1a1a',  // 深色文字确保可读性
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

/* LaTeX preview - white background with dark text */
.latex-preview-page {
  background: #ffffff;
  color: #1a1a1a;
}

.latex-preview-page h1 {
  font-size: 20px;
  font-weight: bold;
  text-align: center;
  margin: 20px 0 8px;
  font-family: inherit;
  color: #1a1a1a;
}
.latex-preview-page h2 {
  font-size: 16px;
  font-weight: bold;
  margin: 24px 0 8px;
  font-family: inherit;
  color: #1a1a1a;
}
.latex-preview-page h3 {
  font-size: 14.5px;
  font-weight: bold;
  margin: 18px 0 6px;
  font-family: inherit;
  color: #1a1a1a;
}
.latex-preview-page h4 {
  font-size: 14px;
  font-weight: bold;
  font-style: italic;
  margin: 14px 0 4px;
  font-family: inherit;
  color: #1a1a1a;
}
.latex-preview-page p {
  margin: 6px 0;
  text-align: justify;
  text-indent: 1.5em;
  color: #1a1a1a;
}
.latex-preview-page p.no-indent {
  text-indent: 0;
}
.latex-preview-page .latex-abstract {
  margin: 16px 32px;
  font-size: 13px;
  color: #1a1a1a;
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
  border-left: 2px solid #888;
  padding-left: 12px;
  color: #555;
}
.latex-preview-page .latex-verbatim {
  font-family: "Computer Modern Typewriter", "Latin Modern Mono", "Courier New", monospace;
  font-size: 12px;
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 2px;
  padding: 10px 14px;
  margin: 10px 0;
  white-space: pre-wrap;
  overflow-x: auto;
  color: #333;
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
.latex-preview-placeholder {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  margin: 0 2px;
  padding: 1px 5px;
  border: 1px dashed #b7791f;
  border-radius: 4px;
  background: #fff8e6;
  color: #744210;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.86em;
  text-indent: 0;
}
.latex-preview-issues {
  margin: 0 0 16px;
  padding: 10px 12px;
  border: 1px solid #d6b46b;
  border-radius: 6px;
  background: #fffbeb;
  color: #604514;
  font-size: 12px;
}
.latex-preview-issues ul { margin: 6px 0 0; padding-left: 18px; }
.latex-preview-asset-fallback {
  padding: 16px;
  border: 1px dashed #b7791f;
  border-radius: 4px;
  background: #fff8e6;
  color: #744210;
  overflow-wrap: anywhere;
}
.latex-preview-page .latex-figure .latex-caption {
  font-size: 12px;
  color: #555;
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
  color: #555;
  margin-bottom: 6px;
  text-indent: 0;
}
.latex-preview-page table.latex-tabular {
  border-collapse: collapse;
  margin: 8px auto;
  font-size: 13px;
  color: #1a1a1a;
  background: #ffffff;
}
.latex-preview-page table.latex-tabular td,
.latex-preview-page table.latex-tabular th {
  padding: 4px 10px;
  text-align: center;
  border-color: #ccc;
  background: #ffffff;
  color: #1a1a1a;
}
.latex-preview-page table.latex-tabular .hline-top { border-top: 1.5px solid #333; }
.latex-preview-page table.latex-tabular .hline-bottom { border-bottom: 1.5px solid #333; }
.latex-preview-page table.latex-tabular .hline-mid { border-bottom: 0.8px solid #333; }
.latex-preview-page table.latex-tabular .cmidrule-line {
  border: none;
  border-top: 0.8px solid #333;
  padding: 0;
  height: 1px;
  background: transparent;
}
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
  color: #666;
}
.latex-preview-page .latex-cite {
  color: #006621;
}
.latex-preview-page .latex-ref {
  color: #006621;
}
.latex-preview-page .latex-hrule {
  border: none;
  border-top: 0.8px solid #ccc;
  margin: 12px 0;
}
.latex-preview-page .katex-display {
  margin: 12px 0;
  overflow-x: auto;
}
.latex-preview-page .latex-algorithm {
  position: relative;
}
.latex-preview-page .latex-algorithmic {
  padding: 8px 0;
}
.latex-preview-page .latex-code-block {
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.latex-preview-page .latex-code-block code {
  display: block;
  white-space: pre;
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
  const previewIssues = collectPreviewIssues(tex);
  const counters: SectionCounters = { section: 0, subsection: 0, subsubsection: 0, figure: 0, table: 0, equation: 0, theorem: 0 };

  // Remove comments (but not \%)
  text = text.replace(/(?<!\\)%.*$/gm, '');

  text = expandSimpleLatexMacros(text);

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

  // Handle common layout environments
  text = text.replace(/\\begin\{flushleft\}([\s\S]*?)\\end\{flushleft\}/g, '<div style="text-align:left">$1</div>');
  text = text.replace(/\\begin\{flushright\}([\s\S]*?)\\end\{flushright\}/g, '<div style="text-align:right">$1</div>');
  text = text.replace(/\\begin\{(small|footnotesize|scriptsize|tiny)\}([\s\S]*?)\\end\{\1\}/g, '<span style="font-size:11px">$2</span>');
  text = text.replace(/\\begin\{(large|Large)\}([\s\S]*?)\\end\{\1\}/g, '<span style="font-size:16px">$2</span>');
  text = text.replace(/\\begin\{(LARGE|huge|Huge)\}([\s\S]*?)\\end\{\1\}/g, '<span style="font-size:20px">$2</span>');

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

  // Handle standalone tabular-like environments
  text = text.replace(/\\begin\{(?:tabular|tabularx|tabulary|array)\}(?:\{[^}]*\})?\{([^}]*)\}([\s\S]*?)\\end\{(?:tabular|tabularx|tabulary|array)\}/g, (_, colspec, body) => renderTabular(colspec, body));
  text = text.replace(/\\begin\{longtable\}\{([^}]*)\}([\s\S]*?)\\end\{longtable\}/g, (_, colspec, body) => {
    const captionMatch = body.match(/\\caption\{([^}]*)\}/);
    const caption = captionMatch?.[1]?.trim() || '';
    const captionHtml = caption ? `<p class="latex-caption"><strong>Table:</strong> ${caption}</p>` : '';
    return `<div class="latex-table-wrap">${captionHtml}${renderTabular(colspec, stripTableOnlyCommands(body))}</div>`;
  });

  // Handle standalone includegraphics
  text = text.replace(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g, (_, imagePath) => renderImage(imagePath, '', options));

  // Handle algorithm/algorithmic environments (Overleaf style)
  text = text.replace(/\\begin\{algorithm\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{algorithm\}/g, (_, body) => {
    counters.equation++;
    return renderAlgorithmEnv(body, counters.equation);
  });
  text = text.replace(/\\begin\{algorithmic\}([\s\S]*?)\\end\{algorithmic\}/g, (_, body) => renderAlgorithmicEnv(body));
  text = text.replace(/\\begin\{algorithm\*\}([\s\S]*?)\\end\{algorithm\*\}/g, (_, body) => renderAlgorithmEnv(body, undefined, true));

  // Handle lstlisting (code listings)
  text = text.replace(/\\begin\{lstlisting\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{lstlisting\}/g, (_, code) => renderCodeBlock(code.trim(), 'python'));
  text = text.replace(/\\begin\{lstlisting\*\}([\s\S]*?)\\end\{lstlisting\*\}/g, (_, code) => renderCodeBlock(code.trim(), 'python'));

  // Handle minted (Pygments-based code highlighting)
  text = text.replace(/\\begin\{minted\}\{([^}]*)\}([\s\S]*?)\\end\{minted\}/g, (_, lang, code) => renderCodeBlock(code.trim(), lang.trim()));
  text = text.replace(/\\begin\{minted\*\}\{([^}]*)\}([\s\S]*?)\\end\{minted\*\}/g, (_, lang, code) => renderCodeBlock(code.trim(), lang.trim()));

  // Handle verbatim environments
  text = text.replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g, (_, code) => renderCodeBlock(code.trim(), 'text'));
  text = text.replace(/\\begin\{Verbatim\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{Verbatim\}/g, (_, code) => renderCodeBlock(code.trim(), 'text'));

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
  text = text.replace(/\\begin\{(align|aligned|gather|gathered|multline|split|eqnarray|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\*?\}([\s\S]*?)\\end\{\1\*?\}/g, (_, _env, math) => renderMathBlock(math));

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
  text = text.replace(/\\(?:textsf|sffamily)\{([^}]*)\}/g, '<span style="font-family:sans-serif">$1</span>');
  text = text.replace(/\\(?:textrm|rmfamily)\{([^}]*)\}/g, '<span style="font-family:serif">$1</span>');
  text = text.replace(/\\(?:mathbf|bfseries)\{([^}]*)\}/g, '<strong>$1</strong>');
  text = text.replace(/\\(?:mathit|itshape)\{([^}]*)\}/g, '<em>$1</em>');
  text = text.replace(/\\sout\{([^}]*)\}/g, '<s>$1</s>');
  text = text.replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, '<a href="$1" target="_blank" rel="noreferrer">$2</a>');
  text = text.replace(/\\url\{([^}]*)\}/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
  text = text.replace(/\\text\{([^}]*)\}/g, '$1');

  // Handle font size commands
  text = text.replace(/\{\\(tiny|scriptsize|footnotesize|small)\b([\s\S]*?)\}/g, '<span style="font-size:11px">$2</span>');
  text = text.replace(/\{\\(large|Large)\b([\s\S]*?)\}/g, '<span style="font-size:16px">$2</span>');
  text = text.replace(/\{\\(LARGE|huge|Huge)\b([\s\S]*?)\}/g, '<span style="font-size:20px">$2</span>');

  // Handle citations and references
  text = text.replace(/\\cite[tp]?\*?(?:\[[^\]]*\])?\{([^}]*)\}/g, (_match, keys) => previewPlaceholder('citation', keys, `citation: ${keys}`));
  text = text.replace(/\\ref\{([^}]*)\}/g, (_match, key) => previewPlaceholder('reference', key, `reference: ${key}`));
  text = text.replace(/\\eqref\{([^}]*)\}/g, (_match, key) => previewPlaceholder('reference', key, `equation reference: ${key}`));
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

  return renderPreviewIssues(previewIssues) + text;
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
  return renderPreviewAsset(src, imagePath, captionHtml, caption || imagePath);
}

function renderTableEnv(body: string, num: number): string {
  const captionMatch = body.match(/\\caption\{([^}]*)\}/);
  const caption = captionMatch?.[1]?.trim() || '';
  const tabularMatch = body.match(/\\begin\{(?:tabular|tabularx|tabulary|array)\}(?:\{[^}]*\})?\{([^}]*)\}([\s\S]*?)\\end\{(?:tabular|tabularx|tabulary|array)\}/)
    || body.match(/\\begin\{longtable\}\{([^}]*)\}([\s\S]*?)\\end\{longtable\}/);

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
  body = stripTableOnlyCommands(body);
  const rows = body.trim().split('\\\\');
  let html = '<table class="latex-tabular">';

  // Track merged cells: { row: number, col: number } -> remaining rows to skip
  const mergedCells: Map<string, number> = new Map();

  for (let i = 0; i < rows.length; i++) {
    let row = rows[i].trim();
    if (!row) continue;

    // Check for booktabs commands: \toprule, \midrule, \bottomrule, \cmidrule
    const hasToprule = /\\toprule\b/.test(row);
    const hasMidrule = /\\midrule\b/.test(row);
    const hasBottomrule = /\\bottomrule\b/.test(row);
    const hasCmidrule = /\\cmidrule\b/.test(row);
    const hasAddlinespace = /\\addlinespace\b/.test(row);

    // Check for standard \hline
    const hasHlineBefore = row.startsWith('\\hline');

    // Parse cmidrule column ranges for partial lines
    const cmidruleRanges: Array<{ start: number; end: number }> = [];
    const cmidruleRegex = /\\cmidrule\s*(?:\([^)]*\))?\s*\{(\d+)-(\d+)\}/g;
    let cmidruleMatch;
    while ((cmidruleMatch = cmidruleRegex.exec(row)) !== null) {
      cmidruleRanges.push({
        start: parseInt(cmidruleMatch[1], 10) - 1, // Convert to 0-based
        end: parseInt(cmidruleMatch[2], 10) - 1
      });
    }

    // Remove all rule commands (improved regex for cmidrule with parentheses)
    row = row
      .replace(/\\toprule\b(?:\[[^\]]*\])?/g, '')
      .replace(/\\midrule\b(?:\[[^\]]*\])?/g, '')
      .replace(/\\bottomrule\b/g, '')
      .replace(/\\cline\s*\{[^}]*\}/g, '')
      .replace(/\\cmidrule\s*(?:\([^)]*\))?\s*\{[^}]*\}/g, '')
      .replace(/\\addlinespace\b/g, '')
      .replace(/\\hline/g, '')
      .trim();

    if (!row) {
      // Empty row after removing rules - add a separator row
      if (hasToprule || hasMidrule || hasBottomrule || hasCmidrule || hasHlineBefore || hasAddlinespace) {
        const ruleClass = hasToprule ? ' rule-top' : (hasMidrule || hasCmidrule ? ' rule-mid' : (hasBottomrule ? ' rule-bottom' : ''));
        html += `<tr class="hline-marker${ruleClass}">`;
        // Add partial line cells for cmidrule
        if (cmidruleRanges.length > 0) {
          html += cmidruleRanges.map(range => {
            const colspan = range.end - range.start + 1;
            return `<td colspan="${colspan}" class="cmidrule-line"></td>`;
          }).join('');
        }
        html += '</tr>';
      }
      continue;
    }

    // Split by & but preserve content in braces
    const rawCells = splitCellsByAmpersand(row);
    const cells: string[] = [];
    let colIndex = 0;

    for (const rawCell of rawCells) {
      const trimmedCell = rawCell.trim();

      // Check if this cell position is occupied by a multirow from previous row
      const mergeKey = `${i}-${colIndex}`;
      if (mergedCells.has(mergeKey)) {
        const remainingRows = mergedCells.get(mergeKey)!;
        if (remainingRows > 1) {
          mergedCells.set(mergeKey, remainingRows - 1);
          colIndex++;
          continue; // Skip this cell position
        } else {
          mergedCells.delete(mergeKey);
        }
      }

      cells.push(trimmedCell);
      colIndex++;
    }

    const isFirst = i === 0;
    const isLast = i === rows.length - 1 || (i === rows.length - 2 && !rows[rows.length - 1].trim());

    let rowClass = '';
    if (hasToprule || hasHlineBefore) rowClass += ' hline-top';
    if (hasMidrule || hasCmidrule) rowClass += ' hline-mid';
    if (isLast || hasBottomrule) rowClass += ' hline-bottom';

    html += '<tr>';
    let cellColIndex = 0;
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      const cls = rowClass.trim();

      // Check for \multirow command
      const multirowMatch = cell.match(/\\multirow\s*(?:\{([^}]*)\})?\s*(?:\{[^}]*\})?\s*(?:\{[^}]*\})?\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/);
      if (multirowMatch) {
        const nrows = parseInt(multirowMatch[1] || '1', 10);
        const text = multirowMatch[2] || '';
        const renderedText = renderLatexInline(text);

        // Track merged cells for subsequent rows
        for (let r = 1; r < nrows; r++) {
          mergedCells.set(`${i + r}-${cellColIndex}`, nrows - r);
        }

        html += `<td${cls ? ` class="${cls}"` : ''} rowspan="${nrows}" style="vertical-align:middle">${renderedText}</td>`;
        cellColIndex++;
        continue;
      }

      // Check for \multicol command (alternative syntax)
      const multicolMatch = cell.match(/\\multicol\s*\{(\d+)\}\s*(?:\{[^}]*\})?\s*\{([^}]*)\}/);
      if (multicolMatch) {
        const ncols = parseInt(multicolMatch[1], 10);
        const text = multicolMatch[2] || '';
        const renderedText = renderLatexInline(text);
        html += `<td${cls ? ` class="${cls}"` : ''} colspan="${ncols}">${renderedText}</td>`;
        cellColIndex += ncols;
        continue;
      }

      // Check for \multicolumn command
      const multicolumnMatch = cell.match(/\\multicolumn\s*\{(\d+)\}\s*\{[^}]*\}\s*\{([^}]*)\}/);
      if (multicolumnMatch) {
        const ncols = parseInt(multicolumnMatch[1], 10);
        const text = multicolumnMatch[2] || '';
        const renderedText = renderLatexInline(text);
        html += `<td${cls ? ` class="${cls}"` : ''} colspan="${ncols}">${renderedText}</td>`;
        cellColIndex += ncols;
        continue;
      }

      // Regular cell
      const renderedCell = renderLatexInline(cell);
      html += `<td${cls ? ` class="${cls}"` : ''}>${renderedCell}</td>`;
      cellColIndex++;
    }
    html += '</tr>';
  }

  html += '</table>';
  return html;
}

function stripTableOnlyCommands(body: string): string {
  return body
    .replace(/\\caption\{[^}]*\}/g, '')
    .replace(/\\label\{[^}]*\}/g, '')
    .replace(/\\(endfirsthead|endhead|endfoot|endlastfoot)\b/g, '')
    .replace(/\\tablefirsthead\{[^}]*\}/g, '')
    .replace(/\\tablehead\{[^}]*\}/g, '')
    .replace(/\\tabletail\{[^}]*\}/g, '')
    .replace(/\\tablelasttail\{[^}]*\}/g, '')
    .replace(/\\rowcolor(?:\[[^\]]*\])?\{[^}]*\}/g, '')
    .replace(/\\cellcolor(?:\[[^\]]*\])?\{[^}]*\}/g, '')
    .replace(/\\arraystretch\b/g, '');
}

function expandSimpleLatexMacros(source: string): string {
  const macros: Array<{ name: string; body: string }> = [];
  let text = source.replace(/\\(?:re)?newcommand\{\\([A-Za-z]+)\}(?:\[0\])?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_m, name, body) => {
    macros.push({ name, body });
    return '';
  });
  for (const macro of macros) {
    text = text.replace(new RegExp(`\\\\+${macro.name}\\b`, 'g'), () => macro.body);
  }
  return text;
}

// Split row by & but preserve content within braces
function splitCellsByAmpersand(row: string): string[] {
  const cells: string[] = [];
  let current = '';
  let braceDepth = 0;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '{') {
      braceDepth++;
      current += char;
    } else if (char === '}') {
      braceDepth--;
      current += char;
    } else if (char === '&' && braceDepth === 0) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current) {
    cells.push(current);
  }

  return cells;
}

// Render LaTeX content inline (for table cells, etc.)
function renderLatexInline(text: string): string {
  if (!text) return '';

  // Handle inline math: $...$ and \(...\)
  text = text.replace(/\$([^$\n]+?)\$/g, (_, math) => renderMathInline(math));
  text = text.replace(/\\\((.*?)\\\)/g, (_, math) => renderMathInline(math));

  // Handle text formatting commands
  text = text.replace(/\\textbf\{([^}]*)\}/g, '<strong>$1</strong>');
  text = text.replace(/\\textit\{([^}]*)\}/g, '<em>$1</em>');
  text = text.replace(/\\emph\{([^}]*)\}/g, '<em>$1</em>');
  text = text.replace(/\\underline\{([^}]*)\}/g, '<u>$1</u>');
  text = text.replace(/\\texttt\{([^}]*)\}/g, '<code style="font-family:monospace;font-size:12px;background:#f0f0f0;padding:1px 3px;border-radius:2px">$1</code>');
  text = text.replace(/\\textsf\{([^}]*)\}/g, '<span style="font-family:sans-serif">$1</span>');
  text = text.replace(/\\textrm\{([^}]*)\}/g, '<span style="font-family:serif">$1</span>');
  text = text.replace(/\\mathrm\{([^}]*)\}/g, '<span style="font-family:serif">$1</span>');
  text = text.replace(/\\mathbf\{([^}]*)\}/g, '<strong>$1</strong>');
  text = text.replace(/\\mathit\{([^}]*)\}/g, '<em>$1</em>');
  text = text.replace(/\\mathsf\{([^}]*)\}/g, '<span style="font-family:sans-serif">$1</span>');
  text = text.replace(/\\mathtt\{([^}]*)\}/g, '<span style="font-family:monospace">$1</span>');
  text = text.replace(/\\text\{([^}]*)\}/g, '$1');
  text = text.replace(/\\mbox\{([^}]*)\}/g, '$1');
  text = text.replace(/\\hbox\{([^}]*)\}/g, '$1');
  text = text.replace(/\\verb\*?\|([^|]+)\|/g, '<code style="font-family:monospace;background:#f0f0f0;padding:1px 3px;border-radius:2px">$1</code>');
  text = text.replace(/\\verb\*?'([^']+)'/g, '<code style="font-family:monospace;background:#f0f0f0;padding:1px 3px;border-radius:2px">$1</code>');

  // Handle font size commands
  text = text.replace(/\\tiny\{([^}]*)\}/g, '<span style="font-size:10px">$1</span>');
  text = text.replace(/\\small\{([^}]*)\}/g, '<span style="font-size:12px">$1</span>');
  text = text.replace(/\\large\{([^}]*)\}/g, '<span style="font-size:16px">$1</span>');
  text = text.replace(/\\Large\{([^}]*)\}/g, '<span style="font-size:18px">$1</span>');

  // Handle special characters
  text = text.replace(/\\&/g, '&amp;');
  text = text.replace(/\\%/g, '%');
  text = text.replace(/\\#/g, '#');
  text = text.replace(/\\\$/g, '$');
  text = text.replace(/\\_/g, '_');
  text = text.replace(/\\textbackslash{}/g, '\\');
  text = text.replace(/\\textasciitilde{}/g, '~');
  text = text.replace(/\\textasciicircum{}/g, '^');
  text = text.replace(/---/g, '—');
  text = text.replace(/--/g, '–');
  text = text.replace(/``/g, '“');
  text = text.replace(/''/g, '”');
  text = text.replace(/`/g, '‘');
  text = text.replace(/'/g, '’');
  text = text.replace(/~/g, '&nbsp;');

  // Handle spacing commands
  text = text.replace(/\\quad/g, '&emsp;');
  text = text.replace(/\\qquad/g, '&emsp;&emsp;');
  text = text.replace(/\\,/g, '&thinsp;');
  text = text.replace(/\\;/g, '&ensp;');
  text = text.replace(/\\!/g, '');

  // Handle Greek letters and common symbols
  text = text.replace(/\\alpha\b/g, 'α');
  text = text.replace(/\\beta\b/g, 'β');
  text = text.replace(/\\gamma\b/g, 'γ');
  text = text.replace(/\\delta\b/g, 'δ');
  text = text.replace(/\\epsilon\b/g, 'ε');
  text = text.replace(/\\zeta\b/g, 'ζ');
  text = text.replace(/\\eta\b/g, 'η');
  text = text.replace(/\\theta\b/g, 'θ');
  text = text.replace(/\\iota\b/g, 'ι');
  text = text.replace(/\\kappa\b/g, 'κ');
  text = text.replace(/\\lambda\b/g, 'λ');
  text = text.replace(/\\mu\b/g, 'μ');
  text = text.replace(/\\nu\b/g, 'ν');
  text = text.replace(/\\xi\b/g, 'ξ');
  text = text.replace(/\\pi\b/g, 'π');
  text = text.replace(/\\rho\b/g, 'ρ');
  text = text.replace(/\\sigma\b/g, 'σ');
  text = text.replace(/\\tau\b/g, 'τ');
  text = text.replace(/\\upsilon\b/g, 'υ');
  text = text.replace(/\\phi\b/g, 'φ');
  text = text.replace(/\\chi\b/g, 'χ');
  text = text.replace(/\\psi\b/g, 'ψ');
  text = text.replace(/\\omega\b/g, 'ω');
  text = text.replace(/\\Alpha\b/g, 'Α');
  text = text.replace(/\\Beta\b/g, 'Β');
  text = text.replace(/\\Gamma\b/g, 'Γ');
  text = text.replace(/\\Delta\b/g, 'Δ');
  text = text.replace(/\\Theta\b/g, 'Θ');
  text = text.replace(/\\Lambda\b/g, 'Λ');
  text = text.replace(/\\Xi\b/g, 'Ξ');
  text = text.replace(/\\Pi\b/g, 'Π');
  text = text.replace(/\\Sigma\b/g, 'Σ');
  text = text.replace(/\\Phi\b/g, 'Φ');
  text = text.replace(/\\Psi\b/g, 'Ψ');
  text = text.replace(/\\Omega\b/g, 'Ω');

  // Handle common operators
  text = text.replace(/\\times\b/g, '×');
  text = text.replace(/\\div\b/g, '÷');
  text = text.replace(/\\pm\b/g, '±');
  text = text.replace(/\\mp\b/g, '∓');
  text = text.replace(/\\cdot\b/g, '·');
  text = text.replace(/\\leq\b/g, '≤');
  text = text.replace(/\\geq\b/g, '≥');
  text = text.replace(/\\neq\b/g, '≠');
  text = text.replace(/\\approx\b/g, '≈');
  text = text.replace(/\\equiv\b/g, '≡');
  text = text.replace(/\\in\b/g, '∈');
  text = text.replace(/\\notin\b/g, '∉');
  text = text.replace(/\\subset\b/g, '⊂');
  text = text.replace(/\\subseteq\b/g, '⊆');
  text = text.replace(/\\cup\b/g, '∪');
  text = text.replace(/\\cap\b/g, '∩');
  text = text.replace(/\\emptyset\b/g, '∅');
  text = text.replace(/\\infty\b/g, '∞');
  text = text.replace(/\\forall\b/g, '∀');
  text = text.replace(/\\exists\b/g, '∃');
  text = text.replace(/\\partial\b/g, '∂');
  text = text.replace(/\\nabla\b/g, '∇');
  text = text.replace(/\\sum\b/g, '∑');
  text = text.replace(/\\prod\b/g, '∏');
  text = text.replace(/\\int\b/g, '∫');
  text = text.replace(/\\partial\b/g, '∂');

  // Handle superscript and subscript (simple cases)
  text = text.replace(/\^2\b/g, '²');
  text = text.replace(/\^3\b/g, '³');
  text = text.replace(/\^{2}/g, '²');
  text = text.replace(/\^{3}/g, '³');
  text = text.replace(/\^{n}/g, 'ⁿ');
  text = text.replace(/\^{'}/g, "'");
  text = text.replace(/\^{T}/g, 'ᵀ');
  text = text.replace(/_1\b/g, '₁');
  text = text.replace(/_2\b/g, '₂');
  text = text.replace(/_n\b/g, 'ₙ');
  text = text.replace(/_{'}/g, '₊');

  // Handle remaining unknown commands (remove them but keep content)
  text = text.replace(/\\centering\b/g, '');
  text = text.replace(/\\raggedright\b/g, '');
  text = text.replace(/\\raggedleft\b/g, '');
  text = text.replace(/\\normalfont\b/g, '');
  text = text.replace(/\\normalsize\b/g, '');
  text = text.replace(/\\selectfont\b/g, '');

  // Remove remaining backslash commands (but not already processed ones)
  text = text.replace(/\\([a-zA-Z]+)(?:\s|\{|$)/g, (match) => {
    // Keep some common commands that might be at end of text
    const keepCommands = ['\\'];
    return keepCommands.includes(match) ? match : '';
  });

  return text;
}

function renderImage(imagePath: string, caption: string, options: RenderOptions): string {
  const src = resolveProjectAssetUrl(options.projectId, options.currentFile || '', imagePath) || imagePath;
  const captionHtml = caption
    ? `<p class="latex-caption">${escapeHtml(caption)}</p>`
    : '';
  return renderPreviewAsset(src, imagePath, captionHtml, caption || imagePath);
}

function renderPreviewAsset(src: string, imagePath: string, captionHtml: string, alt: string): string {
  const safePath = escapeHtml(imagePath);
  return `<div class="latex-figure" data-preview-kind="asset" data-preview-value="${escapeAttr(imagePath)}">`
    + `<img data-preview-asset src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"/>`
    + `<div class="latex-preview-asset-fallback" hidden>Image unavailable in quick preview: ${safePath}. Compile the final PDF to verify this asset.</div>`
    + `${captionHtml}</div>`;
}

function previewPlaceholder(kind: PreviewIssue['kind'], value: string, label: string): string {
  return `<span class="latex-preview-placeholder" data-preview-kind="${kind}" data-preview-value="${escapeAttr(value)}" title="Resolved only by a full LaTeX compile">${escapeHtml(label)}</span>`;
}

function collectPreviewIssues(tex: string): PreviewIssue[] {
  const issues: PreviewIssue[] = [];
  const seen = new Set<string>();
  const add = (kind: PreviewIssue['kind'], value: string) => {
    const normalized = value.trim();
    const key = `${kind}:${normalized}`;
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    issues.push({ kind, value: normalized });
  };

  tex.replace(/\\cite[tp]?\*?(?:\[[^\]]*\])?\{([^}]*)\}/g, (_match, value) => { add('citation', value); return _match; });
  tex.replace(/\\(?:eq)?ref\{([^}]*)\}/g, (_match, value) => { add('reference', value); return _match; });
  tex.replace(/\\([A-Za-z@]+)\*?(?:\[[^\]]*\])?(?:\{[^{}]*\})?/g, (match, name) => {
    if (!APPROXIMATED_COMMANDS.has(name) && !/^end[A-Z]/.test(name)) add('command', name);
    return match;
  });
  return issues;
}

function renderPreviewIssues(issues: PreviewIssue[]): string {
  const unsupported = issues.filter(issue => issue.kind === 'command');
  if (unsupported.length === 0) return '';
  const items = unsupported
    .map(issue => `<li>${previewPlaceholder('command', issue.value, `unresolved command: \\${issue.value}`)}</li>`)
    .join('');
  return `<aside class="latex-preview-issues" role="note"><strong>Approximation notice</strong><ul>${items}</ul></aside>`;
}

function renderAlgorithmEnv(body: string, num?: number, noNumber?: boolean): string {
  const captionMatch = body.match(/\\caption\{([^}]*)\}/);
  const caption = captionMatch?.[1]?.trim() || '';
  const algBody = body.replace(/\\caption\{[^}]*\}/g, '').trim();
  const algHtml = renderAlgorithmicEnv(algBody);
  const numHtml = num && !noNumber ? `<span style="float:right;color:#333;font-size:12px">Algorithm ${num}</span>` : '';
  const captionHtml = caption ? `<p class="latex-caption" style="text-align:center;margin-top:8px"><strong>Algorithm ${num || ''}:</strong> ${escapeHtml(caption)}</p>` : '';
  return `<div class="latex-algorithm" style="margin:16px 0;padding:12px 16px;background:#fafafa;border:1px solid #e0e0e0;border-radius:4px">${numHtml}${algHtml}${captionHtml}</div>`;
}

function renderAlgorithmicEnv(body: string): string {
  let html = '<div class="latex-algorithmic" style="font-family:\'Computer Modern Typewriter\',monospace;font-size:13px;line-height:1.6">';

  const lines = body.split('\n');
  let indentLevel = 0;
  let lineNum = 0;

  for (const rawLine of lines) {
    let processed = rawLine.trim();
    if (!processed) continue;
    lineNum++;

    // ── Protect inline math ──
    const mathSegments: string[] = [];
    processed = processed.replace(/\$([^$\n]+?)\$/g, (_m, math) => {
      try {
        mathSegments.push(katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, trust: true }));
      } catch { mathSegments.push(math); }
      return `\x00MATH${mathSegments.length - 1}\x00`;
    });
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_m, math) => {
      try {
        mathSegments.push(katex.renderToString(math.trim(), { displayMode: true, throwOnError: false, trust: true }));
      } catch { mathSegments.push(math); }
      return `\x00MATH${mathSegments.length - 1}\x00`;
    });

    // ── Strip env tags & label ──
    processed = processed.replace(/\\begin\{algorithmic\}(\[[^\]]*\])?/gi, '');
    processed = processed.replace(/\\end\{algorithmic\}/gi, '');
    processed = processed.replace(/\\begin\{algorithm\}(\[[^\]]*\])?/gi, '');
    processed = processed.replace(/\\end\{algorithm\}/gi, '');
    processed = processed.replace(/\\label\{[^}]*\}/g, '');

    // ── Detect end-block keywords BEFORE processing (decrease indent) ──
    const endBlockRe = /\\(ENDWHILE|ENDFOR|ENDIF|ENDLOOP|UNTIL)\b/gi;
    if (endBlockRe.test(processed)) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    // ── Remove \STATE and leading backslashes ──
    processed = processed.replace(/\\STATE\b\s*/gi, '');

    // ── Replace structural commands ──
    processed = processed.replace(/\\WHILE\s*\{/gi, '<b style="color:#0066cc">while</b> (');
    processed = processed.replace(/\\IF\s*\{/gi, '<b style="color:#0066cc">if</b> (');
    processed = processed.replace(/\\FOR\s*\{/gi, '<b style="color:#0066cc">for</b> (');
    processed = processed.replace(/\\ELSIF\s*\{/gi, '<b style="color:#0066cc">else if</b> (');
    processed = processed.replace(/\\LOOP\s*\{/gi, '<b style="color:#0066cc">loop</b> (');
    processed = processed.replace(/\\REPEAT\b/gi, '<b style="color:#0066cc">repeat</b>');
    processed = processed.replace(/\\UNTIL\b\s*\{/gi, '<b style="color:#0066cc">until</b> (');
    processed = processed.replace(/\\RETURN\b\s*/gi, '<b style="color:#cc0000">return</b> ');
    processed = processed.replace(/\\PRINT\b\s*/gi, '<b style="color:#cc0000">print</b> ');
    processed = processed.replace(/\\REQUIRE\s*/gi, '<b style="color:#006600">Require:</b> ');
    processed = processed.replace(/\\ENSURE\s*/gi, '<b style="color:#006600">Ensure:</b> ');

    // ── Colorize end-block keywords ──
    processed = processed.replace(/\\(ENDWHILE|ENDFOR|ENDIF|ENDLOOP)\b/gi,
      '<b style="color:#0066cc">$1</b>');
    processed = processed.replace(/\\ELSE\b/gi, '<b style="color:#0066cc">else</b>');

    // ── Operators ──
    processed = processed.replace(/\\GETS\b/gi, '←');
    processed = processed.replace(/\\TO\b/gi, ' to ');
    processed = processed.replace(/\\DOWNTO\b/gi, ' downto ');
    processed = processed.replace(/\\AND\b/gi, '∧');
    processed = processed.replace(/\\OR\b/gi, '∨');
    processed = processed.replace(/\\NOT\b/gi, '¬');
    processed = processed.replace(/\\XOR\b/gi, '⊕');

    // ── Comment ──
    processed = processed.replace(/\\Comment\s*\{([^}]*)\}/gi,
      ' <span style="color:#888;font-style:italic">▷ $1</span>');

    // ── \CALL{name}{args} ──
    processed = processed.replace(/\\CALL\s*\{([^}]*)\}\s*\{([^}]*)\}/gi,
      '<b style="color:#0066cc">$1</b>($2)');

    // ── Text formatting ──
    processed = processed.replace(/\\textbf\s*\{([^}]*)\}/g, '<strong>$1</strong>');
    processed = processed.replace(/\\textit\s*\{([^}]*)\}/g, '<em>$1</em>');
    processed = processed.replace(/\\emph\s*\{([^}]*)\}/g, '<em>$1</em>');
    processed = processed.replace(/\\texttt\s*\{([^}]*)\}/g, '<code style="background:#f0f0f0;padding:1px 3px;border-radius:2px">$1</code>');

    // ── Cleanup remaining \commands ──
    processed = processed.replace(/\\[a-zA-Z]+\*?\s*\{([^}]*)\}/g, (_m, inner) => escapeHtml(inner));
    processed = processed.replace(/\\[a-zA-Z]+(\{[^}]*\})?/gi, (_m, brace) => brace ? brace.slice(1, -1) : '');

    // ── Restore math ──
    processed = processed.replace(/\x00MATH(\d+)\x00/g, (_m, idx) => mathSegments[parseInt(idx)] || '');

    // ── Compute left padding ──
    const pad = 16 + indentLevel * 24;

    if (processed.trim()) {
      html += `<div style="display:flex;align-items:baseline;margin:2px 0;padding-left:${pad}px">`
            + `<span style="flex-shrink:0;width:20px;text-align:right;color:#999;font-size:11px;margin-right:8px">${lineNum}</span>`
            + `<span style="flex:1">${processed.trim()}</span>`
            + `</div>`;
    }

    // ── Detect start-block keywords AFTER rendering (increase indent for NEXT line) ──
    const startBlockRe = /\\(WHILE|FOR|IF|LOOP|REPEAT)\b/gi;
    if (startBlockRe.test(rawLine)) {
      indentLevel++;
    }
  }

  html += '</div>';
  return html;
}

function renderCodeBlock(code: string, language: string): string {
  const langLabel = language && language !== 'text' ? language.toUpperCase() : 'CODE';
  const escapedCode = escapeHtml(code);
  return `<div class="latex-code-block" style="margin:12px 0;background:#1e1e1e;border-radius:4px;overflow:hidden">
  <div style="padding:6px 12px;background:#2d2d2d;border-bottom:1px solid #404040;font-size:11px;color:#888;font-family:monospace">${escapeHtml(langLabel)}</div>
  <pre style="margin:0;padding:12px;overflow-x:auto;font-family:'JetBrains Mono','Fira Code',monospace;font-size:12px;line-height:1.5;color:#d4d4d4"><code>${escapedCode}</code></pre>
</div>`;
}

function renderMathBlock(math: string, eqNum?: number): string {
  try {
    const cleaned = math
      .replace(/\\label\{[^}]*\}/g, '')
      .replace(/\\nonumber/g, '')
      .replace(/\\notag/g, '')
      .replace(/&/g, '')
      .replace(/<br\/>/g, String.raw`\\`)
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
