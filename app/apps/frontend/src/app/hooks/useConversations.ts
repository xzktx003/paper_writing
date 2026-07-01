import { useState, useCallback } from 'react';
import {
  listConversations, getConversation, createConversation,
  deleteConversation, updateConversation, sendMessage, sendMessageStream,
  uploadConversationAttachment, deleteConversationAttachment,
  Conversation, ConversationSummary, AttachedFileData
} from '../api/conversationApi';

export interface PendingEdit {
  id: string;
  filename: string;
  original: string;
  new_content: string;
  stats: { added: number; removed: number };
  status: 'pending' | 'accepted' | 'rejected';
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

export function useConversations(projectId: string | null) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; stage: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const list = await listConversations(projectId);
    setConversations(list);
  }, [projectId]);

  const select = useCallback(async (convId: string) => {
    if (!projectId) return;
    setLoading(true);
    const conv = await getConversation(projectId, convId);
    setActiveConv(conv);
    setLoading(false);
  }, [projectId]);

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

  /** Non-streaming send (fallback) */
  const sendRaw = useCallback(async (message: string, projectPath: string, projectConfig: any, files?: AttachedFileData[], skipUserMessage = false) => {
    if (!projectId || !activeConv) return;
    // Only add user message if not already added (skipUserMessage is false)
    if (!skipUserMessage) {
      setActiveConv(prev => prev ? {
        ...prev,
        history: [...prev.history, { role: 'user', content: message }],
      } : null);
    }
    setLoading(true);
    const result = await sendMessage(projectId, activeConv.id, projectPath, message, projectConfig, files);
    setActiveConv(prev => prev ? {
      ...prev,
      history: [...prev.history, { role: 'assistant', content: result.reply }],
    } : null);
    setLoading(false);
    return result;
  }, [projectId, activeConv]);

  /** Streaming send with token-by-token updates */
  const send = useCallback(async (message: string, projectPath: string, projectConfig: any, files?: AttachedFileData[]) => {
    if (!projectId || !activeConv) return;

    console.log('[Chat DEBUG] send() called with message:', message.slice(0, 100));

    // Optimistic: add user message immediately
    const userMsg = { role: 'user' as const, content: message };
    setActiveConv(prev => {
      console.log('[Chat DEBUG] setActiveConv (optimistic) - prev history length:', prev?.history.length);
      return prev ? {
        ...prev,
        history: [...prev.history, userMsg],
      } : null;
    });

    setLoading(true);
    setUploadProgress({ percent: 0, stage: 'preparing' });
    let assistantContent = '';
    let assistantStarted = false;

    try {
      console.log('[Chat DEBUG] Starting sendMessageStream...');
      await sendMessageStream(projectId, activeConv.id, projectPath, message, projectConfig, files, {
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
        onToolUse: (name, input) => {
          console.log('[Chat DEBUG] Tool use:', name);
        },
        onToolResult: (name, result) => {
          console.log('[Chat DEBUG] Tool result:', name, result?.slice(0, 100));
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
          console.error('[Chat DEBUG] onError:', msg);
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
      console.error('[Chat DEBUG] sendMessageStream failed:', err);
      console.error('[Chat DEBUG] Falling back to sendRaw...');
      // Fallback to non-streaming - skip user message since it was already added optimistically
      try {
        await sendRaw(message, projectPath, projectConfig, files, true);
      } catch (fallbackErr) {
        console.error('[Chat DEBUG] Fallback also failed:', fallbackErr);
        setLoading(false);
        setUploadProgress(null);
      }
    }
  }, [projectId, activeConv, sendRaw]);

  const acceptEdit = useCallback(async (editId: string, projectPath: string) => {
    const edit = pendingEdits.find(e => e.id === editId);
    if (!edit) return;
    await fetch(`/api/projects/${projectId}/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: edit.filename, content: edit.new_content }),
    });
    setPendingEdits(prev => prev.map(e => e.id === editId ? { ...e, status: 'accepted' as const } : e));
  }, [projectId, pendingEdits]);

  const rejectEdit = useCallback((editId: string) => {
    setPendingEdits(prev => prev.map(e => e.id === editId ? { ...e, status: 'rejected' as const } : e));
  }, []);

  return {
    conversations, activeConv, loading, uploadProgress, pendingEdits,
    refresh, select, create, remove, rename, send,
    uploadAttachment, removeAttachment, setRagDocuments, acceptEdit, rejectEdit,
  };
}
