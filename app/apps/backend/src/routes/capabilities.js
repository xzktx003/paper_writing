import { createCapabilityService } from '../services/capabilityService.js';

export function registerCapabilitiesRoutes(fastify, options = {}) {
  const capabilityService = options.capabilityService || createCapabilityService({
    appConfig: options.appConfig || {},
  });

  fastify.get('/api/capabilities', async (request) => capabilityService.inspect({
    refresh: ['1', 'true', 'yes'].includes(String(request.query?.refresh || '').toLowerCase()),
  }));
}
