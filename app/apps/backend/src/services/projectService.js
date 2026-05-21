import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import YAML from 'yaml';

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
  await mkdir(join(projectPath, 'chapters'), { recursive: true });
  await mkdir(join(projectPath, 'code/src'), { recursive: true });
  await mkdir(join(projectPath, 'code/notebooks'), { recursive: true });
  await mkdir(join(projectPath, 'code/results'), { recursive: true });
  await mkdir(join(projectPath, 'code/figures'), { recursive: true });
  await mkdir(join(projectPath, 'figures'), { recursive: true });
  await mkdir(join(projectPath, 'skills'), { recursive: true });
  await mkdir(join(projectPath, 'output'), { recursive: true });
  await saveProject(projectPath, config);
  await writeFile(join(projectPath, 'references.bib'), '', 'utf-8');
}

export async function addChapter(projectPath, filename) {
  const config = await loadProject(projectPath);
  const filePath = join(projectPath, 'chapters', filename);
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
