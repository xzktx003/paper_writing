import {
  createConversation, getConversation, updateConversation,
  listConversations, deleteConversation
} from '../services/conversationStore.js';
 
export function registerConversationRoutes(fastify) {
  fastify.get('/api/conversations/:projectId', async (request) => {
    return listConversations(request.params.projectId);
  });
 
  fastify.get('/api/conversations/:projectId/:convId', async (request) => {
    return getConversation(request.params.projectId, request.params.convId);
  });
 
  fastify.post('/api/conversations/:projectId', async (request) => {
    return createConversation(request.params.projectId, request.body);
  });
 
  fastify.put('/api/conversations/:projectId/:convId', async (request) => {
    return updateConversation(request.params.projectId, request.params.convId, request.body);
  });
 
  fastify.delete('/api/conversations/:projectId/:convId', async (request) => {
    await deleteConversation(request.params.projectId, request.params.convId);
    return { ok: true };
  });
}
 
