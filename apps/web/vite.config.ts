import { readFileSync } from 'node:fs';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function readHttpsConfig() {
  if (process.env.VITE_DEV_HTTPS !== '1') {
    return undefined;
  }

  const certPath = process.env.VITE_DEV_HTTPS_CERT;
  const keyPath = process.env.VITE_DEV_HTTPS_KEY;

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
const BACKEND_HOST = process.env.WEB_BACKEND_HOST?.trim() || 'localhost';
const BACKEND_PORT = Number(process.env.WEB_BACKEND_PORT ?? 4000);
const HTTP_BACKEND = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const WS_BACKEND = `ws://${BACKEND_HOST}:${BACKEND_PORT}`;

const WEB_HOST = process.env.WEB_HOST?.trim() || '0.0.0.0';
const WEB_PORT = Number(process.env.WEB_PORT ?? 3000);

export default defineConfig({
  plugins: [react()],
  server: {
    host: WEB_HOST,
    port: WEB_PORT,
    https: readHttpsConfig(),
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
});