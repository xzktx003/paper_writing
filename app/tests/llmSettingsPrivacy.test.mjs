import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('LLM settings privacy', () => {
  it('does not cache LLM API key/base/model in browser localStorage', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/ProjectPage.tsx'), 'utf8');
    expect(source).toContain('Never hydrate API keys from browser storage');
    expect(source).toContain('delete parsed.llmApiKey');
    expect(source).not.toContain('localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))');
  });

  it('does not send browser-cached LLM API keys from transfer flows', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/TransferPanel.tsx'), 'utf8');
    expect(source).toContain('LLM config is resolved server-side from the repository .env');
    expect(source).not.toContain('readLLMFromStorage');
    expect(source).not.toContain('apiKey: llmApiKey');
  });

  it('masks config secrets in the public config endpoint', async () => {
    const source = await readFile(join(process.cwd(), 'apps/backend/src/index.js'), 'utf8');
    const configSource = await readFile(join(process.cwd(), 'apps/backend/src/config/appConfig.js'), 'utf8');
    expect(source).toContain("fastify.get('/api/config', async () => publicAppConfig(appConfig))");
    expect(configSource).toContain("llm_api_key: hasLlmApiKey ? MASKED_SECRET : ''");
    expect(configSource).toContain("claude_api_key: hasClaudeApiKey ? MASKED_SECRET : ''");
  });
});
