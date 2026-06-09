import { randomUUID } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { STAGE_TYPES, STAGE_STATUS, createStageInstance, validateStageDefinition } from './stageTypes.js';
import { executeAiStage } from './executors/aiExecutor.js';
import { executeCompileStage } from './executors/compileExecutor.js';
import { executeComputeStage } from './executors/computeExecutor.js';
import { executeHumanStage, resolveHumanStage } from './executors/humanExecutor.js';
import { executeCitationStage } from './executors/citationExecutor.js';
 
const PIPELINE_STORE = join(process.env.HOME, '.paper-writer', 'pipelines');
 
const EXECUTORS = {
  [STAGE_TYPES.AI]: executeAiStage,
  [STAGE_TYPES.COMPILE]: executeCompileStage,
  [STAGE_TYPES.COMPUTE]: executeComputeStage,
  [STAGE_TYPES.HUMAN]: executeHumanStage,
  [STAGE_TYPES.CITATION]: executeCitationStage,
};
 
export class PipelineV2 {
  constructor({ id, name, description, stages, projectId, projectPath, options = {} }) {
    this.id = id || randomUUID().slice(0, 12);
    this.name = name;
    this.description = description;
    this.projectId = projectId;
    this.projectPath = projectPath;
    this.stages = stages.map((def, i) => createStageInstance(def, i));
    this.currentStage = 0;
    this.status = 'created';
    this.chapterScope = options.chapterScope || null;
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.outputs = {};
    this.errors = [];
  }
 
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      projectId: this.projectId,
      projectPath: this.projectPath,
      stages: this.stages,
      currentStage: this.currentStage,
      status: this.status,
      chapterScope: this.chapterScope,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      outputs: this.outputs,
      errors: this.errors,
    };
  }
 
  async save() {
    await mkdir(PIPELINE_STORE, { recursive: true });
    this.updatedAt = new Date().toISOString();
    await writeFile(join(PIPELINE_STORE, `${this.id}.json`), JSON.stringify(this.toJSON(), null, 2), 'utf-8');
  }
 
  getCurrentStage() {
    return this.stages[this.currentStage] || null;
  }
 
  start() {
    this.status = 'running';
    const first = this.getCurrentStage();
    if (first) {
      first.status = STAGE_STATUS.RUNNING;
      first.startedAt = new Date().toISOString();
    }
  }
 
  async runCurrentStage(inputContent, signal) {
    const stage = this.getCurrentStage();
    if (!stage) throw new Error('No current stage');
    if (this.status !== 'running') throw new Error(`Pipeline is ${this.status}, not running`);
 
    const context = {
      input: inputContent,
      projectPath: this.projectPath,
      previousOutputs: this.outputs,
      chapterScope: this.chapterScope,
    };
 
    const executor = EXECUTORS[stage.type];
    if (!executor) throw new Error(`No executor for stage type: ${stage.type}`);
 
    stage.status = STAGE_STATUS.RUNNING;
    stage.startedAt = stage.startedAt || new Date().toISOString();
 
    try {
      const result = await executor(stage, context, signal);
      stage.status = result.status;
      stage.output = result.output;
      stage.error = result.error || null;
      stage.metadata = { ...stage.metadata, ...result.metadata };
 
      if (result.status === STAGE_STATUS.COMPLETED) {
        stage.completedAt = new Date().toISOString();
        this.outputs[stage.name] = result.output;
        this._advanceToNext();
      } else if (result.status === STAGE_STATUS.WAITING) {
        this.status = 'waiting';
      } else if (result.status === STAGE_STATUS.FAILED) {
        this.errors.push({ stage: stage.name, error: result.error });
        this.status = 'failed';
      } else if (result.status === STAGE_STATUS.SKIPPED) {
        stage.completedAt = new Date().toISOString();
        this._advanceToNext();
      }
 
      await this.save();
      return { stage: stage.name, ...result };
    } catch (err) {
      stage.status = STAGE_STATUS.FAILED;
      stage.error = err.message;
      this.status = 'failed';
      this.errors.push({ stage: stage.name, error: err.message });
      await this.save();
      throw err;
    }
  }
 
  resolveHumanCheckpoint(action, feedback) {
    const stage = this.getCurrentStage();
    if (!stage || stage.type !== STAGE_TYPES.HUMAN || stage.status !== STAGE_STATUS.WAITING) {
      throw new Error('No human checkpoint waiting for resolution');
    }
 
    const result = resolveHumanStage(stage, action, feedback);
    stage.status = result.status;
    stage.output = result.output;
    stage.error = result.error || null;
    stage.metadata = { ...stage.metadata, ...result.metadata };
 
    if (result.status === STAGE_STATUS.COMPLETED || result.status === STAGE_STATUS.SKIPPED) {
      stage.completedAt = new Date().toISOString();
      if (result.output) this.outputs[stage.name] = result.output;
      this.status = 'running';
      this._advanceToNext();
    } else if (result.status === STAGE_STATUS.FAILED) {
      this.errors.push({ stage: stage.name, error: result.error });
      this.status = 'failed';
    }
 
    return result;
  }
 
  retryCurrentStage(feedback) {
    const stage = this.getCurrentStage();
    if (!stage) throw new Error('No current stage');
    stage.status = STAGE_STATUS.PENDING;
    stage.output = null;
    stage.error = null;
    if (feedback) {
      stage.metadata.retryFeedback = feedback;
    }
    this.status = 'running';
  }
 
  pause() { this.status = 'paused'; }
  resume() { this.status = 'running'; }
 
  skip() {
    const stage = this.getCurrentStage();
    if (!stage) return;
    stage.status = STAGE_STATUS.SKIPPED;
    stage.completedAt = new Date().toISOString();
    this._advanceToNext();
  }
 
  _advanceToNext() {
    this.currentStage++;
    if (this.currentStage >= this.stages.length) {
      this.status = 'completed';
    } else {
      this.status = 'running';
      const next = this.getCurrentStage();
      next.status = STAGE_STATUS.RUNNING;
      next.startedAt = new Date().toISOString();
    }
  }
}
 
// Registry
const pipelines = new Map();
 
export async function createPipelineV2(definition, projectId, projectPath, options = {}) {
  const errors = [];
  for (const stageDef of definition.stages) {
    const err = validateStageDefinition(stageDef);
    if (err) errors.push(err);
  }
  if (errors.length > 0) throw new Error(`Invalid pipeline: ${errors.join('; ')}`);
 
  const pipeline = new PipelineV2({
    name: definition.name,
    description: definition.description,
    stages: definition.stages,
    projectId,
    projectPath,
    options,
  });
  pipeline.start();
  pipelines.set(pipeline.id, pipeline);
  await pipeline.save();
  return pipeline;
}
 
export function getPipelineV2(id) {
  return pipelines.get(id) || null;
}
 
export async function loadPipelineV2(id) {
  if (pipelines.has(id)) return pipelines.get(id);
  try {
    const data = await readFile(join(PIPELINE_STORE, `${id}.json`), 'utf-8');
    const json = JSON.parse(data);
    const pipeline = new PipelineV2({
      id: json.id,
      name: json.name,
      description: json.description,
      stages: json.stages.map(s => ({ name: s.name, type: s.type, description: s.description, config: s.config || {} })),
      projectId: json.projectId,
      projectPath: json.projectPath,
      options: { chapterScope: json.chapterScope },
    });
    pipeline.currentStage = json.currentStage;
    pipeline.status = json.status;
    pipeline.stages = json.stages;
    pipeline.outputs = json.outputs || {};
    pipeline.errors = json.errors || [];
    pipeline.createdAt = json.createdAt;
    pipeline.updatedAt = json.updatedAt;
    pipelines.set(id, pipeline);
    return pipeline;
  } catch {
    return null;
  }
}
 
export function listPipelinesV2() {
  return Array.from(pipelines.values()).map(p => p.toJSON());
}
 
