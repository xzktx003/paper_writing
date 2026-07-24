import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildOcrCapability } from './paperRagService.js';

export function buildRuntimeEnvironmentGuide({ documents = [], ragSummary = {} } = {}) {
  const ocrCapability = buildOcrCapability();
  const browserE2eCapability = buildBrowserE2eCapability();
  const documentsNeedingOcr = documents.filter(document =>
    document.parseStatus === 'failed' &&
    ['needs-ocr', 'pdf-not-extracted'].includes(document.recovery?.code)
  );
  const blocksProduction = documentsNeedingOcr.length > 0 && !ocrCapability.serverCanRunOcr;
  const productionGates = buildRuntimeProductionGates({ ocrCapability, browserE2eCapability });
  const hasProductionGateGaps = productionGates.some(gate => gate.requiredForProduction && gate.status !== 'ready');
  const status = blocksProduction
    ? 'blocked'
    : hasProductionGateGaps
      ? 'needs-production-validation'
      : 'ready';
  const guide = {
    status,
    label_zh: status === 'ready'
      ? '运行环境生产 Gate 已通过'
      : status === 'blocked'
        ? '运行环境缺少 OCR 工具'
        : '运行环境生产 Gate 未完成',
    summary_zh: status === 'ready'
      ? '服务器 OCR、PDF 文本抽取和真实浏览器 E2E 均已通过生产验收；请保留复验证据。'
      : status === 'blocked'
        ? `有 ${documentsNeedingOcr.length} 个 PDF 需要 OCR，但服务器没有可运行的 OCRmyPDF；请上传 OCR 后 PDF 或人工摘录。`
        : '至少一个生产 Gate 未通过；可以继续生成可审查草稿，但不能宣称生产发布级已就绪。',
    ocrCapability,
    browserE2eCapability,
    documentsNeedingOcr: documentsNeedingOcr.map(document => ({
      path: document.path,
      title: document.title,
      recoveryCode: document.recovery?.code || '',
      label_zh: document.recovery?.label_zh || document.label_zh || '',
    })),
    checks: [
      {
        id: 'ocr-tooling',
        label_zh: '服务器 OCR 工具',
        status: ocrCapability.status,
        blocking: blocksProduction,
        detail_zh: ocrCapability.recoveryInstruction_zh,
      },
      {
        id: 'scanned-pdf-recovery',
        label_zh: '扫描版 PDF 恢复',
        status: documentsNeedingOcr.length ? 'needs-recovery' : 'clear',
        blocking: blocksProduction,
        detail_zh: documentsNeedingOcr.length
          ? `当前有 ${documentsNeedingOcr.length} 个文档需要 OCR 或人工摘录。`
          : '当前最近证据文档中没有检测到必须 OCR 的阻塞 PDF。',
      },
      {
        id: 'browser-e2e-preflight',
        label_zh: '真实浏览器 E2E 预检',
        status: browserE2eCapability.status,
        blocking: false,
        detail_zh: browserE2eCapability.detail_zh,
      },
    ],
    productionGates,
    nextActions: blocksProduction
      ? [
          { type: 'copy-ocr-recovery-command-pack', label_zh: '复制 OCR 工具安装/验收命令', commandPack: ocrCapability.commandPack },
          { type: 'upload-ocr-pdf', label_zh: '上传 OCR 后 PDF' },
          { type: 'import-manual-evidence', label_zh: '导入已核对 OCR/人工摘录' },
        ]
      : ocrCapability.serverCanRunOcr
        ? [{ type: 'run-ocr-queue-if-needed', label_zh: '需要时运行受控 OCR 队列' }]
        : [{ type: 'prepare-manual-ocr-fallback', label_zh: '准备 OCR 后 PDF 或人工摘录兜底', commandPack: ocrCapability.commandPack }],
    recheckPlan: null,
    copyText: '',
  };
  guide.recheckPlan = buildRuntimeRecheckPlan(guide, ragSummary);
  guide.copyText = formatRuntimeEnvironmentCopyText(guide, ragSummary);
  return guide;
}

function buildRuntimeProductionGates({ ocrCapability = {}, browserE2eCapability = {} } = {}) {
  return [
    {
      id: 'server-ocr',
      label_zh: '服务器 OCR 自动恢复',
      status: ocrCapability.serverCanRunOcr ? 'ready' : 'blocked',
      requiredForProduction: true,
      detail_zh: ocrCapability.serverCanRunOcr
        ? 'OCRmyPDF 可用，扫描版 PDF 可进入受控 OCR 队列。'
        : '未检测到 OCRmyPDF；扫描版 PDF 只能依赖外部 OCR 后 PDF 或人工摘录。',
      action: ocrCapability.serverCanRunOcr
        ? { type: 'run-ocr-queue-if-needed', label_zh: '需要时运行受控 OCR 队列' }
        : { type: 'copy-ocr-recovery-command-pack', label_zh: '复制 OCR 安装/验收命令', commandPack: ocrCapability.commandPack || '' },
    },
    {
      id: 'pdf-text-extraction',
      label_zh: 'PDF 文本抽取',
      status: ocrCapability.pdfTextExtractionAvailable ? 'ready' : 'blocked',
      requiredForProduction: true,
      detail_zh: ocrCapability.pdfTextExtractionAvailable
        ? 'pdftotext 可用，普通可复制文本 PDF 有优先抽取路径。'
        : '未检测到 pdftotext；普通文本 PDF 的生产抽取能力未通过验收。',
      action: ocrCapability.pdfTextExtractionAvailable
        ? { type: 'record-pdf-extraction-proof', label_zh: '保存 PDF 抽取验收输出' }
        : { type: 'copy-ocr-recovery-command-pack', label_zh: '复制 poppler-utils 安装/验收命令', commandPack: ocrCapability.commandPack || '' },
    },
    {
      id: 'browser-e2e',
      label_zh: '真实浏览器 E2E',
      status: browserE2eCapability.status === 'ready' ? 'ready' : 'blocked',
      requiredForProduction: true,
      detail_zh: browserE2eCapability.status === 'ready'
        ? '完整 Playwright E2E 验收已通过。'
        : browserE2eCapability.detail_zh || '完整 Playwright E2E 尚未通过。',
      action: browserE2eCapability.status === 'ready'
        ? { type: 'record-browser-e2e-proof', label_zh: '保存浏览器 E2E 验收输出' }
        : {
            type: 'run-browser-e2e-preflight',
            label_zh: '运行 Playwright 预检和浏览器 E2E',
            command: browserE2eCapability.command || 'node scripts/playwright-preflight.mjs',
            commandPack: browserE2eCapability.commandPack || browserE2eCapability.command || 'node scripts/playwright-preflight.mjs',
          },
    },
  ];
}

function buildBrowserE2eCapability() {
  const command = 'node scripts/playwright-preflight.mjs';
  const e2eCommand = 'pnpm e2e';
  const preflightState = readBrowserE2ePreflightState();
  const e2eState = readBrowserE2eAcceptanceState();
  const preflightPassed = preflightState?.status === 'passed';
  const preflightFailed = preflightState?.status === 'failed';
  const e2ePassed = e2eState?.status === 'passed';
  const e2eFailed = ['failed', 'failed-preflight'].includes(e2eState?.status);
  const commandPack = [
    '# Paper Agent 浏览器 E2E 生产验收命令',
    '# 1. 先确认 Chromium 能启动',
    command,
    '',
    '# 2. 如果预检提示缺少浏览器或系统依赖，在可安装依赖的环境执行',
    'npx playwright install',
    'sudo npx playwright install-deps',
    '',
    '# 3. 依赖安装后重新运行预检，再运行项目浏览器 E2E 测试',
    command,
    e2eCommand,
  ].join('\n');
  return {
    status: e2ePassed
      ? 'ready'
      : e2eFailed
        ? e2eState.status
        : preflightPassed
          ? 'preflight-passed'
          : preflightFailed
            ? 'failed-preflight'
            : 'not-verified-in-workbench',
    label_zh: e2ePassed
      ? '真实浏览器 E2E 已通过'
      : e2eFailed
        ? '真实浏览器 E2E 验收失败'
        : preflightPassed
          ? '浏览器预检已通过，完整 E2E 未验收'
          : preflightFailed
            ? '真实浏览器 E2E 预检失败'
            : '真实浏览器 E2E 未在工作台内验证',
    canRunInWorkbench: false,
    requiredBeforeProduction: true,
    detail_zh: e2ePassed
      ? `最近一次完整 Playwright E2E 验收已通过（${e2eState.checkedAt || '时间未知'}）。`
      : e2eFailed
        ? `最近一次完整 Playwright E2E 验收失败（${e2eState.checkedAt || '时间未知'}）：${e2eState.message || '未记录失败原因'}`
        : preflightPassed
          ? `最近一次 Playwright 预检已通过（${preflightState.checkedAt || '时间未知'}）；发布前仍需运行 ${e2eCommand} 验证页面点击流、剪贴板、可编辑回复区、上传/导入/删除和采纳包交互。`
          : preflightFailed
            ? `最近一次 Playwright 预检失败（${preflightState.checkedAt || '时间未知'}）：${preflightState.message || '未记录失败原因'}`
            : '工作台不会在每次分析时启动 Chromium；发布前必须单独运行 Playwright 预检和真实浏览器 E2E，验证页面点击流、剪贴板、可编辑回复区、上传/导入/删除和采纳包交互。',
    command,
    e2eCommand,
    commandPack,
    lastCheckedAt: e2eState?.checkedAt || preflightState?.checkedAt || '',
    preflightState,
    e2eState,
    installHint_zh: e2ePassed
      ? '完整浏览器 E2E 已通过；请保存输出作为生产发布证据。'
      : preflightPassed
        ? `浏览器预检已通过；请继续运行 ${e2eCommand} 并保存输出作为生产发布证据。`
        : '如果预检提示缺少系统库，请执行 npx playwright install 和 sudo npx playwright install-deps，或在具备 Playwright 浏览器依赖的环境运行 E2E。',
  };
}

function readBrowserE2ePreflightState() {
  const statePath = resolve(
    process.env.PAPER_AGENT_PLAYWRIGHT_PREFLIGHT_STATE_PATH || '.paper-agent-runtime/playwright-preflight.json'
  );
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8'));
    if (!['passed', 'failed'].includes(parsed.status)) return null;
    return {
      status: parsed.status,
      checkedAt: String(parsed.checkedAt || ''),
      command: String(parsed.command || 'node scripts/playwright-preflight.mjs'),
      message: String(parsed.message || ''),
      missingLibrary: String(parsed.missingLibrary || ''),
    };
  } catch {
    return null;
  }
}

function readBrowserE2eAcceptanceState() {
  const statePath = resolve(
    process.env.PAPER_AGENT_PLAYWRIGHT_E2E_STATE_PATH || '.paper-agent-runtime/playwright-e2e.json'
  );
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8'));
    if (!['passed', 'failed', 'failed-preflight'].includes(parsed.status)) return null;
    return {
      status: parsed.status,
      checkedAt: String(parsed.checkedAt || ''),
      command: String(parsed.command || 'pnpm e2e'),
      preflightCommand: String(parsed.preflightCommand || 'node scripts/playwright-preflight.mjs'),
      testCommand: String(parsed.testCommand || 'playwright test'),
      exitCode: Number.isFinite(Number(parsed.exitCode)) ? Number(parsed.exitCode) : null,
      message: String(parsed.message || ''),
    };
  } catch {
    return null;
  }
}

function buildRuntimeRecheckPlan(guide, ragSummary = {}) {
  const ocrCommandPack = guide.ocrCapability?.commandPack || [
    'command -v ocrmypdf || true',
    'command -v tesseract || true',
    'command -v pdftotext || true',
  ].join('\n');
  const browserCommandPack = guide.browserE2eCapability?.commandPack || guide.browserE2eCapability?.command || 'node scripts/playwright-preflight.mjs';
  const gateStatuses = new Map((guide.productionGates || []).map(gate => [gate.id, gate.status]));
  const needsOcrRecovery =
    gateStatuses.get('server-ocr') !== 'ready' ||
    gateStatuses.get('pdf-text-extraction') !== 'ready' ||
    guide.documentsNeedingOcr.length > 0;
  const needsBrowserE2e = gateStatuses.get('browser-e2e') !== 'ready';
  const steps = [
    {
      id: 'install-or-confirm-ocr',
      label_zh: '安装或确认 OCR/PDF 抽取工具',
      detail_zh: needsOcrRecovery
        ? '执行 OCR 命令包；如果服务器没有安装权限，改用 OCR 后 PDF 或人工摘录导入。'
        : 'OCR 工具当前可用，保留命令输出作为生产验收证据。',
      commandPack: ocrCommandPack,
    },
    {
      id: 'run-browser-preflight',
      label_zh: '运行真实浏览器 E2E 预检',
      detail_zh: '执行 Playwright 预检；如果缺少系统库，按命令包安装浏览器和系统依赖，或换到具备依赖的环境运行。',
      commandPack: browserCommandPack,
    },
    {
      id: 'reanalyze-workbench',
      label_zh: '重新分析工作台',
      detail_zh: '依赖修复后回到 Paper Agent 工作台点击“分析任务”或“重新评估生产可用性”，让 OCR、E2E 和可用性分级重新计算。',
    },
    {
      id: 'rerun-evidence-flow',
      label_zh: '重跑证据链路验收',
      detail_zh: '对扫描 PDF 运行受控 OCR 队列或导入人工摘录，然后重建索引、检索证据、运行 AI 输出审查和单句证据检查。',
    },
  ];
  const successCriteria = [
    'OCR 命令检查能显示 ocrmypdf、tesseract 和 pdftotext 可用，或每个扫描 PDF 都有 OCR 后 PDF/人工摘录兜底。',
    'node scripts/playwright-preflight.mjs 成功启动 Chromium，并且 pnpm e2e 完整通过真实浏览器 E2E。',
    '重新分析后 runtimeEnvironment 不再是 blocked，agentReadiness.readinessTiers.production-release 不再因为运行环境缺口阻塞。',
    `RAG 摘要中解析失败和 metadata-only 文档数量可解释；当前摘要：failed=${ragSummary.failed || 0}，metadataOnly=${ragSummary.metadataOnly || 0}，indexedChunks=${ragSummary.indexedChunks || 0}。`,
  ];
  const plan = {
    status: needsOcrRecovery || needsBrowserE2e ? 'required-before-production' : 'ready-to-record',
    label_zh: needsOcrRecovery || needsBrowserE2e ? '依赖修复后必须复验' : '运行环境复验证据可记录',
    summary_zh: needsOcrRecovery || needsBrowserE2e
      ? '安装 OCR/浏览器依赖本身不等于生产就绪；必须按顺序重跑命令、重新分析工作台，并确认生产发布级不再被运行环境阻塞。'
      : '运行环境当前未发现阻塞，但生产发布前仍应保存 OCR、Playwright 和工作台重新分析的验收输出。',
    steps,
    successCriteria,
    copyText: '',
  };
  plan.copyText = formatRuntimeRecheckPlanCopyText(plan);
  return plan;
}

function formatRuntimeRecheckPlanCopyText(plan) {
  return [
    '# 依赖修复后复验计划',
    `${plan.label_zh}（${plan.status}）`,
    plan.summary_zh,
    '',
    '# 复验步骤',
    ...(plan.steps || []).map((step, index) => [
      `${index + 1}. ${step.label_zh}`,
      `   - ${step.detail_zh}`,
      step.commandPack ? `   - 命令包：\n${step.commandPack}` : '',
    ].filter(Boolean).join('\n')),
    '',
    '# 通过标准',
    ...(plan.successCriteria || []).map(item => `- ${item}`),
  ].join('\n');
}

function formatRuntimeEnvironmentCopyText(guide, ragSummary = {}) {
  return [
    '# Paper Agent 运行环境能力',
    `${guide.label_zh}（${guide.status}）`,
    guide.summary_zh,
    '',
    '# OCR 能力',
    `${guide.ocrCapability.label_zh}（${guide.ocrCapability.status}）`,
    `自动 OCR 恢复：${guide.ocrCapability.automaticRecoveryAvailable ? '可用' : '未启用'}`,
    '命令包：',
    guide.ocrCapability.commandPack || '',
    guide.ocrCapability.installHint_zh || '',
    '',
    '# 浏览器 E2E 能力',
    `${guide.browserE2eCapability.label_zh}（${guide.browserE2eCapability.status}）`,
    `生产发布前必须验证：${guide.browserE2eCapability.requiredBeforeProduction ? '是' : '否'}`,
    `预检命令：${guide.browserE2eCapability.command}`,
    '命令包：',
    guide.browserE2eCapability.commandPack || guide.browserE2eCapability.command,
    guide.browserE2eCapability.installHint_zh || '',
    '',
    '# 生产验收 Gate',
    ...(guide.productionGates || []).map(item => [
      `- ${item.label_zh}：${item.status}`,
      `  - 要求：${item.requiredForProduction ? '生产发布前必须通过' : '非必需'}`,
      `  - 说明：${item.detail_zh}`,
      item.action?.label_zh ? `  - 动作：${item.action.label_zh}` : '',
    ].filter(Boolean).join('\n')),
    '',
    '# 扫描版/不可抽取 PDF',
    guide.documentsNeedingOcr.length
      ? guide.documentsNeedingOcr.map(item => `- ${item.path}：${item.label_zh || item.recoveryCode}`).join('\n')
      : '- 当前最近证据文档中没有必须 OCR 的阻塞 PDF。',
    '',
    '# RAG 文档摘要',
    `文档总数：${ragSummary.total || 0}`,
    `解析失败：${ragSummary.failed || 0}`,
    `仅 metadata：${ragSummary.metadataOnly || 0}`,
    `可检索 chunks：${ragSummary.indexedChunks || 0}`,
    '',
    guide.recheckPlan?.copyText || '',
    '',
    '# 下一步',
    ...guide.nextActions.map(action => `- ${action.label_zh}`),
  ].filter(Boolean).join('\n');
}
