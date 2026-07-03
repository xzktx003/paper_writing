import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

import { buildAnswerAdoptionPackage, buildPaperWorkbenchContext, reviewClaimAgainstEvidence, reviewGeneratedAnswer, routeWritingTask } from '../paperWorkbenchService.js';
import { indexProjectCorpus } from '../paperRagService.js';
import { loadSkills } from '../skillEngine.js';

process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH = path.join(os.tmpdir(), 'paper-agent-test-no-preflight-state.json');
process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH = path.join(os.tmpdir(), 'paper-agent-test-no-e2e-state.json');

test('buildPaperWorkbenchContext returns skill recommendations and RAG health', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-'));
  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'rag-notes.md'),
      [
        '# Retrieval Notes',
        '',
        'Retrieval augmented generation improves literature review grounding.',
        'Evidence snippets should be visible when writing related work.',
      ].join('\n'),
      'utf-8',
    );
    await writeFile(path.join(projectRoot, 'references.bib'), '@article{demo,title={Demo}}\n', 'utf-8');
    await indexProjectCorpus(projectRoot);

    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: '帮我根据证据写 related work 和 research gap',
      skillLimit: 3,
      evidenceLimit: 2,
    });

    assert.equal(context.task, '帮我根据证据写 related work 和 research gap');
    assert.equal(context.projectState.hasReferences, true);
    assert.equal(context.projectState.hasRagDocuments, true);
    assert.equal(context.taskRouting.mode, 'agent');
    assert.equal(context.taskRouting.requiresConfirmation, true);
    assert.ok(context.taskRouting.nextActions.some(action => action.type === 'activate-skill'));
    assert.equal(context.rag.ready, true);
    assert.equal(context.rag.health.status, 'healthy');
    assert.equal(context.rag.repairGuide.status, 'clear');
    assert.equal(context.rag.repairGuide.items.length, 0);
    assert.equal(context.rag.documentReadinessGuide.status, 'ready');
    assert.ok(context.rag.documentReadinessGuide.counts.citable >= 1);
    assert.ok(context.rag.documentReadinessGuide.cards.some(card => card.status === 'citable' && !card.blocksCitationWriting));
    assert.ok(context.rag.documentReadinessGuide.copyText.includes('# 证据文档引用可用性'));
    assert.ok(['ready', 'can-improve'].includes(context.rag.queryAssistant.status));
    assert.ok(context.rag.queryAssistant.suggestedQueries.length > 0);
    assert.ok(context.rag.queryAssistant.copyText.includes('# RAG 检索助手'));
    assert.ok(['recommended', 'optional'].includes(context.rag.queryRewriteGuide.status));
    assert.ok(context.rag.queryRewriteGuide.groups.some(group => group.id === 'limitation-gap'));
    assert.ok(context.rag.queryRewriteGuide.topQueries.length > 0);
    assert.ok(context.rag.queryRewriteGuide.copyText.includes('# RAG 检索改写'));
    assert.ok(context.rag.health.score >= 75);
    assert.ok(context.rag.summary.total >= 1);
    assert.ok(context.rag.summary.indexedChunks > 0);
    assert.ok(context.rag.evidence.results.length > 0);
    assert.equal(context.evidencePack.status, 'ready');
    assert.match(context.evidencePack.fingerprint, /^[a-f0-9]{16}$/);
    assert.equal(context.evidencePack.evidenceCount, context.rag.evidence.results.length);
    assert.ok(context.evidencePack.coverage.sourceCount >= 1);
    assert.equal(context.evidencePack.coverage.evidenceCount, context.evidencePack.evidenceCount);
    assert.ok(['balanced', 'single-source', 'concentrated', 'thin'].includes(context.evidencePack.coverage.status));
    assert.ok(context.evidencePack.coverage.guidance_zh);
    assert.ok(['recommended', 'optional'].includes(context.evidencePack.expansionPlan.status));
    assert.ok(context.evidencePack.expansionPlan.suggestedQueries.length > 0);
    assert.ok(context.evidencePack.expansionPlan.actions.some(action => action.type === 'search-evidence'));
    assert.ok(context.evidencePack.expansionPlan.actions.some(action => action.type === 'copy-expansion-plan'));
    assert.ok(context.evidencePack.expansionPlan.copyText.includes('# 补证据计划'));
    assert.ok(context.evidencePack.expansionPlan.copyText.includes('# 使用边界'));
    assert.ok(context.evidencePack.copyText.includes('# 证据包使用规则'));
    assert.ok(context.evidencePack.copyText.includes('证据包指纹：'));
    assert.ok(context.evidencePack.copyText.includes('# 证据覆盖度'));
    assert.ok(context.evidencePack.copyText.includes('# 补证据计划'));
    assert.ok(context.evidencePack.copyText.includes('质量：'));
    assert.ok(context.evidencePack.copyText.includes('句型模板：'));
    assert.ok(context.evidencePack.items[0].sourceLabel);
    assert.ok(['high', 'medium', 'low'].includes(context.evidencePack.items[0].quality.level));
    assert.ok(context.evidencePack.items[0].quality.label_zh);
    assert.ok(context.evidencePack.items[0].quality.claimTemplate_zh.includes('[1]'));
    assert.ok(context.evidencePack.items[0].quality.recommendedUse_zh);
    assert.ok(context.evidencePack.items[0].supports_zh.length > 0);
    assert.ok(context.evidencePack.items[0].notFor.some(item => item.includes('作者')));
    assert.equal(context.skills.recommendations[0].skill.name, 'literature-review');
    assert.ok(context.skills.recommendations[0].skill.task_templates.length > 0);
    assert.ok(context.skills.recommendations[0].suggestedTask.includes('related work'));
    assert.ok(context.skills.categories.some(category => category.name === '文献检索'));
    assert.equal(context.skills.navigator.title_zh, 'Skill 导航');
    assert.equal(context.skills.navigator.selectedSkill, 'literature-review');
    assert.ok(context.skills.navigator.cards.some(card => card.name === 'literature-review' && card.recommended));
    assert.ok(context.skills.navigator.tagChips.some(tag => tag.name === '相关工作'));
    assert.equal(context.skills.taskIntentGuide.intent_zh, '写 Related Work / Research Gap');
    assert.equal(context.skills.taskIntentGuide.recommendedSkill.name, 'literature-review');
    assert.equal(context.skills.taskIntentGuide.recommendedStarterId, 'literature-review-gap');
    assert.ok(context.skills.taskIntentGuide.boundaries_zh.some(item => item.includes('RAG')));
    assert.ok(context.skills.taskIntentGuide.copyText.includes('# 任务意图诊断'));
    assert.equal(context.skills.decisionGuide.primary.name, 'literature-review');
    assert.ok(context.skills.decisionGuide.primary.why_zh.length > 0);
    assert.ok(context.skills.decisionGuide.primary.why_zh.some(item => item.includes('模式判断')));
    assert.ok(context.skills.decisionGuide.primary.nextAction_zh.includes('目标章节'));
    assert.ok(context.skills.decisionGuide.alternatives.length > 0);
    assert.ok(context.skills.decisionGuide.copyText.includes('# Skill 决策指南'));
    assert.equal(context.skills.compareGuide.selected, 'literature-review');
    assert.ok(context.skills.compareGuide.cards.length >= 2);
    assert.ok(context.skills.compareGuide.cards.some(card => card.name === 'literature-review' && card.selected));
    assert.ok(context.skills.compareGuide.cards[0].choose_if_zh.includes('related work'));
    assert.ok(context.skills.compareGuide.copyText.includes('# Skill 对比'));
    assert.ok(context.workflowHints.some(hint => hint.code === 'select-target-section'));
    assert.ok(context.workflowHints.some(hint => hint.code === 'use-top-skill'));
    assert.ok(context.workflowHints.some(hint => hint.code === 'copy-evidence-into-chat'));
    assert.ok(context.taskStarters.some(starter => starter.id === 'literature-review-gap' && starter.disabled === false));
    assert.ok(context.taskStarters.some(starter => starter.id === 'citation-cleanup' && starter.disabled === false));
    assert.ok(context.taskStarters.every(starter => starter.title_zh && starter.subtitle_en && starter.prompt));
    assert.ok(context.taskStarters.every(starter => starter.contextPrefill && Array.isArray(starter.contextPrefill.requiredKeys)));
    assert.ok(context.taskStarters.every(starter => starter.nextStep_zh));
    assert.ok(context.taskStarters.every(starter => starter.startGuide?.copyText?.includes('# 论文任务启动说明')));
    const searchStarter = context.taskStarters.find(starter => starter.id === 'academic-search');
    assert.ok(searchStarter);
    assert.equal(searchStarter.title_zh, '检索最新相关工作');
    assert.equal(searchStarter.skill, 'nature-academic-search');
    assert.ok(searchStarter.startGuide.missingContext.some(item => item.key === 'search_query'));
    const literatureStarter = context.taskStarters.find(starter => starter.id === 'literature-review-gap');
    assert.equal(literatureStarter.startGuide.recommendedSkill, 'literature-review');
    assert.equal(literatureStarter.startGuide.status, 'needs-context');
    assert.ok(literatureStarter.startGuide.missingContext.some(item => item.key === 'target_section_or_file'));
    assert.ok(literatureStarter.startGuide.beforeSend.some(item => item.includes('不要自动覆盖')));
    assert.ok(literatureStarter.startGuide.safeStartPrompt.includes('不要编造'));
    const planningStarter = context.taskStarters.find(starter => starter.id === 'paper-planning');
    assert.ok(planningStarter);
    assert.equal(planningStarter.title_zh, '论文规划 / Outline');
    assert.equal(planningStarter.skill, 'paper-planning');
    assert.ok(planningStarter.prompt.includes('paper outline'));
    assert.ok(planningStarter.startGuide.expectedOutputs.some(item => item.includes('reviewer 风险清单')));
    const polishStarter = context.taskStarters.find(starter => starter.id === 'paper-polish');
    assert.ok(polishStarter);
    assert.equal(polishStarter.title_zh, '论文润色 / 语言编辑');
    assert.equal(polishStarter.skill, 'writing-polish');
    assert.ok(polishStarter.prompt.includes('不要新增事实'));
    assert.ok(polishStarter.prompt.includes('降低 AI 痕迹'));
    assert.ok(polishStarter.startGuide.expectedOutputs.some(item => item.includes('AI 痕迹')));
    const evidenceReviewStarter = context.taskStarters.find(starter => starter.id === 'evidence-review');
    assert.ok(evidenceReviewStarter);
    assert.equal(evidenceReviewStarter.title_zh, '审查 AI 输出 / 证据核对');
    assert.equal(evidenceReviewStarter.skill, 'evidence-review');
    assert.ok(evidenceReviewStarter.prompt.includes('安全采纳包'));
    assert.ok(evidenceReviewStarter.startGuide.expectedOutputs.some(item => item.includes('幻觉引用')));
    const latexStarter = context.taskStarters.find(starter => starter.id === 'latex-debug');
    assert.ok(latexStarter);
    assert.equal(latexStarter.title_zh, '修复 LaTeX / Overleaf 报错');
    assert.equal(latexStarter.skill, 'latex-debugging');
    assert.equal(latexStarter.mode, 'tools');
    assert.ok(latexStarter.startGuide.missingContext.some(item => item.key === 'latex_error_log'));
    assert.ok(latexStarter.startGuide.expectedOutputs.some(item => item.includes('blocking error')));
    const conclusionStarter = context.taskStarters.find(starter => starter.id === 'conclusion-close');
    assert.ok(conclusionStarter);
    assert.equal(conclusionStarter.title_zh, '写 Conclusion / Future Work');
    assert.equal(conclusionStarter.skill, 'writing-conclusion');
    assert.ok(conclusionStarter.prompt.includes('不要重复 abstract'));
    const rebuttalStarter = context.taskStarters.find(starter => starter.id === 'reviewer-response');
    assert.ok(rebuttalStarter);
    assert.equal(rebuttalStarter.title_zh, '审稿回复 / Rebuttal');
    assert.equal(rebuttalStarter.skill, 'reviewer-response');
    assert.ok(rebuttalStarter.prompt.includes('reviewer comments'));
    assert.ok(rebuttalStarter.prompt.includes('revision plan'));
    assert.ok(rebuttalStarter.startGuide.expectedOutputs.some(item => item.includes('修改矩阵')));
    const submissionMaterialsStarter = context.taskStarters.find(starter => starter.id === 'submission-materials');
    assert.ok(submissionMaterialsStarter);
    assert.equal(submissionMaterialsStarter.title_zh, '投稿材料 / 声明检查');
    assert.equal(submissionMaterialsStarter.skill, 'conference-submission');
    assert.ok(submissionMaterialsStarter.prompt.includes('ethical statement'));
    const statisticsStarter = context.taskStarters.find(starter => starter.id === 'statistical-analysis');
    assert.ok(statisticsStarter);
    assert.equal(statisticsStarter.title_zh, '统计分析 / 显著性检验');
    assert.equal(statisticsStarter.skill, 'statistical-analysis');
    assert.ok(statisticsStarter.startGuide.expectedOutputs.some(item => item.includes('统计方法')));
    const grantStarter = context.taskStarters.find(starter => starter.id === 'grant-proposal');
    assert.ok(grantStarter);
    assert.equal(grantStarter.title_zh, '基金申请 / Research Proposal');
    assert.equal(grantStarter.skill, 'grant-proposal');
    assert.ok(grantStarter.startGuide.expectedOutputs.some(item => item.includes('申请书结构')));
    const paper2pptStarter = context.taskStarters.find(starter => starter.id === 'paper2ppt');
    assert.ok(paper2pptStarter);
    assert.equal(paper2pptStarter.title_zh, '论文转演示 / Slides');
    assert.equal(paper2pptStarter.skill, 'nature-paper2ppt');
    assert.ok(paper2pptStarter.prompt.includes('slides'));
    const posterStarter = context.taskStarters.find(starter => starter.id === 'poster-design');
    assert.ok(posterStarter);
    assert.equal(posterStarter.title_zh, '学术海报 / Poster');
    assert.equal(posterStarter.skill, 'poster-design');
    assert.ok(posterStarter.startGuide.why_zh.includes('学术海报'));
    assert.equal(
      literatureStarter.contextPrefill.target_section_or_file,
      'chapters/related_work.tex',
    );
    assert.equal(context.interactionPlan.mode, 'agent');
    assert.equal(context.interactionPlan.requiresConfirmation, true);
    assert.ok(context.interactionPlan.confirmationRequiredBefore.some(item => item.includes('写入')));
    assert.ok(context.interactionPlan.steps.some(step => step.id === 'review-before-apply' && step.status === 'requires-confirmation'));
    assert.ok(context.interactionPlan.outputPreview.items.some(item => item.includes('草稿')));
    assert.equal(context.modeDecisionGuide.selected.mode, 'agent');
    assert.equal(context.modeDecisionGuide.selected.label_zh, 'Agent 建议修改');
    assert.ok(context.modeDecisionGuide.summary_zh.includes('当前推荐'));
    assert.ok(context.modeDecisionGuide.selected.why_zh.some(item => item.includes('任务会影响论文正文')));
    assert.ok(context.modeDecisionGuide.alternatives.some(item => item.mode === 'chat' && item.why_zh.some(reason => reason.includes('没有选择 Chat'))));
    assert.ok(context.modeDecisionGuide.switchHints.some(item => item.targetMode === 'tools'));
    assert.ok(context.modeDecisionGuide.safetyBoundaries.some(item => item.mode === 'agent' && item.rule_zh.includes('不覆盖正文')));
    assert.ok(context.modeDecisionGuide.copyText.includes('# Chat / Agent / Tools 模式决策'));
    assert.equal(context.modeActionCenter.selectedMode, 'agent');
    assert.equal(context.modeActionCenter.status, 'blocked');
    assert.equal(context.modeActionCenter.primaryAction.enabled, false);
    assert.equal(context.modeActionCenter.sendGate.canSend, false);
    assert.equal(context.modeActionCenter.sendGate.requiresSafetyAck, true);
    assert.ok(context.modeActionCenter.sendGate.checkboxLabel_zh.includes('不会自动写入'));
    assert.ok(context.modeActionCenter.sendGate.mustNot_zh.some(item => item.includes('运行命令')));
    assert.ok(context.modeActionCenter.modeOptions.some(item => item.mode === 'chat'));
    assert.ok(context.modeActionCenter.preflightChecklist.some(item => item.id === 'explicit-user-action'));
    assert.ok(context.modeActionCenter.copyText.includes('# 模式操作中心'));
    assert.equal(context.aiDraftRequest.interactionPlan.mode, 'agent');
    assert.ok(context.taskRouting.missingContextDetails.some(item => item.label_zh === '目标章节或文件'));
    assert.equal(context.contextReadiness.status, 'blocked');
    assert.ok(context.contextReadiness.required.some(item => item.key === 'target_section_or_file'));
    assert.ok(context.contextReadiness.recommended.some(item => item.key === 'rag_documents_or_references'));
    assert.ok(context.clarificationQuestions.some(item => item.contextKey === 'target_section_or_file'));
    assert.ok(context.clarificationQuestions[0].question_zh);
    assert.ok(context.clarificationQuestions[0].placeholder_zh);
    assert.equal(context.contextBrief.status, 'needs-confirmation');
    assert.ok(context.contextBrief.items.some(item => item.key === 'target_section'));
    assert.ok(context.contextBrief.copyText.includes('# 当前任务上下文摘要'));
    assert.ok(context.contextBrief.openQuestions.some(item => item.includes('章节')));
    assert.equal(context.draftPlan.planType, 'literature-review');
    assert.ok(context.draftPlan.sections.length >= 3);
    assert.ok(context.draftPlan.sections.some(section => section.evidenceAssignments?.length > 0));
    assert.ok(context.draftPlan.sections[0].evidenceAssignments[0].rank >= 1);
    assert.ok(context.draftPlan.sections[0].evidenceAssignments[0].sourceLabel);
    assert.ok(context.draftPlan.sections[0].evidenceAssignments[0].use_zh);
    assert.ok(context.draftPlan.sections[0].evidenceAssignments[0].caution_zh);
    assert.ok(context.draftPlan.copyText.includes('# 写作计划'));
    assert.ok(context.draftPlan.copyText.includes('证据分配'));
    assert.ok(context.draftPlan.expectedOutput.some(item => item.includes('related work')));
    assert.equal(context.citationPolicy.status, 'grounded');
    assert.equal(context.citationPolicy.allowUnsupportedClaims, false);
    assert.ok(context.citationPolicy.requiredBehaviors.some(item => item.includes('来源编号')));
    assert.equal(context.acceptanceChecklist.status, 'strict');
    assert.ok(context.acceptanceChecklist.items.some(item => item.id === 'confirm-before-write' && item.blocking));
    assert.ok(context.acceptanceChecklist.items.some(item => item.id === 'sources-numbered' && item.blocking));
    assert.equal(context.writingPrompt.format, 'markdown');
    assert.ok(context.writingPrompt.text.includes('# 引用安全规则'));
    assert.ok(context.writingPrompt.text.includes('# 证据写作包'));
    assert.ok(context.writingPrompt.text.includes('证据包指纹：'));
    assert.ok(context.writingPrompt.text.includes('证据覆盖度'));
    assert.ok(context.writingPrompt.text.includes('补证据计划'));
    assert.ok(context.writingPrompt.text.includes('# 需要用户回答的问题'));
    assert.ok(context.writingPrompt.text.includes('# 当前上下文摘要'));
    assert.ok(context.writingPrompt.text.includes('# 写作计划'));
    assert.ok(context.writingPrompt.text.includes('不能支持'));
    assert.ok(context.writingPrompt.text.includes('# 验收清单'));
    assert.ok(context.writingPrompt.text.includes('[1]'));
    assert.equal(context.aiDraftRequest.mode, 'agent');
    assert.deepEqual(context.aiDraftRequest.active_skills, ['literature-review']);
    assert.equal(context.aiDraftRequest.send.rag.enabled, true);
    assert.ok(context.aiDraftRequest.send.userMessage.includes('# 验收清单'));
    assert.ok(context.aiDraftRequest.send.userMessage.includes('# 证据写作包'));
    assert.ok(context.aiDraftRequest.send.userMessage.includes('不能支持'));
    assert.equal(context.paperWorkflowGuide.status, 'blocked');
    assert.equal(context.paperWorkflowGuide.currentStep.id, 'confirm-context');
    assert.ok(context.paperWorkflowGuide.steps.some(step => step.id === 'prepare-evidence' && step.status === 'ready'));
    assert.ok(context.paperWorkflowGuide.steps.some(step => step.id === 'draft-with-ai' && step.blocking));
    assert.ok(context.paperWorkflowGuide.copyText.includes('# 论文写作流程向导'));
    assert.equal(context.actionQueue.status, 'blocked');
    assert.ok(context.actionQueue.actions.length > 0);
    assert.ok(context.actionQueue.actions[0].blocking);
    assert.ok(context.actionQueue.copyText.includes('# 下一步操作队列'));
    assert.equal(context.agentReadiness.status, 'blocked');
    assert.ok(context.agentReadiness.score <= 65);
    assert.ok(context.agentReadiness.blockers.some(item => item.id === 'context'));
    assert.equal(context.agentReadiness.acceptanceGate.canDraft, false);
    assert.equal(context.agentReadiness.acceptanceGate.requiresHumanReview, true);
    assert.ok(context.agentReadiness.dimensions.some(item => item.id === 'context' && item.blocking));
    assert.ok(context.agentReadiness.copyText.includes('# Paper Agent 生产可用性'));
    assert.equal(context.workbenchBundle.label_zh, '论文写作工作包');
    assert.equal(context.workbenchBundle.handoffGuide.status, 'needs-handoff-action');
    assert.ok(context.workbenchBundle.handoffGuide.copyText.includes('# 工作包交接指南'));
    assert.ok(context.workbenchBundle.handoffGuide.copyText.includes('生产 Gate'));
    assert.ok(context.workbenchBundle.handoffGuide.copyText.includes('服务器 OCR 自动恢复'));
    assert.ok(context.workbenchBundle.handoffGuide.copyText.includes('PDF 文本抽取'));
    assert.ok(context.workbenchBundle.handoffGuide.copyText.includes('真实浏览器 E2E'));
    assert.ok(context.workbenchBundle.handoffGuide.forbiddenActions.some(item => item.includes('papers/')));
    assert.ok(context.workbenchBundle.copyText.includes('# 论文写作工作包'));
    assert.ok(context.workbenchBundle.copyText.includes('# 工作包交接指南'));
    assert.ok(context.workbenchBundle.copyText.includes('# Paper Agent 生产可用性'));
    assert.ok(context.workbenchBundle.copyText.includes('# 论文写作流程'));
    assert.ok(context.workbenchBundle.copyText.includes('# 下一步操作队列'));
    assert.ok(context.workbenchBundle.copyText.includes('# Skill 决策'));
    assert.ok(context.workbenchBundle.copyText.includes('# Skill 对比'));
    assert.ok(context.workbenchBundle.copyText.includes('# 模式操作中心'));
    assert.ok(context.workbenchBundle.copyText.includes('# 证据写作包'));
    assert.ok(context.workbenchBundle.copyText.includes('# 写作计划'));
    assert.ok(context.workbenchBundle.sections.some(section => section.id === 'handoff-guide' && section.text.includes('# 工作包交接指南')));
    assert.ok(context.workbenchBundle.sections.some(section => section.id === 'agent-readiness' && section.text.includes('# Paper Agent 生产可用性')));
    assert.ok(context.workbenchBundle.sections.some(section => section.id === 'paper-workflow' && section.text.includes('# 论文写作流程向导')));
    assert.ok(context.workbenchBundle.sections.some(section => section.id === 'action-queue' && section.text.includes('# 下一步操作队列')));
    assert.ok(context.workbenchBundle.sections.some(section => section.id === 'skill-compare' && section.text.includes('# Skill 对比')));
    assert.ok(context.workbenchBundle.sections.some(section => section.id === 'mode-action-center' && section.text.includes('# 模式操作中心')));
    assert.ok(context.workbenchBundle.sections.some(section => section.id === 'ai-prompt' && section.text.includes('# 验收清单')));
    assert.equal(context.workbenchBundle.json.handoffGuide.status, 'needs-handoff-action');
    assert.equal(context.workbenchBundle.json.primarySkill.name, 'literature-review');
    assert.equal(context.uiModel.version, 1);
    assert.deepEqual(context.uiModel.layout.primaryColumn, [
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
    ]);
    assert.equal(context.uiModel.modeSwitcher.selected, 'agent');
    assert.equal(context.uiModel.skillPicker.display.showChineseTitleFirst, true);
    assert.equal(context.uiModel.skillPicker.selectedSkill, 'literature-review');
    assert.equal(context.uiModel.workflowGuide.source, 'paperWorkflowGuide');
    assert.equal(context.uiModel.taskStarters.source, 'taskStarters');
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'agent-readiness' && panel.source === 'agentReadiness'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'paper-workflow-guide' && panel.source === 'paperWorkflowGuide'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'interaction-plan' && panel.tone === 'danger'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'mode-decision-guide' && panel.source === 'modeDecisionGuide'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'mode-action-center' && panel.source === 'modeActionCenter'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'action-queue' && panel.source === 'actionQueue'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'task-starters' && panel.statusLabel_zh.includes('个入口')));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'skill-navigator' && panel.statusLabel_zh.includes('Skill')));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'skill-compare' && panel.source === 'skills.compareGuide'));
    assert.equal(context.uiModel.evidenceDrawer.status, 'healthy');
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'evidence-pack' && panel.statusLabel_zh === '证据包可用'));
    assert.equal(context.uiModel.evidenceDrawer.count, context.rag.evidence.results.length);
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'skill-picker' && panel.statusLabel_zh === '文献综述'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'acceptance-checklist' && panel.tone === 'danger'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'context-brief' && panel.statusLabel_zh === '需要确认上下文'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'draft-plan' && panel.statusLabel_zh === '计划需先确认'));
    assert.equal(context.uiModel.primaryAction.type, 'select-file');
    assert.equal(context.uiModel.primaryAction.blockedBy, 'target_section_or_file');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('buildPaperWorkbenchContext uses structured context answers to unblock writing', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-answers-'));
  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'rag-notes.md'),
      [
        '# Retrieval Notes',
        '',
        'Retrieval augmented generation improves literature review grounding.',
        'Evidence snippets should be visible when writing related work.',
      ].join('\n'),
      'utf-8',
    );
    await indexProjectCorpus(projectRoot);

    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: '帮我根据证据写 related work 和 research gap',
      contextAnswers: {
        target_section_or_file: 'chapters/related_work.tex',
        paper_claims: '本文关注可审查的 RAG 写作流程。',
      },
      skillLimit: 3,
      evidenceLimit: 2,
    });

    assert.equal(context.projectState.contextAnswers.target_section_or_file, 'chapters/related_work.tex');
    assert.ok(context.projectState.answeredContextKeys.includes('target_section_or_file'));
    assert.equal(context.taskRouting.mode, 'agent');
    assert.ok(!context.taskRouting.missingContext.includes('target_section_or_file'));
    assert.ok(!context.taskRouting.nextActions.some(action => action.type === 'select-file'));
    assert.equal(context.contextReadiness.status, 'ready');
    assert.equal(context.contextReadiness.totalRequired, 0);
    assert.ok(!context.clarificationQuestions.some(item => item.contextKey === 'target_section_or_file'));
    assert.ok(context.contextBrief.items.some(item =>
      item.key === 'target_section' &&
      item.label_zh === '已确认目标章节' &&
      item.value_zh === 'chapters/related_work.tex' &&
      item.confidence === 'high'));
    assert.ok(context.contextBrief.items.some(item =>
      item.key === 'answer_paper_claims' &&
      item.value_zh.includes('可审查的 RAG 写作流程')));
    assert.ok(context.contextBrief.copyText.includes('chapters/related_work.tex'));
    assert.ok(context.writingPrompt.text.includes('本文关注可审查的 RAG 写作流程'));
    assert.equal(context.agentReadiness.status, 'needs-review');
    assert.equal(context.agentReadiness.blockers.length, 0);
    assert.ok(context.agentReadiness.productionWarnings.some(item => item.id === 'runtime-environment'));
    assert.ok(context.agentReadiness.productionWarnings.some(item =>
      item.action?.type === 'run-browser-e2e-preflight' &&
      item.action?.command === 'node scripts/playwright-preflight.mjs' &&
      item.action?.commandPack.includes('npx playwright install') &&
      item.action?.commandPack.includes('sudo npx playwright install-deps')
    ));
    assert.ok(context.runtimeEnvironment.nextActions.some(action =>
      action.type === 'prepare-manual-ocr-fallback' &&
      action.commandPack.includes('sudo apt-get install -y ocrmypdf tesseract-ocr poppler-utils')
    ));
    assert.equal(context.agentReadiness.acceptanceGate.canDraft, true);
    assert.equal(context.agentReadiness.acceptanceGate.canUseForCitableText, true);
    assert.ok(context.agentReadiness.score >= 85);
    assert.ok(context.agentReadiness.dimensions.every(item => !item.blocking));
    assert.equal(context.runtimeEnvironment.ocrCapability.status, 'not-configured');
    assert.ok(context.runtimeEnvironment.ocrCapability.commandPack.includes('command -v ocrmypdf'));
    assert.ok(context.runtimeEnvironment.ocrCapability.commandPack.includes('sudo apt-get install -y ocrmypdf tesseract-ocr poppler-utils'));
    assert.equal(context.runtimeEnvironment.status, 'needs-production-validation');
    assert.equal(context.runtimeEnvironment.label_zh, '运行环境生产 Gate 未完成');
    assert.equal(context.runtimeEnvironment.browserE2eCapability.status, 'not-verified-in-workbench');
    assert.equal(context.runtimeEnvironment.browserE2eCapability.requiredBeforeProduction, true);
    assert.ok(context.agentReadiness.readinessTiers.some(item => item.id === 'reviewable-draft'));
    assert.ok(context.agentReadiness.readinessTiers.some(item => item.id === 'human-adoption'));
    assert.ok(context.agentReadiness.readinessTiers.some(item => item.id === 'production-release' && item.status === 'blocked'));
    assert.ok(context.agentReadiness.copyText.includes('# 可用性分级'));
    assert.ok(context.agentReadiness.copyText.includes('生产发布级'));
    assert.ok(context.runtimeEnvironment.browserE2eCapability.command.includes('playwright-preflight'));
    assert.ok(context.runtimeEnvironment.browserE2eCapability.commandPack.includes('npx playwright install'));
    assert.ok(context.runtimeEnvironment.browserE2eCapability.commandPack.includes('sudo npx playwright install-deps'));
    assert.ok(context.runtimeEnvironment.browserE2eCapability.commandPack.includes('pnpm e2e'));
    assert.ok(context.runtimeEnvironment.copyText.includes('# Paper Agent 运行环境能力'));
    assert.ok(context.runtimeEnvironment.copyText.includes('# Paper Agent OCR 生产恢复命令'));
    assert.ok(context.runtimeEnvironment.copyText.includes('sudo apt-get install -y ocrmypdf tesseract-ocr poppler-utils'));
    assert.ok(context.runtimeEnvironment.copyText.includes('# 浏览器 E2E 能力'));
    assert.ok(context.runtimeEnvironment.copyText.includes('node scripts/playwright-preflight.mjs'));
    assert.ok(context.runtimeEnvironment.copyText.includes('pnpm e2e'));
    assert.ok(context.runtimeEnvironment.copyText.includes('# Paper Agent 浏览器 E2E 生产验收命令'));
    assert.ok(context.runtimeEnvironment.productionGates.some(gate => gate.id === 'server-ocr' && gate.status === 'blocked'));
    assert.ok(context.runtimeEnvironment.productionGates.some(gate => gate.id === 'pdf-text-extraction' && gate.status === 'blocked'));
    assert.ok(context.runtimeEnvironment.productionGates.some(gate => gate.id === 'browser-e2e' && gate.status === 'blocked'));
    assert.ok(context.runtimeEnvironment.copyText.includes('# 生产验收 Gate'));
    assert.ok(context.runtimeEnvironment.copyText.includes('PDF 文本抽取'));
    assert.ok(context.workbenchBundle.handoffGuide.copyText.includes('生产 Gate'));
    assert.ok(context.workbenchBundle.handoffGuide.copyText.includes('服务器 OCR 自动恢复'));
    assert.ok(context.workbenchBundle.handoffGuide.copyText.includes('PDF 文本抽取'));
    assert.ok(context.workbenchBundle.handoffGuide.copyText.includes('真实浏览器 E2E'));
    assert.equal(context.runtimeEnvironment.recheckPlan.status, 'required-before-production');
    assert.ok(context.runtimeEnvironment.recheckPlan.steps.some(step => step.id === 'reanalyze-workbench'));
    assert.ok(context.runtimeEnvironment.recheckPlan.successCriteria.some(item => item.includes('pnpm e2e')));
    assert.ok(context.runtimeEnvironment.recheckPlan.successCriteria.some(item => item.includes('production-release')));
    assert.ok(context.runtimeEnvironment.recheckPlan.copyText.includes('# 依赖修复后复验计划'));
    assert.ok(context.runtimeEnvironment.copyText.includes('# 依赖修复后复验计划'));
    assert.ok(context.runtimeEnvironment.copyText.includes('重新分析工作台'));
    assert.ok(context.workbenchBundle.sections.some(section =>
      section.id === 'runtime-environment' &&
      section.title_zh === '运行环境能力' &&
      section.text.includes('# Paper Agent 运行环境能力') &&
      section.text.includes('# 浏览器 E2E 能力') &&
      section.text.includes('# 依赖修复后复验计划')
    ));
    assert.ok(context.workbenchBundle.copyText.includes('# 运行环境能力'));
    assert.ok(context.agentReadiness.copyText.includes('# 生产验收警告'));
    assert.ok(context.agentReadiness.copyText.includes('真实浏览器 E2E 未在工作台内验证'));
    assert.ok(context.agentReadiness.dimensions.some(item =>
      item.id === 'runtime-environment' &&
      item.status === 'needs-browser-e2e' &&
      item.productionWarning &&
      !item.blocking
    ));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('browser E2E readiness requires full E2E acceptance, not only Chromium preflight', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-e2e-state-'));
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-e2e-runtime-'));
  const previousPreflightPath = process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH;
  const previousE2ePath = process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH;
  const previousOcrTools = process.env.PAPER_RAG_OCR_TOOLS;
  const preflightPath = path.join(stateRoot, 'playwright-preflight.json');
  const e2ePath = path.join(stateRoot, 'playwright-e2e.json');
  try {
    process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH = preflightPath;
    process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH = e2ePath;
    process.env.PAPER_RAG_OCR_TOOLS = 'ocrmypdf,tesseract,pdftotext';
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'rag-notes.md'),
      [
        '# Retrieval Notes',
        '',
        'Fact: Paper Agent keeps citations tied to visible evidence snippets.',
        'Evidence text: The workflow requires evidence packs, AI output review, and single-claim checks before adoption.',
        'Page/section: internal validation notes',
      ].join('\n'),
      'utf-8',
    );
    await writeFile(path.join(projectRoot, 'references.bib'), '@article{demo,title={Demo}}\n', 'utf-8');
    await indexProjectCorpus(projectRoot);
    await writeFile(preflightPath, JSON.stringify({
      status: 'passed',
      checkedAt: '2026-06-13T00:00:00.000Z',
      command: 'node scripts/playwright-preflight.mjs',
      message: 'Playwright Chromium preflight passed.',
    }), 'utf-8');

    const baseOptions = {
      task: '帮我根据证据写 related work 和 research gap',
      evidenceQuery: 'citation evidence review adoption',
      contextAnswers: {
        target_section_or_file: 'chapters/related_work.tex',
        paper_claims: '本文关注可审查的 RAG 写作流程。',
      },
    };
    const preflightOnly = await buildPaperWorkbenchContext(projectRoot, baseOptions);
    assert.equal(preflightOnly.runtimeEnvironment.browserE2eCapability.status, 'preflight-passed');
    assert.ok(preflightOnly.runtimeEnvironment.browserE2eCapability.detail_zh.includes('pnpm e2e'));
    assert.ok(preflightOnly.agentReadiness.productionWarnings.some(item => item.id === 'runtime-environment'));
    assert.ok(preflightOnly.agentReadiness.readinessTiers.some(item =>
      item.id === 'production-release' && item.status === 'blocked'));

    await writeFile(e2ePath, JSON.stringify({
      status: 'passed',
      checkedAt: '2026-06-13T00:10:00.000Z',
      command: 'pnpm e2e',
      preflightCommand: 'node scripts/playwright-preflight.mjs',
      testCommand: 'playwright test',
      exitCode: 0,
      message: 'Playwright E2E acceptance passed.',
    }), 'utf-8');
    const fullE2e = await buildPaperWorkbenchContext(projectRoot, baseOptions);
    assert.equal(fullE2e.runtimeEnvironment.status, 'ready');
    assert.equal(fullE2e.runtimeEnvironment.label_zh, '运行环境生产 Gate 已通过');
    assert.equal(fullE2e.runtimeEnvironment.browserE2eCapability.status, 'ready');
    assert.ok(fullE2e.runtimeEnvironment.productionGates.every(gate => gate.status === 'ready'));
    assert.equal(fullE2e.runtimeEnvironment.recheckPlan.status, 'ready-to-record');
    assert.match(fullE2e.runtimeEnvironment.recheckPlan.summary_zh, /复验证据可记录|验收输出/);
    assert.ok(!fullE2e.agentReadiness.productionWarnings.some(item => item.id === 'runtime-environment'));
  } finally {
    process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH = previousPreflightPath;
    process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH = previousE2ePath;
    if (previousOcrTools === undefined) {
      delete process.env.PAPER_RAG_OCR_TOOLS;
    } else {
      process.env.PAPER_RAG_OCR_TOOLS = previousOcrTools;
    }
    await rm(projectRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('OCR tooling remains a production warning even after full browser E2E passes', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-ocr-production-'));
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-ocr-runtime-'));
  const previousPreflightPath = process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH;
  const previousE2ePath = process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH;
  const previousOcrTools = process.env.PAPER_RAG_OCR_TOOLS;
  try {
    process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH = path.join(stateRoot, 'playwright-preflight.json');
    process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH = path.join(stateRoot, 'playwright-e2e.json');
    process.env.PAPER_RAG_OCR_TOOLS = 'none';
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'rag-notes.md'),
      [
        '# Retrieval Notes',
        '',
        'Fact: Paper Agent keeps citations tied to visible evidence snippets.',
        'Evidence text: The workflow requires evidence packs, AI output review, and single-claim checks before adoption.',
        'Page/section: internal validation notes',
      ].join('\n'),
      'utf-8',
    );
    await writeFile(path.join(projectRoot, 'references.bib'), '@article{demo,title={Demo}}\n', 'utf-8');
    await indexProjectCorpus(projectRoot);
    await writeFile(process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH, JSON.stringify({
      status: 'passed',
      checkedAt: '2026-06-13T00:00:00.000Z',
      command: 'node scripts/playwright-preflight.mjs',
      message: 'Playwright Chromium preflight passed.',
    }), 'utf-8');
    await writeFile(process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH, JSON.stringify({
      status: 'passed',
      checkedAt: '2026-06-13T00:10:00.000Z',
      command: 'pnpm e2e',
      preflightCommand: 'node scripts/playwright-preflight.mjs',
      testCommand: 'playwright test',
      exitCode: 0,
      message: 'Playwright E2E acceptance passed.',
    }), 'utf-8');

    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: '帮我根据证据写 related work 和 research gap',
      evidenceQuery: 'citation evidence review adoption',
      contextAnswers: {
        target_section_or_file: 'chapters/related_work.tex',
        paper_claims: '本文关注可审查的 RAG 写作流程。',
      },
    });

    assert.equal(context.runtimeEnvironment.browserE2eCapability.status, 'ready');
    assert.equal(context.runtimeEnvironment.ocrCapability.status, 'not-configured');
    assert.ok(context.agentReadiness.productionWarnings.some(item => item.id === 'runtime-environment'));
    assert.ok(context.agentReadiness.dimensions.some(item =>
      item.id === 'runtime-environment' &&
      item.status === 'needs-ocr-tooling' &&
      item.productionWarning &&
      !item.blocking
    ));
    assert.ok(context.agentReadiness.readinessTiers.some(item =>
      item.id === 'production-release' && item.status === 'blocked'));
    assert.ok(context.agentReadiness.copyText.includes('服务器未检测到 OCR 工具'));
  } finally {
    process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH = previousPreflightPath;
    process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH = previousE2ePath;
    if (previousOcrTools === undefined) {
      delete process.env.PAPER_RAG_OCR_TOOLS;
    } else {
      process.env.PAPER_RAG_OCR_TOOLS = previousOcrTools;
    }
    await rm(projectRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('missing pdftotext keeps PDF extraction tooling below production release', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-pdftotext-production-'));
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-pdftotext-runtime-'));
  const previousPreflightPath = process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH;
  const previousE2ePath = process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH;
  const previousOcrTools = process.env.PAPER_RAG_OCR_TOOLS;
  try {
    process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH = path.join(stateRoot, 'playwright-preflight.json');
    process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH = path.join(stateRoot, 'playwright-e2e.json');
    process.env.PAPER_RAG_OCR_TOOLS = 'ocrmypdf,tesseract';
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'rag-notes.md'),
      [
        '# Retrieval Notes',
        '',
        'Fact: Paper Agent keeps citations tied to visible evidence snippets.',
        'Evidence text: The workflow requires evidence packs, AI output review, and single-claim checks before adoption.',
        'Page/section: internal validation notes',
      ].join('\n'),
      'utf-8',
    );
    await writeFile(path.join(projectRoot, 'references.bib'), '@article{demo,title={Demo}}\n', 'utf-8');
    await indexProjectCorpus(projectRoot);
    await writeFile(process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH, JSON.stringify({
      status: 'passed',
      checkedAt: '2026-06-13T00:00:00.000Z',
      command: 'node scripts/playwright-preflight.mjs',
      message: 'Playwright Chromium preflight passed.',
    }), 'utf-8');
    await writeFile(process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH, JSON.stringify({
      status: 'passed',
      checkedAt: '2026-06-13T00:10:00.000Z',
      command: 'pnpm e2e',
      preflightCommand: 'node scripts/playwright-preflight.mjs',
      testCommand: 'playwright test',
      exitCode: 0,
      message: 'Playwright E2E acceptance passed.',
    }), 'utf-8');

    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: '帮我根据证据写 related work 和 research gap',
      evidenceQuery: 'citation evidence review adoption',
      contextAnswers: {
        target_section_or_file: 'chapters/related_work.tex',
        paper_claims: '本文关注可审查的 RAG 写作流程。',
      },
    });

    assert.equal(context.runtimeEnvironment.browserE2eCapability.status, 'ready');
    assert.equal(context.runtimeEnvironment.ocrCapability.serverCanRunOcr, true);
    assert.equal(context.runtimeEnvironment.ocrCapability.pdfTextExtractionAvailable, false);
    assert.ok(context.agentReadiness.productionWarnings.some(item => item.id === 'runtime-environment'));
    assert.ok(context.agentReadiness.dimensions.some(item =>
      item.id === 'runtime-environment' &&
      item.status === 'needs-ocr-tooling' &&
      item.evidence_zh.includes('PDF 文本抽取：未验证/不可用')
    ));
    assert.ok(context.agentReadiness.readinessTiers.some(item =>
      item.id === 'production-release' && item.status === 'blocked'));
    assert.ok(context.runtimeEnvironment.copyText.includes('pdftotext'));
  } finally {
    process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH = previousPreflightPath;
    process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH = previousE2ePath;
    if (previousOcrTools === undefined) {
      delete process.env.PAPER_RAG_OCR_TOOLS;
    } else {
      process.env.PAPER_RAG_OCR_TOOLS = previousOcrTools;
    }
    await rm(projectRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test('buildPaperWorkbenchContext explains an empty evidence library', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-empty-'));
  try {
    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: '帮我写 related work',
    });

    assert.equal(context.projectState.hasRagDocuments, false);
    assert.equal(context.rag.ready, false);
    assert.equal(context.rag.health.status, 'unusable');
    assert.equal(context.rag.documentReadinessGuide.status, 'empty');
    assert.equal(context.rag.documentReadinessGuide.counts.total, 0);
    assert.equal(context.rag.queryAssistant.status, 'needs-upload');
    assert.ok(context.rag.queryAssistant.actions.some(action => action.type === 'upload-evidence'));
    assert.ok(context.rag.queryAssistant.copyText.includes('# RAG 检索助手'));
    assert.equal(context.rag.queryRewriteGuide.status, 'needs-indexed-text');
    assert.ok(context.rag.queryRewriteGuide.reason_zh.includes('可检索正文'));
    assert.ok(context.rag.health.issues.some(issue => issue.code === 'empty-library'));
    assert.equal(context.rag.summary.total, 0);
    assert.deepEqual(context.rag.evidence.results, []);
    assert.equal(context.evidencePack.status, 'missing-evidence');
    assert.ok(context.evidencePack.fallbackActions.some(action => action.type === 'upload-evidence'));
    assert.ok(context.evidencePack.copyText.includes('上传更多 PDF'));
    assert.ok(context.rag.uiHints.some(hint => hint.code === 'rag-empty'));
    assert.equal(context.rag.repairGuide.status, 'needs-repair');
    assert.ok(context.rag.repairGuide.items.some(item => item.id === 'upload-first-evidence' && item.action.type === 'upload-evidence'));
    assert.ok(context.rag.repairGuide.repairPlan.steps.some(step => step.id === 'upload-first-evidence' && step.blocksCitationWriting));
    assert.ok(context.rag.repairGuide.copyText.includes('# 证据库修复计划'));
    assert.ok(context.rag.repairGuide.copyText.includes('上传第一批文献'));
    assert.ok(context.workflowHints.some(hint => hint.code === 'upload-first-evidence'));
    assert.ok(context.taskStarters.some(starter => starter.id === 'literature-review-gap' && starter.disabled === true));
    assert.ok(context.taskStarters.some(starter => starter.id === 'citation-cleanup' && starter.disabled === true));
    assert.ok(context.taskStarters.some(starter => starter.primaryAction.type === 'upload-evidence'));
    const disabledLiteratureStarter = context.taskStarters.find(starter => starter.id === 'literature-review-gap');
    assert.equal(disabledLiteratureStarter.startGuide.status, 'blocked');
    assert.ok(disabledLiteratureStarter.startGuide.missingContext.some(item => item.key === 'rag_documents_or_references'));
    assert.ok(disabledLiteratureStarter.startGuide.copyText.includes('先补资料'));
    assert.ok(context.skills.recommendations[0].missingContext.includes('rag_documents_or_references'));
    assert.equal(context.taskRouting.mode, 'agent');
    assert.ok(context.taskRouting.missingContext.includes('rag_documents_or_references'));
    assert.ok(context.taskRouting.missingContextDetails.some(item => item.label_zh === '文献证据或 references.bib'));
    assert.equal(context.contextReadiness.status, 'blocked');
    assert.ok(context.contextReadiness.required.some(item => item.key === 'rag_documents_or_references'));
    assert.ok(context.clarificationQuestions.some(item => item.contextKey === 'rag_documents_or_references'));
    assert.equal(context.citationPolicy.status, 'no-evidence');
    assert.ok(context.interactionPlan.blockedReasons.some(reason => reason.code === 'missing-evidence'));
    assert.ok(context.interactionPlan.visibleWarnings.some(warning => warning.includes('阻塞项')));
    assert.equal(context.paperWorkflowGuide.status, 'blocked');
    assert.equal(context.paperWorkflowGuide.currentStep.id, 'prepare-evidence');
    assert.ok(context.paperWorkflowGuide.steps.some(step => step.id === 'prepare-evidence' && step.blocking && step.action.type === 'upload-evidence'));
    assert.equal(context.citationPolicy.allowUnsupportedClaims, false);
    assert.ok(context.citationPolicy.forbiddenBehaviors.some(item => item.includes('编造')));
    assert.ok(context.acceptanceChecklist.items.some(item => item.id === 'no-fake-citations' && item.blocking));
    assert.ok(context.writingPrompt.text.includes('当前没有命中的 RAG 证据'));
    assert.ok(context.writingPrompt.text.includes('上传更多 PDF'));
    assert.equal(context.uiModel.primaryAction.type, 'select-file');
    assert.ok(context.uiModel.evidenceDrawer.actions.some(action => action.type === 'upload-evidence'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'rag-health' && panel.tone === 'danger'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'evidence-pack' && panel.tone === 'danger'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'rag-repair-guide' && panel.tone === 'danger'));
    assert.equal(context.agentReadiness.status, 'blocked');
    assert.ok(context.agentReadiness.score <= 45);
    assert.ok(context.agentReadiness.blockers.some(item => item.id === 'evidence'));
    assert.ok(context.agentReadiness.blockers.some(item => item.id === 'citation-safety'));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('buildPaperWorkbenchContext blocks unfilled manual note templates as evidence', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-template-note-'));
  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'manual-note.md'),
      [
        '# scanned - 人工摘录文献笔记',
        '',
        '> Source file: scanned.pdf',
        '> 规则：只写你从论文原文/OCR 中核对过的内容。',
        '',
        '## Bibliographic metadata (人工核对后填写)',
        '- Title: ',
        '- Authors: ',
        '',
        '## Citable facts for writing',
        '- [ ] Fact: ',
        '  Evidence text: ',
        '  Page/section: ',
      ].join('\n'),
      'utf-8',
    );
    await indexProjectCorpus(projectRoot);

    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: '帮我根据证据写 related work',
      evidenceLimit: 3,
    });

    const card = context.rag.documentReadinessGuide.cards.find(item => item.path.endsWith('manual-note.md'));
    assert.ok(card);
    assert.equal(card.status, 'template-empty');
    assert.equal(card.blocksCitationWriting, true);
    assert.equal(card.contentQuality.status, 'template-empty');
    assert.equal(context.rag.summary.indexedChunks, 0);
    assert.equal(context.rag.repairGuide.status, 'needs-repair');
    assert.ok(context.rag.repairGuide.items.some(item => item.id === 'fill-manual-note-templates'));
    assert.ok(context.rag.repairGuide.copyText.includes('填写人工核对过的题名'));
    assert.equal(context.evidencePack.status, 'missing-evidence');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('buildPaperWorkbenchContext blocks incomplete manual note evidence fields', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-incomplete-note-'));
  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'manual-note.md'),
      [
        '# scanned - 人工摘录文献笔记',
        '',
        '## Bibliographic metadata (人工核对后填写)',
        '- Title: Demo Paper',
        '- Authors: Demo Author',
        '',
        '## Citable facts for writing',
        '- [x] Fact: Demo method improves grounded writing with visible retrieval evidence.',
        '  Evidence text: ',
        '  Page/section: ',
      ].join('\n'),
      'utf-8',
    );
    await indexProjectCorpus(projectRoot);

    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: '帮我根据 evidence 写 related work',
      evidenceLimit: 3,
    });

    const card = context.rag.documentReadinessGuide.cards.find(item => item.path.endsWith('manual-note.md'));
    assert.ok(card);
    assert.equal(card.status, 'manual-note-incomplete');
    assert.equal(card.blocksCitationWriting, true);
    assert.equal(card.contentQuality.status, 'manual-note-incomplete');
    assert.match(card.message_zh, /缺少/);
    assert.equal(context.rag.summary.indexedChunks, 0);
    assert.equal(context.evidencePack.status, 'missing-evidence');
    assert.ok(context.rag.repairGuide.items.some(item => item.id === 'complete-manual-note-evidence-fields'));
    assert.ok(context.rag.repairGuide.repairPlan.steps.some(step => step.id === 'complete-manual-note-evidence-fields' && step.blocksCitationWriting));
    assert.ok(context.rag.repairGuide.copyText.includes('Fact'));
    assert.ok(context.rag.repairGuide.copyText.includes('Evidence text'));
    assert.ok(context.rag.repairGuide.copyText.includes('Page/section'));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('buildPaperWorkbenchContext accepts multiline OCR manual notes as evidence', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-multiline-note-'));
  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'manual-note.md'),
      [
        '# scanned - 人工摘录文献笔记',
        '',
        '> Source file: scanned.pdf',
        '> 规则：只写你从论文原文/OCR 中核对过的内容。',
        '',
        '## Citable facts for writing',
        '- [x] Fact: Visible retrieval evidence helps writers verify grounded claims before drafting.',
        '  Evidence text:',
        '  > The paper reports that visible retrieval evidence helps writers verify grounded claims before drafting and reduces unsupported statements.',
        '  Page/section:',
        '  > p. 4, Section 3',
      ].join('\n'),
      'utf-8',
    );
    await indexProjectCorpus(projectRoot);

    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: '帮我根据 visible retrieval evidence 写 related work',
      evidenceLimit: 3,
    });

    const card = context.rag.documentReadinessGuide.cards.find(item => item.path.endsWith('manual-note.md'));
    assert.ok(card);
    assert.equal(card.status, 'citable');
    assert.equal(card.blocksCitationWriting, false);
    assert.equal(card.contentQuality.status, 'usable');
    assert.ok(context.rag.summary.indexedChunks > 0);
    assert.equal(context.evidencePack.status, 'ready');
    assert.ok(context.evidencePack.items.some(item => /visible retrieval evidence/i.test(item.snippet)));
    assert.ok(!context.rag.repairGuide.items.some(item => item.id === 'complete-manual-note-evidence-fields'));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('buildPaperWorkbenchContext uses evidenceQuery for RAG evidence packs', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-evidence-query-'));
  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'gnn-notes.md'),
      [
        '# GNN Notes',
        '',
        'Graph neural network methods aggregate neighborhood information for node classification.',
        'Message passing layers help compare graph representation learning approaches.',
      ].join('\n'),
      'utf-8',
    );
    await indexProjectCorpus(projectRoot);

    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: '帮我写 related work',
      evidenceQuery: 'graph neural network message passing',
      contextAnswers: {
        target_section_or_file: 'chapters/related_work.tex',
      },
      evidenceLimit: 3,
    });

    assert.equal(context.rag.evidence.query, 'graph neural network message passing');
    assert.equal(context.aiDraftRequest.send.rag.query, 'graph neural network message passing');
    assert.ok(context.rag.evidence.results.length > 0);
    assert.equal(context.evidencePack.status, 'ready');
    assert.ok(context.writingPrompt.text.includes('graph representation learning'));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('buildPaperWorkbenchContext gives recovery actions for failed parsing and no evidence hits', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-recovery-'));
  const originalOcrTools = process.env.PAPER_RAG_OCR_TOOLS;
  process.env.PAPER_RAG_OCR_TOOLS = 'none';
  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'methods-notes.md'),
      'This note only discusses optimizer settings and training schedules.',
      'utf-8',
    );
    await writeFile(path.join(projectRoot, 'research_corpus', 'scanned.pdf'), Buffer.from('%PDF-1.4\n'));
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'scanned.pdf.rag.json'),
      JSON.stringify({
        parseStatus: 'failed',
        parser: 'pdf-text-extraction',
        extractedTextChars: 0,
        error: 'PDF parser returned no extractable text',
        warnings: [],
      }),
      'utf-8',
    );
    await indexProjectCorpus(projectRoot);

    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: '帮我根据 graph neural network 的证据写 related work',
      skillLimit: 3,
      evidenceLimit: 2,
    });

    assert.equal(context.rag.summary.failed, 1);
    assert.equal(context.rag.health.status, 'needs-attention');
    assert.equal(context.rag.repairGuide.status, 'needs-repair');
    assert.equal(context.rag.documentReadinessGuide.status, 'needs-repair');
    assert.equal(context.runtimeEnvironment.status, 'blocked');
    assert.equal(context.runtimeEnvironment.ocrCapability.status, 'not-configured');
    assert.ok(context.runtimeEnvironment.documentsNeedingOcr.some(item => item.path.endsWith('scanned.pdf')));
    assert.ok(context.runtimeEnvironment.copyText.includes('运行环境缺少 OCR 工具'));
    assert.ok(context.rag.documentReadinessGuide.cards.some(card => card.status === 'failed' && card.blocksCitationWriting));
    const failedCard = context.rag.documentReadinessGuide.cards.find(card => card.path.endsWith('scanned.pdf'));
    assert.equal(failedCard.recovery.code, 'needs-ocr');
    assert.equal(failedCard.recovery.ocrCapability.status, 'not-configured');
    assert.equal(failedCard.recovery.ocrCapability.automaticRecoveryAvailable, false);
    assert.match(failedCard.recovery.noteTemplate, /Citable facts for writing/);
    assert.match(failedCard.message_zh, /OCR|Markdown/);
    assert.match(context.rag.documentReadinessGuide.copyText, /恢复诊断：PDF 可能是扫描版，需要 OCR/);
    assert.match(context.rag.documentReadinessGuide.copyText, /OCR 能力：服务器未检测到 OCR 工具/);
    assert.match(context.rag.documentReadinessGuide.copyText, /可复制 Markdown 文献笔记模板/);
    assert.equal(context.rag.queryAssistant.status, 'needs-repair');
    assert.ok(context.rag.queryAssistant.suggestedQueries.some(query => /graph|neural|network/i.test(query)));
    assert.ok(context.rag.queryAssistant.steps.some(step => step.id === 'check-document-readiness'));
    assert.ok(['recommended', 'optional'].includes(context.rag.queryRewriteGuide.status));
    assert.ok(context.rag.queryRewriteGuide.groups.some(group => group.id === 'method-comparison'));
    assert.ok(context.rag.repairGuide.items.some(item => item.id === 'fix-pdf-parse-failures'));
    assert.ok(context.rag.repairGuide.items.some(item => item.id === 'refine-query-no-hit'));
    assert.ok(context.rag.repairGuide.items.some(item => item.affectedDocuments.some(document => document.path.endsWith('scanned.pdf'))));
    assert.ok(context.rag.repairGuide.repairPlan.steps.some(step => step.id === 'fix-pdf-parse-failures' && step.blocksCitationWriting));
    assert.ok(context.rag.repairGuide.repairPlan.steps.some(step => step.id === 'refine-query-no-hit' && !step.blocksCitationWriting));
    assert.ok(context.rag.repairGuide.copyText.includes('scanned.pdf'));
    assert.ok(context.rag.repairGuide.copyText.includes('换用英文方法名'));
    assert.ok(context.rag.health.issues.some(issue => issue.code === 'parse-failures'));
    assert.ok(context.rag.health.issues.some(issue => issue.code === 'query-no-hit'));
    assert.equal(context.rag.evidence.results.length, 0);
    assert.ok(context.rag.uiHints.some(hint => hint.code === 'parse-failed-documents'));
    assert.ok(context.rag.uiHints.some(hint => hint.code === 'no-evidence-hit'));
    assert.ok(context.workflowHints.some(hint => hint.code === 'fix-pdf-parse-failures'));
    assert.ok(context.workflowHints.some(hint => hint.code === 'refine-evidence-query'));
    assert.equal(context.citationPolicy.status, 'needs-evidence');
    assert.ok(context.citationPolicy.requiredBehaviors.some(item => item.includes('换关键词')));
    assert.ok(context.acceptanceChecklist.items.some(item => item.id === 'no-fake-citations' && item.blocking));
    assert.equal(context.uiModel.evidenceDrawer.status, 'needs-attention');
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'evidence-drawer' && panel.tone === 'danger'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'next-actions' && panel.tone === 'danger'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'rag-query-assistant' && panel.statusLabel_zh === '先修复文档解析'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'rag-query-rewrite' && panel.source === 'rag.queryRewriteGuide'));
    assert.ok(context.uiModel.panels.some(panel => panel.id === 'rag-repair-guide' && panel.statusLabel_zh === '需要修复'));
    assert.ok(context.agentReadiness.dimensions.some(item => item.id === 'runtime-environment' && item.blocking));
    assert.ok(context.agentReadiness.blockers.some(item => item.id === 'runtime-environment'));
  } finally {
    if (originalOcrTools === undefined) {
      delete process.env.PAPER_RAG_OCR_TOOLS;
    } else {
      process.env.PAPER_RAG_OCR_TOOLS = originalOcrTools;
    }
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('routeWritingTask keeps a stable UI contract for empty tasks', () => {
  const routing = routeWritingTask('');

  assert.equal(routing.mode, 'chat');
  assert.deepEqual(routing.missingContext, []);
  assert.deepEqual(routing.missingContextDetails, []);
  assert.ok(routing.nextActions.some(action => action.type === 'ask-task'));
});

test('routeWritingTask separates Chat, Agent, and Tools modes', () => {
  const chat = routeWritingTask('帮我解释这段 related work 的逻辑', {
    projectState: { hasRagDocuments: true, hasReferences: true },
    evidence: { query: 'related work', context: '', results: [] },
  });
  assert.equal(chat.mode, 'chat');
  assert.equal(chat.requiresConfirmation, false);

  const agent = routeWritingTask('帮我润色当前 introduction 章节', {
    projectState: { hasRagDocuments: true, hasReferences: true },
    evidence: { query: 'introduction', context: 'hit', results: [{ rank: 1 }] },
    recommendations: [{ skill: { name: 'writing-introduction', display_name_zh: '引言写作' } }],
  });
  assert.equal(agent.mode, 'agent');
  assert.equal(agent.requiresConfirmation, true);
  assert.equal(agent.risk_level, 'medium');
  assert.ok(agent.nextActions.some(action => action.type === 'activate-skill'));

  const editPaper = routeWritingTask('帮我改论文', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
  });
  assert.equal(editPaper.mode, 'agent');
  assert.equal(editPaper.requiresConfirmation, true);
  assert.equal(editPaper.risk_level, 'medium');
  assert.ok(editPaper.nextActions.some(action => action.type === 'select-file'));

  const polish = routeWritingTask('帮我润色这段论文', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-polish', display_name_zh: '论文润色' } }],
  });
  assert.equal(polish.mode, 'agent');
  assert.equal(polish.requiresConfirmation, true);
  assert.equal(polish.risk_level, 'medium');
  assert.ok(polish.nextActions.some(action => action.type === 'activate-skill' && action.skill === 'writing-polish'));

  const aiTracePolish = routeWritingTask('帮我降低 AI 痕迹', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-polish', display_name_zh: '论文润色' } }],
  });
  assert.equal(aiTracePolish.mode, 'agent');
  assert.equal(aiTracePolish.requiresConfirmation, true);
  assert.ok(aiTracePolish.nextActions.some(action => action.skill === 'writing-polish'));

  const venueStylePolish = routeWritingTask('帮我把论文改成 ACL 风格', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-polish', display_name_zh: '论文润色' } }],
  });
  assert.equal(venueStylePolish.mode, 'agent');
  assert.equal(venueStylePolish.requiresConfirmation, true);
  assert.ok(venueStylePolish.nextActions.some(action => action.skill === 'writing-polish'));

  const localTranslation = routeWritingTask('帮我把这段中文翻译成英文论文表达，保留 citation 和 LaTeX 公式', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-polish', display_name_zh: '论文润色' } }],
  });
  assert.equal(localTranslation.mode, 'agent');
  assert.equal(localTranslation.requiresConfirmation, true);
  assert.ok(!localTranslation.missingContext.includes('target_section_or_file'));

  const localClarityCheck = routeWritingTask('帮我逐句指出这段哪里表达不清楚', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-polish', display_name_zh: '论文润色' } }],
  });
  assert.equal(localClarityCheck.mode, 'chat');
  assert.equal(localClarityCheck.requiresConfirmation, false);
  assert.ok(!localClarityCheck.missingContext.includes('target_section_or_file'));

  const captionLanguagePolish = routeWritingTask('帮我改 Figure caption 的英文，让它更简洁', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-polish', display_name_zh: '论文润色' } }],
  });
  assert.equal(captionLanguagePolish.mode, 'agent');
  assert.equal(captionLanguagePolish.requiresConfirmation, true);
  assert.ok(!captionLanguagePolish.missingContext.includes('target_section_or_file'));
  assert.ok(captionLanguagePolish.nextActions.some(action => action.skill === 'writing-polish'));

  const titleOptions = routeWritingTask('帮我生成 5 个英文 title 候选', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-abstract', display_name_zh: '摘要写作' } }],
  });
  assert.equal(titleOptions.mode, 'agent');
  assert.equal(titleOptions.requiresConfirmation, true);
  assert.ok(!titleOptions.missingContext.includes('target_section_or_file'));

  const slides = routeWritingTask('帮我把论文变成 10 分钟 conference talk slides', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'nature-paper2ppt', display_name_zh: '论文转演示' } }],
  });
  assert.equal(slides.mode, 'agent');
  assert.equal(slides.requiresConfirmation, true);
  assert.ok(!slides.missingContext.includes('target_section_or_file'));

  const poster = routeWritingTask('帮我检查 poster 信息是不是太密', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'poster-design', display_name_zh: '学术海报' } }],
  });
  assert.equal(poster.mode, 'agent');
  assert.equal(poster.requiresConfirmation, true);
  assert.ok(!poster.missingContext.includes('target_section_or_file'));

  const paperPlanning = routeWritingTask('帮我制定论文写作计划', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'paper-planning', display_name_zh: '论文规划' } }],
  });
  assert.equal(paperPlanning.mode, 'agent');
  assert.equal(paperPlanning.requiresConfirmation, true);
  assert.ok(paperPlanning.nextActions.some(action => action.skill === 'paper-planning'));

  const contributionAudit = routeWritingTask('帮我检查 contribution 是否足够强', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-introduction', display_name_zh: '引言写作' } }],
  });
  assert.equal(contributionAudit.mode, 'agent');
  assert.equal(contributionAudit.requiresConfirmation, true);
  assert.ok(contributionAudit.nextActions.some(action => action.skill === 'writing-introduction'));

  const experimentClaimAudit = routeWritingTask('帮我检查实验是否足够支撑 claim', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-results', display_name_zh: '结果写作' } }],
  });
  assert.equal(experimentClaimAudit.mode, 'agent');
  assert.equal(experimentClaimAudit.requiresConfirmation, true);
  assert.ok(experimentClaimAudit.nextActions.some(action => action.skill === 'writing-results'));

  const reviewerRiskAudit = routeWritingTask('帮我模拟 reviewer 视角挑刺', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'paper-planning', display_name_zh: '论文规划' } }],
  });
  assert.equal(reviewerRiskAudit.mode, 'agent');
  assert.equal(reviewerRiskAudit.requiresConfirmation, true);
  assert.ok(reviewerRiskAudit.nextActions.some(action => action.skill === 'paper-planning'));

  const paragraphAdoptionAudit = routeWritingTask('帮我检查这个 paragraph 能不能直接放进论文', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'evidence-review', display_name_zh: '输出审查' } }],
  });
  assert.equal(paragraphAdoptionAudit.mode, 'agent');
  assert.equal(paragraphAdoptionAudit.requiresConfirmation, true);
  assert.ok(paragraphAdoptionAudit.nextActions.some(action => action.type === 'review-answer'));
  assert.ok(!paragraphAdoptionAudit.nextActions.some(action => action.type === 'review-rag-status'));

  const fakeCitationAudit = routeWritingTask('帮我检查 references 有没有 fake citation', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'evidence-review', display_name_zh: '输出审查' } }],
  });
  assert.equal(fakeCitationAudit.mode, 'agent');
  assert.equal(fakeCitationAudit.requiresConfirmation, true);
  assert.ok(fakeCitationAudit.nextActions.some(action => action.type === 'review-answer'));

  const methodExplanation = routeWritingTask('帮我解释这篇论文的方法', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-methodology', display_name_zh: '方法写作' } }],
  });
  assert.equal(methodExplanation.mode, 'chat');
  assert.equal(methodExplanation.requiresConfirmation, false);
  assert.ok(methodExplanation.nextActions.some(action => action.skill === 'writing-methodology'));

  const figureCaptionAudit = routeWritingTask('帮我检查 figure caption 是否能支撑图', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'nature-figure', display_name_zh: '图表设计' } }],
  });
  assert.equal(figureCaptionAudit.mode, 'agent');
  assert.equal(figureCaptionAudit.requiresConfirmation, true);
  assert.ok(figureCaptionAudit.nextActions.some(action => action.skill === 'nature-figure'));

  const locatedFigureCaptionAudit = routeWritingTask('帮我检查 Figure 2 caption 是否清楚', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'nature-figure', display_name_zh: '图表设计' } }],
  });
  assert.equal(locatedFigureCaptionAudit.mode, 'agent');
  assert.ok(!locatedFigureCaptionAudit.missingContext.includes('target_section_or_file'));
  assert.ok(!locatedFigureCaptionAudit.nextActions.some(action => action.type === 'select-file'));

  const tableNarrative = routeWritingTask('帮我把 table 结果讲成一段论文文字', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-results', display_name_zh: '结果写作' } }],
  });
  assert.equal(tableNarrative.mode, 'agent');
  assert.equal(tableNarrative.requiresConfirmation, true);
  assert.ok(tableNarrative.nextActions.some(action => action.skill === 'writing-results'));

  const locatedTableNarrative = routeWritingTask('帮我把 Table 4 结果写成一段论文文字', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-results', display_name_zh: '结果写作' } }],
  });
  assert.equal(locatedTableNarrative.mode, 'agent');
  assert.ok(!locatedTableNarrative.missingContext.includes('target_section_or_file'));

  const locatedReviewerComment = routeWritingTask('帮我回复 Reviewer 2 Comment 1', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'reviewer-response', display_name_zh: '审稿回复' } }],
  });
  assert.equal(locatedReviewerComment.mode, 'agent');
  assert.ok(!locatedReviewerComment.missingContext.includes('target_section_or_file'));

  const locatedAppendixProof = routeWritingTask('帮我检查 Appendix A proof sketch 是否严谨', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-methodology', display_name_zh: '方法写作' } }],
  });
  assert.equal(locatedAppendixProof.mode, 'agent');
  assert.ok(!locatedAppendixProof.missingContext.includes('target_section_or_file'));

  const locatedCoverLetter = routeWritingTask('帮我写 cover-letter.md', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'conference-submission', display_name_zh: '投稿材料' } }],
  });
  assert.equal(locatedCoverLetter.mode, 'agent');
  assert.ok(!locatedCoverLetter.missingContext.includes('target_section_or_file'));

  const plainCoverLetter = routeWritingTask('帮我把 cover letter 改得更正式', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'conference-submission', display_name_zh: '投稿材料' } }],
  });
  assert.equal(plainCoverLetter.mode, 'agent');
  assert.ok(!plainCoverLetter.missingContext.includes('target_section_or_file'));

  const dataStatement = routeWritingTask('帮我写 data availability statement', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'conference-submission', display_name_zh: '投稿材料' } }],
  });
  assert.equal(dataStatement.mode, 'agent');
  assert.ok(!dataStatement.missingContext.includes('target_section_or_file'));

  const anonymousPolicy = routeWritingTask('帮我给 AAAI 投稿前检查匿名风险和 page limit', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'conference-submission', display_name_zh: '投稿材料' } }],
  });
  assert.equal(anonymousPolicy.mode, 'agent');
  assert.ok(!anonymousPolicy.missingContext.includes('target_section_or_file'));

  const supplementaryLeak = routeWritingTask('帮我检查 supplementary 是否泄露作者信息', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'conference-submission', display_name_zh: '投稿材料' } }],
  });
  assert.equal(supplementaryLeak.mode, 'agent');
  assert.ok(supplementaryLeak.missingContext.includes('target_section_or_file'));

  const pdfMetadataNoTarget = routeWritingTask('帮我检查 PDF metadata 是否匿名', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'conference-submission', display_name_zh: '投稿材料' } }],
  });
  assert.equal(pdfMetadataNoTarget.mode, 'agent');
  assert.ok(!pdfMetadataNoTarget.missingContext.includes('target_section_or_file'));

  const zoteroBib = routeWritingTask('帮我把 Zotero 导出的 bib 清理一下', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'reference-management', display_name_zh: '引用管理' } }],
  });
  assert.equal(zoteroBib.mode, 'agent');
  assert.ok(!zoteroBib.missingContext.includes('target_section_or_file'));

  const limitationsRewrite = routeWritingTask('帮我把 limitations 写得不那么致命', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-discussion', display_name_zh: '讨论写作' } }],
  });
  assert.equal(limitationsRewrite.mode, 'agent');
  assert.ok(!limitationsRewrite.missingContext.includes('target_section_or_file'));

  const relatedWorkReorg = routeWritingTask('帮我把 related work 按主题重组', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'literature-review', display_name_zh: '文献综述' } }],
  });
  assert.equal(relatedWorkReorg.mode, 'agent');
  assert.equal(relatedWorkReorg.requiresConfirmation, true);
  assert.ok(relatedWorkReorg.nextActions.some(action => action.skill === 'literature-review'));

  const rebuttal = routeWritingTask('帮我回复 reviewer comments', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'reviewer-response', display_name_zh: '审稿回复' } }],
  });
  assert.equal(rebuttal.mode, 'agent');
  assert.equal(rebuttal.requiresConfirmation, true);
  assert.ok(rebuttal.nextActions.some(action => action.type === 'activate-skill' && action.skill === 'reviewer-response'));

  const writeResults = routeWritingTask('帮我写实验部分', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-results', display_name_zh: '结果写作' } }],
  });
  assert.equal(writeResults.mode, 'agent');
  assert.equal(writeResults.requiresConfirmation, true);
  assert.equal(writeResults.risk_level, 'medium');
  assert.ok(writeResults.nextActions.some(action => action.type === 'activate-skill' && action.skill === 'writing-results'));

  const notationFix = routeWritingTask('帮我修复公式符号不一致', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-methodology', display_name_zh: '方法写作' } }],
  });
  assert.equal(notationFix.mode, 'agent');
  assert.equal(notationFix.requiresConfirmation, true);
  assert.equal(notationFix.risk_level, 'medium');
  assert.ok(notationFix.nextActions.some(action => action.skill === 'writing-methodology'));

  const pseudocode = routeWritingTask('帮我写 algorithm 伪代码', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-methodology', display_name_zh: '方法写作' } }],
  });
  assert.equal(pseudocode.mode, 'agent');
  assert.equal(pseudocode.requiresConfirmation, true);
  assert.ok(pseudocode.nextActions.some(action => action.skill === 'writing-methodology'));

  const latexTable = routeWritingTask('帮我把实验结果表格转成 LaTeX tabular', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'writing-results', display_name_zh: '结果写作' } }],
  });
  assert.equal(latexTable.mode, 'agent');
  assert.equal(latexTable.requiresConfirmation, true);
  assert.ok(latexTable.nextActions.some(action => action.skill === 'writing-results'));

  const appendix = routeWritingTask('帮我整理 supplementary appendix', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'conference-submission', display_name_zh: '投稿检查' } }],
  });
  assert.equal(appendix.mode, 'agent');
  assert.equal(appendix.requiresConfirmation, true);
  assert.ok(appendix.nextActions.some(action => action.skill === 'conference-submission'));

  const captionRewrite = routeWritingTask('帮我把表格 caption 改得更清楚', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'nature-figure', display_name_zh: '图表设计' } }],
  });
  assert.equal(captionRewrite.mode, 'agent');
  assert.equal(captionRewrite.requiresConfirmation, true);
  assert.ok(captionRewrite.nextActions.some(action => action.skill === 'nature-figure'));

  const figureFromCsv = routeWritingTask('帮我根据 CSV 生成 Figure 3 的柱状图', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'nature-figure', display_name_zh: '图表设计' } }],
  });
  assert.equal(figureFromCsv.mode, 'tools');
  assert.equal(figureFromCsv.requiresConfirmation, true);
  assert.equal(figureFromCsv.risk_level, 'high');
  assert.ok(!figureFromCsv.missingContext.includes('target_section_or_file'));
  assert.ok(figureFromCsv.nextActions.some(action => action.skill === 'nature-figure'));

  const methodFlowFigure = routeWritingTask('帮我设计 Figure 1 的方法流程图', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'nature-figure', display_name_zh: '图表设计' } }],
  });
  assert.equal(methodFlowFigure.mode, 'agent');
  assert.equal(methodFlowFigure.requiresConfirmation, true);
  assert.ok(methodFlowFigure.nextActions.some(action => action.skill === 'nature-figure'));

  const tableLayout = routeWritingTask('帮我检查 LaTeX table 排版太宽', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'nature-figure', display_name_zh: '图表设计' } }],
  });
  assert.equal(tableLayout.mode, 'agent');
  assert.equal(tableLayout.requiresConfirmation, true);
  assert.ok(tableLayout.nextActions.some(action => action.skill === 'nature-figure'));

  const figureRefConsistency = routeWritingTask('帮我给所有 figure 编号和引用做一致性检查', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'nature-figure', display_name_zh: '图表设计' } }],
  });
  assert.equal(figureRefConsistency.mode, 'agent');
  assert.equal(figureRefConsistency.requiresConfirmation, true);
  assert.ok(figureRefConsistency.nextActions.some(action => action.skill === 'nature-figure'));

  const tTest = routeWritingTask('帮我把实验数据跑 t-test 并写显著性结果', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'statistical-analysis', display_name_zh: '统计分析' } }],
  });
  assert.equal(tTest.mode, 'tools');
  assert.equal(tTest.requiresConfirmation, true);
  assert.equal(tTest.risk_level, 'high');
  assert.ok(!tTest.missingContext.includes('target_section_or_file'));
  assert.ok(tTest.nextActions.some(action => action.skill === 'statistical-analysis'));

  const confidenceIntervalExplanation = routeWritingTask('帮我解释 confidence interval 怎么报告', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'statistical-analysis', display_name_zh: '统计分析' } }],
  });
  assert.equal(confidenceIntervalExplanation.mode, 'chat');
  assert.equal(confidenceIntervalExplanation.requiresConfirmation, false);
  assert.ok(confidenceIntervalExplanation.nextActions.some(action => action.skill === 'statistical-analysis'));

  const checklist = routeWritingTask('帮我检查 reproducibility checklist', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'conference-submission', display_name_zh: '投稿检查' } }],
  });
  assert.equal(checklist.mode, 'agent');
  assert.equal(checklist.requiresConfirmation, true);
  assert.ok(checklist.nextActions.some(action => action.skill === 'conference-submission'));

  const pdfMetadata = routeWritingTask('帮我检查 PDF metadata 是否匿名', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'conference-submission', display_name_zh: '投稿检查' } }],
  });
  assert.equal(pdfMetadata.mode, 'agent');
  assert.equal(pdfMetadata.requiresConfirmation, true);
  assert.ok(!pdfMetadata.missingContext.includes('rag_documents_or_references'));
  assert.ok(pdfMetadata.nextActions.some(action => action.skill === 'conference-submission'));
  assert.ok(!pdfMetadata.nextActions.some(action => action.type === 'review-rag-status'));

  const claimEvidence = routeWritingTask('帮我把这一句话和 RAG 证据核对一下', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
  });
  assert.equal(claimEvidence.mode, 'chat');
  assert.equal(claimEvidence.requiresConfirmation, false);
  assert.ok(claimEvidence.nextActions.some(action => action.type === 'review-claim'));

  const answerReview = routeWritingTask('帮我审查 AI 写的这段能不能采纳', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
  });
  assert.equal(answerReview.mode, 'agent');
  assert.equal(answerReview.requiresConfirmation, true);
  assert.ok(answerReview.nextActions.some(action => action.type === 'review-answer'));

  const adoptionPackage = routeWritingTask('帮我生成安全采纳包', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
  });
  assert.equal(adoptionPackage.mode, 'agent');
  assert.equal(adoptionPackage.requiresConfirmation, true);
  assert.ok(adoptionPackage.nextActions.some(action => action.type === 'build-adoption-package'));

  const citationKey = routeWritingTask('帮我检查 citation key 是否都存在', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'reference-management', display_name_zh: '引用管理' } }],
  });
  assert.equal(citationKey.mode, 'agent');
  assert.equal(citationKey.requiresConfirmation, true);
  assert.ok(!citationKey.missingContext.includes('rag_documents_or_references'));
  assert.ok(citationKey.nextActions.some(action => action.skill === 'reference-management'));

  const reviewerConcerns = routeWritingTask('帮我总结 reviewers 的 common concerns', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'reviewer-response', display_name_zh: '审稿回复' } }],
  });
  assert.equal(reviewerConcerns.mode, 'agent');
  assert.equal(reviewerConcerns.requiresConfirmation, true);
  assert.ok(reviewerConcerns.nextActions.some(action => action.skill === 'reviewer-response'));

  const noveltyWeak = routeWritingTask('reviewer 说 novelty weak，我该补什么', {
    projectState: { hasRagDocuments: true, hasReferences: true },
    evidence: { query: 'novelty weak', context: 'hit', results: [{ rank: 1 }] },
    recommendations: [{ skill: { name: 'reviewer-response', display_name_zh: '审稿回复' } }],
  });
  assert.equal(noveltyWeak.mode, 'agent');
  assert.equal(noveltyWeak.requiresConfirmation, true);
  assert.ok(!noveltyWeak.missingContext.includes('target_section_or_file'));
  assert.ok(noveltyWeak.nextActions.some(action => action.skill === 'reviewer-response'));

  const responseTable = routeWritingTask('帮我生成 response table', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'reviewer-response', display_name_zh: '审稿回复' } }],
  });
  assert.equal(responseTable.mode, 'agent');
  assert.equal(responseTable.risk_level, 'medium');
  assert.equal(responseTable.requiresConfirmation, true);
  assert.ok(!responseTable.missingContext.includes('target_section_or_file'));
  assert.ok(!responseTable.reasons.some(reason => reason.includes('Tools 模式')));
  assert.ok(responseTable.nextActions.some(action => action.skill === 'reviewer-response'));

  const rebuttalCommitments = routeWritingTask('把 rebuttal 里的承诺转成正文修改 checklist', {
    projectState: { hasRagDocuments: true, hasReferences: true },
    evidence: { query: 'rebuttal commitments', context: 'hit', results: [{ rank: 1 }] },
    recommendations: [{ skill: { name: 'reviewer-response', display_name_zh: '审稿回复' } }],
  });
  assert.equal(rebuttalCommitments.mode, 'agent');
  assert.equal(rebuttalCommitments.requiresConfirmation, true);
  assert.ok(rebuttalCommitments.nextActions.some(action => action.skill === 'reviewer-response'));

  const citationEvidenceSupport = routeWritingTask('帮我检查 related work 里的引用是否都有证据支持', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'literature-review', display_name_zh: '文献综述' } }],
  });
  assert.equal(citationEvidenceSupport.mode, 'agent');
  assert.equal(citationEvidenceSupport.requiresConfirmation, true);
  assert.ok(citationEvidenceSupport.nextActions.some(action => action.type === 'review-answer'));

  const sentenceCitationSelection = routeWritingTask('这句话需要引用哪几篇论文', {
    projectState: { hasRagDocuments: true, hasReferences: true },
    evidence: { query: 'claim citation', context: 'hit', results: [{ rank: 1 }] },
    recommendations: [{ skill: { name: 'evidence-review', display_name_zh: '输出审查' } }],
  });
  assert.equal(sentenceCitationSelection.mode, 'chat');
  assert.equal(sentenceCitationSelection.requiresConfirmation, false);
  assert.ok(sentenceCitationSelection.nextActions.some(action => action.type === 'review-answer'));
  assert.ok(sentenceCitationSelection.nextActions.some(action => action.type === 'review-claim'));
  assert.ok(sentenceCitationSelection.nextActions.some(action => action.skill === 'evidence-review'));

  const missingCitationAudit = routeWritingTask('帮我检查 related work 里面哪些句子没有引用', {
    projectState: { hasRagDocuments: true, hasReferences: true },
    evidence: { query: 'related work missing citation', context: 'hit', results: [{ rank: 1 }] },
    recommendations: [{ skill: { name: 'evidence-review', display_name_zh: '输出审查' } }],
  });
  assert.equal(missingCitationAudit.mode, 'agent');
  assert.equal(missingCitationAudit.requiresConfirmation, true);
  assert.ok(missingCitationAudit.nextActions.some(action => action.type === 'review-answer'));
  assert.ok(missingCitationAudit.nextActions.some(action => action.skill === 'evidence-review'));

  const negativeEvidence = routeWritingTask('帮我找反例或者 negative evidence', {
    projectState: { hasRagDocuments: true, hasReferences: true },
    evidence: { query: 'negative evidence', context: 'hit', results: [{ rank: 1 }] },
    recommendations: [{ skill: { name: 'evidence-review', display_name_zh: '输出审查' } }],
  });
  assert.equal(negativeEvidence.mode, 'agent');
  assert.equal(negativeEvidence.requiresConfirmation, true);
  assert.ok(negativeEvidence.nextActions.some(action => action.type === 'review-answer'));

  const sentenceEvidenceMapping = routeWritingTask('把 related work 每句话对应证据编号', {
    projectState: { hasRagDocuments: true, hasReferences: true },
    evidence: { query: 'related work evidence map', context: 'hit', results: [{ rank: 1 }] },
    recommendations: [{ skill: { name: 'evidence-review', display_name_zh: '输出审查' } }],
  });
  assert.equal(sentenceEvidenceMapping.mode, 'agent');
  assert.equal(sentenceEvidenceMapping.requiresConfirmation, true);
  assert.ok(sentenceEvidenceMapping.nextActions.some(action => action.type === 'review-answer'));

  const tableClaimEvidence = routeWritingTask('帮我检查 Table 2 的结论有没有证据支撑', {
    projectState: { hasRagDocuments: true, hasReferences: true },
    evidence: { query: 'Table 2 conclusion evidence', context: 'hit', results: [{ rank: 1 }] },
    recommendations: [{ skill: { name: 'evidence-review', display_name_zh: '输出审查' } }],
  });
  assert.equal(tableClaimEvidence.mode, 'agent');
  assert.equal(tableClaimEvidence.requiresConfirmation, true);
  assert.ok(!tableClaimEvidence.missingContext.includes('target_section_or_file'));
  assert.ok(tableClaimEvidence.nextActions.some(action => action.type === 'review-answer'));

  const aiRelatedWorkMerge = routeWritingTask('帮我把 AI 写的 related work 合并进 related_work.tex', {
    projectState: { hasRagDocuments: true, hasReferences: true },
    evidence: { query: 'ai related work merge', context: 'hit', results: [{ rank: 1 }] },
    recommendations: [{ skill: { name: 'evidence-review', display_name_zh: '输出审查' } }],
  });
  assert.equal(aiRelatedWorkMerge.mode, 'agent');
  assert.equal(aiRelatedWorkMerge.requiresConfirmation, true);
  assert.ok(aiRelatedWorkMerge.nextActions.some(action => action.type === 'review-answer'));
  assert.ok(aiRelatedWorkMerge.reasons.some(reason => reason.includes('证据可采纳性')));

  const anonymousAppendix = routeWritingTask('帮我检查匿名版 appendix', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'conference-submission', display_name_zh: '投稿检查' } }],
  });
  assert.equal(anonymousAppendix.mode, 'agent');
  assert.equal(anonymousAppendix.requiresConfirmation, true);
  assert.ok(anonymousAppendix.nextActions.some(action => action.skill === 'conference-submission'));

  const cameraReadyConflict = routeWritingTask('camera-ready 与 anonymous 规则冲突怎么办', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'conference-submission', display_name_zh: '投稿检查' } }],
  });
  assert.equal(cameraReadyConflict.mode, 'agent');
  assert.equal(cameraReadyConflict.requiresConfirmation, true);
  assert.ok(!cameraReadyConflict.missingContext.includes('target_section_or_file'));
  assert.ok(cameraReadyConflict.nextActions.some(action => action.skill === 'conference-submission'));

  const artifactAppendixChecklist = routeWritingTask('帮我写 artifact appendix 和 reproducibility checklist', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'conference-submission', display_name_zh: '投稿检查' } }],
  });
  assert.equal(artifactAppendixChecklist.mode, 'agent');
  assert.equal(artifactAppendixChecklist.requiresConfirmation, true);
  assert.ok(artifactAppendixChecklist.missingContext.includes('target_section_or_file'));
  assert.ok(artifactAppendixChecklist.nextActions.some(action => action.skill === 'conference-submission'));

  const tools = routeWritingTask('帮我编译 LaTeX PDF 并运行统计脚本生成表格', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
  });
  assert.equal(tools.mode, 'tools');
  assert.equal(tools.requiresConfirmation, true);
  assert.equal(tools.risk_level, 'high');

  const latexDebug = routeWritingTask('帮我检查 Overleaf 报错', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'latex-debugging', display_name_zh: 'LaTeX 编译修复' } }],
  });
  assert.equal(latexDebug.mode, 'tools');
  assert.equal(latexDebug.requiresConfirmation, true);
  assert.equal(latexDebug.risk_level, 'high');
  assert.ok(latexDebug.missingContext.includes('latex_error_log'));
  assert.ok(latexDebug.nextActions.some(action => action.type === 'add-latex-log'));
  assert.ok(latexDebug.nextActions.some(action => action.skill === 'latex-debugging'));

  const latexmkDebug = routeWritingTask('运行 latexmk 编译 main.tex 看看错误', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: '', context: '', results: [] },
    recommendations: [{ skill: { name: 'latex-debugging', display_name_zh: 'LaTeX 编译修复' } }],
  });
  assert.equal(latexmkDebug.mode, 'tools');
  assert.equal(latexmkDebug.requiresConfirmation, true);
  assert.equal(latexmkDebug.risk_level, 'high');
  assert.ok(latexmkDebug.missingContext.includes('latex_error_log'));
  assert.ok(latexmkDebug.nextActions.some(action => action.skill === 'latex-debugging'));

  const ragDiagnostic = routeWritingTask('帮我检查 RAG 里 PDF 有没有读进去', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: 'rag pdf', context: '', results: [] },
  });
  assert.equal(ragDiagnostic.mode, 'chat');
  assert.equal(ragDiagnostic.requiresConfirmation, false);
  assert.ok(ragDiagnostic.nextActions.some(action => action.type === 'review-rag-status'));
  assert.ok(ragDiagnostic.reasons.some(reason => reason.includes('证据库诊断')));

  const mixedWritingAndDiagnostic = routeWritingTask('帮我检查 RAG 里 PDF 有没有读进去，然后根据证据写 related work', {
    projectState: { hasRagDocuments: false, hasReferences: false },
    evidence: { query: 'related work', context: '', results: [] },
  });
  assert.equal(mixedWritingAndDiagnostic.mode, 'agent');
  assert.equal(mixedWritingAndDiagnostic.requiresConfirmation, true);
  assert.equal(mixedWritingAndDiagnostic.risk_level, 'medium');
  assert.ok(mixedWritingAndDiagnostic.nextActions.some(action => action.type === 'review-rag-status'));
  assert.ok(!mixedWritingAndDiagnostic.reasons.some(reason => reason.includes('Tools 模式')));
});

test('buildPaperWorkbenchContext creates a guarded tools interaction plan', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-workbench-tools-'));
  try {
    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: '帮我编译 LaTeX PDF 并运行统计脚本生成表格',
    });

    assert.equal(context.taskRouting.mode, 'tools');
    assert.equal(context.interactionPlan.mode, 'tools');
    assert.equal(context.interactionPlan.primaryCta_zh, '生成工具执行计划');
    assert.equal(context.interactionPlan.requiresConfirmation, true);
    assert.ok(context.interactionPlan.confirmationRequiredBefore.some(item => item.includes('运行脚本')));
    assert.ok(context.interactionPlan.forbiddenActions.some(item => item.includes('自动覆盖')));
    assert.ok(context.interactionPlan.steps.some(step => step.id === 'confirm-risk' && step.status === 'requires-confirmation'));
    assert.equal(context.modeDecisionGuide.selected.mode, 'tools');
    assert.ok(context.modeDecisionGuide.selected.boundary_zh.includes('不运行命令'));
    assert.ok(context.modeDecisionGuide.alternatives.some(item => item.mode === 'agent' && item.why_zh.some(reason => reason.includes('Tools'))));
    assert.equal(context.aiDraftRequest.interactionPlan.mode, 'tools');
    assert.equal(context.modeActionCenter.sendGate.requiresSafetyAck, true);
    assert.ok(context.modeActionCenter.sendGate.checkboxLabel_zh.includes('不会自动写入'));
    assert.ok(context.modeActionCenter.sendGate.mustNot_zh.some(item => item.includes('自动运行命令')));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('reviewGeneratedAnswer flags missing and unknown evidence citations', () => {
  const context = {
    citationPolicy: { citationSensitive: true },
    evidencePack: {
      citationSensitive: true,
      items: [
        {
          rank: 1,
          snippet: 'Inspectable evidence workflows help related work drafting.',
        },
      ],
    },
    acceptanceChecklist: {
      items: [
        {
          id: 'sources-numbered',
          label_zh: '事实陈述带来源编号',
          detail_zh: '事实陈述必须标注来源编号。',
          blocking: true,
        },
      ],
    },
    contextReadiness: { status: 'ready' },
    interactionPlan: { requiresConfirmation: false },
  };

  const missing = reviewGeneratedAnswer('Inspectable evidence workflows improve related work drafting.', context);
  assert.equal(missing.status, 'reject');
  assert.ok(missing.findings.some(item => item.id === 'missing-source-numbers' && item.blocking));
  assert.equal(missing.adoptionGate.canUseAsDraft, false);
  assert.equal(missing.adoptionGate.canWriteToPaper, false);
  assert.equal(missing.adoptionGate.requiresHumanConfirmation, true);
  assert.ok(missing.nextActions.some(item => item.type === 'use-revision-prompt'));
  assert.equal(missing.revisionPrompt.available, true);
  assert.equal(missing.revisionPlan.status, 'reject');
  assert.ok(missing.revisionPlan.steps.some(item => item.id === 'add-source-numbers' && item.blocking));
  assert.ok(missing.revisionPlan.copyText.includes('# AI 输出修订计划'));
  assert.equal(missing.revisionLoop.status, 'rewrite-required');
  assert.equal(missing.revisionLoop.canExitLoop, false);
  assert.equal(missing.revisionLoop.mustUseRevisionPrompt, true);
  assert.ok(missing.revisionLoop.recheckRequiredAfter.some(item => item.includes('修订提示词')));
  assert.ok(missing.revisionLoop.copyText.includes('# AI 输出修订闭环'));
  assert.equal(missing.claimCheckQueue.status, 'needs-check');
  assert.ok(missing.claimCheckQueue.items.some(item => item.priority === 'high' && item.claim.includes('Inspectable evidence')));
  assert.ok(missing.claimCheckQueue.copyText.includes('# 待单句检查队列'));
  assert.equal(missing.revisionProgress.status, 'not-started');
  assert.equal(missing.revisionProgress.hasPreviousReview, false);
  assert.ok(missing.revisionPrompt.text.includes('# 请修订下面的 AI 输出'));
  assert.ok(missing.revisionPrompt.text.includes('[1]'));
  assert.ok(missing.revisionPrompt.text.includes('缺少来源编号'));

  const drifted = reviewGeneratedAnswer('Inspectable evidence workflows improve related work drafting [1].', {
    ...context,
    expectedEvidencePackFingerprint: '0000000000000000',
  });
  assert.equal(drifted.status, 'reject');
  assert.ok(drifted.findings.some(item => item.id === 'evidence-pack-drift' && item.blocking));
  assert.equal(drifted.adoptionGate.canUseAsDraft, false);

  const repeatedMissing = reviewGeneratedAnswer('Inspectable evidence workflows improve related work drafting.', {
    ...context,
    previousReview: missing,
  });
  assert.equal(repeatedMissing.status, 'reject');
  assert.equal(repeatedMissing.revisionProgress.status, 'stuck');
  assert.deepEqual(repeatedMissing.revisionProgress.repeatedBlockingIds, ['missing-source-numbers']);
  assert.equal(repeatedMissing.revisionProgress.mustRegenerateWithRevisionPrompt, true);
  assert.ok(repeatedMissing.revisionProgress.copyText.includes('重复阻塞：missing-source-numbers'));

  const unknown = reviewGeneratedAnswer('Inspectable evidence workflows improve related work drafting [2].', context);
  assert.equal(unknown.status, 'reject');
  assert.ok(unknown.findings.some(item => item.id === 'unknown-source-number' && item.blocking));
  assert.ok(unknown.revisionPlan.steps.some(item => item.id === 'remove-unknown-source-numbers' && item.blocking));
  assert.ok(unknown.revisionPrompt.text.includes('不要引用证据包之外的来源编号'));

  const unstableRanks = reviewGeneratedAnswer('Inspectable evidence workflows improve related work drafting [1].', {
    ...context,
    evidencePack: {
      ...context.evidencePack,
      items: [
        ...context.evidencePack.items,
        { rank: 1, snippet: 'A second item accidentally reuses the first evidence number.' },
      ],
    },
  });
  assert.equal(unstableRanks.status, 'reject');
  assert.ok(unstableRanks.findings.some(item => item.id === 'unstable-evidence-ranks' && item.blocking));
  assert.ok(unstableRanks.claimCheckQueue.items.some(item => item.priority === 'high' && item.reason_zh.includes('证据包编号不稳定')));
  assert.ok(unstableRanks.revisionPrompt.text.includes('证据编号不稳定时不要生成可引用正文'));

  const cited = reviewGeneratedAnswer('Inspectable evidence workflows improve related work drafting [1].', context);
  assert.notEqual(cited.status, 'reject');
  assert.equal(cited.summary.sourceReferenceCount, 1);
  assert.equal(cited.adoptionGate.canWriteToPaper, false);
  assert.equal(cited.adoptionGate.requiresHumanConfirmation, true);
  assert.ok(cited.adoptionGate.forbiddenUntilConfirmed.some(item => item.includes('不得自动写入')));
  assert.ok(cited.revisionPlan.steps.some(item => item.id === 'review-acceptance-checklist'));
  assert.equal(cited.revisionLoop.status, 'revision-required');
  assert.equal(cited.revisionLoop.canExitLoop, false);
  assert.ok(cited.revisionLoop.stopCriteria.some(item => item.includes('来源编号')));
  assert.ok(cited.nextActions.some(item => item.type === 'use-revision-prompt'));
  assert.equal(cited.revisionPrompt.available, true);
  assert.equal(cited.revisionPrompt.label_zh, '按风险点修订');

  const clean = reviewGeneratedAnswer('Inspectable evidence workflows improve related work drafting [1].', {
    ...context,
    acceptanceChecklist: { items: [] },
    previousReview: missing,
  });
  assert.equal(clean.status, 'adoptable');
  assert.equal(clean.revisionLoop.status, 'final-review');
  assert.equal(clean.revisionLoop.canExitLoop, true);
  assert.equal(clean.revisionLoop.mustUseRevisionPrompt, false);
  assert.equal(clean.revisionProgress.status, 'ready-for-final-review');
  assert.deepEqual(clean.revisionProgress.resolvedBlockingIds, ['missing-source-numbers']);
  assert.equal(clean.revisionProgress.canExitRevision, true);
  assert.ok(clean.claimCheckQueue.items.some(item => item.claim.includes('[1]') && item.priority === 'medium'));

  const thinCoverage = reviewGeneratedAnswer(
    'The related work shows that existing methods broadly establish inspectable evidence as the dominant solution for grounded drafting [1].',
    {
      ...context,
      acceptanceChecklist: { items: [] },
      evidencePack: {
        ...context.evidencePack,
        coverage: {
          status: 'single-source',
          label_zh: '来源过少',
          sourceCount: 1,
          evidenceCount: 1,
          guidance_zh: '当前所有证据都来自同一个来源，不适合直接写成完整 related work。',
        },
      },
    },
  );
  assert.equal(thinCoverage.status, 'reject');
  assert.ok(thinCoverage.findings.some(item => item.id === 'evidence-coverage-too-thin-for-strong-conclusion' && item.blocking));
  assert.ok(thinCoverage.revisionPlan.steps.some(item => item.id === 'expand-evidence-or-narrow-claim' && item.blocking));
  assert.equal(thinCoverage.adoptionGate.canUseAsDraft, false);
  assert.ok(thinCoverage.revisionPrompt.text.includes('证据覆盖不足以支撑强综述结论'));

  const inventedBibliographicDetails = reviewGeneratedAnswer('Smith et al. 2024 show that inspectable evidence workflows help related work drafting [1].', {
    ...context,
    acceptanceChecklist: { items: [] },
    evidencePack: {
      ...context.evidencePack,
      items: [
        {
          rank: 1,
          snippet: 'Inspectable evidence workflows help related work drafting.',
        },
        {
          rank: 2,
          snippet: 'Jones et al. 2023 discuss citation interfaces at CHI.',
        },
      ],
    },
  });
  assert.equal(inventedBibliographicDetails.status, 'reject');
  assert.ok(inventedBibliographicDetails.findings.some(item => item.id === 'unsupported-bibliographic-details' && item.blocking));
  assert.ok(inventedBibliographicDetails.revisionPlan.steps.some(item => item.id === 'remove-unsupported-bibliographic-fields' && item.blocking));
  assert.ok(inventedBibliographicDetails.revisionPrompt.text.includes('对应来源编号'));
  assert.ok(inventedBibliographicDetails.revisionPrompt.text.includes('Smith et al.'));
  assert.ok(inventedBibliographicDetails.revisionPrompt.text.includes('2024'));
  assert.ok(inventedBibliographicDetails.revisionPrompt.text.includes('# 必须满足的硬约束'));
  assert.ok(inventedBibliographicDetails.revisionPrompt.text.includes('必须删除或替换这些未支持文献信息'));
  assert.ok(inventedBibliographicDetails.revisionPrompt.text.includes('不能把其他来源里的元数据借给当前句子'));
  assert.ok(inventedBibliographicDetails.claimCheckQueue.items.some(item =>
    item.priority === 'high' &&
    item.claim.includes('Smith et al. 2024') &&
    item.reason_zh.includes('文献信息没有被对应证据片段支持') &&
    item.evidenceRefs.some(ref => ref.rank === 1 && ref.snippet.includes('Inspectable evidence workflows'))
  ));
  assert.ok(inventedBibliographicDetails.claimCheckQueue.copyText.includes('关联证据：'));
  assert.ok(inventedBibliographicDetails.claimCheckQueue.copyText.includes('[1]'));
  assert.ok(inventedBibliographicDetails.claimCheckQueue.items.some(item => item.reason_zh.includes('Smith et al.')));
  assert.equal(inventedBibliographicDetails.adoptionGate.canUseAsDraft, false);

  const borrowedBibliographicDetails = reviewGeneratedAnswer(
    'Smith et al. 2024 show that inspectable evidence workflows help related work drafting [1]. Jones et al. 2023 discuss citation interfaces [2].',
    {
      ...context,
      acceptanceChecklist: { items: [] },
      evidencePack: {
        ...context.evidencePack,
        items: [
          {
            rank: 1,
            snippet: 'Inspectable evidence workflows help related work drafting.',
          },
          {
            rank: 2,
            snippet: 'Smith et al. 2024 evaluate citation interfaces.',
          },
        ],
      },
    },
  );
  assert.equal(borrowedBibliographicDetails.status, 'reject');
  assert.ok(borrowedBibliographicDetails.findings.some(item => item.id === 'unsupported-bibliographic-details' && item.blocking));
  assert.ok(borrowedBibliographicDetails.revisionPrompt.text.includes('Smith et al.'));

  const inventedQuantitativeDetails = reviewGeneratedAnswer('Inspectable evidence workflows improve related work drafting by 15% [1].', {
    ...context,
    acceptanceChecklist: { items: [] },
    evidencePack: {
      ...context.evidencePack,
      items: [
        {
          rank: 1,
          snippet: 'Inspectable evidence workflows improve related work drafting.',
        },
      ],
    },
  });
  assert.equal(inventedQuantitativeDetails.status, 'reject');
  assert.ok(inventedQuantitativeDetails.findings.some(item => item.id === 'unsupported-quantitative-details' && item.blocking));
  assert.ok(inventedQuantitativeDetails.revisionPlan.steps.some(item => item.id === 'remove-unsupported-quantitative-details' && item.blocking));
  assert.ok(inventedQuantitativeDetails.revisionPrompt.text.includes('必须删除或替换这些未支持量化细节：15%'));
  assert.ok(inventedQuantitativeDetails.revisionPrompt.text.includes('不能把其他来源里的数字借给当前句子'));
  assert.ok(inventedQuantitativeDetails.claimCheckQueue.items.some(item =>
    item.priority === 'high' &&
    item.reason_zh.includes('量化细节没有被对应证据片段支持') &&
    item.reason_zh.includes('15%')
  ));
  assert.equal(inventedQuantitativeDetails.adoptionGate.canUseAsDraft, false);

  const borrowedQuantitativeDetails = reviewGeneratedAnswer(
    'Inspectable evidence workflows improve related work drafting by 15% [1]. A separate interface study reports 15% faster triage [2].',
    {
      ...context,
      acceptanceChecklist: { items: [] },
      evidencePack: {
        ...context.evidencePack,
        items: [
          {
            rank: 1,
            snippet: 'Inspectable evidence workflows improve related work drafting.',
          },
          {
            rank: 2,
            snippet: 'A separate interface study reports 15% faster triage.',
          },
        ],
      },
    },
  );
  assert.equal(borrowedQuantitativeDetails.status, 'reject');
  assert.ok(borrowedQuantitativeDetails.findings.some(item => item.id === 'unsupported-quantitative-details' && item.blocking));
  assert.ok(borrowedQuantitativeDetails.revisionPrompt.text.includes('15%'));

  const contradictedClaim = reviewGeneratedAnswer('Inspectable evidence workflows improve related work drafting [1].', {
    ...context,
    acceptanceChecklist: { items: [] },
    evidencePack: {
      ...context.evidencePack,
      items: [
        {
          rank: 1,
          snippet: 'Inspectable evidence workflows do not improve related work drafting in the controlled study.',
        },
      ],
    },
  });
  assert.equal(contradictedClaim.status, 'reject');
  assert.ok(contradictedClaim.findings.some(item => item.id === 'claim-contradicts-evidence' && item.blocking));
  assert.ok(contradictedClaim.revisionPlan.steps.some(item => item.id === 'resolve-evidence-contradiction' && item.blocking));
  assert.ok(contradictedClaim.revisionPrompt.text.includes('按证据原文修正结论方向'));
  assert.ok(contradictedClaim.revisionPrompt.text.includes('不能写成 improved、better、supports 或显著提升'));
  assert.ok(contradictedClaim.claimCheckQueue.items.some(item =>
    item.priority === 'high' &&
    item.reason_zh.includes('与对应证据片段的否定/肯定方向相反')
  ));
});

test('buildAnswerAdoptionPackage only creates a non-writing human adoption preview', () => {
  const context = {
    contextAnswers: {
      target_section_or_file: 'chapters/related_work.tex',
      paper_claims: '本文强调可检查证据流程能降低论文写作中的引用失真。',
    },
    citationPolicy: { citationSensitive: true },
    evidencePack: {
      citationSensitive: true,
      items: [
        {
          rank: 1,
          sourceLabel: 'related-work.md',
          snippet: 'Inspectable evidence workflows improve related work drafting.',
        },
      ],
    },
    acceptanceChecklist: { items: [] },
    contextReadiness: { status: 'ready' },
    interactionPlan: { requiresConfirmation: false },
  };
  const answer = 'Inspectable evidence workflows improve related work drafting [1].';
  const review = reviewGeneratedAnswer(answer, context);
  assert.equal(review.status, 'adoptable');

  const ready = buildAnswerAdoptionPackage({ answer, review, context });
  assert.equal(ready.status, 'ready-for-human-apply');
  assert.equal(ready.target.targetSection, 'chapters/related_work.tex');
  assert.equal(ready.canWriteToPaper, false);
  assert.equal(ready.willWrite, false);
  assert.equal(ready.requiresHumanConfirmation, true);
  assert.equal(ready.diffPlan.willWrite, false);
  assert.equal(ready.manualApplicationGuide.status, 'ready');
  assert.ok(ready.manualApplicationGuide.steps.some(step => step.id === 'apply-as-small-manual-diff'));
  assert.ok(ready.manualApplicationGuide.copyText.includes('# 人工应用指南'));
  assert.ok(ready.manualApplicationGuide.copyText.includes('只做最小人工 diff'));
  assert.ok(ready.copyText.includes('# AI 输出安全采纳包'));
  assert.ok(ready.copyText.includes('chapters/related_work.tex'));
  assert.ok(ready.copyText.includes('系统自动写入：否'));
  assert.ok(ready.copyText.includes('不得由系统自动写入'));
  assert.ok(ready.copyText.includes('# 人工应用指南'));

  const workbenchContextShape = {
    ...context,
    contextAnswers: undefined,
    projectState: {
      contextAnswers: {
        target_section_or_file: 'chapters/related_work.tex',
      },
    },
  };
  const readyFromWorkbenchContext = buildAnswerAdoptionPackage({
    answer,
    review,
    context: workbenchContextShape,
  });
  assert.equal(readyFromWorkbenchContext.status, 'ready-for-human-apply');
  assert.equal(readyFromWorkbenchContext.target.targetSection, 'chapters/related_work.tex');
  assert.ok(!readyFromWorkbenchContext.blockers.some(item => item.id === 'missing-target-section'));

  const missingTarget = buildAnswerAdoptionPackage({
    answer,
    review,
    context: { ...context, contextAnswers: {} },
  });
  assert.equal(missingTarget.status, 'blocked');
  assert.ok(missingTarget.blockers.some(item => item.id === 'missing-target-section'));
  assert.equal(missingTarget.manualApplicationGuide.status, 'needs-attention');
  assert.ok(missingTarget.manualApplicationGuide.steps.some(step => step.id === 'locate-target' && step.blocking));
  assert.equal(missingTarget.canWriteToPaper, false);

  const rejectedReview = reviewGeneratedAnswer('Inspectable evidence workflows improve related work drafting.', context);
  const rejected = buildAnswerAdoptionPackage({
    answer: 'Inspectable evidence workflows improve related work drafting.',
    review: rejectedReview,
    context,
  });
  assert.equal(rejected.status, 'blocked');
  assert.ok(rejected.blockers.some(item => item.id === 'review-rejected'));
  assert.ok(rejected.blockers.some(item => item.id === 'not-draft-ready'));
  assert.equal(rejected.willWrite, false);
});

test('reviewClaimAgainstEvidence checks one claim against evidence boundaries', () => {
  const context = {
    citationPolicy: { citationSensitive: true },
    evidencePack: {
      citationSensitive: true,
      items: [
        {
          rank: 1,
          sourceLabel: 'notes.md:L1-L3',
          snippet: 'Inspectable evidence workflows help related work drafting.',
          supports_zh: ['可用于说明 evidence workflows 对 related work drafting 的帮助。'],
          notFor: ['不能推导作者、年份、会议或 DOI，除非片段中明确出现。'],
          quality: { level: 'high', label_zh: '可直接用于局部引用' },
          score: 4,
        },
      ],
    },
  };

  const missingNumber = reviewClaimAgainstEvidence('Inspectable evidence workflows help related work drafting.', context);
  assert.equal(missingNumber.status, 'reject');
  assert.ok(missingNumber.findings.some(item => item.id === 'missing-source-number'));
  assert.ok(missingNumber.matches.some(item => item.rank === 1));
  assert.ok(missingNumber.suggestedRewrite.includes('[1]'));
  assert.equal(missingNumber.writeGate.status, 'blocked');
  assert.equal(missingNumber.writeGate.canWriteToPaper, false);
  assert.equal(missingNumber.writeGate.requiresHumanConfirmation, true);
  assert.ok(missingNumber.copyText.includes('# 单句证据检查'));
  assert.ok(missingNumber.copyText.includes('# 写入门槛'));

  const driftedClaim = reviewClaimAgainstEvidence('Inspectable evidence workflows help related work drafting [1].', {
    ...context,
    evidencePack: {
      ...context.evidencePack,
      fingerprint: '1111111111111111',
    },
    expectedEvidencePackFingerprint: '0000000000000000',
  });
  assert.equal(driftedClaim.status, 'reject');
  assert.ok(driftedClaim.findings.some(item => item.id === 'evidence-pack-changed' && item.blocking));
  assert.equal(driftedClaim.writeGate.canWriteToPaper, false);

  const supported = reviewClaimAgainstEvidence('Inspectable evidence workflows help related work drafting [1].', context);
  assert.equal(supported.status, 'supported');
  assert.equal(supported.summary.matchCount, 1);
  assert.equal(supported.writeGate.status, 'claim-supported');
  assert.equal(supported.writeGate.canUseForCitableText, true);
  assert.equal(supported.writeGate.canWriteToPaper, false);
  assert.ok(supported.writeGate.requiredConfirmations.some(item => item.includes('语义没有超出')));

  const duplicateRanks = reviewClaimAgainstEvidence('Inspectable evidence workflows help related work drafting [1].', {
    ...context,
    evidencePack: {
      ...context.evidencePack,
      items: [
        ...context.evidencePack.items,
        { rank: 1, sourceLabel: 'duplicate.md:L1', snippet: 'Duplicate evidence number points to another source.' },
      ],
    },
  });
  assert.equal(duplicateRanks.status, 'reject');
  assert.ok(duplicateRanks.findings.some(item => item.id === 'unstable-evidence-ranks' && item.blocking));
  assert.equal(duplicateRanks.writeGate.status, 'blocked');

  const weakClinical = reviewClaimAgainstEvidence(
    'Inspectable evidence workflows significantly improve clinical diagnosis accuracy across hospitals [1].',
    context,
  );
  assert.equal(weakClinical.status, 'reject');
  assert.ok(weakClinical.findings.some(item => item.id === 'weak-evidence-match' && item.blocking));
  assert.equal(weakClinical.writeGate.status, 'blocked');
  assert.ok(weakClinical.matches[0].coverage < 0.75);
  assert.ok(weakClinical.matches[0].missingTerms.includes('clinical'));

  const weakDomainConclusion = reviewClaimAgainstEvidence(
    'Evidence methods dominate all related work on autonomous driving systems [1].',
    context,
  );
  assert.equal(weakDomainConclusion.status, 'reject');
  assert.ok(weakDomainConclusion.findings.some(item => item.id === 'weak-evidence-match' && item.blocking));
  assert.ok(weakDomainConclusion.suggestedRewrite.includes('证据 [1] 只能说明'));

  const bibliographic = reviewClaimAgainstEvidence('Smith et al. 2024 prove that inspectable evidence workflows help related work drafting [1].', context);
  assert.equal(bibliographic.status, 'reject');
  assert.ok(bibliographic.findings.some(item => item.id === 'unsupported-bibliographic-details' && item.blocking));
  assert.equal(bibliographic.writeGate.status, 'blocked');
  assert.equal(bibliographic.writeGate.canWriteToPaper, false);

  const quantitative = reviewClaimAgainstEvidence('Inspectable evidence workflows help related work drafting by 15% [1].', context);
  assert.equal(quantitative.status, 'reject');
  assert.ok(quantitative.findings.some(item => item.id === 'unsupported-quantitative-details' && item.blocking));
  assert.equal(quantitative.writeGate.status, 'blocked');
  assert.equal(quantitative.writeGate.canWriteToPaper, false);

  const contradiction = reviewClaimAgainstEvidence('Inspectable evidence workflows improve related work drafting [1].', {
    ...context,
    evidencePack: {
      ...context.evidencePack,
      items: [
        {
          rank: 1,
          sourceLabel: 'negative.md:L1',
          snippet: 'Inspectable evidence workflows do not improve related work drafting in the controlled study.',
          supports_zh: ['只能说明 controlled study 中未观察到 related work drafting 改善。'],
          notFor: ['不能写成 improves 或 significantly improves。'],
          quality: { level: 'high', label_zh: '可直接用于局部引用' },
        },
      ],
    },
  });
  assert.equal(contradiction.status, 'reject');
  assert.ok(contradiction.findings.some(item => item.id === 'claim-contradicts-evidence' && item.blocking));
  assert.equal(contradiction.writeGate.status, 'blocked');
  assert.equal(contradiction.writeGate.canWriteToPaper, false);
});
