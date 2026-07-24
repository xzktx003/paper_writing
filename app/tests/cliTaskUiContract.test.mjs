import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('CLI Task Agent frontend contract', () => {
  it('provides a separate reviewable Task Agent panel without changing Chat permissions', async () => {
    const panel = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/CliTaskPanel.tsx'), 'utf8');
    const rightPanel = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/RightPanel.tsx'), 'utf8');
    const providerRegistry = await readFile(join(process.cwd(), 'apps/backend/src/services/agentProviderRegistry.js'), 'utf8');

    expect(rightPanel).toContain("type TabType = 'chat' | 'tasks'");
    expect(rightPanel).toContain('<CliTaskPanel');
    expect(panel).toContain('data-testid="cli-task-panel"');
    expect(panel).toContain('data-testid="cli-task-diff"');
    expect(panel).toContain('acceptCliTask');
    expect(panel).toContain('rejectCliTask');
    expect(panel).toContain('cancelCliTask');
    expect(providerRegistry).toContain("'--sandbox', 'read-only'");
    expect(providerRegistry).toContain("'--tools', ''");
    expect(providerRegistry).toContain("'--available-tools', ''");
  });

  it('uses managed project IDs and the dedicated CLI task API', async () => {
    const api = await readFile(join(process.cwd(), 'apps/frontend/src/app/api/cliTaskApi.ts'), 'utf8');
    expect(api).toContain('/api/projects/${encodeURIComponent(projectId)}/cli-tasks');
    expect(api).not.toContain('projectPath');
    for (const operation of ['createCliTask', 'listCliTasks', 'getCliTask', 'acceptCliTask', 'rejectCliTask', 'cancelCliTask']) {
      expect(api).toContain(`function ${operation}`);
    }
  });

  it('exposes verified CLI provider state and blocks unavailable task creation', async () => {
    const api = await readFile(join(process.cwd(), 'apps/frontend/src/app/api/cliTaskApi.ts'), 'utf8');
    const panel = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/CliTaskPanel.tsx'), 'utf8');
    for (const field of ['installed', 'authenticated', 'authStatus', 'available', 'unavailableReason']) {
      expect(api).toContain(field);
    }
    expect(panel).toContain('provider.available');
    expect(panel).toContain('disabled={!prompt.trim() || !providerId || Boolean(busy) || !selectedProvider?.available}');
    expect(panel).toContain('unavailableReason');
  });
});
