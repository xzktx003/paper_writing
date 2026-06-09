import { readTextFile, listDir } from './fileManager.js';
import { join } from 'path';
import { existsSync } from 'fs';
 
export async function readProjectContent(resolvedPath, chapterScope) {
  const secDir = join(resolvedPath, 'sec');
  const chapDir = join(resolvedPath, 'chapters');
  const dir = existsSync(secDir) ? secDir : existsSync(chapDir) ? chapDir : resolvedPath;
 
  if (chapterScope) {
    const candidates = [join(secDir, chapterScope), join(chapDir, chapterScope), join(resolvedPath, chapterScope)];
    for (const p of candidates) {
      try { return await readTextFile(p); } catch {}
    }
    return '';
  }
 
  const entries = await listDir(dir);
  const texFiles = entries
    .filter(e => e.type === 'file' && e.name.endsWith('.tex'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const parts = [];
  for (const f of texFiles) {
    try {
      const content = await readTextFile(join(dir, f.name));
      parts.push(`% === ${f.name} ===\n${content}`);
    } catch {}
  }
  return parts.join('\n\n');
}
 
