import { readTextFile, writeTextFile, deleteFile } from '../services/fileManager.js';
import { addChapter, reorderChapters, loadProject, saveProject } from '../services/projectService.js';
import { safeJoin, assertWithinDataDir } from '../utils/pathSecurity.js';
 
export function registerChapterRoutes(fastify) {
  fastify.post('/api/chapters/list', async (request) => {
    const { projectPath } = request.body;
    assertWithinDataDir(projectPath);
    const config = await loadProject(projectPath);
    return config.chapters || [];
  });
 
  fastify.post('/api/chapters/read', async (request) => {
    const { projectPath, filename } = request.body;
    assertWithinDataDir(projectPath);
    const fullPath = safeJoin(projectPath, 'chapters', filename);
    const content = await readTextFile(fullPath);
    return { filename, content };
  });
 
  fastify.post('/api/chapters/write', async (request) => {
    const { projectPath, filename, content } = request.body;
    assertWithinDataDir(projectPath);
    const fullPath = safeJoin(projectPath, 'chapters', filename);
    await writeTextFile(fullPath, content);
    return { ok: true };
  });
 
  fastify.post('/api/chapters/create', async (request) => {
    const { projectPath, filename } = request.body;
    assertWithinDataDir(projectPath);
    safeJoin(projectPath, 'chapters', filename);
    const config = await addChapter(projectPath, filename);
    return config;
  });
 
  fastify.post('/api/chapters/reorder', async (request) => {
    const { projectPath, order } = request.body;
    assertWithinDataDir(projectPath);
    const config = await reorderChapters(projectPath, order);
    return config;
  });
 
  fastify.post('/api/chapters/delete', async (request) => {
    const { projectPath, filename } = request.body;
    assertWithinDataDir(projectPath);
    const fullPath = safeJoin(projectPath, 'chapters', filename);
    await deleteFile(fullPath);
    const config = await loadProject(projectPath);
    config.chapters = config.chapters.filter(c => c.file !== filename);
    await saveProject(projectPath, config);
    return { ok: true };
  });
}
 
