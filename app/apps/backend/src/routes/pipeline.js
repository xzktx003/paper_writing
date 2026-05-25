import { createPipeline, getPipeline, loadPipeline, PIPELINE_DEFS } from '../services/pipelineEngine.js';
import { assemblePrompt } from '../services/skillEngine.js';
import { chatCompletion } from '../services/llmService.js';
import { readTextFile, listDir } from '../services/fileManager.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { resolveProjectPath } from './ai.js';

async function readStageInput(resolvedPath, stage, pipeline) {
  const secDir = join(resolvedPath, 'sec');
  const chapDir = join(resolvedPath, 'chapters');
  const dir = existsSync(secDir) ? secDir : chapDir;

  let content = '';
  if (pipeline.chapterScope) {
    try { content = await readTextFile(join(dir, pipeline.chapterScope)); } catch {}
  } else {
    const entries = await listDir(dir);
    const texFiles = entries.filter(e => e.type === 'file' && e.name.endsWith('.tex')).sort((a, b) => a.name.localeCompare(b.name));
    const parts = [];
    for (const f of texFiles) {
      try { parts.push(`% === ${f.name} ===\n${await readTextFile(join(dir, f.name))}`); } catch {}
    }
    content = parts.join('\n\n');
  }

  // If stage has feedback from previous retry, append it
  const feedback = pipeline.feedback[stage.name];
  if (feedback) {
    content += `\n\n[Previous reviewer feedback]\n${feedback}`;
  }

  // If stage depends on previous stage output, include it
  if (stage.inputType?.includes('review_report')) {
    const reviewStage = pipeline.stages.find(s => s.outputType === 'review_report' && s.output);
    if (reviewStage?.output) {
      content += `\n\n[Review Report]\n${typeof reviewStage.output === 'string' ? reviewStage.output : JSON.stringify(reviewStage.output)}`;
    }
  }

  return content;
}

export function registerPipelineRoutes(fastify) {
  // List available pipeline types
  fastify.get('/api/pipeline/types', async () => {
    return Object.entries(PIPELINE_DEFS).map(([id, def]) => ({
      id, name: def.name, description: def.description,
      stages: def.stages.map(s => ({ name: s.name, description: s.description })),
    }));
  });

  // Start a new pipeline
  fastify.post('/api/pipeline/start', async (request) => {
    const { pipelineType, projectPath, chapterScope } = request.body;
    const resolvedPath = await resolveProjectPath(projectPath);
    const pipeline = await createPipeline(pipelineType || 'paper-pipeline', projectPath, resolvedPath, { chapterScope });
    return pipeline.toJSON();
  });

  // Get pipeline status
  fastify.get('/api/pipeline/:pipelineId', async (request) => {
    const { pipelineId } = request.params;
    let pipeline = getPipeline(pipelineId);
    if (!pipeline) pipeline = await loadPipeline(pipelineId);
    if (!pipeline) return { error: 'Pipeline not found' };
    return pipeline.toJSON();
  });

  // Execute current stage (call LLM with stage's skill)
  fastify.post('/api/pipeline/:pipelineId/run-stage', async (request) => {
    const { pipelineId } = request.params;
    let pipeline = getPipeline(pipelineId);
    if (!pipeline) pipeline = await loadPipeline(pipelineId);
    if (!pipeline) return { error: 'Pipeline not found' };
    if (pipeline.status !== 'running') return { error: `Pipeline is ${pipeline.status}` };

    const stage = pipeline.getCurrentStage();
    if (!stage) return { error: 'No current stage' };

    try {
      const resolvedPath = await resolveProjectPath(pipeline.projectPath);
      const content = await readStageInput(resolvedPath, stage, pipeline);

      const skillPrompt = assemblePrompt({ manualSkill: stage.skill });
      const systemPrompt = `${skillPrompt}\n\nOutput your result directly. If the output should be structured (like a review report), use clear headings and bullet points.`;

      const response = await chatCompletion({
        systemPrompt,
        messages: [{ role: 'user', content: `Process the following content using the "${stage.name}" workflow:\n\n${content.slice(0, 12000)}` }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      stage.output = textBlock?.text || '';
      stage.status = 'completed';
      stage.completedAt = new Date().toISOString();
      await pipeline.save();

      return { stage: stage.name, output: stage.output, nextStage: pipeline.getCurrentStage()?.name || null, pipelineStatus: pipeline.status };
    } catch (err) {
      stage.status = 'failed';
      stage.error = err.message;
      pipeline.status = 'failed';
      await pipeline.save();
      return { error: err.message };
    }
  });

  // Advance pipeline (approve current stage output)
  fastify.post('/api/pipeline/:pipelineId/advance', async (request) => {
    const { pipelineId } = request.params;
    const { approved, feedback } = request.body;
    let pipeline = getPipeline(pipelineId);
    if (!pipeline) pipeline = await loadPipeline(pipelineId);
    if (!pipeline) return { error: 'Pipeline not found' };

    pipeline.advance(approved, feedback);
    await pipeline.save();
    return pipeline.toJSON();
  });

  // Pause pipeline
  fastify.post('/api/pipeline/:pipelineId/pause', async (request) => {
    const { pipelineId } = request.params;
    let pipeline = getPipeline(pipelineId);
    if (!pipeline) pipeline = await loadPipeline(pipelineId);
    if (!pipeline) return { error: 'Pipeline not found' };
    pipeline.pause();
    await pipeline.save();
    return { status: 'paused' };
  });

  // Resume pipeline
  fastify.post('/api/pipeline/:pipelineId/resume', async (request) => {
    const { pipelineId } = request.params;
    let pipeline = getPipeline(pipelineId);
    if (!pipeline) pipeline = await loadPipeline(pipelineId);
    if (!pipeline) return { error: 'Pipeline not found' };
    pipeline.resume();
    await pipeline.save();
    return { status: 'running' };
  });
}
