const PUBLIC_ROUTES = new Set([
  'GET /api/health',
  'GET /api/ready',
  'GET /api/providers',
]);

function normalizedPath(url) {
  return String(url || '').split('?', 1)[0];
}

function isPublicRequest(request) {
  const route = `${String(request.method || 'GET').toUpperCase()} ${normalizedPath(request.url)}`;
  if (PUBLIC_ROUTES.has(route)) return true;
  return normalizedPath(request.url).startsWith('/api/collab/');
}

function readBearerToken(request) {
  const authHeader = request.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return { token: authHeader.slice(7), schemeValid: true };
  }

  // Browsers cannot attach an Authorization header to WebSocket handshakes.
  // Restrict the query fallback to the two managed WebSocket endpoints only.
  if (request.url.startsWith('/api/terminal/ws')
    || request.url.startsWith('/api/ws/watch')
    || request.url.startsWith('/api/projects/import-arxiv-sse')) {
    const queryToken = request.query?.access_token;
    if (typeof queryToken === 'string' && queryToken) {
      return { token: queryToken, schemeValid: true };
    }
  }

  return { token: '', schemeValid: false };
}
 
export function registerAuthHook(fastify, options = {}) {
  const apiToken = options.apiToken ?? process.env.OPENPRISM_API_TOKEN ?? '';
  if (!apiToken) {
    fastify.log.warn('OPENPRISM_API_TOKEN is not configured; all non-public APIs are disabled.');
  }
  fastify.addHook('onRequest', async (request, reply) => {
    const url = request.url;
 
    if (!url.startsWith('/api/')) return;

    if (isPublicRequest(request)) return;

    if (!apiToken) {
      reply.code(503).send({
        error: 'Protected API disabled until OPENPRISM_API_TOKEN is configured',
        code: 'API_TOKEN_NOT_CONFIGURED',
      });
      return;
    }

    const auth = readBearerToken(request);
    if (!auth.schemeValid) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }
 
    if (auth.token !== apiToken) {
      reply.code(403).send({ error: 'Invalid token' });
      return;
    }
  });
}
 
