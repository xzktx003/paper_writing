import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { spawn } from 'child_process';
import YAML from 'yaml';
 
export async function mergeChapters(projectPath) {
  const configContent = await readFile(join(projectPath, 'paper.yaml'), 'utf-8');
  const config = YAML.parse(configContent);
  const parts = [];
 
  for (const chapter of config.chapters || []) {
    const content = await readFile(join(projectPath, 'chapters', chapter.file), 'utf-8');
    parts.push(content);
  }
 
  return parts.join('\n\n---\n\n');
}
 
function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, opts);
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr}`));
    });
    proc.on('error', reject);
  });
}
 
async function ensureOutputDir(projectPath) {
  const outputDir = join(projectPath, 'output');
  await mkdir(outputDir, { recursive: true });
  return outputDir;
}
 
export async function markdownToLatex(projectPath, inputFile) {
  const outputDir = await ensureOutputDir(projectPath);
  let srcPath;
 
  if (inputFile) {
    srcPath = join(projectPath, inputFile);
  } else {
    const merged = await mergeChapters(projectPath);
    srcPath = join(outputDir, 'merged.md');
    await writeFile(srcPath, merged, 'utf-8');
  }
 
  const outputTex = join(outputDir, 'paper.tex');
  await runCommand('pandoc', [srcPath, '-o', outputTex, '--standalone'], { cwd: projectPath });
  return { texPath: outputTex, relativePath: 'output/paper.tex' };
}
 
export const exportToLatex = markdownToLatex;
 
export async function latexToMarkdown(projectPath, inputFile) {
  const outputDir = await ensureOutputDir(projectPath);
  const srcPath = inputFile ? join(projectPath, inputFile) : join(outputDir, 'paper.tex');
  const outputMd = join(outputDir, 'paper.md');
 
  await runCommand('pandoc', [srcPath, '-o', outputMd, '--wrap=none'], { cwd: projectPath });
  return { mdPath: outputMd, relativePath: 'output/paper.md' };
}
 
export async function latexToPdf(projectPath, inputFile, engine = 'xelatex') {
  const outputDir = await ensureOutputDir(projectPath);
  const srcPath = inputFile ? join(projectPath, inputFile) : join(outputDir, 'paper.tex');
 
  await runCommand(engine, [
    '-interaction=nonstopmode',
    `-output-directory=${outputDir}`,
    srcPath
  ], { cwd: projectPath });
 
  const baseName = inputFile ? inputFile.replace(/\.tex$/, '.pdf').split('/').pop() : 'paper.pdf';
  return { pdfPath: join(outputDir, baseName), relativePath: `output/${baseName}` };
}
 
export async function markdownToPdf(projectPath, inputFile, engine = 'xelatex') {
  const { texPath } = await markdownToLatex(projectPath, inputFile);
  const result = await latexToPdf(projectPath, 'output/paper.tex', engine);
  return result;
}
 
