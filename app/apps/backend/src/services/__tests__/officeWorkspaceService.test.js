import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  appendOfficeInboxItem,
  loadOfficeWorkspace,
  recordOfficeEvidenceGraph,
  recordOfficeMeeting,
  recordOfficeSearch,
} from '../officeWorkspaceService.js';

test('office workspace persists inbox, search, evidence graph, and meeting records project-locally', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-workspace-'));
  try {
    const initial = await loadOfficeWorkspace(projectRoot);
    assert.equal(initial.version, 1);
    assert.deepEqual(initial.inbox, []);

    await appendOfficeInboxItem(projectRoot, {
      id: 'inbox-1',
      sourcePath: 'sources/brief.docx',
      filename: 'brief.docx',
      format: 'docx',
      status: 'ready',
      parser: { id: 'builtin-ooxml', mode: 'local' },
      quality: { status: 'complete', score: 1 },
      warnings: [],
      sections: [{ id: 's1', heading: '概述', text: '可核验材料' }],
      chunks: [{ id: 'c1', text: '可核验材料', source: { path: 'sources/brief.docx', location: '概述' } }],
    });
    await recordOfficeSearch(projectRoot, {
      id: 'search-1', query: '可核验', createdAt: '2026-08-27T00:00:00.000Z', results: [],
    });
    await recordOfficeEvidenceGraph(projectRoot, {
      id: 'graph-1', createdAt: '2026-08-27T00:00:00.000Z', claims: [], edges: [], coverage: 0,
    });
    await recordOfficeMeeting(projectRoot, {
      id: 'meeting-1', title: '周会', createdAt: '2026-08-27T00:00:00.000Z', summary: '确认交付范围', decisions: [], actionItems: [], evidence: [],
    });

    const restored = await loadOfficeWorkspace(projectRoot);
    assert.equal(restored.inbox[0].sourcePath, 'sources/brief.docx');
    assert.equal(restored.searches[0].query, '可核验');
    assert.equal(restored.evidenceGraphs[0].id, 'graph-1');
    assert.equal(restored.meetings[0].title, '周会');
    assert.match(restored.updatedAt, /^2026-/);

    const stored = JSON.parse(await readFile(path.join(projectRoot, '.openprism', 'office-workspace.json'), 'utf8'));
    assert.equal(stored.inbox.length, 1);
    assert.equal(stored.meetings.length, 1);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('office workspace rejects unsafe or oversized persisted records', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-workspace-safe-'));
  try {
    await assert.rejects(
      appendOfficeInboxItem(projectRoot, {
        id: 'bad', sourcePath: '../outside.docx', filename: 'outside.docx', format: 'docx', status: 'ready',
        parser: { id: 'builtin-ooxml', mode: 'local' }, quality: { status: 'complete', score: 1 }, warnings: [], sections: [], chunks: [],
      }),
      /safe project-relative path/i,
    );
    await assert.rejects(
      recordOfficeSearch(projectRoot, { id: 'large', query: 'x'.repeat(2001), results: [] }),
      /query is too long/i,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
