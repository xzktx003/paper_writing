import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';

import {
  addApprovalEvent,
  addComment,
  addCommentReply,
  createRun,
  decideSuggestion,
  defaultOfficeWorkflowState,
  loadOfficeWorkflowState,
  registerConnector,
  saveOfficeWorkflowState,
  summarizeTelemetry,
  transitionRun,
  upsertRecipe,
} from '../officeWorkflowService.js';

async function withProject(fn) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-workflow-'));
  try {
    return await fn(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function prepareLocalRecipe(projectRoot, recipeId = 'monthly-report') {
  await registerConnector(projectRoot, { id: 'source-folder', type: 'local-folder', params: { relativePath: 'sources' } });
  await registerConnector(projectRoot, { id: 'delivery-folder', type: 'local-folder', params: { relativePath: 'delivery' } });
  await upsertRecipe(projectRoot, {
    id: recipeId,
    name: '本地办公材料配方',
    triggerConnectorId: 'source-folder',
    publishConnectorId: 'delivery-folder',
    steps: ['ingest', 'retrieve', 'draft', 'review', 'approve', 'publish'],
    humanApprovalRequired: true,
  });
}

test('office workflow state is project scoped, versioned, atomically persisted, and serializes concurrent updates', async () => {
  await withProject(async (projectRoot) => {
    const initial = await loadOfficeWorkflowState(projectRoot);
    assert.deepEqual(initial, defaultOfficeWorkflowState());

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        saveOfficeWorkflowState(projectRoot, (state) => ({
          telemetry: [
            ...state.telemetry,
            {
              id: `t${index}`,
              role: 'writer',
              frequency: 'weekly',
              version: 'recipe-v1',
              timings: { baselineMinutes: 100, aiMinutes: 45, reviewMinutes: 15 },
              volumes: { documents: 1, words: 800 },
              decisions: { accepted: 1, rejected: 0 },
              quality: { scoreBefore: 70, scoreAfter: 82, rubric: 'internal-review' },
            },
          ],
        })),
      ),
    );

    const saved = await loadOfficeWorkflowState(projectRoot);
    assert.equal(saved.version, 1);
    assert.equal(saved.schema, 'openprism-office-workflow');
    assert.equal(saved.telemetry.length, 12);
    assert.equal(new Set(saved.telemetry.map(item => item.id)).size, 12);

    const raw = JSON.parse(await readFile(path.join(projectRoot, '.openprism', 'office-workflow.json'), 'utf-8'));
    assert.equal(raw.telemetry.length, 12);
  });
});

test('recipe connectors declare capabilities, validate safe parameters, and do not report unconfigured integrations as ready', async () => {
  await withProject(async (projectRoot) => {
    const local = await registerConnector(projectRoot, {
      id: 'source-folder',
      type: 'local-folder',
      displayName: 'Source folder',
      params: { relativePath: 'source-materials' },
    });
    assert.equal(local.connectors[0].status, 'ready');
    assert.deepEqual(local.connectors[0].capabilities, ['read', 'write', 'watch']);

    const feishu = await registerConnector(projectRoot, {
      id: 'drive',
      type: 'feishu-drive',
      displayName: 'Feishu Drive',
      params: { folderToken: 'fldcnDemoToken' },
    });
    assert.equal(feishu.connectors.find(item => item.id === 'drive').status, 'blocked');
    assert.match(feishu.connectors.find(item => item.id === 'drive').statusReason, /not configured/i);

    const previousAppId = process.env.FEISHU_APP_ID;
    const previousAppSecret = process.env.FEISHU_APP_SECRET;
    process.env.FEISHU_APP_ID = 'configured-for-test';
    process.env.FEISHU_APP_SECRET = 'configured-for-test';
    try {
      const configuredOnly = await registerConnector(projectRoot, {
        id: 'configured-drive',
        type: 'feishu-drive',
        displayName: 'Configured but not executable',
        params: { folderToken: 'fldcnConfiguredToken' },
      });
      const connector = configuredOnly.connectors.find(item => item.id === 'configured-drive');
      assert.equal(connector.configured, true);
      assert.equal(connector.executionReady, false);
      assert.equal(connector.status, 'blocked');
      assert.match(connector.statusReason, /execution adapter is not implemented/i);
    } finally {
      if (previousAppId == null) delete process.env.FEISHU_APP_ID;
      else process.env.FEISHU_APP_ID = previousAppId;
      if (previousAppSecret == null) delete process.env.FEISHU_APP_SECRET;
      else process.env.FEISHU_APP_SECRET = previousAppSecret;
    }

    await assert.rejects(
      registerConnector(projectRoot, { id: 'bad', type: 'webhook', params: { url: 'http://127.0.0.1:8899/hook' } }),
      /public https URL/,
    );
    await assert.rejects(
      registerConnector(projectRoot, { id: 'bad_path', type: 'local-folder', params: { relativePath: '../secret' } }),
      /safe relative path/,
    );
    await assert.rejects(
      registerConnector(projectRoot, { id: 'bad_type', type: 'unknown', params: {} }),
      /unsupported connector/i,
    );
  });
});

test('runs enforce trigger to process to review to approval and publish state transitions', async () => {
  await withProject(async (projectRoot) => {
    await prepareLocalRecipe(projectRoot);
    const created = await createRun(projectRoot, {
      id: 'run1',
      recipeId: 'monthly-report',
      trigger: { connectorId: 'source-folder', kind: 'manual', actor: { type: 'human', id: 'u1' } },
    });
    assert.equal(created.runs[0].status, 'triggered');

    await assert.rejects(
      addComment(projectRoot, 'run1', {
        id: 'too-early',
        paragraphId: 'p-1',
        body: 'Review cannot start before the run reaches review.',
        provenance: { type: 'human', id: 'reviewer' },
      }),
      /review operations require review status/i,
    );
    await assert.rejects(
      addApprovalEvent(projectRoot, 'run1', {
        id: 'too-early-approval',
        status: 'approved',
        actor: { type: 'human', id: 'approver' },
      }),
      /approval events require review status/i,
    );

    await assert.rejects(
      transitionRun(projectRoot, 'run1', { to: 'published', actor: { type: 'human', id: 'u1' } }),
      /Illegal run transition/,
    );

    await transitionRun(projectRoot, 'run1', { to: 'processing', actor: { type: 'ai', id: 'agent1', model: 'gpt-test' } });
    await transitionRun(projectRoot, 'run1', { to: 'review', actor: { type: 'human', id: 'reviewer' } });
    await addApprovalEvent(projectRoot, 'run1', {
      id: 'approval1',
      status: 'approved',
      actor: { type: 'human', id: 'approver' },
      notes: 'Evidence reviewed.',
    });
    await transitionRun(projectRoot, 'run1', { to: 'approved', actor: { type: 'human', id: 'approver' } });
    const published = await transitionRun(projectRoot, 'run1', { to: 'published', actor: { type: 'human', id: 'publisher' } });

    const run = published.runs[0];
    assert.equal(run.status, 'published');
    assert.deepEqual(run.timeline.map(event => event.to), ['triggered', 'processing', 'review', 'approved', 'published']);
    assert.equal(run.timeline[1].actor.type, 'ai');
  });
});

test('review threads capture paragraph comments, replies, suggestions, assignees, deadlines, provenance, approval events, and semantic diff', async () => {
  await withProject(async (projectRoot) => {
    await prepareLocalRecipe(projectRoot, 'proposal');
    await createRun(projectRoot, {
      id: 'run1',
      recipeId: 'proposal',
      trigger: { kind: 'manual', actor: { type: 'human', id: 'u1' } },
    });
    await transitionRun(projectRoot, 'run1', { to: 'processing', actor: { type: 'ai', id: 'agent1' } });
    await transitionRun(projectRoot, 'run1', { to: 'review', actor: { type: 'human', id: 'reviewer-a' } });
    const commented = await addComment(projectRoot, 'run1', {
      id: 'c1',
      paragraphId: 'p-12',
      body: '这里需要补充真实提效证据。',
      assignee: 'owner-a',
      deadline: '2026-09-01T00:00:00.000Z',
      provenance: { type: 'human', id: 'reviewer-a' },
      suggestion: {
        id: 's1',
        kind: 'replace',
        originalText: '提效显著',
        suggestedText: '基于 6 份样本，单份节省 10 分钟',
        semanticDiff: { intent: 'add-evidence', changedClaims: ['efficiency'], risk: 'medium' },
      },
    });
    assert.equal(commented.runs[0].reviewThreads[0].comments[0].suggestion.status, 'pending');

    await addCommentReply(projectRoot, 'run1', 'c1', {
      id: 'r1',
      body: '已补表格来源。',
      provenance: { type: 'data', source: 'evidence/effect.csv', location: 'A2:D8' },
    });
    await decideSuggestion(projectRoot, 'run1', 'c1', {
      suggestionId: 's1',
      decision: 'accepted',
      provenance: { type: 'human', id: 'approver-a' },
    });
    const approved = await addApprovalEvent(projectRoot, 'run1', {
      id: 'a1',
      status: 'approved',
      actor: { type: 'human', id: 'approver-a' },
      notes: '证据位置可复核。',
    });

    const comment = approved.runs[0].reviewThreads[0].comments[0];
    assert.equal(comment.replies[0].provenance.type, 'data');
    assert.equal(comment.suggestion.status, 'accepted');
    assert.equal(comment.suggestion.semanticDiff.intent, 'add-evidence');
    assert.equal(approved.runs[0].approvalEvents[0].status, 'approved');
  });
});

test('recipes validate connector references and preserve mandatory review and approval gates', async () => {
  await withProject(async (projectRoot) => {
    await registerConnector(projectRoot, { id: 'source-folder', type: 'local-folder', params: { relativePath: 'sources' } });
    await registerConnector(projectRoot, { id: 'delivery-folder', type: 'local-folder', params: { relativePath: 'delivery' } });
    const saved = await upsertRecipe(projectRoot, {
      id: 'proposal',
      name: 'Proposal delivery',
      triggerConnectorId: 'source-folder',
      publishConnectorId: 'delivery-folder',
      steps: ['ingest', 'draft', 'review', 'approve', 'publish'],
    });
    assert.equal(saved.recipes[0].humanApprovalRequired, true);
    assert.deepEqual(saved.recipes[0].steps, ['ingest', 'draft', 'review', 'approve', 'publish']);
    await assert.rejects(
      upsertRecipe(projectRoot, {
        id: 'unsafe', name: 'Unsafe', triggerConnectorId: 'source-folder', publishConnectorId: 'delivery-folder', steps: ['ingest', 'publish'],
      }),
      /review and approve gates/,
    );
    await assert.rejects(
      createRun(projectRoot, { id: 'unknown-run', recipeId: 'missing', trigger: { kind: 'manual', actor: { type: 'human', id: 'u1' } } }),
      /Unknown recipe/,
    );
  });
});

test('telemetry summary reports comparison metrics only when real evidence is sufficient', async () => {
  const insufficient = summarizeTelemetry([
    {
      id: 'draft',
      role: 'writer',
      frequency: 'weekly',
      version: 'recipe-v1',
      timings: { baselineMinutes: 90, aiMinutes: null, reviewMinutes: 10 },
      volumes: { documents: 1 },
      decisions: { accepted: 0, rejected: 0 },
      quality: { scoreBefore: null, scoreAfter: null },
    },
  ]);
  assert.equal(insufficient.evidenceStatus, 'insufficient');
  assert.equal(insufficient.metrics.timeSavedMinutes, null);

  const sufficient = summarizeTelemetry([
    {
      id: 'real1',
      role: 'writer',
      frequency: 'weekly',
      version: 'recipe-v1',
      timings: {
        baselineMinutes: 120,
        aiMinutes: 45,
        reviewMinutes: 20,
        retryMinutes: 5,
        setupMinutes: 10,
        maintenanceMinutes: 2,
      },
      volumes: { documents: 2, words: 1600 },
      decisions: { accepted: 8, rejected: 2 },
      quality: { scoreBefore: 72, scoreAfter: 84, rubric: 'human-review' },
    },
  ]);
  assert.equal(sufficient.evidenceStatus, 'sufficient');
  assert.equal(sufficient.metrics.timeSavedMinutes, 38);
  assert.equal(sufficient.metrics.timeSavedRatio, 0.3167);
  assert.equal(sufficient.metrics.acceptanceRate, 0.8);
  assert.equal(sufficient.metrics.qualityDelta, 12);
  assert.deepEqual(sufficient.coverage.roles, ['writer']);
  assert.deepEqual(sufficient.coverage.versions, ['recipe-v1']);
});
