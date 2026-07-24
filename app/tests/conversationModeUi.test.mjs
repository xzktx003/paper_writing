import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';

describe('New conversation dialog scopes', () => {
  it('does not expose the retired standalone Code conversation scope', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/NewConversationDialog.tsx'), 'utf8');
    expect(source).not.toContain('value="code"');
    expect(source).not.toContain("scopeType === 'code'");
    expect(source).toContain('value="free"');
    expect(source).toContain('value="global"');
    expect(source).toContain('value="file"');
    expect(source).not.toContain('value="chapter"');
  });
});
