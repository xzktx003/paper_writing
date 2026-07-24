import {
  createConversation, getConversation, updateConversation,
  listConversations, deleteConversation, addConversationAttachment,
  removeConversationAttachment
} from '../services/conversationStore.js';
import { DATA_DIR } from '../config/constants.js';
import { getProjectRoot } from '../services/projectLocator.js';
import { extractPdfText } from '../services/pdfService.js';

function publicConversation(conv) {
  return {
    ...conv,
    rag_documents: Array.isArray(conv.rag_documents) ? conv.rag_documents : [],
    attachments: (conv.attachments || []).map(({ text, ...attachment }) => ({
      ...attachment,
      textLength: attachment.textLength || text?.length || 0,
    })),
  };
}
 
export function registerConversationRoutes(fastify, {
  dataDir = DATA_DIR,
  resolveProjectRoot = getProjectRoot,
} = {}) {
  const storeOptions = { dataDir, resolveProjectRoot };
  fastify.get('/api/conversations/:projectId', async (request) => {
    return listConversations(request.params.projectId, storeOptions);
  });
 
  fastify.get('/api/conversations/:projectId/:convId', async (request) => {
    return publicConversation(await getConversation(request.params.projectId, request.params.convId, storeOptions));
  });
 
  fastify.post('/api/conversations/:projectId', async (request) => {
    return publicConversation(await createConversation(request.params.projectId, request.body, storeOptions));
  });
 
  fastify.put('/api/conversations/:projectId/:convId', async (request) => {
    return publicConversation(await updateConversation(request.params.projectId, request.params.convId, request.body, storeOptions));
  });
 
  fastify.delete('/api/conversations/:projectId/:convId', async (request) => {
    await deleteConversation(request.params.projectId, request.params.convId, storeOptions);
    return { ok: true };
  });

  fastify.post('/api/conversations/:projectId/:convId/attachments', async (request, reply) => {
    const { name, type, size, dataUrl } = request.body || {};
    const isPdf = String(type || '').toLowerCase().includes('pdf') || String(name || '').toLowerCase().endsWith('.pdf');
    if (!name || !dataUrl || !isPdf) {
      return reply.code(400).send({ error: 'Only PDF conversation attachments are supported.' });
    }
    if (Number(size) > 30 * 1024 * 1024) {
      return reply.code(413).send({ error: 'PDF must be 30 MB or smaller.' });
    }

    const normalizedDataUrl = String(dataUrl).replace(/^data:[^;]+;base64,/, 'data:application/pdf;base64,');
    const text = await extractPdfText(normalizedDataUrl, 50000);
    if (!text) {
      return reply.code(422).send({ error: 'No text could be extracted from this PDF. Scanned PDFs require OCR.' });
    }
    const attachment = await addConversationAttachment(
      request.params.projectId,
      request.params.convId,
      { name, type: type || 'application/pdf', size, text },
      storeOptions,
    );
    const { text: _, ...metadata } = attachment;
    return { ok: true, attachment: metadata };
  });

  fastify.delete('/api/conversations/:projectId/:convId/attachments/:attachmentId', async (request, reply) => {
    const removed = await removeConversationAttachment(
      request.params.projectId,
      request.params.convId,
      request.params.attachmentId,
      storeOptions
    );
    if (!removed) return reply.code(404).send({ error: 'Attachment not found.' });
    return { ok: true };
  });
}
 
