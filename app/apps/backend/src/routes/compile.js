import {
  runCompile,
  compileFullPaper,
  SUPPORTED_ENGINES,
  getEngineEnv,
  getPandocPdfEngines,
} from '../services/compileService.js';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getProjectRoot } from '../services/projectService.js';
import { safeJoin } from '../utils/pathSecurity.js';
import { ensureDir } from '../utils/fsUtils.js';
import crypto from 'crypto';

const ENGINE_OR_AUTO = [...SUPPORTED_ENGINES, 'auto'];

/**
 * Compile a Markdown file to PDF using pandoc + tectonic.
 */
async function compileMarkdown({ projectId, mainFile = 'main.md' }) {
  const projectRoot = await getProjectRoot(projectId);
  const absMain = safeJoin(projectRoot, mainFile);

  try {
    await fs.access(absMain);
  } catch {
    return { ok: false, error: `File not found: ${mainFile}` };
  }

  // Check pandoc availability
  const env = getEngineEnv();
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('pandoc', ['--version'], { stdio: 'ignore', env });
      proc.on('close', (code) => code === 0 ? resolve() : reject());
      proc.on('error', reject);
    });
  } catch {
    return { ok: false, error: 'pandoc is not installed or is not available on PATH. Install Pandoc or configure OPENPRISM_COMPILE_PATH.' };
  }

  const buildRoot = path.join(projectRoot, '.compile');
  await ensureDir(buildRoot);
  const runId = crypto.randomUUID();
  const outDir = path.join(buildRoot, runId);
  await ensureDir(outDir);
  const outputDir = path.join(buildRoot, 'output');
  await ensureDir(outputDir);

  const base = path.basename(mainFile, path.extname(mainFile));
  const pdfPath = path.join(outDir, `${base}.pdf`);
  const logChunks = [];
  const pushLog = (chunk) => { if (chunk) logChunks.push(chunk.toString()); };

  // Try pandoc with tectonic first, then xelatex, then pdflatex
  const pdfEngines = getPandocPdfEngines();
  let success = false;

  for (const pdfEngine of pdfEngines) {
    try {
      const code = await new Promise((resolve, reject) => {
        const args = [
          absMain,
          '-o', pdfPath,
          pdfEngine,
          '--highlight-style=tango',
          '-V', 'geometry:margin=1in',
        ];
        const proc = spawn('pandoc', args, { cwd: projectRoot, env });
        proc.stdout.on('data', pushLog);
        proc.stderr.on('data', pushLog);
        proc.on('error', reject);
        proc.on('close', (c) => resolve(c));
      });

      try {
        await fs.access(pdfPath);
        success = true;
        break;
      } catch { /* try next engine */ }
    } catch { /* try next engine */ }
  }

  if (!success) {
    return { ok: false, error: 'pandoc failed to generate PDF. Install a supported PDF engine or configure OPENPRISM_TECTONIC_BINARY and OPENPRISM_COMPILE_PATH.', log: logChunks.join('') };
  }

  const buffer = await fs.readFile(pdfPath);
  const pdfBase64 = buffer.toString('base64');
  const persistentPdf = path.join(outputDir, `${base}.pdf`);
  await fs.writeFile(persistentPdf, buffer);
  await fs.rm(outDir, { recursive: true, force: true });

  return {
    ok: true,
    pdf: pdfBase64,
    pdfUrl: `/api/projects/${projectId}/blob?path=.compile/output/${base}.pdf`,
    log: logChunks.join(''),
    engine: 'pandoc',
  };
}

export function registerCompileRoutes(fastify) {
  // Single-file LaTeX or Markdown compile
  fastify.post('/api/compile', async (req) => {
    const { projectId, mainFile = 'main.tex', engine = 'auto', allowPackageInstall } = req.body || {};
    if (!projectId) return { ok: false, error: 'Missing projectId.' };

    if (mainFile.endsWith('.md') || mainFile.endsWith('.markdown')) {
      return compileMarkdown({ projectId, mainFile });
    }
    if (!ENGINE_OR_AUTO.includes(engine)) {
      return { ok: false, error: `Unsupported engine: ${engine}. Supported: ${ENGINE_OR_AUTO.join(', ')}` };
    }
    return runCompile({
      projectId,
      mainFile,
      engine,
      allowPackageInstall: allowPackageInstall === true,
    });
  });

  // Full-paper compile
  fastify.post('/api/compile/full-paper', async (req) => {
    const { projectId, mainFile, engine = 'auto', editorMode = 'latex', allowPackageInstall } = req.body || {};
    if (!projectId) return { ok: false, error: 'Missing projectId.' };
    if (!ENGINE_OR_AUTO.includes(engine)) {
      return { ok: false, error: `Unsupported engine: ${engine}. Supported: ${ENGINE_OR_AUTO.join(', ')}` };
    }
    return compileFullPaper({
      projectId,
      mainFile,
      engine,
      editorMode,
      allowPackageInstall: allowPackageInstall === true,
    });
  });

  // Explicit Markdown compile
  fastify.post('/api/compile/markdown', async (req) => {
    const { projectId, mainFile = 'main.md' } = req.body || {};
    if (!projectId) return { ok: false, error: 'Missing projectId.' };
    return compileMarkdown({ projectId, mainFile });
  });
}
