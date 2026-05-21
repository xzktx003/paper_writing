import { readFile, writeFile, mkdir, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const STORE_BASE = join(process.env.HOME, '.paper-writer', 'conversations');

function getProjectDir(projectId) {
  return join(STORE_BASE, projectId);
}

function getConvPath(projectId, convId) {
  return join(getProjectDir(projectId), `${convId}.json`);
}

export async function createConversation(projectId, { name, context_scope, active_skills, mode }) {
  const id = randomUUID().slice(0, 8);
  const conv = {
    id,
    name: name || `Conversation ${id}`,
    context_scope: context_scope || { type: 'free' },
    active_skills: active_skills || [],
    mode: mode || 'chat',
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
  const conv = await getConversation(projectId, convId);
  Object.assign(conv, updates, { updated_at: new Date().toISOString() });
  await writeFile(getConvPath(projectId, convId), JSON.stringify(conv, null, 2), 'utf-8');
  return conv;
}

export async function appendMessage(projectId, convId, message) {
  const conv = await getConversation(projectId, convId);
  conv.history.push(message);
  conv.updated_at = new Date().toISOString();
  await writeFile(getConvPath(projectId, convId), JSON.stringify(conv, null, 2), 'utf-8');
  return conv;
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
