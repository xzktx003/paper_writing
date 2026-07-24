import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('AI primary-file conversation context UI', () => {
  it('defaults a new conversation to the currently selected project file and labels it as primary context', async () => {
    const dialog = await readFile(new URL('../apps/frontend/src/app/components/NewConversationDialog.tsx', import.meta.url), 'utf8');
    const panel = await readFile(new URL('../apps/frontend/src/app/components/RightPanel.tsx', import.meta.url), 'utf8');

    expect(dialog).toContain('primaryFile');
    expect(dialog).toContain("useState(primaryFile ? 'file' : 'free')");
    expect(dialog).toContain("if (scopeType === 'file') context_scope.file = scopeFile");
    expect(dialog).toContain("value=\"file\"");
    expect(dialog).toContain("t('Primary file (recommended)')");
    expect(panel).toContain('primaryFile={activeFile}');
    expect(panel).toContain("t('Primary file')");
  });
});
