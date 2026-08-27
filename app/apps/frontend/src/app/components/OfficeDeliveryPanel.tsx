import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  auditOfficeTrack,
  exportOfficeTrack,
  getOfficeTrack,
  saveOfficeTrack,
  type OfficeMaterialStatus,
  type OfficeMaterialType,
  type OfficeTrackAsset,
  type OfficeTrackAudit,
  type OfficeTrackEvidence,
  type OfficeTrackExport,
  type OfficeTrackMaterial,
  type OfficeTrackSaveInput,
  type OfficeTrackState,
} from '../api/officeTrackApi';
import {
  addOfficeApproval,
  addOfficeComment,
  buildOfficeEvidenceGraph,
  createOfficeRecipe,
  createOfficeRun,
  decideOfficeSuggestion,
  getOfficeWorkspace,
  importOfficeMaterial,
  importOfficeMeeting,
  planOfficeArtifact,
  recordOfficeMetric,
  registerOfficeConnector,
  runOfficeArtifact,
  searchOfficeEvidence,
  transitionOfficeRun,
  type OfficeComment,
  type OfficeWorkflowRun,
  type OfficeWorkspaceSnapshot,
} from '../api/officeWorkspaceApi';
import styles from './OfficeDeliveryPanel.module.css';

type Stage = 'inbox' | 'produce' | 'review' | 'approve' | 'deliver' | 'measure';
type ArtifactOperation = 'inspect' | 'create' | 'edit' | 'template-merge' | 'render' | 'validate' | 'diff';

const copy = {
  zh: {
    heading: '办公材料作业台',
    subheading: '收件、处理、审阅、审批、交付与度量共用一条可核验记录。',
    stages: ['收件', '处理', '审阅', '审批', '交付', '度量'],
    noProject: '办公作业台仅适用于受管理的项目。请从项目列表打开工程。',
    loading: '正在读取办公作业记录…',
    reload: '重新加载',
    save: '保存业务记录',
    saving: '正在保存…',
    saved: '业务记录已保存到项目内',
    humanReview: '人审门禁开启',
    boundary: 'AI 可以提取、检索和提出修改；写入、批准与对外交付仍由人决定。',
  },
  en: {
    heading: 'Office operations desk',
    subheading: 'Keep intake, production, review, approval, delivery, and measurement in one auditable record.',
    stages: ['Inbox', 'Produce', 'Review', 'Approve', 'Deliver', 'Measure'],
    noProject: 'Office operations are available for managed projects. Open a project from the project list.',
    loading: 'Loading office operations…',
    reload: 'Reload',
    save: 'Save business record',
    saving: 'Saving…',
    saved: 'Business record saved inside this project',
    humanReview: 'Human review required',
    boundary: 'AI may extract, retrieve, and propose changes; a person still decides writes, approval, and external delivery.',
  },
} as const;

const materialTypes: Array<{ value: OfficeMaterialType; zh: string; en: string }> = [
  { value: 'proposal', zh: '作品方案', en: 'Proposal' },
  { value: 'demo-video-script', zh: '演示脚本', en: 'Demo script' },
  { value: 'reuse-statement', zh: '复用说明', en: 'Reuse statement' },
  { value: 'significance', zh: '作品意义', en: 'Significance' },
  { value: 'effect-evidence', zh: '效果证明', en: 'Effect evidence' },
  { value: 'reviewer-guide', zh: '评委说明', en: 'Reviewer guide' },
  { value: 'finals-pack', zh: '决赛准备包', en: 'Finals pack' },
  { value: 'other', zh: '其他', en: 'Other' },
];

const moduleLabels = {
  efficiency: { zh: '提效成效', en: 'Efficiency' },
  scenario: { zh: '场景价值', en: 'Scenario value' },
  innovation: { zh: '方案创新性', en: 'Innovation' },
  portability: { zh: '可推广性', en: 'Portability' },
};

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function lines(value: string) {
  return value.split('\n').map(item => item.trim()).filter(Boolean);
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function saveInput(state: OfficeTrackState): OfficeTrackSaveInput {
  return { brief: state.brief, materials: state.materials, evidence: state.evidence, effect: state.effect, reusableAssets: state.reusableAssets, finals: state.finals };
}

function guidanceScore(value: number | null, language: 'zh' | 'en') {
  return typeof value === 'number' ? `${value} / 100` : language === 'zh' ? '未形成总建议分' : 'No total guidance score';
}

function latestRun(snapshot: OfficeWorkspaceSnapshot | null): OfficeWorkflowRun | null {
  const runs = snapshot?.workflow.runs || [];
  return runs.length ? runs[runs.length - 1] : null;
}

function allComments(run: OfficeWorkflowRun | null): OfficeComment[] {
  return run?.reviewThreads.flatMap(thread => thread.comments) || [];
}

function artifactSummary(result: Record<string, unknown> | null) {
  if (!result) return null;
  const task = result.task && typeof result.task === 'object' ? result.task as Record<string, unknown> : null;
  const execution = result.execution && typeof result.execution === 'object' ? result.execution as Record<string, unknown> : null;
  if (task) return { status: 'planned', operation: String(task.operation || ''), adapter: String(task.adapter || '') };
  if (execution) return { status: String(execution.status || 'failed'), operation: String(execution.operation || ''), adapter: String(execution.adapter || '') };
  return { status: 'failed', operation: '', adapter: '' };
}

export function OfficeDeliveryPanel({ projectId }: { projectId: string | null }) {
  const language: 'zh' | 'en' = typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'zh';
  const c = copy[language];
  const [stage, setStage] = useState<Stage>('inbox');
  const [state, setState] = useState<OfficeTrackState | null>(null);
  const [snapshot, setSnapshot] = useState<OfficeWorkspaceSnapshot | null>(null);
  const [audit, setAudit] = useState<OfficeTrackAudit | null>(null);
  const [exported, setExported] = useState<OfficeTrackExport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [importPath, setImportPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [claimDraft, setClaimDraft] = useState('');
  const [meetingName, setMeetingName] = useState('meeting-transcript.txt');
  const [meetingTranscript, setMeetingTranscript] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [commentParagraph, setCommentParagraph] = useState('p-1');
  const [suggestedText, setSuggestedText] = useState('');
  const [artifactOperation, setArtifactOperation] = useState<ArtifactOperation>('validate');
  const [artifactInput, setArtifactInput] = useState('');
  const [artifactOutput, setArtifactOutput] = useState('');
  const [artifactAux, setArtifactAux] = useState('');
  const [artifactFormat, setArtifactFormat] = useState('html');
  const [artifactResult, setArtifactResult] = useState<Record<string, unknown> | null>(null);
  const [metricRole, setMetricRole] = useState('writer');
  const [metricFrequency, setMetricFrequency] = useState('weekly');
  const [metricVersion, setMetricVersion] = useState('recipe-v1');
  const [acceptedCount, setAcceptedCount] = useState('0');
  const [rejectedCount, setRejectedCount] = useState('0');

  const load = useCallback(async () => {
    if (!projectId) return;
    setBusy('load');
    setError('');
    try {
      const [track, workspace] = await Promise.all([getOfficeTrack(projectId), getOfficeWorkspace(projectId)]);
      setState(track.state);
      setAudit(track.audit || null);
      setSnapshot(workspace);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }, [projectId]);

  useEffect(() => {
    setState(null);
    setSnapshot(null);
    setAudit(null);
    setExported(null);
    setConfirmed(false);
    setMessage('');
    void load();
  }, [load]);

  const updateState = useCallback((recipe: (current: OfficeTrackState) => OfficeTrackState) => {
    setState(current => current ? recipe(current) : current);
    setConfirmed(false);
    setAudit(null);
    setExported(null);
    setMessage('');
  }, []);

  const persist = useCallback(async () => {
    if (!projectId || !state) return null;
    setBusy('save');
    setError('');
    try {
      const result = await saveOfficeTrack(projectId, saveInput(state));
      setState(result.state);
      setMessage(`${c.saved} · .openprism/office-track.json`);
      return result.state;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(null);
    }
  }, [c.saved, projectId, state]);

  const runAction = useCallback(async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }, []);

  const runAudit = useCallback(() => runAction('audit', async () => {
    if (!projectId || !state) return;
    const saved = await saveOfficeTrack(projectId, saveInput(state));
    setState(saved.state);
    setAudit((await auditOfficeTrack(projectId)).audit);
  }), [projectId, runAction, state]);

  const runExport = useCallback(() => runAction('export', async () => {
    if (!projectId || !state || !confirmed) return;
    const saved = await saveOfficeTrack(projectId, saveInput(state));
    setState(saved.state);
    setExported((await exportOfficeTrack(projectId)).export);
  }), [confirmed, projectId, runAction, state]);

  const stageItems = useMemo(() => (['inbox', 'produce', 'review', 'approve', 'deliver', 'measure'] as Stage[]).map((key, index) => ({ key, label: c.stages[index] })), [c.stages]);
  const run = latestRun(snapshot);
  const comments = allComments(run);
  const latestSearch = snapshot?.workspace.searches[0];
  const latestGraph = snapshot?.workspace.evidenceGraphs[0];
  const efficiency = snapshot?.workflow.efficiency;
  const latestInboxItem = snapshot?.workspace.inbox[0];
  const artifactStatus = artifactSummary(artifactResult);
  const controlledMeasurement = state?.effect.measurementStatus === 'designed';

  if (!projectId) return <div className={styles.empty} data-testid="office-delivery-panel">{c.noProject}</div>;
  if (busy === 'load' && (!state || !snapshot)) return <div className={styles.empty} role="status" data-testid="office-delivery-panel">{c.loading}</div>;
  if (!state || !snapshot) return <div className={styles.empty} data-testid="office-delivery-panel"><p>{error || c.noProject}</p><button className={styles.button} type="button" onClick={() => void load()}>{c.reload}</button></div>;

  const patchMaterial = (materialId: string, patchValue: Partial<OfficeTrackMaterial>) => updateState(current => ({ ...current, materials: current.materials.map(item => item.id === materialId ? { ...item, ...patchValue } : item) }));
  const patchEvidence = (evidenceId: string, patchValue: Partial<OfficeTrackEvidence>) => updateState(current => ({ ...current, evidence: current.evidence.map(item => item.id === evidenceId ? { ...item, ...patchValue } : item) }));
  const patchAsset = (assetId: string, patchValue: Partial<OfficeTrackAsset>) => updateState(current => ({ ...current, reusableAssets: current.reusableAssets.map(item => item.id === assetId ? { ...item, ...patchValue } : item) }));

  const importMaterial = () => runAction('import', async () => {
    const result = await importOfficeMaterial(projectId, importPath);
    setSnapshot(current => current ? { ...current, workspace: result.workspace } : current);
    if (!state.materials.some(item => item.path === result.item.sourcePath)) {
      updateState(current => ({ ...current, materials: [...current.materials, {
        id: `m-${result.item.id.replace(/[^A-Za-z0-9_-]/g, '').slice(-60)}`,
        name: result.item.filename,
        type: 'other',
        path: result.item.sourcePath,
        status: result.item.status === 'ready' ? 'ready' : 'draft',
        notes: `${result.item.parser.id} · ${result.item.quality.status}`,
      }] }));
    }
    setImportPath('');
    setMessage(language === 'zh' ? '材料已解析并写入项目收件记录。' : 'Material parsed and added to the project inbox.');
  });

  const artifactPayload = () => {
    if (artifactOperation === 'create') return { operation: artifactOperation, outputPath: artifactOutput, ...(artifactAux ? { specPath: artifactAux } : {}), locale: language === 'zh' ? 'zh-CN' : 'en-US' };
    if (artifactOperation === 'edit') return { operation: artifactOperation, inputPath: artifactInput, patchPath: artifactAux, outputPath: artifactOutput };
    if (artifactOperation === 'template-merge') return { operation: artifactOperation, templatePath: artifactInput, dataPath: artifactAux, outputPath: artifactOutput };
    if (artifactOperation === 'render') return { operation: artifactOperation, inputPath: artifactInput, outputPath: artifactOutput, format: artifactFormat };
    if (artifactOperation === 'diff') return { operation: artifactOperation, sourcePath: artifactInput, targetPath: artifactOutput };
    if (artifactOperation === 'inspect') return { operation: artifactOperation, inputPath: artifactInput, outputPath: artifactOutput };
    return { operation: artifactOperation, inputPath: artifactInput };
  };

  const executeArtifact = (mode: 'plan' | 'run') => runAction(`artifact-${mode}`, async () => {
    const result = mode === 'plan' ? await planOfficeArtifact(projectId, artifactPayload()) : await runOfficeArtifact(projectId, artifactPayload());
    setArtifactResult(result);
    setMessage(mode === 'plan' ? (language === 'zh' ? '已生成安全执行计划，尚未修改文件。' : 'Safe execution plan generated; no file changed.') : (language === 'zh' ? '执行结果已返回，请核对状态与输出。' : 'Execution returned; verify status and output.'));
  });

  const createRecipeRun = () => runAction('recipe', async () => {
    await registerOfficeConnector(projectId, { id: 'office-source', type: 'local-folder', displayName: 'Office source', params: { relativePath: 'sources' } });
    await registerOfficeConnector(projectId, { id: 'office-delivery', type: 'local-folder', displayName: 'Office delivery', params: { relativePath: 'submission' } });
    const recipeResult = await createOfficeRecipe(projectId, {
      id: 'evidence-office-delivery', name: language === 'zh' ? '证据办公交付' : 'Evidence office delivery', triggerConnectorId: 'office-source', publishConnectorId: 'office-delivery',
      steps: ['ingest', 'retrieve', 'draft', 'review', 'approve', 'publish'], humanApprovalRequired: true, enabled: true, version: 'v1',
    });
    const runResult = await createOfficeRun(projectId, {
      id: newId('run'), recipeId: recipeResult.recipe.id,
      trigger: { connectorId: 'office-source', kind: 'manual', actor: { type: 'human', id: 'operator' } },
    });
    setSnapshot(current => current ? { ...current, workflow: runResult.workflow } : current);
    setMessage(language === 'zh' ? '配方运行已触发，下一步由人推进处理。' : 'Recipe run triggered; a person controls the next step.');
  });

  const advanceRun = (to: string, actor: Record<string, string>) => runAction(`run-${to}`, async () => {
    if (!run) return;
    const result = await transitionOfficeRun(projectId, run.id, { to, actor });
    setSnapshot(current => current ? { ...current, workflow: result.workflow } : current);
  });

  const approveRun = () => runAction('approve-run', async () => {
    if (!run) return;
    await addOfficeApproval(projectId, run.id, { id: newId('approval'), status: 'approved', actor: { type: 'human', id: 'approver' }, notes: language === 'zh' ? '人工核对来源、修改与交付边界。' : 'Human checked sources, changes, and delivery boundaries.' });
    const result = await transitionOfficeRun(projectId, run.id, { to: 'approved', actor: { type: 'human', id: 'approver' } });
    setSnapshot(current => current ? { ...current, workflow: result.workflow } : current);
  });

  const searchEvidence = () => runAction('search', async () => {
    const result = await searchOfficeEvidence(projectId, { query: searchQuery, topK: 5 });
    setSnapshot(current => current ? { ...current, workspace: result.workspace } : current);
  });

  const makeGraph = () => runAction('graph', async () => {
    const result = await buildOfficeEvidenceGraph(projectId, { claims: lines(claimDraft).map((text, index) => ({ id: `claim-${index + 1}`, text })), topK: 5 });
    setSnapshot(current => current ? { ...current, workspace: result.workspace } : current);
  });

  const addReviewComment = () => runAction('comment', async () => {
    if (!run) return;
    const result = await addOfficeComment(projectId, {
      runId: run.id, id: newId('comment'), paragraphId: commentParagraph, body: commentBody, assignee: 'author', provenance: { type: 'human', id: 'reviewer' },
      ...(suggestedText ? { suggestion: { id: newId('suggestion'), kind: 'replace', originalText: '', suggestedText, semanticDiff: { intent: 'ground-claim', changedClaims: lines(claimDraft).slice(0, 20), risk: 'medium' } } } : {}),
    });
    setSnapshot(current => current ? { ...current, workflow: result.workflow } : current);
    setCommentBody('');
    setSuggestedText('');
  });

  const chooseSuggestion = (comment: OfficeComment, decision: 'accepted' | 'rejected') => runAction(`suggestion-${decision}`, async () => {
    if (!run || !comment.suggestion) return;
    const result = await decideOfficeSuggestion(projectId, comment.suggestion.id, { runId: run.id, commentId: comment.id, decision, provenance: { type: 'human', id: 'approver' } });
    setSnapshot(current => current ? { ...current, workflow: result.workflow } : current);
  });

  const importMeeting = () => runAction('meeting', async () => {
    const result = await importOfficeMeeting(projectId, { filename: meetingName, content: meetingTranscript });
    setSnapshot(current => current ? { ...current, workspace: result.workspace } : current);
    setMeetingTranscript('');
  });

  const recordMetric = () => runAction('metric', async () => {
    const result = await recordOfficeMetric(projectId, {
      id: newId('metric'), role: metricRole, frequency: metricFrequency, version: metricVersion,
      timings: { baselineMinutes: state.effect.baselineMinutes, aiMinutes: state.effect.aiMinutes, reviewMinutes: state.effect.reviewMinutes, retryMinutes: state.effect.retryMinutes, setupMinutes: state.effect.setupMinutes, maintenanceMinutes: state.effect.maintenanceMinutes },
      volumes: { documents: state.effect.sampleSize, tasks: state.effect.sampleSize },
      decisions: { accepted: optionalNumber(acceptedCount) || 0, rejected: optionalNumber(rejectedCount) || 0 },
      quality: { scoreBefore: null, scoreAfter: null, rubric: '' },
    });
    setSnapshot(current => current ? { ...current, workflow: result.workflow } : current);
  });

  return (
    <div className={styles.panel} data-testid="office-delivery-panel">
      <header className={styles.header}>
        <div className={styles.titleRow}><div><h2 className={styles.title}>{c.heading}</h2><p className={styles.subtitle}>{c.subheading}</p></div><span className={styles.status}>{c.humanReview}</span></div>
        <p className={styles.boundary}>{c.boundary}</p>
        <div className={styles.ledgerSummary} aria-label={language === 'zh' ? '办公作业摘要' : 'Office operation summary'}>
          <span>{language === 'zh' ? '收件' : 'Inbox'} <strong>{snapshot.workspace.inbox.length}</strong></span>
          <span>{language === 'zh' ? '运行' : 'Runs'} <strong>{snapshot.workflow.runs.length}</strong></span>
          <span>{language === 'zh' ? '待审' : 'Open review'} <strong>{comments.filter(item => item.suggestion?.status === 'pending').length}</strong></span>
        </div>
      </header>

      <nav className={styles.stages} aria-label={language === 'zh' ? '办公作业阶段' : 'Office operation stages'}>
        {stageItems.map((item, index) => <button key={item.key} type="button" data-testid={`office-stage-${item.key}`} className={`${styles.stage} ${stage === item.key ? styles.stageActive : ''}`} aria-current={stage === item.key ? 'step' : undefined} onClick={() => setStage(item.key)}><span className={styles.stageIndex}>{index + 1}</span>{item.label}</button>)}
      </nav>

      <div className={styles.content}>
        {stage === 'inbox' && <>
          <section className={styles.section} aria-labelledby="office-inbox-title">
            <h3 id="office-inbox-title">{language === 'zh' ? '材料收件箱' : 'Material inbox'}</h3>
            <p className={styles.sectionIntro}>{language === 'zh' ? '输入项目相对路径；解析结果、结构、来源和警告随项目保存。' : 'Enter a project-relative path; parsed structure, provenance, and warnings stay with the project.'}</p>
            <div className={styles.inlineForm}><div className={styles.field}><label htmlFor="office-import-path">{language === 'zh' ? '项目相对路径' : 'Project-relative path'}</label><input id="office-import-path" value={importPath} onChange={event => setImportPath(event.target.value)} placeholder="sources/proposal.docx" /></div><button className={`${styles.button} ${styles.buttonPrimary}`} data-testid="office-import-material" type="button" disabled={!importPath.trim() || busy != null} onClick={() => void importMaterial()}>{busy === 'import' ? (language === 'zh' ? '解析中…' : 'Parsing…') : (language === 'zh' ? '导入并解析' : 'Import & parse')}</button></div>
            <div className={styles.ledger}>
              {snapshot.workspace.inbox.length === 0 && <p className={styles.empty}>{language === 'zh' ? '尚未解析材料。支持 DOCX、PPTX、XLSX 和文本；PDF/扫描件会给出所需适配器。' : 'No parsed materials. DOCX, PPTX, XLSX, and text work locally; PDF/scans identify the required adapter.'}</p>}
              {snapshot.workspace.inbox.map(item => <div className={styles.ledgerRow} key={item.id} data-testid="office-inbox-item"><div><strong>{item.filename}</strong><span>{item.sourcePath} · {item.parser.id}</span></div><span className={`${styles.stateLabel} ${item.status === 'ready' ? styles.stateReady : styles.stateBlocked}`}>{item.status}</span>{item.warnings.length > 0 && <p>{item.warnings.join('；')}</p>}</div>)}
            </div>
            {latestInboxItem && <details className={styles.inboxDetails} data-testid="office-inbox-details">
              <summary>{language === 'zh' ? '查看解析证据' : 'Inspect parsed evidence'}</summary>
              <div className={styles.inboxProof}>
                <div><strong>{latestInboxItem.sections.length}</strong><span>{language === 'zh' ? '解析段落' : 'parsed sections'}</span></div>
                <div><strong>{latestInboxItem.chunks.length}</strong><span>{language === 'zh' ? '检索分块' : 'retrieval chunks'}</span></div>
                <div><strong>{latestInboxItem.quality.textCharacters ?? 0}</strong><span>{language === 'zh' ? '文本字符' : 'text characters'}</span></div>
              </div>
              <div className={styles.parsedExcerpt}>{latestInboxItem.sections.slice(0, 3).map(section => <div key={section.id}><strong>{section.heading || section.location || (language === 'zh' ? '解析内容' : 'Parsed content')}</strong><p>{section.text}</p></div>)}</div>
            </details>}
          </section>

          <section className={styles.section} aria-labelledby="office-capability-title">
            <h3 id="office-capability-title">{language === 'zh' ? '文档能力探测' : 'Document capability check'}</h3>
            <p className={styles.sectionIntro}>{language === 'zh' ? '内置 OOXML 读取始终本地可用；外部引擎只有完成显式配置后才会显示可用。' : 'Built-in OOXML reading stays local; external engines appear available only after explicit configuration.'}</p>
            <div className={styles.capabilityList}>{snapshot.capabilities.map(capability => <div className={styles.capabilityRow} key={capability.id}><div><strong>{capability.label}</strong><span>{capability.operations.join(' · ')}</span></div><span className={`${styles.stateLabel} ${capability.available ? styles.stateReady : styles.stateBlocked}`}>{capability.available ? (language === 'zh' ? '可用' : 'Available') : (language === 'zh' ? '未配置' : 'Unavailable')}</span>{!capability.available && capability.reason && <p>{capability.reason}</p>}</div>)}</div>
          </section>

          <details className={styles.details} open>
            <summary>{language === 'zh' ? '任务 Brief 与业务边界' : 'Task brief and business boundaries'}</summary>
            <div className={styles.detailsBody}>
              <div className={styles.grid2}><div className={styles.field}><label htmlFor="office-title">{language === 'zh' ? '任务名称' : 'Task name'}</label><input id="office-title" value={state.brief.title} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, title: event.target.value } }))} /></div><div className={styles.field}><label htmlFor="office-team">{language === 'zh' ? '责任部门' : 'Accountable team'}</label><input id="office-team" value={state.brief.team} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, team: event.target.value } }))} /></div></div>
              <div className={styles.field}><label htmlFor="office-scenario">{language === 'zh' ? '真实办公场景' : 'Real office scenario'}</label><textarea id="office-scenario" value={state.brief.scenario} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, scenario: event.target.value } }))} /></div>
              <div className={styles.field}><label htmlFor="office-users">{language === 'zh' ? '岗位、部门与使用者' : 'Roles, teams, and users'}</label><textarea id="office-users" value={state.brief.users} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, users: event.target.value } }))} /></div>
              <div className={styles.field}><label htmlFor="office-tasks">{language === 'zh' ? '文案任务（每行一项）' : 'Writing tasks (one per line)'}</label><textarea id="office-tasks" value={state.brief.writingTasks.join('\n')} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, writingTasks: lines(event.target.value) } }))} /></div>
              <div className={styles.field}><label htmlFor="office-value">{language === 'zh' ? 'AI 介入点与业务价值' : 'AI intervention and business value'}</label><textarea id="office-value" value={state.brief.valueProposition} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, valueProposition: event.target.value } }))} /></div>
              <div className={styles.grid2}><div className={styles.field}><label htmlFor="office-frequency">{language === 'zh' ? '频率与持续性' : 'Frequency and continuity'}</label><input id="office-frequency" value={state.brief.frequency} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, frequency: event.target.value } }))} /></div><div className={styles.field}><label htmlFor="office-delivery-standard">{language === 'zh' ? '交付质量标准' : 'Delivery quality standard'}</label><input id="office-delivery-standard" value={state.brief.deliveryStandard} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, deliveryStandard: event.target.value } }))} /></div></div>
              <div className={styles.field}><label htmlFor="office-original-process">{language === 'zh' ? '原流程与人工环节' : 'Baseline process and manual steps'}</label><textarea id="office-original-process" value={state.brief.originalProcess} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, originalProcess: event.target.value } }))} /></div>
              <div className={styles.field}><label htmlFor="office-pain-points">{language === 'zh' ? '痛点（每行一项）' : 'Pain points (one per line)'}</label><textarea id="office-pain-points" value={state.brief.painPoints.join('\n')} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, painPoints: lines(event.target.value) } }))} /></div>
              <div className={styles.field}><label htmlFor="office-reuse">{language === 'zh' ? '复用价值说明' : 'Reuse value statement'}</label><textarea id="office-reuse" value={state.brief.reuseStatement} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, reuseStatement: event.target.value } }))} /></div>
              <div className={styles.field}><label htmlFor="office-significance">{language === 'zh' ? '作品意义' : 'Significance'}</label><textarea id="office-significance" value={state.brief.significance} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, significance: event.target.value } }))} /></div>
              <div className={styles.grid2}><div className={styles.field}><label htmlFor="office-dependencies">{language === 'zh' ? '依赖（每行一项）' : 'Dependencies'}</label><textarea id="office-dependencies" value={state.brief.dependencies.join('\n')} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, dependencies: lines(event.target.value) } }))} /></div><div className={styles.field}><label htmlFor="office-constraints">{language === 'zh' ? '安全边界（每行一项）' : 'Safety boundaries'}</label><textarea id="office-constraints" value={state.brief.constraints.join('\n')} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, constraints: lines(event.target.value) } }))} /></div></div>
            </div>
          </details>

          <details className={styles.details}>
            <summary>{language === 'zh' ? `材料登记（${state.materials.length}）` : `Material register (${state.materials.length})`}</summary>
            <div className={styles.detailsBody}>{state.materials.map((material, index) => <div className={styles.record} data-testid={`office-material-${index}`} key={material.id}><div className={styles.recordHeader}><span className={styles.recordTitle}>M-{String(index + 1).padStart(2, '0')}</span><button className={styles.remove} type="button" onClick={() => updateState(current => ({ ...current, materials: current.materials.filter(item => item.id !== material.id) }))}>{language === 'zh' ? '移除' : 'Remove'}</button></div><div className={styles.field}><label>{language === 'zh' ? '名称' : 'Name'}<input value={material.name} onChange={event => patchMaterial(material.id, { name: event.target.value })} /></label></div><div className={styles.grid2}><div className={styles.field}><label>{language === 'zh' ? '类型' : 'Type'}<select value={material.type} onChange={event => patchMaterial(material.id, { type: event.target.value as OfficeMaterialType })}>{materialTypes.map(type => <option value={type.value} key={type.value}>{type[language]}</option>)}</select></label></div><div className={styles.field}><label>{language === 'zh' ? '状态' : 'Status'}<select value={material.status} onChange={event => patchMaterial(material.id, { status: event.target.value as OfficeMaterialStatus })}><option value="missing">Missing</option><option value="draft">Draft</option><option value="ready">Ready</option><option value="verified">Verified</option></select></label></div></div><div className={styles.field}><label>{language === 'zh' ? '项目相对路径' : 'Project-relative path'}<input value={material.path} onChange={event => patchMaterial(material.id, { path: event.target.value })} /></label></div></div>)}<button className={styles.button} data-testid="office-add-material" type="button" onClick={() => updateState(current => ({ ...current, materials: [...current.materials, { id: newId('m'), name: '', type: 'proposal', path: '', status: 'draft' }] }))}>{language === 'zh' ? '新增材料登记' : 'Add material record'}</button></div>
          </details>
        </>}

        {stage === 'produce' && <>
          <section className={styles.section} aria-labelledby="office-artifact-title">
            <h3 id="office-artifact-title">{language === 'zh' ? '原生 Office 作业' : 'Native Office operations'}</h3>
            <p className={styles.sectionIntro}>{language === 'zh' ? '先生成计划，再执行。OfficeCLI 未配置时保持阻断；内置文本差异不依赖外部工具。' : 'Plan first, then run. Missing OfficeCLI remains blocked; built-in text diff does not require it.'}</p>
            <div className={styles.field}><label htmlFor="office-artifact-operation">{language === 'zh' ? '操作' : 'Operation'}</label><select id="office-artifact-operation" value={artifactOperation} onChange={event => { setArtifactOperation(event.target.value as ArtifactOperation); setArtifactResult(null); }}><option value="inspect">Inspect / Dump</option><option value="create">Create</option><option value="edit">Edit / Batch</option><option value="template-merge">Template merge</option><option value="render">Render</option><option value="validate">Validate</option><option value="diff">Diff</option></select></div>
            {artifactOperation !== 'create' && <div className={styles.field}><label htmlFor="office-artifact-input">{artifactOperation === 'template-merge' ? (language === 'zh' ? '模板路径' : 'Template path') : artifactOperation === 'diff' ? (language === 'zh' ? '原文件路径' : 'Source path') : (language === 'zh' ? '输入路径' : 'Input path')}</label><input id="office-artifact-input" value={artifactInput} onChange={event => setArtifactInput(event.target.value)} placeholder="sources/report.docx" /></div>}
            {['create', 'edit', 'template-merge', 'render', 'inspect', 'diff'].includes(artifactOperation) && <div className={styles.field}><label htmlFor="office-artifact-output">{artifactOperation === 'diff' ? (language === 'zh' ? '对比文件路径' : 'Target path') : (language === 'zh' ? '输出路径' : 'Output path')}</label><input id="office-artifact-output" value={artifactOutput} onChange={event => setArtifactOutput(event.target.value)} placeholder="delivery/report.docx" /></div>}
            {['create', 'edit', 'template-merge'].includes(artifactOperation) && <div className={styles.field}><label htmlFor="office-artifact-aux">{artifactOperation === 'create' ? (language === 'zh' ? '可选 Batch 规格路径' : 'Optional batch spec path') : artifactOperation === 'edit' ? (language === 'zh' ? '修改 Batch 路径' : 'Edit batch path') : (language === 'zh' ? 'JSON 数据路径' : 'JSON data path')}</label><input id="office-artifact-aux" value={artifactAux} onChange={event => setArtifactAux(event.target.value)} placeholder="sources/operation.json" /></div>}
            {artifactOperation === 'render' && <div className={styles.field}><label htmlFor="office-artifact-format">{language === 'zh' ? '渲染格式' : 'Render format'}</label><select id="office-artifact-format" value={artifactFormat} onChange={event => setArtifactFormat(event.target.value)}><option value="html">HTML</option><option value="screenshot">PNG screenshot</option><option value="pdf">PDF</option></select></div>}
            <div className={styles.buttonRow}><button className={styles.button} data-testid="office-artifact-plan" type="button" disabled={busy != null} onClick={() => void executeArtifact('plan')}>{language === 'zh' ? '生成安全计划' : 'Generate safe plan'}</button><button className={`${styles.button} ${styles.buttonPrimary}`} data-testid="office-artifact-run" type="button" disabled={busy != null} onClick={() => void executeArtifact('run')}>{language === 'zh' ? '执行作业' : 'Run operation'}</button></div>
            {artifactResult && artifactStatus && <><div className={`${styles.artifactStatus} ${artifactStatus.status === 'ok' || artifactStatus.status === 'planned' ? styles.artifactStatusReady : styles.artifactStatusFailed}`} data-testid="office-artifact-status"><span className={`${styles.stateLabel} ${artifactStatus.status === 'ok' || artifactStatus.status === 'planned' ? styles.stateReady : styles.stateBlocked}`}>{artifactStatus.status}</span><div><strong>{artifactStatus.status === 'planned' ? (language === 'zh' ? '安全计划已生成' : 'Safe plan generated') : artifactStatus.status === 'ok' ? (language === 'zh' ? 'Office 作业执行成功' : 'Office operation succeeded') : (language === 'zh' ? 'Office 作业未完成' : 'Office operation did not complete')}</strong><p>{artifactStatus.adapter} · {artifactStatus.operation}</p></div></div><details className={styles.resultDetails} open={artifactStatus.status === 'planned'}><summary>{language === 'zh' ? '查看计划与执行明细' : 'Inspect plan and execution details'}</summary><pre className={styles.resultCode} data-testid="office-artifact-result">{JSON.stringify(artifactResult, null, 2)}</pre></details></>}
          </section>

          <section className={styles.section} aria-labelledby="office-recipe-title">
            <h3 id="office-recipe-title">{language === 'zh' ? '自动化配方' : 'Automation recipe'}</h3>
            <p className={styles.sectionIntro}>{language === 'zh' ? '本地来源 → 提取 → 检索 → 起草 → 审阅 → 人工批准 → 发布状态。参赛文件仍在“交付”阶段人工确认后导出；外部连接器未配置时不会假发布。' : 'Local source → extract → retrieve → draft → review → human approval → publication state. Submission files are still exported after confirmation in Delivery; unconfigured external connectors never fake publication.'}</p>
            {!run && <button className={`${styles.button} ${styles.buttonPrimary}`} data-testid="office-create-run" type="button" disabled={busy != null} onClick={() => void createRecipeRun()}>{language === 'zh' ? '创建并触发配方' : 'Create & trigger recipe'}</button>}
            {run && <div className={styles.runLedger} data-testid="office-workflow-run"><div><strong>{snapshot.workflow.recipes.find(item => item.id === run.recipeId)?.name || run.recipeId}</strong><span>{run.id}</span></div><span className={styles.stateLabel}>{run.status}</span>{run.status === 'triggered' && <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={() => void advanceRun('processing', { type: 'ai', id: 'office-agent', model: 'configured-provider' })}>{language === 'zh' ? '进入处理' : 'Start processing'}</button>}{run.status === 'processing' && <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={() => void advanceRun('review', { type: 'human', id: 'reviewer' })}>{language === 'zh' ? '提交审阅' : 'Submit for review'}</button>}</div>}
          </section>

          <section className={styles.section} aria-labelledby="office-meeting-title">
            <h3 id="office-meeting-title">{language === 'zh' ? '会议材料接入' : 'Meeting intake'}</h3>
            <p className={styles.sectionIntro}>{language === 'zh' ? '粘贴已有逐字稿；保留时间戳与输入中的说话人标签，不宣称自动说话人分离。' : 'Paste an existing transcript; preserve timestamps and supplied speaker labels without claiming automatic diarization.'}</p>
            <div className={styles.field}><label htmlFor="office-meeting-name">{language === 'zh' ? '逐字稿文件名' : 'Transcript filename'}</label><input id="office-meeting-name" value={meetingName} onChange={event => setMeetingName(event.target.value)} /></div>
            <div className={styles.field}><label htmlFor="office-meeting-transcript">{language === 'zh' ? '带时间戳逐字稿' : 'Timestamped transcript'}</label><textarea id="office-meeting-transcript" value={meetingTranscript} onChange={event => setMeetingTranscript(event.target.value)} placeholder="[00:01:20] 李明：决定：保留人工审批。" /></div>
            <button className={styles.button} data-testid="office-import-meeting" type="button" disabled={!meetingTranscript.trim() || busy != null} onClick={() => void importMeeting()}>{language === 'zh' ? '提取决定与待办' : 'Extract decisions & actions'}</button>
            {snapshot.workspace.meetings[0] && <div className={styles.meetingResult} data-testid="office-meeting-result"><strong>{snapshot.workspace.meetings[0].title}</strong><p>{snapshot.workspace.meetings[0].summary}</p><span>{language === 'zh' ? '决定' : 'Decisions'} {snapshot.workspace.meetings[0].decisions.length} · {language === 'zh' ? '待办' : 'Actions'} {snapshot.workspace.meetings[0].actionItems.length} · diarization {snapshot.workspace.meetings[0].source.speakerDiarization}</span></div>}
          </section>
        </>}

        {stage === 'review' && <>
          <section className={styles.section} aria-labelledby="office-search-title">
            <h3 id="office-search-title">{language === 'zh' ? '混合检索' : 'Hybrid retrieval'}</h3>
            <p className={styles.sectionIntro}>{language === 'zh' ? 'BM25、哈希向量余弦和确定性重排分别显示，命中依据可复核。' : 'BM25, hashed-vector cosine, and deterministic reranking stay separately visible.'}</p>
            <div className={styles.inlineForm}><div className={styles.field}><label htmlFor="office-search-query">{language === 'zh' ? '检索问题' : 'Search query'}</label><input id="office-search-query" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} /></div><button className={`${styles.button} ${styles.buttonPrimary}`} data-testid="office-search" type="button" disabled={!searchQuery.trim() || busy != null} onClick={() => void searchEvidence()}>{language === 'zh' ? '检索证据' : 'Search evidence'}</button></div>
            <div className={styles.ledger}>{!latestSearch?.results.length && <p className={styles.empty}>{language === 'zh' ? '尚无检索结果。先在收件阶段导入可读材料。' : 'No retrieval results. Import readable material first.'}</p>}{latestSearch?.results.map(result => <div className={styles.searchRow} key={result.id}><div><strong>{result.source.path}</strong><span>BM25 {result.scoreBreakdown.bm25.toFixed(3)} · Vector {result.scoreBreakdown.vector.toFixed(3)} · Rerank {result.scoreBreakdown.rerank.toFixed(3)}</span></div><span className={styles.score}>{result.score.toFixed(3)}</span><p>{result.text}</p></div>)}</div>
          </section>

          <section className={styles.section} aria-labelledby="office-graph-title">
            <h3 id="office-graph-title">{language === 'zh' ? '证据关系图' : 'Evidence relationship graph'}</h3>
            <p className={styles.sectionIntro}>{language === 'zh' ? '每行一条主张；关系只来自已导入材料，支持、冲突与缺口不会合并成一个模糊分数。' : 'One claim per line; relations come only from imported material, keeping support, conflict, and gaps distinct.'}</p>
            <div className={styles.field}><label htmlFor="office-claims">{language === 'zh' ? '待核验主张（每行一条）' : 'Claims to check'}</label><textarea id="office-claims" value={claimDraft} onChange={event => setClaimDraft(event.target.value)} /></div>
            <button className={styles.button} data-testid="office-build-graph" type="button" disabled={!claimDraft.trim() || busy != null} onClick={() => void makeGraph()}>{language === 'zh' ? '生成证据关系' : 'Build evidence relations'}</button>
            {latestGraph && <div className={styles.graphSummary} data-testid="office-evidence-graph"><div><strong>{Math.round(latestGraph.coverage.coverageRatio * 100)}%</strong><span>{language === 'zh' ? '主张有来源' : 'claims sourced'}</span></div><p>{language === 'zh' ? '支持' : 'Support'} {latestGraph.coverage.supportedClaims} · {language === 'zh' ? '冲突' : 'Conflict'} {latestGraph.coverage.conflictedClaims} · {language === 'zh' ? '缺口' : 'Missing'} {latestGraph.coverage.missingClaims}</p>{latestGraph.edges.map(edge => <div className={styles.graphEdge} key={edge.id}><span className={`${styles.stateLabel} ${edge.type === 'support' ? styles.stateReady : edge.type === 'conflict' ? styles.stateBlocked : ''}`}>{edge.type}</span><strong>{latestGraph.claims.find(claim => claim.id === edge.claimId)?.text}</strong><p>{edge.source?.path || (language === 'zh' ? '未找到来源' : 'No source found')}</p></div>)}</div>}
          </section>

          <details className={styles.details} open><summary>{language === 'zh' ? `主张登记（${state.evidence.length}）` : `Claim register (${state.evidence.length})`}</summary><div className={styles.detailsBody}>{state.evidence.map((evidence, index) => <div className={styles.record} data-testid={`office-evidence-${index}`} key={evidence.id}><div className={styles.recordHeader}><span className={styles.recordTitle}>E-{String(index + 1).padStart(2, '0')}</span><button className={styles.remove} type="button" onClick={() => updateState(current => ({ ...current, evidence: current.evidence.filter(item => item.id !== evidence.id) }))}>{language === 'zh' ? '移除' : 'Remove'}</button></div><div className={styles.field}><label>{language === 'zh' ? '需证明的结论' : 'Claim'}<textarea value={evidence.claim} onChange={event => patchEvidence(evidence.id, { claim: event.target.value })} /></label></div><div className={styles.field}><label>{language === 'zh' ? '来源路径' : 'Source path'}<input value={evidence.sourcePath} onChange={event => patchEvidence(evidence.id, { sourcePath: event.target.value })} /></label></div><div className={styles.grid2}><div className={styles.field}><label>{language === 'zh' ? '精确位置' : 'Exact location'}<input value={evidence.location} onChange={event => patchEvidence(evidence.id, { location: event.target.value })} /></label></div><div className={styles.field}><label>{language === 'zh' ? '证据等级' : 'Evidence level'}<select value={evidence.level} onChange={event => patchEvidence(evidence.id, { level: event.target.value as OfficeTrackEvidence['level'] })}>{['E0', 'E1', 'E2', 'E3'].map(level => <option value={level} key={level}>{level}</option>)}</select></label></div></div></div>)}<button className={styles.button} data-testid="office-add-evidence" type="button" onClick={() => updateState(current => ({ ...current, evidence: [...current.evidence, { id: newId('e'), claim: '', sourcePath: '', location: '', level: 'E0', status: 'planned' }] }))}>{language === 'zh' ? '新增主张登记' : 'Add claim record'}</button></div></details>

          <section className={styles.section} aria-labelledby="office-comment-title">
            <h3 id="office-comment-title">{language === 'zh' ? '段落审阅与建议' : 'Paragraph review and suggestions'}</h3>
            {!run && <p className={styles.empty}>{language === 'zh' ? '先在处理阶段创建配方运行。' : 'Create a recipe run in Produce first.'}</p>}
            {run && run.status !== 'review' && <p className={styles.notice}>{language === 'zh' ? `当前运行状态为 ${run.status}；进入 review 后才能记录审阅意见和建议。` : `The run is ${run.status}; review comments and suggestions unlock in review.`}</p>}
            {run?.status === 'review' && <><div className={styles.grid2}><div className={styles.field}><label htmlFor="office-comment-paragraph">{language === 'zh' ? '段落标识' : 'Paragraph id'}</label><input id="office-comment-paragraph" value={commentParagraph} onChange={event => setCommentParagraph(event.target.value)} /></div><div className={styles.field}><label htmlFor="office-comment-assignee">{language === 'zh' ? '负责人' : 'Assignee'}</label><input id="office-comment-assignee" value="author" readOnly /></div></div><div className={styles.field}><label htmlFor="office-comment-body">{language === 'zh' ? '审阅意见' : 'Review comment'}</label><textarea id="office-comment-body" value={commentBody} onChange={event => setCommentBody(event.target.value)} /></div><div className={styles.field}><label htmlFor="office-suggested-text">{language === 'zh' ? '可选替换建议' : 'Optional replacement suggestion'}</label><textarea id="office-suggested-text" value={suggestedText} onChange={event => setSuggestedText(event.target.value)} /></div><button className={styles.button} data-testid="office-add-comment" type="button" disabled={!commentBody.trim() || busy != null} onClick={() => void addReviewComment()}>{language === 'zh' ? '提交审阅意见' : 'Submit review comment'}</button></>}
            {comments.map(comment => <div className={styles.commentThread} key={comment.id}><div><strong>{comment.paragraphId}</strong><span>{comment.provenance.type} · {comment.assignee || (language === 'zh' ? '未指派' : 'Unassigned')}</span></div><p>{comment.body}</p>{comment.suggestion && <div className={styles.suggestion}><span className={styles.stateLabel}>{comment.suggestion.status}</span><p>{comment.suggestion.suggestedText}</p>{comment.suggestion.status === 'pending' && <div className={styles.buttonRow}><button className={styles.button} type="button" onClick={() => void chooseSuggestion(comment, 'rejected')}>{language === 'zh' ? '拒绝建议' : 'Reject'}</button><button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={() => void chooseSuggestion(comment, 'accepted')}>{language === 'zh' ? '接受建议' : 'Accept'}</button></div>}</div>}</div>)}
          </section>
        </>}

        {stage === 'approve' && <section className={styles.section} aria-labelledby="office-approval-title">
          <h3 id="office-approval-title">{language === 'zh' ? '人工审批账本' : 'Human approval ledger'}</h3>
          <p className={styles.sectionIntro}>{language === 'zh' ? '批准事件和运行状态分开记录；没有人工批准事件，状态机拒绝进入 approved 或 published。' : 'Approval events and run state are separate records; without a human approval event, approved and published are rejected.'}</p>
          {!run && <p className={styles.empty}>{language === 'zh' ? '尚无配方运行。' : 'No recipe run yet.'}</p>}
          {run && <><div className={styles.approvalHeader}><div><strong>{run.id}</strong><span>{run.recipeId}</span></div><span className={styles.stateLabel}>{run.status}</span></div><div className={styles.timeline}>{run.timeline.map((event, index) => <div className={styles.timelineRow} key={`${event.to}-${event.at}-${index}`}><span>{event.to}</span><div><strong>{event.actor?.type || 'system'} {event.actor?.id || ''}</strong><p>{event.notes || (language === 'zh' ? '状态已记录' : 'State recorded')}</p></div><time>{event.at ? new Date(event.at).toLocaleString() : ''}</time></div>)}</div>{run.status === 'review' && <div className={styles.approvalGate}><strong>{language === 'zh' ? '审批前检查' : 'Pre-approval check'}</strong><p>{language === 'zh' ? '确认来源、数字、敏感信息和建议采纳结果均已核对。' : 'Confirm sources, numbers, sensitive information, and suggestion decisions were checked.'}</p><button className={`${styles.button} ${styles.buttonPrimary}`} data-testid="office-approve-run" type="button" disabled={busy != null} onClick={() => void approveRun()}>{language === 'zh' ? '记录人工批准' : 'Record human approval'}</button></div>}{run.status === 'approved' && <div className={styles.approvalGate}><strong>{language === 'zh' ? '发布状态确认' : 'Publication state confirmation'}</strong><p>{language === 'zh' ? '此操作只记录本地工作流已发布；参赛交付包仍需在“交付”阶段单独确认并导出。' : 'This records the local workflow publication state only; export the submission package separately in Delivery.'}</p><button className={`${styles.button} ${styles.buttonPrimary}`} data-testid="office-publish-run" type="button" disabled={busy != null} onClick={() => void advanceRun('published', { type: 'human', id: 'publisher' })}>{language === 'zh' ? '确认流程已发布' : 'Confirm workflow publication'}</button></div>}{run.approvalEvents.map(event => <div className={styles.approvalEvent} key={event.id}><strong>{event.status}</strong><span>{event.actor?.id} · {event.at ? new Date(event.at).toLocaleString() : ''}</span><p>{event.notes}</p></div>)}</>}
        </section>}

        {stage === 'deliver' && <>
          <details className={styles.details} open><summary>{language === 'zh' ? '演示、落地与推广记录' : 'Demo, adoption, and rollout record'}</summary><div className={styles.detailsBody}>
            <div className={styles.field}><label htmlFor="office-demo">{language === 'zh' ? '三分钟演示脚本' : 'Three-minute demo script'}</label><textarea id="office-demo" value={state.finals.demoScript} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, demoScript: event.target.value } }))} /></div>
            <div className={styles.field}><label htmlFor="office-questions">{language === 'zh' ? '答辩问题（每行一项）' : 'Defense questions'}</label><textarea id="office-questions" value={state.finals.questions.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, questions: lines(event.target.value) } }))} /></div>
            <div className={styles.field}><label htmlFor="office-checks">{language === 'zh' ? '演示操作检查（每行一项）' : 'Demo operator checks'}</label><textarea id="office-checks" value={state.finals.operatorChecklist.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, operatorChecklist: lines(event.target.value) } }))} /></div>
            <div className={styles.grid2}><div className={styles.field}><label>{language === 'zh' ? '真实使用周期' : 'Real usage period'}<input value={state.finals.landingEvidence.usagePeriod} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, landingEvidence: { ...current.finals.landingEvidence, usagePeriod: event.target.value } } }))} /></label></div><div className={styles.field}><label>{language === 'zh' ? '真实使用次数' : 'Real usage count'}<input type="number" min="0" value={state.finals.landingEvidence.useCount ?? ''} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, landingEvidence: { ...current.finals.landingEvidence, useCount: optionalNumber(event.target.value) } } }))} /></label></div></div>
            <div className={styles.field}><label>{language === 'zh' ? '真实使用者（每行一项）' : 'Real users'}<textarea value={state.finals.landingEvidence.users.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, landingEvidence: { ...current.finals.landingEvidence, users: lines(event.target.value) } } }))} /></label></div>
            <div className={styles.field}><label>{language === 'zh' ? '业务产出与证据位置（每行一项）' : 'Business outputs and evidence locations'}<textarea value={state.finals.landingEvidence.outputs.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, landingEvidence: { ...current.finals.landingEvidence, outputs: lines(event.target.value) } } }))} /></label></div>
            <div className={styles.field}><label>{language === 'zh' ? '推广目标岗位（每行一项）' : 'Rollout target roles'}<textarea value={state.finals.rolloutPlan.targetRoles.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, rolloutPlan: { ...current.finals.rolloutPlan, targetRoles: lines(event.target.value) } } }))} /></label></div>
            <div className={styles.field}><label>{language === 'zh' ? '推广负责人' : 'Rollout owner'}<input value={state.finals.rolloutPlan.owner} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, rolloutPlan: { ...current.finals.rolloutPlan, owner: event.target.value } } }))} /></label></div>
            <div className={styles.field}><label>{language === 'zh' ? 'Prompt / Skill / 流程版本（每行一项）' : 'Prompt / Skill / workflow versions'}<textarea value={state.finals.aiOptimization.versions.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, aiOptimization: { ...current.finals.aiOptimization, versions: lines(event.target.value) } } }))} /></label></div>
          </div></details>
          <section className={styles.section} aria-labelledby="office-audit-title">
            <h3 id="office-audit-title">{language === 'zh' ? '证据审核与交付' : 'Evidence audit and delivery'}</h3>
            <p className={styles.sectionIntro}>{language === 'zh' ? '建议分只用于准备，不代表官方评分、晋级或获奖结果。' : 'Readiness guidance is not an official score, qualification, or award result.'}</p>
            <button className={`${styles.button} ${styles.buttonPrimary}`} data-testid="office-run-audit" type="button" disabled={busy != null} onClick={() => void runAudit()}>{busy === 'audit' ? (language === 'zh' ? '审核中…' : 'Auditing…') : (language === 'zh' ? '运行证据审核' : 'Run evidence audit')}</button>
            {!audit && <p className={styles.empty}>{language === 'zh' ? '尚未审核；缺少真实材料时不会形成总建议分。' : 'Not audited; no total guidance appears without real materials.'}</p>}
            {audit && <div aria-live="polite" data-testid="office-audit-result"><div className={styles.auditModule}><strong>{language === 'zh' ? '准备建议' : 'Readiness guidance'}</strong><span className={styles.score}>{guidanceScore(audit.totalGuidanceScore, language)} · {audit.confidence}</span><span className={styles.reason}>{audit.scoreFormation?.scoreStatus === 'ready' ? (language === 'zh' ? '可形成建议分' : 'Guidance available') : (language === 'zh' ? '待补材料，不形成总建议分' : 'Materials required; no total score')}</span></div><div className={styles.deliveryGate}><strong>{language === 'zh' ? '人工确认与导出' : 'Human confirmation and export'}</strong><label className={styles.checkline}><input data-testid="office-export-confirm" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>{language === 'zh' ? '我已核对真实数据、敏感信息和人工审批责任。' : 'I verified real measurements, sensitive information, and human approval responsibility.'}</span></label><button className={`${styles.button} ${styles.buttonPrimary}`} data-testid="office-export" type="button" disabled={!audit || !confirmed || busy != null} onClick={() => void runExport()}>{busy === 'export' ? (language === 'zh' ? '导出中…' : 'Exporting…') : (language === 'zh' ? '导出参赛交付包' : 'Export submission package')}</button>{exported && <div className={styles.success} role="status" data-testid="office-export-files"><strong>{language === 'zh' ? '已生成文件' : 'Generated files'}</strong>{exported.files.map(file => <div className={styles.exportFile} key={file.path}><span>{file.path}</span><code>{file.sha256.slice(0, 8)}</code></div>)}</div>}</div>{Object.entries(audit.modules || {}).map(([key, module]) => <div className={styles.auditModule} key={key}><strong>{moduleLabels[key as keyof typeof moduleLabels]?.[language] || key}</strong><span className={styles.score}>{module.score} / {module.max} · {module.confidence}</span><span className={styles.reason}>{module.band}</span>{module.reasons.length > 0 && <span className={styles.reason}>{language === 'zh' ? '判断依据：' : 'Reasons: '}{module.reasons.join('；')}</span>}{module.deductions.filter(Boolean).length > 0 && <span className={styles.reason}>{language === 'zh' ? '扣分/上限：' : 'Deductions/caps: '}{module.deductions.filter(Boolean).join('；')}</span>}{module.evidenceLocations.length > 0 && <span className={styles.reason}>{language === 'zh' ? '证据位置：' : 'Evidence: '}{module.evidenceLocations.map(item => `${item.path || item.id}${item.location ? `#${item.location}` : ''}`).join('；')}</span>}{key === 'efficiency' && module.analysisPath && <span className={styles.reason}>{language === 'zh' ? '分析路径：' : 'Analysis path: '}{module.analysisPath.join(' → ')}</span>}{key === 'efficiency' && module.assumptions && <span className={styles.reason}>{language === 'zh' ? '判断前提：' : 'Assumptions: '}{module.assumptions.join('；') || (language === 'zh' ? '待补充' : 'Missing')}</span>}{key === 'efficiency' && module.possibleBias && <span className={styles.reason}>{language === 'zh' ? '可能偏差：' : 'Possible bias: '}{module.possibleBias.join('；') || (language === 'zh' ? '待人工核对' : 'Needs human review')}</span>}</div>)}<div data-testid="office-audit-risks">{(audit.risks || []).map((risk, index) => <p className={styles.notice} key={`${risk.id || 'risk'}-${index}`}>{risk.message}</p>)}</div></div>}
          </section>
        </>}

        {stage === 'measure' && <>
          <section className={styles.section} aria-labelledby="office-measure-title">
            <h3 id="office-measure-title">{language === 'zh' ? '完整效率实验' : 'Whole-workflow efficiency experiment'}</h3>
            <p className={styles.sectionIntro}>{language === 'zh' ? '基线、AI、复核、重试、配置与维护全部计时；数据不足时只显示 insufficient。' : 'Baseline, AI, review, retries, setup, and maintenance all count; incomplete evidence stays insufficient.'}</p>
            <div className={styles.grid2}>{([['baselineMinutes', '原流程耗时', 'Baseline'], ['aiMinutes', 'AI 操作耗时', 'AI operation'], ['reviewMinutes', '人工复核耗时', 'Human review'], ['retryMinutes', '重试耗时', 'Retries'], ['setupMinutes', '配置耗时', 'Setup'], ['maintenanceMinutes', '维护耗时', 'Maintenance']] as const).map(([key, zh, en]) => <div className={styles.field} key={key}><label htmlFor={`office-${key}`}>{language === 'zh' ? `${zh}（分钟）` : `${en} (minutes)`}</label><input id={`office-${key}`} type="number" min="0" value={state.effect[key] ?? ''} onChange={event => updateState(current => ({ ...current, effect: { ...current.effect, [key]: optionalNumber(event.target.value) } }))} /></div>)}</div>
            <div className={styles.grid2}><div className={styles.field}><label htmlFor="office-sample">{language === 'zh' ? '样本量' : 'Sample size'}</label><input id="office-sample" type="number" min="0" value={state.effect.sampleSize ?? ''} onChange={event => updateState(current => ({ ...current, effect: { ...current.effect, sampleSize: optionalNumber(event.target.value) } }))} /></div><div className={styles.field}><label htmlFor="office-measure-status">{language === 'zh' ? '测量状态' : 'Measurement status'}</label><select id="office-measure-status" value={state.effect.measurementStatus} onChange={event => updateState(current => ({ ...current, effect: { ...current.effect, measurementStatus: event.target.value as OfficeTrackState['effect']['measurementStatus'] } }))}><option value="not-started">Not started</option><option value="designed">Designed</option><option value="measured">Measured</option><option value="verified">Verified</option></select></div></div>
            <div className={styles.grid2}><div className={styles.field}><label htmlFor="office-metric-role">{language === 'zh' ? '岗位' : 'Role'}</label><input id="office-metric-role" value={metricRole} onChange={event => setMetricRole(event.target.value)} /></div><div className={styles.field}><label htmlFor="office-metric-frequency">{language === 'zh' ? '使用频率' : 'Frequency'}</label><input id="office-metric-frequency" value={metricFrequency} onChange={event => setMetricFrequency(event.target.value)} /></div></div>
            <div className={styles.grid2}><div className={styles.field}><label htmlFor="office-metric-version">{language === 'zh' ? '配方版本' : 'Recipe version'}</label><input id="office-metric-version" value={metricVersion} onChange={event => setMetricVersion(event.target.value)} /></div><div className={styles.field}><label>{language === 'zh' ? '采纳 / 拒绝次数' : 'Accepted / rejected'}<span className={styles.splitInputs}><input aria-label={language === 'zh' ? '采纳次数' : 'Accepted count'} type="number" min="0" value={acceptedCount} onChange={event => setAcceptedCount(event.target.value)} /><input aria-label={language === 'zh' ? '拒绝次数' : 'Rejected count'} type="number" min="0" value={rejectedCount} onChange={event => setRejectedCount(event.target.value)} /></span></label></div></div>
            <button className={`${styles.button} ${styles.buttonPrimary}`} data-testid="office-record-metric" type="button" disabled={busy != null} onClick={() => void recordMetric()}>{controlledMeasurement ? (language === 'zh' ? '记录受控演示样本' : 'Record controlled demo sample') : (language === 'zh' ? '记录本次实测样本' : 'Record measured sample')}</button>
            {efficiency && <div className={styles.efficiencyResult} data-testid="office-efficiency-summary"><span className={`${styles.stateLabel} ${efficiency.evidenceStatus === 'sufficient' ? styles.stateReady : styles.stateBlocked}`}>{controlledMeasurement ? (language === 'zh' ? '受控演示' : 'controlled demo') : efficiency.evidenceStatus === 'sufficient' ? (language === 'zh' ? '字段完整' : 'complete fields') : efficiency.evidenceStatus}</span>{efficiency.evidenceStatus === 'sufficient' ? <><div><strong>{efficiency.metrics.timeSavedMinutes ?? '—'}</strong><span>{controlledMeasurement ? (language === 'zh' ? '演示计算净节省分钟（非业务结论）' : 'demo net minutes saved (not a business result)') : (language === 'zh' ? '平均净节省分钟' : 'average net minutes saved')}</span></div><p>{language === 'zh' ? '采纳率' : 'Acceptance'} {efficiency.metrics.acceptanceRate == null ? '—' : `${Math.round(efficiency.metrics.acceptanceRate * 100)}%`} · {language === 'zh' ? '样本' : 'Samples'} {efficiency.coverage.sampleSize}</p>{controlledMeasurement && <p className={styles.measurementBoundary} data-testid="office-measurement-boundary">measurementStatus=designed · {language === 'zh' ? '只验证计算与记录功能，不作为真实业务提效证明。' : 'Validates calculation and recording only; not evidence of real business impact.'}</p>}</> : <p>{efficiency.insufficiencyReasons.join('；')}</p>}</div>}
          </section>
          <details className={styles.details}><summary>{language === 'zh' ? `复用资产（${state.reusableAssets.length}）` : `Reusable assets (${state.reusableAssets.length})`}</summary><div className={styles.detailsBody}>{state.reusableAssets.map((asset, index) => <div className={styles.record} data-testid={`office-asset-${index}`} key={asset.id}><div className={styles.recordHeader}><span className={styles.recordTitle}>A-{String(index + 1).padStart(2, '0')}</span><button className={styles.remove} type="button" onClick={() => updateState(current => ({ ...current, reusableAssets: current.reusableAssets.filter(item => item.id !== asset.id) }))}>{language === 'zh' ? '移除' : 'Remove'}</button></div><div className={styles.field}><label>{language === 'zh' ? '名称' : 'Name'}<input value={asset.name} onChange={event => patchAsset(asset.id, { name: event.target.value })} /></label></div><div className={styles.grid2}><div className={styles.field}><label>{language === 'zh' ? '类型' : 'Type'}<select value={asset.type} onChange={event => patchAsset(asset.id, { type: event.target.value as OfficeTrackAsset['type'] })}>{['template', 'sop', 'prompt', 'workflow', 'checklist', 'dataset', 'other'].map(type => <option key={type}>{type}</option>)}</select></label></div><div className={styles.field}><label>{language === 'zh' ? '状态' : 'Status'}<select value={asset.status} onChange={event => patchAsset(asset.id, { status: event.target.value as OfficeTrackAsset['status'] })}><option value="planned">Planned</option><option value="ready">Ready</option><option value="verified">Verified</option></select></label></div></div><div className={styles.field}><label>{language === 'zh' ? '路径' : 'Path'}<input value={asset.path} onChange={event => patchAsset(asset.id, { path: event.target.value })} /></label></div></div>)}<button className={styles.button} data-testid="office-add-asset" type="button" onClick={() => updateState(current => ({ ...current, reusableAssets: [...current.reusableAssets, { id: newId('a'), name: '', type: 'sop', path: '', status: 'planned', targetRoles: [], learningMinutes: null, deploymentNotes: '', permissionNotes: '', maintenanceOwner: '' }] }))}>{language === 'zh' ? '新增复用资产' : 'Add reusable asset'}</button></div></details>
        </>}

        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>

      <footer className={styles.footer}><span className={styles.footerStatus} role="status">{message || (language === 'zh' ? '真实、缺失与阻断状态保持可见。' : 'Real, missing, and blocked states stay visible.')}</span><button className={`${styles.button} ${styles.buttonPrimary}`} data-testid="office-save" type="button" disabled={busy != null} onClick={() => void persist()}>{busy === 'save' ? c.saving : c.save}</button></footer>
    </div>
  );
}

export default OfficeDeliveryPanel;
