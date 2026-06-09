import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join } from 'path';
import YAML from 'yaml';
import { DATA_DIR } from '../config/constants.js';
 
export async function getProjectRoot(id) {
  const directRoot = join(DATA_DIR, id);
  try {
    const directStat = await stat(directRoot);
    if (directStat.isDirectory()) return directRoot;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
 
  let entries = [];
  try {
    entries = await readdir(DATA_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
 
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidateRoot = join(DATA_DIR, entry.name);
    try {
      const meta = JSON.parse(await readFile(join(candidateRoot, 'project.json'), 'utf-8'));
      if (meta?.id === id) return candidateRoot;
    } catch {
      // Ignore malformed or missing metadata while resolving by id.
    }
  }
 
  return directRoot;
}
 
export async function loadProject(projectPath) {
  const configPath = join(projectPath, 'paper.yaml');
  const content = await readFile(configPath, 'utf-8');
  return YAML.parse(content);
}
 
export async function saveProject(projectPath, config) {
  const configPath = join(projectPath, 'paper.yaml');
  await writeFile(configPath, YAML.stringify(config), 'utf-8');
}
 
export async function createProject(projectPath, config) {
  await mkdir(projectPath, { recursive: true });
  await saveProject(projectPath, config);
  await writeFile(join(projectPath, 'references.bib'), '', 'utf-8');
}
 
export async function addChapter(projectPath, filename) {
  const config = await loadProject(projectPath);
  const filePath = join(projectPath, 'chapters', filename);
  await mkdir(join(projectPath, 'chapters'), { recursive: true });
  const title = filename.replace(/^\d+-/, '').replace('.md', '').replace(/-/g, ' ');
  await writeFile(filePath, `# ${title}\n\n`, 'utf-8');
  config.chapters = config.chapters || [];
  config.chapters.push({ file: filename, skills: [] });
  await saveProject(projectPath, config);
  return config;
}
 
export async function reorderChapters(projectPath, newOrder) {
  const config = await loadProject(projectPath);
  const chapterMap = new Map(config.chapters.map(c => [c.file, c]));
  config.chapters = newOrder.map(file => chapterMap.get(file)).filter(Boolean);
  await saveProject(projectPath, config);
  return config;
}
 
