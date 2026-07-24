import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');

describe('isolated E2E and test-gate contract', () => {
  it('runs Playwright through an isolated server wrapper', async () => {
    const pkg = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'));
    const runner = await readFile(path.join(appRoot, 'scripts/run-e2e-isolated.mjs'), 'utf8');
    const config = await readFile(path.join(appRoot, 'playwright.config.ts'), 'utf8');

    expect(pkg.scripts['test:e2e']).toContain('run-e2e-isolated.mjs');
    expect(pkg.scripts['test:unit']).toContain('--exclude');
    expect(pkg.scripts['test:integration']).toContain('--vitest');
    expect(pkg.scripts.check).toContain('test:unit');
    expect(pkg.scripts['check:full']).toContain('test:e2e');
    expect(pkg.scripts['check:full']).toContain('test:integration');
    expect(runner).toContain('PLAYWRIGHT_OUTPUT_DIR');
    expect(runner).toContain('OPENPRISM_E2E_API_TOKEN');
    expect(runner).toContain('randomBytes');
    expect(runner).toContain('delete childEnv.OPENPRISM_API_TOKEN');
    expect(runner).toContain('childEnv.OPENPRISM_API_TOKEN = e2eApiToken');
    expect(config).toContain('extraHTTPHeaders');
    expect(config).toContain('process.env.PLAYWRIGHT_OUTPUT_DIR');
    expect(config).toMatch(/fullyParallel:\s*false/);
    expect(config).toMatch(/workers:\s*1/);
    expect(config).toMatch(/retries:\s*0/);
    expect(config).toContain("trace: 'retain-on-failure'");
    expect(config).toContain('OPENPRISM_E2E_ISOLATED');
    expect(config).toContain('OPENPRISM_ALLOW_NON_ISOLATED_E2E');
    expect(runner).toContain('OPENPRISM_E2E_ISOLATED');
    expect(runner).toContain('/api/ready');
    expect(config).not.toContain('/data01/home/');
  });

  it('keeps project E2E independent from repository fixtures and old copy', async () => {
    const source = await readFile(path.join(appRoot, 'tests/e2e/projects.spec.ts'), 'utf8');

    expect(source).not.toMatch(/torq/i);
    expect(source).not.toContain("toHaveText('所有项目')");
    expect(source).toContain('createProjectViaApi');
    expect(source).toContain('deleteProjectViaApi');
  });
});
