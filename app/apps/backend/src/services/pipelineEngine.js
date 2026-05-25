import { randomUUID } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const PIPELINE_STORE = join(process.env.HOME, '.paper-writer', 'pipelines');

// Built-in pipeline definitions
export const PIPELINE_DEFS = {
  'paper-pipeline': {
    name: 'Paper Writing Pipeline',
    description: 'Polish → Review → Revise → Finalize',
    stages: [
      { name: 'polish', skill: 'nature-polishing', description: 'Polish manuscript for publication-quality English', inputType: 'chapter_content', outputType: 'polished_content' },
      { name: 'review', skill: 'academic-paper-reviewer', description: 'Peer review the polished manuscript', inputType: 'polished_content', outputType: 'review_report' },
      { name: 'revise', skill: 'ars-revision', description: 'Revise based on review feedback', inputType: 'polished_content+review_report', outputType: 'revised_content' },
      { name: 'finalize', skill: 'citation-verification', description: 'Final integrity check', inputType: 'revised_content', outputType: 'final_content' },
    ],
  },
  'quick-review': {
    name: 'Quick Review Pipeline',
    description: 'Review → Revise',
    stages: [
      { name: 'review', skill: 'academic-paper-reviewer', description: 'Quick peer review', inputType: 'chapter_content', outputType: 'review_report' },
      { name: 'revise', skill: 'ars-revision', description: 'Revise based on review', inputType: 'chapter_content+review_report', outputType: 'revised_content' },
    ],
  },
};

class Pipeline {
  constructor(id, def, projectId, projectPath, options = {}) {
    this.id = id;
    this.projectId = projectId;
    this.projectPath = projectPath;
    this.def = def;
    this.stages = def.stages.map((s, i) => ({ ...s, index: i, status: 'pending', output: null, error: null, startedAt: null, completedAt: null }));
    this.currentStage = 0;
    this.status = 'created';
    this.results = [];
    this.chapterScope = options.chapterScope || null;
    this.feedback = options.feedback || {};
    this.createdAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id, projectId: this.projectId, projectPath: this.projectPath,
      name: this.def.name, description: this.def.description,
      stages: this.stages, currentStage: this.currentStage,
      status: this.status, results: this.results,
      chapterScope: this.chapterScope, feedback: this.feedback,
      createdAt: this.createdAt,
    };
  }

  async save() {
    const dir = PIPELINE_STORE;
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${this.id}.json`), JSON.stringify(this.toJSON(), null, 2), 'utf-8');
  }

  getCurrentStage() {
    return this.stages[this.currentStage] || null;
  }

  advance(approved, feedbackText) {
    const stage = this.getCurrentStage();
    if (!stage) return;

    if (approved) {
      stage.status = 'completed';
      stage.completedAt = new Date().toISOString();
      this.results.push({ stage: stage.name, output: stage.output });
      this.currentStage++;
      if (this.currentStage >= this.stages.length) {
        this.status = 'completed';
      } else {
        this.status = 'running';
        this.getCurrentStage().status = 'running';
        this.getCurrentStage().startedAt = new Date().toISOString();
      }
    } else {
      // Retry with feedback
      this.feedback[stage.name] = feedbackText || '';
      stage.status = 'pending';
      stage.output = null;
    }
  }

  start() {
    this.status = 'running';
    const first = this.getCurrentStage();
    if (first) {
      first.status = 'running';
      first.startedAt = new Date().toISOString();
    }
  }

  pause() { this.status = 'paused'; }
  resume() { this.status = 'running'; }
  fail(error) { this.status = 'failed'; this.getCurrentStage().error = error; }
}

// In-memory pipeline registry
const pipelines = new Map();

export async function createPipeline(defName, projectId, projectPath, options = {}) {
  const def = PIPELINE_DEFS[defName];
  if (!def) throw new Error(`Unknown pipeline: ${defName}`);

  const id = randomUUID().slice(0, 12);
  const pipeline = new Pipeline(id, def, projectId, projectPath, options);
  pipeline.start();
  pipelines.set(id, pipeline);
  await pipeline.save();
  return pipeline;
}

export function getPipeline(id) {
  return pipelines.get(id) || null;
}

export async function loadPipeline(id) {
  if (pipelines.has(id)) return pipelines.get(id);
  try {
    const data = await readFile(join(PIPELINE_STORE, `${id}.json`), 'utf-8');
    const json = JSON.parse(data);
    const def = Object.values(PIPELINE_DEFS).find(d => d.name === json.name) || json;
    const pipeline = new Pipeline(json.id, { stages: json.stages.map(s => ({ name: s.name, skill: s.skill, description: s.description, inputType: s.inputType, outputType: s.outputType })), name: json.name, description: json.description }, json.projectId, json.projectPath, { chapterScope: json.chapterScope });
    pipeline.currentStage = json.currentStage;
    pipeline.status = json.status;
    pipeline.results = json.results || [];
    pipeline.stages = json.stages;
    pipelines.set(id, pipeline);
    return pipeline;
  } catch {
    return null;
  }
}

export function listPipelines() {
  return Array.from(pipelines.values()).map(p => p.toJSON());
}
