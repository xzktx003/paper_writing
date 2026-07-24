import { loadProject, saveProject, createProject } from '../services/projectService.js';
import { listDir } from '../services/fileManager.js';
import { assertWithinDataDir } from '../utils/pathSecurity.js';
 
export function registerPaperProjectRoutes(fastify, options = {}) {
  if (!options.enabled) return;

  fastify.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/api/paper/')) {
      reply.header('Deprecation', 'true');
      reply.header('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT');
      reply.header('Link', '</api/projects>; rel="successor-version"');
    }
    return payload;
  });

  fastify.post('/api/paper/open', async (request) => {
    const { path } = request.body;
    const resolvedPath = assertWithinDataDir(path);
    const config = await loadProject(resolvedPath);
    return { path: resolvedPath, config };
  });
 
  fastify.post('/api/paper/create', async (request) => {
    const { path, config } = request.body;
    const resolvedPath = assertWithinDataDir(path);
    await createProject(resolvedPath, config);
    return { path: resolvedPath, config };
  });
 
  fastify.put('/api/paper/config', async (request) => {
    const { path, config } = request.body;
    const resolvedPath = assertWithinDataDir(path);
    await saveProject(resolvedPath, config);
    return { ok: true };
  });
 
  fastify.post('/api/paper/tree', async (request) => {
    const { path } = request.body;
    const resolvedPath = assertWithinDataDir(path);
    return listDir(resolvedPath);
  });
}
 
