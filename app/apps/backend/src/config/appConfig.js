import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
 
const ENV_FILE_NAME = '.env';
const MASKED_SECRET = '********';
 
function findRepoEnvPath(startDir = process.cwd()) {
  let dir = startDir;
  let repoRoot = '';
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, ENV_FILE_NAME);
    if (existsSync(candidate)) return candidate;
    if (!repoRoot && existsSync(join(dir, '.git'))) repoRoot = dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(repoRoot || startDir, ENV_FILE_NAME);
}
 
const ENV_PATH = findRepoEnvPath();
 
export function parseEnv(content = '') {
  const values = {};
  const order = [];
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = rawLine.indexOf('=');
    if (eq <= 0) continue;
    const key = rawLine.slice(0, eq).trim();
    let value = rawLine.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
    order.push(key);
  }
  return { values, order };
}
 
function serializeEnv({ values, order }) {
  const seen = new Set();
  const keys = [...order, ...Object.keys(values)];
  const lines = ['# Local Paper Agent LLM configuration. Do not commit this file.'];
  for (const key of keys) {
    if (seen.has(key) || !(key in values)) continue;
    seen.add(key);
    lines.push(`${key}=${values[key] ?? ''}`);
  }
  return `${lines.join('\n')}\n`;
}
 
async function readEnvFile() {
  try {
    return parseEnv(await readFile(ENV_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { values: {}, order: [] };
  }
}
 
function syncProcessEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
}
 
function envToConfig(values) {
  return {
    llm_provider: values.OPENPRISM_LLM_PROVIDER || 'openai-compatible',
    llm_api_key: values.OPENPRISM_LLM_API_KEY || '',
    llm_base_url: values.OPENPRISM_LLM_BASE_URL || '',
    llm_ca_cert: values.OPENPRISM_LLM_CA_CERT || join(process.env.HOME, '.claude-code', 'caddy-root.crt'),
    llm_model: values.OPENPRISM_LLM_MODEL || 'gpt-5.5',
    claude_api_key: values.OPENPRISM_CLAUDE_API_KEY || values.OPENPRISM_LLM_API_KEY || '',
    claude_base_url: values.OPENPRISM_CLAUDE_BASE_URL || values.OPENPRISM_LLM_BASE_URL || '',
    claude_ca_cert: values.OPENPRISM_CLAUDE_CA_CERT || join(process.env.HOME, '.claude-code', 'caddy-root.crt'),
    claude_model: values.OPENPRISM_CLAUDE_MODEL || 'claude-sonnet-4.6',
    default_template: values.OPENPRISM_DEFAULT_TEMPLATE || 'plain',
    editor_mode: values.OPENPRISM_EDITOR_MODE || 'markdown',
    projects_dir: values.OPENPRISM_PROJECTS_DIR || join(process.env.HOME, 'papers'),
  };
}
 
function isSecretPlaceholder(value) {
  return value === MASKED_SECRET || /^•+$/.test(String(value || ''));
}
 
function setIfPresent(values, key, value, { secret = false } = {}) {
  if (value === undefined || value === null) return;
  if (secret && isSecretPlaceholder(value)) return;
  values[key] = String(value);
}
 
export async function loadAppConfig() {
  const env = await readEnvFile();
  syncProcessEnv(env.values);
  const config = envToConfig(env.values);
 
  // Ensure a local .env exists and carries non-secret defaults. Existing secret
  // values are preserved and never mirrored into source files.
  if (!existsSync(ENV_PATH)) {
    await saveAppConfig(config);
  }
  return config;
}
 
export async function saveAppConfig(config) {
  const env = await readEnvFile();
  const values = { ...env.values };
  const order = [...env.order];
  const ensureOrder = (key) => {
    if (!order.includes(key)) order.push(key);
  };
 
  const orderedKeys = [
    'OPENPRISM_LLM_PROVIDER',
    'OPENPRISM_LLM_API_KEY',
    'OPENPRISM_LLM_BASE_URL',
    'OPENPRISM_LLM_MODEL',
    'OPENPRISM_LLM_CA_CERT',
    'OPENPRISM_CLAUDE_API_KEY',
    'OPENPRISM_CLAUDE_BASE_URL',
    'OPENPRISM_CLAUDE_MODEL',
    'OPENPRISM_CLAUDE_CA_CERT',
    'OPENPRISM_DEFAULT_TEMPLATE',
    'OPENPRISM_EDITOR_MODE',
    'OPENPRISM_PROJECTS_DIR',
  ];
  orderedKeys.forEach(ensureOrder);
 
  setIfPresent(values, 'OPENPRISM_LLM_PROVIDER', config.llm_provider);
  setIfPresent(values, 'OPENPRISM_LLM_API_KEY', config.llm_api_key, { secret: true });
  setIfPresent(values, 'OPENPRISM_LLM_BASE_URL', config.llm_base_url);
  setIfPresent(values, 'OPENPRISM_LLM_MODEL', config.llm_model);
  setIfPresent(values, 'OPENPRISM_LLM_CA_CERT', config.llm_ca_cert);
 
  // Claude compatibility fields intentionally default to the same endpoint/key
  // unless explicitly provided by the caller.
  setIfPresent(values, 'OPENPRISM_CLAUDE_API_KEY', config.claude_api_key ?? config.llm_api_key, { secret: true });
  setIfPresent(values, 'OPENPRISM_CLAUDE_BASE_URL', config.claude_base_url ?? config.llm_base_url);
  setIfPresent(values, 'OPENPRISM_CLAUDE_MODEL', config.claude_model);
  setIfPresent(values, 'OPENPRISM_CLAUDE_CA_CERT', config.claude_ca_cert);
 
  setIfPresent(values, 'OPENPRISM_DEFAULT_TEMPLATE', config.default_template);
  setIfPresent(values, 'OPENPRISM_EDITOR_MODE', config.editor_mode);
  setIfPresent(values, 'OPENPRISM_PROJECTS_DIR', config.projects_dir);
 
  await mkdir(dirname(ENV_PATH), { recursive: true });
  await writeFile(ENV_PATH, serializeEnv({ values, order }), 'utf8');
  syncProcessEnv(values);
  return envToConfig(values);
}
 
export function publicAppConfig(config) {
  const hasLlmApiKey = !!config.llm_api_key;
  const hasClaudeApiKey = !!config.claude_api_key;
  return {
    ...config,
    llm_api_key: hasLlmApiKey ? MASKED_SECRET : '',
    claude_api_key: hasClaudeApiKey ? MASKED_SECRET : '',
    llm_api_key_set: hasLlmApiKey,
    claude_api_key_set: hasClaudeApiKey,
  };
}
 
