import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { envToConfig, parseEnv, publicAppConfig, SUPPORTED_LLM_PROVIDERS } from '../apps/backend/src/config/appConfig.js';
import { DATA_DIR } from '../apps/backend/src/config/constants.js';

describe('env-backed app config helpers', () => {
  it('advertises every supported HTTP and CLI provider as a stable config value', () => {
    expect(SUPPORTED_LLM_PROVIDERS).toEqual([
      'openai-compatible', 'anthropic', 'codex-cli', 'claude-cli', 'copilot-cli',
    ]);
    expect(envToConfig({ OPENPRISM_LLM_PROVIDER: 'codex-cli' }).llm_provider).toBe('codex-cli');
  });
  it('reports the Project Locator runtime root instead of a competing settings path', () => {
    const config = envToConfig({ OPENPRISM_PROJECTS_DIR: '/tmp/stale-legacy-root' });
    expect(config.projects_dir).toBe(DATA_DIR);
  });

  it('parses dotenv values without exposing secrets through public config', () => {
    const parsed = parseEnv(`\nOPENPRISM_LLM_API_KEY=secret-value\nOPENPRISM_LLM_BASE_URL=https://example.test/v1\nOPENPRISM_LLM_MODEL=gpt-5.5\n`);
    expect(parsed.values.OPENPRISM_LLM_BASE_URL).toBe('https://example.test/v1');
    expect(parsed.values.OPENPRISM_LLM_API_KEY).toBe('secret-value');

    const publicConfig = publicAppConfig({
      llm_api_key: parsed.values.OPENPRISM_LLM_API_KEY,
      claude_api_key: parsed.values.OPENPRISM_LLM_API_KEY,
      draw_image_api_key: 'draw-server-secret',
      llm_base_url: parsed.values.OPENPRISM_LLM_BASE_URL,
      llm_model: parsed.values.OPENPRISM_LLM_MODEL,
    });
    expect(publicConfig.llm_api_key).toBe('********');
    expect(publicConfig.claude_api_key).toBe('********');
    expect(publicConfig.llm_api_key_set).toBe(true);
    expect(publicConfig.claude_api_key_set).toBe(true);
    expect(publicConfig.draw_image_api_key).toBe('********');
    expect(publicConfig.draw_image_api_key_set).toBe(true);
  });

  it('does not treat example placeholders as configured credentials', () => {
    const config = envToConfig({
      OPENPRISM_LLM_API_KEY: 'your-api-key-here',
      OPENPRISM_CLAUDE_API_KEY: 'change-me-in-production',
      OPENPRISM_DRAW_IMAGE_API_KEY: 'your-image-api-key',
    });
    expect(config.llm_api_key).toBe('');
    expect(config.claude_api_key).toBe('');
    expect(config.draw_image_api_key).toBe('');
    expect(publicAppConfig(config)).toMatchObject({
      llm_api_key_set: false,
      claude_api_key_set: false,
      draw_image_api_key_set: false,
    });
  });
});

import {
  fetchWithProviderEndpointPolicy,
  initLLM,
  resolveHttpProviderConnectionInput,
  resolveLLMConfig,
  validateProviderEndpoint,
} from '../apps/backend/src/services/llmService.js';
import {
  validateEnvValue,
  writeConfigFileAtomic,
} from '../apps/backend/src/config/appConfig.js';

describe('env-backed LLM runtime config', () => {
  it('never combines a request-supplied endpoint with a server-side API key', () => {
    expect(() => resolveHttpProviderConnectionInput({
      input: { endpoint: 'https://attacker.example/v1' },
      configuredEndpoint: 'https://trusted.example/v1',
      configuredApiKey: 'server-secret',
    })).toThrowError(expect.objectContaining({ code: 'PROVIDER_CREDENTIAL_SOURCE_MISMATCH' }));

    expect(resolveHttpProviderConnectionInput({
      input: { endpoint: 'https://temporary.example/v1', apiKey: 'temporary-key' },
      configuredEndpoint: 'https://trusted.example/v1',
      configuredApiKey: 'server-secret',
    })).toEqual({ endpoint: 'https://temporary.example/v1', apiKey: 'temporary-key', source: 'request' });

    expect(resolveHttpProviderConnectionInput({
      input: {},
      configuredEndpoint: 'https://trusted.example/v1',
      configuredApiKey: 'server-secret',
    })).toEqual({ endpoint: 'https://trusted.example/v1', apiKey: 'server-secret', source: 'server' });
  });

  it('keeps resolved runtime config server-side for tool routes', async () => {
    await initLLM({
      llm_provider: 'openai-compatible',
      llm_api_key: 'server-only-key',
      llm_base_url: 'https://example.test/v1',
      llm_model: 'gpt-5.5',
    });

    expect(resolveLLMConfig()).toEqual({
      endpoint: 'https://example.test/v1',
      apiKey: 'server-only-key',
      model: 'gpt-5.5',
    });
  });

  it('blocks unsafe temporary Provider endpoints while preserving admin-configured LAN endpoints', async () => {
    const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
    const privateLookup = async () => [{ address: '10.30.0.2', family: 4 }];

    await expect(validateProviderEndpoint('file:///etc/passwd', { source: 'request', lookup: publicLookup }))
      .rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_PROTOCOL_NOT_ALLOWED' });
    await expect(validateProviderEndpoint('http://user:pass@example.test/v1', { source: 'request', lookup: publicLookup }))
      .rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_CREDENTIALS_NOT_ALLOWED' });
    await expect(validateProviderEndpoint('http://127.0.0.1:8787/v1', { source: 'request', lookup: publicLookup }))
      .rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_ADDRESS_NOT_ALLOWED' });
    await expect(validateProviderEndpoint('http://llm.internal.test/v1', { source: 'request', lookup: privateLookup }))
      .rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_ADDRESS_NOT_ALLOWED' });

    await expect(validateProviderEndpoint('http://10.30.0.2/v1', { source: 'server', lookup: privateLookup }))
      .resolves.toMatchObject({ hostname: '10.30.0.2' });
    await expect(validateProviderEndpoint('http://llm.internal.test/v1', {
      source: 'request',
      lookup: privateLookup,
      allowedHosts: ['llm.internal.test'],
    })).resolves.toMatchObject({ hostname: 'llm.internal.test' });
    await expect(validateProviderEndpoint('https://api.example.test/v1', { source: 'request', lookup: publicLookup }))
      .resolves.toMatchObject({ hostname: 'api.example.test' });
  });

  it('revalidates every redirect before a Provider request follows it', async () => {
    const calls = [];
    const fakeFetch = async (url) => {
      calls.push(String(url));
      return {
        ok: false,
        status: 302,
        statusText: 'Found',
        headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data' }),
      };
    };

    await expect(fetchWithProviderEndpointPolicy('https://api.example.test/v1/models', {}, {
      source: 'request',
      fetchImpl: fakeFetch,
      lookup: async hostname => hostname === 'api.example.test'
        ? [{ address: '93.184.216.34', family: 4 }]
        : [{ address: '169.254.169.254', family: 4 }],
    })).rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_ADDRESS_NOT_ALLOWED' });
    expect(calls).toEqual(['https://api.example.test/v1/models']);
  });

  it('pins the validated DNS result into the actual Provider connection', async () => {
    let lookupCalls = 0;
    const lookup = async () => {
      lookupCalls += 1;
      return lookupCalls === 1
        ? [{ address: '93.184.216.34', family: 4 }]
        : [{ address: '127.0.0.1', family: 4 }];
    };
    const transport = async (_url, _init, connection) => {
      expect(connection).toMatchObject({
        hostname: 'api.example.test',
        addresses: [{ address: '93.184.216.34', family: 4 }],
      });
      const pinned = await new Promise((resolve, reject) => {
        connection.lookup('api.example.test', {}, (error, address, family) => {
          if (error) reject(error);
          else resolve({ address, family });
        });
      });
      expect(pinned).toEqual({ address: '93.184.216.34', family: 4 });
      return new Response('{"data":[]}', { status: 200, headers: { 'content-type': 'application/json' } });
    };

    await expect(fetchWithProviderEndpointPolicy('https://api.example.test/v1/models', {}, {
      source: 'request',
      lookup,
      fetchImpl: transport,
    })).resolves.toMatchObject({ status: 200 });
    expect(lookupCalls).toBe(1);
  });

  it('uses one DNS resolution for validation and the real socket connection', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.setHeader('connection', 'close');
      response.end('{"data":[{"id":"pinned-model"}]}');
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    let lookupCalls = 0;
    try {
      const response = await fetchWithProviderEndpointPolicy(`http://provider.test:${address.port}/v1/models`, {}, {
        source: 'server',
        lookup: async () => {
          lookupCalls += 1;
          return lookupCalls === 1
            ? [{ address: '127.0.0.1', family: 4 }]
            : [{ address: '203.0.113.10', family: 4 }];
        },
      });
      await expect(response.json()).resolves.toEqual({ data: [{ id: 'pinned-model' }] });
      expect(lookupCalls).toBe(1);
    } finally {
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('does not apply the response-header timeout to an active streaming body', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain', connection: 'close' });
      response.write('first');
      setTimeout(() => response.end('-second'), 80);
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    try {
      const response = await fetchWithProviderEndpointPolicy(`http://provider.test:${address.port}/stream`, {}, {
        source: 'server',
        timeoutMs: 30,
        streamIdleTimeoutMs: 150,
        lookup: async () => [{ address: '127.0.0.1', family: 4 }],
      });
      await expect(response.text()).resolves.toBe('first-second');
    } finally {
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('classifies waiting-for-headers and response-idle timeouts separately', async () => {
    const headerServer = createServer(() => {});
    await new Promise((resolve, reject) => {
      headerServer.once('error', reject);
      headerServer.listen(0, '127.0.0.1', resolve);
    });
    const headerAddress = headerServer.address();
    try {
      await expect(fetchWithProviderEndpointPolicy(`http://provider.test:${headerAddress.port}/headers`, {}, {
        source: 'server',
        timeoutMs: 30,
        streamIdleTimeoutMs: 150,
        lookup: async () => [{ address: '127.0.0.1', family: 4 }],
      })).rejects.toMatchObject({ code: 'PROVIDER_CONNECT_TIMEOUT' });
    } finally {
      headerServer.closeAllConnections?.();
      await new Promise(resolve => headerServer.close(resolve));
    }

    const idleServer = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain', connection: 'close' });
      response.write('partial');
    });
    await new Promise((resolve, reject) => {
      idleServer.once('error', reject);
      idleServer.listen(0, '127.0.0.1', resolve);
    });
    const idleAddress = idleServer.address();
    try {
      const response = await fetchWithProviderEndpointPolicy(`http://provider.test:${idleAddress.port}/idle`, {}, {
        source: 'server',
        timeoutMs: 100,
        streamIdleTimeoutMs: 30,
        lookup: async () => [{ address: '127.0.0.1', family: 4 }],
      });
      await expect(response.text()).rejects.toMatchObject({ code: 'PROVIDER_STREAM_IDLE_TIMEOUT' });
    } finally {
      idleServer.closeAllConnections?.();
      await new Promise(resolve => idleServer.close(resolve));
    }
  });
});

describe('config persistence safety', () => {
  it('rejects line-break and NUL injection in dotenv values', () => {
    for (const value of ['https://example.test\nINJECTED=value', 'model\rOTHER=value', 'bad\0value']) {
      expect(() => validateEnvValue(value)).toThrowError(expect.objectContaining({
        code: 'INVALID_CONFIG_VALUE',
        statusCode: 400,
      }));
    }
    expect(validateEnvValue('https://example.test/v1')).toBe('https://example.test/v1');
  });

  it('atomically preserves the previous config when rename fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'paper-config-atomic-'));
    const filePath = join(dir, '.env');
    await writeFile(filePath, 'ORIGINAL=1\n', 'utf8');
    try {
      await expect(writeConfigFileAtomic(filePath, 'REPLACEMENT=1\n', {
        rename: async () => { throw new Error('simulated rename failure'); },
      })).rejects.toThrow('simulated rename failure');
      expect(await readFile(filePath, 'utf8')).toBe('ORIGINAL=1\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
