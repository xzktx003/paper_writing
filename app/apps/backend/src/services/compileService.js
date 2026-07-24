import crypto from 'crypto';
import path from 'path';
import { promises as fs, realpathSync, existsSync } from 'fs';
import { spawn, execSync } from 'child_process';
import YAML from 'yaml';
import { ensureDir } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathSecurity.js';
import { getProjectRoot } from './projectService.js';
import {
  getCompileEnv as buildCompileEnv,
  getPandocPdfEngines,
  getTectonicBinary,
} from './compileEnvironment.js';
 
const SUPPORTED_ENGINES = ['pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic'];
 
export function getEngineEnv(baseEnv = process.env) {
  return buildCompileEnv(baseEnv);
}

export { getPandocPdfEngines, getTectonicBinary };
 
// Check which engines are available on the system
function getAvailableEngines() {
  const env = getEngineEnv();
  const available = [];
  for (const engine of SUPPORTED_ENGINES) {
    try {
      if (engine === 'tectonic') {
        const configuredBinary = getTectonicBinary(env);
        if (configuredBinary !== 'tectonic' && (path.isAbsolute(configuredBinary) || configuredBinary.includes(path.sep))) {
          if (!existsSync(configuredBinary)) throw new Error('Configured Tectonic binary was not found.');
        } else {
          const commandName = configuredBinary === 'tectonic' ? engine : configuredBinary;
          if (!/^[a-zA-Z0-9_.+-]+$/.test(commandName)) throw new Error('Configured Tectonic command name is invalid.');
          execSync(`which ${commandName}`, { stdio: 'ignore', env });
        }
      } else {
        execSync(`which ${engine}`, { stdio: 'ignore', env });
      }
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
      return { cmd: getTectonicBinary(), args: ['--synctex', '--outdir', outDir, mainFile] };
    default:
      return null;
  }
}
 
export { SUPPORTED_ENGINES };
 
// Engines that need multiple passes + bibtex for citations
const MULTI_PASS_ENGINES = ['pdflatex', 'xelatex', 'lualatex'];
 
const COMPILE_TIMEOUT_MS = 240_000; // 4 minutes per pass
const MAX_AUTO_INSTALL_ATTEMPTS = 5;

export function shouldAutoInstallTexDependency(allowPackageInstall = false) {
  return allowPackageInstall === true;
}

export function extractMissingTexFile(log = '') {
  const patterns = [
    /! LaTeX Error: File [`']([^`']+\.(?:sty|cls|def|bst))[`'] not found\./i,
    /I can't find file [`']([^`']+\.(?:sty|cls|def|bst))[`']/i,
  ];
  for (const pattern of patterns) {
    const match = String(log).match(pattern);
    if (!match) continue;
    const filename = path.basename(match[1]);
    if (/^[a-zA-Z0-9_.+-]+\.(?:sty|cls|def|bst)$/i.test(filename)) return filename;
  }
  return null;
}

export function parseCompileDiagnostics(log = '', { pdfGenerated = false, exitCode = 0 } = {}) {
  const text = String(log || '');
  const warnings = [];
  const errors = [];
  const seenWarnings = new Set();
  const seenErrors = new Set();
  const pushUnique = (target, seen, diagnostic) => {
    const key = `${diagnostic.code}:${diagnostic.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    target.push(diagnostic);
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/stopping at 6 passes/i.test(line)) {
      pushUnique(warnings, seenWarnings, {
        code: 'TECTONIC_MAX_PASSES',
        message: 'Tectonic stopped after six reruns; the generated PDF may contain unresolved references.',
        line,
      });
      continue;
    }
    if (/^!\s*(?:LaTeX|Package) Error:/i.test(line) || /(?:fatal error|emergency stop)/i.test(line)) {
      pushUnique(errors, seenErrors, { code: 'LATEX_ERROR', message: line, line });
      continue;
    }
    if (/\bwarning:/i.test(line) || /LaTeX Warning:/i.test(line) || /undefined references?/i.test(line)) {
      pushUnique(warnings, seenWarnings, { code: 'LATEX_WARNING', message: line, line });
    }
  }

  if (!pdfGenerated) {
    pushUnique(errors, seenErrors, {
      code: 'NO_PDF',
      message: 'Compilation did not produce a PDF.',
    });
  } else if (Number(exitCode) !== 0) {
    pushUnique(warnings, seenWarnings, {
      code: 'NONZERO_EXIT_WITH_PDF',
      message: `The compiler exited with code ${exitCode}, but a PDF was generated.`,
    });
  }

  return {
    status: errors.length > 0 ? 'failed' : warnings.length > 0 ? 'warning' : 'success',
    errors,
    warnings,
  };
}

function compileFailure(error, extras = {}) {
  const message = String(error || 'Compilation failed.');
  return {
    ok: false,
    error: message,
    status: 'failed',
    errors: [{ code: extras.code || 'COMPILE_FAILED', message }],
    warnings: [],
    ...extras,
  };
}

function findTinyTexTlmgr(engine) {
  const lookupEngine = engine === 'latexmk' || engine === 'tectonic' ? 'pdflatex' : engine;
  try {
    const executable = execSync(`which ${lookupEngine}`, { env: getEngineEnv(), encoding: 'utf8' }).trim();
    const resolved = realpathSync(executable);
    const candidate = path.join(path.dirname(resolved), 'tlmgr');
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

async function captureCommand(cmd, args, cwd, env, timeoutMs = COMPILE_TIMEOUT_MS) {
  let output = '';
  const code = await runSpawn(cmd, args, cwd, chunk => { output += chunk.toString(); }, env, timeoutMs);
  return { code, output };
}

async function installTexDependency({ filename, engine, cwd, env, pushLog }) {
  const tlmgr = findTinyTexTlmgr(engine);
  if (!tlmgr) return { ok: false, error: 'TinyTeX tlmgr was not found.' };

  pushLog(`\n[Auto package install] Looking up ${filename}...\n`);
  const search = await captureCommand(tlmgr, ['search', '--global', '--file', `/${filename}`], cwd, env);
  const packageMatch = search.output.match(/^([a-zA-Z0-9_.+-]+):\s*$/m);
  if (search.code !== 0 || !packageMatch) {
    return { ok: false, error: `No TeX Live package provides ${filename}.` };
  }

  const packageName = packageMatch[1];
  pushLog(`[Auto package install] Installing TeX Live package: ${packageName}\n`);
  const install = await captureCommand(tlmgr, ['install', packageName], cwd, env, 600_000);
  pushLog(install.output);
  return install.code === 0
    ? { ok: true, packageName }
    : { ok: false, error: `tlmgr failed to install ${packageName}.` };
}
 
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
 
export async function runCompile({
  projectId,
  mainFile,
  engine = 'auto',
  onLog,
  allowPackageInstall = false,
  _autoInstallAttempt = 0,
  _autoInstalledPackages = [],
}) {
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
    return compileFailure(
      `Unsupported engine: ${engine}. Supported: ${SUPPORTED_ENGINES.join(', ')}`,
      { code: 'UNSUPPORTED_ENGINE' },
    );
  }
 
  // Check if the engine is available
  const availableEngines = getAvailableEngines();
  if (!availableEngines.includes(engine)) {
    const installHint = engine === 'tectonic'
      ? '\n\nTectonic is a self-contained LaTeX engine. Install: curl -L https://tectonic.xyz/install.sh | sh'
      : engine === 'pdflatex'
        ? '\n\nInstall TeX Live: sudo apt install texlive-latex-base (Ubuntu/Debian) or brew install texlive (macOS)'
        : '';
    return compileFailure(
      `${engine} is not installed on this system.\n\nAvailable engines: ${availableEngines.length > 0 ? availableEngines.join(', ') : 'none'}${installHint}`,
      { code: 'ENGINE_NOT_INSTALLED', availableEngines },
    );
  }
 
  const absMain = safeJoin(projectRoot, mainFile);
  await fs.access(absMain);
  const mainDir = path.dirname(absMain);
  const buildRoot = path.join(projectRoot, '.compile');
  await ensureDir(buildRoot);
  // Tectonic follows the XDG base-directory contract for downloaded bundles.
  // Keep that cache stable per managed project while retaining an isolated
  // run output directory, so repeated compiles reuse dependencies without
  // treating an old PDF as a new successful result.
  const tectonicCacheDir = path.join(buildRoot, 'tectonic-cache');
  if (engine === 'tectonic') await ensureDir(tectonicCacheDir);
  // TeX resolves local packages relative to the process cwd, not necessarily
  // relative to a nested entry file. Keep the project root as cwd so legacy
  // \input{folder/file} paths continue to work, while adding the entry-file
  // directory recursively for sibling .sty/.bst/.bib, figures and inputs.
  const texSearchPath = `${mainDir}//:${projectRoot}//:`;
  const compileEnv = {
    ...getEngineEnv(),
    TEXINPUTS: `${texSearchPath}${process.env.TEXINPUTS || ''}`,
    BIBINPUTS: `${texSearchPath}${process.env.BIBINPUTS || ''}`,
    BSTINPUTS: `${texSearchPath}${process.env.BSTINPUTS || ''}`,
    ...(engine === 'tectonic' ? { XDG_CACHE_HOME: tectonicCacheDir } : {}),
  };
 
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
    code = await runSpawn(cmd, args, projectRoot, pushLog, compileEnv);
 
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
      const bibEnv = compileEnv;
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
      code = await runSpawn(cmd, args, projectRoot, pushLog, compileEnv);
 
      // ── Phase 4: Third pass (resolve cross-references) ──
      phases.push('latex-pass-3');
      if (onLog) onLog(`\n[Phase 4/4] Third LaTeX pass (resolve cross-references)...\n`);
      code = await runSpawn(cmd, args, projectRoot, pushLog, compileEnv);
    }
  } catch (err) {
    await fs.rm(outDir, { recursive: true, force: true });
    return compileFailure(`${engine} not available: ${err.message}`, { code: 'ENGINE_EXECUTION_FAILED' });
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
    const missingFile = extractMissingTexFile(log);
    if (
      shouldAutoInstallTexDependency(allowPackageInstall)
      && missingFile
      && _autoInstallAttempt < MAX_AUTO_INSTALL_ATTEMPTS
    ) {
      try {
        const installed = await installTexDependency({
          filename: missingFile,
          engine,
          cwd: projectRoot,
          env: compileEnv,
          pushLog,
        });
        if (installed.ok) {
          const installedPackages = [..._autoInstalledPackages, installed.packageName];
          if (onLog) onLog(`[Auto package install] Retrying compilation (${_autoInstallAttempt + 1}/${MAX_AUTO_INSTALL_ATTEMPTS})...\n`);
          const retried = await runCompile({
            projectId,
            mainFile,
            engine,
            onLog,
            allowPackageInstall,
            _autoInstallAttempt: _autoInstallAttempt + 1,
            _autoInstalledPackages: installedPackages,
          });
          return { ...retried, autoInstalledPackages: installedPackages };
        }
        pushLog(`[Auto package install] ${installed.error}\n`);
      } catch (error) {
        pushLog(`[Auto package install] Failed: ${error.message}\n`);
      }
    }
    const diagnostics = parseCompileDiagnostics(log, { pdfGenerated: false, exitCode: code ?? -1 });
    return {
      ok: false,
      error: 'No PDF generated.',
      log,
      ...diagnostics,
      exitCode: code ?? -1,
      phases,
    };
  }
  const diagnostics = parseCompileDiagnostics(log, { pdfGenerated: true, exitCode: code ?? 0 });
  return {
    ok: true,
    pdf: pdfBase64,
    log,
    ...diagnostics,
    exitCode: code ?? 0,
    synctex,
    phases,
    pdfUrl: `/api/projects/${projectId}/blob?path=.compile/output/${base}.pdf`,
    engine,
    autoInstalledPackages: _autoInstalledPackages,
  };
}
 
// ---------------------------------------------------------------------------
// Full-paper compilation (Overleaf-style: detect + merge + multi-pass + PDF)
// ---------------------------------------------------------------------------
 
/**
 * Detect the main entry file for the project.
 * Checks for existing main files, then falls back to paper.yaml chapter order.
 */
export async function findExistingMainTexFile(projectRoot) {
  // 1. Check standard names
  const mainCandidates = ['main.tex', 'paper.tex', 'manuscript.tex'];
  for (const name of mainCandidates) {
    try {
      await fs.access(safeJoin(projectRoot, name));
      return name;
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
          return texFile;
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
            return `${entry.name}/${f}`;
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* can't read subdirectories */ }

  return null;
}

async function detectMainFile(projectRoot, editorMode) {
  const existingMainFile = await findExistingMainTexFile(projectRoot);
  if (existingMainFile) return { mainFile: existingMainFile, generated: false };
 
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
export async function compileFullPaper({
  projectId,
  mainFile,
  engine,
  editorMode = 'latex',
  onLog,
  allowPackageInstall = false,
}) {
  const projectRoot = await getProjectRoot(projectId);

  let resolution;
  if (mainFile) {
    try {
      const content = await fs.readFile(safeJoin(projectRoot, mainFile), 'utf8');
      if (editorMode === 'latex' && !/\\documentclass/.test(content)) {
        return { ok: false, error: `Selected main file has no \\documentclass: ${mainFile}` };
      }
      resolution = { mainFile, generated: false };
    } catch {
      return { ok: false, error: `Selected main file not found: ${mainFile}` };
    }
  } else {
    resolution = await detectMainFile(projectRoot, editorMode);
  }
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
    allowPackageInstall,
  });
 
  return {
    ...result,
    mode: 'full-paper',
    mainFile: resolution.mainFile,
    generatedMain: resolution.generated,
    engine: detectedEngine,
  };
}
 
