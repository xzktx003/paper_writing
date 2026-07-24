import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { canMoveTreeItem } from '../apps/frontend/src/app/utils/projectTree.js';

describe('ProjectTree create actions', () => {
  it('exposes context-menu actions for creating files and folders via the project file API', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/ProjectTree.tsx'), 'utf8');
    expect(source).toContain("label={t('New File')}");
    expect(source).toContain("label={t('New Folder')}");
    expect(source).toContain("label={t('Upload')}");
    expect(source).toContain("label={t('Paste')}");
    expect(source).toContain("minHeight: '100%'");
    expect(source).toContain("method: 'POST'");
    expect(source).toContain('/api/projects/${projectId}/file');
    expect(source).toContain("type === 'folder' ? 'dir' : 'file'");
  });
});

describe('ProjectTree root drop affordance', () => {
  it('shows an explicit root drop target and allows nested items to move to root', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/ProjectTree.tsx'), 'utf8');
    expect(source).toContain("t('Drop here to move to project root')");
    expect(canMoveTreeItem({ path: 'docs/note.md', type: 'file' }, '')).toBe(true);
    expect(canMoveTreeItem({ path: 'docs/nested', type: 'dir' }, '')).toBe(true);
  });
});


describe('ProjectTree blank-space context menu', () => {
  it('uses the project root as the target for blank-space paste/create/upload actions', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/ProjectTree.tsx'), 'utf8');
    expect(source).toContain('onContextMenu={(event) => showContextMenu(event, null)}');
    expect(source).toContain("const createTargetFolderPath = getCreateTargetFolderPath(node);");
    expect(source).toContain("const targetFolderPath = createTargetFolderPath ?? getParentPath(node?.path || '');");
    expect(source).toContain("onCreateFile(createTargetFolderPath ?? '')");
    expect(source).toContain("onCreateFolder(createTargetFolderPath ?? '')");
    expect(source).toContain("onUpload(createTargetFolderPath ?? '')");
  });
});


describe('ProjectTree copy path action', () => {
  it('copies the normalized file path through a HTTP-compatible clipboard fallback', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/ProjectTree.tsx'), 'utf8');
    expect(source).toContain('const pathToCopy = normalizeProjectPath(node.path);');
    expect(source).toContain('copyTextToClipboard(pathToCopy)');
    expect(source).toContain("document.execCommand('copy')");
    expect(source).toContain('Clipboard API can be unavailable or denied on plain HTTP');
    expect(source).not.toContain('navigator.clipboard?.writeText(node.path)');
  });
});

describe('ProjectTree download action', () => {
  it('exposes a context-menu download action for files and folders', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/ProjectTree.tsx'), 'utf8');
    expect(source).toContain("label={t('Download')}");
    expect(source).toContain('/api/projects/${encodeURIComponent(projectId)}/download');
    expect(source).toContain('downloadAuthenticatedFile(url, getBaseName(node.path))');
    expect(source).not.toContain('link.href = url');
    expect(source).toContain("t('Downloading {{path}}', { path: node.path })");
  });
});
