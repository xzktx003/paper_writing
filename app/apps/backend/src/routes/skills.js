import {
  listSkills,
  getSkill,
  loadSkills,
  importSkillFromGitHub,
  updateImportedSkill,
  getSkillPackageTree,
  runSkillTests,
  listImportedSkills,
  removeImportedSkill
} from '../services/skillEngine.js';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
 
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const customSkillsDir = join(__dirname, '../../skills');
 
export function registerSkillRoutes(fastify) {
  /* ── List / Get / Reload ──────────────────────────────────── */
 
  fastify.get('/api/skills', async () => {
    return listSkills();
  });
 
  fastify.get('/api/skills/:name', async (request) => {
    const skill = getSkill(request.params.name);
    if (!skill) return { error: 'Skill not found' };
    return skill;
  });
 
  fastify.post('/api/skills/reload', async (request) => {
    const { projectSkillsDir } = request.body;
    await loadSkills(projectSkillsDir);
    return { ok: true, count: listSkills().length };
  });
 
  /* ── Create YAML Skill ───────────────────────────────────── */
 
  fastify.post('/api/skills', async (request) => {
    const { name, display_name, description, type, trigger, prompt } = request.body;
    if (!name || !prompt) return { error: 'name and prompt are required' };
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const skill = { name: slug, display_name: display_name || name, description: description || '', type: type || 'utility', trigger: trigger || 'manual', prompt };
    const yaml = YAML.stringify(skill);
    await writeFile(join(customSkillsDir, `${slug}.yaml`), yaml, 'utf-8');
    await loadSkills();
    return { ok: true, skill: { name: slug, display_name: skill.display_name, description: skill.description, type: skill.type, trigger: skill.trigger, source: 'builtin' } };
  });
 
  fastify.delete('/api/skills/:name', async (request) => {
    const { name } = request.params;
    const { unlink } = await import('fs/promises');
    try {
      await unlink(join(customSkillsDir, `${name}.yaml`));
      await unlink(join(customSkillsDir, `${name}.yml`)).catch(() => {});
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    await loadSkills();
    return { ok: true };
  });
 
  /* ── GitHub Import / Update / Remove ──────────────────────── */
 
  fastify.post('/api/skills/import', async (request) => {
    const { url, name } = request.body || {};
    if (!url) return { error: 'GitHub URL is required' };
    const result = await importSkillFromGitHub(url, { name });
    return { ok: true, skill: result };
  });
 
  fastify.post('/api/skills/:name/update', async (request) => {
    const { name } = request.params;
    const result = await updateImportedSkill(name);
    return { ok: true, skill: result };
  });
 
  fastify.get('/api/skills/imported/list', async () => {
    return { skills: listImportedSkills() };
  });
 
  fastify.delete('/api/skills/:name/imported', async (request) => {
    const { name } = request.params;
    return await removeImportedSkill(name);
  });
 
  /* ── Package Operations ───────────────────────────────────── */
 
  fastify.get('/api/skills/:name/package-tree', async (request) => {
    const { name } = request.params;
    const subdir = request.query.subdir || '';
    const tree = await getSkillPackageTree(name, subdir);
    return { tree };
  });
 
  fastify.post('/api/skills/:name/run-tests', async (request) => {
    const { name } = request.params;
    const timeout = request.body?.timeout;
    const result = await runSkillTests(name, { timeout });
    return { ok: true, ...result };
  });
}
 
