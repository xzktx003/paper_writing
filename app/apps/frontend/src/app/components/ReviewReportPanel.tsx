import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor';
  location: string;
  description: string;
  suggestion: string;
}

interface ReviewDimension {
  name: string;
  score: number;
  issues: ReviewIssue[];
}

interface ReviewReport {
  overallScore: number;
  decision: string;
  dimensions: ReviewDimension[];
  summary: string;
  revisionChecklist: Array<{ priority: number; action: string; section: string; done: boolean }>;
  error?: string;
  rawText?: string;
}

interface Props {
  report: ReviewReport | null;
  loading: boolean;
  onRunReview?: () => void;
}

const DECISION_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  accept: { bg: '#22c55e20', text: '#22c55e', label: '✅ Accept' },
  minor_revision: { bg: '#eab30820', text: '#eab308', label: '📝 Minor Revision' },
  major_revision: { bg: '#f9731620', text: '#f97316', label: '⚠️ Major Revision' },
  reject: { bg: '#ef444420', text: '#ef4444', label: '❌ Reject' },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  major: '#f97316',
  minor: '#eab308',
};

function ScoreRing({ score, size = 60 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={4} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fill="var(--text)" fontSize={size * 0.25} fontWeight={700} style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>{score}</text>
    </svg>
  );
}

export function ReviewReportPanel({ report, loading, onRunReview }: Props) {
  const [checklist, setChecklist] = useState<Record<number, boolean>>({});

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
        <div className="typing-indicator"><span></span><span></span><span></span></div>
        <p style={{ fontSize: 13, marginTop: 8 }}>Running peer review...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
        <p style={{ fontSize: 13 }}>No review report yet</p>
        {onRunReview && (
          <button onClick={onRunReview} style={{ marginTop: 10, padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            📋 Run Structured Review
          </button>
        )}
      </div>
    );
  }

  if (report.error) {
    return <div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>Error: {report.error}</div>;
  }

  const decision = DECISION_COLORS[report.decision] || DECISION_COLORS.major_revision;

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, overflow: 'auto', maxHeight: '100%' }}>
      {/* Score + Decision */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
        <ScoreRing score={report.overallScore} />
        <div>
          <div style={{ padding: '3px 10px', borderRadius: 6, background: decision.bg, color: decision.text, fontWeight: 700, fontSize: 12 }}>{decision.label}</div>
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>Overall Score: {report.overallScore}/100</div>
        </div>
      </div>

      {/* Dimensions */}
      {report.dimensions?.map((dim, i) => (
        <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{dim.name.replace(/_/g, ' ')}</span>
            <span style={{ color: dim.score >= 70 ? '#22c55e' : dim.score >= 50 ? '#eab308' : '#ef4444', fontWeight: 700 }}>{dim.score}/100</span>
          </div>
          {/* Score bar */}
          <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', marginBottom: 6 }}>
            <div style={{ height: '100%', width: `${dim.score}%`, borderRadius: 2, background: dim.score >= 70 ? '#22c55e' : dim.score >= 50 ? '#eab308' : '#ef4444', transition: 'width 0.3s' }} />
          </div>
          {dim.issues?.map((issue, j) => (
            <div key={j} style={{ padding: '4px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ padding: '1px 6px', borderRadius: 3, background: `${SEVERITY_COLORS[issue.severity]}20`, color: SEVERITY_COLORS[issue.severity], fontSize: 10, fontWeight: 600 }}>{issue.severity}</span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>{issue.location}</span>
              </div>
              <div style={{ marginTop: 2 }}>{issue.description}</div>
              {issue.suggestion && <div style={{ color: 'var(--accent-strong)', marginTop: 2, fontSize: 11 }}>💡 {issue.suggestion}</div>}
            </div>
          ))}
        </div>
      ))}

      {/* Summary */}
      {report.summary && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Summary</div>
          <div className="markdown-body" style={{ fontSize: 12, lineHeight: 1.5 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.summary}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Revision Checklist */}
      {report.revisionChecklist?.length > 0 && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Revision Checklist</div>
          {report.revisionChecklist.map((item, i) => (
            <label key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 12, cursor: 'pointer', opacity: checklist[i] ? 0.5 : 1 }}>
              <input type="checkbox" checked={checklist[i] || false} onChange={() => setChecklist(prev => ({ ...prev, [i]: !prev[i] }))} />
              <span style={{ textDecoration: checklist[i] ? 'line-through' : 'none' }}>
                <span style={{ color: 'var(--muted)', fontSize: 10 }}>#{item.priority}</span> [{item.section}] {item.action}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
