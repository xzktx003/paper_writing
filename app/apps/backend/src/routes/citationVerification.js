/**
 * Citation Verification Routes
 * 引用验证 API — 验证 .bib 和 .tex 中的引用真实性
 */
 
import { readFile, readdir } from 'fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'path';
import {
  verifyBibFile,
  verifyTexCitations,
  crossCheckCitations,
} from '../services/citationVerificationService.js';
import { getProjectRoot } from '../services/projectService.js';
import { resolveManagedProjectRequest } from '../services/managedProjectContext.js';
import { findExistingMainTexFile } from '../services/compileService.js';

const DEFAULT_TEX_FILES = ['main.tex', 'paper.tex', 'manuscript.tex'];
const IGNORED_TEX_DIRECTORIES = new Set(['.compile', '.git', 'node_modules']);
const MAX_TEX_FILES = 500;

export async function resolveCitationProjectPath(projectPath, resolveProjectRoot = getProjectRoot) {
  if (projectPath?.startsWith('__paper_agent__:')) {
    const projectId = projectPath.slice('__paper_agent__:'.length).trim();
    if (!projectId) throw Object.assign(new Error('Paper Agent project id is required'), { code: 'INVALID_PATH' });
    return resolveProjectRoot(projectId);
  }
  return projectPath;
}

function isInsideProject(projectRoot, candidate) {
  const rel = relative(projectRoot, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function stripTexComments(content) {
  return content
    .split(/\r?\n/)
    .map(line => line.replace(/(^|[^\\])%.*/, '$1'))
    .join('\n');
}

function findTexIncludes(content) {
  const includes = [];
  const includePattern = /\\(?:input|include)\s*\{([^}]+)\}/g;
  const uncommented = stripTexComments(content);
  let match;
  while ((match = includePattern.exec(uncommented)) !== null) {
    const value = match[1].trim();
    if (value) includes.push(value.toLowerCase().endsWith('.tex') ? value : `${value}.tex`);
  }
  return includes;
}

async function findAllTexFiles(projectRoot, directory = projectRoot, files = []) {
  if (files.length >= MAX_TEX_FILES) return files;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= MAX_TEX_FILES) break;
    if (entry.isDirectory() && IGNORED_TEX_DIRECTORIES.has(entry.name)) continue;
    const fullPath = resolve(directory, entry.name);
    if (!isInsideProject(projectRoot, fullPath)) continue;
    if (entry.isDirectory()) {
      await findAllTexFiles(projectRoot, fullPath, files);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.tex')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function findAllBibFiles(projectRoot, directory = projectRoot, files = []) {
  if (files.length >= MAX_TEX_FILES) return files;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= MAX_TEX_FILES) break;
    if (entry.isDirectory() && IGNORED_TEX_DIRECTORIES.has(entry.name)) continue;
    const fullPath = resolve(directory, entry.name);
    if (!isInsideProject(projectRoot, fullPath)) continue;
    if (entry.isDirectory()) {
      await findAllBibFiles(projectRoot, fullPath, files);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.bib')) {
      files.push(fullPath);
    }
  }
  return files;
}

function findBibliographyReferences(content) {
  const references = [];
  const uncommented = stripTexComments(content);
  const patterns = [
    /\\bibliography\s*\{([^}]+)\}/g,
    /\\addbibresource(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(uncommented)) !== null) {
      for (const rawValue of match[1].split(',')) {
        const value = rawValue.trim();
        if (value) references.push(value.toLowerCase().endsWith('.bib') ? value : `${value}.bib`);
      }
    }
  }
  return [...new Set(references)];
}

export async function readProjectBibliography(projectPath, options = {}) {
  const projectRoot = resolve(projectPath);
  const mainFile = options.mainFile || await findExistingMainTexFile(projectRoot);
  let bibReferences = [];

  if (options.bibFile) {
    bibReferences = [options.bibFile];
  } else if (mainFile) {
    const texContent = await readProjectTexContent(projectRoot, mainFile);
    bibReferences = findBibliographyReferences(texContent);
  }

  if (bibReferences.length === 0) {
    const discovered = await findAllBibFiles(projectRoot);
    if (discovered.length === 1) {
      bibReferences = [relative(projectRoot, discovered[0])];
    } else if (discovered.length > 1) {
      throw Object.assign(new Error('Multiple BibTeX files found, but the main TeX file does not declare which one to use'), { code: 'AMBIGUOUS_BIB' });
    } else if (!mainFile) {
      throw Object.assign(new Error('No compilable main TeX file or BibTeX file found in project'), { code: 'MAIN_NOT_FOUND' });
    } else {
      throw Object.assign(new Error(`Main TeX file ${mainFile} does not reference a BibTeX file`), { code: 'BIB_NOT_FOUND' });
    }
  }

  const contents = [];
  const bibFiles = [];
  for (const bibReference of bibReferences) {
    const bibPath = resolve(projectRoot, bibReference);
    if (!isInsideProject(projectRoot, bibPath)) {
      throw Object.assign(new Error(`BibTeX file must be inside the project: ${bibReference}`), { code: 'INVALID_PATH' });
    }
    try {
      contents.push(await readFile(bibPath, 'utf-8'));
      bibFiles.push(relative(projectRoot, bibPath));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw Object.assign(new Error(`BibTeX file referenced by ${mainFile || 'request'} not found: ${bibReference}`), { code: 'BIB_NOT_FOUND' });
      }
      throw error;
    }
  }

  return { content: contents.join('\n\n'), bibFiles, mainFile };
}

function sendBibliographyError(reply, error) {
  const clientErrors = new Set(['INVALID_PATH', 'AMBIGUOUS_BIB']);
  const notFoundErrors = new Set(['BIB_NOT_FOUND', 'MAIN_NOT_FOUND']);
  const status = clientErrors.has(error?.code) ? 400 : notFoundErrors.has(error?.code) ? 404 : 500;
  return reply.code(status).send({ error: error?.message || 'Failed to resolve project bibliography' });
}

/**
 * Read a TeX project from an entry file and recursively expand \input/\include.
 * Falls back to all project TeX files when no conventional main file exists.
 */
export async function readProjectTexContent(projectPath, texFile) {
  const projectRoot = resolve(projectPath);
  const visited = new Set();

  async function readTree(filePath) {
    const resolvedPath = resolve(filePath);
    if (!isInsideProject(projectRoot, resolvedPath) || visited.has(resolvedPath)) return '';
    const content = await readFile(resolvedPath, 'utf-8');
    visited.add(resolvedPath);
    if (visited.size > MAX_TEX_FILES) throw new Error(`Too many TeX files (limit: ${MAX_TEX_FILES})`);
    const nested = [];
    for (const include of findTexIncludes(content)) {
      const includePath = resolve(dirname(resolvedPath), include);
      if (!isInsideProject(projectRoot, includePath)) continue;
      try {
        nested.push(await readTree(includePath));
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    return [content, ...nested].filter(Boolean).join('\n\n');
  }

  if (texFile) {
    const entryPath = resolve(projectRoot, texFile);
    if (!isInsideProject(projectRoot, entryPath)) {
      throw Object.assign(new Error('TeX file must be inside the project'), { code: 'INVALID_PATH' });
    }
    return readTree(entryPath);
  }

  for (const name of DEFAULT_TEX_FILES) {
    try {
      return await readTree(resolve(projectRoot, name));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  const texFiles = await findAllTexFiles(projectRoot);
  const contents = [];
  for (const filePath of texFiles) contents.push(await readTree(filePath));
  return contents.filter(Boolean).join('\n\n');
}
 
/**
 * 注册引用验证路由
 * @param {import('fastify').FastifyInstance} fastify
 */
export function registerCitationVerificationRoutes(fastify, options = {}) {
  const resolveProjectRoot = options.resolveProjectRoot || getProjectRoot;
  const resolveContext = (request, reply, route) => resolveManagedProjectRequest(request, reply, {
    route,
    resolveProjectRoot,
  });
  /**
   * POST /api/citations/verify
   * 验证 .bib 文件中的所有条目
   * Body: { projectId: string, bibFile?: string }
   * Formal paper routes use managed projectId; projectPath is deprecated.
   */
  fastify.post('/api/citations/verify', async (request, reply) => {
    const { bibFile } = request.body || {};
    const { projectRoot: resolvedProjectPath } = await resolveContext(request, reply, 'citations.verify');
 
    let bibliography;
    try {
      bibliography = await readProjectBibliography(resolvedProjectPath, { bibFile });
    } catch (error) {
      return sendBibliographyError(reply, error);
    }
 
    try {
      const report = await verifyBibFile(bibliography.content, { concurrency: 5 });
      return { ...report, bibFiles: bibliography.bibFiles, mainFile: bibliography.mainFile };
    } catch (e) {
      fastify.log.error(e, 'Citation verification failed');
      return reply.code(500).send({ error: e.message });
    }
  });
 
  /**
   * POST /api/citations/verify-tex
   * 验证 .tex 文档中的引用并交叉检查 .bib
   * Body: { projectId: string, texFile?: string, bibFile?: string }
   * External tools may use externalProjectPath; projectPath is deprecated.
   */
  fastify.post('/api/citations/verify-tex', async (request, reply) => {
    const { texFile, bibFile } = request.body || {};
    const { projectRoot: resolvedProjectPath } = await resolveContext(request, reply, 'citations.verify-tex');
 
    let bibliography;
    try {
      bibliography = await readProjectBibliography(resolvedProjectPath, { bibFile });
    } catch (error) {
      return sendBibliographyError(reply, error);
    }
 
    let texContent = '';
    try {
      texContent = await readProjectTexContent(resolvedProjectPath, texFile || bibliography.mainFile);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return reply.code(404).send({ error: `TeX file not found: ${texFile || 'main.tex'}` });
      }
      if (error?.code === 'INVALID_PATH') {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
 
    if (!texContent && !bibliography.content) {
      return reply.code(404).send({ error: 'No .tex or .bib content found in project' });
    }
 
    try {
      // 如果有 tex 内容，做完整的交叉检查+验证
      if (texContent) {
        const report = await verifyTexCitations(texContent, bibliography.content, { concurrency: 5 });
        return { ...report, bibFiles: bibliography.bibFiles, mainFile: bibliography.mainFile };
      }
      // 只有 bib 文件，直接验证 bib
      const report = await verifyBibFile(bibliography.content, { concurrency: 5 });
      return { ...report, bibFiles: bibliography.bibFiles, mainFile: bibliography.mainFile };
    } catch (e) {
      fastify.log.error(e, 'TeX citation verification failed');
      return reply.code(500).send({ error: e.message });
    }
  });
 
  /**
   * POST /api/citations/cross-check
   * 快速交叉检查（不调用外部 API，仅对比 .tex 和 .bib）
   * Body: { projectId: string, texFile?: string, bibFile?: string }
   * External tools may use externalProjectPath; projectPath is deprecated.
   */
  fastify.post('/api/citations/cross-check', async (request, reply) => {
    const { texFile, bibFile } = request.body || {};
    const { projectRoot: resolvedProjectPath } = await resolveContext(request, reply, 'citations.cross-check');
 
    let bibliography;
    try {
      bibliography = await readProjectBibliography(resolvedProjectPath, { bibFile });
    } catch (error) {
      return sendBibliographyError(reply, error);
    }
 
    let texContent = '';
    try {
      texContent = await readProjectTexContent(resolvedProjectPath, texFile || bibliography.mainFile);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return reply.code(404).send({ error: `TeX file not found: ${texFile || 'main.tex'}` });
      }
      if (error?.code === 'INVALID_PATH') {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
 
    if (!texContent && !bibliography.content) {
      return reply.code(404).send({ error: 'No .tex or .bib content found' });
    }
 
    try {
      const result = crossCheckCitations(texContent, bibliography.content);
      return { ...result, bibFiles: bibliography.bibFiles, mainFile: bibliography.mainFile };
    } catch (e) {
      fastify.log.error(e, 'Cross-check failed');
      return reply.code(500).send({ error: e.message });
    }
  });
}
 
