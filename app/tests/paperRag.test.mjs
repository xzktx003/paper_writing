import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  addCorpusDocument,
  buildRagContext,
  indexProjectCorpus,
  listCorpusDocuments,
  searchCorpus,
} from '../apps/backend/src/services/paperRagService.js';
import { buildRagMessages } from '../apps/backend/src/routes/ai.js';

describe('Paper RAG service', () => {
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
});
