import { readdir, readFile, writeFile, mkdir, rm, rename } from 'fs/promises';
import { join } from 'path';
import { watch } from 'fs';

const watchers = new Map();

export async function listDir(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries.map(e => ({
    name: e.name,
    type: e.isDirectory() ? 'directory' : 'file',
    path: join(dirPath, e.name),
  }));
}

export async function readTextFile(filePath) {
  return readFile(filePath, 'utf-8');
}

export async function writeTextFile(filePath, content) {
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}

export async function deleteFile(filePath) {
  await rm(filePath, { recursive: true });
}

export async function renameFile(oldPath, newPath) {
  await rename(oldPath, newPath);
}

export function watchDirectory(dirPath, onChange) {
  if (watchers.has(dirPath)) return;
  const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
    if (filename) onChange({ eventType, filename, path: join(dirPath, filename) });
  });
  watchers.set(dirPath, watcher);
  return watcher;
}

export function unwatchDirectory(dirPath) {
  const watcher = watchers.get(dirPath);
  if (watcher) {
    watcher.close();
    watchers.delete(dirPath);
  }
}
