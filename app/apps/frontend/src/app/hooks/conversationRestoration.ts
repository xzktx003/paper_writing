import type { Conversation, ConversationSummary } from '../api/conversationApi';

interface ConversationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface RestoreOptions {
  projectId: string;
  storage: ConversationStorage;
  listConversations: (projectId: string) => Promise<Array<Pick<ConversationSummary, 'id'>>>;
  getConversation: (projectId: string, conversationId: string) => Promise<Conversation>;
  isCurrent: (projectId: string) => boolean;
}

export function activeConversationStorageKey(projectId: string) {
  return `paper-agent-active-conversation:${projectId}`;
}

export function persistActiveConversation(
  storage: ConversationStorage,
  projectId: string,
  conversationId: string | null,
) {
  const key = activeConversationStorageKey(projectId);
  if (conversationId) storage.setItem(key, conversationId);
  else storage.removeItem(key);
}

export async function restoreActiveConversation({
  projectId,
  storage,
  listConversations,
  getConversation,
  isCurrent,
}: RestoreOptions): Promise<Conversation | null> {
  const key = activeConversationStorageKey(projectId);
  const savedId = storage.getItem(key);

  if (savedId) {
    try {
      const saved = await getConversation(projectId, savedId);
      if (!isCurrent(projectId)) return null;
      persistActiveConversation(storage, projectId, saved.id);
      return saved;
    } catch {
      if (!isCurrent(projectId)) return null;
    }
  }

  let summaries: Array<Pick<ConversationSummary, 'id'>> = [];
  try {
    summaries = await listConversations(projectId);
  } catch {
    if (!isCurrent(projectId)) return null;
  }

  if (!isCurrent(projectId)) return null;
  for (const summary of summaries) {
    if (!summary?.id || summary.id === savedId) continue;
    try {
      const fallback = await getConversation(projectId, summary.id);
      if (!isCurrent(projectId)) return null;
      persistActiveConversation(storage, projectId, fallback.id);
      return fallback;
    } catch {
      if (!isCurrent(projectId)) return null;
    }
  }

  if (isCurrent(projectId)) persistActiveConversation(storage, projectId, null);
  return null;
}
