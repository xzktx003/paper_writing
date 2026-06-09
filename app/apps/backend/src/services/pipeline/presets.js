import { STAGE_TYPES } from './stageTypes.js';
 
/**
 * Pipeline 2.0 Preset Templates
 * Composable pipeline definitions using typed stages.
 */
 
export const PIPELINE_PRESETS = {
  'writing-flow': {
    name: 'Writing Flow',
    description: 'Outline → Draft → Polish → Review — full paper writing pipeline',
    stages: [
      {
        name: 'outline',
        type: STAGE_TYPES.AI,
        description: 'Generate structured outline from topic/abstract',
        config: { skill: 'ars-outline', maxInputChars: 8000 },
      },
      {
        name: 'outline-review',
        type: STAGE_TYPES.HUMAN,
        description: 'Review and approve the outline before drafting',
        config: { prompt: 'Review the generated outline. Approve to proceed with drafting, or edit to refine.', actions: ['approve', 'edit', 'reject'], showOutput: 'outline' },
      },
      {
        name: 'draft',
        type: STAGE_TYPES.AI,
        description: 'Write first draft based on approved outline',
        config: { skill: 'ars-full', includeOutputs: ['outline', 'outline-review'], maxInputChars: 24000 },
      },
      {
        name: 'polish',
        type: STAGE_TYPES.AI,
        description: 'Polish manuscript for publication-quality English',
        config: { skill: 'nature-polishing', includeOutputs: ['draft'], maxInputChars: 24000 },
      },
      {
        name: 'review',
        type: STAGE_TYPES.AI,
        description: 'Peer review the polished manuscript',
        config: { skill: 'academic-paper-reviewer', includeOutputs: ['polish'], maxInputChars: 24000 },
      },
      {
        name: 'review-checkpoint',
        type: STAGE_TYPES.HUMAN,
        description: 'Review the peer review report and decide next steps',
        config: { prompt: 'Review the peer review report. Approve to finalize, or reject to revise.', actions: ['approve', 'reject', 'skip'], showOutput: 'review' },
      },
    ],
  },
 
  'paper-pipeline': {
    name: 'Paper Pipeline',
    description: 'Polish → Review → Revise → Compile — end-to-end paper processing',
    stages: [
      {
        name: 'polish',
        type: STAGE_TYPES.AI,
        description: 'Polish manuscript for publication-quality English',
        config: { skill: 'nature-polishing', maxInputChars: 24000 },
      },
      {
        name: 'review',
        type: STAGE_TYPES.AI,
        description: 'Peer review the polished manuscript',
        config: { skill: 'academic-paper-reviewer', includeOutputs: ['polish'], maxInputChars: 24000 },
      },
      {
        name: 'review-checkpoint',
        type: STAGE_TYPES.HUMAN,
        description: 'Approve review or request revision',
        config: { prompt: 'Review the peer review report. Approve to proceed with revision, or skip to go directly to compile.', actions: ['approve', 'skip', 'reject'], showOutput: 'review' },
      },
      {
        name: 'revise',
        type: STAGE_TYPES.AI,
        description: 'Revise based on review feedback',
        config: { skill: 'ars-revision', includeOutputs: ['polish', 'review'], maxInputChars: 24000 },
      },
      {
        name: 'citation-check',
        type: STAGE_TYPES.CITATION,
        description: 'Verify citations are complete and consistent',
        config: { action: 'verify' },
      },
      {
        name: 'compile',
        type: STAGE_TYPES.COMPILE,
        description: 'Compile final PDF',
        config: { engine: 'xelatex', mainFile: 'main.tex' },
      },
    ],
  },
 
  'quick-review': {
    name: 'Quick Review',
    description: 'Review → Revise — fast feedback loop',
    stages: [
      {
        name: 'review',
        type: STAGE_TYPES.AI,
        description: 'Quick peer review',
        config: { skill: 'academic-paper-reviewer', maxInputChars: 24000 },
      },
      {
        name: 'review-checkpoint',
        type: STAGE_TYPES.HUMAN,
        description: 'Review feedback and decide whether to revise',
        config: { prompt: 'Review the feedback. Approve to auto-revise, or skip to end.', actions: ['approve', 'skip'], showOutput: 'review' },
      },
      {
        name: 'revise',
        type: STAGE_TYPES.AI,
        description: 'Revise based on review',
        config: { skill: 'ars-revision', includeOutputs: ['review'], maxInputChars: 24000 },
      },
    ],
  },
 
  'citation-pipeline': {
    name: 'Citation Pipeline',
    description: 'Verify → Deduplicate → Discover — citation management',
    stages: [
      {
        name: 'verify',
        type: STAGE_TYPES.CITATION,
        description: 'Verify all citations match .bib entries',
        config: { action: 'verify' },
      },
      {
        name: 'deduplicate',
        type: STAGE_TYPES.CITATION,
        description: 'Find and merge duplicate entries',
        config: { action: 'deduplicate' },
      },
      {
        name: 'discover',
        type: STAGE_TYPES.CITATION,
        description: 'Suggest additional references',
        config: { action: 'discover' },
      },
      {
        name: 'review-suggestions',
        type: STAGE_TYPES.HUMAN,
        description: 'Review suggested citations before adding',
        config: { prompt: 'Review the suggested citations. Approve to add them to your .bib file.', actions: ['approve', 'edit', 'skip'], showOutput: 'discover' },
      },
    ],
  },
 
  'executable-paper': {
    name: 'Executable Paper',
    description: 'Run Code → Generate Figures → Compile — reproducible paper',
    stages: [
      {
        name: 'run-experiments',
        type: STAGE_TYPES.COMPUTE,
        description: 'Execute experiment scripts',
        config: { command: 'python', args: ['src/main.py'], timeoutMs: 600_000 },
      },
      {
        name: 'generate-figures',
        type: STAGE_TYPES.COMPUTE,
        description: 'Generate figures from results',
        config: { command: 'python', args: ['src/plot.py'], timeoutMs: 120_000 },
      },
      {
        name: 'verify-outputs',
        type: STAGE_TYPES.HUMAN,
        description: 'Verify generated figures and results',
        config: { prompt: 'Check that all figures and results were generated correctly.', actions: ['approve', 'reject'] },
      },
      {
        name: 'compile',
        type: STAGE_TYPES.COMPILE,
        description: 'Compile paper with generated figures',
        config: { engine: 'xelatex', mainFile: 'main.tex' },
      },
    ],
  },
 
  'rag-literature-review': {
    name: 'RAG Literature Review',
    description: 'Search corpus → RAG evidence → Write review — evidence-driven literature review',
    stages: [
      {
        name: 'rag-search',
        type: STAGE_TYPES.AI,
        description: 'Search the project RAG corpus and build context for the literature review',
        config: { skill: 'literature-search', maxInputChars: 8000 },
      },
      {
        name: 'evidence-review',
        type: STAGE_TYPES.HUMAN,
        description: 'Review the RAG evidence and specify which sources to include',
        config: { prompt: 'Review the RAG search results. Edit to refine the scope of the literature review.', actions: ['approve', 'edit'], showOutput: 'rag-search' },
      },
      {
        name: 'lit-review-draft',
        type: STAGE_TYPES.AI,
        description: 'Draft the literature review section using RAG evidence',
        config: { skill: 'ars-lit-review', includeOutputs: ['rag-search', 'evidence-review'], maxInputChars: 24000 },
      },
      {
        name: 'polish',
        type: STAGE_TYPES.AI,
        description: 'Polish the literature review',
        config: { skill: 'nature-polishing', includeOutputs: ['lit-review-draft'], maxInputChars: 24000 },
      },
    ],
  },
 
  'paper-spine-build': {
    name: 'PaperSpine Build',
    description: 'Build motivation-driven paper from materials using PaperSpine methodology',
    stages: [
      {
        name: 'research-dossier',
        type: STAGE_TYPES.AI,
        description: 'Analyze materials and build research dossier',
        config: { skill: 'deep-research', maxInputChars: 24000 },
      },
      {
        name: 'motivation-analysis',
        type: STAGE_TYPES.AI,
        description: 'Identify and confirm the paper motivation',
        config: { skill: 'research-ideation', includeOutputs: ['research-dossier'], maxInputChars: 8000 },
      },
      {
        name: 'motivation-checkpoint',
        type: STAGE_TYPES.HUMAN,
        description: 'Review and confirm the paper motivation before drafting',
        config: { prompt: 'Review the identified motivation. Edit to refine, or approve to proceed.', actions: ['approve', 'edit', 'reject'], showOutput: 'motivation-analysis' },
      },
      {
        name: 'storyline',
        type: STAGE_TYPES.AI,
        description: 'Build paper storyline from confirmed motivation',
        config: { skill: 'paper-storyline', includeOutputs: ['motivation-analysis', 'motivation-checkpoint'], maxInputChars: 16000 },
      },
      {
        name: 'section-draft',
        type: STAGE_TYPES.AI,
        description: 'Draft sections based on storyline',
        config: { skill: 'academic-paper', includeOutputs: ['storyline'], maxInputChars: 24000 },
      },
    ],
  },
 
  'nature-submission': {
    name: 'Nature Submission',
    description: 'Nature-format writing → Polish → Figures → Data → Compile — Nature submission pipeline',
    stages: [
      {
        name: 'nature-format',
        type: STAGE_TYPES.AI,
        description: 'Format manuscript following Nature guidelines',
        config: { skill: 'nature-writing', maxInputChars: 24000 },
      },
      {
        name: 'nature-polish',
        type: STAGE_TYPES.AI,
        description: 'Nature-style polish and refinement',
        config: { skill: 'nature-polishing', includeOutputs: ['nature-format'], maxInputChars: 24000 },
      },
      {
        name: 'data-availability',
        type: STAGE_TYPES.AI,
        description: 'Generate Data Availability statement',
        config: { skill: 'nature-data', includeOutputs: ['nature-polish'], maxInputChars: 8000 },
      },
      {
        name: 'review',
        type: STAGE_TYPES.AI,
        description: 'Comprehensive Nature-style peer review',
        config: { skill: 'academic-paper-reviewer', includeOutputs: ['nature-polish'], maxInputChars: 24000 },
      },
      {
        name: 'citation-check',
        type: STAGE_TYPES.CITATION,
        description: 'Verify citations for Nature format',
        config: { action: 'verify' },
      },
      {
        name: 'compile',
        type: STAGE_TYPES.COMPILE,
        description: 'Compile final PDF',
        config: { engine: 'xelatex', mainFile: 'main.tex' },
      },
    ],
  },
 
  'claim-audit': {
    name: 'Claim Audit',
    description: 'Extract claims → RAG verify → Report — claim-level citation evidence audit',
    stages: [
      {
        name: 'claim-extraction',
        type: STAGE_TYPES.AI,
        description: 'Extract factual claims from the manuscript',
        config: { skill: 'citation-verification', maxInputChars: 24000 },
      },
      {
        name: 'claim-evidence-check',
        type: STAGE_TYPES.CITATION,
        description: 'Cross-reference claims with citations in the corpus',
        config: { action: 'verify' },
      },
      {
        name: 'claim-report',
        type: STAGE_TYPES.AI,
        description: 'Generate claim-level evidence audit report',
        config: { skill: 'paper-self-review', includeOutputs: ['claim-extraction', 'claim-evidence-check'], maxInputChars: 16000 },
      },
      {
        name: 'report-review',
        type: STAGE_TYPES.HUMAN,
        description: 'Review the claim audit report',
        config: { prompt: 'Review the claim audit report. Address any unsupported or fabricated claims.', actions: ['approve', 'reject', 'skip'], showOutput: 'claim-report' },
      },
    ],
  },
 
  'stats-sanity': {
    name: 'Stats Sanity Check',
    description: 'Statistical sanity check for empirical papers',
    stages: [
      {
        name: 'data-collection-check',
        type: STAGE_TYPES.AI,
        description: 'Review data collection and experimental design',
        config: { skill: 'experimental-design', maxInputChars: 8000 },
      },
      {
        name: 'statistical-report',
        type: STAGE_TYPES.AI,
        description: 'Audit statistical reporting in the manuscript',
        config: { skill: 'statistical-reporting', maxInputChars: 24000 },
      },
      {
        name: 'results-analysis',
        type: STAGE_TYPES.AI,
        description: 'Verify results analysis and claims',
        config: { skill: 'results-analysis', includeOutputs: ['statistical-report'], maxInputChars: 16000 },
      },
      {
        name: 'sanity-checkpoint',
        type: STAGE_TYPES.HUMAN,
        description: 'Review statistical sanity findings',
        config: { prompt: 'Review the statistical sanity report. Address any inconsistencies or concerns.', actions: ['approve', 'edit', 'reject'], showOutput: 'results-analysis' },
      },
    ],
  },
 
  'repro-pack': {
    name: 'Reproducibility Pack',
    description: 'Generate a reproducible research package with artifacts manifest',
    stages: [
      {
        name: 'artifact-scan',
        type: STAGE_TYPES.COMPUTE,
        description: 'Scan project for data, code, figures, and environment files',
        config: { command: 'bash', args: ['-c', 'echo "Scanning project artifacts..."; ls -la data/ code/ figs/ 2>/dev/null || echo "No standard dirs found"'], timeoutMs: 30_000 },
      },
      {
        name: 'artifact-manifest',
        type: STAGE_TYPES.AI,
        description: 'Generate artifact manifest and README',
        config: { skill: 'meta-analysis', includeOutputs: ['artifact-scan'], maxInputChars: 8000 },
      },
      {
        name: 'compile',
        type: STAGE_TYPES.COMPILE,
        description: 'Compile paper as final validation',
        config: { engine: 'xelatex', mainFile: 'main.tex' },
      },
      {
        name: 'pack-report',
        type: STAGE_TYPES.HUMAN,
        description: 'Review the repro pack artifacts',
        config: { prompt: 'Review the reproducibility pack. Check that all artifacts are included.', actions: ['approve', 'skip'] },
      },
    ],
  },
};
 
export function getPreset(name) {
  return PIPELINE_PRESETS[name] || null;
}
 
export function listPresets() {
  return Object.entries(PIPELINE_PRESETS).map(([id, def]) => ({
    id,
    name: def.name,
    description: def.description,
    stageCount: def.stages.length,
    stages: def.stages.map(s => ({ name: s.name, type: s.type, description: s.description })),
  }));
}
 
