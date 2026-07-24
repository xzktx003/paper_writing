import { cliTaskAgentService } from '../services/cliTaskAgentService.js';

function routeInput(request) {
  return {
    projectId: String(request.params?.id || '').trim(),
    taskId: String(request.params?.taskId || '').trim(),
  };
}

export function registerCliTaskRoutes(fastify, { service = cliTaskAgentService } = {}) {
  fastify.get('/api/cli-task-providers', async () => ({ providers: await service.listProviders?.() || [] }));

  fastify.get('/api/projects/:id/cli-tasks', async (request) => {
    const { projectId } = routeInput(request);
    return { tasks: await service.listTasks(projectId) };
  });

  fastify.post('/api/projects/:id/cli-tasks', async (request, reply) => {
    const { projectId } = routeInput(request);
    const body = request.body || {};
    if (!String(body.prompt || '').trim()) {
      return reply.code(400).send({ error: 'Task prompt is required', code: 'CLI_TASK_PROMPT_REQUIRED' });
    }
    const task = await service.createTask({
      projectId,
      providerId: String(body.providerId || '').trim(),
      model: String(body.model || '').trim(),
      prompt: String(body.prompt || ''),
      timeoutMs: body.timeoutMs,
    });
    return reply.code(202).send({ task });
  });

  fastify.get('/api/projects/:id/cli-tasks/:taskId', async (request) => {
    const { projectId, taskId } = routeInput(request);
    return { task: await service.getTask(projectId, taskId) };
  });

  fastify.post('/api/projects/:id/cli-tasks/:taskId/accept', async (request) => {
    const { projectId, taskId } = routeInput(request);
    return { task: await service.acceptTask(projectId, taskId) };
  });

  fastify.post('/api/projects/:id/cli-tasks/:taskId/reject', async (request) => {
    const { projectId, taskId } = routeInput(request);
    return { task: await service.rejectTask(projectId, taskId, { reason: String(request.body?.reason || '') }) };
  });

  fastify.post('/api/projects/:id/cli-tasks/:taskId/cancel', async (request) => {
    const { projectId, taskId } = routeInput(request);
    return service.cancelTask(projectId, taskId);
  });
}
