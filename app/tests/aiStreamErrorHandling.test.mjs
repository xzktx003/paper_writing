import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendMessageStream } from '../apps/frontend/src/app/api/conversationApi.ts';
import { managedProjectRequest } from '../apps/frontend/src/app/api/projectRequestContext.ts';

class FakeStreamingXhr {
  static responseText = '';
  static status = 200;

  constructor() {
    this.responseText = '';
    this.status = FakeStreamingXhr.status;
    this.statusText = '';
    this.upload = {};
  }

  open() {}
  setRequestHeader() {}

  send() {
    this.responseText = FakeStreamingXhr.responseText;
    this.onprogress?.();
    this.onload?.();
  }
}

describe('AI SSE terminal errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a server-declared SSE error instead of resolving it as a completed answer', async () => {
    FakeStreamingXhr.status = 200;
    FakeStreamingXhr.responseText = [
      'event: token',
      'data: {"text":"partial"}',
      '',
      'event: error',
      'data: {"message":"AI response was interrupted before completion."}',
      '',
      '',
    ].join('\n');
    vi.stubGlobal('XMLHttpRequest', FakeStreamingXhr);
    const onToken = vi.fn();
    const onError = vi.fn();

    await expect(sendMessageStream(
      'project-id',
      'conversation-id',
      managedProjectRequest('project-id'),
      'question',
      {},
      undefined,
      { onToken, onDone: vi.fn(), onError },
    )).rejects.toMatchObject({ name: 'AIStreamResponseError' });

    expect(onToken).toHaveBeenCalledWith('partial');
    expect(onError).toHaveBeenCalledWith('AI response was interrupted before completion.');
  });

  it('rejects an HTTP 200 stream that closes without done or error', async () => {
    FakeStreamingXhr.status = 200;
    FakeStreamingXhr.responseText = [
      'event: token',
      'data: {"text":"partial"}',
      '',
      '',
    ].join('\n');
    vi.stubGlobal('XMLHttpRequest', FakeStreamingXhr);

    await expect(sendMessageStream(
      'project-id',
      'conversation-id',
      managedProjectRequest('project-id'),
      'question',
      {},
      undefined,
      { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
    )).rejects.toThrow('AI response ended unexpectedly');
  });
});
