import { watchDirectory, unwatchDirectory } from '../services/fileManager.js';
import { assertWithinDataDir } from '../utils/pathSecurity.js';
 
const projectClients = new Map();
 
export function registerWsRoutes(fastify) {
  fastify.get('/api/ws/watch', { websocket: true }, (connection, request) => {
    const ws = connection;
    const projectPath = request.query.projectPath;
 
    if (!projectPath) {
      ws.close(4000, 'projectPath query parameter required');
      return;
    }
 
    // Validate project path is within DATA_DIR
    try {
      assertWithinDataDir(projectPath);
    } catch {
      ws.close(4003, 'Invalid project path');
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
 
