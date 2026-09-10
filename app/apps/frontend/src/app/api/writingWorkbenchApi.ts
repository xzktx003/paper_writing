import { apiPost } from './fetchClient';

export interface WorkbenchAction {
  type: string;
  label_zh?: string;
  reason_zh?: string;
  skill?: string;
  blocking?: boolean;
}

export interface WorkbenchTaskStarter {
  id: string;
  title_zh: string;
  subtitle_en?: string;
  help_zh?: string;
  prompt: string;
  mode?: 'chat' | 'agent' | 'tools';
  skill?: string;
  tags?: string[];
  disabled?: boolean;
  disabledReason_zh?: string;
}

export interface WorkbenchSkillRecommendation {
  score?: number;
  reasons?: string[];
  skill: {
    name: string;
    display_name?: string;
    display_name_zh?: string;
    description?: string;
    description_zh?: string;
    category_zh?: string;
    inputs?: string[];
    outputs?: string[];
    best_for?: string[];
    not_for?: string[];
    risk_level?: string;
    estimated_time?: string;
  };
}

export interface WritingWorkbenchContext {
  task: string;
  taskRouting?: {
    mode?: 'chat' | 'agent' | 'tools';
    modeLabel_zh?: string;
    reasons?: string[];
    nextActions?: WorkbenchAction[];
    requiresConfirmation?: boolean;
  };
  taskStarters?: WorkbenchTaskStarter[];
  paperWorkflowGuide?: {
    label_zh?: string;
    summary_zh?: string;
    currentStep?: { title_zh?: string; status?: string; action?: WorkbenchAction } | null;
    steps?: Array<{ id: string; title_zh: string; status: string; blocking?: boolean; message_zh?: string }>;
  };
  agentReadiness?: {
    status?: string;
    label_zh?: string;
    summary_zh?: string;
    score?: number;
    blockers?: Array<{ label_zh?: string; detail_zh?: string }>;
  };
  actionQueue?: {
    actions?: Array<WorkbenchAction & { id?: string; action?: WorkbenchAction }>;
  };
  contextReadiness?: { status?: string; message_zh?: string };
  citationPolicy?: { status?: string; label_zh?: string; message_zh?: string; citationSensitive?: boolean };
  evidencePack?: {
    status?: string;
    label_zh?: string;
    message_zh?: string;
    evidenceCount?: number;
    fingerprint?: string;
    query?: string;
    items?: Array<{
      rank?: number;
      text?: string;
      source?: { path?: string; title?: string; lineStart?: number; lineEnd?: number };
      supportedClaims?: string[];
      unsupportedClaims?: string[];
    }>;
  };
  skills?: { recommendations?: WorkbenchSkillRecommendation[] };
  writingPrompt?: { text?: string };
  aiDraftRequest?: {
    mode?: 'chat' | 'agent' | 'tools';
    active_skills?: string[];
    send?: { userMessage?: string };
  };
  modeActionCenter?: {
    sendGate?: { canSend?: boolean; status?: string; blockingReasons?: string[]; requiresSafetyAck?: boolean };
    primaryAction?: { enabled?: boolean; label_zh?: string };
  };
}

export interface WritingAnswerReview {
  status: 'adoptable' | 'revise' | 'reject';
  label_zh?: string;
  message_zh?: string;
  summary?: { blockingCount?: number; warningCount?: number; sourceReferenceCount?: number; evidenceCount?: number };
  findings?: Array<{ id?: string; severity?: string; label_zh?: string; detail_zh?: string; blocking?: boolean }>;
  nextActions?: WorkbenchAction[];
}

export interface WritingWorkbenchRequest {
  task?: string;
  evidenceQuery?: string;
  contextAnswers?: Record<string, string>;
  skillLimit?: number;
  evidenceLimit?: number;
}

function workbenchBase(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/writing-workbench`;
}

export async function getWritingWorkbenchContext(
  projectId: string,
  request: WritingWorkbenchRequest,
): Promise<WritingWorkbenchContext> {
  return apiPost(`${workbenchBase(projectId)}/context`, request);
}

export async function reviewWritingAnswer(
  projectId: string,
  request: WritingWorkbenchRequest & { answer: string; evidencePackFingerprint?: string },
): Promise<{ review: WritingAnswerReview; context: Pick<WritingWorkbenchContext, 'task' | 'citationPolicy' | 'evidencePack'> }> {
  return apiPost(`${workbenchBase(projectId)}/review-answer`, request);
}
