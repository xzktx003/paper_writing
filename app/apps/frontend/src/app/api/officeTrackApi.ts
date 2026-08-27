import { apiFetch, apiPost, apiPut } from './fetchClient';

export type OfficeMaterialType = 'proposal' | 'demo-video-script' | 'reuse-statement' | 'significance' | 'effect-evidence' | 'reviewer-guide' | 'finals-pack' | 'other';
export type OfficeMaterialStatus = 'missing' | 'draft' | 'ready' | 'verified';
export type EvidenceLevel = 'E0' | 'E1' | 'E2' | 'E3';
export type EvidenceStatus = 'planned' | 'collected' | 'verified' | 'rejected';

export interface OfficeTrackBrief {
  title: string;
  team: string;
  scenario: string;
  users: string;
  writingTasks: string[];
  valueProposition: string;
  humanApprovalRequired: boolean;
  reuseStatement: string;
  significance: string;
  frequency: string;
  originalProcess: string;
  painPoints: string[];
  deliveryStandard: string;
  dependencies: string[];
  constraints: string[];
}

export interface OfficeTrackMaterial {
  id: string;
  name: string;
  type: OfficeMaterialType;
  path: string;
  status: OfficeMaterialStatus;
  notes?: string;
}

export interface OfficeTrackEvidence {
  id: string;
  claim: string;
  sourcePath: string;
  location: string;
  level: EvidenceLevel;
  status: EvidenceStatus;
  notes?: string;
}

export interface OfficeTrackEffect {
  baselineMinutes: number | null;
  aiMinutes: number | null;
  reviewMinutes: number | null;
  retryMinutes: number | null;
  setupMinutes: number | null;
  maintenanceMinutes: number | null;
  qualityNotes: string;
  sampleSize: number | null;
  measurementStatus: 'not-started' | 'designed' | 'measured' | 'verified';
  unit: string;
  period: string;
  taskFrequency: string;
  coveragePeople: number | null;
  calculationNotes: string;
}

export interface OfficeTrackAsset {
  id: string;
  name: string;
  type: 'template' | 'sop' | 'prompt' | 'workflow' | 'checklist' | 'dataset' | 'other';
  path: string;
  status: 'planned' | 'ready' | 'verified';
  notes?: string;
  targetRoles: string[];
  learningMinutes: number | null;
  deploymentNotes: string;
  permissionNotes: string;
  maintenanceOwner: string;
}

export interface OfficeTrackFinals {
  demoScript: string;
  questions: string[];
  operatorChecklist: string[];
  landingEvidence: {
    usagePeriod: string;
    users: string[];
    useCount: number | null;
    outputs: string[];
    feedback: string[];
  };
  rolloutPlan: {
    targetRoles: string[];
    milestones: string[];
    owner: string;
    resources: string[];
    costs: string;
    risks: string[];
    metrics: string[];
  };
  aiOptimization: {
    versions: string[];
    evaluation: string;
    iterations: string[];
  };
}

export interface OfficeTrackState {
  version: number;
  brief: OfficeTrackBrief;
  materials: OfficeTrackMaterial[];
  evidence: OfficeTrackEvidence[];
  effect: OfficeTrackEffect;
  reusableAssets: OfficeTrackAsset[];
  finals: OfficeTrackFinals;
  updatedAt?: string;
}

export type OfficeTrackSaveInput = Pick<OfficeTrackState, 'brief' | 'materials' | 'evidence' | 'effect' | 'reusableAssets' | 'finals'>;

export interface OfficeTrackAuditModule {
  score: number;
  rawScore?: number;
  max: number;
  band: string;
  checks: Array<{ id: string; label: string; pass: boolean }>;
  reasons: string[];
  deductions: string[];
  evidenceLocations: Array<{ id: string; path?: string; location?: string }>;
  confidence: 'low' | 'medium' | 'high';
  cap?: { id: string; maxScore: number; reason: string } | null;
  analysisPath?: string[];
  assumptions?: string[];
  possibleBias?: string[];
}

export interface OfficeTrackAudit {
  officialJudgement: false;
  totalGuidanceScore: number | null;
  confidence: 'low' | 'medium' | 'high';
  modules: Record<'efficiency' | 'scenario' | 'innovation' | 'portability', OfficeTrackAuditModule>;
  risks: Array<{ id?: string; severity?: string; message: string; location?: string }>;
  caps: Array<{ id: string; maxScore: number; reason: string }>;
  moduleCaps?: Partial<Record<'efficiency' | 'scenario' | 'innovation' | 'portability', { id: string; maxScore: number; reason: string } | null>>;
  scoreFormation?: {
    scoreStatus: 'ready' | 'needs-materials';
    reason: string;
    totalGuidanceScore: number | null;
    moduleCaps: Partial<Record<'efficiency' | 'scenario' | 'innovation' | 'portability', { id: string; maxScore: number; reason: string } | null>>;
  };
  ruleMatrix: Array<{ ruleId: string; label?: string; status: 'pass' | 'needs-work'; reason?: string; evidence?: unknown }>;
  effect?: { normalized?: { timeSavedMinutes?: number; includesReviewAndRetry?: boolean } };
  readability?: {
    materials: Array<{ source: string; path: string; status: 'readable' | 'partial' | 'unreadable' | 'missing'; reason?: string }>;
    evidence: Array<{ source: string; path: string; status: 'readable' | 'partial' | 'unreadable' | 'missing'; reason?: string }>;
    unreadableCount: number;
    missingCount: number;
    partialCount: number;
  };
  informationRisks?: Array<{ id: string; severity: string; message: string; source: string }>;
  finals?: Record<'landing' | 'qna' | 'rollout' | 'aiOptimization', { status: string }>;
}

export interface OfficeTrackExport {
  directory: string;
  files: Array<{ path: string; sha256: string }>;
  audit?: OfficeTrackAudit;
}

const officeTrackUrl = (projectId: string, suffix = '') =>
  `/api/projects/${encodeURIComponent(projectId)}/office-track${suffix}`;

export async function getOfficeTrack(projectId: string): Promise<{ state: OfficeTrackState; audit?: OfficeTrackAudit }> {
  return apiFetch(officeTrackUrl(projectId));
}

export async function saveOfficeTrack(projectId: string, state: OfficeTrackSaveInput): Promise<{ state: OfficeTrackState }> {
  return apiPut(officeTrackUrl(projectId), state);
}

export async function auditOfficeTrack(projectId: string): Promise<{ audit: OfficeTrackAudit }> {
  return apiPost(officeTrackUrl(projectId, '/audit'), {});
}

export async function exportOfficeTrack(projectId: string): Promise<{ export: OfficeTrackExport }> {
  return apiPost(officeTrackUrl(projectId, '/export'), {});
}
