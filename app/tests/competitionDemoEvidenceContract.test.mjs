import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const demoDir = join(repoRoot, 'docs/competition/submission_90plus/evidence/demo');
const stages = ['inbox', 'produce', 'review', 'approve', 'measure', 'deliver'];

describe('competition demo evidence coverage', () => {
  it('requires a configured OfficeCLI success path instead of recording unavailable as the result', async () => {
    const recorder = await readFile(join(repoRoot, 'app/scripts/competition-office-demo.mjs'), 'utf8');
    expect(recorder).toContain('OFFICECLI_PATH');
    expect(recorder).toContain('office-artifact-status');
    expect(recorder).toContain("toContainText('ok')");
    expect(recorder).not.toContain('处理与失败态');
  });

  it('keeps at least two independently reviewable screenshots for every office stage', async () => {
    const coverage = JSON.parse(await readFile(join(demoDir, 'coverage.json'), 'utf8'));
    expect(coverage.version).toBe(2);
    expect(coverage.controlledDemo).toBe(true);
    expect(coverage.officeCli.status).toBe('ok');
    for (const stage of stages) {
      const evidence = coverage.stages.find(item => item.id === stage);
      expect(evidence, stage).toBeTruthy();
      expect(evidence.outcome, stage).toBe('success');
      expect(evidence.screenshots.length, stage).toBeGreaterThanOrEqual(2);
      for (const screenshot of evidence.screenshots) {
        expect((await stat(join(demoDir, screenshot.file))).size, screenshot.file).toBeGreaterThan(50_000);
        expect(screenshot.proof.length, screenshot.file).toBeGreaterThan(12);
      }
    }
  });
});
