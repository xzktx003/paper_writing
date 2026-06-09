// Transfer routes stubbed - LangChain/langgraph dependency removed
export function registerTransferRoutes(fastify) {
  fastify.post('/api/transfer/start', async (request, reply) => {
    reply.code(501).send({ error: 'Transfer agent not available (LangChain removed)' });
  });
 
  fastify.get('/api/transfer/status/:id', async (request, reply) => {
    reply.code(501).send({ error: 'Transfer agent not available (LangChain removed)' });
  });
}
 
