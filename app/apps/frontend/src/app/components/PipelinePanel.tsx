import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { listPipelineTypes, startPipeline, runPipelineStage, advancePipeline, getPipelineStatus } from '../api/conversationApi';
import { InlineDiffViewer } from './InlineDiffViewer';
import { ReviewReportPanel } from './ReviewReportPanel';

interface PipelineStage {
  name: string;
  skill: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output: string | null;
  error: string | null;
}

interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
  currentStage: number;
  status: string;
}

interface PipelineType {
  id: string;
  name: string;
  description: string;
  stages: Array<{ name: string; description: string }>;
}

interface Props {
  projectPath: string;
  chapterScope?: string;
}

const STAGE_ICONS: Record<string, string> = { pending: '○', running: '⟳', completed: '✓', failed: '✗' };
const STAGE_COLORS: Record<string, string> = { pending: 'var(--muted)', running: 'var(--accent)', completed: '#22c55e', failed: '#ef4444' };

export function PipelinePanel({ projectPath, chapterScope }: Props) {
  const [pipelineTypes, setPipelineTypes] = useState<PipelineType[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [runningStage, setRunningStage] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [selectedType, setSelectedType] = useState('paper-pipeline');

  useEffect(() => {
    listPipelineTypes().then(setPipelineTypes).catch(() => {});
  }, []);

  const handleStart = async () => {
    const result = await startPipeline(selectedType, projectPath, chapterScope);
    if (!result.error) setPipeline(result);
  };

  const handleRunStage = async () => {
    if (!pipeline) return;
    setRunningStage(true);
    const result = await runPipelineStage(pipeline.id);
    setRunningStage(false);
    if (!result.error) {
      setPipeline(prev => prev ? { ...prev, stages: prev.stages.map((s, i) => i === prev.currentStage ? { ...s, status: 'completed', output: result.output } : s) } : null);
    }
  };

  const handleAdvance = async (approved: boolean) => {
    if (!pipeline) return;
    const result = await advancePipeline(pipeline.id, approved, feedback);
    if (!result.error) setPipeline(result);
    setFeedback('');
  };

  // Pipeline selector view
  if (!pipeline) {
    return (
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>📋 Paper Pipeline</div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>Automated multi-stage writing workflow</div>
        <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--text)', fontSize: 12 }}>
          {pipelineTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
        </select>
        {pipelineTypes.find(p => p.id === selectedType)?.stages.map((s, i) => (
          <div key={i} style={{ padding: '4px 8px', background: 'var(--bg-secondary)', borderRadius: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--muted)' }}>{i + 1}.</span> {s.description}
          </div>
        ))}
        <button onClick={handleStart} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          ▶ Start Pipeline
        </button>
      </div>
    );
  }

  const currentStage = pipeline.stages[pipeline.currentStage];
  const isCompleted = pipeline.status === 'completed';

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, overflow: 'auto', maxHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>{pipeline.name}</div>
        <span style={{ padding: '2px 8px', borderRadius: 4, background: isCompleted ? '#22c55e20' : 'var(--accent-soft)', color: isCompleted ? '#22c55e' : 'var(--accent-strong)', fontSize: 11, fontWeight: 600 }}>
          {isCompleted ? '✓ Done' : `Stage ${pipeline.currentStage + 1}/${pipeline.stages.length}`}
        </span>
      </div>

      {/* Stage progress bar */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {pipeline.stages.map((stage, i) => (
          <React.Fragment key={i}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${STAGE_COLORS[stage.status]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: STAGE_COLORS[stage.status], fontWeight: 700, background: stage.status === 'completed' ? `${STAGE_COLORS[stage.status]}15` : 'transparent' }}>
              {STAGE_ICONS[stage.status]}
            </div>
            {i < pipeline.stages.length - 1 && <div style={{ flex: 1, height: 2, background: stage.status === 'completed' ? '#22c55e' : 'var(--border)', borderRadius: 1 }} />}
          </React.Fragment>
        ))}
      </div>

      {/* Current stage */}
      {currentStage && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{currentStage.name}</div>
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{currentStage.description}</div>
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>Skill: <code>{currentStage.skill}</code></div>
        </div>
      )}

      {/* Stage output */}
      {currentStage?.output && (
        <div style={{ maxHeight: 300, overflow: 'auto' }}>
          {currentStage.name === 'review' ? (
            <ReviewReportPanel report={parseReviewOutput(currentStage.output)} loading={false} />
          ) : (
            <div style={{ padding: 8, background: 'var(--paper)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, lineHeight: 1.5, maxHeight: 250, overflow: 'auto' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentStage.output}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {/* Completed stages summary */}
      {pipeline.stages.filter(s => s.status === 'completed' && s.output).length > 1 && (
        <details style={{ padding: '4px 8px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Previous stages ({pipeline.stages.filter(s => s.status === 'completed').length - 1})</summary>
          {pipeline.stages.filter(s => s.status === 'completed' && s !== currentStage).map((s, i) => (
            <div key={i} style={{ padding: '4px 0', borderTop: '1px solid var(--border)', fontSize: 11 }}>
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{s.name}</span>
              <div style={{ color: 'var(--muted)', maxHeight: 80, overflow: 'auto', marginTop: 2 }}>{s.output?.slice(0, 200)}...</div>
            </div>
          ))}
        </details>
      )}

      {/* Actions */}
      {!isCompleted && currentStage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {currentStage.output ? (
            <>
              <textarea value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Optional feedback for revision..." style={{ width: '100%', minHeight: 48, padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--text)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => handleAdvance(true)} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✓ Approve & Next</button>
                <button onClick={() => handleAdvance(false)} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>↻ Revise & Retry</button>
              </div>
            </>
          ) : (
            <button onClick={handleRunStage} disabled={runningStage}
              style={{ padding: '8px 0', borderRadius: 6, border: 'none', background: runningStage ? 'var(--muted)' : 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: runningStage ? 'default' : 'pointer' }}>
              {runningStage ? '⟳ Running...' : `▶ Run ${currentStage.name}`}
            </button>
          )}
        </div>
      )}

      {isCompleted && (
        <div style={{ padding: 10, background: '#22c55e15', borderRadius: 6, color: '#22c55e', textAlign: 'center', fontWeight: 600 }}>
          ✅ Pipeline completed! All stages finished.
        </div>
      )}
    </div>
  );
}

function parseReviewOutput(output: string): any {
  try { return JSON.parse(output); } catch {
    const match = output.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) try { return JSON.parse(match[1]); } catch {}
    return { overallScore: 0, decision: 'major_revision', dimensions: [], summary: output, revisionChecklist: [] };
  }
}
