import path from 'path';
import { lstatSync } from 'node:fs';
import { DATA_DIR } from '../config/constants.js';

function rejectSymbolicLinkComponents(base, resolved) {
  const relative = path.relative(base, resolved);
  const components = relative ? relative.split(path.sep).filter(Boolean) : [];
  let current = base;
  for (const component of ['', ...components]) {
    if (component) current = path.join(current, component);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw Object.assign(new Error('Symbolic links are not allowed in managed project paths'), {
          statusCode: 400,
          code: 'PATH_SYMLINK_NOT_ALLOWED',
        });
      }
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
}
 
export function safeJoin(base, ...segments) {
  const resolved = path.resolve(base, ...segments);
  const normalizedBase = path.resolve(base);
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw Object.assign(new Error('Path traversal detected'), { statusCode: 400 });
  }
  rejectSymbolicLinkComponents(normalizedBase, resolved);
  return resolved;
}
 
export function assertWithinDataDir(projectPath, { dataDir = DATA_DIR } = {}) {
  const resolved = path.resolve(projectPath);
  const normalizedData = path.resolve(dataDir);
  if (!resolved.startsWith(normalizedData + path.sep) && resolved !== normalizedData) {
    throw Object.assign(new Error('Invalid project path'), { statusCode: 400 });
  }
  rejectSymbolicLinkComponents(normalizedData, resolved);
  return resolved;
}
 
const BLOCKED_PATTERNS = [
  /;\s*/,
  /\|\s*/,
  /&&/,
  /\|\|/,
  /`/,
  /\$\(/,
  />\s*/,
  /<\s*/,
  /\bsudo\b/,
  /\brm\s+-rf\b/,
  /\bdd\b/,
  /\bmkfs\b/,
  /\bcurl\b.*\|\s*bash/,
  /\bwget\b.*\|\s*bash/,
];
 
export function validateCommand(command) {
  if (!command || typeof command !== 'string') {
    throw Object.assign(new Error('Command is required'), { statusCode: 400 });
  }
  if (command.length > 2000) {
    throw Object.assign(new Error('Command too long'), { statusCode: 400 });
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      throw Object.assign(new Error(`Blocked shell pattern detected: ${pattern}`), { statusCode: 400 });
    }
  }
  return command;
}
 
export function sanitizeUploadPath(filename) {
  if (!filename) return '';
  const normalized = filename.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter((part) => part && part !== '.' && part !== '..');
  return parts.join('/');
}
 
