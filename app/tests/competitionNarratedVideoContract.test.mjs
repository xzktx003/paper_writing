import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const appRoot = join(repoRoot, 'app');
const demoRoot = join(repoRoot, 'docs/competition/submission_90plus/evidence/demo');

describe('competition narrated presentation video contract', () => {
  it('builds a PPT-led video that explains real inputs, outputs, and the manual baseline', async () => {
    const builder = await readFile(join(appRoot, 'scripts/build-competition-application-video.mjs'), 'utf8');

    expect(builder).toContain('edge-tts');
    expect(builder).not.toContain('fs.access(edgeTtsExecutable)');
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
    expect(builder).toContain('以前人工怎么做');
    expect(builder).toContain('系统实际接受什么');
    expect(builder).toContain('实际输入');
    expect(builder).toContain('实际输出');
    expect(builder).toContain('demo-architecture-review.docx');
    expect(builder).toContain('native-ooxml');
    expect(builder).toContain('不宣称固定提效比例');
    expect(builder).toMatch(/id: 'measure'.*?end: 58\.0/s);
    expect(builder).toMatch(/id: 'deliver'.*?start: 61\.5/s);
  });

  it('ships editable narration evidence and ten presentation frames', async () => {
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
    expect(transcript).toContain('以前人工怎么做');
    expect(transcript).toContain('系统实际输入');
    expect(transcript).toContain('系统实际输出');
    expect(transcript).toContain('效率优势');
    expect(transcript).toContain('不宣称固定提效比例');

    const manifest = JSON.parse(await readFile(join(demoRoot, 'presentation-slides.json'), 'utf8'));
    expect(manifest.slides).toHaveLength(10);
    for (let index = 1; index <= 10; index += 1) {
      const filename = `${String(index).padStart(2, '0')}-`;
      const slide = manifest.slides.find(item => item.file.startsWith(filename));
      expect(slide, filename).toBeTruthy();
      expect((await stat(join(demoRoot, 'slides', slide.file))).size).toBeGreaterThan(40_000);
    }
  });
});
