import Anthropic from '@anthropic-ai/sdk';

let client = null;

export function initClaude(apiKey) {
  client = new Anthropic({ apiKey });
}

export async function chatCompletion({ systemPrompt, messages, tools, stream }) {
  const params = {
    model: 'claude-sonnet-4-20250514',
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

export async function chatWithTools({ systemPrompt, messages, tools, onToolUse }) {
  let currentMessages = [...messages];
  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: currentMessages,
      tools,
    });
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];
      for (const block of toolUseBlocks) {
        const result = await onToolUse(block.name, block.input);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }
      currentMessages.push({ role: 'assistant', content: response.content });
      currentMessages.push({ role: 'user', content: toolResults });
    } else {
      return { response, messages: currentMessages };
    }
  }
}
