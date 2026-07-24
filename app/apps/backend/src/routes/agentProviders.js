import { agentProviderRegistry } from '../services/agentProviderRegistry.js';

function providerId(request) {
  return String(request.params?.providerId || request.body?.providerId || '').trim();
}

function publicProviderInput(body = {}) {
  const { allowDisabled: _ignored, ...safeInput } = body;
  return safeInput;
}

export function registerAgentProviderRoutes(fastify, { registry = agentProviderRegistry } = {}) {
  fastify.get('/api/providers', async () => ({
    providers: registry.listReadinessMetadata
      ? await registry.listReadinessMetadata()
      : registry.listMetadata(),
  }));

  fastify.post('/api/providers/:providerId/probe', async (request) => ({
    providerId: providerId(request),
    // `allowDisabled` is an internal read-only diagnostic flag used only by
    // the protected CLI Task provider catalogue. Never trust it from HTTP.
    ...(await registry.probe(providerId(request), publicProviderInput(request.body))),
  }));

  fastify.get('/api/providers/:providerId/models', async (request) => ({
    providerId: providerId(request),
    models: await registry.listModels(providerId(request)),
  }));

  fastify.post('/api/providers/:providerId/models', async (request) => ({
    providerId: providerId(request),
    models: await registry.listModels(providerId(request), publicProviderInput(request.body)),
  }));

  fastify.post('/api/providers/:providerId/invoke', async (request) => (
    registry.invoke(providerId(request), request.body || {})
  ));

  fastify.post('/api/providers/cancel', async (request) => (
    registry.cancel(String(request.body?.requestId || ''))
  ));
}
