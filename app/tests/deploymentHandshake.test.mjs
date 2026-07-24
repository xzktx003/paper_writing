import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadBuildInfo } from '../apps/backend/src/config/buildInfo.js';
import { registerHealthRoutes } from '../apps/backend/src/routes/health.js';
import { evaluateDeploymentCompatibility } from '../apps/frontend/src/api/deploymentHandshake.ts';

describe('frontend/backend deployment handshake', () => {
  it('loads a build artifact once and preserves its identity for the backend process', async () => {
    const root = await mkdtemp(join(tmpdir(), 'paper-build-info-'));
    const metadataPath = join(root, 'build.json');
    try {
      await writeFile(metadataPath, JSON.stringify({
        buildId: 'build-20260722-a',
        builtAt: '2026-07-22T03:00:00.000Z',
        version: '0.1.0',
        apiSchemaVersion: 2,
      }));
      expect(loadBuildInfo({ metadataPath, now: () => new Date('2026-07-22T04:00:00.000Z') })).toEqual({
        buildId: 'build-20260722-a',
        builtAt: '2026-07-22T03:00:00.000Z',
        version: '0.1.0',
        apiSchemaVersion: 2,
        backendStartedAt: '2026-07-22T04:00:00.000Z',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns versioned liveness and a separate readiness status', async () => {
    const app = Fastify({ logger: false });
    registerHealthRoutes(app, {
      buildInfo: {
        buildId: 'build-test',
        builtAt: '2026-07-22T03:00:00.000Z',
        backendStartedAt: '2026-07-22T04:00:00.000Z',
        version: '0.1.0',
        apiSchemaVersion: 2,
      },
      readinessCheck: async () => ({ ready: false, checks: { dataRoot: false, templates: true } }),
    });
    try {
      const health = await app.inject({ method: 'GET', url: '/api/health' });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toMatchObject({
        ok: true,
        build: { id: 'build-test', apiSchemaVersion: 2 },
      });
      const ready = await app.inject({ method: 'GET', url: '/api/ready' });
      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toMatchObject({ ready: false, checks: { dataRoot: false, templates: true } });
    } finally {
      await app.close();
    }
  });

  it('blocks missing, stale, or schema-incompatible backends and accepts an exact build match', () => {
    expect(evaluateDeploymentCompatibility('frontend-a', { ok: true })).toMatchObject({ compatible: false, reason: 'missing-build-metadata' });
    expect(evaluateDeploymentCompatibility('frontend-a', {
      build: { id: 'backend-b', apiSchemaVersion: 2 },
    })).toMatchObject({ compatible: false, reason: 'build-id-mismatch' });
    expect(evaluateDeploymentCompatibility('frontend-a', {
      build: { id: 'frontend-a', apiSchemaVersion: 1 },
    })).toMatchObject({ compatible: false, reason: 'api-schema-mismatch' });
    expect(evaluateDeploymentCompatibility('frontend-a', {
      build: { id: 'frontend-a', apiSchemaVersion: 2 },
    })).toEqual({ compatible: true, reason: 'compatible' });
  });
});
