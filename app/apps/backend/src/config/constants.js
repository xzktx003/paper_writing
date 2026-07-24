import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'node:crypto';
 
const __dirname = path.dirname(fileURLToPath(import.meta.url));
 
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
export function resolveProjectDataDir(env = process.env, { warn = console.warn } = {}) {
  const primary = String(env.OPENPRISM_DATA_DIR || '').trim();
  const legacy = String(env.OPENPRISM_PROJECTS_DIR || '').trim();
  if (primary && legacy && path.resolve(primary) !== path.resolve(legacy)) {
    warn('[paper-agent] OPENPRISM_DATA_DIR and legacy OPENPRISM_PROJECTS_DIR conflict; OPENPRISM_DATA_DIR is authoritative and the legacy value is ignored.');
  }
  return path.resolve(primary || legacy || path.resolve(REPO_ROOT, '..', 'papers'));
}

export const DATA_DIR = resolveProjectDataDir();
export const TEMPLATE_DIR = path.join(REPO_ROOT, 'templates');
export const TEMPLATE_MANIFEST = path.join(TEMPLATE_DIR, 'manifest.json');
export const PORT = Number(process.env.OPENPRISM_PORT || process.env.PORT || 8787);
// Never use a repository-wide fallback signing key. A process-local random key
// keeps collaboration tokens non-portable when an administrator has not
// explicitly configured a secret, while production deployments should still
// provide OPENPRISM_COLLAB_TOKEN_SECRET to preserve tokens across restarts.
export const COLLAB_TOKEN_SECRET = String(process.env.OPENPRISM_COLLAB_TOKEN_SECRET || '').trim()
  || crypto.randomBytes(32).toString('hex');
export const COLLAB_TOKEN_TTL = Number(process.env.OPENPRISM_COLLAB_TOKEN_TTL || 24 * 60 * 60);
const requireTokenEnv = process.env.OPENPRISM_COLLAB_REQUIRE_TOKEN;
export const COLLAB_REQUIRE_TOKEN = requireTokenEnv
  ? !['0', 'false', 'no'].includes(String(requireTokenEnv).toLowerCase())
  : true;
export const COLLAB_FLUSH_DEBOUNCE_MS = Number(process.env.OPENPRISM_COLLAB_FLUSH_DEBOUNCE_MS || 800);
export const TUNNEL_MODE = process.env.OPENPRISM_TUNNEL || 'false';
 
// MinerU API
export const MINERU_API_BASE = 'https://mineru.net/api/v4';
export const MINERU_POLL_INTERVAL_MS = 3000;
export const MINERU_MAX_POLL_ATTEMPTS = 200;
 
