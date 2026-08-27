import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const appRoot = join(repoRoot, 'app');
const demoRoot = join(repoRoot, 'docs/competition/submission_90plus/evidence/demo');

describe('competition narrated presentation video contract', () => {
  it('builds a PPT-led video with real narration, subtitles, and operation chapters', async () => {
    const builder = await readFile(join(appRoot, 'scripts/build-competition-application-video.mjs'), 'utf8');

    expect(builder).toContain('edge-tts');
    expect(builder).toContain('zh-CN-XiaoxiaoNeural');
    expect(builder).toContain('1920');
    expect(builder).toContain('1080');
    expect(builder).toContain("'-c:a', 'aac'");
    expect(builder).toContain('第一步是收件');
    expect(builder).toContain('推广');
    expect(builder).toContain('office-demo-submission.srt');
    expect(builder).toContain('Noto Sans SC Thin');
    expect(builder).toContain('expandSubtitleCues');
    expect(builder).toContain('loudnorm=I=-16');
    expect(builder).toContain('original_size=1920x1080');
    expect(builder).toContain('FontSize=14');
    expect(builder).toContain('MarginV=10');
  });

  it('ships editable narration evidence and eight presentation frames', async () => {
    const subtitles = await readFile(join(demoRoot, 'office-demo-submission.srt'), 'utf8');
    const transcript = await readFile(join(demoRoot, 'office-demo-submission-transcript.md'), 'utf8');

    expect(subtitles).toContain('OpenPrism Office');
    expect(subtitles).toContain('第一步是收件');
    expect(subtitles).toContain('推广');
    const subtitleLines = subtitles
      .split(/\r?\n/)
      .filter(line => line && !/^\d+$/.test(line) && !line.includes('-->'));
    expect(Math.max(...subtitleLines.map(line => [...line].length))).toBeLessThanOrEqual(23);
    expect(transcript).toContain('产品意义');
    expect(transcript).toContain('目标用户');
    expect(transcript).toContain('逐句字幕');

    for (let index = 1; index <= 8; index += 1) {
      const filename = `${String(index).padStart(2, '0')}-`;
      const slides = await readFile(join(demoRoot, 'presentation-slides.json'), 'utf8');
      const manifest = JSON.parse(slides);
      const slide = manifest.slides.find(item => item.file.startsWith(filename));
      expect(slide, filename).toBeTruthy();
      expect((await stat(join(demoRoot, 'slides', slide.file))).size).toBeGreaterThan(40_000);
    }
  });
});
