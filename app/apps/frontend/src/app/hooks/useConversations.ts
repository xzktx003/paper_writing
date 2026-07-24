import { useState, useCallback, useEffect, useRef } from 'react';
import {
  listConversations, getConversation, createConversation,
  deleteConversation, updateConversation, sendMessage, sendMessageStream,
  uploadConversationAttachment, deleteConversationAttachment,
  Conversation, ConversationSummary, AttachedFileData, EditProposalData, AIStreamResponseError
} from '../api/conversationApi';
import { writeFile as writeProjectFile } from '../../api/client';
import { writeChapter } from '../api/projectApi';
import { persistActiveConversation, restoreActiveConversation } from './conversationRestoration';
import type { ProjectRequestContext } from '../api/projectRequestContext';

export interface PendingEdit {
  id: string;
  conversationId: string;
  filename: string;
  original: string;
  new_content: string;
  stats: { added: number; removed: number };
  status: 'pending' | 'accepted' | 'rejected';
  error?: string;
}

export interface AttachedImage {
  id: string;
  dataUrl: string;
  name: string;
}

/** 支持图片和通用文件上传 */
export interface AttachedFile {
  id: string;
  dataUrl: string;
  name: string;
  type: string;      // MIME type, e.g. 'image/png', 'application/pdf'
  isImage: boolean;  // 是否是图片
  size: number;      // 文件大小（字节）
}

export function useConversations(projectId: string | null, requestContext: ProjectRequestContext | null) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; stage: string } | null>(null);
  const currentProjectRef = useRef<string | null>(projectId);
  const restoringProjectRef = useRef<string | null>(null);
  currentProjectRef.current = projectId;

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const list = await listConversations(projectId);
    setConversations(list);
  }, [projectId]);

  const select = useCallback(async (convId: string) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const conv = await getConversation(projectId, convId);
      if (currentProjectRef.current === projectId) setActiveConv(conv);
    } finally {
      if (currentProjectRef.current === projectId) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    restoringProjectRef.current = projectId;
    setActiveConv(null);
    if (!projectId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    restoreActiveConversation({
      projectId,
      storage: localStorage,
      listConversations,
      getConversation,
      isCurrent: candidate => !cancelled && currentProjectRef.current === candidate,
    }).then(conv => {
      if (!cancelled && currentProjectRef.current === projectId) {
        restoringProjectRef.current = null;
        setActiveConv(conv);
      }
    }).finally(() => {
      if (!cancelled && currentProjectRef.current === projectId) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!projectId || restoringProjectRef.current === projectId) return;
    persistActiveConversation(localStorage, projectId, activeConv?.id || null);
  }, [projectId, activeConv?.id]);

  const create = useCallback(async (data: { name: string; context_scope: any; active_skills?: string[]; mode?: string; model?: string }) => {
    if (!projectId) return;
    const conv = await createConversation(projectId, data);
    setActiveConv(conv);
    await refresh();
    return conv;
  }, [projectId, refresh]);

  const remove = useCallback(async (convId: string) => {
    if (!projectId) return;
    await deleteConversation(projectId, convId);
    if (activeConv?.id === convId) setActiveConv(null);
    await refresh();
  }, [projectId, activeConv, refresh]);

  const rename = useCallback(async (convId: string, newName: string) => {
    if (!projectId) return;
    await updateConversation(projectId, convId, { name: newName });
    if (activeConv?.id === convId) {
      setActiveConv(prev => prev ? { ...prev, name: newName } : null);
    }
    await refresh();
  }, [projectId, activeConv, refresh]);

  const uploadAttachment = useCallback(async (file: AttachedFileData, onProgress?: (percent: number) => void) => {
    if (!projectId || !activeConv) throw new Error('No active conversation');
    const result = await uploadConversationAttachment(projectId, activeConv.id, file, onProgress);
    setActiveConv(prev => prev ? {
      ...prev,
      attachments: [
        ...(prev.attachments || []).filter(item => item.name !== result.attachment.name),
        result.attachment,
      ],
    } : null);
    return result.attachment;
  }, [projectId, activeConv?.id]);

  const removeAttachment = useCallback(async (attachmentId: string) => {
    if (!projectId || !activeConv) return;
    await deleteConversationAttachment(projectId, activeConv.id, attachmentId);
    setActiveConv(prev => prev ? {
      ...prev,
      attachments: (prev.attachments || []).filter(item => item.id !== attachmentId),
    } : null);
  }, [projectId, activeConv?.id]);

  const setRagDocuments = useCallback(async (documentPaths: string[]) => {
    if (!projectId || !activeConv) return;
    const previous = activeConv.rag_documents || [];
    setActiveConv(prev => prev ? { ...prev, rag_documents: documentPaths } : null);
    try {
      await updateConversation(projectId, activeConv.id, { rag_documents: documentPaths });
    } catch (error) {
      setActiveConv(prev => prev ? { ...prev, rag_documents: previous } : null);
      throw error;
    }
  }, [projectId, activeConv?.id, activeConv?.rag_documents]);

  const setActiveSkills = useCallback(async (skillNames: string[]) => {
    if (!projectId || !activeConv) return;
    const normalizedSkills = [...new Set(skillNames.map(name => name.trim()).filter(Boolean))];
    const previous = activeConv.active_skills || [];
    setActiveConv(prev => prev ? { ...prev, active_skills: normalizedSkills } : null);
    try {
      await updateConversation(projectId, activeConv.id, { active_skills: normalizedSkills });
    } catch (error) {
      setActiveConv(prev => prev ? { ...prev, active_skills: previous } : null);
      throw error;
    }
  }, [projectId, activeConv?.id, activeConv?.active_skills]);

  const enqueueEditProposal = useCallback((conversationId: string, proposal: EditProposalData) => {
    const edit: PendingEdit = {
      id: `${conversationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      filename: proposal.filename,
      original: proposal.original,
      new_content: proposal.new_content,
      stats: proposal.stats,
      status: 'pending',
    };
    setPendingEdits(prev => [
      ...prev.filter(item => !(item.conversationId === conversationId && item.filename === proposal.filename && item.status === 'pending')),
      edit,
    ]);
  }, []);

  /** Non-streaming send (fallback) */
  const sendRaw = useCallback(async (message: string, projectConfig: any, files?: AttachedFileData[], skipUserMessage = false) => {
    if (!projectId || !activeConv || !requestContext) return;
    // Only add user message if not already added (skipUserMessage is false)
    if (!skipUserMessage) {
      setActiveConv(prev => prev ? {
        ...prev,
        history: [...prev.history, { role: 'user', content: message }],
      } : null);
    }
    setLoading(true);
    const result = await sendMessage(projectId, activeConv.id, requestContext, message, projectConfig, files);
    for (const proposal of result.editProposals || []) {
      enqueueEditProposal(activeConv.id, proposal);
    }
    setActiveConv(prev => prev ? {
      ...prev,
      history: [...prev.history, { role: 'assistant', content: result.reply }],
    } : null);
    setLoading(false);
    return result;
  }, [projectId, activeConv, requestContext, enqueueEditProposal]);

  /** Streaming send with token-by-token updates */
  const send = useCallback(async (message: string, projectConfig: any, files?: AttachedFileData[]) => {
    if (!projectId || !activeConv || !requestContext) return;

    // Optimistic: add user message immediately
    const userMsg = { role: 'user' as const, content: message };
    setActiveConv(prev => prev ? {
        ...prev,
        history: [...prev.history, userMsg],
      } : null);

    setLoading(true);
    setUploadProgress({ percent: 0, stage: 'preparing' });
    let assistantContent = '';
    let assistantStarted = false;

    try {
      await sendMessageStream(projectId, activeConv.id, requestContext, message, projectConfig, files, {
        onProgress: (percent, stage) => {
          setUploadProgress({ percent, stage });
        },
        onToken: (text) => {
          assistantContent += text;
          setActiveConv(prev => {
            if (!prev) return null;
            // Always ensure user message is present and add/update assistant message
            const newHistory = [...prev.history];
            const hasUserMsg = newHistory.some(m => m.role === 'user' && m.content === message);
            if (!hasUserMsg) {
              // User message missing - this shouldn't happen but fix it
              newHistory.push(userMsg);
            }
            // Update or add assistant message
            if (assistantStarted) {
              // Replace last assistant message
              const lastIdx = newHistory.length - 1;
              if (lastIdx >= 0 && newHistory[lastIdx].role === 'assistant') {
                newHistory[lastIdx] = { role: 'assistant', content: assistantContent };
              } else {
                newHistory.push({ role: 'assistant', content: assistantContent });
              }
            } else {
              // First token - add assistant message
              newHistory.push({ role: 'assistant', content: assistantContent });
            }
            return { ...prev, history: newHistory };
          });
          assistantStarted = true;
        },
        onEditProposal: (proposal) => {
          enqueueEditProposal(activeConv.id, proposal);
        },
        onDone: () => {
          // Final state update - ensure both messages are present
          setActiveConv(prev => {
            if (!prev) return null;
            const newHistory = [...prev.history];
            const hasUserMsg = newHistory.some(m => m.role === 'user' && m.content === message);
            const hasAssistantMsg = newHistory.some(m => m.role === 'assistant');
            if (!hasUserMsg) newHistory.push(userMsg);
            if (!hasAssistantMsg) newHistory.push({ role: 'assistant', content: assistantContent });
            return { ...prev, history: newHistory };
          });
          setLoading(false);
          setUploadProgress(null);
        },
        onError: (msg) => {
          assistantContent += `\n\n⚠️ Error: ${msg}`;
          setActiveConv(prev => {
            if (!prev) return null;
            const newHistory = assistantStarted
              ? [...prev.history.slice(0, -1), { role: 'assistant' as const, content: assistantContent }]
              : [...prev.history, { role: 'assistant' as const, content: assistantContent }];
            return { ...prev, history: newHistory };
          });
          setLoading(false);
          setUploadProgress(null);
        },
      });
    } catch (err) {
      // The backend already recorded the user turn and surfaced the SSE error.
      // Do not issue a second non-streaming request that would duplicate it.
      if (err instanceof AIStreamResponseError) {
        setLoading(false);
        setUploadProgress(null);
        return;
      }
      // Fallback to non-streaming - skip user message since it was already added optimistically
      try {
        await sendRaw(message, projectConfig, files, true);
      } catch {
        setLoading(false);
        setUploadProgress(null);
      }
    }
  }, [projectId, activeConv, requestContext, sendRaw, enqueueEditProposal]);

  const acceptEdit = useCallback(async (editId: string) => {
    const edit = pendingEdits.find(e => e.id === editId);
    if (!edit) return false;
    if (edit.original.length >= 500 && edit.new_content.length < edit.original.length * 0.7) {
      setPendingEdits(prev => prev.map(item => item.id === editId ? {
        ...item,
        error: '已阻止危险修改：新内容明显短于原文件，可能会删除未修改章节。请拒绝此提案并让 Agent 重新生成。',
      } : item));
      return false;
    }
    try {
      if (!requestContext) throw new Error('Project request context is unavailable.');
      if (requestContext.kind === 'managed') {
        await writeProjectFile(requestContext.projectId, edit.filename, edit.new_content);
      } else {
        const chapterFilename = edit.filename.replace(/^chapters\//, '');
        await writeChapter(requestContext, chapterFilename, edit.new_content);
      }
      setPendingEdits(prev => prev.map(e => e.id === editId ? { ...e, status: 'accepted' as const, error: undefined } : e));
      return true;
    } catch (error) {
      setPendingEdits(prev => prev.map(item => item.id === editId ? {
        ...item,
        error: error instanceof Error ? error.message : '应用修改失败。',
      } : item));
      return false;
    }
  }, [pendingEdits, requestContext]);

  const rejectEdit = useCallback((editId: string) => {
    setPendingEdits(prev => prev.map(e => e.id === editId ? { ...e, status: 'rejected' as const } : e));
  }, []);

  const activePendingEdits = activeConv
    ? pendingEdits.filter(edit => edit.conversationId === activeConv.id)
    : [];

  return {
    conversations, activeConv, loading, uploadProgress, pendingEdits: activePendingEdits,
    refresh, select, create, remove, rename, send,
    uploadAttachment, removeAttachment, setRagDocuments, setActiveSkills, acceptEdit, rejectEdit,
  };
}
