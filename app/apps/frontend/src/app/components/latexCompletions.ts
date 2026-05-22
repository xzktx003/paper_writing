import { Completion, CompletionContext } from '@codemirror/autocomplete';
import { searchBibtex, type BibtexResult } from '../api/bibtex';

// LaTeX command completions for academic writing
export const latexCompletions: Completion[] = [
  // Document structure
  { label: '\\documentclass', type: 'keyword', detail: '{article/report/book}' },
  { label: '\\begin{document}', type: 'keyword' },
  { label: '\\end{document}', type: 'keyword' },
  { label: '\\section', type: 'keyword', detail: '{Title}' },
  { label: '\\subsection', type: 'keyword', detail: '{Subtitle}' },
  { label: '\\subsubsection', type: 'keyword', detail: '{Sub-subtitle}' },
  { label: '\\paragraph', type: 'keyword', detail: '{Title}' },
  { label: '\\part', type: 'keyword', detail: '{Part}' },
  { label: '\\chapter', type: 'keyword', detail: '{Title}' },

  // Text formatting
  { label: '\\textbf', type: 'keyword', detail: '{text}' },
  { label: '\\textit', type: 'keyword', detail: '{text}' },
  { label: '\\emph', type: 'keyword', detail: '{text}' },
  { label: '\\underline', type: 'keyword', detail: '{text}' },
  { label: '\\texttt', type: 'keyword', detail: '{text}' },
  { label: '\\textsf', type: 'keyword', detail: '{text}' },
  { label: '\\textrm', type: 'keyword', detail: '{text}' },
  { label: '\\mathbf', type: 'keyword', detail: '{text}' },
  { label: '\\mathit', type: 'keyword', detail: '{text}' },
  { label: '\\mathrm', type: 'keyword', detail: '{text}' },
  { label: '\\mathcal', type: 'keyword', detail: '{text}' },
  { label: '\\mathbb', type: 'keyword', detail: '{text}' },
  { label: '\\mathsf', type: 'keyword', detail: '{text}' },
  { label: '\\mathtt', type: 'keyword', detail: '{text}' },
  { label: '\\text', type: 'keyword', detail: '{text in math}' },
  { label: '\\mbox', type: 'keyword', detail: '{text}' },

  // Math environments
  { label: '\\begin{equation}', type: 'keyword' },
  { label: '\\end{equation}', type: 'keyword' },
  { label: '\\begin{align}', type: 'keyword' },
  { label: '\\end{align}', type: 'keyword' },
  { label: '\\begin{align*}', type: 'keyword' },
  { label: '\\end{align*}', type: 'keyword' },
  { label: '\\begin{alignat}', type: 'keyword' },
  { label: '\\end{alignat}', type: 'keyword' },
  { label: '\\begin{gather}', type: 'keyword' },
  { label: '\\end{gather}', type: 'keyword' },
  { label: '\\begin{multline}', type: 'keyword' },
  { label: '\\end{multline}', type: 'keyword' },
  { label: '\\begin{bmatrix}', type: 'keyword' },
  { label: '\\end{bmatrix}', type: 'keyword' },
  { label: '\\begin{vmatrix}', type: 'keyword' },
  { label: '\\end{vmatrix}', type: 'keyword' },
  { label: '\\begin{pmatrix}', type: 'keyword' },
  { label: '\\end{pmatrix}', type: 'keyword' },
  { label: '\\begin{cases}', type: 'keyword' },
  { label: '\\end{cases}', type: 'keyword' },
  { label: '\\begin{aligned}', type: 'keyword' },
  { label: '\\end{aligned}', type: 'keyword' },
  { label: '\\begin{split}', type: 'keyword' },
  { label: '\\end{split}', type: 'keyword' },

  // Math operators
  { label: '\\frac', type: 'keyword', detail: '{numerator}{denominator}' },
  { label: '\\sqrt', type: 'keyword', detail: '[n]{x}' },
  { label: '\\sum', type: 'keyword', detail: '_{i=1}^{n}' },
  { label: '\\prod', type: 'keyword', detail: '_{i=1}^{n}' },
  { label: '\\int', type: 'keyword', detail: '_{a}^{b}' },
  { label: '\\iint', type: 'keyword', detail: '_{a}^{b}' },
  { label: '\\oint', type: 'keyword', detail: '_{C}' },
  { label: '\\lim', type: 'keyword', detail: '_{x \\to 0}' },
  { label: '\\max', type: 'keyword', detail: '_{x}' },
  { label: '\\min', type: 'keyword', detail: '_{x}' },
  { label: '\\sup', type: 'keyword', detail: '_{x}' },
  { label: '\\inf', type: 'keyword', detail: '_{x}' },
  { label: '\\exp', type: 'keyword' },
  { label: '\\log', type: 'keyword', detail: '_{base}' },
  { label: '\\ln', type: 'keyword' },
  { label: '\\sin', type: 'keyword' },
  { label: '\\cos', type: 'keyword' },
  { label: '\\tan', type: 'keyword' },
  { label: '\\arcsin', type: 'keyword' },
  { label: '\\arccos', type: 'keyword' },
  { label: '\\arctan', type: 'keyword' },
  { label: '\\sinh', type: 'keyword' },
  { label: '\\cosh', type: 'keyword' },
  { label: '\\tanh', type: 'keyword' },
  { label: '\\cot', type: 'keyword' },
  { label: '\\sec', type: 'keyword' },
  { label: '\\csc', type: 'keyword' },

  // Greek letters
  { label: '\\alpha', type: 'keyword' },
  { label: '\\beta', type: 'keyword' },
  { label: '\\gamma', type: 'keyword' },
  { label: '\\Gamma', type: 'keyword' },
  { label: '\\delta', type: 'keyword' },
  { label: '\\Delta', type: 'keyword' },
  { label: '\\epsilon', type: 'keyword' },
  { label: '\\varepsilon', type: 'keyword' },
  { label: '\\zeta', type: 'keyword' },
  { label: '\\eta', type: 'keyword' },
  { label: '\\theta', type: 'keyword' },
  { label: '\\Theta', type: 'keyword' },
  { label: '\\iota', type: 'keyword' },
  { label: '\\kappa', type: 'keyword' },
  { label: '\\lambda', type: 'keyword' },
  { label: '\\Lambda', type: 'keyword' },
  { label: '\\mu', type: 'keyword' },
  { label: '\\nu', type: 'keyword' },
  { label: '\\xi', type: 'keyword' },
  { label: '\\Xi', type: 'keyword' },
  { label: '\\pi', type: 'keyword' },
  { label: '\\Pi', type: 'keyword' },
  { label: '\\rho', type: 'keyword' },
  { label: '\\sigma', type: 'keyword' },
  { label: '\\Sigma', type: 'keyword' },
  { label: '\\tau', type: 'keyword' },
  { label: '\\upsilon', type: 'keyword' },
  { label: '\\phi', type: 'keyword' },
  { label: '\\Phi', type: 'keyword' },
  { label: '\\varphi', type: 'keyword' },
  { label: '\\chi', type: 'keyword' },
  { label: '\\psi', type: 'keyword' },
  { label: '\\Psi', type: 'keyword' },
  { label: '\\omega', type: 'keyword' },
  { label: '\\Omega', type: 'keyword' },

  // Relations
  { label: '\\leq', type: 'keyword' },
  { label: '\\geq', type: 'keyword' },
  { label: '\\neq', type: 'keyword' },
  { label: '\\approx', type: 'keyword' },
  { label: '\\equiv', type: 'keyword' },
  { label: '\\sim', type: 'keyword' },
  { label: '\\simeq', type: 'keyword' },
  { label: '\\cong', type: 'keyword' },
  { label: '\\propto', type: 'keyword' },
  { label: '\\perp', type: 'keyword' },
  { label: '\\parallel', type: 'keyword' },
  { label: '\\in', type: 'keyword' },
  { label: '\\notin', type: 'keyword' },
  { label: '\\subset', type: 'keyword' },
  { label: '\\subseteq', type: 'keyword' },
  { label: '\\supset', type: 'keyword' },
  { label: '\\supseteq', type: 'keyword' },
  { label: '\\cup', type: 'keyword' },
  { label: '\\cap', type: 'keyword' },
  { label: '\\bigcup', type: 'keyword' },
  { label: '\\bigcap', type: 'keyword' },
  { label: '\\setminus', type: 'keyword' },
  { label: '\\times', type: 'keyword' },
  { label: '\\cdot', type: 'keyword' },
  { label: '\\circ', type: 'keyword' },
  { label: '\\oplus', type: 'keyword' },
  { label: '\\otimes', type: 'keyword' },

  // Arrows
  { label: '\\to', type: 'keyword' },
  { label: '\\rightarrow', type: 'keyword' },
  { label: '\\leftarrow', type: 'keyword' },
  { label: '\\Rightarrow', type: 'keyword' },
  { label: '\\Leftarrow', type: 'keyword' },
  { label: '\\leftrightarrow', type: 'keyword' },
  { label: '\\Leftrightarrow', type: 'keyword' },
  { label: '\\mapsto', type: 'keyword' },
  { label: '\\longmapsto', type: 'keyword' },
  { label: '\\implies', type: 'keyword' },
  { label: '\\iff', type: 'keyword' },
  { label: '\\uparrow', type: 'keyword' },
  { label: '\\downarrow', type: 'keyword' },
  { label: '\\Uparrow', type: 'keyword' },
  { label: '\\Downarrow', type: 'keyword' },

  // Dots
  { label: '\\ldots', type: 'keyword' },
  { label: '\\cdots', type: 'keyword' },
  { label: '\\vdots', type: 'keyword' },
  { label: '\\ddots', type: 'keyword' },

  // Other symbols
  { label: '\\infty', type: 'keyword' },
  { label: '\\partial', type: 'keyword' },
  { label: '\\nabla', type: 'keyword' },
  { label: '\\forall', type: 'keyword' },
  { label: '\\exists', type: 'keyword' },
  { label: '\\nexists', type: 'keyword' },
  { label: '\\emptyset', type: 'keyword' },
  { label: '\\varnothing', type: 'keyword' },
  { label: '\\pm', type: 'keyword' },
  { label: '\\mp', type: 'keyword' },
  { label: '\\dagger', type: 'keyword' },
  { label: '\\ddagger', type: 'keyword' },
  { label: '\\star', type: 'keyword' },
  { label: '\\ast', type: 'keyword' },
  { label: '\\prime', type: 'keyword' },
  { label: '\\degree', type: 'keyword' },
  { label: '\\angle', type: 'keyword' },
  { label: '\\triangle', type: 'keyword' },
  { label: '\\square', type: 'keyword' },
  { label: '\\copyright', type: 'keyword' },
  { label: '\\pounds', type: 'keyword' },

  // Spacing
  { label: '\\quad', type: 'keyword' },
  { label: '\\qquad', type: 'keyword' },
  { label: '\\,', type: 'keyword', detail: 'thin space' },
  { label: '\\;', type: 'keyword', detail: 'thick space' },
  { label: '\\:', type: 'keyword', detail: 'medium space' },
  { label: '\\!', type: 'keyword', detail: 'negative space' },
  { label: '\\hspace', type: 'keyword', detail: '{length}' },
  { label: '\\vspace', type: 'keyword', detail: '{length}' },

  // Lists
  { label: '\\begin{itemize}', type: 'keyword' },
  { label: '\\end{itemize}', type: 'keyword' },
  { label: '\\begin{enumerate}', type: 'keyword' },
  { label: '\\end{enumerate}', type: 'keyword' },
  { label: '\\begin{description}', type: 'keyword' },
  { label: '\\end{description}', type: 'keyword' },
  { label: '\\item', type: 'keyword', detail: ' ' },

  // Figures and tables
  { label: '\\begin{figure}', type: 'keyword' },
  { label: '\\end{figure}', type: 'keyword' },
  { label: '\\begin{figure*}', type: 'keyword' },
  { label: '\\end{figure*}', type: 'keyword' },
  { label: '\\begin{table}', type: 'keyword' },
  { label: '\\end{table}', type: 'keyword' },
  { label: '\\begin{table*}', type: 'keyword' },
  { label: '\\end{table*}', type: 'keyword' },
  { label: '\\begin{tabular}', type: 'keyword', detail: '{columns}' },
  { label: '\\end{tabular}', type: 'keyword' },
  { label: '\\begin{tabular*}', type: 'keyword' },
  { label: '\\end{tabular*}', type: 'keyword' },
  { label: '\\caption', type: 'keyword', detail: '{text}' },
  { label: '\\label', type: 'keyword', detail: '{key}' },
  { label: '\\ref', type: 'keyword', detail: '{key}' },
  { label: '\\eqref', type: 'keyword', detail: '{key}' },
  { label: '\\includegraphics', type: 'keyword', detail: '[options]{file}' },
  { label: '\\centering', type: 'keyword' },
  { label: '\\hline', type: 'keyword' },
  { label: '\\cline', type: 'keyword', detail: '{a-b}' },
  { label: '\\multicol', type: 'keyword', detail: '{n}{width}{text}' },
  { label: '\\multirow', type: 'keyword', detail: '{n}{width}{text}' },

  // Algorithm environments
  { label: '\\begin{algorithm}', type: 'keyword' },
  { label: '\\end{algorithm}', type: 'keyword' },
  { label: '\\begin{algorithmic}', type: 'keyword' },
  { label: '\\end{algorithmic}', type: 'keyword' },
  { label: '\\State', type: 'keyword', detail: '{statement}' },
  { label: '\\IF', type: 'keyword', detail: '{condition}' },
  { label: '\\ENDIF', type: 'keyword' },
  { label: '\\FOR', type: 'keyword', detail: '{condition}' },
  { label: '\\ENDFOR', type: 'keyword' },
  { label: '\\WHILE', type: 'keyword', detail: '{condition}' },
  { label: '\\ENDWHILE', type: 'keyword' },
  { label: '\\LOOP', type: 'keyword' },
  { label: '\\ENDLOOP', type: 'keyword' },
  { label: '\\REQUIRE', type: 'keyword', detail: '{condition}' },
  { label: '\\ENSURE', type: 'keyword', detail: '{condition}' },
  { label: '\\RETURN', type: 'keyword', detail: '{value}' },
  { label: '\\PRINT', type: 'keyword', detail: '{value}' },
  { label: '\\Comment', type: 'keyword', detail: '{text}' },

  // References
  { label: '\\cite', type: 'keyword', detail: '{key}' },
  { label: '\\citep', type: 'keyword', detail: '[pages]{key}' },
  { label: '\\citet', type: 'keyword', detail: '{key}' },
  { label: '\\citeauthor', type: 'keyword', detail: '{key}' },
  { label: '\\citeyear', type: 'keyword', detail: '{key}' },
  { label: '\\bibliography', type: 'keyword', detail: '{file}' },
  { label: '\\bibliographystyle', type: 'keyword', detail: '{style}' },

  // Document layout
  { label: '\\usepackage', type: 'keyword', detail: '{package}' },
  { label: '\\input', type: 'keyword', detail: '{file}' },
  { label: '\\include', type: 'keyword', detail: '{file}' },
  { label: '\\includeonly', type: 'keyword', detail: '{files}' },
  { label: '\\newcommand', type: 'keyword', detail: '{name}[args]{definition}' },
  { label: '\\renewcommand', type: 'keyword', detail: '{name}[args]{definition}' },
  { label: '\\providecommand', type: 'keyword', detail: '{name}[args]{definition}' },
  { label: '\\DeclareMathOperator', type: 'keyword', detail: '{\\name}{definition}' },
  { label: '\\def', type: 'keyword', detail: '{macro}{definition}' },
  { label: '\\let', type: 'keyword', detail: '{cmd1}{\\cmd2}' },
  { label: '\\if', type: 'keyword' },
  { label: '\\fi', type: 'keyword' },
  { label: '\\else', type: 'keyword' },
  { label: '\\elif', type: 'keyword' },

  // Page layout
  { label: '\\usepackage', type: 'keyword', detail: '{geometry}' },
  { label: '\\pagestyle', type: 'keyword', detail: '{plain/headings/empty}' },
  { label: '\\thispagestyle', type: 'keyword', detail: '{style}' },
  { label: '\\newpage', type: 'keyword' },
  { label: '\\clearpage', type: 'keyword' },
  { label: '\\pagebreak', type: 'keyword' },
  { label: '\\nopagebreak', type: 'keyword' },
  { label: '\\enlargethispage', type: 'keyword', detail: '{size}' },
  { label: '\\setlength', type: 'keyword', detail: '{\\length}{value}' },
  { label: '\\addtolength', type: 'keyword', detail: '{\\length}{value}' },

  // Math spacing and sizing
  { label: '\\displaystyle', type: 'keyword' },
  { label: '\\textstyle', type: 'keyword' },
  { label: '\\scriptstyle', type: 'keyword' },
  { label: '\\scriptscriptstyle', type: 'keyword' },
  { label: '\\big', type: 'keyword' },
  { label: '\\Big', type: 'keyword' },
  { label: '\\bigg', type: 'keyword' },
  { label: '\\Bigg', type: 'keyword' },
  { label: '\\left', type: 'keyword' },
  { label: '\\right', type: 'keyword' },
  { label: '\\bigl', type: 'keyword' },
  { label: '\\bigr', type: 'keyword' },
  { label: '\\Bigl', type: 'keyword' },
  { label: '\\Bigr', type: 'keyword' },
  { label: '\\biggl', type: 'keyword' },
  { label: '\\biggr', type: 'keyword' },
  { label: '\\Biggl', type: 'keyword' },
  { label: '\\Biggr', type: 'keyword' },

  // Accents
  { label: "\\'", type: 'keyword', detail: "acute" },
  { label: '\\`', type: 'keyword', detail: 'grave' },
  { label: '\\"', type: 'keyword', detail: 'umlaut' },
  { label: '\\^', type: 'keyword', detail: 'circumflex' },
  { label: '\\~', type: 'keyword', detail: 'tilde' },
  { label: '\\=', type: 'keyword', detail: 'macron' },
  { label: '\\.', type: 'keyword', detail: 'dot' },
  { label: '\\c', type: 'keyword', detail: 'cedilla' },
  { label: '\\u', type: 'keyword', detail: 'breve' },
  { label: '\\v', type: 'keyword', detail: 'caron' },
  { label: '\\H', type: 'keyword', detail: 'double acute' },
  { label: '\\t', type: 'keyword', detail: 'tie' },
  { label: '\\r', type: 'keyword', detail: 'ring' },
  { label: '\\b', type: 'keyword', detail: 'bar' },

  // Brackets and delimiters
  { label: '\\{', type: 'keyword' },
  { label: '\\}', type: 'keyword' },
  { label: '\\[', type: 'keyword' },
  { label: '\\]', type: 'keyword' },
  { label: '\\langle', type: 'keyword' },
  { label: '\\rangle', type: 'keyword' },
  { label: '\\lfloor', type: 'keyword' },
  { label: '\\rfloor', type: 'keyword' },
  { label: '\\lceil', type: 'keyword' },
  { label: '\\rceil', type: 'keyword' },
  { label: '\\vert', type: 'keyword' },
  { label: '\\Vert', type: 'keyword' },
  { label: '\\lvert', type: 'keyword' },
  { label: '\\rvert', type: 'keyword' },
  { label: '\\lVert', type: 'keyword' },
  { label: '\\rVert', type: 'keyword' },
];

/**
 * BibTeX citation key search completion
 * Triggers when user types @ followed by text
 */
export async function bibtexCompletion(context: CompletionContext) {
  // Match @ followed by optional text (citation key search)
  const match = context.matchBefore(/@[\w]*/);
  if (!match) return null;
  
  const query = match.text.slice(1); // Remove @
  
  // If no query yet, show a hint
  if (!query) {
    return {
      from: match.from,
      options: [{
        label: '@',
        detail: 'Search academic papers...',
        info: 'Type to search CrossRef for papers to cite',
        type: 'text',
        apply: '@',
      }],
      validFor: /^@[\w]*$/,
    };
  }
  
  try {
    const { items } = await searchBibtex(query, 8);
    
    if (items.length === 0) {
      return {
        from: match.from,
        options: [{
          label: `@${query}`,
          detail: 'No results found',
          type: 'text',
        }],
        validFor: /^@[\w]*$/,
      };
    }
    
    return {
      from: match.from,
      options: items.map((item: BibtexResult) => ({
        label: item.label, // e.g., @smith2024
        detail: item.detail, // truncated title
        info: item.info, // authors, year, journal
        type: 'text' as const,
        // Store the full bibtex for later use
        apply: item.label,
        // Custom data for insertion
        bibtex: item.bibtex,
        doi: item.doi,
        title: item.title,
      })),
      validFor: /^@[\w]*$/,
    };
  } catch (error) {
    console.error('BibTeX search failed:', error);
    return null;
  }
}

/**
 * Create a completion that inserts BibTeX citation
 * Returns the full citation text to insert
 */
export function createCitationCompletion(item: BibtexResult) {
  return {
    label: item.label,
    detail: `${item.authors} (${item.year})`,
    info: `${item.title}\n\nBibTeX:\n${item.bibtex}`,
    apply: () => item.bibtex,
  };
}