import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import { resolveWebDevConfig } from './src/lib/dev-server-config';

function readHttpsConfig(env: Record<string, string | undefined>) {
  if (env.VITE_DEV_HTTPS !== '1') {
    return undefined;
  }

  const certPath = env.VITE_DEV_HTTPS_CERT;
  const keyPath = env.VITE_DEV_HTTPS_KEY;

  if (!certPath || !keyPath) {
    throw new Error(
      'VITE_DEV_HTTPS=1 requires VITE_DEV_HTTPS_CERT and VITE_DEV_HTTPS_KEY',
    );
  }

  return {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
  };
}

// Backend host:port is looked up from .env (WEB_BACKEND_HOST / WEB_BACKEND_PORT)
// so users can redirect API/WebSocket traffic without editing source code.
// See .env.example at repo root.
export default defineConfig(({ mode }) => {
  const env = {
    ...process.env,
    ...loadEnv(mode, resolve(__dirname, '../..'), ''),
  };

  const BACKEND_HOST = env.WEB_BACKEND_HOST?.trim() || 'localhost';
  const BACKEND_PORT = Number(
    env.WEB_BACKEND_PORT ?? env.SERVER_PORT ?? env.PORT ?? 4000,
  );
  const HTTP_BACKEND = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
  const WS_BACKEND = `ws://${BACKEND_HOST}:${BACKEND_PORT}`;

  const WEB_HOST = env.WEB_HOST?.trim() || '0.0.0.0';
  const WEB_PORT = Number(env.WEB_PORT ?? 3000);

  return {
    plugins: [react()],
    server: {
      host: WEB_HOST,
      port: WEB_PORT,
      https: readHttpsConfig(env),
      proxy: {
        '/api': HTTP_BACKEND,
        '/vscode': {
          target: HTTP_BACKEND,
          ws: true,
        },
        '/ws': {
          target: WS_BACKEND,
          ws: true,
        },
      },
    },
  };
});