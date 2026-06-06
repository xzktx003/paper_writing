import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiOrigin = process.env.OPENPRISM_API_ORIGIN || 'http://10.30.0.22:8787';
const frontendPort = Number(process.env.OPENPRISM_FRONTEND_PORT || process.env.VITE_PORT || 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: frontendPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiOrigin,
        changeOrigin: true,
        ws: true,
        xfwd: true
      },
      '/texlive': {
        target: 'https://texlive.swiftlatex.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/texlive/, '')
      }
    }
  }
});
