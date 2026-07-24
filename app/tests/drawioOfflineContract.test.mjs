import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('Draw.io external editor boundary', () => {
  it('uses a configurable exact origin and never posts messages to a wildcard target', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/DrawioEditor.tsx'), 'utf8');
    const config = await readFile(join(process.cwd(), 'apps/backend/src/config/appConfig.js'), 'utf8');
    expect(config).toContain('OPENPRISM_DRAWIO_EMBED_URL');
    expect(source).toContain('drawio_embed_url');
    expect(source).toContain('event.origin !== allowedOrigin');
    expect(source).toContain('event.source !== iframeRef.current?.contentWindow');
    expect(source).not.toMatch(/postMessage\([\s\S]{0,240}['"]\*['"]\s*\)/);
  });

  it('has timeout, retry, and offline XML source recovery', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/DrawioEditor.tsx'), 'utf8');
    expect(source).toContain('DRAWIO_READY_TIMEOUT_MS');
    expect(source).toContain('setError');
    expect(source).toContain('Retry Draw.io');
    expect(source).toContain('Edit XML source');
    expect(source).toContain('Download XML');
    expect(source).toContain('<textarea');
  });
});
