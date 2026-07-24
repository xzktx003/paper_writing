import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const readFrontend = relative => readFile(join(process.cwd(), 'apps/frontend/src/app/components', relative), 'utf8');

describe('protected browser asset authentication contract', () => {
  it('reloads parent project and template state after a server token is applied', async () => {
    const settings = await readFrontend('SettingsModal.tsx');
    const projects = await readFile(join(process.cwd(), 'apps/frontend/src/app/ProjectPage.tsx'), 'utf8');
    const styles = await readFile(join(process.cwd(), 'apps/frontend/src/app/App.css'), 'utf8');
    expect(settings).toContain('onServerAccessChanged');
    expect(settings).toContain('await onServerAccessChanged?.(Boolean(accessToken.trim()))');
    expect(projects).toContain('Promise.all([loadProjects(), loadTemplates()])');
    expect(projects).toContain('onServerAccessChanged={handleServerAccessChanged}');
    expect(settings).toContain('modal provider-settings-modal');
    expect(styles).toContain('max-height: calc(100dvh - 32px)');
    expect(styles).toMatch(/\.provider-settings-modal \.modal-body[\s\S]*overflow-y: auto/);
  });

  it('fetches image, PDF, and download bodies before creating browser object URLs', async () => {
    const helper = await readFrontend('AuthenticatedAsset.tsx');
    const center = await readFrontend('CenterPanel.tsx');
    const tree = await readFrontend('ProjectTree.tsx');
    expect(helper).toContain('const response = await fetch(src)');
    expect(helper).toContain('URL.createObjectURL(blob)');
    expect(helper).toContain('URL.revokeObjectURL');
    expect(helper).toContain('export async function openAuthenticatedFile');
    expect(center).toContain('<AuthenticatedImage');
    expect(center).toContain('<AuthenticatedPdf');
    expect(center.match(/<AuthenticatedPdf/g)?.length).toBeGreaterThanOrEqual(2);
    expect(center).toContain('openAuthenticatedFile(compiledPdfUrl)');
    expect(tree).toContain('await downloadAuthenticatedFile');
    expect(center).not.toMatch(/<img\s+[\s\S]{0,160}\/api\/projects/);
    expect(center).not.toMatch(/<embed\s+[\s\S]{0,160}\/api\/projects/);
    expect(center).not.toContain('<embed');
    expect(tree).not.toContain('link.href = url');
  });
});
