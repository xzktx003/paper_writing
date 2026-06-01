#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const DEFAULT_EXCLUDES = new Set([
  '.git',
  '.playwright-deps',
  'node_modules',
]);

function parseArgs(argv) {
  const options = {
    root: null,
    dryRun: false,
    force: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!options.root) {
      options.root = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/generate-paper-project-json.mjs [papersDir] [--dry-run] [--force]',
    '  node generate-paper-project-json.mjs [--dry-run] [--force]  # when copied into papers/',
    '',
    'Options:',
    '  --dry-run  Print planned project.json writes without modifying files.',
    '  --force    Regenerate project.json even when it already exists.',
  ].join('\n');
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function toIsoTime(value, fallback) {
  const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : fallback;
  return date.toISOString();
}

function buildProjectMeta(entryName, dirStat, existingMeta = null) {
  const now = new Date();
  const createdAt = existingMeta?.createdAt || toIsoTime(dirStat.birthtime, now);
  const updatedAt = existingMeta?.updatedAt || toIsoTime(dirStat.mtime, new Date(createdAt));

  return {
    id: existingMeta?.id || crypto.randomUUID(),
    name: existingMeta?.name || entryName,
    createdAt,
    updatedAt,
    tags: existingMeta?.tags || [],
    archived: existingMeta?.archived || false,
    trashed: existingMeta?.trashed || false,
    trashedAt: existingMeta?.trashedAt || null,
  };
}

async function hasProjectFiles(projectRoot) {
  const entries = await fs.readdir(projectRoot, { withFileTypes: true });
  return entries.some((entry) => {
    if (entry.name === 'project.json') return false;
    if (!entry.isFile()) return false;
    const ext = path.extname(entry.name).toLowerCase();
    return ['.tex', '.bib', '.pdf', '.md', '.sty', '.cls'].includes(ext);
  });
}

async function generateOneProject(projectRoot, entryName, options) {
  const metaPath = path.join(projectRoot, 'project.json');
  const existingMeta = await readJsonIfExists(metaPath);
  if (existingMeta && !options.force) {
    return { dir: entryName, status: 'skipped', reason: 'project.json already exists' };
  }

  if (!await hasProjectFiles(projectRoot)) {
    return { dir: entryName, status: 'skipped', reason: 'no paper files detected' };
  }

  const dirStat = await fs.stat(projectRoot);
  const meta = buildProjectMeta(entryName, dirStat, existingMeta);

  if (!options.dryRun) {
    await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  }

  return {
    dir: entryName,
    status: options.dryRun ? 'planned' : existingMeta ? 'updated' : 'created',
    project: meta,
  };
}

export async function generatePaperProjectJson(rootDir, options = {}) {
  const root = path.resolve(rootDir);
  if (await hasProjectFiles(root)) {
    return [await generateOneProject(root, path.basename(root), options)];
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || DEFAULT_EXCLUDES.has(entry.name)) continue;

    const projectRoot = path.join(root, entry.name);
    results.push(await generateOneProject(projectRoot, entry.name, options));
  }

  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const root = options.root || process.cwd();
  const results = await generatePaperProjectJson(root, options);
  for (const item of results) {
    if (item.status === 'skipped') {
      console.log(`[skip] ${item.dir}: ${item.reason}`);
    } else {
      console.log(`[${item.status}] ${item.dir}: ${item.project.name} (${item.project.id})`);
    }
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  });
}
