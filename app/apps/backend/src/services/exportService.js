import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
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

export async function exportToLatex(projectPath, template) {
  const merged = await mergeChapters(projectPath);
  const mergedPath = join(projectPath, 'output', 'merged.md');
  await writeFile(mergedPath, merged, 'utf-8');

  const outputTex = join(projectPath, 'output', 'paper.tex');
  const args = [mergedPath, '-o', outputTex, '--standalone'];
  if (template) {
    args.push('--template', template);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('pandoc', args, { cwd: projectPath });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve({ texPath: outputTex });
      else reject(new Error(`Pandoc failed: ${stderr}`));
    });
    proc.on('error', reject);
  });
}

export async function exportToPdf(projectPath, engine = 'xelatex') {
  const texPath = join(projectPath, 'output', 'paper.tex');
  const outputDir = join(projectPath, 'output');

  return new Promise((resolve, reject) => {
    const proc = spawn(engine, [
      '-interaction=nonstopmode',
      `-output-directory=${outputDir}`,
      texPath
    ], { cwd: projectPath });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      resolve({ code, stdout, stderr, pdfPath: join(outputDir, 'paper.pdf') });
    });
    proc.on('error', reject);
  });
}
