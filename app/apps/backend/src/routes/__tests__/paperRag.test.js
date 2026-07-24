import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

import { registerPaperRagRoutes } from '../paperRag.js';

test('POST /api/projects/:id/rag/index rebuilds the corpus and reports its summary', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-route-index-'));
  await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
  await writeFile(
    path.join(projectRoot, 'research_corpus', 'index-route.md'),
    'Route-level indexing keeps retrieval contracts executable.',
  );
  const app = Fastify({ logger: false });
  registerPaperRagRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/rag/index',
      payload: {},
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.ok, true);
    assert.equal(body.documents, 1);
    assert.ok(body.chunks > 0);
    assert.match(body.indexedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(body.generation, /^[0-9a-f-]{36}$/i);
    assert.match(body.fingerprint, /^[0-9a-f]{64}$/);
    assert.deepEqual(body.retrieval, {
      kind: 'local-keyword-overlap',
      label: 'Local keyword evidence retrieval',
      semantic: false,
    });
  } finally {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('GET /api/projects/:id/rag/health exposes read-only index diagnostics', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-route-health-'));
  await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
  await writeFile(
    path.join(projectRoot, 'research_corpus', 'health-route.md'),
    'Health diagnostics expose the exact local retrieval generation and indexed chunks.',
  );
  const app = Fastify({ logger: false });
  registerPaperRagRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
  });

  try {
    await app.inject({ method: 'POST', url: '/api/projects/demo/rag/index', payload: {} });
    const response = await app.inject({ method: 'GET', url: '/api/projects/demo/rag/health' });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.status, 'healthy');
    assert.equal(body.retrieval.kind, 'local-keyword-overlap');
    assert.equal(body.retrieval.semantic, false);
    assert.equal(body.counts.files, 1);
    assert.ok(body.counts.chunks > 0);
    assert.equal(body.documents[0].path, 'research_corpus/health-route.md');
    assert.equal(body.documents[0].parseStatus, 'indexed');
    assert.ok(body.documents[0].chunks > 0);
  } finally {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('GET /api/projects/:id/rag/search returns matching evidence and validates the query', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-route-search-'));
  await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
  await writeFile(
    path.join(projectRoot, 'research_corpus', 'search-route.md'),
    'The unique heliotropic retrieval token proves the HTTP search route works.',
  );
  const app = Fastify({ logger: false });
  registerPaperRagRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/demo/rag/search?q=heliotropic&limit=3',
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].source.path, 'research_corpus/search-route.md');
    assert.match(body.results[0].text, /heliotropic/);

    const missingQuery = await app.inject({
      method: 'GET',
      url: '/api/projects/demo/rag/search',
    });
    assert.equal(missingQuery.statusCode, 400);
    assert.deepEqual(JSON.parse(missingQuery.payload), {
      error: 'Query parameter "q" is required',
    });
  } finally {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});

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

test('POST /api/projects/:id/rag/text-import imports checked OCR/manual notes', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-route-text-import-'));
  const app = Fastify({ logger: false });
  registerPaperRagRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/rag/text-import',
      payload: {
        filename: '../scan-notes.md',
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
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.ok, true);
    assert.equal(body.document.path, 'research_corpus/scan-notes.md');
    assert.equal(body.uploadReview.status, 'text-ready');
    assert.equal(body.uploadReview.blocksCitationWriting, false);
    assert.ok(body.uploadReview.copyText.includes('RAG 上传诊断'));
  } finally {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('POST /api/projects/:id/rag/ocr-jobs/run imports OCR output through the route', async () => {
  const originalOcrTools = process.env.PAPER_RAG_OCR_TOOLS;
  process.env.PAPER_RAG_OCR_TOOLS = 'ocrmypdf,tesseract';
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-route-run-ocr-'));
  await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
  await writeFile(path.join(projectRoot, 'research_corpus', 'scan.pdf'), Buffer.from('%PDF-1.4\n%%EOF'));
  const app = Fastify({ logger: false });
  registerPaperRagRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
    ocrRunner: async () => ({
      buffer: makeSimplePdfWithLiteralText('Route OCR recovered text supports claim review'),
    }),
  });

  try {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/rag/ocr-jobs',
      payload: {
        sourceDocument: 'research_corpus/scan.pdf',
        reason: 'PDF parser returned no extractable text',
      },
    });
    const created = JSON.parse(createResponse.payload);
    assert.equal(created.job.status, 'queued');

    const runResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/rag/ocr-jobs/run',
      payload: {
        jobId: created.job.id,
      },
    });
    assert.equal(runResponse.statusCode, 200);
    const body = JSON.parse(runResponse.payload);
    assert.equal(body.ok, true);
    assert.equal(body.job.status, 'imported');
    assert.equal(body.document.path, 'research_corpus/scan.ocr.pdf');
    assert.equal(body.uploadReview.blocksCitationWriting, false);
  } finally {
    await app.close();
    if (originalOcrTools === undefined) {
      delete process.env.PAPER_RAG_OCR_TOOLS;
    } else {
      process.env.PAPER_RAG_OCR_TOOLS = originalOcrTools;
    }
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('POST /api/projects/:id/rag/text-import/preview returns dry-run quality gate', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-route-text-preview-'));
  const app = Fastify({ logger: false });
  registerPaperRagRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/rag/text-import/preview',
      payload: {
        filename: '../scan-notes.md',
        sourceDocument: 'research_corpus/scan.pdf',
        content: [
          '# scanned - 人工摘录文献笔记',
          '',
          '## Citable facts for writing',
          '- [ ] Fact: ',
          '  Evidence text: ',
          '  Page/section: ',
        ].join('\n'),
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.ok, false);
    assert.equal(body.willWrite, false);
    assert.equal(body.document.path, 'research_corpus/scan-notes.md');
    assert.equal(body.uploadReview.status, 'template-empty');
    assert.equal(body.uploadReview.blocksCitationWriting, true);
  } finally {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('POST and GET /api/projects/:id/rag/ocr-jobs manage PDF recovery queue', async () => {
  const originalOcrTools = process.env.PAPER_RAG_OCR_TOOLS;
  process.env.PAPER_RAG_OCR_TOOLS = 'none';
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-rag-route-ocr-jobs-'));
  await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
  await writeFile(path.join(projectRoot, 'research_corpus', 'scan.pdf'), Buffer.from('%PDF-1.4\n%%EOF'));
  const app = Fastify({ logger: false });
  registerPaperRagRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
  });

  try {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/rag/ocr-jobs',
      payload: {
        sourceDocument: 'research_corpus/scan.pdf',
        reason: 'PDF parser returned no extractable text',
      },
    });

    assert.equal(createResponse.statusCode, 200);
    const created = JSON.parse(createResponse.payload);
    assert.equal(created.ok, true);
    assert.equal(created.job.sourceDocument, 'research_corpus/scan.pdf');
    assert.equal(created.job.status, 'blocked-no-ocr-tool');
    assert.equal(created.job.ocrCapability.automaticRecoveryAvailable, false);

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/projects/demo/rag/ocr-jobs',
    });
    assert.equal(listResponse.statusCode, 200);
    const listed = JSON.parse(listResponse.payload);
    assert.equal(listed.summary.active, 1);
    assert.equal(listed.jobs[0].id, created.job.id);

    const importResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/rag/text-import',
      payload: {
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
      },
    });
    assert.equal(importResponse.statusCode, 200);

    const completedResponse = await app.inject({
      method: 'GET',
      url: '/api/projects/demo/rag/ocr-jobs',
    });
    const completed = JSON.parse(completedResponse.payload);
    assert.equal(completed.summary.active, 0);
    assert.equal(completed.jobs[0].status, 'imported');
  } finally {
    await app.close();
    if (originalOcrTools === undefined) {
      delete process.env.PAPER_RAG_OCR_TOOLS;
    } else {
      process.env.PAPER_RAG_OCR_TOOLS = originalOcrTools;
    }
    await rm(projectRoot, { recursive: true, force: true });
  }
});
