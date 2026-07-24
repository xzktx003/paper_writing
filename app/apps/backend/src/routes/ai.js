import { chatCompletion, chatWithTools, chatCompletionStream } from '../services/llmService.js';
import { assemblePrompt, getSkill } from '../services/skillEngine.js';
import { recordSkillRun, recordSkillRunsBatch } from '../services/skillReadinessService.js';
import { appendMessage, getConversation } from '../services/conversationStore.js';
import { readTextFile, writeTextFile, listDir } from '../services/fileManager.js';
import { executeScript } from '../services/codeExecutor.js';
import { join, resolve } from 'path';
import { safeJoin } from '../utils/pathSecurity.js';
import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import { getProjectRoot } from '../services/projectService.js';
import { resolveManagedProjectRequest } from '../services/managedProjectContext.js';
import { diffLines } from 'diff';
import { buildRagEvidence, buildRagUsageGuidance } from '../services/paperRagService.js';
import { extractPdfText } from '../services/pdfService.js';

export function normalizeAppliedSkillNames(groups = []) {
  const names = [];
  const seen = new Set();
  for (const group of groups) {
    for (const value of Array.isArray(group) ? group : []) {
      const name = String(value || '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

export function recordAppliedSkillRuns(skillNames, result = {}, options = {}) {
  const recordRun = options.recordRun || recordSkillRun;
  const provenance = result.providerProvenance || {};
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
  const sideEffects = Array.isArray(result.sideEffects) ? result.sideEffects : [];
  const mode = String(result.mode || 'chat');
  const status = String(result.status || 'unknown');
  const errorCode = String(result.errorCode || 'UNKNOWN').slice(0, 64);
  const summary = status === 'success'
    ? `Completed ${mode} request with ${artifacts.length} reviewable artifact${artifacts.length === 1 ? '' : 's'}.`
    : `Failed ${mode} request (${errorCode}).`;

  const entries = normalizeAppliedSkillNames([skillNames]).map((name) => ({ name, result: {
      status,
      outcome: status === 'success' ? 'provider_completed' : status === 'failed' ? 'provider_failed' : 'unknown',
      verificationStatus: 'not_evaluated',
      objectiveStatus: 'not_evaluated',
      scope: result.scope || { projectId: result.projectId, conversationId: result.conversationId },
      kind: 'model-guided-execution',
      durationMs: Math.max(0, Number(result.durationMs || provenance.durationMs || 0)),
      summary,
      provider: provenance.providerId || provenance.provider || result.provider || '',
      model: provenance.model || result.model || '',
      version: provenance.version || result.version || '',
      cost: result.cost || null,
      artifacts,
      sideEffects,
    }}));
  if (options.recordRun) {
    for (const entry of entries) recordRun(entry.name, entry.result);
  } else {
    recordSkillRunsBatch(entries);
  }
}

function safelyRecordAppliedSkillRuns(fastify, skillNames, result) {
  if (skillNames.length === 0) return;
  try {
    recordAppliedSkillRuns(skillNames, result);
  } catch (error) {
    fastify.log.warn({ error: error.message, skillCount: skillNames.length }, 'Unable to persist Skill execution ledger');
  }
}
 
export async function resolveProjectPath(projectPath) {
  if (projectPath && projectPath.startsWith('__paper_agent__:')) {
    const id = projectPath.replace('__paper_agent__:', '');
    return await getProjectRoot(id);
  }
  return projectPath;
}
 
/**
 * Build user message content, optionally including file attachments
 * as base64 vision content blocks for multimodal LLMs (images) or
 * as text content for other file types.
 */
export async function buildUserMessageContent(userMessage, files) {
  if (!files || files.length === 0) return userMessage;

  const content = [];
  // Text part
  if (userMessage && userMessage.trim()) {
    content.push({ type: 'text', text: userMessage });
  }
  
  // Process files
  for (const file of files) {
    const dataUrl = file.dataUrl || '';
    // Extract base64 and mime type from data URL
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)/);
    if (!match) continue;
    
    const mimeType = match[1];
    const base64Data = match[2];
    
    if (file.isImage || mimeType.startsWith('image/')) {
      // Image: send as vision content block
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: base64Data,
        },
      });
    } else if (mimeType.includes('pdf')) {
      // PDF: extract text and include it
      const pdfText = await extractPdfText(dataUrl);
      if (pdfText && pdfText.trim()) {
        const truncated = pdfText.length > 45000 ? pdfText.slice(0, 45000) + '\n...(truncated)' : pdfText;
        content.push({
          type: 'text',
          text: `[Attached PDF: ${file.name}]\n\nPDF Content:\n${truncated}`,
        });
      } else {
        content.push({
          type: 'text',
          text: `[Attached file: ${file.name}] (PDF document - failed to extract text)`,
        });
      }
    } else if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('csv')) {
      // Text-like attachments are decoded and sent as content. Never claim
      // that a file was read when only its filename reached the provider.
      const decoded = Buffer.from(base64Data, 'base64').toString('utf8');
      const truncated = decoded.length > 45_000 ? `${decoded.slice(0, 45_000)}\n...(truncated)` : decoded;
      content.push({
        type: 'text',
        text: `[Attached file: ${file.name}]\n\nFile content:\n${truncated}`,
      });
    } else {
      throw Object.assign(new Error(`Attachment type is not supported: ${mimeType || file.name}`), {
        statusCode: 400,
        code: 'UNSUPPORTED_ATTACHMENT_TYPE',
        attachment: file.name,
        mimeType,
      });
    }
  }
  
  // If no text but has images, add a default prompt
  if (!content.some(c => c.type === 'text')) {
    content.unshift({ type: 'text', text: 'Please analyze the attached content.' });
  }
  return content;
}
 
const TOOL_DEFINITIONS = [
  { name: 'read_chapter', description: 'Read a chapter file', input_schema: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } },
  { name: 'list_chapters', description: 'List all chapter files', input_schema: { type: 'object', properties: {} } },
  { name: 'propose_edit', description: 'Create a reviewable diff for an existing paper file. This does NOT write the file. new_content must contain the COMPLETE updated file, preserving all unchanged content. The user applies it only by clicking Accept in the Diff UI.', input_schema: { type: 'object', properties: { filename: { type: 'string', description: 'Existing project-relative paper file path.' }, new_content: { type: 'string', description: 'Complete contents of the file after the proposed edit, not only the changed paragraph.' } }, required: ['filename', 'new_content'] } },
  { name: 'list_code', description: 'List files and directories under code/ directory', input_schema: { type: 'object', properties: { path: { type: 'string' } } } },
  { name: 'read_code', description: 'Read a file from code/ directory', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_code', description: 'Write a file to code/ directory', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'run_code', description: 'Execute a script in code/ directory', input_schema: { type: 'object', properties: { script: { type: 'string' }, args: { type: 'array', items: { type: 'string' } } }, required: ['script'] } },
  { name: 'read_references', description: 'Read references.bib', input_schema: { type: 'object', properties: {} } },
];
 
const AGENT_TOOL_NAMES = new Set(['read_chapter', 'list_chapters', 'propose_edit', 'read_references']);
 
export function getToolsForMode(mode) {
  if (mode === 'agent') {
    return TOOL_DEFINITIONS.filter(tool => AGENT_TOOL_NAMES.has(tool.name));
  }
  if (mode === 'tools') {
    return TOOL_DEFINITIONS;
  }
  return [];
}
 
export function appendModeGuidance(systemPrompt, mode) {
  const guidance = {
    chat: 'Mode: Chat. Discuss, explain, and reason only. Do not modify files or claim that files were changed.',
    agent: [
      'Mode: Agent. Inspect context and propose paper edits for user confirmation.',
      'Use propose_edit for every requested file change, with the existing project-relative filename and the COMPLETE updated file content, preserving every unchanged section.',
      'propose_edit never writes a file. After calling it, tell the user to review the Diff tab and click Accept or Reject.',
      'Never claim that a file was changed, saved, submitted, or applied merely because propose_edit ran or because the user typed confirm/apply/accept in chat.',
      'For safety, do not directly write files, run code, or perform code-directory workflows.',
    ].join(' '),
    tools: 'Mode: Tools. Use available tools for multi-step tasks, including controlled code/ file work when the user asks for it. Report tool actions and results clearly.',
  }[mode] || 'Mode: Unknown. Ask the user to choose Chat, Agent, or Tools.';
  return [systemPrompt, guidance].filter(Boolean).join('\n\n');
}

export function buildConversationHistory(conv, maxMessages = 30, maxChars = 60000) {
  const history = (conv?.history || [])
    .filter(message => ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string' && message.content.trim())
    .slice(-maxMessages);
  const selected = [];
  let chars = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (chars + message.content.length > maxChars && selected.length > 0) break;
    const remaining = Math.max(0, maxChars - chars);
    selected.unshift({ ...message, content: message.content.slice(-remaining) });
    chars += Math.min(message.content.length, remaining);
    if (chars >= maxChars) break;
  }
  return selected;
}

export function buildConversationAttachmentMessages(conv, maxChars = 80000) {
  const attachments = (conv?.attachments || []).filter(item => item?.text?.trim());
  if (attachments.length === 0) return [];

  const sections = [];
  let remaining = maxChars;
  for (const attachment of attachments.slice(-10)) {
    if (remaining <= 0) break;
    const header = `--- PDF: ${attachment.name} ---\n`;
    const text = attachment.text.slice(0, Math.max(0, remaining - header.length));
    sections.push(header + text);
    remaining -= header.length + text.length;
  }
  return [
    {
      role: 'user',
      content: `[System: Persistent PDF context for this conversation]\nThese PDF files were uploaded by the user and their extracted text is available below. Answer questions using this content. Do not claim that the files are unavailable or unreadable when their text appears here.\n\n${sections.join('\n\n')}`,
    },
    {
      role: 'assistant',
      content: `I have access to the persistent PDF context: ${attachments.map(item => item.name).join(', ')}.`,
    },
  ];
}
 
function normalizeCodePath(inputPath = '') {
  return String(inputPath).replace(/\\/g, '/').replace(/^\/+/, '').replace(/^code\/?/, '');
}
 
function resolveCodePath(projectPath, inputPath = '') {
  const codeRoot = resolve(projectPath, 'code');
  return safeJoin(codeRoot, normalizeCodePath(inputPath));
}
 
/** Build auto-injected context messages based on conversation scope */
async function buildContextMessages(conv, resolvedPath, projectConfig) {
  const ctx = [];
  try {
    if (conv.context_scope.type === 'chapter' && conv.context_scope.file) {
      // Accept any project-relative file path: try direct path first, then sec/, then chapters/
      const fileName = String(conv.context_scope.file || '').replace(/^\/+/, '');
      let chapterContent = '';
      // If path already contains a directory prefix (sec/ or chapters/), use as-is
      if (fileName.startsWith('sec/') || fileName.startsWith('chapters/')) {
        chapterContent = await readTextFile(safeJoin(resolvedPath, fileName)).catch(() => '');
      } else {
        // Bare filename: try sec/ then chapters/ for backward compat
        chapterContent = await readTextFile(join(resolvedPath, 'sec', fileName)).catch(() => '');
        if (!chapterContent) {
          chapterContent = await readTextFile(join(resolvedPath, 'chapters', fileName)).catch(() => '');
        }
        if (!chapterContent) {
          chapterContent = await readTextFile(safeJoin(resolvedPath, fileName)).catch(() => '');
        }
      }
      if (chapterContent) {
        ctx.push({ role: 'user', content: `[System: Current file content — ${conv.context_scope.file}]\n\`\`\`\n${chapterContent.slice(0, 8000)}\n\`\`\`` });
        ctx.push({ role: 'assistant', content: 'I have read the current file content. Ready to help.' });
      }
    } else if (conv.context_scope.type === 'global') {
      const secDir = join(resolvedPath, 'sec');
      const chapDir = join(resolvedPath, 'chapters');
      const dir = existsSync(secDir) ? secDir : (existsSync(chapDir) ? chapDir : null);
      if (dir) {
        const entries = await listDir(dir);
        const texFiles = entries.filter(e => e.type === 'file' && e.name.endsWith('.tex')).slice(0, 10);
        const summaries = [];
        for (const f of texFiles) {
          try {
            const content = await readTextFile(join(dir, f.name));
            summaries.push(`## ${f.name}\n${content.slice(0, 400)}...`);
          } catch {}
        }
        if (summaries.length > 0) {
          ctx.push({ role: 'user', content: `[System: Paper structure overview]\n${summaries.join('\n\n')}` });
          ctx.push({ role: 'assistant', content: 'I have reviewed the paper structure. Ready to help.' });
        }
      }
    }
    // Inject references if not free scope
    if (conv.context_scope.type !== 'free') {
      try {
        const refsPath = join(resolvedPath, 'references.bib');
        if (existsSync(refsPath)) {
          const refs = await readTextFile(refsPath);
          if (refs.trim()) {
            ctx.unshift({ role: 'user', content: `[System: References]\n\`\`\`bibtex\n${refs.slice(0, 4000)}\n\`\`\`` });
            ctx.splice(1, 0, { role: 'assistant', content: 'I have read the references.' });
          }
        }
      } catch {}
    }
  } catch (e) {
    console.warn('Context injection failed:', e.message);
  }
  return ctx;
}

function shouldUseRag({ rag, projectConfig, userMessage }) {
  if (typeof rag?.enabled === 'boolean') return rag.enabled;
  if (typeof projectConfig?.rag_enabled === 'boolean') return projectConfig.rag_enabled;
  if (typeof projectConfig?.rag?.enabled === 'boolean') return projectConfig.rag.enabled;
  return /rag|知识库|证据|文献|论文|pdf|引用|related work|literature/i.test(String(userMessage || ''));
}

export async function buildRagMessages(resolvedPath, userMessage, options = {}) {
  if (!shouldUseRag({ rag: options.rag, projectConfig: options.projectConfig, userMessage })) {
    return { messages: [], evidence: { query: '', context: '', results: [] }, usageGuidance: '' };
  }
  const query = String(options.rag?.query || userMessage || '').trim();
  if (!query) return { messages: [], evidence: { query: '', context: '', results: [] }, usageGuidance: '' };
  const evidence = await buildRagEvidence(resolvedPath, query, {
    limit: options.rag?.limit || options.projectConfig?.rag?.limit || 5,
    docPaths: options.rag?.docPaths,
    fallbackToSelected: Array.isArray(options.rag?.docPaths) && options.rag.docPaths.length > 0,
  }).catch((error) => {
    console.warn('RAG context retrieval failed:', error.message);
    return { query, context: '', results: [], error: error.message };
  });
  const usageGuidance = buildRagUsageGuidance(evidence);
  if (!evidence.context) {
    return { messages: [], evidence, usageGuidance };
  }
  return {
    evidence,
    usageGuidance,
    messages: [
      {
        role: 'user',
        content: `[System: RAG evidence retrieved for the current question]\n${usageGuidance}\n\nRetrieved evidence:\n${evidence.context}`,
      },
      {
        role: 'assistant',
        content: 'I have read the retrieved RAG evidence and will cite only the provided evidence when relevant.',
      },
    ],
  };
}

export function buildRagResponseFields(ragResult) {
  const evidence = ragResult?.evidence || { query: '', context: '', results: [] };
  if (!evidence.query && !evidence.context && !evidence.error) return {};
  return {
    ragContext: evidence.context || undefined,
    ragEvidence: evidence,
    ragUsageGuidance: ragResult?.usageGuidance || undefined,
  };
}
 
export function classifyAIError(err) {
  const status = err.status || err.statusCode;
  if (err.code === 'PROVIDER_CONNECT_TIMEOUT') {
    return 'AI service did not start responding before the connection timeout. Please try again.';
  }
  if (err.code === 'PROVIDER_STREAM_IDLE_TIMEOUT') {
    return 'AI response stopped producing data before it completed. Please try again.';
  }
  if (err.name === 'AbortError' || /^aborted$/i.test(String(err.message || '').trim())) {
    return 'AI response was interrupted before completion. Please try again.';
  }
  switch (status) {
    case 401: return 'Authentication failed. Please check your API key configuration.';
    case 402: return 'API quota exceeded. Please check your billing or upgrade your plan.';
    case 403: return 'Access denied. Your API key does not have permission for this model.';
    case 404: return 'Model not found. Please check your model configuration.';
    case 429: return 'Rate limit exceeded. Please wait a moment and try again.';
    case 500: return 'AI service internal error. Please try again later.';
    case 503: return 'AI service temporarily unavailable. Please try again later.';
    default:
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        return 'Cannot connect to AI service. Please check your network and endpoint configuration.';
      }
      if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
        return 'AI service request timed out. Please try again.';
      }
      return `AI error: ${err.message || String(err)}`;
  }
}

export function buildInterruptedAssistantMessage(partialText, error) {
  const content = String(partialText || '').trimEnd();
  if (!content) return null;
  const message = classifyAIError(error);
  return {
    role: 'assistant',
    content: `${content}\n\n⚠️ Error: ${message}`,
    interrupted: true,
    error_code: error?.code || error?.status || error?.statusCode || 'AI_REQUEST_FAILED',
  };
}
 
export function registerAIRoutes(fastify) {
  // ── SSE Streaming endpoint ──────────────────────────────
  fastify.post('/api/ai/stream', async (request, reply) => {
    const { projectId, conversationProjectId, convId, userMessage, projectConfig, files, rag, model } = request.body;
    const conversationStoreProjectId = conversationProjectId || projectId;
    const modelOverride = model || undefined;

    const { projectRoot: resolvedPath } = await resolveManagedProjectRequest(request, reply, {
      route: 'ai.stream',
    });
    const conv = await getConversation(conversationStoreProjectId, convId);
    await appendMessage(conversationStoreProjectId, convId, { role: 'user', content: userMessage });
 
    const globalSkills = projectConfig?.global_skills || [];
    let chapterSkills = [];
    if (conv.context_scope.type === 'chapter') {
      const chapterConfig = (projectConfig?.chapters || []).find(c => c.file === conv.context_scope.file);
      chapterSkills = chapterConfig?.skills || [];
    }
    const manualSkills = Array.isArray(conv.active_skills) ? conv.active_skills : [];
    const appliedSkillNames = normalizeAppliedSkillNames([globalSkills, chapterSkills, manualSkills])
      .filter(name => Boolean(getSkill(name)));
    const skillRunStartedAt = Date.now();
    const systemPrompt = appendModeGuidance(assemblePrompt({ globalSkills, chapterSkills, manualSkills }), conv.mode);
 
    // Auto context injection: read current chapter / paper structure / references
    const contextMessages = await buildContextMessages(conv, resolvedPath, projectConfig);
    const selectedRagDocuments = Array.isArray(conv.rag_documents) ? conv.rag_documents : [];
    const ragContext = await buildRagMessages(resolvedPath, userMessage, {
      rag: { ...(rag || {}), enabled: selectedRagDocuments.length > 0, docPaths: selectedRagDocuments },
      projectConfig,
    });
    const attachmentMessages = buildConversationAttachmentMessages(conv);
    const conversationHistory = buildConversationHistory(conv);

    // Build user message with optional file attachments (extracts PDF text)
    const userContent = await buildUserMessageContent(userMessage, files);
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
 
    // Abort LLM request when client disconnects
    const abortController = new AbortController();
    const abortOnDisconnect = () => {
      if (!reply.raw.writableEnded) abortController.abort();
    };
    request.raw.once('aborted', abortOnDisconnect);
    reply.raw.once('close', abortOnDisconnect);
 
    const sendEvent = (event, data) => {
      if (abortController.signal.aborted) return;
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    let streamedText = '';
    const forwardToken = (text) => {
      streamedText += text;
      sendEvent('token', { text });
    };
 
    try {
      if (ragContext.evidence.context) {
        sendEvent('rag_context', { evidence: ragContext.evidence });
      }
      // Build messages with conversation history + RAG context + current user message
      const messages = [
        ...contextMessages,
        ...attachmentMessages,
        ...conversationHistory,
        ...(ragContext.messages || []),
        { role: 'user', content: userContent },
      ];
      
      fastify.log.debug({
        messageCount: messages.length,
        ragEvidenceCount: ragContext.evidence?.sources?.length || 0,
      }, 'Prepared AI request');
      
      if (conv.mode === 'chat') {
        const result = await chatCompletionStream({
          systemPrompt, messages, model: modelOverride, projectId: conversationStoreProjectId,
          signal: abortController.signal,
          onToken: forwardToken,
        });
        await appendMessage(conversationStoreProjectId, convId, { role: 'assistant', content: result.fullText });
        safelyRecordAppliedSkillRuns(fastify, appliedSkillNames, {
          status: 'success',
          scope: { projectId: conversationStoreProjectId, conversationId: convId },
          durationMs: Date.now() - skillRunStartedAt,
          mode: conv.mode,
          providerProvenance: result.provenance,
          model: modelOverride,
        });
        sendEvent('done', { fullText: result.fullText, providerProvenance: result.provenance, ...buildRagResponseFields(ragContext) });
      } else {
        // agent/tools mode with streaming
        const result = await chatCompletionStream({
          systemPrompt, messages, tools: getToolsForMode(conv.mode), model: modelOverride, projectId: conversationStoreProjectId,
          signal: abortController.signal,
          onToken: forwardToken,
          onToolUse: async (name, input) => {
            sendEvent('tool_use', { name, input });
            return await executeTool(name, input, resolvedPath);
          },
          onToolResult: (name, result) => {
            const editProposal = parseEditProposal(name, result);
            if (editProposal) {
              sendEvent('edit_proposal', editProposal);
              sendEvent('tool_result', { name, result: `Edit proposal ready for ${editProposal.filename}` });
              return;
            }
            sendEvent('tool_result', { name, result: typeof result === 'string' ? result.slice(0, 2000) : String(result).slice(0, 2000) });
          },
        });
        await appendMessage(conversationStoreProjectId, convId, { role: 'assistant', content: result.fullText });
        safelyRecordAppliedSkillRuns(fastify, appliedSkillNames, {
          status: 'success',
          scope: { projectId: conversationStoreProjectId, conversationId: convId },
          durationMs: Date.now() - skillRunStartedAt,
          mode: conv.mode,
          providerProvenance: result.provenance,
          model: modelOverride,
          sideEffects: conv.mode === 'agent' ? ['proposes-project-edits'] : ['may-execute-project-tools'],
        });
        sendEvent('done', { fullText: result.fullText, ...buildRagResponseFields(ragContext) });
      }
    } catch (err) {
      if (abortController.signal.aborted) return;
      const interruptedMessage = buildInterruptedAssistantMessage(streamedText, err);
      if (interruptedMessage) {
        await appendMessage(conversationStoreProjectId, convId, interruptedMessage).catch((persistError) => {
          fastify.log.warn({ error: persistError.message }, 'Unable to persist interrupted AI response');
        });
      }
      safelyRecordAppliedSkillRuns(fastify, appliedSkillNames, {
        status: 'failed',
        scope: { projectId: conversationStoreProjectId, conversationId: convId },
        durationMs: Date.now() - skillRunStartedAt,
        mode: conv.mode,
        errorCode: err.code || err.status || err.statusCode || 'AI_REQUEST_FAILED',
        model: modelOverride,
      });
      sendEvent('error', { message: classifyAIError(err), code: err.status || 500 });
    }
 
    reply.raw.end();
  });
 
  // ── Legacy non-streaming endpoint ────────────────────────
  fastify.post('/api/ai/send', async (request, reply) => {
    const { projectId, conversationProjectId, convId, userMessage, projectConfig, files, rag, model } = request.body;
    const conversationStoreProjectId = conversationProjectId || projectId;
    const modelOverride = model || undefined;

    const { projectRoot: resolvedPath } = await resolveManagedProjectRequest(request, reply, {
      route: 'ai.send',
    });
    const conv = await getConversation(conversationStoreProjectId, convId);
    await appendMessage(conversationStoreProjectId, convId, { role: 'user', content: userMessage });

    const globalSkills = projectConfig?.global_skills || [];
    let chapterSkills = [];
    if (conv.context_scope.type === 'chapter') {
      const chapterConfig = (projectConfig?.chapters || []).find(c => c.file === conv.context_scope.file);
      chapterSkills = chapterConfig?.skills || [];
    }
    const manualSkills = Array.isArray(conv.active_skills) ? conv.active_skills : [];
    const appliedSkillNames = normalizeAppliedSkillNames([globalSkills, chapterSkills, manualSkills])
      .filter(name => Boolean(getSkill(name)));
    const skillRunStartedAt = Date.now();

    const systemPrompt = appendModeGuidance(assemblePrompt({ globalSkills, chapterSkills, manualSkills }), conv.mode);

    // Auto context injection
    const contextMessages = await buildContextMessages(conv, resolvedPath, projectConfig);
    const selectedRagDocuments = Array.isArray(conv.rag_documents) ? conv.rag_documents : [];
    const ragContext = await buildRagMessages(resolvedPath, userMessage, {
      rag: { ...(rag || {}), enabled: selectedRagDocuments.length > 0, docPaths: selectedRagDocuments },
      projectConfig,
    });
    const attachmentMessages = buildConversationAttachmentMessages(conv);
    const conversationHistory = buildConversationHistory(conv);

    // Build user message with optional file attachments (extracts PDF text)
    const userContent = await buildUserMessageContent(userMessage, files);
    // Build messages with conversation history + RAG context + current user message
    const messages = [
      ...contextMessages,
      ...attachmentMessages,
      ...conversationHistory,
      ...(ragContext.messages || []),
      { role: 'user', content: userContent },
    ];

    try {
      if (conv.mode === 'chat') {
        const response = await chatCompletion({ systemPrompt, messages, model: modelOverride, projectId: conversationStoreProjectId });
        const textBlock = response.content.find(b => b.type === 'text');
        const assistantMsg = textBlock?.text || '';
        await appendMessage(conversationStoreProjectId, convId, { role: 'assistant', content: assistantMsg });
        safelyRecordAppliedSkillRuns(fastify, appliedSkillNames, {
          status: 'success',
          scope: { projectId: conversationStoreProjectId, conversationId: convId },
          durationMs: Date.now() - skillRunStartedAt,
          mode: conv.mode,
          providerProvenance: response.provenance,
          model: modelOverride,
        });
        return { reply: assistantMsg, providerProvenance: response.provenance, ...buildRagResponseFields(ragContext) };
      }
 
      if (conv.mode === 'tools' || conv.mode === 'agent') {
        const editProposals = [];
        const result = await chatWithTools({
          systemPrompt,
          messages,
          tools: getToolsForMode(conv.mode),
          model: modelOverride,
          projectId: conversationStoreProjectId,
          onToolUse: async (name, input) => {
            const toolResult = await executeTool(name, input, resolvedPath);
            const editProposal = parseEditProposal(name, toolResult);
            if (editProposal) editProposals.push(editProposal);
            return toolResult;
          },
        });
        const lastContent = result.response.content;
        const textBlock = lastContent.find(b => b.type === 'text');
        const assistantMsg = textBlock?.text || '';
        await appendMessage(conversationStoreProjectId, convId, { role: 'assistant', content: assistantMsg });
        safelyRecordAppliedSkillRuns(fastify, appliedSkillNames, {
          status: 'success',
          scope: { projectId: conversationStoreProjectId, conversationId: convId },
          durationMs: Date.now() - skillRunStartedAt,
          mode: conv.mode,
          providerProvenance: result.provenance || result.response?.provenance,
          model: modelOverride,
          artifacts: editProposals.map(proposal => proposal.filename).filter(Boolean),
          sideEffects: conv.mode === 'agent' ? ['proposes-project-edits'] : ['may-execute-project-tools'],
        });
        return { reply: assistantMsg, editProposals, ...buildRagResponseFields(ragContext) };
      }

      safelyRecordAppliedSkillRuns(fastify, appliedSkillNames, {
        status: 'failed',
        scope: { projectId: conversationStoreProjectId, conversationId: convId },
        durationMs: Date.now() - skillRunStartedAt,
        mode: conv.mode,
        errorCode: 'UNKNOWN_MODE',
        model: modelOverride,
      });
      return { reply: 'Unknown mode' };
    } catch (err) {
      const errorMsg = classifyAIError(err);
      safelyRecordAppliedSkillRuns(fastify, appliedSkillNames, {
        status: 'failed',
        scope: { projectId: conversationStoreProjectId, conversationId: convId },
        durationMs: Date.now() - skillRunStartedAt,
        mode: conv.mode,
        errorCode: err.code || err.status || err.statusCode || 'AI_REQUEST_FAILED',
        model: modelOverride,
      });
      return { reply: errorMsg, error: true, code: err.status || 500 };
    }
  });
}
 
export async function executeTool(name, input, projectPath) {
  switch (name) {
    case 'read_chapter': {
      // Accept any project-relative path: if already has sec/ or chapters/ prefix, use as-is;
      // otherwise try sec/ then chapters/ for backward compat
      const filename = String(input.filename || '').replace(/^\/+/, '');
      if (filename.startsWith('sec/') || filename.startsWith('chapters/')) {
        return await readTextFile(safeJoin(projectPath, filename)).catch(() => '');
      }
      // Bare filename: try sec/ then chapters/
      const secPath = join(projectPath, 'sec', filename);
      const chapPath = join(projectPath, 'chapters', filename);
      try { return await readTextFile(secPath); } catch { /* fall through */ }
      return await readTextFile(chapPath);
    }
    case 'list_chapters': {
      const secDir = join(projectPath, 'sec');
      const chapDir = join(projectPath, 'chapters');
      const dir = existsSync(secDir) ? secDir : chapDir;
      return JSON.stringify(await listDir(dir));
    }
    case 'propose_edit': {
      // Read original file content for diff calculation
      const requestedFilename = String(input.filename || '')
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/^\.\//, '');
      if (!requestedFilename) throw new Error('propose_edit requires a project-relative filename.');
      const candidates = requestedFilename.startsWith('sec/') || requestedFilename.startsWith('chapters/')
        ? [requestedFilename]
        : [`sec/${requestedFilename}`, `chapters/${requestedFilename}`, requestedFilename];
      let original = null;
      let filename = null;
      for (const candidate of [...new Set(candidates)]) {
        try {
          original = await readTextFile(safeJoin(projectPath, candidate));
          filename = candidate;
          break;
        } catch {}
      }
      if (original === null || !filename) {
        throw new Error(`Cannot propose edit: file not found (${requestedFilename}).`);
      }
      const normalizedProposal = normalizeProposedFileContent(original, String(input.new_content ?? ''));
      const changes = diffLines(original, normalizedProposal.content);
      const added = changes.filter(c => c.added).reduce((n, c) => n + (c.count || 0), 0);
      const removed = changes.filter(c => c.removed).reduce((n, c) => n + (c.count || 0), 0);
      return JSON.stringify({
        filename,
        original,
        new_content: normalizedProposal.content,
        stats: { added, removed },
        auto_merged_partial: normalizedProposal.autoMerged,
        merge_target: normalizedProposal.target || null,
        action: 'pending_approval'
      });
    }
    case 'list_code': {
      const rel = String(input.path || '').replace(/^\/+/, '').replace(/^code\/?/, '');
      const dir = resolveCodePath(projectPath, rel);
      return JSON.stringify(await listDir(dir));
    }
    case 'read_code':
      return await readTextFile(resolveCodePath(projectPath, input.path));
    case 'write_code':
      await writeTextFile(resolveCodePath(projectPath, input.path), input.content);
      return 'File written successfully';
    case 'run_code': {
      const codeRoot = resolve(projectPath, 'code');
      const args = Array.isArray(input.args) ? input.args.map(String) : [];
      const result = await executeScript(resolveCodePath(projectPath, input.script), { cwd: codeRoot, args });
      return `Exit code: ${result.code}\nStdout:\n${result.stdout}\nStderr:\n${result.stderr}`;
    }
    case 'read_references':
      return await readReferences(projectPath);
    default:
      return `Tool ${name} not implemented`;
  }
}

function paragraphBlocks(content) {
  const blocks = [];
  const separator = /\n\s*\n/g;
  let start = 0;
  let match;
  while ((match = separator.exec(content)) !== null) {
    if (match.index > start) blocks.push({ start, end: match.index, text: content.slice(start, match.index) });
    start = match.index + match[0].length;
  }
  if (start < content.length) blocks.push({ start, end: content.length, text: content.slice(start) });
  return blocks;
}

function proseTokens(content) {
  const stopwords = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'into', 'their', 'which', 'such', 'must', 'across', 'these', 'they', 'have', 'been', 'were', 'are', 'for', 'not', 'but']);
  const normalized = String(content || '')
    .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, ' ')
    .replace(/[{}~\\]/g, ' ')
    .toLowerCase();
  return new Set((normalized.match(/[a-z][a-z-]{2,}/g) || []).filter(token => !stopwords.has(token)));
}

function tokenOverlap(left, right) {
  const leftTokens = proseTokens(left);
  const rightTokens = proseTokens(right);
  if (leftTokens.size < 6 || rightTokens.size < 6) return 0;
  let common = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) common += 1;
  return common / Math.min(leftTokens.size, rightTokens.size);
}

export function normalizeProposedFileContent(original, proposed) {
  const source = String(original || '');
  const candidate = String(proposed || '');
  if (!candidate.trim()) throw new Error('Partial-file proposal rejected: new_content is empty.');

  const looksDestructivelyShort = source.length >= 500 && candidate.length < source.length * 0.7;
  if (!looksDestructivelyShort) return { content: candidate, autoMerged: false, target: null };

  const candidateBlocks = paragraphBlocks(candidate).filter(block => block.text.trim());
  const hasStructuralLatex = /\\(?:documentclass|begin|end|section|subsection|subsubsection|bibliography|addbibresource)\b/.test(candidate);
  if (candidateBlocks.length <= 2 && !hasStructuralLatex) {
    const sourceBlocks = paragraphBlocks(source)
      .filter(block => block.text.trim().length >= 100)
      .filter(block => !/^\s*\\(?:begin|end|item)\b/.test(block.text));
    const ranked = sourceBlocks
      .map(block => ({ ...block, score: tokenOverlap(block.text, candidate) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1];
    if (best && best.score >= 0.28 && (!second || best.score - second.score >= 0.05)) {
      return {
        content: source.slice(0, best.start) + candidate.trim() + source.slice(best.end),
        autoMerged: true,
        target: { start: best.start, end: best.end, overlap: Number(best.score.toFixed(3)) },
      };
    }
  }

  throw new Error(
    'Partial-file proposal rejected to prevent data loss: new_content is much shorter than the original file and could not be matched safely to one paragraph. Read the complete file and retry with the full updated content.'
  );
}

export function parseEditProposal(name, result) {
  if (name !== 'propose_edit') return null;
  try {
    const proposal = typeof result === 'string' ? JSON.parse(result) : result;
    if (!proposal || typeof proposal.filename !== 'string' || typeof proposal.original !== 'string' || typeof proposal.new_content !== 'string') {
      return null;
    }
    return {
      filename: proposal.filename,
      original: proposal.original,
      new_content: proposal.new_content,
      stats: {
        added: Number(proposal.stats?.added) || 0,
        removed: Number(proposal.stats?.removed) || 0,
      },
    };
  } catch {
    return null;
  }
}
 
async function readReferences(projectPath) {
  const defaultPath = join(projectPath, 'references.bib');
  if (existsSync(defaultPath)) return await readTextFile(defaultPath);
 
  const entries = await fs.readdir(projectPath, { withFileTypes: true });
  const bib = entries
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.bib'))
    .map(entry => entry.name)
    .sort()[0];
  if (!bib) return 'No .bib file found in project root.';
  return await readTextFile(join(projectPath, bib));
}
 
// ── AI Inline Completion endpoint ──────────────────────────
export function registerAICompletionRoute(fastify) {
  fastify.post('/api/ai/complete', async (request) => {
    const { textBefore, textAfter, filename } = request.body || {};
    if (!textBefore && !textAfter) {
      return { ok: false, error: 'No context provided.' };
    }
 
    const systemPrompt = `You are an academic writing assistant specializing in LaTeX and scientific papers. Continue the text naturally from where the cursor is. Output ONLY the continuation text (1-3 sentences). Do not repeat existing text. Do not add explanations. Match the style, language, and tone of the surrounding text.`;
 
    const userContent = [
      filename ? `File: ${filename}` : '',
      `Text before cursor:\n${(textBefore || '').slice(-2000)}`,
      textAfter ? `Text after cursor:\n${(textAfter || '').slice(0, 500)}` : '',
      'Continue writing from the cursor position:'
    ].filter(Boolean).join('\n\n');
 
    try {
      const response = await chatCompletion({
        systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });
      const textBlock = response.content.find(b => b.type === 'text');
      let completion = textBlock?.text || '';
      // Strip thinking tags if model returns them
      completion = completion.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      return { ok: true, completion };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}
 
