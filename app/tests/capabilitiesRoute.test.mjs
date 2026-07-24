import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { registerCapabilitiesRoutes } from '../apps/backend/src/routes/capabilities.js';
import { registerAuthHook } from '../apps/backend/src/middleware/auth.js';

describe('Capabilities route', () => {
  it('returns a partial report instead of converting a single unavailable capability into HTTP 500', async () => {
    const app = Fastify();
    registerCapabilitiesRoutes(app, {
      capabilityService: {
        inspect: vi.fn(async () => ({
          schemaVersion: 1,
          checkedAt: '2026-07-22T00:00:00.000Z',
          cache: { cached: false, ttlMs: 30_000 },
          capabilities: [{ id: 'document.tex', label: 'TeX engines', status: 'unavailable', reason: 'No engine found', checkedAt: '2026-07-22T00:00:00.000Z', details: {} }],
        })),
      },
    });
    const response = await app.inject({ method: 'GET', url: '/api/capabilities' });
    expect(response.statusCode).toBe(200);
    expect(response.json().capabilities[0].status).toBe('unavailable');
    await app.close();
  });

  it('keeps local capability probing behind the existing fail-closed server token boundary', async () => {
    const app = Fastify();
    registerAuthHook(app, { apiToken: '' });
    registerCapabilitiesRoutes(app, { capabilityService: { inspect: vi.fn() } });
    const response = await app.inject({ method: 'GET', url: '/api/capabilities' });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toMatch(/OPENPRISM_API_TOKEN/i);
    await app.close();
  });
});
