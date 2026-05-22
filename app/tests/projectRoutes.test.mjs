import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import crypto from 'crypto';
import { DATA_DIR } from '../apps/backend/src/config/constants.js';
import { registerProjectRoutes } from '../apps/backend/src/routes/projects.js';

describe('Project routes', () => {
  let fastify;
  const projectIds = [];

  beforeEach(async () => {
    fastify = Fastify();
    registerProjectRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    for (const projectId of projectIds.splice(0)) {
      await rm(join(DATA_DIR, projectId), { recursive: true, force: true });
    }
  });

  it('creates projects with a docs folder for notes and drafts without forcing fig', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Project With Docs' },
    });

    expect(res.statusCode).toBe(200);
    const project = res.json();
    projectIds.push(project.id);

    const docsStat = await stat(join(DATA_DIR, project.id, 'docs'));
    expect(docsStat.isDirectory()).toBe(true);

    await expect(stat(join(DATA_DIR, project.id, 'fig'))).rejects.toThrow(/ENOENT/);
  });

  it('lists project directory names alongside metadata names', async () => {
    const projectId = `listed-dir-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'project.json'), JSON.stringify({
      id: projectId,
      name: 'Display Name',
      createdAt: new Date().toISOString(),
    }));

    const res = await fastify.inject({
      method: 'GET',
      url: '/api/projects',
    });

    expect(res.statusCode).toBe(200);
    const project = res.json().projects.find((item) => item.id === projectId);
    expect(project.name).toBe('Display Name');
    expect(project.dirName).toBe(projectId);
  });

  it('adds docs support folder when opening the tree for an older project without forcing fig', async () => {
    const projectId = `legacy-no-docs-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'project.json'), JSON.stringify({
      id: projectId,
      name: 'Legacy No Docs',
      createdAt: new Date().toISOString(),
    }));

    const res = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/tree`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().items).toContainEqual({ path: 'docs', type: 'dir' });
    expect(res.json().items).not.toContainEqual({ path: 'fig', type: 'dir' });

    const docsStat = await stat(join(DATA_DIR, projectId, 'docs'));
    expect(docsStat.isDirectory()).toBe(true);

    await expect(stat(join(DATA_DIR, projectId, 'fig'))).rejects.toThrow(/ENOENT/);
  });

  it('does not recreate a user-deleted fig folder when refreshing the file tree', async () => {
    const projectId = `deleted-fig-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId, 'docs'), { recursive: true });
    await mkdir(join(DATA_DIR, projectId, 'fig'), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'project.json'), JSON.stringify({
      id: projectId,
      name: 'Deleted Fig',
      createdAt: new Date().toISOString(),
    }));

    const deleteRes = await fastify.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}/file?path=${encodeURIComponent('fig')}`,
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json()).toEqual({ ok: true });
    await expect(stat(join(DATA_DIR, projectId, 'fig'))).rejects.toThrow(/ENOENT/);

    const treeRes = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/tree`,
    });
    expect(treeRes.statusCode).toBe(200);
    expect(treeRes.json().items).toContainEqual({ path: 'docs', type: 'dir' });
    expect(treeRes.json().items).not.toContainEqual({ path: 'fig', type: 'dir' });
    await expect(stat(join(DATA_DIR, projectId, 'fig'))).rejects.toThrow(/ENOENT/);
  });

  it('serves extensionless figure blob paths from fig folder', async () => {
    const projectId = `fig-blob-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId, 'fig'), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'project.json'), JSON.stringify({
      id: projectId,
      name: 'Figure Blob',
      createdAt: new Date().toISOString(),
    }));
    await writeFile(join(DATA_DIR, projectId, 'fig', 'diagram.png'), Buffer.from([
      0x89, 0x50, 0x4e, 0x47,
    ]));

    const res = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/blob?path=${encodeURIComponent('fig/diagram')}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
  });

  it('creates files and folders through the project file API without overwriting existing paths', async () => {
    const projectId = `create-file-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'project.json'), JSON.stringify({
      id: projectId,
      name: 'Create File',
      createdAt: new Date().toISOString(),
    }));

    const folderRes = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/file`,
      payload: { path: 'docs/notes', type: 'folder' },
    });
    expect(folderRes.statusCode).toBe(200);
    expect(folderRes.json()).toEqual({ ok: true, path: 'docs/notes', type: 'dir' });
    expect((await stat(join(DATA_DIR, projectId, 'docs', 'notes'))).isDirectory()).toBe(true);

    const fileRes = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/file`,
      payload: { path: 'docs/notes/todo.md', type: 'file', content: '# Todo\n' },
    });
    expect(fileRes.statusCode).toBe(200);
    expect(fileRes.json()).toEqual({ ok: true, path: 'docs/notes/todo.md', type: 'file' });
    expect(await readFile(join(DATA_DIR, projectId, 'docs', 'notes', 'todo.md'), 'utf8')).toBe('# Todo\n');

    const duplicateRes = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/file`,
      payload: { path: 'docs/notes/todo.md', type: 'file', content: 'overwrite' },
    });
    expect(duplicateRes.statusCode).toBe(200);
    expect(duplicateRes.json().ok).toBe(false);
    expect(duplicateRes.json().error).toContain('already exists');
    expect(await readFile(join(DATA_DIR, projectId, 'docs', 'notes', 'todo.md'), 'utf8')).toBe('# Todo\n');

    const traversalRes = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/file`,
      payload: { path: '../outside.md', type: 'file' },
    });
    expect(traversalRes.statusCode).toBe(200);
    expect(traversalRes.json()).toEqual({ ok: false, error: 'Invalid file path' });
  });

  it('copies files and folders through the project file API', async () => {
    const projectId = `copy-file-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId, 'docs', 'nested'), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'project.json'), JSON.stringify({
      id: projectId,
      name: 'Copy File',
      createdAt: new Date().toISOString(),
    }));
    await writeFile(join(DATA_DIR, projectId, 'docs', 'draft.md'), 'draft');
    await writeFile(join(DATA_DIR, projectId, 'docs', 'nested', 'note.md'), 'note');

    const fileRes = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/copy-file`,
      payload: { from: 'docs/draft.md', to: 'fig/draft copy.md' },
    });
    expect(fileRes.statusCode).toBe(200);
    expect(fileRes.json()).toEqual({ ok: true });
    expect(await readFile(join(DATA_DIR, projectId, 'fig', 'draft copy.md'), 'utf8')).toBe('draft');

    const folderRes = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/copy-file`,
      payload: { from: 'docs', to: 'docs copy' },
    });
    expect(folderRes.statusCode).toBe(200);
    expect(folderRes.json()).toEqual({ ok: true });
    expect(await readFile(join(DATA_DIR, projectId, 'docs copy', 'nested', 'note.md'), 'utf8')).toBe('note');
  });

  it('moves files and rejects invalid folder self moves', async () => {
    const projectId = `move-file-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId, 'docs', 'nested'), { recursive: true });
    await mkdir(join(DATA_DIR, projectId, 'fig'), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'project.json'), JSON.stringify({
      id: projectId,
      name: 'Move File',
      createdAt: new Date().toISOString(),
    }));
    await writeFile(join(DATA_DIR, projectId, 'docs', 'draft.md'), 'draft');

    const moveRes = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/rename`,
      payload: { from: 'docs/draft.md', to: 'fig/draft.md' },
    });
    expect(moveRes.statusCode).toBe(200);
    expect(moveRes.json()).toEqual({ ok: true });
    expect(await readFile(join(DATA_DIR, projectId, 'fig', 'draft.md'), 'utf8')).toBe('draft');

    const invalidRes = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/rename`,
      payload: { from: 'docs', to: 'docs/nested/docs' },
    });
    expect(invalidRes.statusCode).toBe(200);
    expect(invalidRes.json().ok).toBe(false);
    expect(invalidRes.json().error).toContain('itself');
  });

  it('soft deletes a project even when project.json is missing', async () => {
    const projectId = `missing-meta-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'paper.tex'), 'content');

    const res = await fastify.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const meta = JSON.parse(await readFile(join(DATA_DIR, projectId, 'project.json'), 'utf8'));
    expect(meta.id).toBe(projectId);
    expect(meta.name).toBe(projectId);
    expect(meta.trashed).toBe(true);
    expect(meta.trashedAt).toBeTruthy();
  });

  it('soft deletes a project stored in a directory whose name differs from project id', async () => {
    const projectId = `aliased-id-${crypto.randomUUID()}`;
    const dirName = `aliased-dir-${crypto.randomUUID()}`;
    projectIds.push(dirName);
    await mkdir(join(DATA_DIR, dirName), { recursive: true });
    await writeFile(join(DATA_DIR, dirName, 'project.json'), JSON.stringify({
      id: projectId,
      name: 'Aliased Project',
      createdAt: new Date().toISOString(),
    }));

    const res = await fastify.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const meta = JSON.parse(await readFile(join(DATA_DIR, dirName, 'project.json'), 'utf8'));
    expect(meta.id).toBe(projectId);
    expect(meta.name).toBe('Aliased Project');
    expect(meta.trashed).toBe(true);
    expect(meta.trashedAt).toBeTruthy();
  });

  it('treats deleting an already removed project as a successful no-op', async () => {
    const res = await fastify.inject({
      method: 'DELETE',
      url: '/api/projects/already-gone',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('soft deletes a project when project.json is invalid', async () => {
    const projectId = `invalid-meta-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'project.json'), '{invalid json');

    const res = await fastify.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const meta = JSON.parse(await readFile(join(DATA_DIR, projectId, 'project.json'), 'utf8'));
    expect(meta.id).toBe(projectId);
    expect(meta.trashed).toBe(true);
  });
});
