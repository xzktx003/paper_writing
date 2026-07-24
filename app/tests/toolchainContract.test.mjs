import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '..');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readRepoFile = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');

describe('repository toolchain contract', () => {
  it('declares npm as the only package manager and keeps one active lockfile', () => {
    const rootPackage = readJson(path.join(repoRoot, 'package.json'));

    expect(rootPackage.packageManager).toMatch(/^npm@/);
    expect(fs.existsSync(path.join(repoRoot, 'pnpm-lock.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(appRoot, 'package-lock.json'))).toBe(true);
  });

  it('forwards every supported root command to the app workspace without changing failure codes', () => {
    const rootScripts = readJson(path.join(repoRoot, 'package.json')).scripts;

    expect(rootScripts).toMatchObject({
      install: 'npm --prefix app ci',
      dev: 'npm --prefix app run dev',
      'dev:backend': 'npm --prefix app run dev:backend',
      'dev:frontend': 'npm --prefix app run dev:frontend',
      build: 'npm --prefix app run build',
      start: 'npm --prefix app start',
      preview: 'npm --prefix app run preview',
      typecheck: 'npm --prefix app run typecheck',
      test: 'npm --prefix app test',
      'test:unit': 'npm --prefix app run test:unit',
      'test:integration': 'npm --prefix app run test:integration',
      'test:e2e': 'npm --prefix app run test:e2e',
      check: 'npm --prefix app run check',
      'check:full': 'npm --prefix app run check:full',
    });

    for (const command of Object.values(rootScripts)) {
      expect(command).not.toMatch(/(?:\|\||;|\|\s*true|exit\s+0)/);
    }
  });

  it('exposes the same test entry from app and documents root cwd plus app/.env', () => {
    const appScripts = readJson(path.join(appRoot, 'package.json')).scripts;
    const readme = readRepoFile('README.md');
    const readmeZh = readRepoFile('README_ZH.md');
    const envExample = readRepoFile('app/.env.example');

    expect(appScripts.test).toBe('npm run test:unit');
    expect(appScripts.typecheck).toBe('npm --workspace apps/frontend exec tsc -- --noEmit');
    expect(appScripts.check).toBe('npm run typecheck && npm run build && npm run test:unit');
    expect(appScripts.start).toBe('node --env-file-if-exists=../.env --env-file-if-exists=.env apps/backend/src/index.js');
    expect(readme).toContain('cd paper_wrighting');
    expect(readmeZh).toContain('cd paper_wrighting');
    expect(readme).toContain('cp app/.env.example app/.env');
    expect(readmeZh).toContain('cp app/.env.example app/.env');
    expect(readme).toContain('All commands below run from the repository root');
    expect(readmeZh).toContain('以下命令统一从仓库根目录执行');
    expect(envExample).toContain('OPENPRISM_DATA_DIR');
    expect(envExample).toContain('Default: repository-root papers/ directory');
  });
});
