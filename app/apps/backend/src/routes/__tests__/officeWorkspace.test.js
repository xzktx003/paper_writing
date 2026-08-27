import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { registerOfficeWorkspaceRoutes } from '../officeWorkspace.js';

async function withApp(run, routeOptions = {}) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-workspace-route-'));
  const app = Fastify({ logger: false });
  registerOfficeWorkspaceRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
    capabilityEnv: {},
    ...routeOptions,
  });
  try {
    await run({ app, projectRoot });
  } finally {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
}

function body(response) {
  return JSON.parse(response.payload);
}

test('workspace route imports material, searches hybrid evidence, builds graph, and ingests meeting evidence', async () => {
  await withApp(async ({ app, projectRoot }) => {
    await mkdir(path.join(projectRoot, 'sources'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'sources', 'pilot.txt'),
      'The finance team approved the reimbursement report pilot. Every external delivery requires human approval.',
    );

    const initial = await app.inject({ method: 'GET', url: '/api/projects/demo/office-track/workspace' });
    assert.equal(initial.statusCode, 200);
    assert.equal(body(initial).workspace.inbox.length, 0);
    assert.equal(body(initial).capabilities.find(item => item.id === 'builtin-ooxml').available, true);
    assert.equal(body(initial).capabilities.find(item => item.id === 'officecli').available, false);

    const imported = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/office-track/inbox/import',
      payload: { sourcePath: 'sources/pilot.txt' },
    });
    assert.equal(imported.statusCode, 200);
    assert.equal(body(imported).item.status, 'ready');
    assert.equal(body(imported).item.parser.id, 'plain-text');
    assert.match(body(imported).item.sections[0].text, /finance team approved/);
    assert.equal(JSON.stringify(body(imported)).includes(projectRoot), false);

    const search = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/office-track/search',
      payload: { query: 'approved reimbursement report pilot', topK: 3 },
    });
    assert.equal(search.statusCode, 200);
    assert.equal(body(search).results[0].source.path, 'sources/pilot.txt');
    assert.ok(body(search).results[0].scoreBreakdown.bm25 > 0);
    assert.ok(body(search).results[0].scoreBreakdown.vector > 0);

    const graph = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/office-track/evidence/graph',
      payload: { claims: [{ id: 'claim-1', text: 'The reimbursement report pilot was approved.' }] },
    });
    assert.equal(graph.statusCode, 200);
    assert.equal(body(graph).graph.coverage.supportedClaims, 1);
    assert.equal(body(graph).graph.edges[0].source.path, 'sources/pilot.txt');

    const meeting = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/office-track/meetings/import',
      payload: {
        filename: '../weekly.txt',
        content: '[00:00:10] Mei: Discussed evidence gaps.\n[00:01:20] Raj: Decision: keep human approval.\n[00:02:00] Mei: Action: Li will upload evidence by Friday.',
      },
    });
    assert.equal(meeting.statusCode, 200);
    assert.equal(body(meeting).meeting.source.speakerDiarization, 'not-claimed');
    assert.equal(body(meeting).meeting.decisions[0].timestamp, '00:01:20');
    assert.equal(body(meeting).meeting.actionItems[0].owner, 'Li');

    const restored = await app.inject({ method: 'GET', url: '/api/projects/demo/office-track/workspace' });
    assert.equal(body(restored).workspace.inbox.length, 1);
    assert.equal(body(restored).workspace.searches.length, 1);
    assert.equal(body(restored).workspace.evidenceGraphs.length, 1);
    assert.equal(body(restored).workspace.meetings.length, 1);
  });
});

test('workflow routes enforce recipe, review, approval, publish, and evidence-backed telemetry', async () => {
  await withApp(async ({ app }) => {
    for (const connector of [
      { id: 'source', type: 'local-folder', displayName: 'Source', params: { relativePath: 'sources' } },
      { id: 'delivery', type: 'local-folder', displayName: 'Delivery', params: { relativePath: 'delivery' } },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/projects/demo/office-track/connectors', payload: connector });
      assert.equal(response.statusCode, 200);
    }
    const recipe = await app.inject({
      method: 'POST', url: '/api/projects/demo/office-track/recipes',
      payload: { id: 'monthly', name: 'Monthly report', triggerConnectorId: 'source', publishConnectorId: 'delivery', steps: ['ingest', 'draft', 'review', 'approve', 'publish'] },
    });
    assert.equal(recipe.statusCode, 200);

    const created = await app.inject({
      method: 'POST', url: '/api/projects/demo/office-track/runs',
      payload: { id: 'run1', recipeId: 'monthly', trigger: { connectorId: 'source', kind: 'manual', actor: { type: 'human', id: 'author' } } },
    });
    assert.equal(body(created).run.status, 'triggered');

    const illegal = await app.inject({
      method: 'POST', url: '/api/projects/demo/office-track/runs/run1/transition',
      payload: { to: 'published', actor: { type: 'human', id: 'author' } },
    });
    assert.equal(illegal.statusCode, 400);

    for (const transition of [
      { to: 'processing', actor: { type: 'ai', id: 'writer-agent', model: 'configured-model' } },
      { to: 'review', actor: { type: 'human', id: 'reviewer' } },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/projects/demo/office-track/runs/run1/transition', payload: transition });
      assert.equal(response.statusCode, 200);
    }

    const comment = await app.inject({
      method: 'POST', url: '/api/projects/demo/office-track/review/comments',
      payload: {
        runId: 'run1', id: 'comment1', paragraphId: 'p-3', body: '补充来源位置', assignee: 'author', deadline: '2026-09-01T00:00:00.000Z',
        provenance: { type: 'human', id: 'reviewer' },
        suggestion: { id: 'suggestion1', kind: 'replace', originalText: '提效显著', suggestedText: '基于实测样本节省 20 分钟', semanticDiff: { intent: 'ground-claim', changedClaims: ['efficiency'], risk: 'medium' } },
      },
    });
    assert.equal(body(comment).comment.suggestion.status, 'pending');

    const decision = await app.inject({
      method: 'POST', url: '/api/projects/demo/office-track/review/suggestions/suggestion1/decision',
      payload: { runId: 'run1', commentId: 'comment1', decision: 'accepted', provenance: { type: 'human', id: 'approver' } },
    });
    assert.equal(body(decision).suggestion.status, 'accepted');

    const approval = await app.inject({
      method: 'POST', url: '/api/projects/demo/office-track/runs/run1/approvals',
      payload: { id: 'approval1', status: 'approved', actor: { type: 'human', id: 'approver' }, notes: 'Evidence checked.' },
    });
    assert.equal(approval.statusCode, 200);
    for (const transition of [
      { to: 'approved', actor: { type: 'human', id: 'approver' } },
      { to: 'published', actor: { type: 'human', id: 'publisher' } },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/projects/demo/office-track/runs/run1/transition', payload: transition });
      assert.equal(response.statusCode, 200);
    }

    const metric = await app.inject({
      method: 'POST', url: '/api/projects/demo/office-track/metrics',
      payload: {
        id: 'metric1', role: 'writer', frequency: 'weekly', version: 'monthly-v1',
        timings: { baselineMinutes: 120, aiMinutes: 45, reviewMinutes: 20, retryMinutes: 5, setupMinutes: 10, maintenanceMinutes: 2 },
        volumes: { documents: 2, words: 1600 }, decisions: { accepted: 8, rejected: 2 },
        quality: { scoreBefore: 72, scoreAfter: 84, rubric: 'human-review' },
      },
    });
    assert.equal(body(metric).efficiency.evidenceStatus, 'sufficient');
    assert.equal(body(metric).efficiency.metrics.timeSavedMinutes, 38);

    const snapshot = body(await app.inject({ method: 'GET', url: '/api/projects/demo/office-track/workspace' }));
    assert.equal(snapshot.workflow.runs[0].status, 'published');
    assert.equal(snapshot.workflow.runs[0].reviewThreads[0].comments[0].suggestion.status, 'accepted');
    assert.equal(snapshot.workflow.efficiency.evidenceStatus, 'sufficient');
  });
});

test('artifact routes expose upstream-compatible plans and honest unavailable execution', async () => {
  await withApp(async ({ app }) => {
    const plan = await app.inject({
      method: 'POST', url: '/api/projects/demo/office-track/artifacts/plan',
      payload: { operation: 'render', inputPath: 'sources/deck.pptx', outputPath: 'delivery/deck.pdf', format: 'pdf' },
    });
    assert.equal(plan.statusCode, 200);
    assert.deepEqual(body(plan).task.steps[0].argv, ['view', 'sources/deck.pptx', 'pdf', '--out', 'delivery/deck.pdf', '--json']);

    const run = await app.inject({
      method: 'POST', url: '/api/projects/demo/office-track/artifacts/run',
      payload: { operation: 'validate', inputPath: 'sources/deck.pptx' },
    });
    assert.equal(run.statusCode, 200);
    assert.equal(body(run).execution.status, 'unavailable');
    assert.match(body(run).execution.action, /OFFICECLI_PATH/);

    const unsafe = await app.inject({
      method: 'POST', url: '/api/projects/demo/office-track/inbox/import', payload: { sourcePath: '../secret.docx' },
    });
    assert.equal(unsafe.statusCode, 400);
  });
});

test('artifact failure responses redact embedded project paths and cap external command output', async () => {
  let projectRootForRunner = '';
  await withApp(async ({ app, projectRoot }) => {
    projectRootForRunner = projectRoot;
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/office-track/artifacts/run',
      payload: { operation: 'validate', inputPath: 'sources/deck.pptx' },
    });
    assert.equal(response.statusCode, 200);
    const execution = body(response).execution;
    assert.equal(execution.status, 'failed');
    assert.equal(response.payload.includes(projectRoot), false);
    assert.match(execution.reason, /\[project\]\/sources\/deck\.pptx/);
    assert.ok(execution.stderr.length <= 8000);
  }, {
    capabilityEnv: { OFFICECLI_PATH: '/opt/tools/officecli', OPENPRISM_API_TOKEN: 'must-not-reach-adapter' },
    capabilityAccess: async () => {},
    artifactRunner: async (_file, args, options) => {
      assert.equal(options.env.OPENPRISM_API_TOKEN, undefined);
      if (args[0] === '--version') return { code: 0, stdout: '1.0.145', stderr: '' };
      return {
        code: 2,
        stdout: '',
        stderr: `Failed to validate ${projectRootForRunner}/sources/deck.pptx\n${'x'.repeat(12_000)}`,
      };
    },
  });
});
