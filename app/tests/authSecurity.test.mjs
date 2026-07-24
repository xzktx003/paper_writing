import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerAuthHook } from '../apps/backend/src/middleware/auth.js';

async function buildApp(apiToken) {
  const app = Fastify();
  registerAuthHook(app, { apiToken });
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/projects', async () => ({ projects: [] }));
  app.post('/api/projects', async () => ({ created: true }));
  app.delete('/api/projects/paper-1/permanent', async () => ({ deleted: true }));
  app.get('/api/config', async () => ({ llm_api_key: '********' }));
  app.put('/api/config', async () => ({ saved: true }));
  app.post('/api/ai/stream', async () => ({ streamed: true }));
  app.post('/api/ai/send', async () => ({ sent: true }));
  app.post('/api/code/run', async () => ({ executed: true }));
  app.post('/api/code/exec', async () => ({ executed: true }));
  app.get('/api/terminal/ws', async () => ({ connected: true }));
  app.get('/api/ws/watch', async () => ({ connected: true }));
  app.get('/api/providers', async () => ({ providers: [] }));
  app.post('/api/providers/codex-cli/probe', async () => ({ installed: true }));
  app.post('/api/providers/openai-compatible/probe', async () => ({ installed: true }));
  app.post('/api/providers/codex-cli/invoke', async () => ({ executed: true }));
  app.post('/api/providers/cancel', async () => ({ cancelled: true }));
  await app.ready();
  return app;
}

describe('dangerous API authentication defaults', () => {
  it('keeps only explicit bootstrap metadata public and fails closed for every data/write/execute route without a token', async () => {
    const app = await buildApp('');
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/providers' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/config' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'GET', url: '/api/projects' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/api/projects' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'DELETE', url: '/api/projects/paper-1/permanent' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'PUT', url: '/api/config' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/api/ai/stream' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/api/ai/send' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/api/code/run' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/api/code/exec' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'GET', url: '/api/terminal/ws' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/api/providers/openai-compatible/probe' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/api/providers/codex-cli/probe' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/api/providers/codex-cli/invoke' })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/api/providers/cancel' })).statusCode).toBe(503);
    await app.close();
  });

  it('enforces exact Bearer semantics when a token is configured', async () => {
    const app = await buildApp('expected-token');
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/providers' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/config' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/config', headers: { authorization: 'Bearer expected-token' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/projects' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/projects', headers: { authorization: 'Basic expected-token' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/projects', headers: { authorization: 'Bearer wrong-token' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/projects', headers: { authorization: 'Bearer expected-token' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/terminal/ws?access_token=expected-token' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/ws/watch?access_token=expected-token' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/providers/codex-cli/probe', headers: { authorization: 'Bearer expected-token' } })).statusCode).toBe(200);
    await app.close();
  });
});
