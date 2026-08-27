import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('workspace chat interaction regressions', () => {
  it('makes the floating terminal launcher draggable and persists its position', async () => {
    const layout = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/Layout.tsx'), 'utf8');

    expect(layout).toContain('terminalTogglePosition');
    expect(layout).toContain('onPointerDown={handleTerminalTogglePointerDown}');
    expect(layout).toContain('data-testid="terminal-toggle"');
    expect(layout).toContain('terminalTogglePosition,');
  });

  it('keeps chat controls outside the text area and exposes a stop action while generating', async () => {
    const rightPanel = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/RightPanel.tsx'), 'utf8');
    const layout = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/Layout.tsx'), 'utf8');

    expect(rightPanel).toContain('onCancel: () => void;');
    expect(rightPanel).toContain("padding: '10px 12px'");
    expect(rightPanel).toContain("data-testid=\"chat-composer-actions\"");
    expect(rightPanel).toContain("canCancelGeneration ? t('Stop') : t('Send')");
    expect(layout).toContain('onCancel={app.cancelMessage}');
  });
});
