import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

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
