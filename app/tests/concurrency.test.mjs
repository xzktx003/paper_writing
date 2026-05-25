import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createConversation,
  getConversation,
  appendMessage,
  updateConversation,
} from '../apps/backend/src/services/conversationStore.js';

describe('Concurrent write protection', () => {
  const originalHome = process.env.HOME;
  let testDir;
  const projectId = 'concurrency-test-project';

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'conv-concurrency-'));
    process.env.HOME = testDir;
  });

  afterAll(async () => {
    process.env.HOME = originalHome;
    await rm(testDir, { recursive: true, force: true });
  });

  it('20 concurrent appendMessage calls lose no writes', async () => {
    const conv = await createConversation(projectId, {
      name: 'Append Stress',
      context_scope: { type: 'free' },
      mode: 'chat',
    });

    const promises = Array.from({ length: 20 }, (_, i) =>
      appendMessage(projectId, conv.id, { role: 'user', content: `msg-${i}` })
    );
    await Promise.all(promises);

    const result = await getConversation(projectId, conv.id);
    expect(result.history).toHaveLength(20);

    // Verify every message is present (order may vary due to concurrency)
    const contents = result.history.map((m) => m.content).sort();
    const expected = Array.from({ length: 20 }, (_, i) => `msg-${i}`).sort();
    expect(contents).toEqual(expected);
  });

  it('10 concurrent updateConversation calls produce valid JSON with one of the names', async () => {
    const conv = await createConversation(projectId, {
      name: 'Original',
      context_scope: { type: 'free' },
      mode: 'chat',
    });

    const names = Array.from({ length: 10 }, (_, i) => `name-${i}`);
    const promises = names.map((name) =>
      updateConversation(projectId, conv.id, { name })
    );
    await Promise.all(promises);

    const result = await getConversation(projectId, conv.id);
    // The final name must be one of the attempted names (not corrupted)
    expect(names).toContain(result.name);
    // Structural integrity checks
    expect(result.id).toBe(conv.id);
    expect(result.history).toEqual([]);
    expect(result.updated_at).toBeTruthy();
  });

  it('concurrent reads during writes do not return corrupted JSON', async () => {
    const conv = await createConversation(projectId, {
      name: 'Read During Write',
      context_scope: { type: 'free' },
      mode: 'chat',
    });

    // Fire interleaved writes and reads concurrently
    const writePromises = Array.from({ length: 10 }, (_, i) =>
      appendMessage(projectId, conv.id, { role: 'user', content: `write-${i}` })
    );
    const readPromises = Array.from({ length: 10 }, () =>
      getConversation(projectId, conv.id)
    );

    const results = await Promise.all([...writePromises, ...readPromises]);

    // All read results (last 10) must be valid conversation objects
    const reads = results.slice(10);
    for (const read of reads) {
      expect(read).toHaveProperty('id', conv.id);
      expect(read).toHaveProperty('history');
      expect(Array.isArray(read.history)).toBe(true);
      // history length should be between 0 and 10 (some writes may have completed)
      expect(read.history.length).toBeGreaterThanOrEqual(0);
      expect(read.history.length).toBeLessThanOrEqual(10);
      // Each message in history must be structurally valid
      for (const msg of read.history) {
        expect(msg).toHaveProperty('role', 'user');
        expect(msg.content).toMatch(/^write-\d+$/);
      }
    }

    // Final state should have all 10 messages
    const final = await getConversation(projectId, conv.id);
    expect(final.history).toHaveLength(10);
  });
});
