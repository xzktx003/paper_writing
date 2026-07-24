import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';

const frontend = (...parts) => join(process.cwd(), 'apps/frontend/src', ...parts);

describe('existing project registration UI contract', () => {
  it('exposes candidate discovery and explicit registration in the API client', async () => {
    const source = await readFile(frontend('api/client.ts'), 'utf8');
    expect(source).toContain('export interface ProjectCandidate');
    expect(source).toContain('candidates: ProjectCandidate[]');
    expect(source).toContain("'/api/projects/register-existing'");
    expect(source).toContain('registerExistingProject');
  });

  it('renders discovered directories and explains project identity in ProjectPage', async () => {
    const source = await readFile(frontend('app/ProjectPage.tsx'), 'utf8');
    expect(source).toContain('setProjectCandidates(res.candidates || [])');
    expect(source).toContain('handleRegisterCandidate');
    expect(source).toContain("t('发现的论文目录')");
    expect(source).toContain("t('工程文件夹')");
    expect(source).toContain("t('项目 ID')");
    expect(source).toContain('candidate.suggestedMainFile');
    expect(source).toContain('compactProjectIdentity');
    expect(source).toContain("project.directoryName || ''");
  });
});
