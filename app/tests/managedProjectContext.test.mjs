import { describe, expect, it, vi } from 'vitest';
import {
  markLegacyProjectPathUsage,
  resolveManagedProjectRequest,
} from '../apps/backend/src/services/managedProjectContext.js';

describe('managed project request context', () => {
  it('resolves the new projectId contract without a legacy usage marker', async () => {
    const resolveProjectRoot = vi.fn(async id => `/managed/${id}`);
    const request = { body: { projectId: 'managed-project' }, log: { warn: vi.fn() } };
    const reply = { header: vi.fn() };
    await expect(resolveManagedProjectRequest(request, reply, { resolveProjectRoot }))
      .resolves.toEqual({ projectId: 'managed-project', projectRoot: '/managed/managed-project', legacy: false });
    expect(request.log.warn).not.toHaveBeenCalled();
    expect(reply.header).not.toHaveBeenCalled();
    expect(resolveProjectRoot).toHaveBeenCalledWith('managed-project', { allowMissing: false });
  });

  it('keeps projectId authoritative when a stale projectPath is also present', async () => {
    const request = {
      body: {
        projectId: 'managed-project',
        projectPath: '__paper_agent__:stale-project',
        relativePath: 'sec/introduction.tex',
      },
      log: { warn: vi.fn() },
    };
    const reply = { header: vi.fn() };

    await expect(resolveManagedProjectRequest(request, reply, {
      resolveProjectRoot: async id => `/managed/${id}`,
      route: 'chapters.read',
    })).resolves.toEqual({
      projectId: 'managed-project',
      projectRoot: '/managed/managed-project',
      legacy: false,
    });
    expect(request.managedProjectUsage).toEqual({
      input: 'projectPath',
      deprecated: true,
      route: 'chapters.read',
    });
    expect(reply.header).toHaveBeenCalledWith('Deprecation', 'true');
  });

  it('keeps the old marker as an observable deprecated compatibility input', async () => {
    const request = { body: { projectPath: '__paper_agent__:legacy-project' }, log: { warn: vi.fn() } };
    const reply = { header: vi.fn() };
    const result = await resolveManagedProjectRequest(request, reply, {
      resolveProjectRoot: async id => `/managed/${id}`,
      route: 'test-route',
    });
    expect(result).toEqual({ projectId: 'legacy-project', projectRoot: '/managed/legacy-project', legacy: true });
    expect(request.log.warn).toHaveBeenCalledWith(expect.objectContaining({ route: 'test-route' }), expect.stringMatching(/deprecated/i));
    expect(reply.header).toHaveBeenCalledWith('Deprecation', 'true');
    expect(reply.header).toHaveBeenCalledWith('X-OpenPrism-Deprecated-Input', 'projectPath');
  });

  it('rejects external absolute paths in managed APIs', async () => {
    await expect(resolveManagedProjectRequest({ body: { projectPath: '/tmp/external-paper' }, log: {} }, null, {
      dataDir: '/managed-root',
    })).rejects.toMatchObject({ statusCode: 400, code: 'EXTERNAL_PATH_NOT_ALLOWED' });
  });

  it('allows an explicit externalProjectPath only for opted-in external capabilities', async () => {
    const request = { body: { externalProjectPath: '/tmp/external-paper' }, log: { warn: vi.fn() } };
    await expect(resolveManagedProjectRequest(request, null, {
      allowExternalProjectPath: true,
    })).resolves.toEqual({
      projectId: null,
      projectRoot: '/tmp/external-paper',
      legacy: false,
      external: true,
    });
    expect(request.managedProjectUsage).toBeUndefined();
    expect(request.log.warn).not.toHaveBeenCalled();
  });

  it('reads projectId from websocket query input without a legacy marker', async () => {
    const request = { query: { projectId: 'managed-project' }, log: { warn: vi.fn() } };
    await expect(resolveManagedProjectRequest(request, null, {
      source: 'query',
      resolveProjectRoot: async id => `/managed/${id}`,
    })).resolves.toEqual({
      projectId: 'managed-project',
      projectRoot: '/managed/managed-project',
      legacy: false,
    });
    expect(request.log.warn).not.toHaveBeenCalled();
  });

  it('provides a reusable marker for websocket compatibility paths', () => {
    const warn = vi.fn();
    const marker = markLegacyProjectPathUsage({ log: { warn } }, null, { route: 'watcher' });
    expect(marker).toEqual({ input: 'projectPath', deprecated: true, route: 'watcher' });
    expect(warn).toHaveBeenCalled();
  });
});
