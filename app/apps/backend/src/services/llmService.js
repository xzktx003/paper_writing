import Anthropic from '@anthropic-ai/sdk';
import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';
import { agentProviderRegistry } from './agentProviderRegistry.js';
 
/**
 * Provider abstraction layer for LLM services.
 *
 * Supports:
 *   - "anthropic"            — native Anthropic Messages API (default)
 *   - "openai-compatible"    — OpenAI Chat Completions API (GPT, DeepSeek, etc.)
 */
 
/* ── shared state ─────────────────────────────────────── */
 
let currentProvider = null;
let currentLLMConfig = { endpoint: '', apiKey: '', model: '' };
 
const MAX_FULLTEXT_CHARS = 1_000_000; // 1000K character safety limit
const PROVIDER_RESPONSE_HEADERS_TIMEOUT_MS = 60_000;
const PROVIDER_STREAM_IDLE_TIMEOUT_MS = 120_000;
const PROVIDER_MAX_REDIRECTS = 3;
// A dedicated Agent bypasses NODE_USE_ENV_PROXY/globalAgent DNS resolution so
// the validated address can be pinned into the actual socket connection.
const providerHttpAgent = new http.Agent({ keepAlive: false });
const providerHttpsAgent = new https.Agent({ keepAlive: false });
 
/* ── Anthropic provider ───────────────────────────────── */
 
let anthropicClient = null;
 
function initAnthropic(cfg) {
  const effectiveKey = (cfg.api_key && cfg.api_key.trim()) || "placeholder";
  const opts = { apiKey: effectiveKey, fetch: createProviderPolicyFetch('server') };
  if (cfg.base_url) opts.baseURL = cfg.base_url;
  anthropicClient = new Anthropic(opts);
  anthropicClient._defaultModel = cfg.model || 'claude-sonnet-4-20250514';
}
 
async function anthropicChatCompletion({ systemPrompt, messages, tools, model }) {
  if (!anthropicClient) throw new Error('Anthropic not initialized. Set API key in config.');
  const params = {
    model: model || anthropicClient._defaultModel,
    max_tokens: 8192,
    system: systemPrompt,
    messages,
  };
  if (tools && tools.length > 0) params.tools = tools;
  return anthropicClient.messages.create(params);
}
 
async function anthropicChatWithTools({ systemPrompt, messages, tools, onToolUse, model }) {
  if (!anthropicClient) throw new Error('Anthropic not initialized. Set API key in config.');
  let currentMessages = [...messages];
  const useModel = model || anthropicClient._defaultModel;
  const maxToolRounds = Number(process.env.OPENPRISM_MAX_TOOL_ROUNDS || 6);
  for (let round = 0; round < maxToolRounds; round += 1) {
    const response = await anthropicClient.messages.create({
      model: useModel,
      max_tokens: 8192,
      system: systemPrompt,
      messages: currentMessages,
      tools,
    });
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];
      for (const block of toolUseBlocks) {
        let result;
        try { result = await onToolUse(block.name, block.input); }
        catch (err) { result = `Tool error (${block.name}): ${err.message || String(err)}`; }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }
      currentMessages.push({ role: 'assistant', content: response.content });
      currentMessages.push({ role: 'user', content: toolResults });
    } else {
      return { response, messages: currentMessages };
    }
  }
  return {
    response: { content: [{ type: 'text', text: `Stopped after ${maxToolRounds} tool rounds. Please ask a more specific question.` }] },
    messages: currentMessages,
  };
}
 
/* ── OpenAI-compatible provider ───────────────────────── */
 
let openaiClient = null;
 
async function initOpenAICompat(cfg) {
  let OpenAI;
  try {
    const mod = await import('openai');
    OpenAI = mod.default;
  } catch {
    throw new Error('openai package is not installed. Run: npm install openai');
  }
  // Local vLLM/ollama servers often do not require auth; provide a placeholder
  // so the SDK does not throw "Missing credentials" on empty apiKey.
  const effectiveKey = (cfg.api_key && cfg.api_key.trim()) || "placeholder";
  // Auto-append /v1 if the base URL does not already end with a versioned path.
  // The OpenAI SDK appends /chat/completions to baseURL, so for OpenAI-compatible
  // servers that serve at /v1, the URL must include /v1.
  let baseURL = cfg.base_url || 'https://api.openai.com/v1';
  if (baseURL && !baseURL.match(/\/v\d+$/)) {
    baseURL = baseURL.replace(/\/+$/, '') + '/v1';
  }
  openaiClient = new OpenAI({
    apiKey: effectiveKey,
    baseURL,
    fetch: createProviderPolicyFetch('server'),
    maxRetries: 1,
  });
  openaiClient._defaultModel = cfg.model || 'gpt-4o';
}
 
/** Convert Anthropic-style tool schema to OpenAI function calling format */
function toOpenAITools(tools) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: t.input_schema || t.parameters || { type: 'object', properties: {} },
    },
  }));
}
 
/** Normalize OpenAI response to Anthropic-compatible shape */
function normalizeOpenAIResponse(response) {
  const msg = response.choices?.[0]?.message;
  if (!msg) throw new Error('Empty response from OpenAI-compatible API');
  const content = [];
  if (msg.content) content.push({ type: 'text', text: msg.content });
  const toolCalls = msg.tool_calls || [];
  for (const tc of toolCalls) {
    let input = {};
    try { input = JSON.parse(tc.function.arguments); } catch { input = { raw: tc.function.arguments }; }
    content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
  }
  return {
    content,
    stop_reason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
    usage: { input_tokens: response.usage?.prompt_tokens || 0, output_tokens: response.usage?.completion_tokens || 0 },
  };
}
 
/** Build OpenAI messages array from systemPrompt + Anthropic-style messages */
export function buildOpenAIMessages(systemPrompt, messages) {
  const result = [{ role: 'system', content: systemPrompt || '' }];
  for (const msg of messages) {
    if (msg.role === 'assistant') {
      if (Array.isArray(msg.content)) {
        const textParts = [];
        const toolCalls = [];
        for (const block of msg.content) {
          if (block.type === 'text') textParts.push(block.text);
          if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id, type: 'function',
              function: { name: block.name, arguments: JSON.stringify(block.input) },
            });
          }
        }
        const oaiMsg = { role: 'assistant', content: textParts.join('\n') || null };
        if (toolCalls.length > 0) oaiMsg.tool_calls = toolCalls;
        result.push(oaiMsg);
      } else {
        result.push({ role: 'assistant', content: msg.content });
      }
    } else if (msg.role === 'user' && Array.isArray(msg.content)) {
      const userContent = [];
      for (const block of msg.content) {
        if (block.type === 'tool_result') {
          result.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
          });
        } else if (block.type === 'text') {
          userContent.push({ type: 'text', text: block.text || '' });
        } else if (block.type === 'image' && block.source?.type === 'base64') {
          userContent.push({
            type: 'image_url',
            image_url: {
              url: `data:${block.source.media_type};base64,${block.source.data}`,
            },
          });
        }
      }
      if (userContent.length > 0) result.push({ role: 'user', content: userContent });
    } else {
      result.push({ role: msg.role, content: msg.content });
    }
  }
  return result;
}
 
async function openaiChatCompletion({ systemPrompt, messages, tools, model }) {
  if (!openaiClient) throw new Error('OpenAI-compatible provider not initialized.');
  const params = {
    model: model || openaiClient._defaultModel,
    messages: buildOpenAIMessages(systemPrompt, messages),
    max_tokens: 8192,
  };
  const oaiTools = toOpenAITools(tools);
  if (oaiTools) params.tools = oaiTools;
  return normalizeOpenAIResponse(await openaiClient.chat.completions.create(params));
}
 
async function openaiChatWithTools({ systemPrompt, messages, tools, onToolUse, model }) {
  if (!openaiClient) throw new Error('OpenAI-compatible provider not initialized.');
  let currentMessages = buildOpenAIMessages(systemPrompt, messages);
  const useModel = model || openaiClient._defaultModel;
  const oaiTools = toOpenAITools(tools);
  const maxToolRounds = Number(process.env.OPENPRISM_MAX_TOOL_ROUNDS || 6);
 
  for (let round = 0; round < maxToolRounds; round += 1) {
    const params = { model: useModel, messages: currentMessages, max_tokens: 8192 };
    if (oaiTools) params.tools = oaiTools;
    const response = await openaiClient.chat.completions.create(params);
    const msg = response.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls || [];
 
    if (toolCalls.length === 0) {
      const content = [];
      if (msg?.content) content.push({ type: 'text', text: msg.content });
      return {
        response: { content, stop_reason: 'end_turn', usage: { input_tokens: response.usage?.prompt_tokens || 0, output_tokens: response.usage?.completion_tokens || 0 } },
        messages: currentMessages,
      };
    }
 
    currentMessages.push({
      role: 'assistant',
      content: msg.content || null,
      tool_calls: toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } })),
    });
 
    for (const tc of toolCalls) {
      let input = {};
      try { input = JSON.parse(tc.function.arguments); } catch { input = { raw: tc.function.arguments }; }
      let result;
      try { result = await onToolUse(tc.function.name, input); }
      catch (err) { result = `Tool error (${tc.function.name}): ${err.message || String(err)}`; }
      currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
    }
  }
 
  return {
    response: { content: [{ type: 'text', text: `Stopped after ${maxToolRounds} tool rounds. Please ask a more specific question.` }] },
    messages: currentMessages,
  };
}
 
/* ── Streaming variants ─────────────────────────────── */
 
async function anthropicChatCompletionStream({ systemPrompt, messages, tools, model, onToken, onToolUse, onToolResult, signal, round = 0 }) {
  if (!anthropicClient) throw new Error('Anthropic not initialized.');
  const useModel = model || anthropicClient._defaultModel;
  const params = { model: useModel, max_tokens: 8192, system: systemPrompt, messages, stream: true };
  if (tools && tools.length > 0) params.tools = tools;
 
  const streamOpts = signal ? { signal } : {};
  const stream = anthropicClient.messages.stream(params, streamOpts);
  let fullText = '';
  const toolUseBlocks = [];
  let currentToolId = null;
  let currentToolName = '';
  let currentToolInput = '';
 
  for await (const event of stream) {
    if (event.type === 'content_block_start') {
      if (event.content_block.type === 'tool_use') {
        currentToolId = event.content_block.id;
        currentToolName = event.content_block.name;
        currentToolInput = '';
      }
    } else if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        if (fullText.length < MAX_FULLTEXT_CHARS) {
          fullText += event.delta.text;
          if (onToken) onToken(event.delta.text);
        }
      }
      if (event.delta.type === 'input_json_delta') {
        currentToolInput += event.delta.partial_json;
      }
    } else if (event.type === 'content_block_stop') {
      if (currentToolName && currentToolId) {
        let input = {};
        try { input = JSON.parse(currentToolInput); } catch { input = { raw: currentToolInput }; }
        toolUseBlocks.push({ id: currentToolId, name: currentToolName, input });
        currentToolName = '';
        currentToolId = '';
        currentToolInput = '';
      }
    }
  }
 
  if (toolUseBlocks.length > 0 && onToolUse) {
    const toolResults = [];
    for (const block of toolUseBlocks) {
      let result;
      try { result = await onToolUse(block.name, block.input); }
      catch (err) { result = `Tool error (${block.name}): ${err.message || String(err)}`; }
      if (onToolResult) onToolResult(block.name, result);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }
    const assistantContent = [];
    if (fullText) assistantContent.push({ type: 'text', text: fullText });
    assistantContent.push(...toolUseBlocks.map(b => ({ type: 'tool_use', id: b.id, name: b.name, input: b.input })));
 
    const newMessages = [
      ...messages,
      { role: 'assistant', content: assistantContent },
      { role: 'user', content: toolResults },
    ];
    
    if (round >= (Number(process.env.OPENPRISM_MAX_TOOL_ROUNDS) || 6)) return { fullText };
    
    const nextRes = await anthropicChatCompletionStream({ systemPrompt, messages: newMessages, tools, model, onToken, onToolUse, onToolResult, signal, round: round + 1 });
    return { fullText: fullText + (nextRes.fullText || '') };
  }
 
  return { fullText };
}
 
async function openaiChatCompletionStream({ systemPrompt, messages, tools, model, onToken, onToolUse, onToolResult, signal, round = 0 }) {
  if (!openaiClient) throw new Error('OpenAI-compatible provider not initialized.');
  const useModel = model || openaiClient._defaultModel;
  const oaiMessages = buildOpenAIMessages(systemPrompt, messages);
  const params = { model: useModel, messages: oaiMessages, max_tokens: 8192, stream: true };
  const oaiTools = toOpenAITools(tools);
  if (oaiTools) params.tools = oaiTools;
 
  const stream = await openaiClient.chat.completions.create(params, signal ? { signal } : {});
  let fullText = '';
  const toolCallsMap = new Map();
 
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;
    if (delta.content) {
      if (fullText.length < MAX_FULLTEXT_CHARS) {
        fullText += delta.content;
        if (onToken) onToken(delta.content);
      }
    }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCallsMap.has(idx)) {
          toolCallsMap.set(idx, { id: tc.id || '', name: '', arguments: '' });
        }
        const entry = toolCallsMap.get(idx);
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name += tc.function.name;
        if (tc.function?.arguments) entry.arguments += tc.function.arguments;
      }
    }
  }
 
  if (toolCallsMap.size > 0 && onToolUse) {
    const assistantContent = [];
    if (fullText) assistantContent.push({ type: 'text', text: fullText });
    
    const toolResults = [];
    for (const [, tc] of toolCallsMap) {
      let input = {};
      try { input = JSON.parse(tc.arguments); } catch { input = { raw: tc.arguments }; }
      
      assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
 
      let result;
      try { result = await onToolUse(tc.name, input); }
      catch (err) { result = `Tool error (${tc.name}): ${err.message || String(err)}`; }
      if (onToolResult) onToolResult(tc.name, result);
      
      toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: result });
    }
 
    const newMessages = [
      ...messages,
      { role: 'assistant', content: assistantContent },
      { role: 'user', content: toolResults },
    ];
    
    if (round >= (Number(process.env.OPENPRISM_MAX_TOOL_ROUNDS) || 6)) return { fullText };
    
    const nextRes = await openaiChatCompletionStream({ systemPrompt, messages: newMessages, tools, model, onToken, onToolUse, onToolResult, signal, round: round + 1 });
    return { fullText: fullText + (nextRes.fullText || '') };
  }
 
  return { fullText };
}
 
export async function chatCompletionStream(params) {
  if (!currentProvider) throw new Error('LLM provider not initialized.');
  if (currentProvider.type === 'cli') {
    const response = await currentProvider.chatCompletion(params);
    const fullText = response.content?.filter((block) => block.type === 'text').map((block) => block.text).join('\n') || '';
    params.onToken?.(fullText);
    return { fullText, provenance: response.provenance };
  }
  if (currentProvider.name === 'openai-compatible') {
    return openaiChatCompletionStream(params);
  }
  return anthropicChatCompletionStream(params);
}
 
export function getDefaultModel() {
  if (!currentProvider) return '';
  if (currentProvider.type === 'cli') return currentLLMConfig.model || '';
  return currentProvider.name === 'openai-compatible'
    ? (openaiClient?._defaultModel || '')
    : (anthropicClient?._defaultModel || '');
}
 
/* ── Public API ───────────────────────────────────────── */
 
export async function initLLM(cfg) {
  const provider = cfg.llm_provider || 'anthropic';
  currentLLMConfig = {
    endpoint: cfg.llm_base_url || cfg.claude_base_url || '',
    apiKey: cfg.llm_api_key || cfg.claude_api_key || '',
    model: cfg.llm_model || cfg.claude_model || '',
  };
  registerHttpProviderAdapters(cfg);
  if (provider === 'openai-compatible') {
    await initOpenAICompat({
      api_key: cfg.llm_api_key || cfg.claude_api_key,
      base_url: cfg.llm_base_url || cfg.claude_base_url,
      ca_cert: cfg.llm_ca_cert || cfg.claude_ca_cert,
      model: cfg.llm_model || cfg.claude_model,
    });
    currentProvider = { name: 'openai-compatible', chatCompletion: openaiChatCompletion, chatWithTools: openaiChatWithTools };
    console.log(`  LLM provider: openai-compatible (model: ${cfg.llm_model || cfg.claude_model})`);
  } else if (provider === 'anthropic') {
    initAnthropic({ api_key: cfg.claude_api_key, base_url: cfg.claude_base_url, ca_cert: cfg.claude_ca_cert, model: cfg.claude_model });
    currentProvider = { name: 'anthropic', chatCompletion: anthropicChatCompletion, chatWithTools: anthropicChatWithTools };
    console.log(`  LLM provider: anthropic (model: ${cfg.claude_model})`);
  } else if (provider.endsWith('-cli')) {
    currentProvider = {
      name: provider,
      type: 'cli',
      chatCompletion: (params) => agentProviderRegistry.invoke(provider, {
        ...params,
        projectId: params.projectId,
        model: params.model || cfg.llm_model || '',
      }),
      chatWithTools: () => Promise.reject(Object.assign(
        new Error(`${provider} does not support application-managed tool calling; use Chat mode.`),
        { statusCode: 400 },
      )),
    };
    console.log(`  LLM provider: ${provider} (model: ${cfg.llm_model || 'CLI default'})`);
  } else {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

export function resolveHttpProviderConnectionInput({
  input = {},
  configuredEndpoint,
  configuredApiKey,
  defaultEndpoint = '',
} = {}) {
  const hasRequestEndpoint = Object.prototype.hasOwnProperty.call(input, 'endpoint');
  const hasRequestApiKey = Object.prototype.hasOwnProperty.call(input, 'apiKey');
  if (hasRequestEndpoint !== hasRequestApiKey) {
    throw Object.assign(new Error('A temporary Provider connection test must supply endpoint and apiKey together.'), {
      statusCode: 400,
      code: 'PROVIDER_CREDENTIAL_SOURCE_MISMATCH',
    });
  }
  if (hasRequestEndpoint) {
    return {
      endpoint: String(input.endpoint || '').trim(),
      apiKey: String(input.apiKey || ''),
      source: 'request',
    };
  }
  return {
    endpoint: String(configuredEndpoint || defaultEndpoint || '').trim(),
    apiKey: String(configuredApiKey || ''),
    source: 'server',
  };
}

function registerHttpProviderAdapters(cfg) {
  const openaiListModels = (input = {}) => {
    const connection = resolveHttpProviderConnectionInput({
      input,
      configuredEndpoint: cfg.llm_base_url,
      configuredApiKey: cfg.llm_api_key,
      defaultEndpoint: 'https://api.openai.com/v1',
    });
    return fetchHttpModels(connection.endpoint, connection.apiKey, { source: connection.source });
  };
  const anthropicListModels = (input = {}) => {
    const connection = resolveHttpProviderConnectionInput({
      input,
      configuredEndpoint: cfg.claude_base_url,
      configuredApiKey: cfg.claude_api_key,
      defaultEndpoint: 'https://api.anthropic.com/v1',
    });
    return fetchAnthropicModels(connection.endpoint, connection.apiKey, { source: connection.source });
  };
  agentProviderRegistry.registerHttpProvider({
    id: 'openai-compatible',
    probe: async (input) => {
      const models = await openaiListModels(input);
      return { installed: true, configured: true, auth: { supported: true, available: true }, modelsAvailable: models.length };
    },
    listModels: openaiListModels,
    invoke: openaiChatCompletion,
  });
  agentProviderRegistry.registerHttpProvider({
    id: 'anthropic',
    probe: async (input) => {
      const models = await anthropicListModels(input);
      return { installed: true, configured: true, auth: { supported: true, available: true }, modelsAvailable: models.length };
    },
    listModels: anthropicListModels,
    invoke: anthropicChatCompletion,
  });
}

function endpointPolicyError(message, code) {
  return Object.assign(new Error(message), { statusCode: 400, code });
}

function normalizeAllowedHosts(value = process.env.OPENPRISM_PROVIDER_ALLOWED_HOSTS || '') {
  const entries = Array.isArray(value) ? value : String(value || '').split(',');
  return entries.map(entry => String(entry || '').trim().toLowerCase()).filter(Boolean);
}

function hostMatchesAllowlist(hostname, allowedHosts) {
  const host = String(hostname || '').toLowerCase();
  return normalizeAllowedHosts(allowedHosts).some(pattern => (
    pattern.startsWith('*.')
      ? host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1
      : host === pattern
  ));
}

function isBlockedIpv4(address) {
  const parts = String(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isBlockedIpAddress(address) {
  const normalized = String(address || '').toLowerCase().replace(/^\[|\]$/g, '');
  const family = net.isIP(normalized);
  if (family === 4) return isBlockedIpv4(normalized);
  if (family !== 6) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith('ff');
}

async function defaultProviderLookup(hostname) {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

async function resolveProviderEndpoint(endpoint, {
  source = 'request',
  lookup = defaultProviderLookup,
  allowedHosts = process.env.OPENPRISM_PROVIDER_ALLOWED_HOSTS || '',
} = {}) {
  let parsed;
  try {
    parsed = endpoint instanceof URL ? new URL(endpoint.href) : new URL(String(endpoint || ''));
  } catch {
    throw endpointPolicyError('Provider endpoint must be an absolute URL.', 'PROVIDER_ENDPOINT_INVALID');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw endpointPolicyError('Provider endpoint must use http or https.', 'PROVIDER_ENDPOINT_PROTOCOL_NOT_ALLOWED');
  }
  if (parsed.username || parsed.password) {
    throw endpointPolicyError('Provider endpoint must not contain URL credentials.', 'PROVIDER_ENDPOINT_CREDENTIALS_NOT_ALLOWED');
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname) throw endpointPolicyError('Provider endpoint hostname is required.', 'PROVIDER_ENDPOINT_INVALID');
  const explicitlyAllowed = hostMatchesAllowlist(hostname, allowedHosts);
  const restrictPrivateAddresses = source !== 'server' && !explicitlyAllowed;
  if (restrictPrivateAddresses && (hostname === 'localhost' || hostname.endsWith('.localhost'))) {
    throw endpointPolicyError('Provider endpoint resolves to a local or private address.', 'PROVIDER_ENDPOINT_ADDRESS_NOT_ALLOWED');
  }
  let addresses;
  if (net.isIP(hostname)) {
    addresses = [{ address: hostname, family: net.isIP(hostname) }];
  } else {
    try {
      addresses = await lookup(hostname);
    } catch (error) {
      throw Object.assign(new Error(`Provider endpoint hostname could not be resolved: ${error.message || error}`), {
        statusCode: 400,
        code: 'PROVIDER_ENDPOINT_DNS_FAILED',
      });
    }
  }
  const normalizedAddresses = Array.isArray(addresses) ? addresses : [addresses];
  if (normalizedAddresses.length === 0) {
    throw endpointPolicyError('Provider endpoint hostname did not resolve to an address.', 'PROVIDER_ENDPOINT_DNS_FAILED');
  }
  if (restrictPrivateAddresses && normalizedAddresses.some(result => isBlockedIpAddress(result?.address || result))) {
    throw endpointPolicyError('Provider endpoint resolves to a local, private, link-local, or reserved address.', 'PROVIDER_ENDPOINT_ADDRESS_NOT_ALLOWED');
  }
  const addressesForConnection = normalizedAddresses.map((result) => {
    const address = String(result?.address || result);
    return { address, family: Number(result?.family || net.isIP(address)) };
  });
  return { url: parsed, hostname, addresses: addressesForConnection };
}

export async function validateProviderEndpoint(endpoint, options = {}) {
  return (await resolveProviderEndpoint(endpoint, options)).url;
}

function createPinnedLookup(hostname, addresses) {
  const expectedHostname = String(hostname || '').toLowerCase();
  const pinnedAddresses = addresses.map(({ address, family }) => ({ address, family }));
  return (requestedHostname, options, callback) => {
    const normalizedRequested = String(requestedHostname || '').toLowerCase();
    const done = typeof options === 'function' ? options : callback;
    const lookupOptions = typeof options === 'object' && options ? options : {};
    if (normalizedRequested !== expectedHostname) {
      done(Object.assign(new Error('Provider connection attempted an unexpected DNS lookup.'), {
        code: 'PROVIDER_ENDPOINT_HOST_CHANGED',
      }));
      return;
    }
    if (lookupOptions.all) {
      done(null, pinnedAddresses.map(({ address, family }) => ({ address, family })));
      return;
    }
    const selected = pinnedAddresses[0];
    done(null, selected.address, selected.family);
  };
}

function positiveTimeout(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function providerTimeoutError(message, code) {
  return Object.assign(new Error(message), { code, statusCode: 504 });
}

async function writeProviderRequestBody(request, body) {
  if (body == null) {
    request.end();
    return;
  }
  if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array) {
    request.end(body);
    return;
  }
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    Readable.fromWeb(body).pipe(request);
    return;
  }
  if (typeof body.pipe === 'function') {
    body.pipe(request);
    return;
  }
  request.end(String(body));
}

async function pinnedProviderFetch(url, init, connection) {
  const parsed = url instanceof URL ? url : new URL(String(url));
  const headers = Object.fromEntries(new Headers(init.headers || {}).entries());
  const transport = parsed.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    let responseStarted = false;
    const request = transport.request(parsed, {
      method: init.method || 'GET',
      headers,
      agent: parsed.protocol === 'https:' ? providerHttpsAgent : providerHttpAgent,
      lookup: connection.lookup,
      signal: init.signal,
      ...(parsed.protocol === 'https:' ? { servername: connection.hostname } : {}),
    }, (response) => {
      responseStarted = true;
      clearTimeout(responseHeadersTimer);
      const streamIdleTimeoutMs = positiveTimeout(
        connection.streamIdleTimeoutMs,
        PROVIDER_STREAM_IDLE_TIMEOUT_MS,
      );
      response.setTimeout(streamIdleTimeoutMs, () => {
        response.destroy(providerTimeoutError(
          `Provider response stream was idle for ${streamIdleTimeoutMs} ms.`,
          'PROVIDER_STREAM_IDLE_TIMEOUT',
        ));
      });
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) value.forEach(item => responseHeaders.append(name, item));
        else if (value != null) responseHeaders.set(name, String(value));
      }
      const status = response.statusCode || 500;
      const body = [101, 204, 205, 304].includes(status) ? null : Readable.toWeb(response);
      resolve(new Response(body, {
        status,
        statusText: response.statusMessage || '',
        headers: responseHeaders,
      }));
    });
    const responseHeadersTimeoutMs = positiveTimeout(
      connection.timeoutMs,
      PROVIDER_RESPONSE_HEADERS_TIMEOUT_MS,
    );
    const responseHeadersTimer = setTimeout(() => {
      request.destroy(providerTimeoutError(
        `Provider did not return response headers within ${responseHeadersTimeoutMs} ms.`,
        'PROVIDER_CONNECT_TIMEOUT',
      ));
    }, responseHeadersTimeoutMs);
    responseHeadersTimer.unref?.();
    request.once('error', (error) => {
      clearTimeout(responseHeadersTimer);
      if (!responseStarted) reject(error);
    });
    writeProviderRequestBody(request, init.body).catch(reject);
  });
}

function normalizeProviderFetchInput(endpoint, init = {}) {
  if (typeof Request !== 'undefined' && endpoint instanceof Request) {
    return {
      endpoint: endpoint.url,
      init: {
        method: endpoint.method,
        headers: endpoint.headers,
        body: endpoint.body,
        signal: endpoint.signal,
        ...init,
      },
    };
  }
  return { endpoint, init };
}

function createProviderPolicyFetch(source) {
  return (endpoint, init = {}) => fetchWithProviderEndpointPolicy(endpoint, init, { source });
}

export async function fetchWithProviderEndpointPolicy(endpoint, init = {}, {
  source = 'request',
  lookup = defaultProviderLookup,
  allowedHosts = process.env.OPENPRISM_PROVIDER_ALLOWED_HOSTS || '',
  fetchImpl = pinnedProviderFetch,
  maxRedirects = PROVIDER_MAX_REDIRECTS,
  timeoutMs = positiveTimeout(
    process.env.OPENPRISM_PROVIDER_RESPONSE_HEADERS_TIMEOUT_MS,
    PROVIDER_RESPONSE_HEADERS_TIMEOUT_MS,
  ),
  streamIdleTimeoutMs = positiveTimeout(
    process.env.OPENPRISM_PROVIDER_STREAM_IDLE_TIMEOUT_MS,
    PROVIDER_STREAM_IDLE_TIMEOUT_MS,
  ),
} = {}) {
  const normalized = normalizeProviderFetchInput(endpoint, init);
  let currentInit = normalized.init;
  let resolved = await resolveProviderEndpoint(normalized.endpoint, { source, lookup, allowedHosts });
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const connection = {
      hostname: resolved.hostname,
      addresses: resolved.addresses,
      lookup: createPinnedLookup(resolved.hostname, resolved.addresses),
      timeoutMs,
      streamIdleTimeoutMs,
    };
    const response = await fetchImpl(resolved.url.href, {
      ...currentInit,
      redirect: 'manual',
      signal: currentInit.signal,
    }, connection);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers?.get?.('location');
    if (!location) return response;
    if (redirects === maxRedirects) {
      throw Object.assign(new Error('Provider endpoint exceeded the redirect limit.'), {
        statusCode: 502,
        code: 'PROVIDER_ENDPOINT_TOO_MANY_REDIRECTS',
      });
    }
    await response.body?.cancel?.();
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && String(currentInit.method || 'GET').toUpperCase() === 'POST')) {
      currentInit = { ...currentInit, method: 'GET', body: undefined };
    }
    resolved = await resolveProviderEndpoint(new URL(location, resolved.url), { source, lookup, allowedHosts });
  }
  throw Object.assign(new Error('Provider endpoint redirect handling failed.'), {
    statusCode: 502,
    code: 'PROVIDER_ENDPOINT_REDIRECT_FAILED',
  });
}

async function fetchHttpModels(baseUrl, apiKey, { source = 'server' } = {}) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  const endpoint = /\/v\d+$/.test(normalized) ? normalized : `${normalized}/v1`;
  const response = await fetchWithProviderEndpointPolicy(`${endpoint}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  }, { source });
  if (!response.ok) throw Object.assign(new Error(`Failed to fetch models: ${response.status} ${response.statusText}`), { statusCode: 502 });
  const data = await response.json();
  return (data.data || data.models || []).map((model) => typeof model === 'string' ? model : model.id).filter(Boolean);
}

async function fetchAnthropicModels(baseUrl, apiKey, { source = 'server' } = {}) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  const endpoint = /\/v\d+$/.test(normalized) ? normalized : `${normalized}/v1`;
  const response = await fetchWithProviderEndpointPolicy(`${endpoint}/models`, {
    headers: apiKey ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } : {},
  }, { source });
  if (!response.ok) throw Object.assign(new Error(`Failed to fetch models: ${response.status} ${response.statusText}`), { statusCode: 502 });
  const data = await response.json();
  return (data.data || data.models || []).map((model) => typeof model === 'string' ? model : model.id).filter(Boolean);
}
 
export function chatCompletion(params) {
  if (!currentProvider) throw new Error('LLM provider not initialized.');
  return currentProvider.chatCompletion(params);
}
 
export function chatWithTools(params) {
  if (!currentProvider) throw new Error('LLM provider not initialized.');
  return currentProvider.chatWithTools(params);
}
 
/** Legacy aliases for existing imports from this file */
export function resolveLLMConfig(overrides = {}) {
  return {
    endpoint: overrides.endpoint || currentLLMConfig.endpoint,
    apiKey: overrides.apiKey || currentLLMConfig.apiKey,
    model: overrides.model || currentLLMConfig.model,
  };
}
 
export async function callOpenAICompatible({ messages, model }) {
  try {
    const response = await chatCompletion({ systemPrompt: '', messages, model });
    const text = (response.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    return { ok: true, content: text };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
 
