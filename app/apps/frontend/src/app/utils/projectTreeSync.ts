import type { ProjectConfig } from '../hooks/useProject';
import type { OpenFile } from '../types';

export type SyncedProjectItem = { path: string; type: 'file' | 'dir' };

export const PROJECT_TREE_SYNC_INTERVAL_MS = 2000;
export const PROJECT_TREE_SYNC_EVENT = 'paper-writer:project-tree-sync';

function normalizedItems(items: SyncedProjectItem[]) {
  return [...items]
    .filter(item => item && (item.type === 'file' || item.type === 'dir') && Boolean(item.path))
    .sort((left, right) => left.path.localeCompare(right.path) || left.type.localeCompare(right.type));
}

export function projectItemsEqual(left: SyncedProjectItem[] = [], right: SyncedProjectItem[] = []) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item.path === right[index]?.path && item.type === right[index]?.type);
}

export function mergeSyncedProjectTree(config: ProjectConfig, incomingItems: SyncedProjectItem[]): ProjectConfig {
  const files = normalizedItems(incomingItems);
  const currentFiles = normalizedItems(config.files || []);
  if (projectItemsEqual(currentFiles, files)) return config;

  const chapterFiles = files
    .filter(item => item.type === 'file' && /^(?:sec|chapters)\/[^/]+\.tex$/i.test(item.path))
    .map(item => item.path);
  const chapterFileSet = new Set(chapterFiles);
  const existingChapters = (config.chapters || []).filter(chapter => chapterFileSet.has(chapter.file));
  const existingChapterSet = new Set(existingChapters.map(chapter => chapter.file));
  const chapters = [
    ...existingChapters,
    ...chapterFiles.filter(file => !existingChapterSet.has(file)).map(file => ({ file, skills: [] })),
  ];

  return { ...config, files, chapters };
}

export function requestProjectTreeSync(projectId: string) {
  if (typeof window === 'undefined' || !projectId) return;
  window.dispatchEvent(new CustomEvent(PROJECT_TREE_SYNC_EVENT, { detail: { projectId } }));
}

export function reconcileOpenFileContent(file: OpenFile, remoteContent: string): OpenFile {
  if (file.dirty) {
    if (file.content === remoteContent) {
      return {
        ...file,
        dirty: false,
        lastSyncedContent: remoteContent,
        externalContent: undefined,
      };
    }
    if (file.lastSyncedContent === remoteContent) {
      return { ...file, externalContent: undefined };
    }
    if (file.externalContent === remoteContent) return file;
    return { ...file, externalContent: remoteContent };
  }

  if (
    file.content === remoteContent
    && file.lastSyncedContent === remoteContent
    && file.externalContent === undefined
  ) return file;

  return {
    ...file,
    content: remoteContent,
    dirty: false,
    lastSyncedContent: remoteContent,
    externalContent: undefined,
  };
}
