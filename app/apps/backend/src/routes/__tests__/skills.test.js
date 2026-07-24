import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import YAML from 'yaml';

import { registerSkillRoutes } from '../skills.js';
import { loadSkills } from '../../services/skillEngine.js';

test('POST /api/skills/recommend returns ranked recommendations', async () => {
  await loadSkills(null);
  const app = Fastify({ logger: false });
  registerSkillRoutes(app);
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/skills/recommend',
      payload: {
        task: '帮我写 related work 并找 research gap',
        projectState: { hasRagDocuments: true },
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.ok(Array.isArray(body.recommendations));
    assert.equal(body.recommendations[0].skill.name, 'literature-review');
    assert.ok(body.recommendations[0].reasons.length > 0);
    assert.ok(body.recommendations[0].suggestedTask.includes('related work'));
    assert.ok(body.recommendations[0].skill.task_templates.length > 0);
  } finally {
    await app.close();
  }
});

test('GET /api/skills/:name returns enriched UI metadata', async () => {
  await loadSkills(null);
  const app = Fastify({ logger: false });
  registerSkillRoutes(app);
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/skills/literature-review',
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.name, 'literature-review');
    assert.equal(body.display_name_zh, 'AI/ML 文献综述');
    assert.equal(body.subtitle_en, 'Literature Review');
    assert.equal(body.category_zh, '文献检索');
    assert.ok(body.inputs.includes('研究主题'));
    assert.ok(body.outputs.includes('related work 草稿'));
    assert.ok(body.best_for.includes('相关工作'));
    assert.ok(body.task_templates.some(template => template.includes('RAG 证据')));
  } finally {
    await app.close();
  }
});

test('GET /api/skills/navigation returns Chinese-first skill navigation', async () => {
  await loadSkills(null);
  const app = Fastify({ logger: false });
  registerSkillRoutes(app);
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/skills/navigation?selectedSkill=literature-review',
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.navigator.title_zh, 'Skill 导航');
    assert.equal(body.navigator.selectedSkill, 'literature-review');
    assert.ok(body.navigator.categories.some(category => category.name === '文献检索'));
    assert.ok(body.navigator.tagChips.some(tag => tag.name === '相关工作'));
    assert.ok(body.navigator.contextFilters.some(item => item.key === 'rag_documents_or_references'));
    assert.equal(body.navigator.cards[0].name, 'literature-review');
    assert.equal(body.navigator.cards[0].title_zh, 'AI/ML 文献综述');
    assert.equal(body.navigator.cards[0].display_name_zh, 'AI/ML 文献综述');
    assert.equal(body.navigator.cards[0].subtitle_en, 'Literature Review');
  } finally {
    await app.close();
  }
});

test('POST /api/skills/navigation highlights recommendations for a task', async () => {
  await loadSkills(null);
  const app = Fastify({ logger: false });
  registerSkillRoutes(app);
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/skills/navigation',
      payload: {
        task: '帮我根据 PDF 写 related work 和 research gap',
        projectState: { hasRagDocuments: true, hasReferences: true },
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.recommendations[0].skill.name, 'literature-review');
    assert.equal(body.navigator.selectedSkill, 'literature-review');
    assert.equal(body.navigator.cards[0].recommended, true);
    assert.equal(body.navigator.cards[0].name, 'literature-review');
    assert.ok(body.navigator.categories.some(category => category.name === '文献检索' && category.recommendedCount > 0));
  } finally {
    await app.close();
  }
});

test('Skill routes expose conservative readiness and a read-only dry-run', async () => {
  await loadSkills(null);
  const app = Fastify({ logger: false });
  registerSkillRoutes(app, {
    loadAppConfig: async () => ({
      llm_provider: 'openai-compatible',
      llm_api_key: 'configured-for-test',
    }),
    readinessOptions: {
      env: { OPENPRISM_LLM_API_KEY: 'configured-for-test' },
      commandExists: () => true,
    },
  });
  try {
    const listResponse = await app.inject({ method: 'GET', url: '/api/skills' });
    assert.equal(listResponse.statusCode, 200);
    const skills = JSON.parse(listResponse.payload);
    assert.ok(skills.length > 0);
    assert.ok(['ready', 'degraded', 'unavailable'].includes(skills[0].execution.readiness));
    assert.ok(Array.isArray(skills[0].execution.requirements.providerCapabilities));
    assert.ok(Array.isArray(skills[0].execution.sideEffects));
    assert.equal(skills[0].execution.dryRun.status, 'not-run');
    assert.equal(skills[0].execution.lastRun.status, 'never');

    const dryRunResponse = await app.inject({
      method: 'POST',
      url: '/api/skills/literature-review/dry-run',
    });
    assert.equal(dryRunResponse.statusCode, 200);
    const dryRun = JSON.parse(dryRunResponse.payload);
    assert.equal(dryRun.ok, true);
    assert.equal(dryRun.skill.execution.readiness, 'degraded');
    assert.equal(dryRun.skill.execution.dryRun.status, 'degraded');
    assert.ok(dryRun.skill.execution.checks.some(check => check.kind === 'execution-metadata' && check.status === 'unverified'));
    assert.match(dryRun.skill.execution.dryRun.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(dryRun.skill.execution.lastRun.status, 'never');
  } finally {
    await app.close();
  }
});

test('creating a Skill persists categories and Chinese metadata outside built-ins', async () => {
  const customSkillsDir = await mkdtemp(join(tmpdir(), 'paper-writer-custom-skills-'));
  const app = Fastify({ logger: false });
  try {
    registerSkillRoutes(app, { customSkillsDir });
    const response = await app.inject({
      method: 'POST',
      url: '/api/skills',
      payload: {
        name: 'user-literature-helper',
        display_name: 'Literature helper',
        display_name_zh: '文献助手',
        description: 'A user-created helper',
        description_zh: '用户创建的文献助手',
        categories: ['literature-search', 'paper-writing'],
        category_zh: '文献检索',
        subcategory: 'evidence-synthesis',
        subcategory_zh: '证据综合',
        tags: ['evidence', '用户'],
        type: 'research',
        trigger: 'manual',
        prompt: 'Summarize evidence.',
      },
    });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.payload);
    assert.equal(body.skill.source, 'custom');
    assert.deepEqual(body.skill.categories, ['literature-search', 'paper-writing']);
    const persisted = YAML.parse(await readFile(join(customSkillsDir, 'user-literature-helper.yaml'), 'utf8'));
    assert.deepEqual(persisted.categories, ['literature-search', 'paper-writing']);
    assert.equal(persisted.display_name_zh, '文献助手');
    assert.equal(persisted.description_zh, '用户创建的文献助手');
    assert.equal(persisted.subcategory_zh, '证据综合');
  } finally {
    await app.close();
    await rm(customSkillsDir, { recursive: true, force: true });
  }
});

test('Skill creation rejects non-slug names and duplicate names', async () => {
  const customSkillsDir = await mkdtemp(join(tmpdir(), 'paper-writer-custom-skills-'));
  const app = Fastify({ logger: false });
  try {
    registerSkillRoutes(app, { customSkillsDir });
    const invalid = await app.inject({
      method: 'POST', url: '/api/skills',
      payload: { name: '中文名称', prompt: 'x' },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(JSON.parse(invalid.payload).code, 'INVALID_SKILL_NAME');

    const first = await app.inject({
      method: 'POST', url: '/api/skills',
      payload: { name: 'duplicate-skill', prompt: 'x' },
    });
    assert.equal(first.statusCode, 200);
    const duplicate = await app.inject({
      method: 'POST', url: '/api/skills',
      payload: { name: 'duplicate-skill', prompt: 'x' },
    });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(JSON.parse(duplicate.payload).code, 'SKILL_ALREADY_EXISTS');
  } finally {
    await app.close();
    await rm(customSkillsDir, { recursive: true, force: true });
  }
});

test('built-in Skills cannot be deleted and custom Skills can be deleted', async () => {
  const customSkillsDir = await mkdtemp(join(tmpdir(), 'paper-writer-custom-skills-'));
  await writeFile(join(customSkillsDir, 'deletable-skill.yaml'), 'name: deletable-skill\ndisplay_name: Deletable\nprompt: test\n', 'utf8');
  await loadSkills(undefined, { customSkillsDir });
  const app = Fastify({ logger: false });
  try {
    registerSkillRoutes(app, { customSkillsDir });
    const builtIn = await app.inject({ method: 'DELETE', url: '/api/skills/literature-review' });
    assert.equal(builtIn.statusCode, 409);
    assert.equal(JSON.parse(builtIn.payload).code, 'BUILTIN_SKILL_PROTECTED');

    const custom = await app.inject({ method: 'DELETE', url: '/api/skills/deletable-skill' });
    assert.equal(custom.statusCode, 200);
    assert.equal(JSON.parse(custom.payload).ok, true);
    await assert.rejects(readFile(join(customSkillsDir, 'deletable-skill.yaml')));
  } finally {
    await app.close();
    await rm(customSkillsDir, { recursive: true, force: true });
    await loadSkills(null);
  }
});
