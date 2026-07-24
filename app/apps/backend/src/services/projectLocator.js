import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { DATA_DIR, resolveProjectDataDir } from '../config/constants.js';

const DEFAULT_SLUG = 'project';
const MAX_SLUG_LENGTH = 72;
const META_FILE = 'project.json';
const projectLocks = new Map();
const projectLocationCache = new Map();

export { resolveProjectDataDir };

function projectCacheKey(dataDir, projectId) {
  return `${path.resolve(dataDir)}\0${projectId}`;
}

function rememberProjectLocation(dataDir, projectId, projectRoot) {
  projectLocationCache.set(projectCacheKey(dataDir, projectId), path.resolve(projectRoot));
}

function forgetProjectLocation(dataDir, projectId) {
  projectLocationCache.delete(projectCacheKey(dataDir, projectId));
}

/**
 * Clears locator entries for a data root. This is primarily useful for
 * controlled migrations/tests; normal filesystem changes are handled by
 * validation and eviction during getProjectRoot().
 */
export function clearProjectLocationCache({ dataDir = DATA_DIR, projectId } = {}) {
  const root = path.resolve(dataDir);
  if (projectId) {
    forgetProjectLocation(root, String(projectId).trim());
    return;
  }
  const prefix = `${root}\0`;
  for (const key of projectLocationCache.keys()) {
    if (key.startsWith(prefix)) projectLocationCache.delete(key);
  }
}

export class ProjectDirectoryConflictError extends Error {
  constructor(directoryName) {
    super(`Project directory already exists: ${directoryName}`);
    this.name = 'ProjectDirectoryConflictError';
    this.code = 'PROJECT_DIRECTORY_CONFLICT';
    this.statusCode = 409;
    this.directoryName = directoryName;
  }
}

export function slugifyProjectName(name, { maxLength = MAX_SLUG_LENGTH } = {}) {
  const normalized = String(name ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/[\s_]+/gu, '-')
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!normalized) return DEFAULT_SLUG;
  return Array.from(normalized).slice(0, maxLength).join('').replace(/-+$/g, '') || DEFAULT_SLUG;
}

function shortProjectId(id) {
  const compact = String(id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return (compact || crypto.randomUUID().replace(/-/g, '')).slice(0, 8);
}

export function buildProjectDirectoryName(name, id) {
  return `${slugifyProjectName(name)}--${shortProjectId(id)}`;
}

export function normalizeProjectName(name, fallback = 'Untitled') {
  const normalized = String(name ?? '').normalize('NFKC').trim();
  return normalized || fallback;
}

export function validateExistingProjectDirectoryName(directoryName) {
  const normalized = String(directoryName ?? '').normalize('NFKC').trim();
  if (!normalized
    || normalized === '.'
    || normalized === '..'
    || normalized.startsWith('.')
    || normalized.includes('\0')
    || normalized.includes('/')
    || normalized.includes('\\')
    || path.basename(normalized) !== normalized) {
    throw Object.assign(new Error('Invalid existing project directory name'), {
      code: 'INVALID_PROJECT_DIRECTORY',
      statusCode: 400,
    });
  }
  return normalized;
}

export async function getProjectRoot(id, { dataDir = DATA_DIR, allowMissing = false } = {}) {
  const projectId = String(id || '').trim();
  if (!projectId) throw Object.assign(new Error('Project id is required'), { statusCode: 400 });
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(projectId)) {
    throw Object.assign(new Error('Invalid project id'), { code: 'INVALID_PROJECT_ID', statusCode: 400 });
  }

  const cachedRoot = projectLocationCache.get(projectCacheKey(dataDir, projectId));
  if (cachedRoot) {
    try {
      const cachedStat = await fs.lstat(cachedRoot);
      if (cachedStat.isSymbolicLink()) {
        throw Object.assign(new Error(`Managed project root cannot be a symbolic link: ${projectId}`), {
          code: 'PROJECT_SYMLINK_NOT_ALLOWED',
          statusCode: 400,
        });
      }
      if (!cachedStat.isDirectory()) throw Object.assign(new Error('Cached project root is not a directory'), { code: 'STALE_PROJECT_CACHE' });
      const cachedMeta = JSON.parse(await fs.readFile(path.join(cachedRoot, META_FILE), 'utf8'));
      if (cachedMeta?.id === projectId) return cachedRoot;
    } catch (error) {
      if (error.code === 'PROJECT_SYMLINK_NOT_ALLOWED') throw error;
      if (!['ENOENT', 'STALE_PROJECT_CACHE'].includes(error.code) && !(error instanceof SyntaxError)) throw error;
    }
    forgetProjectLocation(dataDir, projectId);
  }

  const directRoot = path.join(dataDir, projectId);
  let directIdentityMismatch = false;
  let directPathExists = false;
  let directMatchRoot = null;
  try {
    const directStat = await fs.lstat(directRoot);
    directPathExists = true;
    if (directStat.isSymbolicLink()) {
      throw Object.assign(new Error(`Managed project root cannot be a symbolic link: ${projectId}`), {
        code: 'PROJECT_SYMLINK_NOT_ALLOWED',
        statusCode: 400,
      });
    }
    if (directStat.isDirectory()) {
      try {
        const directMeta = JSON.parse(await fs.readFile(path.join(directRoot, META_FILE), 'utf8'));
        if (directMeta?.id === projectId) {
          directMatchRoot = directRoot;
        }
        directIdentityMismatch = true;
      } catch (error) {
        if (error.code === 'ENOENT' || error instanceof SyntaxError) {
          // Existing unmanaged or corrupted directories are not managed projects.
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  let entries = [];
  try {
    entries = await fs.readdir(dataDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const matches = directMatchRoot ? [directMatchRoot] : [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidateRoot = path.join(dataDir, entry.name);
    if (directMatchRoot && path.resolve(candidateRoot) === path.resolve(directMatchRoot)) continue;
    try {
      const meta = JSON.parse(await fs.readFile(path.join(candidateRoot, META_FILE), 'utf8'));
      if (meta?.id === projectId) {
        matches.push(candidateRoot);
      }
    } catch (error) {
      if (error.code && !['ENOENT'].includes(error.code) && !(error instanceof SyntaxError)) throw error;
      // Malformed and metadata-free folders remain compatible with list/import discovery.
    }
  }

  if (matches.length > 1) {
    forgetProjectLocation(dataDir, projectId);
    throw Object.assign(new Error(`Duplicate managed project identity: ${projectId}`), {
      code: 'PROJECT_IDENTITY_DUPLICATE',
      statusCode: 409,
      projectId,
      directoryNames: matches.map((root) => path.basename(root)).sort(),
    });
  }
  if (matches.length === 1) {
    rememberProjectLocation(dataDir, projectId, matches[0]);
    return matches[0];
  }

  if (directIdentityMismatch) {
    throw Object.assign(new Error(`Project identity mismatch: ${projectId}`), {
      code: 'PROJECT_IDENTITY_MISMATCH',
      statusCode: 404,
    });
  }
  if (allowMissing && !directPathExists) return directRoot;
  throw Object.assign(new Error(`Managed project not found: ${projectId}`), {
    code: 'PROJECT_NOT_FOUND',
    statusCode: 404,
  });
}

export async function createProjectLocation({ id = crypto.randomUUID(), name, dataDir = DATA_DIR } = {}) {
  const displayName = normalizeProjectName(name);
  const directoryName = buildProjectDirectoryName(displayName, id);
  const projectRoot = path.join(dataDir, directoryName);
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.mkdir(projectRoot);
  } catch (error) {
    if (error.code === 'EEXIST') throw new ProjectDirectoryConflictError(directoryName);
    throw error;
  }
  return { id, name: displayName, directoryName, projectRoot };
}

async function writeJsonAtomic(filePath, value, fsApi = fs) {
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fsApi.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
    await fsApi.rename(tempPath, filePath);
  } finally {
    await fsApi.rm(tempPath, { force: true }).catch(() => {});
  }
}

export async function registerExistingProjectLocation({
  directoryName,
  name,
  mainFile = null,
  dataDir = DATA_DIR,
  fsApi = fs,
  now = () => new Date(),
} = {}) {
  const safeDirectoryName = validateExistingProjectDirectoryName(directoryName);
  return withProjectLock(`register:${safeDirectoryName}`, async () => {
    const projectRoot = path.join(dataDir, safeDirectoryName);
    let rootStat;
    try {
      rootStat = await fsApi.lstat(projectRoot);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw Object.assign(new Error(`Existing project directory not found: ${safeDirectoryName}`), {
          code: 'PROJECT_DIRECTORY_NOT_FOUND',
          statusCode: 404,
        });
      }
      throw error;
    }
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw Object.assign(new Error('Existing project target must be a real directory'), {
        code: 'INVALID_PROJECT_DIRECTORY',
        statusCode: 400,
      });
    }

    const metaPath = path.join(projectRoot, META_FILE);
    try {
      await fsApi.access(metaPath);
      throw Object.assign(new Error(`Project directory is already registered: ${safeDirectoryName}`), {
        code: 'PROJECT_ALREADY_REGISTERED',
        statusCode: 409,
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const timestamp = now().toISOString();
    const project = {
      id: crypto.randomUUID(),
      name: normalizeProjectName(name, safeDirectoryName),
      directoryName: safeDirectoryName,
      createdAt: timestamp,
      updatedAt: timestamp,
      template: null,
      mainFile: mainFile || null,
    };
    await writeJsonAtomic(metaPath, project, fsApi);
    rememberProjectLocation(dataDir, project.id, projectRoot);
    return { project, projectRoot };
  });
}

export async function withProjectLock(projectId, operation) {
  const previous = projectLocks.get(projectId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  projectLocks.set(projectId, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (projectLocks.get(projectId) === current) projectLocks.delete(projectId);
  }
}

export async function renameProjectLocation(projectId, newName, {
  dataDir = DATA_DIR,
  fsApi = fs,
  now = () => new Date(),
} = {}) {
  return withProjectLock(projectId, async () => {
    const sourceRoot = await getProjectRoot(projectId, { dataDir, allowMissing: false });
    const sourceDirectoryName = path.basename(sourceRoot);
    const metaPath = path.join(sourceRoot, META_FILE);
    const originalMeta = JSON.parse(await fsApi.readFile(metaPath, 'utf8'));
    const name = normalizeProjectName(newName, originalMeta.name || 'Untitled');
    const directoryName = buildProjectDirectoryName(name, projectId);
    const targetRoot = path.join(dataDir, directoryName);
    const nextMeta = {
      ...originalMeta,
      id: projectId,
      name,
      directoryName,
      createdAt: originalMeta.createdAt || now().toISOString(),
      updatedAt: now().toISOString(),
    };

    if (sourceDirectoryName === directoryName) {
      await writeJsonAtomic(metaPath, nextMeta, fsApi);
      rememberProjectLocation(dataDir, projectId, sourceRoot);
      return { project: nextMeta, projectRoot: sourceRoot, previousRoot: sourceRoot };
    }

    try {
      await fsApi.access(targetRoot);
      throw new ProjectDirectoryConflictError(directoryName);
    } catch (error) {
      if (error instanceof ProjectDirectoryConflictError) throw error;
      if (error.code !== 'ENOENT') throw error;
    }

    await fsApi.rename(sourceRoot, targetRoot);
    try {
      await writeJsonAtomic(path.join(targetRoot, META_FILE), nextMeta, fsApi);
    } catch (error) {
      try {
        await fsApi.rename(targetRoot, sourceRoot);
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
      throw error;
    }
    rememberProjectLocation(dataDir, projectId, targetRoot);
    return { project: nextMeta, projectRoot: targetRoot, previousRoot: sourceRoot };
  });
}
