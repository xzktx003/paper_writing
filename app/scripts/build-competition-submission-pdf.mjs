import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chromium } from 'playwright';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..');
const submissionRoot = join(repoRoot, 'docs/competition/submission_90plus');
const outputPath = join(submissionRoot, 'OpenPrism-Office-competition-submission.pdf');
const browserLibraries = join(repoRoot, '.playwright-deps/usr/lib/x86_64-linux-gnu');

const sections = [
  ['M01 作品方案', 'M01-proposal.md'],
  ['M02 三分钟演示', 'M02-demo-script.md'],
  ['M03 复用价值', 'M03-reuse-statement.md'],
  ['M04 作品意义', 'M04-significance.md'],
  ['M05 效果证明', 'M05-effect-evidence.md'],
  ['M06 标准化资产', 'M06-reuse-assets.md'],
  ['评委评审说明', 'reviewer-guide.md'],
  ['初赛准备度说明', 'initial-score-guide.md'],
  ['决赛准备包', 'finals-pack.md'],
  ['决赛附加分准备', 'finals-score-guide.md'],
];

const renderedSections = [];
for (const [title, filename] of sections) {
  const markdown = await fs.readFile(join(submissionRoot, filename), 'utf8');
  const markup = renderToStaticMarkup(
    React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown),
  );
  renderedSections.push(`<section class="document-section" data-source="${filename}"><div class="source-label">${title} · ${filename}</div>${markup}</section>`);
}

const tableOfContents = sections
  .map(([title, filename], index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><strong>${title}</strong><code>${filename}</code></li>`)
  .join('');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>OpenPrism Office 办公赛道提交材料</title>
  <style>
    @page { size: A4; margin: 16mm 14mm 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; font: 10.5pt/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; }
    .cover { min-height: 255mm; padding: 26mm 12mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; background: linear-gradient(150deg, #f5f7ff, #fff 58%); }
    .eyebrow { color: #5268d9; font-size: 11pt; letter-spacing: .18em; text-transform: uppercase; }
    .cover h1 { margin: 14mm 0 4mm; color: #101a3a; font-size: 31pt; line-height: 1.18; }
    .cover h2 { margin: 0; color: #556078; font-size: 16pt; font-weight: 500; }
    .cover-note { max-width: 145mm; padding: 5mm; border-left: 3px solid #5268d9; background: rgba(255,255,255,.8); }
    .meta { display: grid; grid-template-columns: 32mm 1fr; gap: 2mm 5mm; color: #525d73; }
    .toc { page-break-after: always; }
    .toc h1 { border: 0; }
    .toc ol { padding: 0; list-style: none; }
    .toc li { display: grid; grid-template-columns: 10mm 1fr 62mm; gap: 3mm; align-items: baseline; padding: 3mm 0; border-bottom: 1px solid #e3e7f1; }
    .toc li span { color: #5268d9; }
    .toc code { text-align: right; color: #758096; background: transparent; }
    .document-section { page-break-before: always; }
    .source-label { margin-bottom: 6mm; padding: 2.5mm 4mm; color: #5268d9; background: #f3f5ff; border-radius: 4px; font-size: 9pt; }
    h1, h2, h3, h4 { color: #162349; line-height: 1.3; break-after: avoid; }
    h1 { margin: 0 0 8mm; padding-bottom: 4mm; border-bottom: 2px solid #5268d9; font-size: 23pt; }
    h2 { margin: 8mm 0 3mm; font-size: 16pt; }
    h3 { margin: 6mm 0 2mm; font-size: 12.5pt; }
    p { margin: 2.2mm 0; }
    ul, ol { padding-left: 6mm; }
    li { margin: 1mm 0; }
    table { width: 100%; margin: 4mm 0 6mm; border-collapse: collapse; font-size: 8.4pt; break-inside: auto; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    th, td { padding: 2mm 2.2mm; border: 1px solid #d9deea; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { color: #293762; background: #eef1fa; }
    blockquote { margin: 4mm 0; padding: 2mm 4mm; color: #4e5b75; border-left: 3px solid #7a8be8; background: #f7f8fd; }
    code { padding: .2mm 1mm; border-radius: 3px; background: #f1f3f8; font-family: "SFMono-Regular", Consolas, monospace; font-size: .9em; overflow-wrap: anywhere; }
    pre { padding: 4mm; white-space: pre-wrap; background: #172033; color: #f5f7ff; border-radius: 5px; }
    pre code { padding: 0; color: inherit; background: transparent; }
    a { color: #425bd4; text-decoration: none; }
  </style>
</head>
<body>
  <section class="cover">
    <div>
      <div class="eyebrow">AI Productivity · Office Track</div>
      <h1>OpenPrism Office</h1>
      <h2>可核验的 AI 办公材料工作台</h2>
    </div>
    <div class="cover-note">本合订本汇总 M01-M06、评委导航及初决赛准备材料。技术演示、受控实验和真实业务证据严格分层；准备度建议不代表官方评分或获奖承诺。</div>
    <div class="meta"><span>申报赛道</span><strong>办公场景</strong><span>材料版本</span><strong>2026-08-28 replacement-v2</strong><span>视频证据</span><strong>evidence/demo/office-demo-submission.mp4</strong><span>完整性校验</span><strong>submission-manifest.json</strong></div>
  </section>
  <section class="toc"><h1>材料目录</h1><ol>${tableOfContents}</ol></section>
  ${renderedSections.join('\n')}
</body>
</html>`;

process.env.LD_LIBRARY_PATH = [browserLibraries, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#778096;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: '16mm', right: '14mm', bottom: '18mm', left: '14mm' },
  });
} finally {
  await browser.close();
}

const stat = await fs.stat(outputPath);
if (stat.size < 10_000) throw new Error(`Generated PDF is unexpectedly small: ${stat.size} bytes`);
process.stdout.write(`${outputPath}\n${stat.size} bytes\n`);
