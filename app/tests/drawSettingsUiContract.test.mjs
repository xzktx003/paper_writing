import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('Draw settings and prompt editing UI contract', () => {
  it('allows image endpoint, key, model, and shared LLM credentials to be configured in the frontend', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/DrawPanel.tsx'), 'utf8');
    expect(source).toContain('draw-image-api-base');
    expect(source).toContain('draw-image-api-key');
    expect(source).toContain('draw-image-model');
    expect(source).toContain('draw-image-use-llm-credentials');
    expect(source).toContain('saveImageSettings');
  });

  it('renders the final image prompt as an editable textarea even before AI prompt generation', async () => {
    const source = await readFile(join(process.cwd(), 'apps/frontend/src/app/components/DrawPanel.tsx'), 'utf8');
    expect(source).toContain('id="draw-final-image-prompt"');
    expect(source).toContain('value={state.generatedPrompt}');
    expect(source).toContain("generatedPrompt: event.target.value");
    expect(source).toContain("imagePrompt: state.generatedPrompt.trim()");
  });
});
