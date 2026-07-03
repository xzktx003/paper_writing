import http from 'node:http';
import { describe, expect, test } from 'vitest';

process.env.OPENPRISM_PROJECTS_DIR ||= '/tmp/paper-writer-test-projects';

const {
  buildDrawPromptSystem,
  formatDrawApiError,
  formatDrawNetworkError,
  httpRequestWithRetry,
  isRetryableDrawNetworkError,
} = await import('../apps/backend/src/routes/draw.js');
const { loadSkills } = await import('../apps/backend/src/services/skillEngine.js');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

describe('Draw image API network requests', () => {
  test('injects selected Skill instructions into Draw prompt generation', async () => {
    await loadSkills();
    const systemPrompt = buildDrawPromptSystem(['alterlab-scientific-schematics']);

    expect(systemPrompt).toContain('expert at creating detailed image prompts');
    expect(systemPrompt).toContain('[Active Skill -');
    expect(systemPrompt).toContain('alterlab');
    expect(buildDrawPromptSystem([])).not.toContain('[Active Skill -');
  });

  test('retries transient socket resets before returning a response', async () => {
    let requests = 0;
    const server = http.createServer((req, res) => {
      requests += 1;
      if (requests === 1) {
        req.socket.destroy(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });

    const address = await listen(server);
    try {
      const response = await httpRequestWithRetry(`http://127.0.0.1:${address.port}/draw`, {
        retryDelayMs: 1,
        retries: 1,
        timeoutMs: 1000,
      });

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ ok: true });
      expect(response.attempts).toBe(2);
      expect(requests).toBe(2);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('formats pre-TLS disconnects as actionable Draw errors', () => {
    const error = Object.assign(
      new Error('Client network socket disconnected before secure TLS connection was established'),
      { code: 'ECONNRESET' }
    );

    expect(isRetryableDrawNetworkError(error)).toBe(true);
    expect(formatDrawNetworkError(error, 3)).toContain('图片服务 TLS 连接建立前被断开');
    expect(formatDrawNetworkError(error, 3)).toContain('已重试 2 次');
    expect(formatDrawApiError(error)).toContain('图片服务 TLS 连接建立前被断开');
    expect(formatDrawApiError(new Error('invalid api key'))).toBe('invalid api key');
  });
});
