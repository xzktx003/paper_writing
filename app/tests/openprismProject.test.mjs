import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DATA_DIR } from '../apps/backend/src/config/constants.js';
import { registerProjectRoutes } from '../apps/backend/src/routes/projects.js';

describe('Paper Agent project loading editor flow', () => {
  let app;
  let project;
  let projectRoot;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    registerProjectRoutes(app);
    await app.ready();

    const create = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: `Editor Flow ${Date.now()}` },
    });
    expect(create.statusCode).toBe(200);
    project = create.json();
    projectRoot = join(DATA_DIR, project.directoryName);
    await mkdir(join(projectRoot, 'sec'), { recursive: true });
    for (const [name, content] of [
      ['1.abstract.tex', '\\begin{abstract}Test abstract\\end{abstract}'],
      ['2.introduction.tex', '\\section{Introduction}'],
      ['3.method.tex', '\\section{Method}'],
      ['4.results.tex', '\\section{Results}'],
      ['5.conclusion.tex', '\\section{Conclusion}'],
    ]) await writeFile(join(projectRoot, 'sec', name), content);
  });

  afterAll(async () => {
    await app.close();
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
  });

  it('returns a project-relative file tree containing chapter files', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/projects/${project.id}/tree` });
    expect(response.statusCode).toBe(200);
    const secFiles = response.json().items.filter(
      item => item.type === 'file' && /^sec\/[^/]+\.tex$/.test(item.path),
    );
    expect(secFiles).toHaveLength(5);
    expect(secFiles.map(item => item.path)).toContain('sec/1.abstract.tex');
    expect(secFiles.map(item => item.path)).toContain('sec/2.introduction.tex');
  });

  it('reads project metadata and chapter content through managed projectId routes', async () => {
    const metaResponse = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/file?path=project.json`,
    });
    expect(metaResponse.statusCode).toBe(200);
    expect(JSON.parse(metaResponse.json().content)).toMatchObject({ id: project.id, name: project.name });

    const chapterResponse = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/file?path=${encodeURIComponent('sec/1.abstract.tex')}`,
    });
    expect(chapterResponse.statusCode).toBe(200);
    expect(chapterResponse.json().content).toContain('abstract');
  });

  it('writes and deletes a temporary chapter through the managed file API', async () => {
    const testContent = `% test write ${Date.now()}`;
    const writeResponse = await app.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}/file`,
      payload: { path: 'sec/__test_tmp.tex', content: testContent },
    });
    expect(writeResponse.statusCode).toBe(200);

    const readResponse = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/file?path=${encodeURIComponent('sec/__test_tmp.tex')}`,
    });
    expect(readResponse.json().content).toBe(testContent);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}/file?path=${encodeURIComponent('sec/__test_tmp.tex')}`,
    });
    expect(deleteResponse.statusCode).toBe(200);
  });
});
