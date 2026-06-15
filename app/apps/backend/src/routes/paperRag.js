import { getProjectRoot as findProjectRoot } from '../services/projectService.js';
import {
  addCorpusDocument,
  buildRagEvidence,
  indexProjectCorpus,
  listCorpusDocuments,
  searchCorpus,
  deleteCorpusDocument,
  searchExternalSources,
  buildCorpusUploadReview,
  importTextEvidenceDocument,
  createOcrRecoveryJob,
  listOcrRecoveryJobs,
  runOcrRecoveryJob,
  previewTextEvidenceImport,
  saveBinaryCorpusDocument,
} from '../services/paperRagService.js';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { safeJoin } from '../utils/pathSecurity.js';
import { sanitizeUploadPath } from '../utils/pathSecurity.js';
 
const CORPUS_DIR = 'research_corpus';
 
export function registerPaperRagRoutes(fastify, options = {}) {
  const resolveProjectRoot = options.resolveProjectRoot || findProjectRoot;
  /* ── Documents ──────────────────────────────────────────────── */
 
  fastify.get('/api/projects/:id/rag/documents', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    return { documents: await listCorpusDocuments(projectRoot) };
  });
 
  fastify.post('/api/projects/:id/rag/documents', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const document = await addCorpusDocument(projectRoot, request.body || {});
    return { ok: true, document };
  });
 
  fastify.delete('/api/projects/:id/rag/documents', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const docPath = request.query.path || '';
    if (!docPath) return { error: 'Query parameter "path" is required' };
    const decodedPath = decodeURIComponent(docPath);
    const result = await deleteCorpusDocument(projectRoot, decodedPath);
    return result;
  });
 
  /* ── Index ──────────────────────────────────────────────────── */
 
  fastify.post('/api/projects/:id/rag/index', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const index = await indexProjectCorpus(projectRoot);
    return { ok: true, documents: index.documents.length, chunks: index.chunks.length, indexedAt: index.indexedAt };
  });
 
  /* ── Search ─────────────────────────────────────────────────── */
 
  fastify.get('/api/projects/:id/rag/search', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const results = await searchCorpus(projectRoot, request.query.q || '', { limit: request.query.limit });
    return { results };
  });
 
  fastify.post('/api/projects/:id/rag/context', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const evidence = await buildRagEvidence(projectRoot, request.body?.query || '', { limit: request.body?.limit });
    return { context: evidence.context, evidence };
  });
 
  /* ── External Search ────────────────────────────────────────── */
 
  fastify.get('/api/projects/:id/rag/external-search', async (request) => {
    const q = request.query.q || '';
    const sources = (request.query.sources || 'semantic-scholar,arxiv').split(',').map(s => s.trim()).filter(Boolean);
    const limit = Math.min(Number(request.query.limit || 5), 20);
    if (!q) return { results: [] };
    const results = await searchExternalSources(q, { sources, limit });
    return { results };
  });
 
  /* ── File Upload (PDF/Office/Images) ────────────────────────── */
 
  fastify.post('/api/projects/:id/rag/upload', async (request, reply) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }
 
    const buffer = await data.toBuffer();
    const originalName = sanitizeUploadPath(data.filename).split('/').pop();
    if (!originalName) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }
    const ext = originalName.split('.').pop()?.toLowerCase() || '';
    const supportedTextExts = ['md', 'markdown', 'txt', 'tex', 'bib', 'json', 'csv', 'xml', 'html', 'yaml', 'yml'];
    const supportedDocExts = ['pdf', 'docx', 'doc', 'pptx', 'xlsx'];
 
    const corpusRoot = safeJoin(projectRoot, CORPUS_DIR);
    await mkdir(corpusRoot, { recursive: true });
 
    if (supportedTextExts.includes(ext)) {
      // Plain text file – write directly
      const content = buffer.toString('utf-8');
      const target = safeJoin(corpusRoot, originalName);
      await writeFile(target, content, 'utf-8');
      const result = await addCorpusDocument(projectRoot, { filename: originalName, content });
      return { ok: true, document: result, uploadReview: buildCorpusUploadReview(result) };
    }
 
    if (supportedDocExts.includes(ext)) {
      const document = await saveBinaryCorpusDocument(projectRoot, {
        filename: originalName,
        buffer,
        mimetype: data.mimetype,
      });
      const note = document.parseStatus === 'parsed'
        ? 'Document text extracted and indexed.'
        : 'Document saved, but full text was not indexed. Check parseStatus and extractionError.';
      return { ok: true, document, note, uploadReview: buildCorpusUploadReview(document) };
    }
 
    return reply.code(400).send({
      error: `Unsupported file type: .${ext}. Supported: ${[...supportedTextExts, ...supportedDocExts].join(', ')}`
    });
  });

  fastify.post('/api/projects/:id/rag/text-import', async (request, reply) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    try {
      const result = await importTextEvidenceDocument(projectRoot, request.body || {});
      return { ok: true, ...result };
    } catch (error) {
      return reply.code(error.statusCode || 400).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  fastify.post('/api/projects/:id/rag/text-import/preview', async (request, reply) => {
    try {
      return previewTextEvidenceImport(request.body || {});
    } catch (error) {
      return reply.code(error.statusCode || 400).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  fastify.get('/api/projects/:id/rag/ocr-jobs', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    return listOcrRecoveryJobs(projectRoot);
  });

  fastify.post('/api/projects/:id/rag/ocr-jobs', async (request, reply) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    try {
      return createOcrRecoveryJob(projectRoot, request.body || {});
    } catch (error) {
      return reply.code(error.statusCode || 400).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  fastify.post('/api/projects/:id/rag/ocr-jobs/run', async (request, reply) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    try {
      return runOcrRecoveryJob(projectRoot, request.body || {}, {
        ocrRunner: options.ocrRunner,
      });
    } catch (error) {
      return reply.code(error.statusCode || 400).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
