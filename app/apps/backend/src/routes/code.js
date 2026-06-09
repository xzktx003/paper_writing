import { executeScript, executeCommand } from '../services/codeExecutor.js';
import { readTextFile, writeTextFile, listDir } from '../services/fileManager.js';
import { safeJoin, assertWithinDataDir, validateCommand } from '../utils/pathSecurity.js';
 
export function registerCodeRoutes(fastify) {
  fastify.post('/api/code/read', async (request) => {
    const { projectPath, filePath } = request.body;
    assertWithinDataDir(projectPath);
    const fullPath = safeJoin(projectPath, 'code', filePath);
    const content = await readTextFile(fullPath);
    return { filePath, content };
  });
 
  fastify.post('/api/code/write', async (request) => {
    const { projectPath, filePath, content } = request.body;
    assertWithinDataDir(projectPath);
    const fullPath = safeJoin(projectPath, 'code', filePath);
    await writeTextFile(fullPath, content);
    return { ok: true };
  });
 
  fastify.post('/api/code/run', async (request) => {
    const { projectPath, scriptPath, args } = request.body;
    assertWithinDataDir(projectPath);
    const cwd = safeJoin(projectPath, 'code');
    const fullScript = safeJoin(cwd, scriptPath);
    const result = await executeScript(fullScript, { cwd, args });
    return result;
  });
 
  fastify.post('/api/code/exec', async (request) => {
    const { projectPath, command } = request.body;
    assertWithinDataDir(projectPath);
    validateCommand(command);
    const cwd = safeJoin(projectPath, 'code');
    const result = await executeCommand(command, { cwd });
    return result;
  });
 
  fastify.post('/api/code/tree', async (request) => {
    const { projectPath } = request.body;
    assertWithinDataDir(projectPath);
    return listDir(safeJoin(projectPath, 'code'));
  });
}
 
