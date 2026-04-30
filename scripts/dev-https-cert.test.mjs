import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  ensureHttpsCertificate,
  resolveHttpsCertStrategy,
} from './dev-https-cert.mjs';

test('prefers mkcert for embedded VS Code friendly HTTPS when available', () => {
  assert.deepEqual(
    resolveHttpsCertStrategy({
      httpsEnabled: true,
      mkcertAvailable: true,
    }),
    {
      generator: 'mkcert',
      warning: null,
    },
  );
});

test('falls back to openssl and warns about VS Code preview limitations when mkcert is unavailable', () => {
  const result = resolveHttpsCertStrategy({
    httpsEnabled: true,
    mkcertAvailable: false,
  });

  assert.equal(result.generator, 'openssl');
  assert.match(result.warning ?? '', /VS Code Web/i);
  assert.match(result.warning ?? '', /webview|preview|PNG/i);
});

test('does not request any certificate work when HTTPS is disabled', () => {
  assert.deepEqual(
    resolveHttpsCertStrategy({
      httpsEnabled: false,
      mkcertAvailable: true,
    }),
    {
      generator: 'none',
      warning: null,
    },
  );
});

test('reused OpenSSL fallback certs still warn that VS Code webviews may fail', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'coding-kanban-dev-cert-'));
  const certPath = join(tempDir, 'dev-cert.pem');
  const keyPath = join(tempDir, 'dev-key.pem');
  const san = 'DNS:localhost,DNS:gpu22';

  try {
    const first = ensureHttpsCertificate({
      certPath,
      httpsEnabled: true,
      keyPath,
      mkcertAvailable: false,
      opensslAvailable: true,
      san,
    });
    assert.equal(first.generator, 'openssl');

    const second = ensureHttpsCertificate({
      certPath,
      httpsEnabled: true,
      keyPath,
      mkcertAvailable: false,
      opensslAvailable: true,
      san,
    });

    assert.equal(second.generator, 'existing');
    assert.match(second.warning ?? '', /VS Code Web/i);
    assert.match(second.warning ?? '', /webview|preview|PNG/i);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test('existing cert SAN matching recognizes IP entries emitted by openssl', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'coding-kanban-dev-cert-'));
  const certPath = join(tempDir, 'dev-cert.pem');
  const keyPath = join(tempDir, 'dev-key.pem');
  const san = 'DNS:localhost,IP:127.0.0.1,IP:10.30.0.22';

  try {
    const first = ensureHttpsCertificate({
      certPath,
      httpsEnabled: true,
      keyPath,
      mkcertAvailable: false,
      opensslAvailable: true,
      san,
    });
    assert.equal(first.generator, 'openssl');

    const second = ensureHttpsCertificate({
      certPath,
      httpsEnabled: true,
      keyPath,
      mkcertAvailable: false,
      opensslAvailable: true,
      san,
    });

    assert.equal(second.generator, 'existing');
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});
