export type ProjectRequestContext =
  | { kind: 'managed'; projectId: string }
  | { kind: 'external'; projectPath: string };

export function managedProjectRequest(projectId: string): ProjectRequestContext {
  const normalized = String(projectId || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(normalized)) {
    throw new Error('A valid managed projectId is required.');
  }
  return { kind: 'managed', projectId: normalized };
}

export function externalProjectRequest(projectPath: string): ProjectRequestContext {
  const normalized = String(projectPath || '').trim();
  if (!normalized.startsWith('/')) throw new Error('An explicit absolute external project path is required.');
  return { kind: 'external', projectPath: normalized };
}

export function projectRequestBody(context: ProjectRequestContext): Record<string, string> {
  return context.kind === 'managed'
    ? { projectId: context.projectId }
    : { externalProjectPath: context.projectPath };
}

export function projectRequestQuery(context: ProjectRequestContext) {
  return new URLSearchParams(projectRequestBody(context));
}

export function projectRequestFromReference(reference: string, managedId?: string | null): ProjectRequestContext {
  if (managedId) return managedProjectRequest(managedId);
  if (reference.startsWith('__paper_agent__:')) {
    return managedProjectRequest(reference.slice('__paper_agent__:'.length));
  }
  return externalProjectRequest(reference);
}
