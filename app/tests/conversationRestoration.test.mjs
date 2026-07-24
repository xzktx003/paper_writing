import { describe, expect, it, vi } from 'vitest';
import {
  activeConversationStorageKey,
  persistActiveConversation,
  restoreActiveConversation,
} from '../apps/frontend/src/app/hooks/conversationRestoration.ts';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn(key => values.delete(key)),
    snapshot: () => Object.fromEntries(values),
  };
}

describe('active conversation restoration', () => {
  it('saves the selected conversation under a project-scoped key', () => {
    const storage = memoryStorage();

    persistActiveConversation(storage, 'project-a', 'conversation-1');

    expect(storage.snapshot()).toEqual({
      [activeConversationStorageKey('project-a')]: 'conversation-1',
    });
  });

  it('falls back to the most recent valid conversation when the saved id is stale', async () => {
    const key = activeConversationStorageKey('project-a');
    const storage = memoryStorage({ [key]: 'deleted-conversation' });
    const getConversation = vi.fn(async (_projectId, conversationId) => {
      if (conversationId === 'deleted-conversation') throw new Error('not found');
      return { id: conversationId, name: 'Recent conversation' };
    });

    const restored = await restoreActiveConversation({
      projectId: 'project-a',
      storage,
      listConversations: async () => [{ id: 'recent-conversation' }],
      getConversation,
      isCurrent: () => true,
    });

    expect(restored?.id).toBe('recent-conversation');
    expect(storage.snapshot()[key]).toBe('recent-conversation');
  });

  it('does not clear the saved id while a slow restore is still loading', async () => {
    const key = activeConversationStorageKey('project-a');
    const storage = memoryStorage({ [key]: 'conversation-1' });
    let resolveConversation;
    const pendingConversation = new Promise(resolve => { resolveConversation = resolve; });

    const restoring = restoreActiveConversation({
      projectId: 'project-a',
      storage,
      listConversations: async () => [],
      getConversation: async () => pendingConversation,
      isCurrent: () => true,
    });

    await Promise.resolve();
    expect(storage.snapshot()[key]).toBe('conversation-1');
    expect(storage.removeItem).not.toHaveBeenCalled();

    resolveConversation({ id: 'conversation-1' });
    await expect(restoring).resolves.toMatchObject({ id: 'conversation-1' });
  });

  it('keeps project storage isolated when an old project restore finishes late', async () => {
    const oldKey = activeConversationStorageKey('project-a');
    const newKey = activeConversationStorageKey('project-b');
    const storage = memoryStorage({
      [oldKey]: 'conversation-a',
      [newKey]: 'conversation-b',
    });
    let currentProject = 'project-a';
    let resolveOldConversation;
    const oldConversation = new Promise(resolve => { resolveOldConversation = resolve; });

    const restoringOldProject = restoreActiveConversation({
      projectId: 'project-a',
      storage,
      listConversations: async () => [],
      getConversation: async () => oldConversation,
      isCurrent: projectId => projectId === currentProject,
    });
    currentProject = 'project-b';
    resolveOldConversation({ id: 'conversation-a' });

    await expect(restoringOldProject).resolves.toBeNull();
    expect(storage.snapshot()).toEqual({
      [oldKey]: 'conversation-a',
      [newKey]: 'conversation-b',
    });
  });
});
