import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadSkills, listSkills, getSkill, assemblePrompt, runSkillTests } from '../apps/backend/src/services/skillEngine.js';

describe('Skill Engine', () => {
  it('loads built-in skills from skills directory', async () => {
    await loadSkills(null);
    const skills = listSkills();
    expect(skills.length).toBeGreaterThan(0);
    expect(new Set(skills.map(skill => skill.name)).size).toBe(skills.length);
  });

  it('keeps the generated Skill catalog consistent with its manifest', async () => {
    await loadSkills(null);
    const manifest = JSON.parse(await readFile(
      new URL('../apps/backend/skills/open-source-skills.manifest.json', import.meta.url),
      'utf8',
    ));
    const generatedFiles = manifest.generatedFiles || [];
    const generatedNames = generatedFiles.map(filename => filename.replace(/\.ya?ml$/i, ''));

    expect(manifest.totalSkills).toBe(generatedFiles.length);
    expect(new Set(generatedFiles).size).toBe(generatedFiles.length);
    for (const name of generatedNames) expect(getSkill(name), name).toBeTruthy();
  });

  it('loads the AI/ML-focused open-source YAML migrations without MedSci', async () => {
    await loadSkills(null);
    const skills = listSkills();
    expect(skills.filter(skill => skill.name.startsWith('alterlab-'))).toHaveLength(36);
    expect(skills.filter(skill => skill.name.startsWith('medsci-'))).toHaveLength(0);
    expect(['semantic-scholar-search', 'related-work-analyzer', 'scientific-figure-assembly', 'scientific-clarity-checker'].every(name => getSkill(name))).toBe(true);
    expect(skills.filter(skill => skill.name.startsWith('github-'))).toHaveLength(23);
    expect(skills.some(skill => /openalex|uspto|ancient-ruins|primary-source-evaluation/i.test(skill.name))).toBe(false);

    expect(getSkill('alterlab-transformers')).toMatchObject({
      kind: 'yaml',
      source_license: 'Apache-2.0',
      categories: ['experiment-design'],
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

  it('includes vetted popular GitHub research Skills with provenance and popularity metadata', async () => {
    await loadSkills(null);
    expect(getSkill('patent-disclosure-skill')).toMatchObject({
      source_license: 'MIT',
      source_stars: 3374,
      categories: ['patent-writing'],
      subcategory: 'patent-disclosure',
    });
    expect(getSkill('huggingface-papers')).toMatchObject({
      source_license: 'Apache-2.0',
      source_stars: 10761,
      categories: ['literature-search'],
      subcategory: 'paper-reading',
    });
    expect(getSkill('huggingface-paper-publisher')).toMatchObject({
      source_license: 'Apache-2.0',
      source_stars: 10761,
      categories: ['open-access'],
      subcategory: 'research-artifacts',
    });
    expect(getSkill('autoresearch')).toMatchObject({
      source_license: 'MIT',
      source_stars: 5235,
      categories: ['experiment-design'],
      subcategory: 'autonomous-experimentation',
    });

    for (const name of ['patent-disclosure-skill', 'huggingface-papers', 'huggingface-paper-publisher', 'autoresearch']) {
      expect(getSkill(name)._resourceDir, name).toContain('/skill-resources/popular-');
      expect(listSkills().find(skill => skill.name === name)?.source_url, name).toMatch(/^https:\/\/github\.com\//);
    }
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
    const skill = getSkill('github-snl-paper-writing-paper-writing');
    expect(skill).toBeTruthy();
    expect(skill.name).toBe('github-snl-paper-writing-paper-writing');
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
    const prompt = assemblePrompt({ globalSkills: ['github-snl-paper-writing-paper-writing'], chapterSkills: ['writing-polish'] });
    expect(prompt).toContain('Paper Writing Skill');
    expect(prompt).toContain('Academic Polishing');
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
      manualSkills: ['writing-anti-ai', 'writing-polish'],
    });
    expect(prompt.match(/\[Active Skill -/g)).toHaveLength(2);
    expect(prompt).toContain('AI');
    expect(prompt).toContain('Academic Polishing');
  });

  it('loads directory skill packages with manifest, references, and scripts metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-package-'));
    try {
      const packageDir = join(root, 'paper-spine-lite');
      await mkdir(join(packageDir, 'references'), { recursive: true });
      await mkdir(join(packageDir, 'scripts'), { recursive: true });
      await writeFile(join(packageDir, 'manifest.yaml'), `name: paper-spine-lite\ndisplay_name: PaperSpine Lite\ndescription: Motivation-first paper writing workflow\ntype: writing\ntrigger: manual\nrequirements:\n  commands:\n    - node\n  providerCapabilities:\n    - invoke\nsideEffects:\n  - executes-local-commands\ncostClass: low\ntags:\n  - spine\n  - motivation\n`);
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
      expect(listSkills().find(s => s.name === 'paper-spine-lite')).toMatchObject({
        source: 'custom',
        kind: 'package',
        requirements: { commands: ['node'], providerCapabilities: ['invoke'] },
        sideEffects: ['executes-local-commands'],
        costClass: 'low',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs package tests without a shell and without inheriting server secrets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-package-safe-test-'));
    const previousToken = process.env.OPENPRISM_API_TOKEN;
    try {
      const packageDir = join(root, 'safe-package');
      const testsDir = join(packageDir, 'tests');
      await mkdir(testsDir, { recursive: true });
      await writeFile(join(packageDir, 'manifest.yaml'), `name: safe-package\ndisplay_name: Safe Package\ndescription: Safe package test\ntype: utility\ntrigger: manual\n`);
      await writeFile(join(packageDir, 'SKILL.md'), '# Safe package');
      const testName = 'test file; echo injected.mjs';
      await writeFile(join(testsDir, testName), `process.stdout.write(process.env.OPENPRISM_API_TOKEN ? 'leaked' : 'safe');`);
      process.env.OPENPRISM_API_TOKEN = 'must-not-reach-skill-test';

      await loadSkills(root);
      const result = await runSkillTests('safe-package');

      expect(result).toMatchObject({ passed: 1, failed: 0, skipped: 0 });
      expect(result.results[0].file).toContain('test file; echo injected.mjs');
      expect(result.results[0].output).toBe('safe');
    } finally {
      if (previousToken === undefined) delete process.env.OPENPRISM_API_TOKEN;
      else process.env.OPENPRISM_API_TOKEN = previousToken;
      await rm(root, { recursive: true, force: true });
    }
  });
});
