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
import { registerProjectRoutes } from './routes/projects.js';
import { registerCompileRoutes } from './routes/compile.js';
import { registerAIRoutes } from './routes/ai.js';
import { registerAICompletionRoute } from './routes/ai.js';
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
import { registerPipelineV2Routes } from './routes/pipelineV2.js';
import { registerCitationVerificationRoutes } from './routes/citationVerification.js';
import { registerMcpRoutes } from './routes/mcp.js';
import { registerPaperRagRoutes } from './routes/paperRag.js';
import { registerPaperWorkbenchRoutes } from './routes/paperWorkbench.js';
import { registerWorkbenchPrototypeRoutes } from './routes/workbenchPrototype.js';
import { registerDrawRoutes } from './routes/draw.js';
import { registerAgentProviderRoutes } from './routes/agentProviders.js';
import { registerCapabilitiesRoutes } from './routes/capabilities.js';
import { registerCliTaskRoutes } from './routes/cliTasks.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { registerAuthHook } from './middleware/auth.js';
 
const fastify = Fastify({ 
  logger: true,
  bodyLimit: 100 * 1024 * 1024  // 100MB JSON body limit
});
 
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
 
registerAuthHook(fastify);
 
fastify.setErrorHandler((error, request, reply) => {
  const status = error.statusCode || 500;
  if (status >= 500) {
    fastify.log.error(error);
  }
  reply.code(status).send({
    error: error.message || 'Internal Server Error',
    statusCode: status,
    ...(error.code ? { code: error.code } : {}),
    ...(error.details ? { details: error.details } : {}),
  });
});
 
registerHealthRoutes(fastify);
registerProjectRoutes(fastify);
registerCompileRoutes(fastify);
registerAIRoutes(fastify);
registerAICompletionRoute(fastify);
registerSkillRoutes(fastify);
registerChapterRoutes(fastify);
registerPaperProjectRoutes(fastify, {
  enabled: String(process.env.OPENPRISM_ENABLE_LEGACY_PAPER_API || '').toLowerCase() === 'true',
});
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
registerPipelineV2Routes(fastify);
registerCitationVerificationRoutes(fastify);
registerMcpRoutes(fastify);
registerPaperRagRoutes(fastify, { getAppConfig: () => appConfig });
registerPaperWorkbenchRoutes(fastify);
registerWorkbenchPrototypeRoutes(fastify);
registerDrawRoutes(fastify, { appConfig });
registerAgentProviderRoutes(fastify);
registerCapabilitiesRoutes(fastify, { appConfig });
registerCliTaskRoutes(fastify);

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
 
// Models endpoint: fetch available models from configured LLM provider
fastify.get('/api/models', async (request, reply) => {
  try {
    const { agentProviderRegistry } = await import('./services/agentProviderRegistry.js');
    const provider = appConfig.llm_provider || 'openai-compatible';
    if (provider.endsWith('-cli')) {
      return {
        models: [],
        provider,
        capability: { listModels: false },
        message: 'This CLI does not expose a stable model-list API. Enter a model manually or leave it blank for the CLI default.',
      };
    }
    const models = await agentProviderRegistry.listModels(provider);
    return { models, provider, capability: { listModels: true } };
  } catch (err) {
    reply.code(500);
    return { error: `Failed to fetch models: ${err.message}` };
  }
});
 
// Serve frontend static files in production mode
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDist = join(__dirname, '../../frontend/dist');
const publicHost = process.env.OPENPRISM_PUBLIC_HOST || '127.0.0.1';
 
if (existsSync(frontendDist)) {
  const fastifyStatic = await import('@fastify/static');
  await fastify.register(fastifyStatic.default, {
    root: frontendDist,
    prefix: '/',
    wildcard: true,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
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
console.log(`  Paper Writer started at http://${publicHost}:${PORT}`);
console.log('');
 
