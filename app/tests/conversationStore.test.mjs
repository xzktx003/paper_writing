import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createConversation, getConversation, updateConversation, listConversations, appendMessage, deleteConversation,
  addConversationAttachment, removeConversationAttachment,
} from '../apps/backend/src/services/conversationStore.js';

describe('Conversation Store', () => {
  const originalHome = process.env.HOME;
  let testDir;
  const projectId = 'test-project';

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'conv-test-'));
    // Override HOME so conversation store writes to temp dir
    process.env.HOME = testDir;
  });

  afterAll(async () => {
    process.env.HOME = originalHome;
    await rm(testDir, { recursive: true, force: true });
  });

  it('createConversation returns conversation with id', async () => {
    const conv = await createConversation(projectId, {
      name: 'Test Chat',
      context_scope: { type: 'free' },
      mode: 'chat',
    });
    expect(conv.id).toBeTruthy();
    expect(conv.name).toBe('Test Chat');
    expect(conv.context_scope.type).toBe('free');
    expect(conv.mode).toBe('chat');
    expect(conv.history).toEqual([]);
    expect(conv.attachments).toEqual([]);
    expect(conv.rag_documents).toEqual([]);
  });

  it('listConversations returns created conversations', async () => {
    const list = await listConversations(projectId);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].name).toBe('Test Chat');
  });

  it('getConversation retrieves by id', async () => {
    const list = await listConversations(projectId);
    const conv = await getConversation(projectId, list[0].id);
    expect(conv.name).toBe('Test Chat');
    expect(conv.history).toEqual([]);
  });

  it('appendMessage adds to history', async () => {
    const list = await listConversations(projectId);
    const convId = list[0].id;
    await appendMessage(projectId, convId, { role: 'user', content: 'Hello' });
    await appendMessage(projectId, convId, { role: 'assistant', content: 'Hi there!' });

    const conv = await getConversation(projectId, convId);
    expect(conv.history).toHaveLength(2);
    expect(conv.history[0].role).toBe('user');
    expect(conv.history[1].content).toBe('Hi there!');
  });

  it('persists and removes conversation PDF context', async () => {
    const list = await listConversations(projectId);
    const convId = list[0].id;
    const attachment = await addConversationAttachment(projectId, convId, {
      name: 'paper.pdf', type: 'application/pdf', size: 123, text: 'Extracted paper content',
    });
    let conv = await getConversation(projectId, convId);
    expect(conv.attachments[0].text).toBe('Extracted paper content');
    expect(conv.attachments[0].textLength).toBe(23);

    expect(await removeConversationAttachment(projectId, convId, attachment.id)).toBe(true);
    conv = await getConversation(projectId, convId);
    expect(conv.attachments).toEqual([]);
  });

  it('persists selected RAG documents and clears them when deselected', async () => {
    const list = await listConversations(projectId);
    const convId = list[0].id;
    await updateConversation(projectId, convId, {
      rag_documents: ['research_corpus/a.pdf', 'research_corpus/b.md'],
    });
    let conv = await getConversation(projectId, convId);
    expect(conv.rag_documents).toEqual(['research_corpus/a.pdf', 'research_corpus/b.md']);

    await updateConversation(projectId, convId, { rag_documents: [] });
    conv = await getConversation(projectId, convId);
    expect(conv.rag_documents).toEqual([]);
  });

  it('deleteConversation removes conversation', async () => {
    const conv = await createConversation(projectId, {
      name: 'To Delete',
      context_scope: { type: 'free' },
      mode: 'chat',
    });
    await deleteConversation(projectId, conv.id);
    await expect(getConversation(projectId, conv.id)).rejects.toThrow();
  });

  it('supports multiple context scopes', async () => {
    const chapterConv = await createConversation(projectId, {
      name: 'Chapter Chat',
      context_scope: { type: 'chapter', file: 'intro.md' },
      mode: 'agent',
    });
    expect(chapterConv.context_scope.type).toBe('chapter');
    expect(chapterConv.context_scope.file).toBe('intro.md');
    expect(chapterConv.mode).toBe('agent');
  });

  it('listConversations returns empty for unknown project', async () => {
    const list = await listConversations('non-existent-project');
    expect(list).toEqual([]);
  });
});
