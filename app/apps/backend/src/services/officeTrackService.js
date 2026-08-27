import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, extname } from 'node:path';

import { safeJoin } from '../utils/pathSecurity.js';

const STATE_PATH = '.openprism/office-track.json';
const SUBMISSION_DIR = 'submission';
const GENERATED_SUBMISSION_PATHS = new Set([
  'submission/M01-proposal.md',
  'submission/M02-demo-script.md',
  'submission/M03-reuse-statement.md',
  'submission/M04-significance.md',
  'submission/M05-effect-evidence.md',
  'submission/M06-reuse-assets.md',
  'submission/reviewer-guide.md',
  'submission/initial-score-guide.md',
  'submission/blank-initial-score-sheet.md',
  'submission/finals-pack.md',
  'submission/finals-score-guide.md',
  'submission/90plus-readiness-pack.md',
  'submission/90plus-score-evidence-matrix.md',
  'submission/demo-evidence-plan.md',
  'submission/pilot-measurement-register.csv',
  'submission/reviewer-qna.md',
  'submission/data-compliance-checklist.md',
  'submission/submission-manifest.json',
]);

const MATERIAL_TYPES = new Set(['proposal', 'demo-video-script', 'reuse-statement', 'significance', 'effect-evidence', 'reviewer-guide', 'finals-pack', 'other']);
const MATERIAL_STATUSES = new Set(['missing', 'draft', 'ready', 'verified']);
const EVIDENCE_LEVELS = new Set(['E0', 'E1', 'E2', 'E3']);
const EVIDENCE_STATUSES = new Set(['planned', 'collected', 'verified', 'rejected']);
const MEASUREMENT_STATUSES = new Set(['not-started', 'designed', 'measured', 'verified']);
const ASSET_TYPES = new Set(['template', 'sop', 'prompt', 'workflow', 'checklist', 'dataset', 'other']);
const ASSET_STATUSES = new Set(['planned', 'ready', 'verified']);

const TOP_LEVEL_FIELDS = new Set(['version', 'brief', 'materials', 'evidence', 'effect', 'reusableAssets', 'finals', 'updatedAt']);
const BRIEF_FIELDS = new Set(['title', 'team', 'scenario', 'users', 'writingTasks', 'valueProposition', 'humanApprovalRequired', 'reuseStatement', 'significance', 'frequency', 'originalProcess', 'painPoints', 'deliveryStandard', 'dependencies', 'constraints']);
const MATERIAL_FIELDS = new Set(['id', 'name', 'type', 'path', 'status', 'notes']);
const EVIDENCE_FIELDS = new Set(['id', 'claim', 'sourcePath', 'location', 'level', 'status', 'notes']);
const EFFECT_FIELDS = new Set(['baselineMinutes', 'aiMinutes', 'retryMinutes', 'reviewMinutes', 'setupMinutes', 'maintenanceMinutes', 'qualityNotes', 'sampleSize', 'measurementStatus', 'unit', 'period', 'taskFrequency', 'coveragePeople', 'calculationNotes']);
const ASSET_FIELDS = new Set(['id', 'name', 'type', 'path', 'status', 'notes', 'targetRoles', 'learningMinutes', 'deploymentNotes', 'permissionNotes', 'maintenanceOwner']);
const FINALS_FIELDS = new Set(['demoScript', 'questions', 'operatorChecklist', 'landingEvidence', 'rolloutPlan', 'aiOptimization']);
const LANDING_EVIDENCE_FIELDS = new Set(['usagePeriod', 'users', 'useCount', 'outputs', 'feedback']);
const ROLLOUT_PLAN_FIELDS = new Set(['targetRoles', 'milestones', 'owner', 'resources', 'costs', 'risks', 'metrics']);
const AI_OPTIMIZATION_FIELDS = new Set(['versions', 'evaluation', 'iterations']);
const TEXT_FILE_EXTENSIONS = new Set([
  '', '.txt', '.md', '.mdx', '.csv', '.tsv', '.json', '.jsonl', '.yaml', '.yml', '.xml', '.html', '.htm',
  '.tex', '.bib', '.rtf', '.log', '.ini', '.toml', '.conf', '.env', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.py', '.java', '.c', '.h', '.cc', '.cpp', '.go', '.rs', '.rb', '.php', '.sh', '.ps1', '.sql', '.css', '.scss', '.svg',
]);

function minCap(...caps) {
  const applicable = caps.filter(Boolean);
  if (!applicable.length) return null;
  return applicable.reduce((lowest, cap) => (cap.maxScore < lowest.maxScore ? cap : lowest), applicable[0]);
}

function officeTrackError(message, code = 'INVALID_OFFICE_TRACK_STATE', statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

export function defaultOfficeTrackState() {
  return {
    version: 1,
    brief: {
      title: '',
      team: '',
      scenario: '',
      users: '',
      writingTasks: [],
      valueProposition: '',
      humanApprovalRequired: true,
      reuseStatement: '',
      significance: '',
      frequency: '',
      originalProcess: '',
      painPoints: [],
      deliveryStandard: '',
      dependencies: [],
      constraints: [],
    },
    materials: [],
    evidence: [],
    effect: {
      baselineMinutes: null,
      aiMinutes: null,
      retryMinutes: null,
      reviewMinutes: null,
      setupMinutes: null,
      maintenanceMinutes: null,
      qualityNotes: '',
      sampleSize: null,
      measurementStatus: 'not-started',
      unit: '',
      period: '',
      taskFrequency: '',
      coveragePeople: null,
      calculationNotes: '',
    },
    reusableAssets: [],
    finals: {
      demoScript: '',
      questions: [],
      operatorChecklist: [],
      landingEvidence: {
        usagePeriod: '',
        users: [],
        useCount: null,
        outputs: [],
        feedback: [],
      },
      rolloutPlan: {
        targetRoles: [],
        milestones: [],
        owner: '',
        resources: [],
        costs: '',
        risks: [],
        metrics: [],
      },
      aiOptimization: {
        versions: [],
        evaluation: '',
        iterations: [],
      },
    },
    updatedAt: null,
  };
}

function assertKnownFields(value, allowed, scope) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw officeTrackError(`${scope} must be an object.`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw officeTrackError(`Unsupported office track field: ${scope}.${key}`);
  }
}

function cleanString(value, field, max = 4000) {
  if (value == null) return '';
  if (typeof value !== 'string') throw officeTrackError(`${field} must be a string.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw officeTrackError(`${field} is too long.`);
  return trimmed;
}

function cleanStringArray(value, field, maxItems = 20, maxLength = 400) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw officeTrackError(`${field} must be an array.`);
  if (value.length > maxItems) throw officeTrackError(`${field} has too many items.`);
  return value.map((item, index) => cleanString(item, `${field}[${index}]`, maxLength)).filter(Boolean);
}

function cleanFiniteNumber(value, field) {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw officeTrackError(`${field} must be a finite number.`);
  }
  if (value < 0) throw officeTrackError(`${field} cannot be negative.`);
  return value;
}

function cleanCount(value, field) {
  const count = cleanFiniteNumber(value, field);
  if (count != null && !Number.isInteger(count)) {
    throw officeTrackError(`${field} must be an integer.`);
  }
  return count;
}

function cleanBoolean(value, field) {
  if (typeof value !== 'boolean') throw officeTrackError(`${field} must be a boolean.`);
  return value;
}

function cleanUpdatedAt(value) {
  if (value == null || value === '') return null;
  const timestamp = cleanString(value, 'state.updatedAt', 40);
  if (Number.isNaN(Date.parse(timestamp))) throw officeTrackError('state.updatedAt must be an ISO timestamp.');
  return timestamp;
}

function cleanEnum(value, allowed, field, fallback) {
  const normalized = cleanString(value || fallback, field, 80);
  if (!allowed.has(normalized)) throw officeTrackError(`${field} has unsupported value.`);
  return normalized;
}

function cleanId(value, field) {
  const id = cleanString(value, field, 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id)) {
    throw officeTrackError(`${field} must be a stable id.`);
  }
  return id;
}

function cleanRelativePath(value, field) {
  const normalized = cleanString(value, field, 260).replace(/\\/g, '/');
  if (!normalized) return '';
  if (normalized.startsWith('/') || normalized.split('/').some(part => part === '..' || part === '.')) {
    throw officeTrackError(`${field} must be a safe relative path.`);
  }
  if (normalized.includes('\0')) throw officeTrackError(`${field} contains an invalid character.`);
  return normalized.replace(/^\/+/, '');
}

function cleanRegisteredPath(value, field) {
  const relativePath = cleanRelativePath(value, field);
  if (GENERATED_SUBMISSION_PATHS.has(relativePath)) {
    throw officeTrackError(`${field} cannot point to a generated submission file.`);
  }
  return relativePath;
}

function mergeBrief(input = {}, previous = defaultOfficeTrackState().brief) {
  assertKnownFields(input, BRIEF_FIELDS, 'brief');
  return {
    title: cleanString(input.title ?? previous.title, 'brief.title', 160),
    team: cleanString(input.team ?? previous.team, 'brief.team', 160),
    scenario: cleanString(input.scenario ?? previous.scenario, 'brief.scenario', 1000),
    users: cleanString(input.users ?? previous.users, 'brief.users', 1000),
    writingTasks: cleanStringArray(input.writingTasks ?? previous.writingTasks, 'brief.writingTasks'),
    valueProposition: cleanString(input.valueProposition ?? previous.valueProposition, 'brief.valueProposition', 1600),
    humanApprovalRequired: input.humanApprovalRequired == null ? previous.humanApprovalRequired : cleanBoolean(input.humanApprovalRequired, 'brief.humanApprovalRequired'),
    reuseStatement: cleanString(input.reuseStatement ?? previous.reuseStatement, 'brief.reuseStatement', 1600),
    significance: cleanString(input.significance ?? previous.significance, 'brief.significance', 1600),
    frequency: cleanString(input.frequency ?? previous.frequency, 'brief.frequency', 400),
    originalProcess: cleanString(input.originalProcess ?? previous.originalProcess, 'brief.originalProcess', 1600),
    painPoints: cleanStringArray(input.painPoints ?? previous.painPoints, 'brief.painPoints', 20, 400),
    deliveryStandard: cleanString(input.deliveryStandard ?? previous.deliveryStandard, 'brief.deliveryStandard', 1000),
    dependencies: cleanStringArray(input.dependencies ?? previous.dependencies, 'brief.dependencies', 20, 400),
    constraints: cleanStringArray(input.constraints ?? previous.constraints, 'brief.constraints', 20, 400),
  };
}

function cleanMaterial(item, index) {
  assertKnownFields(item, MATERIAL_FIELDS, `materials[${index}]`);
  return {
    id: cleanId(item.id, `materials[${index}].id`),
    name: cleanString(item.name, `materials[${index}].name`, 180),
    type: cleanEnum(item.type, MATERIAL_TYPES, `materials[${index}].type`, 'other'),
    path: cleanRegisteredPath(item.path, `materials[${index}].path`),
    status: cleanEnum(item.status, MATERIAL_STATUSES, `materials[${index}].status`, 'draft'),
    notes: cleanString(item.notes, `materials[${index}].notes`, 1000),
  };
}

function cleanEvidence(item, index) {
  assertKnownFields(item, EVIDENCE_FIELDS, `evidence[${index}]`);
  return {
    id: cleanId(item.id, `evidence[${index}].id`),
    claim: cleanString(item.claim, `evidence[${index}].claim`, 500),
    sourcePath: cleanRegisteredPath(item.sourcePath, `evidence[${index}].sourcePath`),
    location: cleanString(item.location, `evidence[${index}].location`, 160),
    level: cleanEnum(item.level, EVIDENCE_LEVELS, `evidence[${index}].level`, 'E0'),
    status: cleanEnum(item.status, EVIDENCE_STATUSES, `evidence[${index}].status`, 'planned'),
    notes: cleanString(item.notes, `evidence[${index}].notes`, 1000),
  };
}

function mergeEffect(input = {}, previous = defaultOfficeTrackState().effect) {
  assertKnownFields(input, EFFECT_FIELDS, 'effect');
  return {
    baselineMinutes: cleanFiniteNumber(input.baselineMinutes ?? previous.baselineMinutes, 'effect.baselineMinutes'),
    aiMinutes: cleanFiniteNumber(input.aiMinutes ?? previous.aiMinutes, 'effect.aiMinutes'),
    retryMinutes: cleanFiniteNumber(input.retryMinutes ?? previous.retryMinutes, 'effect.retryMinutes'),
    reviewMinutes: cleanFiniteNumber(input.reviewMinutes ?? previous.reviewMinutes, 'effect.reviewMinutes'),
    setupMinutes: cleanFiniteNumber(input.setupMinutes ?? previous.setupMinutes, 'effect.setupMinutes'),
    maintenanceMinutes: cleanFiniteNumber(input.maintenanceMinutes ?? previous.maintenanceMinutes, 'effect.maintenanceMinutes'),
    qualityNotes: cleanString(input.qualityNotes ?? previous.qualityNotes, 'effect.qualityNotes', 1600),
    sampleSize: cleanCount(input.sampleSize ?? previous.sampleSize, 'effect.sampleSize'),
    measurementStatus: cleanEnum(input.measurementStatus ?? previous.measurementStatus, MEASUREMENT_STATUSES, 'effect.measurementStatus', 'not-started'),
    unit: cleanString(input.unit ?? previous.unit, 'effect.unit', 80),
    period: cleanString(input.period ?? previous.period, 'effect.period', 200),
    taskFrequency: cleanString(input.taskFrequency ?? previous.taskFrequency, 'effect.taskFrequency', 200),
    coveragePeople: cleanCount(input.coveragePeople ?? previous.coveragePeople, 'effect.coveragePeople'),
    calculationNotes: cleanString(input.calculationNotes ?? previous.calculationNotes, 'effect.calculationNotes', 1600),
  };
}

function cleanAsset(item, index) {
  assertKnownFields(item, ASSET_FIELDS, `reusableAssets[${index}]`);
  return {
    id: cleanId(item.id, `reusableAssets[${index}].id`),
    name: cleanString(item.name, `reusableAssets[${index}].name`, 180),
    type: cleanEnum(item.type, ASSET_TYPES, `reusableAssets[${index}].type`, 'other'),
    path: cleanRegisteredPath(item.path, `reusableAssets[${index}].path`),
    status: cleanEnum(item.status, ASSET_STATUSES, `reusableAssets[${index}].status`, 'planned'),
    notes: cleanString(item.notes, `reusableAssets[${index}].notes`, 1000),
    targetRoles: cleanStringArray(item.targetRoles, `reusableAssets[${index}].targetRoles`, 20, 200),
    learningMinutes: cleanFiniteNumber(item.learningMinutes, `reusableAssets[${index}].learningMinutes`),
    deploymentNotes: cleanString(item.deploymentNotes, `reusableAssets[${index}].deploymentNotes`, 1000),
    permissionNotes: cleanString(item.permissionNotes, `reusableAssets[${index}].permissionNotes`, 1000),
    maintenanceOwner: cleanString(item.maintenanceOwner, `reusableAssets[${index}].maintenanceOwner`, 160),
  };
}

function mergeLandingEvidence(input = {}, previous = defaultOfficeTrackState().finals.landingEvidence) {
  assertKnownFields(input, LANDING_EVIDENCE_FIELDS, 'finals.landingEvidence');
  return {
    usagePeriod: cleanString(input.usagePeriod ?? previous.usagePeriod, 'finals.landingEvidence.usagePeriod', 200),
    users: cleanStringArray(input.users ?? previous.users, 'finals.landingEvidence.users', 30, 200),
    useCount: cleanCount(input.useCount ?? previous.useCount, 'finals.landingEvidence.useCount'),
    outputs: cleanStringArray(input.outputs ?? previous.outputs, 'finals.landingEvidence.outputs', 30, 400),
    feedback: cleanStringArray(input.feedback ?? previous.feedback, 'finals.landingEvidence.feedback', 30, 400),
  };
}

function mergeRolloutPlan(input = {}, previous = defaultOfficeTrackState().finals.rolloutPlan) {
  assertKnownFields(input, ROLLOUT_PLAN_FIELDS, 'finals.rolloutPlan');
  return {
    targetRoles: cleanStringArray(input.targetRoles ?? previous.targetRoles, 'finals.rolloutPlan.targetRoles', 30, 200),
    milestones: cleanStringArray(input.milestones ?? previous.milestones, 'finals.rolloutPlan.milestones', 30, 400),
    owner: cleanString(input.owner ?? previous.owner, 'finals.rolloutPlan.owner', 160),
    resources: cleanStringArray(input.resources ?? previous.resources, 'finals.rolloutPlan.resources', 30, 400),
    costs: cleanString(input.costs ?? previous.costs, 'finals.rolloutPlan.costs', 800),
    risks: cleanStringArray(input.risks ?? previous.risks, 'finals.rolloutPlan.risks', 30, 400),
    metrics: cleanStringArray(input.metrics ?? previous.metrics, 'finals.rolloutPlan.metrics', 30, 400),
  };
}

function mergeAiOptimization(input = {}, previous = defaultOfficeTrackState().finals.aiOptimization) {
  assertKnownFields(input, AI_OPTIMIZATION_FIELDS, 'finals.aiOptimization');
  return {
    versions: cleanStringArray(input.versions ?? previous.versions, 'finals.aiOptimization.versions', 30, 400),
    evaluation: cleanString(input.evaluation ?? previous.evaluation, 'finals.aiOptimization.evaluation', 1000),
    iterations: cleanStringArray(input.iterations ?? previous.iterations, 'finals.aiOptimization.iterations', 30, 400),
  };
}

function mergeFinals(input = {}, previous = defaultOfficeTrackState().finals) {
  assertKnownFields(input, FINALS_FIELDS, 'finals');
  return {
    demoScript: cleanString(input.demoScript ?? previous.demoScript, 'finals.demoScript', 4000),
    questions: cleanStringArray(input.questions ?? previous.questions, 'finals.questions', 30, 400),
    operatorChecklist: cleanStringArray(input.operatorChecklist ?? previous.operatorChecklist, 'finals.operatorChecklist', 30, 400),
    landingEvidence: mergeLandingEvidence(input.landingEvidence || {}, previous.landingEvidence),
    rolloutPlan: mergeRolloutPlan(input.rolloutPlan || {}, previous.rolloutPlan),
    aiOptimization: mergeAiOptimization(input.aiOptimization || {}, previous.aiOptimization),
  };
}

function validateStatePatch(input, previous = defaultOfficeTrackState(), options = {}) {
  assertKnownFields(input, TOP_LEVEL_FIELDS, 'state');
  if (input.materials != null && !Array.isArray(input.materials)) throw officeTrackError('materials must be an array.');
  if (input.evidence != null && !Array.isArray(input.evidence)) throw officeTrackError('evidence must be an array.');
  if (input.reusableAssets != null && !Array.isArray(input.reusableAssets)) throw officeTrackError('reusableAssets must be an array.');
  return {
    version: 1,
    brief: mergeBrief(input.brief || {}, previous.brief),
    materials: input.materials == null ? previous.materials : input.materials.map(cleanMaterial),
    evidence: input.evidence == null ? previous.evidence : input.evidence.map(cleanEvidence),
    effect: mergeEffect(input.effect || {}, previous.effect),
    reusableAssets: input.reusableAssets == null ? previous.reusableAssets : input.reusableAssets.map(cleanAsset),
    finals: mergeFinals(input.finals || {}, previous.finals),
    updatedAt: options.preserveUpdatedAt ? cleanUpdatedAt(input.updatedAt) : new Date().toISOString(),
  };
}

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
  await fs.rename(tempPath, filePath);
}

async function writeText(projectRoot, relativePath, content) {
  const target = safeJoin(projectRoot, relativePath);
  await fs.mkdir(dirname(target), { recursive: true });
  const tempPath = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${content.trimEnd()}\n`, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
  await fs.rename(tempPath, target);
  const sha256 = crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');
  return { path: relativePath, sha256 };
}

export async function loadOfficeTrackState(projectRoot) {
  const filePath = safeJoin(projectRoot, STATE_PATH);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    return validateStatePatch(parsed, defaultOfficeTrackState(), { preserveUpdatedAt: true });
  } catch (error) {
    if (error.code === 'ENOENT') return defaultOfficeTrackState();
    throw error;
  }
}

export async function saveOfficeTrackState(projectRoot, input) {
  const previous = await loadOfficeTrackState(projectRoot);
  const state = validateStatePatch(input || {}, previous);
  await atomicWriteJson(safeJoin(projectRoot, STATE_PATH), state);
  return state;
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requiredMaterialStatus(materials) {
  const required = [
    ['proposal', '作品说明'],
    ['demo-video-script', '3分钟演示视频/脚本'],
    ['reuse-statement', '复用声明'],
    ['significance', '重大意义说明'],
  ];
  return required.map(([type, label]) => {
    const match = materials.find(item => item.type === type && item.status !== 'missing');
    return { type, label, pass: Boolean(match), path: match?.path || '' };
  });
}

function effectSummary(effect) {
  const baseline = effect.baselineMinutes;
  const totalAi = [effect.aiMinutes, effect.reviewMinutes, effect.retryMinutes, effect.setupMinutes, effect.maintenanceMinutes]
    .filter(value => typeof value === 'number')
    .reduce((sum, value) => sum + value, 0);
  const hasMeasuredTime = typeof baseline === 'number' && baseline > 0 && totalAi > 0;
  return {
    timeSavedMinutes: hasMeasuredTime ? baseline - totalAi : null,
    timeSavedRate: hasMeasuredTime ? (baseline - totalAi) / baseline : null,
    includesReviewAndRetry: typeof effect.reviewMinutes === 'number' && typeof effect.retryMinutes === 'number',
    includesSetupOrMaintenance: typeof effect.setupMinutes === 'number' || typeof effect.maintenanceMinutes === 'number',
    sampleSize: effect.sampleSize,
    measured: effect.measurementStatus === 'measured' || effect.measurementStatus === 'verified',
  };
}

function detectInformationRisks(text, source) {
  const risks = [];
  const checks = [
    { id: 'credential-like', severity: 'medium', pattern: /\b(?:sk-[A-Za-z0-9._-]{8,}|ghp_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|Bearer\s+[A-Za-z0-9._~+/-]{8,})\b/i, message: '发现疑似凭据或访问令牌特征，需人工复核后再提交。' },
    { id: 'credential-assignment', severity: 'medium', pattern: /\b(?:password|passwd|api[_-]?key|access[_-]?token|secret)\s*[:=]\s*[^\s]{6,}/i, message: '发现疑似账号配置或密码赋值，需人工复核并脱敏。' },
    { id: 'private-key-marker', severity: 'medium', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i, message: '发现疑似私钥标记，需人工复核并从参赛材料中移除。' },
    { id: 'private-url', severity: 'medium', pattern: /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})[^\s)]*/i, message: '发现本机或内网 URL，需确认是否适合出现在参赛材料中。' },
    { id: 'pii-like-email', severity: 'medium', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, message: '发现疑似邮箱地址，需人工复核隐私和对外流转边界。' },
    { id: 'pii-like-phone', severity: 'medium', pattern: /\b1[3-9]\d{9}\b/, message: '发现疑似手机号，需人工复核隐私边界。' },
    { id: 'pii-like-id', severity: 'medium', pattern: /\b\d{17}[\dXx]\b/, message: '发现疑似身份证号，需人工复核隐私边界。' },
    { id: 'sensitive-business-keyword', severity: 'low', pattern: /客户(?:信息|数据|名单|业务)|合同|报价|财务数据|生产数据|未脱敏日志/, message: '发现客户、合同、报价、财务或生产数据相关表述，需人工复核材料权限与脱敏状态。' },
  ];
  for (const check of checks) {
    if (check.pattern.test(text)) {
      const { pattern: _pattern, ...publicRisk } = check;
      risks.push({ ...publicRisk, source });
    }
  }
  return risks;
}

async function inspectRelativeFile(projectRoot, relativePath, source) {
  if (!relativePath) return { source, path: '', status: 'missing', reason: '未填写文件路径', informationRisks: [] };
  try {
    const fullPath = safeJoin(projectRoot, relativePath);
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      return { source, path: relativePath, status: 'partial', reason: '路径是目录，不是可提交文件', bytes: 0, informationRisks: detectInformationRisks(relativePath, source) };
    }
    const extension = extname(relativePath).toLowerCase();
    if (!TEXT_FILE_EXTENSIONS.has(extension)) {
      return {
        source,
        path: relativePath,
        status: 'partial',
        reason: '文件存在但属于二进制或专用格式，需人工打开、播放或使用对应工具确认可读性。',
        bytes: stat.size,
        informationRisks: detectInformationRisks(relativePath, source),
      };
    }
    const handle = await fs.open(fullPath, 'r');
    let content = '';
    try {
      const sample = Buffer.alloc(Math.min(stat.size, 65536));
      const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
      content = sample.subarray(0, bytesRead).toString('utf-8');
    } finally {
      await handle.close();
    }
    const looksBinary = content.includes('\0');
    return {
      source,
      path: relativePath,
      status: content && !looksBinary ? 'readable' : 'partial',
      reason: content && !looksBinary ? '' : '文件存在但无法按文本可靠读取，需人工确认内容可读',
      bytes: stat.size,
      informationRisks: detectInformationRisks(`${relativePath}\n${content.slice(0, 65536)}`, source),
    };
  } catch (error) {
    if (error.statusCode) throw error;
    if (error.code === 'ENOENT') return { source, path: relativePath, status: 'missing', reason: '文件不存在', bytes: 0, informationRisks: detectInformationRisks(relativePath, source) };
    return { source, path: relativePath, status: 'unreadable', reason: error.message || '读取失败', bytes: 0, informationRisks: detectInformationRisks(relativePath, source) };
  }
}

function scoreModule({ max, checks, reasons = [], deductions = [], evidenceLocations = [], confidence = 'low', cap = null, extra = {} }) {
  const passed = checks.filter(check => check.pass).length;
  const rawScore = Math.round((max * (passed / checks.length)) * 2) / 2;
  const score = cap ? Math.min(rawScore, cap.maxScore) : rawScore;
  const finalScore = Math.round(score * 2) / 2;
  const band = max === 30
    ? (finalScore >= 26 ? '非常突出/很高' : finalScore >= 20 ? '明显/较高' : finalScore >= 10 ? '一定/一般' : finalScore >= 1 ? '较弱' : '无法支持')
    : (finalScore >= 17 ? '很强' : finalScore >= 13 ? '较好' : finalScore >= 7 ? '一般' : finalScore >= 1 ? '较弱' : '无法支持');
  return {
    score: finalScore,
    rawScore,
    max,
    band,
    checks,
    reasons,
    deductions,
    evidenceLocations,
    confidence,
    cap,
    ...extra,
  };
}

export function auditOfficeTrack(state) {
  const materials = requiredMaterialStatus(state.materials);
  const verifiedEvidence = state.evidence.filter(item => item.status === 'verified');
  const measured = effectSummary(state.effect);
  const hasReuse = state.reusableAssets.some(item => item.status !== 'planned');
  const highEvidenceCount = verifiedEvidence.filter(item => ['E1', 'E2', 'E3'].includes(item.level)).length;
  const demoReady = state.materials.some(item => item.type === 'demo-video-script' && ['ready', 'verified'].includes(item.status));
  const oneOffScenario = /一次性|单次|个人临时|低频/.test(`${state.brief.frequency}\n${state.brief.scenario}\n${state.brief.valueProposition}`);
  const publicTemplateOnly = /公开模板|模板套用|无业务定制|直接套/.test(`${state.brief.scenario}\n${state.brief.valueProposition}\n${state.brief.originalProcess}`);
  const creativeOnlyNoOperation = !demoReady && !measured.measured && verifiedEvidence.length === 0;
  const comparableTask = hasText(state.brief.originalProcess) && state.brief.writingTasks.length > 0;
  const comparableQuality = hasText(state.brief.deliveryStandard) || hasText(state.effect.qualityNotes);
  const quantitativeComplete = typeof state.effect.baselineMinutes === 'number'
    && typeof state.effect.aiMinutes === 'number'
    && typeof state.effect.reviewMinutes === 'number'
    && typeof state.effect.retryMinutes === 'number'
    && typeof state.effect.sampleSize === 'number'
    && state.effect.sampleSize > 0;
  const contradictions = [];
  if (measured.measured && !comparableTask) contradictions.push({ id: 'task-baseline-missing', action: 'manual-review', message: '缺少原流程/同类任务口径，提效数据不采信为正式结论。' });
  if (measured.measured && !comparableQuality) contradictions.push({ id: 'quality-standard-missing', action: 'manual-review', message: '缺少质量标准或质量说明，前后质量不一致风险需人工复核。' });
  contradictions.push(...state.evidence
    .filter(item => item.status === 'rejected')
    .map(item => ({ id: `rejected-evidence-${item.id}`, action: 'manual-review', message: `证据 ${item.id} 已标记为否决/矛盾：${item.notes || item.claim || '需人工核对原材料'}` })));
  const risks = [];

  if (!state.brief.humanApprovalRequired) {
    risks.push({ id: 'human-approval-disabled', severity: 'high', message: '必须保留人工确认后采纳，避免自动覆盖办公材料。' });
  }
  if (!measured.measured) {
    risks.push({ id: 'effect-not-measured', severity: 'medium', message: '成效尚未完成可复核测量，不能使用确定性效率提升结论。' });
  }
  if (verifiedEvidence.length === 0) {
    risks.push({ id: 'missing-verified-evidence', severity: 'high', message: '缺少已核验证据，文案主张只能作为待证实假设。' });
  }
  if (!quantitativeComplete) {
    risks.push({ id: 'incomplete-quantitative-data', severity: 'medium', message: '量化数据不完整或缺少基线，不生成确定效率结论；仅降低置信度并列出缺口。' });
  }
  if (contradictions.length > 0) {
    risks.push({ id: 'effect-manual-review', severity: 'high', message: '提效数据存在口径或质量一致性缺口，转人工复核，不取平均、不自动选高值。' });
  }

  const moduleCaps = {
    efficiency: minCap(
      creativeOnlyNoOperation ? { id: 'creative-only-no-operation', maxScore: 8, reason: '仅创意说明、无真实操作/成效证据时提效成效最多 8 分。' } : null,
      measured.measured && typeof measured.timeSavedMinutes === 'number' && measured.timeSavedMinutes <= 0
        ? { id: 'measured-no-improvement', maxScore: 0, reason: '现有实测数据表明全成本耗时未改善，提效成效为 0 分。' }
        : null,
    ),
    scenario: oneOffScenario ? { id: 'personal-one-off-scenario', maxScore: 15, reason: '个人一次性或低频任务的场景价值最多 15 分。' } : null,
    innovation: publicTemplateOnly ? { id: 'public-template-no-customization', maxScore: 8, reason: '直接套公开模板且无业务定制，方案创新性最多 8 分。' } : null,
    portability: minCap(
      !hasReuse ? { id: 'no-reuse-assets', maxScore: 10, reason: '无复用资产，可推广性最多 10 分。' } : null,
      creativeOnlyNoOperation ? { id: 'creative-only-no-operation', maxScore: 8, reason: '仅创意说明、无真实操作时可推广性最多 8 分。' } : null,
    ),
  };

  const modules = {
    efficiency: scoreModule({
      max: 30,
      cap: moduleCaps.efficiency,
      checks: [
        { id: 'measured-time', label: '记录人工基线、AI生成、复核、返工耗时', pass: measured.measured && measured.includesReviewAndRetry },
        { id: 'effect-sample', label: '记录样本量或测量范围', pass: typeof measured.sampleSize === 'number' && measured.sampleSize > 0 },
        { id: 'rework-included', label: '成效计算包含复核/返工/维护成本', pass: measured.includesReviewAndRetry },
        { id: 'task-comparable', label: '前后任务口径一致', pass: comparableTask },
        { id: 'quality-comparable', label: '前后质量标准一致或可解释', pass: comparableQuality },
      ],
      reasons: [
        measured.measured ? '已登记测量状态。' : '尚未完成可复核测量。',
        measured.includesReviewAndRetry ? '复核与返工成本已纳入。' : '复核或返工成本缺失。',
      ],
      deductions: [
        ...(!quantitativeComplete ? ['量化数据不完整/无基线，只降置信度，不统一限分。'] : []),
        ...contradictions.map(item => item.message),
      ],
      evidenceLocations: state.evidence.filter(item => item.claim.includes('效') || item.claim.includes('耗时') || item.claim.includes('效率')).map(item => ({ id: item.id, path: item.sourcePath, location: item.location })),
      confidence: quantitativeComplete && contradictions.length === 0 ? 'medium' : 'low',
      extra: {
        analysisPath: ['确认同类任务', '复算全成本耗时', '核对质量标准', '检查样本和周期', '输出人工复核缺口'],
        assumptions: [state.effect.unit, state.effect.period, state.effect.taskFrequency].filter(Boolean),
        possibleBias: [
          ...(!comparableTask ? ['前后任务口径可能不一致'] : []),
          ...(!comparableQuality ? ['前后质量标准可能不一致'] : []),
          ...(!quantitativeComplete ? ['缺少完整量化字段'] : []),
        ],
      },
    }),
    scenario: scoreModule({
      max: 30,
      cap: moduleCaps.scenario,
      checks: [
        { id: 'clear-users', label: '目标办公人群明确', pass: hasText(state.brief.users) },
        { id: 'clear-writing-tasks', label: '办公文案任务明确', pass: state.brief.writingTasks.length >= 2 },
        { id: 'frequency', label: '发生频率或周期明确', pass: hasText(state.brief.frequency) || hasText(state.effect.taskFrequency) },
        { id: 'pain-points', label: '真实痛点明确', pass: state.brief.painPoints.length > 0 || hasText(state.brief.originalProcess) },
        { id: 'required-materials', label: '初赛材料清单完整', pass: materials.every(item => item.pass) },
      ],
      reasons: [state.brief.scenario || '场景待补充', state.brief.users || '用户待补充'],
      deductions: [oneOffScenario ? '个人一次性/低频场景触发场景价值模块上限。' : ''],
      evidenceLocations: state.evidence.filter(item => item.claim.includes('场景') || item.claim.includes('用户') || item.claim.includes('频率')).map(item => ({ id: item.id, path: item.sourcePath, location: item.location })),
      confidence: hasText(state.brief.users) && (hasText(state.brief.frequency) || hasText(state.effect.taskFrequency)) ? 'medium' : 'low',
    }),
    innovation: scoreModule({
      max: 20,
      cap: moduleCaps.innovation,
      checks: [
        { id: 'evidence-levels', label: '证据等级和定位进入写作流程', pass: highEvidenceCount >= 1 },
        { id: 'approval-gate', label: '明确人工审批和不可自动裁决边界', pass: state.brief.humanApprovalRequired },
        { id: 'audit-export', label: '一键导出审计/评委材料', pass: true },
        { id: 'process-customization', label: '业务流程定制明确', pass: hasText(state.brief.originalProcess) && !publicTemplateOnly },
      ],
      reasons: ['证据索引、人工审批和导出审计构成业务化写作流程。'],
      deductions: [publicTemplateOnly ? '直接套公开模板且无业务定制，创新性模块限分。' : ''],
      evidenceLocations: state.evidence.filter(item => item.status === 'verified').map(item => ({ id: item.id, path: item.sourcePath, location: item.location })),
      confidence: highEvidenceCount >= 1 && !publicTemplateOnly ? 'medium' : 'low',
    }),
    portability: scoreModule({
      max: 20,
      cap: moduleCaps.portability,
      checks: [
        { id: 'reusable-assets', label: '模板/SOP/提示词等复用资产可定位', pass: hasReuse },
        { id: 'local-first', label: '项目内本地文件保存和导出', pass: true },
        { id: 'role-cost', label: '目标岗位、学习或部署成本明确', pass: state.reusableAssets.some(item => item.targetRoles.length > 0 || typeof item.learningMinutes === 'number' || hasText(item.deploymentNotes)) },
        { id: 'finals-ready', label: '决赛演示脚本、问答或操作清单已准备', pass: hasText(state.finals.demoScript) || state.finals.questions.length > 0 || state.finals.operatorChecklist.length > 0 },
      ],
      reasons: ['项目内模板、SOP、Skill 和 submission 导出支持迁移复用。'],
      deductions: [
        ...(!hasReuse ? ['无复用资产，可推广性模块限分。'] : []),
        ...(creativeOnlyNoOperation ? ['仅创意说明、无真实操作，可推广性模块限分。'] : []),
      ],
      evidenceLocations: state.reusableAssets.map(item => ({ id: item.id, path: item.path, location: item.maintenanceOwner || item.targetRoles.join(', ') })),
      confidence: hasReuse ? 'medium' : 'low',
    }),
  };

  const scoreStatus = demoReady ? 'ready' : 'needs-materials';
  const scoreFormation = {
    scoreStatus,
    reason: demoReady ? '材料足以形成准备度建议总分。' : '缺少 ready/verified 三分钟演示材料，不形成总建议分。',
    totalGuidanceScore: demoReady ? Math.round(Object.values(modules).reduce((sum, module) => sum + module.score, 0) * 2) / 2 : null,
    moduleCaps,
  };

  const ruleMatrix = [
    { ruleId: 'initial-required-materials', status: materials.every(item => item.pass) ? 'pass' : 'needs-work', evidence: materials },
    { ruleId: 'efficiency-30', status: modules.efficiency.score >= 20 ? 'pass' : 'needs-work', evidence: modules.efficiency.checks },
    { ruleId: 'scenario-30', status: modules.scenario.score >= 20 ? 'pass' : 'needs-work', evidence: modules.scenario.checks },
    { ruleId: 'innovation-20', status: modules.innovation.score >= 13 ? 'pass' : 'needs-work', evidence: modules.innovation.checks },
    { ruleId: 'portability-20', status: modules.portability.score >= 13 ? 'pass' : 'needs-work', evidence: modules.portability.checks },
    { ruleId: 'finals-readiness', status: modules.portability.checks.find(item => item.id === 'finals-ready')?.pass ? 'pass' : 'needs-work', evidence: state.finals },
  ];

  return {
    version: 1,
    officialJudgement: false,
    generatedAt: new Date().toISOString(),
    confidence: verifiedEvidence.length >= 2 && measured.measured ? 'medium' : 'low',
    modules,
    totalGuidanceScore: scoreFormation.totalGuidanceScore,
    scoreFormation,
    moduleCaps,
    caps: Object.values(moduleCaps).filter(Boolean),
    risks,
    materials,
    evidence: {
      verifiedCount: verifiedEvidence.length,
      highEvidenceCount,
      levels: ['E0', 'E1', 'E2', 'E3'].map(level => ({ level, count: state.evidence.filter(item => item.level === level).length })),
    },
    effect: { normalized: measured },
    consistency: {
      costIncluded: {
        review: typeof state.effect.reviewMinutes === 'number',
        retry: typeof state.effect.retryMinutes === 'number',
        setup: typeof state.effect.setupMinutes === 'number',
        maintenance: typeof state.effect.maintenanceMinutes === 'number',
      },
      recalculated: measured,
      contradictions,
    },
    ruleMatrix,
  };
}

export async function auditOfficeTrackProject(projectRoot, state) {
  const baseAudit = auditOfficeTrack(state);
  const materialReadability = await Promise.all(state.materials.map(item => inspectRelativeFile(projectRoot, item.path, `material:${item.id}`)));
  const evidenceReadability = await Promise.all(state.evidence.map(item => inspectRelativeFile(projectRoot, item.sourcePath, `evidence:${item.id}`)));
  const demoMaterial = state.materials.find(item => item.type === 'demo-video-script' && ['ready', 'verified'].includes(item.status));
  const demoReadability = demoMaterial
    ? materialReadability.find(item => item.source === `material:${demoMaterial.id}`)
    : null;
  const demoCanBeAudited = Boolean(demoReadability?.status === 'readable');
  const scoreFormation = baseAudit.scoreFormation.scoreStatus === 'ready' && !demoCanBeAudited
    ? {
      ...baseAudit.scoreFormation,
      scoreStatus: 'needs-materials',
      reason: '三分钟实操材料缺失、不可读或只能部分读取，补正前不形成总建议分。',
      totalGuidanceScore: null,
    }
    : baseAudit.scoreFormation;
  const informationRisks = [
    ...detectInformationRisks(JSON.stringify({ brief: state.brief, finals: state.finals }), 'state'),
    ...materialReadability.flatMap(item => item.informationRisks),
    ...evidenceReadability.flatMap(item => item.informationRisks),
  ];
  const allReadability = [...materialReadability, ...evidenceReadability];
  const readability = {
    materials: materialReadability,
    evidence: evidenceReadability,
    unreadableCount: allReadability.filter(item => item.status === 'unreadable').length,
    missingCount: allReadability.filter(item => item.status === 'missing').length,
    partialCount: allReadability.filter(item => item.status === 'partial').length,
  };
  const risks = [...baseAudit.risks];
  if (informationRisks.length > 0) {
    risks.push({ id: 'information-review-required', severity: 'medium', message: '材料中出现凭据、PII 或内部地址特征，仅提示人工复核，不自动定性违规。' });
  }
  if (readability.unreadableCount > 0 || readability.missingCount > 0 || readability.partialCount > 0) {
    risks.push({ id: 'readability-review-required', severity: 'medium', message: '部分材料或证据文件不可读、缺失或需人工确认。' });
  }
  if (baseAudit.scoreFormation.scoreStatus === 'ready' && !demoCanBeAudited) {
    risks.push({ id: 'demo-material-unreadable', severity: 'high', message: '实操演示材料无法完成可读性核验；补正前不形成总建议分。' });
  }
  const finals = {
    landing: {
      status: state.finals.landingEvidence.usagePeriod
        && state.finals.landingEvidence.users.length > 0
        && typeof state.finals.landingEvidence.useCount === 'number'
        && state.finals.landingEvidence.outputs.length > 0
        ? 'prepared'
        : 'needs-evidence',
      evidence: state.finals.landingEvidence,
    },
    qna: {
      status: 'pending-live-review',
      reason: state.finals.questions.length > 0 ? '已准备问题卡，但尚无答辩录屏、纪要或现场评委记录。' : '尚无现场问答材料。',
      questions: state.finals.questions,
    },
    rollout: {
      status: state.finals.rolloutPlan.targetRoles.length > 0
        && state.finals.rolloutPlan.milestones.length > 0
        && hasText(state.finals.rolloutPlan.owner)
        ? 'prepared'
        : 'needs-work',
      plan: state.finals.rolloutPlan,
    },
    aiOptimization: {
      status: state.finals.aiOptimization.versions.length > 0
        && hasText(state.finals.aiOptimization.evaluation)
        && state.finals.aiOptimization.iterations.length > 0
        ? 'prepared'
        : 'needs-work',
      optimization: state.finals.aiOptimization,
    },
  };
  return {
    ...baseAudit,
    totalGuidanceScore: scoreFormation.totalGuidanceScore,
    scoreFormation,
    risks,
    readability,
    informationRisks,
    finals,
    ruleMatrix: [
      ...baseAudit.ruleMatrix,
      { ruleId: 'file-readability', status: readability.unreadableCount + readability.missingCount + readability.partialCount === 0 ? 'pass' : 'needs-work', evidence: readability },
      { ruleId: 'information-processing-reminder', status: informationRisks.length === 0 ? 'pass' : 'needs-work', evidence: informationRisks },
      { ruleId: 'cost-consistency', status: baseAudit.effect.normalized.includesReviewAndRetry ? 'pass' : 'needs-work', evidence: baseAudit.consistency },
    ],
  };
}

function listLines(items, fallback = '待补充') {
  return items.length ? items.map(item => `- ${item}`).join('\n') : `- ${fallback}`;
}

function tableCell(value, fallback = '待补充') {
  const text = String(value ?? '').trim() || fallback;
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function evidenceBoundary(item) {
  if (item.status === 'verified' && ['E2', 'E3'].includes(item.level)) return '材料/数据支持';
  if (item.status === 'verified') return '参赛方自述或弱证据';
  if (item.status === 'rejected') return '矛盾/不支持，转人工复核';
  return item.status === 'collected' ? '已收集待核验' : '尚待确认';
}

function evidenceLocation(item) {
  return [item.sourcePath, item.location].filter(Boolean).join(' · ') || '待定位';
}

function scoreDisplay(value) {
  return typeof value === 'number' ? `${value}/100` : '未形成总建议分';
}

function moduleCapDisplay(cap) {
  return `${cap.id}: ${cap.maxScore} 分模块上限，${cap.reason}`;
}

function renderProposal(state, audit) {
  return [
    '# M01 作品说明',
    '',
    `作品名称：${state.brief.title || 'OpenPrism Office'}`,
    `适用场景：${state.brief.scenario || '待补充'}`,
    `目标用户：${state.brief.users || '待补充'}`,
    '',
    '## 核心文案任务',
    listLines(state.brief.writingTasks),
    '',
    '## 价值主张',
    state.brief.valueProposition || '待补充',
    '',
    '## 场景口径',
    `发生频率：${state.brief.frequency || state.effect.taskFrequency || '待补充'}`,
    `原流程：${state.brief.originalProcess || '待补充'}`,
    '',
    '## 痛点与交付标准',
    listLines(state.brief.painPoints),
    '',
    `交付标准：${state.brief.deliveryStandard || '待补充'}`,
    '',
    '## 依赖与约束',
    listLines(state.brief.dependencies, '待补充依赖'),
    '',
    listLines(state.brief.constraints, '待补充约束'),
    '',
    '## 人工审批边界',
    state.brief.humanApprovalRequired ? '所有 AI 生成文案必须经过人工确认后采纳；系统只提供草稿、证据审计和导出包。' : '风险：当前未开启人工审批边界。',
    '',
    '## 规则准备度',
    `当前为参赛准备度建议分：${scoreDisplay(audit.totalGuidanceScore)}，非官方裁决。`,
  ].join('\n');
}

function renderDemoScript(state) {
  return [
    '# M02 三分钟演示脚本',
    '',
    state.finals.demoScript || '1. 导入本地资料与成效记录。\n2. 生成证据约束的办公文案草稿。\n3. 查看审计风险，人工确认后导出提交材料包。',
    '',
    '## 操作清单',
    listLines(state.finals.operatorChecklist, '导入资料、运行审计、确认导出。'),
  ].join('\n');
}

function renderReuseStatement(state) {
  return [
    '# M03 复用声明',
    '',
    state.brief.reuseStatement || '本作品以本地项目、模板、SOP、提示词和审计清单组织办公文案流程，可在项目申报、技术汇报、评审材料等相近场景复用。',
    '',
    '## 复用资产',
    state.reusableAssets.length
      ? state.reusableAssets.map(item => [
        `- ${item.name} (${item.type})：${item.path || '待定位'}，状态：${item.status}`,
        `  - 目标岗位：${item.targetRoles.join('、') || '待补充'}`,
        `  - 学习成本：${typeof item.learningMinutes === 'number' ? `${item.learningMinutes} 分钟` : '待补充'}`,
        `  - 部署说明：${item.deploymentNotes || '待补充'}`,
        `  - 权限说明：${item.permissionNotes || '待补充'}`,
        `  - 维护负责人：${item.maintenanceOwner || '待补充'}`,
      ].join('\n')).join('\n')
      : '- 待补充模板、SOP、提示词或清单。',
  ].join('\n');
}

function renderSignificance(state) {
  return [
    '# M04 重大意义说明',
    '',
    state.brief.significance || '本作品把 AI 文案写作从通用聊天提升为“资料导入、证据定位、人工审批、审计导出”的办公闭环，降低材料返工和不可核验主张风险。',
  ].join('\n');
}

function renderEffectEvidence(state, audit) {
  const effect = audit.effect.normalized;
  return [
    '# M05 成效证据',
    '',
    `测量状态：${state.effect.measurementStatus}`,
    `计量单位：${state.effect.unit || '待补充'}`,
    `测量周期：${state.effect.period || '待补充'}`,
    `任务频率：${state.effect.taskFrequency || '待补充'}`,
    `覆盖人数：${state.effect.coveragePeople ?? '待补充'}`,
    `样本量：${state.effect.sampleSize ?? '待补充'}`,
    `人工基线分钟：${state.effect.baselineMinutes ?? '待补充'}`,
    `AI生成分钟：${state.effect.aiMinutes ?? '待补充'}`,
    `人工复核分钟：${state.effect.reviewMinutes ?? '待补充'}`,
    `返工分钟：${state.effect.retryMinutes ?? '待补充'}`,
    `部署/维护分钟：${[state.effect.setupMinutes, state.effect.maintenanceMinutes].filter(v => typeof v === 'number').reduce((s, v) => s + v, 0) || '待补充'}`,
    `净节省分钟：${effect.timeSavedMinutes ?? '待复算'}`,
    '',
    '## 证据索引',
    state.evidence.length
      ? state.evidence.map(item => `- [${item.level}/${item.status}] ${item.claim} — ${item.sourcePath || '待定位'} ${item.location || ''}`).join('\n')
      : '- 待补充可核验证据。',
    '',
    state.effect.qualityNotes || '',
    '',
    '## 计算说明',
    state.effect.calculationNotes || '待补充数据口径、纳入/排除项和计算假设。',
  ].join('\n');
}

function renderReuseAssets(state) {
  return [
    '# M06 复用资产与 SOP',
    '',
    state.reusableAssets.length
      ? state.reusableAssets.map(item => [
        `- ${item.name} (${item.type})：${item.path || '待定位'}，状态：${item.status}`,
        `  - 说明：${item.notes || '待补充'}`,
        `  - 目标岗位：${item.targetRoles.join('、') || '待补充'}`,
        `  - 学习分钟：${typeof item.learningMinutes === 'number' ? item.learningMinutes : '待补充'}`,
        `  - 部署说明：${item.deploymentNotes || '待补充'}`,
        `  - 权限说明：${item.permissionNotes || '待补充'}`,
        `  - 维护负责人：${item.maintenanceOwner || '待补充'}`,
      ].join('\n')).join('\n')
      : '- 待补充。',
  ].join('\n');
}

function renderReviewerGuide(state, audit) {
  const effect = audit.effect.normalized;
  const totalAiMinutes = [state.effect.aiMinutes, state.effect.reviewMinutes, state.effect.retryMinutes, state.effect.setupMinutes, state.effect.maintenanceMinutes]
    .filter(value => typeof value === 'number')
    .reduce((sum, value) => sum + value, 0);
  const effectEvidence = state.evidence.filter(item => /效|耗时|效率|质量|返工/.test(item.claim));
  const firstEvidenceLocation = state.evidence.map(evidenceLocation).find(location => location !== '待定位') || '待定位';
  const materialStatus = audit.materials.every(item => item.pass) ? '四项必交内容已登记' : '需补充必交内容';
  const riskStatus = audit.informationRisks?.length ? '材料处理提醒：需人工复核' : '无明显自动扫描提醒；仍需人工脱敏复核';
  const oneSentence = `作者面向${state.brief.users || '待明确岗位/部门'}的${state.brief.scenario || '办公文案问题'}，以${state.brief.valueProposition || '证据约束和人工审批'}重构材料写作流程，并沉淀${state.reusableAssets.map(item => item.name).filter(Boolean).join('、') || '待补充复用资产'}。`.slice(0, 100);
  const moduleNames = { efficiency: '提效成效', scenario: '场景价值', innovation: '方案创新性', portability: '可推广性' };
  const standardQuestions = [
    ['提效成效与数据核验', '基线、样本量、统计周期、复核与返工成本能否现场复算？'],
    ['真实落地度', '真实使用周期、岗位、次数和业务产出分别位于哪份材料？'],
    ['后续落地推进规划', '推广责任人、权限、成本、风险和持续衡量方式是什么？'],
    ['AI 适配与优化能力', 'Prompt、Skill、知识与流程做过哪些业务化迭代，效果如何评估？'],
  ];
  return [
    '# 评委说明',
    '',
    '本文件用于说明材料覆盖度、证据边界与风险。评分为系统按规则生成的准备度建议，不是官方裁决。',
    '',
    '## 1. 基本信息',
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    `| 作品名称 | ${tableCell(state.brief.title, 'OpenPrism Office')} |`,
    '| 申报赛道 | 办公场景 |',
    `| 团队及责任部门 | ${tableCell(state.brief.team)} |`,
    `| 材料完整性 | ${tableCell(materialStatus)} |`,
    `| 材料处理提醒 | ${tableCell(riskStatus)} |`,
    `| AI 初审建议分 | ${tableCell(scoreDisplay(audit.totalGuidanceScore))} |`,
    `| AI 评分置信度 | ${tableCell(audit.confidence)} |`,
    '',
    '## 2. 一句话说明',
    '',
    oneSentence,
    '',
    '## 3. 作者做了什么',
    '',
    '| 说明项 | AI 提炼内容 | 核心材料位置 |',
    '| --- | --- | --- |',
    `| 要解决的问题 | ${tableCell(state.brief.scenario)} | ${tableCell(firstEvidenceLocation)} |`,
    `| 原来的工作方式 | ${tableCell(state.brief.originalProcess)} | ${tableCell(firstEvidenceLocation)} |`,
    `| 作者完成的主要工作 | ${tableCell(state.brief.writingTasks.join('、'))} | ${tableCell(firstEvidenceLocation)} |`,
    `| AI 在流程中的作用 | ${tableCell(state.brief.valueProposition)} | ${tableCell(firstEvidenceLocation)} |`,
    `| 新的工作流程 | ${tableCell('Brief → 材料登记 → 证据定位 → AI 草拟/审查 → 人工确认 → 导出')} | 系统实现与演示材料 |`,
    `| 最终输出成果 | ${tableCell('办公文案、证据索引、成效记录、复用资产和 submission 交付包')} | submission/ |`,
    '',
    '## 4. 方案核心思想',
    '',
    `1. 核心机制：用项目内材料登记和证据索引约束办公文案；位置：${firstEvidenceLocation}。`,
    `2. AI 与人工分工：AI 提出草稿和风险建议，人工确认后采纳；位置：${firstEvidenceLocation}。`,
    `3. 业务定制点：${state.brief.valueProposition || '待补充业务定制说明'}；位置：${firstEvidenceLocation}。`,
    `4. 与普通 AI 用法的差异：保留证据等级、复算、规则上限和原子导出；位置：系统实现与演示材料。`,
    `5. 适用边界：${state.brief.constraints.join('；') || '所有对外内容需人工审批，未核验数据不得写成事实'}；位置：M01 与复用 SOP。`,
    '',
    '## 5. 收益与效果',
    '',
    '| 收益指标 | 使用前 | 使用后（含复核/返工/配置/维护） | 改善幅度 | 使用频率/覆盖人数 | 证据位置 | AI 核验结论 |',
    '| --- | ---: | ---: | ---: | --- | --- | --- |',
    `| 耗时 | ${tableCell(state.effect.baselineMinutes)} | ${effect.measured ? tableCell(totalAiMinutes) : '数据不完整'} | ${tableCell(effect.timeSavedMinutes, '未量化')} | ${tableCell(`${state.effect.taskFrequency || state.brief.frequency || '待补充'} / ${state.effect.coveragePeople ?? '待补充'} 人`)} | ${tableCell(effectEvidence.map(evidenceLocation).join('；'))} | ${tableCell(effect.measured ? (effectEvidence.some(item => item.status === 'verified') ? '部分/数据支持，仍需人工核验' : '参赛方自述，待核验') : '数据不完整')} |`,
    '| 产出量 | 未量化 | 未量化 | 未量化 | 待补充 | 待定位 | 尚待确认 |',
    `| 错误率/返工率 | ${tableCell(state.effect.qualityNotes, '未量化')} | ${tableCell(state.effect.qualityNotes, '未量化')} | 未量化 | ${tableCell(state.effect.period)} | ${tableCell(effectEvidence.map(evidenceLocation).join('；'))} | 尚待人工确认 |`,
    '',
    '### AI 提效分析',
    '',
    `- 分析路径：${audit.modules.efficiency.analysisPath.join(' → ')}。`,
    `- 判断前提：${audit.modules.efficiency.assumptions.join('；') || '待补充任务口径、周期和单位'}。`,
    `- 可能偏差：${audit.modules.efficiency.possibleBias.join('；') || '暂无自动识别偏差；仍需人工核对原始材料'}。`,
    `- 全成本复算：${JSON.stringify(audit.effect.normalized)}。`,
    '- 缺失值保持“未量化/数据不完整”，不会补写成已验证精确值。',
    '',
    '## 6. 材料导航与证据索引',
    '',
    '| 证据编号 | 评委需要核验的结论 | 材料名称/路径 | 精确位置 | 证据内容或备注 | 证据等级 | 边界 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...(state.evidence.length ? state.evidence.map(item => `| ${tableCell(item.id)} | ${tableCell(item.claim)} | ${tableCell(item.sourcePath)} | ${tableCell(item.location)} | ${tableCell(item.notes)} | ${tableCell(item.level)} | ${tableCell(evidenceBoundary(item))} |`) : ['| E-待补 | 待补充关键结论 | 待定位 | 待定位 | 无证据 | E0 | 尚待确认 |']),
    '',
    '## 7. 各材料内容摘要',
    '',
    '| 材料 | 主要内容 | 对评审最有价值的部分 | 具体位置 | 缺失或矛盾 |',
    '| --- | --- | --- | --- | --- |',
    ...state.materials.map(item => `| ${tableCell(item.name, item.type)} | ${tableCell(item.notes, item.type)} | ${tableCell(item.status)} | ${tableCell(item.path)} | ${item.status === 'missing' ? '缺失' : '需对照原件核验'} |`),
    ...(state.materials.length ? [] : ['| 待补材料 | 待补充 | 待补充 | 待定位 | 缺失 |']),
    '',
    '## 8. AI 评分摘要',
    '',
    '| 评分模块 | 满分 | AI 建议分 | 所在分档 | 核心依据 | 主要扣分原因 | 证据位置 | 置信度 |',
    '| --- | ---: | ---: | --- | --- | --- | --- | --- |',
    ...Object.entries(audit.modules).map(([key, module]) => `| ${moduleNames[key]} | ${module.max} | ${module.score} | ${tableCell(module.band)} | ${tableCell(module.reasons.join('；'))} | ${tableCell(module.deductions.filter(Boolean).join('；'), '无')} | ${tableCell(module.evidenceLocations.map(item => `${item.path || item.id}${item.location ? `#${item.location}` : ''}`).join('；'))} | ${module.confidence} |`),
    `| **AI 总分** | **100** | **${scoreDisplay(audit.totalGuidanceScore)}** | ${tableCell(audit.scoreFormation.scoreStatus)} | ${tableCell(audit.scoreFormation.reason)} | ${tableCell(audit.caps.map(moduleCapDisplay).join('；'), '未触发特殊上限')} | 见上表 | ${audit.confidence} |`,
    '',
    '## 9. 风险、缺口和建议追问',
    '',
    '| 类型 | 具体问题 | 涉及材料位置 | 对评分的影响 | 建议评委核验方式 |',
    '| --- | --- | --- | --- | --- |',
    ...(audit.risks.length ? audit.risks.map(risk => `| ${tableCell(risk.id)} | ${tableCell(risk.message)} | ${tableCell(risk.location)} | 按对应模块和置信度处理 | 对照原材料并人工确认 |`) : ['| 一般复核 | 自动审核未发现明确阻断项 | 全部材料 | 原则上不自动扣分 | 仍需评委抽查 |']),
    '',
    '### 决赛建议追问',
    '',
    ...standardQuestions.map(([direction, question], index) => `- **${direction}**：${state.finals.questions[index] || question}`),
  ].join('\n');
}

function renderInitialScoreGuide(audit) {
  return [
    '# 初赛评分表准备度',
    '',
    '| 模块 | 建议分 | 证据 |',
    '| --- | ---: | --- |',
    ...Object.entries(audit.modules).map(([key, module]) => `| ${key} | ${module.score}/${module.max} | ${module.checks.filter(check => check.pass).length}/${module.checks.length} checks |`),
    '',
    '说明：此表用于自查，不替代比赛评委评分。',
  ].join('\n');
}

function renderBlankScoreSheet() {
  return [
    '# 空白初赛评分表',
    '',
    '| 模块 | 满分 | AI 建议分 | 评委评分 | 主要扣分原因 |',
    '| --- | ---: | ---: | ---: | --- |',
    '| 提效成效 | 30 |  |  |  |',
    '| 场景价值 | 30 |  |  |  |',
    '| 方案创新性 | 20 |  |  |  |',
    '| 可推广性 | 20 |  |  |  |',
    '| 合计 | 100 |  |  |  |',
    '',
    '## 决赛待提问问题',
    '',
    '| 提问方向 | 需要作者回答的问题 |',
    '| --- | --- |',
    '| 提效成效与数据核验 |  |',
    '| 真实落地度 |  |',
    '| 后续落地推进规划 |  |',
    '| AI 适配与优化能力 |  |',
  ].join('\n');
}

function renderFinalsScoreGuide(audit) {
  return [
    '# 决赛四项准备度',
    '',
    '| 项目 | 满分 | 准备状态 | 证据 |',
    '| --- | ---: | --- | --- |',
    `| 真实落地度 | 5 | ${audit.finals?.landing?.status || 'needs-work'} | 使用周期/用户/次数/业务产出/反馈证据 |`,
    `| 问题应答成熟度 | 5 | ${audit.finals?.qna?.status || 'pending-live-review'} | 问答卡与回答边界；缺失时等待现场问答复核 |`,
    `| 后续落地推进 | 5 | ${audit.finals?.rollout?.status || 'needs-work'} | 岗位、里程碑、责任、成本与风险 |`,
    `| AI 适配与优化 | 5 | ${audit.finals?.aiOptimization?.status || 'needs-work'} | Prompt/Skill/流程版本与迭代记录 |`,
  ].join('\n');
}

function renderFinalsPack(state) {
  return [
    '# 决赛准备与问答',
    '',
    '## 演示脚本',
    state.finals.demoScript || '待补充。',
    '',
    '## 可能问答',
    listLines(state.finals.questions, '如何证明效率提升、如何防止幻觉、如何复用到其他办公场景。'),
    '',
    '## 操作清单',
    listLines(state.finals.operatorChecklist, '准备本地资料、运行审计、导出材料包。'),
    '',
    '## 落地证据',
    `使用周期：${state.finals.landingEvidence.usagePeriod || '待补充'}`,
    `使用用户：${state.finals.landingEvidence.users.join('、') || '待补充'}`,
    `使用次数：${state.finals.landingEvidence.useCount ?? '待补充'}`,
    '',
    '业务产出：',
    listLines(state.finals.landingEvidence.outputs),
    '',
    '反馈：',
    listLines(state.finals.landingEvidence.feedback),
    '',
    '## 后续落地推进',
    `目标岗位：${state.finals.rolloutPlan.targetRoles.join('、') || '待补充'}`,
    `负责人：${state.finals.rolloutPlan.owner || '待补充'}`,
    `成本：${state.finals.rolloutPlan.costs || '待补充'}`,
    '',
    '里程碑：',
    listLines(state.finals.rolloutPlan.milestones),
    '',
    '资源：',
    listLines(state.finals.rolloutPlan.resources),
    '',
    '风险：',
    listLines(state.finals.rolloutPlan.risks),
    '',
    '指标：',
    listLines(state.finals.rolloutPlan.metrics),
    '',
    '## AI 适配与优化',
    `版本：${state.finals.aiOptimization.versions.join('、') || '待补充'}`,
    `评估方法：${state.finals.aiOptimization.evaluation || '待补充'}`,
    '',
    '迭代记录：',
    listLines(state.finals.aiOptimization.iterations),
  ].join('\n');
}

function render90PlusReadinessPack(state, audit) {
  return [
    '# 90+ 提交准备总包',
    '',
    '本文件用于把作品材料整理到高分提交状态。它不是获奖或官方 90 分承诺；只有真实演示、真实业务样本和人工复核记录补齐后，才具备冲击 90+ 的证据基础。',
    '',
    '## 交付目标',
    '',
    '| 目标 | 当前系统可证明 | 需要参赛方补充的真实证据 |',
    '| --- | --- | --- |',
    `| 提效成效 26+/30 | 六阶段流程、全成本复算、缺口提示；当前建议状态：${audit.scoreFormation.scoreStatus} | 至少一组同口径基线/AI/复核/返工/维护数据，样本、周期和原始记录可追溯 |`,
    '| 场景价值 26+/30 | Brief、用户、频率、原流程、痛点和交付标准字段 | 真实部门/岗位/任务频率，脱敏业务样例或使用记录 |',
    '| 创新性 17+/20 | 证据索引、规则审核、人工审批、manifest、六阶段工作台 | 迭代记录、Prompt/Skill 版本、失败态和人工修订记录 |',
    '| 可推广性 18+/20 | 模板、SOP、复用资产、权限和维护字段 | 复用试点、培训记录、部署成本、目标岗位反馈 |',
    '',
    '## 90+ 门禁',
    '',
    '| 门禁 | 通过标准 | 当前状态 |',
    '| --- | --- | --- |',
    `| 四项必交材料 | M01-M04 均可读取且内容定位明确 | ${audit.materials.every(item => item.pass) ? '通过' : '待补'} |`,
    `| 3 分钟实操 | 连续录屏不超过 3 分钟，展示收件、处理、审阅、审批、度量、交付和失败态 | ${audit.scoreFormation.scoreStatus === 'ready' ? '可形成建议分' : '待补演示或材料'} |`,
    `| E3/E2 成效证据 | 至少有原始测量表、日志、录屏或真实业务记录 | ${state.evidence.some(item => item.status === 'verified' && item.level === 'E3') ? '有 E3' : '待补 E3'} |`,
    `| 全成本复算 | AI 时间包含生成、复核、返工、配置、维护 | ${audit.effect.normalized.includesReviewAndRetry ? '通过' : '待补成本项'} |`,
    `| 风险可解释 | 所有敏感信息、材料缺失、矛盾数据均有处理说明 | ${audit.risks.length ? '需处理风险' : '自动审核无阻断'} |`,
    '',
    '## 提交包排序建议',
    '',
    '1. M01 作品说明：先讲真实办公痛点、原流程和新流程。',
    '2. M02 演示视频：用 3 分钟连续操作证明系统跑通和诚实失败态。',
    '3. M05 成效证据：把基线、AI、复核、返工、配置、维护和样本量放在同一张表。',
    '4. reviewer-guide：让评委快速定位证据、扣分项和人工复核点。',
    '5. 90plus-score-evidence-matrix：按 30/30/20/20 对齐证据强度。',
    '6. data-compliance-checklist：提交前脱敏和权限说明。',
    '',
    '## 不得写入的内容',
    '',
    '- 不写未经测量的百分比。',
    '- 不把演示数据写成真实业务落地。',
    '- 不把准备建议分写成官方评分。',
    '- 不隐藏人工复核、返工、配置和维护成本。',
  ].join('\n');
}

function render90PlusScoreEvidenceMatrix(state, audit) {
  const rows = [
    ['提效成效', 30, '26-30', '同类任务前后对比，全成本净节省，质量不下降，高频或持续使用', 'M02、M05、原始日志、submission-manifest.json'],
    ['场景价值', 30, '26-30', '真实高频办公痛点，影响多个岗位或稳定部门流程', 'M01、M04、脱敏业务样例、使用记录'],
    ['方案创新性', 20, '17-20', '证据约束、规则审核、人工审批、流程编排、迭代记录，不是普通问答', 'M01、M02、Prompt/Skill、审阅/审批日志'],
    ['可推广性', 20, '18-20', '模板、SOP、权限、成本、维护、培训和复用边界清楚', 'M03、M06、reuse/SOP、培训/反馈记录'],
  ];
  return [
    '# 90+ 评分证据矩阵',
    '',
    `当前准备建议分：${scoreDisplay(audit.totalGuidanceScore)}；状态：${audit.scoreFormation.scoreStatus}；置信度：${audit.confidence}。`,
    '',
    '| 模块 | 满分 | 90+ 目标档 | 必须证明 | 推荐证据位置 | 当前系统建议 | 缺口 |',
    '| --- | ---: | --- | --- | --- | ---: | --- |',
    ...rows.map(([name, max, band, proof, location]) => {
      const key = name === '提效成效' ? 'efficiency' : name === '场景价值' ? 'scenario' : name === '方案创新性' ? 'innovation' : 'portability';
      const module = audit.modules[key];
      return `| ${name} | ${max} | ${band} | ${proof} | ${location} | ${module.score}/${module.max} | ${tableCell(module.deductions.join('；'), '待补真实证据后复核')} |`;
    }),
    '',
    '## 已登记证据',
    '',
    state.evidence.length
      ? state.evidence.map(item => `- ${item.id}: ${item.claim}，${item.level}/${item.status}，${evidenceLocation(item)}，边界：${evidenceBoundary(item)}`).join('\n')
      : '- 尚无已登记证据；请先补 M02 演示、M05 成效表和原始日志。',
  ].join('\n');
}

function renderDemoEvidencePlan(state) {
  return [
    '# M02 演示取证计划',
    '',
    '目标：用不超过 3 分钟的连续浏览器录屏证明作品真实可运行，并主动展示“缺证据不形成总建议分”的诚实边界。',
    '',
    '| 时间 | 画面 | 评委看到的证据 | 讲稿要点 |',
    '| --- | --- | --- | --- |',
    '| 00:00-00:20 | 项目与交付面板 | 作品名称、办公场景、六阶段导航 | OpenPrism Office 是可核验办公材料工作台 |',
    '| 00:20-00:45 | 收件 | 导入脱敏材料，状态 ready | 资料进入项目内账本，不散落在聊天窗口 |',
    '| 00:45-01:10 | 处理 | 配方、运行状态、OfficeCLI unavailable/blocked 态 | 外部能力缺失时如实阻断，不伪造结果 |',
    '| 01:10-01:40 | 审阅 | 检索分数、证据图、评论和建议 | AI 草稿必须回到证据和人工意见 |',
    '| 01:40-02:00 | 审批 | approved/published 本地状态 | 对外交付前保留人工批准记录 |',
    '| 02:00-02:25 | 度量 | baseline/AI/review/retry/setup/maintenance | 提效按全成本复算，不只算生成时间 |',
    '| 02:25-02:50 | 交付 | audit、M01-M06、manifest | 提交包可回查文件和哈希 |',
    '| 02:50-03:00 | 风险态 | 待补材料/未形成总建议分 | 缺少真实证据不会写成高分结论 |',
    '',
    '## 录制输出',
    '',
    '- 原始录屏：`docs/competition/submission_90plus/evidence/demo/office-demo.webm`。',
    '- 截图：同目录 `*.png`，命名包含步骤序号。',
    '- 时间戳清单：同目录 `timestamps.md`。',
    '- 演示数据必须标注为受控演示，不得作为真实业务提效证据。',
    '',
    '## 当前脚本口径',
    '',
    state.finals.demoScript || '导入资料；检索证据；审阅建议；人工批准；记录度量；导出提交包；展示待补风险。',
  ].join('\n');
}

function renderPilotMeasurementRegister() {
  return [
    'sample_id,task_date,task_type,baseline_minutes,ai_minutes,review_minutes,retry_minutes,setup_minutes,maintenance_minutes,output_count,accepted_count,rejected_count,quality_result,evidence_path,reviewer,notes,status',
    'PILOT-001,,,,,,,,,,,,,,,"填写真实 reviewer",待补真实业务数据,planned',
    'PILOT-002,,,,,,,,,,,,,,,"填写真实 reviewer",待补真实业务数据,planned',
  ].join('\n');
}

function renderReviewerQna(state, audit) {
  const defaultQuestions = [
    ['如何证明不是普通 AI 写作？', '请展示证据索引、审阅建议、人工审批、规则审核、manifest 和缺证据失败态；普通聊天工具通常没有这条可核验链路。'],
    ['提效比例如何计算？', '使用 M05 和 pilot-measurement-register.csv，公式为基线耗时减去 AI、人工复核、返工、配置和维护的合计耗时；缺项时不写精确比例。'],
    ['如何防止幻觉？', '关键结论必须绑定证据编号、来源路径、精确位置和 E0-E3 等级；E0 或未核验内容不得进入正式结论。'],
    ['如何推广到其他部门？', '复用模板、SOP、Skill、权限说明、培训时长和维护负责人；推广前替换本部门资料库和指标口径。'],
    ['现在能否保证 90 分以上？', '不能保证官方评分。当前系统能补齐材料结构和取证链路，90+ 取决于真实业务证据、样本和评委判断。'],
  ];
  const userQuestions = state.finals.questions.map(question => [question, '按材料证据回答；没有证据时明确说明待补充或需人工复核。']);
  return [
    '# 评委问答准备稿',
    '',
    `当前建议状态：${audit.scoreFormation.scoreStatus}；总建议分：${scoreDisplay(audit.totalGuidanceScore)}。以下回答仅用于答辩准备，不替代现场评委判断。`,
    '',
    '| 问题 | 建议回答 | 证据位置 |',
    '| --- | --- | --- |',
    ...[...defaultQuestions, ...userQuestions].map(([question, answer]) => `| ${tableCell(question)} | ${tableCell(answer)} | M01-M06、reviewer-guide、90plus-score-evidence-matrix |`),
  ].join('\n');
}

function renderDataComplianceChecklist(audit) {
  return [
    '# 数据合规与脱敏清单',
    '',
    '提交前逐项人工确认。系统只能做材料处理提醒，不能替代组织合规审核。',
    '',
    '| 检查项 | 通过标准 | 证据/处理记录 | 状态 |',
    '| --- | --- | --- | --- |',
    '| Token/API Key/密码/私钥 | 录屏、截图、日志、配置文件中不可见 | 待填写 | 待核 |',
    '| 个人信息 | 姓名、手机号、邮箱、身份证等已脱敏或获授权 | 待填写 | 待核 |',
    '| 客户和商业敏感信息 | 客户名、合同、报价、财务、生产地址已处理 | 待填写 | 待核 |',
    '| 内部路径和地址 | 本机路径、内网 URL、未授权截图不外流 | 待填写 | 待核 |',
    '| 外部 AI 工具使用 | 使用范围、数据边界、审批记录可说明 | 待填写 | 待核 |',
    '| 演示数据标识 | 受控演示数据和真实业务数据明确区分 | 待填写 | 待核 |',
    '',
    '## 自动扫描提醒',
    '',
    audit.informationRisks?.length
      ? audit.informationRisks.map(item => `- ${item.severity || 'risk'}：${item.message || JSON.stringify(item)}`).join('\n')
      : '- 当前自动扫描无明显提醒；仍需人工检查录屏和附件。',
  ].join('\n');
}

export async function exportOfficeTrackPackage(projectRoot, inputState) {
  const state = inputState || await loadOfficeTrackState(projectRoot);
  const audit = await auditOfficeTrackProject(projectRoot, state);
  const files = [];
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/M01-proposal.md`, renderProposal(state, audit)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/M02-demo-script.md`, renderDemoScript(state)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/M03-reuse-statement.md`, renderReuseStatement(state)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/M04-significance.md`, renderSignificance(state)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/M05-effect-evidence.md`, renderEffectEvidence(state, audit)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/M06-reuse-assets.md`, renderReuseAssets(state)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/reviewer-guide.md`, renderReviewerGuide(state, audit)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/initial-score-guide.md`, renderInitialScoreGuide(audit)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/blank-initial-score-sheet.md`, renderBlankScoreSheet()));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/finals-pack.md`, renderFinalsPack(state)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/finals-score-guide.md`, renderFinalsScoreGuide(audit)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/90plus-readiness-pack.md`, render90PlusReadinessPack(state, audit)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/90plus-score-evidence-matrix.md`, render90PlusScoreEvidenceMatrix(state, audit)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/demo-evidence-plan.md`, renderDemoEvidencePlan(state)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/pilot-measurement-register.csv`, renderPilotMeasurementRegister()));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/reviewer-qna.md`, renderReviewerQna(state, audit)));
  files.push(await writeText(projectRoot, `${SUBMISSION_DIR}/data-compliance-checklist.md`, renderDataComplianceChecklist(audit)));

  const manifest = {
    version: 1,
    ruleVersion: 'AI材料审核与评分规则@2026-08-27',
    generatedAt: state.updatedAt || new Date().toISOString(),
    officialJudgement: false,
    directory: SUBMISSION_DIR,
    files,
    unresolvedGaps: audit.risks.map(risk => ({ id: risk.id, severity: risk.severity, message: risk.message })),
    audit: {
      totalGuidanceScore: audit.totalGuidanceScore,
      scoreStatus: audit.scoreFormation.scoreStatus,
      confidence: audit.confidence,
      caps: audit.caps,
      risks: audit.risks,
    },
  };
  await atomicWriteJson(safeJoin(projectRoot, `${SUBMISSION_DIR}/submission-manifest.json`), manifest);
  const manifestHash = crypto.createHash('sha256')
    .update(await fs.readFile(safeJoin(projectRoot, `${SUBMISSION_DIR}/submission-manifest.json`)))
    .digest('hex');
  files.push({ path: `${SUBMISSION_DIR}/submission-manifest.json`, sha256: manifestHash });
  return { directory: SUBMISSION_DIR, files, manifest };
}
