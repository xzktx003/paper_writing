import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

import { buildRagMessages, buildRagResponseFields } from '../ai.js';
import { indexProjectCorpus } from '../../services/paperRagService.js';

test('buildRagMessages injects RAG usage guidance with retrieved evidence', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-ai-rag-'));
  try {
    await mkdir(path.join(projectRoot, 'research_corpus'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'research_corpus', 'related-work.md'),
      [
        '# Related Work',
        '',
        'Inspectable RAG workflows help writers verify evidence snippets before drafting related work.',
      ].join('\n'),
      'utf-8',
    );
    await indexProjectCorpus(projectRoot);

    const ragResult = await buildRagMessages(projectRoot, 'inspectable RAG related work', {
      rag: { enabled: true, limit: 3 },
    });

    assert.equal(ragResult.evidence.results.length, 1);
    assert.match(ragResult.usageGuidance, /RAG usage rules/);
    assert.match(ragResult.usageGuidance, /Do not infer authors/);
    assert.equal(ragResult.messages.length, 2);
    assert.match(ragResult.messages[0].content, /RAG usage rules/);
    assert.match(ragResult.messages[0].content, /Retrieved evidence/);

    const responseFields = buildRagResponseFields(ragResult);
    assert.match(responseFields.ragContext, /related-work\.md/);
    assert.equal(responseFields.ragEvidence.results.length, 1);
    assert.match(responseFields.ragUsageGuidance, /Cannot support/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('buildRagMessages returns no messages when RAG is disabled', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'paper-ai-rag-disabled-'));
  try {
    const ragResult = await buildRagMessages(projectRoot, 'related work', {
      rag: { enabled: false },
    });

    assert.deepEqual(ragResult.messages, []);
    assert.equal(ragResult.usageGuidance, '');
    assert.deepEqual(buildRagResponseFields(ragResult), {});
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
