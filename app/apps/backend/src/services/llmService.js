import Anthropic from '@anthropic-ai/sdk';
 
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
 
/* ── Anthropic provider ───────────────────────────────── */
 
let anthropicClient = null;
 
function initAnthropic(cfg) {
  const effectiveKey = (cfg.api_key && cfg.api_key.trim()) || "placeholder";
  const opts = { apiKey: effectiveKey };
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
function buildOpenAIMessages(systemPrompt, messages) {
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
      for (const block of msg.content) {
        if (block.type === 'tool_result') {
          result.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
          });
        }
      }
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
  if (currentProvider.name === 'openai-compatible') {
    return openaiChatCompletionStream(params);
  }
  return anthropicChatCompletionStream(params);
}
 
export function getDefaultModel() {
  if (!currentProvider) return '';
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
  if (provider === 'openai-compatible') {
    await initOpenAICompat({
      api_key: cfg.llm_api_key || cfg.claude_api_key,
      base_url: cfg.llm_base_url || cfg.claude_base_url,
      ca_cert: cfg.llm_ca_cert || cfg.claude_ca_cert,
      model: cfg.llm_model || cfg.claude_model,
    });
    currentProvider = { name: 'openai-compatible', chatCompletion: openaiChatCompletion, chatWithTools: openaiChatWithTools };
    console.log(`  LLM provider: openai-compatible (model: ${cfg.llm_model || cfg.claude_model})`);
  } else {
    initAnthropic({ api_key: cfg.claude_api_key, base_url: cfg.claude_base_url, ca_cert: cfg.claude_ca_cert, model: cfg.claude_model });
    currentProvider = { name: 'anthropic', chatCompletion: anthropicChatCompletion, chatWithTools: anthropicChatWithTools };
    console.log(`  LLM provider: anthropic (model: ${cfg.claude_model})`);
  }
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
 
