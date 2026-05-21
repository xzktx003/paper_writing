import { mergeChapters, exportToLatex, exportToPdf } from '../services/exportService.js';

export function registerExportRoutes(fastify) {
  fastify.post('/api/export/merge', async (request) => {
    const { projectPath } = request.body;
    const merged = await mergeChapters(projectPath);
    return { content: merged };
  });

  fastify.post('/api/export/latex', async (request) => {
    const { projectPath, template } = request.body;
    const result = await exportToLatex(projectPath, template);
    return result;
  });

  fastify.post('/api/export/pdf', async (request) => {
    const { projectPath, engine } = request.body;
    await exportToLatex(projectPath);
    const result = await exportToPdf(projectPath, engine);
    return result;
  });
}
