import { constants as fsConstants, promises as fs } from 'node:fs';
import { basename } from 'node:path';
import { spawn } from 'node:child_process';

import { DATA_DIR } from '../config/constants.js';
import { agentProviderRegistry, terminateProcessTree } from './agentProviderRegistry.js';
import { getSkillLoadErrors, listSkills } from './skillEngine.js';

const DEFAULT_TTL_MS = 30_000;
const PROBE_TIMEOUT_MS = 2_500;
const MAX_OUTPUT = 8_192;
const VALID_STATUSES = new Set(['available', 'degraded', 'unavailable', 'unknown']);

const COMMANDS = Object.freeze({
  codex: ['--version'],
  claude: ['--version'],
  copilot: ['--version'],
  pdflatex: ['--version'],
  xelatex: ['--version'],
  lualatex: ['--version'],
  latexmk: ['--version'],
  tectonic: ['--version'],
  pandoc: ['--version'],
  ocrmypdf: ['--version'],
  tesseract: ['--version'],
  pdftotext: ['-v'],
  tmux: ['-V'],
});

export function createCapabilityProbeRunner({ spawnImpl = spawn, killTree = terminateProcessTree } = {}) {
  return function probeCommand(command, args = [], timeoutMs = PROBE_TIMEOUT_MS) {
    if (!(command in COMMANDS)) throw new Error('Unsupported capability probe');
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const child = spawnImpl(command, args, {
        shell: false,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH || '',
          HOME: process.env.HOME || '',
          LANG: process.env.LANG || 'C.UTF-8',
          ...(process.env.XDG_CONFIG_HOME ? { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME } : {}),
          ...(process.env.XDG_CACHE_HOME ? { XDG_CACHE_HOME: process.env.XDG_CACHE_HOME } : {}),
          ...(process.env.SSL_CERT_FILE ? { SSL_CERT_FILE: process.env.SSL_CERT_FILE } : {}),
          ...(process.env.SSL_CERT_DIR ? { SSL_CERT_DIR: process.env.SSL_CERT_DIR } : {}),
          ...(process.env.NODE_EXTRA_CA_CERTS ? { NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS } : {}),
        },
      });
      child.stdout?.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(0, MAX_OUTPUT); });
      child.stderr?.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(0, MAX_OUTPUT); });
      const timer = setTimeout(async () => {
        if (settled) return;
        settled = true;
        await killTree(child);
        reject(Object.assign(new Error('Capability probe timed out'), { code: 'PROBE_TIMEOUT' }));
      }, timeoutMs);
      timer.unref?.();
      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error.code === 'ENOENT') resolve({ available: false, version: '' });
        else reject(error);
      });
      child.once('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const version = (stdout || stderr).trim().split(/\r?\n/)[0] || '';
        resolve({ available: code === 0, version });
      });
    });
  };
}

const defaultProbeCommand = createCapabilityProbeRunner();

async function defaultCheckDataRoot(dataDir) {
  await fs.access(dataDir, fsConstants.R_OK | fsConstants.W_OK);
  return { writable: true };
}

function defaultSkillsSummary() {
  return { count: listSkills().length, loadErrors: getSkillLoadErrors() };
}

function sanitizeText(value, { env, dataDir }) {
  let text = String(value || '');
  const secrets = Object.entries(env || {})
    .filter(([key, secret]) => /(?:TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL)/i.test(key) && String(secret || '').length >= 4)
    .map(([, secret]) => String(secret));
  for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
  for (const privatePath of [env?.HOME, dataDir]) {
    if (privatePath) text = text.split(String(privatePath)).join('[PRIVATE_PATH]');
  }
  // Version tools occasionally echo config paths outside HOME. Keep URLs, but
  // strip standalone absolute POSIX paths from every user-visible detail.
  text = text.replace(/(^|[\s(])\/(?:[^\s)]+\/)*[^\s)]*/g, '$1[PRIVATE_PATH]');
  return text.slice(0, 240);
}

function item(id, label, status, reason, checkedAt, details = {}) {
  return {
    id,
    label,
    status: VALID_STATUSES.has(status) ? status : 'unknown',
    reason: String(reason || ''),
    checkedAt,
    details,
  };
}

function safeVersion(result, sanitizer) {
  return result?.available ? sanitizer(result.version || 'installed') : '';
}

export function createCapabilityService(options = {}) {
  const now = options.now || (() => new Date());
  const ttlMs = Math.max(1_000, Number(options.ttlMs) || DEFAULT_TTL_MS);
  const env = options.env || process.env;
  const dataDir = options.dataDir || DATA_DIR;
  const appConfig = options.appConfig || {};
  const providerMetadata = options.providerMetadata || (() => agentProviderRegistry.listMetadata());
  const probeCommand = options.probeCommand || defaultProbeCommand;
  const checkDataRoot = options.checkDataRoot || defaultCheckDataRoot;
  const getSkillsSummary = options.getSkillsSummary || defaultSkillsSummary;
  let cache = null;

  const sanitize = (value) => sanitizeText(value, { env, dataDir });
  const command = async (name) => probeCommand(name, COMMANDS[name], PROBE_TIMEOUT_MS);

  async function guarded(id, label, checkedAt, inspect) {
    try {
      return await inspect();
    } catch {
      return item(id, label, 'unknown', 'The diagnostic probe could not complete safely.', checkedAt, {
        probeFailed: true,
      });
    }
  }

  async function inspectFresh() {
    const checkedAt = now().toISOString();
    const tokenConfigured = Boolean(env.OPENPRISM_API_TOKEN);
    const metadata = providerMetadata();
    const capabilities = [];

    capabilities.push(item(
      'security.authentication',
      'Server authentication',
      tokenConfigured ? 'available' : 'degraded',
      tokenConfigured
        ? 'Server-token authentication is enabled for protected APIs.'
        : 'No server token is configured; execution and capability probes remain disabled.',
      checkedAt,
      { mode: tokenConfigured ? 'bearer-token' : 'fail-closed-execution', protectedExecution: true },
    ));

    try {
      const result = await checkDataRoot(dataDir);
      capabilities.push(item(
        'storage.project-data',
        'Project data root',
        result?.writable ? 'available' : 'unavailable',
        result?.writable ? 'The managed project data root is readable and writable.' : 'The managed project data root is not writable.',
        checkedAt,
        { writable: Boolean(result?.writable), location: 'managed-project-data-root' },
      ));
    } catch {
      capabilities.push(item(
        'storage.project-data',
        'Project data root',
        'unavailable',
        'The managed project data root could not be read and written.',
        checkedAt,
        { writable: false, location: 'managed-project-data-root' },
      ));
    }

    for (const provider of metadata.filter((entry) => entry.type === 'http')) {
      const isAnthropic = provider.id === 'anthropic';
      const endpointConfigured = Boolean(isAnthropic ? appConfig.claude_base_url : appConfig.llm_base_url);
      const credentialConfigured = Boolean(isAnthropic ? appConfig.claude_api_key : appConfig.llm_api_key);
      const configured = endpointConfigured && credentialConfigured;
      capabilities.push(item(
        `provider.${provider.id}`,
        provider.label,
        configured ? 'available' : (endpointConfigured || credentialConfigured ? 'degraded' : 'unavailable'),
        configured
          ? 'Endpoint and credential are configured; no network or model request was made.'
          : endpointConfigured || credentialConfigured
            ? 'Provider configuration is incomplete.'
            : 'Provider endpoint and credential are not configured.',
        checkedAt,
        { type: 'http', endpointConfigured, credentialConfigured, networkProbe: false },
      ));
    }

    const cliCommands = { 'codex-cli': 'codex', 'claude-cli': 'claude', 'copilot-cli': 'copilot' };
    for (const provider of metadata.filter((entry) => entry.type === 'cli')) {
      if (!tokenConfigured) {
        capabilities.push(item(
          `provider.${provider.id}`,
          provider.label,
          'unavailable',
          'Configure the server access token before local CLI diagnostics or execution can run.',
          checkedAt,
          { type: 'cli', installed: null, authStatus: 'not-checked', loginProbe: false },
        ));
        continue;
      }
      capabilities.push(await guarded(`provider.${provider.id}`, provider.label, checkedAt, async () => {
        const result = await command(cliCommands[provider.id]);
        return item(
          `provider.${provider.id}`,
          provider.label,
          result.available ? 'available' : 'unavailable',
          result.available
            ? 'The fixed CLI executable is installed; login status and model access were not tested.'
            : 'The fixed CLI executable was not found.',
          checkedAt,
          { type: 'cli', installed: Boolean(result.available), version: safeVersion(result, sanitize), authStatus: 'not-checked', loginProbe: false },
        );
      }));
    }

    capabilities.push(await guarded('document.tex', 'TeX engines', checkedAt, async () => {
      const names = ['pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic'];
      const results = await Promise.all(names.map(async (name) => [name, await command(name)]));
      const engines = Object.fromEntries(results.map(([name, result]) => [name, { available: Boolean(result.available), version: safeVersion(result, sanitize) }]));
      const availableCount = Object.values(engines).filter((engine) => engine.available).length;
      return item(
        'document.tex',
        'TeX engines',
        availableCount > 0 ? 'available' : 'unavailable',
        availableCount > 0 ? `${availableCount} TeX engine(s) are available.` : 'No supported TeX engine was found.',
        checkedAt,
        { engines },
      );
    }));

    capabilities.push(await guarded('document.pandoc', 'Pandoc conversion', checkedAt, async () => {
      const result = await command('pandoc');
      return item(
        'document.pandoc',
        'Pandoc conversion',
        result.available ? 'available' : 'unavailable',
        result.available ? 'Pandoc is installed.' : 'Pandoc is not installed.',
        checkedAt,
        { installed: Boolean(result.available), version: safeVersion(result, sanitize) },
      );
    }));

    capabilities.push(await guarded('document.pdf-ocr', 'PDF text and OCR', checkedAt, async () => {
      const names = ['pdftotext', 'ocrmypdf', 'tesseract'];
      const results = await Promise.all(names.map(async (name) => [name, await command(name)]));
      const tools = Object.fromEntries(results.map(([name, result]) => [name, { available: Boolean(result.available), version: safeVersion(result, sanitize) }]));
      const hasPdfText = tools.pdftotext.available;
      const hasOcrPipeline = tools.ocrmypdf.available && tools.tesseract.available;
      const status = hasPdfText && hasOcrPipeline ? 'available' : (hasPdfText || hasOcrPipeline ? 'degraded' : 'unavailable');
      return item(
        'document.pdf-ocr',
        'PDF text and OCR',
        status,
        status === 'available'
          ? 'PDF text extraction and the OCR pipeline are available.'
          : status === 'degraded'
            ? 'Only part of the PDF text/OCR toolchain is available.'
            : 'PDF text extraction and OCR tools were not found.',
        checkedAt,
        { tools },
      );
    }));

    capabilities.push(await guarded('skills.catalog', 'Skills catalog', checkedAt, async () => {
      const summary = getSkillsSummary() || {};
      const errors = Array.isArray(summary.loadErrors) ? summary.loadErrors : [];
      return item(
        'skills.catalog',
        'Skills catalog',
        errors.length ? 'degraded' : (Number(summary.count) > 0 ? 'available' : 'unavailable'),
        errors.length ? `${errors.length} Skill definition(s) failed to load.` : `${Number(summary.count) || 0} Skills loaded.`,
        checkedAt,
        {
          count: Number(summary.count) || 0,
          loadErrorCount: errors.length,
          loadErrors: errors.slice(0, 20).map((error) => ({
            source: basename(String(error.source || 'unknown')),
            message: sanitize(error.message || 'Skill definition could not be loaded.'),
          })),
        },
      );
    }));

    capabilities.push(await guarded('terminal.tmux', 'Integrated terminal', checkedAt, async () => {
      if (!tokenConfigured) {
        return item('terminal.tmux', 'Integrated terminal', 'unavailable', 'Configure the server access token before terminal access can run.', checkedAt, { tmuxInstalled: null, protected: true });
      }
      const result = await command('tmux');
      return item(
        'terminal.tmux',
        'Integrated terminal',
        result.available ? 'available' : 'unavailable',
        result.available ? 'tmux is installed and terminal access is protected.' : 'tmux is not installed.',
        checkedAt,
        { tmuxInstalled: Boolean(result.available), version: safeVersion(result, sanitize), protected: true },
      );
    }));

    const semanticScholarConfigured = Boolean(env.SEMANTIC_SCHOLAR_API_KEY);
    capabilities.push(item(
      'retrieval.external',
      'External literature retrieval',
      semanticScholarConfigured ? 'available' : 'degraded',
      semanticScholarConfigured
        ? 'Crossref and configured Semantic Scholar retrieval paths are available; no network request was made.'
        : 'Crossref works without a key; Semantic Scholar has no optional API key configured.',
      checkedAt,
      { crossrefConfigured: true, semanticScholarCredentialConfigured: semanticScholarConfigured, networkProbe: false },
    ));

    return {
      schemaVersion: 1,
      checkedAt,
      cache: { cached: false, ttlMs },
      capabilities,
    };
  }

  return {
    async inspect({ refresh = false } = {}) {
      const currentTime = now().getTime();
      if (!refresh && cache && currentTime - cache.createdAt < ttlMs) {
        return { ...cache.value, cache: { ...cache.value.cache, cached: true } };
      }
      const value = await inspectFresh();
      cache = { createdAt: currentTime, value };
      return value;
    },
  };
}
