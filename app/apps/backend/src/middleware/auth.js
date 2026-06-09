const API_TOKEN = process.env.OPENPRISM_API_TOKEN || '';
 
const PUBLIC_PATHS = [
  '/api/health',
  '/api/collab/',
];
 
export function registerAuthHook(fastify) {
  if (!API_TOKEN) {
    return;
  }
 
  fastify.addHook('onRequest', async (request, reply) => {
    const url = request.url;
 
    if (!url.startsWith('/api/')) return;
 
    for (const p of PUBLIC_PATHS) {
      if (url.startsWith(p)) return;
    }
 
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }
 
    const token = authHeader.slice(7);
    if (token !== API_TOKEN) {
      reply.code(403).send({ error: 'Invalid token' });
      return;
    }
  });
}
 
