import { describe, it, expect } from 'vitest';
import { loadAppConfig } from '../apps/backend/src/config/appConfig.js';

describe('App Config', () => {
  it('loadAppConfig returns config with required fields', async () => {
    const config = await loadAppConfig();
    expect(config).toHaveProperty('claude_api_key');
    expect(config).toHaveProperty('claude_model');
    expect(config).toHaveProperty('claude_base_url');
    expect(config).toHaveProperty('claude_ca_cert');
    expect(config).toHaveProperty('projects_dir');
  });

  it('accepts an optional HTTP(S) Claude provider URL from local configuration', async () => {
    const config = await loadAppConfig();
    expect(config.claude_base_url).toBeTypeOf('string');
    if (config.claude_base_url) {
      expect(['http:', 'https:']).toContain(new URL(config.claude_base_url).protocol);
    }
  });

  it('config has correct CA cert path', async () => {
    const config = await loadAppConfig();
    expect(config.claude_ca_cert).toContain('caddy-root.crt');
  });

  it('config model is a valid Claude model', async () => {
    const config = await loadAppConfig();
    expect(config.claude_model).toMatch(/claude/);
  });
});
