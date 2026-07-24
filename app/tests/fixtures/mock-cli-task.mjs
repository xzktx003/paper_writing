import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const prompt = String(process.argv[2] || '');
if (prompt.includes('E2E_WAIT_FOR_CANCEL')) {
  await new Promise((resolve) => setTimeout(resolve, 30_000));
} else {
  const original = await readFile('paper.md', 'utf8');
  await writeFile('paper.md', original.replace('Original paper text.', 'Revised by the isolated CLI Task Agent.'));
  await mkdir('agent-output', { recursive: true });
  await writeFile(path.join('agent-output', 'evidence.md'), 'Reviewed evidence from the isolated snapshot.\n');
  await unlink('remove.txt').catch((error) => { if (error.code !== 'ENOENT') throw error; });
}

process.stdout.write(`${JSON.stringify({ type: 'result', result: 'Mock CLI task complete' })}\n`);
