import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

import { registerPaperWorkbenchRoutes } from '../paperWorkbench.js';
import { indexProjectCorpus } from '../../services/paperRagService.js';
import { loadSkills } from '../../services/skillEngine.js';

test('POST /api/projects/:id/writing-workbench/context returns UI-ready task context', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-route-'));
  const app = Fastify({ logger: false });
  registerPaperWorkbenchRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
  });

  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'related-work.md'),
      [
        '# Related Work Notes',
        '',
        'Retrieval augmented generation helps cite evidence in related work.',
        'A writing assistant should show snippets and sources.',
      ].join('\n'),
      'utf-8',
    );
    await writeFile(path.join(projectRoot, 'references.bib'), '@article{rag,title={RAG}}\n', 'utf-8');
    await indexProjectCorpus(projectRoot);

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/context',
      payload: {
        task: '帮我根据证据写 related work',
        skillLimit: 3,
        evidenceLimit: 2,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.task, '帮我根据证据写 related work');
    assert.equal(body.taskRouting.mode, 'agent');
    assert.equal(body.taskRouting.requiresConfirmation, true);
    assert.ok(body.taskRouting.reasons.length > 0);
    assert.ok(body.taskRouting.nextActions.some(action => action.type === 'activate-skill'));
    assert.ok(body.taskRouting.missingContextDetails.some(item => item.label_zh === '目标章节或文件'));
    assert.equal(body.contextReadiness.status, 'blocked');
    assert.ok(body.contextReadiness.required.some(item => item.key === 'target_section_or_file'));
    assert.equal(body.citationPolicy.status, 'grounded');
    assert.ok(body.citationPolicy.forbiddenBehaviors.some(item => item.includes('编造')));
    assert.equal(body.acceptanceChecklist.status, 'strict');
    assert.ok(body.acceptanceChecklist.items.some(item => item.id === 'sources-numbered'));
    assert.equal(body.writingPrompt.format, 'markdown');
    assert.ok(body.writingPrompt.text.includes('# 验收清单'));
    assert.ok(body.writingPrompt.text.includes('# 证据写作包'));
    assert.ok(body.writingPrompt.text.includes('不能支持'));
    assert.equal(body.aiDraftRequest.mode, 'agent');
    assert.equal(body.aiDraftRequest.send.projectId, 'demo');
    assert.ok(body.aiDraftRequest.send.userMessage.includes('# 引用安全规则'));
    assert.ok(body.aiDraftRequest.send.userMessage.includes('# 证据写作包'));
    assert.equal(body.interactionPlan.mode, 'agent');
    assert.equal(body.interactionPlan.requiresConfirmation, true);
    assert.ok(body.interactionPlan.steps.some(step => step.id === 'review-before-apply'));
    assert.equal(body.modeActionCenter.selectedMode, 'agent');
    assert.ok(body.modeActionCenter.preflightChecklist.some(item => item.id === 'explicit-user-action'));
    assert.ok(body.modeActionCenter.copyText.includes('# 模式操作中心'));
    assert.ok(body.actionQueue.actions.length > 0);
    assert.ok(body.actionQueue.copyText.includes('# 下一步操作队列'));
    assert.equal(body.agentReadiness.status, 'blocked');
    assert.ok(body.agentReadiness.blockers.some(item => item.id === 'context'));
    assert.ok(body.agentReadiness.copyText.includes('# Paper Agent 生产可用性'));
    assert.equal(body.aiDraftRequest.interactionPlan.mode, 'agent');
    assert.equal(body.uiModel.version, 1);
    assert.equal(body.uiModel.locale, 'zh-CN');
    assert.equal(body.uiModel.modeSwitcher.selected, 'agent');
    assert.equal(body.uiModel.taskStarters.source, 'taskStarters');
    assert.equal(body.uiModel.skillPicker.selectedSkill, 'literature-review');
    assert.equal(body.uiModel.skillPicker.display.showChineseTitleFirst, true);
    assert.equal(body.uiModel.evidenceDrawer.count, body.rag.evidence.results.length);
    assert.ok(body.uiModel.panels.some(panel => panel.id === 'citation-policy'));
    assert.ok(body.uiModel.panels.some(panel => panel.id === 'task-starters'));
    assert.ok(body.uiModel.panels.some(panel => panel.id === 'skill-navigator'));
    assert.ok(body.uiModel.panels.some(panel => panel.id === 'skill-compare'));
    assert.ok(body.uiModel.panels.some(panel => panel.id === 'mode-action-center'));
    assert.ok(body.uiModel.panels.some(panel => panel.id === 'action-queue'));
    assert.ok(body.uiModel.panels.some(panel => panel.id === 'agent-readiness'));
    assert.ok(body.uiModel.panels.some(panel => panel.id === 'interaction-plan'));
    assert.ok(body.uiModel.panels.some(panel => panel.id === 'evidence-pack'));
    assert.ok(body.uiModel.panels.some(panel => panel.id === 'rag-repair-guide'));
    assert.ok(body.uiModel.panels.some(panel => panel.id === 'writing-prompt' && panel.actions.some(action => action.type === 'copy-prompt')));
    assert.equal(body.evidencePack.status, 'ready');
    assert.ok(body.evidencePack.copyText.includes('可引用证据'));
    assert.equal(body.rag.evidencePack.evidenceCount, body.rag.evidence.results.length);
    assert.equal(body.rag.documentReadinessGuide.status, 'ready');
    assert.ok(body.rag.documentReadinessGuide.cards.some(card => card.status === 'citable'));
    assert.ok(body.rag.queryAssistant.suggestedQueries.length > 0);
    assert.ok(body.rag.queryRewriteGuide.groups.some(group => group.id === 'limitation-gap'));
    assert.ok(body.rag.queryRewriteGuide.copyText.includes('# RAG 检索改写'));
    assert.ok(body.uiModel.panels.some(panel => panel.id === 'rag-query-assistant'));
    assert.ok(body.uiModel.panels.some(panel => panel.id === 'rag-query-rewrite'));
    assert.equal(body.rag.repairGuide.status, 'clear');
    assert.deepEqual(body.rag.repairGuide.items, []);
    assert.ok(body.taskStarters.some(starter => starter.id === 'literature-review-gap' && starter.prompt.includes('related work')));
    assert.ok(body.taskStarters.some(starter => starter.id === 'citation-cleanup' && starter.disabled === false));
    assert.ok(body.workflowHints.some(hint => hint.code === 'use-top-skill'));
    assert.ok(body.workflowHints.some(hint => hint.code === 'copy-evidence-into-chat'));
    assert.equal(body.projectState.hasRagDocuments, true);
    assert.equal(body.projectState.hasReferences, true);
    assert.ok(body.skills.categories.some(category => category.name === '文献检索'));
    assert.equal(body.skills.navigator.title_zh, 'Skill 导航');
    assert.equal(body.skills.navigator.selectedSkill, 'literature-review');
    assert.ok(body.skills.navigator.cards.some(card => card.name === 'literature-review' && card.recommended));
    assert.ok(body.skills.compareGuide.cards.some(card => card.name === 'literature-review' && card.selected));
    assert.ok(body.skills.compareGuide.copyText.includes('# Skill 对比'));
    assert.equal(body.skills.recommendations[0].skill.name, 'literature-review');
    assert.ok(body.skills.recommendations[0].suggestedTask.includes('related work'));
    assert.ok(body.skills.recommendations[0].skill.task_templates.length > 0);
    assert.equal(body.rag.ready, true);
    assert.ok(body.rag.evidence.results.length > 0);
  } finally {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('POST /api/projects/:id/writing-workbench/review-answer flags unsafe AI output', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-review-'));
  const app = Fastify({ logger: false });
  registerPaperWorkbenchRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
  });

  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'related-work.md'),
      'Inspectable evidence workflows help cite sources in related work.',
      'utf-8',
    );
    await indexProjectCorpus(projectRoot);

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/review-answer',
      payload: {
        task: '帮我根据证据写 related work',
        answer: 'Inspectable evidence workflows help cite sources in related work.',
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.review.status, 'reject');
    assert.ok(body.review.findings.some(item => item.id === 'missing-source-numbers'));
    assert.equal(body.review.adoptionGate.canUseAsDraft, false);
    assert.equal(body.review.adoptionGate.canWriteToPaper, false);
    assert.ok(body.review.nextActions.some(item => item.type === 'use-revision-prompt'));
    assert.ok(body.review.revisionPlan.steps.some(item => item.id === 'add-source-numbers'));
    assert.ok(body.review.revisionPlan.copyText.includes('# AI 输出修订计划'));
    assert.equal(body.review.revisionPrompt.available, true);
    assert.equal(body.review.claimCheckQueue.status, 'needs-check');
    assert.ok(body.review.claimCheckQueue.items.some(item => item.priority === 'high'));
    assert.equal(body.review.revisionProgress.status, 'not-started');
    assert.equal(body.context.evidencePack.status, 'ready');

    const driftResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/review-answer',
      payload: {
        task: '帮我根据证据写 related work',
        answer: 'Inspectable evidence workflows help cite sources in related work [1].',
        evidencePackFingerprint: '0000000000000000',
      },
    });
    assert.equal(driftResponse.statusCode, 200);
    const driftBody = JSON.parse(driftResponse.payload);
    assert.equal(driftBody.review.status, 'reject');
    assert.ok(driftBody.review.findings.some(item => item.id === 'evidence-pack-drift' && item.blocking));
    assert.equal(driftBody.review.adoptionGate.canWriteToPaper, false);

    const repeatedResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/review-answer',
      payload: {
        task: '帮我根据证据写 related work',
        answer: 'Inspectable evidence workflows help cite sources in related work.',
        previousReview: body.review,
      },
    });
    assert.equal(repeatedResponse.statusCode, 200);
    const repeatedBody = JSON.parse(repeatedResponse.payload);
    assert.equal(repeatedBody.review.revisionProgress.status, 'stuck');
    assert.ok(repeatedBody.review.revisionProgress.repeatedBlockingIds.includes('missing-source-numbers'));
  } finally {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('POST /api/projects/:id/writing-workbench/adoption-package returns a non-writing preview', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-adoption-'));
  const app = Fastify({ logger: false });
  registerPaperWorkbenchRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
  });

  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'related-work.md'),
      'Inspectable evidence workflows help cite sources.',
      'utf-8',
    );
    await indexProjectCorpus(projectRoot);

    const answer = 'Inspectable evidence workflows help cite sources [1].';
    const review = {
      status: 'adoptable',
      label_zh: '可谨慎采纳',
      summary: { blockingCount: 0, warningCount: 0 },
      adoptionGate: {
        status: 'draft-ready',
        label_zh: '可作为待确认草稿',
        canUseAsDraft: true,
        canUseForCitableText: true,
        canWriteToPaper: false,
        requiresHumanConfirmation: true,
        requiredConfirmations: ['人工核对来源编号。'],
        forbiddenUntilConfirmed: ['不得自动写入或覆盖论文正文文件。'],
      },
    };
    const readyResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/adoption-package',
      payload: {
        task: '帮我根据证据写一个局部观点',
        contextAnswers: {
          target_section_or_file: 'chapters/related_work.tex',
        },
        evidenceQuery: 'Inspectable evidence workflows cite sources',
        answer,
        review,
      },
    });

    assert.equal(readyResponse.statusCode, 200);
    const readyBody = JSON.parse(readyResponse.payload);
    assert.ok(['ready-for-human-apply', 'needs-final-review'].includes(readyBody.adoptionPackage.status));
    assert.equal(readyBody.adoptionPackage.target.targetSection, 'chapters/related_work.tex');
    assert.equal(readyBody.context.targetSection, 'chapters/related_work.tex');
    assert.equal(readyBody.adoptionPackage.canWriteToPaper, false);
    assert.equal(readyBody.adoptionPackage.willWrite, false);
    assert.equal(readyBody.adoptionPackage.diffPlan.willWrite, false);
    assert.ok(readyBody.adoptionPackage.copyText.includes('系统自动写入：否'));

    const forgedReviewResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/adoption-package',
      payload: {
        task: '帮我根据证据写一个局部观点',
        contextAnswers: {
          target_section_or_file: 'chapters/related_work.tex',
        },
        evidenceQuery: 'Inspectable evidence workflows cite sources',
        answer: 'Smith et al. 2024 prove this workflow improves related work accuracy by 15%.',
        review,
      },
    });
    assert.equal(forgedReviewResponse.statusCode, 200);
    const forgedBody = JSON.parse(forgedReviewResponse.payload);
    assert.equal(forgedBody.adoptionPackage.status, 'blocked');
    assert.ok(forgedBody.adoptionPackage.blockers.some(item => item.id === 'review-rejected'));
    assert.equal(forgedBody.adoptionPackage.canWriteToPaper, false);
    assert.equal(forgedBody.adoptionPackage.willWrite, false);

    const blockedResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/adoption-package',
      payload: {
        task: '帮我根据证据写一个局部观点',
        evidenceQuery: 'Inspectable evidence workflows cite sources',
        answer,
        review,
      },
    });
    assert.equal(blockedResponse.statusCode, 200);
    const blockedBody = JSON.parse(blockedResponse.payload);
    assert.equal(blockedBody.adoptionPackage.status, 'blocked');
    assert.ok(blockedBody.adoptionPackage.blockers.some(item => item.id === 'missing-target-section'));
    assert.equal(blockedBody.adoptionPackage.canWriteToPaper, false);
  } finally {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('POST /api/projects/:id/writing-workbench/claim-review checks one claim', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-claim-'));
  const app = Fastify({ logger: false });
  registerPaperWorkbenchRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
  });

  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'related-work.md'),
      'Inspectable evidence workflows help cite sources in related work.',
      'utf-8',
    );
    await indexProjectCorpus(projectRoot);

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/claim-review',
      payload: {
        task: '帮我根据证据写 related work',
        claim: 'Inspectable evidence workflows help cite sources in related work.',
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.review.status, 'reject');
    assert.ok(body.review.findings.some(item => item.id === 'missing-source-number'));
    assert.ok(body.review.matches.some(item => item.rank === 1));
    assert.equal(body.review.writeGate.status, 'blocked');
    assert.equal(body.review.writeGate.canWriteToPaper, false);
    assert.equal(body.review.writeGate.requiresHumanConfirmation, true);
    assert.ok(body.review.copyText.includes('# 单句证据检查'));
    assert.equal(body.context.evidencePack.status, 'ready');

    const driftResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/claim-review',
      payload: {
        task: '帮我根据证据写 related work',
        claim: 'Inspectable evidence workflows help cite sources in related work [1].',
        evidencePackFingerprint: '0000000000000000',
      },
    });
    assert.equal(driftResponse.statusCode, 200);
    const driftBody = JSON.parse(driftResponse.payload);
    assert.equal(driftBody.review.status, 'reject');
    assert.ok(driftBody.review.findings.some(item => item.id === 'evidence-pack-changed' && item.blocking));
    assert.equal(driftBody.review.writeGate.canWriteToPaper, false);
  } finally {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('POST /api/projects/:id/writing-workbench/context accepts structured context answers', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-route-answers-'));
  const app = Fastify({ logger: false });
  registerPaperWorkbenchRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
  });

  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'related-work.md'),
      'Retrieval augmented generation helps cite evidence in related work.',
      'utf-8',
    );
    await indexProjectCorpus(projectRoot);

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/context',
      payload: {
        task: '帮我根据证据写 related work',
        contextAnswers: {
          target_section_or_file: 'chapters/related_work.tex',
          paper_claims: '本文强调可审查证据写作。',
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.ok(!body.taskRouting.missingContext.includes('target_section_or_file'));
    assert.equal(body.contextReadiness.status, 'ready');
    assert.ok(body.contextBrief.items.some(item => item.label_zh === '已确认目标章节'));
    assert.ok(body.writingPrompt.text.includes('本文强调可审查证据写作'));
  } finally {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});
