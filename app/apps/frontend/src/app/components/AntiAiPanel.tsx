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

interface DeepDimension {
  score: number;
  evidence: string;
}

interface DeepReport {
  mode: 'deep';
  aiProbability: number;
  confidence: string;
  dimensions: {
    lexicalDiversity: DeepDimension;
    argumentStructure: DeepDimension;
    sentenceVariation: DeepDimension;
    specificity: DeepDimension;
    transitionPatterns: DeepDimension;
  };
  flaggedPassages: Array<{ text: string; reason: string }>;
  humanTraits: string[];
  rewriteSuggestions: Array<{ original: string; suggested: string; reason: string }>;
  summary: string;
  error?: string;
}

interface GPTZeroReport {
  mode: 'gptzero';
  aiProbability?: number;
  humanProbability?: number;
  mixed?: boolean;
  sentences?: Array<{ text: string; aiScore: number }>;
  verdict?: string;
  details?: string;
  error?: string;
}

interface Props {
  report: AntiAiReport | null;
  deepReport: DeepReport | null;
  gptzeroReport: GPTZeroReport | null;
  loading: boolean;
  deepLoading: boolean;
  gptzeroLoading: boolean;
  onRunDetection?: () => void;
  onRunDeepDetection?: () => void;
  onRunGPTZero?: () => void;
}

const SEVERITY_COLORS: Record<string, string> = { high: '#ef4444', medium: '#f97316', low: '#eab308' };

function ScoreGauge({ score, label: customLabel }: { score: number; label?: string }) {
  const color = score <= 30 ? '#22c55e' : score <= 60 ? '#eab308' : '#ef4444';
  const label = customLabel || (score <= 30 ? 'Low AI' : score <= 60 ? 'Moderate' : 'High AI');
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

function DimensionBar({ name, score, evidence }: { name: string; score: number; evidence: string }) {
  const color = score <= 30 ? '#22c55e' : score <= 60 ? '#eab308' : '#ef4444';
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
        <span>{name}</span>
        <span style={{ color, fontWeight: 600 }}>{score}</span>
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{evidence}</div>
    </div>
  );
}

function DeepAnalysisView({ report }: { report: DeepReport }) {
  if (report.error) return <div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>Error: {report.error}</div>;

  const dimensionLabels: Record<string, string> = {
    lexicalDiversity: 'Lexical Diversity',
    argumentStructure: 'Argument Structure',
    sentenceVariation: 'Sentence Variation',
    specificity: 'Specificity',
    transitionPatterns: 'Transition Patterns',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ScoreGauge score={report.aiProbability} label={`${report.confidence} confidence`} />

      {/* Summary */}
      <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 12, lineHeight: 1.5 }}>
        {report.summary}
      </div>

      {/* Dimensions */}
      <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>📊 Analysis Dimensions</div>
        {report.dimensions && Object.entries(report.dimensions).map(([key, dim]) => (
          <DimensionBar key={key} name={dimensionLabels[key] || key} score={dim.score} evidence={dim.evidence} />
        ))}
      </div>

      {/* Flagged Passages */}
      {report.flaggedPassages?.length > 0 && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>🚩 Flagged Passages ({report.flaggedPassages.length})</div>
          {report.flaggedPassages.slice(0, 6).map((p, i) => (
            <div key={i} style={{ padding: '4px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 11 }}>
              <div style={{ color: '#ef4444', fontStyle: 'italic' }}>"{p.text}"</div>
              <div style={{ color: 'var(--muted)', marginTop: 2 }}>{p.reason}</div>
            </div>
          ))}
        </div>
      )}

      {/* Human Traits */}
      {report.humanTraits?.length > 0 && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>✅ Human Traits Detected</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {report.humanTraits.map((trait, i) => (
              <span key={i} style={{ padding: '2px 8px', borderRadius: 4, background: '#22c55e20', color: '#22c55e', fontSize: 11, border: '1px solid #22c55e40' }}>
                {trait}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rewrite Suggestions */}
      {report.rewriteSuggestions?.length > 0 && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>💡 Rewrite Suggestions</div>
          {report.rewriteSuggestions.slice(0, 5).map((s, i) => (
            <div key={i} style={{ padding: '4px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 11 }}>
              <div style={{ color: '#ef4444', textDecoration: 'line-through', opacity: 0.8 }}>{s.original}</div>
              <div style={{ color: '#22c55e', marginTop: 2 }}>→ {s.suggested}</div>
              <div style={{ color: 'var(--muted)', marginTop: 1, fontSize: 10 }}>{s.reason}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GPTZeroView({ report }: { report: GPTZeroReport }) {
  if (report.error) return <div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>Error: {report.error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {report.aiProbability != null && <ScoreGauge score={report.aiProbability} />}

      {report.verdict && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>Verdict</div>
          {report.verdict}
        </div>
      )}

      {/* Probabilities */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {report.aiProbability != null && (
          <div style={{ padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#ef4444' }}>{report.aiProbability}%</div>
            <div style={{ color: 'var(--muted)', fontSize: 10 }}>AI Probability</div>
          </div>
        )}
        {report.humanProbability != null && (
          <div style={{ padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#22c55e' }}>{report.humanProbability}%</div>
            <div style={{ color: 'var(--muted)', fontSize: 10 }}>Human Probability</div>
          </div>
        )}
      </div>

      {report.mixed && (
        <div style={{ padding: '6px 10px', background: '#eab30815', border: '1px solid #eab30840', borderRadius: 6, fontSize: 11, color: '#eab308' }}>
          Mixed content detected — parts may be AI-generated while others appear human-written.
        </div>
      )}

      {report.details && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          {report.details}
        </div>
      )}

      {/* Per-sentence breakdown */}
      {report.sentences && report.sentences.length > 0 && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Sentence Analysis ({report.sentences.length})</div>
          {report.sentences.slice(0, 10).map((s, i) => {
            const color = s.aiScore <= 30 ? '#22c55e' : s.aiScore <= 60 ? '#eab308' : '#ef4444';
            return (
              <div key={i} style={{ padding: '4px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ flex: 1, color: 'var(--fg)' }}>{s.text.slice(0, 100)}{s.text.length > 100 ? '...' : ''}</span>
                  <span style={{ color, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.aiScore}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AntiAiPanel({ report, deepReport, gptzeroReport, loading, deepLoading, gptzeroLoading, onRunDetection, onRunDeepDetection, onRunGPTZero }: Props) {
  const [expandedTerm, setExpandedTerm] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'quick' | 'deep' | 'gptzero'>('quick');

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, overflow: 'auto', maxHeight: '100%' }}>
      {/* Tab switcher + action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setActiveTab('quick')}
            style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: activeTab === 'quick' ? 'var(--accent)' : 'var(--bg-secondary)', color: activeTab === 'quick' ? '#fff' : 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Quick
          </button>
          <button onClick={() => setActiveTab('deep')}
            style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: activeTab === 'deep' ? '#8b5cf6' : 'var(--bg-secondary)', color: activeTab === 'deep' ? '#fff' : 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Deep
          </button>
          <button onClick={() => setActiveTab('gptzero')}
            style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: activeTab === 'gptzero' ? '#0ea5e9' : 'var(--bg-secondary)', color: activeTab === 'gptzero' ? '#fff' : 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            GPTZero
          </button>
          <div style={{ flex: 1 }} />
          {onRunDetection && activeTab === 'quick' && (
            <button onClick={onRunDetection} disabled={loading}
              style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 10, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? '...' : report ? 'Re-scan' : 'Scan'}
            </button>
          )}
          {onRunDeepDetection && activeTab === 'deep' && (
            <button onClick={onRunDeepDetection} disabled={deepLoading}
              style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #8b5cf640', background: 'transparent', color: '#8b5cf6', fontSize: 10, cursor: deepLoading ? 'not-allowed' : 'pointer' }}>
              {deepLoading ? '...' : deepReport ? 'Re-analyze' : 'Analyze'}
            </button>
          )}
          {onRunGPTZero && activeTab === 'gptzero' && (
            <button onClick={onRunGPTZero} disabled={gptzeroLoading}
              style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #0ea5e940', background: 'transparent', color: '#0ea5e9', fontSize: 10, cursor: gptzeroLoading ? 'not-allowed' : 'pointer' }}>
              {gptzeroLoading ? '...' : gptzeroReport ? 'Re-detect' : 'Detect'}
            </button>
          )}
        </div>

      {/* Quick tab */}
      {activeTab === 'quick' && (
        <>
          {loading && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
              <div className="typing-indicator"><span></span><span></span><span></span></div>
              <p style={{ fontSize: 12, marginTop: 8 }}>Scanning writing patterns...</p>
            </div>
          )}
          {!loading && report?.error && <div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>Error: {report.error}</div>}
          {!loading && report && !report.error && (
            <>
              <ScoreGauge score={report.overallScore} />
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
              {report.flaggedTerms?.length > 0 && (
                <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Flagged Terms ({report.flaggedTerms.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {report.flaggedTerms.map((term, i) => (
                      <button key={i} onClick={() => setExpandedTerm(expandedTerm === i ? null : i)}
                        style={{ padding: '2px 8px', borderRadius: 4, border: `1px solid ${SEVERITY_COLORS[term.severity]}40`, background: `${SEVERITY_COLORS[term.severity]}15`, color: SEVERITY_COLORS[term.severity], fontSize: 11, cursor: 'pointer', fontWeight: 500 }}>
                        {term.term} <span style={{ opacity: 0.7 }}>x{term.count}</span>
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
              {report.sentencePatterns?.length > 0 && (
                <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Patterns</div>
                  {report.sentencePatterns.map((p, i) => (
                    <div key={i} style={{ padding: '3px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{p.description}</span>
                      <span style={{ color: SEVERITY_COLORS[p.severity] || 'var(--muted)' }}>{p.frequency}x</span>
                    </div>
                  ))}
                </div>
              )}
              {report.suggestions?.length > 0 && (
                <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Suggestions</div>
                  {report.suggestions.slice(0, 8).map((s, i) => (
                    <div key={i} style={{ padding: '4px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
                      <div style={{ color: 'var(--muted)', fontSize: 10 }}>{s.location} — {s.reason}</div>
                      <div style={{ color: '#ef4444', textDecoration: 'line-through', opacity: 0.7 }}>{s.original.slice(0, 80)}</div>
                      <div style={{ color: '#22c55e', marginTop: 1 }}>→ {s.suggested.slice(0, 80)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {!loading && !report && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              No quick scan results yet. Click "Re-scan" above to start.
            </div>
          )}
        </>
      )}

      {/* Deep tab */}
      {activeTab === 'deep' && (
        <>
          {deepLoading && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
              <div className="typing-indicator"><span></span><span></span><span></span></div>
              <p style={{ fontSize: 12, marginTop: 8 }}>Running LLM deep analysis...</p>
            </div>
          )}
          {!deepLoading && deepReport && <DeepAnalysisView report={deepReport} />}
          {!deepLoading && !deepReport && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              Uses your configured LLM to analyze writing patterns at a semantic level. Click "Re-analyze" above to start.
            </div>
          )}
        </>
      )}

      {/* GPTZero tab */}
      {activeTab === 'gptzero' && (
        <>
          {gptzeroLoading && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
              <div className="typing-indicator"><span></span><span></span><span></span></div>
              <p style={{ fontSize: 12, marginTop: 8 }}>Running GPTZero detection via Playwright...</p>
              <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>This may take 15-30 seconds</p>
            </div>
          )}
          {!gptzeroLoading && gptzeroReport && <GPTZeroView report={gptzeroReport} />}
          {!gptzeroLoading && !gptzeroReport && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
              Uses Playwright to automate GPTZero's web interface. Click "Re-detect" above to start.
            </div>
          )}
        </>
      )}
    </div>
  );
}
