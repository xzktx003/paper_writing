import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import Fastify from 'fastify';
import { registerConversationRoutes } from '../apps/backend/src/routes/conversations.js';
import { createConversation, getConversation, purgeConversationProject } from '../apps/backend/src/services/conversationStore.js';

describe('conversation storage project boundary', () => {
  let dataDir;
  let homeDir;
  let projectId;
  let projectRoot;
  let app;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'conversation-data-'));
    homeDir = await mkdtemp(join(tmpdir(), 'conversation-home-'));
    projectId = 'managed-conversation-project';
    projectRoot = join(dataDir, 'paper--abc12345');
    await writeFile(join(dataDir, '.keep'), '', 'utf8');
    await mkdir(projectRoot, { recursive: true });
    await writeFile(join(projectRoot, 'project.json'), JSON.stringify({ id: projectId, name: 'Paper', directoryName: 'paper--abc12345' }), 'utf8');
    app = Fastify({ logger: false });
    registerConversationRoutes(app, { dataDir, resolveProjectRoot: async (id) => {
      if (id !== projectId) throw Object.assign(new Error('Managed project not found'), { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
      return projectRoot;
    } });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  });

  it('stores conversations inside the resolved managed project and rejects unknown projects', async () => {
    const response = await app.inject({ method: 'POST', url: `/api/conversations/${projectId}`, payload: { name: 'Scoped' } });
    expect(response.statusCode).toBe(200);
    const conversation = response.json();
    await expect(stat(join(projectRoot, '.openprism', 'conversations', `${conversation.id}.json`))).resolves.toBeTruthy();
    await expect(stat(join(homeDir, '.paper-writer', 'conversations', projectId))).rejects.toMatchObject({ code: 'ENOENT' });

    const unknown = await app.inject({ method: 'GET', url: '/api/conversations/not-a-managed-project' });
    expect(unknown.statusCode).toBe(404);
  });

  it('validates conversation ids before constructing a filesystem path', async () => {
    await expect(getConversation(projectId, '../escape', { resolveProjectRoot: async () => projectRoot })).rejects.toMatchObject({
      code: 'INVALID_CONVERSATION_ID',
      statusCode: 400,
    });
    const response = await app.inject({ method: 'GET', url: `/api/conversations/${projectId}/unsafe.id` });
    expect(response.statusCode).toBe(400);
    const missing = await app.inject({ method: 'GET', url: `/api/conversations/${projectId}/missing123` });
    expect(missing.statusCode).toBe(404);
  });

  it('does not expose malformed conversation files through listing', async () => {
    const conversationDir = join(projectRoot, '.openprism', 'conversations');
    await mkdir(conversationDir, { recursive: true });
    await writeFile(join(conversationDir, 'unsafe.id.json'), JSON.stringify({
      id: 'unsafe.id', name: 'Should not leak', updated_at: new Date().toISOString(),
    }), 'utf8');
    const response = await app.inject({ method: 'GET', url: `/api/conversations/${projectId}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('purges legacy home storage when a project is permanently removed', async () => {
    const legacyDir = join(homeDir, '.paper-writer', 'conversations', projectId);
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'old.json'), '{}', 'utf8');
    const conversation = await createConversation(projectId, { name: 'Scoped' }, { resolveProjectRoot: async () => projectRoot });
    await purgeConversationProject(projectId, {
      resolveProjectRoot: async () => projectRoot,
      legacyHome: homeDir,
    });
    expect(conversation.id).toBeTruthy();
    await expect(stat(join(projectRoot, '.openprism', 'conversations'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(legacyDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
