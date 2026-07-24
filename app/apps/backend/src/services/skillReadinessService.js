import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DATA_DIR } from '../config/constants.js';

const dryRunState = new Map();
const lastRunState = new Map();
let loadedRunStorePath = '';
const SKILL_RUN_HISTORY_SCHEMA = 1;
const MAX_RUN_SUMMARY_CHARS = 2_000;
const MAX_RUN_LIST_ITEMS = 100;
const OUTCOMES = new Set([
  'provider_completed', 'provider_failed', 'provider_skipped',
  'tests_passed', 'tests_failed', 'tests_skipped',
  'execution_completed', 'execution_failed', 'unknown',
]);
const VERIFICATION_STATUSES = new Set(['not_evaluated', 'passed', 'failed', 'inconclusive']);
const OBJECTIVE_STATUSES = new Set(['not_evaluated', 'achieved', 'partially_achieved', 'not_achieved']);

function normalizeRunOutcome(status, outcome, kind = '') {
  const explicit = String(outcome || '').trim();
  if (OUTCOMES.has(explicit)) return explicit;
  if (kind === 'package-tests') {
    if (status === 'success' || status === 'completed') return 'tests_passed';
    if (status === 'failed' || status === 'error') return 'tests_failed';
    if (status === 'skipped') return 'tests_skipped';
  }
  if (status === 'success' || status === 'completed') return 'provider_completed';
  if (status === 'failed' || status === 'error') return 'provider_failed';
  if (status === 'skipped') return 'provider_skipped';
  return 'unknown';
}

function resolveRunStorePath(options = {}) {
  return path.resolve(
    options.runStorePath
    || process.env.OPENPRISM_SKILL_RUNS_PATH
    || path.join(DATA_DIR, '.openprism-skill-runs.json'),
  );
}

function redactRunText(value) {
  return String(value || '')
    .slice(0, MAX_RUN_SUMMARY_CHARS)
    .replace(/\bsk-[A-Za-z0-9_*.-]{6,}\b/g, '[REDACTED]')
    .replace(/\b(?:github_pat_|ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_*.-]{6,}\b/g, '[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, 'Bearer [REDACTED]');
}

function normalizeRunList(value, { relativePaths = false } = {}) {
  return asArray(value).slice(0, MAX_RUN_LIST_ITEMS).map((item) => String(item || '').trim()).filter((item) => {
    if (!item) return false;
    if (!relativePaths) return true;
    return !path.isAbsolute(item) && !item.split(/[\\/]+/).includes('..');
  });
}

function normalizeStoredRun(state = {}) {
  const status = String(state.status || 'unknown').slice(0, 64);
  const kind = String(state.kind || 'execution').slice(0, 64);
  const verificationStatus = String(state.verificationStatus || 'not_evaluated').replace(/-/g, '_');
  const objectiveStatus = String(state.objectiveStatus || 'not_evaluated').replace(/-/g, '_');
  return {
    status,
    outcome: normalizeRunOutcome(status, state.outcome, kind),
    verificationStatus: VERIFICATION_STATUSES.has(verificationStatus) ? verificationStatus : 'not_evaluated',
    objectiveStatus: OBJECTIVE_STATUSES.has(objectiveStatus) ? objectiveStatus : 'not_evaluated',
    kind,
    checkedAt: String(state.checkedAt || ''),
    durationMs: Math.max(0, Number(state.durationMs || 0)),
    summary: redactRunText(state.summary),
    provider: String(state.provider || '').slice(0, 128),
    model: String(state.model || '').slice(0, 256),
    version: String(state.version || '').slice(0, 128),
    cost: state.cost && typeof state.cost === 'object' ? {
      currency: String(state.cost.currency || '').slice(0, 16),
      amount: Math.max(0, Number(state.cost.amount || 0)),
    } : null,
    artifacts: normalizeRunList(state.artifacts, { relativePaths: true }),
    sideEffects: normalizeRunList(state.sideEffects),
    scope: {
      projectId: String(state.scope?.projectId || '').slice(0, 128),
      conversationId: String(state.scope?.conversationId || '').slice(0, 128),
    },
  };
}

function loadSkillRunHistory(options = {}, { force = false } = {}) {
  const storePath = resolveRunStorePath(options);
  if (!force && loadedRunStorePath === storePath) return lastRunState.size;
  lastRunState.clear();
  loadedRunStorePath = storePath;
  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8'));
    if (parsed.schemaVersion !== SKILL_RUN_HISTORY_SCHEMA || !parsed.runs || typeof parsed.runs !== 'object') return 0;
    for (const [name, state] of Object.entries(parsed.runs)) {
      const normalizedName = String(name || '').trim();
      if (!normalizedName) continue;
      lastRunState.set(normalizedName, normalizeStoredRun(state));
    }
  } catch {
    // Missing or corrupt history must never stop Skill discovery/readiness.
  }
  return lastRunState.size;
}

function persistSkillRunHistory(options = {}) {
  const storePath = resolveRunStorePath(options);
  mkdirSync(path.dirname(storePath), { recursive: true });
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  const runs = Object.fromEntries(Array.from(lastRunState.entries()).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(tempPath, `${JSON.stringify({
    schemaVersion: SKILL_RUN_HISTORY_SCHEMA,
    updatedAt: new Date().toISOString(),
    runs,
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(tempPath, storePath);
}

export function reloadSkillRunHistory(options = {}) {
  return loadSkillRunHistory(options, { force: true });
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function normalizeNamedRequirement(entry, key, defaults = {}) {
  const value = typeof entry === 'string' ? { [key]: entry } : { ...(entry || {}) };
  return {
    ...defaults,
    ...value,
    [key]: String(value[key] || '').trim(),
    required: value.required !== false,
    source: value.source || defaults.source || 'manifest',
  };
}

function uniqueRequirements(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item[key]) return false;
    const identity = `${item[key]}:${item.scope || ''}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function inferScriptCommands(skill) {
  const commands = [];
  for (const script of skill.package?.scripts || []) {
    const extension = path.extname(script).toLowerCase();
    const name = extension === '.py'
      ? 'python3'
      : ['.js', '.mjs', '.cjs', '.ts'].includes(extension)
        ? 'node'
        : extension === '.sh'
          ? 'bash'
          : '';
    if (name) commands.push({ name, required: true, source: 'package-script' });
  }
  return commands;
}

export function normalizeSkillExecutionProfile(skill = {}) {
  const metadataDeclared = Boolean(
    skill.requirements
    || skill.sideEffects !== undefined
    || skill.side_effects !== undefined
    || skill.costClass !== undefined
    || skill.cost_class !== undefined,
  );
  const requirements = skill.requirements && typeof skill.requirements === 'object'
    ? skill.requirements
    : {};
  const commands = uniqueRequirements([
    ...asArray(requirements.commands).map((entry) => normalizeNamedRequirement(entry, 'name')),
    ...inferScriptCommands(skill),
  ], 'name').sort((a, b) => a.name.localeCompare(b.name));
  const credentials = uniqueRequirements(
    asArray(requirements.credentials).map((entry) => normalizeNamedRequirement(entry, 'name')),
    'name',
  );
  const network = uniqueRequirements(
    asArray(requirements.network).map((entry) => normalizeNamedRequirement(entry, 'target')),
    'target',
  );
  const files = uniqueRequirements(
    asArray(requirements.files).map((entry) => normalizeNamedRequirement(entry, 'path', { scope: 'project' })),
    'path',
  );
  const declaredProviderCapabilities = asArray(requirements.providerCapabilities);
  const providerCapabilities = uniqueRequirements(
    (declaredProviderCapabilities.length ? declaredProviderCapabilities : ['invoke'])
      .map((entry) => normalizeNamedRequirement(entry, 'capability', { provider: 'configured', source: declaredProviderCapabilities.length ? 'manifest' : 'default' })),
    'capability',
  );
  const sideEffects = Array.from(new Set([
    ...asArray(skill.sideEffects || skill.side_effects).map((entry) => String(entry || '').trim()).filter(Boolean),
    ...((skill.package?.scripts || []).length ? ['executes-local-commands'] : []),
  ]));
  const costClass = String(skill.costClass || skill.cost_class || 'medium').toLowerCase();

  return {
    requirements: { commands, credentials, network, files, providerCapabilities },
    sideEffects,
    costClass: ['free', 'low', 'medium', 'high'].includes(costClass) ? costClass : 'medium',
    metadataSource: metadataDeclared ? 'manifest' : 'inferred',
  };
}

function defaultCommandExists(command, env) {
  if (!command) return false;
  if (path.isAbsolute(command) || command.includes(path.sep)) return existsSync(command);
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(lookup, [command], { env, stdio: 'ignore', shell: false }).status === 0;
}

function configuredProviderCapability(capability, { appConfig, env, commandExists }) {
  const provider = String(appConfig.llm_provider || env.OPENPRISM_LLM_PROVIDER || 'openai-compatible');
  if (provider === 'openai-compatible') {
    const configured = Boolean(appConfig.llm_api_key || env.OPENPRISM_LLM_API_KEY);
    return { configured, provider };
  }
  if (provider === 'anthropic') {
    const configured = Boolean(appConfig.claude_api_key || env.OPENPRISM_CLAUDE_API_KEY || appConfig.llm_api_key || env.OPENPRISM_LLM_API_KEY);
    return { configured, provider };
  }
  const commands = { 'codex-cli': 'codex', 'claude-cli': 'claude', 'copilot-cli': 'copilot' };
  if (commands[provider]) {
    const supportsCapability = !['toolCalling', 'stream'].includes(capability);
    return {
      configured: Boolean(env.OPENPRISM_API_TOKEN) && supportsCapability && commandExists(commands[provider], env),
      provider,
    };
  }
  return { configured: false, provider };
}

function configuredCredential(name, { appConfig, env }) {
  if (env[name]) return true;
  const configFields = {
    OPENPRISM_LLM_API_KEY: 'llm_api_key',
    OPENPRISM_CLAUDE_API_KEY: 'claude_api_key',
    OPENPRISM_DRAW_IMAGE_API_KEY: 'draw_image_api_key',
  };
  return Boolean(configFields[name] && appConfig[configFields[name]]);
}

function initialDryRun(name) {
  return dryRunState.get(name) || { status: 'not-run', checkedAt: '', checks: [] };
}

function initialLastRun(name, options = {}) {
  loadSkillRunHistory(options);
  return lastRunState.get(name) || { status: 'never', kind: 'execution', checkedAt: '' };
}

export function evaluateSkillReadiness(skill = {}, options = {}) {
  const env = options.env || process.env;
  const appConfig = options.appConfig || {};
  const commandExists = options.commandExists || defaultCommandExists;
  const fileExists = options.fileExists || existsSync;
  const profile = normalizeSkillExecutionProfile(skill);
  const checks = [];

  if (profile.metadataSource !== 'manifest') {
    checks.push({
      kind: 'execution-metadata',
      name: 'requirements',
      required: true,
      status: 'unverified',
    });
  }

  for (const requirement of profile.requirements.commands) {
    const available = commandExists(requirement.name, env);
    checks.push({ kind: 'command', name: requirement.name, required: requirement.required, status: available ? 'available' : 'missing' });
  }
  for (const requirement of profile.requirements.credentials) {
    const available = configuredCredential(requirement.name, { appConfig, env });
    checks.push({ kind: 'credential', name: requirement.name, required: requirement.required, status: available ? 'configured' : 'missing' });
  }
  for (const requirement of profile.requirements.providerCapabilities) {
    const result = configuredProviderCapability(requirement.capability, { appConfig, env, commandExists });
    checks.push({
      kind: 'provider-capability',
      name: requirement.capability,
      provider: result.provider,
      required: requirement.required,
      status: result.configured ? 'available' : 'missing',
    });
  }
  for (const requirement of profile.requirements.network) {
    const explicitStatus = options.networkStatus?.[requirement.target];
    checks.push({
      kind: 'network',
      name: requirement.target,
      required: requirement.required,
      status: explicitStatus === true ? 'available' : explicitStatus === false ? 'missing' : 'unverified',
    });
  }
  for (const requirement of profile.requirements.files) {
    const root = requirement.scope === 'skill'
      ? (skill._resourceDir || skill.package?.root || '')
      : options.projectRoot;
    const status = !root
      ? 'needs-project'
      : fileExists(path.resolve(root, requirement.path))
        ? 'available'
        : 'missing';
    checks.push({ kind: 'file', name: requirement.path, scope: requirement.scope, required: requirement.required, status });
  }

  const requiredMissing = checks.some((check) => check.required && check.status === 'missing');
  const requiredUnverified = checks.some((check) => check.required && ['unverified', 'needs-project'].includes(check.status));
  const readiness = requiredMissing ? 'unavailable' : requiredUnverified ? 'degraded' : 'ready';

  return {
    ...profile,
    readiness,
    checks,
    dryRun: initialDryRun(skill.name),
    lastRun: initialLastRun(skill.name, options),
  };
}

export function runSkillDryRun(skill, options = {}) {
  const evaluation = evaluateSkillReadiness(skill, options);
  const checkedAt = (options.now?.() || new Date()).toISOString();
  const dryRun = { status: evaluation.readiness, checkedAt, checks: evaluation.checks };
  dryRunState.set(skill.name, dryRun);
  return { ...evaluation, dryRun, lastRun: initialLastRun(skill.name, options) };
}

function normalizeSkillRunInput(name, result = {}, checkedAt = '') {
  return {
    name: String(name || '').trim(),
    state: normalizeStoredRun({
      status: result.status || 'unknown',
      outcome: result.outcome,
      verificationStatus: result.verificationStatus,
      objectiveStatus: result.objectiveStatus,
      kind: result.kind || 'execution',
      checkedAt,
      durationMs: Number(result.durationMs || 0),
      summary: String(result.summary || ''),
      provider: result.provider,
      model: result.model,
      version: result.version,
      cost: result.cost,
      artifacts: result.artifacts,
      sideEffects: result.sideEffects,
      scope: result.scope || {
        projectId: result.projectId,
        conversationId: result.conversationId,
      },
    }),
  };
}

export function recordSkillRunsBatch(entries = [], options = {}) {
  loadSkillRunHistory(options);
  const checkedAt = (options.now?.() || new Date()).toISOString();
  const states = [];
  for (const entry of entries) {
    const normalized = normalizeSkillRunInput(entry.name, entry.result, checkedAt);
    if (!normalized.name) continue;
    lastRunState.set(normalized.name, normalized.state);
    states.push({ name: normalized.name, ...normalized.state });
  }
  persistSkillRunHistory(options);
  return states;
}

export function recordSkillRun(name, result = {}, options = {}) {
  const [state] = recordSkillRunsBatch([{ name, result }], options);
  return state || normalizeSkillRunInput(name, result, new Date().toISOString()).state;
}
