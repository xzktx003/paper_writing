import { apiFetch, apiPost, apiDelete } from './fetchClient';

const BASE = '/api';

export type SkillReadiness = 'ready' | 'degraded' | 'unavailable';

export interface SkillRequirement {
  name?: string;
  target?: string;
  path?: string;
  capability?: string;
  scope?: 'skill' | 'project';
  required: boolean;
  source?: string;
}

export interface SkillExecutionInfo {
  requirements: {
    commands: SkillRequirement[];
    credentials: SkillRequirement[];
    network: SkillRequirement[];
    files: SkillRequirement[];
    providerCapabilities: SkillRequirement[];
  };
  sideEffects: string[];
  costClass: 'free' | 'low' | 'medium' | 'high';
  metadataSource: 'manifest' | 'inferred';
  readiness: SkillReadiness;
  checks: { kind: string; name: string; required: boolean; status: string; provider?: string; scope?: string }[];
  dryRun: { status: string; checkedAt: string; checks?: SkillExecutionInfo['checks'] };
  lastRun: {
    status: string;
    outcome: 'provider_completed' | 'provider_failed' | 'provider_skipped' | 'tests_passed' | 'tests_failed' | 'tests_skipped' | 'execution_completed' | 'execution_failed' | 'unknown';
    verificationStatus: string;
    objectiveStatus: string;
    kind: string;
    checkedAt: string;
    durationMs?: number;
    summary?: string;
    scope?: { projectId?: string; conversationId?: string };
  };
}

export interface SkillInfo {
  name: string;
  display_name: string;
  description: string;
  description_zh?: string;
  type: string;
  trigger: string;
  auto_recommend?: boolean;
  source: string;
  kind?: string;
  tags?: string[];
  // New fields for categorized display
  categories?: string[];  // e.g. ['writing', 'research']
  subcategory?: string;
  subcategory_zh?: string;
  source_stars?: number;
  stars_checked_at?: string;
  source_url?: string;
  url?: string;           // GitHub or official URL
  source_license?: string;
  adapted_from?: string;
  package?: {
    references: string[];
    scripts: string[];
    assets: string[];
    tests: string[];
    fileCount?: { references: number; scripts: number; assets: number; tests: number };
  };
  prompt?: string;
  importInfo?: {
    url: string;
    owner: string;
    repo: string;
    importedAt: string;
    updatedAt: string;
  };
  execution?: SkillExecutionInfo;
}

export interface ImportSkillResult {
  ok: boolean;
  skill?: SkillInfo;
  error?: string;
}

export interface SkillPackageTreeItem {
  path: string;
  type: 'file' | 'dir';
}

export interface SkillTestResult {
  passed: number;
  failed: number;
  skipped: number;
  results: { file: string; status: string; output?: string; error?: string; reason?: string }[];
  message: string;
}

export interface ImportedSkillInfo {
  name: string;
  url: string;
  owner: string;
  repo: string;
  importedAt: string;
  updatedAt: string;
  latest: boolean;
}

export async function listSkills(): Promise<SkillInfo[]> {
  return apiFetch(`${BASE}/skills`);
}

export async function getSkill(name: string): Promise<SkillInfo> {
  return apiFetch(`${BASE}/skills/${name}`);
}

export async function createSkill(data: {
  name: string;
  display_name: string;
  display_name_zh?: string;
  description: string;
  description_zh?: string;
  type: string;
  categories?: string[];
  category_zh?: string;
  subcategory?: string;
  subcategory_zh?: string;
  tags?: string[];
  trigger: string;
  prompt: string;
  url?: string;
}): Promise<{ ok: boolean; skill?: SkillInfo; error?: string }> {
  return apiPost(`${BASE}/skills`, data);
}

export async function deleteSkill(name: string): Promise<{ ok: boolean }> {
  return apiFetch(`${BASE}/skills/${name}`, { method: 'DELETE' });
}

export async function reloadSkills(projectSkillsDir?: string) {
  return apiPost(`${BASE}/skills/reload`, { projectSkillsDir });
}

/* ── GitHub Import ─────────────────────────────────────────── */

export async function importSkillFromGitHub(url: string, name?: string): Promise<ImportSkillResult> {
  return apiPost(`${BASE}/skills/import`, { url, name });
}

export async function updateImportedSkill(name: string): Promise<ImportSkillResult> {
  return apiPost(`${BASE}/skills/${name}/update`, {});
}

export async function listImportedSkills(): Promise<{ skills: ImportedSkillInfo[] }> {
  return apiFetch(`${BASE}/skills/imported/list`);
}

export async function removeImportedSkill(name: string): Promise<{ ok: boolean }> {
  return apiFetch(`${BASE}/skills/${name}/imported`, { method: 'DELETE' });
}

/* ── Package Operations ────────────────────────────────────── */

export async function getSkillPackageTree(name: string, subdir?: string): Promise<{ tree: SkillPackageTreeItem[] }> {
  const params = subdir ? `?subdir=${encodeURIComponent(subdir)}` : '';
  return apiFetch(`${BASE}/skills/${name}/package-tree${params}`);
}

export async function runSkillTests(name: string, timeout?: number): Promise<SkillTestResult> {
  return apiPost(`${BASE}/skills/${name}/run-tests`, { timeout });
}

export async function dryRunSkill(name: string): Promise<{ ok: boolean; skill: SkillInfo }> {
  return apiPost(`${BASE}/skills/${name}/dry-run`, {});
}
