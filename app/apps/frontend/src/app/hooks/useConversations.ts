import { useState, useCallback } from 'react';
import {
  listConversations, getConversation, createConversation,
  deleteConversation, updateConversation, sendMessage, sendMessageStream,
  Conversation, ConversationSummary
} from '../api/conversationApi';

export function useConversations(projectId: string | null) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);

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
  const sendRaw = useCallback(async (message: string, projectPath: string, projectConfig: any) => {
    if (!projectId || !activeConv) return;
    setActiveConv(prev => prev ? {
      ...prev,
      history: [...prev.history, { role: 'user', content: message }],
    } : null);
    setLoading(true);
    const result = await sendMessage(projectId, activeConv.id, projectPath, message, projectConfig);
    setActiveConv(prev => prev ? {
      ...prev,
      history: [...prev.history, { role: 'assistant', content: result.reply }],
    } : null);
    setLoading(false);
    return result;
  }, [projectId, activeConv]);

  /** Streaming send with token-by-token updates */
  const send = useCallback(async (message: string, projectPath: string, projectConfig: any) => {
    if (!projectId || !activeConv) return;

    // Optimistic: add user message immediately
    setActiveConv(prev => prev ? {
      ...prev,
      history: [...prev.history, { role: 'user', content: message }],
    } : null);

    setLoading(true);
    let assistantContent = '';
    const toolEvents: Array<{ type: string; name: string; detail: string }> = [];

    try {
      await sendMessageStream(projectId, activeConv.id, projectPath, message, projectConfig, {
        onToken: (text) => {
          assistantContent += text;
          setActiveConv(prev => prev ? {
            ...prev,
            history: [
              ...prev.history.slice(0, -1), // Remove the "assistant thinking" placeholder if any
              { role: 'assistant', content: assistantContent },
            ],
          } : null);
        },
        onToolUse: (name, input) => {
          toolEvents.push({ type: 'tool_use', name, detail: JSON.stringify(input).slice(0, 200) });
        },
        onToolResult: (name, result) => {
          toolEvents.push({ type: 'tool_result', name, detail: typeof result === 'string' ? result.slice(0, 500) : '' });
        },
        onDone: () => {
          setLoading(false);
        },
        onError: (msg) => {
          assistantContent += `\n\n⚠️ Error: ${msg}`;
          setActiveConv(prev => prev ? {
            ...prev,
            history: [
              ...prev.history.slice(0, -1),
              { role: 'assistant', content: assistantContent },
            ],
          } : null);
          setLoading(false);
        },
      });
    } catch {
      // Fallback to non-streaming if SSE fails
      await sendRaw(message, projectPath, projectConfig);
    }
  }, [projectId, activeConv, sendRaw]);

  return { conversations, activeConv, loading, refresh, select, create, remove, rename, send };
}
