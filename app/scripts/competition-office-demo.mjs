import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import net from 'node:net';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..');
const backendEntry = join(appRoot, 'apps/backend/src/index.js');
const frontendDist = join(appRoot, 'apps/frontend/dist');
const sampleDocx = join(appRoot, 'apps/backend/skill-resources/popular-patent-disclosure/examples/example_batch_job_scheduler/knowledge/docs/sample_architecture_review.docx');
const staticSubmissionDir = join(repoRoot, 'docs/competition/submission_90plus');
const outputDir = join(repoRoot, 'docs/competition/submission_90plus/evidence/demo');
const evidenceDir = join(repoRoot, 'docs/competition/submission_90plus/evidence');
const workflowSamplesDir = join(evidenceDir, 'workflow-state-samples');
const browserLibraries = resolve(repoRoot, '.playwright-deps/usr/lib/x86_64-linux-gnu');

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  if (!port) throw new Error('Unable to reserve a demo server port.');
  return port;
}

async function waitForReady(baseURL, backend, getLogs) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (backend.exitCode !== null) throw new Error(`Demo backend exited early.\n${getLogs()}`);
    try {
      const [health, ready] = await Promise.all([
        fetch(`${baseURL}/api/health`),
        fetch(`${baseURL}/api/ready`),
      ]);
      if (health.ok && ready.ok) {
        const healthBody = await health.json();
        const readyBody = await ready.json();
        if (healthBody.ok && readyBody.ready) return;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for demo backend at ${baseURL}.\n${getLogs()}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolveExit => child.once('exit', resolveExit)),
    new Promise(resolveWait => setTimeout(resolveWait, 5_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function transcodeMp4(sourcePath, targetPath) {
  const executable = process.env.FFMPEG_PATH || 'ffmpeg';
  const args = [
    '-y', '-loglevel', 'error', '-i', sourcePath,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', targetPath,
  ];
  const child = spawn(executable, args, { shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => {
    stderr = `${stderr}${chunk}`.slice(-20_000);
  });
  await new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', code => code === 0
      ? resolveExit()
      : rejectExit(new Error(`ffmpeg exited with ${code}: ${stderr}`)));
  });
}

async function api(baseURL, token, path, options = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function sanitizeEvidence(value, replacements) {
  if (Array.isArray(value)) return value.map(item => sanitizeEvidence(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeEvidence(item, replacements)]));
  }
  if (typeof value !== 'string') return value;
  return replacements.reduce((text, [needle, replacement]) => needle ? text.split(needle).join(replacement) : text, value);
}

async function copySanitizedJson(source, target, replacements) {
  const raw = JSON.parse(await fs.readFile(source, 'utf8'));
  const sanitized = sanitizeEvidence(raw, replacements);
  await fs.writeFile(target, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
}

async function copyCompetitionMaterial(projectRoot, sourceName, targetName = sourceName) {
  const source = join(staticSubmissionDir, sourceName);
  const target = join(projectRoot, 'sources/competition', targetName);
  await fs.mkdir(dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function enrichCompetitionState(baseURL, token, projectId) {
  const { state } = await api(baseURL, token, `/api/projects/${encodeURIComponent(projectId)}/office-track`);
  const nextState = {
    brief: {
      ...state.brief,
      title: 'OpenPrism Office 办公赛道演示',
      team: '受控演示团队',
      scenario: '用脱敏 Office 材料生成可审查的办公参赛材料',
      users: '项目申报负责人、材料审核人、PMO',
      writingTasks: ['作品方案', '三分钟演示讲稿', '效果证明', '复用说明'],
      valueProposition: 'AI 辅助整理和起草，证据定位与人工审批决定最终采纳。',
      humanApprovalRequired: true,
      reuseStatement: '通过模板、SOP、Skill、证据表和导出清单复用到相近办公材料场景。',
      significance: '把办公文案生产转为可追溯、可复算、可审批的流程。',
      frequency: '受控演示：面向每月多次的办公材料流程',
      originalProcess: '人工逐份阅读 Office 材料，复制事实，整理成提交文档。',
      painPoints: ['来源分散', '事实核验耗时', '返工意见不沉淀'],
      deliveryStandard: '所有对外主张必须可定位到证据并经人工审批。',
      dependencies: ['本地脱敏 Office 材料', '项目模板内 SOP/Skill/指标表'],
      constraints: ['不得虚构提效数据', '演示数据不作为真实业务成效'],
    },
    materials: [
      { id: 'm01-proposal', name: 'M01 作品方案', type: 'proposal', path: 'sources/competition/M01-proposal.md', status: 'ready', notes: '静态提交包材料，可读 ready。' },
      { id: 'm02-demo', name: 'M02 三分钟演示脚本', type: 'demo-video-script', path: 'sources/competition/M02-demo-script.md', status: 'ready', notes: '本次录屏脚本和取证计划。' },
      { id: 'm03-reuse', name: 'M03 复用价值说明', type: 'reuse-statement', path: 'sources/competition/M03-reuse-statement.md', status: 'ready', notes: '静态提交包材料，可读 ready。' },
      { id: 'm04-significance', name: 'M04 作品意义', type: 'significance', path: 'sources/competition/M04-significance.md', status: 'ready', notes: '静态提交包材料，可读 ready。' },
      { id: 'm-docx-demo', name: '受控 DOCX 示例', type: 'other', path: 'sources/demo-architecture-review.docx', status: 'ready', notes: 'native-ooxml · controlled demo input' },
    ],
    evidence: [
      { id: 'e-docx-controlled-demo', claim: '受控 DOCX 已成功解析，演示链路已运行。', sourcePath: 'sources/demo-architecture-review.docx', location: 'native-ooxml import record', level: 'E2', status: 'verified', notes: '仅证明受控 DOCX 解析和演示链路跑通，不证明真实业务提效。' },
    ],
    effect: {
      ...state.effect,
      baselineMinutes: 120,
      aiMinutes: 45,
      reviewMinutes: 20,
      retryMinutes: 5,
      setupMinutes: 10,
      maintenanceMinutes: 2,
      qualityNotes: '受控演示数据；未完成真实业务试点，不形成真实提效结论。',
      sampleSize: 1,
      measurementStatus: 'designed',
      unit: '受控演示样本',
      period: '2026-08-27 录屏演示',
      taskFrequency: '真实频率待试点补充',
      coveragePeople: 1,
      calculationNotes: '演示中保留全成本字段，但 measurementStatus=designed；真实提效需另行用业务样本复算。',
    },
    reusableAssets: [
      { id: 'asset-main-template', name: '办公赛道主文档模板', type: 'template', path: 'main.md', status: 'ready', notes: '项目模板内实际存在。', targetRoles: ['项目申报负责人', 'PMO'], learningMinutes: 20, deploymentNotes: '从 office-track-writing 模板创建项目后替换 Brief、证据和指标。', permissionNotes: '仅处理项目授权资料。', maintenanceOwner: '材料负责人' },
      { id: 'asset-sop', name: '复用 SOP', type: 'sop', path: 'reuse/SOP.md', status: 'ready', notes: '项目模板内实际存在。', targetRoles: ['材料审核人', 'PMO'], learningMinutes: 15, deploymentNotes: '按 SOP 完成收件、证据、审批和导出。', permissionNotes: '提交前人工脱敏。', maintenanceOwner: 'PMO' },
      { id: 'asset-skill', name: '复用 Skill', type: 'prompt', path: 'reuse/Skill.md', status: 'ready', notes: '项目模板内实际存在。', targetRoles: ['写作人', '审核人'], learningMinutes: 15, deploymentNotes: '按 Skill 提示词组织写作与审阅。', permissionNotes: '不得写入未核验数据。', maintenanceOwner: '材料负责人' },
      { id: 'asset-effect-metrics', name: '效果测量表', type: 'dataset', path: 'metrics/effect.csv', status: 'ready', notes: '项目模板内实际存在；演示中不预填真实提效。', targetRoles: ['PMO', '流程负责人'], learningMinutes: 10, deploymentNotes: '用真实业务样本填充。', permissionNotes: '不得把受控演示数据当成业务成效。', maintenanceOwner: 'PMO' },
    ],
    finals: {
      ...state.finals,
      demoScript: '收件导入 DOCX；处理失败态；审阅证据；人工审批；记录 designed 成效字段；审核导出并展示准备建议分和风险。',
      questions: ['如何避免无依据数字？', '如何复算提效？', '为什么受控演示不等同真实业务成效？'],
      operatorChecklist: ['确认四项必交材料 ready', '确认 SOP/Skill/指标表 ready', '确认 E2 证据只证明演示链路', '确认 measurementStatus=designed'],
      landingEvidence: { usagePeriod: '待真实试点补充', users: ['受控演示操作者'], useCount: 1, outputs: ['受控演示提交包'], feedback: ['演示链路跑通；真实业务提效待试点'] },
      rolloutPlan: { targetRoles: ['项目申报负责人', '材料审核人', 'PMO'], milestones: ['受控演示', '小样本试点', '部门复用'], owner: 'PMO', resources: ['模板', 'SOP', 'Skill', '指标表'], costs: '单人培训 15-30 分钟，真实试点需另计复核成本。', risks: ['真实样本不足', '敏感信息未脱敏', '误把演示数据当成业务成效'], metrics: ['全成本净节省分钟', '返工次数', '证据缺口数'] },
      aiOptimization: { versions: ['office-demo-v1'], evaluation: '检查 DOCX 解析、证据登记、材料完整性、审核导出和风险提示。', iterations: ['补齐四项 ready 材料登记', '补齐 ready 复用资产', '保留 designed 成效风险'] },
    },
  };
  return api(baseURL, token, `/api/projects/${encodeURIComponent(projectId)}/office-track`, {
    method: 'PUT',
    body: JSON.stringify(nextState),
  });
}

function stamp(startedAt) {
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

await fs.access(frontendDist).catch(() => {
  throw new Error('Frontend dist is missing. Run `npm run build` in app/ before recording the competition demo.');
});
await fs.access(sampleDocx);
await fs.access(join(staticSubmissionDir, 'M01-proposal.md'));
await fs.access(join(staticSubmissionDir, 'M02-demo-script.md'));
await fs.access(join(staticSubmissionDir, 'M03-reuse-statement.md'));
await fs.access(join(staticSubmissionDir, 'M04-significance.md'));
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(workflowSamplesDir, { recursive: true });

for (const file of ['office-demo.webm', 'office-demo.mp4', '01-inbox.png', '02-produce.png', '03-review.png', '04-approve.png', '05-measure.png', '06-deliver.png']) {
  await fs.rm(join(outputDir, file), { force: true });
}
for (const file of ['office-track.json', 'office-workspace.json', 'office-workflow.json']) {
  await fs.rm(join(workflowSamplesDir, file), { force: true });
}
await fs.rm(join(evidenceDir, 'submission-manifest.json'), { force: true });

const tempRoot = await fs.mkdtemp(join(os.tmpdir(), 'openprism-office-demo-'));
const dataDir = join(tempRoot, 'projects');
const port = await reservePort();
const baseURL = `http://127.0.0.1:${port}`;
const token = `demo-${randomBytes(24).toString('hex')}`;
const libraryPath = [browserLibraries, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':');
process.env.LD_LIBRARY_PATH = libraryPath;
const env = {
  ...process.env,
  NODE_ENV: 'test',
  OPENPRISM_DATA_DIR: dataDir,
  OPENPRISM_PROJECTS_DIR: dataDir,
  OPENPRISM_PORT: String(port),
  OPENPRISM_PUBLIC_HOST: '127.0.0.1',
  OPENPRISM_API_TOKEN: token,
  OPENPRISM_E2E_API_TOKEN: token,
  LD_LIBRARY_PATH: libraryPath,
};

let backend;
let browser;
let backendLogs = '';

try {
  backend = spawn(process.execPath, [backendEntry], {
    cwd: tempRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const appendLog = chunk => {
    backendLogs = `${backendLogs}${chunk}`.slice(-20_000);
  };
  backend.stdout.on('data', appendLog);
  backend.stderr.on('data', appendLog);
  await waitForReady(baseURL, backend, () => backendLogs);

  const project = await api(baseURL, token, '/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: `OpenPrism Office demo ${Date.now()}`, template: 'office-track-writing' }),
  });
  const projectRoot = join(dataDir, project.directoryName || project.id);
  await fs.mkdir(join(projectRoot, 'sources'), { recursive: true });
  await fs.copyFile(sampleDocx, join(projectRoot, 'sources/demo-architecture-review.docx'));
  await fs.writeFile(join(projectRoot, 'sources/demo-note.txt'), '受控演示数据：缺少真实试点样本时，不得宣称稳定提效。\n', 'utf8');
  await copyCompetitionMaterial(projectRoot, 'M01-proposal.md');
  await copyCompetitionMaterial(projectRoot, 'M02-demo-script.md');
  await copyCompetitionMaterial(projectRoot, 'M03-reuse-statement.md');
  await copyCompetitionMaterial(projectRoot, 'M04-significance.md');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    recordVideo: { dir: outputDir, size: { width: 1440, height: 960 } },
  });
  await context.addInitScript(value => {
    window.sessionStorage.setItem('paper-agent-server-access-token', value);
  }, token);
  const page = await context.newPage();
  const startedAt = Date.now();
  const timestamps = [
    '# 演示时间戳清单',
    '',
    '推荐上传：`office-demo.mp4`；原始录屏：`office-demo.webm`',
    '',
    '| 时间 | 画面 | 证据说明 | 截图 |',
    '| --- | --- | --- | --- |',
  ];
  const showStage = async (title, note) => {
    await page.evaluate(({ title, note }) => {
      let overlay = document.getElementById('competition-demo-stage-title');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'competition-demo-stage-title';
        overlay.style.position = 'fixed';
        overlay.style.left = '24px';
        overlay.style.top = '20px';
        overlay.style.zIndex = '2147483647';
        overlay.style.maxWidth = '760px';
        overlay.style.padding = '14px 18px';
        overlay.style.border = '2px solid #2563eb';
        overlay.style.borderRadius = '8px';
        overlay.style.background = 'rgba(255,255,255,0.96)';
        overlay.style.boxShadow = '0 10px 28px rgba(15,23,42,0.18)';
        overlay.style.color = '#0f172a';
        overlay.style.font = '600 20px/1.4 "Noto Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
        document.body.appendChild(overlay);
      }
      overlay.innerHTML = `<div>${title}</div><div style="font-size:14px;font-weight:500;margin-top:4px;color:#475569">${note}</div>`;
    }, { title, note });
  };
  const capture = async (name, title, note) => {
    await showStage(title, note);
    await page.waitForTimeout(23_000);
    await page.screenshot({ path: join(outputDir, `${name}.png`), fullPage: false });
    timestamps.push(`| ${stamp(startedAt)} | ${title} | ${note} | ${name}.png |`);
  };

  await page.goto(`${baseURL}/editor/${project.id}`);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.getByTestId('right-panel-delivery-tab').click();
  const panel = page.getByTestId('office-delivery-panel');
  await panel.locator('#office-title').fill('OpenPrism Office 办公赛道演示');
  await panel.locator('#office-team').fill('受控演示团队');
  await panel.locator('#office-scenario').fill('用脱敏 Office 材料生成可审查的办公参赛材料');
  await panel.locator('#office-users').fill('项目申报负责人、材料审核人、PMO');
  await panel.locator('#office-tasks').fill('作品方案\n三分钟演示讲稿\n效果证明\n复用说明');
  await panel.locator('#office-value').fill('AI 辅助整理和起草，证据定位与人工审批决定最终采纳。');
  await panel.locator('#office-frequency').fill('受控演示：每月多次的办公材料流程');
  await panel.locator('#office-original-process').fill('人工逐份阅读 Office 材料，复制事实，整理成提交文档。');
  await panel.locator('#office-pain-points').fill('来源分散\n事实核验耗时\n返工意见不沉淀');
  await panel.locator('#office-reuse').fill('通过模板、SOP、Skill、证据表和导出清单复用。');
  await panel.locator('#office-significance').fill('把办公文案生产转为可追溯、可复算、可审批的流程。');
  await panel.locator('#office-delivery-standard').fill('所有对外主张必须可定位到证据并经人工审批。');
  await panel.locator('#office-dependencies').fill('本地脱敏 Office 材料');
  await panel.locator('#office-constraints').fill('不得虚构提效数据\n演示数据不作为真实业务成效');
  await panel.locator('#office-import-path').fill('sources/demo-architecture-review.docx');
  await panel.getByTestId('office-import-material').click();
  await panel.getByTestId('office-inbox-item').waitFor();
  await capture('01-inbox', '收件导入 DOCX', '界面显示 built-in OOXML/native-ooxml 解析和 ready 状态。');

  await panel.getByTestId('office-stage-produce').click();
  await panel.locator('#office-artifact-input').fill('sources/demo-architecture-review.docx');
  await panel.getByTestId('office-artifact-plan').click();
  await panel.getByTestId('office-artifact-run').click();
  await panel.getByTestId('office-create-run').click();
  await panel.getByRole('button', { name: '进入处理' }).click();
  await panel.getByRole('button', { name: '提交审阅' }).click();
  await capture('02-produce', '处理与失败态', '外部 OfficeCLI 未配置时显示 unavailable，仍保留真实状态。');

  await panel.getByTestId('office-stage-review').click();
  await panel.locator('#office-search-query').fill('architecture review scheduler');
  await panel.getByTestId('office-search').click();
  await panel.locator('#office-claims').fill('系统包含架构评审材料。\n演示数据已经证明长期稳定提效。');
  await panel.getByTestId('office-build-graph').click();
  await panel.getByTestId('office-add-evidence').click();
  const evidence = panel.getByTestId('office-evidence-0');
  await evidence.getByLabel('需证明的结论').fill('导入了脱敏 DOCX 办公材料');
  await evidence.getByLabel('来源路径').fill('sources/demo-architecture-review.docx');
  await evidence.getByLabel('精确位置').fill('document.xml');
  await evidence.getByLabel('证据等级').selectOption('E2');
  await panel.locator('#office-comment-body').fill('请删除“长期稳定提效”这类未由真实样本证明的结论。');
  await panel.locator('#office-suggested-text').fill('受控演示仅证明流程跑通，真实提效以试点表为准。');
  await panel.getByTestId('office-add-comment').click();
  await panel.getByRole('button', { name: '接受建议' }).click();
  await capture('03-review', '审阅证据和建议', '展示检索、证据图、评论建议和诚实降级。');

  await panel.getByTestId('office-stage-approve').click();
  await panel.getByTestId('office-approve-run').click();
  await panel.getByTestId('office-publish-run').click();
  await capture('04-approve', '人工审批', 'approved/published 只表示本地人工批准链路。');

  await panel.getByTestId('office-stage-measure').click();
  await panel.locator('#office-baselineMinutes').fill('120');
  await panel.locator('#office-aiMinutes').fill('45');
  await panel.locator('#office-reviewMinutes').fill('20');
  await panel.locator('#office-retryMinutes').fill('5');
  await panel.locator('#office-setupMinutes').fill('10');
  await panel.locator('#office-maintenanceMinutes').fill('2');
  await panel.locator('#office-sample').fill('1');
  await panel.locator('#office-measure-status').selectOption('designed');
  await panel.getByLabel('采纳次数').fill('1');
  await panel.getByLabel('拒绝次数').fill('1');
  await panel.getByTestId('office-record-metric').click();
  await capture('05-measure', '全成本度量', '样本标为 designed/受控演示，不作为真实业务成效。');

  await panel.getByTestId('office-save').click();
  await page.waitForTimeout(1_000);
  await enrichCompetitionState(baseURL, token, project.id);
  await page.goto(`${baseURL}/editor/${project.id}`);
  await page.getByTestId('right-panel-delivery-tab').click();

  await panel.getByTestId('office-stage-deliver').click();
  await panel.getByTestId('office-run-audit').click();
  await panel.getByTestId('office-export-confirm').check();
  await panel.getByTestId('office-export').click();
  await capture('06-deliver', '审核导出', '展示准备建议分、effect designed 风险、非官方提示，并导出 manifest。');

  const replacements = [
    [tempRoot, '<demo-temp-root>'],
    [dataDir, '<demo-data-dir>'],
    [projectRoot, '<demo-project-root>'],
    [baseURL, '<demo-local-url>'],
    [token, '<redacted-token>'],
  ];
  await copySanitizedJson(join(projectRoot, '.openprism/office-track.json'), join(workflowSamplesDir, 'office-track.json'), replacements);
  await copySanitizedJson(join(projectRoot, '.openprism/office-workspace.json'), join(workflowSamplesDir, 'office-workspace.json'), replacements);
  await copySanitizedJson(join(projectRoot, '.openprism/office-workflow.json'), join(workflowSamplesDir, 'office-workflow.json'), replacements);
  await copySanitizedJson(join(projectRoot, 'submission/submission-manifest.json'), join(evidenceDir, 'submission-manifest.json'), replacements);

  const video = page.video();
  await page.close();
  await context.close();
  const videoPath = await video.path();
  const targetVideo = join(outputDir, 'office-demo.webm');
  await fs.rename(videoPath, targetVideo);
  const targetMp4 = join(outputDir, 'office-demo.mp4');
  await transcodeMp4(targetVideo, targetMp4);
  const stat = await fs.stat(targetVideo);
  const mp4Stat = await fs.stat(targetMp4);
  timestamps.push('');
  timestamps.push(`生成时间：${new Date().toISOString()}`);
  timestamps.push(`视频大小：${stat.size} bytes`);
  timestamps.push(`MP4 兼容版大小：${mp4Stat.size} bytes`);
  timestamps.push('说明：本录屏使用受控演示项目和仓库内 DOCX 示例，不作为真实业务提效证明。');
  await fs.writeFile(join(outputDir, 'timestamps.md'), `${timestamps.join('\n')}\n`, 'utf8');

  process.stdout.write(`Demo server: ${baseURL}\n`);
  process.stdout.write(`Project: ${project.id}\n`);
  process.stdout.write(`Video: ${targetVideo}\n`);
  process.stdout.write(`Compatible video: ${targetMp4}\n`);
  process.stdout.write(`Timestamps: ${join(outputDir, 'timestamps.md')}\n`);
} finally {
  if (browser) await browser.close().catch(() => {});
  await stopProcess(backend);
  await fs.rm(tempRoot, { recursive: true, force: true });
}
