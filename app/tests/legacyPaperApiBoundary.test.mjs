import Fastify from 'fastify';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { registerPaperProjectRoutes } from '../apps/backend/src/routes/paperProjects.js';
import { assertWithinDataDir } from '../apps/backend/src/utils/pathSecurity.js';

const cleanup = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('legacy absolute-path paper API boundary', () => {
  it('does not register legacy routes unless explicitly enabled', async () => {
    const app = Fastify();
    registerPaperProjectRoutes(app);
    const response = await app.inject({ method: 'POST', url: '/api/paper/open', payload: { path: '/tmp/demo' } });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('rejects a data-root symlink that resolves outside the managed root', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'paper-legacy-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'paper-legacy-outside-'));
    cleanup.push(dataRoot, outside);
    await mkdir(join(outside, 'paper'), { recursive: true });
    const link = join(dataRoot, 'linked-paper');
    await symlink(join(outside, 'paper'), link);

    expect(() => assertWithinDataDir(link, { dataDir: dataRoot })).toThrow(/symbolic links/i);
  });
});
