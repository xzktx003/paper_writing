import { loadProject, saveProject, createProject } from '../services/projectService.js';
import { listDir } from '../services/fileManager.js';
import { assertWithinDataDir } from '../utils/pathSecurity.js';
 
export function registerPaperProjectRoutes(fastify) {
  fastify.post('/api/paper/open', async (request) => {
    const { path } = request.body;
    assertWithinDataDir(path);
    const config = await loadProject(path);
    return { path, config };
  });
 
  fastify.post('/api/paper/create', async (request) => {
    const { path, config } = request.body;
    assertWithinDataDir(path);
    await createProject(path, config);
    return { path, config };
  });
 
  fastify.put('/api/paper/config', async (request) => {
    const { path, config } = request.body;
    assertWithinDataDir(path);
    await saveProject(path, config);
    return { ok: true };
  });
 
  fastify.post('/api/paper/tree', async (request) => {
    const { path } = request.body;
    assertWithinDataDir(path);
    return listDir(path);
  });
}
 
