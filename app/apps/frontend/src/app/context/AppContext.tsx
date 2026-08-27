import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useProject, ProjectConfig } from '../hooks/useProject';
import { useConversations } from '../hooks/useConversations';
import type { ConversationActivity } from '../utils/conversationActivity';
import { readChapter, writeChapter, readCodeFile } from '../api/projectApi';
import { listSkills, reloadSkills, SkillInfo } from '../api/skillApi';
import { isImagePath, isPdfPath, isPreviewableTextPath } from '../utils/previewAssets';
import type { OpenFile } from '../types';
import { externalProjectRequest, managedProjectRequest, type ProjectRequestContext } from '../api/projectRequestContext';
import {
  getFile as getManagedProjectFile,
  getProjectTree as getManagedProjectTree,
  writeFile as writeManagedProjectFile,
} from '../../api/client';
import {
  mergeSyncedProjectTree,
  PROJECT_TREE_SYNC_EVENT,
  PROJECT_TREE_SYNC_INTERVAL_MS,
  reconcileOpenFileContent,
  type SyncedProjectItem,
} from '../utils/projectTreeSync';

interface AppState {
  projectId: string | null;
  project: { path: string | null; config: ProjectConfig | null; loading: boolean; error: string | null };
  openProject: (path: string) => Promise<void>;
  createNewProject: (path: string, config: ProjectConfig) => Promise<void>;
  openFiles: OpenFile[];
  activeFileIndex: number;
  openFile: (file: { path: string; type: 'chapter' | 'code' | 'other' }) => Promise<void>;
  updateFileContent: (index: number, content: string) => void;
  saveFile: (index: number) => Promise<void>;
  reloadExternalFile: (index: number) => void;
  closeFile: (index: number) => void;
  setActiveFileIndex: (index: number) => void;
  conversations: any[];
  activeConv: any;
  convLoading: boolean;
  uploadProgress: { percent: number; stage: string } | null;
  conversationActivities: ConversationActivity[];
  refreshConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  createConversation: (data: any) => Promise<unknown>;
  removeConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, newName: string) => Promise<void>;
  sendMessage: (message: string, files?: { id: string; dataUrl: string; name: string; type: string; isImage: boolean; size: number }[]) => Promise<void>;
  cancelMessage: () => void;
  uploadConversationAttachment: (
    file: { dataUrl: string; name: string; type: string; isImage: boolean; size: number },
    onProgress?: (percent: number) => void
  ) => Promise<any>;
  removeConversationAttachment: (attachmentId: string) => Promise<void>;
  setConversationRagDocuments: (documentPaths: string[]) => Promise<void>;
  setConversationActiveSkills: (skillNames: string[]) => Promise<void>;
  pendingEdits: any[];
  acceptEdit: (editId: string) => Promise<void>;
  rejectEdit: (editId: string) => void;
  skills: SkillInfo[];
  activateSkill: (name: string) => void;
  terminalVisible: boolean;
  toggleTerminal: () => void;
}

const AppContext = createContext<AppState | null>(null);

interface PersistedWorkspaceTab {
  path: string;
  type: OpenFile['type'];
  dirty?: boolean;
  draft?: string;
  lastSyncedContent?: string;
}

interface PersistedWorkspaceState {
  version?: number;
  tabs?: PersistedWorkspaceTab[];
  activeFile?: string;
  terminalVisible?: boolean;
}

export function AppProvider({ children, projectId }: { children: React.ReactNode; projectId?: string }) {
  const { project, open, create, setProject } = useProject();
  const convProjectId = projectId || (project.path ? btoa(project.path).slice(0, 12) : null);
  const requestContext: ProjectRequestContext | null = useMemo(() => projectId
    ? managedProjectRequest(projectId)
    : project.path && !project.path.startsWith('__paper_agent__:')
      ? externalProjectRequest(project.path)
      : null, [projectId, project.path]);
  const convHook = useConversations(convProjectId, requestContext);

  useEffect(() => {
    if (!projectId || project.path) return;
    loadPaperAgentProject(projectId);
  }, [projectId]);

  async function loadPaperAgentProject(id: string) {
    setProject(p => ({ ...p, loading: true, error: null }));
    try {
      const treeData = await getManagedProjectTree(id);
      const items: { path: string; type: string }[] = treeData.items || [];

      const texFiles = items
        .filter(f => f.type === 'file' && /^sec\/[^/]+\.tex$/.test(f.path))
        .sort((a, b) => a.path.localeCompare(b.path));

      const chapters = texFiles.map(f => ({ file: f.path, skills: [] as string[] }));

      let title = 'Untitled';
      try {
        const metaData = await getManagedProjectFile(id, 'project.json');
        const meta = JSON.parse(metaData.content);
        title = meta.name || title;
      } catch {}

      const config: ProjectConfig = {
        title,
        authors: [],
        template: 'plain',
        editor_mode: 'latex',
        chapters,
        global_skills: [],
        files: items.filter((item): item is { path: string; type: 'file' | 'dir' } => item.type === 'file' || item.type === 'dir'),
      };

      setProject({ path: `__paper_agent__:${id}`, config, loading: false, error: null });
    } catch (e: any) {
      setProject(p => ({ ...p, loading: false, error: e.message }));
    }
  }

  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(-1);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const restoredWorkspaceRef = useRef<string | null>(null);
  const syncingProjectTreesRef = useRef<Set<string>>(new Set());
  const openFilesRef = useRef<OpenFile[]>([]);
  openFilesRef.current = openFiles;

  const getPaperAgentId = useCallback(() => {
    if (project.path?.startsWith('__paper_agent__:')) {
      return project.path.replace('__paper_agent__:', '');
    }
    return null;
  }, [project.path]);

  const syncManagedProjectTree = useCallback(async () => {
    const id = getPaperAgentId();
    if (!id || syncingProjectTreesRef.current.has(id)) return;
    syncingProjectTreesRef.current.add(id);
    try {
      const result = await getManagedProjectTree(id);
      const items = (result.items || []).filter((item): item is SyncedProjectItem => item.type === 'file' || item.type === 'dir');
      setProject(previous => {
        if (previous.path !== `__paper_agent__:${id}` || !previous.config) return previous;
        const config = mergeSyncedProjectTree(previous.config, items);
        return config === previous.config ? previous : { ...previous, config };
      });
      const visibleFilePaths = new Set(items.filter(item => item.type === 'file').map(item => item.path));
      const refreshedFiles = await Promise.all(openFilesRef.current
        .filter(file => visibleFilePaths.has(file.filename) && isPreviewableTextPath(file.filename))
        .map(async file => ({
          filename: file.filename,
          expectedContent: file.content,
          expectedDirty: file.dirty,
          content: (await getManagedProjectFile(id, file.filename)).content || '',
        })));
      const refreshedByPath = new Map(refreshedFiles.map(file => [file.filename, file]));
      if (refreshedByPath.size > 0) {
        setOpenFiles(previous => previous.map(file => {
          const refreshed = refreshedByPath.get(file.filename);
          if (!refreshed || file.content !== refreshed.expectedContent || file.dirty !== refreshed.expectedDirty) return file;
          return reconcileOpenFileContent(file, refreshed.content);
        }));
      }
    } catch {
      // A transient polling failure should not replace a usable project tree with an error state.
    } finally {
      syncingProjectTreesRef.current.delete(id);
    }
  }, [getPaperAgentId, setProject]);

  useEffect(() => {
    const id = getPaperAgentId();
    if (!id) return;

    const syncIfVisible = () => {
      if (document.visibilityState === 'visible') void syncManagedProjectTree();
    };
    const handleRequestedSync = (event: Event) => {
      const requestedProjectId = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (!requestedProjectId || requestedProjectId === id) void syncManagedProjectTree();
    };
    const handleCliTaskApplied = (event: Event) => {
      const appliedProjectId = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (appliedProjectId === id) void syncManagedProjectTree();
    };

    void syncManagedProjectTree();
    const interval = window.setInterval(syncIfVisible, PROJECT_TREE_SYNC_INTERVAL_MS);
    document.addEventListener('visibilitychange', syncIfVisible);
    window.addEventListener('focus', syncIfVisible);
    window.addEventListener(PROJECT_TREE_SYNC_EVENT, handleRequestedSync);
    window.addEventListener('paper-writer:cli-task-applied', handleCliTaskApplied);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', syncIfVisible);
      window.removeEventListener('focus', syncIfVisible);
      window.removeEventListener(PROJECT_TREE_SYNC_EVENT, handleRequestedSync);
      window.removeEventListener('paper-writer:cli-task-applied', handleCliTaskApplied);
    };
  }, [getPaperAgentId, syncManagedProjectTree]);

  useEffect(() => {
    if (project.path) {
      if (!project.path.startsWith('__paper_agent__:')) {
        reloadSkills(`${project.path}/skills`).then(() => listSkills().then(setSkills)).catch((err) => { console.error('Failed to reload skills:', err); });
      } else {
        listSkills().then(setSkills).catch((err) => { console.error('Failed to list skills:', err); });
      }
      convHook.refresh();
    }
  }, [project.path]);

  const openFile = useCallback(async (file: { path: string; type: 'chapter' | 'code' | 'other' }) => {
    const existing = openFiles.findIndex(f => f.filename === file.path);
    if (existing >= 0) {
      setActiveFileIndex(existing);
      return;
    }
    if (!project.path) return;
    let content = '';
    try {
      const paId = getPaperAgentId();
      if (paId && (isImagePath(file.path) || isPdfPath(file.path))) {
        content = '';
      } else if (paId && (isPreviewableTextPath(file.path) || file.type === 'other')) {
        const data = await getManagedProjectFile(paId, file.path);
        content = data.content || '';
      } else if (file.type === 'chapter') {
        const result = requestContext ? await readChapter(requestContext, file.path) : { content: '' };
        content = result.content || '';
      } else if (file.type === 'code') {
        const result = await readCodeFile(project.path, file.path);
        content = result.content || '';
      } else if (file.type === 'other') {
        // non-paper-agent 'other' files: attempt to read via chapter API as fallback
        const result = requestContext ? await readChapter(requestContext, file.path) : { content: '' };
        content = result.content || '';
      }
    } catch (e) {
      console.error('Failed to read file:', e);
    }
    setOpenFiles(prev => {
      setActiveFileIndex(prev.length);
      return [...prev, { filename: file.path, content, type: file.type, dirty: false, lastSyncedContent: content }];
    });
  }, [openFiles, project.path, getPaperAgentId]);

  useEffect(() => {
    if (!project.path || !project.config) return;
    const projectPath = project.path;
    if (restoredWorkspaceRef.current === projectPath) return;
    const storageKey = `paper-agent-workspace:${projectPath}`;
    restoredWorkspaceRef.current = null;
    let cancelled = false;

    const restore = async () => {
      let saved: PersistedWorkspaceState | null = null;
      try {
        saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      } catch { /* ignore invalid browser state */ }

      const fallback: PersistedWorkspaceTab[] = project.config?.chapters?.[0]
        ? [{ path: project.config.chapters[0].file, type: 'chapter' }]
        : [];
      const tabs = saved?.tabs?.length ? saved.tabs : fallback;
      const paId = projectPath.startsWith('__paper_agent__:') ? projectPath.replace('__paper_agent__:', '') : null;

      const restored = await Promise.all(tabs.map(async tab => {
        let content = '';
        try {
          if (paId && (isImagePath(tab.path) || isPdfPath(tab.path))) {
            content = '';
          } else if (paId && (isPreviewableTextPath(tab.path) || tab.type === 'other')) {
            const data = await getManagedProjectFile(paId, tab.path);
            content = data.content || '';
          } else if (tab.type === 'code') {
            content = (await readCodeFile(projectPath, tab.path)).content || '';
          } else {
            content = requestContext ? (await readChapter(requestContext, tab.path)).content || '' : '';
          }
        } catch (error) {
          console.warn(`Unable to restore tab ${tab.path}:`, error);
          return null;
        }
        const restoreDraft = saved?.version === 2 && tab.dirty && typeof tab.draft === 'string';
        const restoredFile: OpenFile = {
          filename: tab.path,
          type: tab.type,
          content: restoreDraft ? tab.draft! : content,
          dirty: Boolean(restoreDraft),
          lastSyncedContent: saved?.version === 2 && typeof tab.lastSyncedContent === 'string'
            ? tab.lastSyncedContent
            : content,
        };
        return reconcileOpenFileContent(restoredFile, content);
      }));

      if (cancelled) return;
      const files = restored.filter((file): file is OpenFile => Boolean(file));
      setOpenFiles(files);
      const activeIndex = files.findIndex(file => file.filename === saved?.activeFile);
      setActiveFileIndex(files.length ? Math.max(0, activeIndex) : -1);
      if (typeof saved?.terminalVisible === 'boolean') setTerminalVisible(saved.terminalVisible);
      restoredWorkspaceRef.current = projectPath;
    };

    restore();
    return () => { cancelled = true; };
  }, [project.path, project.config, requestContext]);

  useEffect(() => {
    if (!project.path || restoredWorkspaceRef.current !== project.path) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(`paper-agent-workspace:${project.path}`, JSON.stringify({
          version: 2,
          activeFile: openFiles[activeFileIndex]?.filename || null,
          terminalVisible,
          tabs: openFiles.map(file => ({
            path: file.filename,
            type: file.type,
            dirty: file.dirty,
            ...(file.dirty ? { draft: file.content } : {}),
            ...(typeof file.lastSyncedContent === 'string' ? { lastSyncedContent: file.lastSyncedContent } : {}),
          })),
        }));
      } catch (error) {
        console.warn('Unable to save editor workspace state:', error);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [project.path, openFiles, activeFileIndex, terminalVisible]);

  const updateFileContent = useCallback((index: number, content: string) => {
    setOpenFiles(previous => previous.map((file, fileIndex) => {
      if (fileIndex !== index) return file;
      const matchesDisk = file.lastSyncedContent !== undefined && content === file.lastSyncedContent;
      return {
        ...file,
        content,
        dirty: !matchesDisk,
        ...(matchesDisk ? { externalContent: undefined } : {}),
      };
    }));
  }, []);

  const saveFile = useCallback(async (index: number) => {
    const file = openFiles[index];
    if (!file || !project.path) return;
    const paId = getPaperAgentId();
    if (paId) {
      await writeManagedProjectFile(paId, file.filename, file.content);
    } else if (file.type === 'chapter') {
      if (requestContext) await writeChapter(requestContext, file.filename, file.content);
    }
    setOpenFiles(prev => prev.map((f, i) => i === index ? {
      ...f,
      dirty: false,
      lastSyncedContent: f.content,
      externalContent: undefined,
    } : f));
  }, [openFiles, project.path, getPaperAgentId, requestContext]);

  const reloadExternalFile = useCallback((index: number) => {
    setOpenFiles(previous => previous.map((file, fileIndex) => {
      if (fileIndex !== index || file.externalContent === undefined) return file;
      return {
        ...file,
        content: file.externalContent,
        dirty: false,
        lastSyncedContent: file.externalContent,
        externalContent: undefined,
      };
    }));
  }, []);

  const closeFile = useCallback((index: number) => {
    setOpenFiles(prev => prev.filter((_, i) => i !== index));
    setActiveFileIndex(prev => prev >= index && prev > 0 ? prev - 1 : prev);
  }, []);

  const activateSkill = useCallback((name: string) => {
    if (!project.config) return;
    setProject(prev => {
      if (!prev.config) return prev;
      const globalSkills = prev.config.global_skills || [];
      const newSkills = globalSkills.includes(name)
        ? globalSkills.filter(s => s !== name)
        : [...globalSkills, name];
      return { ...prev, config: { ...prev.config, global_skills: newSkills } };
    });
  }, [project.config, setProject]);

  const sendMessage = useCallback(async (message: string, files?: { id: string; dataUrl: string; name: string; type: string; isImage: boolean; size: number }[]) => {
    if (!project.path || !project.config) return;
    await convHook.send(message, project.config, files);
  }, [project.path, project.config, convHook]);

  const acceptEdit = useCallback(async (editId: string) => {
    const edit = convHook.pendingEdits.find(item => item.id === editId);
    const accepted = await convHook.acceptEdit(editId);
    if (edit && accepted) {
      setOpenFiles(prev => prev.map(file => file.filename === edit.filename
        ? { ...file, content: edit.new_content, dirty: false, lastSyncedContent: edit.new_content, externalContent: undefined }
        : file));
    }
  }, [convHook, project.path]);
  const toggleTerminal = useCallback(() => setTerminalVisible(v => !v), []);

  const value: AppState = useMemo(() => ({
    projectId: projectId || null,
    project,
    openProject: open,
    createNewProject: create,
    openFiles,
    activeFileIndex,
    openFile,
    updateFileContent,
    saveFile,
    reloadExternalFile,
    closeFile,
    setActiveFileIndex,
    conversations: convHook.conversations,
    activeConv: convHook.activeConv,
    convLoading: convHook.loading,
    uploadProgress: convHook.uploadProgress,
    conversationActivities: convHook.activities,
    refreshConversations: convHook.refresh,
    selectConversation: convHook.select,
    createConversation: convHook.create,
    removeConversation: convHook.remove,
    renameConversation: convHook.rename,
    sendMessage,
    cancelMessage: convHook.cancel,
    uploadConversationAttachment: convHook.uploadAttachment,
    removeConversationAttachment: convHook.removeAttachment,
    setConversationRagDocuments: convHook.setRagDocuments,
    setConversationActiveSkills: convHook.setActiveSkills,
    pendingEdits: convHook.pendingEdits,
    acceptEdit,
    rejectEdit: convHook.rejectEdit,
    skills,
    activateSkill,
    terminalVisible,
    toggleTerminal,
  }), [
    project, open, create, openFiles, activeFileIndex, openFile,
    updateFileContent, saveFile, reloadExternalFile, closeFile,
    convHook.conversations, convHook.activeConv, convHook.loading, convHook.uploadProgress, convHook.activities,
    convHook.refresh, convHook.select, convHook.create, convHook.remove,
    convHook.rename, convHook.uploadAttachment, convHook.removeAttachment, convHook.setRagDocuments, convHook.setActiveSkills,
    convHook.pendingEdits, convHook.rejectEdit, convHook.cancel,
    sendMessage, acceptEdit, skills, activateSkill, terminalVisible, toggleTerminal,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
