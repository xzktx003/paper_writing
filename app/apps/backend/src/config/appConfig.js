import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import crypto from 'node:crypto';
import { DATA_DIR } from './constants.js';
 
const ENV_FILE_NAME = '.env';
const MASKED_SECRET = '********';
const DEFAULT_DRAWIO_EMBED_URL = 'https://embed.diagrams.net/?embed=1&ui=atlas&spin=1&proto=json&ready=message';
export const SUPPORTED_LLM_PROVIDERS = Object.freeze([
  'openai-compatible',
  'anthropic',
  'codex-cli',
  'claude-cli',
  'copilot-cli',
]);
 
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
 
export function envToConfig(values) {
  return {
    llm_provider: values.OPENPRISM_LLM_PROVIDER || 'openai-compatible',
    llm_api_key: configuredSecret(values.OPENPRISM_LLM_API_KEY),
    llm_base_url: values.OPENPRISM_LLM_BASE_URL || '',
    llm_ca_cert: values.OPENPRISM_LLM_CA_CERT || join(process.env.HOME, '.claude-code', 'caddy-root.crt'),
    llm_model: values.OPENPRISM_LLM_MODEL || 'gpt-5.5',
    claude_api_key: configuredSecret(values.OPENPRISM_CLAUDE_API_KEY || values.OPENPRISM_LLM_API_KEY),
    claude_base_url: values.OPENPRISM_CLAUDE_BASE_URL || values.OPENPRISM_LLM_BASE_URL || '',
    claude_ca_cert: values.OPENPRISM_CLAUDE_CA_CERT || join(process.env.HOME, '.claude-code', 'caddy-root.crt'),
    claude_model: values.OPENPRISM_CLAUDE_MODEL || 'claude-sonnet-4.6',
    draw_image_api_key: configuredSecret(values.OPENPRISM_DRAW_IMAGE_API_KEY),
    draw_image_api_base: values.OPENPRISM_DRAW_IMAGE_API_BASE || 'https://www.right.codes/draw/v1',
    draw_image_model: values.OPENPRISM_DRAW_IMAGE_MODEL || 'gpt-image-2',
    draw_image_use_llm_credentials: String(values.OPENPRISM_DRAW_IMAGE_USE_LLM_CREDENTIALS || '').toLowerCase() === 'true',
    drawio_embed_url: validateDrawioEmbedUrl(values.OPENPRISM_DRAWIO_EMBED_URL || DEFAULT_DRAWIO_EMBED_URL),
    default_template: values.OPENPRISM_DEFAULT_TEMPLATE || 'plain',
    editor_mode: values.OPENPRISM_EDITOR_MODE || 'markdown',
    // Read-only runtime truth. Project storage is resolved once by the Project
    // Locator from OPENPRISM_DATA_DIR (or the legacy alias at startup).
    projects_dir: DATA_DIR,
  };
}
 
function isSecretPlaceholder(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === MASKED_SECRET.toLowerCase()
    || /^•+$/.test(String(value || ''))
    || [
      'your-api-key-here',
      'replace-with-a-random-secret',
      'change-me-in-production',
      'replace-me',
      'your-secret-token',
      'your-mineru-token',
      'your-image-api-key',
    ].includes(normalized);
}

function configuredSecret(value) {
  const normalized = String(value ?? '').trim();
  return normalized && !isSecretPlaceholder(normalized) ? normalized : '';
}

export function validateEnvValue(value) {
  const normalized = String(value ?? '');
  if (/[\r\n\0]/.test(normalized)) {
    throw Object.assign(new Error('Configuration values cannot contain line breaks or NUL bytes.'), {
      statusCode: 400,
      code: 'INVALID_CONFIG_VALUE',
    });
  }
  return normalized;
}

export function validateDrawioEmbedUrl(value) {
  const normalized = validateEnvValue(value).trim();
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw Object.assign(new Error('Draw.io embed URL must be a valid absolute URL.'), {
      statusCode: 400,
      code: 'INVALID_DRAWIO_EMBED_URL',
    });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw Object.assign(new Error('Draw.io embed URL must use HTTP or HTTPS.'), {
      statusCode: 400,
      code: 'INVALID_DRAWIO_EMBED_URL',
    });
  }
  return url.toString();
}
 
function setIfPresent(values, key, value, { secret = false } = {}) {
  if (value === undefined || value === null) return;
  if (secret && isSecretPlaceholder(value)) return;
  values[key] = validateEnvValue(value);
}

export async function writeConfigFileAtomic(filePath, content, fsApi = {}) {
  const write = fsApi.writeFile || writeFile;
  const move = fsApi.rename || rename;
  const remove = fsApi.rm || rm;
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await write(tempPath, content, { encoding: 'utf8', mode: 0o600 });
    await move(tempPath, filePath);
  } finally {
    await remove(tempPath, { force: true }).catch(() => {});
  }
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
 
async function saveAppConfigUnlocked(config) {
  if (config.llm_provider && !SUPPORTED_LLM_PROVIDERS.includes(config.llm_provider)) {
    throw Object.assign(new Error(`Unsupported LLM provider: ${config.llm_provider}`), { statusCode: 400 });
  }
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
    'OPENPRISM_DRAW_IMAGE_API_KEY',
    'OPENPRISM_DRAW_IMAGE_API_BASE',
    'OPENPRISM_DRAW_IMAGE_MODEL',
    'OPENPRISM_DRAW_IMAGE_USE_LLM_CREDENTIALS',
    'OPENPRISM_DRAWIO_EMBED_URL',
    'OPENPRISM_DEFAULT_TEMPLATE',
    'OPENPRISM_EDITOR_MODE',
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

  setIfPresent(values, 'OPENPRISM_DRAW_IMAGE_API_KEY', config.draw_image_api_key, { secret: true });
  setIfPresent(values, 'OPENPRISM_DRAW_IMAGE_API_BASE', config.draw_image_api_base);
  setIfPresent(values, 'OPENPRISM_DRAW_IMAGE_MODEL', config.draw_image_model);
  setIfPresent(values, 'OPENPRISM_DRAW_IMAGE_USE_LLM_CREDENTIALS', String(Boolean(config.draw_image_use_llm_credentials)));
  setIfPresent(values, 'OPENPRISM_DRAWIO_EMBED_URL', validateDrawioEmbedUrl(config.drawio_embed_url || DEFAULT_DRAWIO_EMBED_URL));
 
  setIfPresent(values, 'OPENPRISM_DEFAULT_TEMPLATE', config.default_template);
  setIfPresent(values, 'OPENPRISM_EDITOR_MODE', config.editor_mode);
  await writeConfigFileAtomic(ENV_PATH, serializeEnv({ values, order }));
  syncProcessEnv(values);
  return envToConfig(values);
}

let configWriteQueue = Promise.resolve();

export function saveAppConfig(config) {
  const task = configWriteQueue.then(() => saveAppConfigUnlocked(config));
  configWriteQueue = task.catch(() => {});
  return task;
}
 
export function publicAppConfig(config) {
  const hasLlmApiKey = !!configuredSecret(config.llm_api_key);
  const hasClaudeApiKey = !!configuredSecret(config.claude_api_key);
  const hasDrawImageApiKey = !!configuredSecret(config.draw_image_api_key);
  return {
    ...config,
    llm_api_key: hasLlmApiKey ? MASKED_SECRET : '',
    claude_api_key: hasClaudeApiKey ? MASKED_SECRET : '',
    draw_image_api_key: hasDrawImageApiKey ? MASKED_SECRET : '',
    llm_api_key_set: hasLlmApiKey,
    claude_api_key_set: hasClaudeApiKey,
    draw_image_api_key_set: hasDrawImageApiKey,
  };
}
 
