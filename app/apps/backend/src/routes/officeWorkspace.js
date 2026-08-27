import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { getProjectRoot as findProjectRoot } from '../services/projectService.js';
import {
  detectOfficeArtifactCapabilities,
  diffOfficeArtifacts,
  executeOfficeCliTask,
  inspectOfficeArtifact,
  planOfficeCliTask,
} from '../services/officeArtifactService.js';
import {
  buildEvidenceGraph,
  buildHybridRetrievalIndex,
  ingestMeetingTranscript,
  searchHybridEvidence,
} from '../services/officeIntelligenceService.js';
import {
  appendOfficeInboxItem,
  loadOfficeWorkspace,
  recordOfficeEvidenceGraph,
  recordOfficeMeeting,
  recordOfficeSearch,
} from '../services/officeWorkspaceService.js';
import {
  addApprovalEvent,
  addComment,
  addCommentReply,
  createRun,
  decideSuggestion,
  loadOfficeWorkflowState,
  registerConnector,
  saveOfficeWorkflowState,
  summarizeTelemetry,
  transitionRun,
  upsertRecipe,
} from '../services/officeWorkflowService.js';
import { safeJoin } from '../utils/pathSecurity.js';

const TASK_PATH_FIELDS = ['inputPath', 'outputPath', 'specPath', 'patchPath', 'templatePath', 'dataPath', 'sourcePath', 'targetPath'];
const MAX_PUBLIC_COMMAND_TEXT = 8000;

function routeError(message, code = 'INVALID_OFFICE_WORKSPACE_REQUEST', statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function stableId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
}

function cleanText(value, field, max = 4000, { required = false } = {}) {
  if (value == null) {
    if (required) throw routeError(`${field} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw routeError(`${field} must be a string.`);
  const text = value.trim();
  if (required && !text) throw routeError(`${field} is required.`);
  if (text.length > max) throw routeError(`${field} is too long.`);
  return text;
}

function cleanRelativePath(value, field) {
  const relativePath = cleanText(value, field, 500, { required: true }).replace(/\\/g, '/');
  if (relativePath.startsWith('/') || relativePath.includes('\0') || relativePath.split('/').some(part => !part || part === '.' || part === '..')) {
    throw routeError(`${field} must be a safe project-relative path.`);
  }
  return relativePath;
}

function artifactSections(artifact) {
  if (artifact.kind === 'pptx') {
    return artifact.slides.map(slide => ({ id: `${artifact.path}#slide-${slide.index}`, heading: `Slide ${slide.index}`, location: `slide:${slide.index}`, text: slide.text }));
  }
  if (artifact.kind === 'xlsx') {
    return artifact.sheets.flatMap(sheet => sheet.rows.map((row, index) => ({
      id: `${artifact.path}#sheet-${sheet.index}-row-${index + 1}`,
      heading: `Sheet ${sheet.index}`,
      location: `sheet:${sheet.index}:row:${index + 1}`,
      text: row.join(' | '),
    }))).filter(section => section.text.trim());
  }
  if (artifact.kind === 'docx' || artifact.kind === 'text') {
    return (artifact.paragraphs || []).map((text, index) => ({
      id: `${artifact.path}#paragraph-${index + 1}`,
      heading: artifact.kind === 'docx' ? `Paragraph ${index + 1}` : `Line ${index + 1}`,
      location: `${artifact.kind === 'docx' ? 'paragraph' : 'line'}:${index + 1}`,
      text,
    }));
  }
  return [];
}

function inboxItemFromArtifact(artifact) {
  const sections = artifactSections(artifact);
  const status = artifact.availability.status === 'available' ? 'ready' : 'blocked';
  const importedAt = new Date().toISOString();
  return {
    id: `inbox-${stableId(`${artifact.path}:${artifact.mtimeMs}:${artifact.bytes}`)}`,
    sourcePath: artifact.path,
    filename: artifact.name,
    format: artifact.kind,
    status,
    parser: {
      id: artifact.provenance.parser,
      mode: 'local',
    },
    quality: {
      status: status === 'ready' ? (artifact.quality.hasText ? 'complete' : 'partial') : 'unavailable',
      score: status === 'ready' ? (artifact.quality.hasText ? 1 : 0.5) : 0,
      textCharacters: artifact.quality.textChars || 0,
      structured: artifact.quality.hasStructuredContent || false,
    },
    warnings: [
      ...(artifact.warnings || []),
      ...(artifact.availability.reason ? [artifact.availability.reason] : []),
      ...(artifact.availability.action ? [artifact.availability.action] : []),
    ],
    sections,
    chunks: sections.map(section => ({
      id: `chunk-${stableId(section.id)}`,
      text: section.text,
      source: { path: artifact.path, location: section.location, heading: section.heading },
    })),
    importedAt,
  };
}

function workspaceDocuments(workspace) {
  return workspace.inbox
    .filter(item => item.status === 'ready')
    .map(item => ({
      id: item.id,
      path: item.sourcePath,
      title: item.filename,
      text: (item.sections || []).map(section => section.text).filter(Boolean).join('\n'),
      metadata: { parser: item.parser?.id, importedAt: item.importedAt },
    }))
    .filter(document => document.text.trim());
}

function formatCapabilities(capabilities) {
  return [
    {
      id: 'builtin-ooxml',
      label: 'Built-in OOXML reader',
      available: true,
      mode: 'builtin',
      operations: ['inspect', 'extract', 'diff'],
      version: '1',
    },
    ...Object.entries(capabilities).map(([id, capability]) => ({
      id,
      label: capability.label,
      available: capability.status === 'available',
      mode: 'external',
      operations: capability.operations || [],
      reason: capability.reason || capability.action || '',
      version: capability.version || '',
    })),
  ];
}

function withEfficiency(workflow) {
  return { ...workflow, efficiency: summarizeTelemetry(workflow.telemetry || []) };
}

function absoluteTaskOptions(projectRoot, input = {}) {
  const options = { ...input };
  for (const field of TASK_PATH_FIELDS) {
    if (input[field] != null && input[field] !== '') {
      options[field] = safeJoin(projectRoot, cleanRelativePath(input[field], field));
    }
  }
  return options;
}

function publicTaskValue(value, projectRoot) {
  if (Array.isArray(value)) return value.map(item => publicTaskValue(item, projectRoot));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, publicTaskValue(item, projectRoot)]));
  }
  if (typeof value === 'string') {
    const relative = path.relative(projectRoot, value);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return relative.replace(/\\/g, '/');
    let redacted = value;
    const normalizedRoot = path.resolve(projectRoot);
    for (const root of new Set([projectRoot, normalizedRoot, projectRoot.replace(/\\/g, '/'), normalizedRoot.replace(/\\/g, '/')])) {
      if (root) redacted = redacted.replaceAll(root, '[project]');
    }
    return redacted.slice(0, MAX_PUBLIC_COMMAND_TEXT);
  }
  return value;
}

function findRun(workflow, runId) {
  return workflow.runs.find(run => run.id === runId);
}

function findComment(run, commentId) {
  return run?.reviewThreads.flatMap(thread => thread.comments).find(comment => comment.id === commentId);
}

export function registerOfficeWorkspaceRoutes(fastify, options = {}) {
  const resolveProjectRoot = options.resolveProjectRoot || findProjectRoot;
  const capabilityEnv = options.capabilityEnv || process.env;
  const capabilityOptions = () => ({
    env: capabilityEnv,
    ...(options.capabilityAccess ? { access: options.capabilityAccess } : {}),
    ...(options.artifactRunner ? { runner: options.artifactRunner } : {}),
  });

  fastify.get('/api/projects/:id/office-track/workspace', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const [workspace, workflow, capabilities] = await Promise.all([
      loadOfficeWorkspace(projectRoot),
      loadOfficeWorkflowState(projectRoot),
      detectOfficeArtifactCapabilities(capabilityOptions()),
    ]);
    return { workspace, workflow: withEfficiency(workflow), capabilities: formatCapabilities(capabilities) };
  });

  fastify.post('/api/projects/:id/office-track/inbox/import', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const sourcePath = cleanRelativePath(request.body?.sourcePath, 'sourcePath');
    const artifact = await inspectOfficeArtifact({ projectRoot, relativePath: sourcePath });
    const result = await appendOfficeInboxItem(projectRoot, inboxItemFromArtifact(artifact));
    return result;
  });

  fastify.post('/api/projects/:id/office-track/artifacts/plan', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    if (request.body?.operation === 'diff') {
      const sourcePath = cleanRelativePath(request.body.sourcePath, 'sourcePath');
      const targetPath = cleanRelativePath(request.body.targetPath, 'targetPath');
      return { task: { adapter: 'builtin-ooxml', operation: 'diff', sourcePath, targetPath } };
    }
    const task = planOfficeCliTask(absoluteTaskOptions(projectRoot, request.body || {}));
    return { task: publicTaskValue(task, projectRoot) };
  });

  fastify.post('/api/projects/:id/office-track/artifacts/run', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    if (request.body?.operation === 'diff') {
      return { execution: await diffOfficeArtifacts({
        projectRoot,
        sourcePath: cleanRelativePath(request.body.sourcePath, 'sourcePath'),
        targetPath: cleanRelativePath(request.body.targetPath, 'targetPath'),
      }) };
    }
    const taskOptions = absoluteTaskOptions(projectRoot, request.body || {});
    if (taskOptions.outputPath) await fs.mkdir(path.dirname(taskOptions.outputPath), { recursive: true });
    const task = planOfficeCliTask(taskOptions);
    const capabilities = await detectOfficeArtifactCapabilities(capabilityOptions());
    const execution = await executeOfficeCliTask(task, {
      capabilities,
      env: capabilityEnv,
      ...(options.artifactRunner ? { runner: options.artifactRunner } : {}),
    });
    return { execution: publicTaskValue(execution, projectRoot) };
  });

  fastify.post('/api/projects/:id/office-track/connectors', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const workflow = await registerConnector(projectRoot, request.body || {});
    return { connector: workflow.connectors.find(item => item.id === request.body?.id), workflow: withEfficiency(workflow) };
  });

  fastify.post('/api/projects/:id/office-track/recipes', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const workflow = await upsertRecipe(projectRoot, request.body || {});
    return { recipe: workflow.recipes.find(item => item.id === request.body?.id), workflow: withEfficiency(workflow) };
  });

  fastify.post('/api/projects/:id/office-track/runs', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const workflow = await createRun(projectRoot, request.body || {});
    return { run: findRun(workflow, request.body?.id), workflow: withEfficiency(workflow) };
  });

  fastify.post('/api/projects/:id/office-track/runs/:runId/transition', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const workflow = await transitionRun(projectRoot, request.params.runId, request.body || {});
    return { run: findRun(workflow, request.params.runId), workflow: withEfficiency(workflow) };
  });

  fastify.post('/api/projects/:id/office-track/runs/:runId/approvals', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const workflow = await addApprovalEvent(projectRoot, request.params.runId, request.body || {});
    return { run: findRun(workflow, request.params.runId), workflow: withEfficiency(workflow) };
  });

  fastify.post('/api/projects/:id/office-track/review/comments', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const runId = cleanText(request.body?.runId, 'runId', 80, { required: true });
    const workflow = await addComment(projectRoot, runId, request.body || {});
    const run = findRun(workflow, runId);
    return { comment: findComment(run, request.body?.id), run, workflow: withEfficiency(workflow) };
  });

  fastify.post('/api/projects/:id/office-track/review/comments/:commentId/replies', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const runId = cleanText(request.body?.runId, 'runId', 80, { required: true });
    const workflow = await addCommentReply(projectRoot, runId, request.params.commentId, request.body || {});
    const run = findRun(workflow, runId);
    return { comment: findComment(run, request.params.commentId), run, workflow: withEfficiency(workflow) };
  });

  fastify.post('/api/projects/:id/office-track/review/suggestions/:suggestionId/decision', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const runId = cleanText(request.body?.runId, 'runId', 80, { required: true });
    const commentId = cleanText(request.body?.commentId, 'commentId', 80, { required: true });
    const workflow = await decideSuggestion(projectRoot, runId, commentId, {
      ...request.body,
      suggestionId: request.params.suggestionId,
    });
    const run = findRun(workflow, runId);
    const comment = findComment(run, commentId);
    return { suggestion: comment?.suggestion, comment, run, workflow: withEfficiency(workflow) };
  });

  fastify.post('/api/projects/:id/office-track/metrics', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const workflow = await saveOfficeWorkflowState(projectRoot, state => ({ telemetry: [...state.telemetry, request.body || {}] }));
    const efficiency = summarizeTelemetry(workflow.telemetry);
    return { metric: workflow.telemetry.at(-1), efficiency, workflow: { ...workflow, efficiency } };
  });

  fastify.post('/api/projects/:id/office-track/search', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const query = cleanText(request.body?.query, 'query', 2000, { required: true });
    const workspace = await loadOfficeWorkspace(projectRoot);
    const index = buildHybridRetrievalIndex(workspaceDocuments(workspace));
    const result = searchHybridEvidence(index, query, { topK: request.body?.topK });
    const search = { id: `search-${stableId(`${query}:${Date.now()}`)}`, ...result, createdAt: new Date().toISOString() };
    const recorded = await recordOfficeSearch(projectRoot, search);
    return { ...result, workspace: recorded.workspace };
  });

  fastify.post('/api/projects/:id/office-track/evidence/graph', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const workspace = await loadOfficeWorkspace(projectRoot);
    const index = buildHybridRetrievalIndex(workspaceDocuments(workspace));
    const result = buildEvidenceGraph(index, request.body?.claims || [], { topK: request.body?.topK });
    const graph = { id: `graph-${stableId(`${JSON.stringify(result.claims)}:${Date.now()}`)}`, ...result, createdAt: new Date().toISOString() };
    const recorded = await recordOfficeEvidenceGraph(projectRoot, graph);
    return { graph, workspace: recorded.workspace };
  });

  fastify.post('/api/projects/:id/office-track/meetings/import', async (request) => {
    const projectRoot = await resolveProjectRoot(request.params.id);
    const result = ingestMeetingTranscript({
      filename: cleanText(request.body?.filename || 'meeting-transcript.txt', 'filename', 240),
      content: cleanText(request.body?.content, 'content', 1024 * 1024, { required: true }),
    });
    const createdAt = new Date().toISOString();
    const meeting = {
      id: `meeting-${stableId(`${result.source.filename}:${result.summary}:${createdAt}`)}`,
      title: result.workflowDocument.title,
      createdAt,
      ...result,
    };
    const recorded = await recordOfficeMeeting(projectRoot, meeting);
    return { meeting, workspace: recorded.workspace };
  });
}
