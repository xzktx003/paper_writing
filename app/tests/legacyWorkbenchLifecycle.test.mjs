import { describe, expect, it, vi } from 'vitest';
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isLegacyWorkbenchBuildEnabled,
  legacyWorkbenchAccessGuard,
} from '../apps/frontend/vite.config.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(APP_ROOT, '..');
const FRONTEND_SOURCE = resolve(APP_ROOT, 'apps/frontend/src');

describe('Legacy Workbench lifecycle contract', () => {
  it('guards Vite development and preview unless the flag is explicitly true', () => {
    expect(isLegacyWorkbenchBuildEnabled({})).toBe(false);
    expect(isLegacyWorkbenchBuildEnabled({ OPENPRISM_ENABLE_LEGACY_WORKBENCH: '1' })).toBe(false);
    expect(isLegacyWorkbenchBuildEnabled({ OPENPRISM_ENABLE_LEGACY_WORKBENCH: 'true' })).toBe(true);

    for (const hookName of ['configureServer', 'configurePreviewServer']) {
      let middleware;
      const plugin = legacyWorkbenchAccessGuard({ enabled: false });
      plugin[hookName]({ middlewares: { use: (handler) => { middleware = handler; } } });
      expect(middleware).toBeTypeOf('function');

      const response = {
        setHeader: vi.fn(),
        end: vi.fn(),
      };
      const next = vi.fn();
      middleware({ url: '/paper-writer-workbench.html?cache=1' }, response, next);
      expect(response.statusCode).toBe(404);
      expect(response.end).toHaveBeenCalledWith('Legacy workbench is disabled');
      expect(next).not.toHaveBeenCalled();
    }

    const enabledPlugin = legacyWorkbenchAccessGuard({ enabled: true });
    const use = vi.fn();
    enabledPlugin.configureServer({ middlewares: { use } });
    expect(use).not.toHaveBeenCalled();
  });

  it('omits the prototype from default builds but retains it for an enabled build', async () => {
    const root = await mkdtemp(join(tmpdir(), 'legacy-workbench-build-'));
    const dist = resolve(root, 'dist');
    const legacyPage = resolve(dist, 'paper-writer-workbench.html');
    await mkdir(dist, { recursive: true });

    try {
      await writeFile(legacyPage, 'legacy', 'utf-8');
      const disabledPlugin = legacyWorkbenchAccessGuard({ enabled: false });
      disabledPlugin.configResolved({ root, build: { outDir: 'dist' } });
      await disabledPlugin.closeBundle();
      await expect(access(legacyPage)).rejects.toMatchObject({ code: 'ENOENT' });

      await writeFile(legacyPage, 'legacy', 'utf-8');
      const enabledPlugin = legacyWorkbenchAccessGuard({ enabled: true });
      enabledPlugin.configResolved({ root, build: { outDir: 'dist' } });
      await enabledPlugin.closeBundle();
      await expect(readFile(legacyPage, 'utf-8')).resolves.toBe('legacy');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps the supported React UI free of links to legacy routes', async () => {
    const entries = await readdir(FRONTEND_SOURCE, { recursive: true, withFileTypes: true });
    const sourceFiles = entries
      .filter((entry) => entry.isFile() && ['.ts', '.tsx', '.js', '.jsx'].includes(extname(entry.name)))
      .map((entry) => resolve(entry.parentPath, entry.name));

    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, 'utf-8');
      expect(source, `${sourceFile} must not link the legacy prototype`).not.toMatch(
        /["'`]\/(?:writing-workbench|paper-writer-workbench\.html)(?:[?"'`]|$)/,
      );
    }
  });

  it('documents the feature flag, migration inventory, and retirement gates', async () => {
    const lifecycle = await readFile(
      resolve(REPO_ROOT, 'docs/legacy_workbench_lifecycle.md'),
      'utf-8',
    );
    const readme = await readFile(resolve(REPO_ROOT, 'README.md'), 'utf-8');

    expect(readme).toContain('OPENPRISM_ENABLE_LEGACY_WORKBENCH');
    expect(readme).toContain('docs/legacy_workbench_lifecycle.md');
    expect(lifecycle).toContain('React 应用的 `/projects`');
    expect(lifecycle).toContain('OPENPRISM_ENABLE_LEGACY_WORKBENCH=true');
    expect(lifecycle).toContain('## 功能所有权');
    expect(lifecycle).toContain('## 弃用阶段');
    expect(lifecycle).toContain('`claim-review` 单句证据检查');
    expect(lifecycle).toContain('`adoption-package` 安全采纳包');
  });
});
