import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';

import { registerPaperRagRoutes } from '../paperRag.js';
import { registerPaperWorkbenchRoutes } from '../paperWorkbench.js';
import { loadSkills } from '../../services/skillEngine.js';

const checkedEvidenceNote = [
  '# scanned - 人工摘录文献笔记',
  '',
  '## Citable facts for writing',
  '- [x] Fact: Inspectable OCR evidence workflows help writers verify PDF claims before drafting.',
  '  Evidence text:',
  '  > Inspectable OCR evidence workflows help writers verify PDF claims before drafting.',
  '  Page/section:',
  '  > p. 3, Section 2',
].join('\n');

test('Paper Agent API workflow imports evidence, reviews draft, tracks revision, and checks a claim', async () => {
  await loadSkills(null);
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-agent-e2e-'));
  const app = Fastify({ logger: false });
  const resolveProjectRoot = async () => projectRoot;
  registerPaperRagRoutes(app, { resolveProjectRoot });
  registerPaperWorkbenchRoutes(app, { resolveProjectRoot });

  try {
    const previewResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/rag/text-import/preview',
      payload: {
        filename: 'scan.manual-notes.md',
        sourceDocument: 'research_corpus/scan.pdf',
        content: checkedEvidenceNote,
      },
    });
    assert.equal(previewResponse.statusCode, 200);
    const preview = JSON.parse(previewResponse.payload);
    assert.equal(preview.ok, true);
    assert.equal(preview.willWrite, false);
    assert.equal(preview.uploadReview.status, 'text-ready');

    const importResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/rag/text-import',
      payload: {
        filename: 'scan.manual-notes.md',
        sourceDocument: 'research_corpus/scan.pdf',
        content: checkedEvidenceNote,
      },
    });
    assert.equal(importResponse.statusCode, 200);
    const imported = JSON.parse(importResponse.payload);
    assert.equal(imported.ok, true);
    assert.equal(imported.document.path, 'research_corpus/scan.manual-notes.md');
    assert.equal(imported.uploadReview.blocksCitationWriting, false);

    const contextPayload = {
      task: '帮我根据证据写 related work 中关于 OCR evidence workflow 的局部观点',
      contextAnswers: {
        target_section_or_file: 'chapters/related_work.tex',
        paper_claims: '本文强调可检查证据流程能降低论文写作中的引用失真。',
      },
      evidenceQuery: 'Inspectable OCR evidence workflows PDF claims drafting',
      evidenceLimit: 3,
    };
    const contextResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/context',
      payload: contextPayload,
    });
    assert.equal(contextResponse.statusCode, 200);
    const context = JSON.parse(contextResponse.payload);
    assert.equal(context.evidencePack.status, 'ready');
    assert.ok(context.evidencePack.items.some(item => item.snippet.includes('Inspectable OCR evidence workflows')));
    assert.notEqual(context.contextReadiness.status, 'blocked');
    assert.ok(context.aiDraftRequest.send.userMessage.includes('# 证据写作包'));

    const unsafeReviewResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/review-answer',
      payload: {
        ...contextPayload,
        answer: 'Smith et al. 2024 show that inspectable OCR evidence workflows improve PDF claim verification by 15% [1].',
      },
    });
    assert.equal(unsafeReviewResponse.statusCode, 200);
    const unsafeReview = JSON.parse(unsafeReviewResponse.payload).review;
    assert.equal(unsafeReview.status, 'reject');
    assert.ok(unsafeReview.findings.some(item => item.id === 'unsupported-bibliographic-details' && item.blocking));
    assert.ok(unsafeReview.findings.some(item => item.id === 'unsupported-quantitative-details' && item.blocking));
    assert.equal(unsafeReview.revisionProgress.status, 'not-started');
    assert.equal(unsafeReview.adoptionGate.canWriteToPaper, false);

    const revisedAnswer = 'Inspectable OCR evidence workflows help writers verify PDF claims before drafting [1].';
    const revisedReviewResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/review-answer',
      payload: {
        ...contextPayload,
        answer: revisedAnswer,
        previousReview: unsafeReview,
      },
    });
    assert.equal(revisedReviewResponse.statusCode, 200);
    const revisedReview = JSON.parse(revisedReviewResponse.payload).review;
    assert.notEqual(revisedReview.status, 'reject');
    assert.equal(revisedReview.summary.blockingCount, 0);
    assert.ok(revisedReview.revisionProgress.resolvedBlockingIds.includes('unsupported-bibliographic-details'));
    assert.ok(revisedReview.revisionProgress.resolvedBlockingIds.includes('unsupported-quantitative-details'));
    assert.equal(revisedReview.revisionProgress.repeatedBlockingIds.length, 0);
    assert.equal(revisedReview.adoptionGate.canWriteToPaper, false);

    const claimResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/claim-review',
      payload: {
        ...contextPayload,
        claim: revisedAnswer,
      },
    });
    assert.equal(claimResponse.statusCode, 200);
    const claimReview = JSON.parse(claimResponse.payload).review;
    assert.equal(claimReview.status, 'supported');
    assert.equal(claimReview.writeGate.canWriteToPaper, false);
    assert.equal(claimReview.writeGate.requiresHumanConfirmation, true);

    const adoptionResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/writing-workbench/adoption-package',
      payload: {
        ...contextPayload,
        answer: revisedAnswer,
        review: revisedReview,
      },
    });
    assert.equal(adoptionResponse.statusCode, 200);
    const adoptionPackage = JSON.parse(adoptionResponse.payload).adoptionPackage;
    assert.equal(adoptionPackage.status, 'needs-final-review');
    assert.equal(adoptionPackage.target.targetSection, 'chapters/related_work.tex');
    assert.equal(adoptionPackage.canWriteToPaper, false);
    assert.equal(adoptionPackage.willWrite, false);
    assert.equal(adoptionPackage.diffPlan.willWrite, false);
    assert.ok(adoptionPackage.copyText.includes('不会也不应自动写入论文文件'));
  } finally {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});
