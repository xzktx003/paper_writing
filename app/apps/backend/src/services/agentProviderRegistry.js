import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { getProjectRoot } from './projectLocator.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 5_000;
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;

const BASE_ENV_KEYS = new Set([
  'PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TMPDIR', 'TEMP', 'TMP',
  'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
]);

const PROVIDER_ENV_KEYS = {
  'codex-cli': new Set(['OPENAI_API_KEY', 'CODEX_ACCESS_TOKEN', 'CODEX_HOME']),
  'claude-cli': new Set(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR']),
  'copilot-cli': new Set(['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN', 'COPILOT_HOME']),
};

export const CLI_PROVIDER_SPECS = Object.freeze({
  'codex-cli': Object.freeze({
    id: 'codex-cli',
    label: 'Codex CLI',
    executable: 'codex',
    versionArgs: ['--version'],
    authArgs: ['login', 'status'],
    buildArgs: ({ prompt, model }) => [
      'exec', '--json', '--ephemeral', '--sandbox', 'read-only',
      ...(model ? ['-m', model] : []),
      prompt,
    ],
    parseOutput: parseCodexOutput,
  }),
  'claude-cli': Object.freeze({
    id: 'claude-cli',
    label: 'Claude Code CLI',
    executable: 'claude',
    versionArgs: ['--version'],
    authArgs: ['auth', 'status', '--json'],
    buildArgs: ({ prompt, model }) => [
      '--print', '--output-format', 'stream-json', '--include-partial-messages',
      '--no-session-persistence', '--permission-mode', 'dontAsk', '--tools', '',
      ...(model ? ['--model', model] : []),
      prompt,
    ],
    parseOutput: parseClaudeOutput,
  }),
  'copilot-cli': Object.freeze({
    id: 'copilot-cli',
    label: 'GitHub Copilot CLI',
    executable: 'copilot',
    versionArgs: ['--version'],
    authArgs: null,
    buildArgs: ({ prompt, model }) => [
      '--prompt', prompt, '--output-format', 'json', '--no-custom-instructions',
      '--available-tools', '', '--no-ask-user', '--no-auto-update',
      ...(model ? ['--model', model] : []),
    ],
    parseOutput: parseCopilotOutput,
  }),
});

const CLI_CAPABILITIES = Object.freeze({
  probe: true,
  listModels: false,
  invoke: true,
  stream: false,
  cancel: true,
  provenance: true,
  toolCalling: false,
  imageInput: false,
  documentInput: false,
});

const HTTP_CAPABILITIES = Object.freeze({
  probe: true,
  listModels: true,
  invoke: true,
  stream: true,
  cancel: false,
  provenance: true,
  toolCalling: true,
  imageInput: true,
  documentInput: true,
});

function boundedAppend(current, chunk) {
  if (current.length >= MAX_CAPTURE_BYTES) return current;
  return `${current}${String(chunk)}`.slice(0, MAX_CAPTURE_BYTES);
}

function redactSensitiveValues(value, sourceEnv) {
  let result = String(value || '');
  for (const [key, secret] of Object.entries(sourceEnv || {})) {
    if (!/(?:TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL)/i.test(key)) continue;
    if (typeof secret !== 'string' || secret.length < 6) continue;
    result = result.split(secret).join('[REDACTED]');
  }
  return result
    .replace(/\bsk-[A-Za-z0-9_*.-]{6,}\b/g, '[REDACTED]')
    .replace(/\b(?:github_pat_|ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_*.-]{6,}\b/g, '[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, 'Bearer [REDACTED]');
}

function parseJsonLines(stdout) {
  return String(stdout || '').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function parseCodexOutput(stdout) {
  const events = parseJsonLines(stdout);
  const messages = events
    .filter((event) => event.type === 'item.completed' && event.item?.type === 'agent_message')
    .map((event) => event.item.text)
    .filter(Boolean);
  return messages.at(-1) || String(stdout || '').trim();
}

function parseClaudeOutput(stdout) {
  const events = parseJsonLines(stdout);
  const result = events.findLast?.((event) => event.type === 'result');
  if (typeof result?.result === 'string') return result.result;
  const text = events.flatMap((event) => event.message?.content || [])
    .filter((block) => block?.type === 'text')
    .map((block) => block.text)
    .filter(Boolean);
  return text.at(-1) || String(stdout || '').trim();
}

function parseCopilotOutput(stdout) {
  const events = parseJsonLines(stdout);
  const text = events.map((event) => event.content || event.message || event.text).filter((value) => typeof value === 'string');
  return text.at(-1) || String(stdout || '').trim();
}

export function filterProviderEnv(sourceEnv = process.env, providerId) {
  const allowed = new Set([...BASE_ENV_KEYS, ...(PROVIDER_ENV_KEYS[providerId] || [])]);
  const result = {};
  for (const key of allowed) {
    if (typeof sourceEnv[key] === 'string') result[key] = sourceEnv[key];
  }
  return result;
}

export function terminateProcessTree(child) {
  return new Promise((resolve) => {
    if (!child?.pid) return resolve();
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    } catch {
      try { child.kill('SIGTERM'); } catch {}
    }
    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch {
        try { child.kill('SIGKILL'); } catch {}
      }
      resolve();
    }, 1_500);
    timer.unref?.();
    child.once?.('close', () => { clearTimeout(timer); resolve(); });
  });
}

function disabledError() {
  return Object.assign(new Error('CLI providers are disabled until OPENPRISM_API_TOKEN is configured'), {
    statusCode: 503,
    code: 'CLI_PROVIDER_AUTH_REQUIRED',
  });
}

function unsupported(message) {
  return Object.assign(new Error(message), { statusCode: 400, code: 'PROVIDER_CAPABILITY_UNSUPPORTED' });
}

function promptFromRequest(input = {}) {
  if (input.prompt) return String(input.prompt);
  const parts = [];
  if (input.systemPrompt) parts.push(`System instructions:\n${input.systemPrompt}`);
  for (const message of input.messages || []) {
    if (Array.isArray(message.content) && message.content.some((block) => block?.type !== 'text')) {
      throw unsupported('CLI providers do not support image or structured attachment blocks in Chat.');
    }
    const content = typeof message.content === 'string'
      ? message.content
      : (message.content || []).filter((block) => block?.type === 'text').map((block) => block.text).join('\n');
    if (content) parts.push(`${message.role || 'user'}:\n${content}`);
  }
  return parts.join('\n\n').trim();
}

function createProcessRunner({ spawnImpl, killTree, sourceEnv, active }) {
  return async function run(spec, input, { probe = false } = {}) {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const requestId = String(input.requestId || crypto.randomUUID());
    const timeoutMs = Math.max(250, Math.min(Number(input.timeoutMs) || (probe ? PROBE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS), 10 * 60_000));
    const cwd = probe ? process.cwd() : await input.projectRootResolver(String(input.projectId || ''), { allowMissing: false });
    const args = probe ? input.args : spec.buildArgs({ prompt: promptFromRequest(input), model: input.model || '' });

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let cancelled = false;
      let settled = false;
      let child;
      try {
        child = spawnImpl(spec.executable, args, {
          cwd,
          env: filterProviderEnv(sourceEnv, spec.id),
          shell: false,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(error);
        return;
      }
      active.set(requestId, {
        child,
        cancel: async () => { cancelled = true; await killTree(child); },
      });
      child.stdout?.on('data', (chunk) => {
        stdout = boundedAppend(stdout, chunk);
      });
      child.stderr?.on('data', (chunk) => { stderr = boundedAppend(stderr, chunk); });
      const timer = setTimeout(async () => {
        timedOut = true;
        await killTree(child);
      }, timeoutMs);
      timer.unref?.();
      if (input.signal) {
        if (input.signal.aborted) active.get(requestId)?.cancel();
        else input.signal.addEventListener('abort', () => active.get(requestId)?.cancel(), { once: true });
      }
      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        active.delete(requestId);
        reject(error);
      });
      child.once('close', (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        active.delete(requestId);
        const durationMs = Math.round(performance.now() - started);
        const exitStatus = timedOut ? 'timeout' : cancelled || signal ? 'cancelled' : code === 0 ? 'success' : 'failed';
        stdout = redactSensitiveValues(stdout, sourceEnv);
        stderr = redactSensitiveValues(stderr, sourceEnv);
        resolve({
          requestId,
          stdout,
          stderr,
          code,
          signal,
          provenance: {
            provider: spec.id,
            version: input.version || '',
            model: input.model || '',
            startedAt,
            durationMs,
            exitCode: code,
            signal,
            exitStatus,
          },
        });
      });
    });
  };
}

export function createAgentProviderRegistry(options = {}) {
  const spawnImpl = options.spawnImpl || spawn;
  const killTree = options.killTree || terminateProcessTree;
  const sourceEnv = options.env || process.env;
  const projectRootResolver = options.projectRootResolver || getProjectRoot;
  const apiTokenConfigured = options.apiTokenConfigured ?? Boolean(process.env.OPENPRISM_API_TOKEN);
  const active = new Map();
  const httpProviders = new Map();
  const versionCache = new Map(Object.entries(options.providerVersions || {}));
  const run = createProcessRunner({ spawnImpl, killTree, sourceEnv, active });

  function assertCliEnabled() {
    if (!apiTokenConfigured) throw disabledError();
  }

  async function probe(providerId, input = {}) {
    if (httpProviders.has(providerId)) return httpProviders.get(providerId).probe(input);
    const spec = CLI_PROVIDER_SPECS[providerId];
    if (!spec) throw Object.assign(new Error(`Unknown provider: ${providerId}`), { statusCode: 404 });
    // The provider list is a protected, read-only diagnostic.  It may report
    // installation/auth state even before the server task-execution token is
    // configured; model invocation remains fail-closed via assertCliEnabled.
    if (!input.allowDisabled) assertCliEnabled();
    let versionResult;
    try {
      versionResult = await run(spec, { args: spec.versionArgs, timeoutMs: PROBE_TIMEOUT_MS, projectRootResolver }, { probe: true });
    } catch (error) {
      if (error.code === 'ENOENT') return { installed: false, version: '', auth: { supported: Boolean(spec.authArgs), available: false }, error: 'Executable not found' };
      throw error;
    }
    let auth = { supported: Boolean(spec.authArgs), available: null, detail: spec.authArgs ? 'Status check did not complete.' : 'CLI does not expose a non-interactive auth status command.' };
    if (spec.authArgs) {
      const authResult = await run(spec, { args: spec.authArgs, timeoutMs: PROBE_TIMEOUT_MS, projectRootResolver }, { probe: true });
      auth = {
        supported: true,
        available: authResult.code === 0,
        detail: (authResult.stdout || authResult.stderr).trim().slice(0, 500),
      };
    }
    if (!spec.authArgs) {
      const providerEnv = filterProviderEnv(sourceEnv, providerId);
      const hasEnvironmentAuth = Object.keys(providerEnv).some((key) => /(?:TOKEN|KEY)/i.test(key));
      auth = {
        supported: false,
        available: hasEnvironmentAuth ? true : null,
        detail: hasEnvironmentAuth ? 'A supported authentication environment variable is present.' : 'CLI does not expose a non-interactive auth status command.',
      };
    }
    const version = (versionResult.stdout || versionResult.stderr).trim().split(/\r?\n/)[0] || '';
    if (version) versionCache.set(providerId, version);
    return {
      installed: versionResult.code === 0,
      version,
      auth,
      timeoutMs: PROBE_TIMEOUT_MS,
    };
  }

  async function invoke(providerId, input = {}) {
    if (httpProviders.has(providerId)) return httpProviders.get(providerId).invoke(input);
    const spec = CLI_PROVIDER_SPECS[providerId];
    if (!spec) throw Object.assign(new Error(`Unknown provider: ${providerId}`), { statusCode: 404 });
    assertCliEnabled();
    if (!input.projectId) throw Object.assign(new Error('projectId is required for CLI providers'), { statusCode: 400 });
    if (input.tools?.length) throw unsupported(`${providerId} does not support application-managed tool calling`);
    if (!versionCache.has(providerId)) {
      const versionResult = await run(spec, { args: spec.versionArgs, timeoutMs: PROBE_TIMEOUT_MS, projectRootResolver }, { probe: true });
      const version = (versionResult.stdout || versionResult.stderr).trim().split(/\r?\n/)[0] || '';
      if (version) versionCache.set(providerId, version);
    }
    const result = await run(spec, { ...input, version: versionCache.get(providerId) || '', projectRootResolver });
    const text = spec.parseOutput(result.stdout);
    if (result.provenance.exitStatus === 'failed') {
      throw Object.assign(new Error(result.stderr.trim() || `${providerId} exited with code ${result.code}`), {
        statusCode: 502,
        code: 'CLI_PROVIDER_FAILED',
        provenance: result.provenance,
      });
    }
    return {
      content: [{ type: 'text', text }],
      stop_reason: result.provenance.exitStatus === 'success' ? 'end_turn' : result.provenance.exitStatus,
      stdout: result.stdout,
      stderr: result.stderr,
      provenance: result.provenance,
      requestId: result.requestId,
    };
  }

  return {
    registerHttpProvider(provider) { httpProviders.set(provider.id, provider); return this; },
    listMetadata() {
      const httpMetadata = ['openai-compatible', 'anthropic'].map((id) => ({
        id,
        label: id === 'anthropic' ? 'Anthropic API' : 'OpenAI-compatible API',
        type: 'http',
        capabilities: HTTP_CAPABILITIES,
        available: true,
      }));
      const cliMetadata = Object.values(CLI_PROVIDER_SPECS).map((spec) => ({
        id: spec.id,
        label: spec.label,
        type: 'cli',
        capabilities: CLI_CAPABILITIES,
        available: apiTokenConfigured,
        unavailableReason: apiTokenConfigured ? '' : 'Configure OPENPRISM_API_TOKEN to enable local CLI execution.',
      }));
      return [...httpMetadata, ...cliMetadata];
    },
    async listReadinessMetadata() {
      const metadata = this.listMetadata();
      if (!apiTokenConfigured) return metadata;
      return Promise.all(metadata.map(async (entry) => {
        if (entry.type !== 'cli') return entry;
        let result;
        try {
          result = await probe(entry.id, { allowDisabled: true });
        } catch (error) {
          return {
            ...entry,
            installed: false,
            authenticated: false,
            authStatus: 'unknown',
            available: false,
            unavailableReason: error?.message || 'Provider readiness probe failed.',
          };
        }
        const installed = result?.installed === true;
        const authenticated = result?.auth?.available === true;
        const authStatus = authenticated
          ? 'authenticated'
          : result?.auth?.available === false
            ? 'not-authenticated'
            : 'unknown';
        return {
          ...entry,
          installed,
          authenticated,
          authStatus,
          version: result?.version || '',
          available: installed && authenticated,
          unavailableReason: installed && authenticated
            ? ''
            : !installed
              ? (result?.error || 'CLI executable is not installed.')
              : (result?.auth?.detail || 'Provider authentication could not be verified.'),
        };
      }));
    },
    probe,
    async listModels(providerId) {
      const provider = httpProviders.get(providerId);
      if (!provider?.listModels) throw unsupported(`${providerId} does not support model listing; enter a model manually.`);
      return provider.listModels();
    },
    invoke,
    stream(providerId, input = {}) { return invoke(providerId, input); },
    async cancel(requestId) {
      const running = active.get(String(requestId));
      if (!running) return { cancelled: false, requestId: String(requestId) };
      await running.cancel();
      return { cancelled: true, requestId: String(requestId) };
    },
  };
}

export const agentProviderRegistry = createAgentProviderRegistry();
