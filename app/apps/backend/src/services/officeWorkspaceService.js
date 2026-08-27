import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { safeJoin } from '../utils/pathSecurity.js';

const WORKSPACE_PATH = '.openprism/office-workspace.json';
const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const MAX_HISTORY = 50;
const writeQueues = new Map();

function workspaceError(message, code = 'INVALID_OFFICE_WORKSPACE', statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function defaultWorkspace() {
  return {
    version: 1,
    inbox: [],
    searches: [],
    evidenceGraphs: [],
    meetings: [],
    updatedAt: null,
  };
}

function cloneJson(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw workspaceError(`${field} must be an object.`);
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw workspaceError(`${field} must be JSON serializable.`);
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RECORD_BYTES) {
    throw workspaceError(`${field} is too large.`);
  }
  return JSON.parse(serialized);
}

function cleanId(value, field) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
    throw workspaceError(`${field} must be a stable id.`);
  }
  return id;
}

function cleanRelativePath(value, field) {
  const sourcePath = String(value || '').trim().replace(/\\/g, '/');
  if (!sourcePath || sourcePath.startsWith('/') || sourcePath.includes('\0') || sourcePath.split('/').some(part => part === '.' || part === '..')) {
    throw workspaceError(`${field} must be a safe project-relative path.`);
  }
  return sourcePath;
}

function cleanInboxItem(input) {
  const item = cloneJson(input, 'inbox item');
  item.id = cleanId(item.id, 'inbox item id');
  item.sourcePath = cleanRelativePath(item.sourcePath, 'sourcePath');
  item.filename = String(item.filename || path.posix.basename(item.sourcePath)).trim().slice(0, 240);
  item.format = String(item.format || '').trim().toLowerCase().slice(0, 24);
  item.status = String(item.status || 'partial').trim().slice(0, 32);
  item.importedAt = item.importedAt || new Date().toISOString();
  return item;
}

function cleanSearch(input) {
  const search = cloneJson(input, 'search');
  search.id = cleanId(search.id, 'search id');
  search.query = String(search.query || '').trim();
  if (!search.query) throw workspaceError('query is required.');
  if (search.query.length > 2000) throw workspaceError('query is too long.');
  search.createdAt = search.createdAt || new Date().toISOString();
  search.results = Array.isArray(search.results) ? search.results.slice(0, 100) : [];
  return search;
}

function cleanEvidenceGraph(input) {
  const graph = cloneJson(input, 'evidence graph');
  graph.id = cleanId(graph.id, 'evidence graph id');
  graph.createdAt = graph.createdAt || new Date().toISOString();
  graph.claims = Array.isArray(graph.claims) ? graph.claims.slice(0, 500) : [];
  graph.edges = Array.isArray(graph.edges) ? graph.edges.slice(0, 2000) : [];
  return graph;
}

function cleanMeeting(input) {
  const meeting = cloneJson(input, 'meeting');
  meeting.id = cleanId(meeting.id, 'meeting id');
  meeting.title = String(meeting.title || '').trim().slice(0, 240);
  if (!meeting.title) throw workspaceError('meeting title is required.');
  meeting.createdAt = meeting.createdAt || new Date().toISOString();
  return meeting;
}

function normalizeLoaded(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return defaultWorkspace();
  return {
    version: 1,
    inbox: Array.isArray(value.inbox) ? value.inbox : [],
    searches: Array.isArray(value.searches) ? value.searches : [],
    evidenceGraphs: Array.isArray(value.evidenceGraphs) ? value.evidenceGraphs : [],
    meetings: Array.isArray(value.meetings) ? value.meetings : [],
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
  };
}

async function atomicWrite(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, filePath);
}

function enqueue(projectRoot, operation) {
  const key = path.resolve(projectRoot);
  const previous = writeQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  writeQueues.set(key, next);
  return next.finally(() => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  });
}

export async function loadOfficeWorkspace(projectRoot) {
  const target = safeJoin(projectRoot, WORKSPACE_PATH);
  try {
    return normalizeLoaded(JSON.parse(await fs.readFile(target, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return defaultWorkspace();
    if (error instanceof SyntaxError) throw workspaceError('Office workspace state is invalid JSON.', 'CORRUPT_OFFICE_WORKSPACE', 500);
    throw error;
  }
}

async function mutateWorkspace(projectRoot, recipe) {
  return enqueue(projectRoot, async () => {
    const current = await loadOfficeWorkspace(projectRoot);
    const next = recipe(current);
    next.updatedAt = new Date().toISOString();
    await atomicWrite(safeJoin(projectRoot, WORKSPACE_PATH), next);
    return next;
  });
}

function upsert(items, record, limit = MAX_HISTORY) {
  return [record, ...items.filter(item => item?.id !== record.id)].slice(0, limit);
}

export async function appendOfficeInboxItem(projectRoot, input) {
  const item = cleanInboxItem(input);
  const workspace = await mutateWorkspace(projectRoot, current => ({
    ...current,
    inbox: upsert(current.inbox, item, 200),
  }));
  return { item, workspace };
}

export async function recordOfficeSearch(projectRoot, input) {
  const search = cleanSearch(input);
  const workspace = await mutateWorkspace(projectRoot, current => ({
    ...current,
    searches: upsert(current.searches, search),
  }));
  return { search, workspace };
}

export async function recordOfficeEvidenceGraph(projectRoot, input) {
  const graph = cleanEvidenceGraph(input);
  const workspace = await mutateWorkspace(projectRoot, current => ({
    ...current,
    evidenceGraphs: upsert(current.evidenceGraphs, graph),
  }));
  return { graph, workspace };
}

export async function recordOfficeMeeting(projectRoot, input) {
  const meeting = cleanMeeting(input);
  const workspace = await mutateWorkspace(projectRoot, current => ({
    ...current,
    meetings: upsert(current.meetings, meeting),
  }));
  return { meeting, workspace };
}
