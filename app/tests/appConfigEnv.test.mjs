import { describe, it, expect } from 'vitest';
import { parseEnv, publicAppConfig } from '../apps/backend/src/config/appConfig.js';

describe('env-backed app config helpers', () => {
  it('parses dotenv values without exposing secrets through public config', () => {
    const parsed = parseEnv(`\nOPENPRISM_LLM_API_KEY=secret-value\nOPENPRISM_LLM_BASE_URL=https://example.test/v1\nOPENPRISM_LLM_MODEL=gpt-5.5\n`);
    expect(parsed.values.OPENPRISM_LLM_BASE_URL).toBe('https://example.test/v1');
    expect(parsed.values.OPENPRISM_LLM_API_KEY).toBe('secret-value');

    const publicConfig = publicAppConfig({
      llm_api_key: parsed.values.OPENPRISM_LLM_API_KEY,
      claude_api_key: parsed.values.OPENPRISM_LLM_API_KEY,
      llm_base_url: parsed.values.OPENPRISM_LLM_BASE_URL,
      llm_model: parsed.values.OPENPRISM_LLM_MODEL,
    });
    expect(publicConfig.llm_api_key).toBe('********');
    expect(publicConfig.claude_api_key).toBe('********');
    expect(publicConfig.llm_api_key_set).toBe(true);
    expect(publicConfig.claude_api_key_set).toBe(true);
  });
});

import { initLLM, resolveLLMConfig } from '../apps/backend/src/services/llmService.js';

describe('env-backed LLM runtime config', () => {
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
});
