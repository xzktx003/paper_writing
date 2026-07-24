import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('Provider settings and server access token contract', () => {
  it('keeps the server token session-scoped and installs one same-origin API auth path', async () => {
    const access = await readFile(join(process.cwd(), 'apps/frontend/src/api/serverAccess.ts'), 'utf8');
    const main = await readFile(join(process.cwd(), 'apps/frontend/src/main.tsx'), 'utf8');
    const fetchClient = await readFile(join(process.cwd(), 'apps/frontend/src/app/api/fetchClient.ts'), 'utf8');
    expect(access).toContain('sessionStorage');
    expect(access).not.toContain('localStorage');
    expect(access).toContain("url.pathname.startsWith('/api/')");
    expect(access).toContain('Authorization');
    expect(main).toContain('installServerAccessFetch');
    expect(fetchClient).not.toContain("localStorage.getItem('api_token')");
  });

  it('offers all providers and awaits save/test operations without closing on failure', async () => {
    const settings = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/SettingsModal.tsx'), 'utf8');
    for (const provider of ['openai-compatible', 'anthropic', 'codex-cli', 'claude-cli', 'copilot-cli']) {
      expect(settings).toContain(provider);
    }
    expect(settings).toContain('await saveLLMSettingsToBackend');
    expect(settings).toContain('await probeProvider');
    expect(settings).toContain('setSaveState');
    expect(settings).toContain('setTestState');
    expect(settings).toContain("testState !== 'success'");
    expect(settings).toContain('Verify the provider connection before saving');
    expect(settings).toContain('clearServerAccessToken');
    expect(settings).toContain('setServerAccessToken');
    expect(settings).toContain('disabled={!provider.available}');
    expect(settings).toContain("provider.available ? provider.label : `${provider.label} — ${t('unavailable')}`");
  });

  it('loads HTTP models from the current unsaved endpoint and credential', async () => {
    const settings = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/SettingsModal.tsx'), 'utf8');
    expect(settings).toContain("fetch(`/api/providers/${form.provider}/models`, {");
    expect(settings).toContain("method: 'POST'");
    expect(settings).toContain('endpoint: form.llmEndpoint');
    expect(settings).toContain('apiKey: form.llmApiKey');
  });

  it('reuses the persisted provider credential only while the saved endpoint is unchanged', async () => {
    const settings = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/SettingsModal.tsx'), 'utf8');
    expect(settings).toContain('persistedSettings');
    expect(settings).toContain('usesPersistedHttpConnection');
    expect(settings).toContain('form.llmEndpoint.trim() === persistedSettings.llmEndpoint.trim()');
    expect(settings).toContain("t('Re-enter the model API key after changing the provider endpoint.')");
  });

  it('guides first-time users through server access, provider credentials, and verification as separate steps', async () => {
    const settings = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/SettingsModal.tsx'), 'utf8');
    expect(settings).toContain('data-testid="provider-setup-guide"');
    expect(settings).toContain('data-testid="setup-step-server-access"');
    expect(settings).toContain('data-testid="setup-step-provider"');
    expect(settings).toContain('data-testid="setup-step-credentials"');
    expect(settings).toContain('data-testid="setup-step-connection"');
    expect(settings).toContain('Server access token protects this Paper Writer server; it is not a model API key.');
    expect(settings).toContain('HTTP providers need an API endpoint and credential. CLI providers use a server-installed, already signed-in executable.');
    expect(settings).toContain('CLI providers are read-only Chat providers here; file-changing tasks require the separate reviewable Task Agent workflow.');
    expect(settings).toContain('htmlFor="paper-writer-provider"');
    expect(settings).toContain('id="paper-writer-provider"');
  });
});
