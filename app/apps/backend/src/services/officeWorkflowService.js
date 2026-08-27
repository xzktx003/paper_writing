import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

import { safeJoin } from '../utils/pathSecurity.js';

const STATE_PATH = '.openprism/office-workflow.json';
const SCHEMA = 'openprism-office-workflow';
const VERSION = 1;

const CONNECTOR_CAPABILITIES = {
  'local-folder': ['read', 'write', 'watch'],
  webhook: ['receive', 'trigger'],
  'feishu-drive': ['read', 'write', 'share'],
  'feishu-im': ['notify', 'comment', 'approval-link'],
  'feishu-approval': ['submit', 'approve', 'reject', 'timeline'],
  email: ['send', 'receive', 'notify'],
};

const EXTERNAL_CONNECTOR_CONFIG = {
  webhook: ['OFFICE_WEBHOOK_SECRET'],
  'feishu-drive': ['FEISHU_APP_ID', 'FEISHU_APP_SECRET'],
  'feishu-im': ['FEISHU_APP_ID', 'FEISHU_APP_SECRET'],
  'feishu-approval': ['FEISHU_APP_ID', 'FEISHU_APP_SECRET'],
  email: ['OFFICE_EMAIL_SMTP_URL'],
};

const RUN_TRANSITIONS = {
  triggered: new Set(['processing', 'failed']),
  processing: new Set(['review', 'failed']),
  review: new Set(['approved', 'rejected', 'failed']),
  rejected: new Set(['processing', 'failed']),
  approved: new Set(['published', 'failed']),
  published: new Set([]),
  failed: new Set([]),
};
const RECIPE_STEPS = new Set(['ingest', 'extract', 'retrieve', 'draft', 'review', 'approve', 'publish']);

const locks = new Map();

function normalizeRunStatus(status, field) {
  const value = cleanString(status, field, 40, { required: true });
  const normalized = value === 'trigger' ? 'triggered' : value === 'process' ? 'processing' : value;
  if (!RUN_TRANSITIONS[normalized]) throw workflowError(`Unsupported run status: ${value}`);
  return normalized;
}

function workflowError(message, code = 'INVALID_OFFICE_WORKFLOW_STATE', statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

export function defaultOfficeWorkflowState() {
  return {
    version: VERSION,
    schema: SCHEMA,
    connectors: [],
    recipes: [],
    runs: [],
    telemetry: [],
    updatedAt: null,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value, field, max = 1000, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw workflowError(`${field} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw workflowError(`${field} must be a string.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw workflowError(`${field} is required.`);
  if (trimmed.length > max) throw workflowError(`${field} is too long.`);
  return trimmed;
}

function cleanId(value, field) {
  const id = cleanString(value, field, 80, { required: true });
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id)) {
    throw workflowError(`${field} must be a stable id.`);
  }
  return id;
}

function cleanIso(value, field) {
  const timestamp = cleanString(value, field, 40, { required: true });
  if (Number.isNaN(Date.parse(timestamp))) throw workflowError(`${field} must be an ISO timestamp.`);
  return timestamp;
}

function cleanSafeRelativePath(value, field) {
  const normalized = cleanString(value, field, 260, { required: true }).replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.includes('\0')) {
    throw workflowError(`${field} must be a safe relative path.`);
  }
  if (normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    throw workflowError(`${field} must be a safe relative path.`);
  }
  return normalized;
}

function cleanNumber(value, field, { integer = false } = {}) {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw workflowError(`${field} must be a finite number.`);
  }
  if (value < 0) throw workflowError(`${field} cannot be negative.`);
  if (integer && !Number.isInteger(value)) throw workflowError(`${field} must be an integer.`);
  return value;
}

function cleanStringArray(value, field, maxItems = 50) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw workflowError(`${field} must be an array.`);
  if (value.length > maxItems) throw workflowError(`${field} has too many items.`);
  return value.map((item, index) => cleanString(item, `${field}[${index}]`, 200, { required: true }));
}

function cleanActor(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw workflowError(`${field} must be an actor object.`);
  }
  const type = cleanString(value.type, `${field}.type`, 20, { required: true });
  if (!['human', 'ai', 'data', 'system'].includes(type)) throw workflowError(`${field}.type is unsupported.`);
  return {
    type,
    id: cleanString(value.id, `${field}.id`, 120),
    model: cleanString(value.model, `${field}.model`, 120),
    source: cleanString(value.source, `${field}.source`, 260),
    location: cleanString(value.location, `${field}.location`, 160),
  };
}

function cleanProvenance(value, field) {
  const provenance = cleanActor(value, field);
  if (provenance.type === 'human' && !provenance.id) throw workflowError(`${field}.id is required for human provenance.`);
  if (provenance.type === 'ai' && !provenance.id && !provenance.model) throw workflowError(`${field}.id or model is required for AI provenance.`);
  if (provenance.type === 'data' && !provenance.source) throw workflowError(`${field}.source is required for data provenance.`);
  return provenance;
}

function cleanPublicHttpsUrl(value, field) {
  const raw = cleanString(value, field, 500, { required: true });
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw workflowError(`${field} must be a public https URL.`);
  }
  const host = parsed.hostname.toLowerCase();
  const blocked = host === 'localhost'
    || host.endsWith('.local')
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    || host === '0.0.0.0'
    || host === '::1';
  if (parsed.protocol !== 'https:' || blocked) throw workflowError(`${field} must be a public https URL.`);
  return parsed.toString();
}

function connectorStatus(type) {
  if (type === 'local-folder') {
    return {
      configured: true,
      executionReady: true,
      status: 'ready',
      statusReason: 'Local project folder connector is available.',
    };
  }
  const required = EXTERNAL_CONNECTOR_CONFIG[type] || [];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) {
    return {
      configured: false,
      executionReady: false,
      status: 'blocked',
      statusReason: `Connector not configured: missing ${missing.join(', ')}.`,
    };
  }
  return {
    configured: true,
    executionReady: false,
    status: 'blocked',
    statusReason: 'Connector configuration detected, but its execution adapter is not implemented.',
  };
}

function cleanConnector(input, { preserveUpdatedAt = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw workflowError('connector must be an object.');
  const id = cleanId(input.id, 'connector.id');
  const type = cleanString(input.type, 'connector.type', 40, { required: true });
  if (!CONNECTOR_CAPABILITIES[type]) throw workflowError(`Unsupported connector: ${type}`);
  const params = input.params && typeof input.params === 'object' && !Array.isArray(input.params) ? input.params : {};
  const cleanParams = {};
  if (type === 'local-folder') cleanParams.relativePath = cleanSafeRelativePath(params.relativePath, 'connector.params.relativePath');
  if (type === 'webhook') cleanParams.url = cleanPublicHttpsUrl(params.url, 'connector.params.url');
  if (type === 'feishu-drive') cleanParams.folderToken = cleanString(params.folderToken, 'connector.params.folderToken', 200, { required: true });
  if (type === 'feishu-im') cleanParams.chatId = cleanString(params.chatId, 'connector.params.chatId', 200);
  if (type === 'feishu-approval') cleanParams.approvalCode = cleanString(params.approvalCode, 'connector.params.approvalCode', 200);
  if (type === 'email') cleanParams.mailbox = cleanString(params.mailbox, 'connector.params.mailbox', 200, { required: true });
  return {
    id,
    type,
    displayName: cleanString(input.displayName || id, 'connector.displayName', 160),
    params: cleanParams,
    capabilities: CONNECTOR_CAPABILITIES[type],
    ...connectorStatus(type),
    updatedAt: preserveUpdatedAt && input.updatedAt ? cleanIso(input.updatedAt, 'connector.updatedAt') : nowIso(),
  };
}

function cleanRecipe(input, { preserveUpdatedAt = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw workflowError('recipe must be an object.');
  const steps = cleanStringArray(input.steps || ['ingest', 'draft', 'review', 'approve', 'publish'], 'recipe.steps', 12);
  if (!steps.length || steps.some(step => !RECIPE_STEPS.has(step))) throw workflowError('recipe.steps contains an unsupported step.');
  if (!steps.includes('review') || !steps.includes('approve')) throw workflowError('recipe.steps must keep review and approve gates.');
  return {
    id: cleanId(input.id, 'recipe.id'),
    name: cleanString(input.name, 'recipe.name', 160, { required: true }),
    description: cleanString(input.description, 'recipe.description', 1000),
    triggerConnectorId: cleanId(input.triggerConnectorId, 'recipe.triggerConnectorId'),
    publishConnectorId: cleanId(input.publishConnectorId, 'recipe.publishConnectorId'),
    steps,
    humanApprovalRequired: input.humanApprovalRequired !== false,
    enabled: input.enabled !== false,
    version: cleanString(input.version || 'v1', 'recipe.version', 80, { required: true }),
    updatedAt: preserveUpdatedAt && input.updatedAt ? cleanIso(input.updatedAt, 'recipe.updatedAt') : nowIso(),
  };
}

function cleanRun(input, existingRun, { preserveTimestamps = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw workflowError('run must be an object.');
  const trigger = input.trigger || existingRun?.trigger || {};
  return {
    id: cleanId(input.id || existingRun?.id, 'run.id'),
    recipeId: cleanId(input.recipeId || existingRun?.recipeId, 'run.recipeId'),
    status: normalizeRunStatus(input.status || existingRun?.status || 'triggered', 'run.status'),
    trigger: {
      connectorId: trigger.connectorId ? cleanId(trigger.connectorId, 'run.trigger.connectorId') : '',
      kind: cleanString(trigger.kind || 'manual', 'run.trigger.kind', 80),
      actor: cleanActor(trigger.actor || { type: 'system' }, 'run.trigger.actor'),
    },
    timeline: Array.isArray(existingRun?.timeline) ? existingRun.timeline : [],
    reviewThreads: Array.isArray(existingRun?.reviewThreads) ? existingRun.reviewThreads : [],
    approvalEvents: Array.isArray(existingRun?.approvalEvents) ? existingRun.approvalEvents : [],
    createdAt: existingRun?.createdAt ? cleanIso(existingRun.createdAt, 'run.createdAt') : nowIso(),
    updatedAt: preserveTimestamps && existingRun?.updatedAt ? cleanIso(existingRun.updatedAt, 'run.updatedAt') : nowIso(),
  };
}

function cleanTelemetry(input, index) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw workflowError(`telemetry[${index}] must be an object.`);
  const timings = input.timings || {};
  const volumes = input.volumes || {};
  const decisions = input.decisions || {};
  const quality = input.quality || {};
  return {
    id: cleanId(input.id, `telemetry[${index}].id`),
    role: cleanString(input.role, `telemetry[${index}].role`, 100, { required: true }),
    frequency: cleanString(input.frequency, `telemetry[${index}].frequency`, 100),
    version: cleanString(input.version, `telemetry[${index}].version`, 100, { required: true }),
    timings: {
      baselineMinutes: cleanNumber(timings.baselineMinutes, `telemetry[${index}].timings.baselineMinutes`),
      aiMinutes: cleanNumber(timings.aiMinutes, `telemetry[${index}].timings.aiMinutes`),
      reviewMinutes: cleanNumber(timings.reviewMinutes, `telemetry[${index}].timings.reviewMinutes`),
      retryMinutes: cleanNumber(timings.retryMinutes, `telemetry[${index}].timings.retryMinutes`),
      setupMinutes: cleanNumber(timings.setupMinutes, `telemetry[${index}].timings.setupMinutes`),
      maintenanceMinutes: cleanNumber(timings.maintenanceMinutes, `telemetry[${index}].timings.maintenanceMinutes`),
    },
    volumes: {
      documents: cleanNumber(volumes.documents, `telemetry[${index}].volumes.documents`, { integer: true }),
      words: cleanNumber(volumes.words, `telemetry[${index}].volumes.words`, { integer: true }),
      tasks: cleanNumber(volumes.tasks, `telemetry[${index}].volumes.tasks`, { integer: true }),
    },
    decisions: {
      accepted: cleanNumber(decisions.accepted, `telemetry[${index}].decisions.accepted`, { integer: true }) || 0,
      rejected: cleanNumber(decisions.rejected, `telemetry[${index}].decisions.rejected`, { integer: true }) || 0,
    },
    quality: {
      scoreBefore: cleanNumber(quality.scoreBefore, `telemetry[${index}].quality.scoreBefore`),
      scoreAfter: cleanNumber(quality.scoreAfter, `telemetry[${index}].quality.scoreAfter`),
      rubric: cleanString(quality.rubric, `telemetry[${index}].quality.rubric`, 160),
    },
  };
}

function validateState(input, { preserveUpdatedAt = false } = {}) {
  const base = defaultOfficeWorkflowState();
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    version: VERSION,
    schema: SCHEMA,
    connectors: Array.isArray(source.connectors) ? source.connectors.map(connector => cleanConnector(connector, { preserveUpdatedAt })) : base.connectors,
    recipes: Array.isArray(source.recipes) ? source.recipes.map(recipe => cleanRecipe(recipe, { preserveUpdatedAt })) : base.recipes,
    runs: Array.isArray(source.runs) ? source.runs.map(run => cleanRun(run, run, { preserveTimestamps: preserveUpdatedAt })) : base.runs,
    telemetry: Array.isArray(source.telemetry) ? source.telemetry.map(cleanTelemetry) : base.telemetry,
    updatedAt: preserveUpdatedAt ? (source.updatedAt || null) : nowIso(),
  };
}

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
  await fs.rename(tempPath, filePath);
}

async function withProjectLock(projectRoot, action) {
  const key = safeJoin(projectRoot, '.');
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => {
    release = resolve;
  });
  const queued = previous.then(() => current, () => current);
  locks.set(key, queued);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(key) === queued) locks.delete(key);
  }
}

export async function loadOfficeWorkflowState(projectRoot) {
  const filePath = safeJoin(projectRoot, STATE_PATH);
  try {
    return validateState(JSON.parse(await fs.readFile(filePath, 'utf-8')), { preserveUpdatedAt: true });
  } catch (error) {
    if (error.code === 'ENOENT') return defaultOfficeWorkflowState();
    throw error;
  }
}

export async function saveOfficeWorkflowState(projectRoot, patchOrUpdater) {
  return withProjectLock(projectRoot, async () => {
    const previous = await loadOfficeWorkflowState(projectRoot);
    const patch = typeof patchOrUpdater === 'function' ? patchOrUpdater(previous) : patchOrUpdater;
    const next = validateState({ ...previous, ...(patch || {}) });
    await atomicWriteJson(safeJoin(projectRoot, STATE_PATH), next);
    return next;
  });
}

export async function registerConnector(projectRoot, connectorInput) {
  return saveOfficeWorkflowState(projectRoot, (state) => {
    const connector = cleanConnector(connectorInput);
    return {
      connectors: [
        ...state.connectors.filter(item => item.id !== connector.id),
        connector,
      ],
    };
  });
}

export async function upsertRecipe(projectRoot, recipeInput) {
  return saveOfficeWorkflowState(projectRoot, (state) => {
    const recipe = cleanRecipe(recipeInput);
    const triggerConnector = state.connectors.find(item => item.id === recipe.triggerConnectorId);
    const publishConnector = state.connectors.find(item => item.id === recipe.publishConnectorId);
    if (!triggerConnector) throw workflowError(`Unknown trigger connector: ${recipe.triggerConnectorId}`);
    if (!publishConnector) throw workflowError(`Unknown publish connector: ${recipe.publishConnectorId}`);
    return {
      recipes: [...state.recipes.filter(item => item.id !== recipe.id), recipe],
    };
  });
}

export async function createRun(projectRoot, runInput) {
  return saveOfficeWorkflowState(projectRoot, (state) => {
    const run = cleanRun({ ...runInput, status: 'triggered' });
    if (state.runs.some(item => item.id === run.id)) throw workflowError(`Run already exists: ${run.id}`);
    const recipe = state.recipes.find(item => item.id === run.recipeId);
    if (!recipe) throw workflowError(`Unknown recipe: ${run.recipeId}`);
    if (!recipe.enabled) throw workflowError(`Recipe is disabled: ${run.recipeId}`);
    if (run.trigger.connectorId) {
      const connector = state.connectors.find(item => item.id === run.trigger.connectorId);
      if (!connector) throw workflowError(`Unknown trigger connector: ${run.trigger.connectorId}`);
      if (connector.status !== 'ready') throw workflowError(`Trigger connector is not ready: ${connector.statusReason}`);
      if (connector.id !== recipe.triggerConnectorId) throw workflowError('Run trigger connector does not match the recipe.');
    }
    run.timeline.push({ from: null, to: 'triggered', actor: run.trigger.actor, at: nowIso(), notes: 'Run triggered.' });
    return { runs: [...state.runs, run] };
  });
}

export async function transitionRun(projectRoot, runId, transition) {
  return saveOfficeWorkflowState(projectRoot, (state) => {
    const id = cleanId(runId, 'runId');
    const to = normalizeRunStatus(transition?.to, 'transition.to');
    const actor = cleanActor(transition?.actor || { type: 'system' }, 'transition.actor');
    let found = false;
    const runs = state.runs.map((run) => {
      if (run.id !== id) return run;
      found = true;
      if (!RUN_TRANSITIONS[run.status]?.has(to)) {
        throw workflowError(`Illegal run transition: ${run.status} -> ${to}`);
      }
      const recipe = state.recipes.find(item => item.id === run.recipeId);
      if (!recipe) throw workflowError(`Unknown recipe: ${run.recipeId}`);
      if (to === 'approved' && recipe.humanApprovalRequired) {
        const actorIsHuman = actor.type === 'human';
        const hasApproval = run.approvalEvents.some(event => event.status === 'approved' && event.actor?.type === 'human');
        if (!actorIsHuman || !hasApproval) throw workflowError('Human approval event is required before approving this run.');
      }
      if (to === 'published') {
        const connector = state.connectors.find(item => item.id === recipe.publishConnectorId);
        if (!connector || connector.status !== 'ready') {
          throw workflowError(`Publish connector is not ready: ${connector?.statusReason || recipe.publishConnectorId}`);
        }
        if (recipe.humanApprovalRequired && !run.approvalEvents.some(event => event.status === 'approved' && event.actor?.type === 'human')) {
          throw workflowError('Human approval event is required before publishing this run.');
        }
      }
      return {
        ...run,
        status: to,
        updatedAt: nowIso(),
        timeline: [
          ...run.timeline,
          { from: run.status, to, actor, at: nowIso(), notes: cleanString(transition.notes, 'transition.notes', 500) },
        ],
      };
    });
    if (!found) throw workflowError(`Unknown run: ${id}`, 'OFFICE_WORKFLOW_RUN_NOT_FOUND', 404);
    return {
      runs,
    };
  });
}

function cleanSuggestion(value, field) {
  if (!value) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw workflowError(`${field} must be an object.`);
  const diff = value.semanticDiff || {};
  return {
    id: cleanId(value.id, `${field}.id`),
    kind: cleanString(value.kind, `${field}.kind`, 40, { required: true }),
    originalText: cleanString(value.originalText, `${field}.originalText`, 4000),
    suggestedText: cleanString(value.suggestedText, `${field}.suggestedText`, 4000),
    semanticDiff: {
      intent: cleanString(diff.intent, `${field}.semanticDiff.intent`, 160),
      changedClaims: cleanStringArray(diff.changedClaims, `${field}.semanticDiff.changedClaims`, 20),
      risk: cleanString(diff.risk, `${field}.semanticDiff.risk`, 40),
    },
    status: 'pending',
    decidedAt: null,
    decisionProvenance: null,
  };
}

function mapExistingRun(runs, runId, updater) {
  const id = cleanId(runId, 'runId');
  let found = false;
  const nextRuns = runs.map((run) => {
    if (run.id !== id) return run;
    found = true;
    return updater(run);
  });
  if (!found) throw workflowError(`Unknown run: ${id}`, 'OFFICE_WORKFLOW_RUN_NOT_FOUND', 404);
  return nextRuns;
}

function requireReviewStatus(run, operation = 'Review operations') {
  if (run.status !== 'review') {
    throw workflowError(`${operation} require review status; current status is ${run.status}.`);
  }
}

export async function addComment(projectRoot, runId, commentInput) {
  return saveOfficeWorkflowState(projectRoot, (state) => ({
    runs: mapExistingRun(state.runs, runId, (run) => {
      requireReviewStatus(run);
      const comment = {
        id: cleanId(commentInput.id, 'comment.id'),
        paragraphId: cleanString(commentInput.paragraphId, 'comment.paragraphId', 120, { required: true }),
        body: cleanString(commentInput.body, 'comment.body', 4000, { required: true }),
        assignee: cleanString(commentInput.assignee, 'comment.assignee', 120),
        deadline: commentInput.deadline ? cleanIso(commentInput.deadline, 'comment.deadline') : null,
        provenance: cleanProvenance(commentInput.provenance, 'comment.provenance'),
        suggestion: cleanSuggestion(commentInput.suggestion, 'comment.suggestion'),
        replies: [],
        createdAt: nowIso(),
      };
      return {
        ...run,
        reviewThreads: [{ paragraphId: comment.paragraphId, comments: [comment] }, ...run.reviewThreads],
        updatedAt: nowIso(),
      };
    }),
  }));
}

export async function addCommentReply(projectRoot, runId, commentId, replyInput) {
  return saveOfficeWorkflowState(projectRoot, (state) => ({
    runs: mapExistingRun(state.runs, runId, (run) => {
      requireReviewStatus(run);
      let foundComment = false;
      const reviewThreads = run.reviewThreads.map(thread => ({
        ...thread,
        comments: thread.comments.map((comment) => {
          if (comment.id !== cleanId(commentId, 'commentId')) return comment;
          foundComment = true;
          return {
            ...comment,
            replies: [
              ...comment.replies,
              {
                id: cleanId(replyInput.id, 'reply.id'),
                body: cleanString(replyInput.body, 'reply.body', 4000, { required: true }),
                provenance: cleanProvenance(replyInput.provenance, 'reply.provenance'),
                createdAt: nowIso(),
              },
            ],
          };
        }),
      }));
      if (!foundComment) throw workflowError(`Unknown comment: ${commentId}`, 'OFFICE_WORKFLOW_COMMENT_NOT_FOUND', 404);
      return {
        ...run,
        reviewThreads,
        updatedAt: nowIso(),
      };
    }),
  }));
}

export async function decideSuggestion(projectRoot, runId, commentId, decisionInput) {
  return saveOfficeWorkflowState(projectRoot, (state) => ({
    runs: mapExistingRun(state.runs, runId, (run) => {
      requireReviewStatus(run);
      let foundComment = false;
      const reviewThreads = run.reviewThreads.map(thread => ({
        ...thread,
        comments: thread.comments.map((comment) => {
          if (comment.id !== cleanId(commentId, 'commentId')) return comment;
          foundComment = true;
          if (!comment.suggestion) throw workflowError('Comment has no suggestion.');
          const decision = cleanString(decisionInput.decision, 'suggestion.decision', 20, { required: true });
          if (!['accepted', 'rejected'].includes(decision)) throw workflowError('Suggestion decision must be accepted or rejected.');
          if (comment.suggestion.id !== cleanId(decisionInput.suggestionId, 'suggestion.id')) throw workflowError('Suggestion id mismatch.');
          return {
            ...comment,
            suggestion: {
              ...comment.suggestion,
              status: decision,
              decidedAt: nowIso(),
              decisionProvenance: cleanProvenance(decisionInput.provenance, 'suggestion.provenance'),
            },
          };
        }),
      }));
      if (!foundComment) throw workflowError(`Unknown comment: ${commentId}`, 'OFFICE_WORKFLOW_COMMENT_NOT_FOUND', 404);
      return {
        ...run,
        reviewThreads,
        updatedAt: nowIso(),
      };
    }),
  }));
}

export async function addApprovalEvent(projectRoot, runId, eventInput) {
  return saveOfficeWorkflowState(projectRoot, (state) => ({
    runs: mapExistingRun(state.runs, runId, (run) => {
      requireReviewStatus(run, 'Approval events');
      const status = cleanString(eventInput.status, 'approval.status', 40, { required: true });
      if (!['requested', 'approved', 'rejected', 'cancelled'].includes(status)) throw workflowError('approval.status is unsupported.');
      return {
        ...run,
        approvalEvents: [
          ...run.approvalEvents,
          {
            id: cleanId(eventInput.id, 'approval.id'),
            status,
            actor: cleanActor(eventInput.actor, 'approval.actor'),
            notes: cleanString(eventInput.notes, 'approval.notes', 1000),
            at: nowIso(),
          },
        ],
        updatedAt: nowIso(),
      };
    }),
  }));
}

function average(values) {
  const present = values.filter(value => typeof value === 'number' && Number.isFinite(value));
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

export function summarizeTelemetry(items = []) {
  const telemetry = items.map(cleanTelemetry);
  const sufficientItems = telemetry.filter(item => (
    item.timings.baselineMinutes != null
    && item.timings.aiMinutes != null
    && item.timings.reviewMinutes != null
    && (item.volumes.documents || item.volumes.tasks || item.volumes.words)
  ));
  const evidenceStatus = sufficientItems.length ? 'sufficient' : 'insufficient';
  if (!sufficientItems.length) {
    return {
      evidenceStatus,
      metrics: {
        timeSavedMinutes: null,
        timeSavedRatio: null,
        acceptanceRate: null,
        qualityDelta: null,
      },
      coverage: {
        sampleSize: telemetry.length,
        roles: [...new Set(telemetry.map(item => item.role).filter(Boolean))],
        frequencies: [...new Set(telemetry.map(item => item.frequency).filter(Boolean))],
        versions: [...new Set(telemetry.map(item => item.version).filter(Boolean))],
      },
      insufficiencyReasons: ['Missing real baseline, AI, review timing, or volume data.'],
    };
  }
  const saved = sufficientItems.map((item) => {
    const totalAi = item.timings.aiMinutes
      + item.timings.reviewMinutes
      + (item.timings.retryMinutes || 0)
      + (item.timings.setupMinutes || 0)
      + (item.timings.maintenanceMinutes || 0);
    return item.timings.baselineMinutes - totalAi;
  });
  const baseline = average(sufficientItems.map(item => item.timings.baselineMinutes));
  const timeSaved = average(saved);
  const accepted = sufficientItems.reduce((sum, item) => sum + item.decisions.accepted, 0);
  const rejected = sufficientItems.reduce((sum, item) => sum + item.decisions.rejected, 0);
  const qualityDelta = average(
    sufficientItems
      .filter(item => item.quality.scoreBefore != null && item.quality.scoreAfter != null)
      .map(item => item.quality.scoreAfter - item.quality.scoreBefore),
  );
  return {
    evidenceStatus,
    metrics: {
      timeSavedMinutes: Number(timeSaved.toFixed(4)),
      timeSavedRatio: baseline > 0 ? Number((timeSaved / baseline).toFixed(4)) : null,
      acceptanceRate: accepted + rejected > 0 ? Number((accepted / (accepted + rejected)).toFixed(4)) : null,
      qualityDelta: qualityDelta == null ? null : Number(qualityDelta.toFixed(4)),
    },
    coverage: {
      sampleSize: sufficientItems.length,
      roles: [...new Set(sufficientItems.map(item => item.role).filter(Boolean))],
      frequencies: [...new Set(sufficientItems.map(item => item.frequency).filter(Boolean))],
      versions: [...new Set(sufficientItems.map(item => item.version).filter(Boolean))],
    },
    insufficiencyReasons: [],
  };
}
