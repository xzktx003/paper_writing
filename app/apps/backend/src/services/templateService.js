import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { TEMPLATE_DIR, TEMPLATE_MANIFEST } from '../config/constants.js';
import { ensureDir, readJson } from '../utils/fsUtils.js';

const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const templateCommitLocks = new Map();

async function withTemplateCommitLock(manifestPath, operation) {
  const key = path.resolve(manifestPath);
  const previous = templateCommitLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  templateCommitLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (templateCommitLocks.get(key) === current) templateCommitLocks.delete(key);
  }
}

export function validateTemplateId(templateId) {
  const normalized = String(templateId || '').trim();
  if (!TEMPLATE_ID_PATTERN.test(normalized)) {
    const error = new Error('Invalid template id. Use 1-64 letters, numbers, hyphens, or underscores.');
    error.code = 'INVALID_TEMPLATE_ID';
    throw error;
  }
  return normalized;
}

async function collectTexFiles(root, relativeDir = '', depth = 0) {
  if (depth > 4) return [];
  const absoluteDir = path.join(root, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTexFiles(root, relativePath, depth + 1));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.tex')) {
      files.push(relativePath.split(path.sep).join('/'));
    }
  }
  return files;
}

export async function detectTemplateMainFile(templateRoot) {
  const texFiles = await collectTexFiles(templateRoot);
  if (texFiles.length === 0) {
    const error = new Error('Template must contain a LaTeX entry file with \\documentclass.');
    error.code = 'TEMPLATE_MAIN_FILE_NOT_FOUND';
    throw error;
  }

  const candidates = [];
  for (const relativePath of texFiles) {
    const content = await fs.readFile(path.join(templateRoot, relativePath), 'utf8').catch(() => '');
    if (/\\documentclass(?:\s*\[[^\]]*\])?\s*\{/.test(content)) candidates.push(relativePath);
  }
  if (candidates.length === 0) {
    const error = new Error('Template .tex files do not contain a \\documentclass entry point.');
    error.code = 'TEMPLATE_MAIN_FILE_NOT_FOUND';
    throw error;
  }

  candidates.sort((left, right) => {
    const leftName = path.posix.basename(left).toLowerCase();
    const rightName = path.posix.basename(right).toLowerCase();
    const priority = (name) => name === 'main.tex' ? 0 : name === 'paper.tex' ? 1 : name === 'manuscript.tex' ? 2 : 3;
    return priority(leftName) - priority(rightName)
      || left.split('/').length - right.split('/').length
      || left.localeCompare(right);
  });
  return candidates[0];
}

export async function validateTemplateCatalog({
  manifestPath = TEMPLATE_MANIFEST,
  templateDir = TEMPLATE_DIR,
} = {}) {
  let data;
  try {
    data = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    const contractError = new Error(`Template manifest is unreadable or invalid JSON: ${error.message}`);
    contractError.code = 'TEMPLATE_MANIFEST_INVALID';
    throw contractError;
  }
  if (!Array.isArray(data?.templates) || data.templates.length === 0 || !Array.isArray(data?.categories)) {
    const error = new Error('Template manifest must contain non-empty templates and a categories array.');
    error.code = 'TEMPLATE_MANIFEST_INVALID';
    throw error;
  }

  const ids = new Set();
  for (const template of data.templates) {
    const id = validateTemplateId(template?.id);
    if (ids.has(id)) {
      const error = new Error(`Template manifest contains duplicate id: ${id}`);
      error.code = 'TEMPLATE_MANIFEST_INVALID';
      throw error;
    }
    ids.add(id);
    if (!String(template.label || '').trim() || !String(template.description || '').trim()) {
      const error = new Error(`Template ${id} must declare a user-facing label and description.`);
      error.code = 'TEMPLATE_MANIFEST_INVALID';
      throw error;
    }
    const mainFile = String(template.mainFile || '').trim();
    if (!mainFile) {
      const error = new Error(`Template ${id} does not declare mainFile.`);
      error.code = 'TEMPLATE_MANIFEST_INVALID';
      throw error;
    }
    const root = path.resolve(templateDir, id);
    const entry = path.resolve(root, mainFile);
    if (entry !== root && !entry.startsWith(`${root}${path.sep}`)) {
      const error = new Error(`Template ${id} has an unsafe mainFile path.`);
      error.code = 'TEMPLATE_MANIFEST_INVALID';
      throw error;
    }
    try {
      await fs.access(entry);
    } catch {
      const error = new Error(`Template ${id} mainFile does not exist: ${mainFile}`);
      error.code = 'TEMPLATE_MANIFEST_INVALID';
      throw error;
    }
  }
  return { templates: data.templates.length, categories: data.categories.length };
}
 
export async function readTemplateManifest() {
  // Read manifest
  let manifestTemplates = [];
  let categories = [];
  try {
    const data = await readJson(TEMPLATE_MANIFEST);
    manifestTemplates = Array.isArray(data?.templates) ? data.templates : [];
    categories = Array.isArray(data?.categories) ? data.categories : [];
  } catch (error) {
    if (error.code !== 'ENOENT') {
      error.code = error.code || 'TEMPLATE_MANIFEST_INVALID';
      throw error;
    }
  }
 
  // Scan templates directory for dirs not in manifest
  const knownIds = new Set(manifestTemplates.map(t => t.id));
  try {
    await ensureDir(TEMPLATE_DIR);
    const entries = await fs.readdir(TEMPLATE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules') continue;
      if (entry.name.startsWith('.')) continue;
      if (knownIds.has(entry.name)) continue;
      // Check if dir contains a .tex file
      const dirPath = path.join(TEMPLATE_DIR, entry.name);
      let mainFile;
      try {
        mainFile = await detectTemplateMainFile(dirPath);
      } catch {
        continue;
      }
      // Auto-generate entry
      manifestTemplates.push({
        id: entry.name,
        label: entry.name,
        mainFile,
        category: 'academic',
        description: entry.name,
        descriptionEn: entry.name,
        tags: [],
        author: '',
        featured: false,
      });
    }
  } catch { /* ignore */ }
 
  const populatedCategoryIds = new Set(manifestTemplates.map(template => template.category).filter(Boolean));
  const visibleCategories = categories.filter(category =>
    category?.id && category.id !== 'all' && populatedCategoryIds.has(category.id)
  );

  return { templates: manifestTemplates, categories: visibleCategories };
}

export async function resolveTemplateSelection(templateId) {
  const id = validateTemplateId(templateId);
  const { templates } = await readTemplateManifest();
  const template = templates.find((entry) => entry.id === id);
  if (!template) {
    const error = new Error(`Unknown template: ${id}`);
    error.code = 'TEMPLATE_NOT_FOUND';
    throw error;
  }
  const templateRoot = path.join(TEMPLATE_DIR, id);
  const declaredMainFile = String(template.mainFile || '').trim();
  if (!declaredMainFile) {
    const error = new Error(`Template ${id} does not declare mainFile.`);
    error.code = 'TEMPLATE_CONTRACT_INVALID';
    throw error;
  }
  const mainFilePath = path.resolve(templateRoot, declaredMainFile);
  if (mainFilePath !== templateRoot && !mainFilePath.startsWith(`${templateRoot}${path.sep}`)) {
    const error = new Error(`Template ${id} has an unsafe mainFile path.`);
    error.code = 'TEMPLATE_CONTRACT_INVALID';
    throw error;
  }
  try {
    await fs.access(mainFilePath);
  } catch {
    const error = new Error(`Template ${id} mainFile does not exist: ${declaredMainFile}`);
    error.code = 'TEMPLATE_CONTRACT_INVALID';
    throw error;
  }
  return { ...template, root: templateRoot };
}
 
export async function addTemplateToManifest(entry) {
  return withTemplateCommitLock(TEMPLATE_MANIFEST, async () => {
    let data = { templates: [], categories: [] };
    try {
      data = await readJson(TEMPLATE_MANIFEST);
    } catch { /* ignore */ }
    data = mergeTemplateManifestEntry(data, entry);
    await writeTemplateManifestAtomic(TEMPLATE_MANIFEST, data);
    return data;
  });
}

function mergeTemplateManifestEntry(data, entry) {
  const next = data && typeof data === 'object' ? { ...data } : { templates: [], categories: [] };
  const templates = Array.isArray(next.templates) ? next.templates.map(template => ({ ...template })) : [];
  const exists = templates.findIndex(template => template.id === entry.id);
  if (exists >= 0) templates[exists] = { ...templates[exists], ...entry };
  else templates.push(entry);
  next.templates = templates;
  if (!Array.isArray(next.categories)) next.categories = [];
  return next;
}

export async function writeTemplateManifestAtomic(manifestPath, data, fsApi = {}) {
  const makeDir = fsApi.mkdir || fs.mkdir;
  const write = fsApi.writeFile || fs.writeFile;
  const move = fsApi.rename || fs.rename;
  const remove = fsApi.rm || fs.rm;
  const tempPath = `${manifestPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await makeDir(path.dirname(manifestPath), { recursive: true });
  try {
    await write(tempPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await move(tempPath, manifestPath);
  } finally {
    await remove(tempPath, { force: true }).catch(() => {});
  }
}

export async function installTemplateFromStaging({
  templateId,
  templateLabel = '',
  stagingRoot,
  templateDir = TEMPLATE_DIR,
  manifestPath = TEMPLATE_MANIFEST,
  fsApi = {},
} = {}) {
  const id = validateTemplateId(templateId);
  const normalizedTemplateDir = path.resolve(templateDir);
  const normalizedStagingRoot = path.resolve(String(stagingRoot || ''));
  const stagingRelative = path.relative(normalizedTemplateDir, normalizedStagingRoot);
  if (!stagingRoot || !stagingRelative || stagingRelative.startsWith('..') || path.isAbsolute(stagingRelative)) {
    throw Object.assign(new Error('Template staging directory must be a child of the template directory.'), {
      code: 'INVALID_TEMPLATE_STAGING_ROOT',
      statusCode: 400,
    });
  }
  const mainFile = await detectTemplateMainFile(normalizedStagingRoot);
  const targetRoot = path.join(normalizedTemplateDir, id);
  const backupRoot = path.join(normalizedTemplateDir, `.backup-${id}-${crypto.randomUUID()}`);
  const read = fsApi.readFile || fs.readFile;
  const move = fsApi.rename || fs.rename;
  const remove = fsApi.rm || fs.rm;
  const inspect = fsApi.lstat || fs.lstat;

  return withTemplateCommitLock(manifestPath, async () => {
    let manifest = { templates: [], categories: [] };
    try {
      manifest = JSON.parse(await read(manifestPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const entry = {
      id,
      label: String(templateLabel || '').trim() || id,
      mainFile,
      category: 'academic',
      description: String(templateLabel || '').trim() || id,
      descriptionEn: String(templateLabel || '').trim() || id,
      tags: [],
      author: 'User',
      featured: false,
    };
    const nextManifest = mergeTemplateManifestEntry(manifest, entry);
    let backedUp = false;
    let installed = false;
    try {
      try {
        await inspect(targetRoot);
        await move(targetRoot, backupRoot);
        backedUp = true;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      await move(normalizedStagingRoot, targetRoot);
      installed = true;
      await writeTemplateManifestAtomic(manifestPath, nextManifest, fsApi);
      if (backedUp) {
        await remove(backupRoot, { recursive: true, force: true }).catch(() => {});
        backedUp = false;
      }
      return { ok: true, templateId: id, mainFile, entry };
    } catch (error) {
      let rollbackError = null;
      try {
        if (installed) await remove(targetRoot, { recursive: true, force: true });
        if (backedUp) {
          await move(backupRoot, targetRoot);
          backedUp = false;
        }
      } catch (caughtRollbackError) {
        rollbackError = caughtRollbackError;
      }
      if (rollbackError) error.rollbackError = rollbackError;
      throw error;
    }
  });
}
 
export async function copyTemplateIntoProject(templateRoot, projectRoot) {
  const changed = [];
  const walk = async (rel = '') => {
    const dirPath = path.join(templateRoot, rel);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const nextRel = path.join(rel, entry.name);
      if (entry.name === 'main.tex') continue;
      const srcPath = path.join(templateRoot, nextRel);
      const destPath = path.join(projectRoot, nextRel);
      if (entry.isDirectory()) {
        await ensureDir(destPath);
        await walk(nextRel);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const shouldOverwrite = ext && ext !== '.tex';
        try {
          await fs.access(destPath);
          if (!shouldOverwrite) continue;
        } catch {
          // file missing; proceed to copy
        }
        await ensureDir(path.dirname(destPath));
        await fs.copyFile(srcPath, destPath);
        changed.push(nextRel);
      }
    }
  };
  await walk('');
  return changed;
}
 
