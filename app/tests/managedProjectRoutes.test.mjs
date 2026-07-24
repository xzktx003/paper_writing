import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { registerChapterRoutes } from '../apps/backend/src/routes/chapters.js';

describe('managed project chapter routes', () => {
  let app;
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'managed-project-routes-'));
    await mkdir(join(projectRoot, 'sec'), { recursive: true });
    await mkdir(join(projectRoot, 'chapters'), { recursive: true });
    await writeFile(join(projectRoot, 'sec', 'introduction.tex'), 'managed relative-path content');
    await writeFile(join(projectRoot, 'chapters', 'legacy.md'), 'legacy filename content');

    app = Fastify({ logger: false });
    registerChapterRoutes(app, {
      resolveProjectRoot: async projectId => {
        if (projectId === 'managed-project') return projectRoot;
        throw Object.assign(new Error(`Unknown project: ${projectId}`), { statusCode: 404 });
      },
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('reads a managed chapter with projectId plus project-relative path', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chapters/read',
      payload: { projectId: 'managed-project', relativePath: 'sec/introduction.tex' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.deprecation).toBeUndefined();
    expect(response.json()).toEqual({
      filename: 'sec/introduction.tex',
      relativePath: 'sec/introduction.tex',
      content: 'managed relative-path content',
    });
  });

  it('uses projectId and relativePath when a stale legacy marker is also supplied', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chapters/read',
      payload: {
        projectId: 'managed-project',
        projectPath: '__paper_agent__:stale-project',
        relativePath: 'sec/introduction.tex',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.deprecation).toBe('true');
    expect(response.headers['x-openprism-deprecated-input']).toBe('projectPath');
    expect(response.json().content).toBe('managed relative-path content');
  });

  it('keeps the old marker-plus-filename request compatible and deprecated', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chapters/read',
      payload: {
        projectPath: '__paper_agent__:managed-project',
        filename: 'legacy.md',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.deprecation).toBe('true');
    expect(response.headers['x-openprism-deprecated-input']).toBe('projectPath');
    expect(response.json()).toMatchObject({
      filename: 'chapters/legacy.md',
      relativePath: 'chapters/legacy.md',
      content: 'legacy filename content',
    });
  });

  it('rejects project-relative traversal for both managed and legacy chapter inputs', async () => {
    const managed = await app.inject({
      method: 'POST',
      url: '/api/chapters/read',
      payload: { projectId: 'managed-project', relativePath: '../outside.tex' },
    });
    const legacy = await app.inject({
      method: 'POST',
      url: '/api/chapters/read',
      payload: {
        projectPath: '__paper_agent__:managed-project',
        filename: '../sec/introduction.tex',
      },
    });

    expect(managed.statusCode).toBe(400);
    expect(legacy.statusCode).toBe(400);
  });
});
