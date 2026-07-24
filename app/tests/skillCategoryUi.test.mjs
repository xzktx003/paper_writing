import { describe, expect, it } from 'vitest';
import {
  getPopulatedSkillCategories,
  SKILL_CATEGORIES,
} from '../apps/frontend/src/app/components/SkillsSelector.tsx';

describe('Skill category UI', () => {
  it('derives visible category counts from the runtime Skill catalog', () => {
    const skills = [
      { name: 'writer', type: 'writing', categories: ['paper-writing'] },
      { name: 'reviewer', type: 'review', categories: ['peer-review'] },
      { name: 'reviewer-2', type: 'review', categories: ['peer-review'] },
    ];

    expect(getPopulatedSkillCategories(skills)).toEqual([
      expect.objectContaining({ id: 'paper-writing', count: 1 }),
      expect.objectContaining({ id: 'peer-review', count: 2 }),
    ]);
  });

  it('never exposes empty categories in the rendered category catalog', () => {
    const visible = getPopulatedSkillCategories([
      { name: 'writer', type: 'writing', categories: ['paper-writing'] },
    ]);

    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('paper-writing');
    expect(visible.length).toBeLessThan(SKILL_CATEGORIES.length);
  });
});
