/**
 * Pipeline 2.0 — Stage Type Definitions
 *
 * Each stage has a `type` that determines which executor handles it.
 * Types: ai | compute | human | citation | compile
 */
 
export const STAGE_TYPES = {
  AI: 'ai',
  COMPUTE: 'compute',
  HUMAN: 'human',
  CITATION: 'citation',
  COMPILE: 'compile',
};
 
export const STAGE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  WAITING: 'waiting',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};
 
/**
 * @typedef {Object} StageDefinition
 * @property {string} name - Unique stage identifier within a pipeline
 * @property {string} type - One of STAGE_TYPES
 * @property {string} description - Human-readable description
 * @property {Object} config - Type-specific configuration
 *
 * AI stage config:
 *   { skill: string, model?: string, maxTokens?: number, temperature?: number }
 *
 * Compute stage config:
 *   { command: string, args?: string[], cwd?: string, timeoutMs?: number }
 *
 * Human stage config:
 *   { prompt: string, actions?: ('approve'|'reject'|'skip'|'edit')[], timeoutMs?: number }
 *
 * Citation stage config:
 *   { action: 'verify'|'format'|'deduplicate'|'discover', bibFile?: string }
 *
 * Compile stage config:
 *   { engine: string, mainFile?: string, outputDir?: string, timeoutMs?: number }
 */
 
export function createStageInstance(def, index) {
  return {
    ...def,
    index,
    status: STAGE_STATUS.PENDING,
    output: null,
    error: null,
    startedAt: null,
    completedAt: null,
    metadata: {},
  };
}
 
export function validateStageDefinition(def) {
  if (!def.name) return 'Stage must have a name';
  if (!def.type || !Object.values(STAGE_TYPES).includes(def.type)) {
    return `Invalid stage type: ${def.type}. Must be one of: ${Object.values(STAGE_TYPES).join(', ')}`;
  }
  if (!def.config) return 'Stage must have a config object';
 
  switch (def.type) {
    case STAGE_TYPES.AI:
      if (!def.config.skill) return 'AI stage requires config.skill';
      break;
    case STAGE_TYPES.COMPUTE:
      if (!def.config.command) return 'Compute stage requires config.command';
      break;
    case STAGE_TYPES.HUMAN:
      if (!def.config.prompt) return 'Human stage requires config.prompt';
      break;
    case STAGE_TYPES.CITATION:
      if (!def.config.action) return 'Citation stage requires config.action';
      break;
    case STAGE_TYPES.COMPILE:
      if (!def.config.engine) return 'Compile stage requires config.engine';
      break;
  }
  return null;
}
 
