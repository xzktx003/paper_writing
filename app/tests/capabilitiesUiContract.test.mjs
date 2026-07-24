import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('Capabilities settings UI contract', () => {
  it('offers an explicit diagnostics tab with status, reason, checked time, and opt-in refresh', async () => {
    const settings = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/SettingsModal.tsx'), 'utf8');
    expect(settings).toContain("'/api/capabilities'");
    expect(settings).toContain("'/api/capabilities?refresh=1'");
    expect(settings).toContain('data-testid="capabilities-tab"');
    expect(settings).toContain('data-testid="capabilities-panel"');
    expect(settings).toContain('capability.reason');
    expect(settings).toContain('capability.checkedAt');
    expect(settings).toContain("capability.status === 'available'");
    expect(settings).toContain("capability.status === 'degraded'");
    expect(settings).toContain("capability.status === 'unavailable'");
  });
});
