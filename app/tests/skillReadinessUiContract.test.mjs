import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const apiSource = readFileSync(new URL('../apps/frontend/src/app/api/skillApi.ts', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../apps/frontend/src/app/components/SkillPanel.tsx', import.meta.url), 'utf8');
const selectorSource = readFileSync(new URL('../apps/frontend/src/app/components/SkillsSelector.tsx', import.meta.url), 'utf8');

describe('Skill readiness UI contract', () => {
  it('exposes structured execution metadata and a dry-run API', () => {
    for (const token of ['requirements', 'sideEffects', 'costClass', 'readiness', 'dryRun', 'lastRun']) {
      expect(apiSource).toContain(token);
    }
    expect(apiSource).toContain('dryRunSkill');
  });

  it('shows readiness in management and selection surfaces and blocks unavailable activation', () => {
    expect(panelSource).toContain('就绪检查');
    expect(panelSource).toContain('isSkillSelectable');
    expect(selectorSource).toContain('getSkillReadinessPresentation');
    expect(selectorSource).toContain('isSkillSelectable');
    expect(selectorSource).toContain('unavailable');
  });

  it('labels provider completion separately from objective verification', () => {
    expect(apiSource).toContain('objectiveStatus');
    expect(apiSource).toContain('verificationStatus');
    expect(panelSource).toContain('provider_completed');
    expect(panelSource).toContain('objectiveStatus');
    expect(panelSource).toContain('tests_passed');
  });

  it('keeps Skill creation metadata and destructive-action safeguards visible in the UI contract', () => {
    for (const token of ['display_name_zh', 'description_zh', 'categories', 'category_zh', 'createSkill(newSkill)']) {
      expect(panelSource).toContain(token);
    }
    expect(panelSource).toContain('window.confirm');
    expect(panelSource).toContain("skill.source === 'builtin'");
    expect(panelSource).toContain('内置 Skill 不能删除');
  });
});
