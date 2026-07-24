import { apiFetch, apiPost } from './fetchClient';
import { managedProjectRequest, projectRequestBody, type ProjectRequestContext } from './projectRequestContext';

const BASE = '/api';

export async function openProject(path: string) {
  return apiPost(`${BASE}/projects/open`, { path });
}

export async function createProject(path: string, config: any) {
  return apiPost(`${BASE}/projects/create`, { path, config });
}

export async function readChapter(context: ProjectRequestContext, relativePath: string) {
  return apiPost(`${BASE}/chapters/read`, { ...projectRequestBody(context), relativePath });
}

export async function writeChapter(context: ProjectRequestContext, relativePath: string, content: string) {
  return apiPost(`${BASE}/chapters/write`, { ...projectRequestBody(context), relativePath, content });
}

export async function createChapter(context: ProjectRequestContext, relativePath: string) {
  return apiPost(`${BASE}/chapters/create`, { ...projectRequestBody(context), relativePath });
}

export async function reorderChapters(context: ProjectRequestContext, order: string[]) {
  return apiPost(`${BASE}/chapters/reorder`, { ...projectRequestBody(context), order });
}

export { managedProjectRequest };

export async function getProjectTree(path: string) {
  return apiPost(`${BASE}/projects/tree`, { path });
}

export async function readCodeFile(projectPath: string, filePath: string) {
  return apiPost(`${BASE}/code/read`, { projectPath, filePath });
}

export async function getCodeTree(projectPath: string) {
  return apiPost(`${BASE}/code/tree`, { projectPath });
}
