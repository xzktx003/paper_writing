// Set LD_LIBRARY_PATH for Playwright/Chromium before anything else
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __indexDir = dirname(fileURLToPath(import.meta.url));
const playwrightDeps = resolve(__indexDir, '../../../../.playwright-deps/usr/lib/x86_64-linux-gnu');
if (!process.env.LD_LIBRARY_PATH?.includes(playwrightDeps)) {
  process.env.LD_LIBRARY_PATH = `${playwrightDeps}${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`;
}

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { ensureDir } from './utils/fsUtils.js';
import { DATA_DIR, PORT } from './config/constants.js';
import { loadAppConfig, publicAppConfig, saveAppConfig } from './config/appConfig.js';
import { initLLM } from './services/llmService.js';
import { loadSkills, listSkills } from './services/skillEngine.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerArxivRoutes } from './routes/arxiv.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerCompileRoutes } from './routes/compile.js';
import { registerVisionRoutes } from './routes/vision.js';
import { registerPlotRoutes } from './routes/plot.js';
import { registerAIRoutes } from './routes/ai.js';
import { registerSkillRoutes } from './routes/skills.js';
import { registerChapterRoutes } from './routes/chapters.js';
import { registerPaperProjectRoutes } from './routes/paperProjects.js';
import { registerCodeRoutes } from './routes/code.js';
import { registerConversationRoutes } from './routes/conversations.js';
import { registerTerminalRoutes } from './routes/terminal.js';
import { registerExportRoutes } from './routes/export.js';
import { registerWsRoutes } from './routes/ws.js';
import { registerTransferRoutes } from './routes/transfer.js';
import { registerBibtexRoutes } from './routes/bibtex.js';
import { registerSyncTeXRoutes } from './routes/synctex.js';
import { registerReviewRoutes } from './routes/review.js';
import { registerAntiAiRoutes } from './routes/antiAi.js';
import { registerPipelineRoutes } from './routes/pipeline.js';
import { registerPipelineV2Routes } from './routes/pipelineV2.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const fastify = Fastify({ logger: true });

// Load global config and initialize services
const appConfig = await loadAppConfig();
await initLLM(appConfig);
await loadSkills(null);

await fastify.register(cors, { origin: true });
await fastify.register(multipart, {
  limits: {
    fileSize: 200 * 1024 * 1024
  }
});
await fastify.register(websocket);

registerHealthRoutes(fastify);
registerArxivRoutes(fastify);
registerProjectRoutes(fastify);
registerCompileRoutes(fastify);
registerVisionRoutes(fastify);
registerPlotRoutes(fastify);
registerAIRoutes(fastify);
registerSkillRoutes(fastify);
registerChapterRoutes(fastify);
registerPaperProjectRoutes(fastify);
registerCodeRoutes(fastify);
registerConversationRoutes(fastify);
registerTerminalRoutes(fastify);
registerExportRoutes(fastify);
registerWsRoutes(fastify);
registerTransferRoutes(fastify);
registerBibtexRoutes(fastify);
registerSyncTeXRoutes(fastify);
registerReviewRoutes(fastify);
registerAntiAiRoutes(fastify);
registerPipelineRoutes(fastify);
registerPipelineV2Routes(fastify);

// Config endpoints
fastify.get('/api/config', async () => publicAppConfig(appConfig));
fastify.put('/api/config', async (request) => {
  const nextConfig = await saveAppConfig({ ...appConfig, ...request.body });
  Object.assign(appConfig, nextConfig);
  // Re-init LLM provider if any config changed
  if (request.body.claude_api_key || request.body.claude_base_url || request.body.llm_provider || request.body.llm_api_key || request.body.llm_base_url || request.body.llm_model) {
    await initLLM(appConfig);
  }
  return { ok: true };
});

// Serve frontend static files in production mode
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDist = join(__dirname, '../../frontend/dist');

if (existsSync(frontendDist)) {
  const fastifyStatic = await import('@fastify/static');
  await fastify.register(fastifyStatic.default, {
    root: frontendDist,
    prefix: '/',
    wildcard: true,
  });

  fastify.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) {
      reply.code(404).send({ error: 'Not Found' });
    } else {
      reply.sendFile('index.html');
    }
  });
}

await ensureDir(DATA_DIR);

// Clean up file watchers on shutdown
fastify.addHook('onClose', async () => {
  const { unwatchAll } = await import('./services/fileManager.js');
  unwatchAll();
});

await fastify.listen({ port: PORT, host: '0.0.0.0' });

console.log('');
console.log(`  Paper Writer started at http://localhost:${PORT}`);
console.log('');
