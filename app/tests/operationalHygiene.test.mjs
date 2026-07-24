import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const repoRoot = join(process.cwd(), '..');
const readRepo = relative => readFile(join(repoRoot, relative), 'utf8');

describe('production operational hygiene', () => {
  it('does not hardcode the current workstation LAN address into runtime defaults', async () => {
    for (const relative of [
      'app/apps/frontend/vite.config.ts',
      'app/apps/backend/src/index.js',
      'app/apps/backend/src/routes/mcp.js',
      'scripts/run-server.sh',
      'scripts/restart.sh',
    ]) {
      expect(await readRepo(relative), relative).not.toContain('10.30.0.22');
    }
    expect(await readRepo('app/apps/backend/src/index.js')).toContain("host: '0.0.0.0'");
  });

  it('does not unconditionally log prompts, messages, tool results, or project paths', async () => {
    const sources = await Promise.all([
      'app/apps/backend/src/routes/ai.js',
      'app/apps/backend/src/routes/projects.js',
      'app/apps/frontend/src/app/hooks/useConversations.ts',
      'app/apps/frontend/src/app/components/DrawPanel.tsx',
    ].map(readRepo));
    const combined = sources.join('\n');
    expect(combined).not.toMatch(/\[AI DEBUG\]|\[Chat DEBUG\]|\[DrawPanel\]/);
    expect(combined).not.toMatch(/console\.log\(`\[files\/list\]/);
    expect(combined).not.toContain("console.log('Tex files:'");
    expect(combined).not.toContain("console.log('PDF files:'");
  });
});
