export type ConversationActivityStatus = 'running' | 'success' | 'failed';

export interface ConversationActivity {
  id: string;
  kind: 'phase' | 'tool';
  status: ConversationActivityStatus;
  title: string;
  detail?: string;
  resultDetail?: string;
  toolName?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface StreamActivitySummary {
  detail?: string;
}

const PHASE_TITLES: Record<string, string> = {
  preparing: 'Preparing request',
  uploading: 'Uploading attachments',
  sending: 'Sending request',
  processing: 'Preparing context',
  response: 'Waiting for AI response',
  rag: 'Retrieval context prepared',
  streaming: 'Generating answer',
};

function completeRunningPhases(activities: ConversationActivity[], finishedAt: number) {
  return activities.map(activity => activity.kind === 'phase' && activity.status === 'running'
    ? { ...activity, status: 'success' as const, finishedAt }
    : activity);
}

export function beginConversationTrace(startedAt = Date.now()): ConversationActivity[] {
  return [{
    id: `phase-preparing-${startedAt}`,
    kind: 'phase',
    status: 'running',
    title: PHASE_TITLES.preparing,
    startedAt,
  }];
}

export function updateConversationPhase(
  activities: ConversationActivity[],
  stage: string,
  startedAt = Date.now(),
): ConversationActivity[] {
  if (stage === 'complete') return finishConversationTrace(activities, startedAt);
  const title = PHASE_TITLES[stage];
  if (!title) return activities;
  const current = activities[activities.length - 1];
  if (current?.kind === 'phase' && current.status === 'running' && current.title === title) return activities;
  return [
    ...completeRunningPhases(activities, startedAt),
    {
      id: `phase-${stage}-${startedAt}`,
      kind: 'phase',
      status: 'running',
      title,
      startedAt,
    },
  ];
}

export function startToolActivity(
  activities: ConversationActivity[],
  id: string,
  toolName: string,
  summary: StreamActivitySummary | undefined,
  startedAt = Date.now(),
): ConversationActivity[] {
  return [
    ...completeRunningPhases(activities, startedAt),
    {
      id,
      kind: 'tool',
      status: 'running',
      title: 'Using tool',
      toolName,
      detail: summary?.detail,
      startedAt,
    },
  ];
}

export function finishToolActivity(
  activities: ConversationActivity[],
  toolName: string,
  summary: StreamActivitySummary | undefined,
  finishedAt = Date.now(),
): ConversationActivity[] {
  let index = -1;
  for (let activityIndex = activities.length - 1; activityIndex >= 0; activityIndex -= 1) {
    const activity = activities[activityIndex];
    if (activity.kind === 'tool' && activity.toolName === toolName && activity.status === 'running') {
      index = activityIndex;
      break;
    }
  }
  if (index < 0) {
    return [...activities, {
      id: `tool-${toolName}-${finishedAt}`,
      kind: 'tool',
      status: 'success',
      title: 'Tool completed',
      toolName,
      resultDetail: summary?.detail,
      startedAt: finishedAt,
      finishedAt,
    }];
  }
  return activities.map((activity, activityIndex) => activityIndex === index
    ? { ...activity, status: 'success' as const, resultDetail: summary?.detail, finishedAt }
    : activity);
}

export function finishConversationTrace(
  activities: ConversationActivity[],
  finishedAt = Date.now(),
): ConversationActivity[] {
  const completed = activities.map(activity => activity.status === 'running'
    ? { ...activity, status: 'success' as const, finishedAt }
    : activity);
  if (completed[completed.length - 1]?.title === 'Answer completed') return completed;
  return [...completed, {
    id: `phase-complete-${finishedAt}`,
    kind: 'phase',
    status: 'success',
    title: 'Answer completed',
    startedAt: finishedAt,
    finishedAt,
  }];
}

export function failConversationTrace(
  activities: ConversationActivity[],
  detail: string,
  finishedAt = Date.now(),
): ConversationActivity[] {
  const failed = activities.map(activity => activity.status === 'running'
    ? { ...activity, status: 'failed' as const, finishedAt }
    : activity);
  return [...failed, {
    id: `phase-failed-${finishedAt}`,
    kind: 'phase',
    status: 'failed',
    title: 'Request failed',
    detail,
    startedAt: finishedAt,
    finishedAt,
  }];
}
