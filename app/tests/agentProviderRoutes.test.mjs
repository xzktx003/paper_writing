import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerAgentProviderRoutes } from '../apps/backend/src/routes/agentProviders.js';

describe('agent provider probe route boundary', () => {
  it('returns probed readiness metadata when the registry supports it', async () => {
    const registry = {
      listMetadata: () => [{ id: 'codex-cli', available: true }],
      listReadinessMetadata: vi.fn(async () => [{ id: 'codex-cli', available: false, authStatus: 'not-authenticated' }]),
      probe: async () => ({}),
      listModels: async () => [],
      invoke: async () => ({}),
      cancel: async () => ({}),
    };
    const app = Fastify({ logger: false });
    registerAgentProviderRoutes(app, { registry });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/providers' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        providers: [{ id: 'codex-cli', available: false, authStatus: 'not-authenticated' }],
      });
      expect(registry.listReadinessMetadata).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('does not expose the internal allowDisabled probe flag to HTTP callers', async () => {
    const probe = vi.fn(async (_id, input) => ({ installed: true, auth: { available: true }, input }));
    const registry = {
      listMetadata: () => [],
      probe,
      listModels: async () => [],
      invoke: async () => ({}),
      cancel: async () => ({}),
    };
    const app = Fastify({ logger: false });
    registerAgentProviderRoutes(app, { registry });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/providers/codex-cli/probe',
        payload: { allowDisabled: true, endpoint: 'https://example.test' },
      });
      expect(response.statusCode).toBe(200);
      expect(probe).toHaveBeenCalledWith('codex-cli', { endpoint: 'https://example.test' });
    } finally {
      await app.close();
    }
  });

  it('loads models from the temporary provider settings supplied by the form', async () => {
    const listModels = vi.fn(async (_id, input) => {
      expect(input).toEqual({
        endpoint: 'http://10.40.0.2/v1',
        apiKey: 'temporary-key',
      });
      return ['gpt-5.6-sol'];
    });
    const registry = {
      listMetadata: () => [],
      probe: async () => ({}),
      listModels,
      invoke: async () => ({}),
      cancel: async () => ({}),
    };
    const app = Fastify({ logger: false });
    registerAgentProviderRoutes(app, { registry });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/providers/openai-compatible/models',
        payload: {
          endpoint: 'http://10.40.0.2/v1',
          apiKey: 'temporary-key',
          allowDisabled: true,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        providerId: 'openai-compatible',
        models: ['gpt-5.6-sol'],
      });
      expect(listModels).toHaveBeenCalledWith('openai-compatible', {
        endpoint: 'http://10.40.0.2/v1',
        apiKey: 'temporary-key',
      });
    } finally {
      await app.close();
    }
  });
});
