import { readFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

function compareVersions(left, right) {
  const a = String(left).split(/[.-]/).map(value => Number.parseInt(value, 10) || 0);
  const b = String(right).split(/[.-]/).map(value => Number.parseInt(value, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

describe('dependency security floor', () => {
  it('keeps every installed copy above the audited vulnerable ranges', async () => {
    const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
    const floors = {
      'brace-expansion': '5.0.7',
      'fast-uri': '3.1.4',
      'react-router': '6.30.4',
      'react-router-dom': '6.30.4',
      'shell-quote': '1.8.5',
      tar: '7.5.19',
      vite: '8.0.16',
    };

    const installed = Object.entries(lock.packages || {})
      .filter(([path]) => path.includes('node_modules/'))
      .map(([path, metadata]) => ({
        name: path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length),
        version: metadata.version,
        path,
      }));

    for (const [name, floor] of Object.entries(floors)) {
      const copies = installed.filter(item => item.name === name);
      expect(copies.length, `${name} must be present in the lockfile`).toBeGreaterThan(0);
      for (const copy of copies) {
        expect(compareVersions(copy.version, floor), `${copy.path}@${copy.version} must be >= ${floor}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
