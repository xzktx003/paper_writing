import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadSkills, listSkills, getSkill, assemblePrompt } from '../apps/backend/src/services/skillEngine.js';

describe('Skill Engine', () => {
  it('loads built-in skills from skills directory', async () => {
    await loadSkills(null);
    const skills = listSkills();
    expect(skills.length).toBeGreaterThanOrEqual(390);
  });

  it('loads the AI/ML-focused open-source YAML migrations without MedSci', async () => {
    await loadSkills(null);
    const skills = listSkills();
    expect(skills.filter(skill => skill.name.startsWith('alterlab-'))).toHaveLength(74);
    expect(skills.filter(skill => skill.name.startsWith('medsci-'))).toHaveLength(0);
    expect(skills.filter(skill => skill.name.startsWith('skillsbot-')).length).toBeGreaterThanOrEqual(200);
    expect(skills.filter(skill => skill.name.startsWith('github-')).length).toBeGreaterThanOrEqual(24);

    expect(getSkill('alterlab-scientific-writing')).toMatchObject({
      kind: 'yaml',
      source_license: 'MIT',
      categories: ['paper-writing'],
    });
    expect(getSkill('github-snl-paper-writing-paper-writing')).toMatchObject({
      kind: 'yaml',
      source_license: 'MIT',
      categories: ['paper-writing'],
    });
  });

  it('maps migrated Skill references and scripts to the bundled upstream resources', async () => {
    await loadSkills(null);
    const skill = getSkill('github-snl-paper-writing-paper-writing');
    expect(skill.prompt).toContain('# Paper Writing Skill');
    expect(skill._resourceDir).toContain('/skill-resources/snl-paper-writing');

    const prompt = assemblePrompt({ manualSkills: ['github-snl-paper-writing-paper-writing'] });
    expect(prompt).toContain('Skill directory:');
    expect(prompt).toContain('/skill-resources/snl-paper-writing');
  });

  it('provides Chinese names, Chinese descriptions, and valid academic categories for every Skill', async () => {
    await loadSkills(null);
    const categories = new Set(['literature-search', 'experiment-design', 'paper-writing', 'patent-writing', 'scientific-figures', 'academic-conference', 'grant-writing', 'peer-review', 'open-access', 'exploration-discovery']);
    for (const skill of listSkills()) {
      expect(skill.display_name_zh, skill.name).toMatch(/\p{Script=Han}/u);
      expect(skill.description_zh, skill.name).toMatch(/\p{Script=Han}/u);
      expect(skill.categories?.length, skill.name).toBeGreaterThan(0);
      expect(skill.categories.every(category => categories.has(category)), skill.name).toBe(true);
      expect(skill.subcategory, skill.name).toBeTruthy();
      expect(skill.subcategory_zh, skill.name).toMatch(/\p{Script=Han}/u);
    }
  });

  it('each skill has required fields in listing', async () => {
    const skills = listSkills();
    for (const skill of skills) {
      expect(skill.name).toBeTruthy();
      expect(skill.display_name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.type).toBeTruthy();
      expect(skill.trigger).toBeTruthy();
    }
  });

  it('getSkill returns specific skill by name with prompt', async () => {
    const skill = getSkill('ml-paper-writing');
    expect(skill).toBeTruthy();
    expect(skill.name).toBe('ml-paper-writing');
    expect(skill.type).toBe('writing');
    expect(skill.prompt).toBeTruthy();
  });

  it('getSkill returns undefined for non-existent skill', async () => {
    const skill = getSkill('non-existent-skill-xyz');
    expect(skill).toBeUndefined();
  });

  it('skills cover all required types', async () => {
    const skills = listSkills();
    const types = new Set(skills.map(s => s.type));
    expect(types.has('writing')).toBe(true);
    expect(types.has('review')).toBe(true);
    expect(types.has('analysis')).toBe(true);
    expect(types.has('utility')).toBe(true);
    expect(types.has('research')).toBe(true);
  });

  it('skills have correct trigger modes', async () => {
    const skills = listSkills();
    const triggers = new Set(skills.map(s => s.trigger));
    expect(triggers.has('manual')).toBe(true);
  });

  it('assemblePrompt combines global and chapter skills', async () => {
    const prompt = assemblePrompt({ globalSkills: ['ml-paper-writing'], chapterSkills: ['nature-polishing'] });
    expect(prompt).toContain('ML');
    expect(prompt).toContain('Nature');
  });

  it('assemblePrompt with no skills returns base prompt', async () => {
    const prompt = assemblePrompt({ globalSkills: [], chapterSkills: [] });
    expect(prompt).toBe('');
  });

  it('assemblePrompt includes manual skill when provided', async () => {
    const prompt = assemblePrompt({ globalSkills: [], chapterSkills: [], manualSkill: 'writing-anti-ai' });
    expect(prompt).toContain('AI');
  });

  it('assemblePrompt includes every selected conversation skill', async () => {
    const prompt = assemblePrompt({
      globalSkills: [],
      chapterSkills: [],
      manualSkills: ['writing-anti-ai', 'nature-polishing'],
    });
    expect(prompt.match(/\[Active Skill -/g)).toHaveLength(2);
    expect(prompt).toContain('AI');
    expect(prompt).toContain('Nature');
  });

  it('loads directory skill packages with manifest, references, and scripts metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-package-'));
    try {
      const packageDir = join(root, 'paper-spine-lite');
      await mkdir(join(packageDir, 'references'), { recursive: true });
      await mkdir(join(packageDir, 'scripts'), { recursive: true });
      await writeFile(join(packageDir, 'manifest.yaml'), `name: paper-spine-lite\ndisplay_name: PaperSpine Lite\ndescription: Motivation-first paper writing workflow\ntype: writing\ntrigger: manual\ntags:\n  - spine\n  - motivation\n`);
      await writeFile(join(packageDir, 'SKILL.md'), '# PaperSpine Lite\n\nBuild a motivation-first draft from materials.');
      await writeFile(join(packageDir, 'references', 'workflow.md'), 'Workflow notes');
      await writeFile(join(packageDir, 'scripts', 'audit.mjs'), 'console.log("audit")');

      await loadSkills(root);

      const skill = getSkill('paper-spine-lite');
      expect(skill).toBeTruthy();
      expect(skill.kind).toBe('package');
      expect(skill.prompt).toContain('motivation-first');
      expect(skill.package.references).toContain('references/workflow.md');
      expect(skill.package.scripts).toContain('scripts/audit.mjs');
      expect(listSkills().find(s => s.name === 'paper-spine-lite')).toMatchObject({ source: 'custom', kind: 'package' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
