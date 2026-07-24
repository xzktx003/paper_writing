import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDITOR_ENTRY_BUDGET_BYTES = 500 * 1024;
const JAVASCRIPT_CHUNK_BUDGET_BYTES = 500 * 1024;
const LEGACY_WORKBENCH_PATHS = new Set([
  '/paper-writer-workbench.html',
  '/writing-workbench',
]);

export function isLegacyWorkbenchBuildEnabled(env = process.env) {
  return String(env.OPENPRISM_ENABLE_LEGACY_WORKBENCH || '').trim().toLowerCase() === 'true';
}

export function legacyWorkbenchAccessGuard(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? isLegacyWorkbenchBuildEnabled();
  let outDir = '';

  const installGuard = (server: { middlewares: { use: (handler: any) => void } }) => {
    if (enabled) return;
    server.middlewares.use((request: any, response: any, next: () => void) => {
      const pathname = String(request.url || '').split(/[?#]/, 1)[0];
      if (!LEGACY_WORKBENCH_PATHS.has(pathname)) {
        next();
        return;
      }
      response.statusCode = 404;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end('Legacy workbench is disabled');
    });
  };

  return {
    name: 'legacy-workbench-access-guard',
    configResolved(config: { root: string; build: { outDir: string } }) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer: installGuard,
    configurePreviewServer: installGuard,
    async closeBundle() {
      if (!enabled && outDir) {
        await rm(resolve(outDir, 'paper-writer-workbench.html'), { force: true });
      }
    },
  };
}

function editorEntryBudget() {
  return {
    name: 'editor-entry-budget',
    generateBundle(_options: unknown, bundle: Record<string, any>) {
      const editorEntry = Object.values(bundle).find((item: any) =>
        item.type === 'chunk' && item.facadeModuleId?.endsWith('/src/app/EditorPage.tsx')
      );
      if (!editorEntry) this.error('Unable to locate the EditorPage build chunk for budget verification.');
      const size = Buffer.byteLength(editorEntry.code, 'utf8');
      if (size > EDITOR_ENTRY_BUDGET_BYTES) {
        this.error(`EditorPage initial chunk is ${size} bytes; budget is ${EDITOR_ENTRY_BUDGET_BYTES} bytes. Lazy-load optional editor surfaces instead of raising the budget.`);
      }
    },
  };
}

function javascriptChunkBudget() {
  return {
    name: 'javascript-chunk-budget',
    generateBundle(_options: unknown, bundle: Record<string, any>) {
      for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk') continue;
        const size = Buffer.byteLength(item.code, 'utf8');
        if (size > JAVASCRIPT_CHUNK_BUDGET_BYTES) {
          this.error(`${item.fileName} is ${size} bytes; every JavaScript chunk must stay within ${JAVASCRIPT_CHUNK_BUDGET_BYTES} bytes. Split optional engines or vendor groups instead of raising the budget.`);
        }
      }
    },
  };
}

const backendPort = process.env.OPENPRISM_PORT || process.env.PORT || '8787';
const apiOrigin = process.env.OPENPRISM_API_ORIGIN || `http://127.0.0.1:${backendPort}`;
const frontendPort = Number(process.env.OPENPRISM_FRONTEND_PORT || process.env.VITE_PORT || 5173);
const frontendDir = dirname(fileURLToPath(import.meta.url));
let buildId = String(process.env.OPENPRISM_BUILD_ID || '').trim() || 'development';
try {
  const metadata = JSON.parse(readFileSync(resolve(frontendDir, '../backend/.openprism-build.json'), 'utf8'));
  buildId = String(process.env.OPENPRISM_BUILD_ID || metadata.buildId || buildId);
} catch {
  // Development can run without a production build artifact.
}

export default defineConfig({
  define: {
    __OPENPRISM_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [react(), editorEntryBudget(), javascriptChunkBudget(), legacyWorkbenchAccessGuard()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'codemirror-view-state',
              test: /node_modules[\\/]@codemirror[\\/](?:state|view)[\\/]/,
              priority: 22,
            },
            {
              name: 'codemirror-language',
              test: /node_modules[\\/](?:@codemirror[\\/](?:language|lang-markdown)|@lezer[\\/])[/\\]/,
              priority: 21,
            },
            {
              name: 'codemirror-features',
              test: /node_modules[\\/]@codemirror[\\/](?:autocomplete|commands|search)[\\/]/,
              priority: 20,
            },
            {
              name: 'katex-renderer',
              test: /node_modules[\\/]katex[\\/]/,
              priority: 15,
            },
            {
              name: 'markdown-renderer',
              test: /node_modules[\\/](?:react-markdown|remark-|rehype-|unified|micromark|mdast-|hast-|unist-)/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
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
