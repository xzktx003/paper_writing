import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  addCorpusDocument,
  buildRagContext,
  getRagIndexHealth,
  indexProjectCorpus,
  listCorpusDocuments,
  searchExternalSources,
  searchCorpus,
  writeRagIndexAtomic,
} from '../apps/backend/src/services/paperRagService.js';
import { buildRagMessages } from '../apps/backend/src/routes/ai.js';

describe('Paper RAG service', () => {
  it('reports per-source external-search outcomes and comparable normalized ranking without hiding failures', async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes('semanticscholar')) {
        return new Response(JSON.stringify({
          data: [{
            title: 'Grounded retrieval',
            authors: [{ name: 'A. Researcher' }],
            year: 2025,
            venue: 'ACL',
            externalIds: { DOI: '10.1/example' },
            abstract: 'Evidence-grounded retrieval.',
            citationCount: 240,
            url: 'https://example.test/paper',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (String(url).includes('export.arxiv')) {
        throw Object.assign(new Error('socket unavailable'), { code: 'ECONNRESET' });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const response = await searchExternalSources('grounded retrieval', {
      sources: ['semantic-scholar', 'arxiv'],
      limit: 5,
      fetchImpl,
      now: (() => { let value = 1000; return () => value += 7; })(),
    });

    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      source: 'semantic-scholar',
      native_score: 240,
      normalized_score: 1,
      relevance_score: 1,
      score_basis: 'source-query-rank',
    });
    expect(response.sources).toEqual([
      expect.objectContaining({ id: 'semantic-scholar', status: 'ok', count: 1, latencyMs: expect.any(Number), error: '' }),
      expect.objectContaining({ id: 'arxiv', status: 'error', count: 0, latencyMs: expect.any(Number), error: 'ECONNRESET' }),
    ]);
  });

  it('indexes project corpus files and returns cited snippets for queries', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'paper-rag-'));
    try {
      await mkdir(join(projectRoot, 'docs'), { recursive: true });
      await writeFile(join(projectRoot, 'docs', 'retrieval.md'), [
        '# Retrieval augmented generation',
        '',
        'Graph neural retrieval improves citation grounding by matching claim context to evidence passages.',
        '',
        'The baseline language model often hallucinates citations when no corpus evidence is available.',
      ].join('\n'));

      const index = await indexProjectCorpus(projectRoot);
      expect(index.documents).toHaveLength(1);
      expect(index.chunks.length).toBeGreaterThan(0);
      expect(index.generation).toMatch(/^[0-9a-f-]{36}$/i);
      expect(index.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(index.retrieval).toEqual({
        kind: 'local-keyword-overlap',
        label: 'Local keyword evidence retrieval',
        semantic: false,
      });

      const health = await getRagIndexHealth(projectRoot);
      expect(health).toMatchObject({
        status: 'healthy',
        generation: index.generation,
        fingerprint: index.fingerprint,
        retrieval: { kind: 'local-keyword-overlap', semantic: false },
        counts: {
          files: 1,
          indexedFiles: 1,
          failedFiles: 0,
          zeroChunkFiles: 0,
        },
      });
      expect(health.counts.chunks).toBeGreaterThan(0);
      expect(health.documents[0]).toMatchObject({
        path: 'docs/retrieval.md',
        kind: 'text',
        parseStatus: 'indexed',
        chars: expect.any(Number),
        chunks: expect.any(Number),
        warnings: [],
      });

      const results = await searchCorpus(projectRoot, 'citation grounding evidence', { limit: 3 });
      expect(results[0].text).toContain('citation grounding');
      expect(results[0].source.path).toBe('docs/retrieval.md');
      expect(results[0].score).toBeGreaterThan(0);

      const context = await buildRagContext(projectRoot, 'Why use retrieval for citations?', { limit: 2 });
      expect(context).toContain('[1] docs/retrieval.md');
      expect(context).toContain('citation grounding');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('reports a missing index as degraded without creating or rebuilding it', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'paper-rag-health-missing-'));
    try {
      await mkdir(join(projectRoot, 'docs'), { recursive: true });
      await writeFile(join(projectRoot, 'docs', 'not-indexed.md'), 'This file must not be indexed by a health read.');

      const before = await readdir(projectRoot);
      const health = await getRagIndexHealth(projectRoot);
      const after = await readdir(projectRoot);

      expect(health).toMatchObject({
        status: 'degraded',
        generation: '',
        fingerprint: '',
        counts: { files: 0, indexedFiles: 0, failedFiles: 0, zeroChunkFiles: 0, chunks: 0 },
      });
      expect(health.issues).toContainEqual(expect.objectContaining({ code: 'index-missing' }));
      expect(after).toEqual(before);
      await expect(readFile(join(projectRoot, '.openprism', 'paper-rag-index.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('reports a corrupt index without quarantining or rebuilding it during a health read', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'paper-rag-health-corrupt-'));
    const indexDir = join(projectRoot, '.openprism');
    const indexPath = join(indexDir, 'paper-rag-index.json');
    try {
      await mkdir(indexDir, { recursive: true });
      await writeFile(indexPath, '{broken');

      const before = await readdir(indexDir);
      const health = await getRagIndexHealth(projectRoot);
      const after = await readdir(indexDir);

      expect(health.status).toBe('corrupt');
      expect(health.issues).toContainEqual(expect.objectContaining({ code: 'index-corrupt' }));
      expect(after).toEqual(before);
      expect(await readFile(indexPath, 'utf8')).toBe('{broken');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('changes generation while preserving the fingerprint for an unchanged corpus rebuild', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'paper-rag-generation-'));
    try {
      await mkdir(join(projectRoot, 'docs'), { recursive: true });
      await writeFile(join(projectRoot, 'docs', 'stable.md'), 'Stable evidence content must produce a stable corpus fingerprint.');

      const first = await indexProjectCorpus(projectRoot);
      const second = await indexProjectCorpus(projectRoot);

      expect(second.generation).not.toBe(first.generation);
      expect(second.fingerprint).toBe(first.fingerprint);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('reports failed and zero-chunk documents separately', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'paper-rag-health-files-'));
    try {
      await mkdir(join(projectRoot, 'research_corpus'), { recursive: true });
      await writeFile(join(projectRoot, 'research_corpus', 'empty.md'), '');
      await writeFile(join(projectRoot, 'research_corpus', 'broken.pdf'), Buffer.from('%PDF-1.4\n%%EOF'));
      await writeFile(join(projectRoot, 'research_corpus', 'broken.pdf.rag.json'), JSON.stringify({
        parseStatus: 'failed',
        parser: 'pdf-text-extraction',
        extractedTextChars: 0,
        error: 'No extractable PDF text',
        warnings: ['OCR required'],
      }));

      await indexProjectCorpus(projectRoot);
      const health = await getRagIndexHealth(projectRoot);

      expect(health.status).toBe('degraded');
      expect(health.counts).toMatchObject({
        files: 2,
        indexedFiles: 0,
        failedFiles: 1,
        zeroChunkFiles: 1,
        chunks: 0,
      });
      expect(health.documents).toContainEqual(expect.objectContaining({
        path: 'research_corpus/broken.pdf',
        parser: 'pdf-text-extraction',
        parseStatus: 'failed',
        error: 'No extractable PDF text',
        warnings: ['OCR required'],
      }));
      expect(health.documents).toContainEqual(expect.objectContaining({
        path: 'research_corpus/empty.md',
        parseStatus: 'indexed',
        chunks: 0,
      }));
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('adds uploaded text documents into a managed research corpus', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'paper-rag-add-'));
    try {
      const doc = await addCorpusDocument(projectRoot, {
        filename: 'claim-audit.md',
        content: 'Claim-level audit links each paper claim to source snippets and page anchors.',
      });

      expect(doc.path).toBe('research_corpus/claim-audit.md');
      const documents = await listCorpusDocuments(projectRoot);
      expect(documents).toContainEqual(expect.objectContaining({ path: 'research_corpus/claim-audit.md' }));

      const results = await searchCorpus(projectRoot, 'page anchors claim audit', { limit: 1 });
      expect(results[0].source.path).toBe('research_corpus/claim-audit.md');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('retrieves only selected conversation documents and disables RAG after deselection', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'paper-rag-selected-'));
    try {
      await addCorpusDocument(projectRoot, {
        filename: 'spectral.md',
        content: 'Transformer pruning calibration uses a spectral reconstruction objective.',
      });
      await addCorpusDocument(projectRoot, {
        filename: 'random.md',
        content: 'Transformer pruning calibration uses a random reconstruction baseline.',
      });

      const selected = await buildRagMessages(projectRoot, '请解读random量化方法', {
        rag: { enabled: true, docPaths: ['research_corpus/random.md'], limit: 5 },
      });
      expect(selected.evidence.context).toContain('random reconstruction baseline');
      expect(selected.evidence.context).not.toContain('spectral reconstruction objective');

      const fallback = await buildRagMessages(projectRoot, '你能看到我选中的RAG文档吗？', {
        rag: { enabled: true, docPaths: ['research_corpus/random.md'], limit: 5 },
      });
      expect(fallback.evidence.context).toContain('random reconstruction baseline');

      const deselected = await buildRagMessages(projectRoot, '这篇论文的校准方法是什么？', {
        rag: { enabled: false, docPaths: [] },
      });
      expect(deselected.evidence.context).toBe('');
      expect(deselected.messages).toEqual([]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('quarantines a corrupt index and rebuilds it from the current corpus', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'paper-rag-corrupt-'));
    try {
      await mkdir(join(projectRoot, 'docs'), { recursive: true });
      await mkdir(join(projectRoot, '.openprism'), { recursive: true });
      await writeFile(
        join(projectRoot, 'docs', 'grounding.md'),
        'Evidence grounding connects paper claims with source passages.',
      );
      await writeFile(join(projectRoot, '.openprism', 'paper-rag-index.json'), '{broken');

      const results = await searchCorpus(projectRoot, 'evidence grounding source passages');

      expect(results[0]).toEqual(expect.objectContaining({
        source: expect.objectContaining({ path: 'docs/grounding.md' }),
      }));
      const rebuilt = JSON.parse(await readFile(join(projectRoot, '.openprism', 'paper-rag-index.json'), 'utf8'));
      expect(rebuilt.documents).toContainEqual(expect.objectContaining({ path: 'docs/grounding.md' }));
      const indexFiles = await readdir(join(projectRoot, '.openprism'));
      expect(indexFiles.some(name => name.startsWith('paper-rag-index.json.corrupt-'))).toBe(true);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('keeps the previous readable index when atomic replacement fails', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'paper-rag-atomic-'));
    const indexDir = join(projectRoot, '.openprism');
    const indexPath = join(indexDir, 'paper-rag-index.json');
    try {
      await mkdir(indexDir, { recursive: true });
      const previous = { version: 1, indexedAt: 'previous', documents: [], chunks: [] };
      await writeFile(indexPath, JSON.stringify(previous), 'utf8');

      await expect(writeRagIndexAtomic(indexPath, {
        version: 1,
        indexedAt: 'replacement',
        documents: [{ path: 'docs/new.md' }],
        chunks: [],
      }, {
        writeFile,
        rename: async () => { throw Object.assign(new Error('injected rename failure'), { code: 'EIO' }); },
        rm,
      })).rejects.toThrow('injected rename failure');

      expect(JSON.parse(await readFile(indexPath, 'utf8'))).toEqual(previous);
      expect((await readdir(indexDir)).filter(name => name.endsWith('.tmp'))).toEqual([]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('serializes concurrent corpus additions without losing indexed documents', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'paper-rag-concurrent-'));
    try {
      await Promise.all(Array.from({ length: 8 }, (_, index) => addCorpusDocument(projectRoot, {
        filename: `evidence-${index}.md`,
        content: `Concurrent evidence document ${index} preserves a unique claim marker-${index}.`,
      })));

      const documents = await listCorpusDocuments(projectRoot);
      expect(documents.filter(document => document.path.startsWith('research_corpus/evidence-'))).toHaveLength(8);
      for (let index = 0; index < 8; index += 1) {
        expect(documents).toContainEqual(expect.objectContaining({
          path: `research_corpus/evidence-${index}.md`,
        }));
      }
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
