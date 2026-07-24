import { apiFetch, apiPost } from './fetchClient';

export interface RagDocument {
  id?: string;
  path: string;
  title?: string;
  bytes?: number;
  mtimeMs?: number;
  mimeType?: string;
}

export type RagHealthStatus = 'healthy' | 'degraded' | 'corrupt' | 'rebuilding';

export interface RagDocumentHealth {
  path: string;
  kind: string;
  parser: string;
  parseStatus: string;
  bytes: number;
  chars: number;
  chunks: number;
  warnings: string[];
  error: string;
}

export interface RagIndexHealth {
  status: RagHealthStatus;
  retrieval: { kind: 'local-keyword-overlap'; label: string; semantic: false };
  generation: string;
  fingerprint: string;
  indexedAt: string;
  counts: { files: number; indexedFiles: number; failedFiles: number; zeroChunkFiles: number; chunks: number };
  documents: RagDocumentHealth[];
  issues: Array<{ code: string; severity: string; message: string }>;
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
  native_score?: number | null;
  native_score_basis?: string;
  normalized_score?: number;
  score_basis?: string;
  relevance_score?: number;
}

export interface ExternalSearchSourceStatus {
  id: string;
  status: 'ok' | 'empty' | 'error';
  latencyMs: number;
  count: number;
  error: string;
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

export async function indexRagCorpus(projectId: string): Promise<{ ok: boolean; documents: number; chunks: number; indexedAt: string; generation: string; fingerprint: string; retrieval: RagIndexHealth['retrieval'] }> {
  return apiPost(`${BASE}/${projectId}/rag/index`, {});
}

export async function getRagHealth(projectId: string): Promise<RagIndexHealth> {
  return apiFetch(`${BASE}/${projectId}/rag/health`);
}

export async function deleteRagDocument(projectId: string, path: string): Promise<{ ok: boolean }> {
  return apiFetch(`${BASE}/${projectId}/rag/documents?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
}

/* ── Search ─────────────────────────────────────────────────── */

export async function searchRagCorpus(projectId: string, query: string, limit = 5): Promise<{ results: RagSearchResult[] }> {
  return apiFetch(`${BASE}/${projectId}/rag/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

export async function buildRagContext(projectId: string, query: string, limit = 5, docPaths?: string[]): Promise<{ context: string }> {
  return apiPost(`${BASE}/${projectId}/rag/context`, { query, limit, docPaths });
}

/* ── External Search ────────────────────────────────────────── */

export async function searchExternalSources(projectId: string, query: string, options?: { sources?: string; limit?: number }): Promise<{ results: ExternalSearchSource[]; sources: ExternalSearchSourceStatus[] }> {
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

/* ── Figures ────────────────────────────────────────────────── */

export interface DocumentFigure {
  id: string;
  page: number;
  index: number;
  width: number;
  height: number;
  format: string;
  size: number;
}

export async function listDocumentFigures(projectId: string, docPath: string): Promise<{ figures: DocumentFigure[]; error?: string }> {
  const encodedPath = encodeURIComponent(docPath);
  return apiFetch(`${BASE}/${projectId}/rag/documents/${encodedPath}/figures`);
}

/* ── Vision Figure Description ───────────────────────────────── */

export interface FigureDescription {
  success: boolean;
  foundPage?: number;  // auto-detected page number in PDF
  image?: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
  description: string;
  error?: string;
  hint?: string;
  suggestions?: number[];  // suggested page numbers if figure not found
  model?: string;
  supported?: boolean;
}

export async function checkVisionCapability(model?: string): Promise<{ model: string; supported: boolean; supportedModels: string[] }> {
  const params = model ? `?model=${encodeURIComponent(model)}` : '';
  return apiFetch(`/api/llm/vision-capable${params}`);
}

export async function describeFigure(
  projectId: string, 
  docPath: string, 
  figureNum: number,
  context?: string
): Promise<FigureDescription> {
  const encodedPath = encodeURIComponent(docPath);
  return apiPost(`${BASE}/${projectId}/rag/figure/describe`, {
    docPath: encodedPath,
    figureNum,
    context,
  });
}
