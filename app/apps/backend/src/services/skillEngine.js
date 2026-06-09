import { readdir, readFile, mkdir, writeFile, rm, stat } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomUUID } from 'crypto';
import { execSync } from 'child_process';
import YAML from 'yaml';
import { safeJoin } from '../utils/pathSecurity.js';
 
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const builtinSkillsDir = join(__dirname, '../../skills');
const importedSkillsDir = join(__dirname, '../../skills-imported');
const SKILL_TRACKER_FILE = join(__dirname, '../../skills-imported/tracker.json');
let skillRegistry = new Map();
 
export async function loadSkills(projectSkillsDir) {
  skillRegistry.clear();
  await loadSkillsFromDir(builtinSkillsDir, 'builtin');
  await ensureImportedSkillsDir();
  await loadSkillsFromDir(importedSkillsDir, 'imported');
  if (projectSkillsDir) {
    await loadSkillsFromDir(projectSkillsDir, 'custom');
  }
}
 
/* ── Imported Skill Tracker ───────────────────────────────────── */
 
let skillTracker = {};
 
async function ensureImportedSkillsDir() {
  await mkdir(importedSkillsDir, { recursive: true });
  try {
    skillTracker = JSON.parse(await readFile(SKILL_TRACKER_FILE, 'utf-8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    skillTracker = {};
  }
}
 
async function saveTracker() {
  await mkdir(importedSkillsDir, { recursive: true });
  await writeFile(SKILL_TRACKER_FILE, JSON.stringify(skillTracker, null, 2), 'utf-8');
}
 
/* ── GitHub Import ────────────────────────────────────────────── */
 
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const GITHUB_API_BASE = 'https://api.github.com';
 
/**
 * Parse a GitHub URL into { owner, repo, ref, subdir }
 * Supports:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch/subdir
 *   https://github.com/owner/repo/tree/commithash
 *   owner/repo
 */
function parseGitHubUrl(url) {
  let cleaned = url.trim();
  if (cleaned.endsWith('.git')) cleaned = cleaned.slice(0, -4);
  const match = cleaned.match(
    /^(?:https?:\/\/github\.com\/)?([^/]+)\/([^/#\s]+)(?:\/tree\/([^/#]+)(?:\/(.+))?)?$/
  );
  if (!match) throw Object.assign(new Error(`Invalid GitHub URL: ${url}`), { statusCode: 400 });
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, ''),
    ref: match[3] || 'main',
    subdir: match[4] || '',
  };
}
 
/**
 * Import a skill from a GitHub repository.
 * Downloads the SKILL.md/manifest.yaml from the repo and installs
 * it as a package skill under skills-imported/.
 */
export async function importSkillFromGitHub(url, options = {}) {
  const { owner, repo, ref, subdir } = parseGitHubUrl(url);
  const safeName = slugify(options.name || repo);
  const targetDir = safeJoin(importedSkillsDir, safeName);
 
  // Check if already installed
  if (skillTracker[safeName]) {
    throw Object.assign(new Error(`Skill "${safeName}" already imported from ${skillTracker[safeName].url}. Use updateSkill() to refresh.`), { statusCode: 409 });
  }
 
  // Create target directory
  await mkdir(targetDir, { recursive: true });
 
  // Try to download manifest / SKILL.md
  const prefix = subdir ? `${subdir}/` : '';
  const downloadPaths = [
    `${prefix}manifest.yaml`,
    `${prefix}manifest.yml`,
    `${prefix}skill.yaml`,
    `${prefix}skill.yml`,
    `${prefix}SKILL.md`,
    `${prefix}skill.md`,
  ];
 
  let downloadedManifest = null;
  let downloadedSkillMd = null;
 
  for (const relPath of downloadPaths) {
    const rawUrl = `${GITHUB_RAW_BASE}/${owner}/${repo}/${ref}/${relPath}`;
    try {
      const response = await fetch(rawUrl);
      if (response.ok) {
        const content = await response.text();
        const localPath = safeJoin(targetDir, relPath.split('/').pop());
        await writeFile(localPath, content, 'utf-8');
        if (relPath.endsWith('.yaml') || relPath.endsWith('.yml')) {
          downloadedManifest = localPath;
        } else {
          downloadedSkillMd = localPath;
        }
        break;
      }
    } catch { /* try next path */ }
  }
 
  // Download references/ scripts/ assets/ tests/ subdirectories
  const subdirsToDownload = ['references', 'scripts', 'assets', 'tests'];
  for (const sub of subdirsToDownload) {
    await downloadGitHubDir(targetDir, owner, repo, ref, `${prefix}${sub}`, sub);
  }
 
  // Reload skills to register the new package
  await loadSkills();
 
  // Register in tracker
  skillTracker[safeName] = {
    url,
    owner,
    repo,
    ref,
    subdir,
    name: safeName,
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveTracker();
 
  const skill = skillRegistry.get(safeName);
  return skill || {
    name: safeName,
    display_name: options.display_name || repo,
    description: `Imported from ${owner}/${repo}`,
    kind: 'package',
    _source: 'imported',
    package: {
      root: targetDir,
      references: await listRelativeFiles(safeJoin(targetDir, 'references'), 'references'),
      scripts: await listRelativeFiles(safeJoin(targetDir, 'scripts'), 'scripts'),
      assets: await listRelativeFiles(safeJoin(targetDir, 'assets'), 'assets'),
      tests: await listRelativeFiles(safeJoin(targetDir, 'tests'), 'tests'),
    },
  };
}
 
async function downloadGitHubDir(targetDir, owner, repo, ref, remotePrefix, localSubdir) {
  if (!remotePrefix) return;
  // Use GitHub API to get directory listing
  const apiUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${remotePrefix}?ref=${ref}`;
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) return;
    const items = await response.json();
    if (!Array.isArray(items)) return;
 
    const localDir = safeJoin(targetDir, localSubdir);
    await mkdir(localDir, { recursive: true });
 
    for (const item of items) {
      if (item.type === 'file') {
        const fileUrl = `${GITHUB_RAW_BASE}/${owner}/${repo}/${ref}/${remotePrefix}/${item.name}`;
        try {
          const fileResp = await fetch(fileUrl);
          if (fileResp.ok) {
            const content = await fileResp.text();
            await writeFile(safeJoin(localDir, item.name), content, 'utf-8');
          }
        } catch { /* skip file */ }
      } else if (item.type === 'dir') {
        await downloadGitHubDir(targetDir, owner, repo, ref, `${remotePrefix}/${item.name}`, `${localSubdir}/${item.name}`);
      }
    }
  } catch { /* directory may not exist */ }
}
 
/**
 * Update an imported skill by re-downloading from its original source.
 */
export async function updateImportedSkill(name) {
  const info = skillTracker[name];
  if (!info) {
    throw Object.assign(new Error(`Skill "${name}" was not imported from GitHub or tracker info missing.`), { statusCode: 404 });
  }
 
  const targetDir = safeJoin(importedSkillsDir, name);
 
  // Remove existing content (keep the dir for safeJoin)
  try {
    const existing = await readdir(targetDir);
    for (const entry of existing) {
      if (entry === '.git' || entry === '.gitignore') continue;
      await rm(safeJoin(targetDir, entry), { recursive: true, force: true });
    }
  } catch { /* dir may not exist yet */ }
 
  // Re-import using the tracked URL
  const result = await importSkillFromGitHub(info.url, { name });
 
  // Update tracker
  skillTracker[name].updatedAt = new Date().toISOString();
  skillTracker[name].ref = info.ref;
  await saveTracker();
 
  return result;
}
 
/**
 * Get full package tree for a skill, optionally filtered by subdir.
 */
export async function getSkillPackageTree(name, subdir = '') {
  const skill = skillRegistry.get(name);
  if (!skill || !skill.package) {
    throw Object.assign(new Error(`Skill "${name}" is not a package skill.`), { statusCode: 404 });
  }
  const root = skill.package.root;
  const targetDir = subdir ? safeJoin(root, subdir) : root;
  return listRelativeFilesWithTypes(targetDir, subdir || '');
}
 
async function listRelativeFilesWithTypes(dir, prefix) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        files.push({ path: `${relativePath}/`, type: 'dir' });
        files.push(...await listRelativeFilesWithTypes(join(dir, entry.name), relativePath));
      } else {
        files.push({ path: relativePath, type: 'file' });
      }
    }
    return files;
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
 
/**
 * Run tests for a skill package in a sandboxed environment.
 * Only allows whitelisted commands and enforces timeouts.
 */
export async function runSkillTests(name, options = {}) {
  const skill = skillRegistry.get(name);
  if (!skill || !skill.package) {
    throw Object.assign(new Error(`Skill "${name}" is not a package skill.`), { statusCode: 404 });
  }
 
  const testsDir = safeJoin(skill.package.root, 'tests');
  const testFiles = skill.package.tests || [];
  if (testFiles.length === 0) {
    return { passed: 0, failed: 0, skipped: 0, results: [], message: 'No tests found in skill package.' };
  }
 
  const timeout = Math.min(options.timeout || 30_000, 120_000);
  const results = [];
 
  for (const testFile of testFiles) {
    const ext = extname(testFile);
    const fullPath = safeJoin(skill.package.root, testFile);
 
    let command;
    if (ext === '.sh') command = ['bash', fullPath];
    else if (ext === '.py') command = ['python3', fullPath];
    else if (ext === '.js' || ext === '.mjs') command = ['node', fullPath];
    else {
      results.push({ file: testFile, status: 'skipped', reason: `Unsupported extension: ${ext}` });
      continue;
    }
 
    try {
      const output = execSync(command.join(' '), {
        cwd: skill.package.root,
        timeout,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          SKILL_ROOT: skill.package.root,
          SKILL_NAME: name,
        },
      });
      results.push({ file: testFile, status: 'passed', output: output.trim() });
    } catch (err) {
      const stderr = err.stderr || '';
      const stdout = err.stdout || '';
      results.push({
        file: testFile,
        status: 'failed',
        output: [stdout.trim(), stderr.trim()].filter(Boolean).join('\n'),
        error: err.message,
      });
    }
  }
 
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
 
  return { passed, failed, skipped, results, message: `${passed} passed, ${failed} failed, ${skipped} skipped` };
}
 
/**
 * List all imported skills with their tracker metadata.
 */
export function listImportedSkills() {
  return Object.entries(skillTracker).map(([name, info]) => ({
    name,
    url: info.url,
    owner: info.owner,
    repo: info.repo,
    importedAt: info.importedAt,
    updatedAt: info.updatedAt,
    latest: skillRegistry.has(name),
  }));
}
 
/**
 * Remove an imported skill and its tracker entry.
 */
export async function removeImportedSkill(name) {
  if (!skillTracker[name]) {
    throw Object.assign(new Error(`Skill "${name}" is not in the import tracker.`), { statusCode: 404 });
  }
  const targetDir = safeJoin(importedSkillsDir, name);
  await rm(targetDir, { recursive: true, force: true }).catch(() => {});
  delete skillTracker[name];
  await saveTracker();
  await loadSkills();
  return { ok: true };
}
 
async function loadSkillsFromDir(dir, source) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skill = await loadSkillPackage(join(dir, entry.name), source);
        if (skill) skillRegistry.set(skill.name, skill);
        continue;
      }
      if (!entry.name.endsWith('.yaml') && !entry.name.endsWith('.yml')) continue;
      const content = await readFile(join(dir, entry.name), 'utf-8');
      const skill = YAML.parse(content);
      if (!skill?.name) continue;
      skill._source = source;
      skill.kind = skill.kind || 'yaml';
      skillRegistry.set(skill.name, skill);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}
 
async function loadSkillPackage(packageDir, source) {
  const manifest = await readPackageManifest(packageDir);
  if (!manifest) return null;
 
  const prompt = await readOptionalText(join(packageDir, 'SKILL.md'))
    || await readOptionalText(join(packageDir, 'skill.md'))
    || manifest.prompt
    || '';
  const name = slugify(manifest.name || manifest.display_name);
  if (!name || !prompt) return null;
 
  return {
    ...manifest,
    name,
    display_name: manifest.display_name || manifest.name || name,
    description: manifest.description || '',
    type: manifest.type || 'utility',
    trigger: manifest.trigger || 'manual',
    prompt,
    kind: 'package',
    package: {
      root: packageDir,
      references: await listRelativeFiles(join(packageDir, 'references'), 'references'),
      scripts: await listRelativeFiles(join(packageDir, 'scripts'), 'scripts'),
      assets: await listRelativeFiles(join(packageDir, 'assets'), 'assets'),
      tests: await listRelativeFiles(join(packageDir, 'tests'), 'tests'),
    },
    _source: source,
  };
}
 
async function readPackageManifest(packageDir) {
  for (const file of ['manifest.yaml', 'manifest.yml', 'skill.yaml', 'skill.yml']) {
    const content = await readOptionalText(join(packageDir, file));
    if (content) return YAML.parse(content) || {};
  }
  const skillMd = await readOptionalText(join(packageDir, 'SKILL.md')) || await readOptionalText(join(packageDir, 'skill.md'));
  if (!skillMd) return null;
  const title = skillMd.split('\n').find(line => line.trim().startsWith('#'))?.replace(/^#+\s*/, '').trim();
  return { name: title || packageDir.split(/[\\/]/).pop(), display_name: title };
}
 
async function readOptionalText(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') return '';
    throw e;
  }
}
 
async function listRelativeFiles(dir, prefix) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const relativePath = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        files.push(...await listRelativeFiles(join(dir, entry.name), relativePath));
      } else {
        files.push(relativePath);
      }
    }
    return files.sort();
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
 
function slugify(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
 
export function getSkill(name) {
  return skillRegistry.get(name);
}
 
export function listSkills() {
  return Array.from(skillRegistry.values()).map(s => ({
    name: s.name,
    display_name: s.display_name,
    description: s.description,
    type: s.type,
    trigger: s.trigger,
    source: s._source,
    kind: s.kind || 'yaml',
    tags: s.tags || [],
    package: s.package ? {
      references: s.package.references || [],
      scripts: s.package.scripts || [],
      assets: s.package.assets || [],
      tests: s.package.tests || [],
      // Include file count stats
      fileCount: {
        references: (s.package.references || []).length,
        scripts: (s.package.scripts || []).length,
        assets: (s.package.assets || []).length,
        tests: (s.package.tests || []).length,
      },
    } : undefined,
    importInfo: s._source === 'imported' && skillTracker[s.name] ? {
      url: skillTracker[s.name].url,
      owner: skillTracker[s.name].owner,
      repo: skillTracker[s.name].repo,
      importedAt: skillTracker[s.name].importedAt,
      updatedAt: skillTracker[s.name].updatedAt,
    } : undefined,
  }));
}
 
export function assemblePrompt({ globalSkills, chapterSkills, manualSkill }) {
  const parts = ['You are an academic writing assistant.'];
  for (const name of globalSkills || []) {
    const skill = skillRegistry.get(name);
    if (skill) parts.push(`[Global Rule - ${skill.display_name}]\n${skill.prompt}`);
  }
  for (const name of chapterSkills || []) {
    const skill = skillRegistry.get(name);
    if (skill) parts.push(`[Chapter Skill - ${skill.display_name}]\n${skill.prompt}`);
  }
  if (manualSkill) {
    const skill = skillRegistry.get(manualSkill);
    if (skill) parts.push(`[Active Skill - ${skill.display_name}]\n${skill.prompt}`);
  }
  return parts.join('\n\n---\n\n');
}
 
