import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROJECT_TREE_SYNC_INTERVAL_MS,
  mergeSyncedProjectTree,
  reconcileOpenFileContent,
} from '../apps/frontend/src/app/utils/projectTreeSync.ts';

describe('managed project tree automatic synchronization', () => {
  it('merges the latest filesystem tree without discarding chapter skill settings', () => {
    const config = {
      title: 'Paper',
      authors: [],
      template: 'plain',
      editor_mode: 'latex',
      global_skills: [],
      chapters: [
        { file: 'sec/existing.tex', skills: ['writing-methodology'] },
        { file: 'sec/deleted.tex', skills: ['writing-results'] },
      ],
      files: [
        { path: 'sec/existing.tex', type: 'file' },
        { path: 'sec/deleted.tex', type: 'file' },
      ],
    };

    const next = mergeSyncedProjectTree(config, [
      { path: 'sec', type: 'dir' },
      { path: 'sec/existing.tex', type: 'file' },
      { path: 'sec/new.tex', type: 'file' },
      { path: 'main.pdf', type: 'file' },
    ]);

    expect(next.files).toEqual([
      { path: 'main.pdf', type: 'file' },
      { path: 'sec', type: 'dir' },
      { path: 'sec/existing.tex', type: 'file' },
      { path: 'sec/new.tex', type: 'file' },
    ]);
    expect(next.chapters).toEqual([
      { file: 'sec/existing.tex', skills: ['writing-methodology'] },
      { file: 'sec/new.tex', skills: [] },
    ]);
    expect(PROJECT_TREE_SYNC_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
    expect(PROJECT_TREE_SYNC_INTERVAL_MS).toBeLessThanOrEqual(5000);
  });

  it('removes the manual refresh button and wires authenticated tree polling in the app context', async () => {
    const projectTree = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/ProjectTree.tsx'), 'utf8');
    const appContext = await readFile(join(process.cwd(), 'apps/frontend/src/app/context/AppContext.tsx'), 'utf8');
    const markdownEditor = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/MarkdownEditor.tsx'), 'utf8');
    const centerPanel = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/CenterPanel.tsx'), 'utf8');

    expect(projectTree).not.toContain("title={t('Refresh file list')}");
    expect(projectTree).not.toContain('const refreshFiles = async');
    expect(appContext).toContain('getManagedProjectTree');
    expect(appContext).toContain('PROJECT_TREE_SYNC_INTERVAL_MS');
    expect(appContext).toContain("document.addEventListener('visibilitychange'");
    expect(appContext).toContain("window.addEventListener('focus'");
    expect(appContext).toContain('getManagedProjectFile');
    expect(appContext).toContain('reconcileOpenFileContent');
    expect(appContext).toContain('content === file.lastSyncedContent');
    expect(appContext).toContain('saved?.version === 2');
    expect(appContext).toContain('version: 2');
    expect(markdownEditor).toContain('externalContentUpdate');
    expect(centerPanel).toContain('data-testid="external-file-change"');
  });

  it('auto-refreshes clean files while surfacing external changes beside unsaved drafts', () => {
    expect(reconcileOpenFileContent({
      filename: 'Tab/full_qwen3_50.tex',
      content: 'old disk value',
      type: 'other',
      dirty: false,
    }, 'new disk value')).toMatchObject({
      content: 'new disk value',
      lastSyncedContent: 'new disk value',
      dirty: false,
      externalContent: undefined,
    });

    expect(reconcileOpenFileContent({
      filename: 'Tab/full_qwen3_50.tex',
      content: 'unsaved browser draft',
      lastSyncedContent: 'old disk value',
      type: 'other',
      dirty: true,
    }, 'new disk value')).toMatchObject({
      content: 'unsaved browser draft',
      lastSyncedContent: 'old disk value',
      externalContent: 'new disk value',
      dirty: true,
    });

    expect(reconcileOpenFileContent({
      filename: 'Tab/full_qwen3_50.tex',
      content: 'unsaved browser draft',
      lastSyncedContent: 'unchanged disk value',
      type: 'other',
      dirty: true,
    }, 'unchanged disk value')).toMatchObject({
      content: 'unsaved browser draft',
      lastSyncedContent: 'unchanged disk value',
      externalContent: undefined,
      dirty: true,
    });
  });
});
