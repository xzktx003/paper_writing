import { readFile, writeFile, mkdir, readdir, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { DATA_DIR } from '../config/constants.js';
import { getProjectRoot } from './projectLocator.js';

const CONVERSATIONS_RELATIVE_DIR = join('.openprism', 'conversations');
const LEGACY_CONVERSATIONS_RELATIVE_DIR = join('.paper-writer', 'conversations');
const MAX_HISTORY_LENGTH = 100;
const locks = new Map();

function acquireLock(key) {
  if (!locks.has(key)) locks.set(key, Promise.resolve());
  let release;
  const next = new Promise((resolveRelease) => { release = resolveRelease; });
  const previous = locks.get(key);
  locks.set(key, next);
  return previous.then(() => release);
}

function validateProjectId(projectId) {
  const value = String(projectId || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw Object.assign(new Error('Invalid project id'), { code: 'INVALID_PROJECT_ID', statusCode: 400 });
  }
  return value;
}

function validateConversationId(convId) {
  const value = String(convId || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw Object.assign(new Error('Invalid conversation id'), { code: 'INVALID_CONVERSATION_ID', statusCode: 400 });
  }
  return value;
}

function optionsWithDefaults(options = {}) {
  return {
    dataDir: options.dataDir || DATA_DIR,
    resolveProjectRoot: options.resolveProjectRoot || options.projectRootResolver || getProjectRoot,
    legacyHome: options.legacyHome ?? process.env.HOME,
  };
}

async function getProjectDir(projectId, options = {}) {
  const safeProjectId = validateProjectId(projectId);
  const { dataDir, resolveProjectRoot } = optionsWithDefaults(options);
  const projectRoot = await resolveProjectRoot(safeProjectId, { dataDir, allowMissing: false });
  return join(resolve(projectRoot), CONVERSATIONS_RELATIVE_DIR);
}

async function getConvPath(projectId, convId, options = {}) {
  return join(await getProjectDir(projectId, options), `${validateConversationId(convId)}.json`);
}

export function getConversationStorageRelativePath() {
  return CONVERSATIONS_RELATIVE_DIR;
}

export async function createConversation(projectId, { name, context_scope, active_skills, mode, model } = {}, options = {}) {
  const id = randomUUID().slice(0, 8);
  const conv = {
    id,
    name: name || `Conversation ${id}`,
    context_scope: context_scope || { type: 'free' },
    active_skills: active_skills || [],
    mode: mode || 'chat',
    model: model || null,
    history: [],
    attachments: [],
    rag_documents: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const dir = await getProjectDir(projectId, options);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.json`), JSON.stringify(conv, null, 2), 'utf-8');
  return conv;
}

export async function getConversation(projectId, convId, options = {}) {
  try {
    const content = await readFile(await getConvPath(projectId, convId, options), 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw Object.assign(new Error('Conversation not found'), {
        code: 'CONVERSATION_NOT_FOUND',
        statusCode: 404,
      });
    }
    throw error;
  }
}

export async function updateConversation(projectId, convId, updates, options = {}) {
  const filePath = await getConvPath(projectId, convId, options);
  const release = await acquireLock(filePath);
  try {
    const conv = await getConversation(projectId, convId, options);
    Object.assign(conv, updates, { updated_at: new Date().toISOString() });
    await writeFile(filePath, JSON.stringify(conv, null, 2), 'utf-8');
    return conv;
  } finally {
    release();
  }
}

export async function appendMessage(projectId, convId, message, options = {}) {
  const filePath = await getConvPath(projectId, convId, options);
  const release = await acquireLock(filePath);
  try {
    const conv = await getConversation(projectId, convId, options);
    conv.history.push(message);
    if (conv.history.length > MAX_HISTORY_LENGTH) {
      const systemMsgs = conv.history.filter((m) => m.role === 'system');
      const nonSystem = conv.history.filter((m) => m.role !== 'system');
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

export async function addConversationAttachment(projectId, convId, attachment, options = {}) {
  const filePath = await getConvPath(projectId, convId, options);
  const release = await acquireLock(filePath);
  try {
    const conv = await getConversation(projectId, convId, options);
    const text = String(attachment.text || '');
    const item = {
      id: attachment.id || randomUUID().slice(0, 12),
      name: attachment.name,
      type: attachment.type || 'application/pdf',
      size: Number(attachment.size) || 0,
      text,
      textLength: text.length,
      created_at: new Date().toISOString(),
    };
    const existing = (conv.attachments || []).filter((current) => current.name !== item.name);
    conv.attachments = [...existing, item].slice(-10);
    conv.updated_at = new Date().toISOString();
    await writeFile(filePath, JSON.stringify(conv, null, 2), 'utf-8');
    return item;
  } finally {
    release();
  }
}

export async function removeConversationAttachment(projectId, convId, attachmentId, options = {}) {
  const filePath = await getConvPath(projectId, convId, options);
  const release = await acquireLock(filePath);
  try {
    const conv = await getConversation(projectId, convId, options);
    const before = (conv.attachments || []).length;
    conv.attachments = (conv.attachments || []).filter((item) => item.id !== attachmentId);
    conv.updated_at = new Date().toISOString();
    await writeFile(filePath, JSON.stringify(conv, null, 2), 'utf-8');
    return before !== conv.attachments.length;
  } finally {
    release();
  }
}

export async function listConversations(projectId, options = {}) {
  const dir = await getProjectDir(projectId, options);
  try {
    const files = await readdir(dir);
    const convs = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const fileConvId = file.slice(0, -'.json'.length);
      try {
        validateConversationId(fileConvId);
      } catch {
        continue;
      }
      const content = await readFile(join(dir, file), 'utf-8');
      const conv = JSON.parse(content);
      if (conv.id !== fileConvId) continue;
      convs.push({ id: conv.id, name: conv.name, context_scope: conv.context_scope, mode: conv.mode, updated_at: conv.updated_at });
    }
    return convs.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function deleteConversation(projectId, convId, options = {}) {
  try {
    await rm(await getConvPath(projectId, convId, options));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw Object.assign(new Error('Conversation not found'), {
        code: 'CONVERSATION_NOT_FOUND',
        statusCode: 404,
      });
    }
    throw error;
  }
}

/** Remove both managed project-local history and pre-migration home history. */
export async function purgeConversationProject(projectId, options = {}) {
  const safeProjectId = validateProjectId(projectId);
  const resolved = optionsWithDefaults(options);
  const managedDir = await getProjectDir(safeProjectId, resolved);
  await rm(managedDir, { recursive: true, force: true });
  if (resolved.legacyHome) {
    const legacyDir = join(resolve(resolved.legacyHome), LEGACY_CONVERSATIONS_RELATIVE_DIR, safeProjectId);
    await rm(legacyDir, { recursive: true, force: true });
  }
}
