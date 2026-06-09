import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { assemblePrompt } from '../../skillEngine.js';
import { chatCompletion } from '../../llmService.js';
import { STAGE_STATUS } from '../stageTypes.js';
 
const CITATION_ACTIONS = {
  verify: {
    skill: 'citation-verification',
    prompt: 'Verify all citations in the manuscript match entries in the .bib file. Report missing, unused, or malformed citations.',
  },
  format: {
    skill: 'citation-management',
    prompt: 'Format all BibTeX entries consistently. Ensure required fields are present for each entry type.',
  },
  deduplicate: {
    skill: 'citation-management',
    prompt: 'Find and merge duplicate BibTeX entries. Report which entries were merged.',
  },
  discover: {
    skill: 'citation-management',
    prompt: 'Based on the manuscript content, suggest additional references that should be cited. Provide BibTeX entries for suggestions.',
  },
};
 
export async function executeCitationStage(stage, context, signal) {
  const { config } = stage;
  const { projectPath, input } = context;
  const actionDef = CITATION_ACTIONS[config.action];
  if (!actionDef) {
    return { status: STAGE_STATUS.FAILED, output: null, error: `Unknown citation action: ${config.action}` };
  }
 
  const bibFile = config.bibFile || 'references.bib';
  let bibContent = '';
  try {
    bibContent = await readFile(join(projectPath, bibFile), 'utf-8');
  } catch {
    bibContent = '% No .bib file found';
  }
 
  const skillPrompt = assemblePrompt({ manualSkill: actionDef.skill });
  const systemPrompt = `${skillPrompt}\n\n${actionDef.prompt}`;
 
  const userContent = `[Manuscript Content]\n${(input || '').slice(0, 16000)}\n\n[BibTeX File: ${bibFile}]\n${bibContent.slice(0, 8000)}`;
 
  const response = await chatCompletion({
    systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    signal,
  });
 
  const textBlock = response.content.find(b => b.type === 'text');
  const output = textBlock?.text || '';
 
  return {
    status: STAGE_STATUS.COMPLETED,
    output,
    metadata: { action: config.action, bibFile },
  };
}
 
