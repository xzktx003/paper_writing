import {
  listSkills,
  getSkillForUI,
  loadSkills,
  importSkillFromGitHub,
  updateImportedSkill,
  getSkillPackageTree,
  runSkillTests,
  listImportedSkills,
  removeImportedSkill,
  recommendSkills,
  buildSkillNavigator,
  getCustomSkillsDir,
} from '../services/skillEngine.js';
import {
  evaluateSkillReadiness,
  recordSkillRun,
  runSkillDryRun,
} from '../services/skillReadinessService.js';
import { loadAppConfig } from '../config/appConfig.js';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import YAML from 'yaml';

const DEFAULT_SKILL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function invalidSkillName(name) {
  return Object.assign(new Error('Skill name must be a lowercase slug such as `literature-review`.'), {
    statusCode: 400,
    code: 'INVALID_SKILL_NAME',
  });
}

function skillConflict(name) {
  return Object.assign(new Error(`Skill "${name}" already exists.`), {
    statusCode: 409,
    code: 'SKILL_ALREADY_EXISTS',
  });
}

function protectedBuiltin(name) {
  return Object.assign(new Error(`Built-in Skill "${name}" cannot be deleted.`), {
    statusCode: 409,
    code: 'BUILTIN_SKILL_PROTECTED',
  });
}
 
export function registerSkillRoutes(fastify, options = {}) {
  const loadConfig = options.loadAppConfig || loadAppConfig;
  const customSkillsDir = options.customSkillsDir || getCustomSkillsDir();
  const reloadSkills = options.reloadSkills || (() => loadSkills(undefined, { customSkillsDir }));
  const readinessOptions = options.readinessOptions || {};
  const buildReadinessContext = async () => ({
    env: process.env,
    appConfig: await loadConfig(),
    ...readinessOptions,
  });
  const enrichSkill = (skill, context) => skill ? {
    ...skill,
    execution: evaluateSkillReadiness(skill, context),
  } : null;
  const enrichRecommendations = (recommendations, context) => recommendations.map((item) => ({
    ...item,
    skill: enrichSkill(item.skill, context),
  }));
  /* ── List / Get / Reload ──────────────────────────────────── */
 
  fastify.get('/api/skills', async () => {
    const context = await buildReadinessContext();
    return listSkills().map((skill) => enrichSkill(skill, context));
  });

  fastify.get('/api/skills/navigation', async (request) => {
    const selectedSkill = request.query?.selectedSkill || '';
    const context = await buildReadinessContext();
    const executionByName = new Map(listSkills().map((skill) => [skill.name, evaluateSkillReadiness(skill, context)]));
    const navigator = buildSkillNavigator({ selectedSkill });
    return {
      navigator: {
        ...navigator,
        cards: navigator.cards.map((card) => ({ ...card, execution: executionByName.get(card.name) })),
      },
    };
  });

  fastify.post('/api/skills/navigation', async (request) => {
    const { task, limit, projectState, selectedSkill } = request.body || {};
    const recommendations = task && typeof task === 'string'
      ? recommendSkills(task, { limit, projectState })
      : [];
    const context = await buildReadinessContext();
    const enrichedRecommendations = enrichRecommendations(recommendations, context);
    const executionByName = new Map(listSkills().map((skill) => [skill.name, evaluateSkillReadiness(skill, context)]));
    const navigator = buildSkillNavigator({
      recommendations,
      selectedSkill: selectedSkill || recommendations[0]?.skill?.name || '',
    });
    return {
      navigator: {
        ...navigator,
        cards: navigator.cards.map((card) => ({ ...card, execution: executionByName.get(card.name) })),
      },
      recommendations: enrichedRecommendations,
    };
  });
 
  fastify.get('/api/skills/:name', async (request) => {
    const skill = getSkillForUI(request.params.name);
    if (!skill) return { error: 'Skill not found' };
    return enrichSkill(skill, await buildReadinessContext());
  });

  fastify.post('/api/skills/recommend', async (request) => {
    const { task, limit, projectState } = request.body || {};
    if (!task || typeof task !== 'string') {
      return { recommendations: [] };
    }
    const context = await buildReadinessContext();
    return {
      recommendations: enrichRecommendations(recommendSkills(task, { limit, projectState }), context),
    };
  });
 
  fastify.post('/api/skills/reload', async (request) => {
    const { projectSkillsDir } = request.body;
    await loadSkills(projectSkillsDir);
    return { ok: true, count: listSkills().length };
  });
 
  /* ── Create YAML Skill ───────────────────────────────────── */
 
  fastify.post('/api/skills', async (request) => {
    const {
      name, display_name, display_name_zh, description, description_zh,
      type, categories, category_zh, subcategory, subcategory_zh, tags,
      trigger, prompt, url, requirements, sideEffects, costClass,
    } = request.body;
    if (!name || !prompt) return { error: 'name and prompt are required' };
    const slug = String(name).trim();
    if (!DEFAULT_SKILL_SLUG.test(slug)) throw invalidSkillName(slug);
    if (getSkillForUI(slug)) throw skillConflict(slug);
    await mkdir(customSkillsDir, { recursive: true });
    const normalizedCategories = Array.isArray(categories)
      ? [...new Set(categories.map((value) => String(value).trim()).filter(Boolean))]
      : [];
    const skill = {
      name: slug,
      display_name: display_name || name,
      ...(display_name_zh ? { display_name_zh: String(display_name_zh).trim() } : {}),
      description: description || '',
      ...(description_zh ? { description_zh: String(description_zh).trim() } : {}),
      type: type || 'utility',
      ...(normalizedCategories.length ? { categories: normalizedCategories } : {}),
      ...(category_zh ? { category_zh: String(category_zh).trim() } : {}),
      ...(subcategory ? { subcategory: String(subcategory).trim() } : {}),
      ...(subcategory_zh ? { subcategory_zh: String(subcategory_zh).trim() } : {}),
      ...(Array.isArray(tags) ? { tags: [...new Set(tags.map((value) => String(value).trim()).filter(Boolean))] } : {}),
      trigger: trigger || 'manual',
      prompt,
      ...(url ? { url: String(url).trim() } : {}),
      ...(requirements && typeof requirements === 'object' ? { requirements } : {}),
      ...(Array.isArray(sideEffects) ? { sideEffects } : {}),
      ...(['free', 'low', 'medium', 'high'].includes(costClass) ? { costClass } : {}),
    };
    const yaml = YAML.stringify(skill);
    await writeFile(join(customSkillsDir, `${slug}.yaml`), yaml, 'utf-8');
    await reloadSkills();
    return { ok: true, skill: { ...skill, source: 'custom' } };
  });
 
  fastify.delete('/api/skills/:name', async (request) => {
    const { name } = request.params;
    const slug = String(name || '').trim();
    if (!DEFAULT_SKILL_SLUG.test(slug)) throw invalidSkillName(slug);
    const existing = getSkillForUI(slug);
    if (!existing) {
      const notFound = Object.assign(new Error(`Skill "${slug}" not found.`), { statusCode: 404, code: 'SKILL_NOT_FOUND' });
      throw notFound;
    }
    if (existing.source === 'builtin') throw protectedBuiltin(slug);
    if (existing.source === 'imported') {
      const imported = Object.assign(new Error(`Imported Skill "${slug}" must be removed through the imported-skill endpoint.`), { statusCode: 409, code: 'IMPORTED_SKILL_USE_REMOVE_ENDPOINT' });
      throw imported;
    }
    try {
      await unlink(join(customSkillsDir, `${name}.yaml`));
      await unlink(join(customSkillsDir, `${name}.yml`)).catch(() => {});
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    await reloadSkills();
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
    const startedAt = Date.now();
    const result = await runSkillTests(name, { timeout });
    recordSkillRun(name, {
      status: result.failed > 0 ? 'failed' : result.passed > 0 ? 'success' : 'skipped',
      outcome: result.failed > 0 ? 'tests_failed' : result.passed > 0 ? 'tests_passed' : 'tests_skipped',
      kind: 'package-tests',
      verificationStatus: result.failed > 0 ? 'failed' : result.passed > 0 ? 'passed' : 'inconclusive',
      objectiveStatus: 'not_evaluated',
      durationMs: Date.now() - startedAt,
      summary: result.message,
      artifacts: result.results.map(item => item.file),
      sideEffects: ['executes-local-commands'],
    }, readinessOptions);
    const skill = getSkillForUI(name);
    return {
      ok: true,
      ...result,
      execution: skill ? evaluateSkillReadiness(skill, await buildReadinessContext()) : undefined,
    };
  });

  fastify.post('/api/skills/:name/dry-run', async (request, reply) => {
    const skill = getSkillForUI(request.params.name);
    if (!skill) return reply.code(404).send({ error: 'Skill not found' });
    const execution = runSkillDryRun(skill, await buildReadinessContext());
    return { ok: true, skill: { ...skill, execution } };
  });
}
 
