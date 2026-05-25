import React, { useRef, useEffect, useState, useCallback } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface Props {
  latex: string;
  onSave: (latex: string) => void;
  onCancel: () => void;
  position: { top: number; left: number };
}

// Common LaTeX symbols organized by category
const SYMBOL_PANELS = [
  {
    label: 'Greek',
    symbols: [
      '\\alpha', '\\beta', '\\gamma', '\\delta', '\\epsilon', '\\zeta', '\\eta', '\\theta',
      '\\iota', '\\kappa', '\\lambda', '\\mu', '\\nu', '\\xi', '\\pi', '\\rho',
      '\\sigma', '\\tau', '\\upsilon', '\\phi', '\\chi', '\\psi', '\\omega',
      '\\Alpha', '\\Beta', '\\Gamma', '\\Delta', '\\Theta', '\\Lambda', '\\Xi', '\\Pi',
      '\\Sigma', '\\Phi', '\\Psi', '\\Omega',
    ],
  },
  {
    label: 'Operators',
    symbols: [
      '\\pm', '\\mp', '\\times', '\\div', '\\cdot', '\\ast', '\\star', '\\circ',
      '\\bullet', '\\oplus', '\\otimes', '\\leq', '\\geq', '\\neq', '\\approx', '\\sim',
      '\\equiv', '\\propto', '\\ll', '\\gg', '\\subset', '\\supset', '\\in', '\\notin',
      '\\cup', '\\cap', '\\emptyset', '\\forall', '\\exists', '\\neg',
    ],
  },
  {
    label: 'Arrows',
    symbols: [
      '\\leftarrow', '\\rightarrow', '\\leftrightarrow', '\\Leftarrow', '\\Rightarrow',
      '\\Leftrightarrow', '\\uparrow', '\\downarrow', '\\mapsto', '\\hookrightarrow',
      '\\nearrow', '\\searrow', '\\swarrow', '\\nwarrow',
    ],
  },
  {
    label: 'Decorations',
    symbols: [
      '\\hat{a}', '\\bar{a}', '\\tilde{a}', '\\vec{a}', '\\dot{a}', '\\ddot{a}',
      '\\mathbf{x}', '\\mathbb{R}', '\\mathcal{L}', '\\mathfrak{g}',
      '\\overline{x}', '\\underline{x}', '\\overbrace{x}', '\\underbrace{x}',
    ],
  },
  {
    label: 'Structures',
    symbols: [
      '\\frac{a}{b}', '\\sqrt{x}', '\\sqrt[n]{x}', '\\sum_{i=1}^{n}', '\\prod_{i=1}^{n}',
      '\\int_{a}^{b}', '\\oint', '\\iint', '\\iiint',
      '\\lim_{x \\to 0}', '\\binom{n}{k}', '\\begin{pmatrix} a \\\\ b \\end{pmatrix}',
      '\\begin{bmatrix} a \\\\ b \\end{bmatrix}', '\\begin{cases} a & b \\\\ c & d \\end{cases}',
    ],
  },
];

function renderPreview(latex: string): string {
  try {
    return katex.renderToString(latex.trim(), {
      displayMode: true,
      throwOnError: false,
      trust: true,
    });
  } catch {
    return '<span style="color: #ef4444;">Invalid LaTeX</span>';
  }
}

export function MathLiveEditor({ latex, onSave, onCancel, position }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(latex);
  const [activeTab, setActiveTab] = useState(0);
  const [showSymbols, setShowSymbols] = useState(false);

  const preview = renderPreview(value);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(value);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onCancel, onSave, value]);

  const insertSymbol = useCallback((sym: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = value.slice(0, start) + sym + value.slice(end);
    setValue(newVal);
    // Place cursor inside the braces if applicable
    const bracePos = sym.indexOf('{}');
    if (bracePos >= 0) {
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + bracePos + 1;
        ta.focus();
      });
    }
  }, [value]);

  // Clamp position to viewport
  const top = Math.min(position.top, window.innerHeight - 420);
  const left = Math.min(position.left, window.innerWidth - 420);

  return (
    <div
      ref={overlayRef}
      className="math-live-editor-popup"
      style={{
        position: 'fixed',
        top: Math.max(8, top),
        left: Math.max(8, left),
        zIndex: 10000,
        background: 'var(--panel, #fff)',
        border: '1px solid var(--border, #e0e0e0)',
        borderRadius: '10px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        padding: '14px',
        width: '400px',
        maxHeight: '80vh',
        overflow: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text, #333)' }}>✏️ Formula Editor</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setShowSymbols(v => !v)}
            style={{
              fontSize: '11px', border: '1px solid var(--border, #e0e0e0)', borderRadius: '6px',
              padding: '3px 8px', cursor: 'pointer', background: showSymbols ? 'var(--accent-soft, #e8f4fd)' : 'transparent',
              color: 'var(--accent-strong, #0066cc)', fontWeight: 500,
            }}
          >
            {showSymbols ? 'Hide Symbols' : 'Symbols'}
          </button>
        </div>
      </div>

      {/* Symbol panel */}
      {showSymbols && (
        <div style={{ marginBottom: '10px', border: '1px solid var(--border, #e0e0e0)', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border, #e0e0e0)', background: 'var(--panel-muted, #f8f8f8)' }}>
            {SYMBOL_PANELS.map((panel, i) => (
              <button
                key={panel.label}
                onClick={() => setActiveTab(i)}
                style={{
                  flex: 1, padding: '5px 4px', fontSize: '10px', border: 'none', cursor: 'pointer',
                  background: activeTab === i ? 'var(--panel, #fff)' : 'transparent',
                  color: activeTab === i ? 'var(--accent-strong, #0066cc)' : 'var(--text-secondary, #888)',
                  fontWeight: activeTab === i ? 600 : 400,
                  borderBottom: activeTab === i ? '2px solid var(--accent, #0066cc)' : '2px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                {panel.label}
              </button>
            ))}
          </div>
          <div style={{ padding: '6px', display: 'flex', flexWrap: 'wrap', gap: '3px', maxHeight: '120px', overflow: 'auto' }}>
            {SYMBOL_PANELS[activeTab].symbols.map((sym) => (
              <button
                key={sym}
                onClick={() => insertSymbol(sym)}
                title={sym}
                style={{
                  padding: '3px 6px', fontSize: '11px', border: '1px solid var(--border, #e0e0e0)',
                  borderRadius: '4px', cursor: 'pointer', background: 'var(--paper, #fff)',
                  color: 'var(--text, #333)', transition: 'all 0.12s', lineHeight: 1.2,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent, #0066cc)'; e.currentTarget.style.background = 'var(--accent-soft, #e8f4fd)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #e0e0e0)'; e.currentTarget.style.background = 'var(--paper, #fff)'; }}
              >
                {sym.replace(/\\/g, '').replace(/[{}]/g, '')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%',
          minHeight: '60px',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: '13px',
          padding: '8px 10px',
          border: '1px solid var(--border, #e0e0e0)',
          borderRadius: '6px',
          resize: 'vertical',
          background: 'var(--bg, #fafafa)',
          color: 'var(--text, #333)',
          outline: 'none',
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent, #0066cc)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border, #e0e0e0)')}
      />

      {/* Live preview */}
      <div
        className="math-live-preview"
        style={{
          textAlign: 'center',
          padding: '10px',
          marginTop: '8px',
          borderTop: '1px solid var(--border, #e0e0e0)',
          borderRadius: '6px',
          background: 'var(--paper, #fff)',
          minHeight: '40px',
          fontSize: '15px',
        }}
        dangerouslySetInnerHTML={{ __html: preview }}
      />

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '10px' }}>
        <span style={{ fontSize: '10px', color: 'var(--muted, #aaa)', alignSelf: 'center', marginRight: 'auto' }}>
          ⌘+Enter to save
        </span>
        <button
          onClick={onCancel}
          style={{
            fontSize: '12px', padding: '5px 14px', borderRadius: '6px', border: '1px solid var(--border, #e0e0e0)',
            background: 'transparent', color: 'var(--text-secondary, #888)', cursor: 'pointer', fontWeight: 500,
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(value)}
          style={{
            fontSize: '12px', padding: '5px 14px', borderRadius: '6px', border: 'none',
            background: 'var(--accent, #0066cc)', color: '#fff', cursor: 'pointer', fontWeight: 600,
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
