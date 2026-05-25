import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useProject, ProjectConfig } from '../hooks/useProject';
import { useConversations } from '../hooks/useConversations';
import { readChapter, writeChapter, readCodeFile } from '../api/projectApi';
import { listSkills, reloadSkills, SkillInfo } from '../api/skillApi';
import { isImagePath, isPdfPath, isPreviewableTextPath } from '../utils/previewAssets';

interface OpenFile {
  filename: string;
  content: string;
  type: 'chapter' | 'code' | 'other';
  dirty: boolean;
}

interface AppState {
  project: { path: string | null; config: ProjectConfig | null; loading: boolean; error: string | null };
  openProject: (path: string) => Promise<void>;
  createNewProject: (path: string, config: ProjectConfig) => Promise<void>;
  openFiles: OpenFile[];
  activeFileIndex: number;
  openFile: (file: { path: string; type: 'chapter' | 'code' | 'other' }) => Promise<void>;
  updateFileContent: (index: number, content: string) => void;
  saveFile: (index: number) => Promise<void>;
  closeFile: (index: number) => void;
  setActiveFileIndex: (index: number) => void;
  conversations: any[];
  activeConv: any;
  convLoading: boolean;
  refreshConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  createConversation: (data: any) => Promise<unknown>;
  removeConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, newName: string) => Promise<void>;
  sendMessage: (message: string, images?: { id: string; dataUrl: string; name: string }[]) => Promise<void>;
  pendingEdits: any[];
  acceptEdit: (editId: string) => void;
  rejectEdit: (editId: string) => void;
  skills: SkillInfo[];
  activateSkill: (name: string) => void;
  terminalVisible: boolean;
  toggleTerminal: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children, projectId }: { children: React.ReactNode; projectId?: string }) {
  const { project, open, create, setProject } = useProject();
  const convProjectId = projectId || (project.path ? btoa(project.path).slice(0, 12) : null);
  const convHook = useConversations(convProjectId);

  useEffect(() => {
    if (!projectId || project.path) return;
    loadPaperAgentProject(projectId);
  }, [projectId]);

  async function loadPaperAgentProject(id: string) {
    setProject(p => ({ ...p, loading: true, error: null }));
    try {
      const treeRes = await fetch(`/api/projects/${id}/tree`);
      const treeData = await treeRes.json();
      const items: { path: string; type: string }[] = treeData.items || [];

      const texFiles = items
        .filter(f => f.type === 'file' && /^sec\/[^/]+\.tex$/.test(f.path))
        .sort((a, b) => a.path.localeCompare(b.path));

      const chapters = texFiles.map(f => ({ file: f.path, skills: [] as string[] }));

      let title = 'Untitled';
      try {
        const metaRes = await fetch(`/api/projects/${id}/file?path=project.json`);
        const metaData = await metaRes.json();
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

  useEffect(() => {
    if (project.config && project.config.chapters.length > 0 && openFiles.length === 0) {
      const firstChapter = project.config.chapters[0];
      openFile({ path: firstChapter.file, type: 'chapter' });
    }
  }, [project.config]);

  const getPaperAgentId = useCallback(() => {
    if (project.path?.startsWith('__paper_agent__:')) {
      return project.path.replace('__paper_agent__:', '');
    }
    return null;
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
      } else if (paId && isPreviewableTextPath(file.path)) {
        const res = await fetch(`/api/projects/${paId}/file?path=${encodeURIComponent(file.path)}`);
        const data = await res.json();
        content = data.content || '';
      } else if (file.type === 'chapter') {
        const result = await readChapter(project.path, file.path);
        content = result.content || '';
      } else if (file.type === 'code') {
        const result = await readCodeFile(project.path, file.path);
        content = result.content || '';
      }
    } catch (e) {
      console.error('Failed to read file:', e);
    }
    setOpenFiles(prev => {
      setActiveFileIndex(prev.length);
      return [...prev, { filename: file.path, content, type: file.type, dirty: false }];
    });
  }, [openFiles, project.path, getPaperAgentId]);

  const updateFileContent = useCallback((index: number, content: string) => {
    setOpenFiles(prev => prev.map((f, i) => i === index ? { ...f, content, dirty: true } : f));
  }, []);

  const saveFile = useCallback(async (index: number) => {
    const file = openFiles[index];
    if (!file || !project.path) return;
    const paId = getPaperAgentId();
    if (paId) {
      await fetch(`/api/projects/${paId}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.filename, content: file.content }),
      });
    } else if (file.type === 'chapter') {
      await writeChapter(project.path, file.filename, file.content);
    }
    setOpenFiles(prev => prev.map((f, i) => i === index ? { ...f, dirty: false } : f));
  }, [openFiles, project.path, getPaperAgentId]);

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

  const sendMessage = useCallback(async (message: string, images?: { id: string; dataUrl: string; name: string }[]) => {
    if (!project.path || !project.config) return;
    await convHook.send(message, project.path, project.config, images);
  }, [project.path, project.config, convHook]);

  const value: AppState = {
    project,
    openProject: open,
    createNewProject: create,
    openFiles,
    activeFileIndex,
    openFile,
    updateFileContent,
    saveFile,
    closeFile,
    setActiveFileIndex,
    conversations: convHook.conversations,
    activeConv: convHook.activeConv,
    convLoading: convHook.loading,
    refreshConversations: convHook.refresh,
    selectConversation: convHook.select,
    createConversation: convHook.create,
    removeConversation: convHook.remove,
    renameConversation: convHook.rename,
    sendMessage,
    pendingEdits: convHook.pendingEdits,
    acceptEdit: (editId: string) => convHook.acceptEdit(editId, project.path || ''),
    rejectEdit: convHook.rejectEdit,
    skills,
    activateSkill,
    terminalVisible,
    toggleTerminal: () => setTerminalVisible(v => !v),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
