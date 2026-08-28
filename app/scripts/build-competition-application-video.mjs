// Direction contract — competition narrated presentation
// THESIS: 用可核验的讲解与真实操作证据，替代“标题卡 + 录屏”的弱叙事。
// OWN-WORLD: 深墨底、钴蓝流程轨、海绿已核验状态、琥珀边界提示。
// STORY: 典型人工流程 → 系统实际输入 → 六步实操 → 实际输出 → 前后对照与证据边界。
// FIRST VIEWPORT: 16:9 路演画布，实录为主画面，右侧固定解释人工做法、输入与输出。
// FORM: evidence corridor，概念种子 a23fe232 的第七方向。
// FINISH: 每一帧都必须回答“以前怎么做、输入什么、输出什么、优势从哪里来”，字幕必须独立于画面标签。

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
const narrationRate = process.env.COMPETITION_VIDEO_RATE || '+28%';

const operations = [
  { id: 'inbox', number: '01', title: '收件：材料进入统一任务', start: 2.8, end: 15.1,
    manual: '下载附件、重命名、建文件夹，再把要求和截止时间抄到备忘录。',
    input: 'demo-architecture-review.docx、补充说明与截止时间',
    result: '来源记录：native-ooxml、ready、路径、段落与文本摘录。',
    advantage: '原件、要求和解析状态从一开始就在同一任务里。', evidence: '受控演示 · DOCX 真实解析成功',
    narration: '第一步是收件。以前要下载、改名、抄要求。现在输入示例 Word、说明和截止时间，输出带路径、解析状态和摘录的来源记录。' },
  { id: 'produce', number: '02', title: '生成：产出可编辑办公文档', start: 15.1, end: 33.2,
    manual: '把会议内容粘进 Word，手调格式，再逐条摘抄决策和待办。',
    input: '已解析材料、模板/配方、带时间与说话人的会议文本',
    result: '可编辑 DOCX、validate 成功、1 条决策与 1 条待办。',
    advantage: '内容生产、格式校验和行动项提取在一次流程中完成。', evidence: 'OfficeCLI 1.0.145 · ok / validate',
    narration: '生成以前要粘贴会议内容、调格式、摘待办。现在输入解析材料、模板和会议文本，输出可编辑文档、校验结果、决策和待办。' },
  { id: 'review', number: '03', title: '复核：结论回到来源证据', start: 33.2, end: 43.5,
    manual: '在多份文件里搜索关键词，把依据复制到聊天或表格中核对。',
    input: '草稿中的主张、原始来源与审阅规则',
    result: '带分数的检索结果、支持/冲突/缺口图、人工接受记录。',
    advantage: '审核者可直接定位依据和矛盾，不必从头翻找全部材料。', evidence: '受控演示 · 建议由人工接受',
    narration: '复核以前要跨文件搜索并复制依据。现在输入草稿主张、来源和规则，输出排序检索、支持冲突缺口图和人工接受记录。' },
  { id: 'approve', number: '04', title: '审批：发布前保留人工门禁', start: 43.5, end: 53.4,
    manual: '把文件发给多位负责人，再从聊天记录中追溯谁在何时同意。',
    input: '复核后的候选稿、审核人与批准人的决定',
    result: '触发、处理中、复核、批准、发布的本地审计事件。',
    advantage: '谁批准、何时发布连续可见，AI 不能自行越过门禁。', evidence: '项目内本地闭环 · 非外部审批系统',
    narration: '审批以前靠发文件、催确认、翻聊天追溯。现在输入候选稿和人工决定，输出复核、批准到发布的本地审计事件。' },
  { id: 'measure', number: '05', title: '度量：建立同口径试点记录', start: 53.4, end: 58.0,
    manual: '凭印象说“更快”，或事后补填一张与过程脱节的统计表。',
    input: '基线、AI、复核、重试、部署维护、样本数与岗位频次',
    result: '可复核的测量记录与 designed 状态，不直接当业务结论。',
    advantage: '把“感觉提效”改成后续真实试点可复现的对照口径。', evidence: '受控样例字段 · 不宣称固定提效比例',
    narration: '度量以前常靠印象。现在输入基线、AI、复核、重试和维护字段，输出可复核的测量记录；没有真实样本，不宣称固定提效比例。' },
  { id: 'deliver', number: '06', title: '交付：成果与证据一起带走', start: 61.5, end: 73.6,
    manual: '查找最新版本、拼装材料、人工检查缺件，再单独制作交付清单。',
    input: '六阶段状态、证据、风险与竞赛规则材料',
    result: 'M01 至 M06、评委材料、风险清单和 SHA-256 清单。',
    advantage: '减少漏件与错版风险，评审者可按清单复查每项成果。', evidence: '规则演示 94/100 · 非赛事官方成绩',
    narration: '交付以前要找最新版、拼材料、查漏项。现在输入状态、证据、风险和规则，输出 M01 至 M06、风险与哈希清单。' },
];

const slides = [
  { file: '01-title.png', kind: 'opening', eyebrow: '产品总览', title: 'OpenPrism Office', subtitle: '从一堆材料，到一套可交付、可复查的办公成果',
    statement: '它接受办公文件、会议文本和任务约束，输出可编辑文档、证据链、审批记录与交付包。',
    cards: [['不是聊天框', '面向材料生产全流程，而非只回答一次问题'], ['本片讲清四件事', '以前怎么做、输入什么、输出什么、优势从哪里来'], ['责任原则', 'AI 负责整理与提示，人负责判断、批准和对外责任']],
    narration: '这是 OpenPrism Office。它输入办公文件和任务要求，输出可编辑、可复核、可交付的完整成果。' },
  { file: '02-manual-before.png', kind: 'manual', eyebrow: '以前人工怎么做', title: '一份材料，要在多个工具之间来回搬运', subtitle: '典型人工流程的成本不只在“写”，还在收集、查找、协调和打包。',
    statement: '文件夹管原件，Word 管正文，聊天管审批，表格管统计，最后再人工拼装交付包。',
    cards: [['收集', '下载附件、改名、建目录、抄录截止时间'], ['生产', '复制粘贴、手调格式、逐条整理决策待办'], ['复核', '跨文件搜索，复制证据，人工标记冲突与缺口'], ['审批与交付', '聊天催确认，追溯版本，再查漏补缺打包']],
    narration: '以前人工先下载改名，再在 Word、聊天和表格间复制；复核要逐份搜索，最后找最新版、查漏打包。' },
  { file: '03-inputs.png', kind: 'inputs', eyebrow: '系统实际接受什么', title: '输入不是一句提示词，而是一组办公上下文', subtitle: '下面这些输入会共同决定生成内容、审核依据、责任人和交付边界。',
    statement: '本次实操的真实样例输入是 demo-architecture-review.docx，解析器为 native-ooxml。',
    cards: [['办公文件', 'DOCX、PPTX、XLSX 与文本可内置抽取'], ['任务约束', '补充说明、截止时间、模板、配方和审阅规则'], ['会议内容', '带时间戳与说话人的文本，可提取决策和待办'], ['可选材料', 'PDF/扫描件需配置适配器；未配置时明确 unavailable']],
    narration: '系统输入包括 Word、PPT、表格、文本、任务规则和会议逐字稿。PDF 或扫描件未配置适配器时明确不可用。' },
  { file: '04-audience.png', kind: 'audience', eyebrow: '谁真正需要它', title: '服务高频材料生产者与审核者', subtitle: '适合既要求速度，又必须保证准确、稳定和可追责的团队。',
    statement: '办公室和运营人员负责组织材料，审核与管理人员负责证据判断和最终批准。',
    cards: [['办公室与综合岗', '汇报、纪要、方案、通知与申报材料'], ['项目与运营团队', '多来源协作、版本推进、跨角色交付'], ['审核与管理人员', '关注依据、风险、责任、审批状态和效果口径']],
    narration: '产品面向办公室、运营和审核人员。生产者少做整理，审核者更快定位依据，但最终责任仍由人承担。' },
  { file: '05-workflow.png', kind: 'workflow', eyebrow: '马上进入实操', title: '同一组输入，经过六个连续步骤', subtitle: '收件、生成、复核、审批、度量、交付，每一步都留下可回看的状态与证据。',
    statement: '实操右侧将同步展示：典型人工做法、实际输入、实际输出和本步优势。',
    cards: [['01 收件', '原件 → 来源记录'], ['02 生成', '材料 → 可编辑文档'], ['03 复核', '主张 → 证据关系'], ['04 审批', '候选稿 → 审计事件'], ['05 度量', '过程字段 → 测量记录'], ['06 交付', '全流程 → 可校验材料包']],
    narration: '接下来进入六步实操。右侧会同步说明人工做法、实际输入、实际输出，以及优势为什么产生。' },
  { file: '06-before-after.png', kind: 'compare', eyebrow: '前后流程对照', title: '减少的不是责任，而是重复搬运和信息断点', subtitle: '人工仍然判断与批准；系统把分散动作组织成连续、可追踪的生产账本。',
    statement: '人工流程依赖个人记忆和跨工具拼接；使用工具后，输入、状态、证据与输出保持关联。',
    cards: [['以前：信息跟着人走', '反复下载、复制、搜索、催办、找版本、核清单'], ['现在：信息跟着任务走', '一次收件后，生成、复核、审批、度量和交付连续留痕']],
    narration: '以前信息跟着人走，靠记忆跨工具搬运；现在信息跟着任务走。人工判断保留，重复整理、追溯和打包被集中管理。' },
  { file: '07-results.png', kind: 'results', eyebrow: '系统实际输出', title: '最终得到五类可继续使用的成果', subtitle: '不是只有一份 AI 文本，而是正文、依据、责任、度量和交付材料同时存在。',
    statement: '核心输出可编辑、可复查、可校验，也能交给下一位协作者继续处理。',
    cards: [['内容产物', '可编辑 DOCX、结构化决策和待办'], ['质量证据', '检索分数、支持/冲突/缺口关系'], ['责任记录', '人工建议、复核、批准与本地发布事件'], ['管理与交付', '测量记录、M01 至 M06、风险和 SHA-256 清单']],
    narration: '系统输出包括可编辑文档、决策待办、证据关系、审批记录、测量台账，以及 M01 至 M06 和哈希清单。' },
  { file: '08-efficiency.png', kind: 'efficiency', eyebrow: '效率优势从哪里来', title: '优势来自流程合并，而不是一句“AI 更快”', subtitle: '可观察的改善有明确机制；固定节省多少时间，必须留给真实业务对照验证。',
    statement: '本作品不宣称固定提效比例，当前证明的是哪些人工动作被减少、哪些风险更容易发现。',
    cards: [['少搬一次', '材料导入后在同一任务内流转，减少重复复制整理'], ['少翻一遍', '证据与冲突可定位，降低跨文档从头搜索成本'], ['少漏一项', '交付清单和哈希自动核对，降低错版漏件风险'], ['更易复盘', '状态、人工决定和测量字段连续留存']],
    narration: '效率来自少搬材料、少翻文件、少漏交付项和更易复盘。当前证明流程变化，没有真实样本，因此不宣称固定提效比例。' },
  { file: '09-promotion.png', kind: 'promotion', eyebrow: '如何推广并量出真实价值', title: '先做小范围同口径试点，再连接组织系统', subtitle: '用相同任务比较人工基线与工具流程，同时记录质量、复核、重试和维护成本。',
    statement: '从纪要、方案和申报等高频材料起步，再接文档库、审批、消息和权限体系。',
    cards: [['任务设计', '同类材料、相近难度、明确责任人和验收口径'], ['完整计量', '基线、AI、复核、重试、部署维护和样本量'], ['质量对照', '盲评准确性、完整性、可读性与引用可靠性']],
    narration: '推广先做小范围同口径试点，记录人工基线、AI、复核、重试和维护成本，再用质量盲评得到可信结论。' },
  { file: '10-end.png', kind: 'ending', eyebrow: '结论与证据边界', title: '把材料生成，变成可核验的办公生产力', subtitle: '本次已证明技术闭环可运行；长期业务收益、外部系统接入与赛事得分仍需继续验证。',
    statement: 'OpenPrism Office 的意义：让“快”建立在内容可编辑、依据可查、责任明确和交付完整之上。',
    cards: [['已证明', '六步演示、DOCX 解析、OfficeCLI 校验、证据与交付包'], ['没有冒充', '真实长期收益、生产系统集成效果、赛事官方成绩'], ['下一步', '真实用户试点、盲评对照、连接器与权限治理']],
    narration: '作品已证明从输入到交付的六步闭环可运行。长期提效仍需真实试点，赛事成绩仍以官方评审为准。' },
];

const sequence = [...slides.slice(0, 5).map(slide => ({ type: 'slide', ...slide })), ...operations.map(operation => ({ type: 'operation', ...operation })), ...slides.slice(5).map(slide => ({ type: 'slide', ...slide }))];

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
  const cardColumns = slide.cards.length === 6 ? 3 : slide.cards.length === 4 || slide.kind === 'compare' ? 2 : 1;
  const cardMinimumHeight = slide.kind === 'compare' ? 220 : cardColumns > 1 ? 150 : 112;
  const cards = slide.cards.map(([title, copy], index) => `<article class="card"><div class="card-no">${String(index + 1).padStart(2, '0')}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></article>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles(fonts.regular, fonts.semibold)}main{position:absolute;left:84px;top:118px;right:72px;height:810px}.eyebrow{font-size:24px;color:#62d9c7;font-weight:600;letter-spacing:.06em}.title{max-width:1600px;margin:18px 0 0;font-size:${slide.kind === 'opening' ? 88 : 66}px;line-height:1.12;letter-spacing:-.035em}.subtitle{max-width:1600px;margin:22px 0 0;color:#b7c5dd;font-size:30px;line-height:1.42}.statement{position:absolute;left:0;top:338px;width:540px;border:1px solid #5f522c;border-top:4px solid #f3c969;background:#10191e;padding:18px 22px;color:#e9eef9;font-size:26px;line-height:1.5}.cards{position:absolute;left:610px;right:0;top:328px;display:grid;grid-template-columns:repeat(${cardColumns},1fr);gap:18px}.card{min-height:${cardMinimumHeight}px;border:1px solid #263a5d;background:#0b1729;padding:20px 24px;position:relative}.card-no{position:absolute;right:18px;top:16px;color:#4f6ef7;font-size:16px}.card h3{margin:0 50px 8px 0;color:#f3f7ff;font-size:${cardColumns > 1 ? 24 : 26}px}.card p{margin:0;color:#9eb0cc;font-size:${cardColumns > 1 ? 19 : 21}px;line-height:1.46}.footer{position:absolute;left:84px;bottom:138px;color:#6e809e;font-size:18px}.footer strong{color:#f3c969;font-weight:600}</style></head><body><div class="rail"></div><div class="topline"><span class="brand">OPENPRISM OFFICE</span><span>OFFICE TRACK · INPUT → EVIDENCE → OUTPUT</span></div><main><div class="eyebrow">${escapeHtml(slide.eyebrow)}</div><h1 class="title">${escapeHtml(slide.title)}</h1><div class="subtitle">${escapeHtml(slide.subtitle)}</div><div class="statement">${escapeHtml(slide.statement)}</div><section class="cards">${cards}</section></main><div class="footer"><strong>证据边界</strong>　演示状态与受控实验不等同于赛事官方评分或长期业务收益</div><div class="subtitle-zone"></div></body></html>`;
}
function operationHtml(operation, index, fonts) {
  const nodes = operations.map((item, nodeIndex) => `<div class="node ${nodeIndex === index ? 'active' : nodeIndex < index ? 'done' : ''}"><span>${item.number}</span></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles(fonts.regular, fonts.semibold)}.capture{position:absolute;left:32px;top:32px;width:1320px;height:880px;border:1px solid #314361;background:#0b1220}.side{position:absolute;left:1384px;top:42px;width:486px;height:870px}.chapter{color:#62d9c7;font-size:19px;font-weight:600;letter-spacing:.08em}.side h1{margin:10px 0 14px;font-size:34px;line-height:1.18;letter-spacing:-.025em}.label{margin-top:10px;color:#7689aa;font-size:14px;letter-spacing:.1em}.copy{margin-top:4px;color:#d8e1f0;font-size:17px;line-height:1.38}.manual{color:#b6c2d7}.result{border:1px solid #315c58;background:#0a1d25;padding:9px 11px;color:#e6fbf7}.advantage{color:#f0d98b}.evidence{margin-top:12px;padding:10px 13px;border:1px solid #7c6732;color:#f3c969;background:#17180f;font-size:16px;line-height:1.34}.progress{display:flex;gap:13px;margin-top:14px}.node{width:46px;height:29px;border-bottom:3px solid #263a5b;color:#61728f;text-align:center;font-size:14px}.node.done{border-color:#62d9c7;color:#62d9c7}.node.active{border-color:#4f6ef7;color:#fff}.corner{position:absolute;left:52px;top:52px;padding:7px 12px;background:#07111fe6;color:#9fb0cd;font-size:16px;z-index:3}.footer{position:absolute;left:32px;bottom:138px;color:#6e809e;font-size:18px}.footer strong{color:#f3c969}</style></head><body><div class="capture"></div><div class="corner">真实产品录屏 · 受控演示环境</div><aside class="side"><div class="chapter">实操 ${operation.number} / 06</div><h1>${escapeHtml(operation.title)}</h1><div class="label">典型人工做法</div><div class="copy manual">${escapeHtml(operation.manual)}</div><div class="label">实际输入</div><div class="copy">${escapeHtml(operation.input)}</div><div class="label">实际输出</div><div class="copy result">${escapeHtml(operation.result)}</div><div class="label">本步优势</div><div class="copy advantage">${escapeHtml(operation.advantage)}</div><div class="evidence">${escapeHtml(operation.evidence)}</div><div class="progress">${nodes}</div></aside><div class="footer"><strong>责任边界</strong>　AI 辅助生产与提示，人工完成复核、审批并承担最终责任</div><div class="subtitle-zone"></div></body></html>`;
}
async function renderFrame(page, html, output) {
  await page.setContent(html, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: output, type: 'png' });
  const info = await fs.stat(output); if (info.size < 40_000) throw new Error(`Rendered frame is unexpectedly small: ${output} (${info.size} bytes)`);
}
async function synthesizeNarration(item, index, tempRoot) {
  const prefix = `${String(index + 1).padStart(2, '0')}-${item.type}-${item.id || item.kind}`; const audio = join(tempRoot, `${prefix}.mp3`); const subtitles = join(tempRoot, `${prefix}.srt`);
  await run(edgeTtsExecutable, ['--voice', narrationVoice, `--rate=${narrationRate}`, '--pitch=+0Hz', '--text', item.narration, '--write-media', audio, '--write-subtitles', subtitles]);
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

await Promise.all([fs.access(sourceVideo), fs.mkdir(slideRoot, { recursive: true })]);
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
  const expectedSlideFiles = new Set(slides.map(slide => slide.file));
  for (const existingFile of await fs.readdir(slideRoot)) {
    if (existingFile.endsWith('.png') && !expectedSlideFiles.has(existingFile)) await fs.unlink(join(slideRoot, existingFile));
  }
  for (const slide of slides) await renderFrame(page, slideHtml(slide, fonts), join(slideRoot, slide.file));
  const operationFrames = new Map();
  for (const [index, operation] of operations.entries()) { const frame = join(tempRoot, `operation-${operation.number}.png`); await renderFrame(page, operationHtml(operation, index, fonts), frame); operationFrames.set(operation.id, frame); }
  await browser.close(); browser = null;
  await fs.writeFile(outputSlideManifest, `${JSON.stringify({ generatedAt: new Date().toISOString(), format: { width: 1920, height: 1080, style: 'evidence-corridor' }, disclaimer: '讲解页中的演示结果与受控实验不等同于赛事官方评分或长期业务收益。', slides: slides.map(({ file, kind, eyebrow, title, subtitle, statement, cards, narration }) => ({ file, kind, eyebrow, title, subtitle, statement, cards, narration })) }, null, 2)}\n`, 'utf8');

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
  await fs.writeFile(outputTranscript, `# OpenPrism Office 讲解视频逐字稿\n\n- 产品意义：把生成能力放进可管理、可核验的办公流程。\n- 目标用户：办公室/综合岗、项目与运营团队、审核与管理人员。\n- 以前人工怎么做：跨文件夹、Word、聊天和表格重复收集、查找、确认与打包。\n- 系统实际输入：办公文件、会议文本、任务约束、模板/配方与审阅规则。\n- 系统实际输出：可编辑文档、证据关系、人工审批记录、测量台账与可校验交付包。\n- 效率优势：减少重复搬运、跨文档翻找、错版漏件与事后追溯成本；没有真实试点前不宣称固定提效比例。\n- 字幕形式：逐句字幕随中文语音定时出现，并另行提供可编辑 SRT；画面标签不充当字幕。\n- 证据边界：演示状态、受控实验与建议评分不等同于赛事官方成绩或长期业务收益。\n\n| 序号 | 形式 | 时间 | 章节 | 逐句字幕/旁白 |\n|---:|---|---|---|---|\n${transcriptRows}\n`, 'utf8');
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
