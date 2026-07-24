import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  acceptCliTask,
  cancelCliTask,
  createCliTask,
  getCliTask,
  listCliTaskProviders,
  listCliTasks,
  rejectCliTask,
  type CliTask,
  type CliTaskProvider,
} from '../api/cliTaskApi';

const ACTIVE = new Set(['queued', 'running', 'applying']);

function statusColor(status: CliTask['status']) {
  if (status === 'accepted') return '#16a34a';
  if (status === 'rejected' || status === 'cancelled') return '#64748b';
  if (status === 'failed') return '#dc2626';
  if (status === 'waiting-review') return '#d97706';
  return '#2563eb';
}

function formatTime(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function CliTaskPanel({ projectId }: { projectId: string | null }) {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<CliTaskProvider[]>([]);
  const [tasks, setTasks] = useState<CliTask[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const selected = useMemo(() => tasks.find((task) => task.id === selectedId) || tasks[0] || null, [tasks, selectedId]);
  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === providerId) || null, [providers, providerId]);

  const refresh = useCallback(async (preferredTaskId?: string) => {
    if (!projectId) return;
    const result = await listCliTasks(projectId);
    setTasks(result.tasks);
    setSelectedId((current) => preferredTaskId || current || result.tasks[0]?.id || '');
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    Promise.all([listCliTaskProviders(), listCliTasks(projectId)])
      .then(([providerResult, taskResult]) => {
        if (cancelled) return;
        setProviders(providerResult.providers);
        const preferred = providerResult.providers.find((provider) => provider.available)
          || providerResult.providers.find((provider) => provider.id === 'codex-cli')
          || providerResult.providers[0];
        if (preferred) setProviderId(preferred.id);
        setTasks(taskResult.tasks);
        setSelectedId(taskResult.tasks[0]?.id || '');
      })
      .catch((cause) => { if (!cancelled) setError(cause.message || String(cause)); });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !selected || !ACTIVE.has(selected.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await getCliTask(projectId, selected.id);
        setTasks((current) => current.map((task) => task.id === result.task.id ? result.task : task));
      } catch (cause: any) {
        setError(cause.message || String(cause));
      }
    }, 750);
    return () => window.clearInterval(timer);
  }, [projectId, selected?.id, selected?.status]);

  useEffect(() => {
    setReviewConfirmed(false);
    setRejectReason('');
  }, [selected?.id]);

  const run = async () => {
    if (!projectId || !prompt.trim() || !providerId) return;
    setBusy('create');
    setError('');
    try {
      const result = await createCliTask(projectId, { providerId, model: model.trim(), prompt: prompt.trim() });
      setPrompt('');
      await refresh(result.task.id);
    } catch (cause: any) {
      setError(cause.message || String(cause));
    } finally {
      setBusy('');
    }
  };

  const accept = async () => {
    if (!projectId || !selected || !reviewConfirmed) return;
    setBusy('accept');
    setError('');
    try {
      const result = await acceptCliTask(projectId, selected.id);
      setTasks((current) => current.map((task) => task.id === result.task.id ? result.task : task));
      window.dispatchEvent(new CustomEvent('paper-writer:cli-task-applied', { detail: { projectId, taskId: selected.id } }));
    } catch (cause: any) {
      setError(cause.message || String(cause));
    } finally {
      setBusy('');
    }
  };

  const reject = async () => {
    if (!projectId || !selected) return;
    setBusy('reject');
    setError('');
    try {
      const result = await rejectCliTask(projectId, selected.id, rejectReason);
      setTasks((current) => current.map((task) => task.id === result.task.id ? result.task : task));
    } catch (cause: any) {
      setError(cause.message || String(cause));
    } finally {
      setBusy('');
    }
  };

  const cancel = async () => {
    if (!projectId || !selected) return;
    setBusy('cancel');
    setError('');
    try {
      await cancelCliTask(projectId, selected.id);
      await refresh(selected.id);
    } catch (cause: any) {
      setError(cause.message || String(cause));
    } finally {
      setBusy('');
    }
  };

  if (!projectId) {
    return <div data-testid="cli-task-panel" style={{ padding: 16, color: 'var(--muted)' }}>{t('Task Agent requires a managed Paper Writer project.')}</div>;
  }

  return (
    <div data-testid="cli-task-panel" style={{ height: '100%', overflow: 'auto', padding: 12, color: 'var(--text)' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{t('Reviewable CLI Task Agent')}</div>
        <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, lineHeight: 1.5 }}>
          {t('The CLI edits an isolated snapshot. Your project changes only after you review every file and accept the task. Chat remains read-only.')}
        </div>
      </div>

      <section style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--paper)' }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }} htmlFor="cli-task-provider">{t('CLI Provider')}</label>
        <select id="cli-task-provider" value={providerId} onChange={(event) => setProviderId(event.target.value)} style={{ width: '100%', marginBottom: 8 }}>
          {providers.map((provider) => <option key={provider.id} value={provider.id} disabled={!provider.available}>{provider.label}{provider.available ? '' : ` — ${provider.unavailableReason || t('Unavailable')}`}</option>)}
        </select>
        {selectedProvider && !selectedProvider.available && (
          <div role="status" style={{ color: 'var(--danger)', fontSize: 10, marginTop: -4, marginBottom: 8 }}>
            {selectedProvider.unavailableReason || t('This provider is unavailable. Install and authenticate it on the server before creating a task.')}
          </div>
        )}
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }} htmlFor="cli-task-model">{t('Model (optional)')}</label>
        <input id="cli-task-model" value={model} onChange={(event) => setModel(event.target.value)} placeholder={t('Use the CLI default model')} style={{ width: '100%', marginBottom: 8, boxSizing: 'border-box' }} />
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }} htmlFor="cli-task-prompt">{t('File-changing task')}</label>
        <textarea id="cli-task-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} placeholder={t('Describe the exact paper changes and evidence constraints.')} style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }} />
        <button type="button" onClick={run} disabled={!prompt.trim() || !providerId || Boolean(busy) || !selectedProvider?.available} style={{ width: '100%', marginTop: 8, padding: '8px 10px' }}>
          {busy === 'create' ? t('Creating isolated snapshot…') : t('Create reviewable task')}
        </button>
      </section>

      {error && <div role="alert" style={{ marginTop: 10, color: 'var(--danger)', fontSize: 11, whiteSpace: 'pre-wrap' }}>{error}</div>}

      <section style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <strong style={{ fontSize: 12 }}>{t('Task history')}</strong>
          <button type="button" onClick={() => refresh()} disabled={Boolean(busy)}>{t('Refresh')}</button>
        </div>
        {tasks.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 11 }}>{t('No CLI tasks yet.')}</div> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {tasks.map((task) => (
              <button key={task.id} type="button" onClick={() => setSelectedId(task.id)} style={{ textAlign: 'left', border: task.id === selected?.id ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 8, padding: 8, background: 'var(--paper)' }}>
                <span style={{ color: statusColor(task.status), fontWeight: 700, fontSize: 10 }}>{t(task.status)}</span>
                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted)' }}>{task.providerId}</span>
                <div style={{ marginTop: 3, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.prompt}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <section style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 12 }}>{t('Task details')}</strong>
            <span style={{ color: statusColor(selected.status), fontWeight: 700, fontSize: 11 }}>{t(selected.status)}</span>
          </div>
          <dl style={{ fontSize: 10, lineHeight: 1.5, margin: '8px 0', color: 'var(--muted)' }}>
            <div><dt style={{ display: 'inline', fontWeight: 700 }}>{t('Provider')}: </dt><dd style={{ display: 'inline', margin: 0 }}>{selected.provenance.provider} {selected.provenance.version}</dd></div>
            <div><dt style={{ display: 'inline', fontWeight: 700 }}>{t('Model')}: </dt><dd style={{ display: 'inline', margin: 0 }}>{selected.provenance.model || t('CLI default')}</dd></div>
            <div><dt style={{ display: 'inline', fontWeight: 700 }}>{t('Isolation')}: </dt><dd style={{ display: 'inline', margin: 0 }}>{selected.provenance.isolation}</dd></div>
            <div><dt style={{ display: 'inline', fontWeight: 700 }}>{t('Created')}: </dt><dd style={{ display: 'inline', margin: 0 }}>{formatTime(selected.createdAt)}</dd></div>
            <div><dt style={{ display: 'inline', fontWeight: 700 }}>{t('Exit code')}: </dt><dd style={{ display: 'inline', margin: 0 }}>{selected.provenance.exitCode ?? '—'}</dd></div>
            <div><dt style={{ display: 'inline', fontWeight: 700 }}>{t('Arguments')}: </dt><dd style={{ display: 'inline', margin: 0, wordBreak: 'break-all' }}>{selected.provenance.argsSummary || '—'}</dd></div>
          </dl>

          {selected.error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 11 }}>{selected.error.code}: {selected.error.message}</div>}

          {ACTIVE.has(selected.status) && (
            <button type="button" onClick={cancel} disabled={Boolean(busy)} style={{ width: '100%', marginTop: 8 }}>{busy === 'cancel' ? t('Cancelling…') : t('Cancel task')}</button>
          )}

          {selected.changedFiles.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <strong style={{ fontSize: 11 }}>{t('{{count}} changed files', { count: selected.changedFiles.length })}</strong>
              {selected.changedFiles.map((file) => (
                <details key={file.path} open style={{ marginTop: 7, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <summary style={{ cursor: 'pointer', padding: 7, fontSize: 10, fontWeight: 700, background: 'var(--panel-muted)' }}>
                    {file.status.toUpperCase()} · {file.path}
                  </summary>
                  {file.binary ? (
                    <div style={{ padding: 8, fontSize: 10, color: 'var(--muted)' }}>{t('Binary file changed; review the file metadata before accepting.')}</div>
                  ) : (
                    <pre data-testid="cli-task-diff" style={{ margin: 0, padding: 8, overflow: 'auto', fontSize: 10, lineHeight: 1.45, whiteSpace: 'pre' }}>{file.diff}</pre>
                  )}
                </details>
              ))}
            </div>
          )}

          {selected.status === 'waiting-review' && (
            <div style={{ marginTop: 10, border: '1px solid #d97706', borderRadius: 8, padding: 9, background: 'rgba(217,119,6,0.08)' }}>
              <label style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 11, lineHeight: 1.4 }}>
                <input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} />
                <span>{t('I reviewed every changed file and understand that Accept will modify the original project.')}</span>
              </label>
              <button type="button" onClick={accept} disabled={!reviewConfirmed || Boolean(busy)} style={{ width: '100%', marginTop: 8, background: '#16a34a', color: '#fff' }}>
                {busy === 'accept' ? t('Applying safely…') : t('Accept and apply changes')}
              </button>
              <textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={2} placeholder={t('Optional rejection reason')} style={{ width: '100%', marginTop: 8, boxSizing: 'border-box' }} />
              <button type="button" onClick={reject} disabled={Boolean(busy)} style={{ width: '100%', marginTop: 6 }}>
                {busy === 'reject' ? t('Rejecting…') : t('Reject without changing project')}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
