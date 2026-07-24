import process from 'node:process';

const baseURL = String(process.env.BASE_URL || process.env.OPENPRISM_PUBLIC_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const token = String(process.env.OPENPRISM_API_TOKEN || '').trim();
const expectedDataRoot = String(process.env.OPENPRISM_DATA_DIR || '').trim();

async function request(path, init = {}) {
  const response = await fetch(`${baseURL}${path}`, init);
  const body = await response.json().catch(() => null);
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const health = await request('/api/health');
assert(health.response.ok && health.body?.ok === true, `Health check failed: HTTP ${health.response.status}`);
assert(health.body?.authRequired === true, 'Release must require server authentication.');
assert(health.body?.build?.id && health.body?.build?.apiSchemaVersion === 2, 'Health response is missing current build/schema metadata.');

const ready = await request('/api/ready');
assert(ready.response.ok && ready.body?.ready === true, `Readiness check failed: HTTP ${ready.response.status}`);

for (const path of ['/api/config', '/api/projects', '/api/capabilities', '/api/skills']) {
  const result = await request(path);
  assert(result.response.status === 401 || result.response.status === 403, `${path} is not protected without a token (HTTP ${result.response.status}).`);
}

assert(token, 'OPENPRISM_API_TOKEN is required for authenticated release verification.');
const headers = { Authorization: `Bearer ${token}` };
const config = await request('/api/config', { headers });
assert(config.response.ok, `Authenticated config failed: HTTP ${config.response.status}`);
if (expectedDataRoot) assert(config.body?.projects_dir === expectedDataRoot, `Configured data root mismatch: ${config.body?.projects_dir}`);

const projects = await request('/api/projects', { headers });
assert(projects.response.ok && Array.isArray(projects.body?.projects), `Authenticated projects failed: HTTP ${projects.response.status}`);
const providers = await request('/api/providers');
assert(providers.response.ok && Array.isArray(providers.body?.providers), `Provider metadata failed: HTTP ${providers.response.status}`);

const legacy = await fetch(`${baseURL}/paper-writer-workbench.html`);
assert(legacy.status === 404, `Legacy workbench must remain disabled (HTTP ${legacy.status}).`);

console.log(JSON.stringify({
  ok: true,
  baseURL,
  build: health.body.build,
  ready: ready.body,
  projectCount: projects.body.projects.length,
  providerCount: providers.body.providers.length,
  legacyWorkbenchStatus: legacy.status,
}, null, 2));
