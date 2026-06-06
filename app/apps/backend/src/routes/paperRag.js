import { getProjectRoot as findProjectRoot } from '../services/projectService.js';
import {
  addCorpusDocument,
  buildRagContext,
  indexProjectCorpus,
  listCorpusDocuments,
  searchCorpus,
  deleteCorpusDocument,
  searchExternalSources,
} from '../services/paperRagService.js';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { safeJoin } from '../utils/pathSecurity.js';

const CORPUS_DIR = 'research_corpus';

export function registerPaperRagRoutes(fastify) {
  /* ── Documents ──────────────────────────────────────────────── */

  fastify.get('/api/projects/:id/rag/documents', async (request) => {
    const projectRoot = await findProjectRoot(request.params.id);
    return { documents: await listCorpusDocuments(projectRoot) };
  });

  fastify.post('/api/projects/:id/rag/documents', async (request) => {
    const projectRoot = await findProjectRoot(request.params.id);
    const document = await addCorpusDocument(projectRoot, request.body || {});
    return { ok: true, document };
  });

  fastify.delete('/api/projects/:id/rag/documents', async (request) => {
    const projectRoot = await findProjectRoot(request.params.id);
    const docPath = request.query.path || '';
    if (!docPath) return { error: 'Query parameter "path" is required' };
    const decodedPath = decodeURIComponent(docPath);
    const result = await deleteCorpusDocument(projectRoot, decodedPath);
    return result;
  });

  /* ── Index ──────────────────────────────────────────────────── */

  fastify.post('/api/projects/:id/rag/index', async (request) => {
    const projectRoot = await findProjectRoot(request.params.id);
    const index = await indexProjectCorpus(projectRoot);
    return { ok: true, documents: index.documents.length, chunks: index.chunks.length, indexedAt: index.indexedAt };
  });

  /* ── Search ─────────────────────────────────────────────────── */

  fastify.get('/api/projects/:id/rag/search', async (request) => {
    const projectRoot = await findProjectRoot(request.params.id);
    const results = await searchCorpus(projectRoot, request.query.q || '', { limit: request.query.limit });
    return { results };
  });

  fastify.post('/api/projects/:id/rag/context', async (request) => {
    const projectRoot = await findProjectRoot(request.params.id);
    const context = await buildRagContext(projectRoot, request.body?.query || '', { limit: request.body?.limit });
    return { context };
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
    const projectRoot = await findProjectRoot(request.params.id);
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const buffer = await data.toBuffer();
    const originalName = data.filename;
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
      return { ok: true, document: result };
    }

    if (supportedDocExts.includes(ext)) {
      // Binary document – save to corpus and try to extract text for indexing
      const target = safeJoin(corpusRoot, originalName);
      await writeFile(target, buffer);

      // Save a .md with filename metadata for indexing
      const mdName = originalName + '.md';
      const mdTarget = safeJoin(corpusRoot, mdName);
      const meta = [
        `# ${originalName}\n`,
        `> Uploaded document: ${originalName} (${(buffer.length / 1024).toFixed(1)} KB)\n`,
        `> MIME type: ${data.mimetype || 'application/octet-stream'}\n`,
        `> For full text extraction, use the "Re-index" button after processing.\n`,
      ].join('\n');
      await writeFile(mdTarget, meta, 'utf-8');

      // Re-index to include the new files
      const index = await indexProjectCorpus(projectRoot);
      const doc = index.documents.find(d => d.path === `${CORPUS_DIR}/${mdName}`)
        || index.documents.find(d => d.path === `${CORPUS_DIR}/${originalName}`);

      return { ok: true, document: doc || { path: `${CORPUS_DIR}/${originalName}` }, note: 'Binary document saved. Text indexing requires a document parser.' };
    }

    return reply.code(400).send({
      error: `Unsupported file type: .${ext}. Supported: ${[...supportedTextExts, ...supportedDocExts].join(', ')}`
    });
  });
}