import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

const runCompile = vi.fn(async input => ({ ok: true, input }));
const compileFullPaper = vi.fn(async input => ({ ok: true, input }));

vi.mock('../apps/backend/src/services/compileService.js', () => ({
  runCompile,
  compileFullPaper,
  SUPPORTED_ENGINES: ['pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic'],
  getEngineEnv: () => ({}),
  getPandocPdfEngines: () => ['--pdf-engine=tectonic'],
}));

const { registerCompileRoutes } = await import('../apps/backend/src/routes/compile.js');

describe('compile route package-install authorization', () => {
  let app;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    registerCompileRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    ['missing', undefined, false],
    ['false', false, false],
    ['string true', 'true', false],
    ['numeric true', 1, false],
    ['literal true', true, true],
  ])('normalizes %s for single-file compilation', async (_label, value, expected) => {
    const payload = { projectId: 'demo', mainFile: 'main.tex', engine: 'pdflatex' };
    if (value !== undefined) payload.allowPackageInstall = value;

    const response = await app.inject({ method: 'POST', url: '/api/compile', payload });

    expect(response.statusCode).toBe(200);
    expect(runCompile).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'demo',
      allowPackageInstall: expected,
    }));
  });

  it('passes an explicit literal true through full-paper compilation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/compile/full-paper',
      payload: {
        projectId: 'demo',
        mainFile: 'main.tex',
        engine: 'pdflatex',
        allowPackageInstall: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(compileFullPaper).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'demo',
      allowPackageInstall: true,
    }));
  });
});
