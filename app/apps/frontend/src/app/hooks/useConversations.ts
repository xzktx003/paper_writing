import { useState, useCallback } from 'react';
import {
  listConversations, getConversation, createConversation,
  deleteConversation, updateConversation, sendMessage, sendMessageStream,
  Conversation, ConversationSummary
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

export function useConversations(projectId: string | null) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);

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

  /** Non-streaming send (fallback) */
  const sendRaw = useCallback(async (message: string, projectPath: string, projectConfig: any, images?: AttachedImage[]) => {
    if (!projectId || !activeConv) return;
    setActiveConv(prev => prev ? {
      ...prev,
      history: [...prev.history, { role: 'user', content: message }],
    } : null);
    setLoading(true);
    const result = await sendMessage(projectId, activeConv.id, projectPath, message, projectConfig, images);
    setActiveConv(prev => prev ? {
      ...prev,
      history: [...prev.history, { role: 'assistant', content: result.reply }],
    } : null);
    setLoading(false);
    return result;
  }, [projectId, activeConv]);

  /** Streaming send with token-by-token updates */
  const send = useCallback(async (message: string, projectPath: string, projectConfig: any, images?: AttachedImage[]) => {
    if (!projectId || !activeConv) return;

    // Optimistic: add user message immediately
    setActiveConv(prev => prev ? {
      ...prev,
      history: [...prev.history, { role: 'user', content: message }],
    } : null);

    setLoading(true);
    let assistantContent = '';
    let assistantStarted = false;
    const toolEvents: Array<{ type: string; name: string; detail: string }> = [];

    try {
      await sendMessageStream(projectId, activeConv.id, projectPath, message, projectConfig, images, {
        onToken: (text) => {
          assistantContent += text;
          setActiveConv(prev => prev ? {
            ...prev,
            history: [
              ...(assistantStarted ? prev.history.slice(0, -1) : prev.history),
              { role: 'assistant', content: assistantContent },
            ],
          } : null);
          assistantStarted = true;
        },
        onToolUse: (name, input) => {
          toolEvents.push({ type: 'tool_use', name, detail: JSON.stringify(input).slice(0, 200) });
        },
        onToolResult: (name, result) => {
          toolEvents.push({ type: 'tool_result', name, detail: typeof result === 'string' ? result.slice(0, 500) : '' });
          if (name === 'propose_edit' && typeof result === 'string') {
            try {
              const parsed = JSON.parse(result);
              if (parsed.action === 'pending_approval') {
                setPendingEdits(prev => [...prev, {
                  id: `edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  filename: parsed.filename,
                  original: parsed.original,
                  new_content: parsed.new_content,
                  stats: parsed.stats || { added: 0, removed: 0 },
                  status: 'pending',
                }]);
              }
            } catch { /* not valid JSON, ignore */ }
          }
        },
        onDone: () => {
          setLoading(false);
        },
        onError: (msg) => {
          assistantContent += `\n\n⚠️ Error: ${msg}`;
          setActiveConv(prev => prev ? {
            ...prev,
            history: [
              ...(assistantStarted ? prev.history.slice(0, -1) : prev.history),
              { role: 'assistant', content: assistantContent },
            ],
          } : null);
          setLoading(false);
        },
      });
    } catch {
      // Fallback to non-streaming if SSE fails
      await sendRaw(message, projectPath, projectConfig, images);
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

  return { conversations, activeConv, loading, pendingEdits, refresh, select, create, remove, rename, send, acceptEdit, rejectEdit };
}
