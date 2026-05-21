import { readTextFile, writeTextFile, deleteFile } from '../services/fileManager.js';
import { addChapter, reorderChapters, loadProject, saveProject } from '../services/projectService.js';
import { join } from 'path';

export function registerChapterRoutes(fastify) {
  fastify.post('/api/chapters/list', async (request) => {
    const { projectPath } = request.body;
    const config = await loadProject(projectPath);
    return config.chapters || [];
  });

  fastify.post('/api/chapters/read', async (request) => {
    const { projectPath, filename } = request.body;
    const content = await readTextFile(join(projectPath, 'chapters', filename));
    return { filename, content };
  });

  fastify.post('/api/chapters/write', async (request) => {
    const { projectPath, filename, content } = request.body;
    await writeTextFile(join(projectPath, 'chapters', filename), content);
    return { ok: true };
  });

  fastify.post('/api/chapters/create', async (request) => {
    const { projectPath, filename } = request.body;
    const config = await addChapter(projectPath, filename);
    return config;
  });

  fastify.post('/api/chapters/reorder', async (request) => {
    const { projectPath, order } = request.body;
    const config = await reorderChapters(projectPath, order);
    return config;
  });

  fastify.post('/api/chapters/delete', async (request) => {
    const { projectPath, filename } = request.body;
    await deleteFile(join(projectPath, 'chapters', filename));
    const config = await loadProject(projectPath);
    config.chapters = config.chapters.filter(c => c.file !== filename);
    await saveProject(projectPath, config);
    return { ok: true };
  });
}
