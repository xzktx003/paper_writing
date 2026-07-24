import http from 'node:http';
import { describe, expect, test } from 'vitest';

process.env.OPENPRISM_PROJECTS_DIR ||= '/tmp/paper-writer-test-projects';

const {
  buildDrawPromptSystem,
  formatDrawApiError,
  formatDrawNetworkError,
  httpRequestWithRetry,
  isRetryableDrawNetworkError,
  requestGeneratedImage,
  resolveDrawImageConfig,
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

  test('can reuse the language-model endpoint and key for image generation', () => {
    expect(resolveDrawImageConfig({
      llm_base_url: 'http://10.40.0.2/v1',
      llm_api_key: 'shared-key',
      draw_image_api_base: 'https://old-image.example/v1',
      draw_image_api_key: 'old-image-key',
      draw_image_model: 'gpt-image-2',
      draw_image_use_llm_credentials: true,
    })).toEqual({
      apiBase: 'http://10.40.0.2/v1',
      apiKey: 'shared-key',
      model: 'gpt-image-2',
      usesLlmCredentials: true,
    });
  });

  test('accepts OpenAI-compatible b64_json image responses', async () => {
    const imageBytes = Buffer.from('fake-png-bytes');
    const server = http.createServer((req, res) => {
      expect(req.url).toBe('/v1/images/generations');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: [{ b64_json: imageBytes.toString('base64') }] }));
    });
    const address = await listen(server);
    try {
      const generated = await requestGeneratedImage({
        apiBase: `http://127.0.0.1:${address.port}/v1`,
        apiKey: 'test-key',
        model: 'gpt-image-2',
        prompt: 'exact user prompt',
      });
      expect(generated.buffer).toEqual(imageBytes);
      expect(generated.sourceUrl).toBeNull();
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
