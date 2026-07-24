import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('LLM settings privacy', () => {
  it('does not cache LLM API key/base/model in browser localStorage', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/SettingsModal.tsx'), 'utf8');
    expect(source).toContain('Never hydrate API keys from browser storage');
    expect(source).toContain('delete parsed.llmEndpoint');
    expect(source).toContain('delete parsed.llmApiKey');
    expect(source).toContain('delete parsed.llmModel');
    expect(source).toContain("llmApiKey: ''");
    expect(source).not.toContain('localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))');
  });

  it('does not send browser-cached LLM API keys from transfer flows', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/TransferPanel.tsx'), 'utf8');
    expect(source).toContain('LLM config is resolved server-side from the repository .env');
    expect(source).not.toContain('readLLMFromStorage');
    expect(source).not.toContain('apiKey: llmApiKey');
  });

  it('keeps config behind authentication and masks secrets for authenticated responses', async () => {
    const source = await readFile(join(process.cwd(), 'apps/backend/src/index.js'), 'utf8');
    const authSource = await readFile(join(process.cwd(), 'apps/backend/src/middleware/auth.js'), 'utf8');
    const configSource = await readFile(join(process.cwd(), 'apps/backend/src/config/appConfig.js'), 'utf8');
    expect(source).toContain("fastify.get('/api/config', async () => publicAppConfig(appConfig))");
    expect(authSource).not.toContain("'GET /api/config'");
    expect(configSource).toContain("llm_api_key: hasLlmApiKey ? MASKED_SECRET : ''");
    expect(configSource).toContain("claude_api_key: hasClaudeApiKey ? MASKED_SECRET : ''");
    expect(configSource).toContain("draw_image_api_key: hasDrawImageApiKey ? MASKED_SECRET : ''");
    expect(configSource).toContain('draw_image_api_key_set: hasDrawImageApiKey');
  });

  it('keeps the Draw image key out of browser storage while allowing an authenticated config save', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/DrawPanel.tsx'), 'utf8');
    expect(source).not.toContain("localStorage.getItem('draw_api_settings')");
    expect(source).not.toContain("localStorage.setItem('draw_api_settings'");
    expect(source).not.toContain('apiSettings:');
    expect(source).not.toContain('projectName:');
    expect(source).not.toContain('?projectName=');
    expect(source).toContain("authenticatedFetch('/api/config', {");
    expect(source).toContain('draw_image_api_key: imageSettings.apiKey');
  });
});
