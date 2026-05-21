import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const builtinSkillsDir = join(__dirname, '../../skills');
let skillRegistry = new Map();

export async function loadSkills(projectSkillsDir) {
  skillRegistry.clear();
  await loadSkillsFromDir(builtinSkillsDir, 'builtin');
  if (projectSkillsDir) {
    await loadSkillsFromDir(projectSkillsDir, 'custom');
  }
}

async function loadSkillsFromDir(dir, source) {
  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
      const content = await readFile(join(dir, file), 'utf-8');
      const skill = YAML.parse(content);
      skill._source = source;
      skillRegistry.set(skill.name, skill);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
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
