// Direction contract — two plain-language competition explainers
// THESIS: 用“以前怎么做 → 现在怎么做 → 最后拿到什么”的动画和实操，让非技术评委一眼看懂产品价值。
// OWN-WORLD: 深墨演示台、蓝色进行态、绿色完成态、琥珀真实性边界；不把技术名词当卖点。
// STORY: 总体问题 → 真实输入 → 分步演示 → 可见改进 → 真实输出 → 能证明与尚待验证的边界。
// FIRST VIEWPORT: 一条由材料流向成果的动画通道，逐项出现，不一次堆满信息。
// FORM: plain-language story flow；每个画面只讲一个动作，并用阶段动画展示因果关系。
// FINISH: 两支视频都必须有独立字幕、逐字稿、十张讲解页和媒体校验；旁白不得依赖技术术语才能听懂。

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { generalOfficeSpec } from './competition-video-specs/general-office.mjs';
import { paperWordPptSpec } from './competition-video-specs/paper-word-ppt.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..');
const demoRoot = join(repoRoot, 'docs/competition/submission_90plus/evidence/demo');
const frontendAssets = join(appRoot, 'apps/frontend/dist/assets');
const browserLibraries = join(repoRoot, '.playwright-deps/usr/lib/x86_64-linux-gnu');
const ffmpegExecutable = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobeExecutable = process.env.FFPROBE_PATH || 'ffprobe';
const pythonExecutable = process.env.PYTHON_PATH || 'python';
const edgeTtsExecutable = process.env.EDGE_TTS_PATH || 'edge-tts';
const narrationVoice = process.env.COMPETITION_VIDEO_VOICE || 'zh-CN-XiaoxiaoNeural';
const narrationRate = process.env.COMPETITION_VIDEO_RATE || '+24%';

const iconAliases = {
  files: 'file', write: 'pen', search: 'search', box: 'box', folder: 'folder', chat: 'chat', table: 'table',
  target: 'target', layout: 'layout', inbox: 'inbox', person: 'person', switch: 'switch', arrow: 'arrow',
  memory: 'history', history: 'history', link: 'link', move: 'arrow', check: 'check', team: 'person', manager: 'person',
  clock: 'clock', compare: 'switch', book: 'book', slides: 'slides', idea: 'idea', calendar: 'calendar',
  warning: 'warning', pdf: 'file', robot: 'robot', send: 'send', copy: 'copy', reuse: 'reuse', file: 'file',
};

const icons = {
  file: '<path d="M8 3h11l5 5v21H8z"/><path d="M19 3v6h6M12 15h9M12 20h9M12 25h6"/>',
  pen: '<path d="M7 25l1-6L22 5l5 5-14 14z"/><path d="M18 9l5 5M6 29h21"/>',
  search: '<circle cx="14" cy="14" r="8"/><path d="M20 20l8 8M11 14h6"/>',
  box: '<path d="M5 10l11-6 11 6-11 6zM5 10v13l11 6 11-6V10M16 16v13"/>',
  folder: '<path d="M4 9h10l3 3h12v15H4z"/><path d="M4 9V6h9l3 3"/>',
  chat: '<path d="M5 6h22v16H14l-7 6v-6H5z"/><path d="M10 12h12M10 17h8"/>',
  table: '<rect x="4" y="5" width="24" height="22" rx="2"/><path d="M4 12h24M12 12v15M20 12v15"/>',
  target: '<circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="6"/><path d="M16 4v6M28 16h-6"/>',
  layout: '<rect x="4" y="5" width="24" height="22" rx="2"/><path d="M4 12h24M12 12v15"/>',
  inbox: '<path d="M5 18h7l2 4h4l2-4h7v10H5zM16 4v12M11 11l5 5 5-5"/>',
  person: '<circle cx="16" cy="10" r="6"/><path d="M6 29c1-8 5-12 10-12s9 4 10 12"/>',
  switch: '<path d="M5 10h19l-5-5M27 22H8l5 5"/>',
  arrow: '<path d="M4 16h23M20 9l7 7-7 7"/>',
  history: '<path d="M7 9V4M7 4h5M7 4a13 13 0 1 1-2 17"/><path d="M16 9v8l6 3"/>',
  link: '<path d="M13 20l-2 2a6 6 0 0 1-8-8l5-5a6 6 0 0 1 8 0M19 12l2-2a6 6 0 0 1 8 8l-5 5a6 6 0 0 1-8 0M11 17h10"/>',
  check: '<circle cx="16" cy="16" r="13"/><path d="M9 16l5 5 9-11"/>',
  clock: '<circle cx="16" cy="16" r="13"/><path d="M16 8v9l6 4"/>',
  book: '<path d="M5 6h9a5 5 0 0 1 5 5v17H10a5 5 0 0 0-5 2z"/><path d="M27 6h-9a5 5 0 0 0-5 5v17h9a5 5 0 0 1 5 2z"/>',
  slides: '<rect x="4" y="5" width="24" height="18" rx="2"/><path d="M16 23v6M10 29h12M9 18l5-5 4 3 5-6"/>',
  idea: '<path d="M11 22h10M12 27h8M16 3a9 9 0 0 0-5 16c1 1 1 2 1 3h8c0-1 0-2 1-3A9 9 0 0 0 16 3z"/>',
  calendar: '<rect x="4" y="7" width="24" height="21" rx="2"/><path d="M10 3v8M22 3v8M4 13h24M10 18h4M18 18h4M10 23h4"/>',
  warning: '<path d="M16 4L30 28H2z"/><path d="M16 12v8M16 24h.01"/>',
  robot: '<rect x="6" y="9" width="20" height="17" rx="4"/><path d="M16 4v5M12 17h.01M20 17h.01M11 22h10"/>',
  send: '<path d="M3 15L29 4l-9 25-5-10zM15 19L29 4"/>',
  copy: '<rect x="9" y="8" width="19" height="20" rx="2"/><path d="M23 8V4H5v20h4"/>',
  reuse: '<path d="M8 10a10 10 0 0 1 17 2l2-5M27 7v7h-7M24 22a10 10 0 0 1-17-2l-2 5M5 25v-7h7"/>',
};

async function run(executable, args, options = {}) {
  const child = spawn(executable, args, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-150_000); });
  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-150_000); });
  await new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', code => code === 0 ? resolveExit() : rejectExit(new Error(`${executable} exited with ${code}\n${stderr}`)));
  });
  return { stdout, stderr };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function iconSvg(name) {
  const family = iconAliases[name] || 'file';
  return `<svg viewBox="0 0 32 32" aria-hidden="true">${icons[family]}</svg>`;
}

function secondsFromTimestamp(value) {
  const [hours, minutes, rest] = value.replace('.', ',').split(':');
  const [seconds, milliseconds = '0'] = rest.split(',');
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds.padEnd(3, '0').slice(0, 3)) / 1000;
}

function srtTimestamp(seconds) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const whole = Math.floor(safe % 60);
  const milliseconds = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function parseSrt(content) {
  return content.trim().split(/\r?\n\r?\n/).flatMap(block => {
    const lines = block.split(/\r?\n/);
    const timingIndex = lines.findIndex(line => line.includes('-->'));
    if (timingIndex < 0) return [];
    const [start, end] = lines[timingIndex].split('-->').map(value => value.trim());
    return [{ start: secondsFromTimestamp(start), end: secondsFromTimestamp(end), text: lines.slice(timingIndex + 1).join(' ').trim() }];
  });
}

function expandSubtitleCues(cues) {
  return cues.flatMap(cue => {
    const phrases = cue.text.match(/[^，。；！？,.!?]+[，。；！？,.!?]?/g) || [cue.text];
    const chunks = [];
    for (const phrase of phrases) {
      if ([...phrase].length <= 23) chunks.push(phrase);
      else {
        const characters = [...phrase];
        for (let start = 0; start < characters.length; start += 23) chunks.push(characters.slice(start, start + 23).join(''));
      }
    }
    const totalWeight = chunks.reduce((sum, text) => sum + Math.max(2, [...text].length), 0);
    let cursor = cue.start;
    return chunks.map((text, index) => {
      const share = (cue.end - cue.start) * Math.max(2, [...text].length) / totalWeight;
      const item = { start: cursor, end: index === chunks.length - 1 ? cue.end : cursor + share, text: text.trim() };
      cursor = item.end;
      return item;
    });
  });
}

async function probe(file) {
  const result = await run(ffprobeExecutable, [
    '-v', 'error',
    '-show_entries', 'format=duration,size:stream=index,codec_type,codec_name,width,height,pix_fmt,channels,sample_rate',
    '-of', 'json',
    file,
  ]);
  return JSON.parse(result.stdout);
}

async function findFontAsset(weight) {
  const files = await fs.readdir(frontendAssets);
  const matcher = new RegExp(`^noto-sans-sc-.*-${weight}-normal-.*\\.woff2$`);
  const file = files.find(candidate => matcher.test(candidate));
  if (!file) throw new Error(`Bundled Noto Sans SC ${weight} font is missing; run npm run build first.`);
  return join(frontendAssets, file);
}

async function convertFont(source, target) {
  const code = [
    'import sys',
    'from fontTools.ttLib import TTFont',
    'font=TTFont(sys.argv[1])',
    'font.flavor=None',
    'font.save(sys.argv[2])',
  ].join(';');
  await run(pythonExecutable, ['-c', code, source, target]);
}

function baseStyles(regularFont, semiboldFont) {
  return `@font-face{font-family:Office;src:url(data:font/woff2;base64,${regularFont}) format('woff2');font-weight:400}@font-face{font-family:Office;src:url(data:font/woff2;base64,${semiboldFont}) format('woff2');font-weight:600}*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#07111f;color:#f4f7fc;font-family:Office,"Noto Sans SC",sans-serif}body{position:relative}.top{position:absolute;left:70px;right:70px;top:48px;display:flex;justify-content:space-between;align-items:center;color:#95a5bf;font-size:18px;letter-spacing:.06em}.brand{color:#edf3ff;font-weight:600}.subtitle-zone{position:absolute;left:0;bottom:0;width:100%;height:118px;background:#030810;border-top:1px solid #24334d}.subtitle-zone:before{content:"讲解字幕";position:absolute;left:44px;top:16px;color:#52617a;font-size:16px;letter-spacing:.12em}`;
}

function slideHtml(spec, slide, slideIndex, stage, fonts) {
  const currentStep = Math.min(slide.steps.length - 1, Math.floor(stage / 2));
  const arrowInMotion = stage % 2 === 1;
  const lastStage = slide.steps.length * 2 - 2;
  const steps = slide.steps.map((step, index) => {
    const visible = index <= currentStep;
    const active = index === currentStep;
    const arrow = index < slide.steps.length - 1
      ? `<div class="flow-arrow ${index < currentStep ? 'done' : ''} ${arrowInMotion && index === currentStep ? 'moving' : ''}"><span></span></div>`
      : '';
    const value = step.value ? `<strong class="value">${escapeHtml(step.value)}</strong>` : '';
    return `<div class="step-wrap"><article class="step ${visible ? 'visible' : ''} ${active ? 'active' : ''}"><div class="icon">${iconSvg(step.icon)}</div>${value}<h3>${escapeHtml(step.label)}</h3><p>${escapeHtml(step.detail)}</p></article>${arrow}</div>`;
  }).join('');
  const beforeActive = currentStep < 2 ? 'active' : '';
  const afterActive = stage === lastStage ? 'active' : '';
  const current = slide.steps[currentStep];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles(fonts.regular, fonts.semibold)}.accent{position:absolute;left:0;top:0;width:14px;height:962px;background:#4e72f5}.halo{position:absolute;right:-140px;top:130px;width:520px;height:520px;border:120px solid #142646;border-radius:50%;opacity:.56}.main{position:absolute;left:92px;right:84px;top:115px;height:800px}.title{margin:0;max-width:1610px;font-size:${slide.kind === 'opening' ? 74 : 64}px;line-height:1.14;letter-spacing:-.035em}.subtitle{margin:16px 0 0;max-width:1520px;color:#c5d1e2;font-size:30px;line-height:1.45}.doing{position:absolute;left:0;top:242px;color:#f0d98b;font-size:22px}.doing strong{color:#fff}.flow{position:absolute;left:0;right:0;top:300px;height:270px;display:flex;align-items:center}.step-wrap{display:flex;align-items:center;flex:1;min-width:0}.step{width:330px;min-height:238px;padding:25px 24px 22px;background:#0b1728;border:1px solid #2b405f;opacity:.1;transform:translateY(12px)}.step.visible{opacity:1;transform:none}.step.active{border-color:#6a89fa;background:#132644;box-shadow:0 18px 46px rgba(2,8,18,.48)}.icon{width:54px;height:54px;color:#68d9c8}.icon svg{width:54px;height:54px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.value{display:block;margin:4px 0 0;color:#fff;font-size:42px;line-height:1}.step h3{margin:16px 0 7px;font-size:27px}.step p{margin:0;color:#aebdd2;font-size:20px;line-height:1.45}.flow-arrow{width:78px;height:28px;opacity:.12;flex:0 0 78px}.flow-arrow span{display:block;position:relative;top:13px;width:62px;height:2px;background:#53647d}.flow-arrow span:after{content:"";position:absolute;right:-1px;top:-5px;border-left:8px solid #53647d;border-top:6px solid transparent;border-bottom:6px solid transparent}.flow-arrow.done,.flow-arrow.moving{opacity:1}.flow-arrow.done span,.flow-arrow.moving span{background:#68d9c8}.flow-arrow.done span:after,.flow-arrow.moving span:after{border-left-color:#68d9c8}.flow-arrow.moving span:before{content:"";position:absolute;right:18px;top:-5px;width:12px;height:12px;border-radius:50%;background:#f0d98b;box-shadow:0 0 18px #f0d98b}.compare{position:absolute;left:0;right:0;bottom:4px;display:flex;gap:22px}.before,.after{flex:1;min-height:104px;padding:18px 24px;font-size:23px;line-height:1.45;opacity:.58}.before{background:#17151d;color:#d5c6cd;border-top:3px solid #a96d78}.after{background:#0b1d20;color:#dff7f1;border-top:3px solid #68d9c8}.before.active,.after.active{opacity:1;box-shadow:0 14px 30px rgba(2,8,18,.35)}.tag{display:block;margin-bottom:4px;font-size:15px;letter-spacing:.1em;color:#8b9ab1}.counter{color:#68d9c8}</style></head><body><div class="accent"></div><div class="halo"></div><div class="top"><span class="brand">${escapeHtml(spec.brand)}</span><span class="counter">白话动画 · ${String(slideIndex + 1).padStart(2, '0')} / ${String(spec.slides.length).padStart(2, '0')}</span></div><main class="main"><h1 class="title">${escapeHtml(slide.title)}</h1><p class="subtitle">${escapeHtml(slide.subtitle)}</p><div class="doing">画面正在说明：<strong>${escapeHtml(current.label)}</strong>　${escapeHtml(current.detail)}</div><section class="flow">${steps}</section><section class="compare"><div class="before ${beforeActive}"><span class="tag">以前怎么做</span>${escapeHtml(slide.before)}</div><div class="after ${afterActive}"><span class="tag">现在改成什么</span>${escapeHtml(slide.after)}</div></section></main><div class="subtitle-zone"></div></body></html>`;
}

function operationHtml(operation, index, operations, fonts) {
  const nodes = operations.map((item, nodeIndex) => `<div class="node ${nodeIndex === index ? 'active' : nodeIndex < index ? 'done' : ''}">${item.number}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles(fonts.regular, fonts.semibold)}.capture{position:absolute;left:30px;top:30px;width:1322px;height:884px;border:1px solid #30425f;background:#0b1220}.corner{position:absolute;left:52px;top:52px;padding:7px 12px;background:#07111fe8;color:#b9c8de;font-size:16px;z-index:3}.side{position:absolute;left:1384px;top:48px;width:478px;height:850px}.chapter{color:#68d9c8;font-size:18px;font-weight:600;letter-spacing:.08em}.side h1{margin:12px 0 24px;font-size:38px;line-height:1.2;letter-spacing:-.025em}.block{margin:0 0 20px;padding:0 0 18px;border-bottom:1px solid #253650}.label{margin-bottom:7px;color:#71829d;font-size:15px;letter-spacing:.09em}.copy{color:#dbe4f2;font-size:21px;line-height:1.48}.block.now .copy{color:#f0d98b}.block.result{padding:17px 19px;background:#0a201f;border:1px solid #2e605a}.block.result .copy{color:#e6faf5}.progress{display:flex;gap:14px;margin-top:24px}.node{width:50px;padding-bottom:7px;border-bottom:3px solid #263852;color:#63738c;text-align:center;font-size:15px}.node.done{border-color:#68d9c8;color:#68d9c8}.node.active{border-color:#5b7df5;color:#fff}.footer{position:absolute;left:32px;bottom:136px;color:#7d8da6;font-size:18px}.footer strong{color:#f0d98b}</style></head><body><div class="capture"></div><div class="corner">真实产品操作画面</div><aside class="side"><div class="chapter">第 ${operation.number} 步 / 共 06 步</div><h1>${escapeHtml(operation.title)}</h1><div class="block"><div class="label">以前要做什么</div><div class="copy">${escapeHtml(operation.before)}</div></div><div class="block now"><div class="label">现在怎么做</div><div class="copy">${escapeHtml(operation.now)}</div></div><div class="block result"><div class="label">最后得到什么</div><div class="copy">${escapeHtml(operation.result)}</div></div><div class="progress">${nodes}</div></aside><div class="footer"><strong>重要原则</strong>　工具负责整理和提醒，最终内容由人确认</div><div class="subtitle-zone"></div></body></html>`;
}

async function renderFrame(page, html, output) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: output, type: 'png' });
  const info = await fs.stat(output);
  if (info.size < 40_000) throw new Error(`Rendered frame is unexpectedly small: ${output} (${info.size} bytes)`);
}

async function synthesizeNarration(item, index, tempRoot) {
  const prefix = `${String(index + 1).padStart(2, '0')}-${item.type}-${item.id || item.kind}`;
  const audio = join(tempRoot, `${prefix}.mp3`);
  const subtitles = join(tempRoot, `${prefix}.srt`);
  await run(edgeTtsExecutable, [
    '--voice', narrationVoice,
    `--rate=${narrationRate}`,
    '--pitch=+0Hz',
    '--text', item.narration,
    '--write-media', audio,
    '--write-subtitles', subtitles,
  ]);
  const metadata = await probe(audio);
  const duration = Number(metadata.format?.duration);
  if (!Number.isFinite(duration) || duration < 2) throw new Error(`Narration audio is invalid: ${audio}`);
  return { audio, duration, cues: expandSubtitleCues(parseSrt(await fs.readFile(subtitles, 'utf8'))) };
}

async function buildAnimatedSlideSegment(frames, narration, duration, output) {
  const transition = 0.28;
  const beatDuration = (duration + transition * (frames.length - 1)) / frames.length;
  const args = ['-y', '-loglevel', 'warning'];
  for (const frame of frames) args.push('-loop', '1', '-framerate', '25', '-t', beatDuration.toFixed(3), '-i', frame);
  args.push('-i', narration.audio);
  const filters = frames.map((_, index) => `[${index}:v]scale=1920:1080:flags=lanczos,fps=25,trim=duration=${beatDuration.toFixed(3)},settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[v${index}]`);
  let previous = 'v0';
  for (let index = 1; index < frames.length; index += 1) {
    const outputLabel = index === frames.length - 1 ? 'out' : `x${index}`;
    const offset = index * (beatDuration - transition);
    filters.push(`[${previous}][v${index}]xfade=transition=fade:duration=${transition}:offset=${offset.toFixed(3)}[${outputLabel}]`);
    previous = outputLabel;
  }
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', `[${previous}]`, '-map', `${frames.length}:a:0`,
    '-af', 'apad', '-t', duration.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart',
    output,
  );
  await run(ffmpegExecutable, args);
}

async function buildOperationSegment(frame, operation, narration, duration, sourceVideo, output) {
  const clipDuration = operation.end - operation.start;
  const freeze = Math.max(0.1, duration - clipDuration + 0.1);
  const filter = [
    `[0:v]fps=25,trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[bg]`,
    `[1:v]fps=25,scale=1322:884:flags=lanczos,tpad=stop_mode=clone:stop_duration=${freeze.toFixed(3)},trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[demo]`,
    '[bg][demo]overlay=30:30:shortest=1,format=yuv420p[out]',
  ].join(';');
  await run(ffmpegExecutable, [
    '-y', '-loglevel', 'warning',
    '-loop', '1', '-framerate', '25', '-i', frame,
    '-ss', operation.start.toFixed(3), '-t', clipDuration.toFixed(3), '-i', sourceVideo,
    '-i', narration.audio,
    '-filter_complex', filter,
    '-map', '[out]', '-map', '2:a:0',
    '-af', 'apad', '-t', duration.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart',
    output,
  ]);
}

function buildTranscript(spec, timeline) {
  const rows = timeline.map(item => `| ${item.order} | ${item.type === 'slide' ? '动画讲解' : '产品实操'} | ${srtTimestamp(item.start).slice(3, 8)}–${srtTimestamp(item.end).slice(3, 8)} | ${item.title} | ${item.narration} |`).join('\n');
  const boundary = spec.id === 'paper-word-ppt'
    ? '- 真实性边界：不会替你保证论文录用；不会假装已经生成最终 PPT 文件。\n'
    : '- 真实性边界：没有真实数据，就不写节省百分比；当前只展示能由画面证明的流程变化。\n';
  return `# ${spec.title}逐字稿\n\n- 产品解决什么：${spec.summary.purpose}\n- 谁会用到：${spec.summary.audience}\n- 工具接收什么：${spec.summary.inputs}\n- 工具交付什么：${spec.summary.outputs}\n- 能明确看到的改进：${spec.summary.improvement}\n${boundary}- 字幕形式：讲解内容作为逐句字幕随语音出现，同时提供可编辑字幕文件。\n\n| 序号 | 形式 | 时间 | 画面 | 逐句字幕/旁白 |\n|---:|---|---|---|---|\n${rows}\n`;
}

async function buildPresentation(spec, fonts) {
  const outputRoot = spec.outputDirectory ? join(demoRoot, spec.outputDirectory) : demoRoot;
  const slideRoot = join(outputRoot, 'slides');
  const outputVideo = join(outputRoot, spec.outputVideo);
  const outputPoster = join(outputRoot, spec.outputPoster);
  const outputSubtitles = join(outputRoot, spec.outputSubtitles);
  const outputTranscript = join(outputRoot, spec.outputTranscript);
  const outputSlideManifest = join(outputRoot, 'presentation-slides.json');
  const sourceVideo = spec.sourceVideo ? join(demoRoot, spec.sourceVideo) : null;
  await fs.mkdir(slideRoot, { recursive: true });

  if (sourceVideo) {
    await fs.access(sourceVideo);
    const sourceMetadata = await probe(sourceVideo);
    const sourceDuration = Number(sourceMetadata.format?.duration);
    if (!Number.isFinite(sourceDuration) || sourceDuration < spec.operations.at(-1).end) throw new Error(`Source recording is too short: ${sourceDuration}`);
  }

  const tempRoot = await fs.mkdtemp(join(os.tmpdir(), `openprism-${spec.id}-`));
  let browser;
  try {
    process.env.LD_LIBRARY_PATH = [browserLibraries, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const expectedSlideFiles = new Set(spec.slides.map(slide => slide.file));
    for (const existingFile of await fs.readdir(slideRoot)) {
      if (existingFile.endsWith('.png') && !expectedSlideFiles.has(existingFile)) await fs.unlink(join(slideRoot, existingFile));
    }

    const slideFrames = new Map();
    for (const [slideIndex, slide] of spec.slides.entries()) {
      const frames = [];
      const animationStages = slide.steps.length * 2 - 1;
      for (let stage = 0; stage < animationStages; stage += 1) {
        const frame = join(tempRoot, `slide-${String(slideIndex + 1).padStart(2, '0')}-stage-${stage}.png`);
        await renderFrame(page, slideHtml(spec, slide, slideIndex, stage, fonts), frame);
        frames.push(frame);
      }
      await fs.copyFile(frames.at(-1), join(slideRoot, slide.file));
      slideFrames.set(slide.file, frames);
    }

    const operationFrames = new Map();
    for (const [index, operation] of spec.operations.entries()) {
      const frame = join(tempRoot, `operation-${operation.number}.png`);
      await renderFrame(page, operationHtml(operation, index, spec.operations, fonts), frame);
      operationFrames.set(operation.id, frame);
    }
    await browser.close();
    browser = null;

    await fs.writeFile(outputSlideManifest, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      title: spec.title,
      format: { width: 1920, height: 1080, style: 'plain-language-story-flow', animatedStagesPerSlide: 7 },
      disclaimer: '画面只说明已实现流程和可观察变化；真实节省时间与最终质量仍需实际任务验证。',
      slides: spec.slides.map(({ file, kind, title, subtitle, steps, before, after, narration }) => ({ file, kind, title, subtitle, steps, before, after, narration })),
    }, null, 2)}\n`, 'utf8');

    const selectedSlides = spec.sequenceSlideFiles
       ? spec.sequenceSlideFiles.map(file => spec.slides.find(slide => slide.file === file))
       : spec.slides;
     if (selectedSlides.some(slide => !slide)) throw new Error(`${spec.id} sequence references an unknown slide.`);
     const sequence = [
       ...selectedSlides.slice(0, spec.introSlideCount).map(slide => ({ type: 'slide', ...slide })),
       ...spec.operations.map(operation => ({ type: 'operation', ...operation })),
       ...selectedSlides.slice(spec.introSlideCount).map(slide => ({ type: 'slide', ...slide })),
     ];
    const narrations = [];
    for (const [index, item] of sequence.entries()) {
      process.stdout.write(`[${spec.id}] narration ${index + 1}/${sequence.length}: ${item.title}\n`);
      narrations.push(await synthesizeNarration(item, index, tempRoot));
    }

    const segments = [];
    const globalCues = [];
    const timeline = [];
    let cursor = 0;
    for (const [index, item] of sequence.entries()) {
      const narration = narrations[index];
      const visualMinimum = item.type === 'operation' ? item.end - item.start : spec.slideMinimumSeconds;
      const duration = Math.max(visualMinimum, narration.duration + 0.75);
      const segment = join(tempRoot, `segment-${String(index + 1).padStart(2, '0')}.mp4`);
      process.stdout.write(`[${spec.id}] segment ${index + 1}/${sequence.length}: ${duration.toFixed(2)}s\n`);
      if (item.type === 'slide') await buildAnimatedSlideSegment(slideFrames.get(item.file), narration, duration, segment);
      else await buildOperationSegment(operationFrames.get(item.id), item, narration, duration, sourceVideo, segment);
      for (const cue of narration.cues) globalCues.push({ start: cursor + cue.start, end: cursor + cue.end, text: cue.text });
      timeline.push({ order: index + 1, type: item.type, title: item.title, start: cursor, end: cursor + duration, narration: item.narration });
      cursor += duration;
      segments.push(segment);
    }

    const subtitleText = `${globalCues.map((cue, index) => `${index + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}\n${cue.text}`).join('\n\n')}\n`;
    await fs.writeFile(outputSubtitles, subtitleText, 'utf8');
    await fs.writeFile(outputTranscript, buildTranscript(spec, timeline), 'utf8');
    const concatList = join(tempRoot, 'segments.txt');
    await fs.writeFile(concatList, `${segments.map(file => `file '${file.replaceAll("'", "'\\''")}'`).join('\n')}\n`, 'utf8');
    const joinedVideo = join(tempRoot, 'joined.mp4');
    await run(ffmpegExecutable, ['-y', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', joinedVideo]);
    const subtitleFilter = `subtitles=${outputSubtitles}:fontsdir=${fonts.ttfRoot}:original_size=1920x1080:force_style='FontName=Noto Sans SC Thin,FontSize=17,PrimaryColour=&H00FFFFFF,OutlineColour=&H002B1A11,BorderStyle=1,Outline=1.1,Shadow=0,Alignment=2,MarginV=10'`;
    await run(ffmpegExecutable, [
      '-y', '-loglevel', 'warning', '-i', joinedVideo,
      '-vf', subtitleFilter,
      '-map', '0:v:0', '-map', '0:a:0',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart',
      outputVideo,
    ]);
    const metadata = await probe(outputVideo);
    const duration = Number(metadata.format?.duration);
    const videoStream = metadata.streams?.find(stream => stream.codec_type === 'video');
    const audioStream = metadata.streams?.find(stream => stream.codec_type === 'audio');
    const [minimumDuration, maximumDuration] = spec.durationRange;
    if (!Number.isFinite(duration) || duration <= minimumDuration || duration >= maximumDuration) throw new Error(`${spec.id} video must be ${minimumDuration}–${maximumDuration} seconds; received ${duration}.`);
    if (videoStream?.codec_name !== 'h264' || videoStream.width !== 1920 || videoStream.height !== 1080 || videoStream.pix_fmt !== 'yuv420p') throw new Error(`Unexpected video stream: ${JSON.stringify(videoStream)}`);
    if (audioStream?.codec_name !== 'aac' || audioStream.channels !== 2) throw new Error(`Unexpected audio stream: ${JSON.stringify(audioStream)}`);
    await run(ffmpegExecutable, ['-y', '-loglevel', 'error', '-ss', Math.min(28, duration / 4).toFixed(2), '-i', outputVideo, '-frames:v', '1', '-q:v', '2', outputPoster]);
    process.stdout.write(`${outputVideo}\n${outputSubtitles}\n${outputTranscript}\n${outputSlideManifest}\n${JSON.stringify(metadata)}\n`);
    return { spec: spec.id, outputVideo, outputSubtitles, outputTranscript, outputSlideManifest, metadata };
  } finally {
    if (browser) await browser.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

await run(edgeTtsExecutable, ['--version']);
const regularWoff = await findFontAsset('400');
const semiboldWoff = await findFontAsset('600');
const fontTempRoot = await fs.mkdtemp(join(os.tmpdir(), 'openprism-video-fonts-'));
try {
  await Promise.all([
    convertFont(regularWoff, join(fontTempRoot, 'NotoSansSC-Regular.ttf')),
    convertFont(semiboldWoff, join(fontTempRoot, 'NotoSansSC-Semibold.ttf')),
  ]);
  const fonts = {
    regular: (await fs.readFile(regularWoff)).toString('base64'),
    semibold: (await fs.readFile(semiboldWoff)).toString('base64'),
    ttfRoot: fontTempRoot,
  };
  const requested = process.env.COMPETITION_VIDEO_VARIANT || 'all';
  const specs = requested === 'office'
    ? [generalOfficeSpec]
    : requested === 'paper'
      ? [paperWordPptSpec]
      : [generalOfficeSpec, paperWordPptSpec];
  for (const spec of specs) await buildPresentation(spec, fonts);
} finally {
  await fs.rm(fontTempRoot, { recursive: true, force: true });
}
