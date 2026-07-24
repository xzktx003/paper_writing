import { watchDirectory, unwatchDirectory } from '../services/fileManager.js';
import { assertWithinDataDir } from '../utils/pathSecurity.js';
import { resolveManagedProjectRequest } from '../services/managedProjectContext.js';
 
const projectClients = new Map();
 
export function registerWsRoutes(fastify) {
  fastify.get('/api/ws/watch', { websocket: true }, async (connection, request) => {
    const ws = connection;
    let projectPath;
    try {
      ({ projectRoot: projectPath } = await resolveManagedProjectRequest(request, null, {
        source: 'query',
        route: 'watcher.websocket',
      }));
    } catch (error) {
      ws.close(error.statusCode === 400 ? 4003 : 1011, error.message || 'Invalid managed project');
      return;
    }
 
    if (!projectClients.has(projectPath)) {
      projectClients.set(projectPath, new Set());
    }
    const clients = projectClients.get(projectPath);
    clients.add(ws);
 
    if (clients.size === 1) {
      watchDirectory(projectPath, (event) => {
        const msg = JSON.stringify({ type: 'file_change', ...event });
        const targets = projectClients.get(projectPath);
        if (!targets) return;
        for (const client of targets) {
          try { client.send(msg); } catch (e) { targets.delete(client); }
        }
      });
    }
 
    ws.on('close', () => {
      clients.delete(ws);
      if (clients.size === 0) {
        projectClients.delete(projectPath);
        unwatchDirectory(projectPath);
      }
    });
  });
}
 
