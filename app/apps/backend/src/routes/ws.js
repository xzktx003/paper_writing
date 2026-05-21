import { watchDirectory, unwatchDirectory } from '../services/fileManager.js';

const clients = new Set();

export function registerWsRoutes(fastify) {
  fastify.get('/api/ws/watch', { websocket: true }, (socket, request) => {
    const projectPath = request.query.projectPath;
    clients.add(socket);

    if (projectPath) {
      watchDirectory(projectPath, (event) => {
        const msg = JSON.stringify({ type: 'file_change', ...event });
        for (const client of clients) {
          try { client.send(msg); } catch (e) { clients.delete(client); }
        }
      });
    }

    socket.on('close', () => {
      clients.delete(socket);
      if (clients.size === 0 && projectPath) {
        unwatchDirectory(projectPath);
      }
    });
  });
}
