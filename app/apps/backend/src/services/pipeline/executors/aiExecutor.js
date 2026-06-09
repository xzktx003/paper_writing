import { assemblePrompt } from '../../skillEngine.js';
import { chatCompletion } from '../../llmService.js';
import { STAGE_STATUS } from '../stageTypes.js';
 
export async function executeAiStage(stage, context, signal) {
  const { config } = stage;
  const { input, previousOutputs } = context;
 
  const skillPrompt = assemblePrompt({ manualSkill: config.skill });
  const systemPrompt = config.systemPromptOverride ||
    `${skillPrompt}\n\nOutput your result directly. Use clear headings and bullet points for structured output.`;
 
  let userContent = input;
  if (config.includeOutputs && previousOutputs) {
    for (const ref of config.includeOutputs) {
      const prev = previousOutputs[ref];
      if (prev) userContent += `\n\n[Output from "${ref}"]\n${prev}`;
    }
  }
 
  const messages = [{ role: 'user', content: userContent.slice(0, config.maxInputChars || 24000) }];
 
  const response = await chatCompletion({
    systemPrompt,
    messages,
    model: config.model,
    signal,
  });
 
  const textBlock = response.content.find(b => b.type === 'text');
  const output = textBlock?.text || '';
 
  return {
    status: STAGE_STATUS.COMPLETED,
    output,
    metadata: { model: config.model, tokensUsed: response.usage },
  };
}
 
