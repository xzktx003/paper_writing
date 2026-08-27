import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

import {
  auditOfficeTrackProject,
  auditOfficeTrack,
  exportOfficeTrackPackage,
  loadOfficeTrackState,
  saveOfficeTrackState,
} from '../officeTrackService.js';

test('office track state loads defaults and rejects unsafe saved input', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-track-state-'));
  try {
    const state = await loadOfficeTrackState(projectRoot);
    assert.equal(state.version, 1);
    assert.equal(state.brief.humanApprovalRequired, true);
    assert.deepEqual(state.materials, []);
    assert.deepEqual(state.evidence, []);
    assert.equal(state.effect.measurementStatus, 'not-started');
    assert.deepEqual(state.brief.painPoints, []);
    assert.equal(state.effect.coveragePeople, null);
    assert.deepEqual(state.finals.landingEvidence.outputs, []);

    const saved = await saveOfficeTrackState(projectRoot, { brief: { title: 'Stable read' } });
    const firstRead = await loadOfficeTrackState(projectRoot);
    const secondRead = await loadOfficeTrackState(projectRoot);
    assert.equal(firstRead.updatedAt, saved.updatedAt);
    assert.equal(secondRead.updatedAt, saved.updatedAt);

    await assert.rejects(
      saveOfficeTrackState(projectRoot, { unexpected: true }),
      /Unsupported office track field/,
    );
    await assert.rejects(
      saveOfficeTrackState(projectRoot, { materials: [{ id: 'm1', name: 'bad', type: 'proposal', path: '../secret.md' }] }),
      /relative path/,
    );
    await assert.rejects(
      saveOfficeTrackState(projectRoot, { materials: [{ id: 'm1', name: 'bad', type: 'proposal', path: 'submission/M01-proposal.md' }] }),
      /generated submission file/,
    );
    await assert.rejects(
      saveOfficeTrackState(projectRoot, { effect: { baselineMinutes: Number.POSITIVE_INFINITY } }),
      /finite number/,
    );
    await assert.rejects(
      saveOfficeTrackState(projectRoot, { finals: { rolloutPlan: { unknown: true } } }),
      /Unsupported office track field/,
    );
    await assert.rejects(
      saveOfficeTrackState(projectRoot, { brief: { humanApprovalRequired: 'false' } }),
      /boolean/,
    );
    await assert.rejects(
      saveOfficeTrackState(projectRoot, { effect: { sampleSize: 1.5 } }),
      /integer/,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('office track audit scores evidence-backed writing readiness without claiming official results', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-track-audit-'));
  try {
    const saved = await saveOfficeTrackState(projectRoot, {
      brief: {
        title: 'OpenPrism Office',
        scenario: '科研项目申报材料写作',
        users: '科研管理人员、技术负责人、项目申报撰写者',
        writingTasks: ['申报书', '演示讲稿', '复用声明', '成效说明'],
        valueProposition: '用本地证据库生成可核验文案，人工确认后再采纳。',
        frequency: '每周多次',
        originalProcess: '人工阅读资料、整理摘要、撰写初稿、主管复核。',
        painPoints: ['资料分散', '返工频繁'],
        deliveryStandard: '所有对外主张必须可定位到证据并经人工审批。',
        dependencies: ['本地资料库'],
        constraints: ['不自动对外发布'],
      },
      materials: [
        { id: 'm1', name: '作品说明', type: 'proposal', path: 'sources/proposal.md', status: 'draft' },
        { id: 'm2', name: '三分钟演示', type: 'demo-video-script', path: 'sources/demo.md', status: 'ready' },
        { id: 'm3', name: '复用声明', type: 'reuse-statement', path: 'sources/reuse.md', status: 'draft' },
        { id: 'm4', name: '重大意义', type: 'significance', path: 'sources/significance.md', status: 'draft' },
      ],
      evidence: [
        { id: 'e1', claim: '减少初稿整理时间', sourcePath: 'evidence/effect.csv', location: 'A2:D4', level: 'E2', status: 'verified' },
        { id: 'e2', claim: '人工审批后采纳', sourcePath: 'evidence/review-log.md', location: 'L8', level: 'E1', status: 'verified' },
      ],
      effect: {
        baselineMinutes: 120,
        aiMinutes: 45,
        reviewMinutes: 20,
        retryMinutes: 10,
        setupMinutes: 30,
        maintenanceMinutes: 5,
        sampleSize: 6,
        measurementStatus: 'measured',
        unit: '每份申报材料',
        period: '2026-08',
        taskFrequency: '每周 3 次',
        coveragePeople: 5,
        calculationNotes: 'AI、复核、返工、配置和维护成本全部纳入。',
      },
      reusableAssets: [
        { id: 'a1', name: '办公赛道申报模板', type: 'template', path: 'templates/office-competition/main.md', status: 'ready', targetRoles: ['科研秘书'], learningMinutes: 15, deploymentNotes: '复制模板后替换项目资料。', permissionNotes: '仅使用项目内资料。', maintenanceOwner: 'PMO' },
      ],
      finals: {
        demoScript: '3分钟演示：导入资料、生成证据化文案、审计导出。',
        questions: ['如何防止幻觉？'],
        operatorChecklist: ['确认本地资料已导入', '确认人工审批开关开启'],
        landingEvidence: { usagePeriod: '2026-08', users: ['科研秘书'], useCount: 8, outputs: ['申报书初稿'], feedback: ['减少返工'] },
        rolloutPlan: { targetRoles: ['科研秘书'], milestones: ['试点', '推广'], owner: 'PMO', resources: ['模板库'], costs: '每人培训 15 分钟', risks: ['资料缺失'], metrics: ['返工次数'] },
        aiOptimization: { versions: ['prompt-v1'], evaluation: '人工抽查证据定位准确性。', iterations: ['补充证据缺口提示'] },
      },
    });

    const audit = auditOfficeTrack(saved);
    assert.equal(audit.officialJudgement, false);
    assert.equal(audit.effect.normalized.timeSavedMinutes, 10);
    assert.equal(audit.effect.normalized.includesReviewAndRetry, true);
    assert.equal(audit.scoreFormation.scoreStatus, 'ready');
    assert.equal(typeof audit.totalGuidanceScore, 'number');
    assert.ok(audit.modules.efficiency.score > 0);
    assert.ok(Array.isArray(audit.modules.efficiency.reasons));
    assert.ok(Array.isArray(audit.modules.efficiency.deductions));
    assert.ok(Array.isArray(audit.modules.efficiency.evidenceLocations));
    assert.ok(Array.isArray(audit.modules.efficiency.analysisPath));
    assert.ok(Array.isArray(audit.modules.efficiency.assumptions));
    assert.ok(Array.isArray(audit.modules.efficiency.possibleBias));
    assert.ok(audit.modules.scenario.score > 0);
    assert.ok(audit.modules.innovation.score > 0);
    assert.ok(audit.modules.portability.score > 0);
    assert.ok(audit.ruleMatrix.some(item => item.ruleId === 'initial-required-materials' && item.status === 'pass'));
    assert.ok(audit.risks.every(risk => !risk.message.includes('官方')));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('office track audit applies precise score formation gates and module caps', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-track-gates-'));
  try {
    const state = await saveOfficeTrackState(projectRoot, {
      brief: {
        scenario: '个人一次性低频材料，直接套公开模板，无业务定制。',
        users: '个人',
        writingTasks: ['汇报稿', '邮件'],
        valueProposition: '仅创意方案，尚无真实操作。',
        frequency: '个人一次性',
        originalProcess: '',
        deliveryStandard: '',
      },
      materials: [
        { id: 'm1', name: '作品说明', type: 'proposal', path: 'sources/proposal.md', status: 'draft' },
        { id: 'm2', name: '三分钟演示', type: 'demo-video-script', path: 'sources/demo.md', status: 'draft' },
        { id: 'm3', name: '复用声明', type: 'reuse-statement', path: 'sources/reuse.md', status: 'draft' },
        { id: 'm4', name: '重大意义', type: 'significance', path: 'sources/significance.md', status: 'draft' },
      ],
      effect: { measurementStatus: 'not-started' },
      reusableAssets: [],
    });

    const audit = auditOfficeTrack(state);
    assert.equal(audit.scoreFormation.scoreStatus, 'needs-materials');
    assert.equal(audit.totalGuidanceScore, null);
    assert.equal(audit.moduleCaps.efficiency.maxScore, 8);
    assert.equal(audit.modules.efficiency.score <= 8, true);
    assert.equal(audit.moduleCaps.scenario.maxScore, 15);
    assert.equal(audit.modules.scenario.score <= 15, true);
    assert.equal(audit.moduleCaps.innovation.maxScore, 8);
    assert.equal(audit.modules.innovation.score <= 8, true);
    assert.equal(audit.moduleCaps.portability.maxScore, 8);
    assert.equal(audit.modules.portability.score <= 8, true);
    assert.ok(audit.risks.some(risk => risk.id === 'incomplete-quantitative-data'));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('office track audit does not cap incomplete quantitative data when a real demo is registered', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-track-no-uniform-cap-'));
  try {
    const state = await saveOfficeTrackState(projectRoot, {
      brief: {
        scenario: '部门月度材料撰写',
        users: '技术管理部',
        writingTasks: ['申报书', '汇报稿'],
        frequency: '每月',
        originalProcess: '人工检索、摘录、起草和复核。',
        deliveryStandard: '相同质量标准，人工终审。',
      },
      materials: [{ id: 'm2', name: '真实演示', type: 'demo-video-script', path: 'demo.md', status: 'ready' }],
      effect: { measurementStatus: 'designed' },
    });
    const audit = auditOfficeTrack(state);
    assert.equal(audit.scoreFormation.scoreStatus, 'ready');
    assert.equal(audit.moduleCaps.efficiency, null);
    assert.ok(audit.risks.some(risk => risk.id === 'incomplete-quantitative-data'));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('office track audit preserves negative effect and prevents a positive efficiency score', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-track-negative-effect-'));
  try {
    const state = await saveOfficeTrackState(projectRoot, {
      brief: {
        scenario: '部门材料撰写',
        users: '项目团队',
        writingTasks: ['申报书', '复盘'],
        frequency: '每周',
        originalProcess: '人工写作。',
        deliveryStandard: '前后质量标准一致。',
      },
      materials: [{ id: 'm2', name: '演示', type: 'demo-video-script', path: 'demo.md', status: 'ready' }],
      evidence: [{ id: 'e1', claim: '耗时记录', sourcePath: 'effect.md', location: 'L1', level: 'E2', status: 'verified' }],
      effect: { baselineMinutes: 30, aiMinutes: 25, reviewMinutes: 10, retryMinutes: 5, setupMinutes: 5, maintenanceMinutes: 1, sampleSize: 3, measurementStatus: 'measured' },
    });
    const audit = auditOfficeTrack(state);
    assert.equal(audit.effect.normalized.timeSavedMinutes, -16);
    assert.equal(audit.moduleCaps.efficiency.id, 'measured-no-improvement');
    assert.equal(audit.modules.efficiency.score, 0);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('office track audit sends inconsistent effect data to manual review and keeps finals qna pending live review', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-track-manual-review-'));
  try {
    const state = await saveOfficeTrackState(projectRoot, {
      brief: {
        scenario: '部门周报写作',
        users: '运营团队',
        writingTasks: ['周报', '复盘'],
        frequency: '每周',
      },
      materials: [
        { id: 'm1', name: '作品说明', type: 'proposal', path: 'sources/proposal.md', status: 'draft' },
        { id: 'm2', name: '三分钟演示', type: 'demo-video-script', path: 'sources/demo.md', status: 'ready' },
        { id: 'm3', name: '复用声明', type: 'reuse-statement', path: 'sources/reuse.md', status: 'draft' },
        { id: 'm4', name: '重大意义', type: 'significance', path: 'sources/significance.md', status: 'draft' },
      ],
      evidence: [
        { id: 'e1', claim: '效率提升', sourcePath: 'missing/effect.md', location: 'L1', level: 'E1', status: 'verified' },
        { id: 'e2', claim: '另一材料给出冲突数据', sourcePath: 'missing/conflict.md', location: 'L2', level: 'E0', status: 'rejected', notes: '与效果表口径矛盾' },
      ],
      effect: { baselineMinutes: 60, aiMinutes: 20, reviewMinutes: 10, retryMinutes: 5, sampleSize: 3, measurementStatus: 'measured' },
      reusableAssets: [{ id: 'a1', name: 'SOP', type: 'sop', path: 'docs/sop.md', status: 'ready', targetRoles: ['运营'], learningMinutes: 10 }],
      finals: { questions: ['基线如何采集？'] },
    });

    const audit = await auditOfficeTrackProject(projectRoot, state);
    assert.ok(audit.consistency.contradictions.some(item => item.action === 'manual-review'));
    assert.ok(audit.consistency.contradictions.some(item => item.id === 'rejected-evidence-e2'));
    assert.ok(audit.modules.efficiency.deductions.some(item => item.includes('不采信')));
    assert.equal(audit.modules.efficiency.confidence, 'low');
    assert.equal(audit.finals.qna.status, 'pending-live-review');
    assert.equal(audit.totalGuidanceScore, null);
    assert.equal(audit.scoreFormation.scoreStatus, 'needs-materials');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('office track project audit locates common credential, privacy, and sensitive-business reminders without duplicating them', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-track-risk-scan-'));
  try {
    await writeFile(path.join(projectRoot, 'risk.md'), [
      '联系人 reviewer@example.com',
      'password = demo-secret-value',
      '-----BEGIN PRIVATE KEY-----',
      '客户合同报价与生产数据',
    ].join('\n'));
    const state = await saveOfficeTrackState(projectRoot, {
      materials: [{ id: 'm1', name: '风险材料', type: 'proposal', path: 'risk.md', status: 'ready' }],
    });
    const audit = await auditOfficeTrackProject(projectRoot, state);
    const keys = audit.informationRisks.map(item => `${item.id}:${item.source}`);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(audit.informationRisks.some(item => item.id === 'pii-like-email'));
    assert.ok(audit.informationRisks.some(item => item.id === 'credential-assignment'));
    assert.ok(audit.informationRisks.some(item => item.id === 'private-key-marker'));
    assert.ok(audit.informationRisks.some(item => item.id === 'sensitive-business-keyword'));
    assert.ok(audit.informationRisks.every(item => item.message.includes('人工复核')));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('office track project audit never pretends a binary demo was played or parsed', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-track-binary-demo-'));
  try {
    await writeFile(path.join(projectRoot, 'demo.mp4'), Buffer.from([0, 1, 2, 3, 4, 5]));
    const state = await saveOfficeTrackState(projectRoot, {
      materials: [{ id: 'm2', name: '演示录屏', type: 'demo-video-script', path: 'demo.mp4', status: 'ready' }],
    });
    const audit = await auditOfficeTrackProject(projectRoot, state);
    assert.equal(audit.readability.materials[0].status, 'partial');
    assert.match(audit.readability.materials[0].reason, /二进制|人工/);
    assert.equal(audit.scoreFormation.scoreStatus, 'needs-materials');
    assert.equal(audit.totalGuidanceScore, null);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('office track export writes submission materials and sha256 manifest', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'office-track-export-'));
  try {
    const saved = await saveOfficeTrackState(projectRoot, {
      brief: {
        title: 'OpenPrism Office',
        scenario: '办公材料文案写作',
        users: '项目申报团队',
        writingTasks: ['作品说明', '演示讲稿', '成效说明'],
        valueProposition: '证据约束、人工审批、可复用模板。',
        frequency: '每周',
        originalProcess: '人工整理材料后撰写。',
        painPoints: ['资料定位慢'],
        deliveryStandard: '对外材料人工审批。',
      },
      materials: [
        { id: 'm1', name: '作品说明', type: 'proposal', path: 'sources/proposal.md', status: 'draft' },
        { id: 'm2', name: '演示脚本', type: 'demo-video-script', path: 'sources/demo.md', status: 'ready' },
        { id: 'm3', name: '复用声明', type: 'reuse-statement', path: 'sources/reuse.md', status: 'draft' },
        { id: 'm4', name: '重大意义', type: 'significance', path: 'sources/significance.md', status: 'draft' },
      ],
      evidence: [
        { id: 'e1', claim: '减少返工', sourcePath: 'evidence/log.md', location: 'L1-L6', level: 'E1', status: 'verified' },
      ],
      effect: { baselineMinutes: 60, aiMinutes: 25, reviewMinutes: 10, retryMinutes: 5, sampleSize: 3, measurementStatus: 'measured', unit: '每份材料', period: '2026-08', taskFrequency: '每周', coveragePeople: 3, calculationNotes: '纳入复核和返工。' },
      reusableAssets: [{ id: 'a1', name: 'SOP', type: 'sop', path: 'submission/M06-sop.md', status: 'ready', targetRoles: ['项目经理'], learningMinutes: 10, deploymentNotes: '复制 SOP 使用。', permissionNotes: '仅项目内可读。', maintenanceOwner: 'PMO' }],
      finals: {
        landingEvidence: { usagePeriod: '2026-08', users: ['项目经理'], useCount: 3, outputs: ['作品说明'], feedback: ['可用'] },
        rolloutPlan: { targetRoles: ['项目经理'], milestones: ['试用'], owner: 'PMO', resources: ['SOP'], costs: '培训 10 分钟', risks: ['资料缺口'], metrics: ['返工率'] },
        aiOptimization: { versions: ['prompt-v1'], evaluation: '抽查证据定位。', iterations: ['补齐成本字段'] },
      },
    });

    await mkdir(path.join(projectRoot, 'sources'), { recursive: true });
    await Promise.all([
      writeFile(path.join(projectRoot, 'sources/proposal.md'), '# 原始作品说明\n'),
      writeFile(path.join(projectRoot, 'sources/demo.md'), '# 三分钟真实操作图文记录\n'),
      writeFile(path.join(projectRoot, 'sources/reuse.md'), '# 原始复用说明\n'),
      writeFile(path.join(projectRoot, 'sources/significance.md'), '# 原始作品意义\n'),
    ]);
    const result = await exportOfficeTrackPackage(projectRoot, saved);
    assert.equal(result.directory, 'submission');
    assert.ok(result.files.some(file => file.path === 'submission/M01-proposal.md'));
    assert.ok(result.files.some(file => file.path === 'submission/M06-reuse-assets.md'));
    assert.ok(result.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256)));

    const manifest = JSON.parse(await readFile(path.join(projectRoot, 'submission', 'submission-manifest.json'), 'utf-8'));
    assert.equal(manifest.officialJudgement, false);
    assert.ok(manifest.files.some(file => file.path === 'submission/initial-score-guide.md'));
    assert.ok(result.files.some(file => file.path === 'submission/blank-initial-score-sheet.md'));
    assert.ok(result.files.some(file => file.path === 'submission/finals-score-guide.md'));
    assert.ok(result.files.some(file => file.path === 'submission/submission-manifest.json'));
    assert.match(manifest.ruleVersion, /AI材料审核与评分规则/);
    assert.ok(Array.isArray(manifest.unresolvedGaps));

    const proposal = await readFile(path.join(projectRoot, 'submission', 'M01-proposal.md'), 'utf-8');
    const effect = await readFile(path.join(projectRoot, 'submission', 'M05-effect-evidence.md'), 'utf-8');
    const reuse = await readFile(path.join(projectRoot, 'submission', 'M06-reuse-assets.md'), 'utf-8');
    const finals = await readFile(path.join(projectRoot, 'submission', 'finals-pack.md'), 'utf-8');
    const reviewer = await readFile(path.join(projectRoot, 'submission', 'reviewer-guide.md'), 'utf-8');
    const blankScore = await readFile(path.join(projectRoot, 'submission', 'blank-initial-score-sheet.md'), 'utf-8');
    assert.match(proposal, /发生频率/);
    assert.match(effect, /覆盖人数/);
    assert.match(reuse, /目标岗位/);
    assert.match(finals, /AI 适配与优化/);
    assert.match(reviewer, /## 1\. 基本信息/);
    assert.match(reviewer, /## 6\. 材料导航与证据索引/);
    assert.match(reviewer, /## 9\. 风险、缺口和建议追问/);
    assert.match(blankScore, /AI 建议分/);
    assert.match(blankScore, /真实落地度/);

    const repeated = await exportOfficeTrackPackage(projectRoot, saved);
    assert.deepEqual(repeated.files, result.files);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
