import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import crypto from 'crypto';
import { DATA_DIR } from '../apps/backend/src/config/constants.js';
import { registerProjectRoutes } from '../apps/backend/src/routes/projects.js';
import { buildProjectDirectoryName, getProjectRoot } from '../apps/backend/src/services/projectLocator.js';

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
      const projectRoot = await getProjectRoot(projectId).catch(() => join(DATA_DIR, projectId));
      await rm(projectRoot, { recursive: true, force: true });
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

    const docsStat = await stat(join(DATA_DIR, project.directoryName, 'docs'));
    expect(docsStat.isDirectory()).toBe(true);

    await expect(stat(join(DATA_DIR, project.directoryName, 'fig'))).rejects.toThrow(/ENOENT/);
  });

  it('returns a structured 404 for a missing project without creating a directory', async () => {
    const missingId = `missing-${crypto.randomUUID()}`;
    const missingRoot = join(DATA_DIR, missingId);
    await rm(missingRoot, { recursive: true, force: true });

    const response = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${missingId}/files`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'PROJECT_NOT_FOUND' });
    expect(JSON.stringify(response.json())).not.toContain(DATA_DIR);
    await expect(stat(missingRoot)).rejects.toThrow(/ENOENT/);
  });

  it('rejects file reads and writes through a symbolic-link component', async () => {
    const create = await fastify.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Symlink Boundary' },
    });
    const project = create.json();
    projectIds.push(project.id);
    const projectRoot = join(DATA_DIR, project.directoryName);
    const outside = await mkdtemp(join(tmpdir(), 'paper-project-outside-'));
    await writeFile(join(outside, 'secret.txt'), 'outside-secret');
    await symlink(outside, join(projectRoot, 'docs', 'escape'), 'dir');

    try {
      const readResponse = await fastify.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/file?path=${encodeURIComponent('docs/escape/secret.txt')}`,
      });
      const writeResponse = await fastify.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}/file`,
        payload: { path: 'docs/escape/new.txt', content: 'must-not-write' },
      });

      expect(readResponse.statusCode).toBe(400);
      expect(writeResponse.statusCode).toBe(400);
      await expect(readFile(join(outside, 'new.txt'), 'utf8')).rejects.toThrow(/ENOENT/);
      expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('outside-secret');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('creates readable safe project directories while preserving stable ids and complete metadata', async () => {
    const names = [
      '中文 论文 项目',
      'Project with spaces',
      '!!!???///\\\\***',
      `超长论文标题 ${'研究方向'.repeat(40)}`,
      '同名项目',
      '同名项目',
    ];
    const created = [];

    for (const name of names) {
      const res = await fastify.inject({ method: 'POST', url: '/api/projects', payload: { name } });
      expect(res.statusCode).toBe(200);
      const project = res.json();
      created.push(project);
      projectIds.push(project.id);

      expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(project.name).toBe(name);
      expect(project.directoryName).toBe(buildProjectDirectoryName(name, project.id));
      expect(project.directoryName).not.toMatch(/[\\/]/);
      expect(project.directoryName.length).toBeLessThanOrEqual(96);
    expect(project.updatedAt).toBe(project.createdAt);
    expect(project.template).toBe(null);
    expect(project.mainFile).toBe(null);

      const meta = JSON.parse(await readFile(join(DATA_DIR, project.directoryName, 'project.json'), 'utf8'));
      expect(meta).toMatchObject({
        id: project.id,
        name,
        directoryName: project.directoryName,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      });
    }

    expect(new Set(created.map((project) => project.directoryName)).size).toBe(created.length);
    expect(created[2].directoryName).toMatch(/^project--[0-9a-f]{8}$/);
  });

  it('validates template ids and persists the resolved template entry point', async () => {
    const invalidRes = await fastify.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Unsafe template request', template: '../acl' },
    });
    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.json().code).toBe('INVALID_TEMPLATE_ID');

    const createRes = await fastify.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'ACL Paper', template: 'acl' },
    });
    expect(createRes.statusCode).toBe(200);
    const project = createRes.json();
    projectIds.push(project.id);
    expect(project).toMatchObject({ template: 'acl', mainFile: 'acl_latex.tex' });
    expect(await readFile(join(DATA_DIR, project.directoryName, 'acl_latex.tex'), 'utf8')).toContain('\\documentclass');

    const applyRes = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/template`,
      payload: { template: 'cvpr' },
    });
    expect(applyRes.statusCode).toBe(200);
    expect(applyRes.json().project).toMatchObject({ template: 'cvpr', mainFile: 'main.tex' });
  });

  it('renames both project metadata and its readable directory without changing the stable id', async () => {
    const createRes = await fastify.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Original Name' },
    });
    const original = createRes.json();
    projectIds.push(original.id);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const renameRes = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${original.id}/rename-project`,
      payload: { name: '重命名后的论文工程' },
    });

    expect(renameRes.statusCode).toBe(200);
    const renamed = renameRes.json().project;
    expect(renamed.id).toBe(original.id);
    expect(renamed.name).toBe('重命名后的论文工程');
    expect(renamed.directoryName).toBe(buildProjectDirectoryName(renamed.name, original.id));
    expect(Date.parse(renamed.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt));
    await expect(stat(join(DATA_DIR, original.directoryName))).rejects.toThrow(/ENOENT/);
    expect((await stat(join(DATA_DIR, renamed.directoryName))).isDirectory()).toBe(true);

    const listRes = await fastify.inject({ method: 'GET', url: '/api/projects' });
    const listed = listRes.json().projects.find((project) => project.id === original.id);
    expect(listed.dirName).toBe(renamed.directoryName);
    expect(listed.directoryName).toBe(renamed.directoryName);
  });

  it('returns 409 and leaves the original project intact when a rename target already exists', async () => {
    const createRes = await fastify.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Conflict Source' },
    });
    const original = createRes.json();
    projectIds.push(original.id);
    const targetDirectoryName = buildProjectDirectoryName('Conflict Target', original.id);
    await mkdir(join(DATA_DIR, targetDirectoryName), { recursive: true });

    const renameRes = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${original.id}/rename-project`,
      payload: { name: 'Conflict Target' },
    });

    expect(renameRes.statusCode).toBe(409);
    expect(renameRes.json().error).toMatch(/already exists|conflict/i);
    const meta = JSON.parse(await readFile(join(DATA_DIR, original.directoryName, 'project.json'), 'utf8'));
    expect(meta.name).toBe('Conflict Source');
    expect(meta.directoryName).toBe(original.directoryName);
    expect((await stat(join(DATA_DIR, original.directoryName))).isDirectory()).toBe(true);
    await rm(join(DATA_DIR, targetDirectoryName), { recursive: true, force: true });
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
    expect(project.directoryName).toBe(projectId);
  });

  it('reports metadata-free paper folders as candidates without writing project metadata', async () => {
    const dirName = `uploaded-paper-${crypto.randomUUID()}`;
    projectIds.push(dirName);
    await mkdir(join(DATA_DIR, dirName, 'source'), { recursive: true });
    await writeFile(join(DATA_DIR, dirName, 'source', 'main.tex'), '\\documentclass{article}\n');

    const res = await fastify.inject({
      method: 'GET',
      url: '/api/projects',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().projects.some((item) => item.dirName === dirName)).toBe(false);
    expect(res.json().candidates).toContainEqual(expect.objectContaining({ directoryName: dirName, name: dirName }));
    await expect(readFile(join(DATA_DIR, dirName, 'project.json'), 'utf8')).rejects.toThrow(/ENOENT/);
  });

  it('registers an existing paper directory only after an explicit confirmed POST', async () => {
    const dirName = `existing-paper-${crypto.randomUUID()}`;
    projectIds.push(dirName);
    await mkdir(join(DATA_DIR, dirName, 'source'), { recursive: true });
    await writeFile(join(DATA_DIR, dirName, 'source', 'main.tex'), '\\documentclass{article}\n');
    await writeFile(join(DATA_DIR, dirName, 'references.bib'), '@article{demo}\n');

    const before = await fastify.inject({ method: 'GET', url: '/api/projects' });
    expect(before.statusCode).toBe(200);
    expect(before.json().candidates).toContainEqual(expect.objectContaining({
      directoryName: dirName,
      suggestedMainFile: 'source/main.tex',
      fileCount: 2,
    }));
    await expect(readFile(join(DATA_DIR, dirName, 'project.json'), 'utf8')).rejects.toThrow(/ENOENT/);

    const registered = await fastify.inject({
      method: 'POST',
      url: '/api/projects/register-existing',
      payload: { directoryName: dirName, name: 'Recovered Paper' },
    });

    expect(registered.statusCode).toBe(200);
    expect(registered.json()).toMatchObject({
      ok: true,
      project: {
        name: 'Recovered Paper',
        directoryName: dirName,
        mainFile: 'source/main.tex',
      },
    });
    expect(registered.json().project.id).toMatch(/^[0-9a-f-]{36}$/);
    projectIds.push(registered.json().project.id);

    const meta = JSON.parse(await readFile(join(DATA_DIR, dirName, 'project.json'), 'utf8'));
    expect(meta).toMatchObject(registered.json().project);

    const after = await fastify.inject({ method: 'GET', url: '/api/projects' });
    expect(after.json().candidates.some((item) => item.directoryName === dirName)).toBe(false);
    expect(after.json().projects).toContainEqual(expect.objectContaining({
      id: registered.json().project.id,
      directoryName: dirName,
      name: 'Recovered Paper',
    }));

    const duplicate = await fastify.inject({
      method: 'POST',
      url: '/api/projects/register-existing',
      payload: { directoryName: dirName, name: 'Duplicate' },
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it('rejects unsafe existing-directory registration targets', async () => {
    for (const directoryName of ['../outside', 'nested/project', '.hidden-project', '']) {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/projects/register-existing',
        payload: { directoryName, name: 'Unsafe' },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('rejects symlink candidates without reading or writing outside the project data root', async () => {
    const externalRoot = await mkdtemp(join(tmpdir(), 'paper-register-external-'));
    const linkName = `linked-paper-${crypto.randomUUID()}`;
    projectIds.push(linkName);
    try {
      await writeFile(join(externalRoot, 'main.tex'), '\\documentclass{article}\n');
      await symlink(externalRoot, join(DATA_DIR, linkName), 'dir');

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/projects/register-existing',
        payload: { directoryName: linkName, name: 'Linked Paper' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('INVALID_PROJECT_DIRECTORY');
      await expect(readFile(join(externalRoot, 'project.json'), 'utf8')).rejects.toThrow(/ENOENT/);
    } finally {
      await rm(externalRoot, { recursive: true, force: true });
    }
  });

  it('serializes concurrent registration attempts for the same directory', async () => {
    const dirName = `concurrent-paper-${crypto.randomUUID()}`;
    projectIds.push(dirName);
    await mkdir(join(DATA_DIR, dirName), { recursive: true });
    await writeFile(join(DATA_DIR, dirName, 'main.tex'), '\\documentclass{article}\n');

    const responses = await Promise.all([
      fastify.inject({ method: 'POST', url: '/api/projects/register-existing', payload: { directoryName: dirName, name: 'First' } }),
      fastify.inject({ method: 'POST', url: '/api/projects/register-existing', payload: { directoryName: dirName, name: 'Second' } }),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const meta = JSON.parse(await readFile(join(DATA_DIR, dirName, 'project.json'), 'utf8'));
    expect(['First', 'Second']).toContain(meta.name);
    projectIds.push(meta.id);
  });

  it('does not auto-register empty folders as projects', async () => {
    const dirName = `empty-folder-${crypto.randomUUID()}`;
    projectIds.push(dirName);
    await mkdir(join(DATA_DIR, dirName), { recursive: true });

    const res = await fastify.inject({
      method: 'GET',
      url: '/api/projects',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().projects.some((item) => item.dirName === dirName)).toBe(false);
    expect(res.json().candidates.some((item) => item.directoryName === dirName)).toBe(false);
    await expect(readFile(join(DATA_DIR, dirName, 'project.json'), 'utf8')).rejects.toThrow(/ENOENT/);
  });

  it('never lists hidden cache folders as projects or registration candidates', async () => {
    const dirName = `.pytest-cache-${crypto.randomUUID()}`;
    projectIds.push(dirName);
    await mkdir(join(DATA_DIR, dirName), { recursive: true });
    await writeFile(join(DATA_DIR, dirName, 'README.md'), 'cache metadata');

    const res = await fastify.inject({ method: 'GET', url: '/api/projects' });

    expect(res.statusCode).toBe(200);
    expect(res.json().projects.some((item) => item.dirName === dirName)).toBe(false);
    expect(res.json().candidates.some((item) => item.directoryName === dirName)).toBe(false);
    await expect(readFile(join(DATA_DIR, dirName, 'project.json'), 'utf8')).rejects.toThrow(/ENOENT/);
  });

  it('keeps tree reads side-effect free for an older project without docs', async () => {
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
    expect(res.json().items).not.toContainEqual({ path: 'docs', type: 'dir' });
    expect(res.json().items).not.toContainEqual({ path: 'fig', type: 'dir' });
    await expect(stat(join(DATA_DIR, projectId, 'docs'))).rejects.toThrow(/ENOENT/);

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

  it('keeps RAG runtime and corpus storage out of the paper source tree', async () => {
    const projectId = `rag-tree-isolation-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId, '.openprism'), { recursive: true });
    await mkdir(join(DATA_DIR, projectId, 'research_corpus'), { recursive: true });
    await mkdir(join(DATA_DIR, projectId, 'docs'), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'project.json'), JSON.stringify({
      id: projectId,
      name: 'RAG Tree Isolation',
      createdAt: new Date().toISOString(),
    }));
    await writeFile(join(DATA_DIR, projectId, '.openprism', 'paper-rag-index.json'), '{}');
    await writeFile(join(DATA_DIR, projectId, 'research_corpus', 'evidence.md'), '# evidence\n');
    await writeFile(join(DATA_DIR, projectId, 'docs', 'draft.md'), '# draft\n');

    const res = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/tree`,
    });

    expect(res.statusCode).toBe(200);
    const paths = res.json().items.map((item) => item.path);
    expect(paths).toContain('docs/draft.md');
    expect(paths.some((item) => item === '.openprism' || item.startsWith('.openprism/'))).toBe(false);
    expect(paths.some((item) => item === 'research_corpus' || item.startsWith('research_corpus/'))).toBe(false);

    const filesRes = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/files`,
    });
    expect(filesRes.statusCode).toBe(200);
    const filePaths = filesRes.json().files.map((file) => file.path);
    expect(filePaths).toContain('docs/draft.md');
    expect(filePaths.some((item) => item.startsWith('.openprism/'))).toBe(false);
    expect(filePaths.some((item) => item.startsWith('research_corpus/'))).toBe(false);
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

  it('returns a structured 404 when a blob and all extension probes are missing', async () => {
    const projectId = `missing-blob-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'project.json'), JSON.stringify({
      id: projectId,
      name: 'Missing Blob',
      createdAt: new Date().toISOString(),
    }));

    const res = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/blob?path=${encodeURIComponent('fig/does-not-exist')}`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: 'Project blob not found',
      path: 'fig/does-not-exist',
    });

    const explicitRes = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/blob?path=${encodeURIComponent('fig/does-not-exist.png')}`,
    });
    expect(explicitRes.statusCode).toBe(404);
    expect(explicitRes.json()).toEqual({
      error: 'Project blob not found',
      path: 'fig/does-not-exist.png',
    });
  });

  it('downloads files and folders from managed projects', async () => {
    const projectId = `download-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId, 'docs'), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'project.json'), JSON.stringify({
      id: projectId,
      name: 'Download Project',
      createdAt: new Date().toISOString(),
    }));
    await writeFile(join(DATA_DIR, projectId, 'docs', 'note.md'), '# note\n');

    const fileRes = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/download?path=${encodeURIComponent('docs/note.md')}`,
    });
    expect(fileRes.statusCode).toBe(200);
    expect(fileRes.headers['content-disposition']).toContain('attachment; filename="note.md"');
    expect(fileRes.body).toBe('# note\n');

    const folderRes = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/download?path=${encodeURIComponent('docs')}`,
    });
    expect(folderRes.statusCode).toBe(200);
    expect(folderRes.headers['content-type']).toContain('application/gzip');
    expect(folderRes.headers['content-disposition']).toContain('docs.tar.gz');
    expect(folderRes.rawPayload.length).toBeGreaterThan(0);
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

  it('refuses to soft delete an unmanaged directory without project metadata', async () => {
    const projectId = `missing-meta-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'paper.tex'), 'content');

    const res = await fastify.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'PROJECT_NOT_FOUND' });
    await expect(readFile(join(DATA_DIR, projectId, 'project.json'), 'utf8')).rejects.toThrow(/ENOENT/);
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

  it('returns a structured 404 when attempting to delete an already removed project', async () => {
    const res = await fastify.inject({
      method: 'DELETE',
      url: '/api/projects/already-gone',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('refuses to soft delete a directory with invalid project metadata', async () => {
    const projectId = `invalid-meta-${crypto.randomUUID()}`;
    projectIds.push(projectId);
    await mkdir(join(DATA_DIR, projectId), { recursive: true });
    await writeFile(join(DATA_DIR, projectId, 'project.json'), '{invalid json');

    const res = await fastify.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'PROJECT_NOT_FOUND' });
    expect(await readFile(join(DATA_DIR, projectId, 'project.json'), 'utf8')).toBe('{invalid json');
  });
});
