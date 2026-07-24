import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path, { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  evaluateSkillReadiness,
  normalizeSkillExecutionProfile,
  recordSkillRun,
  recordSkillRunsBatch,
  reloadSkillRunHistory,
  runSkillDryRun,
} from '../apps/backend/src/services/skillReadinessService.js';

describe('Skill execution readiness', () => {
  it('normalizes explicit requirements, side effects, and cost without inventing readiness from YAML loading', () => {
    const profile = normalizeSkillExecutionProfile({
      name: 'external-analysis',
      requirements: {
        commands: ['python3'],
        credentials: ['EXAMPLE_API_TOKEN'],
        network: ['api.example.test'],
        files: [{ path: 'data/input.csv', scope: 'project' }],
        providerCapabilities: ['invoke'],
      },
      sideEffects: ['network-access', 'writes-project-files'],
      costClass: 'high',
    });

    expect(profile).toMatchObject({
      requirements: {
        commands: [expect.objectContaining({ name: 'python3', required: true })],
        credentials: [expect.objectContaining({ name: 'EXAMPLE_API_TOKEN', required: true })],
        network: [expect.objectContaining({ target: 'api.example.test', required: true })],
        files: [expect.objectContaining({ path: 'data/input.csv', scope: 'project', required: true })],
        providerCapabilities: [expect.objectContaining({ capability: 'invoke', required: true })],
      },
      sideEffects: ['network-access', 'writes-project-files'],
      costClass: 'high',
    });
  });

  it('infers local command requirements and command side effects from packaged scripts', () => {
    const profile = normalizeSkillExecutionProfile({
      name: 'package-skill',
      kind: 'package',
      package: { scripts: ['scripts/check.py', 'scripts/render.mjs', 'scripts/run.sh'] },
    });

    expect(profile.requirements.commands.map(item => item.name)).toEqual(['bash', 'node', 'python3']);
    expect(profile.sideEffects).toContain('executes-local-commands');
  });

  it('reports unavailable when a required command, credential, or configured Provider is missing', () => {
    const result = evaluateSkillReadiness({
      name: 'blocked-skill',
      requirements: {
        commands: ['python3'],
        credentials: ['EXAMPLE_API_TOKEN'],
        providerCapabilities: ['invoke'],
      },
    }, {
      env: {},
      appConfig: { llm_provider: 'openai-compatible', llm_api_key: '' },
      commandExists: () => false,
    });

    expect(result.readiness).toBe('unavailable');
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'command', name: 'python3', status: 'missing' }),
      expect.objectContaining({ kind: 'credential', name: 'EXAMPLE_API_TOKEN', status: 'missing' }),
      expect.objectContaining({ kind: 'provider-capability', name: 'invoke', status: 'missing' }),
    ]));
  });

  it('reports degraded when static requirements pass but network or project files were not verified', () => {
    const result = evaluateSkillReadiness({
      name: 'contextual-skill',
      requirements: {
        network: ['api.example.test'],
        files: [{ path: 'references.bib', scope: 'project' }],
      },
    }, {
      env: { OPENPRISM_LLM_API_KEY: 'configured' },
      appConfig: { llm_provider: 'openai-compatible', llm_api_key: 'configured' },
      commandExists: () => true,
    });

    expect(result.readiness).toBe('degraded');
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'network', status: 'unverified' }),
      expect.objectContaining({ kind: 'file', status: 'needs-project' }),
    ]));
  });

  it('records a read-only dry-run separately from real execution history', () => {
    const result = runSkillDryRun({
      name: 'writing-polish',
      requirements: { providerCapabilities: ['invoke'] },
      sideEffects: [],
      costClass: 'low',
    }, {
      env: { OPENPRISM_LLM_API_KEY: 'configured' },
      appConfig: { llm_provider: 'openai-compatible', llm_api_key: 'configured' },
      now: () => new Date('2026-07-22T05:00:00.000Z'),
    });

    expect(result.readiness).toBe('ready');
    expect(result.dryRun).toMatchObject({ status: 'ready', checkedAt: '2026-07-22T05:00:00.000Z' });
    expect(result.lastRun).toMatchObject({ status: 'never' });
  });

  it('separates provider completion from objective verification in the durable run ledger', () => {
    const run = recordSkillRun('provider-only-run', {
      status: 'success',
      summary: 'Provider returned a response',
    }, {
      runStorePath: path.join(tmpdir(), `skill-run-${Date.now()}-${Math.random()}.json`),
      now: () => new Date('2026-07-22T05:30:00.000Z'),
    });

    expect(run).toMatchObject({
      status: 'success',
      outcome: 'provider_completed',
      verificationStatus: 'not_evaluated',
      objectiveStatus: 'not_evaluated',
    });
  });

  it('uses a test outcome for package tests and validates bounded status enums', () => {
    const run = recordSkillRun('package-run', {
      status: 'success',
      kind: 'package-tests',
      outcome: 'tests_passed',
      verificationStatus: 'passed',
      objectiveStatus: 'made-up-status',
    }, {
      runStorePath: path.join(tmpdir(), `skill-run-${Date.now()}-${Math.random()}.json`),
    });

    expect(run).toMatchObject({
      outcome: 'tests_passed',
      verificationStatus: 'passed',
      objectiveStatus: 'not_evaluated',
    });
  });

  it('writes multiple Skill run records through one batch operation', () => {
    const runStorePath = path.join(tmpdir(), `skill-run-batch-${Date.now()}-${Math.random()}.json`);
    const result = recordSkillRunsBatch([
      { name: 'batch-a', result: { status: 'success', kind: 'package-tests', outcome: 'tests_passed' } },
      { name: 'batch-b', result: { status: 'failed', kind: 'model-guided-execution', outcome: 'provider_failed' } },
    ], { runStorePath });
    expect(result).toHaveLength(2);
    expect(result.map(item => item.name)).toEqual(['batch-a', 'batch-b']);
  });

  it('keeps a YAML-only Skill degraded until execution requirements are explicitly declared', () => {
    const result = runSkillDryRun({ name: 'yaml-only-writing-skill' }, {
      env: { OPENPRISM_LLM_API_KEY: 'configured' },
      appConfig: { llm_provider: 'openai-compatible', llm_api_key: 'configured' },
    });

    expect(result.readiness).toBe('degraded');
    expect(result.dryRun.status).toBe('degraded');
    expect(result.checks).toContainEqual(expect.objectContaining({
      kind: 'execution-metadata',
      status: 'unverified',
    }));
  });

  it('does not treat UI projection keys with undefined values as declared execution metadata', () => {
    const profile = normalizeSkillExecutionProfile({
      name: 'legacy-ui-projection',
      requirements: undefined,
      sideEffects: undefined,
      costClass: undefined,
    });
    const result = evaluateSkillReadiness({
      name: 'legacy-ui-projection',
      requirements: undefined,
      sideEffects: undefined,
      costClass: undefined,
    }, {
      env: { OPENPRISM_LLM_API_KEY: 'configured' },
      appConfig: { llm_provider: 'openai-compatible', llm_api_key: 'configured' },
    });

    expect(profile.metadataSource).toBe('inferred');
    expect(result.readiness).toBe('degraded');
    expect(result.checks).toContainEqual(expect.objectContaining({
      kind: 'execution-metadata',
      status: 'unverified',
    }));
  });

  it('atomically restores durable lastRun history after in-memory state is reloaded', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-run-history-'));
    const runStorePath = join(root, 'skill-runs.json');
    try {
      recordSkillRun('writing-polish', {
        status: 'success',
        kind: 'package-tests',
        durationMs: 42,
        summary: '1 passed',
        provider: 'codex-cli',
        model: 'gpt-5.5',
        version: '1.2.3',
        artifacts: ['reports/result.md'],
        sideEffects: ['writes-artifacts'],
      }, {
        runStorePath,
        now: () => new Date('2026-07-22T07:00:00.000Z'),
      });

      expect(reloadSkillRunHistory({ runStorePath })).toBe(1);
      const restored = evaluateSkillReadiness({ name: 'writing-polish' }, { runStorePath });
      expect(restored.lastRun).toMatchObject({
        status: 'success',
        kind: 'package-tests',
        checkedAt: '2026-07-22T07:00:00.000Z',
        durationMs: 42,
        provider: 'codex-cli',
        model: 'gpt-5.5',
        version: '1.2.3',
        artifacts: ['reports/result.md'],
        sideEffects: ['writes-artifacts'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed to empty history when the durable ledger is corrupt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-run-corrupt-'));
    const runStorePath = join(root, 'skill-runs.json');
    try {
      await writeFile(runStorePath, '{broken', 'utf8');
      expect(reloadSkillRunHistory({ runStorePath })).toBe(0);
      expect(evaluateSkillReadiness({ name: 'writing-polish' }, { runStorePath }).lastRun.status).toBe('never');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
