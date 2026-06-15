import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKBENCH_HTML = join(__dirname, '../../../frontend/public/paper-writer-workbench.html');

export function registerWorkbenchPrototypeRoutes(fastify, options = {}) {
  const htmlPath = options.htmlPath || DEFAULT_WORKBENCH_HTML;

  async function sendWorkbench(_request, reply) {
    const html = await readFile(htmlPath, 'utf-8');
    return reply.type('text/html; charset=utf-8').send(html);
  }

  fastify.get('/paper-writer-workbench.html', sendWorkbench);
  fastify.get('/writing-workbench', sendWorkbench);
}
