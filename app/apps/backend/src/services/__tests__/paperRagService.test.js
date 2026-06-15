import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

import {
  buildRagContext,
  buildRagEvidence,
  buildRagUsageGuidance,
  buildCorpusUploadReview,
  buildExtractionRecovery,
  buildOcrCapability,
  createOcrRecoveryJob,
  importTextEvidenceDocument,
  indexProjectCorpus,
  listOcrRecoveryJobs,
  previewTextEvidenceImport,
  runOcrRecoveryJob,
  saveBinaryCorpusDocument,
  searchCorpus,
} from '../paperRagService.js';

function makeSimplePdfWithLiteralText(text) {
  return Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 80 >>
stream
BT /F1 12 Tf 72 720 Td (${text}) Tj ET
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF`);
}

test('saveBinaryCorpusDocument extracts PDF text and indexes real content', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-service-'));
  try {
    const document = await saveBinaryCorpusDocument(projectRoot, {
      filename: 'retrieval-paper.pdf',
      buffer: makeSimplePdfWithLiteralText('Graph neural networks improve retrieval augmented generation'),
      mimetype: 'application/pdf',
    });

    assert.equal(document.path, 'research_corpus/retrieval-paper.pdf');
    assert.equal(document.kind, 'binary');
    assert.equal(document.parseStatus, 'parsed');
    assert.ok(document.extractedTextChars > 0);
    assert.ok(document.extractedPath.endsWith('.extracted.md'));
    assert.ok(document.chunks > 0);
    const review = buildCorpusUploadReview(document);
    assert.equal(review.status, 'ready');
    assert.equal(review.blocksCitationWriting, false);
    assert.ok(review.actions.some(action => action.type === 'search-evidence'));
    assert.match(review.copyText, /RAG 上传诊断/);

    const results = await searchCorpus(projectRoot, 'retrieval augmented generation graph neural');
    assert.ok(results.length > 0);
    assert.equal(results[0].source.path, 'research_corpus/retrieval-paper.pdf');
    assert.match(results[0].text, /retrieval augmented generation/i);

    const context = await buildRagContext(projectRoot, 'graph neural retrieval');
    assert.match(context, /research_corpus\/retrieval-paper\.pdf/);
    assert.match(context, /Graph neural networks/i);

    const evidence = await buildRagEvidence(projectRoot, 'graph neural retrieval');
    assert.equal(evidence.query, 'graph neural retrieval');
    assert.match(evidence.context, /research_corpus\/retrieval-paper\.pdf/);
    assert.equal(evidence.results[0].rank, 1);
    assert.equal(evidence.results[0].source.path, 'research_corpus/retrieval-paper.pdf');

    const guidance = buildRagUsageGuidance(evidence);
    assert.match(guidance, /RAG usage rules/);
    assert.match(guidance, /Use only the numbered evidence snippets/);
    assert.match(guidance, /Cannot support/);
    assert.match(guidance, /\[1\] research_corpus\/retrieval-paper\.pdf/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('buildRagEvidence returns a stable empty evidence shape', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-empty-evidence-'));
  try {
    const evidence = await buildRagEvidence(projectRoot, 'missing topic');
    assert.deepEqual(evidence, {
      query: 'missing topic',
      context: '',
      results: [],
    });
    const guidance = buildRagUsageGuidance(evidence);
    assert.match(guidance, /No evidence snippets/);
    assert.match(guidance, /Do not invent paper titles/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('indexProjectCorpus reports metadata-only status for binary documents without extracted text', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-metadata-'));
  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(path.join(projectRoot, 'research_corpus', 'scan.pdf'), Buffer.from('%PDF-1.4\n%%EOF'));

    const index = await indexProjectCorpus(projectRoot);
    const document = index.documents.find(doc => doc.path === 'research_corpus/scan.pdf');
    assert.ok(document);
    assert.equal(document.kind, 'binary');
    assert.equal(document.parseStatus, 'metadata-only');
    assert.equal(document.chunks, 0);
    const review = buildCorpusUploadReview(document);
    assert.equal(review.status, 'metadata-only');
    assert.equal(review.blocksCitationWriting, true);
    assert.equal(review.recovery.code, 'pdf-not-extracted');
    assert.match(review.recovery.instruction_zh, /Evidence Library|Markdown/);
    assert.match(review.recovery.noteTemplate, /Citable facts for writing/);
    assert.ok(review.actions.some(action => action.type === 'upload-extracted-notes'));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('indexProjectCorpus blocks empty manual evidence note templates from citation use', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-template-note-'));
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
        '- Year / venue: ',
        '- DOI / arXiv / URL: ',
        '',
        '## Citable facts for writing',
        '- [ ] Fact: ',
        '  Evidence text: ',
        '  Page/section: ',
      ].join('\n'),
      'utf-8',
    );

    const index = await indexProjectCorpus(projectRoot);
    const document = index.documents.find(doc => doc.path === 'research_corpus/manual-note.md');
    assert.ok(document);
    assert.equal(document.kind, 'text');
    assert.equal(document.contentQuality.status, 'template-empty');
    assert.equal(document.chunks, 0);
    const review = buildCorpusUploadReview(document);
    assert.equal(review.status, 'template-empty');
    assert.equal(review.blocksCitationWriting, true);
    assert.match(review.successCriteria_zh, /事实、原文证据摘录和页码\/章节/);
    const results = await searchCorpus(projectRoot, 'Citable facts writing');
    assert.equal(results.length, 0);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('indexProjectCorpus blocks incomplete manual evidence notes from citation use', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-incomplete-note-'));
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

    const index = await indexProjectCorpus(projectRoot);
    const document = index.documents.find(doc => doc.path === 'research_corpus/manual-note.md');
    assert.ok(document);
    assert.equal(document.contentQuality.status, 'manual-note-incomplete');
    assert.equal(document.chunks, 0);
    const review = buildCorpusUploadReview(document);
    assert.equal(review.status, 'manual-note-incomplete');
    assert.equal(review.blocksCitationWriting, true);
    assert.match(review.message_zh, /证据字段不完整|缺少/);
    const results = await searchCorpus(projectRoot, 'grounded writing retrieval evidence');
    assert.equal(results.length, 0);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('importTextEvidenceDocument gates pasted OCR/manual notes before citation use', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-text-import-'));
  try {
    const emptyImport = await importTextEvidenceDocument(projectRoot, {
      filename: '../scan.manual-notes.md',
      sourceDocument: 'research_corpus/scan.pdf',
      content: [
        '# scanned - 人工摘录文献笔记',
        '',
        '## Citable facts for writing',
        '- [ ] Fact: ',
        '  Evidence text: ',
        '  Page/section: ',
      ].join('\n'),
    });
    assert.equal(emptyImport.document.path, 'research_corpus/scan.manual-notes.md');
    assert.equal(emptyImport.uploadReview.status, 'template-empty');
    assert.equal(emptyImport.uploadReview.blocksCitationWriting, true);
    assert.equal((await searchCorpus(projectRoot, 'Inspectable OCR evidence')).length, 0);

    const completeImport = await importTextEvidenceDocument(projectRoot, {
      filename: 'scan.manual-notes.md',
      sourceDocument: 'research_corpus/scan.pdf',
      content: [
        '# scanned - 人工摘录文献笔记',
        '',
        '## Citable facts for writing',
        '- [x] Fact: Inspectable OCR evidence workflows help writers verify PDF claims before drafting.',
        '  Evidence text:',
        '  > Inspectable OCR evidence workflows help writers verify PDF claims before drafting.',
        '  Page/section:',
        '  > p. 3, Section 2',
      ].join('\n'),
    });
    assert.equal(completeImport.uploadReview.status, 'text-ready');
    assert.equal(completeImport.uploadReview.blocksCitationWriting, false);
    const results = await searchCorpus(projectRoot, 'Inspectable OCR PDF claims');
    assert.ok(results.length > 0);
    assert.equal(results[0].source.path, 'research_corpus/scan.manual-notes.md');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('previewTextEvidenceImport uses backend quality gates without writing evidence', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-text-preview-'));
  try {
    const emptyPreview = previewTextEvidenceImport({
      filename: '../scan.preview.md',
      sourceDocument: 'research_corpus/scan.pdf',
      content: [
        '# scanned - 人工摘录文献笔记',
        '',
        '## Citable facts for writing',
        '- [ ] Fact: ',
        '  Evidence text: ',
        '  Page/section: ',
      ].join('\n'),
    });
    assert.equal(emptyPreview.ok, false);
    assert.equal(emptyPreview.document.path, 'research_corpus/scan.preview.md');
    assert.equal(emptyPreview.uploadReview.status, 'template-empty');
    assert.equal(emptyPreview.willWrite, false);

    const completePreview = previewTextEvidenceImport({
      filename: 'scan.preview.md',
      sourceDocument: 'research_corpus/scan.pdf',
      content: [
        '# scanned - 人工摘录文献笔记',
        '',
        '## Citable facts for writing',
        '- [x] Fact: Inspectable OCR evidence workflows help writers verify PDF claims before drafting.',
        '  Evidence text:',
        '  > Inspectable OCR evidence workflows help writers verify PDF claims before drafting.',
        '  Page/section:',
        '  > p. 3, Section 2',
      ].join('\n'),
    });
    assert.equal(completePreview.ok, true);
    assert.equal(completePreview.uploadReview.status, 'text-ready');
    assert.equal(completePreview.uploadReview.blocksCitationWriting, false);
    assert.equal(completePreview.willWrite, false);
    assert.ok(completePreview.document.chunks > 0);
    assert.equal((await searchCorpus(projectRoot, 'Inspectable OCR PDF claims')).length, 0);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('indexProjectCorpus indexes complete manual evidence notes', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-complete-note-'));
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
        '- Year / venue: 2026 demo venue',
        '',
        '## Citable facts for writing',
        '- [x] Fact: Demo method improves grounded writing with visible retrieval evidence.',
        '  Evidence text: The paper reports that visible retrieval evidence helps writers verify grounded claims before drafting.',
        '  Page/section: p. 4, Section 3',
      ].join('\n'),
      'utf-8',
    );

    const index = await indexProjectCorpus(projectRoot);
    const document = index.documents.find(doc => doc.path === 'research_corpus/manual-note.md');
    assert.ok(document);
    assert.equal(document.contentQuality.status, 'usable');
    assert.ok(document.chunks > 0);
    const review = buildCorpusUploadReview(document);
    assert.equal(review.status, 'text-ready');
    assert.equal(review.blocksCitationWriting, false);
    const results = await searchCorpus(projectRoot, 'visible retrieval evidence verify grounded claims');
    assert.ok(results.length > 0);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('indexProjectCorpus accepts multiline OCR evidence fields in manual notes', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-multiline-note-'));
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

    const index = await indexProjectCorpus(projectRoot);
    const document = index.documents.find(doc => doc.path === 'research_corpus/manual-note.md');
    assert.ok(document);
    assert.equal(document.contentQuality.status, 'usable');
    assert.ok(document.chunks > 0);
    const review = buildCorpusUploadReview(document);
    assert.equal(review.status, 'text-ready');
    assert.equal(review.blocksCitationWriting, false);
    const results = await searchCorpus(projectRoot, 'visible retrieval evidence unsupported statements');
    assert.ok(results.length > 0);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('buildCorpusUploadReview explains scanned PDF recovery actions', () => {
  const originalOcrTools = process.env.PAPER_RAG_OCR_TOOLS;
  process.env.PAPER_RAG_OCR_TOOLS = 'none';
  const review = buildCorpusUploadReview({
    path: 'research_corpus/scanned.pdf',
    title: 'scanned.pdf',
    kind: 'binary',
    parseStatus: 'failed',
    parser: 'pdftotext',
    chunks: 0,
    extractedTextChars: 0,
    extractionError: 'PDF parser returned no extractable text',
  });

  assert.equal(review.status, 'failed');
  assert.equal(review.blocksCitationWriting, true);
  assert.equal(review.recovery.code, 'needs-ocr');
  assert.equal(review.recovery.preferredAction.type, 'upload-extracted-notes');
  assert.equal(review.recovery.ocrCapability.status, 'not-configured');
  assert.equal(review.recovery.ocrCapability.automaticRecoveryAvailable, false);
  assert.match(review.recovery.label_zh, /OCR/);
  assert.match(review.recovery.instruction_zh, /未检测到 OCRmyPDF/);
  assert.match(review.recovery.noteTemplate, /人工摘录文献笔记/);
  assert.match(review.recovery.noteTemplate, /Page\/section/);
  assert.match(review.copyText, /恢复诊断：PDF 可能是扫描版，需要 OCR/);
  assert.match(review.copyText, /OCR 能力：服务器未检测到 OCR 工具/);
  assert.match(review.copyText, /可复制 Markdown 文献笔记模板/);
  if (originalOcrTools === undefined) {
    delete process.env.PAPER_RAG_OCR_TOOLS;
  } else {
    process.env.PAPER_RAG_OCR_TOOLS = originalOcrTools;
  }
});

test('buildOcrCapability reports available OCR tooling with controlled automatic recovery', () => {
  const originalOcrTools = process.env.PAPER_RAG_OCR_TOOLS;
  process.env.PAPER_RAG_OCR_TOOLS = 'ocrmypdf,tesseract,pdftotext';
  const capability = buildOcrCapability();
  assert.equal(capability.status, 'tool-available');
  assert.equal(capability.serverCanRunOcr, true);
  assert.equal(capability.automaticRecoveryAvailable, true);
  assert.equal(capability.pdfTextExtractionAvailable, true);
  assert.ok(capability.tools.some(tool => tool.name === 'ocrmypdf' && tool.available));
  assert.ok(capability.tools.some(tool => tool.name === 'pdftotext' && tool.available));
  assert.match(capability.recoveryInstruction_zh, /受控 OCR 队列|ocr/i);
  if (originalOcrTools === undefined) {
    delete process.env.PAPER_RAG_OCR_TOOLS;
  } else {
    process.env.PAPER_RAG_OCR_TOOLS = originalOcrTools;
  }
});

test('buildOcrCapability reports missing pdftotext as incomplete PDF extraction tooling', () => {
  const originalOcrTools = process.env.PAPER_RAG_OCR_TOOLS;
  process.env.PAPER_RAG_OCR_TOOLS = 'ocrmypdf,tesseract';
  const capability = buildOcrCapability();
  assert.equal(capability.serverCanRunOcr, true);
  assert.equal(capability.pdfTextExtractionAvailable, false);
  assert.ok(capability.tools.some(tool => tool.name === 'pdftotext' && !tool.available));
  assert.match(capability.installHint_zh, /pdftotext|poppler-utils/);
  if (originalOcrTools === undefined) {
    delete process.env.PAPER_RAG_OCR_TOOLS;
  } else {
    process.env.PAPER_RAG_OCR_TOOLS = originalOcrTools;
  }
});

test('runOcrRecoveryJob imports OCR output without overwriting the source PDF', async () => {
  const originalOcrTools = process.env.PAPER_RAG_OCR_TOOLS;
  process.env.PAPER_RAG_OCR_TOOLS = 'ocrmypdf,tesseract';
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-run-ocr-'));
  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(path.join(projectRoot, 'research_corpus', 'scan.pdf'), Buffer.from('%PDF-1.4\n%%EOF'));
    await indexProjectCorpus(projectRoot);

    const created = await createOcrRecoveryJob(projectRoot, {
      sourceDocument: 'research_corpus/scan.pdf',
      reason: 'PDF parser returned no extractable text',
    });
    assert.equal(created.job.status, 'queued');
    assert.equal(created.job.nextAction.type, 'run-server-ocr');

    const result = await runOcrRecoveryJob(projectRoot, {
      jobId: created.job.id,
    }, {
      ocrRunner: async () => ({
        buffer: makeSimplePdfWithLiteralText('OCR recovered text supports grounded citation review'),
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.job.status, 'imported');
    assert.equal(result.document.path, 'research_corpus/scan.ocr.pdf');
    assert.notEqual(result.document.path, 'research_corpus/scan.pdf');
    assert.equal(result.uploadReview.blocksCitationWriting, false);
    assert.ok(result.document.chunks > 0);
    const results = await searchCorpus(projectRoot, 'OCR recovered grounded citation');
    assert.ok(results.length > 0);
    assert.equal(results[0].source.path, 'research_corpus/scan.ocr.pdf');
  } finally {
    if (originalOcrTools === undefined) {
      delete process.env.PAPER_RAG_OCR_TOOLS;
    } else {
      process.env.PAPER_RAG_OCR_TOOLS = originalOcrTools;
    }
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('runOcrRecoveryJob keeps jobs blocked when server OCR tooling is unavailable', async () => {
  const originalOcrTools = process.env.PAPER_RAG_OCR_TOOLS;
  process.env.PAPER_RAG_OCR_TOOLS = 'none';
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-run-ocr-blocked-'));
  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(path.join(projectRoot, 'research_corpus', 'scan.pdf'), Buffer.from('%PDF-1.4\n%%EOF'));
    await indexProjectCorpus(projectRoot);

    const created = await createOcrRecoveryJob(projectRoot, {
      sourceDocument: 'research_corpus/scan.pdf',
      reason: 'PDF parser returned no extractable text',
    });
    const result = await runOcrRecoveryJob(projectRoot, { jobId: created.job.id });
    assert.equal(result.ok, false);
    assert.equal(result.job.status, 'blocked-no-ocr-tool');
    assert.match(result.job.lastRun.error, /OCRmyPDF/);
    assert.equal((await searchCorpus(projectRoot, 'OCR recovered grounded citation')).length, 0);
  } finally {
    if (originalOcrTools === undefined) {
      delete process.env.PAPER_RAG_OCR_TOOLS;
    } else {
      process.env.PAPER_RAG_OCR_TOOLS = originalOcrTools;
    }
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('OCR recovery jobs persist blocked scanned PDFs and complete after checked text import', async () => {
  const originalOcrTools = process.env.PAPER_RAG_OCR_TOOLS;
  process.env.PAPER_RAG_OCR_TOOLS = 'none';
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-ocr-jobs-'));
  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(path.join(projectRoot, 'research_corpus', 'scan.pdf'), Buffer.from('%PDF-1.4\n%%EOF'));
    await indexProjectCorpus(projectRoot);

    const created = await createOcrRecoveryJob(projectRoot, {
      sourceDocument: 'research_corpus/scan.pdf',
      reason: 'PDF parser returned no extractable text',
    });
    assert.equal(created.ok, true);
    assert.equal(created.job.sourceDocument, 'research_corpus/scan.pdf');
    assert.equal(created.job.status, 'blocked-no-ocr-tool');
    assert.equal(created.job.blocksCitationWriting, true);
    assert.match(created.job.statusLabel_zh, /OCR/);
    assert.match(created.job.nextAction.instruction_zh, /后端预检|OCR/);
    assert.match(created.job.noteTemplate, /Citable facts for writing/);

    const listed = await listOcrRecoveryJobs(projectRoot);
    assert.equal(listed.summary.active, 1);
    assert.equal(listed.summary.blocksCitationWriting, true);
    assert.equal(listed.jobs[0].id, created.job.id);

    await importTextEvidenceDocument(projectRoot, {
      filename: 'scan.manual-notes.md',
      sourceDocument: 'research_corpus/scan.pdf',
      content: [
        '# scanned - 人工摘录文献笔记',
        '',
        '## Citable facts for writing',
        '- [x] Fact: Inspectable OCR evidence workflows help writers verify PDF claims before drafting.',
        '  Evidence text:',
        '  > Inspectable OCR evidence workflows help writers verify PDF claims before drafting.',
        '  Page/section:',
        '  > p. 3, Section 2',
      ].join('\n'),
    });

    const completed = await listOcrRecoveryJobs(projectRoot);
    assert.equal(completed.summary.active, 0);
    assert.equal(completed.summary.blocksCitationWriting, false);
    assert.equal(completed.jobs[0].status, 'imported');
    assert.equal(completed.jobs[0].importedDocumentPath, 'research_corpus/scan.manual-notes.md');
  } finally {
    if (originalOcrTools === undefined) {
      delete process.env.PAPER_RAG_OCR_TOOLS;
    } else {
      process.env.PAPER_RAG_OCR_TOOLS = originalOcrTools;
    }
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('buildExtractionRecovery classifies encrypted PDF failures', () => {
  const recovery = buildExtractionRecovery({
    path: 'research_corpus/locked.pdf',
    kind: 'binary',
    parseStatus: 'failed',
    parser: 'pypdf',
    extractionError: 'File has not been decrypted',
  }, 'failed');

  assert.equal(recovery.code, 'encrypted-pdf');
  assert.equal(recovery.blocksCitationWriting, true);
  assert.equal(recovery.preferredAction.type, 'replace-document');
  assert.match(recovery.instruction_zh, /未加密/);
  assert.match(recovery.noteTemplate, /Bibliographic metadata/);
});
