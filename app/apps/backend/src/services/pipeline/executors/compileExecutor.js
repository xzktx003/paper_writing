import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { STAGE_STATUS } from '../stageTypes.js';
 
const DEFAULT_TIMEOUT = 120_000;
 
const ENGINE_COMMANDS = {
  pdflatex: (mainFile, outDir) => ['pdflatex', ['-interaction=nonstopmode', `-output-directory=${outDir}`, mainFile]],
  xelatex: (mainFile, outDir) => ['xelatex', ['-interaction=nonstopmode', `-output-directory=${outDir}`, mainFile]],
  lualatex: (mainFile, outDir) => ['lualatex', ['-interaction=nonstopmode', `-output-directory=${outDir}`, mainFile]],
  latexmk: (mainFile, outDir) => ['latexmk', ['-pdf', `-outdir=${outDir}`, '-interaction=nonstopmode', mainFile]],
};
 
export async function executeCompileStage(stage, context, signal) {
  const { config } = stage;
  const { projectPath } = context;
  const engine = config.engine || 'pdflatex';
  const mainFile = config.mainFile || 'main.tex';
  const outputDir = config.outputDir || 'output';
  const timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT;
 
  const cmdFactory = ENGINE_COMMANDS[engine];
  if (!cmdFactory) {
    return { status: STAGE_STATUS.FAILED, output: null, error: `Unsupported engine: ${engine}` };
  }
 
  const outPath = join(projectPath, outputDir);
  await mkdir(outPath, { recursive: true });
 
  const [cmd, args] = cmdFactory(mainFile, outPath);
 
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
 
    const child = spawn(cmd, args, { cwd: projectPath });
 
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);
 
    if (signal) {
      signal.addEventListener('abort', () => {
        killed = true;
        child.kill('SIGKILL');
        clearTimeout(timer);
      }, { once: true });
    }
 
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
 
    child.on('error', err => {
      clearTimeout(timer);
      resolve({
        status: STAGE_STATUS.FAILED,
        output: stderr || stdout,
        error: `Compile error: ${err.message}`,
        metadata: { engine },
      });
    });
 
    child.on('close', code => {
      clearTimeout(timer);
      if (killed) {
        resolve({
          status: STAGE_STATUS.FAILED,
          output: stdout,
          error: `Compilation timed out after ${timeoutMs / 1000}s`,
          metadata: { engine, timedOut: true },
        });
      } else if (code !== 0) {
        const logTail = stdout.split('\n').slice(-30).join('\n');
        resolve({
          status: STAGE_STATUS.FAILED,
          output: logTail,
          error: `Compilation failed with exit code ${code}`,
          metadata: { engine, exitCode: code },
        });
      } else {
        const pdfPath = join(outPath, mainFile.replace(/\.tex$/, '.pdf'));
        resolve({
          status: STAGE_STATUS.COMPLETED,
          output: existsSync(pdfPath) ? pdfPath : `Compiled successfully (output in ${outPath})`,
          metadata: { engine, exitCode: 0, outputDir: outPath },
        });
      }
    });
  });
}
 
