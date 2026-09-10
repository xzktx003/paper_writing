import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getWritingWorkbenchContext,
  reviewWritingAnswer,
  type WritingAnswerReview,
  type WritingWorkbenchContext,
  type WorkbenchTaskStarter,
} from '../api/writingWorkbenchApi';
import styles from './WritingWorkbenchPanel.module.css';

interface Props {
  projectId: string;
  activeFile?: string;
  onUseDraft: (draft: { prompt: string; skill?: string; mode: 'chat' | 'agent' | 'tools'; title?: string }) => void | Promise<void>;
}

const POLISH_TASK = '请润色当前文件中的目标段落，提升清晰度、连贯性和学术语气；保留公式、引用键、数字和 LaTeX 命令，不新增事实，不直接覆盖原文，只生成可审查的修改建议或 diff。';

function skillTitle(context: WritingWorkbenchContext) {
  const skill = context.skills?.recommendations?.[0]?.skill;
  return skill?.display_name_zh || skill?.display_name || skill?.name || '';
}

function skillDescription(context: WritingWorkbenchContext) {
  const skill = context.skills?.recommendations?.[0]?.skill;
  return skill?.description_zh || skill?.description || '';
}

export function WritingWorkbenchPanel({ projectId, activeFile, onUseDraft }: Props) {
  const [task, setTask] = useState('');
  const [evidenceQuery, setEvidenceQuery] = useState('');
  const [context, setContext] = useState<WritingWorkbenchContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');
  const [review, setReview] = useState<WritingAnswerReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const requestSequence = useRef(0);

  const loadContext = useCallback(async (nextTask: string, nextEvidenceQuery = evidenceQuery) => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError('');
    setReview(null);
    try {
      const result = await getWritingWorkbenchContext(projectId, {
        task: nextTask.trim(),
        evidenceQuery: nextEvidenceQuery.trim() || nextTask.trim(),
        contextAnswers: activeFile ? { target_section_or_file: activeFile } : {},
        skillLimit: 5,
        evidenceLimit: 4,
      });
      if (requestSequence.current === requestId) setContext(result);
    } catch (caught) {
      if (requestSequence.current === requestId) {
        setError(caught instanceof Error ? caught.message : '论文写作分析失败，请稍后重试。');
      }
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [activeFile, evidenceQuery, projectId]);

  useEffect(() => {
    setTask('');
    setEvidenceQuery('');
    setAnswer('');
    setReview(null);
    void loadContext('', '');
  }, [projectId, activeFile]);

  const chooseStarter = (starter: WorkbenchTaskStarter) => {
    if (starter.disabled) return;
    setTask(starter.prompt);
    setEvidenceQuery('');
    void loadContext(starter.prompt, '');
  };

  const choosePolish = () => {
    setTask(POLISH_TASK);
    setEvidenceQuery('');
    void loadContext(POLISH_TASK, '');
  };

  const useDraft = async () => {
    if (!context) return;
    const prompt = context.aiDraftRequest?.send?.userMessage || context.writingPrompt?.text || task;
    if (!prompt.trim()) return;
    const primarySkill = context.aiDraftRequest?.active_skills?.[0] || context.skills?.recommendations?.[0]?.skill?.name;
    await onUseDraft({
      prompt,
      skill: primarySkill,
      mode: context.aiDraftRequest?.mode || context.taskRouting?.mode || 'chat',
      title: task.slice(0, 36),
    });
  };

  const runReview = async () => {
    if (!answer.trim()) return;
    setReviewLoading(true);
    setError('');
    try {
      const result = await reviewWritingAnswer(projectId, {
        task: task.trim(),
        answer: answer.trim(),
        evidenceQuery: evidenceQuery.trim() || context?.evidencePack?.query || task.trim(),
        evidencePackFingerprint: context?.evidencePack?.fingerprint,
        contextAnswers: activeFile ? { target_section_or_file: activeFile } : {},
        evidenceLimit: 4,
      });
      setReview(result.review);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI 草稿审查失败，请稍后重试。');
    } finally {
      setReviewLoading(false);
    }
  };

  const starters = context?.taskStarters || [];
  const recommendations = context?.skills?.recommendations || [];
  const evidence = context?.evidencePack?.items || [];
  const workflowSteps = context?.paperWorkflowGuide?.steps || [];
  const queuedActions = context?.actionQueue?.actions || [];
  const sendBlocked = context?.modeActionCenter?.sendGate?.canSend === false || context?.modeActionCenter?.primaryAction?.enabled === false;
  const hasAnalyzedTask = Boolean(context?.task);

  return (
    <section className={styles.panel} data-testid="writing-workbench-panel">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>论文写作助手</h2>
          <p className={styles.subtitle}>把“我要写什么”变成可检查的写作步骤、证据和 Skill。</p>
        </div>
      </header>

      <div className={styles.safety}>
        <span className={styles.safetyDot} aria-hidden="true" />
        <span>只生成建议，不会自动修改论文文件；Agent 的修改仍需在 Diff 中人工接受。</span>
      </div>

      <div className={styles.section}>
        <label className={styles.label} htmlFor="writing-workbench-task">
          <span>你想完成什么？</span>
          <span className={styles.file} title={activeFile || '项目范围'}>{activeFile || '项目范围'}</span>
        </label>
        <textarea
          id="writing-workbench-task"
          className={styles.textarea}
          value={task}
          onChange={event => setTask(event.target.value)}
          placeholder="例如：基于已上传文献写 Related Work，或润色当前 Introduction。"
        />
        <input
          className={styles.input}
          value={evidenceQuery}
          onChange={event => setEvidenceQuery(event.target.value)}
          placeholder="可选：输入本地文献检索关键词"
          aria-label="本地文献检索关键词"
        />
        <div className={styles.actions}>
          <button className={styles.primaryButton} type="button" disabled={!task.trim() || loading} onClick={() => void loadContext(task)}>
            {loading ? '正在分析…' : '分析写作任务'}
          </button>
          <button className={styles.secondaryButton} type="button" disabled={!activeFile || loading} onClick={choosePolish} title={activeFile ? '为当前文件准备保守润色任务' : '请先打开论文文件'}>
            润色当前文件
          </button>
        </div>
        <p className={styles.muted}>润色会保留公式、引用键、数字和 LaTeX 命令，并要求先给出可审查 diff。</p>
      </div>

      {starters.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>常用论文任务</h3>
          <div className={styles.starters}>
            {starters.slice(0, 10).map(starter => (
              <button
                className={styles.starterButton}
                key={starter.id}
                type="button"
                disabled={starter.disabled || loading}
                onClick={() => chooseStarter(starter)}
                title={starter.disabledReason_zh || starter.help_zh}
              >
                <span className={styles.starterTitle}>{starter.title_zh}</span>
                <span className={styles.starterHelp}>{starter.help_zh || starter.subtitle_en}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className={styles.error} role="alert">{error}</div>}
      {loading && !context && <div className={styles.loading} role="status">正在读取项目状态和论文资料…</div>}

      {hasAnalyzedTask && context && (
        <>
          <div className={styles.statusBand}>
            <span className={styles.statusTitle}>{context.agentReadiness?.label_zh || '写作准备度待确认'}</span>
            <span className={styles.score}>{context.agentReadiness?.score ?? '—'}/100</span>
            <span className={styles.statusSummary}>{context.agentReadiness?.summary_zh || context.paperWorkflowGuide?.summary_zh}</span>
          </div>

          <div className={styles.section}>
            <div className={styles.modeRow}>
              <span className={styles.badge}>{context.taskRouting?.modeLabel_zh || context.taskRouting?.mode || '对话'}</span>
              <span className={styles.muted}>{context.taskRouting?.reasons?.[0] || '系统会按任务风险选择 Chat、Agent 或 Tools。'}</span>
            </div>
            <div className={styles.workflow} aria-label="论文写作流程进度">
              {workflowSteps.map(step => (
                <span
                  key={step.id}
                  className={`${styles.workflowStep} ${step.blocking ? styles.workflowBlocked : (['ready', 'complete'].includes(step.status) ? styles.workflowReady : '')}`}
                  title={`${step.title_zh}：${step.status}`}
                />
              ))}
            </div>
            {context.paperWorkflowGuide?.currentStep && (
              <p className={styles.muted}>当前步骤：{context.paperWorkflowGuide.currentStep.title_zh}。{context.paperWorkflowGuide.currentStep.action?.label_zh}</p>
            )}
          </div>

          {recommendations.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>推荐 Skill</h3>
              <ul className={styles.list}>
                <li className={styles.listItem}>
                  <strong>{skillTitle(context)}</strong>
                  {skillDescription(context) || '已按当前论文任务、材料状态和风险边界匹配。'}
                  {(recommendations[0].skill.inputs?.length || recommendations[0].skill.outputs?.length) ? (
                    <span className={styles.evidenceText}>
                      输入：{recommendations[0].skill.inputs?.slice(0, 3).join('、') || '当前任务与论文上下文'}；输出：{recommendations[0].skill.outputs?.slice(0, 3).join('、') || '可审查建议'}
                    </span>
                  ) : null}
                </li>
              </ul>
            </div>
          )}

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>证据状态</h3>
            <div className={styles.modeRow}>
              <span className={styles.badge}>{context.evidencePack?.label_zh || context.citationPolicy?.label_zh || '普通写作'}</span>
              <span className={styles.muted}>{evidence.length} 条当前命中</span>
            </div>
            <p className={styles.muted}>{context.evidencePack?.message_zh || context.citationPolicy?.message_zh || '当前任务不强制依赖文献证据。'}</p>
            {evidence.length > 0 && (
              <ul className={styles.list}>
                {evidence.slice(0, 3).map((item, index) => (
                  <li className={styles.listItem} key={`${item.rank || index}-${item.source?.path || 'source'}`}>
                    <strong>[{item.rank || index + 1}] {item.source?.title || item.source?.path || '项目资料'}</strong>
                    <span className={styles.evidenceText}>{item.text || '已命中证据片段。'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {queuedActions.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>下一步</h3>
              <ul className={styles.list}>
                {queuedActions.slice(0, 4).map((item, index) => (
                  <li className={styles.listItem} key={item.id || `${item.type}-${index}`}>
                    <strong>{index + 1}. {item.label_zh || item.action?.label_zh || item.type}</strong>
                    {item.reason_zh || (item.blocking ? '这是生成正文前必须处理的阻塞项。' : '按此步骤继续即可。')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.section}>
            <button className={styles.primaryButton} type="button" disabled={loading || sendBlocked} onClick={() => void useDraft()}>
              {sendBlocked ? (context.modeActionCenter?.primaryAction?.label_zh || '先补齐必要材料') : '带到 AI 对话'}
            </button>
            <p className={styles.muted}>这一步只填入任务并切换到推荐模式；你仍需检查内容后再点击发送。</p>
          </div>

          <details className={styles.review}>
            <summary>审查 AI 草稿</summary>
            <div className={styles.reviewBody}>
              <p className={styles.muted}>粘贴 AI 输出，检查来源编号、证据越界、上下文缺口和人工确认门槛。</p>
              <textarea
                className={styles.textarea}
                value={answer}
                onChange={event => setAnswer(event.target.value)}
                placeholder="粘贴要审查的 AI 草稿…"
              />
              <button className={styles.secondaryButton} type="button" disabled={!answer.trim() || reviewLoading} onClick={() => void runReview()}>
                {reviewLoading ? '正在审查…' : '运行证据审查'}
              </button>
              {review && (
                <div className={styles.reviewResult} role="status">
                  <div className={styles.modeRow}>
                    <span className={styles.badge}>{review.label_zh || review.status}</span>
                    <span className={styles.muted}>{review.message_zh}</span>
                  </div>
                  {(review.findings || []).length > 0 && (
                    <ul className={styles.list}>
                      {review.findings?.slice(0, 5).map((finding, index) => (
                        <li className={styles.listItem} key={finding.id || index}>
                          <strong>{finding.blocking ? '必须修复：' : '建议检查：'}{finding.label_zh}</strong>
                          {finding.detail_zh}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
