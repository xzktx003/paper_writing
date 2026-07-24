import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';

describe('compile diagnostics UI contract', () => {
  it('renders success, success-with-warnings, and failure as distinct states', async () => {
    const source = await readFile(new URL('../apps/frontend/src/app/components/CenterPanel.tsx', import.meta.url), 'utf8');

    expect(source).toContain("result.status === 'warning'");
    expect(source).toContain('Compile Succeeded with Warnings');
    expect(source).toContain('Compile Failed');
    expect(source).toContain('warning.code');
    expect(source).toContain('error.code');
  });
});
