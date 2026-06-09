import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolvePortDefaults,
  resolveReadmeUrls,
} from './dev-port-config.mjs';

test('uses repo defaults when env is empty', () => {
  assert.deepEqual(resolvePortDefaults({}), {
    webPort: '3100',
    serverPort: '3200',
  });
});

test('prefers explicit env values for tooling defaults', () => {
  assert.deepEqual(
    resolvePortDefaults({
      WEB_PORT: '6100',
      SERVER_PORT: '6200',
    }),
    {
      webPort: '6100',
      serverPort: '6200',
    },
  );
});

test('builds README URLs from the shared port defaults', () => {
  assert.deepEqual(
    resolveReadmeUrls({
      WEB_PORT: '7100',
      SERVER_PORT: '7200',
    }),
    {
      baseUrl: 'http://localhost:7100',
      apiBaseUrl: 'http://127.0.0.1:7200',
    },
  );
});

test('respects explicit README_BASE_URL and README_API_URL overrides', () => {
  assert.deepEqual(
    resolveReadmeUrls({
      WEB_PORT: '7100',
      SERVER_PORT: '7200',
      README_BASE_URL: 'http://custom.example.com:9000',
      README_API_URL: 'http://api.example.com:9100',
    }),
    {
      baseUrl: 'http://custom.example.com:9000',
      apiBaseUrl: 'http://api.example.com:9100',
    },
  );
});

test('rejects non-numeric WEB_PORT', () => {
  assert.throws(() => resolvePortDefaults({ WEB_PORT: 'abc' }), {
    message: /WEB_PORT.*invalid.*1.*65535/i,
  });
});

test('rejects WEB_PORT below range', () => {
  assert.throws(() => resolvePortDefaults({ WEB_PORT: '0' }), {
    message: /WEB_PORT.*invalid.*1.*65535/i,
  });
  assert.throws(() => resolvePortDefaults({ WEB_PORT: '-1' }), {
    message: /WEB_PORT.*invalid.*1.*65535/i,
  });
});

test('rejects WEB_PORT above range', () => {
  assert.throws(() => resolvePortDefaults({ WEB_PORT: '65536' }), {
    message: /WEB_PORT.*invalid.*1.*65535/i,
  });
});

test('rejects non-numeric SERVER_PORT', () => {
  assert.throws(() => resolvePortDefaults({ SERVER_PORT: 'xyz' }), {
    message: /SERVER_PORT.*invalid.*1.*65535/i,
  });
});

test('rejects SERVER_PORT below range', () => {
  assert.throws(() => resolvePortDefaults({ SERVER_PORT: '0' }), {
    message: /SERVER_PORT.*invalid.*1.*65535/i,
  });
  assert.throws(() => resolvePortDefaults({ SERVER_PORT: '-1' }), {
    message: /SERVER_PORT.*invalid.*1.*65535/i,
  });
});

test('rejects SERVER_PORT above range', () => {
  assert.throws(() => resolvePortDefaults({ SERVER_PORT: '65536' }), {
    message: /SERVER_PORT.*invalid.*1.*65535/i,
  });
});
