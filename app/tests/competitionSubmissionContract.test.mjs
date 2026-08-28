import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageRoot = join(repoRoot, 'docs/competition/submission_90plus');
const requiredFiles = [
  'M01-proposal.md',
  'M02-demo-script.md',
  'M03-reuse-statement.md',
  'M04-significance.md',
  'M05-effect-evidence.md',
  'M06-reuse-assets.md',
  'reviewer-guide.md',
  'initial-score-guide.md',
  'blank-initial-score-sheet.md',
  'finals-pack.md',
  'finals-score-guide.md',
  'OpenPrism-Office-competition-submission.pdf',
  'evidence/demo/office-demo-submission.mp4',
  'evidence/demo/office-demo-submission.srt',
  'evidence/demo/office-demo-submission-transcript.md',
  'evidence/demo/presentation-slides.json',
  'evidence/demo/paper-word-ppt/paper-word-ppt-submission.mp4',
  'evidence/demo/paper-word-ppt/paper-word-ppt-submission.srt',
  'evidence/demo/paper-word-ppt/paper-word-ppt-submission-transcript.md',
  'evidence/demo/paper-word-ppt/paper-word-ppt-poster.jpg',
  'evidence/demo/paper-word-ppt/presentation-slides.json',
  'evidence/demo/paper-word-ppt/slides/01-problem.png',
  'evidence/demo/paper-word-ppt/slides/02-input.png',
  'evidence/demo/paper-word-ppt/slides/03-plan.png',
  'evidence/demo/paper-word-ppt/slides/04-evidence.png',
  'evidence/demo/paper-word-ppt/slides/05-draft.png',
  'evidence/demo/paper-word-ppt/slides/06-word.png',
  'evidence/demo/paper-word-ppt/slides/07-ppt.png',
  'evidence/demo/paper-word-ppt/slides/08-human.png',
  'evidence/demo/paper-word-ppt/slides/09-improvement.png',
  'evidence/demo/paper-word-ppt/slides/10-output.png',
  'evidence/demo/slides/01-title.png',
  'evidence/demo/slides/02-manual-before.png',
  'evidence/demo/slides/03-inputs.png',
  'evidence/demo/slides/04-audience.png',
  'evidence/demo/slides/05-workflow.png',
  'evidence/demo/slides/06-before-after.png',
  'evidence/demo/slides/07-results.png',
  'evidence/demo/slides/08-efficiency.png',
  'evidence/demo/slides/09-promotion.png',
  'evidence/demo/slides/10-end.png',
  'evidence/demo/office-demo-poster.jpg',
  'evidence/demo/office-demo.mp4',
  'evidence/demo/office-demo.webm',
  'evidence/demo/timestamps.md',
  'evidence/demo/coverage.json',
  'evidence/demo/03-inbox-details.png',
  'evidence/demo/05-produce-success.png',
  'evidence/demo/09-review-graph.png',
  'evidence/demo/15-measure-controlled.png',
  'evidence/demo/17-deliver-audit.png',
  'evidence/demo/19-deliver-export.png',
  'evidence/logs/officecli-verification.txt',
  'evidence/logs/competition-demo-contract.txt',
  'evidence/logs/media-probe.json',
  'evidence/logs/visual-verdict.json',
  'evidence/E05-quality-notes.md',
  'evidence/E06-reuse-assets.md',
  'evidence/workflow-state-samples/office-track.json',
  'evidence/workflow-state-samples/office-workspace.json',
  'evidence/workflow-state-samples/office-workflow.json',
  'evidence/submission-manifest.json',
  'submission-manifest.json',
];

describe('office competition submission package', () => {
  it('waits for the bundled Chinese font before drawing demo captions', async () => {
    const recorder = await readFile(join(repoRoot, 'app/scripts/competition-office-demo.mjs'), 'utf8');
    expect(recorder).toContain('Noto Sans SC');
    expect(recorder).toMatch(/document\.fonts\.ready/);
  });

  it('contains readable required materials, a real PDF, and a non-trivial continuous demo', async () => {
    for (const relativePath of requiredFiles) {
      expect((await stat(join(packageRoot, relativePath))).isFile(), relativePath).toBe(true);
    }
    const pdf = await readFile(join(packageRoot, 'OpenPrism-Office-competition-submission.pdf'));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const video = await stat(join(packageRoot, 'evidence/demo/office-demo.webm'));
    expect(video.size).toBeGreaterThan(1_000_000);
    const compatibleVideo = await stat(join(packageRoot, 'evidence/demo/office-demo.mp4'));
    expect(compatibleVideo.size).toBeGreaterThan(1_000_000);
    const submissionVideoPath = join(packageRoot, 'evidence/demo/office-demo-submission.mp4');
    const submissionVideo = await readFile(submissionVideoPath);
    expect(submissionVideo.length).toBeGreaterThan(1_000_000);
    expect(submissionVideo.subarray(4, 8).toString()).toBe('ftyp');
    const submissionCaptions = await readFile(join(packageRoot, 'evidence/demo/office-demo-submission.srt'), 'utf8');
    expect(submissionCaptions).toContain('先把资料放进来');
    expect(submissionCaptions).toContain('四个地方');
    const transcript = await readFile(join(packageRoot, 'evidence/demo/office-demo-submission-transcript.md'), 'utf8');
    expect(transcript).toContain('逐句字幕');
    expect(transcript).toContain('真实性边界');
    const presentation = JSON.parse(await readFile(join(packageRoot, 'evidence/demo/presentation-slides.json'), 'utf8'));
    expect(presentation.slides).toHaveLength(10);
    const academicVideo = await readFile(join(packageRoot, 'evidence/demo/paper-word-ppt/paper-word-ppt-submission.mp4'));
    expect(academicVideo.length).toBeGreaterThan(1_000_000);
    expect(academicVideo.subarray(4, 8).toString()).toBe('ftyp');
    const academicTranscript = await readFile(join(packageRoot, 'evidence/demo/paper-word-ppt/paper-word-ppt-submission-transcript.md'), 'utf8');
    expect(academicTranscript).toContain('论文、Word、PPT');
    const academicPresentation = JSON.parse(await readFile(join(packageRoot, 'evidence/demo/paper-word-ppt/presentation-slides.json'), 'utf8'));
    expect(academicPresentation.slides).toHaveLength(10);
    expect((await stat(join(packageRoot, 'evidence/demo/office-demo-poster.jpg'))).size).toBeGreaterThan(50_000);
    const timestamps = await readFile(join(packageRoot, 'evidence/demo/timestamps.md'), 'utf8');
    expect(timestamps).toContain('19-deliver-export.png');
    expect(timestamps).toContain('受控演示');
    const coverage = JSON.parse(await readFile(join(packageRoot, 'evidence/demo/coverage.json'), 'utf8'));
    expect(coverage.officeCli.status).toBe('ok');
    expect(coverage.stages).toHaveLength(6);
    expect(coverage.stages.flatMap(stage => stage.screenshots)).toHaveLength(19);
  });

  it('keeps the complete package manifest synchronized with file bytes', async () => {
    const manifest = JSON.parse(await readFile(join(packageRoot, 'submission-manifest.json'), 'utf8'));
    expect(manifest.officialJudgement).toBe(false);
    expect(manifest.readiness).toBe('technical-package-complete');
    expect(manifest.missingRequiredFiles).toEqual([]);
    expect(manifest.unresolvedGaps).toContain('真实业务全成本样本及负责人确认');
    for (const entry of manifest.files) {
      const bytes = await readFile(join(packageRoot, entry.path));
      expect(bytes.length, entry.path).toBe(entry.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), entry.path).toBe(entry.sha256);
    }
  });

  it('does not leak machine paths or credentials into submission text and state samples', async () => {
    const checked = [
      'README.md',
      'M01-proposal.md',
      'M05-effect-evidence.md',
      'reviewer-guide.md',
      'evidence/workflow-state-samples/office-track.json',
      'evidence/workflow-state-samples/office-workspace.json',
      'evidence/workflow-state-samples/office-workflow.json',
    ];
    const text = (await Promise.all(checked.map(path => readFile(join(packageRoot, path), 'utf8')))).join('\n');
    expect(text).not.toMatch(/\/data\d*\/home\/|\/home\/[A-Za-z0-9._-]+\//);
    expect(text).not.toMatch(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9._-]{8,}/i);
    expect(text).not.toMatch(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i);
    expect(text).not.toMatch(/\b(?:password|api[_-]?key|access[_-]?token|secret)\s*[:=]\s*[^\s]{6,}/i);
  });

  it('ships a blank real-pilot register instead of fixture productivity claims', async () => {
    const csv = await readFile(join(packageRoot, 'evidence/E05-effect-measurement.csv'), 'utf8');
    expect(csv).toContain('baseline_minutes,ai_minutes,review_minutes,retry_minutes,setup_minutes,maintenance_minutes');
    expect(csv).toContain('待真实业务任务填写');
    expect(csv).not.toMatch(/,120,45,20,5,10,2,/);
  });
});
