import { apiFetch, apiPost, apiPut, apiDelete } from './fetchClient';
import { getServerAccessToken } from '../../api/serverAccess';
import { managedProjectRequest, projectRequestBody, type ProjectRequestContext } from './projectRequestContext';
import type { StreamActivitySummary } from '../utils/conversationActivity';

const BASE = '/api';

export interface ConversationSummary {
  id: string;
  name: string;
  context_scope: { type: string; file?: string; path?: string };
  mode: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  name: string;
  context_scope: { type: string; file?: string; path?: string };
  active_skills: string[];
  mode: string;
  model?: string;
  history: { role: string; content: string }[];
  attachments: ConversationAttachment[];
  rag_documents: string[];
}

export interface ConversationAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  textLength: number;
  created_at: string;
}

export interface AttachedFileData {
  dataUrl: string;
  name: string;
  type: string;
  isImage: boolean;
  size: number;
}

export interface EditProposalData {
  filename: string;
  original: string;
  new_content: string;
  stats: { added: number; removed: number };
}

export class AIStreamResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIStreamResponseError';
  }
}

export async function listConversations(projectId: string): Promise<ConversationSummary[]> {
  return apiFetch(`${BASE}/conversations/${projectId}`);
}

export async function getConversation(projectId: string, convId: string): Promise<Conversation> {
  return apiFetch(`${BASE}/conversations/${projectId}/${convId}`);
}

export async function createConversation(projectId: string, data: {
  name: string;
  context_scope: { type: string; file?: string; path?: string };
  active_skills?: string[];
  mode?: string;
  model?: string;
}): Promise<Conversation> {
  return apiPost(`${BASE}/conversations/${projectId}`, data);
}

export async function updateConversation(projectId: string, convId: string, updates: Partial<{ name: string; active_skills: string[]; mode: string; rag_documents: string[] }>): Promise<Conversation> {
  return apiPut(`${BASE}/conversations/${projectId}/${convId}`, updates);
}

export async function deleteConversation(projectId: string, convId: string) {
  await apiDelete(`${BASE}/conversations/${projectId}/${convId}`);
}

export async function uploadConversationAttachment(
  projectId: string,
  convId: string,
  file: AttachedFileData,
  onProgress?: (percent: number) => void
): Promise<{ ok: true; attachment: ConversationAttachment }> {
  const token = getServerAccessToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/conversations/${projectId}/${convId}/attachments`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let payload: any = {};
      try { payload = JSON.parse(xhr.responseText || '{}'); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
      else reject(new Error(payload.error || `PDF upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading PDF'));
    xhr.send(JSON.stringify({
      dataUrl: file.dataUrl,
      name: file.name,
      type: file.type,
      size: file.size,
    }));
  });
}

export async function deleteConversationAttachment(projectId: string, convId: string, attachmentId: string) {
  await apiDelete(`${BASE}/conversations/${projectId}/${convId}/attachments/${attachmentId}`);
}

export async function sendMessage(conversationProjectId: string, convId: string, context: ProjectRequestContext, userMessage: string, projectConfig: any, files?: AttachedFileData[]) {
  return apiPost(`${BASE}/ai/send`, {
    conversationProjectId, convId, ...projectRequestBody(context), userMessage, projectConfig,
    files: files?.map(f => ({ dataUrl: f.dataUrl, name: f.name, type: f.type, isImage: f.isImage, size: f.size })),
  });
}

/** SSE streaming version of sendMessage */
export async function sendMessageStream(
  conversationProjectId: string, convId: string, context: ProjectRequestContext, userMessage: string, projectConfig: any,
  files: AttachedFileData[] | undefined,
  callbacks: {
    onToken: (text: string) => void;
    onToolUse?: (name: string, activity?: StreamActivitySummary) => void;
    onToolResult?: (name: string, activity?: StreamActivitySummary) => void;
    onRagContext?: (sourceCount: number) => void;
    onEditProposal?: (proposal: EditProposalData) => void;
    onDone: (fullText: string) => void;
    onError: (message: string) => void;
    onProgress?: (percent: number, stage: string) => void;
  },
  options: { ephemeralConversation?: boolean } = {},
) {
  const token = getServerAccessToken();
  const hasTransientFiles = Boolean(files?.length);
  const body = JSON.stringify({
    conversationProjectId, convId, ...projectRequestBody(context), userMessage, projectConfig,
    ephemeralConversation: options.ephemeralConversation === true,
    files: files?.map(f => ({ dataUrl: f.dataUrl, name: f.name, type: f.type, isImage: f.isImage, size: f.size })),
  });

  // XMLHttpRequest exposes actual uploaded bytes; fetch currently does not.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let responseLength = 0;
    let eventBuffer = '';
    let finished = false;
    let terminalError: AIStreamResponseError | null = null;

    const dispatchEvent = (block: string) => {
      let eventType = '';
      let dataStr = '';
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) eventType = line.slice(6).trim();
        if (line.startsWith('data:')) dataStr += line.slice(5).trim();
      }
      if (!eventType || !dataStr) return;
      try {
        const data = JSON.parse(dataStr);
        switch (eventType) {
          case 'token': callbacks.onToken(data.text || ''); break;
          case 'tool_use': callbacks.onToolUse?.(data.name, data.activity); break;
          case 'tool_result': callbacks.onToolResult?.(data.name, data.activity); break;
          case 'rag_context': callbacks.onRagContext?.(data.evidence?.sources?.length || 0); break;
          case 'edit_proposal': callbacks.onEditProposal?.(data); break;
          case 'done':
            finished = true;
            callbacks.onProgress?.(100, 'complete');
            callbacks.onDone(data.fullText || '');
            break;
          case 'error':
            finished = true;
            terminalError = new AIStreamResponseError(data.message || 'Unknown error');
            callbacks.onError(terminalError.message);
            break;
        }
      } catch { /* ignore malformed events */ }
    };

    const consumeResponse = (flush = false) => {
      eventBuffer += xhr.responseText.slice(responseLength);
      responseLength = xhr.responseText.length;
      const blocks = eventBuffer.split(/\r?\n\r?\n/);
      if (!flush) eventBuffer = blocks.pop() || '';
      for (const block of blocks) dispatchEvent(block);
      if (flush) eventBuffer = '';
    };

    xhr.open('POST', BASE + '/ai/stream');
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        callbacks.onProgress?.(
          Math.round((event.loaded / event.total) * 100),
          hasTransientFiles ? 'uploading' : 'sending'
        );
      }
    };
    xhr.upload.onload = () => callbacks.onProgress?.(100, hasTransientFiles ? 'processing' : 'response');
    xhr.onprogress = () => {
      callbacks.onProgress?.(100, 'streaming');
      consumeResponse();
    };
    xhr.onload = () => {
      consumeResponse(true);
      if (xhr.status < 200 || xhr.status >= 300) {
        const message = 'HTTP ' + xhr.status + (xhr.statusText ? ': ' + xhr.statusText : '');
        callbacks.onError(message);
        reject(new Error(message));
        return;
      }
      if (terminalError) {
        reject(terminalError);
        return;
      }
      if (!finished) {
        const error = new Error('AI response ended unexpectedly');
        callbacks.onError(error.message);
        reject(error);
        return;
      }
      resolve();
    };
    xhr.onerror = () => reject(new Error('Network error while uploading attachment'));
    xhr.onabort = () => reject(new Error('Attachment upload was cancelled'));
    callbacks.onProgress?.(0, hasTransientFiles ? 'uploading' : 'sending');
    xhr.send(body);
  });
}

// ── Review API ──
export async function structuredReview(context: ProjectRequestContext, chapterScope?: string) {
  return apiPost(`${BASE}/review/structured`, { ...projectRequestBody(context), chapterScope });
}

// ── Anti-AI API ──
export async function detectAntiAi(context: ProjectRequestContext, content?: string, chapterScope?: string) {
  return apiPost(`${BASE}/anti-ai/detect`, { ...projectRequestBody(context), content, chapterScope });
}

export async function detectAntiAiDeep(context: ProjectRequestContext, content?: string, chapterScope?: string) {
  return apiPost(`${BASE}/anti-ai/deep-detect`, { ...projectRequestBody(context), content, chapterScope });
}

export async function detectAntiAiGPTZero(context: ProjectRequestContext, content?: string, chapterScope?: string) {
  return apiPost(`${BASE}/anti-ai/gptzero-detect`, { ...projectRequestBody(context), content, chapterScope });
}

// ── Pipeline V2 API ──

export interface PipelinePreset {
  id: string;
  name: string;
  description: string;
  stageCount: number;
  stages: { name: string; type: string; description: string }[];
}

export interface PipelineStageV2 {
  name: string;
  type: 'ai' | 'compute' | 'human' | 'citation' | 'compile';
  description: string;
  config: Record<string, any>;
  index: number;
  status: 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'skipped';
  output: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  metadata: Record<string, any>;
}

export interface PipelineV2 {
  id: string;
  name: string;
  description: string;
  projectId: string;
  projectPath: string;
  stages: PipelineStageV2[];
  currentStage: number;
  status: 'created' | 'running' | 'waiting' | 'paused' | 'completed' | 'failed';
  chapterScope: string | null;
  createdAt: string;
  updatedAt: string;
  outputs: Record<string, string>;
  errors: { stage: string; error: string }[];
}

export async function listPipelinePresets(): Promise<{ presets: PipelinePreset[] }> {
  return apiFetch(`${BASE}/v2/pipeline/presets`);
}

export async function startPipelineV2(preset: string, context: ProjectRequestContext, chapterScope?: string): Promise<PipelineV2> {
  return apiPost(`${BASE}/v2/pipeline/start`, { preset, ...projectRequestBody(context), chapterScope });
}

export async function getPipelineV2Status(pipelineId: string): Promise<PipelineV2> {
  return apiFetch(`${BASE}/v2/pipeline/${pipelineId}`);
}

export async function runPipelineV2Stage(pipelineId: string) {
  return apiPost(`${BASE}/v2/pipeline/${pipelineId}/run`, {});
}

export async function resolvePipelineV2(pipelineId: string, action: string, feedback?: string) {
  return apiPost(`${BASE}/v2/pipeline/${pipelineId}/resolve`, { action, feedback });
}

export async function retryPipelineV2(pipelineId: string, feedback?: string) {
  return apiPost(`${BASE}/v2/pipeline/${pipelineId}/retry`, { feedback });
}

export async function skipPipelineV2Stage(pipelineId: string) {
  return apiPost(`${BASE}/v2/pipeline/${pipelineId}/skip`, {});
}

export async function pausePipelineV2(pipelineId: string) {
  return apiPost(`${BASE}/v2/pipeline/${pipelineId}/pause`, {});
}

export async function resumePipelineV2(pipelineId: string) {
  return apiPost(`${BASE}/v2/pipeline/${pipelineId}/resume`, {});
}

// ── Citation Verification API ──

export interface CitationResult {
  key: string;
  type: string;
  doi: string | null;
  title: string | null;
  status: 'verified' | 'title_match' | 'doi_not_found' | 'unverifiable';
  confidence: 'high' | 'medium' | 'low' | 'none';
  matchedTitle?: string;
  matchedYear?: number;
  matchedJournal?: string;
  sources: Array<{ source: string; verified: boolean; error?: string }>;
}

export interface VerificationReport {
  totalEntries: number;
  verified: number;
  titleMatch: number;
  doiNotFound: number;
  unverifiable: number;
  results: CitationResult[];
  summary: string;
}

export interface CrossCheckResult {
  citedKeys: string[];
  bibKeys: string[];
  missingInBib: string[];
  uncitedInBib: string[];
}

export interface FullCitationReport extends VerificationReport, CrossCheckResult {
  mainFile?: string;
  bibFiles?: string[];
}

/** Verify all BibTeX entries against academic databases */
export async function verifyCitations(context: ProjectRequestContext, bibFile?: string, signal?: AbortSignal): Promise<FullCitationReport> {
  return apiFetch(`${BASE}/citations/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...projectRequestBody(context), bibFile }),
    signal: signal || AbortSignal.timeout(120000),
  });
}

/** Verify .tex citations and cross-check with .bib */
export async function verifyTexCitations(context: ProjectRequestContext, texFile?: string, bibFile?: string): Promise<FullCitationReport> {
  return apiPost(`${BASE}/citations/verify-tex`, { ...projectRequestBody(context), texFile, bibFile });
}

/** Quick cross-check without external API calls */
export async function crossCheckCitations(context: ProjectRequestContext, texFile?: string, bibFile?: string, signal?: AbortSignal): Promise<CrossCheckResult> {
  return apiFetch(`${BASE}/citations/cross-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...projectRequestBody(context), texFile, bibFile }),
    signal,
  });
}

export { managedProjectRequest };
