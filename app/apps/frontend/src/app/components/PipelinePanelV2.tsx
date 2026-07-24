import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import {
  listPipelinePresets,
  startPipelineV2,
  runPipelineV2Stage,
  resolvePipelineV2,
  retryPipelineV2,
  skipPipelineV2Stage,
  pausePipelineV2,
  resumePipelineV2,
  getPipelineV2Status,
} from '../api/conversationApi';
import type { PipelinePreset, PipelineV2, PipelineStageV2 } from '../api/conversationApi';
import { managedProjectRequest } from '../api/projectRequestContext';

interface Props {
  projectId: string;
  chapterScope?: string;
}

const TYPE_ICONS: Record<string, string> = {
  ai: '🤖',
  compute: '⚙️',
  human: '👤',
  citation: '📚',
  compile: '📄',
};

const STATUS_ICONS: Record<string, string> = {
  pending: '○',
  running: '⟳',
  waiting: '⏸',
  completed: '✓',
  failed: '✗',
  skipped: '⊘',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--muted)',
  running: 'var(--accent)',
  waiting: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4444',
  skipped: '#94a3b8',
};

export function PipelinePanelV2({ projectId, chapterScope }: Props) {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<PipelinePreset[]>([]);
  const [pipeline, setPipeline] = useState<PipelineV2 | null>(null);
  const [selectedPreset, setSelectedPreset] = useState('paper-pipeline');
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [expandedStage, setExpandedStage] = useState<number | null>(null);

  useEffect(() => {
    listPipelinePresets()
      .then(res => setPresets(res.presets || []))
      .catch(err => console.error('Failed to load pipeline presets:', err));
  }, []);

  const handleStart = useCallback(async () => {
    const result = await startPipelineV2(selectedPreset, managedProjectRequest(projectId), chapterScope);
    if (!('error' in result)) setPipeline(result);
  }, [selectedPreset, projectId, chapterScope]);

  const handleRunStage = useCallback(async () => {
    if (!pipeline) return;
    setRunning(true);
    try {
      await runPipelineV2Stage(pipeline.id);
      const updated = await getPipelineV2Status(pipeline.id);
      setPipeline(updated);
    } catch (err) {
      console.error('Stage run failed:', err);
    }
    setRunning(false);
  }, [pipeline]);

  const handleResolve = useCallback(async (action: string) => {
    if (!pipeline) return;
    setRunning(true);
    try {
      await resolvePipelineV2(pipeline.id, action, feedback || undefined);
      const updated = await getPipelineV2Status(pipeline.id);
      setPipeline(updated);
      setFeedback('');
    } catch (err) {
      console.error('Resolve failed:', err);
    }
    setRunning(false);
  }, [pipeline, feedback]);

  const handleRetry = useCallback(async () => {
    if (!pipeline) return;
    setRunning(true);
    try {
      await retryPipelineV2(pipeline.id, feedback || undefined);
      const updated = await getPipelineV2Status(pipeline.id);
      setPipeline(updated);
      setFeedback('');
    } catch (err) {
      console.error('Retry failed:', err);
    }
    setRunning(false);
  }, [pipeline, feedback]);

  const handleSkip = useCallback(async () => {
    if (!pipeline) return;
    await skipPipelineV2Stage(pipeline.id);
    const updated = await getPipelineV2Status(pipeline.id);
    setPipeline(updated);
  }, [pipeline]);

  const handlePauseResume = useCallback(async () => {
    if (!pipeline) return;
    if (pipeline.status === 'paused') {
      await resumePipelineV2(pipeline.id);
    } else {
      await pausePipelineV2(pipeline.id);
    }
    const updated = await getPipelineV2Status(pipeline.id);
    setPipeline(updated);
  }, [pipeline]);

  const handleReset = () => setPipeline(null);

  // Preset selector view
  if (!pipeline) {
    const selected = presets.find(p => p.id === selectedPreset);
    return (
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>⚡ Pipeline 2.0</div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{t('Composable multi-stage workflows with typed executors')}</div>

        <select
          value={selectedPreset}
          onChange={e => setSelectedPreset(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--text)', fontSize: 12 }}
        >
          {presets.map(p => <option key={p.id} value={p.id}>{p.name} — {p.description}</option>)}
        </select>

        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {selected.stages.map((s, i) => (
              <div key={i} style={{ padding: '4px 8px', background: 'var(--bg-secondary)', borderRadius: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11 }}>{TYPE_ICONS[s.type] || '?'}</span>
                <span style={{ fontWeight: 500 }}>{s.name}</span>
                <span style={{ color: 'var(--muted)', marginLeft: 'auto', fontSize: 10 }}>{t(s.type)}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleStart}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          ▶ {t('Start Pipeline')}
        </button>
      </div>
    );
  }

  const currentStage = pipeline.stages[pipeline.currentStage];
  const isCompleted = pipeline.status === 'completed';
  const isFailed = pipeline.status === 'failed';
  const isWaiting = pipeline.status === 'waiting';
  const isPaused = pipeline.status === 'paused';

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, overflow: 'auto', maxHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>{pipeline.name}</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{
            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: isCompleted ? '#22c55e20' : isFailed ? '#ef444420' : isWaiting ? '#f59e0b20' : 'var(--accent-soft)',
            color: isCompleted ? '#22c55e' : isFailed ? '#ef4444' : isWaiting ? '#f59e0b' : 'var(--accent-strong)',
          }}>
            {isCompleted ? `✓ ${t('Done')}` : isFailed ? `✗ ${t('Failed')}` : isWaiting ? `⏸ ${t('Waiting')}` : isPaused ? `⏸ ${t('Paused')}` : `${pipeline.currentStage + 1}/${pipeline.stages.length}`}
          </span>
          <button onClick={handleReset} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--muted)', padding: '2px 4px' }} title={t('New pipeline')}>✕</button>
        </div>
      </div>

      {/* Stage progress */}
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        {pipeline.stages.map((stage, i) => (
          <React.Fragment key={i}>
            <div
              onClick={() => setExpandedStage(expandedStage === i ? null : i)}
              style={{
                width: 26, height: 26, borderRadius: '50%',
                border: `2px solid ${STATUS_COLORS[stage.status]}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: STATUS_COLORS[stage.status], fontWeight: 700,
                background: stage.status === 'completed' ? `${STATUS_COLORS[stage.status]}15` : stage.status === 'waiting' ? '#f59e0b15' : 'transparent',
                cursor: 'pointer', transition: 'transform 0.15s',
                transform: expandedStage === i ? 'scale(1.2)' : 'scale(1)',
              }}
              title={`${stage.name} (${stage.type})`}
            >
              {STATUS_ICONS[stage.status]}
            </div>
            {i < pipeline.stages.length - 1 && (
              <div style={{ width: 12, height: 2, background: stage.status === 'completed' || stage.status === 'skipped' ? '#22c55e' : 'var(--border)', borderRadius: 1 }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Expanded stage detail */}
      {expandedStage !== null && pipeline.stages[expandedStage] && (
        <StageDetail stage={pipeline.stages[expandedStage]} />
      )}

      {/* Current stage info */}
      {currentStage && !isCompleted && (
        <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13 }}>{TYPE_ICONS[currentStage.type]}</span>
            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{currentStage.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}>{t(currentStage.type)}</span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>{currentStage.description}</div>
        </div>
      )}

      {/* Stage output display */}
      {currentStage?.output && (
        <div style={{ maxHeight: 250, overflow: 'auto', padding: 8, background: 'var(--paper)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, lineHeight: 1.5 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentStage.output}</ReactMarkdown>
        </div>
      )}

      {/* Error display */}
      {currentStage?.error && (
        <div style={{ padding: 8, background: '#ef444415', borderRadius: 6, border: '1px solid #ef444440', fontSize: 12, color: '#ef4444' }}>
          {currentStage.error}
        </div>
      )}

      {/* Actions */}
      {!isCompleted && currentStage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Human checkpoint actions */}
          {isWaiting && currentStage.type === 'human' && (
            <>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder={t('Optional feedback or edits...')}
                style={{ width: '100%', minHeight: 48, padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--text)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(currentStage.metadata?.actions || ['approve', 'reject', 'skip']).map((action: string) => (
                  <button
                    key={action}
                    onClick={() => handleResolve(action)}
                    disabled={running}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', minWidth: 60,
                      border: action === 'approve' ? 'none' : '1px solid var(--border)',
                      background: action === 'approve' ? '#22c55e' : action === 'reject' ? '#ef444420' : 'var(--paper)',
                      color: action === 'approve' ? '#fff' : action === 'reject' ? '#ef4444' : 'var(--text)',
                    }}
                  >
                    {action === 'approve' ? `✓ ${t('Approve')}` : action === 'reject' ? `✗ ${t('Reject')}` : action === 'skip' ? `⊘ ${t('Skip')}` : action === 'edit' ? `✎ ${t('Edit')}` : t(action)}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Failed stage actions */}
          {isFailed && (
            <>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder={t('Feedback for retry...')}
                style={{ width: '100%', minHeight: 36, padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--text)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={handleRetry} disabled={running} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  ↻ {t('Retry')}
                </button>
                <button onClick={handleSkip} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--text)', fontSize: 11, cursor: 'pointer' }}>
                  ⊘ {t('Skip')}
                </button>
              </div>
            </>
          )}

          {/* Normal run action */}
          {pipeline.status === 'running' && currentStage.status === 'running' && !currentStage.output && (
            <button
              onClick={handleRunStage}
              disabled={running}
              style={{ padding: '8px 0', borderRadius: 6, border: 'none', background: running ? 'var(--muted)' : 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: running ? 'default' : 'pointer' }}
            >
              {running ? `⟳ ${t('Running...')}` : `▶ ${t('Run {{name}}', { name: currentStage.name })}`}
            </button>
          )}

          {/* Pause/Resume + Skip */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(pipeline.status === 'running' || isPaused) && (
              <button onClick={handlePauseResume} style={{ flex: 1, padding: '4px 0', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--text)', fontSize: 10, cursor: 'pointer' }}>
                {isPaused ? `▶ ${t('Resume')}` : `⏸ ${t('Pause')}`}
              </button>
            )}
            {pipeline.status === 'running' && (
              <button onClick={handleSkip} style={{ flex: 1, padding: '4px 0', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--muted)', fontSize: 10, cursor: 'pointer' }}>
                ⊘ {t('Skip Stage')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Completed state */}
      {isCompleted && (
        <div style={{ padding: 10, background: '#22c55e15', borderRadius: 6, color: '#22c55e', textAlign: 'center', fontWeight: 600 }}>
          ✅ {t('Pipeline completed!')}
        </div>
      )}
    </div>
  );
}

function StageDetail({ stage }: { stage: PipelineStageV2 }) {
  const { t } = useTranslation();
  return (
    <div style={{ padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 11, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        <span>{TYPE_ICONS[stage.type]}</span>
        <span style={{ fontWeight: 600 }}>{stage.name}</span>
        <span style={{ color: STATUS_COLORS[stage.status], fontWeight: 600, marginLeft: 'auto' }}>{t(stage.status)}</span>
      </div>
      <div style={{ color: 'var(--muted)' }}>{stage.description}</div>
      {stage.startedAt && <div style={{ color: 'var(--muted)', marginTop: 2 }}>{t('Started')}: {new Date(stage.startedAt).toLocaleTimeString()}</div>}
      {stage.completedAt && <div style={{ color: 'var(--muted)' }}>{t('Completed')}: {new Date(stage.completedAt).toLocaleTimeString()}</div>}
      {stage.output && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--accent-strong)' }}>{t('Output')}</summary>
          <div style={{ maxHeight: 120, overflow: 'auto', marginTop: 4, padding: 4, background: 'var(--paper)', borderRadius: 4, fontSize: 11 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{stage.output.slice(0, 1000)}</ReactMarkdown>
          </div>
        </details>
      )}
      {stage.error && <div style={{ color: '#ef4444', marginTop: 2 }}>{t('Error: {{error}}', { error: stage.error })}</div>}
    </div>
  );
}
