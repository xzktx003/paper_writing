import { runCompile, compileFullPaper, SUPPORTED_ENGINES } from '../services/compileService.js';
 
const ENGINE_OR_AUTO = [...SUPPORTED_ENGINES, 'auto'];
 
export function registerCompileRoutes(fastify) {
  // Single-file compile
  fastify.post('/api/compile', async (req) => {
    const { projectId, mainFile = 'main.tex', engine = 'auto' } = req.body || {};
    if (!projectId) {
      return { ok: false, error: 'Missing projectId.' };
    }
    if (!ENGINE_OR_AUTO.includes(engine)) {
      return { ok: false, error: `Unsupported engine: ${engine}. Supported: ${ENGINE_OR_AUTO.join(', ')}` };
    }
    return runCompile({ projectId, mainFile, engine });
  });
 
  // Full-paper compile (all chapters merged)
  fastify.post('/api/compile/full-paper', async (req) => {
    const { projectId, engine = 'auto', editorMode = 'latex' } = req.body || {};
    if (!projectId) {
      return { ok: false, error: 'Missing projectId.' };
    }
    if (!ENGINE_OR_AUTO.includes(engine)) {
      return { ok: false, error: `Unsupported engine: ${engine}. Supported: ${ENGINE_OR_AUTO.join(', ')}` };
    }
    return compileFullPaper({ projectId, engine, editorMode });
  });
}
 
