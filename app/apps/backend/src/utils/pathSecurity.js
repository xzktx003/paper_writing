import path from 'path';
import { DATA_DIR } from '../config/constants.js';
 
export function safeJoin(base, ...segments) {
  const resolved = path.resolve(base, ...segments);
  const normalizedBase = path.resolve(base);
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw Object.assign(new Error('Path traversal detected'), { statusCode: 400 });
  }
  return resolved;
}
 
export function assertWithinDataDir(projectPath) {
  const resolved = path.resolve(projectPath);
  const normalizedData = path.resolve(DATA_DIR);
  if (!resolved.startsWith(normalizedData + path.sep) && resolved !== normalizedData) {
    throw Object.assign(new Error('Invalid project path'), { statusCode: 400 });
  }
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
 
