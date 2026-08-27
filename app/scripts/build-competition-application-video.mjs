// Direction contract — competition narrated presentation
// THESIS: 用可核验的讲解与真实操作证据，替代“标题卡 + 录屏”的弱叙事。
// OWN-WORLD: 深墨底、钴蓝流程轨、海绿已核验状态、琥珀边界提示。
// STORY: 问题与人群 → 六步实操 → 成果、意义、推广方向与证据边界。
// FIRST VIEWPORT: 16:9 路演画布，实录为主画面，右侧固定解释目的与结果。
// FORM: evidence corridor，概念种子 a23fe232 的第七方向。
// FINISH: 每一帧都必须回答“做什么、为什么做、得到了什么”，字幕必须独立于画面标签。

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..');
const demoRoot = join(repoRoot, 'docs/competition/submission_90plus/evidence/demo');
const slideRoot = join(demoRoot, 'slides');
const sourceVideo = join(demoRoot, 'office-demo.mp4');
const outputVideo = join(demoRoot, 'office-demo-submission.mp4');
const outputPoster = join(demoRoot, 'office-demo-poster.jpg');
const outputSubtitles = join(demoRoot, 'office-demo-submission.srt');
const outputTranscript = join(demoRoot, 'office-demo-submission-transcript.md');
const outputSlideManifest = join(demoRoot, 'presentation-slides.json');
const frontendAssets = join(appRoot, 'apps/frontend/dist/assets');
const browserLibraries = join(repoRoot, '.playwright-deps/usr/lib/x86_64-linux-gnu');
const ffmpegExecutable = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobeExecutable = process.env.FFPROBE_PATH || 'ffprobe';
const pythonExecutable = process.env.PYTHON_PATH || 'python';
const edgeTtsExecutable = process.env.EDGE_TTS_PATH || 'edge-tts';
const narrationVoice = process.env.COMPETITION_VIDEO_VOICE || 'zh-CN-XiaoxiaoNeural';

const operations = [
  { id: 'inbox', number: '01', title: '收件：把散落材料变成任务', start: 2.8, end: 15.1,
    purpose: '先统一入口，避免需求、附件和交付时间在聊天记录里失联。', input: 'DOCX 附件、补充说明、截止时间',
    result: '形成可追踪的材料任务，原件进入项目来源区。', evidence: '演示数据 · 附件收件成功',
    narration: '第一步是收件。导入原始文档和补充说明，把散落在聊天、邮件和目录里的需求，变成有来源、可追踪的统一任务。' },
  { id: 'produce', number: '02', title: '生成：先规划，再产出可编辑文档', start: 15.1, end: 33.2,
    purpose: '把一次性提示词变成可复用、可校验的生产流程。', input: '会议材料、模板与标准化配方',
    result: 'OfficeCLI 生成并校验文档，同时提取决策和待办。', evidence: 'OfficeCLI 1.0.145 · validate 成功',
    narration: '第二步是生成。系统调用标准化配方，生成可编辑文档并执行格式校验，同时提取决策和待办。这样得到的是可继续协作的办公产物。' },
  { id: 'review', number: '03', title: '复核：让 AI 结论回到证据', start: 33.2, end: 43.5,
    purpose: '把“看起来合理”拆成有依据、冲突与缺失项的审查。', input: '生成稿、原始来源与审阅规则',
    result: '定位支持证据、冲突和缺口，并保留人工接受动作。', evidence: '演示操作 · 建议经人工接受',
    narration: '第三步是复核。查看结论的支持证据、冲突和缺失项，再由人决定是否接受建议，把 AI 输出变成可审阅过程。' },
  { id: 'approve', number: '04', title: '审批：发布前必须经过人', start: 43.5, end: 53.4,
    purpose: '把重要材料的发布权留在明确的人工门禁之后。', input: '复核完成的候选稿与审批意见',
    result: '状态依次进入复核、批准和本地发布，形成过程记录。', evidence: '本地演示闭环 · 非外部审批系统',
    narration: '第四步是审批。候选稿经过复核、批准和发布，人工门禁避免 AI 自动对外发布。这里证明的是项目内本地闭环。' },
  { id: 'measure', number: '05', title: '度量：让效率收益可以讨论', start: 53.4, end: 63.5,
    purpose: '用统一口径记录时间、成本和质量，而不是口头宣称提效。', input: '任务时间、人工复核、模型与工具成本字段',
    result: '形成可复现实验口径，为真实试点留出同口径对照。', evidence: '受控实验字段 · 不等于长期业务收益',
    narration: '第五步是度量。记录时间、人工复核、模型和工具成本，建立统一实验口径。当前只是受控验证，不代表长期业务收益。' },
  { id: 'deliver', number: '06', title: '交付：把结论、风险和证据一起带走', start: 63.5, end: 73.6,
    purpose: '让评审者和协作者能复查产物，而不只看到一段演示。', input: '任务结果、风险提示、M01 至 M06 材料',
    result: '生成交付包、完整性校验和低风险结论。', evidence: '演示评分 94/100 · SHA-256 可核验',
    narration: '第六步是交付。汇总结果、风险和标准材料并生成校验。九十四分是演示样例的规则评分，不是赛事官方成绩。' },
];

const slides = [
  { file: '01-title.png', kind: 'opening', eyebrow: 'AI 办公赛道 · 参赛作品讲解', title: 'OpenPrism Office', subtitle: '可核验的 AI 办公材料工作台',
    statement: '把“收件—生成—复核—审批—度量—交付”串成一条有人负责、有证据可查的办公闭环。',
    cards: [['产品定位', '面向高要求材料生产，不替代责任人'], ['演示结构', '先讲为什么，再看怎样做，最后说明结果'], ['证据原则', '技术演示、受控实验、真实业务效果严格分层']],
    narration: '这是 OpenPrism Office，可核验的 AI 办公材料工作台。下面先讲产品，再看六步实操和最终成果。' },
  { file: '02-problem.png', kind: 'meaning', eyebrow: '01 · 产品意义', title: 'AI 会写，不等于材料能交付', subtitle: '真正费时的，是来源散、反复改、责任模糊和结果难证明。',
    statement: '产品不追求再增加一个聊天框，而是把 AI 能力放进可管理的办公流程。',
    cards: [['材料散落', '附件、要求、截止时间缺少统一入口'], ['过程失控', '生成快，但依据、冲突和修改责任不清'], ['效果难证', '只有结果截图，缺少时间、成本和证据链']],
    narration: 'AI 会写，不等于材料能放心交付。产品把生成能力放进可管理、可复核、可追踪的办公流程。' },
  { file: '03-audience.png', kind: 'audience', eyebrow: '02 · 目标用户', title: '服务高频材料生产者与审核者', subtitle: '适合需要“快”，同时必须保证“准、稳、可追责”的团队。',
    statement: 'AI 负责整理与提示，人负责判断、批准和对外责任。',
    cards: [['办公室与综合岗', '汇报、会议纪要、方案和通知材料'], ['项目与运营团队', '多来源协作、版本推进和交付管理'], ['审核与管理人员', '关注依据、风险、审批状态与效果口径']],
    narration: '目标用户是办公室、项目运营和审核人员。AI 负责整理与提示，人负责判断、批准和最终责任。' },
  { file: '04-workflow.png', kind: 'workflow', eyebrow: '03 · 核心能力', title: '一条闭环，六个可解释步骤', subtitle: '每一步都回答：输入是什么、为什么要做、谁来负责、留下什么证据。',
    statement: '下一段进入真实产品操作，右侧解释每一步的目的、输入和结果。',
    cards: [['01 收件', '统一入口'], ['02 生成', '配方生产'], ['03 复核', '证据审查'], ['04 审批', '人工门禁'], ['05 度量', '同口径记录'], ['06 交付', '材料与校验']],
    narration: '核心流程有收件、生成、复核、审批、度量和交付。实操将解释每一步的目的、输入、结果和证据边界。' },
  { file: '05-results.png', kind: 'results', eyebrow: '10 · 组合成果', title: '六步组合后，得到的不只是一份文档', subtitle: '任务、内容、证据、责任、成本与交付物被放进同一条可回看的链路。',
    statement: '从“一次生成”升级为“可追踪的办公生产过程”。',
    cards: [['过程成果', '来源、配方、复核、审批状态连续可见'], ['交付成果', '文档、风险、标准材料与校验摘要一起输出'], ['管理成果', '为同口径效率评估和真实试点提供基础']],
    narration: '六步组合后，来源、复核、审批、成本和交付材料连成证据链，办公生产不再是一次性的 AI 生成。' },
  { file: '06-value.png', kind: 'value', eyebrow: '11 · 作品价值', title: '解决三类最难被聊天机器人覆盖的问题', subtitle: '减少信息断点，降低审查盲区，避免无法证明的效率承诺。',
    statement: '效率不是少点几次鼠标，而是更少返工、更快定位问题、更容易放心交付。',
    cards: [['协作困难', '统一任务与状态，减少信息在多人之间丢失'], ['质量困难', '把依据、冲突、缺口和人工决定显式化'], ['证明困难', '用可复现实验和证据包替代口头提效']],
    narration: '作品解决协作断点、审查盲区和效果难证三类困难，价值是减少返工、更快定位问题、更放心交付。' },
  { file: '07-promotion.png', kind: 'promotion', eyebrow: '12 · 推广方向', title: '从单个工作台，推广为组织级材料能力', subtitle: '流程骨架可复用，业务模板、规则和系统连接器按场景替换。',
    statement: '推广先从小范围真实试点开始，再连接现有办公平台，不绕过组织治理。',
    cards: [['横向场景', '纪要、方案、汇报、制度、申报与项目交付'], ['组织接入', '对接文档库、审批、消息与权限体系'], ['规模验证', '按岗位和材料类型开展盲评与同口径对照']],
    narration: '推广从纪要、方案和申报等高频材料开始，再连接文档、审批和权限系统，并用真实试点验证效果。' },
  { file: '08-end.png', kind: 'ending', eyebrow: '13 · 结论与边界', title: '让 AI 办公既更快，也更可信', subtitle: '本次作品已证明技术闭环可运行；真实长期收益仍需企业试点继续验证。',
    statement: 'OpenPrism Office：把材料生成，变成可核验、可复用、可推广的办公生产力。',
    cards: [['已证明', '六步演示闭环、文档校验、过程记录、证据包'], ['未证明', '跨组织长期收益、赛事官方得分、生产系统集成效果'], ['下一步', '真实用户试点、盲评对照、连接器与权限治理']],
    narration: '本作品已证明六步技术闭环可运行，但不虚构长期收益和官方得分。下一步用真实试点和系统连接验证推广价值。' },
];

const sequence = [...slides.slice(0, 4).map(slide => ({ type: 'slide', ...slide })), ...operations.map(operation => ({ type: 'operation', ...operation })), ...slides.slice(4).map(slide => ({ type: 'slide', ...slide }))];

async function run(executable, args, options = {}) {
  const child = spawn(executable, args, { cwd: options.cwd || repoRoot, env: options.env || process.env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-150_000); });
  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-150_000); });
  await new Promise((resolveExit, rejectExit) => { child.once('error', rejectExit); child.once('exit', code => code === 0 ? resolveExit() : rejectExit(new Error(`${executable} exited with ${code}\n${stderr}`))); });
  return { stdout, stderr };
}

function escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function secondsFromTimestamp(value) {
  const [hours, minutes, rest] = value.replace('.', ',').split(':'); const [seconds, milliseconds = '0'] = rest.split(',');
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds.padEnd(3, '0').slice(0, 3)) / 1000;
}
function srtTimestamp(seconds) {
  const safe = Math.max(0, seconds); const hours = Math.floor(safe / 3600); const minutes = Math.floor((safe % 3600) / 60); const whole = Math.floor(safe % 60); const milliseconds = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}
function parseSrt(content) {
  return content.trim().split(/\r?\n\r?\n/).flatMap(block => { const lines = block.split(/\r?\n/); const timingIndex = lines.findIndex(line => line.includes('-->')); if (timingIndex < 0) return []; const [start, end] = lines[timingIndex].split('-->').map(value => value.trim()); return [{ start: secondsFromTimestamp(start), end: secondsFromTimestamp(end), text: lines.slice(timingIndex + 1).join(' ').trim() }]; });
}
function expandSubtitleCues(cues) {
  return cues.flatMap(cue => {
    const phrases = cue.text.match(/[^，。；！？,.!?]+[，。；！？,.!?]?/g) || [cue.text];
    const chunks = [];
    for (const phrase of phrases) {
      if (phrase.length <= 23) chunks.push(phrase);
      else for (let start = 0; start < phrase.length; start += 23) chunks.push(phrase.slice(start, start + 23));
    }
    const totalWeight = chunks.reduce((sum, text) => sum + Math.max(2, text.length), 0);
    let cursor = cue.start;
    return chunks.map((text, index) => {
      const share = (cue.end - cue.start) * Math.max(2, text.length) / totalWeight;
      const item = { start: cursor, end: index === chunks.length - 1 ? cue.end : cursor + share, text: text.trim() };
      cursor = item.end;
      return item;
    });
  });
}
async function probe(file) { const result = await run(ffprobeExecutable, ['-v', 'error', '-show_entries', 'format=duration,size:stream=index,codec_type,codec_name,width,height,pix_fmt,channels,sample_rate', '-of', 'json', file]); return JSON.parse(result.stdout); }
async function findFontAsset(weight) {
  const files = await fs.readdir(frontendAssets); const matcher = new RegExp(`^noto-sans-sc-.*-${weight}-normal-.*\\.woff2$`); const file = files.find(candidate => matcher.test(candidate));
  if (!file) throw new Error(`Bundled Noto Sans SC ${weight} font is missing; run npm run build first.`); return join(frontendAssets, file);
}
async function convertFont(source, target) { const code = ['import sys', 'from fontTools.ttLib import TTFont', 'font=TTFont(sys.argv[1])', 'font.flavor=None', 'font.save(sys.argv[2])'].join(';'); await run(pythonExecutable, ['-c', code, source, target]); }

function baseStyles(regularFont, semiboldFont) {
  return `@font-face{font-family:Office;src:url(data:font/woff2;base64,${regularFont}) format('woff2');font-weight:400}@font-face{font-family:Office;src:url(data:font/woff2;base64,${semiboldFont}) format('woff2');font-weight:600}*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#07111f;color:#f3f7ff;font-family:Office,"Noto Sans SC",sans-serif}body{position:relative}.rail{position:absolute;left:0;top:0;width:12px;height:960px;background:#4f6ef7}.topline{position:absolute;left:68px;top:50px;right:64px;display:flex;align-items:center;justify-content:space-between;font-size:20px;letter-spacing:.06em;color:#93a4c4}.brand{color:#dce5f7;font-weight:600}.subtitle-zone{position:absolute;left:0;bottom:0;width:100%;height:120px;background:#040a12;border-top:1px solid #263754}.subtitle-zone:before{content:"实时讲解字幕";position:absolute;left:44px;top:16px;color:#51617d;font-size:16px;letter-spacing:.12em}`;
}
function slideHtml(slide, fonts) {
  const cards = slide.cards.map(([title, copy], index) => `<article class="card"><div class="card-no">${String(index + 1).padStart(2, '0')}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></article>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles(fonts.regular, fonts.semibold)}main{position:absolute;left:84px;top:118px;right:72px;height:810px}.eyebrow{font-size:24px;color:#62d9c7;font-weight:600;letter-spacing:.08em}.title{max-width:1540px;margin:22px 0 0;font-size:${slide.kind === 'opening' ? 92 : 70}px;line-height:1.12;letter-spacing:-.035em}.subtitle{max-width:1500px;margin:26px 0 0;color:#b7c5dd;font-size:32px;line-height:1.45}.statement{position:absolute;left:0;top:${slide.kind === 'opening' ? 352 : 326}px;width:570px;border:1px solid #5f522c;border-top:4px solid #f3c969;background:#10191e;padding:18px 22px;color:#e9eef9;font-size:28px;line-height:1.55}.cards{position:absolute;left:640px;right:0;top:${slide.cards.length > 3 ? 315 : 340}px;display:grid;grid-template-columns:repeat(${slide.cards.length > 3 ? 3 : 1},1fr);gap:18px}.card{min-height:${slide.cards.length > 3 ? 168 : 116}px;border:1px solid #263a5d;background:#0b1729;padding:22px 26px;position:relative}.card-no{position:absolute;right:20px;top:18px;color:#4f6ef7;font-size:18px}.card h3{margin:0 60px 8px 0;color:#f3f7ff;font-size:${slide.cards.length > 3 ? 25 : 27}px}.card p{margin:0;color:#9eb0cc;font-size:${slide.cards.length > 3 ? 20 : 22}px;line-height:1.45}.footer{position:absolute;left:84px;bottom:138px;color:#6e809e;font-size:18px}.footer strong{color:#f3c969;font-weight:600}</style></head><body><div class="rail"></div><div class="topline"><span class="brand">OPENPRISM OFFICE</span><span>OFFICE TRACK · NARRATED EVIDENCE</span></div><main><div class="eyebrow">${escapeHtml(slide.eyebrow)}</div><h1 class="title">${escapeHtml(slide.title)}</h1><div class="subtitle">${escapeHtml(slide.subtitle)}</div><div class="statement">${escapeHtml(slide.statement)}</div><section class="cards">${cards}</section></main><div class="footer"><strong>证据边界</strong>　演示状态与受控实验不等同于赛事官方评分或长期业务收益</div><div class="subtitle-zone"></div></body></html>`;
}
function operationHtml(operation, index, fonts) {
  const nodes = operations.map((item, nodeIndex) => `<div class="node ${nodeIndex === index ? 'active' : nodeIndex < index ? 'done' : ''}"><span>${item.number}</span></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles(fonts.regular, fonts.semibold)}.capture{position:absolute;left:32px;top:32px;width:1320px;height:880px;border:1px solid #314361;background:#0b1220}.side{position:absolute;left:1394px;top:48px;width:466px;height:850px}.chapter{color:#62d9c7;font-size:22px;font-weight:600;letter-spacing:.1em}.side h1{margin:16px 0 30px;font-size:42px;line-height:1.22;letter-spacing:-.025em}.label{margin-top:24px;color:#7689aa;font-size:17px;letter-spacing:.12em}.copy{margin-top:8px;color:#d8e1f0;font-size:22px;line-height:1.48}.result{border:1px solid #315c58;background:#0a1d25;padding:14px 16px}.evidence{margin-top:28px;padding:15px 18px;border:1px solid #7c6732;color:#f3c969;background:#17180f;font-size:18px;line-height:1.4}.progress{display:flex;gap:15px;margin-top:32px}.node{width:48px;height:34px;border-bottom:3px solid #263a5b;color:#61728f;text-align:center;font-size:16px}.node.done{border-color:#62d9c7;color:#62d9c7}.node.active{border-color:#4f6ef7;color:#fff}.corner{position:absolute;left:52px;top:52px;padding:7px 12px;background:#07111fe6;color:#9fb0cd;font-size:16px;z-index:3}.footer{position:absolute;left:32px;bottom:138px;color:#6e809e;font-size:18px}.footer strong{color:#f3c969}</style></head><body><div class="capture"></div><div class="corner">真实产品录屏 · 受控演示环境</div><aside class="side"><div class="chapter">实操 ${operation.number} / 06</div><h1>${escapeHtml(operation.title)}</h1><div class="label">为什么做</div><div class="copy">${escapeHtml(operation.purpose)}</div><div class="label">本步输入</div><div class="copy">${escapeHtml(operation.input)}</div><div class="label">得到什么</div><div class="copy result">${escapeHtml(operation.result)}</div><div class="evidence">${escapeHtml(operation.evidence)}</div><div class="progress">${nodes}</div></aside><div class="footer"><strong>责任边界</strong>　AI 辅助生产与提示，人工完成复核、审批并承担最终责任</div><div class="subtitle-zone"></div></body></html>`;
}
async function renderFrame(page, html, output) {
  await page.setContent(html, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: output, type: 'png' });
  const info = await fs.stat(output); if (info.size < 40_000) throw new Error(`Rendered frame is unexpectedly small: ${output} (${info.size} bytes)`);
}
async function synthesizeNarration(item, index, tempRoot) {
  const prefix = `${String(index + 1).padStart(2, '0')}-${item.type}-${item.id || item.kind}`; const audio = join(tempRoot, `${prefix}.mp3`); const subtitles = join(tempRoot, `${prefix}.srt`);
  await run(edgeTtsExecutable, ['--voice', narrationVoice, '--rate=+18%', '--pitch=+0Hz', '--text', item.narration, '--write-media', audio, '--write-subtitles', subtitles]);
  const metadata = await probe(audio); const duration = Number(metadata.format?.duration); if (!Number.isFinite(duration) || duration < 2) throw new Error(`Narration audio is invalid: ${audio}`);
  return { audio, subtitles, duration, cues: expandSubtitleCues(parseSrt(await fs.readFile(subtitles, 'utf8'))) };
}
async function buildSlideSegment(frame, narration, duration, output) {
  await run(ffmpegExecutable, ['-y', '-loglevel', 'warning', '-loop', '1', '-framerate', '25', '-i', frame, '-i', narration.audio, '-map', '0:v:0', '-map', '1:a:0', '-vf', 'fps=25,format=yuv420p', '-af', 'apad', '-t', duration.toFixed(3), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', output]);
}
async function buildOperationSegment(frame, operation, narration, duration, output) {
  const clipDuration = operation.end - operation.start; const freeze = Math.max(0.1, duration - clipDuration + 0.1);
  const filter = [`[0:v]fps=25,trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[bg]`, `[1:v]fps=25,scale=1320:880:flags=lanczos,tpad=stop_mode=clone:stop_duration=${freeze.toFixed(3)},trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[demo]`, '[bg][demo]overlay=32:32:shortest=1,format=yuv420p[out]'].join(';');
  await run(ffmpegExecutable, ['-y', '-loglevel', 'warning', '-loop', '1', '-framerate', '25', '-i', frame, '-ss', operation.start.toFixed(3), '-t', clipDuration.toFixed(3), '-i', sourceVideo, '-i', narration.audio, '-filter_complex', filter, '-map', '[out]', '-map', '2:a:0', '-af', 'apad', '-t', duration.toFixed(3), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', output]);
}

await Promise.all([fs.access(sourceVideo), fs.access(edgeTtsExecutable), fs.mkdir(slideRoot, { recursive: true })]);
await run(edgeTtsExecutable, ['--version']);
const sourceMetadata = await probe(sourceVideo); const sourceDuration = Number(sourceMetadata.format?.duration);
if (!Number.isFinite(sourceDuration) || sourceDuration < operations.at(-1).end) throw new Error(`Source recording is too short: ${sourceDuration}`);
const tempRoot = await fs.mkdtemp(join(os.tmpdir(), 'openprism-narrated-video-')); let browser;

try {
  const regularWoff = await findFontAsset('400'); const semiboldWoff = await findFontAsset('600');
  const fonts = { regular: (await fs.readFile(regularWoff)).toString('base64'), semibold: (await fs.readFile(semiboldWoff)).toString('base64') };
  const fontRoot = join(tempRoot, 'fonts'); await fs.mkdir(fontRoot, { recursive: true });
  await Promise.all([convertFont(regularWoff, join(fontRoot, 'NotoSansSC-Regular.ttf')), convertFont(semiboldWoff, join(fontRoot, 'NotoSansSC-Semibold.ttf'))]);
  process.env.LD_LIBRARY_PATH = [browserLibraries, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':');
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  for (const slide of slides) await renderFrame(page, slideHtml(slide, fonts), join(slideRoot, slide.file));
  const operationFrames = new Map();
  for (const [index, operation] of operations.entries()) { const frame = join(tempRoot, `operation-${operation.number}.png`); await renderFrame(page, operationHtml(operation, index, fonts), frame); operationFrames.set(operation.id, frame); }
  await browser.close(); browser = null;
  await fs.writeFile(outputSlideManifest, `${JSON.stringify({ generatedAt: new Date().toISOString(), format: { width: 1920, height: 1080, style: 'evidence-corridor' }, disclaimer: '讲解页中的演示结果与受控实验不等同于赛事官方评分或长期业务收益。', slides: slides.map(({ file, kind, eyebrow, title, subtitle, statement, narration }) => ({ file, kind, eyebrow, title, subtitle, statement, narration })) }, null, 2)}\n`, 'utf8');

  const narrations = [];
  for (const [index, item] of sequence.entries()) { process.stdout.write(`narration ${index + 1}/${sequence.length}: ${item.title}\n`); narrations.push(await synthesizeNarration(item, index, tempRoot)); }
  const segments = []; const globalCues = []; const timeline = []; let cursor = 0;
  for (const [index, item] of sequence.entries()) {
    const narration = narrations[index]; const visualMinimum = item.type === 'operation' ? item.end - item.start : 7.2; const duration = Math.max(visualMinimum, narration.duration + 0.75);
    const segment = join(tempRoot, `segment-${String(index + 1).padStart(2, '0')}.mp4`); const frame = item.type === 'slide' ? join(slideRoot, item.file) : operationFrames.get(item.id);
    process.stdout.write(`segment ${index + 1}/${sequence.length}: ${duration.toFixed(2)}s\n`);
    if (item.type === 'slide') await buildSlideSegment(frame, narration, duration, segment); else await buildOperationSegment(frame, item, narration, duration, segment);
    for (const cue of narration.cues) globalCues.push({ start: cursor + cue.start, end: cursor + cue.end, text: cue.text });
    timeline.push({ order: index + 1, type: item.type, title: item.title, start: cursor, end: cursor + duration, narration: item.narration }); cursor += duration; segments.push(segment);
  }
  const subtitleText = `${globalCues.map((cue, index) => `${index + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}\n${cue.text}`).join('\n\n')}\n`; await fs.writeFile(outputSubtitles, subtitleText, 'utf8');
  const transcriptRows = timeline.map(item => `| ${item.order} | ${item.type === 'slide' ? 'PPT 讲解' : '产品实操'} | ${srtTimestamp(item.start).slice(3, 8)}–${srtTimestamp(item.end).slice(3, 8)} | ${item.title} | ${item.narration} |`).join('\n');
  await fs.writeFile(outputTranscript, `# OpenPrism Office 讲解视频逐字稿\n\n- 产品意义：把生成能力放进可管理、可核验的办公流程。\n- 目标用户：办公室/综合岗、项目与运营团队、审核与管理人员。\n- 字幕形式：逐句字幕随中文语音定时出现，并另行提供可编辑 SRT；画面标签不充当字幕。\n- 证据边界：演示状态、受控实验与建议评分不等同于赛事官方成绩或长期业务收益。\n\n| 序号 | 形式 | 时间 | 章节 | 逐句字幕/旁白 |\n|---:|---|---|---|---|\n${transcriptRows}\n`, 'utf8');
  const concatList = join(tempRoot, 'segments.txt'); await fs.writeFile(concatList, `${segments.map(file => `file '${file.replaceAll("'", "'\\''")}'`).join('\n')}\n`, 'utf8');
  const joinedVideo = join(tempRoot, 'joined.mp4'); await run(ffmpegExecutable, ['-y', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', joinedVideo]);
  const subtitleFilter = `subtitles=${outputSubtitles}:fontsdir=${fontRoot}:original_size=1920x1080:force_style='FontName=Noto Sans SC Thin,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00111A2B,BorderStyle=1,Outline=1.3,Shadow=0,Alignment=2,MarginV=10'`;
  await run(ffmpegExecutable, ['-y', '-loglevel', 'warning', '-i', joinedVideo, '-vf', subtitleFilter, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', outputVideo]);
  const metadata = await probe(outputVideo); const duration = Number(metadata.format?.duration); const videoStream = metadata.streams?.find(stream => stream.codec_type === 'video'); const audioStream = metadata.streams?.find(stream => stream.codec_type === 'audio');
  if (!Number.isFinite(duration) || duration <= 120 || duration >= 180) throw new Error(`Submission video must be 120–180 seconds; received ${duration}.`);
  if (videoStream?.codec_name !== 'h264' || videoStream.width !== 1920 || videoStream.height !== 1080 || videoStream.pix_fmt !== 'yuv420p') throw new Error(`Unexpected video stream: ${JSON.stringify(videoStream)}`);
  if (audioStream?.codec_name !== 'aac' || audioStream.channels !== 2) throw new Error(`Unexpected audio stream: ${JSON.stringify(audioStream)}`);
  await run(ffmpegExecutable, ['-y', '-loglevel', 'error', '-ss', '28', '-i', outputVideo, '-frames:v', '1', '-q:v', '2', outputPoster]);
  process.stdout.write(`${outputVideo}\n${outputSubtitles}\n${outputTranscript}\n${outputSlideManifest}\n${JSON.stringify(metadata)}\n`);
} finally { if (browser) await browser.close(); await fs.rm(tempRoot, { recursive: true, force: true }); }
