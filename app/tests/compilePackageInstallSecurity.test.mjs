import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { shouldAutoInstallTexDependency } from '../apps/backend/src/services/compileService.js';

const read = relative => readFile(new URL(relative, import.meta.url), 'utf8');

describe('LaTeX package-install authorization', () => {
  it('is fail-closed and accepts only the literal boolean true', () => {
    expect(shouldAutoInstallTexDependency()).toBe(false);
    expect(shouldAutoInstallTexDependency(false)).toBe(false);
    expect(shouldAutoInstallTexDependency('true')).toBe(false);
    expect(shouldAutoInstallTexDependency(1)).toBe(false);
    expect(shouldAutoInstallTexDependency(true)).toBe(true);
  });

  it('threads the explicit flag through routes, full-paper compilation, and retries', async () => {
    const [service, routes] = await Promise.all([
      read('../apps/backend/src/services/compileService.js'),
      read('../apps/backend/src/routes/compile.js'),
    ]);

    expect(service).toContain('allowPackageInstall = false');
    expect(service).toContain('shouldAutoInstallTexDependency(allowPackageInstall)');
    expect(service).toMatch(/runCompile\(\{[\s\S]*allowPackageInstall,[\s\S]*_autoInstallAttempt:/);
    expect(service).toMatch(/compileFullPaper\(\{[\s\S]*allowPackageInstall = false/);
    expect(routes.match(/allowPackageInstall: allowPackageInstall === true/g)).toHaveLength(2);
  });

  it('exposes opt-in API typing while existing UI compile calls remain default-safe', async () => {
    const [client, centerPanel] = await Promise.all([
      read('../apps/frontend/src/api/client.ts'),
      read('../apps/frontend/src/app/components/CenterPanel.tsx'),
    ]);

    expect(client.match(/allowPackageInstall\?: boolean/g)).toHaveLength(2);
    expect(centerPanel).not.toContain('allowPackageInstall: true');
  });
});
