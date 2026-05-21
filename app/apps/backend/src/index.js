import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { ensureDir } from './utils/fsUtils.js';
import { DATA_DIR, PORT } from './config/constants.js';
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
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const fastify = Fastify({ logger: true });

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

// Serve frontend static files in production mode
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDist = join(__dirname, '../../frontend/dist');

if (existsSync(frontendDist)) {
  const fastifyStatic = await import('@fastify/static');
  await fastify.register(fastifyStatic.default, {
    root: frontendDist,
    prefix: '/',
    wildcard: false,
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

await fastify.listen({ port: PORT, host: '0.0.0.0' });

console.log('');
console.log(`  Paper Writer started at http://localhost:${PORT}`);
console.log('');
