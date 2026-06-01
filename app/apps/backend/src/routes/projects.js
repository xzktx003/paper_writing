import path from 'path';
import { promises as fs, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import * as tar from 'tar';
import unzipper from 'unzipper';
import crypto from 'crypto';
import { DATA_DIR, TEMPLATE_DIR } from '../config/constants.js';
import { ensureDir, readJson, writeJson, copyDir, listFilesRecursive } from '../utils/fsUtils.js';
import { safeJoin, sanitizeUploadPath } from '../utils/pathSecurity.js';
import { isTextFile } from '../utils/texUtils.js';
import { getProjectRoot } from '../services/projectService.js';
import { downloadArxivSource, extractArxivId } from '../services/arxivService.js';
import { getLang, t } from '../i18n/index.js';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.eps'];
const PROJECT_FILE_EXTENSIONS = new Set(['.tex', '.bib', '.pdf', '.md', '.sty', '.cls']);
const PROJECT_SCAN_EXCLUDES = new Set([
  '.git',
  '.playwright-deps',
  'node_modules',
  '.compile',
]);

function downloadFileName(relPath, fallbackName) {
  const base = path.basename(relPath || '') || fallbackName || 'download';
  return base.replace(/[\r\n"]/g, '_');
}

// Per-project lock to prevent concurrent project.json writes
const projectLocks = new Map();

function acquireProjectLock(projectId) {
  if (!projectLocks.has(projectId)) {
    projectLocks.set(projectId, Promise.resolve());
  }
  let release;
  const next = new Promise((resolve) => { release = resolve; });
  const prev = projectLocks.get(projectId);
  projectLocks.set(projectId, next);
  return prev.then(() => release);
}

async function updateProjectMeta(projectId, updater) {
  const release = await acquireProjectLock(projectId);
  try {
    const projectRoot = await getProjectRoot(projectId);
    const metaPath = path.join(projectRoot, 'project.json');
    const meta = await readJson(metaPath);
    const next = updater(meta);
    await writeJson(metaPath, next);
    return next;
  } finally {
    release();
  }
}

async function ensureDocsSupportDir(projectRoot) {
  await ensureDir(path.join(projectRoot, 'docs'));
}

async function containsPaperProjectFiles(projectRoot, depth = 0) {
  if (depth > 2) return false;

  let entries = [];
  try {
    entries = await fs.readdir(projectRoot, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (entry.name === 'project.json' || PROJECT_SCAN_EXCLUDES.has(entry.name)) continue;

    const abs = path.join(projectRoot, entry.name);
    if (entry.isFile() && PROJECT_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      return true;
    }
    if (entry.isDirectory() && !entry.name.startsWith('.') && await containsPaperProjectFiles(abs, depth + 1)) {
      return true;
    }
  }

  return false;
}

async function createProjectMetaForUploadedFolder(projectRoot, dirName) {
  if (!await containsPaperProjectFiles(projectRoot)) return null;

  const dirStat = await fs.stat(projectRoot);
  const createdAt = dirStat.birthtime?.toISOString?.() || new Date().toISOString();
  const updatedAt = dirStat.mtime?.toISOString?.() || createdAt;
  const meta = {
    id: crypto.randomUUID(),
    name: dirName,
    createdAt,
    updatedAt,
    tags: [],
    archived: false,
    trashed: false,
    trashedAt: null
  };
  await writeJson(path.join(projectRoot, 'project.json'), meta);
  return meta;
}

export function registerProjectRoutes(fastify) {
  fastify.get('/api/projects', async () => {
    await ensureDir(DATA_DIR);
    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
    const projects = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (PROJECT_SCAN_EXCLUDES.has(entry.name)) continue;
      const projectRoot = path.join(DATA_DIR, entry.name);
      const metaPath = path.join(projectRoot, 'project.json');
      try {
        let meta;
        try {
          meta = await readJson(metaPath);
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
          meta = await createProjectMetaForUploadedFolder(projectRoot, entry.name);
        }
        if (!meta) continue;
        projects.push({
          ...meta,
          dirName: entry.name,
          updatedAt: meta.updatedAt || meta.createdAt,
          tags: meta.tags || [],
          archived: meta.archived || false,
          trashed: meta.trashed || false,
          trashedAt: meta.trashedAt || null
        });
      } catch {
        // ignore
      }
    }
    return { projects };
  });

  fastify.post('/api/projects', async (req, reply) => {
    await ensureDir(DATA_DIR);
    const { name = 'Untitled', template } = req.body || {};
    const id = crypto.randomUUID();
    const projectRoot = path.join(DATA_DIR, id);
    await ensureDir(projectRoot);
    await ensureDocsSupportDir(projectRoot);
    const meta = { id, name, createdAt: new Date().toISOString() };
    await writeJson(path.join(projectRoot, 'project.json'), meta);
    if (template) {
      const templateRoot = path.join(TEMPLATE_DIR, template);
      await copyDir(templateRoot, projectRoot);
    }
    reply.send(meta);
  });

  fastify.post('/api/projects/import-zip', async (req) => {
    const lang = getLang(req);
    await ensureDir(DATA_DIR);
    const id = crypto.randomUUID();
    const projectRoot = path.join(DATA_DIR, id);
    await ensureDir(projectRoot);
    let projectName = 'Imported Project';
    let hasZip = false;

    try {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'projectName') {
          projectName = String(part.value || '').trim() || projectName;
          continue;
        }
        if (part.type !== 'file') continue;
        hasZip = true;
        const zipStream = part.file.pipe(unzipper.Parse({ forceStream: true }));
        for await (const entry of zipStream) {
          const relPath = sanitizeUploadPath(entry.path);
          if (!relPath || relPath.endsWith('project.json')) {
            entry.autodrain();
            continue;
          }
          const abs = safeJoin(projectRoot, relPath);
          if (entry.type === 'Directory') {
            await ensureDir(abs);
            entry.autodrain();
            continue;
          }
          await ensureDir(path.dirname(abs));
          await pipeline(entry, createWriteStream(abs));
        }
      }
    } catch (err) {
      await fs.rm(projectRoot, { recursive: true, force: true });
      return { ok: false, error: t(lang, 'zip_extract_failed', { error: String(err) }) };
    }

    if (!hasZip) {
      return { ok: false, error: 'Missing zip file.' };
    }

    const meta = { id, name: projectName, createdAt: new Date().toISOString() };
    await writeJson(path.join(projectRoot, 'project.json'), meta);
    return { ok: true, project: meta };
  });

  fastify.get('/api/projects/import-arxiv-sse', async (req, reply) => {
    const lang = getLang(req);
    await ensureDir(DATA_DIR);
    const { arxivIdOrUrl, projectName } = req.query;
    const arxivId = extractArxivId(arxivIdOrUrl);
    req.log.info({ arxivId, arxivIdOrUrl }, 'import-arxiv-sse: parsed id');

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    const send = (event, data) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    if (!arxivId) {
      send('error', { error: 'Invalid arXiv ID.' });
      reply.raw.end();
      return reply;
    }

    const id = crypto.randomUUID();
    const projectRoot = path.join(DATA_DIR, id);
    await ensureDir(projectRoot);
    const meta = {
      id,
      name: projectName || `arxiv-${arxivId}`,
      createdAt: new Date().toISOString()
    };

    const tmpTar = path.join(projectRoot, '__arxiv_source.tar.gz');
    try {
      send('progress', { phase: 'download', percent: 0 });
      await downloadArxivSource(arxivId, tmpTar, ({ received, total }) => {
        const percent = total > 0 ? Math.round((received / total) * 100) : -1;
        send('progress', { phase: 'download', percent, received, total });
      });

      send('progress', { phase: 'extract', percent: -1 });
      await tar.x({
        file: tmpTar,
        cwd: projectRoot,
        filter: (entryPath) => {
          if (!entryPath) return false;
          if (path.isAbsolute(entryPath)) return false;
          return !entryPath.split('/').some((part) => part === '..');
        }
      });
    } catch (err) {
      await fs.rm(projectRoot, { recursive: true, force: true });
      send('error', { error: t(lang, 'arxiv_download_failed', { error: String(err) }) });
      reply.raw.end();
      return reply;
    } finally {
      await fs.rm(tmpTar, { force: true });
    }

    await writeJson(path.join(projectRoot, 'project.json'), meta);
    send('done', { ok: true, project: meta });
    reply.raw.end();
    return reply;
  });

  fastify.post('/api/projects/:id/rename-project', async (req) => {
    const { id } = req.params;
    const { name } = req.body || {};
    if (!name) return { ok: false, error: 'Missing name' };
    const next = await updateProjectMeta(id, (meta) => ({ ...meta, name }));
    return { ok: true, project: next };
  });

  fastify.post('/api/projects/:id/copy', async (req) => {
    const { id } = req.params;
    const { name } = req.body || {};
    const srcRoot = await getProjectRoot(id);
    const srcMeta = await readJson(path.join(srcRoot, 'project.json'));
    const newId = crypto.randomUUID();
    const destRoot = path.join(DATA_DIR, newId);
    await copyDir(srcRoot, destRoot);
    const newMeta = {
      ...srcMeta,
      id: newId,
      name: name || `${srcMeta.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      trashed: false,
      trashedAt: null,
    };
    await writeJson(path.join(destRoot, 'project.json'), newMeta);
    return { ok: true, project: newMeta };
  });

  fastify.delete('/api/projects/:id', async (req) => {
    const { id } = req.params;
    const projectRoot = await getProjectRoot(id);
    const metaPath = path.join(projectRoot, 'project.json');
    let meta;
    try {
      await fs.access(projectRoot);
      meta = await readJson(metaPath);
    } catch (err) {
      if (err.code === 'ENOENT' || err instanceof SyntaxError) {
        try {
          const stat = await fs.stat(projectRoot);
          if (!stat.isDirectory()) return { ok: true };
        } catch (statErr) {
          if (statErr.code === 'ENOENT') return { ok: true };
          throw statErr;
        }
        meta = { id, name: id, createdAt: new Date().toISOString() };
      } else {
        throw err;
      }
    }
    const next = {
      ...meta,
      id: meta.id || id,
      name: meta.name || id,
      trashed: true,
      trashedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await writeJson(metaPath, next);
    return { ok: true };
  });

  fastify.delete('/api/projects/:id/permanent', async (req) => {
    const { id } = req.params;
    const projectRoot = await getProjectRoot(id);
    await fs.rm(projectRoot, { recursive: true, force: true });
    return { ok: true };
  });

  fastify.patch('/api/projects/:id/tags', async (req) => {
    const { id } = req.params;
    const { tags } = req.body || {};
    if (!Array.isArray(tags)) return { ok: false, error: 'tags must be an array' };
    const next = await updateProjectMeta(id, (meta) => ({ ...meta, tags, updatedAt: new Date().toISOString() }));
    return { ok: true, project: next };
  });

  fastify.patch('/api/projects/:id/archive', async (req) => {
    const { id } = req.params;
    const { archived } = req.body || {};
    const next = await updateProjectMeta(id, (meta) => ({ ...meta, archived: !!archived, updatedAt: new Date().toISOString() }));
    return { ok: true, project: next };
  });

  fastify.patch('/api/projects/:id/trash', async (req) => {
    const { id } = req.params;
    const { trashed } = req.body || {};
    const next = await updateProjectMeta(id, (meta) => ({
      ...meta,
      trashed: !!trashed,
      trashedAt: trashed ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString()
    }));
    return { ok: true, project: next };
  });

  fastify.get('/api/projects/:id/tree', async (req) => {
    const { id } = req.params;
    const projectRoot = await getProjectRoot(id);
    await ensureDocsSupportDir(projectRoot);
    const items = await listFilesRecursive(projectRoot);
    let fileOrder = {};
    try {
      const meta = await readJson(path.join(projectRoot, 'project.json'));
      fileOrder = meta?.fileOrder || {};
    } catch {
      fileOrder = {};
    }
    return { items, fileOrder };
  });

  fastify.post('/api/projects/:id/file-order', async (req) => {
    const { id } = req.params;
    const { folder = '', order } = req.body || {};
    if (!Array.isArray(order)) {
      return { ok: false, error: 'Missing order.' };
    }
    await updateProjectMeta(id, (meta) => ({
      ...meta,
      fileOrder: { ...(meta.fileOrder || {}), [folder]: order },
    }));
    return { ok: true };
  });

  fastify.get('/api/projects/:id/file', async (req) => {
    const { id } = req.params;
    const { path: filePath } = req.query;
    if (!filePath) return { content: '' };
    const projectRoot = await getProjectRoot(id);
    const abs = safeJoin(projectRoot, filePath);
    const content = await fs.readFile(abs, 'utf8');
    return { content };
  });

  fastify.get('/api/projects/:id/blob', async (req, reply) => {
    const { id } = req.params;
    const { path: filePath } = req.query;
    if (!filePath) return reply.code(400).send('Missing path');
    const projectRoot = await getProjectRoot(id);
    let resolvedPath = filePath;
    let abs = safeJoin(projectRoot, filePath);
    let buffer;
    try {
      buffer = await fs.readFile(abs);
    } catch (err) {
      if (err.code !== 'ENOENT' || path.extname(filePath)) throw err;
      for (const ext of IMAGE_EXTENSIONS) {
        try {
          resolvedPath = `${filePath}${ext}`;
          abs = safeJoin(projectRoot, resolvedPath);
          buffer = await fs.readFile(abs);
          break;
        } catch (candidateErr) {
          if (candidateErr.code !== 'ENOENT') throw candidateErr;
        }
      }
      if (!buffer) throw err;
    }
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.eps': 'application/postscript'
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';
    reply.header('Content-Type', contentType);
    reply.header('Content-Disposition', ext === '.pdf' ? 'inline' : 'inline');
    return reply.send(buffer);
  });

  fastify.get('/api/projects/:id/download', async (req, reply) => {
    const { id } = req.params;
    const { path: filePath = '' } = req.query;
    const projectRoot = await getProjectRoot(id);
    const relPath = sanitizeUploadPath(filePath) || '';
    const abs = safeJoin(projectRoot, relPath);
    const info = await fs.stat(abs);

    if (info.isDirectory()) {
      const archiveName = `${downloadFileName(relPath, id)}.tar.gz`;
      reply.header('Content-Type', 'application/gzip');
      reply.header('Content-Disposition', `attachment; filename="${archiveName}"`);
      const entries = relPath ? [relPath] : ['.'];
      return reply.send(tar.c({ gzip: true, cwd: projectRoot, portable: true }, entries));
    }

    const buffer = await fs.readFile(abs);
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${downloadFileName(relPath, id)}"`);
    return reply.send(buffer);
  });

  fastify.post('/api/projects/:id/upload', async (req) => {
    const { id } = req.params;
    const projectRoot = await getProjectRoot(id);
    const saved = [];
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type !== 'file') continue;
      let relPath = sanitizeUploadPath(part.filename); if (req.query.targetFolder) relPath = sanitizeUploadPath(req.query.targetFolder + "/" + relPath);
      if (!relPath) continue;
      const abs = safeJoin(projectRoot, relPath);
      await ensureDir(path.dirname(abs));
      await pipeline(part.file, createWriteStream(abs));
      saved.push(relPath);
    }
    return { ok: true, files: saved };
  });

  fastify.put('/api/projects/:id/file', async (req) => {
    const { id } = req.params;
    const { path: filePath, content } = req.body || {};
    if (!filePath) return { ok: false };
    const projectRoot = await getProjectRoot(id);
    const abs = safeJoin(projectRoot, filePath);
    await ensureDir(path.dirname(abs));
    await fs.writeFile(abs, content ?? '', 'utf8');
    try {
      await updateProjectMeta(id, (meta) => ({ ...meta, updatedAt: new Date().toISOString() }));
    } catch { /* ignore */ }
    return { ok: true };
  });

  fastify.post('/api/projects/:id/file', async (req) => {
    const { id } = req.params;
    const { path: filePath, type = 'file', content = '' } = req.body || {};
    if (!filePath) return { ok: false, error: 'Missing file path' };
    if (!['file', 'folder', 'dir'].includes(type)) {
      return { ok: false, error: 'Invalid create type' };
    }
    const projectRoot = await getProjectRoot(id);
    let abs;
    try {
      abs = safeJoin(projectRoot, filePath);
    } catch {
      return { ok: false, error: 'Invalid file path' };
    }
    try {
      await fs.access(abs);
      return { ok: false, error: 'Destination already exists.' };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    if (type === 'folder' || type === 'dir') {
      await ensureDir(abs);
    } else {
      await ensureDir(path.dirname(abs));
      await fs.writeFile(abs, content ?? '', 'utf8');
    }
    try {
      await updateProjectMeta(id, (meta) => ({ ...meta, updatedAt: new Date().toISOString() }));
    } catch { /* ignore */ }
    return { ok: true, path: filePath, type: type === 'folder' ? 'dir' : type };
  });

  fastify.get('/api/projects/:id/files', async (req) => {
    const { id } = req.params;
    const projectRoot = await getProjectRoot(id);
    const items = await listFilesRecursive(projectRoot);
    const files = [];
    for (const item of items) {
      if (item.type !== 'file') continue;
      const abs = path.join(projectRoot, item.path);
      const buffer = await fs.readFile(abs);
      if (isTextFile(item.path)) {
        files.push({ path: item.path, content: buffer.toString('utf8'), encoding: 'utf8' });
      } else {
        files.push({ path: item.path, content: buffer.toString('base64'), encoding: 'base64' });
      }
    }
    return { files };
  });

  fastify.post('/api/projects/:id/template', async (req) => {
    const { id } = req.params;
    const { template } = req.body || {};
    const projectRoot = await getProjectRoot(id);
    if (!template) return { ok: false };
    const templateRoot = path.join(TEMPLATE_DIR, template);
    await copyDir(templateRoot, projectRoot);
    return { ok: true };
  });

  fastify.post('/api/projects/:id/folder', async (req) => {
    const { id } = req.params;
    const { path: folderPath } = req.body || {};
    if (!folderPath) return { ok: false };
    const projectRoot = await getProjectRoot(id);
    const abs = safeJoin(projectRoot, folderPath);
    await ensureDir(abs);
    return { ok: true };
  });

  fastify.post('/api/projects/:id/rename', async (req) => {
    const { id } = req.params;
    const { from, to } = req.body || {};
    if (!from || !to) return { ok: false };
    const projectRoot = await getProjectRoot(id);
    const absFrom = safeJoin(projectRoot, from);
    const absTo = safeJoin(projectRoot, to);
    const sourceStat = await fs.stat(absFrom);
    if (sourceStat.isDirectory() && isInsidePath(absTo, absFrom)) {
      return { ok: false, error: 'Cannot move a folder into itself.' };
    }
    try {
      await fs.access(absTo);
      return { ok: false, error: 'Destination already exists.' };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    await ensureDir(path.dirname(absTo));
    await fs.rename(absFrom, absTo);
    return { ok: true };
  });

  fastify.post('/api/projects/:id/copy-file', async (req) => {
    const { id } = req.params;
    const { from, to } = req.body || {};
    if (!from || !to) return { ok: false, error: 'Missing source or destination.' };
    const projectRoot = await getProjectRoot(id);
    const absFrom = safeJoin(projectRoot, from);
    const absTo = safeJoin(projectRoot, to);
    const sourceStat = await fs.stat(absFrom);
    if (sourceStat.isDirectory() && isInsidePath(absTo, absFrom)) {
      return { ok: false, error: 'Cannot copy a folder into itself.' };
    }
    try {
      await fs.access(absTo);
      return { ok: false, error: 'Destination already exists.' };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    await ensureDir(path.dirname(absTo));
    await fs.cp(absFrom, absTo, { recursive: true, errorOnExist: true, force: false });
    return { ok: true };
  });

  fastify.delete('/api/projects/:id/file', async (req) => {
    const { id } = req.params;
    const { path: filePath } = req.query || {};
    if (!filePath) return { ok: false, error: 'Missing file path' };
    const projectRoot = await getProjectRoot(id);
    const abs = safeJoin(projectRoot, filePath);
    // Check if it's a directory
    try {
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        await fs.rm(abs, { recursive: true, force: true });
      } else {
        await fs.rm(abs, { force: true });
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { ok: false, error: 'File not found' };
      }
      throw err;
    }
    return { ok: true };
  });
}

function isInsidePath(candidatePath, parentPath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}
