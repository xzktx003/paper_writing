import {
  createPipelineV2, getPipelineV2, loadPipelineV2, listPipelinesV2,
  listPresets, getPreset,
  STAGE_STATUS,
} from '../services/pipeline/index.js';
import { readProjectContent } from '../services/contentReader.js';
import { resolveManagedProjectRequest } from '../services/managedProjectContext.js';

export function registerPipelineV2Routes(fastify) {
  // List available pipeline presets
  fastify.get('/api/v2/pipeline/presets', async () => {
    return { presets: listPresets() };
  });

  // Start a new pipeline from preset
  fastify.post('/api/v2/pipeline/start', async (request, reply) => {
    const { preset, chapterScope, customStages } = request.body;

    const context = await resolveManagedProjectRequest(request, reply, {
      route: 'pipeline.start',
    });
    const resolvedPath = context.projectRoot;
    let definition;

    if (customStages) {
      definition = { name: 'Custom Pipeline', description: 'User-defined pipeline', stages: customStages };
    } else {
      definition = getPreset(preset || 'paper-pipeline');
      if (!definition) return { error: `Unknown preset: ${preset}` };
    }

    const pipeline = await createPipelineV2(
      definition,
      context.projectId || request.body.projectPath,
      resolvedPath,
      { chapterScope },
    );
    return pipeline.toJSON();
  });

  // Get pipeline status
  fastify.get('/api/v2/pipeline/:pipelineId', async (request) => {
    const { pipelineId } = request.params;
    let pipeline = getPipelineV2(pipelineId) || await loadPipelineV2(pipelineId);
    if (!pipeline) return { error: 'Pipeline not found' };
    return pipeline.toJSON();
  });

  // List all pipelines
  fastify.get('/api/v2/pipeline', async () => {
    return { pipelines: listPipelinesV2() };
  });

  // Run current stage
  fastify.post('/api/v2/pipeline/:pipelineId/run', async (request) => {
    const { pipelineId } = request.params;
    let pipeline = getPipelineV2(pipelineId) || await loadPipelineV2(pipelineId);
    if (!pipeline) return { error: 'Pipeline not found' };

    const stage = pipeline.getCurrentStage();
    if (!stage) return { error: 'No current stage' };

    if (stage.status === STAGE_STATUS.WAITING) {
      return { error: 'Stage is waiting for human input. Use /resolve endpoint.' };
    }

    if (pipeline.status !== 'running') {
      return { error: `Pipeline is ${pipeline.status}` };
    }

    try {
      const input = await readProjectContent(pipeline.projectPath, pipeline.chapterScope);
      const result = await pipeline.runCurrentStage(input);
      return {
        stage: result.stage,
        status: result.status,
        output: result.output,
        nextStage: pipeline.getCurrentStage()?.name || null,
        pipelineStatus: pipeline.status,
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Resolve human checkpoint
  fastify.post('/api/v2/pipeline/:pipelineId/resolve', async (request) => {
    const { pipelineId } = request.params;
    const { action, feedback } = request.body;
    let pipeline = getPipelineV2(pipelineId) || await loadPipelineV2(pipelineId);
    if (!pipeline) return { error: 'Pipeline not found' };

    try {
      const result = pipeline.resolveHumanCheckpoint(action, feedback);
      await pipeline.save();
      return {
        stage: pipeline.stages[pipeline.currentStage - 1]?.name,
        action,
        result: result.status,
        nextStage: pipeline.getCurrentStage()?.name || null,
        pipelineStatus: pipeline.status,
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Retry current stage with feedback
  fastify.post('/api/v2/pipeline/:pipelineId/retry', async (request) => {
    const { pipelineId } = request.params;
    const { feedback } = request.body;
    let pipeline = getPipelineV2(pipelineId) || await loadPipelineV2(pipelineId);
    if (!pipeline) return { error: 'Pipeline not found' };

    try {
      pipeline.retryCurrentStage(feedback);
      await pipeline.save();
      return { status: 'ready_to_retry', currentStage: pipeline.getCurrentStage()?.name };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Skip current stage
  fastify.post('/api/v2/pipeline/:pipelineId/skip', async (request) => {
    const { pipelineId } = request.params;
    let pipeline = getPipelineV2(pipelineId) || await loadPipelineV2(pipelineId);
    if (!pipeline) return { error: 'Pipeline not found' };

    pipeline.skip();
    await pipeline.save();
    return { nextStage: pipeline.getCurrentStage()?.name || null, pipelineStatus: pipeline.status };
  });

  // Pause pipeline
  fastify.post('/api/v2/pipeline/:pipelineId/pause', async (request) => {
    const { pipelineId } = request.params;
    let pipeline = getPipelineV2(pipelineId) || await loadPipelineV2(pipelineId);
    if (!pipeline) return { error: 'Pipeline not found' };
    pipeline.pause();
    await pipeline.save();
    return { status: 'paused' };
  });

  // Resume pipeline
  fastify.post('/api/v2/pipeline/:pipelineId/resume', async (request) => {
    const { pipelineId } = request.params;
    let pipeline = getPipelineV2(pipelineId) || await loadPipelineV2(pipelineId);
    if (!pipeline) return { error: 'Pipeline not found' };
    pipeline.resume();
    await pipeline.save();
    return { status: 'running' };
  });
}
