import { apiFetch, apiPost, apiDelete } from './fetchClient';

const BASE = '/api';

export interface SkillInfo {
  name: string;
  display_name: string;
  description: string;
  type: string;
  trigger: string;
  source: string;
  kind?: string;
  tags?: string[];
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

export async function createSkill(data: { name: string; display_name: string; description: string; type: string; trigger: string; prompt: string }): Promise<{ ok: boolean; skill?: SkillInfo; error?: string }> {
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
