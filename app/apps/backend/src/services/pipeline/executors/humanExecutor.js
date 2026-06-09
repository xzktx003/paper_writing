import { STAGE_STATUS } from '../stageTypes.js';
 
/**
 * Human checkpoint executor.
 * Does not run automatically — pauses the pipeline and waits for user action.
 * Returns WAITING status; the pipeline runner handles pause/resume.
 */
export async function executeHumanStage(stage, context) {
  const { config } = stage;
  const { previousOutputs } = context;
 
  let displayContent = config.prompt;
  if (config.showOutput && previousOutputs) {
    const ref = config.showOutput;
    if (previousOutputs[ref]) {
      displayContent += `\n\n--- Previous Output (${ref}) ---\n${previousOutputs[ref]}`;
    }
  }
 
  return {
    status: STAGE_STATUS.WAITING,
    output: displayContent,
    metadata: {
      actions: config.actions || ['approve', 'reject', 'skip'],
      waitingSince: new Date().toISOString(),
    },
  };
}
 
export function resolveHumanStage(stage, action, feedback) {
  switch (action) {
    case 'approve':
      return {
        status: STAGE_STATUS.COMPLETED,
        output: stage.output,
        metadata: { ...stage.metadata, action: 'approved', feedback },
      };
    case 'reject':
      return {
        status: STAGE_STATUS.FAILED,
        output: stage.output,
        error: feedback || 'Rejected by user',
        metadata: { ...stage.metadata, action: 'rejected', feedback },
      };
    case 'skip':
      return {
        status: STAGE_STATUS.SKIPPED,
        output: null,
        metadata: { ...stage.metadata, action: 'skipped' },
      };
    case 'edit':
      return {
        status: STAGE_STATUS.COMPLETED,
        output: feedback,
        metadata: { ...stage.metadata, action: 'edited' },
      };
    default:
      return {
        status: STAGE_STATUS.FAILED,
        output: null,
        error: `Unknown human action: ${action}`,
      };
  }
}
 
