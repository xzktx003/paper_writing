import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

import {
  CLI_PROVIDER_SPECS,
  createAgentProviderRegistry,
  filterProviderEnv,
} from '../apps/backend/src/services/agentProviderRegistry.js';

function fakeChild({ stdout = '', stderr = '', code = 0, hold = false } = {}) {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  queueMicrotask(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    if (!hold) child.emit('close', code, null);
  });
  return child;
}

describe('AgentProvider registry', () => {
  it('exposes stable metadata and capabilities for HTTP and fixed CLI providers', () => {
    const registry = createAgentProviderRegistry({
      apiTokenConfigured: true,
      projectRootResolver: async () => '/managed/project',
    });
    const metadata = registry.listMetadata();
    expect(metadata.map((item) => item.id)).toEqual([
      'openai-compatible',
      'anthropic',
      'codex-cli',
      'claude-cli',
      'copilot-cli',
    ]);
    expect(metadata.find((item) => item.id === 'codex-cli')?.capabilities).toMatchObject({
      probe: true,
      invoke: true,
      stream: false,
      cancel: true,
      listModels: false,
      provenance: true,
    });
    expect(CLI_PROVIDER_SPECS['codex-cli'].executable).toBe('codex');
    expect(CLI_PROVIDER_SPECS['claude-cli'].executable).toBe('claude');
    expect(CLI_PROVIDER_SPECS['copilot-cli'].executable).toBe('copilot');
  });

  it('fails closed for every CLI execution surface when server auth is not configured', async () => {
    const spawnImpl = vi.fn();
    const registry = createAgentProviderRegistry({
      spawnImpl,
      apiTokenConfigured: false,
      projectRootResolver: async () => '/managed/project',
    });
    const metadata = registry.listMetadata().find((item) => item.id === 'codex-cli');
    expect(metadata.available).toBe(false);
    expect(metadata.unavailableReason).toMatch(/OPENPRISM_API_TOKEN/);
    await expect(registry.probe('codex-cli')).rejects.toMatchObject({ statusCode: 503 });
    await expect(registry.invoke('codex-cli', { projectId: 'p1', prompt: 'hello' })).rejects.toMatchObject({ statusCode: 503 });
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('lists CLI readiness from installation and authentication probes instead of the server token alone', async () => {
    const spawnImpl = vi.fn((executable, args) => {
      if (executable === 'codex' && args.join(' ') === '--version') {
        return fakeChild({ stdout: 'codex-cli 1.0.0\n' });
      }
      if (executable === 'codex' && args.join(' ') === 'login status') {
        return fakeChild({ stdout: 'Logged in\n' });
      }
      if (executable === 'claude') {
        const error = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
        throw error;
      }
      if (executable === 'copilot' && args.join(' ') === '--version') {
        return fakeChild({ stdout: 'GitHub Copilot CLI 1.0.0\n' });
      }
      throw new Error(`Unexpected probe: ${executable} ${args.join(' ')}`);
    });
    const registry = createAgentProviderRegistry({
      spawnImpl,
      env: { PATH: '/bin' },
      apiTokenConfigured: true,
      projectRootResolver: async () => '/managed/project',
    });

    const metadata = await registry.listReadinessMetadata();
    expect(metadata.find((item) => item.id === 'codex-cli')).toMatchObject({
      installed: true,
      authenticated: true,
      authStatus: 'authenticated',
      available: true,
    });
    expect(metadata.find((item) => item.id === 'claude-cli')).toMatchObject({
      installed: false,
      authenticated: false,
      authStatus: 'not-authenticated',
      available: false,
    });
    expect(metadata.find((item) => item.id === 'copilot-cli')).toMatchObject({
      installed: true,
      authenticated: false,
      authStatus: 'unknown',
      available: false,
    });
  });

  it('resolves cwd only from projectId and uses a fixed executable plus argument array', async () => {
    const spawnImpl = vi.fn(() => fakeChild({ stdout: '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}\n' }));
    const projectRootResolver = vi.fn(async (projectId, options) => {
      expect(projectId).toBe('paper-1');
      expect(options).toEqual({ allowMissing: false });
      return '/managed/paper-1';
    });
    const registry = createAgentProviderRegistry({
      spawnImpl,
      projectRootResolver,
      apiTokenConfigured: true,
      providerVersions: { 'codex-cli': 'codex-cli test' },
    });

    const result = await registry.invoke('codex-cli', {
      projectId: 'paper-1',
      prompt: 'Summarize the paper',
      model: 'gpt-test',
      executable: '/tmp/evil',
      args: ['--dangerously-bypass-approvals-and-sandbox'],
      cwd: '/tmp/escape',
    });

    expect(spawnImpl).toHaveBeenCalledTimes(1);
    const [executable, args, options] = spawnImpl.mock.calls[0];
    expect(executable).toBe('codex');
    expect(args).toEqual(expect.arrayContaining(['exec', '--json', '--ephemeral', '-m', 'gpt-test', 'Summarize the paper']));
    expect(args).toEqual(expect.arrayContaining(['--sandbox', 'read-only']));
    expect(args).not.toContain('workspace-write');
    expect(args).not.toContain('/tmp/evil');
    expect(args).not.toContain('/tmp/escape');
    expect(options.cwd).toBe('/managed/paper-1');
    expect(options.shell).toBe(false);
    expect(result.content[0].text).toBe('done');
    expect(result.provenance).toMatchObject({
      provider: 'codex-cli',
      version: 'codex-cli test',
      model: 'gpt-test',
      exitCode: 0,
      exitStatus: 'success',
    });
  });

  it('does not expose raw CLI event output as user tokens, while preserving cancellation and diagnostics', async () => {
    let child;
    const spawnImpl = vi.fn(() => {
      child = fakeChild({ hold: true });
      return child;
    });
    const killTree = vi.fn(async () => child.emit('close', null, 'SIGTERM'));
    const registry = createAgentProviderRegistry({
      spawnImpl,
      killTree,
      apiTokenConfigured: true,
      projectRootResolver: async () => '/managed/project',
      providerVersions: { 'claude-cli': 'claude test' },
    });
    const chunks = [];
    const running = registry.stream('claude-cli', {
      requestId: 'req-1',
      projectId: 'paper-1',
      prompt: 'hello',
      onToken: (chunk) => chunks.push(chunk),
    });
    await vi.waitFor(() => expect(spawnImpl).toHaveBeenCalled());
    child.stdout.emit('data', Buffer.from('{"type":"content_block_delta","delta":{"text":"partial"}}\n'));
    child.stderr.emit('data', Buffer.from('warning'));
    expect(await registry.cancel('req-1')).toEqual({ cancelled: true, requestId: 'req-1' });
    const result = await running;
    expect(chunks).toEqual([]);
    expect(killTree).toHaveBeenCalledWith(child);
    expect(result.provenance).toMatchObject({ exitCode: null, signal: 'SIGTERM', exitStatus: 'cancelled' });
    expect(result.stderr).toContain('warning');
  });

  it('rejects image and structured blocks for read-only CLI Chat instead of dropping them', async () => {
    const spawnImpl = vi.fn(() => fakeChild({ stdout: '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}\n' }));
    const registry = createAgentProviderRegistry({
      spawnImpl,
      apiTokenConfigured: true,
      providerVersions: { 'codex-cli': 'codex test' },
      projectRootResolver: async () => '/managed/project',
    });
    await expect(registry.invoke('codex-cli', {
      projectId: 'paper-1',
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', data: 'abc' } }] }],
    })).rejects.toMatchObject({ code: 'PROVIDER_CAPABILITY_UNSUPPORTED' });
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('passes only a fixed minimal environment plus provider-specific auth variables', () => {
    const filtered = filterProviderEnv({
      PATH: '/bin', HOME: '/home/test', LANG: 'C.UTF-8',
      OPENAI_API_KEY: 'allowed-for-codex',
      AWS_SECRET_ACCESS_KEY: 'must-not-leak',
      DATABASE_PASSWORD: 'must-not-leak',
      OPENPRISM_API_TOKEN: 'must-not-leak',
      RANDOM_VALUE: 'must-not-leak',
    }, 'codex-cli');
    expect(filtered).toMatchObject({ PATH: '/bin', HOME: '/home/test', LANG: 'C.UTF-8', OPENAI_API_KEY: 'allowed-for-codex' });
    expect(filtered).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
    expect(filtered).not.toHaveProperty('DATABASE_PASSWORD');
    expect(filtered).not.toHaveProperty('OPENPRISM_API_TOKEN');
    expect(filtered).not.toHaveProperty('RANDOM_VALUE');
  });

  it('redacts credential-shaped output before it reaches responses or provenance consumers', async () => {
    const spawnImpl = vi.fn(() => fakeChild({ stdout: 'token=super-secret-token sk-AbCd12***Z9\n' }));
    const registry = createAgentProviderRegistry({
      spawnImpl,
      env: { PATH: '/bin', OPENAI_API_KEY: 'super-secret-token' },
      apiTokenConfigured: true,
      providerVersions: { 'codex-cli': 'codex test' },
      projectRootResolver: async () => '/managed/project',
    });
    const result = await registry.invoke('codex-cli', { projectId: 'paper-1', prompt: 'hello' });
    expect(result.stdout).not.toContain('super-secret-token');
    expect(result.stdout).not.toContain('sk-AbCd12');
    expect(result.stdout).toContain('[REDACTED]');
  });
});
