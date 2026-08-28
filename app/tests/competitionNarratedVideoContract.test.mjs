import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const appRoot = join(repoRoot, 'app');
const demoRoot = join(repoRoot, 'docs/competition/submission_90plus/evidence/demo');

describe('competition narrated presentation video contract', () => {
  it('builds two plain-language videos without technical jargon in narration', async () => {
    const builder = await readFile(join(appRoot, 'scripts/build-competition-application-video.mjs'), 'utf8');
    const generalSpec = await readFile(join(appRoot, 'scripts/competition-video-specs/general-office.mjs'), 'utf8');
    const academicSpec = await readFile(join(appRoot, 'scripts/competition-video-specs/paper-word-ppt.mjs'), 'utf8');
    const narrationText = [generalSpec, academicSpec]
      .flatMap(source => [...source.matchAll(/narration:\s*'([^']+)'/g)].map(match => match[1]))
      .join('\n');

    expect(builder).toContain('edge-tts');
    expect(builder).not.toContain('fs.access(edgeTtsExecutable)');
    expect(builder).toContain('zh-CN-XiaoxiaoNeural');
    expect(builder).toContain('1920');
    expect(builder).toContain('1080');
    expect(builder).toContain("'-c:a', 'aac'");
    expect(generalSpec).toContain('office-demo-submission.srt');
    expect(academicSpec).toContain('paper-word-ppt-submission.srt');
    expect(builder).toContain('Noto Sans SC Thin');
    expect(builder).toContain('expandSubtitleCues');
    expect(builder).toContain('loudnorm=I=-16');
    expect(builder).toContain('original_size=1920x1080');
    expect(builder).toContain('FontSize=17');
    expect(builder).toContain('MarginV=10');
    expect(builder).toContain('以前要做什么');
    expect(builder).toContain('现在怎么做');
    expect(generalSpec).toContain('四个地方');
    expect(generalSpec).toContain('一个任务');
    expect(generalSpec).toContain('没有真实数据，就不写节省百分比');
    expect(academicSpec).toContain('写论文');
    expect(academicSpec).toContain('Word');
    expect(academicSpec).toContain('PPT');
    expect(academicSpec).toContain('人工确认');
    expect(academicSpec).toContain('不会替你保证论文录用');
    expect(narrationText).not.toMatch(/native-ooxml|ready|validate|OfficeCLI|SHA-256|M0[1-6]|manifest|designed|适配器|证据链|闭环|同口径|质量盲评/i);
  });

  it('ships plain-language office narration evidence and ten animated presentation frames', async () => {
    const subtitles = await readFile(join(demoRoot, 'office-demo-submission.srt'), 'utf8');
    const transcript = await readFile(join(demoRoot, 'office-demo-submission-transcript.md'), 'utf8');

    expect(subtitles).toContain('这个工具解决的是一个很常见的问题');
    expect(subtitles).toContain('先把资料放进来');
    expect(subtitles).toContain('四个地方');
    const subtitleLines = subtitles
      .split(/\r?\n/)
      .filter(line => line && !/^\d+$/.test(line) && !line.includes('-->'));
    expect(Math.max(...subtitleLines.map(line => [...line].length))).toBeLessThanOrEqual(23);
    expect(transcript).toContain('产品解决什么');
    expect(transcript).toContain('谁会用到');
    expect(transcript).toContain('逐句字幕');
    expect(transcript).toContain('以前做一份申报或汇报材料');
    expect(transcript).toContain('工具接收什么');
    expect(transcript).toContain('工具交付什么');
    expect(transcript).toContain('能明确看到的改进');
    expect(transcript).toContain('没有真实数据，就不写节省百分比');

    const manifest = JSON.parse(await readFile(join(demoRoot, 'presentation-slides.json'), 'utf8'));
    expect(manifest.slides).toHaveLength(10);
    for (let index = 1; index <= 10; index += 1) {
      const filename = `${String(index).padStart(2, '0')}-`;
      const slide = manifest.slides.find(item => item.file.startsWith(filename));
      expect(slide, filename).toBeTruthy();
      expect((await stat(join(demoRoot, 'slides', slide.file))).size).toBeGreaterThan(40_000);
    }
  });

  it('ships a separate paper, Word, and PPT explainer with editable captions and ten frames', async () => {
    const academicRoot = join(demoRoot, 'paper-word-ppt');
    const subtitles = await readFile(join(academicRoot, 'paper-word-ppt-submission.srt'), 'utf8');
    const transcript = await readFile(join(academicRoot, 'paper-word-ppt-submission-transcript.md'), 'utf8');
    const video = await readFile(join(academicRoot, 'paper-word-ppt-submission.mp4'));

    expect(video.length).toBeGreaterThan(1_000_000);
    expect(video.subarray(4, 8).toString()).toBe('ftyp');
    expect(subtitles).toContain('写论文');
    expect(subtitles).toContain('Word');
    expect(subtitles).toContain('PPT');
    expect(subtitles).toContain('人工确认');
    const subtitleLines = subtitles
      .split(/\r?\n/)
      .filter(line => line && !/^\d+$/.test(line) && !line.includes('-->'));
    expect(Math.max(...subtitleLines.map(line => [...line].length))).toBeLessThanOrEqual(23);
    expect(transcript).toContain('论文、Word、PPT');
    expect(transcript).toContain('不会替你保证论文录用');
    expect(transcript).toContain('不会假装已经生成最终 PPT 文件');

    const manifest = JSON.parse(await readFile(join(academicRoot, 'presentation-slides.json'), 'utf8'));
    expect(manifest.slides).toHaveLength(10);
    for (const slide of manifest.slides) {
      expect((await stat(join(academicRoot, 'slides', slide.file))).size).toBeGreaterThan(40_000);
    }
  });
});
