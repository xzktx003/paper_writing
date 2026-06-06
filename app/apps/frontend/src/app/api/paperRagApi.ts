import { apiFetch, apiPost } from './fetchClient';

export interface RagDocument {
  id?: string;
  path: string;
  title?: string;
  bytes?: number;
  mtimeMs?: number;
  mimeType?: string;
}

export interface RagSearchResult {
  id: string;
  documentId: string;
  text: string;
  score: number;
  source: { path: string; title?: string; lineStart?: number; lineEnd?: number };
}

export interface ExternalSearchSource {
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  url?: string;
  abstract?: string;
  citation_count?: number;
  doi?: string;
  source: 'semantic-scholar' | 'arxiv' | 'crossref' | 'openalex';
  relevance_score?: number;
}

const BASE = '/api/projects';

export function getPaperAgentProjectId(projectPath?: string) {
  return projectPath?.startsWith('__paper_agent__:') ? projectPath.replace('__paper_agent__:', '') : null;
}

/* ── Corpus Management ─────────────────────────────────────── */

export async function listRagDocuments(projectId: string): Promise<{ documents: RagDocument[] }> {
  return apiFetch(`${BASE}/${projectId}/rag/documents`);
}

export async function addRagDocument(projectId: string, data: { filename: string; content: string }): Promise<{ ok: boolean; document: RagDocument }> {
  return apiPost(`${BASE}/${projectId}/rag/documents`, data);
}

export async function indexRagCorpus(projectId: string): Promise<{ ok: boolean; documents: number; chunks: number; indexedAt: string }> {
  return apiPost(`${BASE}/${projectId}/rag/index`, {});
}

export async function deleteRagDocument(projectId: string, path: string): Promise<{ ok: boolean }> {
  return apiFetch(`${BASE}/${projectId}/rag/documents?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
}

/* ── Search ─────────────────────────────────────────────────── */

export async function searchRagCorpus(projectId: string, query: string, limit = 5): Promise<{ results: RagSearchResult[] }> {
  return apiFetch(`${BASE}/${projectId}/rag/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

export async function buildRagContext(projectId: string, query: string, limit = 5): Promise<{ context: string }> {
  return apiPost(`${BASE}/${projectId}/rag/context`, { query, limit });
}

/* ── External Search ────────────────────────────────────────── */

export async function searchExternalSources(projectId: string, query: string, options?: { sources?: string; limit?: number }): Promise<{ results: ExternalSearchSource[] }> {
  const params = new URLSearchParams({ q: query });
  if (options?.sources) params.set('sources', options.sources);
  if (options?.limit) params.set('limit', String(options.limit));
  return apiFetch(`${BASE}/${projectId}/rag/external-search?${params}`);
}

/* ── Upload ─────────────────────────────────────────────────── */

export async function uploadRagDocument(projectId: string, file: File): Promise<{ ok: boolean; document: RagDocument }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/${projectId}/rag/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { const body = await res.json(); if (body.error) message = body.error; } catch {}
    throw new Error(message);
  }
  return res.json();
}