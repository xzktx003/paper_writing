import { describe, expect, it, vi } from 'vitest';

import {
  normalizeAppliedSkillNames,
  recordAppliedSkillRuns,
} from '../apps/backend/src/routes/ai.js';

describe('AI Skill execution ledger', () => {
  it('deduplicates the Skills actually applied across project, chapter, and conversation scopes', () => {
    expect(normalizeAppliedSkillNames([
      ['academic-tone', 'writing-polish'],
      ['writing-polish', 'reviewer-response'],
      ['academic-tone', '', null],
    ])).toEqual(['academic-tone', 'writing-polish', 'reviewer-response']);
  });

  it('records a content-free persistent execution summary for every applied Skill', () => {
    const recordRun = vi.fn();
    recordAppliedSkillRuns(['writing-polish', 'reviewer-response'], {
      status: 'success',
      durationMs: 321,
      mode: 'agent',
      providerProvenance: {
        providerId: 'codex-cli',
        model: 'gpt-example',
        version: '1.2.3',
      },
      artifacts: ['sec/revision.tex'],
      sideEffects: ['proposes-project-edits'],
      scope: { projectId: 'project-a', conversationId: 'conversation-a' },
    }, { recordRun });

    expect(recordRun).toHaveBeenCalledTimes(2);
    expect(recordRun).toHaveBeenCalledWith('writing-polish', expect.objectContaining({
      status: 'success',
      outcome: 'provider_completed',
      verificationStatus: 'not_evaluated',
      objectiveStatus: 'not_evaluated',
      kind: 'model-guided-execution',
      durationMs: 321,
      summary: 'Completed agent request with 1 reviewable artifact.',
      provider: 'codex-cli',
      model: 'gpt-example',
      version: '1.2.3',
      artifacts: ['sec/revision.tex'],
      sideEffects: ['proposes-project-edits'],
      scope: { projectId: 'project-a', conversationId: 'conversation-a' },
    }));
  });

  it('never stores the user prompt or provider response in failure summaries', () => {
    const recordRun = vi.fn();
    recordAppliedSkillRuns(['writing-polish'], {
      status: 'failed',
      durationMs: 9,
      mode: 'chat',
      errorCode: 'RATE_LIMIT',
      userMessage: 'private unpublished paper text',
      providerResponse: 'private model output',
    }, { recordRun });

    const recorded = recordRun.mock.calls[0][1];
    expect(recorded.summary).toBe('Failed chat request (RATE_LIMIT).');
    expect(JSON.stringify(recorded)).not.toContain('private unpublished paper text');
    expect(JSON.stringify(recorded)).not.toContain('private model output');
  });
});
