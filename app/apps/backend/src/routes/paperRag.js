import { getProjectRoot as findProjectRoot } from '../services/projectLocator.js';
import {
  addCorpusDocument,
  buildRagEvidence,
  getRagIndexHealth,
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
  listDocumentFigures,
  extractFigureImage,
  describeFigureWithVision,
  modelSupportsVision,
  testVisionSupport,
  findFigurePage,
} from '../services/paperRagService.js';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { safeJoin } from '../utils/pathSecurity.js';
import { sanitizeUploadPath } from '../utils/pathSecurity.js';

const CORPUS_DIR = 'research_corpus';

export function resolveVisionLlmConfig(appConfig = {}, env = process.env, modelOverride = '') {
  return {
    baseUrl: appConfig.llm_base_url || env.OPENPRISM_LLM_BASE_URL,
    apiKey: appConfig.llm_api_key || env.OPENPRISM_LLM_API_KEY,
    model: modelOverride || appConfig.llm_model || env.OPENPRISM_LLM_MODEL || '',
  };
}

export function registerPaperRagRoutes(fastify, options = {}) {
  const resolveProjectRoot = options.resolveProjectRoot || findProjectRoot;
  const getAppConfig = options.getAppConfig || (() => options.appConfig || fastify.appConfig || {});
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

  fastify.post('/api/projects/:id/rag/index', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const index = await indexProjectCorpus(projectRoot);
    return {
      ok: true,
      documents: index.documents.length,
      chunks: index.chunks.length,
      indexedAt: index.indexedAt,
      generation: index.generation,
      fingerprint: index.fingerprint,
      retrieval: index.retrieval,
    };
  });

  fastify.get('/api/projects/:id/rag/health', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    return getRagIndexHealth(projectRoot);
  });

  fastify.get('/api/projects/:id/rag/search', async (request, reply) => {
    const query = String(request.query.q || '').trim();
    if (!query) {
      return reply.code(400).send({ error: 'Query parameter "q" is required' });
    }
    const projectRoot = await resolveProjectRoot(request.params.id);
    const limit = Math.min(Math.max(Number(request.query.limit || 5) || 5, 1), 20);
    const results = await searchCorpus(projectRoot, query, { limit });
    return { results };
  });
 
  /* ── Figures ────────────────────────────────────────────────── */

  fastify.get('/api/projects/:id/rag/documents/:docPath/figures', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const docPath = decodeURIComponent(request.params.docPath || '');
    if (!docPath) return { figures: [], error: 'Document path is required' };
    const figures = await listDocumentFigures(projectRoot, docPath);
    return figures;
  });

  // Extract and describe a specific figure using vision model
  fastify.post('/api/projects/:id/rag/figure/describe', async (request, reply) => {
    const { docPath, page, figureIndex, context, figureNum } = request.body || {};
    
    if (!docPath) {
      return reply.code(400).send({ 
        error: 'Missing required field: docPath' 
      });
    }
    
    const projectRoot = await resolveProjectRoot(request.params.id);
    
    // Auto-find the page if figureNum is provided but page is not
    let resolvedPage = page;
    let resolvedFigureIndex = figureIndex;
    
    if (figureNum !== undefined && (page === undefined || page === null)) {
      const findResult = await findFigurePage(projectRoot, docPath, figureNum);
      if (findResult.error) {
        return reply.code(404).send({ 
          error: findResult.error,
          suggestions: findResult.suggestions || [],
          totalPages: findResult.totalPages
        });
      }
      resolvedPage = findResult.page;
      resolvedFigureIndex = findResult.figureIndex;
    } else if (page === undefined || figureIndex === undefined) {
      return reply.code(400).send({ 
        error: 'Missing required fields: provide either (page + figureIndex) or figureNum',
        hint: 'Use figureNum to auto-search, or provide both page and figureIndex'
      });
    }
    
    // Get LLM config from app config
    const llmConfig = resolveVisionLlmConfig(getAppConfig(), process.env);
    
    // Check if model supports vision
    if (!modelSupportsVision(llmConfig.model)) {
      return reply.code(400).send({ 
        error: 'Current model does not support vision',
        hint: 'This feature requires a vision-capable model like GPT-4o, Claude-3.5-Sonnet, or Gemini. Please switch to a multimodal model.',
        model: llmConfig.model,
        supported: false
      });
    }
    
    // Extract the figure image
    const extractResult = await extractFigureImage(projectRoot, docPath, resolvedPage, resolvedFigureIndex);
    if (extractResult.error) {
      return reply.code(400).send({ 
        error: `Failed to extract figure: ${extractResult.error}` 
      });
    }
    
    // Get the image description using vision model
    const descResult = await describeFigureWithVision(llmConfig, extractResult.base64, context);
    if (descResult.error) {
      return reply.code(500).send({ 
        error: descResult.error,
        hint: descResult.hint 
      });
    }
    
    return {
      success: true,
      foundPage: resolvedPage,
      image: {
        width: extractResult.width,
        height: extractResult.height,
        format: extractResult.format,
        size: extractResult.size,
      },
      description: descResult.description
    };
  });

  // Check if current model supports vision - actually tests the model
  fastify.get('/api/llm/vision-capable', async (request, reply) => {
    const llmConfig = resolveVisionLlmConfig(getAppConfig(), process.env, request.query.model || '');
    const model = llmConfig.model;
    
    // Check if model name suggests vision capability (as hint)
    const nameSuggestsVision = modelSupportsVision(model);
    
    // Actually test the model with a vision request (always test, don't rely on name alone)
    try {
      const result = await testVisionSupport(llmConfig);
      
      return {
        model,
        supported: result.supported,
        reason: result.reason,
        tested: true,
        nameSuggestsVision,
        supportedModels: [
          'GPT-4o / GPT-4o-mini',
          'Claude-3.5-Sonnet / Claude-3.5-Haiku',
          'Claude-3 Opus / Claude-3 Sonnet',
          'Gemini-1.5-Pro / Gemini-1.5-Flash',
        ]
      };
    } catch (error) {
      return {
        model,
        supported: false,
        reason: `Test failed: ${error.message}`,
        tested: true,
        nameSuggestsVision,
        supportedModels: [
          'GPT-4o / GPT-4o-mini',
          'Claude-3.5-Sonnet / Claude-3.5-Haiku',
          'Claude-3 Opus / Claude-3 Sonnet',
          'Gemini-1.5-Pro / Gemini-1.5-Flash',
        ]
      };
    }
  });

 
  fastify.post('/api/projects/:id/rag/context', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const { query, limit, docPaths } = request.body || {};
    const evidence = await buildRagEvidence(projectRoot, query || '', { limit, docPaths });
    return { context: evidence.context, evidence };
  });
 
  /* ── External Search ────────────────────────────────────────── */
 
  fastify.get('/api/projects/:id/rag/external-search', async (request) => {
    const q = request.query.q || '';
    const sources = (request.query.sources || 'semantic-scholar,arxiv').split(',').map(s => s.trim()).filter(Boolean);
    const limit = Math.min(Number(request.query.limit || 5), 20);
    if (!q) return { results: [], sources: [] };
    return await searchExternalSources(q, { sources, limit });
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
