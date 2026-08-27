import { getProjectRoot as findProjectRoot } from '../services/projectService.js';
import {
  auditOfficeTrack,
  auditOfficeTrackProject,
  exportOfficeTrackPackage,
  loadOfficeTrackState,
  saveOfficeTrackState,
} from '../services/officeTrackService.js';

export function registerOfficeTrackRoutes(fastify, options = {}) {
  const resolveProjectRoot = options.resolveProjectRoot || findProjectRoot;

  fastify.get('/api/projects/:id/office-track', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const state = await loadOfficeTrackState(projectRoot);
    return { state, audit: auditOfficeTrack(state) };
  });

  fastify.put('/api/projects/:id/office-track', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const state = await saveOfficeTrackState(projectRoot, request.body || {});
    return { state, audit: auditOfficeTrack(state) };
  });

  fastify.post('/api/projects/:id/office-track/audit', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const state = await loadOfficeTrackState(projectRoot);
    return { state, audit: await auditOfficeTrackProject(projectRoot, state) };
  });

  fastify.post('/api/projects/:id/office-track/export', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const state = await loadOfficeTrackState(projectRoot);
    const audit = await auditOfficeTrackProject(projectRoot, state);
    return { state, audit, export: await exportOfficeTrackPackage(projectRoot, state) };
  });
}
