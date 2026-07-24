import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

import { registerCliTaskRoutes } from '../cliTasks.js';

test('CLI Task routes expose create, history, review, and cancellation without accepting project paths', async () => {
  const calls = [];
  const task = {
    id: 'task-1',
    projectId: 'demo',
    providerId: 'codex-cli',
    status: 'waiting-review',
    changedFiles: [{ path: 'paper.md', status: 'modified', diff: '--- a/paper.md\n+++ b/paper.md\n' }],
  };
  const service = {
    createTask: async (input) => { calls.push(['create', input]); return task; },
    listTasks: async (projectId) => { calls.push(['list', projectId]); return [task]; },
    getTask: async (projectId, taskId) => { calls.push(['get', projectId, taskId]); return task; },
    acceptTask: async (projectId, taskId) => { calls.push(['accept', projectId, taskId]); return { ...task, status: 'accepted' }; },
    rejectTask: async (projectId, taskId, input) => { calls.push(['reject', projectId, taskId, input]); return { ...task, status: 'rejected' }; },
    cancelTask: async (projectId, taskId) => { calls.push(['cancel', projectId, taskId]); return { cancelled: true, taskId }; },
  };
  const app = Fastify({ logger: false });
  registerCliTaskRoutes(app, { service });

  try {
    const create = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/cli-tasks',
      payload: { providerId: 'codex-cli', model: 'gpt-5.5', prompt: 'Revise paper', projectPath: '/tmp/escape' },
    });
    assert.equal(create.statusCode, 202);
    assert.deepEqual(calls[0], ['create', {
      projectId: 'demo',
      providerId: 'codex-cli',
      model: 'gpt-5.5',
      prompt: 'Revise paper',
      timeoutMs: undefined,
    }]);

    assert.equal((await app.inject({ method: 'GET', url: '/api/projects/demo/cli-tasks' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/projects/demo/cli-tasks/task-1' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/projects/demo/cli-tasks/task-1/accept' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/projects/demo/cli-tasks/task-1/reject', payload: { reason: 'No' } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/projects/demo/cli-tasks/task-1/cancel' })).statusCode, 200);

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/projects/demo/cli-tasks',
      payload: { providerId: 'codex-cli', prompt: '' },
    });
    assert.equal(invalid.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('CLI Task provider listing awaits and exposes verified availability fields', async () => {
  const app = Fastify({ logger: false });
  const service = {
    listProviders: async () => [{
      id: 'codex-cli',
      label: 'Codex CLI',
      isolation: 'codex-workspace-write',
      installed: true,
      authenticated: false,
      authStatus: 'not-authenticated',
      available: false,
      unavailableReason: 'Sign in on the server first.',
    }],
  };
  registerCliTaskRoutes(app, { service });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/cli-task-providers' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.payload), {
      providers: [{
        id: 'codex-cli',
        label: 'Codex CLI',
        isolation: 'codex-workspace-write',
        installed: true,
        authenticated: false,
        authStatus: 'not-authenticated',
        available: false,
        unavailableReason: 'Sign in on the server first.',
      }],
    });
  } finally {
    await app.close();
  }
});
