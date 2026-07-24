import Fastify from 'fastify';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let projectRoot;

vi.mock('../apps/backend/src/services/projectService.js', () => ({
  getProjectRoot: vi.fn(async () => projectRoot),
}));

const { registerCompileRoutes } = await import('../apps/backend/src/routes/compile.js');

let app;

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), 'latest-pdf-'));
  await writeFile(path.join(projectRoot, 'main.tex'), '\\documentclass{article}');
  app = Fastify();
  registerCompileRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app?.close();
  await rm(projectRoot, { recursive: true, force: true });
});

describe('GET /api/compile/latest', () => {
  it('returns the persisted compile output without running a compilation', async () => {
    await mkdir(path.join(projectRoot, '.compile', 'output'), { recursive: true });
    await writeFile(path.join(projectRoot, '.compile', 'output', 'main.pdf'), Buffer.from('%PDF-cached'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/compile/latest?projectId=managed-id&mainFile=main.tex',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      ok: true,
      found: true,
      path: '.compile/output/main.pdf',
      pdfUrl: '/api/projects/managed-id/blob?path=.compile%2Foutput%2Fmain.pdf',
      size: 11,
    }));
  });

  it('falls back to the project-local PDF and reports a clean miss', async () => {
    await writeFile(path.join(projectRoot, 'main.pdf'), Buffer.from('%PDF-root'));
    const existing = await app.inject({
      method: 'GET',
      url: '/api/compile/latest?projectId=managed-id&mainFile=main.tex',
    });
    expect(existing.json()).toEqual(expect.objectContaining({ found: true, path: 'main.pdf' }));

    await rm(path.join(projectRoot, 'main.pdf'));
    const missing = await app.inject({
      method: 'GET',
      url: '/api/compile/latest?projectId=managed-id&mainFile=main.tex',
    });
    expect(missing.statusCode).toBe(200);
    expect(missing.json()).toEqual({ ok: true, found: false });
  });

  it('prefers the synchronized root PDF when both root and internal copies exist', async () => {
    await mkdir(path.join(projectRoot, '.compile', 'output'), { recursive: true });
    await writeFile(path.join(projectRoot, '.compile', 'output', 'main.pdf'), Buffer.from('%PDF-internal'));
    await writeFile(path.join(projectRoot, 'main.pdf'), Buffer.from('%PDF-root'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/compile/latest?projectId=managed-id&mainFile=main.tex',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      found: true,
      path: 'main.pdf',
      pdfUrl: '/api/projects/managed-id/blob?path=main.pdf',
    }));
  });
});
