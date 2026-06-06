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
});