import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';

import { registerOfficeTrackRoutes } from '../officeTrack.js';

test('office track routes expose load, save, audit and export contracts', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-track-route-'));
  const app = Fastify({ logger: false });
  registerOfficeTrackRoutes(app, {
    resolveProjectRoot: async () => projectRoot,
  });

  try {
    const initial = await app.inject({ method: 'GET', url: '/api/projects/demo/office-track' });
    assert.equal(initial.statusCode, 200);
    assert.equal(JSON.parse(initial.payload).state.brief.humanApprovalRequired, true);

    const save = await app.inject({
      method: 'PUT',
      url: '/api/projects/demo/office-track',
      payload: {
        brief: {
          title: 'OpenPrism Office',
          scenario: '项目申报文案',
          users: '技术管理团队',
          writingTasks: ['申报书', '演示讲稿'],
          valueProposition: '证据化文案与人工审批。',
        },
        materials: [
          { id: 'm1', name: '作品说明', type: 'proposal', path: 'sources/proposal.md', status: 'draft' },
          { id: 'm2', name: '演示脚本', type: 'demo-video-script', path: 'sources/demo.md', status: 'draft' },
          { id: 'm3', name: '复用声明', type: 'reuse-statement', path: 'sources/reuse.md', status: 'draft' },
          { id: 'm4', name: '重大意义', type: 'significance', path: 'sources/significance.md', status: 'draft' },
        ],
        evidence: [
          { id: 'e1', claim: '返工减少', sourcePath: 'evidence/review.md', location: 'L3', level: 'E1', status: 'verified' },
        ],
        effect: { baselineMinutes: 50, aiMinutes: 20, reviewMinutes: 10, retryMinutes: 5, sampleSize: 2, measurementStatus: 'measured' },
      },
    });
    assert.equal(save.statusCode, 200);
    assert.equal(JSON.parse(save.payload).state.brief.title, 'OpenPrism Office');

    const bad = await app.inject({
      method: 'PUT',
      url: '/api/projects/demo/office-track',
      payload: { materials: [{ id: 'm1', name: 'bad', type: 'unknown' }] },
    });
    assert.equal(bad.statusCode, 400);

    const audit = await app.inject({ method: 'POST', url: '/api/projects/demo/office-track/audit' });
    assert.equal(audit.statusCode, 200);
    assert.equal(JSON.parse(audit.payload).audit.officialJudgement, false);

    const exported = await app.inject({ method: 'POST', url: '/api/projects/demo/office-track/export' });
    assert.equal(exported.statusCode, 200);
    const exportedBody = JSON.parse(exported.payload);
    assert.ok(exportedBody.export.files.some(file => file.path === 'submission/reviewer-guide.md'));
  } finally {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});
