import { readFile, writeFile, mkdir, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
 
const STORE_BASE = join(process.env.HOME, '.paper-writer', 'conversations');
const MAX_HISTORY_LENGTH = 100;
 
// Per-file lock queue to prevent concurrent read-modify-write races
const locks = new Map();
 
function acquireLock(key) {
  if (!locks.has(key)) {
    locks.set(key, Promise.resolve());
  }
  let release;
  const next = new Promise((resolve) => { release = resolve; });
  const prev = locks.get(key);
  locks.set(key, next);
  return prev.then(() => release);
}
 
function getProjectDir(projectId) {
  return join(STORE_BASE, projectId);
}
 
function getConvPath(projectId, convId) {
  return join(getProjectDir(projectId), `${convId}.json`);
}
 
export async function createConversation(projectId, { name, context_scope, active_skills, mode, model }) {
  const id = randomUUID().slice(0, 8);
  const conv = {
    id,
    name: name || `Conversation ${id}`,
    context_scope: context_scope || { type: 'free' },
    active_skills: active_skills || [],
    mode: mode || 'chat',
    model: model || null,
    history: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const dir = getProjectDir(projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(getConvPath(projectId, id), JSON.stringify(conv, null, 2), 'utf-8');
  return conv;
}
 
export async function getConversation(projectId, convId) {
  const content = await readFile(getConvPath(projectId, convId), 'utf-8');
  return JSON.parse(content);
}
 
export async function updateConversation(projectId, convId, updates) {
  const filePath = getConvPath(projectId, convId);
  const release = await acquireLock(filePath);
  try {
    const conv = await getConversation(projectId, convId);
    Object.assign(conv, updates, { updated_at: new Date().toISOString() });
    await writeFile(filePath, JSON.stringify(conv, null, 2), 'utf-8');
    return conv;
  } finally {
    release();
  }
}
 
export async function appendMessage(projectId, convId, message) {
  const filePath = getConvPath(projectId, convId);
  const release = await acquireLock(filePath);
  try {
    const conv = await getConversation(projectId, convId);
    conv.history.push(message);
    if (conv.history.length > MAX_HISTORY_LENGTH) {
      const systemMsgs = conv.history.filter(m => m.role === 'system');
      const nonSystem = conv.history.filter(m => m.role !== 'system');
      const trimmed = nonSystem.slice(-MAX_HISTORY_LENGTH + systemMsgs.length);
      conv.history = [...systemMsgs, ...trimmed];
    }
    conv.updated_at = new Date().toISOString();
    await writeFile(filePath, JSON.stringify(conv, null, 2), 'utf-8');
    return conv;
  } finally {
    release();
  }
}
 
export async function listConversations(projectId) {
  const dir = getProjectDir(projectId);
  try {
    const files = await readdir(dir);
    const convs = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = await readFile(join(dir, file), 'utf-8');
      const conv = JSON.parse(content);
      convs.push({ id: conv.id, name: conv.name, context_scope: conv.context_scope, mode: conv.mode, updated_at: conv.updated_at });
    }
    return convs.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
 
export async function deleteConversation(projectId, convId) {
  await rm(getConvPath(projectId, convId));
}
 
