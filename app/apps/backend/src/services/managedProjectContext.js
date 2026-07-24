import path from 'path';
import { DATA_DIR } from '../config/constants.js';
import { getProjectRoot } from './projectLocator.js';

function requestInput(request, source) {
  return source === 'query' ? (request.query || {}) : (request.body || {});
}

function managedRequestError(message, code = 'INVALID_MANAGED_PROJECT_REQUEST', statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

export function markLegacyProjectPathUsage(request, reply, { route = 'managed-project-api' } = {}) {
  const marker = { input: 'projectPath', deprecated: true, route };
  request.managedProjectUsage = marker;
  request.log?.warn?.({ route, deprecatedInput: 'projectPath' }, 'Deprecated managed projectPath input used; migrate to projectId.');
  reply?.header?.('Deprecation', 'true');
  reply?.header?.('X-OpenPrism-Deprecated-Input', 'projectPath');
  return marker;
}

function assertLegacyPathWithinDataDir(projectPath, dataDir) {
  if (!path.isAbsolute(projectPath)) {
    throw managedRequestError('Managed APIs require projectId; relative projectPath values are not allowed.', 'INVALID_PROJECT_PATH');
  }
  const resolved = path.resolve(projectPath);
  const root = path.resolve(dataDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw managedRequestError('External absolute paths are not allowed in managed project APIs.', 'EXTERNAL_PATH_NOT_ALLOWED');
  }
  return resolved;
}

export async function resolveManagedProjectRequest(request, reply, {
  source = 'body',
  route = 'managed-project-api',
  dataDir = DATA_DIR,
  resolveProjectRoot = getProjectRoot,
  allowExternalProjectPath = false,
} = {}) {
  const input = requestInput(request, source);
  const projectId = String(input.projectId || '').trim();
  const projectPath = typeof input.projectPath === 'string' ? input.projectPath.trim() : '';
  const externalProjectPath = typeof input.externalProjectPath === 'string' ? input.externalProjectPath.trim() : '';

  if (projectId) {
    if (projectPath) markLegacyProjectPathUsage(request, reply, { route });
    return {
      projectId,
      projectRoot: await resolveProjectRoot(projectId, { allowMissing: false }),
      // projectId is authoritative when both contracts are present. The old
      // projectPath is still marked, but must not change relativePath handling.
      legacy: false,
    };
  }

  if (externalProjectPath) {
    if (!allowExternalProjectPath) {
      throw managedRequestError('externalProjectPath is not supported by this managed API.', 'EXTERNAL_PATH_NOT_ALLOWED');
    }
    if (!path.isAbsolute(externalProjectPath)) {
      throw managedRequestError('externalProjectPath must be absolute.', 'INVALID_EXTERNAL_PROJECT_PATH');
    }
    return {
      projectId: null,
      projectRoot: path.resolve(externalProjectPath),
      legacy: false,
      external: true,
    };
  }

  if (!projectPath) {
    throw managedRequestError('projectId is required.', 'PROJECT_ID_REQUIRED');
  }

  markLegacyProjectPathUsage(request, reply, { route });
  if (projectPath.startsWith('__paper_agent__:')) {
    const legacyId = projectPath.slice('__paper_agent__:'.length).trim();
    if (!legacyId) throw managedRequestError('Paper Agent project id is required.', 'PROJECT_ID_REQUIRED');
    return {
      projectId: legacyId,
      projectRoot: await resolveProjectRoot(legacyId, { allowMissing: false }),
      legacy: true,
    };
  }

  return {
    projectId: null,
    projectRoot: assertLegacyPathWithinDataDir(projectPath, dataDir),
    legacy: true,
  };
}
