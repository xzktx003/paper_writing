import { executeScript, executeCommand } from '../services/codeExecutor.js';
import { readTextFile, writeTextFile, listDir } from '../services/fileManager.js';
import { join } from 'path';

export function registerCodeRoutes(fastify) {
  fastify.post('/api/code/read', async (request) => {
    const { projectPath, filePath } = request.body;
    const content = await readTextFile(join(projectPath, 'code', filePath));
    return { filePath, content };
  });

  fastify.post('/api/code/write', async (request) => {
    const { projectPath, filePath, content } = request.body;
    await writeTextFile(join(projectPath, 'code', filePath), content);
    return { ok: true };
  });

  fastify.post('/api/code/run', async (request) => {
    const { projectPath, scriptPath, args } = request.body;
    const cwd = join(projectPath, 'code');
    const result = await executeScript(join(cwd, scriptPath), { cwd, args });
    return result;
  });

  fastify.post('/api/code/exec', async (request) => {
    const { projectPath, command } = request.body;
    const cwd = join(projectPath, 'code');
    const result = await executeCommand(command, { cwd });
    return result;
  });

  fastify.post('/api/code/tree', async (request) => {
    const { projectPath } = request.body;
    return listDir(join(projectPath, 'code'));
  });
}
