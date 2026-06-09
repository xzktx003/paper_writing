import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { spawn, execSync } from 'child_process';
import YAML from 'yaml';
import { ensureDir } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathSecurity.js';
import { getProjectRoot } from './projectService.js';
 
const SUPPORTED_ENGINES = ['pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic'];
 
// Extra PATH and LD_LIBRARY_PATH entries for user-installed tools
const USER_HOME = process.env.HOME || '/data01/home/xuzk';
const EXTRA_PATHS = [`${USER_HOME}/bin`, '/usr/local/bin'].filter(Boolean).join(':');
const EXTRA_LD_PATH = [
  `${USER_HOME}/anaconda3/lib`,
  '/data01/home/chenzx/anaconda3/lib',
].join(':');
 
function getEngineEnv() {
  return {
    ...process.env,
    PATH: `${EXTRA_PATHS}:${process.env.PATH || ''}`,
    LD_LIBRARY_PATH: EXTRA_LD_PATH,
  };
}
 
// Check which engines are available on the system
function getAvailableEngines() {
  const env = getEngineEnv();
  const available = [];
  for (const engine of SUPPORTED_ENGINES) {
    try {
      execSync(`which ${engine}`, { stdio: 'ignore', env });
      available.push(engine);
    } catch {
      // Engine not found
    }
  }
  return available;
}
 
function buildCommand(engine, outDir, mainFile) {
  switch (engine) {
    case 'pdflatex':
    case 'xelatex':
    case 'lualatex':
      return { cmd: engine, args: ['-interaction=nonstopmode', '-synctex=1', `-output-directory=${outDir}`, mainFile] };
    case 'latexmk':
      return { cmd: 'latexmk', args: ['-pdf', '-interaction=nonstopmode', '-synctex=1', `-outdir=${outDir}`, mainFile] };
    case 'tectonic':
      return { cmd: 'tectonic', args: ['--outdir', outDir, mainFile] };
    default:
      return null;
  }
}
 
export { SUPPORTED_ENGINES };
 
// Engines that need multiple passes + bibtex for citations
const MULTI_PASS_ENGINES = ['pdflatex', 'xelatex', 'lualatex'];
 
const COMPILE_TIMEOUT_MS = 240_000; // 4 minutes per pass
 
function runSpawn(cmd, args, cwd, pushLog, env, timeoutMs = COMPILE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: env || getEngineEnv() });
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', pushLog);
    child.stderr.on('data', pushLog);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) {
        reject(new Error(`Process timed out after ${timeoutMs / 1000}s and was killed`));
      } else {
        resolve(code);
      }
    });
  });
}
 
// ---------------------------------------------------------------------------
// Engine auto-detection (Overleaf-style)
// ---------------------------------------------------------------------------
 
/**
 * Auto-detect the best compilation engine from source content.
 * Mirrors Overleaf's logic: check \documentclass options, \usepackage
 * requirements, CJK content, and fall back to the best available engine.
 */
export async function detectEngine(projectRoot, mainFile) {
  const available = getAvailableEngines();
 
  let source = '';
  try {
    source = await fs.readFile(safeJoin(projectRoot, mainFile), 'utf8');
  } catch {
    // Source not readable → fall back to best available engine
    if (available.includes('pdflatex')) return 'pdflatex';
    if (available.includes('tectonic')) return 'tectonic';
    if (available.includes('xelatex')) return 'xelatex';
    if (available.includes('lualatex')) return 'lualatex';
    if (available.includes('latexmk')) return 'latexmk';
    return 'pdflatex';
  }
 
  // 1. Explicit engine option in \documentclass[class]{...}
  const docClassMatch = source.match(/\\documentclass\s*\[([^\]]*)\]\s*\{[^}]*\}/);
  if (docClassMatch) {
    const opts = docClassMatch[1].toLowerCase();
    if (opts.includes('xelatex') && available.includes('xelatex')) return 'xelatex';
    if (opts.includes('lualatex') && available.includes('lualatex')) return 'lualatex';
    if (opts.includes('pdflatex') && available.includes('pdflatex')) return 'pdflatex';
  }
 
  // 2. Packages that require xelatex/lualatex
  const needsXeLua = /\\usepackage(?:\[[^\]]*(?:fontspec|polyglossia|xeCJK|ctex|luatexja)[^\]]*)\]\{[^}]*\}|\\usepackage\{(?:fontspec|polyglossia|xeCJK|ctex|luatexja)\}/i.test(source);
  if (needsXeLua) {
    if (available.includes('xelatex')) return 'xelatex';
    if (available.includes('lualatex')) return 'lualatex';
  }
 
  // 3. CJK content → prefer xelatex (best CJK support)
  const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(source);
  if (hasCJK) {
    if (available.includes('xelatex')) return 'xelatex';
    if (available.includes('lualatex')) return 'lualatex';
  }
 
  // 4. Check paper.yaml for user preference
  try {
    const yamlContent = await fs.readFile(safeJoin(projectRoot, 'paper.yaml'), 'utf8');
    const config = YAML.parse(yamlContent);
    if (config?.engine && available.includes(config.engine)) {
      return config.engine;
    }
  } catch { /* no paper.yaml */ }
 
  // 5. Fallback: best available engine
  if (available.includes('pdflatex')) return 'pdflatex';
  if (available.includes('tectonic')) return 'tectonic';
  if (available.includes('xelatex')) return 'xelatex';
  if (available.includes('lualatex')) return 'lualatex';
  if (available.includes('latexmk')) return 'latexmk';
  return 'pdflatex';
}
 
// ---------------------------------------------------------------------------
// Core compilation (single-file, Overleaf-style multi-pass)
// ---------------------------------------------------------------------------
 
export async function runCompile({ projectId, mainFile, engine = 'auto', onLog }) {
  const projectRoot = await getProjectRoot(projectId);
 
  // Auto-detect engine if set to 'auto'
  if (engine === 'auto') {
    engine = await detectEngine(projectRoot, mainFile);
    if (onLog) onLog(`Auto-detected engine: ${engine}\n`);
  }
 
  // If the specified mainFile doesn't contain \documentclass, find the real one
  try {
    const content = await fs.readFile(safeJoin(projectRoot, mainFile), 'utf8');
    if (!/\\documentclass/.test(content)) {
      if (onLog) onLog(`\nNote: ${mainFile} has no \\documentclass. Searching for the real main file...\n`);
      const detected = await detectMainFile(projectRoot, 'latex');
      if (detected.ok === false) {
        return detected;
      }
      if (onLog) onLog(`Found main file: ${detected.mainFile}\n`);
      mainFile = detected.mainFile;
    }
  } catch {
    // File doesn't exist — try to detect the real main file
    if (onLog) onLog(`
Note: ${mainFile} not found. Searching for a main file with \documentclass...
`);
    const detected = await detectMainFile(projectRoot, 'latex');
    if (detected.ok === false) {
      return detected;
    }
    if (onLog) onLog(`Found main file: ${detected.mainFile}
`);
    mainFile = detected.mainFile;
  }
 
  if (!SUPPORTED_ENGINES.includes(engine)) {
    return { ok: false, error: `Unsupported engine: ${engine}. Supported: ${SUPPORTED_ENGINES.join(', ')}` };
  }
 
  // Check if the engine is available
  const availableEngines = getAvailableEngines();
  if (!availableEngines.includes(engine)) {
    const installHint = engine === 'tectonic'
      ? '\n\nTectonic is a self-contained LaTeX engine. Install: curl -L https://tectonic.xyz/install.sh | sh'
      : engine === 'pdflatex'
        ? '\n\nInstall TeX Live: sudo apt install texlive-latex-base (Ubuntu/Debian) or brew install texlive (macOS)'
        : '';
    return {
      ok: false,
      error: `${engine} is not installed on this system.\n\nAvailable engines: ${availableEngines.length > 0 ? availableEngines.join(', ') : 'none'}${installHint}`,
      availableEngines,
    };
  }
 
  const absMain = safeJoin(projectRoot, mainFile);
  await fs.access(absMain);
 
  const buildRoot = path.join(projectRoot, '.compile');
  await ensureDir(buildRoot);
  const runId = crypto.randomUUID();
  const outDir = path.join(buildRoot, runId);
  await ensureDir(outDir);
 
  // Persistent output directory (PDF survives across compilations)
  const outputDir = path.join(buildRoot, 'output');
  await ensureDir(outputDir);
 
  const logChunks = [];
  const MAX_LOG_BYTES = 200_000;
  const pushLog = (chunk) => {
    if (!chunk) return;
    const next = chunk.toString();
    const currentSize = logChunks.reduce((sum, item) => sum + item.length, 0);
    if (currentSize >= MAX_LOG_BYTES) return;
    const remaining = MAX_LOG_BYTES - currentSize;
    logChunks.push(next.slice(0, remaining));
    if (onLog) onLog(next);
  };
 
  const { cmd, args } = buildCommand(engine, outDir, mainFile);
  const needsBibPass = MULTI_PASS_ENGINES.includes(engine);
  const base = path.basename(mainFile, path.extname(mainFile));
 
  let code;
  const phases = [];
 
  try {
    // ── Phase 1: First pass (generate .aux with \citation{} entries) ──
    phases.push('latex-pass-1');
    if (onLog) onLog(`\n[Phase 1/4] First LaTeX pass (${engine})...\n`);
    code = await runSpawn(cmd, args, projectRoot, pushLog);
 
    if (needsBibPass) {
      const auxPath = path.join(outDir, `${base}.aux`);
 
      // Detect whether to use biber or bibtex
      let useBiber = false;
      try {
        const auxContent = await fs.readFile(auxPath, 'utf8');
        useBiber = auxContent.includes('\\abx@aux@');
      } catch { /* .aux missing */ }
 
      // Also check the source for \usepackage{biblatex}
      if (!useBiber) {
        try {
          const texContent = await fs.readFile(safeJoin(projectRoot, mainFile), 'utf8');
          useBiber = /\\usepackage(\[.*?\])?\{biblatex\}/.test(texContent);
        } catch { /* ignore */ }
      }
 
      const bibCmd = useBiber ? 'biber' : 'bibtex';
      const bibEnv = {
        ...getEngineEnv(),
        BIBINPUTS: `${projectRoot}:`,
        BSTINPUTS: `${projectRoot}:`,
      };
      const bibArgs = useBiber
        ? [`--input-directory=${projectRoot}`, base]
        : [base];
 
      // ── Phase 2: Bibliography pass ──
      phases.push('bibliography');
      if (onLog) onLog(`\n[Phase 2/4] ${bibCmd} bibliography...\n`);
      try {
        await runSpawn(bibCmd, bibArgs, outDir, pushLog, bibEnv);
      } catch {
        pushLog(Buffer.from(`[warn] ${bibCmd} not available or failed, skipping bibliography pass.\n`));
      }
 
      // ── Phase 3: Second pass (resolve citations) ──
      phases.push('latex-pass-2');
      if (onLog) onLog(`\n[Phase 3/4] Second LaTeX pass (resolve citations)...\n`);
      code = await runSpawn(cmd, args, projectRoot, pushLog);
 
      // ── Phase 4: Third pass (resolve cross-references) ──
      phases.push('latex-pass-3');
      if (onLog) onLog(`\n[Phase 4/4] Third LaTeX pass (resolve cross-references)...\n`);
      code = await runSpawn(cmd, args, projectRoot, pushLog);
    }
  } catch (err) {
    await fs.rm(outDir, { recursive: true, force: true });
    return { ok: false, error: `${engine} not available: ${err.message}` };
  }
 
  // ── Collect outputs ──
  const pdfPath = path.join(outDir, `${base}.pdf`);
  let pdfBase64 = '';
  try {
    const buffer = await fs.readFile(pdfPath);
    pdfBase64 = buffer.toString('base64');
 
    // Persist PDF to stable output path (survives cleanup)
    const persistentPdf = path.join(outputDir, `${base}.pdf`);
    await fs.writeFile(persistentPdf, buffer);
  } catch {
    pdfBase64 = '';
  }
 
  // Read SyncTeX data if available
  let synctex = '';
  try {
    const synctexPath = path.join(outDir, `${base}.synctex.gz`);
    const synctexBuffer = await fs.readFile(synctexPath);
    synctex = synctexBuffer.toString('base64');
    const persistentSynctex = path.join(outputDir, `${base}.synctex.gz`);
    await fs.copyFile(synctexPath, persistentSynctex).catch(() => {});
  } catch {
    // synctex not generated
  }
 
  const log = logChunks.join('');
 
  // Clean up build directory (keep output directory with PDF)
  await fs.rm(outDir, { recursive: true, force: true });
 
  if (!pdfBase64) {
    return { ok: false, error: 'No PDF generated.', log, status: code ?? -1, phases };
  }
  return {
    ok: true,
    pdf: pdfBase64,
    log,
    status: code ?? 0,
    synctex,
    phases,
    pdfUrl: `/api/projects/${projectId}/blob?path=.compile/output/${base}.pdf`,
    engine,
  };
}
 
// ---------------------------------------------------------------------------
// Full-paper compilation (Overleaf-style: detect + merge + multi-pass + PDF)
// ---------------------------------------------------------------------------
 
/**
 * Detect the main entry file for the project.
 * Checks for existing main files, then falls back to paper.yaml chapter order.
 */
async function detectMainFile(projectRoot, editorMode) {
  // 1. Check standard names
  const mainCandidates = ['main.tex', 'paper.tex', 'manuscript.tex'];
  for (const name of mainCandidates) {
    try {
      await fs.access(safeJoin(projectRoot, name));
      return { mainFile: name, generated: false };
    } catch { /* not found */ }
  }
 
  // 2. Scan root-level .tex files for one containing \documentclass
  try {
    const files = await fs.readdir(projectRoot);
    const texFiles = files.filter((f) => f.endsWith('.tex') && !f.startsWith('_'));
    for (const texFile of texFiles) {
      try {
        const content = await fs.readFile(safeJoin(projectRoot, texFile), 'utf8');
        if (/\\documentclass/.test(content)) {
          return { mainFile: texFile, generated: false };
        }
      } catch { /* skip */ }
    }
  } catch { /* can't read directory */ }
 
  // 3. Also check subdirectories like sec/ for files with \documentclass
  try {
    const entries = await fs.readdir(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const subFiles = await fs.readdir(safeJoin(projectRoot, entry.name)).catch(() => []);
      for (const f of subFiles) {
        if (!f.endsWith('.tex')) continue;
        try {
          const content = await fs.readFile(safeJoin(projectRoot, entry.name, f), 'utf8');
          if (/\\documentclass/.test(content)) {
            return { mainFile: `${entry.name}/${f}`, generated: false };
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* can't read subdirectories */ }
 
  let chapters = [];
  try {
    const yamlContent = await fs.readFile(safeJoin(projectRoot, 'paper.yaml'), 'utf8');
    const config = YAML.parse(yamlContent);
    chapters = config.chapters || [];
  } catch { /* no paper.yaml */ }
 
  if (editorMode === 'latex') {
    if (chapters.length > 0) {
      const preamble = [
        '\\documentclass{article}',
        '\\usepackage[utf8]{inputenc}',
        '\\usepackage[T1]{fontenc}',
        '\\usepackage{graphicx}',
        '\\usepackage{hyperref}',
        '\\usepackage{booktabs}',
        '\\usepackage{amsmath,amssymb}',
        '\\usepackage{natbib}',
        '',
      ].join('\n');
 
      const body = chapters
        .filter((ch) => ch.file && ch.file.endsWith('.tex'))
        .map((ch) => `\\input{${ch.file}}`)
        .join('\n\n');
 
      const content = preamble + '\\begin{document}\n\n' + body + '\n\n\\bibliographystyle{plain}\n\\bibliography{references}\n\n\\end{document}\n';
      const mainPath = safeJoin(projectRoot, 'main.tex');
      await fs.writeFile(mainPath, content, 'utf8');
      return { mainFile: 'main.tex', generated: true };
    }
  }
 
  if (editorMode === 'markdown' && chapters.length > 0) {
    const parts = [];
    for (const ch of chapters) {
      if (!ch.file || !ch.file.endsWith('.md')) continue;
      try {
        const content = await fs.readFile(safeJoin(projectRoot, 'chapters', ch.file), 'utf8');
        parts.push(content);
      } catch { /* chapter file missing */ }
    }
 
    if (parts.length > 0) {
      const merged = parts.join('\n\n---\n\n');
      const buildDir = safeJoin(projectRoot, '.compile');
      await ensureDir(buildDir);
      const mergedPath = safeJoin(buildDir, '_merged.md');
      await fs.writeFile(mergedPath, merged, 'utf8');
 
      const texPath = safeJoin(buildDir, '_paper_build.tex');
      try {
        await new Promise((resolve, reject) => {
          const proc = spawn('pandoc', [mergedPath, '-o', texPath, '--standalone'], { cwd: projectRoot });
          let stderr = '';
          proc.stderr?.on('data', (d) => { stderr += d.toString(); });
          proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`pandoc exited with code ${code}: ${stderr}`)));
          proc.on('error', reject);
        });
        return { mainFile: '_paper_build.tex', generated: true };
      } catch (err) {
        return { ok: false, error: `Pandoc conversion failed: ${err.message}` };
      }
    }
  }
 
  return { mainFile: 'main.tex', generated: false };
}
 
/**
 * Compile the full paper with Overleaf-level quality:
 * 1. Auto-detect engine from source content
 * 2. Multi-pass compilation (latex → bibtex/biber → latex → latex)
 * 3. Persist PDF for preview/download
 * 4. Return full compilation log and metadata
 */
export async function compileFullPaper({ projectId, engine, editorMode = 'latex', onLog }) {
  const projectRoot = await getProjectRoot(projectId);
 
  const resolution = await detectMainFile(projectRoot, editorMode);
  if (resolution.ok === false) {
    return resolution;
  }
 
  // Auto-detect engine if not specified
  const detectedEngine = engine || await detectEngine(projectRoot, resolution.mainFile);
 
  if (onLog) {
    onLog(`Engine: ${detectedEngine}\n`);
    onLog(`Main file: ${resolution.mainFile}${resolution.generated ? ' (auto-generated)' : ''}\n`);
    onLog(`Mode: ${editorMode}\n`);
  }
 
  const result = await runCompile({
    projectId,
    mainFile: resolution.mainFile,
    engine: detectedEngine,
    onLog,
  });
 
  return {
    ...result,
    mode: 'full-paper',
    mainFile: resolution.mainFile,
    generatedMain: resolution.generated,
    engine: detectedEngine,
  };
}
 
