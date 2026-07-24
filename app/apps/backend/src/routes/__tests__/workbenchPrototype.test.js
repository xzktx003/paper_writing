import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

import {
  isLegacyWorkbenchEnabled,
  registerWorkbenchPrototypeRoutes,
} from '../workbenchPrototype.js';

test('workbench prototype routes are disabled by default', async () => {
  const app = Fastify({ logger: false });
  registerWorkbenchPrototypeRoutes(app, { env: {} });

  try {
    for (const url of ['/paper-writer-workbench.html', '/writing-workbench']) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 404);
    }
  } finally {
    await app.close();
  }
});

test('disabled workbench routes cannot leak through production static serving', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'workbench-prototype-static-'));
  await writeFile(
    path.join(tempDir, 'paper-writer-workbench.html'),
    '<!doctype html><title>should not be public</title>',
    'utf-8',
  );
  const app = Fastify({ logger: false });
  registerWorkbenchPrototypeRoutes(app, { env: {} });
  await app.register(fastifyStatic, { root: tempDir, prefix: '/' });

  try {
    const response = await app.inject({ method: 'GET', url: '/paper-writer-workbench.html' });
    assert.equal(response.statusCode, 404);
    assert.doesNotMatch(response.payload, /should not be public/);
  } finally {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('workbench prototype requires an explicit true feature flag', () => {
  assert.equal(isLegacyWorkbenchEnabled({}), false);
  assert.equal(isLegacyWorkbenchEnabled({ OPENPRISM_ENABLE_LEGACY_WORKBENCH: '' }), false);
  assert.equal(isLegacyWorkbenchEnabled({ OPENPRISM_ENABLE_LEGACY_WORKBENCH: 'false' }), false);
  assert.equal(isLegacyWorkbenchEnabled({ OPENPRISM_ENABLE_LEGACY_WORKBENCH: '1' }), false);
  assert.equal(isLegacyWorkbenchEnabled({ OPENPRISM_ENABLE_LEGACY_WORKBENCH: 'true' }), true);
});

test('workbench prototype routes serve the static UX page', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'workbench-prototype-route-'));
  const htmlPath = path.join(tempDir, 'paper-writer-workbench.html');
  await writeFile(
    htmlPath,
    '<!doctype html><html><body><h1>论文写作工作台</h1><script>fetch("/api/projects/demo/writing-workbench/context")</script></body></html>',
    'utf-8',
  );

  const app = Fastify({ logger: false });
  const registered = registerWorkbenchPrototypeRoutes(app, {
    htmlPath,
    env: { OPENPRISM_ENABLE_LEGACY_WORKBENCH: 'true' },
  });
  assert.equal(registered, true);

  try {
    for (const url of ['/paper-writer-workbench.html', '/writing-workbench']) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 200);
      assert.match(response.headers['content-type'], /text\/html/);
      assert.equal(response.headers['x-openprism-legacy'], 'true');
      assert.equal(response.headers['x-robots-tag'], 'noindex, nofollow');
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.match(response.payload, /论文写作工作台/);
      assert.match(response.payload, /writing-workbench\/context/);
    }
  } finally {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('workbench prototype default route points at the bundled frontend file', async () => {
  const app = Fastify({ logger: false });
  registerWorkbenchPrototypeRoutes(app, { enabled: true });

  try {
    const response = await app.inject({ method: 'GET', url: '/writing-workbench' });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'], /text\/html/);
    assert.match(response.payload, /Paper Writer Workbench/);
    assert.match(response.payload, /Legacy \/ Prototype/);
    assert.match(response.payload, /href="\/projects"/);
    assert.match(response.payload, /进入正式项目工作区/);
    assert.match(response.payload, /data-copy-note-template/);
    assert.match(response.payload, /weak-evidence-match/);
    assert.match(response.payload, /missingTerms/);
    assert.match(response.payload, /覆盖率/);
    assert.match(response.payload, /textEvidenceImportPanel/);
    assert.match(response.payload, /previewTextEvidenceBtn/);
    assert.match(response.payload, /textEvidenceServerPreview/);
    assert.match(response.payload, /previewTextEvidenceFromPanel/);
    assert.match(response.payload, /renderTextEvidenceServerPreview/);
    assert.match(response.payload, /\/rag\/text-import\/preview/);
    assert.match(response.payload, /ocrRecoveryQueue/);
    assert.match(response.payload, /refreshOcrRecoveryQueueBtn/);
    assert.match(response.payload, /data-create-ocr-job/);
    assert.match(response.payload, /data-run-ocr-job/);
    assert.match(response.payload, /\/rag\/ocr-jobs/);
    assert.match(response.payload, /\/rag\/ocr-jobs\/run/);
    assert.match(response.payload, /renderAnswerRevisionProgress/);
    assert.match(response.payload, /taskIntentGuide/);
    assert.match(response.payload, /renderTaskIntentGuide/);
    assert.match(response.payload, /data-copy-task-intent-guide/);
    assert.match(response.payload, /data-use-task-starter-id/);
    assert.match(response.payload, /sendSafetyGate/);
    assert.match(response.payload, /sendSafetyConfirm/);
    assert.match(response.payload, /checkSendSafetyGate/);
    assert.match(response.payload, /sendGate/);
    assert.match(response.payload, /data-copy-revision-progress/);
    assert.doesNotMatch(response.payload, /importTextEvidenceFromPrompt/);
    assert.doesNotMatch(response.payload, /window\.prompt/);
    assert.doesNotMatch(response.payload, /window\.confirm/);
  } finally {
    await app.close();
  }
});

test('workbench prototype exposes the Paper Agent evidence-to-review controls without browser-only prompts', async () => {
  const app = Fastify({ logger: false });
  registerWorkbenchPrototypeRoutes(app, { enabled: true });

  try {
    const response = await app.inject({ method: 'GET', url: '/writing-workbench' });
    assert.equal(response.statusCode, 200);
    const html = response.payload;
    const requiredControls = [
      'ragDropZone',
      'uploadBtn',
      'textEvidenceImportPanel',
      'textEvidenceFilename',
      'textEvidenceContent',
      'textEvidenceQuality',
      'textEvidenceServerPreview',
      'previewTextEvidenceBtn',
      'importTextEvidenceBtn',
      'ocrRecoveryQueue',
      'refreshOcrRecoveryQueueBtn',
      'reviewAnswerBtn',
      'sendSafetyGate',
      'sendSafetyConfirm',
      'answerReview',
      'answerAdoptionPackage',
      'createAnswerAdoptionPackageBtn',
      'copyAnswerAdoptionPackageBtn',
      'documentDeleteConfirm',
      'pendingDeleteDocumentPath',
      'currentAnswerReviewText',
      'currentAiReplyEvidencePackFingerprint',
      'currentClaimEvidencePackFingerprint',
      'getAiReplyEvidencePackFingerprint',
      'buildLocalEvidencePackDriftFinding',
      'evidencePackFingerprint',
      'activeEvidenceQuery',
      'activeRagRequest',
      'resetDerivedReviewState',
      'invalidateAiReplyReviewState',
      'currentWorkbenchInputSignature',
      'buildWorkbenchInputSignature',
      'ensureWorkbenchInputsFresh',
      'workbenchRequestSeq',
      'copyRuntimeEnvironmentBtn',
      'runtimeEnvironmentStatus',
      'runtimeEnvironment',
      'renderSendSafetyGateStale',
      'markWorkbenchInputsStale',
      'loadDemoWorkbench',
      'copyFreshWorkbenchText',
      'copyFreshAttribute',
      'buildStaleAsyncActionError',
      'execCommand',
      'claimInput',
      'reviewClaimBtn',
      'taskIntentGuide',
    ];
    for (const control of requiredControls) {
      assert.match(html, new RegExp(`id="${control}"|#${control}|${control}`), `missing ${control}`);
    }
    const requiredHandlers = [
      'openTextEvidenceImportPanel',
      'updateTextEvidenceQuality',
      'previewTextEvidenceFromPanel',
      'importTextEvidenceFromPanel',
      'renderOcrRecoveryQueue',
      'renderRuntimeEnvironment',
      'refreshOcrRecoveryJobs',
      'createOcrRecoveryJob',
      'runServerOcrJob',
      'renderTaskIntentGuide',
      'buildSkillTooltipText',
      'useTaskStarterById',
      'searchRagEvidence',
      'updateSendSafetyGate',
      'checkSendSafetyGate',
      'reviewCurrentAnswer',
      'createAnswerAdoptionPackage',
      'renderAnswerAdoptionPackage',
      'reviewClaimSupport',
      'renderAnswerRevisionProgress',
      'renderDocumentDeleteConfirm',
      'requestRagDocumentDelete',
      'cancelRagDocumentDelete',
    ];
    for (const handler of requiredHandlers) {
      assert.match(html, new RegExp(`function ${handler}\\b|${handler}\\(`), `missing handler ${handler}`);
    }
    assert.match(html, /检索完成并已更新证据包/);
    assert.match(html, /function loadWorkbench\(\{ throwOnError = false \} = \{\}\)/);
    assert.match(html, /loadWorkbench[\s\S]*if \(throwOnError\) throw error/);
    assert.match(html, /searchRagEvidence[\s\S]*await loadWorkbench\(\{ throwOnError: true \}\)/);
    assert.match(html, /searchRagEvidence[\s\S]*检索已完成，但工作台刷新失败/);
    assert.doesNotMatch(html, /searchRagEvidence[\s\S]*renderEvidence\(\{[\s\S]*await loadWorkbench\(\)/);
    assert.match(html, /searchRagEvidence[\s\S]*const requestSignature = buildWorkbenchInputSignature\(\)/);
    assert.match(html, /searchRagEvidence[\s\S]*requestSignature !== buildWorkbenchInputSignature\(\)/);
    assert.match(html, /RAG 检索返回时项目、后端、身份、任务、上下文或检索词已变化，已丢弃旧检索结果/);
    assert.match(html, /refreshOcrRecoveryJobs[\s\S]*if \(silent\) \{[\s\S]*lastSilentError: error\.message[\s\S]*return;[\s\S]*\}/);
    assert.match(html, /refreshOcrRecoveryJobs[\s\S]*els\.ocrRecoveryQueue\.className = 'hint warning'/);
    assert.match(html, /title="\$\{escapeHtml\(tooltip\)\}"/);
    assert.match(html, /rag: activeRagRequest/);
    assert.match(html, /const copied = document\.execCommand\('copy'\)/);
    assert.match(html, /浏览器拒绝了剪贴板写入/);
    assert.match(html, /function resetDerivedReviewState\(\)/);
    assert.match(html, /resetDerivedReviewState[\s\S]*currentAiReplyEvidencePackFingerprint = ''/);
    assert.match(html, /resetDerivedReviewState[\s\S]*currentClaimEvidencePackFingerprint = ''/);
    assert.match(html, /render\(data\)[\s\S]*resetDerivedReviewState\(\)/);
    assert.match(html, /id="aiReply"[^>]*contenteditable="true"/);
    assert.match(html, /els\.aiReply\.addEventListener\('input'[\s\S]*invalidateAiReplyReviewState/);
    assert.match(html, /旧审查和采纳包已失效/);
    assert.match(html, /项目、后端、身份、任务、上下文或 RAG 检索词已变更/);
    assert.match(html, /render\(data\)[\s\S]*currentWorkbenchInputSignature = buildWorkbenchInputSignature\(\)/);
    assert.match(html, /render\(data\)[\s\S]*currentWorkbenchInputsStale = false/);
    assert.match(html, /let workbenchRequestSeq = 0/);
    assert.match(html, /运行环境能力/);
    assert.match(html, /分析任务后查看 OCR 工具、扫描 PDF 恢复和本机生产验证能力/);
    assert.match(html, /function renderRuntimeEnvironment\(/);
    assert.match(html, /productionWarnings/);
    assert.match(html, /生产验收警告/);
    assert.match(html, /needs-production-validation/);
    assert.match(html, /运行环境生产 Gate 未完成/);
    assert.match(html, /readinessTiers/);
    assert.match(html, /可用性分级/);
    assert.match(html, /生产发布级/);
    assert.match(html, /renderAgentReadiness[\s\S]*readinessTiers[\s\S]*可用性分级/);
    assert.match(html, /renderRuntimeEnvironment[\s\S]*OCR 自动恢复/);
    assert.match(html, /renderRuntimeEnvironment[\s\S]*PDF 文本抽取/);
    assert.match(html, /renderRuntimeEnvironment[\s\S]*浏览器 E2E/);
    assert.match(html, /productionGates/);
    assert.match(html, /生产验收 Gate/);
    assert.match(html, /server-ocr/);
    assert.match(html, /pdf-text-extraction/);
    assert.match(html, /browser-e2e/);
    assert.match(html, /renderRuntimeEnvironment[\s\S]*productionGates[\s\S]*生产验收 Gate/);
    assert.match(html, /renderOcrCapability[\s\S]*PDF 文本抽取/);
    assert.match(html, /buildLocalOcrCapability[\s\S]*pdfTextExtractionAvailable: false/);
    assert.match(html, /browserE2eCapability/);
    assert.match(html, /真实浏览器 E2E 未在工作台内验证/);
    assert.match(html, /node scripts\/playwright-preflight\.mjs/);
    assert.match(html, /npx playwright install/);
    assert.match(html, /sudo npx playwright install-deps/);
    assert.match(html, /pnpm e2e/);
    assert.match(html, /Paper Agent OCR 生产恢复命令/);
    assert.match(html, /# OCR 能力\\n服务器未检测到 OCR 工具（not-configured）\\n自动 OCR 恢复：未启用\\n命令包：\\n# Paper Agent OCR 生产恢复命令/);
    assert.match(html, /command -v ocrmypdf/);
    assert.match(html, /sudo apt-get install -y ocrmypdf tesseract-ocr poppler-utils/);
    assert.match(html, /Paper Agent 浏览器 E2E 生产验收命令/);
    assert.match(html, /依赖修复后复验计划/);
    assert.match(html, /renderRuntimeEnvironment[\s\S]*recheckPlan[\s\S]*复制复验计划/);
    assert.match(html, /data-copy-runtime-recheck-plan/);
    assert.match(html, /copyRuntimeRecheckPlan[\s\S]*copyFreshAttribute\(copyRuntimeRecheckPlan, 'data-copy-runtime-recheck-plan', '依赖修复后复验计划'\)/);
    assert.match(html, /run-browser-e2e-preflight/);
    assert.match(html, /renderQueuedActionButton[\s\S]*action\.type === 'run-browser-e2e-preflight'[\s\S]*data-copy-browser-e2e-command[\s\S]*action\.type === 'activate-skill'/);
    assert.match(html, /copyBrowserE2eCommand[\s\S]*copyFreshAttribute\(copyBrowserE2eCommand, 'data-copy-browser-e2e-command', '浏览器 E2E 预检命令'\)/);
    assert.match(html, /data-copy-command-pack/);
    assert.match(html, /copyCommandPack[\s\S]*copyFreshAttribute\(copyCommandPack, 'data-copy-command-pack', '命令包'\)/);
    assert.match(html, /data-copy-browser-e2e-command/);
    assert.match(html, /浏览器 E2E 预检命令/);
    assert.match(html, /renderEvidenceExpansionPlan[\s\S]*data-copy-evidence-expansion-plan[\s\S]*复制补证据计划/);
    assert.match(html, /copyEvidenceExpansionPlan[\s\S]*copyFreshAttribute\(copyEvidenceExpansionPlan, 'data-copy-evidence-expansion-plan', '补证据计划'\)/);
    assert.match(html, /renderSkillNavigator[\s\S]*card\.hoverGuide\?\.first_prompt_zh[\s\S]*data-use-task-template[\s\S]*填入任务框[\s\S]*data-copy-template[\s\S]*复制首问/);
    assert.match(html, /renderTaskIntentGuide[\s\S]*guide\.nextAction\?\.type === 'review-rag-status'[\s\S]*data-review-rag-diagnostic/);
    assert.match(html, /function reviewRagDiagnosticFromIntent\(\)/);
    assert.match(html, /reviewRagDiagnosticFromIntent[\s\S]*els\.ragRepairGuide/);
    assert.match(html, /data-review-rag-diagnostic[\s\S]*reviewRagDiagnosticFromIntent\(\)/);
    assert.match(html, /renderRagRepairActionButton[\s\S]*type === 'upload-extracted-notes' && meta\.noteTemplate[\s\S]*data-import-text-evidence/);
    assert.match(html, /renderDocuments[\s\S]*renderRagRepairActionButton\(readiness\.action, \{ path: doc\.path, noteTemplate:/);
    assert.match(html, /renderRuntimeEnvironment[\s\S]*需要 OCR\/人工摘录的文档/);
    assert.match(html, /paper-polish[\s\S]*论文润色 \/ 语言编辑/);
    assert.match(html, /writing-polish[\s\S]*Academic Polishing/);
    assert.match(html, /evidence-review[\s\S]*审查 AI 输出 \/ 证据核对/);
    assert.match(html, /evidence-review[\s\S]*Evidence Review/);
    assert.match(html, /幻觉引用/);
    assert.match(html, /安全采纳包/);
    assert.match(html, /latex-debug[\s\S]*修复 LaTeX \/ Overleaf 报错/);
    assert.match(html, /latex-debugging[\s\S]*LaTeX Debugging/);
    assert.match(html, /latex_error_log[\s\S]*LaTeX 报错日志/);
    assert.match(html, /AI 痕迹/);
    assert.match(html, /reviewer-response[\s\S]*审稿回复 \/ Rebuttal/);
    assert.match(html, /Reviewer Response/);
    assert.match(html, /academic-search[\s\S]*检索最新相关工作/);
    assert.match(html, /paper-planning[\s\S]*论文规划 \/ Outline/);
    assert.match(html, /paper-planning[\s\S]*Paper Planning/);
    assert.match(html, /conclusion-close[\s\S]*写 Conclusion \/ Future Work/);
    assert.match(html, /statistical-analysis[\s\S]*统计分析 \/ 显著性检验/);
    assert.match(html, /submission-materials[\s\S]*投稿材料 \/ 声明检查/);
    assert.match(html, /demoData\.skills\.navigator\.cards\.push[\s\S]*paper-planning[\s\S]*writing-polish[\s\S]*latex-debugging[\s\S]*evidence-review[\s\S]*reviewer-response/);
    assert.match(html, /demoData\.skills\.navigator\.contextFilters\.push[\s\S]*paper_claims[\s\S]*reviewer_comments[\s\S]*latex_error_log/);
    assert.match(html, /renderRuntimeEnvironment[\s\S]*环境下一步/);
    assert.match(html, /render\(data\)[\s\S]*renderRuntimeEnvironment\(data\.runtimeEnvironment\)/);
    assert.match(html, /renderWorkbenchAnalysisStale[\s\S]*renderRuntimeEnvironment\(null\)/);
    assert.match(html, /copyRuntimeEnvironmentBtn\.addEventListener[\s\S]*copyFreshWorkbenchText\(currentWorkbench\?\.runtimeEnvironment\?\.copyText \|\| '', '运行环境能力'\)/);
    assert.match(html, /renderWorkbenchBundle[\s\S]*工作包交接指南[\s\S]*data-copy-workbench-handoff/);
    assert.match(html, /copyWorkbenchHandoff[\s\S]*copyFreshAttribute\(copyWorkbenchHandoff, 'data-copy-workbench-handoff', '工作包交接指南'\)/);
    assert.match(html, /demoHandoffGuide[\s\S]*不得读取、上传或复制被忽略的私密 papers\/ 目录内容/);
    assert.match(html, /demoHandoffGuide[\s\S]*生产 Gate 0\/3 通过/);
    assert.match(html, /demoHandoffGuide[\s\S]*服务器 OCR 自动恢复/);
    assert.match(html, /demoHandoffGuide[\s\S]*PDF 文本抽取/);
    assert.match(html, /demoHandoffGuide[\s\S]*真实浏览器 E2E/);
    assert.match(html, /demoHandoffGuide[\s\S]*运行环境生产 Gate/);
    assert.match(html, /demoData\.runtimeEnvironment/);
    assert.match(html, /runtime-environment', title_zh: '运行环境能力'/);
    assert.match(html, /# 运行环境能力/);
    assert.match(html, /loadWorkbench[\s\S]*const requestSeq = \+\+workbenchRequestSeq/);
    assert.match(html, /loadWorkbench[\s\S]*const requestSignature = buildWorkbenchInputSignature\(\)/);
    assert.match(html, /loadWorkbench[\s\S]*requestSeq !== workbenchRequestSeq \|\| requestSignature !== buildWorkbenchInputSignature\(\)/);
    assert.match(html, /loadWorkbench[\s\S]*分析请求已过期，当前输入已变化，请重新点击/);
    assert.match(html, /loadWorkbench[\s\S]*if \(requestSeq === workbenchRequestSeq\) \{[\s\S]*els\.status\.textContent = `请求失败：\$\{error\.message\}`/);
    assert.match(html, /loadDemoWorkbench[\s\S]*workbenchRequestSeq \+= 1/);
    assert.match(html, /markWorkbenchInputsStale[\s\S]*workbenchRequestSeq \+= 1/);
    assert.match(html, /function buildStaleAsyncActionError\(/);
    assert.match(html, /reviewCurrentAnswer[\s\S]*const requestSignature = buildWorkbenchInputSignature\(\)/);
    assert.match(html, /reviewCurrentAnswer[\s\S]*const requestFingerprint = getAiReplyEvidencePackFingerprint\(\)/);
    assert.match(html, /reviewCurrentAnswer[\s\S]*answer !== \(els\.aiReply\.textContent \|\| ''\)/);
    assert.match(html, /AI 输出审查返回时回复、证据包或输入已变化，已丢弃旧审查结果/);
    assert.match(html, /reviewClaimSupport[\s\S]*claim !== els\.claimInput\.value\.trim\(\)/);
    assert.match(html, /单句检查返回时 claim、证据包或输入已变化，已丢弃旧检查结果/);
    assert.match(html, /renderAnswerClaimCheckQueue[\s\S]*关联证据[\s\S]*item\.evidenceRefs/);
    assert.match(html, /buildLocalClaimQueueEvidenceRefs[\s\S]*关联证据/);
    assert.match(html, /createAnswerAdoptionPackage[\s\S]*targetSection !== els\.contextTargetSection\.value\.trim\(\)/);
    assert.match(html, /安全采纳包返回时回复、目标章节、证据包或输入已变化，已丢弃旧采纳包/);
    assert.match(html, /renderAnswerAdoptionPackage[\s\S]*人工应用指南[\s\S]*data-copy-manual-application-guide/);
    assert.match(html, /copyManualApplicationGuide[\s\S]*copyFreshAttribute\(copyManualApplicationGuide, 'data-copy-manual-application-guide', '人工应用指南'\)/);
    assert.match(html, /buildLocalManualApplicationGuide[\s\S]*只做最小人工 diff/);
    assert.match(html, /sendPromptToAi[\s\S]*const requestSignature = buildWorkbenchInputSignature\(\)/);
    assert.match(html, /sendPromptToAi[\s\S]*const pendingReplyText = '正在创建会话并请求 AI\.\.\.'/);
    assert.match(html, /sendPromptToAi[\s\S]*els\.aiReply\.textContent !== pendingReplyText/);
    assert.match(html, /AI 回复返回时输入或回复区已变化，已丢弃旧回复/);
    assert.match(html, /buildWorkbenchInputSignature[\s\S]*apiBase: els\.apiBase\.value\.trim\(\)/);
    assert.match(html, /buildWorkbenchInputSignature[\s\S]*const apiToken = els\.apiToken\.value\.trim\(\)/);
    assert.match(html, /buildWorkbenchInputSignature[\s\S]*apiTokenMarker/);
    assert.match(html, /function renderWorkbenchAnalysisStale\(/);
    assert.match(html, /renderWorkbenchAnalysisStale[\s\S]*closeTextEvidenceImportPanel\(\)/);
    assert.match(html, /renderWorkbenchAnalysisStale[\s\S]*renderAgentReadiness\(null\)/);
    assert.match(html, /renderWorkbenchAnalysisStale[\s\S]*renderModeActionCenter\(null\)/);
    assert.match(html, /renderWorkbenchAnalysisStale[\s\S]*renderEvidencePack\(null\)/);
    assert.match(html, /renderWorkbenchAnalysisStale[\s\S]*renderSkillNavigator\(null\)/);
    assert.match(html, /renderWorkbenchAnalysisStale[\s\S]*renderWorkbenchBundle\(null\)/);
    assert.match(html, /renderWorkbenchAnalysisStale[\s\S]*renderSendSafetyGateStale\(\)/);
    assert.match(html, /function renderSendSafetyGateStale\(/);
    assert.match(html, /当前分析已过期。请先点击“分析任务”重新生成模式、证据包和发送门槛/);
    assert.match(html, /function loadDemoWorkbench\(/);
    assert.match(html, /loadDemoWorkbench[\s\S]*els\.projectId\.value = 'demo'/);
    assert.match(html, /loadDemoWorkbench[\s\S]*els\.task\.value = demoData\.task/);
    assert.match(html, /loadDemoWorkbench[\s\S]*els\.ragQuery\.value = demoData\.evidencePack\?\.query/);
    assert.match(html, /demoBtn\.addEventListener\('click'[\s\S]*loadDemoWorkbench\(\)/);
    assert.match(html, /function markWorkbenchInputsStale\(/);
    assert.match(html, /function markWorkbenchInputsStale\(reason = '项目、后端、身份、任务、上下文或 RAG 检索词已变更', \{ force = false \} = \{\}\)/);
    assert.match(html, /markWorkbenchInputsStale[\s\S]*!force && buildWorkbenchInputSignature\(\) === currentWorkbenchInputSignature/);
    assert.match(html, /markWorkbenchInputsStale[\s\S]*resetDerivedReviewState\(\)/);
    assert.match(html, /markWorkbenchInputsStale[\s\S]*renderWorkbenchAnalysisStale\(\)/);
    assert.match(html, /els\.task[\s\S]*addEventListener\('input'[\s\S]*markWorkbenchInputsStale/);
    assert.match(html, /els\.ragQuery[\s\S]*addEventListener\('input'[\s\S]*markWorkbenchInputsStale/);
    assert.match(html, /els\.apiBase[\s\S]*addEventListener\('input'[\s\S]*markWorkbenchInputsStale/);
    assert.match(html, /els\.apiToken[\s\S]*addEventListener\('input'[\s\S]*markWorkbenchInputsStale/);
    assert.match(html, /Token 已保存到当前浏览器。旧分析已失效，请重新点击/);
    assert.match(html, /Token 已清除。旧分析已失效，请重新点击/);
    assert.match(html, /saveToken[\s\S]*els\.apiToken\.value = token/);
    assert.match(html, /saveToken[\s\S]*markWorkbenchInputsStale\('API Token 已保存', \{ force: true \}\)/);
    assert.match(html, /saveToken[\s\S]*markWorkbenchInputsStale\('API Token 已清除', \{ force: true \}\)/);
    assert.match(html, /loadProjects[\s\S]*markWorkbenchInputsStale\('项目列表已刷新', \{ force: true \}\)/);
    assert.match(html, /loadProjects[\s\S]*projectSelect\.innerHTML = '<option value="">正在加载项目列表\.\.\.<\/option>'/);
    assert.match(html, /loadProjects[\s\S]*projectSelect\.innerHTML = '<option value="">项目列表加载失败，可手动填写项目 ID<\/option>'/);
    assert.match(html, /useTaskStarterById[\s\S]*markWorkbenchInputsStale\('推荐任务入口已使用'\)/);
    assert.match(html, /data-use-task-template[\s\S]*markWorkbenchInputsStale\('任务入口已填入'\)/);
    assert.match(html, /data-use-rag-query[\s\S]*markWorkbenchInputsStale\('推荐检索词已填入'\)/);
    assert.match(html, /已选择项目：[\s\S]*旧分析已失效，请重新点击/);
    assert.match(html, /已把建议检索词填入证据库检索框。旧分析已失效/);
    assert.match(html, /sendPromptToAi[\s\S]*ensureWorkbenchInputsFresh\('发送给 AI'\)/);
    assert.match(html, /reviewCurrentAnswer[\s\S]*ensureWorkbenchInputsFresh\('审查 AI 输出'\)/);
    assert.match(html, /createAnswerAdoptionPackage[\s\S]*ensureWorkbenchInputsFresh\('生成安全采纳包'\)/);
    assert.match(html, /reviewClaimSupport[\s\S]*ensureWorkbenchInputsFresh\('检查单句证据'\)/);
    assert.match(html, /uploadRagDocument[\s\S]*ensureWorkbenchInputsFresh\('上传证据文档'\)/);
    assert.match(html, /uploadRagDocument[\s\S]*const requestSignature = buildWorkbenchInputSignature\(\)/);
    assert.match(html, /uploadRagDocument[\s\S]*上传证据过程中项目、后端、身份、任务、上下文或检索词已变化，已停止剩余文件上传/);
    assert.match(html, /uploadRagDocument[\s\S]*上传证据完成后当前输入已变化，已跳过旧结果刷新/);
    assert.match(html, /rebuildRagIndex[\s\S]*ensureWorkbenchInputsFresh\('重建 RAG 索引'\)/);
    assert.match(html, /rebuildRagIndex[\s\S]*const requestSignature = buildWorkbenchInputSignature\(\)/);
    assert.match(html, /rebuildRagIndex[\s\S]*RAG 索引已在原输入上下文完成，但当前项目、后端、身份、任务、上下文或检索词已变化，已跳过旧结果刷新/);
    assert.match(html, /previewTextEvidenceFromPanel[\s\S]*ensureWorkbenchInputsFresh\('预检文本证据'\)/);
    assert.match(html, /importTextEvidenceFromPanel[\s\S]*ensureWorkbenchInputsFresh\('导入文本证据'\)/);
    assert.match(html, /createOcrRecoveryJob[\s\S]*ensureWorkbenchInputsFresh\('加入 OCR\/摘录队列'\)/);
    assert.match(html, /runServerOcrJob[\s\S]*ensureWorkbenchInputsFresh\('运行服务器 OCR'\)/);
    assert.match(html, /importTextEvidenceFromPanel[\s\S]*importResult = \{[\s\S]*renderUploadSummary\(\[importResult\]\)[\s\S]*markWorkbenchInputsStale\('证据库已变更', \{ force: true \}\)[\s\S]*await loadWorkbench\(\{ throwOnError: true \}\)/);
    assert.match(html, /importTextEvidenceFromPanel[\s\S]*文本证据已导入，但工作台刷新失败/);
    assert.match(html, /uploadRagDocument[\s\S]*renderUploadSummary\(results\)[\s\S]*markWorkbenchInputsStale\('证据库已变更', \{ force: true \}\)[\s\S]*await loadWorkbench\(\{ throwOnError: true \}\)/);
    assert.match(html, /uploadRagDocument[\s\S]*上传已完成，但工作台刷新失败/);
    assert.match(html, /rebuildRagIndex[\s\S]*indexRebuilt = true[\s\S]*markWorkbenchInputsStale\('证据库已变更', \{ force: true \}\)[\s\S]*await loadWorkbench\(\{ throwOnError: true \}\)/);
    assert.match(html, /rebuildRagIndex[\s\S]*索引已完成，但工作台刷新失败/);
    assert.match(html, /runServerOcrJob[\s\S]*ocrImported = true[\s\S]*markWorkbenchInputsStale\('证据库已变更', \{ force: true \}\)[\s\S]*await loadWorkbench\(\{ throwOnError: true \}\)/);
    assert.match(html, /runServerOcrJob[\s\S]*服务器 OCR 已导入证据库，但工作台刷新失败/);
    assert.match(html, /copyPromptBtn\.addEventListener[\s\S]*copyFreshWorkbenchText[\s\S]*写作提示词/);
    assert.match(html, /copyEvidencePackBtn\.addEventListener[\s\S]*copyFreshWorkbenchText[\s\S]*证据包/);
    assert.match(html, /copyWorkbenchBundleBtn\.addEventListener[\s\S]*copyFreshWorkbenchText[\s\S]*完整工作包/);
    assert.match(html, /data-copy-review-prompt[\s\S]*copyFreshAttribute[\s\S]*修订提示词/);
    assert.match(html, /data-use-review-prompt[\s\S]*ensureWorkbenchInputsFresh\('使用修订提示词'\)/);
    assert.match(html, /data-use-claim-check[\s\S]*ensureWorkbenchInputsFresh\('放入单句检查'\)/);
    assert.match(html, /data-delete-document/);
    assert.match(html, /data-confirm-delete-document/);
    assert.match(html, /data-cancel-delete-document/);
    assert.match(html, /requestRagDocumentDelete[\s\S]*ensureWorkbenchInputsFresh\('删除证据文档'\)/);
    assert.match(html, /deleteRagDocument[\s\S]*ensureWorkbenchInputsFresh\('删除证据文档'\)/);
    assert.match(html, /deleteRagDocument[\s\S]*documentDeleted = true[\s\S]*markWorkbenchInputsStale\('证据库已变更', \{ force: true \}\)[\s\S]*await loadWorkbench\(\{ throwOnError: true \}\)/);
    assert.match(html, /deleteRagDocument[\s\S]*文档已删除，但工作台刷新失败/);
    assert.match(html, /deleteDocument[\s\S]*requestRagDocumentDelete/);
    assert.match(html, /confirmDeleteDocument[\s\S]*deleteRagDocument\(pendingDeleteDocumentPath\)/);
    assert.doesNotMatch(html, /window\.confirm/);
    assert.match(html, /writing-workbench\/adoption-package/);
    assert.match(html, /自动写入：否/);
  } finally {
    await app.close();
  }
});
