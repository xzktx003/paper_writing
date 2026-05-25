import React, { useState } from 'react';

interface FlaggedTerm {
  term: string;
  count: number;
  severity: 'high' | 'medium' | 'low';
  locations: Array<{ line: number; column: number; context: string }>;
}

interface SentencePattern {
  pattern: string;
  description: string;
  frequency: number;
  severity: string;
  examples: string[];
}

interface Suggestion {
  location: string;
  original: string;
  suggested: string;
  reason: string;
}

interface AntiAiReport {
  overallScore: number;
  flaggedTerms: FlaggedTerm[];
  sentencePatterns: SentencePattern[];
  vocabularyDiversity: { typeTokenRatio: number; totalWords: number; uniqueWords: number };
  sentenceVariety: { avg: number; stdDev: number; min: number; max: number; count: number };
  paragraphUniformity: { score: number; count: number; avgLen: number };
  suggestions: Suggestion[];
  wordCount: number;
  error?: string;
}

interface Props {
  report: AntiAiReport | null;
  loading: boolean;
  onRunDetection?: () => void;
}

const SEVERITY_COLORS: Record<string, string> = { high: '#ef4444', medium: '#f97316', low: '#eab308' };

function ScoreGauge({ score }: { score: number }) {
  const color = score <= 30 ? '#22c55e' : score <= 60 ? '#eab308' : '#ef4444';
  const label = score <= 30 ? 'Low AI' : score <= 60 ? 'Moderate' : 'High AI';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
      <div style={{ position: 'relative', width: 60, height: 60 }}>
        <svg width={60} height={60} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={30} cy={30} r={26} fill="none" stroke="var(--border)" strokeWidth={4} />
          <circle cx={30} cy={30} r={26} fill="none" stroke={color} strokeWidth={4} strokeDasharray={163.36} strokeDashoffset={163.36 - (score / 100) * 163.36} strokeLinecap="round" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color }}>{score}</div>
      </div>
      <div>
        <div style={{ fontWeight: 700, color, fontSize: 14 }}>{label}</div>
        <div style={{ color: 'var(--muted)', fontSize: 11 }}>AI Writing Detection Score</div>
      </div>
    </div>
  );
}

export function AntiAiPanel({ report, loading, onRunDetection }: Props) {
  const [expandedTerm, setExpandedTerm] = useState<number | null>(null);

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
        <div className="typing-indicator"><span></span><span></span><span></span></div>
        <p style={{ fontSize: 13, marginTop: 8 }}>Analyzing writing patterns...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
        <p style={{ fontSize: 13 }}>No anti-AI analysis yet</p>
        {onRunDetection && (
          <button onClick={onRunDetection} style={{ marginTop: 10, padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            🔍 Run Anti-AI Detection
          </button>
        )}
      </div>
    );
  }

  if (report.error) return <div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>Error: {report.error}</div>;

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, overflow: 'auto', maxHeight: '100%' }}>
      <ScoreGauge score={report.overallScore} />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {[
          { label: 'Words', value: report.wordCount },
          { label: 'Avg Sent.', value: `${report.sentenceVariety?.avg || 0}w` },
          { label: 'Uniformity', value: `${report.paragraphUniformity?.score || 0}%` },
        ].map((s, i) => (
          <div key={i} style={{ padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{s.value}</div>
            <div style={{ color: 'var(--muted)', fontSize: 10 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Flagged Terms */}
      {report.flaggedTerms?.length > 0 && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>🚩 Flagged Terms ({report.flaggedTerms.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {report.flaggedTerms.map((term, i) => (
              <button key={i} onClick={() => setExpandedTerm(expandedTerm === i ? null : i)}
                style={{ padding: '2px 8px', borderRadius: 4, border: `1px solid ${SEVERITY_COLORS[term.severity]}40`, background: `${SEVERITY_COLORS[term.severity]}15`, color: SEVERITY_COLORS[term.severity], fontSize: 11, cursor: 'pointer', fontWeight: 500 }}>
                {term.term} <span style={{ opacity: 0.7 }}>×{term.count}</span>
              </button>
            ))}
          </div>
          {expandedTerm !== null && report.flaggedTerms[expandedTerm] && (
            <div style={{ marginTop: 6, padding: 6, background: 'var(--paper)', borderRadius: 4, fontSize: 11 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Locations:</div>
              {report.flaggedTerms[expandedTerm].locations.slice(0, 5).map((loc, j) => (
                <div key={j} style={{ color: 'var(--muted)' }}>Line {loc.line}: {loc.context.slice(0, 80)}...</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sentence Patterns */}
      {report.sentencePatterns?.length > 0 && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>📐 Patterns</div>
          {report.sentencePatterns.map((p, i) => (
            <div key={i} style={{ padding: '3px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span>{p.description}</span>
              <span style={{ color: SEVERITY_COLORS[p.severity] || 'var(--muted)' }}>{p.frequency}×</span>
            </div>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {report.suggestions?.length > 0 && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>💡 Suggestions</div>
          {report.suggestions.slice(0, 8).map((s, i) => (
            <div key={i} style={{ padding: '4px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
              <div style={{ color: 'var(--muted)', fontSize: 10 }}>{s.location} — {s.reason}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <span style={{ color: '#ef4444', flex: 1, textDecoration: 'line-through', opacity: 0.7 }}>{s.original.slice(0, 80)}</span>
              </div>
              <div style={{ color: '#22c55e', marginTop: 1 }}>→ {s.suggested.slice(0, 80)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
