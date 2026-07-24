import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKBENCH_HTML = join(__dirname, '../../../frontend/public/paper-writer-workbench.html');

export function isLegacyWorkbenchEnabled(env = process.env) {
  return String(env.OPENPRISM_ENABLE_LEGACY_WORKBENCH || '').trim().toLowerCase() === 'true';
}

export function registerWorkbenchPrototypeRoutes(fastify, options = {}) {
  const enabled = options.enabled ?? isLegacyWorkbenchEnabled(options.env);
  const htmlPath = options.htmlPath || DEFAULT_WORKBENCH_HTML;

  if (!enabled) {
    const legacyWorkbenchDisabled = async (_request, reply) => reply.code(404).send({
      error: 'Legacy workbench is disabled',
      statusCode: 404,
    });
    fastify.get('/paper-writer-workbench.html', legacyWorkbenchDisabled);
    fastify.get('/writing-workbench', legacyWorkbenchDisabled);
    return false;
  }

  async function sendWorkbench(_request, reply) {
    const html = await readFile(htmlPath, 'utf-8');
    return reply
      .header('Cache-Control', 'no-store')
      .header('X-Robots-Tag', 'noindex, nofollow')
      .header('X-OpenPrism-Legacy', 'true')
      .type('text/html; charset=utf-8')
      .send(html);
  }

  fastify.get('/paper-writer-workbench.html', sendWorkbench);
  fastify.get('/writing-workbench', sendWorkbench);
  return true;
}
