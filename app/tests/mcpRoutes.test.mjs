import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerMcpRoutes } from '../apps/backend/src/routes/mcp.js';

describe('MCP routes', () => {
  let fastify;

  beforeEach(async () => {
    fastify = Fastify();
    registerMcpRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('builds discovery URLs from the public request host', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/mcp/info',
      headers: {
        host: '10.30.0.22:8787',
        'x-forwarded-proto': 'http',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.configuration['claude-desktop'].mcpServers['paper-agent'].url)
      .toBe('http://10.30.0.22:8787/api/mcp/sse');
    expect(body.configuration.cursor.mcpServers['paper-agent'].url)
      .toBe('http://10.30.0.22:8787/api/mcp');
  });
});
