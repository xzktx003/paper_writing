import { listSkills, getSkill, loadSkills } from '../services/skillEngine.js';

export function registerSkillRoutes(fastify) {
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
}
