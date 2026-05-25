import { chatCompletion } from '../services/llmService.js';
import { assemblePrompt } from '../services/skillEngine.js';
import { readTextFile, listDir } from '../services/fileManager.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { resolveProjectPath } from './ai.js';

const REVIEW_JSON_SCHEMA = `{
  "overallScore": number (0-100),
  "decision": "accept" | "minor_revision" | "major_revision" | "reject",
  "dimensions": [
    {
      "name": "methodology" | "novelty" | "clarity" | "reproducibility" | "writing_quality",
      "score": number (0-100),
      "issues": [
        {
          "severity": "critical" | "major" | "minor",
          "location": "section:line description",
          "description": "What is wrong",
          "suggestion": "How to fix it"
        }
      ]
    }
  ],
  "summary": "Markdown overall review summary",
  "revisionChecklist": [
    {
      "priority": number,
      "action": "Specific action to take",
      "section": "Which section",
      "done": false
    }
  ]
}`;

async function readPaperContent(resolvedPath, chapterScope) {
  const secDir = join(resolvedPath, 'sec');
  const chapDir = join(resolvedPath, 'chapters');
  const dir = existsSync(secDir) ? secDir : chapDir;

  if (chapterScope) {
    try { return await readTextFile(join(dir, chapterScope)); } catch {}
  }

  const entries = await listDir(dir);
  const texFiles = entries.filter(e => e.type === 'file' && e.name.endsWith('.tex')).sort((a, b) => a.name.localeCompare(b.name));
  const parts = [];
  for (const f of texFiles) {
    try {
      const content = await readTextFile(join(dir, f.name));
      parts.push(`% === ${f.name} ===\n${content}`);
    } catch {}
  }
  return parts.join('\n\n');
}

export function registerReviewRoutes(fastify) {
  fastify.post('/api/review/structured', async (request) => {
    const { projectPath, chapterScope } = request.body;
    const resolvedPath = await resolveProjectPath(projectPath);

    const content = await readPaperContent(resolvedPath, chapterScope);
    if (!content.trim()) {
      return { error: 'No paper content found to review.' };
    }

    const skillPrompt = assemblePrompt({ manualSkill: 'academic-paper-reviewer' });
    const systemPrompt = `${skillPrompt}\n\nIMPORTANT: You MUST output your review as a single valid JSON object matching this exact schema (no markdown fencing, no extra text):\n${REVIEW_JSON_SCHEMA}`;

    const response = await chatCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: `Please provide a structured peer review of the following academic paper:\n\n${content.slice(0, 15000)}` }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const rawText = textBlock?.text || '';

    // Extract JSON from response
    let reviewData;
    try {
      // Try direct parse
      reviewData = JSON.parse(rawText);
    } catch {
      // Try to extract JSON from markdown code block
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        reviewData = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON object in text
        const braceMatch = rawText.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          reviewData = JSON.parse(braceMatch[0]);
        } else {
          return { error: 'Failed to parse review as JSON', rawText };
        }
      }
    }

    return reviewData;
  });
}
