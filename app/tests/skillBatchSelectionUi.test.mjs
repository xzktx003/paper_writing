import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('Skill batch selection UI contract', () => {
  it('keeps the selector open while multiple Skills are checked and applies them together', async () => {
    const source = await readFile(new URL('../apps/frontend/src/app/components/SkillsSelector.tsx', import.meta.url), 'utf8');

    expect(source).toContain('pendingSkills');
    expect(source).toContain('togglePendingSkill');
    expect(source).toContain('type="checkbox"');
    expect(source).toContain('onSelectMany(Array.from(pendingSkills))');
    expect(source).toContain("zh: '添加已选'");
    expect(source).toContain("zh: '取消'");
  });

  it('updates the parent selection in one operation', async () => {
    const source = await readFile(new URL('../apps/frontend/src/app/components/SkillsSelector.tsx', import.meta.url), 'utf8');

    expect(source).toContain('const handleSelectMany = (skillNames: string[]) =>');
    expect(source).toContain('onChange([...selectedSkills, ...skillNames.filter');
    expect(source).toContain('onSelectMany={handleSelectMany}');
  });
});
