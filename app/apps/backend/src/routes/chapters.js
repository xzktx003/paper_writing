import path from 'path';
import { readTextFile, writeTextFile, deleteFile } from '../services/fileManager.js';
import { addChapter, reorderChapters, loadProject, saveProject } from '../services/projectService.js';
import { safeJoin } from '../utils/pathSecurity.js';
import { resolveManagedProjectRequest } from '../services/managedProjectContext.js';

function toProjectRelativePath(projectRoot, fullPath) {
  return path.relative(projectRoot, fullPath).split(path.sep).join('/');
}

function resolveChapterFile(projectRoot, { legacy, filename, relativePath }) {
  if (legacy) {
    if (!filename) return null;
    const chaptersRoot = safeJoin(projectRoot, 'chapters');
    const fullPath = safeJoin(chaptersRoot, String(filename));
    return { fullPath, requestedPath: toProjectRelativePath(projectRoot, fullPath) };
  }
  const requestedPath = String(relativePath || filename || '');
  if (!requestedPath) return null;
  return { requestedPath, fullPath: safeJoin(projectRoot, requestedPath) };
}
 
export function registerChapterRoutes(fastify, options = {}) {
  const resolveProjectRoot = options.resolveProjectRoot;
  const resolveContext = (request, reply, route) => resolveManagedProjectRequest(request, reply, {
    route,
    ...(resolveProjectRoot ? { resolveProjectRoot } : {}),
  });

  fastify.post('/api/chapters/list', async (request, reply) => {
    const { projectRoot } = await resolveContext(request, reply, 'chapters.list');
    const config = await loadProject(projectRoot);
    return config.chapters || [];
  });
 
  fastify.post('/api/chapters/read', async (request, reply) => {
    const { filename, relativePath } = request.body || {};
    const { projectRoot, legacy } = await resolveContext(request, reply, 'chapters.read');
    const resolved = resolveChapterFile(projectRoot, { legacy, filename, relativePath });
    if (!resolved) return reply.code(400).send({ error: 'relativePath is required' });
    const { fullPath, requestedPath } = resolved;
    const content = await readTextFile(fullPath);
    return { filename: requestedPath, relativePath: requestedPath, content };
  });
 
  fastify.post('/api/chapters/write', async (request, reply) => {
    const { filename, relativePath, content } = request.body || {};
    const { projectRoot, legacy } = await resolveContext(request, reply, 'chapters.write');
    const resolved = resolveChapterFile(projectRoot, { legacy, filename, relativePath });
    if (!resolved) return reply.code(400).send({ error: 'relativePath is required' });
    const { fullPath } = resolved;
    await writeTextFile(fullPath, content);
    return { ok: true };
  });
 
  fastify.post('/api/chapters/create', async (request, reply) => {
    const { filename, relativePath } = request.body || {};
    const { projectRoot, legacy } = await resolveContext(request, reply, 'chapters.create');
    const chapterName = legacy ? String(filename || '') : String(relativePath || filename || '').replace(/^chapters\//, '');
    if (!chapterName) return reply.code(400).send({ error: 'relativePath is required' });
    safeJoin(safeJoin(projectRoot, 'chapters'), chapterName);
    const config = await addChapter(projectRoot, chapterName);
    return config;
  });
 
  fastify.post('/api/chapters/reorder', async (request, reply) => {
    const { order } = request.body || {};
    const { projectRoot } = await resolveContext(request, reply, 'chapters.reorder');
    const config = await reorderChapters(projectRoot, order);
    return config;
  });
 
  fastify.post('/api/chapters/delete', async (request, reply) => {
    const { filename, relativePath } = request.body || {};
    const { projectRoot, legacy } = await resolveContext(request, reply, 'chapters.delete');
    const resolved = resolveChapterFile(projectRoot, { legacy, filename, relativePath });
    if (!resolved) return reply.code(400).send({ error: 'relativePath is required' });
    const { fullPath, requestedPath } = resolved;
    await deleteFile(fullPath);
    const config = await loadProject(projectRoot);
    config.chapters = config.chapters.filter(c => c.file !== requestedPath && c.file !== requestedPath.replace(/^chapters\//, ''));
    await saveProject(projectRoot, config);
    return { ok: true };
  });
}
 
