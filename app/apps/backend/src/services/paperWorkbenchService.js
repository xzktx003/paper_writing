import { readFileSync } from 'fs';
import { stat } from 'fs/promises';
import { resolve } from 'path';
import crypto from 'crypto';
import { safeJoin } from '../utils/pathSecurity.js';
import { buildOcrCapability, buildRagEvidence, listCorpusDocuments } from './paperRagService.js';
import { buildSkillNavigator, buildTaskIntentGuide, listSkillCategories, recommendSkills } from './skillEngine.js';

function emptyEvidence(query = '') {
  return {
    query,
    context: '',
    results: [],
  };
}

function normalizeContextAnswers(rawAnswers = {}) {
  const answers = {};
  if (!rawAnswers || typeof rawAnswers !== 'object') return answers;
  for (const [key, value] of Object.entries(rawAnswers)) {
    if (!key) continue;
    const normalizedValue = normalizeContextAnswerValue(value);
    if (normalizedValue) answers[key] = normalizedValue;
  }
  return answers;
}

function normalizeContextAnswerValue(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .join('\n');
  }
  if (value && typeof value === 'object') {
    const lines = Object.entries(value)
      .map(([key, item]) => `${key}: ${String(item || '').trim()}`)
      .filter(line => !line.endsWith(': '));
    return lines.join('\n');
  }
  return String(value || '').trim();
}

function hasContextAnswer(contextAnswers, key) {
  return Boolean(contextAnswers?.[key]);
}

function hasExplicitRagMention(text = '') {
  return /(^|[^a-z0-9])rag([^a-z0-9]|$)/i.test(String(text || ''));
}

export async function buildPaperWorkbenchContext(projectRoot, options = {}) {
  const task = String(options.task || '').trim();
  const evidenceQuery = String(options.evidenceQuery || options.ragQuery || options.query || task).trim();
  const projectId = String(options.projectId || '').trim();
  const skillLimit = Math.min(Number(options.skillLimit || options.limit || 5), 10);
  const evidenceLimit = Math.min(Number(options.evidenceLimit || 3), 10);
  const contextAnswers = normalizeContextAnswers(options.contextAnswers || options.context || {});

  const documents = await listCorpusDocuments(projectRoot).catch(() => []);
  const ragSummary = summarizeRagDocuments(documents);
  const hasReferences = await hasProjectReferences(projectRoot);
  const projectState = {
    hasRagDocuments: ragSummary.indexedChunks > 0,
    hasReferences,
    ragDocumentCount: ragSummary.total,
    parsedRagDocumentCount: ragSummary.parsed,
    failedRagDocumentCount: ragSummary.failed,
    metadataOnlyRagDocumentCount: ragSummary.metadataOnly,
    contextAnswers,
    answeredContextKeys: Object.keys(contextAnswers),
  };

  const recommendations = task
    ? recommendSkills(task, { limit: skillLimit, projectState })
    : [];
  const skillNavigator = buildSkillNavigator({
    recommendations,
    selectedSkill: recommendations[0]?.skill?.name || '',
  });
  const taskIntentGuide = buildTaskIntentGuide(task, {
    recommendations,
    projectState,
  });
  const evidence = evidenceQuery
    ? await buildRagEvidence(projectRoot, evidenceQuery, { limit: evidenceLimit })
    : emptyEvidence('');
  const ragHealth = buildRagHealth(ragSummary, evidence);
  const taskRouting = routeWritingTask(task, {
    projectState,
    evidence,
    recommendations,
    contextAnswers,
  });
  const ragUiHints = buildRagUiHints(ragSummary, evidence);
  const workflowHints = buildWorkflowHints({
    task,
    projectState,
    ragSummary,
    evidence,
    recommendations,
    taskRouting,
    ragUiHints,
  });
  const contextReadiness = buildContextReadiness({
    task,
    projectState,
    recommendations,
    taskRouting,
    ragHealth,
    contextAnswers,
  });
  const clarificationQuestions = buildClarificationQuestions({
    task,
    taskRouting,
    contextReadiness,
    recommendations,
  });
  const contextBrief = buildContextBrief({
    task,
    taskRouting,
    contextReadiness,
    clarificationQuestions,
    recommendations,
    contextAnswers,
  });
  const citationPolicy = buildCitationPolicy({
    task,
    evidence,
    ragHealth,
    projectState,
  });
  const acceptanceChecklist = buildAcceptanceChecklist({
    taskRouting,
    contextReadiness,
    citationPolicy,
    evidence,
  });
  const recentDocuments = documents
    .slice()
    .sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0))
    .slice(0, 8)
    .map(toDocumentCard);
  const repairGuide = buildRagRepairGuide({
    summary: ragSummary,
    documents: recentDocuments,
    evidence,
  });
  const documentReadinessGuide = buildDocumentReadinessGuide({
    summary: ragSummary,
    documents: recentDocuments,
  });
  const evidencePack = buildEvidencePack({
    task,
    evidence,
    citationPolicy,
  });
  const queryAssistant = buildRagQueryAssistant({
    task,
    evidence,
    evidencePack,
    ragSummary,
    ragHealth,
    repairGuide,
  });
  const queryRewriteGuide = buildRagQueryRewriteGuide({
    task,
    evidence,
    evidencePack,
    ragSummary,
    queryAssistant,
  });
  const draftPlan = buildDraftPlan({
    task,
    taskRouting,
    recommendations,
    evidencePack,
    citationPolicy,
    contextBrief,
  });
  const writingPrompt = buildWritingPrompt({
    task,
    taskRouting,
    recommendations,
    evidence,
    evidencePack,
    contextReadiness,
    clarificationQuestions,
    contextBrief,
    draftPlan,
    citationPolicy,
    acceptanceChecklist,
  });
  const aiDraftRequest = buildAiDraftRequest({
    projectId,
    task,
    evidenceQuery,
    taskRouting,
    recommendations,
    writingPrompt,
  });
  const interactionPlan = buildInteractionPlan({
    task,
    taskRouting,
    contextReadiness,
    citationPolicy,
    acceptanceChecklist,
    recommendations,
    evidence,
  });
  const modeDecisionGuide = buildModeDecisionGuide({
    taskRouting,
    interactionPlan,
    contextReadiness,
    citationPolicy,
    evidence,
    recommendations,
  });
  const modeActionCenter = buildModeActionCenter({
    taskRouting,
    interactionPlan,
    modeDecisionGuide,
    aiDraftRequest,
    contextReadiness,
    citationPolicy,
    evidencePack,
  });
  aiDraftRequest.interactionPlan = {
    mode: interactionPlan.mode,
    primaryCta_zh: interactionPlan.primaryCta_zh,
    requiresConfirmation: interactionPlan.requiresConfirmation,
    confirmationRequiredBefore: interactionPlan.confirmationRequiredBefore,
    blockedReasons: interactionPlan.blockedReasons,
  };

  const context = {
    task,
    taskRouting,
    workflowHints,
    taskStarters: [],
    interactionPlan,
    modeActionCenter,
    modeDecisionGuide,
    evidencePack,
    contextReadiness,
    clarificationQuestions,
    contextBrief,
    draftPlan,
    citationPolicy,
    acceptanceChecklist,
    writingPrompt,
    aiDraftRequest,
    projectState,
    skills: {
      categories: listSkillCategories(),
      recommendations,
      navigator: skillNavigator,
      taskIntentGuide,
      decisionGuide: buildSkillDecisionGuide({
        recommendations,
        taskRouting,
        contextReadiness,
      }),
      compareGuide: buildSkillCompareGuide({
        recommendations,
        taskRouting,
        contextReadiness,
      }),
    },
    rag: {
      ready: ragSummary.indexedChunks > 0,
      health: ragHealth,
      summary: ragSummary,
      recentDocuments,
      evidence,
      uiHints: ragUiHints,
      repairGuide,
      documentReadinessGuide,
      queryAssistant,
      queryRewriteGuide,
      evidencePack,
    },
    runtimeEnvironment: buildRuntimeEnvironmentGuide({
      documents: recentDocuments,
      ragSummary,
    }),
  };

  context.taskStarters = buildTaskStarters(context);
  context.paperWorkflowGuide = buildPaperWorkflowGuide(context);
  context.actionQueue = buildActionQueue(context);
  context.agentReadiness = buildAgentReadiness(context);
  context.uiModel = buildWorkbenchUiModel(context);
  context.workbenchBundle = buildWorkbenchBundle(context);
  return context;
}

export function reviewGeneratedAnswer(answer, context = {}) {
  const text = String(answer || '').trim();
  const evidencePack = context.evidencePack || context.rag?.evidencePack || {};
  const citationPolicy = context.citationPolicy || {};
  const acceptanceChecklist = context.acceptanceChecklist || { items: [] };
  const contextReadiness = context.contextReadiness || {};
  const interactionPlan = context.interactionPlan || {};
  const previousReview = context.previousReview || null;
  const findings = [];
  const evidencePackDrift = buildEvidencePackDriftFinding({
    expectedFingerprint: context.expectedEvidencePackFingerprint || context.evidencePackFingerprint,
    evidencePack,
  });

  if (!text) {
    findings.push({
      id: 'empty-answer',
      severity: 'high',
      label_zh: '没有可审查的 AI 输出',
      detail_zh: '请先生成或粘贴 AI 回复。',
      blocking: true,
    });
  }

  if (evidencePackDrift) findings.push(evidencePackDrift);

  const sourceRefs = parseSourceReferences(text);
  const rankIndex = buildEvidenceRankIndex(evidencePack.items || []);
  const unknownRefs = sourceRefs.filter(rank => !rankIndex.ranks.has(rank));
  const citationSensitive = Boolean(citationPolicy.citationSensitive || evidencePack.citationSensitive);
  const hasEvidence = (evidencePack.items || []).length > 0;

  if (citationSensitive && hasEvidence && sourceRefs.length === 0) {
    findings.push({
      id: 'missing-source-numbers',
      severity: 'high',
      label_zh: '缺少来源编号',
      detail_zh: '当前任务依赖文献证据，但 AI 输出没有使用 [1]、[2] 等来源编号。',
      blocking: true,
    });
  }

  if (unknownRefs.length > 0) {
    findings.push({
      id: 'unknown-source-number',
      severity: 'high',
      label_zh: '引用了证据包之外的来源编号',
      detail_zh: `AI 输出引用了未命中的来源编号：${Array.from(new Set(unknownRefs)).map(rank => `[${rank}]`).join('、')}。`,
      blocking: true,
    });
  }

  if (rankIndex.issues.length > 0) {
    findings.push({
      id: 'unstable-evidence-ranks',
      severity: 'high',
      label_zh: '证据编号不稳定',
      detail_zh: `证据包存在无效或重复编号：${rankIndex.issues.join('；')}。请重新生成证据包后再审查引用。`,
      blocking: true,
    });
  }

  if (citationSensitive && !hasEvidence && looksLikeCitedProse(text)) {
    findings.push({
      id: 'fake-citation-risk',
      severity: 'high',
      label_zh: '存在假引用风险',
      detail_zh: '没有可用证据包时，输出中出现了像真实引用或来源编号的正文，应改为结构建议或补证据清单。',
      blocking: true,
    });
  }

  if (containsBibliographicClaims(text) && hasEvidence && !evidenceSupportsBibliographicClaims(evidencePack)) {
    findings.push({
      id: 'unsupported-bibliographic-claims',
      severity: 'medium',
      label_zh: '可能包含未被片段支持的文献信息',
      detail_zh: '输出出现作者、年份、venue、DOI 或 citation key 风格信息，但证据包限制不允许从片段外推这些字段。',
      blocking: false,
    });
  }

  const unsupportedBibliographicDetails = findUnsupportedBibliographicDetailsByReviewScope(text, evidencePack, sourceRefs);
  if (unsupportedBibliographicDetails.length > 0) {
    findings.push({
      id: 'unsupported-bibliographic-details',
      severity: 'high',
      label_zh: '文献信息没有被引用片段直接支持',
      detail_zh: `输出中的 ${unsupportedBibliographicDetails.slice(0, 6).map(item => item.label).join('、')} 没有出现在对应来源编号的证据片段中；作者、年份、venue、DOI 或 arXiv 编号不能由模型补全。`,
      blocking: true,
    });
  }

  const unsupportedQuantitativeDetails = findUnsupportedQuantitativeDetailsByReviewScope(text, evidencePack, sourceRefs);
  if (unsupportedQuantitativeDetails.length > 0) {
    findings.push({
      id: 'unsupported-quantitative-details',
      severity: 'high',
      label_zh: '量化结果没有被引用片段直接支持',
      detail_zh: `输出中的 ${unsupportedQuantitativeDetails.slice(0, 6).map(item => item.label).join('、')} 没有出现在对应来源编号的证据片段中；百分比、p-value、指标数值或提升幅度不能由模型补全。`,
      blocking: true,
    });
  }

  const evidenceContradictions = findEvidenceContradictionsByReviewScope(text, evidencePack, sourceRefs);
  if (evidenceContradictions.length > 0) {
    findings.push({
      id: 'claim-contradicts-evidence',
      severity: 'high',
      label_zh: '结论方向与证据相反',
      detail_zh: `输出与对应证据片段的否定/肯定方向相反：${evidenceContradictions.slice(0, 3).map(item => `[${item.rank}] ${item.label_zh}`).join('；')}。请按证据原文改写，不要把 no improvement 写成 improves。`,
      blocking: true,
    });
  }

  const coverageStatus = evidencePack.coverage?.status;
  if (
    citationSensitive &&
    hasEvidence &&
    ['single-source', 'concentrated', 'thin'].includes(coverageStatus)
  ) {
    const broadConclusion = answerMakesBroadLiteratureConclusion(text);
    findings.push({
      id: broadConclusion ? 'evidence-coverage-too-thin-for-strong-conclusion' : 'evidence-coverage-thin',
      severity: broadConclusion ? 'high' : 'medium',
      label_zh: broadConclusion ? '证据覆盖不足以支撑强综述结论' : '证据覆盖偏薄',
      detail_zh: broadConclusion
        ? `${evidencePack.coverage.label_zh || '证据覆盖不足'}：${evidencePack.coverage.guidance_zh || '当前证据来源不足，不适合写完整 related work、领域趋势或强结论。'}`
        : `${evidencePack.coverage.label_zh || '证据覆盖偏薄'}：如果继续使用该输出，只能作为局部观点草稿，不能写成完整综述结论。`,
      blocking: broadConclusion,
    });
  }

  if (contextReadiness.status === 'blocked') {
    findings.push({
      id: 'context-still-blocked',
      severity: 'medium',
      label_zh: '上下文仍未补齐',
      detail_zh: contextReadiness.message_zh || '有关键上下文缺失，建议先补齐后再采纳输出。',
      blocking: false,
    });
  }

  for (const item of acceptanceChecklist.items || []) {
    if (item.blocking) {
      findings.push({
        id: `checklist-${item.id}`,
        severity: 'medium',
        label_zh: `需人工确认：${item.label_zh}`,
        detail_zh: item.detail_zh || '这是验收清单中的阻塞项，需要用户确认 AI 输出是否满足。',
        blocking: false,
      });
    }
  }

  if (interactionPlan.requiresConfirmation) {
    findings.push({
      id: 'requires-user-confirmation',
      severity: 'medium',
      label_zh: '需要用户确认后才能采纳',
      detail_zh: (interactionPlan.confirmationRequiredBefore || []).join('；') || '当前模式要求用户确认后再采纳。',
      blocking: false,
    });
  }

  const blockingCount = findings.filter(item => item.blocking).length;
  const warningCount = findings.filter(item => !item.blocking).length;
  let status = 'adoptable';
  if (blockingCount > 0) status = 'reject';
  else if (warningCount > 0) status = 'revise';

  const revisionPlan = buildAnswerRevisionPlan({
    status,
    findings,
    evidencePack,
    contextReadiness,
    interactionPlan,
  });
  const revisionPrompt = buildAnswerRevisionPrompt({
    answer: text,
    status,
    findings,
    evidencePack,
    citationPolicy,
    acceptanceChecklist,
  });
  const adoptionGate = buildAnswerAdoptionGate({
    status,
    findings,
    sourceRefs,
    evidencePack,
    citationPolicy,
    acceptanceChecklist,
    interactionPlan,
  });
  const claimCheckQueue = buildAnswerClaimCheckQueue({
    answer: text,
    evidencePack,
    citationPolicy,
  });
  const revisionProgress = buildAnswerRevisionProgress({
    previousReview,
    status,
    findings,
    revisionPrompt,
    adoptionGate,
  });

  return {
    status,
    label_zh: {
      adoptable: '可谨慎采纳',
      revise: '需要修改后采纳',
      reject: '暂不建议采纳',
    }[status],
    message_zh: buildAnswerReviewMessage(status, blockingCount, warningCount),
    summary: {
      blockingCount,
      warningCount,
      sourceReferenceCount: sourceRefs.length,
      evidenceCount: evidencePack.items?.length || 0,
    },
    findings,
    nextActions: buildAnswerReviewActions(status, findings),
    revisionPlan,
    revisionPrompt,
    adoptionGate,
    claimCheckQueue,
    revisionProgress,
    revisionLoop: buildAnswerRevisionLoop({
      status,
      findings,
      revisionPlan,
      revisionPrompt,
      adoptionGate,
      evidencePack,
    }),
  };
}

export function buildAnswerAdoptionPackage({
  answer,
  review,
  context = {},
  targetSection,
} = {}) {
  const text = sanitizeAdoptionText(answer);
  const contextAnswers = normalizeContextAnswers(
    context.contextAnswers || context.answers || context.projectState?.contextAnswers || {},
  );
  const resolvedTarget = sanitizeAdoptionTarget(
    targetSection || contextAnswers.target_section_or_file || context.targetSection || '',
  );
  const effectiveReview = review || reviewGeneratedAnswer(text, context);
  const adoptionGate = effectiveReview?.adoptionGate || {};
  const sourceRefs = parseSourceReferences(text);
  const evidencePack = context.evidencePack || context.rag?.evidencePack || {};
  const reviewStatus = effectiveReview?.status || 'unknown';
  const blockers = [];

  if (!text) {
    blockers.push({
      id: 'empty-answer',
      label_zh: '没有可采纳的输出',
      detail_zh: '请先生成或粘贴已经审查的 AI 输出。',
    });
  }
  if (!resolvedTarget) {
    blockers.push({
      id: 'missing-target-section',
      label_zh: '缺少目标章节或文件',
      detail_zh: '请先填写要人工应用到哪个章节、文件或段落，例如 chapters/related_work.tex。',
    });
  }
  if (reviewStatus === 'reject' || adoptionGate.status === 'blocked') {
    blockers.push({
      id: 'review-rejected',
      label_zh: '审查仍有阻塞项',
      detail_zh: 'AI 输出审查结果为 reject 或采纳门槛 blocked，不能进入采纳包。',
    });
  }
  if (adoptionGate.canUseAsDraft !== true && reviewStatus !== 'revise') {
    blockers.push({
      id: 'not-draft-ready',
      label_zh: '尚不能作为待确认草稿',
      detail_zh: '请先完成修订提示词、单句检查或补证据步骤，再重新审查输出。',
    });
  }

  const status = blockers.length
    ? 'blocked'
    : reviewStatus === 'revise'
      ? 'needs-final-review'
      : 'ready-for-human-apply';
  const requiredConfirmations = Array.from(new Set([
    ...(adoptionGate.requiredConfirmations || []),
    '确认目标章节或段落确实是本次要修改的位置。',
    '人工核对所有来源编号和原文片段后，再手动编辑论文正文。',
    '应用后重新阅读前后文，确认衔接、语气和术语一致。',
  ]));
  const forbiddenActions = Array.from(new Set([
    ...(adoptionGate.forbiddenUntilConfirmed || []),
    '不得由系统自动写入、覆盖、移动或删除论文文件。',
    '不得跳过人工终审直接复制到正式稿。',
  ]));
  const insertionStrategy = resolvedTarget
    ? {
        type: 'manual-copy',
        label_zh: '人工复制到目标章节',
        detail_zh: '系统只提供可复制草稿和检查清单；由用户在论文编辑器中手动选择插入或替换位置。',
      }
    : {
        type: 'select-target-first',
        label_zh: '先选择目标章节',
        detail_zh: '补齐目标章节或文件后，再生成可人工应用的采纳包。',
      };
  const diffPlan = {
    type: 'manual-diff-plan',
    willWrite: false,
    targetSection: resolvedTarget,
    proposedText: text,
    strategy: insertionStrategy.type,
  };
  const manualApplicationGuide = buildManualApplicationGuide({
    targetSection: resolvedTarget,
    citationsUsed: sourceRefs,
    status,
  });
  const pkg = {
    status,
    label_zh: {
      blocked: '暂不能生成可采纳草稿',
      'needs-final-review': '需人工终审后手动采纳',
      'ready-for-human-apply': '可人工应用的安全采纳包',
    }[status],
    summary_zh: blockers.length
      ? `还有 ${blockers.length} 个阻塞项，不能把输出合并进论文。`
      : '已生成只读采纳包；系统不会自动写论文文件，用户需人工核对后手动应用。',
    canWriteToPaper: false,
    willWrite: false,
    requiresHumanConfirmation: true,
    target: {
      targetSection: resolvedTarget,
      display_zh: resolvedTarget || '未填写',
      userProvided: Boolean(resolvedTarget),
    },
    reviewedAnswer: text,
    review: {
      status: reviewStatus,
      label_zh: effectiveReview?.label_zh || '',
      blockingCount: effectiveReview?.summary?.blockingCount || 0,
      warningCount: effectiveReview?.summary?.warningCount || 0,
    },
    citationsUsed: sourceRefs.map(rank => {
      const evidence = (evidencePack.items || []).find(item => Number(item.rank) === rank);
      return {
        rank,
        label: `[${rank}]`,
        sourceLabel: evidence?.sourceLabel || evidence?.id || '',
        snippet: evidence?.snippet || '',
      };
    }),
    blockers,
    adoptionChecklist: [
      ...requiredConfirmations.map((item, index) => ({
        id: `confirm-${index + 1}`,
        label_zh: item,
        required: true,
      })),
      {
        id: 'rerun-review-after-edit',
        label_zh: '如果手动改写了任何引用性事实、数字、作者年份或来源编号，重新运行输出审查或单句检查。',
        required: true,
      },
    ],
    requiredConfirmations,
    forbiddenActions,
    insertionStrategy,
    diffPlan,
    manualApplicationGuide,
    copyText: '',
  };
  pkg.copyText = formatAnswerAdoptionPackageCopyText(pkg);
  return pkg;
}

function buildManualApplicationGuide({ targetSection = '', citationsUsed = [], status = '' } = {}) {
  const hasTarget = Boolean(targetSection);
  const hasCitations = citationsUsed.length > 0;
  const steps = [
    {
      id: 'locate-target',
      label_zh: '定位目标章节或段落',
      detail_zh: hasTarget
        ? `只在 ${targetSection} 中寻找本次要替换或插入的位置；不要顺手改无关章节。`
        : '先填写目标章节、文件或段落，再继续人工应用。',
      blocking: !hasTarget,
    },
    {
      id: 'snapshot-current-text',
      label_zh: '保留当前正文快照',
      detail_zh: '应用前先保留当前段落或通过版本控制查看 diff，确保可以回退和比较。',
      blocking: false,
    },
    {
      id: 'apply-as-small-manual-diff',
      label_zh: '按最小人工 diff 应用',
      detail_zh: '只复制需要采纳的句子或段落，避免整段覆盖；保持原有 LaTeX 命令、标签、脚注和上下文衔接。',
      blocking: status === 'blocked',
    },
    {
      id: 'verify-citations',
      label_zh: '逐条核对来源编号',
      detail_zh: hasCitations
        ? `核对 ${citationsUsed.map(rank => `[${rank}]`).join('、')} 是否仍对应当前证据包片段；新增或改写引用性事实后必须重新审查。`
        : '没有检测到来源编号；如果这是文献性正文，不要直接写入正式稿。',
      blocking: !hasCitations,
    },
    {
      id: 'rerun-review-after-edit',
      label_zh: '改动后重新审查',
      detail_zh: '手动改写任何事实、数字、作者年份、venue、DOI 或来源编号后，重新运行 AI 输出审查或单句证据检查。',
      blocking: false,
    },
  ];
  return {
    status: steps.some(step => step.blocking) ? 'needs-attention' : 'ready',
    label_zh: steps.some(step => step.blocking) ? '人工应用前仍需注意' : '人工应用步骤已就绪',
    steps,
    copyText: formatManualApplicationGuideCopyText({ targetSection, steps }),
  };
}

function formatManualApplicationGuideCopyText({ targetSection = '', steps = [] } = {}) {
  return [
    '# 人工应用指南',
    `目标位置：${targetSection || '未填写'}`,
    '',
    '# 步骤',
    ...steps.map((step, index) => `${index + 1}. ${step.label_zh}${step.blocking ? '（阻塞）' : ''}\n   ${step.detail_zh}`),
    '',
    '# 边界',
    '- 系统不得自动写入、覆盖、移动或删除论文文件。',
    '- 只做最小人工 diff；任何新增事实或引用变化都要重新审查。',
  ].join('\n');
}

export function reviewClaimAgainstEvidence(claim, context = {}) {
  const text = String(claim || '').trim();
  const evidencePack = context.evidencePack || context.rag?.evidencePack || {};
  const citationPolicy = context.citationPolicy || {};
  const items = evidencePack.items || [];
  const findings = [];
  const evidencePackDrift = buildEvidencePackDriftFinding({
    expectedFingerprint: context.expectedEvidencePackFingerprint || context.evidencePackFingerprint,
    evidencePack,
  });

  if (!text) {
    findings.push({
      id: 'empty-claim',
      severity: 'high',
      label_zh: '没有可检查的句子',
      detail_zh: '请先输入一句要写进论文的 claim 或文献陈述。',
      blocking: true,
    });
  }

  if (evidencePackDrift) findings.push({
    ...evidencePackDrift,
    id: 'evidence-pack-changed',
    label_zh: '证据包已经变化',
    detail_zh: '这句话使用的来源编号可能不再对应生成草稿时的证据片段；请重新生成证据包、重新审查输出，再决定是否写入。',
  });

  const sourceRefs = parseSourceReferences(text);
  const rankIndex = buildEvidenceRankIndex(items);
  const unknownRefs = sourceRefs.filter(rank => !rankIndex.ranks.has(rank));
  const citationSensitive = Boolean(citationPolicy.citationSensitive || evidencePack.citationSensitive || looksLikeCitedProse(text));
  const matches = matchClaimToEvidence(text, items);

  if (citationSensitive && items.length === 0) {
    findings.push({
      id: 'no-evidence-for-claim',
      severity: 'high',
      label_zh: '没有可用证据支持这句话',
      detail_zh: '当前没有命中的证据包。不要把这句话写成有引用支撑的事实陈述。',
      blocking: true,
    });
  }

  if (unknownRefs.length > 0) {
    findings.push({
      id: 'unknown-source-number',
      severity: 'high',
      label_zh: '引用了不存在的证据编号',
      detail_zh: `这句话引用了证据包之外的编号：${Array.from(new Set(unknownRefs)).map(rank => `[${rank}]`).join('、')}。`,
      blocking: true,
    });
  }

  if (rankIndex.issues.length > 0) {
    findings.push({
      id: 'unstable-evidence-ranks',
      severity: 'high',
      label_zh: '证据编号不稳定',
      detail_zh: `证据包存在无效或重复编号：${rankIndex.issues.join('；')}。请重新生成证据包后再检查这句话。`,
      blocking: true,
    });
  }

  if (citationSensitive && items.length > 0 && sourceRefs.length === 0) {
    findings.push({
      id: 'missing-source-number',
      severity: 'high',
      label_zh: '缺少来源编号',
      detail_zh: '这句话像文献事实陈述，但没有标注 [1]、[2] 等证据编号。',
      blocking: true,
    });
  }

  if (items.length > 0 && matches.length === 0 && text) {
    findings.push({
      id: 'no-direct-evidence-match',
      severity: citationSensitive ? 'high' : 'medium',
      label_zh: '没有找到直接支撑片段',
      detail_zh: '证据包里没有明显匹配这句话关键词的片段。建议改写为更弱的表述，或先检索/上传更多证据。',
      blocking: citationSensitive,
    });
  }

  const bestMatch = matches[0] || null;
  if (citationSensitive && bestMatch && isWeakClaimEvidenceMatch(bestMatch)) {
    findings.push({
      id: 'weak-evidence-match',
      severity: 'high',
      label_zh: '证据匹配太弱',
      detail_zh: `这句话只和证据 [${bestMatch.rank}] 匹配了 ${bestMatch.overlapTerms.length}/${bestMatch.claimTermCount} 个关键词，缺少直接支撑：${bestMatch.missingTerms.slice(0, 6).join('、') || '关键事实'}。请改写为片段直接表达的局部事实，或补充更直接的证据。`,
      blocking: true,
    });
  }

  if (containsBibliographicClaims(text) && items.length > 0 && !evidenceSupportsBibliographicClaims(evidencePack)) {
    findings.push({
      id: 'unsupported-bibliographic-claims',
      severity: 'medium',
      label_zh: '文献信息可能没有证据支持',
      detail_zh: '这句话包含作者、年份、venue、DOI 或 citation key 风格信息，但当前证据片段不支持推断这些字段。',
      blocking: false,
    });
  }

  const unsupportedBibliographicDetails = findUnsupportedBibliographicDetails(text, evidencePack, sourceRefs);
  if (unsupportedBibliographicDetails.length > 0) {
    findings.push({
      id: 'unsupported-bibliographic-details',
      severity: 'high',
      label_zh: '文献信息没有被引用片段直接支持',
      detail_zh: `这句话中的 ${unsupportedBibliographicDetails.slice(0, 6).map(item => item.label).join('、')} 没有出现在对应来源编号的证据片段中；请删除这些字段，或补充包含这些元数据的证据片段。`,
      blocking: true,
    });
  }

  const unsupportedQuantitativeDetails = findUnsupportedQuantitativeDetails(text, evidencePack, sourceRefs);
  if (unsupportedQuantitativeDetails.length > 0) {
    findings.push({
      id: 'unsupported-quantitative-details',
      severity: 'high',
      label_zh: '量化结果没有被引用片段直接支持',
      detail_zh: `这句话中的 ${unsupportedQuantitativeDetails.slice(0, 6).map(item => item.label).join('、')} 没有出现在对应来源编号的证据片段中；请删除这些数字，或补充包含这些结果的证据片段。`,
      blocking: true,
    });
  }

  const evidenceContradictions = findEvidenceContradictions(text, evidencePack, sourceRefs);
  if (evidenceContradictions.length > 0) {
    findings.push({
      id: 'claim-contradicts-evidence',
      severity: 'high',
      label_zh: '结论方向与证据相反',
      detail_zh: `这句话与对应证据片段的否定/肯定方向相反：${evidenceContradictions.slice(0, 3).map(item => `[${item.rank}] ${item.label_zh}`).join('；')}。请按证据原文改写。`,
      blocking: true,
    });
  }

  for (const match of matches.slice(0, 3)) {
    const forbidden = (match.item.notFor || []).find(rule => claimConflictsWithEvidenceLimit(text, rule));
    if (forbidden) {
      findings.push({
        id: `conflicts-with-evidence-limit-${match.rank}`,
        severity: 'medium',
        label_zh: `可能超出证据 [${match.rank}] 的使用边界`,
        detail_zh: forbidden,
        blocking: false,
      });
    }
  }

  const blockingCount = findings.filter(item => item.blocking).length;
  const warningCount = findings.filter(item => !item.blocking).length;
  const status = blockingCount > 0 ? 'reject' : (warningCount > 0 ? 'revise' : 'supported');
  const suggestedRewrite = buildClaimSuggestedRewrite(text, bestMatch, status);
  const writeGate = buildClaimWriteGate({
    status,
    findings,
    matches,
    suggestedRewrite,
    citationSensitive,
    sourceRefs,
  });

  return {
    status,
    label_zh: {
      supported: '可作为有证据支撑的句子',
      revise: '建议改写后使用',
      reject: '暂不建议写入正文',
    }[status],
    message_zh: buildClaimReviewMessage(status, matches, findings),
    summary: {
      sourceReferenceCount: sourceRefs.length,
      evidenceCount: items.length,
      matchCount: matches.length,
      blockingCount,
      warningCount,
    },
    matches: matches.slice(0, 5).map(match => ({
      rank: match.rank,
      score: match.score,
      sourceLabel: match.item.sourceLabel,
      snippet: match.item.snippet,
      supports_zh: match.item.supports_zh || [],
      notFor: match.item.notFor || [],
      citationInstruction_zh: match.item.citationInstruction_zh || '',
      quality: match.item.quality || null,
      overlapTerms: match.overlapTerms,
      missingTerms: match.missingTerms,
      coverage: match.coverage,
    })),
    findings,
    suggestedRewrite,
    writeGate,
    copyText: formatClaimReviewCopyText({ text, status, matches, findings, suggestedRewrite, writeGate }),
  };
}

function matchClaimToEvidence(claim, items) {
  const claimTerms = importantClaimTerms(claim);
  if (!claimTerms.length) return [];
  return (items || [])
    .map(item => {
      const haystack = `${item.snippet || ''} ${(item.supports_zh || []).join(' ')}`.toLowerCase();
      const overlapTerms = claimTerms.filter(term => haystack.includes(term));
      const missingTerms = claimTerms.filter(term => !haystack.includes(term));
      const coverage = overlapTerms.length / Math.max(claimTerms.length, 1);
      const score = overlapTerms.length * 10 + Math.min(Number(item.score || 0), 10);
      return {
        item,
        rank: item.rank,
        score,
        overlapTerms,
        missingTerms,
        claimTermCount: claimTerms.length,
        coverage,
      };
    })
    .filter(match => match.overlapTerms.length > 0)
    .sort((a, b) => b.score - a.score || Number(a.rank || 0) - Number(b.rank || 0));
}

function isWeakClaimEvidenceMatch(match) {
  const overlap = match.overlapTerms || [];
  const missing = match.missingTerms || [];
  const coverage = Number(match.coverage || 0);
  if (overlap.length < 2) return true;
  if (coverage < 0.6 && missing.length >= 2) return true;
  const importantMissing = missing.filter(term => term.length >= 6 && !WEAK_MATCH_GENERIC_TERMS.has(term));
  return coverage < 0.75 && importantMissing.length >= 2;
}

const WEAK_MATCH_GENERIC_TERMS = new Set([
  'evidence',
  'method',
  'methods',
  'related',
  'work',
  'workflow',
  'workflows',
  'approach',
  'approaches',
  'system',
  'systems',
  'paper',
  'study',
  'studies',
]);

function importantClaimTerms(text) {
  const stopwords = new Set([
    'this', 'that', 'with', 'from', 'into', 'there', 'their', 'which', 'while', 'where', 'when',
    'the', 'and', 'for', 'are', 'can', 'has', 'have', 'was', 'were', 'been', 'being', 'show', 'shows',
    '研究', '方法', '论文', '本文', '可以', '用于', '说明', '指出', '一个', '一种', '需要', '相关', '工作',
  ]);
  return Array.from(new Set(String(text || '')
    .toLowerCase()
    .replace(/\[[0-9]+\]/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .split(/\s+/)
    .filter(term => term.length >= 3 && !stopwords.has(term))))
    .slice(0, 20);
}

function claimConflictsWithEvidenceLimit(claim, rule) {
  const text = String(claim || '').toLowerCase();
  const normalizedRule = String(rule || '').toLowerCase();
  if (/作者|年份|会议|doi|venue|citation|key/.test(normalizedRule) && containsBibliographicClaims(text)) return true;
  if (/实验|result|performance|指标|结论/.test(normalizedRule) && /result|performance|experiment|实验|结果|指标|显著|提升|outperform/i.test(text)) return true;
  return false;
}

function buildClaimSuggestedRewrite(claim, match, status) {
  if (!claim) return '';
  if (!match) {
    return '建议先补充证据，或改写为“当前证据不足以支持该陈述，需要进一步检索相关工作。”';
  }
  const support = firstText(match.item.supports_zh) || '该片段支持与原文一致的局部事实';
  const citation = `[${match.rank}]`;
  if (status === 'reject') {
    return `可先改写为较弱表述：证据 ${citation} 只能说明“${support}”，不能扩展到片段之外的结论。`;
  }
  return claim.includes(citation)
    ? claim
    : `${claim.replace(/[。.]?$/, '')} ${citation}。`;
}

function buildClaimReviewMessage(status, matches, findings) {
  if (status === 'reject') {
    return '这句话目前不适合直接写入正文。先处理阻塞问题，尤其是来源编号、证据缺失或超出片段支持范围。';
  }
  if (status === 'revise') {
    return `找到 ${matches.length} 条可能支撑片段，但仍有 ${findings.length} 个风险点，建议按证据边界改写。`;
  }
  return `找到 ${matches.length} 条可用支撑片段；写入正文时仍需保留来源编号并核对原文。`;
}

function buildClaimWriteGate({
  status,
  findings,
  matches,
  suggestedRewrite,
  citationSensitive,
  sourceRefs,
}) {
  const blockingCount = findings.filter(item => item.blocking).length;
  const warningCount = findings.length - blockingCount;
  const canUseAsDraft = status === 'supported' || status === 'revise';
  const canUseForCitableText = status === 'supported' && matches.length > 0 && (!citationSensitive || sourceRefs.length > 0);
  const requiredConfirmations = [
    '人工核对这句话的语义没有超出匹配证据片段。',
    ...(matches.length ? ['逐条核对匹配证据的 notFor 边界没有被违反。'] : []),
    ...(citationSensitive ? ['确认来源编号来自当前证据包，且编号未被手动改错。'] : []),
    ...(suggestedRewrite ? ['如果采用建议改写，先重新运行单句证据检查。'] : []),
  ];
  const forbiddenUntilConfirmed = [
    '不得自动写入或覆盖论文正文文件。',
    '不得把未核对原文的作者、年份、venue、DOI 或实验结论写成事实。',
    ...(status === 'reject' ? ['不得把当前原句作为引用性正文使用。'] : []),
  ];
  return {
    status: status === 'supported' ? 'claim-supported' : status === 'revise' ? 'needs-rewrite' : 'blocked',
    label_zh: status === 'supported' ? '可作为待确认句子' : status === 'revise' ? '改写后再检查' : '不得写入正文',
    canUseAsDraft,
    canUseForCitableText,
    canWriteToPaper: false,
    requiresHumanConfirmation: true,
    blockingCount,
    warningCount,
    matchCount: matches.length,
    requiredConfirmations: Array.from(new Set(requiredConfirmations)),
    forbiddenUntilConfirmed,
    nextAction: status === 'supported'
      ? { type: 'manual-verify-claim', label_zh: '人工核对后再写入' }
      : status === 'revise'
        ? { type: 'rewrite-claim-and-recheck', label_zh: '改写后重新检查' }
        : { type: 'resolve-claim-blockers', label_zh: '先处理阻塞项' },
    summary_zh: status === 'supported'
      ? '证据匹配通过，但仍只能作为待确认句子；写入正文前必须人工核对原文和目标段落。'
      : status === 'revise'
        ? '这句话有风险点，先按证据边界改写并重新检查。'
        : '这句话存在阻塞问题，不应写入论文正文。',
  };
}

function formatClaimReviewCopyText({ text, status, matches, findings, suggestedRewrite, writeGate }) {
  return [
    '# 单句证据检查',
    `状态：${status}`,
    '',
    '# 原句',
    text || '(空)',
    '',
    '# 匹配证据',
    ...(matches.length ? matches.slice(0, 5).map(match => [
      `[${match.rank}] ${match.item.sourceLabel || ''}`,
      match.item.snippet || '',
      `匹配词：${match.overlapTerms.join('、') || '无'}`,
      `可支持：${(match.item.supports_zh || []).join('；') || '片段直接表达的事实'}`,
      `不能支持：${(match.item.notFor || []).join('；') || '片段之外的结论'}`,
    ].join('\n')) : ['- 没有匹配证据。']),
    '',
    '# 风险点',
    ...(findings.length ? findings.map(item => `- ${item.blocking ? '阻塞' : '风险'}：${item.label_zh}。${item.detail_zh}`) : ['- 无明显风险。']),
    '',
    '# 建议改写',
    suggestedRewrite || '- 暂无。',
    '',
    '# 写入门槛',
    writeGate ? `${writeGate.label_zh}（${writeGate.status}）` : '- 未生成。',
    writeGate ? `可自动写入正文：${writeGate.canWriteToPaper ? '是' : '否'}` : '',
    writeGate ? `必须人工确认：${writeGate.requiresHumanConfirmation ? '是' : '否'}` : '',
    ...(writeGate?.requiredConfirmations?.length ? ['写入前必须确认：', ...writeGate.requiredConfirmations.map(item => `- ${item}`)] : []),
  ].join('\n');
}

function buildAnswerRevisionPlan({
  status,
  findings,
  evidencePack,
  contextReadiness,
  interactionPlan,
}) {
  const evidenceCount = evidencePack.items?.length || 0;
  const steps = [];
  const addStep = (step) => {
    if (!steps.some(item => item.id === step.id)) steps.push(step);
  };

  if (findings.some(item => item.id === 'empty-answer')) {
    addStep({
      id: 'generate-answer-first',
      label_zh: '先生成或粘贴可审查输出',
      detail_zh: '当前没有正文可审查。先让 AI 生成草稿，或把已有回复粘贴到审查区。',
      action: { type: 'generate-or-paste-answer', label_zh: '生成或粘贴 AI 输出' },
      blocking: true,
    });
  }

  if (findings.some(item => item.id === 'missing-source-numbers')) {
    addStep({
      id: 'add-source-numbers',
      label_zh: '补齐来源编号',
      detail_zh: `把文献事实改写为只引用证据包中的编号。当前可用证据 ${evidenceCount} 条，编号必须来自 [1] 到 [${Math.max(evidenceCount, 1)}]。`,
      action: { type: 'revise-answer', label_zh: '按证据编号修订' },
      blocking: true,
    });
  }

  if (findings.some(item => item.id === 'unknown-source-number')) {
    addStep({
      id: 'remove-unknown-source-numbers',
      label_zh: '删除不存在的来源编号',
      detail_zh: '移除证据包之外的编号；如果确实需要这些来源，先上传或检索对应 PDF / BibTeX / 文献笔记。',
      action: { type: 'upload-or-search-evidence', label_zh: '补证据或重写引用' },
      blocking: true,
    });
  }

  if (findings.some(item => item.id === 'fake-citation-risk')) {
    addStep({
      id: 'replace-fake-citations',
      label_zh: '去掉假引用外观',
      detail_zh: '没有可用证据时，输出只能是结构建议、待补证据清单或未验证草稿，不能出现真实引用格式。',
      action: { type: 'upload-evidence', label_zh: '先上传可引用证据' },
      blocking: true,
    });
  }

  if (findings.some(item => item.id === 'unsupported-bibliographic-claims' || item.id === 'unsupported-bibliographic-details')) {
    addStep({
      id: 'remove-unsupported-bibliographic-fields',
      label_zh: '删除未被片段支持的文献信息',
      detail_zh: '作者、年份、venue、DOI、citation key 只能来自证据片段或 references.bib，不能由模型补全。',
      action: { type: 'revise-answer', label_zh: '删除外推字段' },
      blocking: findings.some(item => item.id === 'unsupported-bibliographic-details'),
    });
  }

  if (findings.some(item => item.id === 'unsupported-quantitative-details')) {
    addStep({
      id: 'remove-unsupported-quantitative-details',
      label_zh: '删除未被片段支持的量化结果',
      detail_zh: '百分比、p-value、指标数值、提升幅度和样本量只能来自对应证据片段，不能由模型补全。',
      action: { type: 'revise-answer', label_zh: '删除外推数字' },
      blocking: true,
    });
  }

  if (findings.some(item => item.id === 'claim-contradicts-evidence')) {
    addStep({
      id: 'resolve-evidence-contradiction',
      label_zh: '按证据原文修正结论方向',
      detail_zh: '当前输出把证据中的否定、不显著或未改善结论写成了肯定改善；必须改成证据直接支持的方向，或补充支持相反结论的证据。',
      action: { type: 'revise-answer', label_zh: '修正结论方向' },
      blocking: true,
    });
  }

  if (findings.some(item => item.id === 'evidence-coverage-too-thin-for-strong-conclusion')) {
    addStep({
      id: 'expand-evidence-or-narrow-claim',
      label_zh: '补充证据或收窄综述结论',
      detail_zh: '当前证据来源过少或过于集中，不足以支撑完整 related work、领域趋势或强结论。先补充不同来源，或把输出改成“基于当前证据的局部观点”。',
      action: { type: 'upload-or-search-evidence', label_zh: '补充不同来源证据或改写结论' },
      blocking: true,
    });
  } else if (findings.some(item => item.id === 'evidence-coverage-thin')) {
    addStep({
      id: 'review-thin-evidence-coverage',
      label_zh: '确认薄证据只用于局部观点',
      detail_zh: '当前证据覆盖偏薄。采纳前确认输出没有被写成完整综述、领域共识或强结论。',
      action: { type: 'review-evidence-coverage', label_zh: '核对证据覆盖度' },
      blocking: false,
    });
  }

  if (findings.some(item => String(item.id || '').startsWith('checklist-'))) {
    addStep({
      id: 'review-acceptance-checklist',
      label_zh: '逐项核对验收清单',
      detail_zh: '审查结果里包含需要人工确认的验收项。采纳前逐项确认来源编号、上下文、写入权限和输出格式是否满足。',
      action: { type: 'review-checklist', label_zh: '核对验收清单' },
      blocking: false,
    });
  }

  if (contextReadiness.status === 'blocked' || findings.some(item => item.id === 'context-still-blocked')) {
    addStep({
      id: 'resolve-missing-context',
      label_zh: '先补齐关键上下文',
      detail_zh: contextReadiness.message_zh || '目标章节、论文主张、实验结果或文献证据仍不完整，先补齐再采纳正文。',
      action: { type: 'add-context', label_zh: '补齐上下文' },
      blocking: false,
    });
  }

  if (interactionPlan.requiresConfirmation || findings.some(item => item.id === 'requires-user-confirmation')) {
    addStep({
      id: 'confirm-before-adoption',
      label_zh: '采纳前人工确认',
      detail_zh: (interactionPlan.confirmationRequiredBefore || []).join('；') || '当前模式要求用户确认后再采纳或写入正文。',
      action: { type: 'manual-confirmation', label_zh: '确认后再采纳' },
      blocking: false,
    });
  }

  if (status === 'adoptable') {
    addStep({
      id: 'final-human-read',
      label_zh: '最后人工通读',
      detail_zh: '没有发现明显引用阻塞，但仍需要检查语义、语气、论文主张和目标章节是否匹配。',
      action: { type: 'manual-review', label_zh: '人工通读' },
      blocking: false,
    });
  }

  return {
    status,
    label_zh: status === 'reject' ? '按步骤修复后重写' : status === 'revise' ? '按风险点修订' : '可进入人工终审',
    summary_zh: buildAnswerRevisionPlanSummary(status, steps),
    steps,
    copyText: formatAnswerRevisionPlanCopyText(status, steps),
  };
}

function buildAnswerRevisionPlanSummary(status, steps) {
  if (status === 'reject') return `当前输出有阻塞问题，需要完成 ${steps.length} 个修复步骤后再让 AI 重写。`;
  if (status === 'revise') return `当前输出可作为草稿，但需要完成 ${steps.length} 个修订或确认步骤。`;
  return '当前输出没有明显阻塞，可进入人工终审。';
}

function formatAnswerRevisionPlanCopyText(status, steps) {
  return [
    '# AI 输出修订计划',
    `状态：${status}`,
    '',
    '# 步骤',
    ...(steps.length ? steps.map((step, index) => [
      `## ${index + 1}. ${step.label_zh}`,
      `说明：${step.detail_zh}`,
      `动作：${step.action?.label_zh || step.action?.type || '人工处理'}`,
      `是否阻塞：${step.blocking ? '是' : '否'}`,
    ].join('\n')) : ['- 无需修订。']),
  ].join('\n');
}

function buildAnswerRevisionLoop({
  status,
  findings,
  revisionPlan,
  revisionPrompt,
  adoptionGate,
  evidencePack,
}) {
  const blockingCount = findings.filter(item => item.blocking).length;
  const warningCount = findings.length - blockingCount;
  const evidenceCount = evidencePack.items?.length || 0;
  const requiresRewrite = status === 'reject';
  const requiresRevision = status === 'revise';
  const canExitLoop = adoptionGate.canUseAsDraft && !requiresRewrite && !requiresRevision;
  const nextAction = requiresRewrite
    ? { type: 'use-revision-prompt', label_zh: '用修订提示词重写后重新审查' }
    : requiresRevision
      ? { type: 'revise-and-recheck', label_zh: '按风险点修订后重新审查' }
      : { type: 'manual-final-review', label_zh: '人工终审后再决定是否写入' };
  const stopCriteria = [
    '审查结果不再是 reject。',
    '没有缺少来源编号或引用未知来源编号的阻塞项。',
    ...(evidenceCount > 0 ? ['所有引用性事实都只使用证据包中的来源编号。'] : []),
    '采纳门槛显示只能作为待确认草稿，写入正文仍需人工确认。',
  ];
  const recheckRequiredAfter = [
    '使用修订提示词生成新版本后。',
    '手动增删来源编号、作者年份、venue、DOI 或 citation key 后。',
    '补充、替换或重新检索 RAG 证据后。',
    '补齐目标章节、论文主张、实验结果或投稿规则后。',
  ];
  const loop = {
    status: requiresRewrite ? 'rewrite-required' : requiresRevision ? 'revision-required' : 'final-review',
    label_zh: requiresRewrite ? '需要重写并复审' : requiresRevision ? '需要修订并复审' : '进入人工终审',
    summary_zh: requiresRewrite
      ? `当前输出有 ${blockingCount} 个阻塞项。先重写，再把新输出重新审查；不要直接采纳旧版本。`
      : requiresRevision
        ? `当前输出有 ${warningCount} 个风险项。修订后需要重新审查，再决定是否作为草稿。`
        : '当前输出没有自动审查阻塞，但仍需人工终审；系统不会自动写入正文。',
    iterationHint_zh: '每次得到新版本后，都应再次点击“审查当前输出”；只有复审通过并人工确认后，才考虑写入论文。',
    nextAction,
    mustUseRevisionPrompt: Boolean(revisionPrompt.available && status !== 'adoptable'),
    promptAvailable: Boolean(revisionPrompt.available),
    planStepCount: revisionPlan.steps?.length || 0,
    blockingCount,
    warningCount,
    canExitLoop,
    recheckRequiredAfter,
    stopCriteria,
    copyText: '',
  };
  loop.copyText = formatAnswerRevisionLoopCopyText(loop);
  return loop;
}

function buildAnswerRevisionProgress({
  previousReview,
  status,
  findings,
  revisionPrompt,
  adoptionGate,
}) {
  const previousFindings = Array.isArray(previousReview?.findings) ? previousReview.findings : [];
  const currentBlockingIds = uniqueFindingIds(findings.filter(item => item.blocking));
  const previousBlockingIds = uniqueFindingIds(previousFindings.filter(item => item.blocking));
  const repeatedBlockingIds = currentBlockingIds.filter(id => previousBlockingIds.includes(id));
  const resolvedBlockingIds = previousBlockingIds.filter(id => !currentBlockingIds.includes(id));
  const newBlockingIds = currentBlockingIds.filter(id => !previousBlockingIds.includes(id));
  const hasPrevious = Boolean(previousReview && (previousFindings.length || previousReview.status));
  const canExitRevision = hasPrevious && status === 'adoptable' && adoptionGate.canUseAsDraft;
  const progressState = !hasPrevious
    ? 'not-started'
    : canExitRevision
      ? 'ready-for-final-review'
      : repeatedBlockingIds.length
        ? 'stuck'
        : currentBlockingIds.length
          ? 'improving-but-blocked'
          : status === 'revise'
            ? 'improving-needs-confirmation'
            : 'needs-review';
  const labelMap = {
    'not-started': '尚未进入多轮修订',
    'ready-for-final-review': '阻塞项已清除，进入人工终审',
    stuck: '同类阻塞项仍在重复',
    'improving-but-blocked': '已有改善但仍有新阻塞',
    'improving-needs-confirmation': '阻塞减少，仍需人工确认',
    'needs-review': '需要继续复审',
  };
  const summaryMap = {
    'not-started': '这是当前输出的首次审查；如果使用修订提示词生成新版本，下一次审查会比较阻塞项变化。',
    'ready-for-final-review': '上一轮阻塞项已清除；仍需人工终审，系统不会自动写入论文正文。',
    stuck: `仍重复 ${repeatedBlockingIds.length} 个阻塞项：${repeatedBlockingIds.join('、')}。建议直接使用修订提示词，并删除旧版本中对应内容后重写。`,
    'improving-but-blocked': `已解决 ${resolvedBlockingIds.length} 个上一轮阻塞项，但仍有 ${currentBlockingIds.length} 个阻塞项需要处理。`,
    'improving-needs-confirmation': `已解决 ${resolvedBlockingIds.length} 个上一轮阻塞项；当前没有硬阻塞，但仍需确认风险项。`,
    'needs-review': '当前输出需要继续按审查结果处理。',
  };
  const nextAction = progressState === 'stuck'
    ? { type: 'use-revision-prompt-and-remove-repeated-blockers', label_zh: '用修订提示词重写重复阻塞项' }
    : progressState === 'ready-for-final-review'
      ? { type: 'manual-final-review', label_zh: '人工终审后再决定是否写入' }
      : currentBlockingIds.length
        ? { type: 'revise-and-recheck', label_zh: '继续修订并重新审查' }
        : { type: 'manual-confirmation', label_zh: '人工确认风险项' };
  const progress = {
    status: progressState,
    label_zh: labelMap[progressState],
    summary_zh: summaryMap[progressState],
    hasPreviousReview: hasPrevious,
    previousStatus: previousReview?.status || null,
    currentStatus: status,
    previousBlockingIds,
    currentBlockingIds,
    repeatedBlockingIds,
    resolvedBlockingIds,
    newBlockingIds,
    canExitRevision,
    mustRegenerateWithRevisionPrompt: Boolean(hasPrevious && repeatedBlockingIds.length && revisionPrompt.available),
    nextAction,
    copyText: '',
  };
  progress.copyText = formatAnswerRevisionProgressCopyText(progress);
  return progress;
}

function uniqueFindingIds(findings) {
  return Array.from(new Set((findings || [])
    .map(item => String(item.id || '').trim())
    .filter(Boolean)));
}

function formatAnswerRevisionProgressCopyText(progress) {
  return [
    '# AI 输出修订进展',
    `${progress.label_zh}（${progress.status}）`,
    progress.summary_zh,
    '',
    `上一轮状态：${progress.previousStatus || '无'}`,
    `当前状态：${progress.currentStatus || 'unknown'}`,
    '',
    `已解决阻塞：${progress.resolvedBlockingIds.length ? progress.resolvedBlockingIds.join('、') : '无'}`,
    `重复阻塞：${progress.repeatedBlockingIds.length ? progress.repeatedBlockingIds.join('、') : '无'}`,
    `新增阻塞：${progress.newBlockingIds.length ? progress.newBlockingIds.join('、') : '无'}`,
    '',
    `下一步：${progress.nextAction.label_zh}`,
    `可退出修订循环：${progress.canExitRevision ? '是' : '否'}`,
  ].join('\n');
}

function formatAnswerRevisionLoopCopyText(loop) {
  return [
    '# AI 输出修订闭环',
    `${loop.label_zh}（${loop.status}）`,
    loop.summary_zh,
    '',
    '# 下一步',
    `- ${loop.nextAction.label_zh}`,
    '',
    '# 什么时候必须重新审查',
    ...loop.recheckRequiredAfter.map(item => `- ${item}`),
    '',
    '# 退出条件',
    ...loop.stopCriteria.map(item => `- ${item}`),
    '',
    `可退出闭环：${loop.canExitLoop ? '是' : '否'}`,
  ].join('\n');
}

function buildAnswerRevisionPrompt({
  answer,
  status,
  findings,
  evidencePack,
  citationPolicy,
  acceptanceChecklist,
}) {
  if (status === 'adoptable') {
    return {
      available: false,
      label_zh: '无需生成修订提示词',
      text: '',
    };
  }

  const evidenceLines = (evidencePack.items || []).map(item => [
    `[${item.rank}] ${item.sourceLabel || item.id}`,
    item.snippet || '',
    `可支持：${(item.supports_zh || []).join('；') || '只能支持片段直接表达的事实。'}`,
    `不能支持：${(item.notFor || []).join('；') || '不能扩展到片段之外的结论。'}`,
  ].join('\n'));

  const checklistLines = (acceptanceChecklist.items || []).map(item =>
    `- ${item.blocking ? '必须' : '建议'}：${item.label_zh || item.id}。${item.detail_zh || ''}`);
  const hardConstraints = buildAnswerRevisionHardConstraints({ answer, findings, evidencePack });

  return {
    available: true,
    label_zh: status === 'reject' ? '按证据包重写' : '按风险点修订',
    text: [
      '# 请修订下面的 AI 输出',
      '',
      '你需要根据审查结果重写或修订输出。不要解释审查流程，直接给出修订后的可采纳版本。',
      '',
      '# 审查发现',
      ...(findings.length ? findings.map(item => `- ${item.blocking ? '阻塞' : '风险'}：${item.label_zh || item.id}。${item.detail_zh || ''}`) : ['- 无明显问题。']),
      '',
      '# 必须满足的硬约束',
      ...hardConstraints,
      '',
      '# 引用安全规则',
      citationPolicy.label_zh ? `${citationPolicy.label_zh}：${citationPolicy.message_zh || ''}` : '未提供引用策略。',
      ...(citationPolicy.requiredBehaviors || []).map(item => `- 必须：${item}`),
      ...(citationPolicy.forbiddenBehaviors || []).map(item => `- 禁止：${item}`),
      '',
      '# 可用证据',
      evidenceLines.length ? evidenceLines.join('\n\n') : '当前没有可用证据。不要生成具体引用、作者、年份、DOI、会议或真实引用外观的正文；只能输出结构建议、待补证据清单或未验证草稿。',
      '',
      '# 验收清单',
      ...(checklistLines.length ? checklistLines : ['- 输出必须可审查、可追溯，并明确不确定性。']),
      '',
      '# 原始 AI 输出',
      answer || '(空输出)',
      '',
      '# 修订要求',
      '- 删除或改写所有没有证据支持的事实性文献陈述。',
      '- 使用证据时必须标注证据包中的来源编号，例如 [1]、[2]。',
      '- 不要引用证据包之外的来源编号。',
      '- 不要编造作者、年份、论文标题、venue、DOI 或 citation key。',
      '- 把证据直接支持的内容和基于证据的推测分开。',
      '- 输出前自检：每个带 [n] 的句子，只能包含对应 [n] 证据片段直接出现或直接支持的信息。',
    ].join('\n'),
  };
}

function buildAnswerRevisionHardConstraints({ answer, findings, evidencePack }) {
  const constraints = [];
  const hasFinding = id => findings.some(item => item.id === id);
  const add = value => {
    if (value && !constraints.includes(value)) constraints.push(value);
  };

  if (hasFinding('unstable-evidence-ranks')) {
    add('- 证据编号不稳定时不要生成可引用正文；先要求用户重新生成证据包或重建索引。');
  }
  if (hasFinding('missing-source-numbers')) {
    add('- 每个文献事实句都必须补来源编号；不能确定来源时，改成待补证据事项，不要写成正文事实。');
  }
  if (hasFinding('unknown-source-number')) {
    const ranks = (evidencePack.items || [])
      .map(item => normalizeEvidenceRank(item.rank))
      .filter(rank => rank !== null)
      .sort((a, b) => a - b)
      .map(rank => `[${rank}]`);
    add(`- 只能使用当前证据包编号${ranks.length ? `：${ranks.join('、')}` : '；当前没有可用编号'}。删除所有不存在的来源编号。`);
  }
  if (hasFinding('fake-citation-risk')) {
    add('- 没有可用证据时，禁止输出真实引用外观、作者年份、DOI、venue 或来源编号。');
  }
  if (hasFinding('unsupported-bibliographic-details')) {
    const markers = findUnsupportedBibliographicDetailsByReviewScope(answer, evidencePack);
    add('- 删除所有未在对应来源片段中出现的作者、年份、venue、DOI、arXiv 或 citation key；不能把其他来源里的元数据借给当前句子。');
    if (markers.length) add(`- 必须删除或替换这些未支持文献信息：${markers.slice(0, 8).map(item => item.label).join('、')}。`);
  }
  if (hasFinding('unsupported-quantitative-details')) {
    const markers = findUnsupportedQuantitativeDetailsByReviewScope(answer, evidencePack);
    add('- 删除所有未在对应来源片段中出现的百分比、p-value、指标数值、提升幅度和样本量；不能把其他来源里的数字借给当前句子。');
    if (markers.length) add(`- 必须删除或替换这些未支持量化细节：${markers.slice(0, 8).map(item => item.label).join('、')}。`);
  }
  if (hasFinding('claim-contradicts-evidence')) {
    add('- 按证据原文修正结论方向；证据是否定、无显著或未改善时，不能写成 improved、better、supports 或显著提升。');
  }
  if (hasFinding('evidence-coverage-too-thin-for-strong-conclusion')) {
    add('- 不要写完整 related work、领域趋势、dominant solution、consensus 或 broadly establishes；只能写“基于当前证据的局部观察”，或要求补充证据。');
  }
  if (!constraints.length) {
    add('- 只输出修订后的文本，不解释过程；保留不确定性，避免超出证据包。');
  }
  return constraints;
}

function looksLikeCitedProse(text) {
  return /\[\d+\]|\([A-Z][A-Za-z-]+(?:\s+et al\.)?,\s*\d{4}\)|\bdoi\b|arXiv:\d{4}\.\d{4,5}/i.test(text);
}

function containsBibliographicClaims(text) {
  return /\b\d{4}\b|\bdoi\b|\barxiv\b|\bneurips\b|\bicml\b|\biclr\b|\bacl\b|\bemnlp\b|\bcvpr\b|\bieee\b|\bacm\b|et al\./i.test(text);
}

function evidenceSupportsBibliographicClaims(evidencePack) {
  return (evidencePack.items || []).some(item => /\b\d{4}\b|\bdoi\b|\barxiv\b|\bneurips\b|\bicml\b|\biclr\b|\bacl\b|\bemnlp\b|\bcvpr\b|\bieee\b|\bacm\b|et al\./i.test(item.snippet || ''));
}

function findUnsupportedBibliographicDetails(text, evidencePack, sourceRefs = []) {
  if (!containsBibliographicClaims(text)) return [];
  const markers = extractBibliographicMarkers(text);
  if (!markers.length) return [];
  const referencedRanks = new Set((sourceRefs || []).map(normalizeEvidenceRank).filter(rank => rank !== null));
  const scopedItems = (evidencePack.items || []).filter(item => {
    if (!referencedRanks.size) return true;
    return referencedRanks.has(normalizeEvidenceRank(item.rank));
  });
  if (!scopedItems.length) return [];
  const evidenceText = normalizeBibliographicText(scopedItems.map(item => [
    item.snippet || '',
    item.sourceLabel || '',
    ...(item.supports_zh || []),
  ].join(' ')).join(' '));
  if (!evidenceText) return markers;
  return markers.filter(marker => !evidenceText.includes(marker.normalized));
}

function findUnsupportedBibliographicDetailsByReviewScope(text, evidencePack, fallbackSourceRefs = []) {
  const scopes = splitAnswerIntoReviewScopes(text);
  const details = scopes.flatMap(scope =>
    findUnsupportedBibliographicDetails(
      scope,
      evidencePack,
      parseSourceReferences(scope).length ? parseSourceReferences(scope) : fallbackSourceRefs,
    )
  );
  return uniqueEvidenceBoundaryMarkers(details);
}

function findUnsupportedQuantitativeDetails(text, evidencePack, sourceRefs = []) {
  const markers = extractQuantitativeMarkers(text);
  if (!markers.length) return [];
  const referencedRanks = new Set((sourceRefs || []).map(normalizeEvidenceRank).filter(rank => rank !== null));
  const scopedItems = (evidencePack.items || []).filter(item => {
    if (!referencedRanks.size) return true;
    return referencedRanks.has(normalizeEvidenceRank(item.rank));
  });
  if (!scopedItems.length) return [];
  const evidenceText = normalizeQuantitativeText(scopedItems.map(item => [
    item.snippet || '',
    item.sourceLabel || '',
    ...(item.supports_zh || []),
  ].join(' ')).join(' '));
  if (!evidenceText) return markers;
  return markers.filter(marker => !evidenceText.includes(marker.normalized));
}

function findUnsupportedQuantitativeDetailsByReviewScope(text, evidencePack, fallbackSourceRefs = []) {
  const scopes = splitAnswerIntoReviewScopes(text);
  const details = scopes.flatMap(scope =>
    findUnsupportedQuantitativeDetails(
      scope,
      evidencePack,
      parseSourceReferences(scope).length ? parseSourceReferences(scope) : fallbackSourceRefs,
    )
  );
  return uniqueEvidenceBoundaryMarkers(details);
}

function extractQuantitativeMarkers(text) {
  const source = String(text || '');
  const markers = [];
  const addMarker = (label, type) => {
    const normalized = normalizeQuantitativeText(label);
    if (!normalized) return;
    if (!markers.some(item => item.normalized === normalized && item.type === type)) {
      markers.push({ label: label.trim(), normalized, type });
    }
  };
  for (const match of source.matchAll(/\b\d+(?:\.\d+)?\s*%/g)) {
    addMarker(match[0], 'percent');
  }
  for (const match of source.matchAll(/\bp\s*[<=>]\s*0?\.\d+/gi)) {
    addMarker(match[0], 'p-value');
  }
  for (const match of source.matchAll(/\b\d+(?:\.\d+)?\s*(?:x|fold|ms|sec|seconds|points|pp|samples|participants|datasets)\b/gi)) {
    addMarker(match[0], 'metric');
  }
  for (const match of source.matchAll(/\b\d+\.\d+\b/g)) {
    addMarker(match[0], 'decimal');
  }
  return markers;
}

function normalizeQuantitativeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

function findEvidenceContradictions(text, evidencePack, sourceRefs = []) {
  const claimPolarity = detectOutcomePolarity(text);
  if (claimPolarity === 'neutral') return [];
  const claimTerms = importantClaimTerms(text);
  const referencedRanks = new Set((sourceRefs || []).map(normalizeEvidenceRank).filter(rank => rank !== null));
  const scopedItems = (evidencePack.items || []).filter(item => {
    if (!referencedRanks.size) return true;
    return referencedRanks.has(normalizeEvidenceRank(item.rank));
  });
  return scopedItems
    .map(item => {
      const evidenceText = [item.snippet || '', ...(item.supports_zh || [])].join(' ');
      const evidencePolarity = detectOutcomePolarity(evidenceText);
      const evidenceTerms = new Set(importantClaimTerms(evidenceText));
      const overlap = claimTerms.filter(term => evidenceTerms.has(term));
      const contradicts = evidencePolarity !== 'neutral' &&
        evidencePolarity !== claimPolarity &&
        overlap.length >= 2;
      return contradicts
        ? {
          rank: item.rank,
          item,
          label_zh: claimPolarity === 'positive'
            ? '输出写成肯定改善，但证据是否定或未改善'
            : '输出写成否定或未改善，但证据是肯定改善',
          overlapTerms: overlap,
          claimPolarity,
          evidencePolarity,
        }
        : null;
    })
    .filter(Boolean);
}

function findEvidenceContradictionsByReviewScope(text, evidencePack, fallbackSourceRefs = []) {
  const scopes = splitAnswerIntoReviewScopes(text);
  return scopes.flatMap(scope =>
    findEvidenceContradictions(
      scope,
      evidencePack,
      parseSourceReferences(scope).length ? parseSourceReferences(scope) : fallbackSourceRefs,
    )
  );
}

function uniqueEvidenceBoundaryMarkers(markers) {
  const seen = new Set();
  const unique = [];
  for (const marker of markers || []) {
    const key = `${marker.type || 'marker'}:${marker.normalized || marker.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(marker);
  }
  return unique;
}

function detectOutcomePolarity(text) {
  const value = String(text || '').toLowerCase();
  const negative = /\b(?:do|does|did|can|could|is|are|was|were)?\s*not\s+(?:improve|increase|enhance|help|support|outperform|benefit|yield|show|demonstrate)s?\b|\bno\s+(?:improvement|increase|benefit|effect|evidence|support)\b|\bfailed\s+to\s+(?:improve|increase|enhance|help|support|outperform|show|demonstrate)\b|\bwithout\s+(?:improvement|benefit|support)\b|未(?:能)?(?:改善|提升|支持)|没有(?:改善|提升|支持|显著)|无(?:改善|提升|支持|显著)/i.test(value);
  if (negative) return 'negative';
  const positive = /\b(?:improve|improves|improved|improvement|increase|increases|increased|enhance|enhances|enhanced|help|helps|helped|support|supports|supported|outperform|outperforms|outperformed|benefit|benefits|effective|better|gain|gains)\b|(?:改善|提升|支持|有效|优于|更好)/i.test(value);
  return positive ? 'positive' : 'neutral';
}

function extractBibliographicMarkers(text) {
  const source = String(text || '');
  const markers = [];
  const addMarker = (label, type) => {
    const normalized = normalizeBibliographicText(label);
    if (!normalized) return;
    if (!markers.some(item => item.normalized === normalized && item.type === type)) {
      markers.push({ label: label.trim(), normalized, type });
    }
  };
  for (const match of source.matchAll(/\b(?:19|20)\d{2}\b/g)) {
    addMarker(match[0], 'year');
  }
  for (const match of source.matchAll(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi)) {
    addMarker(match[0], 'doi');
  }
  for (const match of source.matchAll(/\barXiv:\s*\d{4}\.\d{4,5}(?:v\d+)?/gi)) {
    addMarker(match[0], 'arxiv');
  }
  for (const match of source.matchAll(/\b([A-Z][A-Za-z-]+)\s+et al\./g)) {
    addMarker(`${match[1]} et al.`, 'author');
  }
  for (const match of source.matchAll(/\b(?:NeurIPS|ICML|ICLR|ACL|EMNLP|CVPR|IEEE|ACM|CHI|UIST|KDD|SIGIR|WWW)\b/gi)) {
    addMarker(match[0], 'venue');
  }
  return markers;
}

function normalizeBibliographicText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bdoi:\s*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9./:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function answerMakesBroadLiteratureConclusion(text) {
  return /related work|literature|survey|prior work|existing (?:work|methods|studies|approaches)|the field|state[- ]of[- ]the[- ]art|sota|dominant|consensus|comprehensive|broadly|overall|most (?:methods|studies|approaches)|all (?:methods|studies|approaches)|shows that|demonstrates that|establishes that|研究表明|现有工作|相关工作|主流方法|普遍认为|总体来看|领域内|综述/i.test(String(text || ''));
}

function parseSourceReferences(text) {
  return Array.from(String(text || '').matchAll(/\[(\d+)\]/g))
    .map(match => Number(match[1]))
    .filter(rank => Number.isSafeInteger(rank) && rank > 0);
}

function normalizeEvidenceRank(rank) {
  const value = Number(rank);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function buildEvidenceRankIndex(items = []) {
  const ranks = new Set();
  const seen = new Map();
  const issues = [];
  for (const item of items || []) {
    const normalized = normalizeEvidenceRank(item.rank);
    const label = item.sourceLabel || item.id || item.rank || 'unknown';
    if (normalized === null) {
      issues.push(`无效编号 ${String(item.rank)} (${label})`);
      continue;
    }
    if (seen.has(normalized)) {
      issues.push(`重复编号 [${normalized}] (${seen.get(normalized)} / ${label})`);
      continue;
    }
    seen.set(normalized, label);
    ranks.add(normalized);
  }
  return { ranks, issues };
}

function buildAnswerReviewMessage(status, blockingCount, warningCount) {
  if (status === 'reject') {
    return `发现 ${blockingCount} 个阻塞问题。请先修改 AI 输出或补充证据，不建议直接采纳。`;
  }
  if (status === 'revise') {
    return `没有发现硬性阻塞，但有 ${warningCount} 个需要人工确认或修改的风险点。`;
  }
  return '没有发现明显引用或验收阻塞问题，仍建议人工通读后再采纳。';
}

function buildAnswerReviewActions(status, findings) {
  if (status === 'reject') {
    return [
      { type: 'use-revision-prompt', label_zh: '使用修订提示词' },
      { type: 'revise-answer', label_zh: '让 AI 按证据包重写' },
      { type: 'copy-evidence-pack', label_zh: '复制证据包重新发送' },
      { type: 'upload-evidence', label_zh: '补充可引用证据' },
    ];
  }
  if (findings.some(item => item.id === 'context-still-blocked')) {
    return [
      { type: 'add-context', label_zh: '先补齐缺失上下文' },
      { type: 'revise-answer', label_zh: '修改后再采纳' },
    ];
  }
  if (status === 'revise') {
    return [
      { type: 'use-revision-prompt', label_zh: '使用修订提示词' },
      { type: 'review-checklist', label_zh: '逐项核对验收清单' },
      { type: 'revise-answer', label_zh: '修改风险点' },
    ];
  }
  return [
    { type: 'manual-review', label_zh: '人工通读后采纳' },
  ];
}

function buildAnswerClaimCheckQueue({ answer, evidencePack, citationPolicy }) {
  const text = String(answer || '').trim();
  const items = evidencePack.items || [];
  const rankIndex = buildEvidenceRankIndex(items);
  const citationSensitive = Boolean(citationPolicy?.citationSensitive || evidencePack?.citationSensitive);
  const sentences = splitAnswerIntoClaimSentences(text);
  const candidates = sentences.map((sentence, index) => {
    const sourceRefs = parseSourceReferences(sentence);
    const unknownRefs = sourceRefs.filter(rank => !rankIndex.ranks.has(rank));
    const matches = matchClaimToEvidence(sentence, items);
    const bibliographic = containsBibliographicClaims(sentence);
    const unsupportedBibliographicDetails = findUnsupportedBibliographicDetails(sentence, evidencePack, sourceRefs);
    const unsupportedQuantitativeDetails = findUnsupportedQuantitativeDetails(sentence, evidencePack, sourceRefs);
    const evidenceContradictions = findEvidenceContradictions(sentence, evidencePack, sourceRefs);
    const evidenceRefs = buildClaimQueueEvidenceRefs({ sourceRefs, matches, rankIndex });
    const cited = sourceRefs.length > 0;
    const noCitationRisk = citationSensitive && items.length > 0 && !cited;
    const noMatchRisk = items.length > 0 && matches.length === 0;
    const reasons = [];
    if (unknownRefs.length) reasons.push(`引用了证据包之外的编号：${Array.from(new Set(unknownRefs)).map(rank => `[${rank}]`).join('、')}`);
    if (rankIndex.issues.length) reasons.push(`证据包编号不稳定：${rankIndex.issues.join('；')}`);
    if (unsupportedBibliographicDetails.length) reasons.push(`文献信息没有被对应证据片段支持：${unsupportedBibliographicDetails.slice(0, 6).map(item => item.label).join('、')}。`);
    if (unsupportedQuantitativeDetails.length) reasons.push(`量化细节没有被对应证据片段支持：${unsupportedQuantitativeDetails.slice(0, 6).map(item => item.label).join('、')}。`);
    if (evidenceContradictions.length) reasons.push('与对应证据片段的否定/肯定方向相反。');
    if (noCitationRisk) reasons.push('像文献事实陈述，但缺少来源编号。');
    if (noMatchRisk) reasons.push('当前证据包没有明显匹配片段。');
    if (bibliographic) reasons.push('包含作者、年份、venue、DOI 或类似文献信息。');
    if (!reasons.length && cited) reasons.push('带来源编号，写入前仍需确认没有超出证据边界。');
    if (!reasons.length && matches.length) reasons.push('有匹配证据，建议确认句子是否只表达片段直接支持的内容。');
    const priority = rankIndex.issues.length || unknownRefs.length || unsupportedBibliographicDetails.length || unsupportedQuantitativeDetails.length || evidenceContradictions.length || noCitationRisk || noMatchRisk
      ? 'high'
      : bibliographic || cited ? 'medium' : 'low';
    return {
      id: `claim-${index + 1}`,
      order: index + 1,
      claim: sentence,
      priority,
      label_zh: priority === 'high' ? '优先单句检查' : priority === 'medium' ? '建议单句检查' : '可选检查',
      reason_zh: reasons.join(' ') || '该句可能是事实陈述，写入正文前建议核对。',
      sourceReferenceCount: sourceRefs.length,
      unknownSourceRefs: Array.from(new Set(unknownRefs)),
      matchCount: matches.length,
      evidenceRefs,
      suggestedAction: { type: 'review-claim', label_zh: '放入单句证据检查', claim: sentence },
    };
  }).filter(item => item.priority !== 'low' || item.matchCount > 0 || item.sourceReferenceCount > 0);

  const sorted = candidates
    .sort((a, b) => claimPriorityWeight(a.priority) - claimPriorityWeight(b.priority) || a.order - b.order)
    .slice(0, 5);
  const status = sorted.some(item => item.priority === 'high')
    ? 'needs-check'
    : sorted.length ? 'recommended' : 'empty';
  const queue = {
    status,
    label_zh: status === 'needs-check' ? '有句子需要优先检查' : status === 'recommended' ? '建议逐句核对' : '暂无明显待检查句子',
    summary_zh: status === 'empty'
      ? '没有从当前输出中提取到明显需要单句证据检查的句子。'
      : `已提取 ${sorted.length} 个候选句；写入正文前建议逐句运行单句证据检查。`,
    items: sorted,
    copyText: '',
  };
  queue.copyText = formatClaimCheckQueueCopyText(queue);
  return queue;
}

function splitAnswerIntoClaimSentences(text) {
  const protectedText = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\bet al\./gi, match => match.replace('.', '<DOT>'));
  return protectedText
    .split(/(?<=[。！？.!?])\s+|[\n\r]+/)
    .map(item => item.replace(/<DOT>/g, '.'))
    .map(item => item.trim())
    .filter(item => item.length >= 18)
    .slice(0, 20);
}

function splitAnswerIntoReviewScopes(text) {
  const protectedText = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\bet al\./gi, match => match.replace('.', '<DOT>'));
  const scopes = protectedText
    .split(/(?<=[。！？.!?])\s+|[\n\r]+/)
    .map(item => item.replace(/<DOT>/g, '.'))
    .map(item => item.trim())
    .filter(Boolean);
  return scopes.length ? scopes : [String(text || '').trim()].filter(Boolean);
}

function claimPriorityWeight(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 9;
}

function formatClaimCheckQueueCopyText(queue) {
  return [
    '# 待单句检查队列',
    `${queue.label_zh}（${queue.status}）`,
    queue.summary_zh,
    '',
    ...(queue.items.length ? queue.items.map(item => [
      `## ${item.order}. ${item.label_zh}`,
      `优先级：${item.priority}`,
      `句子：${item.claim}`,
      `原因：${item.reason_zh}`,
      ...(item.evidenceRefs?.length ? [
        '关联证据：',
        ...item.evidenceRefs.map(ref => `- [${ref.rank}] ${ref.sourceLabel || ref.id}：${ref.snippet}`)
      ] : []),
    ].join('\n')) : ['- 暂无。']),
  ].join('\n');
}

function buildClaimQueueEvidenceRefs({ sourceRefs = [], matches = [], rankIndex = {} } = {}) {
  const refs = Array.from(new Set(sourceRefs))
    .map(rank => rankIndex.byRank?.get(rank))
    .filter(Boolean);
  const fallbackMatches = refs.length
    ? []
    : (matches || []).slice(0, 2).map(match => match.item).filter(Boolean);
  return [...refs, ...fallbackMatches]
    .filter((item, index, list) => list.findIndex(other => Number(other.rank) === Number(item.rank)) === index)
    .slice(0, 3)
    .map(item => ({
      rank: item.rank,
      id: item.id || `E${item.rank}`,
      sourceLabel: item.sourceLabel || item.source?.path || item.id || '',
      snippet: String(item.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 220),
      qualityLabel_zh: item.quality?.label_zh || '',
    }));
}

function buildAnswerAdoptionGate({
  status,
  findings,
  sourceRefs,
  evidencePack,
  citationPolicy,
  acceptanceChecklist,
  interactionPlan,
}) {
  const citationSensitive = Boolean(citationPolicy?.citationSensitive || evidencePack?.citationSensitive);
  const sourceReferenceCount = sourceRefs.length;
  const blockingFindings = findings.filter(item => item.blocking);
  const warningFindings = findings.filter(item => !item.blocking);
  const canUseAsDraft = status === 'adoptable';
  const canUseForCitableText = canUseAsDraft && (!citationSensitive || sourceReferenceCount > 0);
  const checklistItems = acceptanceChecklist?.items || [];
  const requiredConfirmations = [
    '人工通读整段，确认语义、语气和目标章节匹配。',
    ...(citationSensitive ? ['逐条核对 [1]、[2] 等来源编号确实来自证据包。'] : []),
    ...checklistItems.filter(item => item.blocking).map(item => `确认验收项：${item.label_zh || item.id}`),
    ...(interactionPlan?.confirmationRequiredBefore || []).map(item => `确认后再执行：${item}`),
  ];
  const forbiddenUntilConfirmed = [
    '不得自动写入或覆盖论文正文文件。',
    '不得把未核对原文的引用性事实直接合并进正式稿。',
    ...(citationSensitive ? ['不得新增证据包之外的作者、年份、venue、DOI 或来源编号。'] : []),
  ];

  return {
    status: canUseAsDraft ? 'draft-ready' : (status === 'revise' ? 'needs-revision' : 'blocked'),
    label_zh: canUseAsDraft ? '可作为待确认草稿' : (status === 'revise' ? '修订后再采纳' : '不得采纳'),
    canUseAsDraft,
    canUseForCitableText,
    canWriteToPaper: false,
    requiresHumanConfirmation: true,
    blockingCount: blockingFindings.length,
    warningCount: warningFindings.length,
    sourceReferenceCount,
    requiredConfirmations: Array.from(new Set(requiredConfirmations)),
    forbiddenUntilConfirmed,
    nextAction: canUseAsDraft
      ? { type: 'manual-final-review', label_zh: '人工终审后再写入正文' }
      : status === 'revise'
        ? { type: 'use-revision-prompt', label_zh: '先用修订提示词修改' }
        : { type: 'resolve-review-blockers', label_zh: '先处理审查阻塞项' },
    summary_zh: canUseAsDraft
      ? '审查未发现硬阻塞，但这仍只是待确认草稿；写入正文前必须人工核对来源和目标章节。'
      : status === 'revise'
        ? '当前输出存在需要修订或确认的风险点，先修订再考虑采纳。'
        : '当前输出存在阻塞问题，不应写入论文正文。',
  };
}

function sanitizeAdoptionText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function sanitizeAdoptionTarget(value) {
  return String(value || '')
    .replace(/[\u0000\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function formatAnswerAdoptionPackageCopyText(pkg) {
  return [
    '# AI 输出安全采纳包',
    `${pkg.label_zh}（${pkg.status}）`,
    pkg.summary_zh,
    '',
    '# 目标位置',
    pkg.target.targetSection || '未填写目标章节或文件。',
    '',
    '# 写入规则',
    `系统自动写入：${pkg.willWrite ? '是' : '否'}`,
    `允许自动写论文：${pkg.canWriteToPaper ? '是' : '否'}`,
    '必须人工确认：是',
    '',
    '# 已审查输出',
    pkg.reviewedAnswer || '无',
    '',
    '# 使用的来源编号',
    ...(pkg.citationsUsed.length
      ? pkg.citationsUsed.map(item => `${item.label} ${item.sourceLabel || '未命名来源'}${item.snippet ? `：${item.snippet}` : ''}`)
      : ['- 未检测到来源编号。']),
    '',
    '# 阻塞项',
    ...(pkg.blockers.length
      ? pkg.blockers.map(item => `- ${item.label_zh}：${item.detail_zh}`)
      : ['- 无硬阻塞；仍需人工终审。']),
    '',
    '# 人工采纳清单',
    ...pkg.adoptionChecklist.map(item => `- ${item.required ? '必须' : '建议'}：${item.label_zh}`),
    '',
    '# 禁止动作',
    ...pkg.forbiddenActions.map(item => `- ${item}`),
    '',
    '# 建议应用方式',
    `${pkg.insertionStrategy.label_zh}：${pkg.insertionStrategy.detail_zh}`,
    '',
    '# 人工应用指南',
    ...(pkg.manualApplicationGuide?.steps?.length
      ? pkg.manualApplicationGuide.steps.map((step, index) => `${index + 1}. ${step.label_zh}${step.blocking ? '（阻塞）' : ''}：${step.detail_zh}`)
      : ['- 未生成。']),
    '',
    '注意：本采纳包只用于人工复制和核对，不会也不应自动写入论文文件。',
  ].join('\n');
}

export function routeWritingTask(task, context = {}) {
  const normalizedTask = String(task || '').trim();
  if (!normalizedTask) {
    return {
      mode: 'chat',
      modeLabel_zh: '对话',
      confidence: 'low',
      risk_level: 'low',
      requiresConfirmation: false,
      reasons: ['尚未输入任务，先用对话模式澄清目标。'],
      missingContext: [],
      missingContextDetails: [],
      nextActions: [
        {
          type: 'ask-task',
          label_zh: '描述你要完成的写作任务',
        },
      ],
    };
  }

  const projectState = context.projectState || {};
  const evidence = context.evidence || emptyEvidence(normalizedTask);
  const recommendations = context.recommendations || [];
  const contextAnswers = context.contextAnswers || projectState.contextAnswers || {};
  const lower = normalizedTask.toLowerCase();
  const reasons = [];
  const missingContext = [];
  const nextActions = [];
  let mode = 'chat';
  let confidence = 'medium';
  let riskLevel = 'low';
  let requiresConfirmation = false;
  const explicitRagMention = hasExplicitRagMention(normalizedTask);
  const asksForExplanation = /解释|说明|怎么看|为什么|what|why|explain|summari[sz]e|总结|梳理|评价|建议/.test(lower);
  const asksForTextChange = /写|修改|修复|制定|规划|准备|改论文|改一下|改写|改成|改得|润色|扩写|压缩|生成|草稿|回复|整理|重组|组织|描述|讲成|转成|变成|是否清楚|是否严谨|是不是夸大|是否足够|足够强|区别|是否有说服力|是否缺|是否过度承诺|能不能直接放进|放进论文|放进正文|支撑\s*claim|支撑.*结论|模拟\s*reviewer|reviewer\s*视角|挑刺|超过\s*\d+\s*words|审稿意见|投稿材料|伦理声明|数据可用性|代码可用性|利益冲突|写作计划|论文\s*outline|paper\s*structure|storyline|故事线|风险清单|实验计划|user study|可复现清单|匿名风险|匿名版|作者信息|pdf\s*metadata|reproducibility checklist|artifact checklist|checklist|double blind|anonymous|翻译|语法|时态|改短|ai\s*痕迹|太像\s*ai|nature\s*风格英文|学术风格|公式|符号不一致|符号一致|cover letter|ethical statement|ethics statement|data availability|code availability|conflict of interest|caption|图注|画图|绘图|流程图|示意图|配色|颜色|rebuttal|reviewer comments|response letter|response table|draft|rewrite|polish|revise|edit|fix|translate|translation|grammar|tense|humanize|ai-written|shorten|academic style|equation|notation|symbol|introduction|abstract|conclusion|discussion|method|results|slides?|ppt|beamer|presentation|conference talk|poster|海报|proposal|grant|基金|申请书|research plan|zotero|bibtex|\.bib|未定义引用|undefined reference/.test(lower) ||
    (/related work/.test(lower) && /write|draft|revise|edit|polish|写|改|润色|草稿|生成/.test(lower));
  const asksForLiteratureSearch = /找论文|检索文献|最新工作|最新相关工作|补文献|benchmark paper|academic search|search papers|semantic scholar/.test(lower) &&
    !/arxiv.{0,24}(anonymous|匿名)|anonymous.{0,24}(version|版本)|匿名版|转成 anonymous/i.test(normalizedTask);
  const asksForEvidenceDiagnostics = (
    /(?:检查|查看|看看|确认|诊断|有没有|是否).{0,24}(?:pdf|证据库|知识库|索引|解析|读进去|读取)|(?:pdf|证据库|知识库).{0,24}(?:有没有|是否|读进去|读取|索引|解析|可用)/i.test(normalizedTask) ||
    (explicitRagMention && /(?:检查|查看|看看|确认|诊断|有没有|是否|读进去|读取|索引|解析|可用|不好用|检索不到|没有命中)/i.test(normalizedTask))
  ) &&
    !/(?:pdf.{0,16}metadata|metadata).{0,24}(?:匿名|anonymous|double blind|作者信息)|(?:匿名|anonymous|double blind|作者信息).{0,24}(?:pdf.{0,16}metadata|metadata)|double blind|anonymous|匿名风险|作者信息/i.test(normalizedTask);
  const asksForClaimEvidenceCheck = /(?:一句话|claim|这句话|单句).{0,32}(?:证据|rag|核对|支持|检查|citation|引用)|(?:证据|rag).{0,32}(?:核对|支持).{0,32}(?:一句话|claim|这句话|单句)/i.test(normalizedTask);
  const asksForSectionCitationMapping = /(?:introduction|related work|discussion|results|method|章节|正文|每句话|逐句|每个\s*claim|each claim|哪些句子).{0,40}(?:引用|citation|证据|来源编号|证据编号|没有引用|缺引用|missing citation)|(?:检查|审查|找出|列出).{0,24}(?:哪些句子|句子|claim|claims).{0,24}(?:没有引用|缺引用|缺少引用|missing citation|uncited)/i.test(normalizedTask);
  const asksForAnswerReview = /(?:审查|检查|review).{0,16}(?:ai 输出|ai 写|模型输出|当前输出|这段).{0,16}(?:采纳|能不能采纳|引用|证据)|(?:ai 输出|ai 写|模型输出).{0,24}(?:合并|merge|采纳|放进|写进)|(?:paragraph|段落|这段).{0,24}(?:能不能|是否|可以|直接).{0,16}(?:放进|采纳|写进).{0,12}(?:论文|正文|paper)|(?:这句话|每句话|逐句|每个\s*claim|每个 claim|each claim).{0,32}(?:引用|citation|证据|来源编号|证据编号)|(?:引用|citation).{0,24}(?:哪几篇|哪些|哪篇|配|补|需要).{0,24}(?:论文|文献|paper)|(?:检查|审查|找出|列出).{0,24}(?:哪些句子|句子|claim|claims).{0,24}(?:没有引用|缺引用|缺少引用|missing citation|uncited)|(?:table|表格|图|figure|fig\.?).{0,16}(?:结论|claim|conclusion).{0,24}(?:证据|支撑|支持|support)|(?:找|检查|总结|提取).{0,24}(?:支持|支撑).{0,24}(?:claim|novelty|贡献|结论).{0,24}(?:证据|文献|论文|paper)|(?:反例|相反.{0,4}观点|负证据|negative evidence|counter[-\s]?evidence|contradictory evidence)|引用.{0,16}证据支持|证据支持.{0,16}引用|(?:幻觉引用|假引用|fake citation|hallucinated citation|citation grounding)/i.test(normalizedTask);
  const asksForAdoptionPackage = /安全采纳包|adoption package|采纳包/i.test(normalizedTask);
  const asksForCitationAudit = /citation key|missing citation|author-year citation|引用格式|参考文献格式|幻觉引用|假引用|citation 格式|按 .{0,16}格式整理参考文献/i.test(normalizedTask);
  const asksForReviewerRevisionWork = /rebuttal|reviewers?.{0,24}common concerns|common concerns|审稿意见|补实验|revision|返修|response letter|response table|novelty\s*weak|novelty.{0,16}(weak|concern)|创新性.{0,16}(不足|弱|不够)|过度承诺|over[-\s]?promise/i.test(normalizedTask);
  const asksForSubmissionFileAudit = /(?:pdf.{0,16}metadata|metadata).{0,24}(?:匿名|anonymous|double blind|作者信息)|(?:匿名|anonymous|double blind|作者信息).{0,24}(?:pdf.{0,16}metadata|metadata)|double blind|anonymous|匿名风险|作者信息|page limit|camera-ready|camera ready/i.test(normalizedTask);
  const asksForLatexDebugging = /(?:latex|latexmk|overleaf|pdf).{0,24}(?:编译错误|编译失败|编译不过|报错|error|failed|错误)|(?:运行|执行|run).{0,12}latexmk|(?:编译\s*pdf\s*出错|pdf\s*编译失败|undefined control sequence|missing \$ inserted|latex error)/i.test(normalizedTask);
  const asksForLocalPolish = /(?:这段|这句|这句话|逐句|过渡句|口语化|bullet points?|tense consistency|语法|时态|翻译成英文论文表达|翻译成中文|英文.{0,8}翻译成中文|中文.{0,8}翻译成英文|压缩\s*\d+%|压缩段落|改短|降低\s*ai\s*痕迹|ai\s*痕迹|太像\s*ai|像人写|更像人写|humanize|表达不清楚|更简洁|不要改变事实|不要改技术含义|不要新增结果|不夸大|夸大)/i.test(normalizedTask);
  const asksForResponseTable = /response\s*table|回复表|回应表|审稿.{0,8}表/i.test(normalizedTask);
  const asksForFigureTooling = /(?:csv|\.csv\b|results\.csv|matplotlib|plot\.py|脚本|python|roc\s*curve|柱状图|折线图|生成图|画图|绘图|导出\s*pdf)/i.test(normalizedTask);
  const asksForStatisticalTooling = /(?:t[-\s]?test|p[-\s]?value|显著性检验|异常值|outlier|mean\s*[±+/-]?\s*std|mean±std|计算.{0,16}(?:mean|std|均值|标准差)|results\.csv|实验数据.{0,16}(?:跑|计算|检查|分析))/i.test(normalizedTask);
  const asksForFigureOrStatReview = /(?:caption|图注|figure|fig\.?|图|表格|table).{0,24}(?:是否夸大|夸大|是否写对|写对|一致性|编号|引用|排版太宽|too wide)/i.test(normalizedTask);
  const asksForToolExecution = ((/运行|执行|编译|脚本|命令|生成图|画图|绘图|统计检验|显著性检验|分析数据|处理数据|run|execute|compile|script|plot|chart/.test(lower) || asksForFigureTooling || asksForStatisticalTooling) && !asksForResponseTable) ||
    (/统计|表格|figure|table/.test(lower) && /运行|执行|生成|计算|检验|脚本|代码|plot|draw|run|execute|compute/.test(lower) && !asksForResponseTable);

  if (asksForExplanation) {
    mode = 'chat';
    reasons.push('任务主要是理解、解释或生成建议，适合先用对话模式。');
  }

  if (asksForTextChange) {
    mode = 'agent';
    riskLevel = 'medium';
    requiresConfirmation = true;
    reasons.push('任务会影响论文正文，建议用 Agent 模式读取上下文并提交可确认的修改建议。');
    const hasSectionScopedEvidenceReview = asksForSectionCitationMapping && hasExplicitSectionName(normalizedTask);
    const hasSubmissionPolicyOnly = /camera[-\s]?ready.{0,24}anonymous|anonymous.{0,24}camera[-\s]?ready|规则冲突|怎么填|checklist/i.test(normalizedTask) &&
      !/appendix|supplementary material|supplemental material|supporting information|附录|补充材料/i.test(normalizedTask);
    const hasReviewerContextOnly = asksForReviewerRevisionWork &&
      !/(?:对应到|修改位置|修改矩阵|正文修改位置|直接改|写入|合并|main\.tex|\b[\w./-]+\.tex\b)/i.test(normalizedTask);
    const hasToolOrFigureTarget = asksForToolExecution || asksForFigureOrStatReview || /(?:figure|fig\.?|图)\s*\.?\s*[A-Z]?\d+[a-z]?/i.test(normalizedTask);
    const hasStandaloneAbstractTarget = /(?:abstract|摘要|title|标题|keyword list|keywords?|关键词)/i.test(normalizedTask);
    const hasStandaloneSubmissionMaterial = /(?:cover letter|ethical statement|ethics statement|data availability|code availability|conflict of interest|coi|acknowledgements|acknowledgments|author contributions|contribution statement|statement|声明|致谢|作者贡献|投稿信)/i.test(normalizedTask);
    const hasStandalonePresentationTarget = /(?:slides?|ppt|beamer|presentation|conference talk|poster|海报|graphical abstract|visual abstract|图文摘要|版式)/i.test(normalizedTask);
    const hasStandaloneProposalTarget = /(?:proposal|grant|基金|申请书|research plan|aims|技术路线|研究内容|创新性|可行性)/i.test(normalizedTask);
    const hasStandalonePolicyAudit = /(?:pdf.{0,16}metadata|metadata.{0,16}匿名|page limit|camera[-\s]?ready|checklist|anonymous|double blind|匿名风险|匿名版|作者信息)/i.test(normalizedTask) &&
      !/supplementary material|supplemental material|supporting information|supplementary|appendix|附录|补充材料/i.test(normalizedTask);
    const hasStandaloneCitationTarget = /(?:zotero|bibtex|\.bib|refs\.bib|references\.bib|citation key|未定义引用|undefined reference|参考文献|引用格式)/i.test(normalizedTask);
    const hasStandaloneDiscussionTarget = /(?:limitations?|limitation section|局限性|局限|threats? to validity|broader impact)/i.test(normalizedTask);
    if (!hasContextAnswer(contextAnswers, 'target_section_or_file') && !hasExplicitTargetReference(normalizedTask) && !hasSectionScopedEvidenceReview && !hasSubmissionPolicyOnly && !hasReviewerContextOnly && !hasToolOrFigureTarget && !asksForLocalPolish && !hasStandaloneAbstractTarget && !hasStandaloneSubmissionMaterial && !hasStandalonePresentationTarget && !hasStandaloneProposalTarget && !hasStandalonePolicyAudit && !hasStandaloneCitationTarget && !hasStandaloneDiscussionTarget) {
      missingContext.push('target_section_or_file');
      nextActions.push({
        type: 'select-file',
        label_zh: '选择要写作或修改的章节',
      });
    }
  }

  if (asksForLiteratureSearch) {
    mode = 'agent';
    riskLevel = 'medium';
    requiresConfirmation = true;
    reasons.push('任务是在检索候选论文和扩展关键词，建议用 Agent 先给检索计划和候选清单，再决定是否导入 RAG。');
    if (!hasContextAnswer(contextAnswers, 'search_query')) {
      missingContext.push('search_query');
      nextActions.push({
        type: 'refine-query',
        label_zh: '填写检索关键词或研究问题',
      });
    }
  }

  if (asksForToolExecution) {
    mode = 'tools';
    riskLevel = 'high';
    requiresConfirmation = true;
    reasons.push('任务可能需要执行工具、编译、读写代码或处理实验数据，适合 Tools 模式并展示工具调用。');
  }

  if (asksForAnswerReview) {
    mode = 'agent';
    riskLevel = 'medium';
    requiresConfirmation = true;
    reasons.push('任务是在审查 AI 输出、幻觉引用或证据可采纳性，优先使用输出审查和证据检查闭环。');
    nextActions.push({
      type: 'review-answer',
      label_zh: '审查 AI 输出是否可采纳',
    });
  }

  if (asksForFigureOrStatReview) {
    mode = 'agent';
    riskLevel = 'medium';
    requiresConfirmation = true;
    reasons.push('任务是在检查图表、图注、统计值或编号引用一致性，建议用 Agent 给可确认的审查清单或修改建议。');
  }

  if (asksForClaimEvidenceCheck && !asksForSectionCitationMapping) {
    mode = 'chat';
    riskLevel = 'medium';
    requiresConfirmation = false;
    reasons.push('任务是在把单句 claim 与 RAG 证据核对，适合先用单句证据检查，不应直接改正文。');
    nextActions.push({
      type: 'review-claim',
      label_zh: '单句证据检查',
    });
  }

  if (asksForAdoptionPackage) {
    mode = 'agent';
    riskLevel = 'medium';
    requiresConfirmation = true;
    reasons.push('任务是在生成安全采纳包，只能生成人工采纳清单和只读预览，不得自动写入论文正文。');
    nextActions.push({
      type: 'build-adoption-package',
      label_zh: '生成安全采纳包',
    });
  }

  if (asksForCitationAudit) {
    mode = 'agent';
    riskLevel = 'medium';
    requiresConfirmation = true;
    reasons.push('任务是在检查引用键、引用格式或疑似幻觉引用，建议生成可审查清单，不自动改正文或 BibTeX。');
  }

  if (asksForReviewerRevisionWork) {
    mode = 'agent';
    riskLevel = 'medium';
    requiresConfirmation = true;
    reasons.push('任务属于返修/审稿意见处理，需要输出可审查的 concern 拆解、修改计划或补实验判断。');
  }

  if (asksForLatexDebugging) {
    mode = 'tools';
    riskLevel = 'high';
    requiresConfirmation = true;
    reasons.push('任务是在定位 LaTeX/Overleaf 编译报错，先根据日志生成最小修复计划；运行编译或写文件前必须确认。');
    if (!hasContextAnswer(contextAnswers, 'latex_error_log')) {
      missingContext.push('latex_error_log');
      nextActions.push({
        type: 'add-latex-log',
        label_zh: '粘贴 LaTeX/Overleaf 报错日志',
      });
    }
  }

  if (asksForEvidenceDiagnostics) {
    reasons.push('任务包含 RAG/PDF 证据库诊断；优先查看证据库健康、文档可用性和修复向导，不需要进入 Tools 执行模式。');
    nextActions.push({
      type: 'review-rag-status',
      label_zh: '查看 RAG/PDF 读取状态',
    });
  }

  const needsRagEvidence = /文献证据|证据支持|related work|literature|survey|research gap|幻觉引用|假引用|hallucinated citation|citation grounding|和.*证据核对|证据.*核对|negative evidence|反例|相反观点|逐句.*证据|每句话.*引用|每个 claim.*citation|支持.*novelty.*证据/i.test(normalizedTask) || explicitRagMention;
  const pureCitationManagement = /citation key|missing citation|author-year citation|引用格式|参考文献格式|bibtex|references?\\.bib|doi|按 .{0,16}格式整理参考文献/i.test(normalizedTask) && !needsRagEvidence;
  if (/文献|证据|引用|pdf|related work|literature|survey|citation|reference|bibtex|research gap/.test(lower) && !pureCitationManagement && !asksForSubmissionFileAudit) {
    if (!hasContextAnswer(contextAnswers, 'rag_documents_or_references') && !projectState.hasRagDocuments && !projectState.hasReferences) {
      missingContext.push('rag_documents_or_references');
      nextActions.push({
        type: 'upload-evidence',
        label_zh: '上传 PDF、BibTeX 或文献笔记到证据库',
      });
      reasons.push('任务依赖文献证据，但当前没有可用 RAG 文档或 references.bib。');
    } else if (evidence.query && evidence.results.length === 0) {
      nextActions.push({
        type: 'refine-query',
        label_zh: '换一组关键词重新检索证据库',
      });
      reasons.push('已经尝试检索证据库，但没有命中片段。');
    } else if (evidence.results?.length > 0) {
      reasons.push('当前任务可以直接引用已检索到的 RAG 证据片段。');
    }
  }

  if (recommendations[0]) {
    nextActions.push({
      type: 'activate-skill',
      label_zh: `启用推荐技能：${recommendations[0].skill.display_name_zh}`,
      skill: recommendations[0].skill.name,
    });
  }

  if (missingContext.length > 0) {
    confidence = 'medium';
  } else if (reasons.length >= 2 || recommendations[0]) {
    confidence = 'high';
  }

  return {
    mode,
    modeLabel_zh: {
      chat: '对话',
      agent: 'Agent 建议修改',
      tools: '工具执行',
    }[mode],
    confidence,
    risk_level: riskLevel,
    requiresConfirmation,
    reasons: Array.from(new Set(reasons)).slice(0, 5),
    missingContext: Array.from(new Set(missingContext)),
    missingContextDetails: Array.from(new Set(missingContext)).map(describeContextKey),
    nextActions: dedupeNextActions(nextActions),
  };
}

function describeContextKey(key) {
  const labels = {
    target_section_or_file: {
      key,
      label_zh: '目标章节或文件',
      help_zh: '例如 introduction、related work、discussion，或当前选中的稿件文件。',
    },
    rag_documents_or_references: {
      key,
      label_zh: '文献证据或 references.bib',
      help_zh: '上传 PDF、BibTeX、Markdown 文献笔记，或补充项目根目录的 references.bib。',
    },
    paper_claims: {
      key,
      label_zh: '论文主张与贡献点',
      help_zh: '说明论文要解决的问题、方法亮点和核心贡献。',
    },
    related_work: {
      key,
      label_zh: '相关工作证据',
      help_zh: '提供可引用的相关论文片段或已整理的 related work 笔记。',
    },
    method_notes: {
      key,
      label_zh: '方法说明材料',
      help_zh: '提供算法步骤、模型结构、符号定义或实现说明。',
    },
    experiment_results: {
      key,
      label_zh: '实验结果',
      help_zh: '提供表格、指标、baseline、消融或图表数据。',
    },
    paper_findings: {
      key,
      label_zh: '主要发现',
      help_zh: '提供实验结论、观察到的现象和局限性。',
    },
    paper_summary: {
      key,
      label_zh: '论文概要',
      help_zh: '提供问题、方法、结果和贡献的简短总结。',
    },
    references_bib: {
      key,
      label_zh: 'references.bib',
      help_zh: '提供 BibTeX 文件或需要整理的引用条目。',
    },
    reviewer_comments: {
      key,
      label_zh: '审稿意见',
      help_zh: '粘贴 reviewer comments、meta-review、decision letter 或已有 rebuttal 草稿。',
    },
    search_query: {
      key,
      label_zh: '检索关键词',
      help_zh: '提供领域、方法名、数据集名或时间范围。',
    },
    latex_error_log: {
      key,
      label_zh: 'LaTeX 报错日志',
      help_zh: '粘贴 Overleaf 或本地编译日志中的第一段 blocking error、行号和相关 .tex 文件线索。',
    },
    data_or_results: {
      key,
      label_zh: '数据或结果文件',
      help_zh: '提供实验数据、统计指标或结果表格。',
    },
    research_direction: {
      key,
      label_zh: '研究方向',
      help_zh: '提供领域、目标问题、约束和已有想法。',
    },
    figure_goal: {
      key,
      label_zh: '图表目标',
      help_zh: '说明图想表达什么、目标读者是谁、是否有数据或草图。',
    },
    venue_rules: {
      key,
      label_zh: '投稿规则',
      help_zh: '提供会议/期刊模板、页数限制、匿名要求和 checklist。',
    },
    compiled_pdf: {
      key,
      label_zh: '已编译 PDF',
      help_zh: '提供待检查的论文 PDF 或编译产物。',
    },
  };
  return labels[key] || {
    key,
    label_zh: key,
    help_zh: '需要补充这个上下文后才能更可靠地完成任务。',
  };
}

function hasExplicitSectionName(task = '') {
  return /\b(?:introduction|related work|background|method(?:ology)?|experiments?|results?|discussion|limitations?|conclusion|abstract)\b|引言|相关工作|背景|方法|实验|结果|讨论|局限|结论|摘要/i.test(String(task || ''));
}

function buildContextReadiness({
  task,
  projectState,
  recommendations,
  taskRouting,
  ragHealth,
  contextAnswers,
}) {
  const requiredKeys = new Set(taskRouting?.missingContext || []);
  const recommendedKeys = new Set();
  for (const [index, item] of (recommendations || []).entries()) {
    for (const key of item.skill?.requires_context || []) {
      if (!requiredKeys.has(key)) recommendedKeys.add(key);
    }
    for (const key of (index === 0 ? item.missingContext || [] : [])) {
      requiredKeys.add(key);
    }
  }

  for (const key of Object.keys(contextAnswers || {})) {
    requiredKeys.delete(key);
    recommendedKeys.delete(key);
  }

  if (task && /文献|证据|引用|pdf|related work|literature|survey|citation|reference|bibtex|research gap/i.test(task)) {
    recommendedKeys.add('rag_documents_or_references');
  }

  const required = Array.from(requiredKeys).map(key => buildContextRequirement(key, projectState, true, contextAnswers));
  const recommended = Array.from(recommendedKeys)
    .filter(key => !requiredKeys.has(key))
    .map(key => buildContextRequirement(key, projectState, false, contextAnswers));

  const satisfiedRequired = required.filter(item => item.status === 'ready').length;
  const totalRequired = required.length;
  const blocking = required.filter(item => item.status !== 'ready');
  const score = calculateReadinessScore(required, recommended, ragHealth);
  const status = blocking.length > 0
    ? 'blocked'
    : (score >= 80 ? 'ready' : 'needs-context');

  return {
    status,
    label_zh: {
      ready: '可以开始',
      blocked: '需要补上下文',
      'needs-context': '建议补充上下文',
    }[status],
    score,
    message_zh: buildReadinessMessage(status, blocking, ragHealth),
    required,
    recommended,
    satisfiedRequired,
    totalRequired,
  };
}

function buildClarificationQuestions({
  task,
  taskRouting,
  contextReadiness,
  recommendations,
}) {
  const questions = [];
  const keys = new Set([
    ...(taskRouting?.missingContext || []),
    ...(contextReadiness?.required || []).filter(item => item.status !== 'ready').map(item => item.key),
  ]);

  for (const item of recommendations || []) {
    for (const key of item.missingContext || []) keys.add(key);
  }

  if (!task) {
    questions.push({
      id: 'clarify-task',
      contextKey: 'task',
      priority: 'high',
      question_zh: '你现在最想完成哪个论文任务？',
      placeholder_zh: '例如：基于已上传 PDF 写 related work，或润色 introduction。',
      action: { type: 'focus-task', label_zh: '填写任务' },
    });
  }

  for (const key of keys) {
    const detail = describeContextKey(key);
    questions.push({
      id: `clarify-${key}`,
      contextKey: key,
      priority: key === 'target_section_or_file' || key === 'rag_documents_or_references' ? 'high' : 'medium',
      question_zh: buildClarificationQuestion(key, detail),
      placeholder_zh: buildClarificationPlaceholder(key),
      help_zh: detail.help_zh,
      action: buildContextAction(key),
    });
  }

  return dedupeClarificationQuestions(questions).slice(0, 5);
}

function buildContextBrief({
  task,
  taskRouting,
  contextReadiness,
  clarificationQuestions,
  recommendations,
  contextAnswers,
}) {
  const primarySkill = recommendations?.[0]?.skill;
  const confirmedSection = contextAnswers?.target_section_or_file || '';
  const inferredSection = confirmedSection || inferTargetSection(task);
  const items = [
    {
      key: 'task',
      label_zh: '用户任务',
      value_zh: task || '尚未填写任务。',
      confidence: task ? 'high' : 'low',
    },
    {
      key: 'mode',
      label_zh: '推荐模式',
      value_zh: taskRouting?.modeLabel_zh || taskRouting?.mode || '对话',
      confidence: taskRouting?.confidence || 'low',
    },
  ];

  if (primarySkill) {
    items.push({
      key: 'skill',
      label_zh: '推荐 Skill',
      value_zh: `${primarySkill.display_name_zh || primarySkill.name} (${primarySkill.subtitle_en || primarySkill.name})`,
      confidence: 'high',
    });
  }

  if (inferredSection) {
    items.push({
      key: 'target_section',
      label_zh: confirmedSection ? '已确认目标章节' : '可能目标章节',
      value_zh: inferredSection,
      confidence: confirmedSection || /章节|文件|chapters\/|\.tex|\.md/i.test(task || '') ? 'high' : 'medium',
    });
  }

  for (const [key, value] of Object.entries(contextAnswers || {})) {
    if (key === 'target_section_or_file') continue;
    const detail = describeContextKey(key);
    items.push({
      key: `answer_${key}`,
      label_zh: `用户补充：${detail.label_zh}`,
      value_zh: value,
      confidence: 'high',
    });
  }

  items.push({
    key: 'readiness',
    label_zh: '上下文准备度',
    value_zh: contextReadiness?.message_zh || '未评估。',
    confidence: contextReadiness?.status === 'ready' ? 'high' : 'medium',
  });

  const blockers = (contextReadiness?.required || [])
    .filter(item => item.status !== 'ready')
    .map(item => item.label_zh || item.key);
  const assumptions = [];
  if (!confirmedSection && inferredSection && taskRouting?.missingContext?.includes('target_section_or_file')) {
    assumptions.push(`从任务文本推测目标章节可能是“${inferredSection}”，但仍建议用户确认具体文件或段落。`);
  }
  if (blockers.length) {
    assumptions.push(`仍缺少关键上下文：${blockers.join('、')}。`);
  }

  const brief = {
    status: blockers.length ? 'needs-confirmation' : 'ready',
    label_zh: blockers.length ? '需要确认上下文' : '上下文摘要可用',
    summary_zh: blockers.length
      ? `已整理任务摘要，但还有 ${blockers.length} 项关键上下文需要确认。`
      : '已整理当前任务上下文，可作为发送给 AI 的工作摘要。',
    items,
    assumptions,
    openQuestions: (clarificationQuestions || []).map(item => item.question_zh),
    copyText: '',
  };
  brief.copyText = formatContextBriefCopyText(brief);
  return brief;
}

function inferTargetSection(task) {
  const raw = String(task || '');
  const text = raw.toLowerCase();
  const fileMatch = raw.match(/(?:chapters|sections|src|paper|appendix|figures|tables)\/[^\s，。；;]+|\b[^\s，。；;]+\.(?:tex|md|markdown|bib|pdf)\b/i);
  if (fileMatch?.[0]) return fileMatch[0];
  const figureMatch = raw.match(/\b(?:fig(?:ure)?|图)\s*\.?\s*([A-Z]?\d+[a-z]?)/i);
  if (figureMatch) return `Figure ${figureMatch[1]}`;
  const tableMatch = raw.match(/\b(?:tab(?:le)?|表)\s*\.?\s*([A-Z]?\d+[a-z]?)/i);
  if (tableMatch) return `Table ${tableMatch[1]}`;
  const reviewerMatch = raw.match(/\b(?:reviewer|review)\s*([A-Z]?\d+)\s*(?:comment|意见)?\s*([A-Z]?\d+)?/i);
  if (reviewerMatch) {
    return ['Reviewer', reviewerMatch[1], reviewerMatch[2] ? `Comment ${reviewerMatch[2]}` : ''].filter(Boolean).join(' ');
  }
  const appendixMatch = raw.match(/\bappendix\s+([A-Z]\d*|\d+[A-Z]?)\b/i);
  if (appendixMatch) return `Appendix ${appendixMatch[1]}`;
  const patterns = [
    [/related work|literature|相关工作|文献综述/, 'Related Work / 文献综述'],
    [/introduction|引言/, 'Introduction / 引言'],
    [/method|methodology|方法|算法/, 'Method / 方法'],
    [/result|experiment|实验|结果/, 'Results / 实验结果'],
    [/discussion|讨论/, 'Discussion / 讨论'],
    [/abstract|摘要/, 'Abstract / 摘要'],
    [/conclusion|结论/, 'Conclusion / 结论'],
  ];
  for (const [regex, label] of patterns) {
    if (regex.test(text)) return label;
  }
  if (/当前|选中|selected/i.test(raw)) return '当前选中内容';
  return '';
}

function hasExplicitTargetReference(task = '') {
  const raw = String(task || '');
  if (/(?:chapters|sections|src|paper|appendix|figures|tables)\/[^\s，。；;]+|\b[^\s，。；;]+\.(?:tex|md|markdown|bib|pdf)\b/i.test(raw)) return true;
  if (/\bcover[-_\s]?letter\b|投稿信|投稿说明/i.test(raw)) return true;
  if (/\b(?:fig(?:ure)?|图)\s*\.?\s*[A-Z]?\d+[a-z]?/i.test(raw)) return true;
  if (/\b(?:tab(?:le)?|表)\s*\.?\s*[A-Z]?\d+[a-z]?/i.test(raw)) return true;
  if (/\b(?:reviewer|review)\s*[A-Z]?\d+\s*(?:comment|意见)?\s*[A-Z]?\d*/i.test(raw)) return true;
  if (/\bappendix\s+(?:[A-Z]\d*|\d+[A-Z]?)\b/i.test(raw)) return true;
  if (/当前|选中|selected/i.test(raw)) return true;
  return false;
}

function formatContextBriefCopyText(brief) {
  return [
    '# 当前任务上下文摘要',
    `${brief.label_zh}：${brief.summary_zh}`,
    '',
    '# 已知信息',
    ...(brief.items || []).map(item => `- ${item.label_zh}：${item.value_zh}（置信度：${item.confidence}）`),
    '',
    '# 假设与风险',
    ...(brief.assumptions?.length ? brief.assumptions.map(item => `- ${item}`) : ['- 暂无明显假设。']),
    '',
    '# 仍需回答',
    ...(brief.openQuestions?.length ? brief.openQuestions.map(item => `- ${item}`) : ['- 无。']),
  ].join('\n');
}

function buildDraftPlan({
  task,
  taskRouting,
  recommendations,
  evidencePack,
  citationPolicy,
  contextBrief,
}) {
  const primarySkill = recommendations?.[0]?.skill;
  const lower = String(task || '').toLowerCase();
  const evidenceItems = evidencePack?.items || [];
  const citationSensitive = Boolean(citationPolicy?.citationSensitive);
  const planType = inferDraftPlanType(lower, primarySkill);
  const sections = buildDraftPlanSections(planType, evidenceItems, citationSensitive);
  const warnings = [];
  if (contextBrief?.status === 'needs-confirmation') {
    warnings.push('上下文仍需确认，先把计划作为草案，不要直接写入正式论文文件。');
  }
  if (citationSensitive && evidenceItems.length === 0) {
    warnings.push('缺少可引用证据，只能生成结构计划或待补证据清单，不能生成带具体引用的正文。');
  }
  if (evidencePack?.coverage?.status && ['single-source', 'concentrated', 'thin'].includes(evidencePack.coverage.status)) {
    warnings.push(evidencePack.coverage.guidance_zh);
  }

  const plan = {
    status: warnings.length ? 'needs-review' : 'ready',
    label_zh: warnings.length ? '计划需先确认' : '写作计划可用',
    planType,
    mode: taskRouting?.mode || 'chat',
    skill: primarySkill?.name || '',
    title_zh: buildDraftPlanTitle(planType),
    summary_zh: buildDraftPlanSummary(planType, sections, warnings),
    sections,
    expectedOutput: buildDraftExpectedOutput(planType, taskRouting?.mode),
    warnings,
    copyText: '',
  };
  plan.copyText = formatDraftPlanCopyText(plan);
  return plan;
}

function buildSkillDecisionGuide({
  recommendations,
  taskRouting,
  contextReadiness,
}) {
  const items = recommendations || [];
  const primary = items[0] || null;
  if (!primary) {
    return {
      status: 'empty',
      label_zh: '暂无 Skill 决策',
      summary_zh: '任务还不够具体，暂时无法判断该选哪个 Skill。',
      primary: null,
      alternatives: [],
      questions_zh: ['请先描述要写的章节、目标输出和已有材料。'],
      copyText: '# Skill 决策指南\n暂无推荐。请先补充任务目标和上下文。',
    };
  }

  const primarySkill = primary.skill || {};
  const alternatives = items.slice(1, 4).map(item => buildSkillAlternative(primary, item));
  const missing = Array.from(new Set([
    ...(primary.missingContext || []),
    ...(contextReadiness?.required || []).filter(item => item.status !== 'ready').map(item => item.key),
  ]));
  const guide = {
    status: missing.length ? 'needs-context' : 'ready',
    label_zh: missing.length ? '推荐可用但需补材料' : '推荐 Skill 可用',
    summary_zh: buildSkillDecisionSummary(primary, alternatives, taskRouting, missing),
    primary: {
      name: primarySkill.name,
      title_zh: primarySkill.display_name_zh || primarySkill.display_name || primarySkill.name,
      subtitle_en: primarySkill.subtitle_en || primarySkill.name,
      category_zh: primarySkill.category_zh || '',
      score: primary.score,
      risk_level: primarySkill.risk_level || 'medium',
      why_zh: buildPrimarySkillWhy(primary, taskRouting),
      use_when_zh: (primarySkill.best_for || []).slice(0, 3),
      avoid_when_zh: (primarySkill.not_for || []).slice(0, 3),
      missingContext: missing,
      nextAction_zh: missing.length
        ? `先补充：${missing.map(key => describeContextKey(key).label_zh).join('、')}。`
        : `可以先用“${primarySkill.display_name_zh || primarySkill.name}”生成计划或草稿。`,
      suggestedTask: primary.suggestedTask || '',
    },
    alternatives,
    questions_zh: buildSkillDecisionQuestions(primary, alternatives, missing),
    copyText: '',
  };
  guide.copyText = formatSkillDecisionGuideCopyText(guide);
  return guide;
}

function buildSkillCompareGuide({ recommendations, taskRouting, contextReadiness }) {
  const items = (recommendations || []).slice(0, 3);
  if (!items.length) {
    return {
      status: 'empty',
      label_zh: '暂无可对比 Skill',
      summary_zh: '输入更具体的论文任务后，会把推荐 Skill 按用途、输入、产出和风险并排比较。',
      selected: '',
      cards: [],
      decisionRules: ['先描述任务目标、目标章节和已有材料，再比较 Skill。'],
      copyText: '# Skill 对比\n暂无可对比 Skill。',
    };
  }

  const selected = items[0]?.skill?.name || '';
  const cards = items.map((item, index) => buildSkillCompareCard(item, {
    index,
    selected,
    taskRouting,
    contextReadiness,
  }));
  const guide = {
    status: cards.some(card => card.missingContext.length) ? 'needs-context' : 'ready',
    label_zh: cards.some(card => card.missingContext.length) ? '对比后需补材料' : '可直接比较选择',
    summary_zh: buildSkillCompareSummary(cards),
    selected,
    cards,
    decisionRules: buildSkillCompareRules(cards, taskRouting),
    copyText: '',
  };
  guide.copyText = formatSkillCompareGuideCopyText(guide);
  return guide;
}

function buildSkillCompareCard(item, { index, selected, taskRouting, contextReadiness }) {
  const skill = item.skill || {};
  const missing = Array.from(new Set([
    ...(item.missingContext || []),
    ...(index === 0 ? (contextReadiness?.required || [])
      .filter(contextItem => contextItem.status !== 'ready')
      .map(contextItem => contextItem.key) : []),
  ]));
  return {
    name: skill.name || '',
    title_zh: skill.display_name_zh || skill.display_name || skill.name || '未命名 Skill',
    subtitle_en: skill.subtitle_en || skill.name || '',
    category_zh: skill.category_zh || '',
    rank: index + 1,
    score: item.score || 0,
    selected: (skill.name || '') === selected,
    risk_level: skill.risk_level || 'medium',
    risk_label_zh: describeRiskLevel(skill.risk_level || 'medium'),
    estimated_time: skill.estimated_time || '',
    best_for: (skill.best_for || []).slice(0, 4),
    not_for: (skill.not_for || []).slice(0, 4),
    inputs: (skill.inputs || []).slice(0, 4),
    outputs: (skill.outputs || []).slice(0, 4),
    tags: (skill.tags || []).slice(0, 6),
    missingContext: missing,
    missingContext_zh: missing.map(key => describeContextKey(key).label_zh),
    choose_if_zh: buildSkillChooseIf(item, taskRouting),
    avoid_if_zh: buildSkillAvoidIf(skill),
    tradeoff_zh: buildSkillTradeoff(item, index),
    first_prompt_zh: item.suggestedTask || (skill.task_templates || [])[0] || '',
  };
}

function describeRiskLevel(level) {
  return {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
  }[level] || '中风险';
}

function buildSkillChooseIf(item, taskRouting) {
  const skill = item.skill || {};
  if (/literature-review/.test(skill.name || '')) return '你要写 related work、梳理文献主题、找 research gap，且需要 RAG 证据约束。';
  if (/introduction/.test(skill.name || '')) return '你要把研究背景、问题、gap、方法和贡献串成 Introduction 叙事。';
  if (/method/.test(skill.name || '')) return '你要解释算法、模块、符号或方法流程，而不是写文献综述。';
  if (/result|discussion/.test(skill.name || '')) return '你要围绕实验结果、baseline、消融或异常现象写分析。';
  if (/abstract|conclusion/.test(skill.name || '')) return '你要压缩全文贡献、结果和结论，形成短文本。';
  if (/polish/.test(skill.name || '')) return '你要润色、翻译、检查语法时态、压缩段落、降低 AI 痕迹或改成目标期刊写作风格。';
  if (/evidence-review/.test(skill.name || '')) return '你要审查 AI 输出、核对单句 claim、检查幻觉引用，或生成只读安全采纳包。';
  if (/latex-debug/.test(skill.name || '')) return '你要根据 LaTeX/Overleaf 报错日志定位编译失败，并先得到最小修复计划。';
  if (/reference|citation/.test(skill.name || '')) return '你要整理 BibTeX、citation key 或引用格式，而不是生成正文。';
  if (/figure/.test(skill.name || '')) return '你要设计论文图表、caption 或结果可视化表达。';
  if (/submission|conference/.test(skill.name || '')) return '你要按会议/期刊规则做投稿前检查。';
  const mode = taskRouting?.mode === 'tools' ? '工具执行' : taskRouting?.mode === 'agent' ? '正文修改' : '对话澄清';
  return `你希望把当前任务交给该 Skill 做${mode}，并接受它的输入/输出边界。`;
}

function buildSkillAvoidIf(skill) {
  const notFor = skill.not_for || [];
  if (notFor.length) return `如果你的任务主要是${notFor.slice(0, 2).join('、')}，不要优先选它。`;
  if (skill.risk_level === 'high') return '如果你还没有确认输入文件、命令或投稿规则，不要直接执行。';
  return '如果任务目标、目标章节或已有材料还不清楚，先用 Chat 澄清再选。';
}

function buildSkillTradeoff(item, index) {
  const skill = item.skill || {};
  if (index === 0) return '默认首选，覆盖当前任务最直接；代价是仍要满足缺失上下文和引用安全规则。';
  if ((skill.category_zh || '') === '写作') return '更适合正文叙事和段落组织，但对文献证据边界的约束弱于文献类 Skill。';
  if ((skill.category_zh || '') === '文献') return '更适合证据和文献脉络，但不一定能处理目标章节的完整叙事。';
  if ((skill.category_zh || '') === '引用') return '更适合引用格式和 BibTeX 清理，但不负责生成文献综述正文。';
  if ((skill.category_zh || '') === '实验') return '更适合实验分析和统计解释，但不能替代文献证据。';
  return '适合专项任务；如果目标是完整章节写作，通常要和首选 Skill 配合使用。';
}

function buildSkillCompareSummary(cards) {
  const primary = cards[0];
  const blocked = cards.filter(card => card.missingContext.length).length;
  return `首选“${primary.title_zh}”，同时对比 ${cards.length} 个候选 Skill。${blocked ? `${blocked} 个候选还缺材料，需先补齐后再采纳输出。` : '当前候选都可进入下一步审查。'}`;
}

function buildSkillCompareRules(cards, taskRouting) {
  const rules = [
    '先看“什么时候选”，再看分数；分数高不代表能跳过上下文或引用检查。',
    '写正文优先选能说明产出边界的 Skill；整理资料优先选引用、文献或检索类 Skill。',
    '如果候选 Skill 缺少目标章节、文献证据或实验结果，先补材料再生成正文。',
  ];
  if (taskRouting?.mode === 'tools') {
    rules.push('Tools 模式相关 Skill 只生成执行计划，运行命令前必须再次确认。');
  }
  if (cards.some(card => card.risk_level === 'medium')) {
    rules.push('中风险 Skill 的输出可能进入论文正文，采纳前必须人工审查。');
  }
  return rules;
}

function formatSkillCompareGuideCopyText(guide) {
  return [
    '# Skill 对比',
    `${guide.label_zh}：${guide.summary_zh}`,
    '',
    '# 选择规则',
    ...(guide.decisionRules || []).map(rule => `- ${rule}`),
    '',
    '# 候选 Skill',
    ...(guide.cards || []).map(card => [
      `## ${card.rank}. ${card.title_zh} (${card.subtitle_en})`,
      `分数：${card.score}，风险：${card.risk_label_zh}，分类：${card.category_zh}`,
      `什么时候选：${card.choose_if_zh}`,
      `不要选：${card.avoid_if_zh}`,
      `取舍：${card.tradeoff_zh}`,
      card.missingContext_zh.length ? `缺少材料：${card.missingContext_zh.join('、')}` : '缺少材料：无',
      card.first_prompt_zh ? `首问模板：${card.first_prompt_zh}` : '',
    ].filter(Boolean).join('\n')),
  ].join('\n\n');
}

function buildModeDecisionGuide({
  taskRouting,
  interactionPlan,
  contextReadiness,
  citationPolicy,
  evidence,
  recommendations,
}) {
  const selectedMode = ['chat', 'agent', 'tools'].includes(taskRouting?.mode) ? taskRouting.mode : 'chat';
  const modeLabels = {
    chat: '对话',
    agent: 'Agent 建议修改',
    tools: '工具执行',
  };
  const selected = buildModeGuideOption(selectedMode, {
    taskRouting,
    interactionPlan,
    contextReadiness,
    citationPolicy,
    evidence,
    recommendations,
    selected: true,
  });
  const alternatives = ['chat', 'agent', 'tools']
    .filter(mode => mode !== selectedMode)
    .map(mode => buildModeGuideOption(mode, {
      taskRouting,
      interactionPlan,
      contextReadiness,
      citationPolicy,
      evidence,
      recommendations,
      selected: false,
    }));
  const blockedReasons = interactionPlan?.blockedReasons || [];
  const guide = {
    status: blockedReasons.length
      ? 'blocked'
      : (taskRouting?.requiresConfirmation ? 'needs-confirmation' : 'ready'),
    label_zh: blockedReasons.length
      ? '模式可用但有阻塞'
      : (taskRouting?.requiresConfirmation ? '模式需要确认' : '模式可直接对话'),
    summary_zh: buildModeDecisionSummary(selected, alternatives, blockedReasons),
    selected,
    alternatives,
    switchHints: buildModeSwitchHints(selectedMode, citationPolicy, contextReadiness),
    safetyBoundaries: buildModeSafetyBoundaries(),
    copyText: '',
  };
  guide.copyText = formatModeDecisionGuideCopyText(guide, modeLabels);
  return guide;
}

function buildModeGuideOption(mode, {
  taskRouting,
  interactionPlan,
  contextReadiness,
  citationPolicy,
  evidence,
  recommendations,
  selected,
}) {
  const labels = {
    chat: '对话',
    agent: 'Agent 建议修改',
    tools: '工具执行',
  };
  const english = {
    chat: 'Chat',
    agent: 'Agent',
    tools: 'Tools',
  };
  const useWhen = {
    chat: [
      '解释、总结、评价、澄清问题或生成轻量建议。',
      '用户还没有要求改正文、写入文件或运行命令。',
      '可以接受一般建议，或只需要把证据和推测分开说明。',
    ],
    agent: [
      '写作、改写、润色、扩写或重组论文正文。',
      '需要读取上下文、生成草稿、修改建议或 diff。',
      '输出会影响论文内容，但应先由用户审查确认。',
    ],
    tools: [
      '编译 LaTeX、运行脚本、处理数据、生成表格或图。',
      '需要展示命令、输入文件、输出路径和失败恢复方式。',
      '任何写入、删除、覆盖、移动或外部命令执行都必须先确认。',
    ],
  };
  const avoidWhen = {
    chat: [
      '用户明确要求改正文、生成可采纳草稿或执行命令。',
      '任务需要对文件产生修改或需要严格审查 diff。',
    ],
    agent: [
      '用户只是问“为什么/怎么看/总结一下”，不需要改稿。',
      '任务核心是编译、脚本、统计或文件系统操作。',
    ],
    tools: [
      '只需要解释、写作建议或可复制草稿。',
      '用户还没有确认命令、输入路径、输出路径和风险。',
    ],
  };
  const why = selected
    ? buildSelectedModeReasons(mode, taskRouting, interactionPlan, citationPolicy, evidence, recommendations)
    : buildAlternativeModeReasons(mode, taskRouting, contextReadiness, citationPolicy);
  return {
    mode,
    label_zh: labels[mode],
    subtitle_en: english[mode],
    selected,
    risk_level: mode === 'tools' ? 'high' : (mode === 'agent' ? 'medium' : 'low'),
    why_zh: why,
    use_when_zh: useWhen[mode],
    avoid_when_zh: avoidWhen[mode],
    switch_if_zh: buildSwitchIf(mode),
    boundary_zh: buildModeBoundary(mode),
  };
}

function buildSelectedModeReasons(mode, taskRouting, interactionPlan, citationPolicy, evidence, recommendations) {
  const reasons = [...(taskRouting?.reasons || [])];
  if (interactionPlan?.blockedReasons?.length) {
    reasons.push(`当前仍有 ${interactionPlan.blockedReasons.length} 个阻塞项，主动作应先处理阻塞而不是直接生成可采纳结果。`);
  }
  if (citationPolicy?.citationSensitive) {
    reasons.push(evidence?.results?.length
      ? `任务涉及文献证据，当前有 ${evidence.results.length} 条可编号引用的 RAG 片段。`
      : '任务涉及文献证据，但当前没有可用命中，不能生成带具体引用的正文。');
  }
  if (recommendations?.[0]?.skill) {
    reasons.push(`首选 Skill 是“${recommendations[0].skill.display_name_zh || recommendations[0].skill.name}”，与当前模式一起使用。`);
  }
  if (!reasons.length) {
    reasons.push(mode === 'chat'
      ? '任务暂不涉及写文件、正文修改或工具执行，先用对话最稳妥。'
      : '任务意图需要比普通对话更强的执行约束。');
  }
  return Array.from(new Set(reasons)).slice(0, 5);
}

function buildAlternativeModeReasons(mode, taskRouting, contextReadiness, citationPolicy) {
  const selected = taskRouting?.mode || 'chat';
  if (mode === 'chat' && selected !== 'chat') {
    return ['没有选择 Chat，因为当前任务不只是解释或建议，还可能影响正文或执行工具。'];
  }
  if (mode === 'agent' && selected !== 'agent') {
    if (selected === 'chat') return ['没有选择 Agent，因为当前任务更像解释/总结，暂不需要生成可采纳草稿或 diff。'];
    return ['没有选择 Agent，因为当前任务包含工具、脚本、编译或文件操作风险，需要先进入 Tools 计划。'];
  }
  if (mode === 'tools' && selected !== 'tools') {
    return ['没有选择 Tools，因为任务暂不需要运行命令、编译、统计或写入文件。'];
  }
  const caveats = [];
  if (contextReadiness?.status === 'blocked') caveats.push('当前上下文仍有阻塞项，切换后也应先补齐资料。');
  if (citationPolicy?.status === 'no-evidence') caveats.push('当前没有证据库，切换模式也不能编造引用。');
  return caveats.length ? caveats : ['该模式可作为备选，但不是当前任务的最小风险路径。'];
}

function buildSwitchIf(mode) {
  if (mode === 'chat') return '如果你只是想问“这段怎么理解/怎么组织/有哪些风险”，切换到 Chat。';
  if (mode === 'agent') return '如果你要 AI 产出正文草稿、润色版本、结构改写或 diff，切换到 Agent。';
  return '如果你要编译、运行脚本、生成图表、整理文件或处理实验数据，切换到 Tools。';
}

function buildModeBoundary(mode) {
  if (mode === 'chat') return '只回答和澄清，不自动改文件、不执行命令。';
  if (mode === 'agent') return '先给计划、草稿或 diff；用户确认前不写入或覆盖论文正文。';
  return '先展示命令、输入、输出和风险；用户确认前不运行命令、不写入/删除/移动文件。';
}

function buildModeSwitchHints(selectedMode, citationPolicy, contextReadiness) {
  const hints = [
    {
      targetMode: 'chat',
      label_zh: '我只想先问清楚',
      prompt_zh: '帮我解释这个任务应该怎么做，先不要写正文或运行工具。',
    },
    {
      targetMode: 'agent',
      label_zh: '我要生成可审查草稿',
      prompt_zh: '请先给结构计划和可复制草稿，不要直接写入文件。',
    },
    {
      targetMode: 'tools',
      label_zh: '我要执行命令或处理文件',
      prompt_zh: '请先列出工具执行计划、命令、输入输出和风险，等我确认后再执行。',
    },
  ];
  if (citationPolicy?.citationSensitive) {
    hints.push({
      targetMode: selectedMode,
      label_zh: '涉及引用时',
      prompt_zh: '只使用证据包里的编号来源，缺证据时先补证据，不要编造作者、年份或 DOI。',
    });
  }
  if (contextReadiness?.status === 'blocked') {
    hints.push({
      targetMode: selectedMode,
      label_zh: '上下文阻塞时',
      prompt_zh: '先回答工作台列出的缺失上下文，再生成正文或执行工具。',
    });
  }
  return hints;
}

function buildModeSafetyBoundaries() {
  return [
    { mode: 'chat', label_zh: 'Chat 边界', rule_zh: '可以解释和建议；不自动写文件、不执行命令、不声称已修改论文。' },
    { mode: 'agent', label_zh: 'Agent 边界', rule_zh: '可以生成计划、草稿、修改建议或 diff；用户确认前不覆盖正文。' },
    { mode: 'tools', label_zh: 'Tools 边界', rule_zh: '可以规划命令和展示风险；用户确认前不运行脚本、不编译、不写入/删除/移动文件。' },
  ];
}

function buildModeDecisionSummary(selected, alternatives, blockedReasons) {
  const blocker = blockedReasons.length ? `当前还有 ${blockedReasons.length} 个阻塞项，先处理阻塞再继续。` : '';
  const altText = alternatives.length
    ? `如果任务目标变化，可切换到 ${alternatives.map(item => item.label_zh).join(' 或 ')}。`
    : '';
  return `当前推荐“${selected.label_zh}”，因为它是这个任务的最小风险执行方式。${blocker}${altText}`;
}

function formatModeDecisionGuideCopyText(guide) {
  return [
    '# Chat / Agent / Tools 模式决策',
    `${guide.label_zh}：${guide.summary_zh}`,
    '',
    '# 当前推荐',
    `${guide.selected.label_zh} (${guide.selected.subtitle_en})`,
    `风险：${guide.selected.risk_level}`,
    `边界：${guide.selected.boundary_zh}`,
    '为什么：',
    ...(guide.selected.why_zh?.length ? guide.selected.why_zh.map(item => `- ${item}`) : ['- 当前任务匹配该模式。']),
    '',
    '# 什么时候切换',
    ...(guide.switchHints || []).map(item => `- ${item.label_zh}：${item.prompt_zh}`),
    '',
    '# 备选模式',
    ...(guide.alternatives || []).map(item => `- ${item.label_zh} (${item.subtitle_en})：${item.switch_if_zh} 边界：${item.boundary_zh}`),
    '',
    '# 安全边界',
    ...(guide.safetyBoundaries || []).map(item => `- ${item.label_zh}：${item.rule_zh}`),
  ].join('\n');
}

function buildModeActionCenter({
  taskRouting,
  interactionPlan,
  modeDecisionGuide,
  aiDraftRequest,
  contextReadiness,
  citationPolicy,
  evidencePack,
}) {
  const mode = interactionPlan?.mode || taskRouting?.mode || 'chat';
  const blockedReasons = interactionPlan?.blockedReasons || [];
  const hasBlockingChecklist = blockedReasons.length > 0 || contextReadiness?.status === 'blocked';
  const primaryAction = buildModePrimaryAction({
    mode,
    interactionPlan,
    taskRouting,
    aiDraftRequest,
    hasBlockingChecklist,
    citationPolicy,
    evidencePack,
  });
  const center = {
    status: hasBlockingChecklist ? 'blocked' : (interactionPlan?.requiresConfirmation ? 'needs-confirmation' : 'ready'),
    label_zh: hasBlockingChecklist ? '先处理阻塞项' : (interactionPlan?.requiresConfirmation ? '发送前需要确认' : '可以开始对话'),
    summary_zh: buildModeActionSummary(mode, primaryAction, interactionPlan, blockedReasons),
    selectedMode: mode,
    primaryAction,
    sendGate: buildModeSendGate({
      mode,
      primaryAction,
      interactionPlan,
      hasBlockingChecklist,
      citationPolicy,
      evidencePack,
      contextReadiness,
    }),
    modeOptions: buildModeActionOptions(mode, modeDecisionGuide),
    blockers: blockedReasons.map(reason => ({
      code: reason.code || reason.id || 'blocked',
      label_zh: reason.label_zh || '阻塞项',
      detail_zh: reason.detail_zh || '',
      action: reason.action || inferBlockerAction(reason),
    })),
    preflightChecklist: buildModePreflightChecklist({
      mode,
      interactionPlan,
      citationPolicy,
      evidencePack,
      contextReadiness,
    }),
    forbiddenActions: interactionPlan?.forbiddenActions || [],
    confirmationRequiredBefore: interactionPlan?.confirmationRequiredBefore || [],
    copyText: '',
  };
  center.copyText = formatModeActionCenterCopyText(center);
  return center;
}

function buildModeSendGate({
  mode,
  primaryAction,
  interactionPlan,
  hasBlockingChecklist,
  citationPolicy,
  evidencePack,
  contextReadiness,
}) {
  const citationBlocked = ['no-evidence', 'needs-evidence', 'missing-evidence'].includes(citationPolicy?.status || evidencePack?.status);
  const blockingReasons = [
    hasBlockingChecklist ? '当前存在阻塞项，不能直接发送。' : '',
    primaryAction?.enabled === false ? (primaryAction.disabledReason_zh || '主操作暂不可用。') : '',
    contextReadiness?.status === 'blocked' ? (contextReadiness.message_zh || '关键上下文未补齐。') : '',
    citationBlocked ? (citationPolicy?.message_zh || '引用任务缺少可用证据。') : '',
  ].filter(Boolean);
  const requiresSafetyAck = Boolean(
    blockingReasons.length ||
    interactionPlan?.requiresConfirmation ||
    mode === 'agent' ||
    mode === 'tools'
  );
  return {
    status: blockingReasons.length ? 'blocked' : requiresSafetyAck ? 'requires-ack' : 'open',
    canSend: blockingReasons.length === 0,
    requiresSafetyAck,
    checkboxLabel_zh: requiresSafetyAck
      ? '我已确认：本次发送只创建会话和生成可审查输出，不会自动写入论文正文、覆盖文件或运行命令。'
      : '当前是低风险对话模式；发送仍不会自动写入文件或运行命令。',
    blockingReasons,
    mustNot_zh: [
      '不得自动写入或覆盖论文正文文件。',
      '不得自动运行命令、编译、删除、移动或覆盖文件。',
      '不得把未经审查的 AI 输出直接采纳为正式论文正文。',
    ],
  };
}

function buildModePrimaryAction({
  mode,
  interactionPlan,
  taskRouting,
  aiDraftRequest,
  hasBlockingChecklist,
  citationPolicy,
  evidencePack,
}) {
  if (!taskRouting?.mode || !interactionPlan) {
    return {
      type: 'analyze-task',
      label_zh: '先分析论文任务',
      enabled: false,
      disabledReason_zh: '需要先输入任务并点击分析。',
      requiresExplicitUserAction: true,
    };
  }
  if (hasBlockingChecklist) {
    const first = interactionPlan.blockedReasons?.[0] || {};
    return {
      ...(first.action || inferBlockerAction(first)),
      label_zh: first.action?.label_zh || first.label_zh || '先处理阻塞项',
      enabled: false,
      disabledReason_zh: first.detail_zh || '当前存在阻塞项，先补资料或重新检索后再发送。',
      requiresExplicitUserAction: true,
      blockedBy: first.code || first.id || 'blocked',
    };
  }
  const citationBlocked = ['no-evidence', 'needs-evidence', 'missing-evidence'].includes(citationPolicy?.status || evidencePack?.status);
  if (citationBlocked) {
    return {
      type: 'search-or-upload-evidence',
      label_zh: '先补可引用证据',
      enabled: false,
      disabledReason_zh: citationPolicy?.message_zh || '当前任务需要证据，不能直接生成带引用正文。',
      requiresExplicitUserAction: true,
    };
  }
  return {
    type: mode === 'tools' ? 'create-tool-plan' : 'create-conversation-and-send',
    label_zh: interactionPlan.primaryCta_zh || (mode === 'tools' ? '生成工具执行计划' : '创建会话并发送'),
    enabled: true,
    requiresExplicitUserAction: true,
    mode,
    requestTemplate: {
      conversation: aiDraftRequest?.conversation || null,
      send: aiDraftRequest?.send || null,
    },
    confirmationRequired: Boolean(interactionPlan.requiresConfirmation),
  };
}

function inferBlockerAction(reason = {}) {
  const code = reason.code || reason.id || '';
  if (/evidence|rag|citation/i.test(code)) return { type: 'repair-rag-or-search', label_zh: '修复或检索证据' };
  if (/context|target|section/i.test(code)) return { type: 'add-context', label_zh: '补齐上下文' };
  return { type: 'review-blocker', label_zh: '查看阻塞项' };
}

function buildModeActionSummary(mode, primaryAction, interactionPlan, blockedReasons) {
  if (blockedReasons?.length) {
    return `当前推荐 ${mode}，但主操作被 ${blockedReasons.length} 个阻塞项拦截；先完成“${primaryAction.label_zh}”。`;
  }
  if (interactionPlan?.requiresConfirmation) {
    return `当前推荐 ${mode}。可以点击“${primaryAction.label_zh}”，但采纳、写入或执行前必须人工确认。`;
  }
  return `当前推荐 ${mode}。可以点击“${primaryAction.label_zh}”开始对话，仍需审查引用和输出质量。`;
}

function buildModeActionOptions(selectedMode, modeDecisionGuide) {
  const selected = modeDecisionGuide?.selected || {};
  const alternatives = modeDecisionGuide?.alternatives || [];
  return [selected, ...alternatives].filter(item => item?.mode).map(item => ({
    mode: item.mode,
    label_zh: item.label_zh,
    subtitle_en: item.subtitle_en,
    selected: item.mode === selectedMode,
    risk_level: item.risk_level,
    enabled: true,
    use_when_zh: item.use_when_zh || [],
    boundary_zh: item.boundary_zh || '',
    switchAction: {
      type: 'switch-mode-preview',
      label_zh: item.mode === selectedMode ? '当前模式' : `查看 ${item.label_zh}`,
      mode: item.mode,
    },
  }));
}

function buildModePreflightChecklist({ mode, interactionPlan, citationPolicy, evidencePack, contextReadiness }) {
  const citationBlocked = ['no-evidence', 'needs-evidence', 'missing-evidence'].includes(citationPolicy?.status || evidencePack?.status);
  return [
    {
      id: 'explicit-user-action',
      label_zh: '必须由用户点击触发',
      status: 'required',
      detail_zh: '任务分析不会自动创建会话、发送模型请求、写文件或运行命令。',
      blocking: false,
    },
    {
      id: 'context-ready',
      label_zh: '上下文已确认',
      status: contextReadiness?.status === 'blocked' ? 'blocked' : 'ready',
      detail_zh: contextReadiness?.message_zh || '确认目标章节、论文主张和必要材料。',
      blocking: contextReadiness?.status === 'blocked',
    },
    {
      id: 'citation-safe',
      label_zh: '引用安全',
      status: citationBlocked ? 'blocked' : 'ready',
      detail_zh: citationPolicy?.message_zh || '文献事实必须能追溯到证据编号。',
      blocking: citationBlocked,
    },
    {
      id: 'mode-boundary',
      label_zh: '模式边界',
      status: interactionPlan?.requiresConfirmation ? 'requires-confirmation' : 'ready',
      detail_zh: mode === 'tools'
        ? 'Tools 模式只先生成命令计划，确认前不运行命令。'
        : mode === 'agent'
          ? 'Agent 模式先生成建议、草稿或 diff，确认前不覆盖正文。'
          : 'Chat 模式只解释和整理，不改文件、不运行命令。',
      blocking: false,
    },
  ];
}

function formatModeActionCenterCopyText(center) {
  return [
    '# 模式操作中心',
    `${center.label_zh}：${center.summary_zh}`,
    '',
    '# 主操作',
    `${center.primaryAction.label_zh}（${center.primaryAction.enabled ? '可点击' : '暂不可点击'}）`,
    center.primaryAction.disabledReason_zh ? `原因：${center.primaryAction.disabledReason_zh}` : '',
    `发送门槛：${center.sendGate?.status || 'unknown'}，可发送：${center.sendGate?.canSend ? '是' : '否'}，需确认：${center.sendGate?.requiresSafetyAck ? '是' : '否'}`,
    '',
    '# 模式选项',
    ...(center.modeOptions || []).map(option => `- ${option.selected ? '当前' : '可切换'}：${option.label_zh}。${option.boundary_zh}`),
    '',
    '# 发送前检查',
    ...(center.preflightChecklist || []).map(item => `- ${item.blocking ? '阻塞' : item.status}：${item.label_zh}。${item.detail_zh}`),
    ...(center.forbiddenActions?.length ? ['', '# 禁止动作', ...center.forbiddenActions.map(item => `- ${item}`)] : []),
  ].filter(Boolean).join('\n');
}

function buildSkillDecisionSummary(primary, alternatives, taskRouting, missing) {
  const skill = primary.skill || {};
  const mode = taskRouting?.modeLabel_zh || taskRouting?.mode || '对话';
  const suffix = alternatives.length ? `另有 ${alternatives.length} 个备选 Skill。` : '暂无明显备选 Skill。';
  const blocker = missing.length ? `但还缺 ${missing.length} 类材料。` : '关键材料已基本满足。';
  return `当前任务更适合在 ${mode} 中使用“${skill.display_name_zh || skill.name}”。${blocker}${suffix}`;
}

function buildPrimarySkillWhy(recommendation, taskRouting) {
  const reasons = recommendation.reasons || [];
  const routingReason = firstText(taskRouting?.reasons);
  return [
    ...reasons.slice(0, 3),
    routingReason ? `模式判断：${routingReason}` : '',
  ].filter(Boolean);
}

function buildSkillAlternative(primary, alternative) {
  const primarySkill = primary.skill || {};
  const skill = alternative.skill || {};
  return {
    name: skill.name,
    title_zh: skill.display_name_zh || skill.display_name || skill.name,
    subtitle_en: skill.subtitle_en || skill.name,
    category_zh: skill.category_zh || '',
    score: alternative.score,
    reason_zh: firstText(alternative.reasons) || '也与当前任务部分匹配。',
    choose_if_zh: buildAlternativeChooseIf(primarySkill, skill),
    tradeoff_zh: buildAlternativeTradeoff(primarySkill, skill),
    missingContext: alternative.missingContext || [],
    suggestedTask: alternative.suggestedTask || '',
  };
}

function buildAlternativeChooseIf(primarySkill, skill) {
  if (skill.name === 'writing-introduction') return '如果你要把 related work 的 gap 转成 Introduction 动机和贡献表述，选它。';
  if (skill.name === 'reference-management') return '如果主要任务是整理 BibTeX、引用编号、DOI 或 references.bib，选它。';
  if (skill.name === 'writing-results' || skill.name === 'writing-discussion') return '如果重点转向实验结果、消融、局限和讨论，选它。';
  if (skill.name === 'nature-academic-search') return '如果当前证据不够，需要先找论文和扩展关键词，选它。';
  if (skill.name === primarySkill.name) return '与首选 Skill 相同。';
  return `如果你的目标更接近“${skill.display_name_zh || skill.name}”的产出，选它。`;
}

function buildAlternativeTradeoff(primarySkill, skill) {
  if (skill.name === primarySkill.name) return '没有明显取舍。';
  if (primarySkill.name === 'literature-review' && skill.name !== 'literature-review') {
    return '它更适合专项任务；若要写完整 related work，仍建议先用文献综述 Skill 做主题结构和证据边界。';
  }
  return '它可能更聚焦，但覆盖面比首选 Skill 窄；切换前先确认目标输出是否变化。';
}

function buildSkillDecisionQuestions(primary, alternatives, missing) {
  const questions = [];
  if (missing.includes('rag_documents_or_references')) questions.push('这次写作允许使用哪些 PDF、BibTeX 或文献笔记？');
  if (missing.includes('target_section_or_file')) questions.push('这次要写作或修改哪一个章节/文件？');
  if (alternatives.length) questions.push('你的主要目标是写正文、整理引用、补证据，还是修改实验分析？');
  if (!questions.length) questions.push(`是否直接使用“${primary.skill?.display_name_zh || primary.skill?.name}”生成可审查计划？`);
  return questions;
}

function formatSkillDecisionGuideCopyText(guide) {
  return [
    '# Skill 决策指南',
    `${guide.label_zh}：${guide.summary_zh}`,
    '',
    '# 首选 Skill',
    guide.primary
      ? [
        `名称：${guide.primary.title_zh} (${guide.primary.subtitle_en})`,
        `分数：${guide.primary.score}`,
        `下一步：${guide.primary.nextAction_zh}`,
        '推荐原因：',
        ...(guide.primary.why_zh?.length ? guide.primary.why_zh.map(item => `- ${item}`) : ['- 当前任务与该 Skill 最匹配。']),
        ...(guide.primary.avoid_when_zh?.length ? ['不适合：', ...guide.primary.avoid_when_zh.map(item => `- ${item}`)] : []),
      ].join('\n')
      : '暂无。',
    '',
    '# 备选 Skill',
    ...(guide.alternatives?.length
      ? guide.alternatives.map(item => `- ${item.title_zh} (${item.subtitle_en})：${item.choose_if_zh} 取舍：${item.tradeoff_zh}`)
      : ['- 暂无明显备选。']),
    '',
    '# 需要确认的问题',
    ...(guide.questions_zh || []).map(item => `- ${item}`),
  ].join('\n');
}

function inferDraftPlanType(taskText, primarySkill) {
  const skillName = primarySkill?.name || '';
  if (/related work|literature|survey|文献|相关工作|research gap/.test(taskText) || skillName === 'literature-review') return 'literature-review';
  if (/introduction|引言/.test(taskText) || skillName === 'writing-introduction') return 'introduction';
  if (/method|methodology|algorithm|方法|算法/.test(taskText) || skillName === 'writing-methodology') return 'method';
  if (/result|experiment|实验|结果|discussion|讨论/.test(taskText) || ['writing-results', 'writing-discussion'].includes(skillName)) return 'results-discussion';
  if (/abstract|摘要/.test(taskText) || skillName === 'writing-abstract') return 'abstract';
  return 'general-writing';
}

function buildDraftPlanTitle(planType) {
  return {
    'literature-review': 'Related Work / Research Gap 写作计划',
    introduction: 'Introduction 逻辑计划',
    method: 'Method / Algorithm 写作计划',
    'results-discussion': 'Results / Discussion 分析计划',
    abstract: 'Abstract 压缩计划',
    'general-writing': '论文写作计划',
  }[planType] || '论文写作计划';
}

function buildDraftPlanSections(planType, evidenceItems, citationSensitive) {
  const sourceHint = citationSensitive
    ? '事实性陈述必须引用证据编号；没有证据时只写待补证据点。'
    : '可按任务上下文组织内容。';
  const evidenceRefs = evidenceItems.slice(0, 3).map(item => `[${item.rank}]`);
  const refs = evidenceRefs.length ? evidenceRefs.join('、') : '待补证据';
  const templates = {
    'literature-review': [
      ['主题分组', '按方法、问题或数据集把相关工作分成 2-4 个主题。', refs],
      ['代表工作与直接证据', '每个主题只写证据片段能直接支持的观点。', refs],
      ['局限与 Research Gap', '把已有工作的不足和本文切入点分开写。', refs],
      ['过渡到本文贡献', '用 1 段说明本文如何回应 gap。', '需要用户确认论文贡献点'],
    ],
    introduction: [
      ['背景与问题', '用 1 段说明研究场景和核心问题。', refs],
      ['现有方法不足', '基于证据或用户主张总结 gap。', refs],
      ['本文方法与贡献', '列出 2-4 个贡献点。', '需要用户确认论文主张'],
      ['段落收束', '说明实验或结果将如何验证贡献。', '需要实验结果或摘要'],
    ],
    method: [
      ['问题定义', '给出输入、输出、符号和目标。', '需要方法说明'],
      ['方法流程', '按步骤描述模块或算法。', '需要算法/模型笔记'],
      ['关键设计', '解释关键组件为什么必要。', refs],
      ['复杂度或实现细节', '只写已确认的实现信息。', '需要实现或实验上下文'],
    ],
    'results-discussion': [
      ['主结果概览', '先写主要指标和总体结论。', '需要结果表格'],
      ['对比与消融', '按 baseline、ablation 或 dataset 组织。', '需要实验结果'],
      ['原因分析', '区分数据支持的观察和推测解释。', refs],
      ['局限性', '列出结果不能支持的结论。', refs],
    ],
    abstract: [
      ['问题', '一句话说明研究问题。', '需要论文概要'],
      ['方法', '一句话说明核心方法。', '需要方法摘要'],
      ['结果', '一句话说明最重要结果。', '需要实验结果'],
      ['贡献', '一句话说明价值或影响。', '需要论文贡献点'],
    ],
    'general-writing': [
      ['目标确认', '先确认要写的章节、语言和篇幅。', '需要用户确认'],
      ['素材整理', '列出可用证据、上下文和缺口。', refs],
      ['草稿生成', '先生成可复制草稿或结构建议。', sourceHint],
      ['审查修订', '按引用安全和验收清单检查。', '使用 AI 输出审查'],
    ],
  };
  return (templates[planType] || templates['general-writing']).map(([title_zh, goal_zh, evidenceUse_zh], index) => {
    const section = {
      id: `S${index + 1}`,
      title_zh,
      goal_zh,
      evidenceUse_zh,
      constraints_zh: sourceHint,
    };
    section.evidenceAssignments = assignEvidenceToDraftSection(section, evidenceItems, citationSensitive);
    return section;
  });
}

function assignEvidenceToDraftSection(section, evidenceItems, citationSensitive) {
  if (!citationSensitive || !evidenceItems.length) return [];
  const combined = `${section.title_zh} ${section.goal_zh}`.toLowerCase();
  const matched = evidenceItems.filter(item => {
    const support = `${item.snippet || ''} ${(item.supports_zh || []).join(' ')}`.toLowerCase();
    if (/gap|局限|不足|空白/.test(combined)) return /gap|limitation|lack|局限|不足|空白/.test(support);
    if (/主题|代表|related|文献|工作/.test(combined)) return /related|literature|survey|文献|工作|method|approach|方法/.test(support);
    if (/方法|method|algorithm|设计/.test(combined)) return /method|approach|framework|方法|模型|算法/.test(support);
    if (/结果|实验|result|指标/.test(combined)) return /result|performance|experiment|实验|结果|指标/.test(support);
    return false;
  });
  const selected = (matched.length ? matched : evidenceItems).slice(0, 3);
  return selected.map(item => ({
    rank: item.rank,
    sourceLabel: item.sourceLabel,
    use_zh: inferSectionEvidenceUse(section, item),
    caution_zh: (item.notFor || [])[0] || '不要扩展到片段之外的结论。',
  }));
}

function inferSectionEvidenceUse(section, item) {
  const title = `${section.title_zh} ${section.goal_zh}`;
  if (/gap|局限|不足|空白/i.test(title)) {
    return '用于支撑 research gap、现有局限或待解决问题。';
  }
  if (/主题|代表|related|文献|工作/i.test(title)) {
    return '用于支撑 related work 的主题归纳或代表性观点。';
  }
  if (/方法|method|algorithm|设计/i.test(title)) {
    return '用于支撑方法类别、技术路线或设计动机。';
  }
  if (/结果|实验|result|指标/i.test(title)) {
    return '用于支撑片段中明确出现的实验观察或结果。';
  }
  return (item.supports_zh || [])[0] || '用于支撑与片段直接一致的事实陈述。';
}

function buildDraftExpectedOutput(planType, mode) {
  if (mode === 'tools') return ['工具执行计划', '命令/文件风险说明', '用户确认后的执行步骤'];
  if (planType === 'literature-review') return ['主题化 related work 大纲', '带来源编号的局部草稿', 'research gap 列表'];
  if (planType === 'introduction') return ['背景-问题-gap-方法-贡献结构', '每段写作目标', '待确认贡献点'];
  return ['可审查写作大纲', '可复制草稿或修改建议', '引用和假设说明'];
}

function buildDraftPlanSummary(planType, sections, warnings) {
  const base = `${buildDraftPlanTitle(planType)}包含 ${sections.length} 个部分，适合先审结构再生成正文。`;
  return warnings.length ? `${base} 当前有 ${warnings.length} 个风险需要先确认。` : base;
}

function formatDraftPlanCopyText(plan) {
  return [
    '# 写作计划',
    `${plan.title_zh}：${plan.summary_zh}`,
    '',
    '# 计划步骤',
    ...(plan.sections || []).map(section => [
      `## ${section.id}. ${section.title_zh}`,
      `目标：${section.goal_zh}`,
      `证据使用：${section.evidenceUse_zh}`,
      ...(section.evidenceAssignments?.length
        ? [
          '证据分配：',
          ...section.evidenceAssignments.map(item => `- [${item.rank}] ${item.sourceLabel}：${item.use_zh} 限制：${item.caution_zh}`),
        ]
        : []),
      `约束：${section.constraints_zh}`,
    ].join('\n')),
    '',
    '# 预期输出',
    ...(plan.expectedOutput || []).map(item => `- ${item}`),
    '',
    '# 风险',
    ...(plan.warnings?.length ? plan.warnings.map(item => `- ${item}`) : ['- 暂无明显风险。']),
  ].join('\n');
}

function buildClarificationQuestion(key, detail) {
  const questions = {
    target_section_or_file: '这次要写作或修改哪一个章节/文件？',
    rag_documents_or_references: '这次回答可以使用哪些 PDF、BibTeX 或文献笔记作为证据？',
    paper_claims: '你的论文核心主张、贡献点和要解决的问题是什么？',
    experiment_results: '有哪些实验结果、指标或表格需要写进分析？',
    method_notes: '方法部分需要依赖哪些算法步骤、模型结构或符号定义？',
    references_bib: '引用整理要基于哪个 references.bib，或者需要补哪些条目？',
    reviewer_comments: '请粘贴需要回复的 reviewer comments、meta-review 或 decision letter。',
    venue_rules: '目标会议/期刊的页数、匿名、格式或 checklist 要求是什么？',
    figure_goal: '这张图要表达什么结论，读者看完应该记住什么？',
  };
  return questions[key] || `请补充：${detail.label_zh}`;
}

function buildClarificationPlaceholder(key) {
  const placeholders = {
    target_section_or_file: '例如：chapters/related_work.tex，或当前 introduction 段落。',
    rag_documents_or_references: '例如：使用最近上传的 12 篇 RAG 论文和 references.bib。',
    paper_claims: '例如：本文提出 X 方法，解决 Y 场景下 Z 问题，贡献是 A/B/C。',
    experiment_results: '例如：主表 Table 1、消融 Table 3、指标 F1/Acc/Latency。',
    method_notes: '例如：先检索候选，再用 reranker 排序，最后生成 grounded draft。',
    references_bib: '例如：项目根目录 references.bib，重点检查缺 DOI 的条目。',
    reviewer_comments: '例如：Reviewer 1 Comment 2: ... / Meta-review: ... / 我已有的回复草稿。',
    venue_rules: '例如：NeurIPS 9 页正文、匿名提交、必须包含 checklist。',
    figure_goal: '例如：展示方法比 baseline 更稳定，caption 强调跨数据集泛化。',
  };
  return placeholders[key] || '';
}

function dedupeClarificationQuestions(questions) {
  const seen = new Set();
  return questions.filter(question => {
    const key = question.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCitationPolicy({
  task,
  evidence,
  ragHealth,
  projectState,
}) {
  const lower = String(task || '').toLowerCase();
  const citationSensitive = /文献|证据|引用|参考文献|pdf|related work|literature|survey|citation|reference|bibtex|research gap|state of the art|sota/.test(lower);
  const hitCount = evidence?.results?.length || 0;
  const hasEvidenceLibrary = Boolean(projectState.hasRagDocuments || projectState.hasReferences);
  let status = 'not-required';
  let label_zh = '不需要引用约束';
  let message_zh = '当前任务不明显依赖文献引用，可以按普通写作或对话处理。';
  let allowUnsupportedClaims = true;

  if (citationSensitive && hitCount > 0) {
    status = 'grounded';
    label_zh = '可基于证据写作';
    message_zh = `当前命中 ${hitCount} 条 RAG 证据。写作时可以引用这些片段，但必须标注来源编号。`;
    allowUnsupportedClaims = false;
  } else if (citationSensitive && hasEvidenceLibrary) {
    status = 'needs-evidence';
    label_zh = '需要重新检索证据';
    message_zh = '任务需要文献证据，但本次检索没有命中。应先换关键词或补充资料，不要编造引用。';
    allowUnsupportedClaims = false;
  } else if (citationSensitive) {
    status = 'no-evidence';
    label_zh = '缺少引用证据';
    message_zh = '任务需要文献或引用支撑，但当前没有可用证据库。只能给结构建议，不能生成带具体引用的正文。';
    allowUnsupportedClaims = false;
  } else if (ragHealth?.status === 'unusable') {
    status = 'ungrounded';
    label_zh = '未使用证据';
    message_zh = '当前没有可用 RAG 证据。回答应明确这是一般建议，而不是基于项目文献的结论。';
  }

  return {
    status,
    label_zh,
    citationSensitive,
    allowUnsupportedClaims,
    evidenceCount: hitCount,
    message_zh,
    requiredBehaviors: buildCitationBehaviors(status),
    forbiddenBehaviors: buildCitationForbiddenBehaviors(status),
  };
}

function buildAcceptanceChecklist({
  taskRouting,
  contextReadiness,
  citationPolicy,
  evidence,
}) {
  const items = [];

  items.push({
    id: 'answer-scope',
    label_zh: '回答范围匹配任务',
    detail_zh: '输出必须直接回应用户任务，不要泛泛介绍无关背景。',
    severity: 'required',
    blocking: false,
  });

  if (taskRouting?.requiresConfirmation) {
    items.push({
      id: 'confirm-before-write',
      label_zh: '修改正文前先确认',
      detail_zh: '如果要改论文文件，必须先给建议、计划或 diff，不能直接覆盖正文。',
      severity: 'required',
      blocking: true,
    });
  }

  if (taskRouting?.mode === 'tools') {
    items.push({
      id: 'tool-call-transparency',
      label_zh: '工具执行透明',
      detail_zh: '运行脚本、编译 LaTeX、处理数据或写文件前，要说明命令、目标文件和风险。',
      severity: 'required',
      blocking: true,
    });
  }

  if (contextReadiness?.status === 'blocked') {
    items.push({
      id: 'missing-context-acknowledged',
      label_zh: '明确缺失上下文',
      detail_zh: '输出必须先指出还缺哪些关键上下文，并给出补齐步骤；不要假装资料齐全。',
      severity: 'required',
      blocking: true,
    });
  }

  if (citationPolicy?.citationSensitive) {
    items.push({
      id: 'citation-policy-followed',
      label_zh: '遵守引用安全规则',
      detail_zh: citationPolicy.message_zh,
      severity: 'required',
      blocking: !citationPolicy.allowUnsupportedClaims,
    });
  }

  if (citationPolicy?.status === 'grounded') {
    items.push({
      id: 'sources-numbered',
      label_zh: '事实陈述带来源编号',
      detail_zh: `使用 ${evidence?.results?.length || 0} 条 RAG 证据时，相关事实必须标注 [1]、[2] 等来源编号。`,
      severity: 'required',
      blocking: true,
    });
  }

  if (['needs-evidence', 'no-evidence'].includes(citationPolicy?.status)) {
    items.push({
      id: 'no-fake-citations',
      label_zh: '不得生成假引用正文',
      detail_zh: '没有命中证据时，只能给结构建议、检索关键词或待补证据清单。',
      severity: 'required',
      blocking: true,
    });
  }

  items.push({
    id: 'assumptions-separated',
    label_zh: '区分证据和推测',
    detail_zh: '把证据直接支持的内容、合理推测和需要用户确认的内容分开写。',
    severity: 'recommended',
    blocking: false,
  });

  return {
    status: items.some(item => item.blocking) ? 'strict' : 'normal',
    label_zh: items.some(item => item.blocking) ? '严格验收' : '常规验收',
    items,
  };
}

function buildWritingPrompt({
  task,
  taskRouting,
  recommendations,
  evidence,
  evidencePack,
  contextReadiness,
  clarificationQuestions,
  contextBrief,
  draftPlan,
  citationPolicy,
  acceptanceChecklist,
}) {
  const primarySkill = recommendations?.[0]?.skill;
  const evidenceText = formatEvidenceForPrompt(evidence);
  const missingContext = taskRouting?.missingContext || [];
  const missingDetails = taskRouting?.missingContextDetails || [];
  const nextActions = taskRouting?.nextActions || [];
  const sections = [
    ['论文写作任务', task || '(未提供任务)'],
    [
      '推荐执行模式',
      `${taskRouting?.modeLabel_zh || taskRouting?.mode || '未推荐'}${taskRouting?.requiresConfirmation ? '（需要确认修改）' : ''}`,
    ],
    [
      '推荐 Skill',
      primarySkill
        ? `${primarySkill.display_name_zh || primarySkill.display_name || primarySkill.name} (${primarySkill.subtitle_en || primarySkill.name})`
        : '暂无推荐 Skill',
    ],
    [
      'Skill 输入要求',
      primarySkill?.inputs?.length ? toBulletList(primarySkill.inputs) : '- 用户任务描述',
    ],
    [
      '期望输出',
      primarySkill?.outputs?.length ? toBulletList(primarySkill.outputs) : '- 结构化建议或草稿',
    ],
    [
      '可用 RAG 证据',
      evidenceText || '当前没有命中的 RAG 证据。不要编造引用；请先提示我补充文献或换关键词。',
    ],
    [
      '证据写作包',
      formatEvidencePackForPrompt(evidencePack),
    ],
    [
      '引用安全规则',
      [
        citationPolicy?.label_zh
          ? `${citationPolicy.label_zh}：${citationPolicy.message_zh || ''}`
          : '未评估',
        ...(citationPolicy?.requiredBehaviors || []).map(item => `- 必须：${item}`),
        ...(citationPolicy?.forbiddenBehaviors || []).map(item => `- 禁止：${item}`),
      ].join('\n'),
    ],
    [
      '上下文准备度',
      contextReadiness?.label_zh
        ? `${contextReadiness.label_zh}（${contextReadiness.score ?? 0} 分）：${contextReadiness.message_zh || ''}`
        : '未评估',
    ],
    [
      '当前上下文摘要',
      contextBrief?.copyText || '未生成上下文摘要。',
    ],
    [
      '写作计划',
      draftPlan?.copyText || '未生成写作计划。',
    ],
    [
      '缺失上下文',
      missingContext.length
        ? missingContext.map(key => {
          const detail = missingDetails.find(item => item.key === key);
          return `- ${detail?.label_zh || key}${detail?.help_zh ? `：${detail.help_zh}` : ''}`;
        }).join('\n')
        : '- 无',
    ],
    [
      '需要用户回答的问题',
      clarificationQuestions?.length
        ? clarificationQuestions.map(item => `- ${item.question_zh}${item.placeholder_zh ? `（示例：${item.placeholder_zh}）` : ''}`).join('\n')
        : '- 无需额外澄清。',
    ],
    [
      '下一步动作',
      nextActions.length
        ? nextActions.map(action => `- ${action.label_zh}${action.skill ? ` (${action.skill})` : ''}`).join('\n')
        : '- 直接开始回答',
    ],
    [
      '验收清单',
      acceptanceChecklist?.items?.length
        ? acceptanceChecklist.items.map(item => `- ${item.blocking ? '必须' : '建议'}：${item.label_zh}。${item.detail_zh || ''}`).join('\n')
        : '- 回答必须可审查、可追溯，并明确不确定性。',
    ],
    [
      '写作要求',
      [
        '- 使用证据时明确引用对应来源编号。',
        '- 区分证据支持的内容和推测内容。',
        '- 如果需要修改正文，先给出建议或 diff，不要直接覆盖文件。',
        '- 中文解释任务过程，论文正文可按任务需要使用英文或中英混合。',
      ].join('\n'),
    ],
  ];

  return {
    format: 'markdown',
    text: sections.map(([title, body]) => `# ${title}\n${body}`).join('\n\n'),
    sections: sections.map(([title, body]) => ({
      title_zh: title,
      body,
    })),
  };
}

function buildAiDraftRequest({
  projectId,
  task,
  evidenceQuery,
  taskRouting,
  recommendations,
  writingPrompt,
}) {
  const primarySkill = recommendations?.[0]?.skill;
  const mode = ['chat', 'agent', 'tools'].includes(taskRouting?.mode) ? taskRouting.mode : 'chat';
  const activeSkills = primarySkill?.name ? [primarySkill.name] : [];
  const conversation = {
    name: `Workbench · ${task ? task.slice(0, 36) : '论文任务'}`,
    context_scope: { type: 'free' },
    active_skills: activeSkills,
    mode,
  };
  const send = {
    projectId: projectId || undefined,
    projectPath: projectId ? `__paper_agent__:${projectId}` : undefined,
    userMessage: writingPrompt?.text || '',
    projectConfig: {
      global_skills: [],
      chapters: [],
      rag: { enabled: true, limit: 5 },
    },
    rag: {
      enabled: true,
      query: evidenceQuery || task || '',
      limit: 5,
    },
  };

  return {
    requiresExplicitUserAction: true,
    mode,
    active_skills: activeSkills,
    conversation,
    send,
    warnings: [
      '必须由用户点击后才创建会话和发送给 AI。',
      '发送前应展示引用安全、上下文准备度和验收清单。',
    ],
  };
}

function buildPaperWorkflowGuide(context) {
  const steps = [
    buildWorkflowTaskStep(context),
    buildWorkflowEvidenceStep(context),
    buildWorkflowContextStep(context),
    buildWorkflowSkillStep(context),
    buildWorkflowPlanStep(context),
    buildWorkflowDraftStep(context),
    buildWorkflowReviewStep(context),
  ];
  const currentStep = steps.find(step => ['blocked', 'needs-action', 'needs-review'].includes(step.status)) ||
    steps.find(step => step.status === 'pending') ||
    steps[steps.length - 1];
  const blockingCount = steps.filter(step => step.blocking).length;
  const readyCount = steps.filter(step => step.status === 'ready' || step.status === 'complete').length;
  const status = blockingCount
    ? 'blocked'
    : (steps.some(step => step.status === 'needs-review') ? 'needs-review' : 'ready');
  const guide = {
    version: 1,
    status,
    label_zh: {
      blocked: '先处理阻塞步骤',
      'needs-review': '可以生成但需审查',
      ready: '可以按流程写作',
    }[status],
    summary_zh: buildWorkflowGuideSummary(status, currentStep, readyCount, steps.length),
    currentStep: currentStep ? {
      id: currentStep.id,
      order: currentStep.order,
      title_zh: currentStep.title_zh,
      status: currentStep.status,
      action: currentStep.action,
    } : null,
    steps,
    copyText: '',
  };
  guide.copyText = formatPaperWorkflowGuideCopyText(guide);
  return guide;
}

function buildWorkflowTaskStep(context) {
  const starter = (context.taskStarters || []).find(item => !item.disabled) || (context.taskStarters || [])[0];
  const hasTask = Boolean(context.task);
  return {
    id: 'describe-task',
    order: 1,
    title_zh: '描述论文任务',
    subtitle_en: 'Task',
    status: hasTask ? 'ready' : 'needs-action',
    blocking: !hasTask,
    message_zh: hasTask
      ? `已识别任务：${context.task}`
      : '先用自然语言描述你要写、改、解释或执行的论文任务。',
    evidence_zh: context.task || '尚未输入任务。',
    action: hasTask
      ? { type: 'review-task', label_zh: '检查任务理解' }
      : { type: 'focus-task', label_zh: starter?.title_zh ? `从“${starter.title_zh}”开始` : '填写任务' },
    successCriteria_zh: '任务框里有明确的目标章节、输出类型或要解决的问题。',
  };
}

function buildWorkflowEvidenceStep(context) {
  const policy = context.citationPolicy || {};
  const repair = context.rag?.repairGuide || {};
  const evidenceCount = context.evidencePack?.evidenceCount || context.evidencePack?.items?.length || 0;
  const citationSensitive = Boolean(policy.citationSensitive);
  let status = 'ready';
  let blocking = false;
  let message = evidenceCount
    ? `已有 ${evidenceCount} 条可审查证据片段。`
    : '当前任务不强制依赖文献证据。';
  let action = evidenceCount
    ? { type: 'copy-evidence', label_zh: '查看证据包' }
    : { type: 'skip-evidence', label_zh: '继续普通写作' };

  if (['needs-repair', 'unusable'].includes(repair.status) || context.rag?.health?.status === 'unusable') {
    status = 'needs-action';
    blocking = citationSensitive;
    message = repair.message_zh || '证据库暂不可用，引用型写作前应先修复。';
    action = context.rag?.summary?.total
      ? { type: 'repair-rag', label_zh: '修复证据库' }
      : { type: 'upload-evidence', label_zh: '上传 PDF / BibTeX / 文献笔记' };
  } else if (['needs-evidence', 'no-evidence', 'missing-evidence'].includes(policy.status || context.evidencePack?.status)) {
    status = 'needs-action';
    blocking = true;
    message = policy.message_zh || '当前任务需要证据，但还没有可用命中。';
    action = context.rag?.summary?.total ? { type: 'search-evidence', label_zh: '换关键词检索证据' } : { type: 'upload-evidence', label_zh: '上传 PDF / BibTeX / 文献笔记' };
  }

  return {
    id: 'prepare-evidence',
    order: 2,
    title_zh: '准备 RAG 证据',
    subtitle_en: 'Evidence',
    status,
    blocking,
    message_zh: message,
    evidence_zh: `${context.rag?.summary?.total || 0} 个文档，${context.rag?.summary?.indexedChunks || 0} 个索引片段，${evidenceCount} 条当前命中。`,
    action,
    successCriteria_zh: citationSensitive
      ? '证据包里至少有一条可编号引用的片段，或已明确本轮只生成结构建议不写引用正文。'
      : '已确认本轮不依赖文献引用，或证据库状态可接受。',
  };
}

function buildWorkflowContextStep(context) {
  const readiness = context.contextReadiness || {};
  const blocked = readiness.status === 'blocked';
  const required = readiness.required || [];
  const missing = required.filter(item => item.status !== 'ready');
  return {
    id: 'confirm-context',
    order: 3,
    title_zh: '确认写作上下文',
    subtitle_en: 'Context',
    status: blocked ? 'needs-action' : (readiness.status === 'needs-context' ? 'needs-review' : 'ready'),
    blocking: blocked,
    message_zh: readiness.message_zh || '确认目标章节、论文主张和必要材料是否足够。',
    evidence_zh: missing.length
      ? `仍缺：${missing.map(item => item.label_zh || item.key).join('、')}。`
      : '关键上下文已满足或没有硬性缺口。',
    action: missing[0]?.action || { type: 'review-context', label_zh: blocked ? '补齐上下文' : '查看上下文摘要' },
    successCriteria_zh: '目标章节/文件、论文主张和任务必要材料已在上下文摘要中明确。',
  };
}

function buildWorkflowSkillStep(context) {
  const primary = context.skills?.decisionGuide?.primary;
  const hasSkill = Boolean(primary?.name);
  return {
    id: 'choose-skill',
    order: 4,
    title_zh: '选择合适 Skill',
    subtitle_en: 'Skill',
    status: hasSkill ? 'ready' : 'needs-review',
    blocking: false,
    message_zh: hasSkill
      ? `当前推荐“${primary.title_zh || primary.name}”，英文副标题为 ${primary.subtitle_en || primary.name}。`
      : '任务还不够具体，暂时没有明确首选 Skill。',
    evidence_zh: hasSkill ? `推荐理由：${(primary.why_zh || []).slice(0, 2).join('；')}` : '可以先从任务入口选择常见论文任务。',
    action: hasSkill
      ? { type: 'activate-skill', label_zh: `使用 ${primary.title_zh || primary.name}`, skill: primary.name }
      : { type: 'browse-skills', label_zh: '浏览 Skill 导航' },
    successCriteria_zh: '首选 Skill 与当前任务匹配，且用户已看过 Skill 对比，知道何时改选备选 Skill。',
  };
}

function buildWorkflowPlanStep(context) {
  const plan = context.draftPlan || {};
  return {
    id: 'review-plan',
    order: 5,
    title_zh: '审查写作计划',
    subtitle_en: 'Plan',
    status: plan.status === 'ready' ? 'ready' : 'needs-review',
    blocking: false,
    message_zh: plan.summary_zh || '先审结构、证据分配和风险，再生成正文。',
    evidence_zh: `${(plan.sections || []).length} 个计划步骤，${(plan.warnings || []).length} 条风险提示。`,
    action: { type: 'copy-draft-plan', label_zh: '复制写作计划' },
    successCriteria_zh: '段落目标、证据使用方式和不能扩展的结论已经清楚。',
  };
}

function buildWorkflowDraftStep(context) {
  const plan = context.interactionPlan || {};
  const blockedReasons = plan.blockedReasons || [];
  const blocked = blockedReasons.length > 0;
  return {
    id: 'draft-with-ai',
    order: 6,
    title_zh: '生成可审查草稿',
    subtitle_en: 'Draft',
    status: blocked ? 'blocked' : (plan.requiresConfirmation ? 'needs-review' : 'ready'),
    blocking: blocked,
    message_zh: blocked
      ? `还有 ${blockedReasons.length} 个阻塞项，先不要直接生成可采纳正文。`
      : `${plan.primaryCta_zh || '发送给 AI'}；${plan.requiresConfirmation ? '生成后必须人工确认。' : '可先进行普通对话。'}`,
    evidence_zh: blockedReasons.map(item => item.label_zh || item.code).join('、') || `模式：${plan.modeLabel_zh || plan.mode || 'chat'}。`,
    action: blocked
      ? (blockedReasons[0]?.code === 'missing-evidence' ? { type: 'upload-evidence', label_zh: '先补证据' } : { type: 'resolve-blocker', label_zh: '先处理阻塞项' })
      : { type: 'create-conversation-and-send', label_zh: plan.primaryCta_zh || '创建会话并发送' },
    successCriteria_zh: 'AI 只产出可审查草稿、建议或 diff；写文件和采纳引用事实前必须确认。',
  };
}

function buildWorkflowReviewStep(context) {
  const checklist = context.acceptanceChecklist || {};
  const blocking = (checklist.items || []).filter(item => item.blocking).length;
  return {
    id: 'review-output',
    order: 7,
    title_zh: '审查 AI 输出',
    subtitle_en: 'Review',
    status: 'pending',
    blocking: false,
    message_zh: 'AI 返回后，用输出审查检查来源编号、假引用、上下文缺口和确认门槛。',
    evidence_zh: `${(checklist.items || []).length} 项验收规则，其中 ${blocking} 项是阻塞项。`,
    action: { type: 'review-answer', label_zh: '审查当前输出' },
    successCriteria_zh: '输出通过验收清单；引用性事实都有证据编号，未知来源或假引用已修复。',
  };
}

function buildWorkflowGuideSummary(status, currentStep, readyCount, totalCount) {
  const progress = `${readyCount}/${totalCount} 步已就绪`;
  if (status === 'blocked') {
    return `${progress}。当前先处理“${currentStep?.title_zh || '阻塞步骤'}”，不要直接生成可采纳正文。`;
  }
  if (status === 'needs-review') {
    return `${progress}。可以继续，但建议先审查“${currentStep?.title_zh || '当前步骤'}”。`;
  }
  return `${progress}。可以按顺序生成草稿，并在采纳前审查输出。`;
}

function formatPaperWorkflowGuideCopyText(guide) {
  return [
    '# 论文写作流程向导',
    `${guide.label_zh}：${guide.summary_zh}`,
    '',
    '# 当前步骤',
    guide.currentStep
      ? `${guide.currentStep.order}. ${guide.currentStep.title_zh}（${guide.currentStep.status}）- ${guide.currentStep.action?.label_zh || '查看'}`
      : '无。',
    '',
    '# 全流程',
    ...(guide.steps || []).map(step => [
      `${step.order}. ${step.title_zh}（${step.status}${step.blocking ? '，阻塞' : ''}）`,
      `   - ${step.message_zh}`,
      `   - 证据：${step.evidence_zh}`,
      `   - 成功标准：${step.successCriteria_zh}`,
    ].join('\n')),
  ].join('\n');
}

function buildWorkbenchBundle(context) {
  const handoffGuide = buildWorkbenchHandoffGuide(context);
  const bundle = {
    version: 1,
    label_zh: '论文写作工作包',
    status: inferWorkbenchBundleStatus(context),
    generatedAt: new Date().toISOString(),
    task: context.task || '',
    mode: context.taskRouting?.mode || 'chat',
    modeLabel_zh: context.taskRouting?.modeLabel_zh || '',
    primarySkill: context.skills?.decisionGuide?.primary || null,
    counts: {
      evidence: context.evidencePack?.items?.length || 0,
      blockingChecklistItems: (context.acceptanceChecklist?.items || []).filter(item => item.blocking).length,
      clarificationQuestions: context.clarificationQuestions?.length || 0,
      repairSteps: context.rag?.repairGuide?.repairPlan?.steps?.length || 0,
      workflowSteps: context.paperWorkflowGuide?.steps?.length || 0,
    },
    handoffGuide,
    sections: buildWorkbenchBundleSections(context, handoffGuide),
    copyText: '',
    json: {},
  };
  bundle.copyText = formatWorkbenchBundleCopyText(bundle);
  bundle.json = buildWorkbenchBundleJson(bundle);
  return bundle;
}

function buildWorkbenchHandoffGuide(context) {
  const actionItems = (context.actionQueue?.actions || []).slice(0, 5).map((item, index) => ({
    id: item.id || `handoff-action-${index + 1}`,
    label_zh: item.label_zh || item.title_zh || item.action?.label_zh || item.action?.type || '处理下一步',
    detail_zh: item.reason_zh || item.detail_zh || item.source_zh || item.source || '',
    blocking: Boolean(item.blocking),
    actionType: item.action?.type || item.type || '',
  }));
  const blockers = [
    ...(context.agentReadiness?.blockers || []).map(item => ({
      id: item.id || item.code || 'agent-readiness-blocker',
      label_zh: item.label_zh || item.label || item.id || '生产可用性阻塞项',
      detail_zh: item.detail_zh || item.detail || '',
    })),
    ...(context.acceptanceChecklist?.items || [])
      .filter(item => item.blocking)
      .map(item => ({
        id: item.id || 'acceptance-blocker',
        label_zh: item.label_zh || item.id || '验收阻塞项',
        detail_zh: item.detail_zh || '',
      })),
  ].slice(0, 6);
  const runtimeProductionGates = Array.isArray(context.runtimeEnvironment?.productionGates)
    ? context.runtimeEnvironment.productionGates.filter(item => item && item.requiredForProduction)
    : [];
  const runtimeGateGaps = runtimeProductionGates.filter(item => item.status !== 'ready');
  const runtimeGateGapText = runtimeGateGaps
    .map(item => `${item.label_zh || item.id || '未命名 Gate'}（${item.status || 'unknown'}）`)
    .join('、');
  const runtimeGateSummary = runtimeProductionGates.length
    ? `运行环境能力：生产 Gate ${runtimeProductionGates.length - runtimeGateGaps.length}/${runtimeProductionGates.length} 通过${runtimeGateGaps.length ? `；未通过：${runtimeGateGapText}。` : '；全部已通过。'}`
    : (context.runtimeEnvironment?.copyText ? '运行环境能力：包含 OCR、PDF 文本抽取和浏览器 E2E 的生产验证缺口。' : '');
  const trustedMaterials = [
    context.contextBrief?.copyText ? '上下文摘要：可用于理解任务、目标章节和仍需澄清的问题。' : '',
    context.evidencePack?.items?.length ? `证据写作包：${context.evidencePack.items.length} 条证据；写引用性事实时只用这些编号。` : '',
    context.draftPlan?.copyText ? '写作计划：可用于审结构、证据分配和风险。' : '',
    context.skills?.decisionGuide?.primary ? `Skill 决策：首选 ${context.skills.decisionGuide.primary.title_zh || context.skills.decisionGuide.primary.name}。` : '',
    runtimeGateSummary,
  ].filter(Boolean);
  const forbiddenActions = Array.from(new Set([
    '不得读取、上传或复制被忽略的私密 papers/ 目录内容。',
    '不得自动写入、覆盖、移动或删除论文正文文件。',
    '不得在证据不足时生成带真实引用外观的正文。',
    '不得新增证据包之外的作者、年份、venue、DOI 或来源编号。',
    '不得跳过 AI 输出审查、单句证据检查和人工采纳指南。',
  ]));
  const continueWhen = [
    blockers.length ? '先处理交接阻塞项，再生成或采纳正文。' : '没有显式交接阻塞项；仍需按验收清单人工确认。',
    context.evidencePack?.status === 'ready'
      ? '引用性写作只能使用证据包中的来源编号。'
      : '先上传/检索/修复证据库，再写引用性正文。',
    runtimeGateGaps.length
      ? `生产发布前必须完成运行环境生产 Gate：${runtimeGateGaps.map(item => item.label_zh || item.id || '未命名 Gate').join('、')}。`
      : (runtimeProductionGates.length ? '生产发布前保留运行环境生产 Gate 验收输出。' : ''),
    !runtimeProductionGates.length && context.runtimeEnvironment?.browserE2eCapability?.requiredBeforeProduction
      ? '生产发布前必须完成真实浏览器 E2E 预检。'
      : '',
  ].filter(Boolean);
  const guide = {
    status: blockers.length || actionItems.some(item => item.blocking) ? 'needs-handoff-action' : 'ready',
    label_zh: blockers.length || actionItems.some(item => item.blocking) ? '接手前先处理阻塞项' : '可交接继续',
    summary_zh: blockers.length
      ? `交接包包含 ${blockers.length} 个阻塞项；接手者应先处理阻塞，再生成或采纳正文。`
      : '交接包已整理当前任务、证据、Skill、模式、工作流和验收边界；接手者可按下一步继续。',
    nextActions: actionItems,
    blockers,
    trustedMaterials,
    forbiddenActions,
    continueWhen,
    copyText: '',
  };
  guide.copyText = formatWorkbenchHandoffGuideCopyText(guide);
  return guide;
}

function formatWorkbenchHandoffGuideCopyText(guide) {
  return [
    '# 工作包交接指南',
    `${guide.label_zh}（${guide.status}）`,
    guide.summary_zh,
    '',
    '# 接手后先做',
    ...(guide.nextActions.length
      ? guide.nextActions.map((item, index) => `${index + 1}. ${item.label_zh}${item.blocking ? '（阻塞）' : ''}${item.detail_zh ? `：${item.detail_zh}` : ''}`)
      : ['- 暂无显式下一步动作。']),
    '',
    '# 阻塞项',
    ...(guide.blockers.length
      ? guide.blockers.map(item => `- ${item.label_zh}${item.detail_zh ? `：${item.detail_zh}` : ''}`)
      : ['- 无显式阻塞项；仍需人工终审。']),
    '',
    '# 可信材料',
    ...(guide.trustedMaterials.length ? guide.trustedMaterials.map(item => `- ${item}`) : ['- 暂无可用材料摘要。']),
    '',
    '# 禁止动作',
    ...guide.forbiddenActions.map(item => `- ${item}`),
    '',
    '# 继续条件',
    ...guide.continueWhen.map(item => `- ${item}`),
  ].join('\n');
}

function inferWorkbenchBundleStatus(context) {
  if (context.contextReadiness?.status === 'blocked') return 'needs-context';
  if (['needs-repair', 'unusable'].includes(context.rag?.repairGuide?.status) || context.rag?.health?.status === 'unusable') return 'needs-rag-repair';
  if (['needs-evidence', 'no-evidence', 'missing-evidence'].includes(context.citationPolicy?.status || context.evidencePack?.status)) return 'needs-evidence';
  if (context.acceptanceChecklist?.items?.some(item => item.blocking)) return 'needs-confirmation';
  return 'ready';
}

function buildWorkbenchBundleSections(context, handoffGuide = {}) {
  return [
    {
      id: 'handoff-guide',
      title_zh: '工作包交接指南',
      status: handoffGuide.status || 'unknown',
      text: handoffGuide.copyText || '',
    },
    {
      id: 'agent-readiness',
      title_zh: 'Paper Agent 生产可用性',
      status: context.agentReadiness?.status || 'unknown',
      text: context.agentReadiness?.copyText || '',
    },
    {
      id: 'runtime-environment',
      title_zh: '运行环境能力',
      status: context.runtimeEnvironment?.status || 'unknown',
      text: context.runtimeEnvironment?.copyText || '',
    },
    {
      id: 'paper-workflow',
      title_zh: '论文写作流程',
      status: context.paperWorkflowGuide?.status || 'unknown',
      text: context.paperWorkflowGuide?.copyText || '',
    },
    {
      id: 'context-brief',
      title_zh: '上下文摘要',
      status: context.contextBrief?.status || 'unknown',
      text: context.contextBrief?.copyText || '',
    },
    {
      id: 'skill-decision',
      title_zh: 'Skill 决策',
      status: context.skills?.decisionGuide?.status || 'unknown',
      text: context.skills?.decisionGuide?.copyText || '',
    },
    {
      id: 'skill-compare',
      title_zh: 'Skill 对比',
      status: context.skills?.compareGuide?.status || 'unknown',
      text: context.skills?.compareGuide?.copyText || '',
    },
    {
      id: 'mode-action-center',
      title_zh: '模式操作中心',
      status: context.modeActionCenter?.status || 'unknown',
      text: context.modeActionCenter?.copyText || '',
    },
    {
      id: 'action-queue',
      title_zh: '下一步操作队列',
      status: context.actionQueue?.status || 'unknown',
      text: context.actionQueue?.copyText || '',
    },
    {
      id: 'rag-repair',
      title_zh: '证据库修复计划',
      status: context.rag?.repairGuide?.status || 'clear',
      text: context.rag?.repairGuide?.copyText || '',
    },
    {
      id: 'evidence-pack',
      title_zh: '证据写作包',
      status: context.evidencePack?.status || 'not-required',
      text: context.evidencePack?.copyText || '',
    },
    {
      id: 'draft-plan',
      title_zh: '写作计划',
      status: context.draftPlan?.status || 'unknown',
      text: context.draftPlan?.copyText || '',
    },
    {
      id: 'acceptance-checklist',
      title_zh: '验收清单',
      status: context.acceptanceChecklist?.status || 'unknown',
      text: formatAcceptanceChecklistCopyText(context.acceptanceChecklist),
    },
    {
      id: 'ai-prompt',
      title_zh: '发送给 AI 的提示词',
      status: context.writingPrompt?.text ? 'ready' : 'empty',
      text: context.writingPrompt?.text || '',
    },
  ];
}

function formatAcceptanceChecklistCopyText(checklist = {}) {
  return [
    '# 验收清单',
    `${checklist.label_zh || checklist.status || '未评估'}`,
    '',
    ...((checklist.items || []).map(item => `- ${item.blocking ? '必须' : '建议'}：${item.label_zh || item.id}。${item.detail_zh || ''}`)),
  ].join('\n');
}

function formatWorkbenchBundleCopyText(bundle) {
  return [
    '# 论文写作工作包',
    `状态：${bundle.status}`,
    `任务：${bundle.task || '(未提供)'}`,
    `模式：${bundle.modeLabel_zh || bundle.mode}`,
    bundle.primarySkill ? `首选 Skill：${bundle.primarySkill.title_zh} (${bundle.primarySkill.subtitle_en})` : '首选 Skill：暂无',
    `证据数：${bundle.counts.evidence}`,
    `阻塞验收项：${bundle.counts.blockingChecklistItems}`,
    `仍需澄清：${bundle.counts.clarificationQuestions}`,
    `证据库修复步骤：${bundle.counts.repairSteps}`,
    '',
    bundle.handoffGuide?.copyText || '',
    '',
    ...(bundle.sections || []).map(section => [
      `# ${section.title_zh}`,
      `状态：${section.status}`,
      section.text || '无。',
    ].join('\n')),
  ].join('\n\n');
}

function buildWorkbenchBundleJson(bundle) {
  return {
    version: bundle.version,
    status: bundle.status,
    task: bundle.task,
    mode: bundle.mode,
    modeLabel_zh: bundle.modeLabel_zh,
    primarySkill: bundle.primarySkill ? {
      name: bundle.primarySkill.name,
      title_zh: bundle.primarySkill.title_zh,
      subtitle_en: bundle.primarySkill.subtitle_en,
    } : null,
    counts: bundle.counts,
    handoffGuide: bundle.handoffGuide ? {
      status: bundle.handoffGuide.status,
      label_zh: bundle.handoffGuide.label_zh,
      blockerCount: bundle.handoffGuide.blockers?.length || 0,
      nextActionCount: bundle.handoffGuide.nextActions?.length || 0,
    } : null,
    sections: (bundle.sections || []).map(section => ({
      id: section.id,
      title_zh: section.title_zh,
      status: section.status,
      hasText: Boolean(section.text),
    })),
  };
}

function buildInteractionPlan({
  task,
  taskRouting,
  contextReadiness,
  citationPolicy,
  acceptanceChecklist,
  recommendations,
  evidence,
}) {
  const mode = ['chat', 'agent', 'tools'].includes(taskRouting?.mode) ? taskRouting.mode : 'chat';
  const primarySkill = recommendations?.[0]?.skill || null;
  const blockingItems = acceptanceChecklist?.items?.filter(item => item.blocking) || [];
  const blockedReasons = [];
  if (contextReadiness?.status === 'blocked') {
    blockedReasons.push({
      code: 'missing-context',
      label_zh: '缺少关键上下文',
      detail_zh: contextReadiness.message_zh,
    });
  }
  if (['needs-evidence', 'no-evidence'].includes(citationPolicy?.status)) {
    blockedReasons.push({
      code: 'missing-evidence',
      label_zh: citationPolicy.label_zh,
      detail_zh: citationPolicy.message_zh,
    });
  }

  const base = {
    mode,
    modeLabel_zh: taskRouting?.modeLabel_zh || mode,
    primarySkill: primarySkill ? {
      name: primarySkill.name,
      display_name_zh: primarySkill.display_name_zh || primarySkill.display_name || primarySkill.name,
      subtitle_en: primarySkill.subtitle_en || primarySkill.name,
    } : null,
    primaryCta_zh: '发送给 AI',
    requiresExplicitUserAction: true,
    requiresConfirmation: Boolean(taskRouting?.requiresConfirmation || blockingItems.length > 0),
    confirmationRequiredBefore: [],
    blockedReasons,
    visibleWarnings: [],
    steps: [],
    outputPreview: {
      title_zh: '预期输出',
      items: [],
    },
    forbiddenActions: [
      '不得自动覆盖论文正文文件。',
      '不得编造引用、作者、年份、DOI 或会议名称。',
    ],
  };

  if (mode === 'chat') {
    base.primaryCta_zh = '用对话解释/梳理';
    base.requiresConfirmation = false;
    base.steps = [
      {
        id: 'read-question',
        label_zh: '理解问题',
        detail_zh: '先判断用户是在解释、总结、评价还是澄清论文内容。',
        status: 'ready',
      },
      {
        id: 'answer-with-scope',
        label_zh: '按范围回答',
        detail_zh: citationPolicy?.citationSensitive
          ? '如果涉及文献事实，只使用已命中的 RAG 证据；没有证据时明确说明。'
          : '直接给出结构化解释、建议或问题清单。',
        status: evidence?.results?.length ? 'ready' : 'needs-attention',
      },
    ];
    base.outputPreview.items = [
      '结构化解释或建议',
      '证据和推测分开',
      '需要用户补充的信息清单',
    ];
  } else if (mode === 'agent') {
    base.primaryCta_zh = primarySkill
      ? `用 ${primarySkill.display_name_zh || primarySkill.name} 生成建议`
      : '生成写作建议';
    base.confirmationRequiredBefore = [
      '写入或覆盖任何论文正文文件',
      '采纳 AI 生成的引用性事实陈述',
      '把草稿合并到正式章节',
    ];
    base.visibleWarnings = [
      'Agent 模式应先给结构建议、草稿或 diff，不应直接覆盖文件。',
      '如果上下文准备度为 blocked，应先补上下文再采纳正文修改。',
    ];
    base.steps = [
      {
        id: 'collect-context',
        label_zh: '检查上下文',
        detail_zh: contextReadiness?.message_zh || '确认目标章节、论文主张、证据和引用要求是否足够。',
        status: contextReadiness?.status === 'blocked' ? 'blocked' : 'ready',
      },
      {
        id: 'draft-with-evidence',
        label_zh: '生成可审查草稿',
        detail_zh: citationPolicy?.message_zh || '生成前明确哪些内容来自证据，哪些是推测。',
        status: citationPolicy?.allowUnsupportedClaims === false && !evidence?.results?.length ? 'blocked' : 'ready',
      },
      {
        id: 'review-before-apply',
        label_zh: '用户确认后再应用',
        detail_zh: '展示草稿、修改建议或 diff；用户确认前不写入正文文件。',
        status: 'requires-confirmation',
      },
    ];
    base.outputPreview.items = [
      '章节结构建议',
      '可复制草稿或 diff',
      '来源编号和引用安全说明',
      '缺失上下文清单',
    ];
  } else {
    base.primaryCta_zh = '生成工具执行计划';
    base.confirmationRequiredBefore = [
      '运行脚本、编译 LaTeX 或调用外部命令',
      '写入、删除、覆盖或移动任何文件',
      '读取可能包含私密论文原文的路径',
    ];
    base.visibleWarnings = [
      'Tools 模式必须先展示命令、目标文件和风险。',
      '涉及论文文件或实验数据时，先给 dry-run 或计划，不直接执行破坏性操作。',
    ];
    base.steps = [
      {
        id: 'plan-tool-call',
        label_zh: '列出工具计划',
        detail_zh: '说明将运行什么命令、读取哪些输入、输出到哪里。',
        status: 'ready',
      },
      {
        id: 'confirm-risk',
        label_zh: '确认风险',
        detail_zh: '用户确认前不执行写文件、删除文件、编译或脚本运行。',
        status: 'requires-confirmation',
      },
      {
        id: 'execute-and-report',
        label_zh: '执行并报告证据',
        detail_zh: '执行后展示命令结果、生成文件、错误和下一步。',
        status: 'pending-confirmation',
      },
    ];
    base.outputPreview.items = [
      '命令计划',
      '风险说明',
      '执行结果摘要',
      '失败后的恢复建议',
    ];
  }

  if (blockedReasons.length > 0) {
    base.visibleWarnings.unshift('当前存在阻塞项，建议先完成补资料或重新检索，再生成可采纳正文。');
  }

  return base;
}

function buildEvidencePack({ task, evidence, citationPolicy }) {
  const results = evidence?.results || [];
  const items = results.map(result => {
    const source = result.source || {};
    const sourceLabel = formatSourceLabel(result);
    const rank = result.rank || results.indexOf(result) + 1;
    const snippet = result.text || '';
    const supports = inferEvidenceSupport(task, snippet);
    const notFor = [
      '不能当作未命中文献的引用来源',
      '不能推导作者、年份、会议或 DOI，除非片段中明确出现',
      '不能支持超出片段内容的实验结论',
    ];
    return {
      id: `E${rank}`,
      rank,
      sourceLabel,
      source: {
        path: source.path || '',
        title: source.title || '',
        lineStart: source.lineStart || null,
        lineEnd: source.lineEnd || null,
      },
      score: result.score || 0,
      snippet,
      quality: buildEvidenceItemQuality({ rank, score: result.score || 0, snippet, source, supports_zh: supports, notFor }),
      supports_zh: supports,
      useFor: [
        'related work 中的事实性陈述',
        'research gap 或局限性讨论',
        '引言里对现有工作的概括',
      ],
      notFor,
      citationInstruction_zh: `使用该片段时标注 [${rank}]，并保留来源路径以便审查。`,
    };
  });

  const status = items.length > 0
    ? 'ready'
    : (citationPolicy?.citationSensitive ? 'missing-evidence' : 'not-required');
  const coverage = buildEvidenceCoverage(items, citationPolicy);
  const expansionPlan = buildEvidenceExpansionPlan({
    task,
    items,
    coverage,
    citationPolicy,
    query: evidence?.query || '',
  });
  const pack = {
    status,
    label_zh: {
      ready: '证据包可用',
      'missing-evidence': '缺少证据包',
      'not-required': '当前任务不需要证据包',
    }[status],
    query: evidence?.query || '',
    fingerprint: buildEvidencePackFingerprint({ query: evidence?.query || '', items }),
    evidenceCount: items.length,
    citationSensitive: Boolean(citationPolicy?.citationSensitive),
    message_zh: buildEvidencePackMessage(status, items.length, citationPolicy),
    coverage,
    expansionPlan,
    items,
    rules: [
      '只使用证据包中出现的来源编号。',
      '每个事实性文献陈述都应能追溯到对应片段。',
      '把证据直接支持的内容和基于证据的推测分开写。',
      coverage.guidance_zh,
      '没有命中证据时，不要生成带真实引用外观的 related work 正文。',
    ],
    copyText: '',
    fallbackActions: items.length > 0 ? [] : [
      { type: 'upload-evidence', label_zh: '上传更多 PDF / BibTeX / 文献笔记' },
      { type: 'refine-query', label_zh: '换关键词重新检索' },
    ],
  };
  pack.copyText = formatEvidencePackCopyText(pack);
  return pack;
}

function buildEvidencePackFingerprint({ query = '', items = [] } = {}) {
  const payload = {
    query: String(query || ''),
    items: (items || []).map(item => ({
      rank: item.rank,
      sourcePath: item.source?.path || '',
      lineStart: item.source?.lineStart || null,
      lineEnd: item.source?.lineEnd || null,
      snippet: item.snippet || '',
    })),
  };
  return crypto.createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 16);
}

function buildEvidencePackDriftFinding({ expectedFingerprint, evidencePack } = {}) {
  const expected = String(expectedFingerprint || '').trim();
  if (!expected) return null;
  const current = String(evidencePack?.fingerprint || '').trim();
  if (current && current === expected) return null;
  return {
    id: 'evidence-pack-drift',
    severity: 'high',
    label_zh: '证据包已变化',
    detail_zh: current
      ? `生成草稿时的证据包指纹是 ${expected}，当前证据包指纹是 ${current}。来源编号 [1]、[2] 可能已经指向不同片段，请重新生成证据包并重新审查。`
      : `生成草稿时的证据包指纹是 ${expected}，但当前没有可验证的证据包指纹。请重新生成证据包并重新审查。`,
    blocking: true,
  };
}

function buildEvidenceItemQuality({ rank, score, snippet, source, supports_zh, notFor }) {
  const text = String(snippet || '').trim();
  const hasSourcePath = Boolean(source?.path);
  const hasLine = Boolean(source?.lineStart || source?.lineEnd);
  const hasBibliographicSignal = /\b\d{4}\b|\bdoi\b|\barxiv\b|\bneurips\b|\bicml\b|\biclr\b|\bacl\b|\bemnlp\b|\bcvpr\b|\bieee\b|\bacm\b|et al\./i.test(text);
  const tooShort = text.length < 80;
  const scoreValue = Number(score || 0);
  let level = 'medium';
  let score_100 = 65;
  const warnings = [];

  if (scoreValue >= 3 && text.length >= 120 && hasSourcePath) {
    level = 'high';
    score_100 = 85;
  }
  if (scoreValue < 1.5 || tooShort || !hasSourcePath) {
    level = 'low';
    score_100 = 45;
  }
  if (!hasLine) warnings.push('来源没有行号，采纳前建议回到原文核对。');
  if (tooShort) warnings.push('片段较短，只适合支撑非常局部的表述。');
  if (!hasBibliographicSignal) warnings.push('片段未明确给出作者/年份/venue/DOI，不能补写这些信息。');

  return {
    level,
    label_zh: {
      high: '可直接用于局部引用',
      medium: '可用于草稿，采纳前核对',
      low: '只能作为线索',
    }[level],
    score_100,
    directQuoteSafe: level === 'high' && hasLine,
    claimTemplate_zh: `可写成“证据 [${rank}] 显示：${firstText(supports_zh) || '该片段支持与原文一致的局部事实'}”。`,
    warnings_zh: warnings,
    recommendedUse_zh: level === 'low'
      ? '先回到原文或补充更完整片段，再写入正式 related work。'
      : '可以用于草稿中的局部事实陈述，但采纳前仍需核对原文。',
    mustNotUseFor_zh: (notFor || []).slice(0, 3),
  };
}

function buildEvidencePackMessage(status, count, citationPolicy) {
  if (status === 'ready') {
    return `当前证据包包含 ${count} 条可追溯片段。写作时必须按 [1]、[2] 标注来源。`;
  }
  if (status === 'missing-evidence') {
    return citationPolicy?.message_zh || '当前任务需要文献证据，但没有命中片段。请先上传资料或换关键词。';
  }
  return '当前任务不明显依赖文献引用，可以不生成证据包。';
}

function buildEvidenceCoverage(items, citationPolicy) {
  const sourceMap = new Map();
  for (const item of items || []) {
    const key = item.source?.path || item.sourceLabel || item.id;
    const current = sourceMap.get(key) || {
      path: item.source?.path || '',
      title: item.source?.title || item.sourceLabel || key,
      count: 0,
      ranks: [],
      maxScore: 0,
    };
    current.count += 1;
    current.ranks.push(item.rank);
    current.maxScore = Math.max(current.maxScore, Number(item.score || 0));
    sourceMap.set(key, current);
  }

  const sources = Array.from(sourceMap.values())
    .sort((a, b) => b.count - a.count || b.maxScore - a.maxScore)
    .map(source => ({
      ...source,
      ranks: source.ranks.sort((a, b) => a - b),
      share: items.length ? Number((source.count / items.length).toFixed(2)) : 0,
    }));

  const sourceCount = sources.length;
  const evidenceCount = items.length;
  const topSourceShare = sources[0]?.share || 0;
  const warnings = [];
  let status = 'none';
  let label_zh = '没有证据覆盖';
  let guidance_zh = '当前没有可用证据。先上传资料或换关键词，再生成文献性正文。';

  if (evidenceCount > 0) {
    status = 'balanced';
    label_zh = '覆盖较均衡';
    guidance_zh = '可以基于这些来源写短段落，但仍要逐条标注来源编号。';
  }

  if (evidenceCount > 0 && sourceCount === 1 && citationPolicy?.citationSensitive) {
    status = 'single-source';
    label_zh = '来源过少';
    warnings.push('当前所有证据都来自同一个来源，不适合直接写成完整 related work。');
    guidance_zh = '建议继续检索或上传更多文献；若继续写作，应明确这是单一来源支持的局部观点。';
  } else if (evidenceCount > 2 && topSourceShare >= 0.75) {
    status = 'concentrated';
    label_zh = '证据过于集中';
    warnings.push('多数证据来自同一个来源，可能导致综述覆盖面不足。');
    guidance_zh = '建议换关键词补充不同论文或不同主题的证据，再写综合性 related work。';
  } else if (evidenceCount > 0 && sourceCount < Math.min(3, evidenceCount) && citationPolicy?.citationSensitive) {
    status = 'thin';
    label_zh = '覆盖偏薄';
    warnings.push('可用来源数量偏少，适合写局部观点，不适合直接写完整综述。');
    guidance_zh = '可以先生成大纲或局部草稿；完整 related work 建议补充更多来源。';
  }

  return {
    status,
    label_zh,
    evidenceCount,
    sourceCount,
    topSourceShare,
    sources,
    warnings,
    guidance_zh,
  };
}

function buildEvidenceExpansionPlan({ task, items, coverage, citationPolicy, query }) {
  const citationSensitive = Boolean(citationPolicy?.citationSensitive);
  const needsExpansion = citationSensitive && (
    !items.length ||
    ['single-source', 'concentrated', 'thin', 'none'].includes(coverage?.status)
  );
  const keywords = extractExpansionKeywords([task, query, ...(items || []).map(item => item.snippet)].join('\n'));
  const baseQuery = keywords.slice(0, 4).join(' ') || String(query || task || '').trim() || 'paper topic';
  const queries = [
    `${baseQuery} survey related work`,
    `${baseQuery} benchmark comparison`,
    `${baseQuery} limitation research gap`,
  ];
  if (/method|方法|模型|algorithm|framework/i.test(`${task} ${query}`)) {
    queries.push(`${baseQuery} method comparison ablation`);
  }
  if (/dataset|数据|experiment|实验|result|结果/i.test(`${task} ${query}`)) {
    queries.push(`${baseQuery} dataset experiment results`);
  }

  const missingSourceTypes = [];
  if (!items.length) {
    missingSourceTypes.push('至少 3 篇与任务主题直接相关的论文或文献笔记。');
  }
  if ((coverage?.sourceCount || 0) < 3 && citationSensitive) {
    missingSourceTypes.push('不同作者或不同方法路线的代表性工作。');
  }
  if (/gap|research gap|局限|不足|空白/i.test(`${task} ${query}`)) {
    missingSourceTypes.push('明确讨论 limitation、open problem 或 future work 的片段。');
  }
  if (/related work|literature|survey|文献|相关工作/i.test(`${task} ${query}`)) {
    missingSourceTypes.push('综述型论文、基准论文或相邻方向的对比论文。');
  }

  const plan = {
    status: needsExpansion ? 'recommended' : 'optional',
    label_zh: needsExpansion ? '建议补充证据' : '可选补充证据',
    reason_zh: needsExpansion
      ? '当前证据不足以稳妥支撑完整文献性正文，建议先补充不同来源或不同主题的证据。'
      : '当前证据可支撑短段落写作；若要写完整 related work，可继续补充更多来源。',
    suggestedQueries: Array.from(new Set(queries)).slice(0, 5),
    missingSourceTypes: Array.from(new Set(missingSourceTypes)).slice(0, 5),
    actions: [
      { type: 'search-evidence', label_zh: '用建议关键词检索证据库' },
      { type: 'upload-evidence', label_zh: '上传补充文献或笔记' },
      { type: 'copy-expansion-plan', label_zh: '复制补证据计划' },
    ],
    copyText: '',
  };
  plan.copyText = formatEvidenceExpansionPlanCopyText(plan, coverage);
  return plan;
}

function formatEvidenceExpansionPlanCopyText(plan, coverage = {}) {
  return [
    '# 补证据计划',
    `${plan.label_zh || plan.status}（${plan.status}）`,
    plan.reason_zh || '',
    '',
    '# 当前覆盖度',
    coverage?.label_zh
      ? `${coverage.label_zh}：${coverage.sourceCount || 0} 个来源 / ${coverage.evidenceCount || 0} 条片段，最高单一来源占比 ${Math.round((coverage.topSourceShare || 0) * 100)}%。`
      : '尚未形成可用证据覆盖度。',
    coverage?.guidance_zh || '',
    ...(coverage?.warnings || []).map(warning => `警告：${warning}`),
    '',
    '# 建议检索词',
    ...((plan.suggestedQueries || []).length
      ? plan.suggestedQueries.map(query => `- ${query}`)
      : ['- 先补充论文主题、方法名、数据集名或 research gap 关键词。']),
    '',
    '# 建议补充的来源类型',
    ...((plan.missingSourceTypes || []).length
      ? plan.missingSourceTypes.map(item => `- ${item}`)
      : ['- 补充不同作者、不同方法路线或不同实验设置的代表性论文。']),
    '',
    '# 使用边界',
    '- 补证据前，只能把当前命中写成局部观点或待核对草稿。',
    '- 完整 related work、领域趋势或强综述结论需要多个独立来源支撑。',
  ].filter(line => line !== undefined && line !== null).join('\n');
}

function buildRagQueryAssistant({ task, evidence, evidencePack, ragSummary, ragHealth, repairGuide }) {
  const query = String(evidence?.query || task || '').trim();
  const results = evidence?.results || [];
  const expansionPlan = evidencePack?.expansionPlan || {};
  const hasDocuments = Number(ragSummary?.total || 0) > 0;
  const hasIndexedText = Number(ragSummary?.indexedChunks || 0) > 0;
  const hasHits = results.length > 0;
  const needsRepair = ['unusable', 'needs-repair'].includes(ragHealth?.status) || repairGuide?.status === 'needs-repair';
  let status = 'ready';
  let label = '可以继续检索';
  let message = '当前已有命中证据；如果要写完整文献段落，建议继续用更窄的问题补充不同来源。';

  if (!hasDocuments) {
    status = 'needs-upload';
    label = '先上传文献';
    message = '证据库为空，检索关键词不会产生可引用片段。请先上传 PDF、BibTeX 或 Markdown 文献笔记。';
  } else if (!hasIndexedText || needsRepair) {
    status = 'needs-repair';
    label = '先修复文档解析';
    message = '证据库里缺少可检索正文，或有文档解析失败。先修复解析问题，再用关键词检索。';
  } else if (!hasHits && query) {
    status = 'no-hit';
    label = '换一组检索问题';
    message = '已经检索证据库，但没有命中片段。建议改成更具体的主题词、方法词或英文关键词。';
  } else if (!query) {
    status = 'needs-query';
    label = '先写检索问题';
    message = '填写论文任务或检索问题后，我会给出更适合当前任务的 RAG 查询。';
  } else if (evidencePack?.coverage && ['single-source', 'concentrated', 'thin'].includes(evidencePack.coverage.status)) {
    status = 'can-improve';
    label = '建议扩展证据';
    message = evidencePack.coverage.guidance_zh || message;
  }

  const suggestedQueries = Array.from(new Set([
    ...(expansionPlan.suggestedQueries || []),
    ...buildFallbackRagQueries(task, query),
  ])).filter(Boolean).slice(0, 6);

  const steps = [
    {
      id: 'make-query-specific',
      label_zh: '把检索词写成具体论文问题',
      detail_zh: '优先包含方法名、任务场景、数据集、指标或局限性，而不是只写“related work”。',
      action: { type: 'refine-query', label_zh: '使用推荐检索词' },
    },
    {
      id: 'check-document-readiness',
      label_zh: '确认文档有正文片段',
      detail_zh: '只有 chunks > 0 的文档才能在写作时作为可追溯证据。',
      action: hasIndexedText
        ? { type: 'search-evidence', label_zh: '继续检索证据' }
        : { type: 'repair-rag', label_zh: '修复 PDF 解析或补笔记' },
    },
    {
      id: 'broaden-sources',
      label_zh: '补不同来源',
      detail_zh: '完整 related work 至少需要不同作者、不同方法路线或不同主题的片段，避免单一来源综述。',
      action: { type: 'upload-evidence', label_zh: '上传补充文献' },
    },
  ];

  const guide = {
    status,
    label_zh: label,
    query,
    message_zh: message,
    evidenceCount: results.length,
    indexedChunks: Number(ragSummary?.indexedChunks || 0),
    suggestedQueries,
    missingSourceTypes: expansionPlan.missingSourceTypes || [],
    steps,
    actions: [
      status === 'needs-upload'
        ? { type: 'upload-evidence', label_zh: '上传 PDF / BibTeX / Markdown 笔记' }
        : { type: 'search-evidence', label_zh: '用推荐关键词检索' },
      { type: 'copy-query-plan', label_zh: '复制检索计划' },
    ],
    copyText: '',
  };
  guide.copyText = formatRagQueryAssistantCopyText(guide);
  return guide;
}

function buildFallbackRagQueries(task, query) {
  const keywords = extractExpansionKeywords(`${task || ''}\n${query || ''}`);
  const base = keywords.slice(0, 4).join(' ') || String(task || query || '').trim();
  if (!base) return [];
  return [
    `${base} related work`,
    `${base} limitation gap`,
    `${base} method comparison`,
  ];
}

function buildRagQueryRewriteGuide({ task, evidence, evidencePack, ragSummary, queryAssistant }) {
  const query = String(evidence?.query || task || '').trim();
  const results = evidence?.results || [];
  const coverage = evidencePack?.coverage || {};
  const keywords = extractExpansionKeywords([
    task,
    query,
    ...(results || []).map(item => item.text || ''),
  ].join('\n'));
  const base = keywords.slice(0, 4).join(' ') || query || 'paper topic';
  const needsRewrite = !results.length || ['single-source', 'concentrated', 'thin', 'none'].includes(coverage.status);
  const groups = [
    buildQueryRewriteGroup({
      id: 'topic-scope',
      label_zh: '主题范围',
      purpose_zh: '先扩大相邻主题，找到更多可用于 related work 的候选文献片段。',
      queries: [`${base} related work`, `${base} survey`, `${base} taxonomy overview`],
    }),
    buildQueryRewriteGroup({
      id: 'method-comparison',
      label_zh: '方法对比',
      purpose_zh: '用于找不同方法路线、baseline 或技术差异，避免只综述单一路线。',
      queries: [`${base} method comparison`, `${base} baseline comparison`, `${base} approach benchmark`],
    }),
    buildQueryRewriteGroup({
      id: 'limitation-gap',
      label_zh: '局限与 Gap',
      purpose_zh: '用于写 research gap、limitation、open problem 或 future work。',
      queries: [`${base} limitation research gap`, `${base} open problem future work`, `${base} challenge limitation`],
    }),
    buildQueryRewriteGroup({
      id: 'experiment-result',
      label_zh: '实验与结果',
      purpose_zh: '只有当任务涉及实验、指标或结果讨论时使用；命中后仍要核对片段是否真的包含结果。',
      queries: [`${base} experiment result`, `${base} dataset evaluation`, `${base} ablation performance`],
    }),
    buildQueryRewriteGroup({
      id: 'citation-metadata',
      label_zh: '引用线索',
      purpose_zh: '用于寻找包含作者、年份、venue 或 DOI 的片段；没有命中时不要自行补写这些信息。',
      queries: [`${base} author year venue`, `${base} DOI arxiv`, `${base} citation bibliographic`],
    }),
  ];
  const guide = {
    status: !ragSummary?.indexedChunks
      ? 'needs-indexed-text'
      : (needsRewrite ? 'recommended' : 'optional'),
    label_zh: !ragSummary?.indexedChunks
      ? '先准备可检索正文'
      : (needsRewrite ? '建议改写检索词' : '可选改写检索词'),
    query,
    reason_zh: buildQueryRewriteReason({ results, coverage, ragSummary, queryAssistant }),
    groups,
    topQueries: Array.from(new Set(groups.flatMap(group => group.queries))).slice(0, 8),
    copyText: '',
  };
  guide.copyText = formatRagQueryRewriteCopyText(guide);
  return guide;
}

function buildQueryRewriteGroup({ id, label_zh, purpose_zh, queries }) {
  const uniqueQueries = Array.from(new Set((queries || []).filter(Boolean))).slice(0, 4);
  return {
    id,
    label_zh,
    purpose_zh,
    queries: uniqueQueries,
    actions: uniqueQueries.map(query => ({
      type: 'use-rag-query',
      label_zh: `检索：${query}`,
      query,
    })),
  };
}

function buildQueryRewriteReason({ results, coverage, ragSummary, queryAssistant }) {
  if (!ragSummary?.indexedChunks) return '当前没有可检索正文片段；先上传可抽取文本的 PDF 或 Markdown 笔记。';
  if (!results.length) return '当前查询没有命中证据片段，建议换成更具体的主题词、方法词或英文关键词。';
  if (coverage.status === 'single-source') return '当前命中都来自单一来源，建议用方法对比和主题扩展查询补不同来源。';
  if (coverage.status === 'concentrated') return '当前证据过于集中，建议改写查询以覆盖不同论文或相邻主题。';
  if (coverage.status === 'thin') return '当前证据覆盖偏薄，适合先写局部观点；完整段落建议继续补证据。';
  return queryAssistant?.message_zh || '当前证据可用；如要写完整 related work，可继续用改写查询补覆盖面。';
}

function formatRagQueryRewriteCopyText(guide) {
  return [
    '# RAG 检索改写',
    `${guide.label_zh}：${guide.reason_zh}`,
    `当前查询：${guide.query || '(未填写)'}`,
    '',
    '# 改写分组',
    ...(guide.groups || []).map(group => [
      `## ${group.label_zh}`,
      group.purpose_zh,
      ...(group.queries || []).map(query => `- ${query}`),
    ].join('\n')),
  ].join('\n\n');
}

function formatRagQueryAssistantCopyText(guide) {
  return [
    '# RAG 检索助手',
    `${guide.label_zh}：${guide.message_zh}`,
    `当前检索：${guide.query || '(未填写)'}`,
    `命中片段：${guide.evidenceCount}，已索引 chunks：${guide.indexedChunks}`,
    '',
    '# 推荐检索词',
    ...((guide.suggestedQueries || []).map(query => `- ${query}`)),
    '',
    '# 检索步骤',
    ...((guide.steps || []).map(step => `- ${step.label_zh}：${step.detail_zh}`)),
    ...((guide.missingSourceTypes || []).length ? ['', '# 建议补充来源', ...guide.missingSourceTypes.map(item => `- ${item}`)] : []),
  ].join('\n');
}

function extractExpansionKeywords(text) {
  const stopwords = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'using', 'based',
    'related', 'work', 'research', 'gap', 'paper', 'evidence', 'write', 'please',
    '帮我', '根据', '证据', '文献', '引用', '相关工作', '研究', '空白', '写',
  ]);
  const matches = String(text || '').match(/[A-Za-z][A-Za-z0-9-]{2,}|[\u4e00-\u9fa5]{2,}/g) || [];
  const counts = new Map();
  for (const raw of matches) {
    const token = raw.toLowerCase();
    if (stopwords.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([token]) => token)
    .slice(0, 8);
}

function inferEvidenceSupport(task, text) {
  const combined = `${task || ''}\n${text || ''}`.toLowerCase();
  const support = [];
  if (/gap|limitation|lack|不足|局限|空白/.test(combined)) {
    support.push('可用于说明现有工作的局限或 research gap。');
  }
  if (/related work|literature|survey|文献|相关工作/.test(combined)) {
    support.push('可用于 related work 的主题归纳或代表性观点。');
  }
  if (/method|approach|framework|方法|模型/.test(combined)) {
    support.push('可用于概括方法类别或技术路线。');
  }
  if (/result|performance|experiment|实验|结果|指标/.test(combined)) {
    support.push('可用于讨论片段中明确出现的实验或结果。');
  }
  if (support.length === 0) {
    support.push('可用于支撑与片段文本直接一致的事实陈述。');
  }
  return support;
}

function formatEvidencePackCopyText(pack) {
  if (!pack.items.length) {
    return [
      '# 证据包',
      pack.message_zh,
      '',
      '# 下一步',
      ...pack.fallbackActions.map(action => `- ${action.label_zh}`),
    ].join('\n');
  }
  return [
    '# 证据包使用规则',
    ...pack.rules.map(rule => `- ${rule}`),
    '',
    '# 证据覆盖度',
    `${pack.coverage.label_zh}：${pack.coverage.sourceCount} 个来源 / ${pack.coverage.evidenceCount} 条片段，最高单一来源占比 ${Math.round((pack.coverage.topSourceShare || 0) * 100)}%。`,
    `证据包指纹：${pack.fingerprint}`,
    pack.coverage.guidance_zh,
    ...(pack.coverage.warnings || []).map(warning => `警告：${warning}`),
    '',
    '# 补证据计划',
    `${pack.expansionPlan.label_zh}：${pack.expansionPlan.reason_zh}`,
    ...(pack.expansionPlan.suggestedQueries || []).map(query => `- 检索：${query}`),
    ...(pack.expansionPlan.missingSourceTypes || []).map(item => `- 补充：${item}`),
    '',
    '# 可引用证据',
    ...pack.items.map(item => [
      `[${item.rank}] ${item.sourceLabel}`,
      item.snippet,
      item.quality ? `质量：${item.quality.label_zh}（${item.quality.score_100}/100）` : '',
      item.quality?.recommendedUse_zh ? `建议用法：${item.quality.recommendedUse_zh}` : '',
      item.quality?.claimTemplate_zh ? `句型模板：${item.quality.claimTemplate_zh}` : '',
      ...(item.quality?.warnings_zh || []).map(warning => `质量警告：${warning}`),
      `支持：${item.supports_zh.join('；')}`,
      `限制：${item.notFor.join('；')}`,
    ].filter(Boolean).join('\n')),
  ].join('\n\n');
}

function formatSourceLabel(result) {
  const source = result.source || {};
  const lines = source.lineStart ? `:L${source.lineStart}-L${source.lineEnd || source.lineStart}` : '';
  return `${source.path || source.title || 'unknown'}${lines}`;
}

function buildTaskStarters(context) {
  const projectState = context.projectState || {};
  const hasEvidence = Boolean(projectState.hasRagDocuments || projectState.hasReferences);
  const ragUsable = context.rag?.health?.status !== 'unusable';
  const starters = [
    {
      id: 'literature-review-gap',
      title_zh: '写 Related Work / Research Gap',
      subtitle_en: 'Literature Review',
      category_zh: '文献',
      tags: ['PDF 证据', '引用安全', '研究空白'],
      mode: 'agent',
      skill: 'literature-review',
      prompt: '帮我基于证据库里的论文写 related work，并按主题总结代表工作、局限和 research gap。请只使用命中的证据片段，不要编造引用。',
      help_zh: '适合已经上传 PDF、BibTeX 或文献笔记后，开始写相关工作。',
      requires_context: ['rag_documents_or_references', 'target_section_or_file'],
      disabled: !hasEvidence,
      disabledReason_zh: hasEvidence ? '' : '需要先上传 PDF、BibTeX 或文献笔记。',
      primaryAction: hasEvidence
        ? { type: 'fill-task-template', label_zh: '填入 related work 任务' }
        : { type: 'upload-evidence', label_zh: '先上传可引用资料' },
    },
    {
      id: 'academic-search',
      title_zh: '检索最新相关工作',
      subtitle_en: 'Academic Search',
      category_zh: '文献',
      tags: ['学术检索', '关键词', '补文献'],
      mode: 'agent',
      skill: 'nature-academic-search',
      prompt: '帮我围绕当前研究问题检索最新相关工作：先生成检索关键词和同义词，再按相关性、方法类型、可引用价值和是否需要加入 RAG 证据库排序候选论文。不要把未读过全文的论文直接写成已证实结论。',
      help_zh: '适合 related work 证据不够、需要补最新论文或扩展检索词时先用。',
      requires_context: ['search_query'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入学术检索任务' },
    },
    {
      id: 'introduction-storyline',
      title_zh: '搭建 Introduction 逻辑',
      subtitle_en: 'Introduction Writing',
      category_zh: '写作',
      tags: ['问题动机', '贡献点', '论文故事线'],
      mode: 'agent',
      skill: 'writing-introduction',
      prompt: '帮我梳理 introduction 的逻辑链：研究背景、现有方法不足、本文问题、核心贡献和段落安排。先给结构建议，不要直接覆盖正文。',
      help_zh: '适合从零组织引言，或检查引言是否有清晰问题驱动。',
      requires_context: ['paper_claims', 'target_section_or_file'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入 introduction 任务' },
    },
    {
      id: 'paper-planning',
      title_zh: '论文规划 / Outline',
      subtitle_en: 'Paper Planning',
      category_zh: '规划',
      tags: ['大纲', '故事线', '写作计划'],
      mode: 'agent',
      skill: 'paper-planning',
      prompt: '帮我把研究 idea 或当前草稿整理成论文规划：生成 paper outline、核心故事线、贡献链条、章节目标、证据/实验依赖、两周写作任务和 reviewer 风险清单。不要编造结果、引用或已完成实验。',
      help_zh: '适合从 idea 到论文结构、开写前排章节、检查故事线和贡献强度、拆解写作任务和预判审稿风险。',
      requires_context: ['paper_claims'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入论文规划任务' },
    },
    {
      id: 'method-clarity',
      title_zh: '解释 Method / Algorithm',
      subtitle_en: 'Method Writing',
      category_zh: '写作',
      tags: ['方法描述', '符号定义', '算法步骤'],
      mode: 'agent',
      skill: 'writing-methodology',
      prompt: '帮我把方法部分写清楚：先整理符号定义、算法步骤、关键设计选择和复杂度/实现细节；如果上下文不足，请列出需要我补充的材料。',
      help_zh: '适合把已有方法笔记整理成论文方法章节。',
      requires_context: ['method_notes', 'target_section_or_file'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入 method 任务' },
    },
    {
      id: 'results-discussion',
      title_zh: '分析 Results / Discussion',
      subtitle_en: 'Results and Discussion',
      category_zh: '实验',
      tags: ['实验结果', '消融', '局限性'],
      mode: 'agent',
      skill: 'writing-discussion',
      prompt: '帮我根据实验结果写 results/discussion：总结主要发现、对比 baseline、解释异常现象、指出局限性，并区分证据支持和推测。',
      help_zh: '适合表格和实验结论已经有了，但不知道怎么写讨论。',
      requires_context: ['experiment_results', 'paper_findings', 'target_section_or_file'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入 discussion 任务' },
    },
    {
      id: 'abstract-tighten',
      title_zh: '压缩 Abstract',
      subtitle_en: 'Abstract Writing',
      category_zh: '写作',
      tags: ['摘要', '贡献', '字数控制'],
      mode: 'agent',
      skill: 'writing-abstract',
      prompt: '帮我写一个紧凑的 abstract：包含问题、方法、关键结果和贡献。请给出 1 个标准版和 1 个更短版本，并说明还缺哪些关键信息。',
      help_zh: '适合论文主线基本确定后，生成或压缩摘要。',
      requires_context: ['paper_summary', 'experiment_results'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入 abstract 任务' },
    },
    {
      id: 'conclusion-close',
      title_zh: '写 Conclusion / Future Work',
      subtitle_en: 'Conclusion Writing',
      category_zh: '写作',
      tags: ['结论', '贡献收束', '未来工作'],
      mode: 'agent',
      skill: 'writing-conclusion',
      prompt: '帮我写 conclusion：根据论文贡献、主要结果和局限性收束全文，并自然引出 future work。不要重复 abstract，也不要加入正文没有支持的新结论。',
      help_zh: '适合论文主线和主要结果已有后，写结论或 future work。',
      requires_context: ['paper_summary', 'paper_findings', 'target_section_or_file'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入 conclusion 任务' },
    },
    {
      id: 'paper-polish',
      title_zh: '论文润色 / 语言编辑',
      subtitle_en: 'Academic Polishing',
      category_zh: '写作',
      tags: ['润色', '翻译', 'AI 痕迹'],
      mode: 'agent',
      skill: 'writing-polish',
      prompt: '帮我润色/翻译/压缩目标段落或章节：提升清晰度、连贯性和学术语气；可检查语法时态、降低 AI 痕迹或改成目标期刊写作风格。保留原意、引用、数字、LaTeX 命令和技术术语，不要新增事实或自动覆盖正文。',
      help_zh: '适合已经有一段文字，想做英文论文表达、语法时态、压缩段落、AI 痕迹或学术风格修改，但不想改变事实或引用。',
      requires_context: ['target_section_or_file'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入润色任务' },
    },
    {
      id: 'evidence-review',
      title_zh: '审查 AI 输出 / 证据核对',
      subtitle_en: 'Evidence Review',
      category_zh: '审查',
      tags: ['幻觉引用', '单句核对', '安全采纳'],
      mode: 'agent',
      skill: 'evidence-review',
      prompt: '帮我审查 AI 输出或单句 claim：检查引用编号、RAG 证据支持、幻觉引用、过度外推和是否可采纳；如需采纳，只生成安全采纳包和人工 diff 计划，不要自动写入正文。',
      help_zh: '适合 AI 写完草稿后，检查是否有假引用、证据是否支持、单句 claim 能否写入，以及生成只读安全采纳包。',
      requires_context: ['rag_documents_or_references', 'target_section_or_file'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入输出审查任务' },
    },
    {
      id: 'latex-debug',
      title_zh: '修复 LaTeX / Overleaf 报错',
      subtitle_en: 'LaTeX Debugging',
      category_zh: '工具',
      tags: ['LaTeX', 'Overleaf', '编译错误'],
      mode: 'tools',
      skill: 'latex-debugging',
      prompt: '帮我检查 LaTeX/Overleaf 编译报错：请根据报错日志先定位第一个 blocking error、解释原因、给出最小修复建议和可审查 patch。运行编译命令或改文件前先列计划并等待确认。',
      help_zh: '适合 Overleaf 报错、本地 LaTeX 编译失败、PDF 编译不过、宏包/引用/公式/表格环境错误。',
      requires_context: ['latex_error_log', 'target_section_or_file'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入 LaTeX 修复任务' },
    },
    {
      id: 'citation-cleanup',
      title_zh: '整理引用和 BibTeX',
      subtitle_en: 'Reference Management',
      category_zh: '引用',
      tags: ['BibTeX', '引用检查', '格式统一'],
      mode: 'agent',
      skill: 'reference-management',
      prompt: '帮我检查 references.bib 和正文引用：找出缺失条目、重复条目、格式问题和可能不可靠的引用。不要编造 BibTeX。',
      help_zh: '适合投稿前检查引用完整性和一致性。',
      requires_context: ['references_bib'],
      disabled: !projectState.hasReferences,
      disabledReason_zh: projectState.hasReferences ? '' : '需要先提供 references.bib 或 BibTeX 条目。',
      primaryAction: projectState.hasReferences
        ? { type: 'fill-task-template', label_zh: '填入引用整理任务' }
        : { type: 'upload-bibtex', label_zh: '先上传 BibTeX' },
    },
    {
      id: 'figure-plan',
      title_zh: '设计论文图表',
      subtitle_en: 'Figure Planning',
      category_zh: '图表',
      tags: ['图表表达', '读者视角', '实验可视化'],
      mode: 'tools',
      skill: 'nature-figure',
      prompt: '帮我设计论文图表方案：说明每张图要表达的结论、需要的数据、推荐图型、caption 要点和可能的误导风险。执行画图前先给计划。',
      help_zh: '适合把实验结果转成图表计划，或检查图是否服务论文主张。',
      requires_context: ['figure_goal', 'data_or_results'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入图表设计任务' },
    },
    {
      id: 'statistical-analysis',
      title_zh: '统计分析 / 显著性检验',
      subtitle_en: 'Statistical Analysis',
      category_zh: '实验',
      tags: ['统计', '显著性', '置信区间'],
      mode: 'tools',
      skill: 'statistical-analysis',
      prompt: '帮我检查实验结果是否需要统计显著性检验：说明适合的统计方法、样本量/重复次数要求、p-value 或置信区间怎么报告，以及哪些结论不能只靠单次结果支持。运行任何统计脚本前先给计划。',
      help_zh: '适合处理实验指标、显著性、置信区间、效应量或结果可靠性。',
      requires_context: ['data_or_results', 'experiment_results'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入统计分析任务' },
    },
    {
      id: 'submission-check',
      title_zh: '投稿前检查',
      subtitle_en: 'Submission Checklist',
      category_zh: '投稿',
      tags: ['格式要求', '匿名检查', 'Checklist'],
      mode: 'tools',
      skill: 'conference-submission',
      prompt: '帮我做投稿前检查：根据会议/期刊规则检查页数、匿名、格式、引用、图表、补充材料和 checklist。执行编译或改文件前先列出检查计划。',
      help_zh: '适合提交前做风险排查，尤其是匿名和格式要求。',
      requires_context: ['venue_rules', 'compiled_pdf'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入投稿检查任务' },
    },
    {
      id: 'submission-materials',
      title_zh: '投稿材料 / 声明检查',
      subtitle_en: 'Submission Materials',
      category_zh: '投稿',
      tags: ['Cover Letter', '声明材料', '补充材料'],
      mode: 'agent',
      skill: 'conference-submission',
      prompt: '帮我检查投稿材料：cover letter、acknowledgements、author contributions、ethical statement、data/code availability、conflict of interest、supplementary material 和 supporting information。请按目标会议/期刊规则列出缺口，不要替我编造伦理审批、数据链接、作者贡献、致谢资金或利益冲突声明。',
      help_zh: '适合提交前准备 cover letter、致谢、作者贡献、伦理声明、数据/代码可用性、利益冲突和补充材料说明。',
      requires_context: ['venue_rules', 'target_section_or_file'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入投稿材料任务' },
    },
    {
      id: 'reviewer-response',
      title_zh: '审稿回复 / Rebuttal',
      subtitle_en: 'Reviewer Response',
      category_zh: '投稿',
      tags: ['审稿意见', '逐条回复', '修改计划'],
      mode: 'agent',
      skill: 'reviewer-response',
      prompt: '帮我处理审稿回复 / revision：请逐条拆解 reviewer comments，整理 major/minor concerns、revision plan、正文修改位置、action items 和 rebuttal 草稿；写回复时要礼貌、具体、有证据边界。不要承诺未确认的实验、数字或正文修改。',
      help_zh: '适合收到 reviewer comments 后整理 response letter、rebuttal、revision checklist、正文修改矩阵和修订 action list。',
      requires_context: ['reviewer_comments', 'target_section_or_file'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入审稿回复任务' },
    },
    {
      id: 'grant-proposal',
      title_zh: '基金申请 / Research Proposal',
      subtitle_en: 'Grant Proposal Writing',
      category_zh: '项目申请',
      tags: ['基金', '研究计划', '创新点'],
      mode: 'agent',
      skill: 'grant-proposal',
      prompt: '帮我梳理基金申请书：明确研究问题、科学意义、创新点、技术路线、里程碑、风险应对和预算理由。不要编造未确认的经费、合作单位或成果承诺。',
      help_zh: '适合把论文方向或课题想法整理成项目申请、research proposal 或基金标书结构。',
      requires_context: ['research_direction', 'venue_rules'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入基金申请任务' },
    },
    {
      id: 'paper2ppt',
      title_zh: '论文转演示 / Slides',
      subtitle_en: 'Paper to Presentation',
      category_zh: '图表',
      tags: ['PPT', 'Beamer', '汇报'],
      mode: 'agent',
      skill: 'nature-paper2ppt',
      prompt: '帮我把论文整理成汇报 slides：按问题、方法、实验、结论安排每页标题、核心图、讲稿要点和时间分配。不要假设不存在的图或实验结果。',
      help_zh: '适合会议报告、组会汇报、答辩 slides 或 Beamer 大纲。',
      requires_context: ['paper_summary', 'figure_goal'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入论文转演示任务' },
    },
    {
      id: 'poster-design',
      title_zh: '学术海报 / Poster',
      subtitle_en: 'Academic Poster Design',
      category_zh: '图表',
      tags: ['海报', '版式', '读者路径'],
      mode: 'agent',
      skill: 'poster-design',
      prompt: '帮我设计学术海报结构：标题、核心图、方法、结果、takeaway、版式层级和读者阅读路径。请先给区块布局和文案要点，不要直接生成最终印刷文件。',
      help_zh: '适合会议 poster、项目展示板和论文可视化摘要。',
      requires_context: ['figure_goal', 'paper_summary'],
      disabled: false,
      disabledReason_zh: '',
      primaryAction: { type: 'fill-task-template', label_zh: '填入学术海报任务' },
    },
  ];

  return starters.map(starter => ({
    ...starter,
    contextPrefill: buildTaskStarterContextPrefill(starter),
    nextStep_zh: buildTaskStarterNextStep(starter),
    startGuide: buildTaskStarterStartGuide(starter, context, { hasEvidence, ragUsable }),
    readiness_zh: starter.disabled
      ? starter.disabledReason_zh
      : (ragUsable || !starter.requires_context.includes('rag_documents_or_references')
        ? '可以开始，发送前仍会检查上下文和引用安全。'
        : '可以先填入任务，但建议先修复证据库。'),
  }));
}

function buildTaskStarterStartGuide(starter, context, { hasEvidence, ragUsable }) {
  const contextAnswers = context.contextAnswers || {};
  const required = (starter.requires_context || []).map(key => {
    const detail = describeContextKey(key);
    const ready = isStarterContextReady(key, { contextAnswers, projectState: context.projectState || {}, hasEvidence });
    return {
      key,
      label_zh: detail.label_zh,
      help_zh: detail.help_zh,
      status: ready ? 'ready' : 'missing',
      statusLabel_zh: ready ? '已具备' : '待补充',
      action: ready ? { type: 'review-context', label_zh: '核对材料' } : buildContextAction(key),
    };
  });
  const missing = required.filter(item => item.status !== 'ready');
  const status = starter.disabled
    ? 'blocked'
    : missing.length > 0
      ? 'needs-context'
      : (!ragUsable && starter.requires_context.includes('rag_documents_or_references') ? 'needs-evidence-repair' : 'ready');
  const prefill = buildTaskStarterContextPrefill(starter);
  const beforeSend = [
    '确认目标章节或文件，不要让 Agent 猜要改哪里。',
    ...(starter.requires_context.includes('rag_documents_or_references')
      ? ['确认 RAG 证据库有可检索正文，引用性事实只使用命中片段。']
      : []),
    ...(starter.mode === 'tools'
      ? ['涉及运行命令、编译或改文件前，先审查工具计划。']
      : []),
    ...(starter.mode === 'agent'
      ? ['先生成可审查草稿或 diff，不要自动覆盖论文正文。']
      : []),
  ];
  const expectedOutputs = buildTaskStarterExpectedOutputs(starter);
  const guide = {
    status,
    label_zh: {
      ready: '可直接启动',
      blocked: '先补资料',
      'needs-context': '先补上下文',
      'needs-evidence-repair': '先修复证据',
    }[status],
    why_zh: buildTaskStarterWhy(starter),
    recommendedMode: starter.mode,
    recommendedSkill: starter.skill,
    required,
    missingContext: missing,
    beforeSend,
    expectedOutputs,
    safeStartPrompt: buildTaskStarterSafePrompt(starter, prefill, missing),
    copyText: '',
  };
  guide.copyText = formatTaskStarterGuideCopyText(starter, guide);
  return guide;
}

function isStarterContextReady(key, { contextAnswers, projectState, hasEvidence }) {
  if (hasContextAnswer(contextAnswers, key)) return true;
  if (key === 'rag_documents_or_references') return Boolean(hasEvidence);
  if (key === 'references_bib') return Boolean(projectState.hasReferences);
  if (key === 'target_section_or_file') return Boolean(contextAnswers.target_section_or_file);
  return false;
}

function buildTaskStarterWhy(starter) {
  const reasons = {
    'literature-review-gap': '你要写相关工作或研究空白时，先用文献综述 Skill 把证据按主题组织起来，比直接让模型写正文更安全。',
    'academic-search': '当证据不够或需要最新相关工作时，先检索候选论文和关键词，比直接写 related work 更不容易编造。',
    'introduction-storyline': '引言最容易变成泛泛背景，先让系统检查“背景-问题-gap-贡献”的逻辑链，可以减少空话。',
    'paper-planning': '当你还没确定整篇论文结构时，先规划 outline、故事线、证据/实验依赖和写作任务，比直接进入单个章节更稳。',
    'method-clarity': '方法章节需要符号、步骤和设计动机一致，适合先让 Agent 整理结构，再决定是否写正文。',
    'results-discussion': '实验讨论必须区分结果事实和解释推测，先用该入口能把发现、异常和局限拆开。',
    'abstract-tighten': '摘要需要压缩问题、方法、结果和贡献，适合在主线已有后生成多个长度版本。',
    'conclusion-close': '结论需要收束贡献、结果和局限，适合先检查是否重复 abstract 或加入了正文没有支持的新结论。',
    'paper-polish': '润色、翻译、语法时态和 AI 痕迹修改都必须保留原意、数字、引用和 LaTeX 命令，适合先生成可审查改写而不是直接覆盖正文。',
    'evidence-review': 'AI 输出、单句 claim 和引用性正文必须先过证据核对；该入口把审查、修订计划和安全采纳包放在写入正文之前。',
    'latex-debug': 'LaTeX/Overleaf 报错需要先看第一段 blocking error，给最小修复方案；涉及编译和改文件时必须走工具计划和确认门槛。',
    'citation-cleanup': '引用整理涉及 BibTeX 和正文 citation key，必须禁止编造条目，适合走受约束的引用检查入口。',
    'figure-plan': '图表任务常涉及数据和命令，先出图表计划比直接画图更容易控制风险。',
    'statistical-analysis': '统计检验需要数据、重复次数和假设边界，先让系统选方法和报告方式比直接解释 p-value 更可靠。',
    'submission-check': '投稿检查涉及规则、匿名、页数和编译产物，适合先生成检查计划，再决定是否运行工具。',
    'submission-materials': '投稿声明材料容易涉及伦理审批、数据链接、作者贡献、致谢资金和利益冲突，先按 venue 规则列缺口，避免编造声明。',
    'reviewer-response': '审稿回复需要逐条回应且不能过度承诺，先拆解 comments、正文修改位置和 revision plan 比直接写 rebuttal 更稳。',
    'grant-proposal': '基金申请要同时讲清科学问题、创新性、路线和可行性，先用该入口组织标书结构和缺口清单。',
    'paper2ppt': '论文汇报需要把正文压缩成听众能跟上的故事线，先规划每页 slide 和讲稿节奏更容易控制信息密度。',
    'poster-design': '学术海报需要读者快速扫到贡献和关键图，先规划版式层级和阅读路径比直接生成大段文案更可靠。',
  };
  return reasons[starter.id] || starter.help_zh || '这个入口会把常见论文任务转成推荐模式、Skill 和上下文检查。';
}

function buildTaskStarterExpectedOutputs(starter) {
  const outputs = {
    'literature-review-gap': ['主题分组的 related work 草稿', '每组代表证据编号', 'research gap 和不可外推边界'],
    'academic-search': ['检索关键词和同义词', '候选论文列表', '是否应加入 RAG 证据库的建议'],
    'introduction-storyline': ['引言段落结构', '问题动机和贡献链条', '需要补充的论文主张'],
    'paper-planning': ['论文 outline', '故事线和贡献图谱', '写作 roadmap 与 reviewer 风险清单'],
    'method-clarity': ['符号与模块清单', '方法章节结构', '需要用户确认的算法细节'],
    'results-discussion': ['主要发现列表', '结果解释与局限', '需要证据支持的讨论点'],
    'abstract-tighten': ['标准版摘要', '短版摘要', '缺失信息清单'],
    'conclusion-close': ['结论段落草稿', 'future work 表述', '过度承诺或重复 abstract 的风险点'],
    'paper-polish': ['润色/翻译版本', '语法时态和 AI 痕迹问题清单', '可能改变含义的风险点'],
    'evidence-review': ['可采纳性结论', '幻觉引用/证据缺口清单', '单句证据核对或安全采纳包'],
    'latex-debug': ['第一处 blocking error 解释', '最小修复建议或可审查 patch', '重新编译计划和风险说明'],
    'citation-cleanup': ['缺失/重复/异常引用清单', 'BibTeX 修复建议', '禁止编造条目提醒'],
    'figure-plan': ['图表清单', '每张图的数据需求', 'caption 要点和误导风险'],
    'statistical-analysis': ['统计方法建议', 'p-value/置信区间报告方式', '结果结论边界'],
    'submission-check': ['投稿风险清单', '规则核对步骤', '需要人工确认的提交项'],
    'submission-materials': ['cover letter/声明材料缺口', '致谢/作者贡献/补充材料清单', '不得编造的声明项'],
    'reviewer-response': ['逐条审稿意见拆解', 'revision plan / 修改矩阵', 'rebuttal 草稿和补实验 action list'],
    'grant-proposal': ['申请书结构', '创新点和技术路线', '里程碑、风险和预算理由缺口'],
    'paper2ppt': ['slides 大纲', '每页核心图和讲稿要点', '时间分配和信息密度建议'],
    'poster-design': ['海报区块布局', '核心图和 takeaway', '版式层级和文案要点'],
  };
  return outputs[starter.id] || ['可审查的任务计划', '缺失上下文清单', '下一步动作'];
}

function buildTaskStarterSafePrompt(starter, prefill, missing) {
  return [
    starter.prompt,
    '',
    '# 已知目标位置',
    prefill.target_section_or_file || '请先让我确认目标章节或文件。',
    '',
    '# 我会先补充/确认的材料',
    missing.length
      ? missing.map(item => `- ${item.label_zh}：${item.help_zh}`).join('\n')
      : '- 当前入口的关键材料已基本具备；生成前仍需复核。',
    '',
    '# 安全边界',
    '- 先给可审查计划或草稿，不要自动覆盖论文正文。',
    '- 涉及文献事实时，只能使用 RAG 命中的证据编号。',
    '- 如果证据或上下文不足，先列缺口，不要编造。',
  ].join('\n');
}

function formatTaskStarterGuideCopyText(starter, guide) {
  return [
    '# 论文任务启动说明',
    `${starter.title_zh}（${starter.subtitle_en}）`,
    `状态：${guide.label_zh}（${guide.status}）`,
    `推荐模式：${guide.recommendedMode}`,
    `推荐 Skill：${guide.recommendedSkill}`,
    '',
    '# 为什么选它',
    guide.why_zh,
    '',
    '# 需要材料',
    ...(guide.required.length ? guide.required.map(item => `- ${item.label_zh}：${item.statusLabel_zh}。${item.help_zh}`) : ['- 无特殊必需材料。']),
    '',
    '# 发送前检查',
    ...guide.beforeSend.map(item => `- ${item}`),
    '',
    '# 预期产出',
    ...guide.expectedOutputs.map(item => `- ${item}`),
    '',
    '# 安全启动 Prompt',
    guide.safeStartPrompt,
  ].join('\n');
}

function buildTaskStarterContextPrefill(starter) {
  const targetHints = {
    'literature-review-gap': 'chapters/related_work.tex',
    'academic-search': 'research_corpus/ 或 related_work 检索关键词',
    'introduction-storyline': 'chapters/introduction.tex',
    'paper-planning': 'paper-outline.md / writing-roadmap.md / 项目计划',
    'method-clarity': 'chapters/method.tex',
    'results-discussion': 'chapters/results.tex 或 chapters/discussion.tex',
    'abstract-tighten': 'abstract.tex 或 paper 摘要段',
    'conclusion-close': 'chapters/conclusion.tex 或 conclusion 草稿',
    'paper-polish': '当前段落、chapters/introduction.tex 或需要润色/翻译的文本',
    'evidence-review': 'AI 输出草稿、claim-review.md 或目标章节',
    'latex-debug': 'main.tex / 报错关联的 .tex 文件 / Overleaf 项目路径',
    'citation-cleanup': 'references.bib 和正文引用段落',
    'figure-plan': 'figures/ 或 results 表格对应章节',
    'statistical-analysis': 'results 表格、metrics.csv 或实验记录',
    'submission-check': 'main.tex / compiled PDF / submission checklist',
    'submission-materials': 'cover-letter.md / declarations.md / supplementary-material.md',
    'reviewer-response': 'response-letter.md 或需要修改的章节',
    'grant-proposal': 'proposal.md / research-plan.md / 项目申请草稿',
    'paper2ppt': 'slides.md / talk-outline.md / 论文汇报大纲',
    'poster-design': 'poster.md / figures/ / 海报草稿',
  };
  const notes = {
    'literature-review-gap': '补充：论文主题、目标会议/领域、希望强调的 research gap。',
    'academic-search': '补充：研究问题、方法关键词、数据集/任务名、时间范围和要排除的方向。',
    'introduction-storyline': '补充：论文要解决的问题、核心贡献、方法亮点、目标读者。',
    'paper-planning': '补充：研究 idea、目标 venue、已有结果、缺失实验、截止时间和当前草稿进度。',
    'method-clarity': '补充：算法步骤、符号定义、模块结构、实现约束。',
    'results-discussion': '补充：主要结果表格、baseline、消融、异常现象和结论。',
    'abstract-tighten': '补充：问题、方法、最重要结果、贡献和字数限制。',
    'conclusion-close': '补充：论文贡献、主要结果、局限性、future work 和目标章节。',
    'paper-polish': '补充：目标文本、希望的编辑强度、目标语言/期刊风格、是否需要降低 AI 痕迹。',
    'evidence-review': '补充：AI 输出或单句 claim、当前 RAG 证据包、目标章节和希望生成审查报告还是安全采纳包。',
    'latex-debug': '补充：第一段 blocking error、行号、相关 .tex 片段、模板/宏包限制和本地或 Overleaf 环境。',
    'citation-cleanup': '补充：需要检查的 citation key、目标格式或报错信息。',
    'figure-plan': '补充：每张图要表达的结论、可用数据、目标读者。',
    'statistical-analysis': '补充：结果表格、重复次数、样本量、baseline、指标定义和统计假设。',
    'submission-check': '补充：会议/期刊名称、页数限制、匿名要求、checklist 链接。',
    'submission-materials': '补充：目标会议/期刊规则、cover letter/致谢/作者贡献/伦理/数据/代码/利益冲突/补充材料现状。',
    'reviewer-response': '补充：reviewer comments、meta-review、已有修改计划、哪些实验或正文改动已经确认。',
    'grant-proposal': '补充：研究方向、申请类别/规则、周期、已有基础、预算或合作约束。',
    'paper2ppt': '补充：汇报时长、听众、必须展示的图、目标会议/答辩场景。',
    'poster-design': '补充：海报尺寸、会议要求、核心图、希望观众记住的 takeaway。',
  };
  return {
    target_section_or_file: targetHints[starter.id] || '',
    paper_claims: notes[starter.id] || '',
    requiredKeys: starter.requires_context || [],
  };
}

function buildTaskStarterNextStep(starter) {
  if (starter.disabled) return starter.disabledReason_zh || '先补齐该入口需要的材料。';
  const prefill = buildTaskStarterContextPrefill(starter);
  if (prefill.requiredKeys?.length) {
    return `填入任务后，优先确认：${prefill.requiredKeys.map(key => describeContextKey(key).label_zh).join('、')}。`;
  }
  return '填入任务后重新分析，工作台会自动选择模式、Skill 和证据规则。';
}

function buildActionQueue(context) {
  const actions = [];
  const add = (source, priority, action, meta = {}) => {
    const normalized = normalizeQueuedAction(source, priority, action, meta);
    if (normalized) actions.push(normalized);
  };

  if (context.paperWorkflowGuide?.currentStep?.action) {
    add('paperWorkflowGuide.currentStep', context.paperWorkflowGuide.currentStep.blocking ? 5 : 25, context.paperWorkflowGuide.currentStep.action, {
      status: context.paperWorkflowGuide.currentStep.status,
      reason_zh: context.paperWorkflowGuide.currentStep.message_zh,
      blocking: Boolean(context.paperWorkflowGuide.currentStep.blocking),
    });
  }

  if (context.modeActionCenter?.primaryAction) {
    add('modeActionCenter.primaryAction', context.modeActionCenter.primaryAction.enabled ? 40 : 10, context.modeActionCenter.primaryAction, {
      status: context.modeActionCenter.status,
      reason_zh: context.modeActionCenter.primaryAction.disabledReason_zh || context.modeActionCenter.summary_zh,
      blocking: !context.modeActionCenter.primaryAction.enabled,
    });
  }

  for (const blocker of context.modeActionCenter?.blockers || []) {
    add('modeActionCenter.blockers', 8, blocker.action, {
      status: 'blocked',
      reason_zh: blocker.detail_zh,
      blocking: true,
      code: blocker.code,
    });
  }

  for (const question of context.clarificationQuestions || []) {
    add('clarificationQuestions', question.priority === 'high' ? 12 : 30, question.action, {
      status: 'needs-context',
      reason_zh: question.question_zh,
      blocking: question.priority === 'high',
      contextKey: question.contextKey,
    });
  }

  for (const step of context.rag?.repairGuide?.repairPlan?.steps || []) {
    add('rag.repairGuide.repairPlan', step.blocksCitationWriting ? 15 : 55, step.action, {
      status: step.priority || 'recommended',
      reason_zh: step.instruction_zh || step.title_zh,
      blocking: Boolean(step.blocksCitationWriting),
      code: step.id,
    });
  }

  for (const query of context.rag?.queryRewriteGuide?.topQueries?.slice(0, 3) || []) {
    add('rag.queryRewriteGuide', context.rag.queryRewriteGuide.status === 'recommended' ? 35 : 70, {
      type: 'use-rag-query',
      label_zh: `检索：${query}`,
      query,
    }, {
      status: context.rag.queryRewriteGuide.status,
      reason_zh: context.rag.queryRewriteGuide.reason_zh,
      blocking: false,
    });
  }

  for (const hint of context.workflowHints || []) {
    add('workflowHints', hint.priority === 'high' ? 18 : hint.priority === 'medium' ? 45 : 75, hint.action, {
      status: hint.priority || 'suggested',
      reason_zh: hint.message_zh,
      blocking: hint.priority === 'high',
      code: hint.code,
    });
  }

  const primarySkill = context.skills?.decisionGuide?.primary;
  if (primarySkill?.name) {
    add('skills.decisionGuide.primary', 60, {
      type: 'activate-skill',
      label_zh: `启用 ${primarySkill.title_zh || primarySkill.name}`,
      skill: primarySkill.name,
    }, {
      status: context.skills?.decisionGuide?.status || 'recommended',
      reason_zh: context.skills?.decisionGuide?.summary_zh || '',
      blocking: false,
    });
  }

  if (context.evidencePack?.items?.length) {
    add('evidencePack', 65, { type: 'copy-evidence-pack', label_zh: '复制证据写作包' }, {
      status: context.evidencePack.status,
      reason_zh: context.evidencePack.message_zh,
      blocking: false,
    });
  }

  const sorted = actions
    .sort((a, b) => a.priority - b.priority || Number(b.blocking) - Number(a.blocking));
  const dedupedActions = dedupeQueuedActions(sorted).slice(0, 8);
  return {
    status: dedupedActions.some(action => action.blocking) ? 'blocked' : (dedupedActions.length ? 'ready' : 'empty'),
    label_zh: dedupedActions.some(action => action.blocking)
      ? '先处理阻塞动作'
      : (dedupedActions.length ? '下一步已排序' : '暂无下一步动作'),
    summary_zh: dedupedActions.length
      ? `已从流程、模式、上下文、RAG 和 Skill 中整理 ${dedupedActions.length} 个下一步动作。`
      : '当前没有额外动作，可以继续对话或写作。',
    actions: dedupedActions,
    copyText: formatActionQueueCopyText(dedupedActions),
  };
}

function buildAgentReadiness(context) {
  const dimensions = [
    buildTaskReadinessDimension(context),
    buildEvidenceReadinessDimension(context),
    buildContextReadinessDimension(context),
    buildRuntimeEnvironmentReadinessDimension(context),
    buildSkillReadinessDimension(context),
    buildModeSafetyDimension(context),
    buildCitationSafetyDimension(context),
    buildReviewSafetyDimension(context),
    buildNextActionReadinessDimension(context),
  ];
  const blockingDimensions = dimensions.filter(item => item.blocking);
  const productionWarnings = dimensions.filter(item => item.productionWarning);
  const rawScore = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / Math.max(dimensions.length, 1));
  const score = capAgentReadinessScore(rawScore, blockingDimensions);
  const status = blockingDimensions.length
    ? 'blocked'
    : productionWarnings.length
      ? 'needs-review'
      : (score >= 85 ? 'production-ready' : score >= 70 ? 'needs-review' : 'not-ready');
  const label_zh = status === 'production-ready'
    ? '当前任务达到生产可用'
    : status === 'needs-review'
      ? '接近生产可用，建议先复核'
      : status === 'blocked'
        ? '当前任务未达生产可用'
        : '当前任务暂不可用于正式写作';
  const summary_zh = blockingDimensions.length
    ? `还有 ${blockingDimensions.length} 个阻塞项，处理前不建议让 Agent 生成可采纳正文。`
    : productionWarnings.length
      ? `基础写作链路可用，但还有 ${productionWarnings.length} 个生产验收项未完成；可以生成可审查草稿，不能宣称已生产就绪。`
    : score >= 85
      ? '证据、Skill、模式边界、引用安全和输出审查均已就绪，可以生成可审查草稿。'
      : '基础链路可用，但仍有若干弱项；生成内容进入正文前必须按验收清单复核。';
  const nextActions = [
    ...blockingDimensions.map(item => item.action).filter(Boolean),
    ...(context.actionQueue?.actions || [])
      .filter(item => !item.blocking)
      .slice(0, 3)
      .map(item => item.action)
      .filter(Boolean),
  ].slice(0, 6);
  const acceptanceGate = {
    canDraft: !blockingDimensions.length && Boolean(context.writingPrompt?.text),
    canUseForCitableText: !blockingDimensions.length && context.citationPolicy?.allowUnsupportedClaims === false && context.evidencePack?.status === 'ready',
    requiresHumanReview: true,
    mustReviewWith: [
      '证据写作包',
      '引用安全策略',
      '验收清单',
      'AI 输出审查',
      '单句证据检查',
    ],
  };
  const readiness = {
    status,
    label_zh,
    score,
    summary_zh,
    dimensions,
    blockers: blockingDimensions.map(item => ({
      id: item.id,
      label_zh: item.label_zh,
      detail_zh: item.detail_zh,
      action: item.action,
    })),
    productionWarnings: productionWarnings.map(item => ({
      id: item.id,
      label_zh: item.label_zh,
      detail_zh: item.detail_zh,
      action: item.action,
    })),
    nextActions,
    acceptanceGate,
    readinessTiers: buildReadinessTiers({ blockingDimensions, productionWarnings, acceptanceGate, score }),
    copyText: '',
  };
  readiness.copyText = formatAgentReadinessCopyText(readiness);
  return readiness;
}

function buildReadinessTiers({ blockingDimensions = [], productionWarnings = [], acceptanceGate = {}, score = 0 } = {}) {
  const hasBlocking = blockingDimensions.length > 0;
  const hasProductionWarnings = productionWarnings.length > 0;
  return [
    {
      id: 'reviewable-draft',
      label_zh: '可审查草稿级',
      status: acceptanceGate.canDraft ? 'ready' : 'blocked',
      allowed_zh: acceptanceGate.canDraft
        ? '可以生成或继续整理可审查草稿、计划、证据包和修订提示词。'
        : '暂不建议生成草稿；先处理阻塞项。',
      required_zh: acceptanceGate.canDraft
        ? '生成后必须运行 AI 输出审查，并按证据包核对引用事实。'
        : '补齐任务、上下文、证据或模式门槛后再生成。',
    },
    {
      id: 'human-adoption',
      label_zh: '人工采纳级',
      status: !hasBlocking && acceptanceGate.canUseForCitableText ? 'ready' : 'needs-review',
      allowed_zh: !hasBlocking && acceptanceGate.canUseForCitableText
        ? '可以生成安全采纳包，由用户按人工应用指南手动放回论文。'
        : '只能作为待修订材料，不能直接进入论文正文。',
      required_zh: '必须完成 AI 输出审查、单句证据检查、目标章节确认和人工应用指南。',
    },
    {
      id: 'production-release',
      label_zh: '生产发布级',
      status: !hasBlocking && !hasProductionWarnings && score >= 85 ? 'ready' : 'blocked',
      allowed_zh: !hasBlocking && !hasProductionWarnings && score >= 85
        ? '可以把当前链路视为已通过生产验收。'
        : '不能宣称生产就绪；只能说明基础写作链路或草稿链路可用。',
      required_zh: hasProductionWarnings
        ? `先完成 ${productionWarnings.length} 个生产验收项，尤其是运行环境和浏览器 E2E。`
        : '持续保留隐私、引用安全、浏览器 E2E 和 OCR 恢复验证证据。',
    },
  ];
}

function capAgentReadinessScore(rawScore, blockingDimensions = []) {
  if (!blockingDimensions.length) return rawScore;
  const blockingIds = new Set(blockingDimensions.map(item => item.id));
  let cap = 70;
  if (blockingIds.has('context')) cap = Math.min(cap, 65);
  if (blockingIds.has('evidence') || blockingIds.has('citation-safety')) cap = Math.min(cap, 45);
  if (blockingIds.has('runtime-environment')) cap = Math.min(cap, 55);
  if (blockingIds.has('task')) cap = Math.min(cap, 25);
  return Math.min(rawScore, cap);
}

function buildRuntimeEnvironmentGuide({ documents = [], ragSummary = {} } = {}) {
  const ocrCapability = buildOcrCapability();
  const browserE2eCapability = buildBrowserE2eCapability();
  const documentsNeedingOcr = documents.filter(document =>
    document.parseStatus === 'failed' &&
    ['needs-ocr', 'pdf-not-extracted'].includes(document.recovery?.code)
  );
  const blocksProduction = documentsNeedingOcr.length > 0 && !ocrCapability.serverCanRunOcr;
  const productionGates = buildRuntimeProductionGates({ ocrCapability, browserE2eCapability });
  const hasProductionGateGaps = productionGates.some(gate => gate.requiredForProduction && gate.status !== 'ready');
  const status = blocksProduction
    ? 'blocked'
    : hasProductionGateGaps
      ? 'needs-production-validation'
      : 'ready';
  const guide = {
    status,
    label_zh: status === 'ready'
      ? '运行环境生产 Gate 已通过'
      : status === 'blocked'
        ? '运行环境缺少 OCR 工具'
        : '运行环境生产 Gate 未完成',
    summary_zh: status === 'ready'
      ? '服务器 OCR、PDF 文本抽取和真实浏览器 E2E 均已通过生产验收；请保留复验证据。'
      : status === 'blocked'
        ? `有 ${documentsNeedingOcr.length} 个 PDF 需要 OCR，但服务器没有可运行的 OCRmyPDF；请上传 OCR 后 PDF 或人工摘录。`
        : '至少一个生产 Gate 未通过；可以继续生成可审查草稿，但不能宣称生产发布级已就绪。',
    ocrCapability,
    browserE2eCapability,
    documentsNeedingOcr: documentsNeedingOcr.map(document => ({
      path: document.path,
      title: document.title,
      recoveryCode: document.recovery?.code || '',
      label_zh: document.recovery?.label_zh || document.label_zh || '',
    })),
    checks: [
      {
        id: 'ocr-tooling',
        label_zh: '服务器 OCR 工具',
        status: ocrCapability.status,
        blocking: blocksProduction,
        detail_zh: ocrCapability.recoveryInstruction_zh,
      },
      {
        id: 'scanned-pdf-recovery',
        label_zh: '扫描版 PDF 恢复',
        status: documentsNeedingOcr.length ? 'needs-recovery' : 'clear',
        blocking: blocksProduction,
        detail_zh: documentsNeedingOcr.length
          ? `当前有 ${documentsNeedingOcr.length} 个文档需要 OCR 或人工摘录。`
          : '当前最近证据文档中没有检测到必须 OCR 的阻塞 PDF。',
      },
      {
        id: 'browser-e2e-preflight',
        label_zh: '真实浏览器 E2E 预检',
        status: browserE2eCapability.status,
        blocking: false,
        detail_zh: browserE2eCapability.detail_zh,
      },
    ],
    productionGates,
    nextActions: blocksProduction
      ? [
          { type: 'copy-ocr-recovery-command-pack', label_zh: '复制 OCR 工具安装/验收命令', commandPack: ocrCapability.commandPack },
          { type: 'upload-ocr-pdf', label_zh: '上传 OCR 后 PDF' },
          { type: 'import-manual-evidence', label_zh: '导入已核对 OCR/人工摘录' },
        ]
      : ocrCapability.serverCanRunOcr
        ? [{ type: 'run-ocr-queue-if-needed', label_zh: '需要时运行受控 OCR 队列' }]
        : [{ type: 'prepare-manual-ocr-fallback', label_zh: '准备 OCR 后 PDF 或人工摘录兜底', commandPack: ocrCapability.commandPack }],
    recheckPlan: null,
    copyText: '',
  };
  guide.recheckPlan = buildRuntimeRecheckPlan(guide, ragSummary);
  guide.copyText = formatRuntimeEnvironmentCopyText(guide, ragSummary);
  return guide;
}

function buildRuntimeProductionGates({ ocrCapability = {}, browserE2eCapability = {} } = {}) {
  return [
    {
      id: 'server-ocr',
      label_zh: '服务器 OCR 自动恢复',
      status: ocrCapability.serverCanRunOcr ? 'ready' : 'blocked',
      requiredForProduction: true,
      detail_zh: ocrCapability.serverCanRunOcr
        ? 'OCRmyPDF 可用，扫描版 PDF 可进入受控 OCR 队列。'
        : '未检测到 OCRmyPDF；扫描版 PDF 只能依赖外部 OCR 后 PDF 或人工摘录。',
      action: ocrCapability.serverCanRunOcr
        ? { type: 'run-ocr-queue-if-needed', label_zh: '需要时运行受控 OCR 队列' }
        : { type: 'copy-ocr-recovery-command-pack', label_zh: '复制 OCR 安装/验收命令', commandPack: ocrCapability.commandPack || '' },
    },
    {
      id: 'pdf-text-extraction',
      label_zh: 'PDF 文本抽取',
      status: ocrCapability.pdfTextExtractionAvailable ? 'ready' : 'blocked',
      requiredForProduction: true,
      detail_zh: ocrCapability.pdfTextExtractionAvailable
        ? 'pdftotext 可用，普通可复制文本 PDF 有优先抽取路径。'
        : '未检测到 pdftotext；普通文本 PDF 的生产抽取能力未通过验收。',
      action: ocrCapability.pdfTextExtractionAvailable
        ? { type: 'record-pdf-extraction-proof', label_zh: '保存 PDF 抽取验收输出' }
        : { type: 'copy-ocr-recovery-command-pack', label_zh: '复制 poppler-utils 安装/验收命令', commandPack: ocrCapability.commandPack || '' },
    },
    {
      id: 'browser-e2e',
      label_zh: '真实浏览器 E2E',
      status: browserE2eCapability.status === 'ready' ? 'ready' : 'blocked',
      requiredForProduction: true,
      detail_zh: browserE2eCapability.status === 'ready'
        ? '完整 Playwright E2E 验收已通过。'
        : browserE2eCapability.detail_zh || '完整 Playwright E2E 尚未通过。',
      action: browserE2eCapability.status === 'ready'
        ? { type: 'record-browser-e2e-proof', label_zh: '保存浏览器 E2E 验收输出' }
        : {
            type: 'run-browser-e2e-preflight',
            label_zh: '运行 Playwright 预检和浏览器 E2E',
            command: browserE2eCapability.command || 'node scripts/playwright-preflight.mjs',
            commandPack: browserE2eCapability.commandPack || browserE2eCapability.command || 'node scripts/playwright-preflight.mjs',
          },
    },
  ];
}

function buildBrowserE2eCapability() {
  const command = 'node scripts/playwright-preflight.mjs';
  const e2eCommand = 'pnpm e2e';
  const preflightState = readBrowserE2ePreflightState();
  const e2eState = readBrowserE2eAcceptanceState();
  const preflightPassed = preflightState?.status === 'passed';
  const preflightFailed = preflightState?.status === 'failed';
  const e2ePassed = e2eState?.status === 'passed';
  const e2eFailed = ['failed', 'failed-preflight'].includes(e2eState?.status);
  const commandPack = [
    '# Paper Agent 浏览器 E2E 生产验收命令',
    '# 1. 先确认 Chromium 能启动',
    command,
    '',
    '# 2. 如果预检提示缺少浏览器或系统依赖，在可安装依赖的环境执行',
    'npx playwright install',
    'sudo npx playwright install-deps',
    '',
    '# 3. 依赖安装后重新运行预检，再运行项目浏览器 E2E 测试',
    command,
    e2eCommand,
  ].join('\n');
  return {
    status: e2ePassed
      ? 'ready'
      : e2eFailed
        ? e2eState.status
        : preflightPassed
          ? 'preflight-passed'
          : preflightFailed
            ? 'failed-preflight'
            : 'not-verified-in-workbench',
    label_zh: e2ePassed
      ? '真实浏览器 E2E 已通过'
      : e2eFailed
        ? '真实浏览器 E2E 验收失败'
        : preflightPassed
          ? '浏览器预检已通过，完整 E2E 未验收'
          : preflightFailed
            ? '真实浏览器 E2E 预检失败'
            : '真实浏览器 E2E 未在工作台内验证',
    canRunInWorkbench: false,
    requiredBeforeProduction: true,
    detail_zh: e2ePassed
      ? `最近一次完整 Playwright E2E 验收已通过（${e2eState.checkedAt || '时间未知'}）。`
      : e2eFailed
        ? `最近一次完整 Playwright E2E 验收失败（${e2eState.checkedAt || '时间未知'}）：${e2eState.message || '未记录失败原因'}`
        : preflightPassed
          ? `最近一次 Playwright 预检已通过（${preflightState.checkedAt || '时间未知'}）；发布前仍需运行 ${e2eCommand} 验证页面点击流、剪贴板、可编辑回复区、上传/导入/删除和采纳包交互。`
          : preflightFailed
            ? `最近一次 Playwright 预检失败（${preflightState.checkedAt || '时间未知'}）：${preflightState.message || '未记录失败原因'}`
            : '工作台不会在每次分析时启动 Chromium；发布前必须单独运行 Playwright 预检和真实浏览器 E2E，验证页面点击流、剪贴板、可编辑回复区、上传/导入/删除和采纳包交互。',
    command,
    e2eCommand,
    commandPack,
    lastCheckedAt: e2eState?.checkedAt || preflightState?.checkedAt || '',
    preflightState,
    e2eState,
    installHint_zh: e2ePassed
      ? '完整浏览器 E2E 已通过；请保存输出作为生产发布证据。'
      : preflightPassed
        ? `浏览器预检已通过；请继续运行 ${e2eCommand} 并保存输出作为生产发布证据。`
        : '如果预检提示缺少系统库，请执行 npx playwright install 和 sudo npx playwright install-deps，或在具备 Playwright 浏览器依赖的环境运行 E2E。',
  };
}

function readBrowserE2ePreflightState() {
  const statePath = resolve(
    process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH || '.paper-agent-runtime/playwright-preflight.json'
  );
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8'));
    if (!['passed', 'failed'].includes(parsed.status)) return null;
    return {
      status: parsed.status,
      checkedAt: String(parsed.checkedAt || ''),
      command: String(parsed.command || 'node scripts/playwright-preflight.mjs'),
      message: String(parsed.message || ''),
      missingLibrary: String(parsed.missingLibrary || ''),
    };
  } catch {
    return null;
  }
}

function readBrowserE2eAcceptanceState() {
  const statePath = resolve(
    process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH || '.paper-agent-runtime/playwright-e2e.json'
  );
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8'));
    if (!['passed', 'failed', 'failed-preflight'].includes(parsed.status)) return null;
    return {
      status: parsed.status,
      checkedAt: String(parsed.checkedAt || ''),
      command: String(parsed.command || 'pnpm e2e'),
      preflightCommand: String(parsed.preflightCommand || 'node scripts/playwright-preflight.mjs'),
      testCommand: String(parsed.testCommand || 'playwright test'),
      exitCode: Number.isFinite(Number(parsed.exitCode)) ? Number(parsed.exitCode) : null,
      message: String(parsed.message || ''),
    };
  } catch {
    return null;
  }
}

function buildRuntimeRecheckPlan(guide, ragSummary = {}) {
  const ocrCommandPack = guide.ocrCapability?.commandPack || [
    'command -v ocrmypdf || true',
    'command -v tesseract || true',
    'command -v pdftotext || true',
  ].join('\n');
  const browserCommandPack = guide.browserE2eCapability?.commandPack || guide.browserE2eCapability?.command || 'node scripts/playwright-preflight.mjs';
  const gateStatuses = new Map((guide.productionGates || []).map(gate => [gate.id, gate.status]));
  const needsOcrRecovery =
    gateStatuses.get('server-ocr') !== 'ready' ||
    gateStatuses.get('pdf-text-extraction') !== 'ready' ||
    guide.documentsNeedingOcr.length > 0;
  const needsBrowserE2e = gateStatuses.get('browser-e2e') !== 'ready';
  const steps = [
    {
      id: 'install-or-confirm-ocr',
      label_zh: '安装或确认 OCR/PDF 抽取工具',
      detail_zh: needsOcrRecovery
        ? '执行 OCR 命令包；如果服务器没有安装权限，改用 OCR 后 PDF 或人工摘录导入。'
        : 'OCR 工具当前可用，保留命令输出作为生产验收证据。',
      commandPack: ocrCommandPack,
    },
    {
      id: 'run-browser-preflight',
      label_zh: '运行真实浏览器 E2E 预检',
      detail_zh: '执行 Playwright 预检；如果缺少系统库，按命令包安装浏览器和系统依赖，或换到具备依赖的环境运行。',
      commandPack: browserCommandPack,
    },
    {
      id: 'reanalyze-workbench',
      label_zh: '重新分析工作台',
      detail_zh: '依赖修复后回到 Paper Agent 工作台点击“分析任务”或“重新评估生产可用性”，让 OCR、E2E 和可用性分级重新计算。',
    },
    {
      id: 'rerun-evidence-flow',
      label_zh: '重跑证据链路验收',
      detail_zh: '对扫描 PDF 运行受控 OCR 队列或导入人工摘录，然后重建索引、检索证据、运行 AI 输出审查和单句证据检查。',
    },
  ];
  const successCriteria = [
    'OCR 命令检查能显示 ocrmypdf、tesseract 和 pdftotext 可用，或每个扫描 PDF 都有 OCR 后 PDF/人工摘录兜底。',
    'node scripts/playwright-preflight.mjs 成功启动 Chromium，并且 pnpm e2e 完整通过真实浏览器 E2E。',
    '重新分析后 runtimeEnvironment 不再是 blocked，agentReadiness.readinessTiers.production-release 不再因为运行环境缺口阻塞。',
    `RAG 摘要中解析失败和 metadata-only 文档数量可解释；当前摘要：failed=${ragSummary.failed || 0}，metadataOnly=${ragSummary.metadataOnly || 0}，indexedChunks=${ragSummary.indexedChunks || 0}。`,
  ];
  const plan = {
    status: needsOcrRecovery || needsBrowserE2e ? 'required-before-production' : 'ready-to-record',
    label_zh: needsOcrRecovery || needsBrowserE2e ? '依赖修复后必须复验' : '运行环境复验证据可记录',
    summary_zh: needsOcrRecovery || needsBrowserE2e
      ? '安装 OCR/浏览器依赖本身不等于生产就绪；必须按顺序重跑命令、重新分析工作台，并确认生产发布级不再被运行环境阻塞。'
      : '运行环境当前未发现阻塞，但生产发布前仍应保存 OCR、Playwright 和工作台重新分析的验收输出。',
    steps,
    successCriteria,
    copyText: '',
  };
  plan.copyText = formatRuntimeRecheckPlanCopyText(plan);
  return plan;
}

function formatRuntimeRecheckPlanCopyText(plan) {
  return [
    '# 依赖修复后复验计划',
    `${plan.label_zh}（${plan.status}）`,
    plan.summary_zh,
    '',
    '# 复验步骤',
    ...(plan.steps || []).map((step, index) => [
      `${index + 1}. ${step.label_zh}`,
      `   - ${step.detail_zh}`,
      step.commandPack ? `   - 命令包：\n${step.commandPack}` : '',
    ].filter(Boolean).join('\n')),
    '',
    '# 通过标准',
    ...(plan.successCriteria || []).map(item => `- ${item}`),
  ].join('\n');
}

function formatRuntimeEnvironmentCopyText(guide, ragSummary = {}) {
  return [
    '# Paper Agent 运行环境能力',
    `${guide.label_zh}（${guide.status}）`,
    guide.summary_zh,
    '',
    '# OCR 能力',
    `${guide.ocrCapability.label_zh}（${guide.ocrCapability.status}）`,
    `自动 OCR 恢复：${guide.ocrCapability.automaticRecoveryAvailable ? '可用' : '未启用'}`,
    '命令包：',
    guide.ocrCapability.commandPack || '',
    guide.ocrCapability.installHint_zh || '',
    '',
    '# 浏览器 E2E 能力',
    `${guide.browserE2eCapability.label_zh}（${guide.browserE2eCapability.status}）`,
    `生产发布前必须验证：${guide.browserE2eCapability.requiredBeforeProduction ? '是' : '否'}`,
    `预检命令：${guide.browserE2eCapability.command}`,
    '命令包：',
    guide.browserE2eCapability.commandPack || guide.browserE2eCapability.command,
    guide.browserE2eCapability.installHint_zh || '',
    '',
    '# 生产验收 Gate',
    ...(guide.productionGates || []).map(item => [
      `- ${item.label_zh}：${item.status}`,
      `  - 要求：${item.requiredForProduction ? '生产发布前必须通过' : '非必需'}`,
      `  - 说明：${item.detail_zh}`,
      item.action?.label_zh ? `  - 动作：${item.action.label_zh}` : '',
    ].filter(Boolean).join('\n')),
    '',
    '# 扫描版/不可抽取 PDF',
    guide.documentsNeedingOcr.length
      ? guide.documentsNeedingOcr.map(item => `- ${item.path}：${item.label_zh || item.recoveryCode}`).join('\n')
      : '- 当前最近证据文档中没有必须 OCR 的阻塞 PDF。',
    '',
    '# RAG 文档摘要',
    `文档总数：${ragSummary.total || 0}`,
    `解析失败：${ragSummary.failed || 0}`,
    `仅 metadata：${ragSummary.metadataOnly || 0}`,
    `可检索 chunks：${ragSummary.indexedChunks || 0}`,
    '',
    guide.recheckPlan?.copyText || '',
    '',
    '# 下一步',
    ...guide.nextActions.map(action => `- ${action.label_zh}`),
  ].filter(Boolean).join('\n');
}

function buildTaskReadinessDimension(context) {
  const hasTask = Boolean(context.task);
  return {
    id: 'task',
    label_zh: '任务是否明确',
    status: hasTask ? 'ready' : 'blocked',
    score: hasTask ? 100 : 0,
    blocking: !hasTask,
    detail_zh: hasTask ? '已收到论文任务，可以进行路由和工作包生成。' : '还没有输入论文任务。',
    evidence_zh: hasTask ? `任务：${context.task}` : '任务为空。',
    action: hasTask ? null : { type: 'focus-task', label_zh: '先输入论文任务' },
  };
}

function buildEvidenceReadinessDimension(context) {
  const citationSensitive = Boolean(context.citationPolicy?.citationSensitive || context.evidencePack?.citationSensitive);
  if (!citationSensitive) {
    return {
      id: 'evidence',
      label_zh: '证据是否可用',
      status: 'not-required',
      score: 90,
      blocking: false,
      detail_zh: '当前任务不明显依赖文献引用，RAG 证据不是硬门槛。',
      evidence_zh: context.rag?.health?.message_zh || '未要求证据。',
      action: null,
    };
  }
  const hasEvidence = context.evidencePack?.status === 'ready' && (context.evidencePack?.items || []).length > 0;
  const needsRepair = ['unusable', 'needs-repair'].includes(context.rag?.health?.status) || context.rag?.repairGuide?.status === 'needs-repair';
  const blocking = !hasEvidence || needsRepair;
  return {
    id: 'evidence',
    label_zh: '证据是否可用于论文写作',
    status: hasEvidence && !needsRepair ? 'ready' : 'blocked',
    score: hasEvidence && !needsRepair ? 100 : needsRepair ? 30 : 45,
    blocking,
    detail_zh: hasEvidence && !needsRepair
      ? '已有可编号、可审查的证据片段。'
      : '当前证据不足或文档解析需要修复，不建议生成带引用的正文。',
    evidence_zh: `RAG：${context.rag?.health?.label_zh || '未知'}；证据片段：${context.evidencePack?.evidenceCount || 0}`,
    action: blocking
      ? (context.rag?.repairGuide?.repairPlan?.steps?.[0]?.action || { type: 'upload-evidence', label_zh: '补充或修复证据' })
      : { type: 'copy-evidence-pack', label_zh: '复制证据包' },
  };
}

function buildContextReadinessDimension(context) {
  const blocked = context.contextReadiness?.status === 'blocked';
  return {
    id: 'context',
    label_zh: '上下文是否足够',
    status: blocked ? 'blocked' : 'ready',
    score: blocked ? Math.max(Number(context.contextReadiness?.score || 0), 35) : 100,
    blocking: blocked,
    detail_zh: blocked
      ? context.contextReadiness?.message_zh || '仍缺少关键上下文。'
      : '目标章节、任务背景和关键材料已足够进入可审查草稿阶段。',
    evidence_zh: context.contextReadiness?.label_zh || '未评估。',
    action: blocked
      ? (context.clarificationQuestions?.[0]?.action || { type: 'answer-context', label_zh: '补齐上下文' })
      : null,
  };
}

function buildRuntimeEnvironmentReadinessDimension(context) {
  const runtime = context.runtimeEnvironment || buildRuntimeEnvironmentGuide({
    documents: context.rag?.recentDocuments || [],
    ragSummary: context.rag?.summary || {},
  });
  const blocking = runtime.status === 'blocked';
  const autoOcrReady = Boolean(runtime.ocrCapability?.serverCanRunOcr);
  const pdfTextExtractionReady = runtime.ocrCapability?.pdfTextExtractionAvailable !== false;
  const ocrToolingIncomplete = !autoOcrReady || !pdfTextExtractionReady;
  const browserE2eUnverified = Boolean(
    runtime.browserE2eCapability?.requiredBeforeProduction &&
    runtime.browserE2eCapability?.status !== 'ready'
  );
  const browserE2eAction = browserE2eUnverified
    ? {
        type: 'run-browser-e2e-preflight',
        label_zh: '运行 Playwright 预检和浏览器 E2E',
        command: runtime.browserE2eCapability?.command || 'node scripts/playwright-preflight.mjs',
        commandPack: runtime.browserE2eCapability?.commandPack || runtime.browserE2eCapability?.command || 'node scripts/playwright-preflight.mjs',
      }
    : null;
  const ocrToolingAction = ocrToolingIncomplete
    ? (runtime.nextActions?.find(action => action.commandPack) || runtime.nextActions?.[0] || {
        type: 'copy-ocr-recovery-command-pack',
        label_zh: '复制 OCR 工具安装/验收命令',
        commandPack: runtime.ocrCapability?.commandPack || '',
      })
    : null;
  return {
    id: 'runtime-environment',
    label_zh: '运行环境是否支持生产恢复',
    status: blocking
      ? 'blocked'
      : browserE2eUnverified
        ? 'needs-browser-e2e'
        : ocrToolingIncomplete
          ? 'needs-ocr-tooling'
          : runtime.status || 'unknown',
    score: blocking ? 35 : browserE2eUnverified ? 75 : ocrToolingIncomplete ? 80 : 100,
    blocking,
    productionWarning: !blocking && (browserE2eUnverified || ocrToolingIncomplete),
    detail_zh: runtime.summary_zh || '未评估运行环境能力。',
    evidence_zh: runtime.ocrCapability
      ? `OCR：${runtime.ocrCapability.label_zh}；PDF 文本抽取：${runtime.ocrCapability.pdfTextExtractionAvailable ? '可用' : '未验证/不可用'}；需 OCR 文档：${runtime.documentsNeedingOcr?.length || 0}；浏览器 E2E：${runtime.browserE2eCapability?.label_zh || '未报告'}`
      : 'OCR 能力未确认。',
    action: blocking ? (runtime.nextActions?.[0] || null) : (browserE2eAction || ocrToolingAction || runtime.nextActions?.[0] || null),
  };
}

function buildSkillReadinessDimension(context) {
  const primary = context.skills?.recommendations?.[0]?.skill;
  const hasNavigator = (context.skills?.navigator?.cards || []).length > 0;
  const ready = Boolean(primary && hasNavigator);
  return {
    id: 'skill',
    label_zh: 'Skill 是否可发现且选对',
    status: ready ? 'ready' : 'needs-task',
    score: ready ? 100 : 40,
    blocking: false,
    detail_zh: ready
      ? `已推荐“${primary.display_name_zh || primary.name}”，并提供中文导航、标签和对比。`
      : '还没有足够任务信息来推荐 Skill。',
    evidence_zh: ready ? `候选 Skill：${context.skills.recommendations.length}` : '暂无候选 Skill。',
    action: ready ? { type: 'activate-skill', label_zh: `启用 ${primary.display_name_zh || primary.name}`, skill: primary.name } : null,
  };
}

function buildModeSafetyDimension(context) {
  const explicit = context.interactionPlan?.requiresExplicitUserAction !== false;
  const hasCenter = Boolean(context.modeActionCenter?.primaryAction);
  const guarded = explicit && hasCenter && (context.interactionPlan?.forbiddenActions || []).length > 0;
  return {
    id: 'mode-safety',
    label_zh: 'Chat / Agent / Tools 边界是否安全',
    status: guarded ? 'ready' : 'needs-review',
    score: guarded ? 100 : 60,
    blocking: false,
    detail_zh: guarded
      ? '模式选择、主动作、确认门槛和禁止动作均已生成；不会自动发送、执行或写文件。'
      : '模式边界信息不完整，用户可能误以为会自动执行。',
    evidence_zh: context.modeActionCenter?.label_zh || context.interactionPlan?.primaryCta_zh || '未生成模式操作中心。',
    action: hasCenter ? context.modeActionCenter.primaryAction : { type: 'review-interaction-plan', label_zh: '查看执行预案' },
  };
}

function buildCitationSafetyDimension(context) {
  const sensitive = Boolean(context.citationPolicy?.citationSensitive || context.evidencePack?.citationSensitive);
  const hasPolicy = Boolean(context.citationPolicy?.requiredBehaviors?.length && context.citationPolicy?.forbiddenBehaviors?.length);
  const hasChecklist = Boolean(context.acceptanceChecklist?.items?.length);
  const ready = hasPolicy && hasChecklist && (!sensitive || context.evidencePack?.status === 'ready');
  return {
    id: 'citation-safety',
    label_zh: '引用安全是否受控',
    status: ready ? 'ready' : 'blocked',
    score: ready ? 100 : 45,
    blocking: !ready && sensitive,
    detail_zh: ready
      ? '引用安全规则、证据包和验收清单已进入最终提示词。'
      : '引用敏感任务缺少可用证据或安全规则，不应生成可采纳引用正文。',
    evidence_zh: `${context.citationPolicy?.label_zh || '未评估'}；验收项：${context.acceptanceChecklist?.items?.length || 0}`,
    action: ready ? { type: 'review-acceptance-checklist', label_zh: '审查验收清单' } : { type: 'copy-evidence-pack', label_zh: '先补证据包' },
  };
}

function buildReviewSafetyDimension(context) {
  const hasPrompt = Boolean(context.writingPrompt?.text);
  const hasChecklist = Boolean(context.acceptanceChecklist?.items?.length);
  return {
    id: 'output-review',
    label_zh: '输出审查是否闭环',
    status: hasPrompt && hasChecklist ? 'ready' : 'needs-review',
    score: hasPrompt && hasChecklist ? 95 : 55,
    blocking: false,
    detail_zh: hasPrompt && hasChecklist
      ? '工作台已准备 AI 输出审查和单句证据检查所需的任务、证据和验收清单。'
      : '缺少提示词或验收清单，生成后难以判断能否采纳。',
    evidence_zh: hasPrompt ? 'writingPrompt 已生成。' : 'writingPrompt 未生成。',
    action: { type: 'review-answer', label_zh: '生成后审查 AI 输出' },
  };
}

function buildNextActionReadinessDimension(context) {
  const actions = context.actionQueue?.actions || [];
  return {
    id: 'next-actions',
    label_zh: '下一步是否清楚',
    status: actions.length ? 'ready' : 'empty',
    score: actions.length ? 95 : 60,
    blocking: false,
    detail_zh: actions.length
      ? `已整理 ${actions.length} 个下一步动作，阻塞项会优先显示。`
      : '没有生成操作队列，用户可能不知道下一步做什么。',
    evidence_zh: context.actionQueue?.label_zh || '暂无操作队列。',
    action: actions[0]?.action || null,
  };
}

function formatAgentReadinessCopyText(readiness) {
  return [
    '# Paper Agent 生产可用性',
    `${readiness.label_zh}（${readiness.score}/100）`,
    readiness.summary_zh,
    '',
    '# 维度检查',
    ...(readiness.dimensions || []).map(item => [
      `- ${item.blocking ? '阻塞' : '通过'}：${item.label_zh}（${item.status}，${item.score}/100）`,
      `  - ${item.detail_zh}`,
      `  - 证据：${item.evidence_zh}`,
    ].join('\n')),
    '',
    '# 必须先处理',
    ...(readiness.blockers?.length
      ? readiness.blockers.map(item => `- ${item.label_zh}：${item.detail_zh}`)
      : ['- 无阻塞项。']),
    '',
    '# 生产验收警告',
    ...(readiness.productionWarnings?.length
      ? readiness.productionWarnings.map(item => `- ${item.label_zh}：${item.detail_zh}`)
      : ['- 无生产验收警告。']),
    '',
    '# 可用性分级',
    ...(readiness.readinessTiers || []).map(item => [
      `- ${item.label_zh}：${item.status}`,
      `  - 允许：${item.allowed_zh}`,
      `  - 要求：${item.required_zh}`,
    ].join('\n')),
    '',
    '# 采纳门槛',
    `- 可以生成草稿：${readiness.acceptanceGate.canDraft ? '是' : '否'}`,
    `- 可以写引用型正文：${readiness.acceptanceGate.canUseForCitableText ? '是' : '否'}`,
    '- 必须人工复核：是',
  ].join('\n');
}

function normalizeQueuedAction(source, priority, action, meta = {}) {
  if (!action || !action.type) return null;
  return {
    id: `${source}:${action.type}:${action.skill || action.query || action.label_zh || meta.code || ''}`,
    source,
    priority,
    type: action.type,
    label_zh: action.label_zh || action.type,
    status: meta.status || action.status || 'suggested',
    reason_zh: meta.reason_zh || action.reason_zh || '',
    blocking: Boolean(meta.blocking || action.blocking),
    requiresExplicitUserAction: action.requiresExplicitUserAction !== false,
    action,
    code: meta.code || action.code || '',
    contextKey: meta.contextKey || action.contextKey || '',
  };
}

function dedupeQueuedActions(actions) {
  const seen = new Set();
  const deduped = [];
  for (const action of actions) {
    const key = `${action.type}:${action.action?.skill || action.action?.query || action.contextKey || action.label_zh}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(action);
  }
  return deduped;
}

function formatActionQueueCopyText(actions) {
  return [
    '# 下一步操作队列',
    ...(actions.length ? actions.map((action, index) => [
      `${index + 1}. ${action.label_zh}${action.blocking ? '（阻塞）' : ''}`,
      `   - 来源：${action.source}`,
      `   - 原因：${action.reason_zh || action.status}`,
      `   - 动作类型：${action.type}`,
    ].join('\n')) : ['暂无下一步动作。']),
  ].join('\n');
}

function buildWorkbenchUiModel(context) {
  const primarySkill = context.skills?.recommendations?.[0]?.skill || null;
  const blockingChecklist = context.acceptanceChecklist?.items?.filter(item => item.blocking) || [];
  const primaryAction = buildPrimaryUiAction(context, primarySkill);

  return {
    version: 1,
    locale: 'zh-CN',
    layout: {
      density: 'compact',
      primaryColumn: [
        'agent-readiness',
        'paper-workflow-guide',
        'task-routing',
        'interaction-plan',
        'mode-action-center',
        'action-queue',
        'next-actions',
        'skill-navigator',
        'skill-picker',
        'skill-compare',
        'evidence-drawer',
        'evidence-pack',
        'writing-prompt',
      ],
      secondaryColumn: [
        'context-readiness',
        'rag-health',
        'rag-repair-guide',
        'citation-policy',
        'acceptance-checklist',
        'recent-documents',
      ],
    },
    primaryAction,
    workflowGuide: {
      title_zh: '论文写作流程向导',
      subtitle_en: 'Paper Workflow',
      source: 'paperWorkflowGuide',
      currentStep: context.paperWorkflowGuide?.currentStep || null,
      stepCount: context.paperWorkflowGuide?.steps?.length || 0,
      display: {
        titleField: 'title_zh',
        subtitleField: 'subtitle_en',
        statusField: 'status',
        actionField: 'action',
      },
      emptyState: {
        label_zh: '暂无流程向导',
        help_zh: '输入任务或加载演示数据后，工作台会生成从证据到审查的写作流程。',
      },
    },
    taskStarters: {
      title_zh: '论文任务入口',
      subtitle_en: 'Task Starters',
      source: 'taskStarters',
      display: {
        titleField: 'title_zh',
        subtitleField: 'subtitle_en',
        tagField: 'tags',
        disabledReasonField: 'disabledReason_zh',
      },
      emptyState: {
        label_zh: '暂无任务入口',
        help_zh: '刷新工作台后会按项目状态生成论文写作入口。',
      },
    },
    modeSwitcher: {
      selected: context.taskRouting?.mode || 'chat',
      source: 'taskRouting.mode',
      options: [
        {
          mode: 'chat',
          label_zh: '对话',
          help_zh: '适合解释、总结、澄清和轻量建议。',
          risk_level: 'low',
        },
        {
          mode: 'agent',
          label_zh: 'Agent 建议修改',
          help_zh: '适合论文正文写作、润色和结构修改；写入前必须确认。',
          risk_level: 'medium',
        },
        {
          mode: 'tools',
          label_zh: '工具执行',
          help_zh: '适合编译、运行脚本、统计、生成图表；执行前必须展示命令和风险。',
          risk_level: 'high',
        },
      ],
    },
    skillPicker: {
      title_zh: '推荐 Skill',
      subtitle_en: 'Skill Picker',
      source: 'skills.recommendations',
      selectedSkill: primarySkill?.name || '',
      display: {
        titleField: 'skill.display_name_zh',
        subtitleField: 'skill.subtitle_en',
        categoryField: 'skill.category_zh',
        tagField: 'skill.tags',
        hoverFields: [
          'skill.inputs',
          'skill.outputs',
          'skill.best_for',
          'skill.not_for',
          'skill.task_templates',
        ],
        showChineseTitleFirst: true,
      },
      categoryChips: context.skills?.categories || [],
      emptyState: {
        label_zh: '还没有推荐 Skill',
        help_zh: '先输入论文任务，系统会按写作、文献、引用、实验、图表或投稿自动推荐。',
      },
    },
    evidenceDrawer: {
      title_zh: 'RAG 证据抽屉',
      subtitle_en: 'Evidence Drawer',
      source: 'rag.evidence.results',
      count: context.rag?.evidence?.results?.length || 0,
      status: context.rag?.health?.status || 'unusable',
      statusLabel_zh: context.rag?.health?.label_zh || '证据不可用',
      tone: statusTone(context.rag?.health?.status),
      actions: [
        { type: 'upload-evidence', label_zh: '上传文献' },
        { type: 'rebuild-index', label_zh: '重建索引' },
        { type: 'search-evidence', label_zh: '检索证据' },
        { type: 'copy-evidence', label_zh: '复制全部证据' },
      ],
      emptyState: {
        label_zh: '没有命中证据',
        help_zh: '换关键词、上传可复制文本的 PDF，或补充 Markdown 文献笔记。',
      },
    },
    panels: [
      {
        id: 'agent-readiness',
        title_zh: 'Paper Agent 生产可用性',
        source: 'agentReadiness',
        status: context.agentReadiness?.status || 'unknown',
        statusLabel_zh: context.agentReadiness?.label_zh || '未评估',
        tone: statusTone(context.agentReadiness?.status),
        priority: 3,
        summary_zh: context.agentReadiness?.summary_zh || '从证据、Skill、模式安全、引用安全、审查闭环和下一步动作判断当前任务是否可用于正式论文写作。',
        actions: context.agentReadiness?.nextActions || [],
      },
      {
        id: 'paper-workflow-guide',
        title_zh: '论文写作流程',
        source: 'paperWorkflowGuide',
        status: context.paperWorkflowGuide?.status || 'unknown',
        statusLabel_zh: context.paperWorkflowGuide?.label_zh || '未生成',
        tone: statusTone(context.paperWorkflowGuide?.status),
        priority: 5,
        summary_zh: context.paperWorkflowGuide?.summary_zh || '把上传证据、选择任务、确认上下文、生成草稿和审查输出串成一个流程。',
        actions: context.paperWorkflowGuide?.currentStep?.action ? [context.paperWorkflowGuide.currentStep.action] : [],
      },
      {
        id: 'task-routing',
        title_zh: '任务路由',
        source: 'taskRouting',
        status: context.taskRouting?.mode || 'chat',
        statusLabel_zh: context.taskRouting?.modeLabel_zh || '对话',
        tone: context.taskRouting?.requiresConfirmation ? 'warning' : 'neutral',
        priority: 10,
        summary_zh: firstText(context.taskRouting?.reasons) || '输入任务后会自动判断使用 Chat、Agent 还是 Tools。',
        actions: context.taskRouting?.nextActions || [],
      },
      {
        id: 'interaction-plan',
        title_zh: '执行预案',
        source: 'interactionPlan',
        status: context.interactionPlan?.mode || context.taskRouting?.mode || 'chat',
        statusLabel_zh: context.interactionPlan?.primaryCta_zh || '发送给 AI',
        tone: context.interactionPlan?.blockedReasons?.length
          ? 'danger'
          : (context.interactionPlan?.requiresConfirmation ? 'warning' : 'success'),
        priority: 15,
        summary_zh: firstText(context.interactionPlan?.steps?.map(step => step.detail_zh)) || '展示 Chat / Agent / Tools 的执行步骤和确认门槛。',
        actions: [
          {
            type: 'review-interaction-plan',
            label_zh: context.interactionPlan?.primaryCta_zh || '查看执行预案',
          },
        ],
      },
      {
        id: 'mode-decision-guide',
        title_zh: '模式决策指南',
        source: 'modeDecisionGuide',
        status: context.modeDecisionGuide?.status || 'unknown',
        statusLabel_zh: context.modeDecisionGuide?.label_zh || '未生成',
        tone: statusTone(context.modeDecisionGuide?.status),
        priority: 17,
        summary_zh: context.modeDecisionGuide?.summary_zh || '解释为什么选择 Chat、Agent 或 Tools，以及什么时候切换。',
        actions: [
          {
            type: 'copy-mode-decision',
            label_zh: '复制模式决策',
          },
        ],
      },
      {
        id: 'mode-action-center',
        title_zh: '模式操作中心',
        source: 'modeActionCenter',
        status: context.modeActionCenter?.status || 'unknown',
        statusLabel_zh: context.modeActionCenter?.label_zh || '未生成',
        tone: statusTone(context.modeActionCenter?.status),
        priority: 18,
        summary_zh: context.modeActionCenter?.summary_zh || '把当前模式、主按钮、阻塞项、切换选项和发送前检查整理成可执行操作。',
        actions: context.modeActionCenter?.primaryAction ? [context.modeActionCenter.primaryAction] : [],
      },
      {
        id: 'next-actions',
        title_zh: '下一步动作',
        source: 'workflowHints',
        status: context.workflowHints?.length ? 'has-actions' : 'clear',
        statusLabel_zh: context.workflowHints?.length ? `${context.workflowHints.length} 项建议` : '暂无额外动作',
        tone: context.workflowHints?.some(hint => hint.priority === 'high') ? 'danger' : 'neutral',
        priority: 20,
        summary_zh: firstText(context.workflowHints?.map(hint => hint.message_zh)) || '可以直接继续写作或提问。',
        actions: context.workflowHints?.map(hint => hint.action).filter(Boolean) || [],
      },
      {
        id: 'action-queue',
        title_zh: '操作队列',
        source: 'actionQueue',
        status: context.actionQueue?.status || 'empty',
        statusLabel_zh: context.actionQueue?.label_zh || '暂无下一步动作',
        tone: statusTone(context.actionQueue?.status),
        priority: 22,
        summary_zh: context.actionQueue?.summary_zh || '把流程、模式、上下文、RAG 和 Skill 动作合并成一个有序队列。',
        actions: context.actionQueue?.actions?.map(item => item.action).filter(Boolean) || [],
      },
      {
        id: 'task-starters',
        title_zh: '论文任务入口',
        source: 'taskStarters',
        status: context.taskStarters?.length ? 'ready' : 'empty',
        statusLabel_zh: context.taskStarters?.length ? `${context.taskStarters.length} 个入口` : '暂无入口',
        tone: context.taskStarters?.some(item => item.disabled) ? 'warning' : 'success',
        priority: 25,
        summary_zh: firstText(context.taskStarters?.map(item => item.help_zh)) || '从常见论文任务直接开始，不需要先理解 Skill 名称。',
        actions: context.taskStarters?.filter(item => !item.disabled).slice(0, 3).map(item => ({
          type: 'fill-task-template',
          label_zh: item.title_zh,
          task: item.prompt,
          skill: item.skill,
        })) || [],
      },
      {
        id: 'skill-navigator',
        title_zh: 'Skill 导航',
        source: 'skills.navigator',
        status: context.skills?.navigator?.cards?.length ? 'ready' : 'empty',
        statusLabel_zh: context.skills?.navigator?.cards?.length ? `${context.skills.navigator.cards.length} 个 Skill` : '暂无 Skill',
        tone: context.skills?.navigator?.cards?.length ? 'success' : 'warning',
        priority: 28,
        summary_zh: context.skills?.navigator?.summary_zh || '按分类、标签、风险和上下文需求理解 Skill。',
        actions: context.skills?.navigator?.categories?.slice(0, 4).map(category => ({
          type: 'filter-skill-category',
          label_zh: category.name,
        })) || [],
      },
      {
        id: 'skill-picker',
        title_zh: 'Skill 推荐',
        source: 'skills.recommendations',
        status: primarySkill ? 'recommended' : 'empty',
        statusLabel_zh: primarySkill ? primarySkill.display_name_zh || primarySkill.name : '暂无推荐',
        tone: primarySkill ? 'success' : 'neutral',
        priority: 30,
        summary_zh: primarySkill
          ? `${primarySkill.display_name_zh || primarySkill.name}：${primarySkill.subtitle_en || 'Skill'}`
          : '输入任务后会自动推荐最合适的 Skill。',
        actions: primarySkill ? [{ type: 'activate-skill', label_zh: `启用 ${primarySkill.display_name_zh || primarySkill.name}`, skill: primarySkill.name }] : [],
      },
      {
        id: 'skill-compare',
        title_zh: 'Skill 对比',
        source: 'skills.compareGuide',
        status: context.skills?.compareGuide?.status || 'empty',
        statusLabel_zh: context.skills?.compareGuide?.label_zh || '暂无可对比 Skill',
        tone: statusTone(context.skills?.compareGuide?.status),
        priority: 32,
        summary_zh: context.skills?.compareGuide?.summary_zh || '把候选 Skill 按用途、输入、产出、风险和取舍并排比较。',
        actions: context.skills?.compareGuide?.copyText
          ? [{ type: 'copy-skill-compare', label_zh: '复制 Skill 对比' }]
          : [],
      },
      {
        id: 'evidence-drawer',
        title_zh: 'RAG 证据',
        source: 'rag.evidence.results',
        status: context.citationPolicy?.status || 'not-required',
        statusLabel_zh: context.citationPolicy?.label_zh || '不需要引用约束',
        tone: statusTone(context.citationPolicy?.status),
        priority: 40,
        summary_zh: context.citationPolicy?.message_zh || '当前任务不明显依赖文献引用。',
        actions: context.rag?.evidence?.results?.length
          ? [{ type: 'copy-evidence', label_zh: '复制证据片段' }]
          : [{ type: 'upload-evidence', label_zh: '上传或补充证据' }],
      },
      {
        id: 'evidence-pack',
        title_zh: '证据写作包',
        source: 'evidencePack',
        status: context.evidencePack?.status || 'not-required',
        statusLabel_zh: context.evidencePack?.label_zh || '当前任务不需要证据包',
        tone: statusTone(context.evidencePack?.status),
        priority: 45,
        summary_zh: context.evidencePack?.message_zh || '把 RAG 命中整理成可复制、可审查的写作证据包。',
        actions: context.evidencePack?.items?.length
          ? [{ type: 'copy-evidence-pack', label_zh: '复制证据包' }]
          : (context.evidencePack?.fallbackActions || []),
      },
      {
        id: 'context-readiness',
        title_zh: '上下文准备度',
        source: 'contextReadiness',
        status: context.contextReadiness?.status || 'needs-context',
        statusLabel_zh: context.contextReadiness?.label_zh || '建议补充上下文',
        tone: statusTone(context.contextReadiness?.status),
        priority: 50,
        summary_zh: context.contextReadiness?.message_zh || '补齐任务上下文后回答更可靠。',
        actions: [
          ...(context.contextReadiness?.required || []),
          ...(context.contextReadiness?.recommended || []),
        ].map(item => item.action).filter(Boolean),
      },
      {
        id: 'clarification-questions',
        title_zh: '需要澄清的问题',
        source: 'clarificationQuestions',
        status: context.clarificationQuestions?.length ? 'needs-context' : 'ready',
        statusLabel_zh: context.clarificationQuestions?.length ? `${context.clarificationQuestions.length} 个问题` : '无需澄清',
        tone: context.clarificationQuestions?.some(item => item.priority === 'high') ? 'warning' : 'neutral',
        priority: 55,
        summary_zh: context.clarificationQuestions?.[0]?.question_zh || '当前任务可以直接进入写作或问答。',
        actions: context.clarificationQuestions?.map(item => item.action).filter(Boolean) || [],
      },
      {
        id: 'context-brief',
        title_zh: '上下文摘要',
        source: 'contextBrief',
        status: context.contextBrief?.status || 'needs-confirmation',
        statusLabel_zh: context.contextBrief?.label_zh || '需要确认上下文',
        tone: context.contextBrief?.status === 'ready' ? 'success' : 'warning',
        priority: 58,
        summary_zh: context.contextBrief?.summary_zh || '整理当前任务、模式、Skill、目标章节和仍需确认的问题。',
        actions: context.contextBrief?.copyText ? [{ type: 'copy-context-brief', label_zh: '复制上下文摘要' }] : [],
      },
      {
        id: 'draft-plan',
        title_zh: '写作计划',
        source: 'draftPlan',
        status: context.draftPlan?.status || 'needs-review',
        statusLabel_zh: context.draftPlan?.label_zh || '计划需先确认',
        tone: context.draftPlan?.status === 'ready' ? 'success' : 'warning',
        priority: 59,
        summary_zh: context.draftPlan?.summary_zh || '先审查写作结构，再生成或修改正文。',
        actions: context.draftPlan?.copyText ? [{ type: 'copy-draft-plan', label_zh: '复制写作计划' }] : [],
      },
      {
        id: 'rag-health',
        title_zh: '证据库健康',
        source: 'rag.health',
        status: context.rag?.health?.status || 'unusable',
        statusLabel_zh: context.rag?.health?.label_zh || '证据不可用',
        tone: statusTone(context.rag?.health?.status),
        priority: 60,
        summary_zh: context.rag?.health?.message_zh || '当前证据库不足以支撑可靠引用写作。',
        actions: context.rag?.uiHints?.map(hint => ({
          type: 'review-rag-status',
          label_zh: hint.message_zh,
        })) || [],
      },
      {
        id: 'rag-query-assistant',
        title_zh: 'RAG 检索助手',
        source: 'rag.queryAssistant',
        status: context.rag?.queryAssistant?.status || 'needs-query',
        statusLabel_zh: context.rag?.queryAssistant?.label_zh || '等待检索问题',
        tone: statusTone(context.rag?.queryAssistant?.status),
        priority: 62,
        summary_zh: context.rag?.queryAssistant?.message_zh || '根据当前任务和证据状态推荐更好用的检索词。',
        actions: context.rag?.queryAssistant?.actions || [],
      },
      {
        id: 'rag-query-rewrite',
        title_zh: 'RAG 检索改写',
        source: 'rag.queryRewriteGuide',
        status: context.rag?.queryRewriteGuide?.status || 'optional',
        statusLabel_zh: context.rag?.queryRewriteGuide?.label_zh || '可选改写检索词',
        tone: statusTone(context.rag?.queryRewriteGuide?.status),
        priority: 63,
        summary_zh: context.rag?.queryRewriteGuide?.reason_zh || '按主题、方法、局限、实验和引用线索生成可点击检索改写。',
        actions: context.rag?.queryRewriteGuide?.topQueries?.slice(0, 3).map(query => ({
          type: 'use-rag-query',
          label_zh: query,
          query,
        })) || [],
      },
      {
        id: 'rag-repair-guide',
        title_zh: '证据库修复向导',
        source: 'rag.repairGuide',
        status: context.rag?.repairGuide?.status || 'clear',
        statusLabel_zh: context.rag?.repairGuide?.label_zh || '无需修复',
        tone: statusTone(context.rag?.repairGuide?.status),
        priority: 65,
        summary_zh: context.rag?.repairGuide?.message_zh || '证据库当前没有需要优先处理的问题。',
        actions: context.rag?.repairGuide?.items?.map(item => item.action).filter(Boolean) || [],
      },
      {
        id: 'citation-policy',
        title_zh: '引用安全',
        source: 'citationPolicy',
        status: context.citationPolicy?.status || 'not-required',
        statusLabel_zh: context.citationPolicy?.label_zh || '不需要引用约束',
        tone: statusTone(context.citationPolicy?.status),
        priority: 70,
        summary_zh: context.citationPolicy?.message_zh || '当前任务不明显依赖文献引用。',
        actions: context.citationPolicy?.allowUnsupportedClaims === false
          ? [{ type: 'review-citation-rules', label_zh: '查看引用规则' }]
          : [],
      },
      {
        id: 'acceptance-checklist',
        title_zh: '验收清单',
        source: 'acceptanceChecklist',
        status: context.acceptanceChecklist?.status || 'normal',
        statusLabel_zh: context.acceptanceChecklist?.label_zh || '常规验收',
        tone: blockingChecklist.length ? 'danger' : 'success',
        priority: 80,
        summary_zh: blockingChecklist.length
          ? `${blockingChecklist.length} 个阻塞项必须满足后才能采纳输出。`
          : '没有阻塞验收项，仍需区分证据和推测。',
        actions: [{ type: 'copy-checklist', label_zh: '复制验收清单' }],
      },
      {
        id: 'writing-prompt',
        title_zh: '写作提示词',
        source: 'writingPrompt.text',
        status: context.writingPrompt?.text ? 'ready' : 'empty',
        statusLabel_zh: context.writingPrompt?.text ? '可复制' : '待生成',
        tone: context.writingPrompt?.text ? 'success' : 'neutral',
        priority: 90,
        summary_zh: '后端已把任务、Skill、证据、引用规则和验收清单合并成 Markdown 工作包。',
        actions: [
          { type: 'copy-prompt', label_zh: '复制提示词' },
          primaryAction,
        ].filter(Boolean),
      },
      {
        id: 'recent-documents',
        title_zh: '证据文档',
        source: 'rag.documentReadinessGuide',
        status: context.rag?.documentReadinessGuide?.status || 'empty',
        statusLabel_zh: context.rag?.documentReadinessGuide?.label_zh || '暂无文档',
        tone: statusTone(context.rag?.documentReadinessGuide?.status),
        priority: 100,
        summary_zh: context.rag?.documentReadinessGuide?.summary_zh || '上传 PDF、BibTeX 或 Markdown 笔记后会显示在这里。',
        actions: context.rag?.documentReadinessGuide?.status === 'ready'
          ? [{ type: 'search-evidence', label_zh: '检索证据' }]
          : [{ type: 'upload-evidence', label_zh: '上传或修复文献' }],
      },
    ],
  };
}

function buildPrimaryUiAction(context, primarySkill) {
  if (!context.task) {
    return {
      type: 'focus-task',
      label_zh: '先填写论文任务',
      requiresExplicitUserAction: true,
    };
  }
  if (context.contextReadiness?.status === 'blocked') {
    const firstMissing = context.contextReadiness.required?.find(item => item.status !== 'ready');
    return {
      ...(firstMissing?.action || { type: 'add-context', label_zh: '补齐上下文' }),
      requiresExplicitUserAction: true,
      blockedBy: firstMissing?.key || 'missing-context',
    };
  }
  if (context.citationPolicy?.status === 'no-evidence') {
    return {
      type: 'upload-evidence',
      label_zh: '先上传可引用资料',
      requiresExplicitUserAction: true,
      blockedBy: 'no-evidence',
    };
  }
  if (context.citationPolicy?.status === 'needs-evidence') {
    return {
      type: 'refine-query',
      label_zh: '先重新检索证据',
      requiresExplicitUserAction: true,
      blockedBy: 'needs-evidence',
    };
  }
  return {
    type: 'create-conversation-and-send',
    label_zh: primarySkill
      ? `用 ${primarySkill.display_name_zh || primarySkill.name} 生成草稿`
      : '创建会话并发送',
    requiresExplicitUserAction: true,
    mode: context.aiDraftRequest?.mode || context.taskRouting?.mode || 'chat',
    skill: primarySkill?.name || '',
  };
}

function statusTone(status) {
  if (['blocked', 'unusable', 'no-evidence', 'needs-evidence', 'missing-evidence', 'ungrounded', 'strict', 'needs-repair', 'not-ready'].includes(status)) {
    return 'danger';
  }
  if (['needs-context', 'needs-attention', 'metadata-only', 'failed', 'can-improve', 'needs-confirmation', 'needs-review'].includes(status)) {
    return 'warning';
  }
  if (['ready', 'healthy', 'grounded', 'recommended', 'normal', 'production-ready'].includes(status)) {
    return 'success';
  }
  return 'neutral';
}

function firstText(items) {
  return (items || []).find(item => typeof item === 'string' && item.trim()) || '';
}

function formatEvidenceForPrompt(evidence) {
  const results = evidence?.results || [];
  if (results.length === 0) return '';
  return results.map(result => {
    const source = result.source || {};
    const lines = source.lineStart ? `:L${source.lineStart}-L${source.lineEnd}` : '';
    return `[${result.rank}] ${source.path || 'unknown'}${lines}\n${result.text}`;
  }).join('\n\n');
}

function formatEvidencePackForPrompt(evidencePack) {
  if (!evidencePack) {
    return '未生成证据写作包。';
  }
  if (!evidencePack.items?.length) {
    return [
      `${evidencePack.label_zh || evidencePack.status}：${evidencePack.message_zh || ''}`,
      ...(evidencePack.fallbackActions || []).map(action => `- 下一步：${action.label_zh || action.type}`),
    ].join('\n');
  }
  return [
    `${evidencePack.label_zh || '证据包可用'}：${evidencePack.message_zh || ''}`,
    evidencePack.fingerprint ? `证据包指纹：${evidencePack.fingerprint}` : '',
    evidencePack.coverage ? `证据覆盖度：${evidencePack.coverage.label_zh}，${evidencePack.coverage.sourceCount} 个来源 / ${evidencePack.coverage.evidenceCount} 条片段。${evidencePack.coverage.guidance_zh}` : '',
    ...(evidencePack.coverage?.warnings || []).map(warning => `覆盖度警告：${warning}`),
    evidencePack.expansionPlan ? `补证据计划：${evidencePack.expansionPlan.label_zh}。${evidencePack.expansionPlan.reason_zh}` : '',
    ...(evidencePack.expansionPlan?.suggestedQueries || []).map(query => `- 建议检索：${query}`),
    '',
    '使用规则：',
    ...(evidencePack.rules || []).map(rule => `- ${rule}`),
    '',
    '证据条目：',
    ...evidencePack.items.map(item => [
      `[${item.rank}] ${item.sourceLabel}`,
      `片段：${item.snippet}`,
      `支持：${(item.supports_zh || []).join('；') || '只能支持片段直接表达的事实。'}`,
      `不能支持：${(item.notFor || []).join('；') || '不能扩展到片段之外的结论。'}`,
      item.citationInstruction_zh ? `引用说明：${item.citationInstruction_zh}` : '',
    ].filter(Boolean).join('\n')),
  ].join('\n');
}

function toBulletList(items) {
  return items.map(item => `- ${item}`).join('\n');
}

function buildCitationBehaviors(status) {
  if (status === 'grounded') {
    return [
      '使用证据时必须写出来源编号，例如 [1]、[2]。',
      '区分“证据直接支持的结论”和“基于证据的推测”。',
      'related work 或 research gap 中的事实性陈述必须能追溯到 RAG 片段。',
    ];
  }
  if (['needs-evidence', 'no-evidence'].includes(status)) {
    return [
      '先提示用户补充文献、上传 PDF/BibTeX，或换关键词重新检索。',
      '可以输出结构大纲、检索关键词和待补证据清单。',
      '若必须写草稿，应明确标注“未基于项目证据验证”。',
    ];
  }
  return [
    '如果回答涉及事实或论文结论，说明证据来源是否来自当前项目。',
  ];
}

function buildCitationForbiddenBehaviors(status) {
  const common = [
    '不得编造论文标题、作者、年份、DOI、会议或引用编号。',
    '不得把没有证据支持的判断写成已被文献证明的事实。',
  ];
  if (status === 'grounded') {
    return [
      ...common,
      '不得引用未出现在 RAG 命中结果中的来源。',
    ];
  }
  if (['needs-evidence', 'no-evidence'].includes(status)) {
    return [
      ...common,
      '不得生成看起来已经带真实引用的 related work 正文。',
    ];
  }
  return common;
}

function buildContextRequirement(key, projectState, required, contextAnswers = {}) {
  const detail = describeContextKey(key);
  const answered = hasContextAnswer(contextAnswers, key);
  const status = answered || isContextSatisfied(key, projectState) ? 'ready' : 'missing';
  return {
    key,
    label_zh: detail.label_zh,
    help_zh: detail.help_zh,
    required,
    status,
    statusLabel_zh: status === 'ready' ? '已满足' : '待补充',
    answer_zh: answered ? contextAnswers[key] : '',
    action: buildContextAction(key),
  };
}

function isContextSatisfied(key, projectState) {
  if (key === 'rag_documents_or_references') {
    return Boolean(projectState.hasRagDocuments || projectState.hasReferences);
  }
  if (key === 'references_bib') return Boolean(projectState.hasReferences);
  return false;
}

function buildContextAction(key) {
  const actions = {
    target_section_or_file: { type: 'select-file', label_zh: '选择章节或稿件文件' },
    rag_documents_or_references: { type: 'upload-evidence', label_zh: '上传 PDF、BibTeX 或文献笔记' },
    references_bib: { type: 'upload-bibtex', label_zh: '上传或整理 references.bib' },
    paper_claims: { type: 'add-notes', label_zh: '补充论文贡献点' },
    related_work: { type: 'upload-evidence', label_zh: '上传相关工作证据' },
    method_notes: { type: 'add-notes', label_zh: '补充方法说明' },
    experiment_results: { type: 'add-results', label_zh: '补充实验结果' },
    paper_findings: { type: 'add-notes', label_zh: '补充主要发现' },
    paper_summary: { type: 'add-summary', label_zh: '补充论文概要' },
    search_query: { type: 'refine-query', label_zh: '填写检索关键词' },
    latex_error_log: { type: 'add-latex-log', label_zh: '粘贴 LaTeX/Overleaf 报错日志' },
    data_or_results: { type: 'add-results', label_zh: '补充数据或结果文件' },
    research_direction: { type: 'add-notes', label_zh: '补充研究方向' },
    figure_goal: { type: 'add-notes', label_zh: '说明图表目标' },
    venue_rules: { type: 'add-notes', label_zh: '补充投稿规则' },
    compiled_pdf: { type: 'upload-pdf', label_zh: '上传或选择已编译 PDF' },
  };
  return actions[key] || { type: 'add-context', label_zh: '补充上下文' };
}

function calculateReadinessScore(required, recommended, ragHealth) {
  if (required.length === 0 && recommended.length === 0) {
    return ragHealth?.status === 'unusable' ? 60 : 90;
  }
  const requiredWeight = required.length ? 70 : 0;
  const recommendedWeight = recommended.length ? 20 : 0;
  const baseWeight = 100 - requiredWeight - recommendedWeight;
  const requiredScore = required.length
    ? required.filter(item => item.status === 'ready').length / required.length * requiredWeight
    : 0;
  const recommendedScore = recommended.length
    ? recommended.filter(item => item.status === 'ready').length / recommended.length * recommendedWeight
    : 0;
  const ragAdjustment = ragHealth?.status === 'unusable' ? -10 : 0;
  return Math.max(0, Math.min(100, Math.round(baseWeight + requiredScore + recommendedScore + ragAdjustment)));
}

function buildReadinessMessage(status, blocking, ragHealth) {
  if (status === 'blocked') {
    return `还需要补充 ${blocking.length} 项关键上下文，补齐后再让 Agent 修改正文更可靠。`;
  }
  if (ragHealth?.status === 'needs-attention') {
    return '关键上下文已基本满足，但证据库还有解析或命中问题，建议先处理。';
  }
  if (ragHealth?.status === 'unusable') {
    return '当前任务可以先对话澄清，但证据库还不足以支撑可靠引用写作。';
  }
  return '关键上下文已经就绪，可以开始写作、问答或生成修改建议。';
}

function dedupeNextActions(actions) {
  const seen = new Set();
  const deduped = [];
  for (const action of actions) {
    const key = `${action.type}:${action.skill || action.label_zh}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(action);
  }
  return deduped.slice(0, 5);
}

function summarizeRagDocuments(documents) {
  const summary = {
    total: documents.length,
    text: 0,
    binary: 0,
    parsed: 0,
    indexed: 0,
    metadataOnly: 0,
    failed: 0,
    indexedChunks: 0,
    extractedTextChars: 0,
    warnings: [],
  };

  for (const document of documents) {
    if (document.kind === 'binary') summary.binary += 1;
    else summary.text += 1;
    if (document.parseStatus === 'parsed') summary.parsed += 1;
    if (document.parseStatus === 'indexed') summary.indexed += 1;
    if (document.parseStatus === 'metadata-only') summary.metadataOnly += 1;
    if (document.parseStatus === 'failed') summary.failed += 1;
    if (document.contentQuality?.blocksCitationWriting) summary.metadataOnly += 1;
    summary.indexedChunks += Number(document.chunks || 0);
    summary.extractedTextChars += Number(document.extractedTextChars || document.indexedTextChars || 0);
    if (document.extractionError) {
      summary.warnings.push({
        path: document.path,
        status: document.parseStatus,
        message: document.extractionError,
      });
    }
  }

  return summary;
}

async function hasProjectReferences(projectRoot) {
  try {
    const info = await stat(safeJoin(projectRoot, 'references.bib'));
    return info.isFile();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    return false;
  }
}

function toDocumentCard(document) {
  return {
    id: document.id,
    path: document.path,
    title: document.title,
    kind: document.kind,
    parseStatus: document.parseStatus,
    parser: document.parser,
    chunks: document.chunks || 0,
    extractedTextChars: document.extractedTextChars || document.indexedTextChars || 0,
    extractionError: document.extractionError || '',
    contentQuality: document.contentQuality || null,
    recovery: document.recovery || null,
    warnings: document.warnings || [],
  };
}

function buildDocumentReadinessGuide({ summary, documents }) {
  const cards = (documents || []).map(buildDocumentReadinessCard);
  const citableCount = cards.filter(card => card.status === 'citable').length;
  const usableCount = cards.filter(card => ['citable', 'usable-text'].includes(card.status)).length;
  const repairCount = cards.filter(card => card.blocksCitationWriting).length;
  const status = summary.total === 0
    ? 'empty'
    : (repairCount > 0 ? 'needs-repair' : (usableCount > 0 ? 'ready' : 'metadata-only'));
  const guide = {
    status,
    label_zh: {
      empty: '还没有证据文档',
      'needs-repair': '部分文档不能用于引用',
      ready: '有可用于引用的文档',
      'metadata-only': '文档不可直接引用',
    }[status],
    summary_zh: buildDocumentReadinessSummary(status, { total: summary.total, citableCount, usableCount, repairCount }),
    counts: {
      total: summary.total,
      citable: citableCount,
      usable: usableCount,
      needsRepair: repairCount,
      metadataOnly: summary.metadataOnly,
      failed: summary.failed,
    },
    cards,
    copyText: '',
  };
  guide.copyText = formatDocumentReadinessCopyText(guide);
  return guide;
}

function buildDocumentReadinessCard(document) {
  const chunks = Number(document.chunks || 0);
  const chars = Number(document.extractedTextChars || 0);
  let status = 'metadata-only';
  let label = '不可直接引用';
  let message = '该文档没有可检索正文片段，不能作为引用证据。';
  let action = { type: 'upload-extracted-notes', label_zh: '补充 Markdown 文献笔记' };
  let blocksCitationWriting = true;
  const recovery = document.recovery || null;
  const contentQuality = document.contentQuality || null;

  if (contentQuality?.blocksCitationWriting) {
    status = contentQuality.status || 'content-quality-blocked';
    label = contentQuality.label_zh || '文本质量不足';
    message = contentQuality.message_zh || '该文本缺少可核对的引用证据，不能支撑论文引用写作。';
    action = { type: 'upload-extracted-notes', label_zh: status === 'template-empty' ? '填写后重新上传文献笔记' : '补全证据字段后重传' };
  } else if (chunks > 0 && ['parsed', 'indexed'].includes(document.parseStatus)) {
    status = 'citable';
    label = '可用于引用检索';
    message = `已索引 ${chunks} 个片段，可在命中后作为引用证据使用。`;
    action = { type: 'search-evidence', label_zh: '检索该文档相关证据' };
    blocksCitationWriting = false;
  } else if (chunks > 0) {
    status = 'usable-text';
    label = '可作为文本线索';
    message = `已有 ${chunks} 个索引片段，但解析状态为 ${document.parseStatus || 'unknown'}，引用前建议核对来源。`;
    action = { type: 'review-source', label_zh: '核对来源片段' };
    blocksCitationWriting = false;
  } else if (document.parseStatus === 'failed') {
    status = 'failed';
    label = recovery?.label_zh || '解析失败';
    message = recovery?.instruction_zh || document.extractionError || 'PDF 或文档解析失败，需要替换文件或补充人工摘录。';
    action = recovery?.preferredAction || { type: 'replace-document', label_zh: '替换 PDF 或补充笔记' };
  } else if (document.parseStatus === 'metadata-only') {
    status = 'metadata-only';
    label = recovery?.label_zh || '只有文件信息';
    message = recovery?.instruction_zh || '只保存了文件名或元数据，没有正文片段；不能支持论文里的事实性引用。';
    action = recovery?.preferredAction || action;
  }

  return {
    path: document.path,
    title: document.title || document.path,
    parseStatus: document.parseStatus || 'unknown',
    parser: document.parser || '',
    chunks,
    extractedTextChars: chars,
    contentQuality,
    recovery,
    status,
    label_zh: label,
    message_zh: message,
    action,
    blocksCitationWriting,
    successCriteria_zh: recovery?.successCriteria_zh || (blocksCitationWriting
      ? '补充后应能看到 chunks > 0，且检索结果能命中具体正文片段。'
      : '使用该文档支持正文时，仍需引用具体命中片段编号。'),
  };
}

function buildDocumentReadinessSummary(status, counts) {
  if (status === 'empty') return '还没有上传任何文献或笔记。先上传可复制文本的 PDF、BibTeX 或 Markdown 文献笔记。';
  if (status === 'needs-repair') return `${counts.citableCount} 个文档可用于引用，${counts.repairCount} 个文档需要修复后才能支撑引用写作。`;
  if (status === 'metadata-only') return '已有文档，但都没有可检索正文片段；当前只能作为文件线索，不能作为引用证据。';
  return `${counts.citableCount} 个文档可用于引用检索；写作时仍要引用具体命中片段编号。`;
}

function formatDocumentReadinessCopyText(guide) {
  return [
    '# 证据文档引用可用性',
    `${guide.label_zh}：${guide.summary_zh}`,
    '',
    '# 文档状态',
    ...((guide.cards || []).map((card, index) => [
      `## ${index + 1}. ${card.title}`,
      `路径：${card.path}`,
      `状态：${card.label_zh}（${card.status} / ${card.parseStatus}）`,
      `chunks：${card.chunks}，抽取字符：${card.extractedTextChars}`,
      `说明：${card.message_zh}`,
      card.contentQuality ? `文本质量：${card.contentQuality.label_zh}（${card.contentQuality.status}）` : '',
      card.recovery ? `恢复诊断：${card.recovery.label_zh}（${card.recovery.code}）` : '',
      card.recovery?.why_zh ? `原因：${card.recovery.why_zh}` : '',
      card.recovery?.ocrCapability ? `OCR 能力：${card.recovery.ocrCapability.label_zh}（${card.recovery.ocrCapability.status}，自动恢复：${card.recovery.ocrCapability.automaticRecoveryAvailable ? '可用' : '未启用'}）` : '',
      card.recovery?.ocrCapability?.installHint_zh ? `OCR 说明：${card.recovery.ocrCapability.installHint_zh}` : '',
      card.recovery?.noteTemplate ? `\n### 可复制 Markdown 文献笔记模板\n${card.recovery.noteTemplate}` : '',
      `动作：${card.action?.label_zh || card.action?.type || '人工处理'}`,
      `成功标准：${card.successCriteria_zh}`,
    ].filter(Boolean).join('\n'))),
  ].join('\n\n');
}

function buildRagRepairGuide({ summary, documents, evidence }) {
  const items = [];

  if (summary.total === 0) {
    items.push({
      id: 'upload-first-evidence',
      severity: 'high',
      title_zh: '证据库为空',
      message_zh: '还没有任何可检索文献。先上传可复制文本的 PDF、BibTeX、Markdown 文献笔记或 TXT 摘要。',
      affectedDocuments: [],
      action: { type: 'upload-evidence', label_zh: '上传第一批文献' },
      successCriteria_zh: '上传后重建索引，证据库应出现可检索 chunks。',
    });
  }

  const failedDocuments = documents.filter(document => document.parseStatus === 'failed');
  if (failedDocuments.length > 0) {
    items.push({
      id: 'fix-pdf-parse-failures',
      severity: 'high',
      title_zh: '有 PDF 没有抽取到正文',
      message_zh: '这些文档不会进入可靠 RAG 证据。优先换用可复制文本的 PDF，或把关键段落整理成 Markdown 文献笔记后上传。',
      affectedDocuments: failedDocuments.map(toRepairDocument),
      action: { type: 'review-rag-documents', label_zh: '查看解析失败文档' },
      successCriteria_zh: '修复后文档状态应变为 parsed/indexed，extractedTextChars 和 chunks 应大于 0。',
    });
  }

  const metadataOnlyDocuments = documents.filter(document => document.parseStatus === 'metadata-only');
  if (metadataOnlyDocuments.length > 0) {
    items.push({
      id: 'replace-metadata-only-documents',
      severity: summary.indexedChunks > 0 ? 'medium' : 'high',
      title_zh: '有文档只有文件信息，没有正文',
      message_zh: 'metadata-only 文档只说明文件存在，不能支撑引用写作。需要重新上传可抽取文本版本，或补充人工摘录。',
      affectedDocuments: metadataOnlyDocuments.map(toRepairDocument),
      action: { type: 'upload-extracted-notes', label_zh: '补充 Markdown 文献笔记' },
      successCriteria_zh: '补充后检索结果应能命中具体段落，而不是只看到文件名或元数据。',
    });
  }

  const templateOnlyDocuments = documents.filter(document => document.contentQuality?.status === 'template-empty');
  if (templateOnlyDocuments.length > 0) {
    items.push({
      id: 'fill-manual-note-templates',
      severity: summary.indexedChunks > 0 ? 'medium' : 'high',
      title_zh: '有文献笔记模板尚未填写',
      message_zh: '这些 Markdown 文件像是空的人工摘录模板，没有可引用事实，不会进入可靠 RAG 证据。请填写原文摘录、页码和可引用事实后重新上传或重建索引。',
      affectedDocuments: templateOnlyDocuments.map(toRepairDocument),
      action: { type: 'upload-extracted-notes', label_zh: '填写文献笔记模板' },
      successCriteria_zh: '填写后文档应生成 chunks，且检索结果命中实际摘录内容而不是模板字段名。',
    });
  }

  const incompleteManualNotes = documents.filter(document => document.contentQuality?.status === 'manual-note-incomplete');
  if (incompleteManualNotes.length > 0) {
    items.push({
      id: 'complete-manual-note-evidence-fields',
      severity: summary.indexedChunks > 0 ? 'medium' : 'high',
      title_zh: '有文献笔记缺少可核对证据字段',
      message_zh: '这些 Markdown 文件像是人工文献笔记，但缺少可引用事实、原文证据摘录或页码/章节。补全前不会进入可靠 RAG 证据。',
      affectedDocuments: incompleteManualNotes.map(toRepairDocument),
      action: { type: 'upload-extracted-notes', label_zh: '补全文献笔记证据字段' },
      successCriteria_zh: '每条要用于写作的事实都应包含 Fact、Evidence text 和 Page/section；重建索引后检索应命中实际摘录内容。',
    });
  }

  if (summary.total > 0 && summary.indexedChunks === 0) {
    items.push({
      id: 'no-indexed-text',
      severity: 'high',
      title_zh: '证据库没有可检索正文',
      message_zh: '已有文件但没有任何 chunk。请先修复解析失败、替换扫描版 PDF，或上传可直接读取的笔记。',
      affectedDocuments: documents.map(toRepairDocument).slice(0, 5),
      action: { type: 'rebuild-index', label_zh: '修复后重建索引' },
      successCriteria_zh: '重建索引后 indexedChunks 应大于 0。',
    });
  }

  if (evidence?.query && summary.indexedChunks > 0 && evidence.results.length === 0) {
    items.push({
      id: 'refine-query-no-hit',
      severity: 'medium',
      title_zh: '本次任务没有命中证据片段',
      message_zh: '证据库有内容，但当前关键词没有匹配。尝试使用论文标题、方法名、数据集名、作者关键词或英文术语重新检索。',
      affectedDocuments: [],
      action: { type: 'refine-query', label_zh: '换关键词重新检索' },
      successCriteria_zh: '重新检索后至少命中 1 条可引用片段，再让 AI 写带引用的正文。',
    });
  }

  const severityRank = { high: 0, medium: 1, low: 2 };
  const sortedItems = items.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
  const highCount = sortedItems.filter(item => item.severity === 'high').length;
  const status = sortedItems.length === 0
    ? 'clear'
    : (highCount > 0 ? 'needs-repair' : 'can-improve');

  return {
    status,
    label_zh: {
      clear: '无需修复',
      'needs-repair': '需要修复',
      'can-improve': '建议优化',
    }[status],
    message_zh: buildRepairGuideMessage(status, sortedItems),
    items: sortedItems.slice(0, 6),
    repairPlan: buildRagRepairPlan(status, sortedItems),
    copyText: formatRagRepairGuideCopyText(status, sortedItems),
  };
}

function buildRagRepairPlan(status, items) {
  const steps = items.slice(0, 6).map((item, index) => ({
    id: item.id,
    order: index + 1,
    priority: item.severity === 'high' ? 'blocker' : item.severity === 'medium' ? 'recommended' : 'optional',
    title_zh: item.title_zh,
    action: item.action,
    instruction_zh: buildRagRepairInstruction(item),
    affectedDocumentCount: item.affectedDocuments?.length || 0,
    affectedDocuments: (item.affectedDocuments || []).slice(0, 5),
    successCriteria_zh: item.successCriteria_zh,
    blocksCitationWriting: item.severity === 'high',
  }));

  return {
    status,
    label_zh: status === 'clear' ? '无需修复计划' : status === 'needs-repair' ? '先修复阻塞项' : '建议优化证据质量',
    summary_zh: buildRagRepairPlanSummary(status, steps),
    steps,
  };
}

function buildRagRepairInstruction(item) {
  const instructions = {
    'upload-first-evidence': '上传 3-8 篇与当前任务直接相关的 PDF、BibTeX 或 Markdown 文献笔记，然后重建索引并重新分析任务。',
    'fix-pdf-parse-failures': '优先替换扫描版或加密 PDF；如果暂时无法替换，把论文标题、贡献、关键方法和相关段落整理成 Markdown 文献笔记后上传。',
    'replace-metadata-only-documents': '不要把 metadata-only 文档当成正文证据。补充可抽取文本版本，或上传人工摘录的 Markdown 笔记。',
    'fill-manual-note-templates': '打开文献笔记模板，填写人工核对过的题名、方法、结果、局限、页码和可引用事实；不要保留空占位后直接当证据使用。',
    'complete-manual-note-evidence-fields': '打开文献笔记，至少补全一条可核对事实：Fact 写具体事实，Evidence text 粘贴或忠实改写原文，Page/section 写页码、章节、图或表编号。',
    'no-indexed-text': '先处理解析失败和 metadata-only 文档，再重建索引；重建后确认 indexedChunks 大于 0。',
    'refine-query-no-hit': '换用英文方法名、数据集名、论文标题关键词、缩写和同义词检索；命中至少 1 条片段后再写带引用的正文。',
  };
  return instructions[item.id] || item.message_zh || '按修复建议处理证据库后重新分析任务。';
}

function buildRagRepairPlanSummary(status, steps) {
  if (status === 'clear') return '当前证据库没有明显阻塞项，可以继续写作。';
  const blockers = steps.filter(step => step.blocksCitationWriting).length;
  if (blockers > 0) return `需要先完成 ${blockers} 个阻塞修复步骤，再生成需要引用支撑的正文。`;
  return `建议完成 ${steps.length} 个优化步骤，以提升 RAG 命中质量和引用可靠性。`;
}

function formatRagRepairGuideCopyText(status, items) {
  const plan = buildRagRepairPlan(status, items);
  return [
    '# 证据库修复计划',
    `${plan.label_zh}：${plan.summary_zh}`,
    '',
    '# 修复步骤',
    ...(plan.steps.length ? plan.steps.map(step => [
      `## ${step.order}. ${step.title_zh}`,
      `优先级：${step.priority}`,
      `操作：${step.action?.label_zh || step.action?.type || '人工处理'}`,
      `说明：${step.instruction_zh}`,
      `受影响文档数：${step.affectedDocumentCount}`,
      ...(step.affectedDocuments.length
        ? [
          '受影响文档：',
          ...step.affectedDocuments.map(document => `- ${document.path || document.title || 'unknown'} (${document.parseStatus || 'unknown'}, chunks ${document.chunks || 0})`),
        ]
        : []),
      `成功标准：${step.successCriteria_zh || '重新分析后不再出现该修复项。'}`,
    ].join('\n')) : ['- 无需修复。']),
  ].join('\n');
}

function buildRepairGuideMessage(status, items) {
  if (status === 'clear') {
    return '当前证据库没有明显阻塞问题，可以继续检索、引用和写作。';
  }
  const highCount = items.filter(item => item.severity === 'high').length;
  if (status === 'needs-repair') {
    return `发现 ${highCount} 个高优先级证据库问题。先修复这些问题，再生成需要引用支撑的正文。`;
  }
  return `发现 ${items.length} 个可优化项。当前可以继续写作，但建议先处理以提升 RAG 命中质量。`;
}

function toRepairDocument(document) {
  return {
    path: document.path,
    title: document.title,
    parseStatus: document.parseStatus,
    parser: document.parser,
    chunks: document.chunks || 0,
    extractedTextChars: document.extractedTextChars || 0,
    extractionError: document.extractionError || '',
    contentQuality: document.contentQuality || null,
    recovery: document.recovery || null,
  };
}

function buildRagUiHints(summary, evidence) {
  const hints = [];
  if (summary.total === 0) {
    hints.push({
      level: 'info',
      code: 'rag-empty',
      message_zh: '证据库还是空的。先上传 PDF、BibTeX 或笔记，再让 AI 基于证据回答。',
    });
  }
  if (summary.metadataOnly > 0) {
    hints.push({
      level: 'warning',
      code: 'metadata-only-documents',
      message_zh: '有文档仅保存了文件信息，尚未抽取正文；这些文档不会贡献可靠 RAG 证据。',
    });
  }
  if (summary.failed > 0) {
    hints.push({
      level: 'error',
      code: 'parse-failed-documents',
      message_zh: '有文档解析失败，请查看解析错误或换用可复制文本的 PDF。',
    });
  }
  if (evidence.query && evidence.results.length === 0 && summary.indexedChunks > 0) {
    hints.push({
      level: 'info',
      code: 'no-evidence-hit',
      message_zh: '已检索证据库，但没有找到匹配片段。可以换关键词或先补充相关文献。',
    });
  }
  return hints;
}

function buildRagHealth(summary, evidence) {
  const issues = [];
  let score = 100;

  if (summary.total === 0) {
    issues.push({
      severity: 'high',
      code: 'empty-library',
      message_zh: '证据库为空，AI 只能依赖模型记忆或用户输入。',
    });
    score -= 70;
  }

  if (summary.indexedChunks === 0 && summary.total > 0) {
    issues.push({
      severity: 'high',
      code: 'no-indexed-text',
      message_zh: '已有文档但没有可检索正文，RAG 暂时不能支撑引用写作。',
    });
    score -= 60;
  }

  if (summary.failed > 0) {
    issues.push({
      severity: 'high',
      code: 'parse-failures',
      message_zh: `${summary.failed} 个文档解析失败，需要替换 PDF 或补充文本笔记。`,
    });
    score -= Math.min(35, summary.failed * 15);
  }

  if (summary.metadataOnly > 0) {
    issues.push({
      severity: 'medium',
      code: 'metadata-only',
      message_zh: `${summary.metadataOnly} 个文档只有文件信息，没有正文片段。`,
    });
    score -= Math.min(25, summary.metadataOnly * 10);
  }

  if (evidence?.query && summary.indexedChunks > 0 && evidence.results.length === 0) {
    issues.push({
      severity: 'medium',
      code: 'query-no-hit',
      message_zh: '本次任务检索没有命中证据，需要换关键词或补充更相关文献。',
    });
    score -= 20;
  }

  if (summary.indexedChunks > 0 && evidence?.results?.length > 0) {
    score += Math.min(10, evidence.results.length * 2);
  }

  score = Math.max(0, Math.min(100, score));
  let status = 'healthy';
  let label_zh = '证据可用';
  let message_zh = '证据库已有可检索正文，可用于带来源的写作和问答。';

  if (score < 40 || summary.indexedChunks === 0) {
    status = 'unusable';
    label_zh = '证据不可用';
    message_zh = '当前证据库不足以支撑可靠引用写作，请先上传或修复文献正文。';
  } else if (score < 75 || issues.length > 0) {
    status = 'needs-attention';
    label_zh = '需要处理';
    message_zh = '证据库可部分使用，但建议先处理解析失败、仅 metadata 或检索无命中的问题。';
  }

  return {
    status,
    label_zh,
    score,
    message_zh,
    issues,
  };
}

function buildWorkflowHints({
  task,
  projectState,
  ragSummary,
  evidence,
  recommendations,
  taskRouting,
  ragUiHints,
}) {
  const hints = [];

  if (!task) {
    hints.push({
      priority: 'high',
      area: 'task',
      code: 'describe-writing-task',
      title_zh: '先描述论文任务',
      message_zh: '用自然语言说明你要写、改、检索还是执行工具；系统会自动推荐 Chat、Agent 或 Tools。',
      action: { type: 'focus-task', label_zh: '填写任务' },
    });
  }

  if (ragSummary.total === 0) {
    hints.push({
      priority: 'high',
      area: 'rag',
      code: 'upload-first-evidence',
      title_zh: '先上传可引用资料',
      message_zh: '证据库为空时，不适合直接让 AI 写 related work 或引用结论。',
      action: { type: 'upload-evidence', label_zh: '上传 PDF、BibTeX 或文献笔记' },
    });
  }

  if (ragSummary.failed > 0) {
    hints.push({
      priority: 'high',
      area: 'rag',
      code: 'fix-pdf-parse-failures',
      title_zh: '处理解析失败的文档',
      message_zh: '解析失败的 PDF 不会贡献正文证据。优先换用可复制文本的 PDF，或上传人工整理的 Markdown 笔记。',
      action: { type: 'review-rag-documents', label_zh: '查看解析失败原因' },
    });
  }

  if (ragSummary.metadataOnly > 0) {
    hints.push({
      priority: ragSummary.indexedChunks > 0 ? 'medium' : 'high',
      area: 'rag',
      code: 'replace-metadata-only-documents',
      title_zh: '补正文可检索版本',
      message_zh: '仅 metadata 的文档不会进入 RAG 片段。可以重新上传可抽取文本的 PDF，或把要引用的段落整理成 Markdown。',
      action: { type: 'upload-extracted-notes', label_zh: '补充文献笔记' },
    });
  }

  if (evidence?.query && evidence.results.length === 0 && ragSummary.indexedChunks > 0) {
    hints.push({
      priority: 'medium',
      area: 'rag',
      code: 'refine-evidence-query',
      title_zh: '换关键词检索证据',
      message_zh: '证据库有内容但本次没有命中。用论文标题、方法名、数据集名或核心概念重新检索。',
      action: { type: 'refine-query', label_zh: '重新检索证据库' },
    });
  }

  if (taskRouting?.missingContext?.includes('target_section_or_file')) {
    hints.push({
      priority: 'medium',
      area: 'writing',
      code: 'select-target-section',
      title_zh: '选择要修改的章节',
      message_zh: '写作或润色任务需要知道目标章节，否则只能给通用建议。',
      action: { type: 'select-file', label_zh: '选择 introduction / related work / discussion 等章节' },
    });
  }

  if (recommendations?.[0]) {
    const skill = recommendations[0].skill || {};
    hints.push({
      priority: 'low',
      area: 'skill',
      code: 'use-top-skill',
      title_zh: `优先使用：${skill.display_name_zh || skill.display_name || skill.name}`,
      message_zh: recommendations[0].reasons?.[0] || '该 Skill 与当前任务最匹配。',
      action: {
        type: 'activate-skill',
        label_zh: `启用 ${skill.display_name_zh || skill.name}`,
        skill: skill.name,
      },
    });
  }

  if (projectState.hasRagDocuments && evidence?.results?.length > 0) {
    hints.push({
      priority: 'low',
      area: 'evidence',
      code: 'copy-evidence-into-chat',
      title_zh: '把证据带入写作',
      message_zh: '当前已有可引用片段。发送给 AI 时要求按来源编号引用，避免泛泛总结。',
      action: { type: 'copy-evidence', label_zh: '复制证据片段' },
    });
  }

  for (const hint of ragUiHints || []) {
    if (!hints.some(item => item.code === hint.code)) {
      hints.push({
        priority: hint.level === 'error' ? 'high' : 'medium',
        area: 'rag',
        code: hint.code,
        title_zh: hint.message_zh,
        message_zh: hint.message_zh,
        action: { type: 'review-rag-status', label_zh: '查看证据库状态' },
      });
    }
  }

  const priorityRank = { high: 0, medium: 1, low: 2 };
  return hints
    .sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9))
    .slice(0, 6);
}
