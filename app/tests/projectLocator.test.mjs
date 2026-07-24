import { describe, expect, it, vi } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import {
  buildProjectDirectoryName,
  clearProjectLocationCache,
  getProjectRoot,
  renameProjectLocation,
  resolveProjectDataDir,
  slugifyProjectName,
} from '../apps/backend/src/services/projectLocator.js';

describe('Project Locator', () => {
  it('keeps unicode letters, normalizes spaces, and safely falls back for punctuation-only names', () => {
    expect(slugifyProjectName('  中文 论文  Project  ')).toBe('中文-论文-Project');
    expect(slugifyProjectName('!!! / \\ ???')).toBe('project');
    expect(slugifyProjectName(`标题${'很长'.repeat(100)}`).length).toBeLessThanOrEqual(72);
  });

  it('builds a readable directory name with a short stable-id suffix', () => {
    expect(buildProjectDirectoryName('My Paper', '12345678-abcd-4000-8000-123456789abc'))
      .toBe('My-Paper--12345678');
  });

  it('caches a validated stable-id lookup instead of rescanning every project directory', async () => {
    const dataDir = await fs.mkdtemp(path.join(tmpdir(), 'project-locator-cache-'));
    const id = '12345678-abcd-4000-8000-123456789abc';
    const directoryName = buildProjectDirectoryName('Cached Paper', id);
    const projectRoot = path.join(dataDir, directoryName);
    await fs.mkdir(projectRoot);
    await fs.writeFile(path.join(projectRoot, 'project.json'), JSON.stringify({ id, directoryName }));
    clearProjectLocationCache({ dataDir });
    const readdir = vi.spyOn(fs, 'readdir');
    try {
      expect(await getProjectRoot(id, { dataDir })).toBe(projectRoot);
      expect(await getProjectRoot(id, { dataDir })).toBe(projectRoot);
      expect(readdir).toHaveBeenCalledTimes(1);
    } finally {
      readdir.mockRestore();
      clearProjectLocationCache({ dataDir });
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('evicts a stale cached path and recovers by scanning current metadata', async () => {
    const dataDir = await fs.mkdtemp(path.join(tmpdir(), 'project-locator-cache-recovery-'));
    const id = '87654321-abcd-4000-8000-123456789abc';
    const firstRoot = path.join(dataDir, buildProjectDirectoryName('Before Move', id));
    const movedRoot = path.join(dataDir, 'manually-moved-project');
    await fs.mkdir(firstRoot);
    await fs.writeFile(path.join(firstRoot, 'project.json'), JSON.stringify({ id }));
    clearProjectLocationCache({ dataDir });
    try {
      expect(await getProjectRoot(id, { dataDir })).toBe(firstRoot);
      await fs.rename(firstRoot, movedRoot);
      expect(await getProjectRoot(id, { dataDir })).toBe(movedRoot);
    } finally {
      clearProjectLocationCache({ dataDir });
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('rejects duplicate stable IDs instead of choosing the first directory found', async () => {
    const dataDir = await fs.mkdtemp(path.join(tmpdir(), 'project-locator-duplicate-'));
    const id = 'duplicate-project-id';
    const firstRoot = path.join(dataDir, 'first-copy');
    const secondRoot = path.join(dataDir, 'second-copy');
    await Promise.all([fs.mkdir(firstRoot), fs.mkdir(secondRoot)]);
    await Promise.all([
      fs.writeFile(path.join(firstRoot, 'project.json'), JSON.stringify({ id, name: 'First' })),
      fs.writeFile(path.join(secondRoot, 'project.json'), JSON.stringify({ id, name: 'Second' })),
    ]);
    clearProjectLocationCache({ dataDir });
    try {
      await expect(getProjectRoot(id, { dataDir })).rejects.toMatchObject({
        code: 'PROJECT_IDENTITY_DUPLICATE',
        statusCode: 409,
        directoryNames: expect.arrayContaining(['first-copy', 'second-copy']),
      });
    } finally {
      clearProjectLocationCache({ dataDir });
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('rejects traversal-shaped project ids before resolving filesystem paths', async () => {
    await expect(getProjectRoot('../outside')).rejects.toMatchObject({
      code: 'INVALID_PROJECT_ID',
      statusCode: 400,
    });
  });

  it('rejects a managed project root that is a symbolic link', async () => {
    const dataDir = await fs.mkdtemp(path.join(tmpdir(), 'project-locator-symlink-'));
    const outside = await fs.mkdtemp(path.join(tmpdir(), 'project-locator-outside-'));
    const id = 'symlink-project';
    await fs.writeFile(path.join(outside, 'project.json'), JSON.stringify({ id, name: 'Outside' }));
    await fs.symlink(outside, path.join(dataDir, id), 'dir');
    try {
      await expect(getProjectRoot(id, { dataDir })).rejects.toMatchObject({
        code: 'PROJECT_SYMLINK_NOT_ALLOWED',
        statusCode: 400,
      });
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('does not treat malformed or missing metadata as a managed project identity', async () => {
    const dataDir = await fs.mkdtemp(path.join(tmpdir(), 'project-locator-invalid-meta-'));
    for (const [id, content] of [['missing-meta', null], ['invalid-meta', '{broken']]) {
      await fs.mkdir(path.join(dataDir, id));
      if (content !== null) await fs.writeFile(path.join(dataDir, id, 'project.json'), content);
      await expect(getProjectRoot(id, { dataDir })).rejects.toMatchObject({
        code: 'PROJECT_NOT_FOUND',
        statusCode: 404,
      });
    }
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('uses OPENPRISM_DATA_DIR as the sole authority and warns when the legacy alias conflicts', () => {
    const warn = vi.fn();
    const primary = path.resolve('/tmp/primary-papers');
    const legacy = path.resolve('/tmp/legacy-papers');
    expect(resolveProjectDataDir({
      OPENPRISM_DATA_DIR: primary,
      OPENPRISM_PROJECTS_DIR: legacy,
    }, { warn })).toBe(primary);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/OPENPRISM_DATA_DIR.*OPENPRISM_PROJECTS_DIR/));
  });

  it('uses OPENPRISM_PROJECTS_DIR only as a compatibility alias when the primary variable is absent', () => {
    const legacy = path.resolve('/tmp/legacy-only-papers');
    expect(resolveProjectDataDir({ OPENPRISM_PROJECTS_DIR: legacy }, { warn: vi.fn() })).toBe(legacy);
  });

  it('rolls the directory rename back when the metadata commit fails', async () => {
    const dataDir = await fs.mkdtemp(path.join(tmpdir(), 'project-locator-rollback-'));
    const id = '12345678-abcd-4000-8000-123456789abc';
    const sourceDirectoryName = buildProjectDirectoryName('Before', id);
    const sourceRoot = path.join(dataDir, sourceDirectoryName);
    await fs.mkdir(sourceRoot);
    await fs.writeFile(path.join(sourceRoot, 'project.json'), JSON.stringify({
      id,
      name: 'Before',
      directoryName: sourceDirectoryName,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));
    const failingFs = {
      ...fs,
      writeFile: async (filePath, ...args) => {
        if (String(filePath).endsWith('.tmp')) throw new Error('simulated metadata failure');
        return fs.writeFile(filePath, ...args);
      },
    };

    await expect(renameProjectLocation(id, 'After', { dataDir, fsApi: failingFs }))
      .rejects.toThrow('simulated metadata failure');
    expect((await fs.stat(sourceRoot)).isDirectory()).toBe(true);
    await expect(fs.stat(path.join(dataDir, buildProjectDirectoryName('After', id))))
      .rejects.toThrow(/ENOENT/);
    const meta = JSON.parse(await fs.readFile(path.join(sourceRoot, 'project.json'), 'utf8'));
    expect(meta).toMatchObject({ name: 'Before', directoryName: sourceDirectoryName });
    await fs.rm(dataDir, { recursive: true, force: true });
  });
});
