import { apiFetch, apiPost } from './fetchClient';

export type OfficeWorkflowStage = 'triggered' | 'processing' | 'review' | 'approved' | 'rejected' | 'published' | 'failed';
export type OfficeConnectorKind = 'local-folder' | 'webhook' | 'feishu-drive' | 'feishu-im' | 'feishu-approval' | 'email';

export interface OfficeToolCapability {
  id: 'builtin-ooxml' | 'officecli' | 'docling' | 'markitdown' | 'paddleocr';
  label: string;
  available: boolean;
  mode: 'builtin' | 'external';
  operations: string[];
  reason?: string;
  version?: string;
}

export interface OfficeInboxItem {
  id: string;
  sourcePath: string;
  filename: string;
  format: string;
  status: 'ready' | 'partial' | 'blocked' | string;
  parser: { id: string; mode: string; version?: string };
  quality: { status: string; score?: number; textCharacters?: number };
  warnings: string[];
  sections: Array<{ id: string; heading?: string; text: string; location?: string }>;
  chunks: Array<{ id: string; text: string; source?: { path?: string; location?: string } }>;
  importedAt?: string;
}

export interface OfficeRecipe {
  id: string;
  name: string;
  description?: string;
  triggerConnectorId: string;
  publishConnectorId: string;
  steps: string[];
  humanApprovalRequired: boolean;
  enabled: boolean;
  version?: string;
  [key: string]: unknown;
}

export interface OfficeConnector {
  id: string;
  type: OfficeConnectorKind;
  displayName: string;
  params: Record<string, unknown>;
  capabilities: string[];
  status: 'ready' | 'blocked' | string;
  statusReason: string;
  configured?: boolean;
  executionReady?: boolean;
}

export interface OfficeWorkflowRun {
  id: string;
  recipeId: string;
  status: OfficeWorkflowStage;
  timeline: Array<{ from: string | null; to: OfficeWorkflowStage; actor?: { type?: string; id?: string }; at?: string; notes?: string }>;
  reviewThreads: Array<{ paragraphId: string; comments: OfficeComment[] }>;
  approvalEvents: Array<{ id: string; status: string; actor?: { type?: string; id?: string }; notes?: string; at?: string }>;
  [key: string]: unknown;
}

export interface OfficeComment {
  id: string;
  paragraphId: string;
  provenance: { type?: 'human' | 'ai' | 'data'; id?: string; source?: string };
  body: string;
  assignee?: string;
  deadline?: string;
  suggestion?: OfficeSuggestion | null;
  replies?: Array<{ id: string; body: string; provenance?: unknown; createdAt?: string }>;
  [key: string]: unknown;
}

export interface OfficeSuggestion {
  id: string;
  status: 'pending' | 'accepted' | 'rejected';
  originalText: string;
  suggestedText: string;
  provenance?: { type?: 'ai' | 'human' | 'data'; source?: string; [key: string]: unknown };
  semanticDiff?: unknown;
  [key: string]: unknown;
}

export interface OfficeEfficiencySummary {
  evidenceStatus: 'sufficient' | 'insufficient' | string;
  metrics: { timeSavedMinutes: number | null; timeSavedRatio: number | null; acceptanceRate: number | null; qualityDelta: number | null };
  coverage: { sampleSize: number; roles: string[]; frequencies: string[]; versions: string[] };
  insufficiencyReasons: string[];
  [key: string]: unknown;
}

export interface OfficeWorkflowState {
  version: number;
  connectors: OfficeConnector[];
  recipes: OfficeRecipe[];
  runs: OfficeWorkflowRun[];
  telemetry: unknown[];
  efficiency?: OfficeEfficiencySummary;
  updatedAt?: string | null;
  [key: string]: unknown;
}

export interface OfficeWorkspaceState {
  version: number;
  inbox: OfficeInboxItem[];
  searches: Array<{ id: string; query: string; results: OfficeSearchResult[]; createdAt?: string }>;
  evidenceGraphs: OfficeEvidenceGraph[];
  meetings: OfficeMeeting[];
  updatedAt?: string | null;
}

export interface OfficeSearchResult {
  id: string;
  text: string;
  rank: number;
  score: number;
  source: { path: string; title?: string };
  scoreBreakdown: { bm25: number; vector: number; rerank: number; final: number };
  matchedTerms: string[];
}

export interface OfficeEvidenceGraph {
  id?: string;
  claims: Array<{ id: string; text: string }>;
  edges: Array<{ id: string; claimId: string; type: 'support' | 'conflict' | 'missing'; source?: { path: string }; excerpt?: string }>;
  conflicts: unknown[];
  gaps: unknown[];
  coverage: { totalClaims: number; supportedClaims: number; conflictedClaims: number; missingClaims: number; coverageRatio: number };
  createdAt?: string;
}

export interface OfficeMeeting {
  id?: string;
  title?: string;
  source: { filename: string; lineCount: number; speakerDiarization: 'not-claimed' };
  summary: string;
  decisions: Array<{ id: string; timestamp: string | null; text: string; evidence: unknown }>;
  actionItems: Array<{ id: string; timestamp: string | null; text: string; owner?: string; due?: string; evidence: unknown }>;
  timestampEvidence: Array<{ id: string; timestamp: string | null; speaker?: string; text: string }>;
  workflowDocument: { kind: string; path: string; title: string; content: string; evidenceCount: number };
  createdAt?: string;
}

export interface OfficeWorkspaceSnapshot {
  workspace: OfficeWorkspaceState;
  workflow: OfficeWorkflowState;
  capabilities: OfficeToolCapability[];
}

const officeWorkspaceUrl = (projectId: string, suffix = '') =>
  `/api/projects/${encodeURIComponent(projectId)}/office-track${suffix}`;

export function getOfficeWorkspace(projectId: string): Promise<OfficeWorkspaceSnapshot> {
  return apiFetch(officeWorkspaceUrl(projectId, '/workspace'));
}

export function importOfficeMaterial(projectId: string, sourcePath: string): Promise<{ item: OfficeInboxItem; workspace: OfficeWorkspaceState }> {
  return apiPost(officeWorkspaceUrl(projectId, '/inbox/import'), { sourcePath });
}

export function planOfficeArtifact(projectId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiPost(officeWorkspaceUrl(projectId, '/artifacts/plan'), input);
}

export function runOfficeArtifact(projectId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiPost(officeWorkspaceUrl(projectId, '/artifacts/run'), input);
}

export function createOfficeRecipe(projectId: string, input: Record<string, unknown>): Promise<{ recipe: OfficeRecipe; workflow: OfficeWorkflowState }> {
  return apiPost(officeWorkspaceUrl(projectId, '/recipes'), input);
}

export function registerOfficeConnector(projectId: string, input: Record<string, unknown>): Promise<{ connector: OfficeConnector; workflow: OfficeWorkflowState }> {
  return apiPost(officeWorkspaceUrl(projectId, '/connectors'), input);
}

export function createOfficeRun(projectId: string, input: Record<string, unknown>): Promise<{ run: OfficeWorkflowRun; workflow: OfficeWorkflowState }> {
  return apiPost(officeWorkspaceUrl(projectId, '/runs'), input);
}

export function transitionOfficeRun(projectId: string, runId: string, input: Record<string, unknown>): Promise<{ run: OfficeWorkflowRun; workflow: OfficeWorkflowState }> {
  return apiPost(officeWorkspaceUrl(projectId, `/runs/${encodeURIComponent(runId)}/transition`), input);
}

export function addOfficeComment(projectId: string, input: Record<string, unknown>): Promise<{ comment: OfficeComment; run: OfficeWorkflowRun; workflow: OfficeWorkflowState }> {
  return apiPost(officeWorkspaceUrl(projectId, '/review/comments'), input);
}

export function replyOfficeComment(projectId: string, commentId: string, input: Record<string, unknown>): Promise<{ comment: OfficeComment; workflow: OfficeWorkflowState }> {
  return apiPost(officeWorkspaceUrl(projectId, `/review/comments/${encodeURIComponent(commentId)}/replies`), input);
}

export function decideOfficeSuggestion(projectId: string, suggestionId: string, input: Record<string, unknown>): Promise<{ suggestion: OfficeSuggestion; workflow: OfficeWorkflowState }> {
  return apiPost(officeWorkspaceUrl(projectId, `/review/suggestions/${encodeURIComponent(suggestionId)}/decision`), input);
}

export function addOfficeApproval(projectId: string, runId: string, input: Record<string, unknown>): Promise<{ run: OfficeWorkflowRun; workflow: OfficeWorkflowState }> {
  return apiPost(officeWorkspaceUrl(projectId, `/runs/${encodeURIComponent(runId)}/approvals`), input);
}

export function recordOfficeMetric(projectId: string, input: Record<string, unknown>): Promise<{ efficiency: OfficeEfficiencySummary; workflow: OfficeWorkflowState }> {
  return apiPost(officeWorkspaceUrl(projectId, '/metrics'), input);
}

export function searchOfficeEvidence(projectId: string, input: { query: string; topK?: number }): Promise<{ query: string; results: OfficeSearchResult[]; retrievalProfile: unknown; workspace: OfficeWorkspaceState }> {
  return apiPost(officeWorkspaceUrl(projectId, '/search'), input);
}

export function buildOfficeEvidenceGraph(projectId: string, input: { claims: Array<{ id?: string; text: string }>; topK?: number }): Promise<{ graph: OfficeEvidenceGraph; workspace: OfficeWorkspaceState }> {
  return apiPost(officeWorkspaceUrl(projectId, '/evidence/graph'), input);
}

export function importOfficeMeeting(projectId: string, input: { filename: string; content: string }): Promise<{ meeting: OfficeMeeting; workspace: OfficeWorkspaceState }> {
  return apiPost(officeWorkspaceUrl(projectId, '/meetings/import'), input);
}
