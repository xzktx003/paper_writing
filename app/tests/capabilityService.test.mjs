import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

import {
  createCapabilityProbeRunner,
  createCapabilityService,
} from '../apps/backend/src/services/capabilityService.js';

const PROVIDERS = [
  { id: 'openai-compatible', label: 'OpenAI-compatible API', type: 'http' },
  { id: 'anthropic', label: 'Anthropic API', type: 'http' },
  { id: 'codex-cli', label: 'Codex CLI', type: 'cli' },
  { id: 'claude-cli', label: 'Claude Code CLI', type: 'cli' },
  { id: 'copilot-cli', label: 'GitHub Copilot CLI', type: 'cli' },
];

describe('System capability service', () => {
  it('terminates the detached process tree and escalates through the shared runner on timeout', async () => {
    vi.useFakeTimers();
    try {
      const child = new EventEmitter();
      child.pid = 4242;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      const spawnImpl = vi.fn(() => child);
      const killTree = vi.fn(async () => {});
      const probe = createCapabilityProbeRunner({ spawnImpl, killTree });

      const pending = probe('codex', ['--version'], 25);
      const rejection = expect(pending).rejects.toMatchObject({ code: 'PROBE_TIMEOUT' });
      await vi.advanceTimersByTimeAsync(25);

      await rejection;
      expect(killTree).toHaveBeenCalledWith(child);
      expect(spawnImpl).toHaveBeenCalledWith('codex', ['--version'], expect.objectContaining({
        shell: false,
        detached: process.platform !== 'win32',
        env: expect.objectContaining({
          PATH: process.env.PATH || '',
          HOME: process.env.HOME || '',
        }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns the stable schema, all required groups, and safe details without login or model calls', async () => {
    const probeCommand = vi.fn(async (command) => ({
      available: ['codex', 'pdflatex', 'pandoc', 'pdftotext', 'tmux'].includes(command),
      version: command === 'codex' ? 'codex-cli 1.2.3 /home/private' : `${command} 1.0`,
    }));
    const service = createCapabilityService({
      now: () => new Date('2026-07-22T01:02:03.000Z'),
      ttlMs: 60_000,
      env: {
        OPENPRISM_API_TOKEN: 'top-secret-token',
        SEMANTIC_SCHOLAR_API_KEY: 'semantic-secret',
        HOME: '/home/private',
      },
      dataDir: '/home/private/papers',
      appConfig: {
        llm_provider: 'openai-compatible',
        llm_base_url: 'https://example.test/v1',
        llm_api_key: 'sk-private-value',
        claude_base_url: '',
        claude_api_key: '',
      },
      providerMetadata: () => PROVIDERS,
      probeCommand,
      checkDataRoot: async () => ({ writable: true }),
      getSkillsSummary: () => ({ count: 123, loadErrors: [{ source: '/home/private/bad.yaml', message: 'bad token' }] }),
    });

    const result = await service.inspect();
    expect(result).toMatchObject({ schemaVersion: 1, checkedAt: '2026-07-22T01:02:03.000Z' });
    expect(result.capabilities.map((item) => item.id)).toEqual([
      'security.authentication',
      'storage.project-data',
      'provider.openai-compatible',
      'provider.anthropic',
      'provider.codex-cli',
      'provider.claude-cli',
      'provider.copilot-cli',
      'document.tex',
      'document.pandoc',
      'document.pdf-ocr',
      'skills.catalog',
      'terminal.tmux',
      'retrieval.external',
    ]);
    for (const item of result.capabilities) {
      expect(item).toEqual(expect.objectContaining({
        id: expect.any(String),
        label: expect.any(String),
        status: expect.stringMatching(/^(available|degraded|unavailable|unknown)$/),
        reason: expect.any(String),
        checkedAt: '2026-07-22T01:02:03.000Z',
        details: expect.any(Object),
      }));
    }
    expect(result.capabilities.find((item) => item.id === 'provider.codex-cli')?.status).toBe('available');
    expect(result.capabilities.find((item) => item.id === 'provider.claude-cli')?.status).toBe('unavailable');
    expect(result.capabilities.find((item) => item.id === 'skills.catalog')).toMatchObject({
      status: 'degraded',
      details: { count: 123, loadErrorCount: 1 },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('top-secret-token');
    expect(serialized).not.toContain('semantic-secret');
    expect(serialized).not.toContain('sk-private-value');
    expect(serialized).not.toContain('/home/private');
    expect(probeCommand.mock.calls.flat().join(' ')).not.toMatch(/login|auth|model|invoke/i);
  });

  it('isolates failed probes and caches default inspection until refresh is explicitly requested', async () => {
    let clock = 0;
    const probeCommand = vi.fn(async (command) => {
      if (command === 'pandoc') throw new Error('spawn exploded with TOKEN=secret');
      return { available: false, version: '' };
    });
    const service = createCapabilityService({
      now: () => new Date(1_700_000_000_000 + clock),
      ttlMs: 60_000,
      env: { OPENPRISM_API_TOKEN: 'secret' },
      dataDir: '/private/root',
      appConfig: {},
      providerMetadata: () => PROVIDERS,
      probeCommand,
      checkDataRoot: async () => { throw new Error('permission denied: /private/root'); },
      getSkillsSummary: () => ({ count: 0, loadErrors: [] }),
    });

    const first = await service.inspect();
    const firstCallCount = probeCommand.mock.calls.length;
    const second = await service.inspect();
    expect(probeCommand).toHaveBeenCalledTimes(firstCallCount);
    expect(second.cache.cached).toBe(true);
    expect(first.capabilities.find((item) => item.id === 'document.pandoc')?.status).toBe('unknown');
    expect(first.capabilities.find((item) => item.id === 'storage.project-data')?.status).toBe('unavailable');
    expect(JSON.stringify(first)).not.toContain('/private/root');
    expect(JSON.stringify(first)).not.toContain('TOKEN=secret');

    clock = 1_000;
    await service.inspect({ refresh: true });
    expect(probeCommand.mock.calls.length).toBeGreaterThan(firstCallCount);
  });
});
