import { apiFetch, apiPost } from './fetchClient';

export type CliTaskStatus = 'queued' | 'running' | 'waiting-review' | 'accepted' | 'rejected' | 'failed' | 'cancelled' | 'applying';

export interface CliTaskProvider {
  id: string;
  label: string;
  isolation: string;
  installed: boolean;
  authenticated: boolean;
  authStatus: 'authenticated' | 'not-authenticated' | 'unknown' | 'unavailable' | 'test-only';
  available: boolean;
  unavailableReason?: string;
  testOnly?: boolean;
}

export interface CliTaskChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  binary: boolean;
  bytesBefore: number;
  bytesAfter: number;
  diff: string;
}

export interface CliTask {
  id: string;
  projectId: string;
  providerId: string;
  model: string;
  prompt: string;
  status: CliTaskStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  finishedAt: string;
  changedFiles: CliTaskChangedFile[];
  stdout: string;
  stderr: string;
  error: { code: string; message: string } | null;
  review: { decision: 'accepted' | 'rejected'; reason: string; decidedAt: string } | null;
  provenance: {
    provider: string;
    model: string;
    executable: string;
    version: string;
    isolation: string;
    argsSummary: string;
    startedAt: string;
    finishedAt: string;
    exitCode: number | null;
    signal: string | null;
    exitStatus: string;
  };
}

function base(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/cli-tasks`;
}

export async function listCliTaskProviders(): Promise<{ providers: CliTaskProvider[] }> {
  return apiFetch('/api/cli-task-providers');
}

export async function createCliTask(projectId: string, input: { providerId: string; model?: string; prompt: string; timeoutMs?: number }): Promise<{ task: CliTask }> {
  return apiPost(base(projectId), input);
}

export async function listCliTasks(projectId: string): Promise<{ tasks: CliTask[] }> {
  return apiFetch(base(projectId));
}

export async function getCliTask(projectId: string, taskId: string): Promise<{ task: CliTask }> {
  return apiFetch(`${base(projectId)}/${encodeURIComponent(taskId)}`);
}

export async function acceptCliTask(projectId: string, taskId: string): Promise<{ task: CliTask }> {
  return apiPost(`${base(projectId)}/${encodeURIComponent(taskId)}/accept`, {});
}

export async function rejectCliTask(projectId: string, taskId: string, reason = ''): Promise<{ task: CliTask }> {
  return apiPost(`${base(projectId)}/${encodeURIComponent(taskId)}/reject`, { reason });
}

export async function cancelCliTask(projectId: string, taskId: string): Promise<{ cancelled: boolean; taskId: string; status: string }> {
  return apiPost(`${base(projectId)}/${encodeURIComponent(taskId)}/cancel`, {});
}
