import { chatCompletion } from '../services/llmService.js';
import { detectWithGPTZero } from '../services/gptzeroService.js';
import { readProjectContent } from '../services/contentReader.js';
import { resolveManagedProjectRequest } from '../services/managedProjectContext.js';
 
// AI-typical terms organized by severity
const AI_TERMS = {
  high: [
    'Moreover', 'Furthermore', 'In addition', 'It is worth noting',
    'Notably', 'Importantly', 'Interestingly', 'Remarkably',
    'Additionally', 'Consequently', 'Subsequently', 'Nevertheless',
    'It is important to note that', 'It should be noted that',
    'plays a crucial role', 'plays a pivotal role',
    'in this paper, we', 'in this study, we',
  ],
  medium: [
    'utilize', 'leverage', 'facilitate', 'comprehensive',
    'multifaceted', 'paradigm', 'nuanced', 'holistic',
    'delve', 'embark', 'landscape', 'tapestry',
    'realm', 'crucial', 'paramount', 'pivotal',
    'robust', 'rigorous', 'innovative', 'novel approach',
    'cutting-edge', 'state-of-the-art',
  ],
  low: [
    'dive into', 'shed light', 'game-changer',
    'unprecedented', 'groundbreaking', 'revolutionary',
    'furthermore', 'henceforth', 'thereby',
  ],
};
 
// Sentence patterns that suggest AI writing
const AI_PATTERNS = [
  { name: 'hedging', regex: /(?:it (?:seems|appears|suggests|indicates) that|may|might|could potentially|arguably)/gi, desc: 'Excessive hedging language' },
  { name: 'throat_clearing', regex: /(?:in order to|for the purpose of|with regard to|in terms of|with respect to)/gi, desc: 'Throat-clearing openers' },
  { name: 'passive_voice', regex: /(?:was|were|been|being|is|are) (?:\w+ed|built|made|done|taken|given|found|shown|used|called|known|considered|regarded)/gi, desc: 'Passive voice overuse' },
  { name: 'list_intro', regex: /(?:several (?:key |important )?(?:factors|aspects|elements|components|dimensions)|(?:first|second|third|finally)(?:ly)?,?\s)/gi, desc: 'Formulaic list introductions' },
  { name: 'uniform_transitions', regex: /(?:however|therefore|thus|consequently|in contrast|similarly|likewise|on the other hand|conversely)/gi, desc: 'Mechanical transitions' },
];
 
function countWords(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}
 
function typeTokenRatio(text) {
  const words = text.toLowerCase().split(/[^a-zA-Z]+/).filter(w => w.length > 2);
  const unique = new Set(words);
  return words.length > 0 ? unique.size / words.length : 0;
}
 
function sentenceLengthVariety(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const lengths = sentences.map(s => s.split(/\s+/).length);
  if (lengths.length === 0) return { avg: 0, stdDev: 0, min: 0, max: 0, count: 0 };
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const stdDev = Math.sqrt(lengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / lengths.length);
  return { avg: Math.round(avg), stdDev: Math.round(stdDev * 10) / 10, min: Math.min(...lengths), max: Math.max(...lengths), count: lengths.length };
}
 
function paragraphUniformity(text) {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 20);
  const lengths = paragraphs.map(p => p.split(/\s+/).length);
  if (lengths.length === 0) return { score: 100, count: 0 };
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const stdDev = Math.sqrt(lengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / lengths.length);
  // Lower stdDev = more uniform = more AI-like. Score: 0 (very uniform/AI) to 100 (varied/human)
  const score = Math.min(100, Math.round(stdDev * 2));
  return { score, count: paragraphs.length, avgLen: Math.round(avg) };
}
 
function findFlaggedTerms(text) {
  const results = [];
  for (const [severity, terms] of Object.entries(AI_TERMS)) {
    for (const term of terms) {
      const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = [...text.matchAll(regex)];
      if (matches.length > 0) {
        const lines = text.split('\n');
        const locations = matches.map(m => {
          const before = text.slice(0, m.index);
          const lineNum = before.split('\n').length;
          const col = m.index - before.lastIndexOf('\n') - 1;
          // Get surrounding context
          const lineContent = lines[lineNum - 1]?.trim() || '';
          return { line: lineNum, column: col, context: lineContent.slice(0, 120) };
        });
        results.push({ term, count: matches.length, severity, locations });
      }
    }
  }
  return results;
}
 
function findPatterns(text) {
  const results = [];
  for (const pattern of AI_PATTERNS) {
    const matches = [...text.matchAll(pattern.regex)];
    if (matches.length > 0) {
      const examples = matches.slice(0, 3).map(m => m[0]);
      results.push({
        pattern: pattern.name,
        description: pattern.desc,
        frequency: matches.length,
        severity: matches.length > 5 ? 'high' : matches.length > 2 ? 'medium' : 'low',
        examples,
      });
    }
  }
  return results;
}
 
function generateSuggestions(flaggedTerms, patterns, content) {
  const suggestions = [];
  const lines = content.split('\n');
 
  for (const term of flaggedTerms.slice(0, 10)) {
    for (const loc of term.locations.slice(0, 2)) {
      const original = lines[loc.line - 1]?.trim() || '';
      if (!original) continue;
      let suggested = original;
      // Simple replacement suggestions
      const replacements = {
        'Moreover': 'Also', 'Furthermore': 'Also', 'In addition': 'Also',
        'It is worth noting': '(delete)', 'Notably': '(delete)',
        'utilize': 'use', 'leverage': 'use', 'facilitate': 'help',
        'comprehensive': 'thorough', 'multifaceted': 'complex',
        'paradigm': 'approach', 'holistic': 'broad',
        'crucial': 'important', 'paramount': 'essential',
        'robust': 'solid', 'rigorous': 'careful',
      };
      for (const [from, to] of Object.entries(replacements)) {
        if (suggested.includes(from)) {
          suggested = suggested.replace(from, to);
        }
      }
      if (suggested !== original) {
        suggestions.push({ location: `Line ${loc.line}`, original: original.slice(0, 150), suggested: suggested.slice(0, 150), reason: `"${term.term}" is a common AI writing pattern (${term.severity} severity)` });
      }
    }
  }
  return suggestions;
}
 
function calculateOverallScore(flaggedTerms, sentenceVar, paraUnif, ttr) {
  let score = 0;
  // Flagged terms (0-40 points)
  const totalFlags = flaggedTerms.reduce((sum, t) => sum + t.count, 0);
  score += Math.min(40, totalFlags * 2);
  // Sentence uniformity (0-25 points, lower stdDev = more AI)
  score += Math.max(0, 25 - sentenceVar.stdDev * 2);
  // Paragraph uniformity (0-20 points)
  score += Math.max(0, 20 - paraUnif.score * 0.2);
  // Vocabulary diversity (0-15 points, lower TTR = more repetitive = more AI)
  score += Math.max(0, 15 - (1 - ttr) * 15);
  return Math.min(100, Math.round(score));
}
 
export function registerAntiAiRoutes(fastify) {
  fastify.post('/api/anti-ai/detect', async (request, reply) => {
    const { content: directContent, chapterScope } = request.body;
    const { projectRoot: resolvedPath } = await resolveManagedProjectRequest(request, reply, {
      route: 'anti-ai.detect',
    });
 
    let content = directContent || '';
    if (!content) {
      content = await readProjectContent(resolvedPath, chapterScope);
    }
 
    if (!content.trim()) {
      return { error: 'No content to analyze.' };
    }
 
    const flaggedTerms = findFlaggedTerms(content);
    const sentencePatterns = findPatterns(content);
    const ttr = typeTokenRatio(content);
    const sentenceVar = sentenceLengthVariety(content);
    const paraUnif = paragraphUniformity(content);
    const suggestions = generateSuggestions(flaggedTerms, sentencePatterns, content);
 
    const overallScore = calculateOverallScore(flaggedTerms, sentenceVar, paraUnif, ttr);
 
    return {
      overallScore,
      flaggedTerms,
      sentencePatterns,
      vocabularyDiversity: {
        typeTokenRatio: Math.round(ttr * 1000) / 1000,
        totalWords: countWords(content),
        uniqueWords: new Set(content.toLowerCase().split(/[^a-zA-Z]+/).filter(w => w.length > 2)).size,
      },
      sentenceVariety: sentenceVar,
      paragraphUniformity: paraUnif,
      suggestions,
      wordCount: countWords(content),
    };
  });
 
  // LLM deep analysis endpoint
  fastify.post('/api/anti-ai/deep-detect', async (request, reply) => {
    const { content: directContent, chapterScope } = request.body;
    const { projectRoot: resolvedPath } = await resolveManagedProjectRequest(request, reply, {
      route: 'anti-ai.deep-detect',
    });
 
    let content = directContent || '';
    if (!content) {
      content = await readProjectContent(resolvedPath, chapterScope);
    }
 
    if (!content.trim()) {
      return { error: 'No content to analyze.' };
    }
 
    // Truncate to avoid token limits
    const maxChars = 12000;
    const truncated = content.length > maxChars ? content.slice(0, maxChars) + '\n[... truncated]' : content;
 
    const systemPrompt = `You are an expert academic writing analyst specializing in detecting AI-generated text. Analyze the provided text and return a JSON object with your assessment. Be rigorous and evidence-based.
 
Return ONLY valid JSON with this exact structure:
{
  "aiProbability": <number 0-100, probability the text is AI-generated>,
  "confidence": "<low|medium|high>",
  "dimensions": {
    "lexicalDiversity": { "score": <0-100, higher=more AI-like>, "evidence": "<brief explanation>" },
    "argumentStructure": { "score": <0-100>, "evidence": "<brief explanation>" },
    "sentenceVariation": { "score": <0-100>, "evidence": "<brief explanation>" },
    "specificity": { "score": <0-100>, "evidence": "<brief explanation>" },
    "transitionPatterns": { "score": <0-100>, "evidence": "<brief explanation>" }
  },
  "flaggedPassages": [
    { "text": "<excerpt max 100 chars>", "reason": "<why it looks AI-generated>" }
  ],
  "humanTraits": ["<traits that suggest human writing, if any>"],
  "rewriteSuggestions": [
    { "original": "<AI-sounding excerpt>", "suggested": "<more natural alternative>", "reason": "<why>" }
  ],
  "summary": "<2-3 sentence overall assessment>"
}
 
Scoring dimensions:
- lexicalDiversity: AI text uses repetitive academic filler ("Moreover", "Furthermore", "crucial", "leverage"). Score high if vocabulary is formulaic.
- argumentStructure: AI tends to be overly linear (point A → B → C) without digressions, counterarguments, or personal insights. Score high if too neat.
- sentenceVariation: Human writing has "burstiness" — mix of short punchy sentences and long complex ones. AI is uniform. Score high if uniform.
- specificity: AI gives abstract/generic examples. Humans cite specific papers, dates, personal experiences. Score high if vague.
- transitionPatterns: AI uses mechanical transitions ("However", "In contrast", "Furthermore") at predictable intervals. Score high if mechanical.`;
 
    const messages = [{ role: 'user', content: `Analyze this academic text for AI-generation indicators:\n\n${truncated}` }];
 
    try {
      const response = await chatCompletion({ systemPrompt, messages });
      let text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
 
      // Strip markdown code fences if present
      text = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');
 
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { error: 'Failed to parse LLM response.', raw: text.slice(0, 500) };
      }
 
      let jsonStr = jsonMatch[0];
      // Fix trailing commas before } or ]
      jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
      // Fix bad escape sequences: replace \X (where X is not a valid JSON escape) with \\X
      jsonStr = jsonStr.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
 
      let result;
      try {
        result = JSON.parse(jsonStr);
      } catch {
        // Try fixing unquoted keys
        const fixed = jsonStr.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
        try {
          result = JSON.parse(fixed);
        } catch (e2) {
          return { error: 'Failed to parse LLM response JSON.', raw: jsonStr.slice(0, 800) };
        }
      }
      return { ...result, mode: 'deep' };
    } catch (err) {
      return { error: `LLM analysis failed: ${err.message}` };
    }
  });
 
  // GPTZero Playwright-based detection endpoint
  fastify.post('/api/anti-ai/gptzero-detect', async (request, reply) => {
    const { content: directContent, chapterScope } = request.body;
    const { projectRoot: resolvedPath } = await resolveManagedProjectRequest(request, reply, {
      route: 'anti-ai.gptzero-detect',
    });
 
    let content = directContent || '';
    if (!content) {
      content = await readProjectContent(resolvedPath, chapterScope);
    }
 
    if (!content.trim()) {
      return { error: 'No content to analyze.' };
    }
 
    try {
      const result = await detectWithGPTZero(content);
      return result;
    } catch (err) {
      return { error: err.message };
    }
  });
}
 
