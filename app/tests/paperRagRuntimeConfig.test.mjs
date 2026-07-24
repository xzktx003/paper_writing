import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { resolveVisionLlmConfig } from '../apps/backend/src/routes/paperRag.js';

describe('Paper RAG runtime Provider configuration', () => {
  it('prefers the current mutable app config over startup environment values', () => {
    expect(resolveVisionLlmConfig({
      llm_base_url: 'http://runtime-provider/v1',
      llm_api_key: 'runtime-key',
      llm_model: 'runtime-vision-model',
    }, {
      OPENPRISM_LLM_BASE_URL: 'http://startup-provider/v1',
      OPENPRISM_LLM_API_KEY: 'startup-key',
      OPENPRISM_LLM_MODEL: 'startup-model',
    })).toEqual({
      baseUrl: 'http://runtime-provider/v1',
      apiKey: 'runtime-key',
      model: 'runtime-vision-model',
    });
  });

  it('allows an explicit probe model without discarding current credentials', () => {
    expect(resolveVisionLlmConfig({
      llm_base_url: 'http://runtime-provider/v1',
      llm_api_key: 'runtime-key',
      llm_model: 'default-model',
    }, {}, 'probe-vision-model')).toMatchObject({
      baseUrl: 'http://runtime-provider/v1',
      apiKey: 'runtime-key',
      model: 'probe-vision-model',
    });
  });

  it('wires the live appConfig object into RAG routes at startup', async () => {
    const indexSource = await readFile(new URL('../apps/backend/src/index.js', import.meta.url), 'utf8');
    expect(indexSource).toContain('registerPaperRagRoutes(fastify, { getAppConfig: () => appConfig })');
  });
});
