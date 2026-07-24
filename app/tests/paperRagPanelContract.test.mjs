import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

import { PaperRagPanel } from '../apps/frontend/src/app/components/PaperRagPanel.tsx';
import { getRagHealth, indexRagCorpus, searchExternalSources, searchRagCorpus } from '../apps/frontend/src/app/api/paperRagApi.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PaperRagPanel indexing contract', () => {
  it('explains automatic indexing without presenting a redundant manual index action', async () => {
    const html = renderToStaticMarkup(
      React.createElement(PaperRagPanel, { projectPath: '__paper_agent__:demo' }),
    );

    expect(html).toContain('Documents are indexed automatically');
    expect(html).not.toContain('Index corpus');
    expect(html).not.toContain('No indexed documents yet.');
    expect(html).toContain('Local keyword evidence retrieval');
    expect(html).toContain('not semantic vector retrieval');
    expect(html).toContain('Repair / rebuild index');
    expect(html).toContain('RAG index health');
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/PaperRagPanel.tsx'), 'utf8');
    expect(source).toContain('data-testid="rag-upload-status"');
    expect(source).toContain('uploadStatusKind');
    expect(source).not.toContain("uploadStatus.startsWith('Uploaded')");
  });

  it('uses the backend index and search route contracts', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        documents: 2,
        chunks: 4,
        indexedAt: '2026-07-22T00:00:00.000Z',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'healthy',
        retrieval: { kind: 'local-keyword-overlap', label: 'Local keyword evidence retrieval', semantic: false },
        generation: 'generation-1',
        fingerprint: 'a'.repeat(64),
        indexedAt: '2026-07-22T00:00:00.000Z',
        counts: { files: 2, indexedFiles: 2, failedFiles: 0, zeroChunkFiles: 0, chunks: 4 },
        documents: [],
        issues: [],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await indexRagCorpus('demo');
    await searchRagCorpus('demo', 'citation evidence', 7);
    await getRagHealth('demo');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/projects/demo/rag/index', expect.objectContaining({
      method: 'POST',
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/projects/demo/rag/search?q=citation%20evidence&limit=7',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/projects/demo/rag/health', expect.any(Object));
  });

  it('preserves per-source external search status returned by the backend', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const payload = {
      results: [],
      sources: [{ id: 'arxiv', status: 'error', latencyMs: 8000, count: 0, error: 'HTTP_503' }],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchExternalSources('demo', 'retrieval', { sources: 'arxiv', limit: 4 })).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/demo/rag/external-search?q=retrieval&sources=arxiv&limit=4',
      expect.any(Object),
    );
  });
});
