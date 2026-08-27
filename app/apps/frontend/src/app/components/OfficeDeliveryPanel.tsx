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
import styles from './OfficeDeliveryPanel.module.css';

type Stage = 'brief' | 'evidence' | 'effect' | 'delivery';

const copy = {
  zh: {
    heading: '办公材料交付',
    subheading: '把任务、来源、主张、数据、人工审批与交付件留在同一条可核验链路中。',
    noProject: '交付面板仅适用于受管理的项目。请从项目列表打开工程。',
    loading: '正在读取交付记录…',
    saved: '已保存到项目内 .openprism/office-track.json',
    save: '保存当前记录',
    saving: '正在保存…',
    retry: '重新加载',
    stages: ['任务 Brief', '材料与证据', '效果与复用', '审核与导出'],
    title: '作品或任务名称',
    scenario: '真实办公场景',
    users: '岗位、部门与使用者',
    tasks: '文案任务（每行一项）',
    value: 'AI 介入点与业务价值',
    boundary: 'AI 只提出建议；所有写入与对外材料均由人确认。',
    materialIntro: '登记材料类型、项目相对路径和可读状态。路径不得越出当前项目。',
    evidenceIntro: '重要结论必须定位到材料位置；没有依据时保持 E0 / 待核验。',
    addMaterial: '新增材料',
    addEvidence: '新增证据',
    addAsset: '新增复用资产',
    remove: '移除',
    name: '名称',
    type: '类型',
    path: '项目相对路径',
    status: '状态',
    claim: '需证明的结论',
    location: '精确位置',
    level: '证据等级',
    source: '来源路径',
    noneMaterials: '尚未登记材料。可先添加四项必交材料，再补效果证明与标准化资产。',
    noneEvidence: '尚未登记证据。系统不会把参赛方自述自动升级为已验证。',
    effectIntro: '记录完整工作量：AI、人工复核、重试、配置和维护都计入成本。只填写实测数据。',
    baseline: '原流程耗时（分钟）',
    ai: 'AI 操作耗时（分钟）',
    review: '人工复核耗时（分钟）',
    retryMinutes: '重试耗时（分钟）',
    setup: '配置耗时（分钟）',
    maintenance: '维护耗时（分钟）',
    sampleSize: '样本量',
    measurement: '测量状态',
    assetIntro: '登记能让其他岗位复现的 SOP、模板、Skill、README、FAQ 或培训材料。',
    finalsIntro: '保留三分钟演示链路、现场问答与操作检查，缺失项会进入待补清单。',
    demoScript: '三分钟演示脚本',
    questions: '答辩问题（每行一项）',
    checklist: '演示操作检查（每行一项）',
    audit: '运行证据审核',
    auditing: '正在审核…',
    auditEmpty: '尚未审核。审核会检查材料完整性、证据定位、数据可复算性、敏感信息提醒和规则上限。',
    guideScore: '准备建议分',
    export: '导出参赛交付包',
    exporting: '正在导出…',
    confirm: '我已核对真实数据、敏感信息和人工审批责任；允许生成 submission/ 文件。',
    disclaimer: '比赛就绪度仅用于准备，不代表官方评分或获奖结果',
    files: '已生成文件',
  },
  en: {
    heading: 'Office delivery',
    subheading: 'Keep the brief, sources, claims, measurements, human approval, and deliverables in one auditable trail.',
    noProject: 'Delivery is available for managed projects. Open a project from the project list.',
    loading: 'Loading delivery records…',
    saved: 'Saved to .openprism/office-track.json in this project',
    save: 'Save current record',
    saving: 'Saving…',
    retry: 'Reload',
    stages: ['Task brief', 'Materials & evidence', 'Effect & reuse', 'Audit & export'],
    title: 'Work or task name',
    scenario: 'Real office scenario',
    users: 'Roles, teams, and users',
    tasks: 'Writing tasks (one per line)',
    value: 'AI intervention and business value',
    boundary: 'AI proposes; a person confirms every write and external deliverable.',
    materialIntro: 'Register type, project-relative path, and readability. Paths must stay inside this project.',
    evidenceIntro: 'Locate important claims precisely. Keep unsupported claims at E0 / unverified.',
    addMaterial: 'Add material',
    addEvidence: 'Add evidence',
    addAsset: 'Add reusable asset',
    remove: 'Remove',
    name: 'Name',
    type: 'Type',
    path: 'Project-relative path',
    status: 'Status',
    claim: 'Claim to prove',
    location: 'Exact location',
    level: 'Evidence level',
    source: 'Source path',
    noneMaterials: 'No materials registered. Add the four required materials, effect proof, and standardized assets.',
    noneEvidence: 'No evidence registered. Self-reported claims are never promoted to verified automatically.',
    effectIntro: 'Measure the whole workflow: AI, review, retries, setup, and maintenance all count. Enter measured data only.',
    baseline: 'Baseline time (minutes)',
    ai: 'AI operation time (minutes)',
    review: 'Human review time (minutes)',
    retryMinutes: 'Retry time (minutes)',
    setup: 'Setup time (minutes)',
    maintenance: 'Maintenance time (minutes)',
    sampleSize: 'Sample size',
    measurement: 'Measurement status',
    assetIntro: 'Register SOPs, templates, Skills, README files, FAQs, or training assets other roles can reproduce.',
    finalsIntro: 'Keep the three-minute demo, live questions, and operator checks. Missing evidence stays visible.',
    demoScript: 'Three-minute demo script',
    questions: 'Defense questions (one per line)',
    checklist: 'Demo operator checks (one per line)',
    audit: 'Run evidence audit',
    auditing: 'Auditing…',
    auditEmpty: 'No audit yet. The audit checks completeness, evidence locations, reproducible calculations, risk reminders, and score caps.',
    guideScore: 'Readiness guidance',
    export: 'Export submission package',
    exporting: 'Exporting…',
    confirm: 'I verified the real measurements, sensitive information, and human approval responsibility; generate submission/ files.',
    disclaimer: 'Competition readiness is preparation guidance only, not an official score or award result',
    files: 'Generated files',
  },
} as const;

const materialTypes: Array<{ value: OfficeMaterialType; zh: string; en: string }> = [
  { value: 'proposal', zh: '作品方案', en: 'Proposal' },
  { value: 'demo-video-script', zh: '演示脚本', en: 'Demo script' },
  { value: 'reuse-statement', zh: '复用价值说明', en: 'Reuse statement' },
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

function id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function lines(value: string) {
  return value.split('\n').map(item => item.trim()).filter(Boolean);
}

function saveInput(state: OfficeTrackState): OfficeTrackSaveInput {
  return {
    brief: state.brief,
    materials: state.materials,
    evidence: state.evidence,
    effect: state.effect,
    reusableAssets: state.reusableAssets,
    finals: state.finals,
  };
}

function optionalNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function guidanceScore(value: number | null, language: 'zh' | 'en') {
  return typeof value === 'number' ? `${value} / 100` : language === 'zh' ? '未形成总建议分' : 'No total guidance score';
}

export function OfficeDeliveryPanel({ projectId }: { projectId: string | null }) {
  const language = typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'zh';
  const c = copy[language];
  const [stage, setStage] = useState<Stage>('brief');
  const [state, setState] = useState<OfficeTrackState | null>(null);
  const [audit, setAudit] = useState<OfficeTrackAudit | null>(null);
  const [exported, setExported] = useState<OfficeTrackExport | null>(null);
  const [busy, setBusy] = useState<'load' | 'save' | 'audit' | 'export' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setBusy('load');
    setError('');
    try {
      const result = await getOfficeTrack(projectId);
      setState(result.state);
      setAudit(result.audit || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }, [projectId]);

  useEffect(() => {
    setState(null);
    setAudit(null);
    setExported(null);
    setConfirmed(false);
    setMessage('');
    void load();
  }, [load]);

  const updateState = useCallback((recipe: (current: OfficeTrackState) => OfficeTrackState) => {
    setState(current => current ? recipe(current) : current);
    setConfirmed(false);
    setMessage('');
    setAudit(null);
    setExported(null);
  }, []);

  const persist = useCallback(async () => {
    if (!projectId || !state) return null;
    setBusy('save');
    setError('');
    try {
      const result = await saveOfficeTrack(projectId, saveInput(state));
      setState(result.state);
      setMessage(c.saved);
      return result.state;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(null);
    }
  }, [c.saved, projectId, state]);

  const runAudit = useCallback(async () => {
    if (!projectId || !state) return;
    setBusy('audit');
    setError('');
    try {
      const saved = await saveOfficeTrack(projectId, saveInput(state));
      setState(saved.state);
      const result = await auditOfficeTrack(projectId);
      setAudit(result.audit);
      setMessage('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }, [projectId, state]);

  const runExport = useCallback(async () => {
    if (!projectId || !state || !confirmed) return;
    setBusy('export');
    setError('');
    try {
      const saved = await saveOfficeTrack(projectId, saveInput(state));
      setState(saved.state);
      const result = await exportOfficeTrack(projectId);
      setExported(result.export);
      setMessage('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }, [confirmed, projectId, state]);

  const stageItems = useMemo(() => ([
    { key: 'brief' as const, label: c.stages[0] },
    { key: 'evidence' as const, label: c.stages[1] },
    { key: 'effect' as const, label: c.stages[2] },
    { key: 'delivery' as const, label: c.stages[3] },
  ]), [c.stages]);

  if (!projectId) return <div className={styles.empty} data-testid="office-delivery-panel">{c.noProject}</div>;
  if (busy === 'load' && !state) return <div className={styles.empty} role="status" data-testid="office-delivery-panel">{c.loading}</div>;
  if (!state) return (
    <div className={styles.empty} data-testid="office-delivery-panel">
      <p>{error || c.noProject}</p>
      <button className={styles.button} type="button" onClick={() => void load()}>{c.retry}</button>
    </div>
  );

  const patchMaterial = (materialId: string, patch: Partial<OfficeTrackMaterial>) => updateState(current => ({
    ...current,
    materials: current.materials.map(item => item.id === materialId ? { ...item, ...patch } : item),
  }));
  const patchEvidence = (evidenceId: string, patch: Partial<OfficeTrackEvidence>) => updateState(current => ({
    ...current,
    evidence: current.evidence.map(item => item.id === evidenceId ? { ...item, ...patch } : item),
  }));
  const patchAsset = (assetId: string, patch: Partial<OfficeTrackAsset>) => updateState(current => ({
    ...current,
    reusableAssets: current.reusableAssets.map(item => item.id === assetId ? { ...item, ...patch } : item),
  }));

  return (
    <div className={styles.panel} data-testid="office-delivery-panel">
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h2 className={styles.title}>{c.heading}</h2>
            <p className={styles.subtitle}>{c.subheading}</p>
          </div>
          <span className={styles.status}>{state.brief.humanApprovalRequired ? (language === 'zh' ? '人审开启' : 'Human review') : (language === 'zh' ? '需复核' : 'Review needed')}</span>
        </div>
      </header>

      <nav className={styles.stages} aria-label={language === 'zh' ? '交付阶段' : 'Delivery stages'}>
        {stageItems.map(item => (
          <button
            key={item.key}
            type="button"
            data-testid={`office-stage-${item.key}`}
            className={`${styles.stage} ${stage === item.key ? styles.stageActive : ''}`}
            aria-current={stage === item.key ? 'step' : undefined}
            onClick={() => setStage(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className={styles.content}>
        {stage === 'brief' && (
          <section className={styles.section} aria-labelledby="office-brief-title">
            <h3 id="office-brief-title">{c.stages[0]}</h3>
            <p className={styles.sectionIntro}>{c.boundary}</p>
            <div className={styles.field}>
              <label htmlFor="office-title">{c.title}</label>
              <input id="office-title" value={state.brief.title} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, title: event.target.value } }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="office-team">{language === 'zh' ? '团队或责任部门' : 'Team or accountable department'}</label>
              <input id="office-team" value={state.brief.team} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, team: event.target.value } }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="office-scenario">{c.scenario}</label>
              <textarea id="office-scenario" value={state.brief.scenario} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, scenario: event.target.value } }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="office-frequency">{language === 'zh' ? '发生频率与持续性' : 'Frequency and continuity'}</label>
              <input id="office-frequency" value={state.brief.frequency} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, frequency: event.target.value } }))} placeholder={language === 'zh' ? '例如：每月 4 次；持续性流程' : 'For example: four times per month; recurring workflow'} />
            </div>
            <div className={styles.field}>
              <label htmlFor="office-original-process">{language === 'zh' ? '原流程与人工环节' : 'Baseline process and manual steps'}</label>
              <textarea id="office-original-process" value={state.brief.originalProcess} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, originalProcess: event.target.value } }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="office-pain-points">{language === 'zh' ? '痛点（每行一项）' : 'Pain points (one per line)'}</label>
              <textarea id="office-pain-points" value={state.brief.painPoints.join('\n')} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, painPoints: lines(event.target.value) } }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="office-users">{c.users}</label>
              <textarea id="office-users" value={state.brief.users} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, users: event.target.value } }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="office-tasks">{c.tasks}</label>
              <textarea id="office-tasks" value={state.brief.writingTasks.join('\n')} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, writingTasks: lines(event.target.value) } }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="office-value">{c.value}</label>
              <textarea id="office-value" value={state.brief.valueProposition} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, valueProposition: event.target.value } }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="office-reuse">{language === 'zh' ? '复用价值说明' : 'Reuse value statement'}</label>
              <textarea id="office-reuse" value={state.brief.reuseStatement} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, reuseStatement: event.target.value } }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="office-significance">{language === 'zh' ? '作品意义' : 'Significance'}</label>
              <textarea id="office-significance" value={state.brief.significance} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, significance: event.target.value } }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="office-delivery-standard">{language === 'zh' ? '交付与质量标准' : 'Delivery and quality standard'}</label>
              <textarea id="office-delivery-standard" value={state.brief.deliveryStandard} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, deliveryStandard: event.target.value } }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="office-dependencies">{language === 'zh' ? '依赖与配置（每行一项）' : 'Dependencies and setup (one per line)'}</label>
              <textarea id="office-dependencies" value={state.brief.dependencies.join('\n')} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, dependencies: lines(event.target.value) } }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="office-constraints">{language === 'zh' ? '权限、安全与不可改变边界（每行一项）' : 'Permission, safety, and fixed constraints (one per line)'}</label>
              <textarea id="office-constraints" value={state.brief.constraints.join('\n')} onChange={event => updateState(current => ({ ...current, brief: { ...current.brief, constraints: lines(event.target.value) } }))} />
            </div>
          </section>
        )}

        {stage === 'evidence' && (
          <>
            <section className={styles.section} aria-labelledby="office-material-title">
              <h3 id="office-material-title">{language === 'zh' ? '材料登记' : 'Material registry'}</h3>
              <p className={styles.sectionIntro}>{c.materialIntro}</p>
              {state.materials.length === 0 && <p className={styles.empty}>{c.noneMaterials}</p>}
              {state.materials.map((material, index) => (
                <div className={styles.record} data-testid={`office-material-${index}`} key={material.id}>
                  <div className={styles.recordHeader}>
                    <span className={styles.recordTitle}>M{String(index + 1).padStart(2, '0')}</span>
                    <button className={styles.remove} type="button" onClick={() => updateState(current => ({ ...current, materials: current.materials.filter(item => item.id !== material.id) }))}>{c.remove}</button>
                  </div>
                  <div className={styles.field}><label>{c.name}<input value={material.name} onChange={event => patchMaterial(material.id, { name: event.target.value })} /></label></div>
                  <div className={styles.grid2}>
                    <div className={styles.field}><label>{c.type}<select value={material.type} onChange={event => patchMaterial(material.id, { type: event.target.value as OfficeMaterialType })}>{materialTypes.map(option => <option key={option.value} value={option.value}>{option[language]}</option>)}</select></label></div>
                    <div className={styles.field}><label>{c.status}<select value={material.status} onChange={event => patchMaterial(material.id, { status: event.target.value as OfficeMaterialStatus })}><option value="missing">{language === 'zh' ? '缺失' : 'Missing'}</option><option value="draft">{language === 'zh' ? '草稿' : 'Draft'}</option><option value="ready">{language === 'zh' ? '可交付' : 'Ready'}</option><option value="verified">{language === 'zh' ? '已人工核验' : 'Human-verified'}</option></select></label></div>
                  </div>
                  <div className={styles.field}><label>{c.path}<input value={material.path} onChange={event => patchMaterial(material.id, { path: event.target.value })} placeholder="sources/proposal.md" /></label></div>
                </div>
              ))}
              <button className={styles.button} data-testid="office-add-material" type="button" onClick={() => updateState(current => ({ ...current, materials: [...current.materials, { id: id('m'), name: '', type: 'proposal', path: '', status: 'draft' }] }))}>{c.addMaterial}</button>
            </section>

            <section className={styles.section} aria-labelledby="office-evidence-title">
              <h3 id="office-evidence-title">{language === 'zh' ? '证据索引' : 'Evidence index'}</h3>
              <p className={styles.sectionIntro}>{c.evidenceIntro}</p>
              {state.evidence.length === 0 && <p className={styles.empty}>{c.noneEvidence}</p>}
              {state.evidence.map((evidence, index) => (
                <div className={styles.record} data-testid={`office-evidence-${index}`} key={evidence.id}>
                  <div className={styles.recordHeader}>
                    <span className={styles.recordTitle}>E-{String(index + 1).padStart(2, '0')}</span>
                    <button className={styles.remove} type="button" onClick={() => updateState(current => ({ ...current, evidence: current.evidence.filter(item => item.id !== evidence.id) }))}>{c.remove}</button>
                  </div>
                  <div className={styles.field}><label>{c.claim}<textarea value={evidence.claim} onChange={event => patchEvidence(evidence.id, { claim: event.target.value })} /></label></div>
                  <div className={styles.field}><label>{c.source}<input value={evidence.sourcePath} onChange={event => patchEvidence(evidence.id, { sourcePath: event.target.value })} placeholder="evidence/source.md" /></label></div>
                  <div className={styles.grid2}>
                    <div className={styles.field}><label>{c.location}<input value={evidence.location} onChange={event => patchEvidence(evidence.id, { location: event.target.value })} placeholder="L10-L18 / 02:15 / A2:D4" /></label></div>
                    <div className={styles.field}><label>{c.level}<select value={evidence.level} onChange={event => patchEvidence(evidence.id, { level: event.target.value as OfficeTrackEvidence['level'] })}>{['E0', 'E1', 'E2', 'E3'].map(level => <option key={level} value={level}>{level}</option>)}</select></label></div>
                  </div>
                  <div className={styles.field}><label>{c.status}<select value={evidence.status} onChange={event => patchEvidence(evidence.id, { status: event.target.value as OfficeTrackEvidence['status'] })}><option value="planned">{language === 'zh' ? '待收集' : 'Planned'}</option><option value="collected">{language === 'zh' ? '已收集待核验' : 'Collected'}</option><option value="verified">{language === 'zh' ? '已核验' : 'Verified'}</option><option value="rejected">{language === 'zh' ? '已否决' : 'Rejected'}</option></select></label></div>
                </div>
              ))}
              <button className={styles.button} data-testid="office-add-evidence" type="button" onClick={() => updateState(current => ({ ...current, evidence: [...current.evidence, { id: id('e'), claim: '', sourcePath: '', location: '', level: 'E0', status: 'planned' }] }))}>{c.addEvidence}</button>
            </section>
          </>
        )}

        {stage === 'effect' && (
          <>
            <section className={styles.section} aria-labelledby="office-effect-title">
              <h3 id="office-effect-title">{language === 'zh' ? '效果测量' : 'Effect measurement'}</h3>
              <p className={styles.sectionIntro}>{c.effectIntro}</p>
              <div className={styles.grid2}>
                {([
                  ['baselineMinutes', c.baseline], ['aiMinutes', c.ai], ['reviewMinutes', c.review], ['retryMinutes', c.retryMinutes],
                  ['setupMinutes', c.setup], ['maintenanceMinutes', c.maintenance], ['sampleSize', c.sampleSize],
                ] as const).map(([key, label]) => (
                  <div className={styles.field} key={key}>
                    <label>{label}<input type="number" min="0" step={key === 'sampleSize' ? '1' : '0.5'} value={state.effect[key] ?? ''} onChange={event => updateState(current => ({ ...current, effect: { ...current.effect, [key]: optionalNumber(event.target.value) } }))} /></label>
                  </div>
                ))}
              </div>
              <div className={styles.grid2}>
                <div className={styles.field}><label>{language === 'zh' ? '指标单位' : 'Metric unit'}<input value={state.effect.unit} onChange={event => updateState(current => ({ ...current, effect: { ...current.effect, unit: event.target.value } }))} placeholder={language === 'zh' ? '分钟 / 份 / 错误数' : 'minutes / documents / errors'} /></label></div>
                <div className={styles.field}><label>{language === 'zh' ? '统计周期' : 'Measurement period'}<input value={state.effect.period} onChange={event => updateState(current => ({ ...current, effect: { ...current.effect, period: event.target.value } }))} /></label></div>
                <div className={styles.field}><label>{language === 'zh' ? '任务频率' : 'Task frequency'}<input value={state.effect.taskFrequency} onChange={event => updateState(current => ({ ...current, effect: { ...current.effect, taskFrequency: event.target.value } }))} /></label></div>
                <div className={styles.field}><label>{language === 'zh' ? '覆盖人数' : 'People covered'}<input type="number" min="0" step="1" value={state.effect.coveragePeople ?? ''} onChange={event => updateState(current => ({ ...current, effect: { ...current.effect, coveragePeople: optionalNumber(event.target.value) } }))} /></label></div>
              </div>
              <div className={styles.field}><label>{c.measurement}<select value={state.effect.measurementStatus} onChange={event => updateState(current => ({ ...current, effect: { ...current.effect, measurementStatus: event.target.value as OfficeTrackState['effect']['measurementStatus'] } }))}><option value="not-started">{language === 'zh' ? '待设计' : 'Not started'}</option><option value="designed">{language === 'zh' ? '已设计测量' : 'Designed'}</option><option value="measured">{language === 'zh' ? '已实测待核验' : 'Measured'}</option><option value="verified">{language === 'zh' ? '已人工核验' : 'Verified'}</option></select></label></div>
              <div className={styles.field}><label htmlFor="office-quality-notes">{language === 'zh' ? '质量、返工与异常说明' : 'Quality, rework, and exception notes'}</label><textarea id="office-quality-notes" value={state.effect.qualityNotes} onChange={event => updateState(current => ({ ...current, effect: { ...current.effect, qualityNotes: event.target.value } }))} /></div>
              <div className={styles.field}><label htmlFor="office-calculation-notes">{language === 'zh' ? '计算过程、成本纳入与偏差说明' : 'Calculation, included costs, and possible bias'}</label><textarea id="office-calculation-notes" value={state.effect.calculationNotes} onChange={event => updateState(current => ({ ...current, effect: { ...current.effect, calculationNotes: event.target.value } }))} /></div>
            </section>

            <section className={styles.section} aria-labelledby="office-assets-title">
              <h3 id="office-assets-title">{language === 'zh' ? '复用资产' : 'Reusable assets'}</h3>
              <p className={styles.sectionIntro}>{c.assetIntro}</p>
              {state.reusableAssets.map((asset, index) => (
                <div className={styles.record} data-testid={`office-asset-${index}`} key={asset.id}>
                  <div className={styles.recordHeader}><span className={styles.recordTitle}>A-{String(index + 1).padStart(2, '0')}</span><button className={styles.remove} type="button" onClick={() => updateState(current => ({ ...current, reusableAssets: current.reusableAssets.filter(item => item.id !== asset.id) }))}>{c.remove}</button></div>
                  <div className={styles.field}><label>{c.name}<input value={asset.name} onChange={event => patchAsset(asset.id, { name: event.target.value })} /></label></div>
                  <div className={styles.grid2}>
                    <div className={styles.field}><label>{c.type}<select value={asset.type} onChange={event => patchAsset(asset.id, { type: event.target.value as OfficeTrackAsset['type'] })}>{['template', 'sop', 'prompt', 'workflow', 'checklist', 'dataset', 'other'].map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)}</select></label></div>
                    <div className={styles.field}><label>{c.status}<select value={asset.status} onChange={event => patchAsset(asset.id, { status: event.target.value as OfficeTrackAsset['status'] })}><option value="planned">{language === 'zh' ? '计划中' : 'Planned'}</option><option value="ready">{language === 'zh' ? '可复现' : 'Ready'}</option><option value="verified">{language === 'zh' ? '已复现核验' : 'Verified'}</option></select></label></div>
                  </div>
                  <div className={styles.field}><label>{c.path}<input value={asset.path} onChange={event => patchAsset(asset.id, { path: event.target.value })} /></label></div>
                  <div className={styles.field}><label>{language === 'zh' ? '目标岗位（每行一项）' : 'Target roles (one per line)'}<textarea value={asset.targetRoles.join('\n')} onChange={event => patchAsset(asset.id, { targetRoles: lines(event.target.value) })} /></label></div>
                  <div className={styles.grid2}>
                    <div className={styles.field}><label>{language === 'zh' ? '学习成本（分钟）' : 'Learning time (minutes)'}<input type="number" min="0" step="1" value={asset.learningMinutes ?? ''} onChange={event => patchAsset(asset.id, { learningMinutes: optionalNumber(event.target.value) })} /></label></div>
                    <div className={styles.field}><label>{language === 'zh' ? '维护责任人' : 'Maintenance owner'}<input value={asset.maintenanceOwner} onChange={event => patchAsset(asset.id, { maintenanceOwner: event.target.value })} /></label></div>
                  </div>
                  <div className={styles.field}><label>{language === 'zh' ? '部署与使用成本说明' : 'Deployment and usage cost notes'}<textarea value={asset.deploymentNotes} onChange={event => patchAsset(asset.id, { deploymentNotes: event.target.value })} /></label></div>
                  <div className={styles.field}><label>{language === 'zh' ? '权限与安全边界' : 'Permissions and safety boundaries'}<textarea value={asset.permissionNotes} onChange={event => patchAsset(asset.id, { permissionNotes: event.target.value })} /></label></div>
                </div>
              ))}
              <button className={styles.button} data-testid="office-add-asset" type="button" onClick={() => updateState(current => ({ ...current, reusableAssets: [...current.reusableAssets, { id: id('a'), name: '', type: 'sop', path: '', status: 'planned', targetRoles: [], learningMinutes: null, deploymentNotes: '', permissionNotes: '', maintenanceOwner: '' }] }))}>{c.addAsset}</button>
            </section>
          </>
        )}

        {stage === 'delivery' && (
          <>
            <section className={styles.section} aria-labelledby="office-finals-title">
              <h3 id="office-finals-title">{language === 'zh' ? '演示与决赛准备' : 'Demo and finals readiness'}</h3>
              <p className={styles.sectionIntro}>{c.finalsIntro}</p>
              <div className={styles.field}><label htmlFor="office-demo">{c.demoScript}</label><textarea id="office-demo" value={state.finals.demoScript} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, demoScript: event.target.value } }))} /></div>
              <div className={styles.field}><label htmlFor="office-questions">{c.questions}</label><textarea id="office-questions" value={state.finals.questions.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, questions: lines(event.target.value) } }))} /></div>
              <div className={styles.field}><label htmlFor="office-checks">{c.checklist}</label><textarea id="office-checks" value={state.finals.operatorChecklist.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, operatorChecklist: lines(event.target.value) } }))} /></div>

              <div className={styles.record}>
                <div className={styles.recordTitle}>{language === 'zh' ? '真实落地证据' : 'Real adoption evidence'}</div>
                <div className={styles.grid2}>
                  <div className={styles.field}><label>{language === 'zh' ? '使用周期' : 'Usage period'}<input value={state.finals.landingEvidence.usagePeriod} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, landingEvidence: { ...current.finals.landingEvidence, usagePeriod: event.target.value } } }))} /></label></div>
                  <div className={styles.field}><label>{language === 'zh' ? '真实使用次数' : 'Real usage count'}<input type="number" min="0" step="1" value={state.finals.landingEvidence.useCount ?? ''} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, landingEvidence: { ...current.finals.landingEvidence, useCount: optionalNumber(event.target.value) } } }))} /></label></div>
                </div>
                <div className={styles.field}><label>{language === 'zh' ? '真实使用者或岗位（每行一项）' : 'Real users or roles (one per line)'}<textarea value={state.finals.landingEvidence.users.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, landingEvidence: { ...current.finals.landingEvidence, users: lines(event.target.value) } } }))} /></label></div>
                <div className={styles.field}><label>{language === 'zh' ? '业务产出与证据位置（每行一项）' : 'Business outputs and evidence locations (one per line)'}<textarea value={state.finals.landingEvidence.outputs.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, landingEvidence: { ...current.finals.landingEvidence, outputs: lines(event.target.value) } } }))} /></label></div>
                <div className={styles.field}><label>{language === 'zh' ? '真实反馈与证据位置（每行一项）' : 'Real feedback and evidence locations (one per line)'}<textarea value={state.finals.landingEvidence.feedback.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, landingEvidence: { ...current.finals.landingEvidence, feedback: lines(event.target.value) } } }))} /></label></div>
              </div>

              <div className={styles.record}>
                <div className={styles.recordTitle}>{language === 'zh' ? '后续落地推进' : 'Rollout plan'}</div>
                <div className={styles.field}><label>{language === 'zh' ? '目标岗位（每行一项）' : 'Target roles (one per line)'}<textarea value={state.finals.rolloutPlan.targetRoles.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, rolloutPlan: { ...current.finals.rolloutPlan, targetRoles: lines(event.target.value) } } }))} /></label></div>
                <div className={styles.field}><label>{language === 'zh' ? '里程碑（每行一项）' : 'Milestones (one per line)'}<textarea value={state.finals.rolloutPlan.milestones.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, rolloutPlan: { ...current.finals.rolloutPlan, milestones: lines(event.target.value) } } }))} /></label></div>
                <div className={styles.field}><label>{language === 'zh' ? '负责人' : 'Owner'}<input value={state.finals.rolloutPlan.owner} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, rolloutPlan: { ...current.finals.rolloutPlan, owner: event.target.value } } }))} /></label></div>
                <div className={styles.field}><label>{language === 'zh' ? '资源（每行一项）' : 'Resources (one per line)'}<textarea value={state.finals.rolloutPlan.resources.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, rolloutPlan: { ...current.finals.rolloutPlan, resources: lines(event.target.value) } } }))} /></label></div>
                <div className={styles.field}><label>{language === 'zh' ? '成本' : 'Costs'}<textarea value={state.finals.rolloutPlan.costs} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, rolloutPlan: { ...current.finals.rolloutPlan, costs: event.target.value } } }))} /></label></div>
                <div className={styles.field}><label>{language === 'zh' ? '风险（每行一项）' : 'Risks (one per line)'}<textarea value={state.finals.rolloutPlan.risks.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, rolloutPlan: { ...current.finals.rolloutPlan, risks: lines(event.target.value) } } }))} /></label></div>
                <div className={styles.field}><label>{language === 'zh' ? '衡量指标（每行一项）' : 'Success measures (one per line)'}<textarea value={state.finals.rolloutPlan.metrics.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, rolloutPlan: { ...current.finals.rolloutPlan, metrics: lines(event.target.value) } } }))} /></label></div>
              </div>

              <div className={styles.record}>
                <div className={styles.recordTitle}>{language === 'zh' ? 'AI 适配与优化' : 'AI adaptation and optimization'}</div>
                <div className={styles.field}><label>{language === 'zh' ? 'Prompt / Skill / 流程版本（每行一项）' : 'Prompt / Skill / workflow versions (one per line)'}<textarea value={state.finals.aiOptimization.versions.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, aiOptimization: { ...current.finals.aiOptimization, versions: lines(event.target.value) } } }))} /></label></div>
                <div className={styles.field}><label>{language === 'zh' ? '评估方法与数据' : 'Evaluation method and data'}<textarea value={state.finals.aiOptimization.evaluation} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, aiOptimization: { ...current.finals.aiOptimization, evaluation: event.target.value } } }))} /></label></div>
                <div className={styles.field}><label>{language === 'zh' ? '迭代原因与结果（每行一项）' : 'Iteration rationale and outcomes (one per line)'}<textarea value={state.finals.aiOptimization.iterations.join('\n')} onChange={event => updateState(current => ({ ...current, finals: { ...current.finals, aiOptimization: { ...current.finals.aiOptimization, iterations: lines(event.target.value) } } }))} /></label></div>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="office-audit-title">
              <h3 id="office-audit-title">{c.stages[3]}</h3>
              <p className={styles.sectionIntro}>{c.disclaimer}</p>
              <button className={`${styles.button} ${styles.buttonPrimary}`} data-testid="office-run-audit" type="button" disabled={busy != null} onClick={() => void runAudit()}>{busy === 'audit' ? c.auditing : c.audit}</button>
              {!audit && <p className={styles.empty}>{c.auditEmpty}</p>}
              {audit && (
                <div aria-live="polite">
                  <div className={styles.auditModule}>
                    <strong>{c.guideScore}</strong>
                    <span className={styles.score}>{guidanceScore(audit.totalGuidanceScore, language)} · {audit.confidence}</span>
                    <span className={styles.reason}>
                      {audit.scoreFormation?.scoreStatus === 'ready'
                        ? (language === 'zh' ? '可形成建议分' : 'Guidance available')
                        : (language === 'zh' ? '待补材料，不形成总建议分' : 'Materials required; no total score')}
                      {' · '}{audit.scoreFormation?.reason || c.disclaimer}
                    </span>
                  </div>
                  <div className={styles.deliveryGate}>
                    <strong>{language === 'zh' ? '人工确认与导出' : 'Human confirmation & export'}</strong>
                    <label className={styles.checkline}>
                      <input data-testid="office-export-confirm" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
                      <span>{c.confirm}</span>
                    </label>
                    <button className={`${styles.button} ${styles.buttonPrimary}`} data-testid="office-export" type="button" disabled={!audit || !confirmed || busy != null} onClick={() => void runExport()}>{busy === 'export' ? c.exporting : c.export}</button>
                    {exported && (
                      <div className={styles.success} role="status">
                        <strong>{c.files}</strong>
                        {exported.files.map(file => <div className={styles.exportFile} key={file.path}><span>{file.path}</span><code>{file.sha256.slice(0, 8)}</code></div>)}
                      </div>
                    )}
                  </div>
                  {Object.entries(audit.modules || {}).map(([key, module]) => (
                    <div className={styles.auditModule} key={key}>
                      <strong>{moduleLabels[key as keyof typeof moduleLabels]?.[language] || key}</strong>
                      <span className={styles.score}>
                        {module.score} / {module.max} · {module.confidence}
                        {typeof module.rawScore === 'number' && module.rawScore !== module.score ? ` · ${language === 'zh' ? '原始' : 'raw'} ${module.rawScore}` : ''}
                      </span>
                      <span className={styles.reason}>{language === 'zh' ? '所在分档：' : 'Band: '}{module.band}</span>
                      {(module.checks || []).length > 0 && <span className={styles.reason}>{module.checks.filter(check => !check.pass).map(check => check.label).join('；') || (language === 'zh' ? '当前检查项已满足' : 'Current checks pass')}</span>}
                      {(module.reasons || []).length > 0 && <span className={styles.reason}>{language === 'zh' ? '理由：' : 'Reasons: '}{module.reasons.join('；')}</span>}
                      {(module.deductions || []).filter(Boolean).length > 0 && <span className={styles.reason}>{language === 'zh' ? '扣减：' : 'Deductions: '}{module.deductions.filter(Boolean).join('；')}</span>}
                      {(module.evidenceLocations || []).length > 0 && <span className={styles.reason}>{language === 'zh' ? '证据定位：' : 'Evidence: '}{module.evidenceLocations.map(item => `${item.path || item.id}${item.location ? `#${item.location}` : ''}`).join('；')}</span>}
                      {key === 'efficiency' && module.analysisPath && <span className={styles.reason}>{language === 'zh' ? '分析路径：' : 'Analysis path: '}{module.analysisPath.join(' → ')}</span>}
                      {key === 'efficiency' && module.assumptions && module.assumptions.length > 0 && <span className={styles.reason}>{language === 'zh' ? '假设：' : 'Assumptions: '}{module.assumptions.join('；')}</span>}
                      {key === 'efficiency' && module.possibleBias && module.possibleBias.length > 0 && <span className={styles.reason}>{language === 'zh' ? '可能偏差：' : 'Possible bias: '}{module.possibleBias.join('；')}</span>}
                    </div>
                  ))}
                  {(audit.ruleMatrix || []).map(item => (
                    <div className={styles.auditRow} key={item.ruleId}>
                      <span>{item.label || item.ruleId}</span>
                      <strong>{item.status}</strong>
                      {item.reason && <span className={styles.reason}>{item.reason}</span>}
                    </div>
                  ))}
                  {(audit.caps || []).map(cap => <p className={styles.notice} key={cap.id}>{language === 'zh' ? `模块规则上限 ${cap.maxScore} 分：${cap.reason}` : `Module cap ${cap.maxScore}: ${cap.reason}`}</p>)}
                  {[...(audit.readability?.materials || []), ...(audit.readability?.evidence || [])].map(item => (
                    <div className={styles.auditRow} key={`${item.source}-${item.path}`}>
                      <span>{item.path || item.source}</span>
                      <strong>{item.status}</strong>
                      {item.reason && <span className={styles.reason}>{item.reason}</span>}
                    </div>
                  ))}
                  {(audit.informationRisks || []).map((risk, index) => <p className={styles.notice} key={`${risk.id}-${risk.source}-${index}`}>{risk.message} · {risk.source}</p>)}
                  {audit.finals && Object.entries(audit.finals).map(([key, item]) => (
                    <div className={styles.auditRow} key={key}><span>{key}</span><strong>{item.status}</strong></div>
                  ))}
                  {(audit.risks || []).map((risk, index) => <p className={styles.notice} key={`${risk.id || 'risk'}-${index}`}>{risk.message}</p>)}
                </div>
              )}
            </section>
          </>
        )}

        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerStatus} role="status">{message || c.disclaimer}</span>
        <button className={`${styles.button} ${styles.buttonPrimary}`} data-testid="office-save" type="button" disabled={busy != null} onClick={() => void persist()}>{busy === 'save' ? c.saving : c.save}</button>
      </footer>
    </div>
  );
}

export default OfficeDeliveryPanel;
