import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildEvidenceGraph,
  buildHybridRetrievalIndex,
  ingestMeetingTranscript,
  searchHybridEvidence,
} from '../app/apps/backend/src/services/officeIntelligenceService.js';

const outputFlag = process.argv.indexOf('--output');
const outputPath = outputFlag >= 0 ? process.argv[outputFlag + 1] : '';
if (!outputPath) {
  throw new Error('Usage: node experiments/office_competition_controlled_evaluation.mjs --output experiments/results/<file>.json');
}

const documents = [
  {
    id: 'approval',
    path: 'controlled/sources/审批纪要.md',
    text: '技术管理部已批准办公材料核验试点。所有对外交付必须经过人工确认。',
  },
  {
    id: 'risk',
    path: 'controlled/sources/风险记录.md',
    text: '首次受控演练没有证明稳定提效，缺少业务样本时不得宣称已经规模化落地。',
  },
  {
    id: 'process',
    path: 'controlled/sources/流程说明.md',
    text: '新流程依次执行材料收件、证据检索、冲突检查、人工审批、交付导出和完整成本度量。',
  },
  {
    id: 'reuse',
    path: 'controlled/sources/复用说明.md',
    text: '复用包包含任务模板、操作 SOP、评审清单、效果数据表和权限边界说明。',
  },
];

const searchCases = [
  ['试点批准', 'controlled/sources/审批纪要.md'],
  ['没有证明稳定提效', 'controlled/sources/风险记录.md'],
  ['人工审批后导出', 'controlled/sources/流程说明.md'],
  ['模板 SOP 评审清单', 'controlled/sources/复用说明.md'],
];

const claimCases = [
  ['pilot-approved', '办公材料核验试点已批准。', 'support'],
  ['efficiency-proven', '受控演练已经证明稳定提效。', 'conflict'],
  ['human-approval', '对外交付必须经过人工确认。', 'support'],
  ['payroll-integration', '系统已经接入薪资平台。', 'missing'],
];

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return Math.round(sorted[index] * 1000) / 1000;
}

const index = buildHybridRetrievalIndex(documents, { chunkSize: 80, overlap: 10 });
const searches = searchCases.map(([query, expectedTopPath]) => {
  const result = searchHybridEvidence(index, query, { topK: 3 });
  const observedTopPath = result.results[0]?.source.path || null;
  return {
    query,
    expectedTopPath,
    observedTopPath,
    passed: observedTopPath === expectedTopPath,
    scoreBreakdown: result.results[0]?.scoreBreakdown || null,
  };
});

const graph = buildEvidenceGraph(
  index,
  claimCases.map(([id, text]) => ({ id, text })),
  { topK: 4 },
);
const claims = claimCases.map(([id, text, expectedRelation]) => {
  const relations = graph.edges.filter(edge => edge.claimId === id).map(edge => edge.type);
  return {
    id,
    text,
    expectedRelation,
    observedRelations: relations,
    passed: relations.includes(expectedRelation),
  };
});

const meeting = ingestMeetingTranscript({
  filename: '受控演示周会.txt',
  content: '[00:00:12] 王敏：核对参赛材料证据缺口。\n[00:01:08] 李强：决定：所有对外交付保留人工审批。\n[00:02:02] 王敏：待办：陈晨负责于2026-08-30前补齐效果表。',
});
const meetingCheck = {
  decisionCount: meeting.decisions.length,
  actionItemCount: meeting.actionItems.length,
  speakerDiarization: meeting.source.speakerDiarization,
  passed: meeting.decisions.length === 1
    && meeting.actionItems.length === 1
    && meeting.source.speakerDiarization === 'not-claimed',
};

const durations = [];
for (let iteration = 0; iteration < 100; iteration += 1) {
  const startedAt = performance.now();
  const repeatedIndex = buildHybridRetrievalIndex(documents, { chunkSize: 80, overlap: 10 });
  for (const [query] of searchCases) searchHybridEvidence(repeatedIndex, query, { topK: 3 });
  buildEvidenceGraph(repeatedIndex, claimCases.map(([id, text]) => ({ id, text })), { topK: 4 });
  durations.push(performance.now() - startedAt);
}
durations.sort((a, b) => a - b);

const allChecks = [...searches, ...claims, meetingCheck];
const result = {
  schema: 'openprism-office-controlled-evaluation-v1',
  generatedAt: new Date().toISOString(),
  scope: '受控技术演练；证明检索、证据关系和会议提取的可复现性，不代表企业生产率或真实业务落地。',
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  corpus: { documents: documents.length, chunks: index.chunks.length },
  searchCases: searches,
  claimCases: claims,
  meetingCheck,
  repeatedRun: {
    iterations: durations.length,
    p50Milliseconds: percentile(durations, 0.5),
    p95Milliseconds: percentile(durations, 0.95),
    maxMilliseconds: Math.round(durations.at(-1) * 1000) / 1000,
  },
  summary: {
    checks: allChecks.length,
    passed: allChecks.filter(check => check.passed).length,
    failed: allChecks.filter(check => !check.passed).length,
    allPassed: allChecks.every(check => check.passed),
  },
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(result.summary)}\n`);
