import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import https from 'https';
 
let client = null;
 
export function initClaude(apiKey, { baseURL, caCertPath, model } = {}) {
  const opts = { apiKey };
  if (baseURL) {
    opts.baseURL = baseURL;
  }
  if (caCertPath) {
    try {
      const ca = readFileSync(caCertPath);
      opts.httpAgent = new https.Agent({ ca, rejectUnauthorized: true });
    } catch (e) {
      console.warn('Failed to load CA cert:', e.message);
    }
  }
  client = new Anthropic(opts);
  if (model) client._defaultModel = model;
}
 
function getModel() {
  return client?._defaultModel || 'claude-sonnet-4-20250514';
}
 
export async function chatCompletion({ systemPrompt, messages, tools, stream, model }) {
  if (!client) throw new Error('Claude not initialized. Set API key in config.');
  const params = {
    model: model || getModel(),
    max_tokens: 8192,
    system: systemPrompt,
    messages,
  };
  if (tools && tools.length > 0) {
    params.tools = tools;
  }
  if (stream) {
    return client.messages.stream(params);
  }
  return client.messages.create(params);
}
 
export async function chatWithTools({ systemPrompt, messages, tools, onToolUse, model }) {
  if (!client) throw new Error('Claude not initialized. Set API key in config.');
  let currentMessages = [...messages];
  const useModel = model || getModel();
  const maxToolRounds = Number(process.env.OPENPRISM_MAX_TOOL_ROUNDS || 6);
  for (let round = 0; round < maxToolRounds; round += 1) {
    const response = await client.messages.create({
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
        try {
          result = await onToolUse(block.name, block.input);
        } catch (err) {
          result = `Tool error (${block.name}): ${err.message || String(err)}`;
        }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }
      currentMessages.push({ role: 'assistant', content: response.content });
      currentMessages.push({ role: 'user', content: toolResults });
    } else {
      return { response, messages: currentMessages };
    }
  }
  return {
    response: {
      content: [{ type: 'text', text: `Stopped after ${maxToolRounds} tool rounds. Please ask a more specific question.` }],
    },
    messages: currentMessages,
  };
}
 
