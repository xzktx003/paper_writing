import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPaperWorkbenchContext } from '../apps/backend/src/services/paperWorkbenchService.js';
import { loadSkills } from '../apps/backend/src/services/skillEngine.js';

describe('paper workbench conservative polish routing', () => {
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'paper-polish-routing-'));
    await loadSkills(null);
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('does not confuse protected LaTeX syntax with a tool or new-citation request', async () => {
    const context = await buildPaperWorkbenchContext(projectRoot, {
      task: '请润色当前文件中的目标段落，提升清晰度、连贯性和学术语气；保留公式、引用键、数字和 LaTeX 命令，不新增事实，不直接覆盖原文，只生成可审查的修改建议或 diff。',
      contextAnswers: { target_section_or_file: 'main.tex' },
    });

    expect(context.taskRouting.mode).toBe('agent');
    expect(context.taskRouting.modeLabel_zh).toBe('Agent 建议修改');
    expect(context.citationPolicy.citationSensitive).toBe(false);
    expect(context.evidencePack.status).toBe('not-required');
    expect(context.modeActionCenter.sendGate.canSend).toBe(true);
    expect(context.skills.recommendations[0]?.skill?.name).toBe('writing-polish');
  });
});
