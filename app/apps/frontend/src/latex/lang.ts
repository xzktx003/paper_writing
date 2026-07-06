import { StreamLanguage, type StringStream } from '@codemirror/language';

type LatexState = {
  mathDelimiter: '$' | '$$' | '\\(' | '\\[' | null;
  pendingArgument: 'environment' | 'citation' | 'reference' | 'label' | 'package' | null;
};

const SECTION_COMMANDS = new Set(['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'title']);
const CITATION_COMMANDS = new Set(['cite', 'citep', 'citet', 'citealp', 'citeauthor', 'citeyear', 'parencite', 'textcite', 'autocite', 'nocite']);
const REFERENCE_COMMANDS = new Set(['ref', 'eqref', 'pageref', 'autoref', 'cref', 'Cref', 'hyperref']);
const PACKAGE_COMMANDS = new Set(['documentclass', 'usepackage', 'RequirePackage', 'bibliographystyle', 'bibliography', 'includegraphics', 'input', 'include']);
const DEFINITION_COMMANDS = new Set(['newcommand', 'renewcommand', 'providecommand', 'DeclareMathOperator', 'newenvironment', 'def', 'let']);
const MATH_COMMANDS = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'rho', 'sigma', 'tau', 'phi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega', 'sum', 'prod', 'int', 'iint', 'oint', 'frac', 'sqrt',
  'partial', 'nabla', 'infty', 'mathbb', 'mathbf', 'mathrm', 'mathcal', 'operatorname', 'left', 'right', 'begin', 'end',
]);

function argumentStyle(kind: NonNullable<LatexState['pendingArgument']>) {
  if (kind === 'environment' || kind === 'package') return 'typeName';
  if (kind === 'citation' || kind === 'reference') return 'link';
  return 'labelName';
}

const latexMode = {
  startState: (): LatexState => ({ mathDelimiter: null, pendingArgument: null }),

  token(stream: StringStream, state: LatexState): string | null {
    if (stream.match(/^%.*$/)) return 'comment';
    if (stream.eatSpace()) return null;

    if (state.pendingArgument) {
      if (stream.match(/^\{[^}]*\}/)) {
        const style = argumentStyle(state.pendingArgument);
        state.pendingArgument = null;
        return style;
      }
      state.pendingArgument = null;
    }

    if (stream.match(/^\$\$/)) {
      state.mathDelimiter = state.mathDelimiter === '$$' ? null : '$$';
      return 'operator';
    }
    if (stream.match(/^\$/)) {
      state.mathDelimiter = state.mathDelimiter === '$' ? null : '$';
      return 'operator';
    }
    if (stream.match(/^\\\[/)) {
      state.mathDelimiter = state.mathDelimiter === '\\[' ? null : '\\[';
      return 'operator';
    }
    if (stream.match(/^\\\]/)) {
      state.mathDelimiter = null;
      return 'operator';
    }
    if (stream.match(/^\\\(/)) {
      state.mathDelimiter = state.mathDelimiter === '\\(' ? null : '\\(';
      return 'operator';
    }
    if (stream.match(/^\\\)/)) {
      state.mathDelimiter = null;
      return 'operator';
    }

    const command = stream.match(/^\\([a-zA-Z@]+|.)/) as RegExpMatchArray | null;
    if (command) {
      const name = command[1];
      if (name === 'begin' || name === 'end') state.pendingArgument = 'environment';
      else if (CITATION_COMMANDS.has(name)) state.pendingArgument = 'citation';
      else if (REFERENCE_COMMANDS.has(name)) state.pendingArgument = 'reference';
      else if (name === 'label') state.pendingArgument = 'label';
      else if (PACKAGE_COMMANDS.has(name)) state.pendingArgument = 'package';

      if (SECTION_COMMANDS.has(name)) return 'heading';
      if (DEFINITION_COMMANDS.has(name)) return 'definitionKeyword';
      if (MATH_COMMANDS.has(name) || state.mathDelimiter) return 'atom';
      if (CITATION_COMMANDS.has(name) || REFERENCE_COMMANDS.has(name)) return 'link';
      if (PACKAGE_COMMANDS.has(name)) return 'typeName';
      return 'keyword';
    }

    if (stream.match(/^(?:https?:\/\/|doi:)[^\s{}]+/i)) return 'url';
    if (stream.match(/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i)) return 'number';
    if (stream.match(/^[{}[\]]/)) return 'bracket';
    if (stream.match(/^[&_^~#+=<>*/|!-]+/)) return 'operator';

    if (state.mathDelimiter) {
      if (stream.match(/^[a-zA-Z]+/)) return 'variableName';
      stream.next();
      return 'atom';
    }

    stream.next();
    return null;
  },
};

export function latex() {
  return StreamLanguage.define(latexMode);
}
