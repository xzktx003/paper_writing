import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEvidenceGraph,
  buildHybridRetrievalIndex,
  evaluateRetrieval,
  ingestMeetingTranscript,
  searchHybridEvidence,
} from '../officeIntelligenceService.js';

const docs = [
  {
    id: 'proposal',
    path: 'research_corpus/proposal.md',
    title: 'Office proposal',
    text: [
      'The office writing workflow reduces reimbursement report drafting time by using reusable templates.',
      'Every generated claim must keep a visible source pointer and human approval before delivery.',
    ].join('\n'),
  },
  {
    id: 'meeting',
    path: 'meetings/weekly.md',
    title: 'Weekly meeting',
    text: [
      '[00:01:02] Alice: The finance team approved the reimbursement report template pilot.',
      '[00:02:10] Bob: Decision: launch the pilot on Monday.',
      '[00:03:00] Alice: Action: Chen will prepare the user training checklist by Friday.',
    ].join('\n'),
  },
  {
    id: 'conflict',
    path: 'research_corpus/risk.md',
    title: 'Risk note',
    text: 'The reimbursement report pilot did not reduce drafting time during the first dry run.',
  },
];

test('hybrid retrieval combines BM25, hashed-vector cosine, reranking, and editable chunks deterministically', () => {
  const index = buildHybridRetrievalIndex(docs, { chunkSize: 18, overlap: 4 });
  assert.equal(index.retrievalProfile.kind, 'local-hybrid-bm25-hashed-vector');
  assert.equal(index.retrievalProfile.semantic, true);
  assert.ok(index.chunks.length >= docs.length);
  assert.ok(index.chunks.every(chunk => chunk.editModel.originalText && chunk.editModel.status === 'indexed'));

  const first = searchHybridEvidence(index, 'approved reimbursement report template pilot', { topK: 3 });
  const second = searchHybridEvidence(index, 'approved reimbursement report template pilot', { topK: 3 });
  assert.deepEqual(first, second);
  assert.equal(first.results[0].source.path, 'meetings/weekly.md');
  assert.match(first.results[0].text, /approved the reimbursement report template pilot/i);
  assert.ok(first.results[0].scoreBreakdown.bm25 > 0);
  assert.ok(first.results[0].scoreBreakdown.vector > 0);
  assert.ok(first.results[0].scoreBreakdown.rerank >= 0);
  assert.equal(first.results[0].scoreBreakdown.final, first.results[0].score);
  assert.ok(first.results[0].matchedTerms.includes('approved'));
});

test('retrieval evaluation reports precision, recall, mrr, and per-query hits', () => {
  const index = buildHybridRetrievalIndex(docs, { chunkSize: 20, overlap: 5 });
  const meetingChunk = index.chunks.find(chunk => chunk.source.path === 'meetings/weekly.md' && /approved/.test(chunk.text));
  const templateChunk = index.chunks.find(chunk => chunk.source.path === 'research_corpus/proposal.md' && /templates/.test(chunk.text));

  const evaluation = evaluateRetrieval(index, [
    { id: 'q1', query: 'approved reimbursement template pilot', relevantChunkIds: [meetingChunk.id] },
    { id: 'q2', query: 'reusable templates drafting time', relevantChunkIds: [templateChunk.id] },
  ], { topK: 2 });

  assert.equal(evaluation.queryCount, 2);
  assert.equal(evaluation.metrics.precisionAtK, 0.5);
  assert.equal(evaluation.metrics.recallAtK, 1);
  assert.equal(evaluation.metrics.mrr, 1);
  assert.deepEqual(evaluation.perQuery.map(item => item.hit), [true, true]);
});

test('evidence graph maps claim support, conflict, missing sources, and coverage without invented citations', () => {
  const index = buildHybridRetrievalIndex(docs, { chunkSize: 20, overlap: 5 });
  const graph = buildEvidenceGraph(index, [
    { id: 'c1', text: 'The reimbursement report template pilot was approved.' },
    { id: 'c2', text: 'The reimbursement pilot reduced drafting time.' },
    { id: 'c3', text: 'The system integrates with payroll APIs.' },
  ], { topK: 4 });

  assert.equal(graph.claims.length, 3);
  assert.equal(graph.coverage.supportedClaims, 1);
  assert.equal(graph.coverage.conflictedClaims, 1);
  assert.equal(graph.coverage.missingClaims, 1);
  assert.ok(graph.edges.some(edge => edge.claimId === 'c1' && edge.type === 'support' && edge.source.path === 'meetings/weekly.md'));
  assert.ok(graph.edges.some(edge => edge.claimId === 'c2' && edge.type === 'conflict' && edge.source.path === 'research_corpus/risk.md'));
  assert.ok(graph.edges.some(edge => edge.claimId === 'c3' && edge.type === 'missing'));
  assert.ok(graph.gaps.some(gap => gap.claimId === 'c3'));
  assert.ok(graph.conflicts.some(conflict => conflict.claimId === 'c2'));
  assert.ok(graph.edges.every(edge => edge.type === 'missing' || edge.source.path));
});

test('meeting intake parses timestamped transcript into workflow document and timestamp evidence', () => {
  const meeting = ingestMeetingTranscript({
    filename: '../weekly-review.txt',
    content: [
      '[00:00:04] Mei: We reviewed the office submission evidence gaps.',
      '[00:01:20] Raj: Decision: keep human approval required for external delivery.',
      '[00:02:11] Mei: Action item: Li will upload the reviewer guide by 2026-08-28.',
      '[00:03:30] Raj: The action item owner should verify every exported citation.',
    ].join('\n'),
  });

  assert.equal(meeting.source.filename, 'weekly-review.txt');
  assert.equal(meeting.source.speakerDiarization, 'not-claimed');
  assert.match(meeting.summary, /office submission evidence gaps/i);
  assert.deepEqual(meeting.decisions.map(item => item.timestamp), ['00:01:20']);
  assert.deepEqual(meeting.actionItems.map(item => item.owner), ['Li']);
  assert.equal(meeting.timestampEvidence[0].speaker, 'Mei');
  assert.equal(meeting.workflowDocument.kind, 'meeting-transcript');
  assert.match(meeting.workflowDocument.content, /## Decisions/);
  assert.match(meeting.workflowDocument.content, /00:02:11/);
});

test('Chinese office evidence and meeting markers remain retrievable and traceable', () => {
  const chineseDocs = [
    { id: 'approved', path: 'sources/审批纪要.md', text: '财务部门已批准报销材料自动整理试点，所有对外交付必须经过人工确认。' },
    { id: 'risk', path: 'sources/风险记录.md', text: '首次演练未减少报销材料整理耗时，缺少证据时不得宣称提效。' },
  ];
  const search = searchHybridEvidence(chineseDocs, '报销材料试点批准', { topK: 2 });
  assert.equal(search.results[0].source.path, 'sources/审批纪要.md');
  assert.ok(search.results[0].scoreBreakdown.bm25 > 0);
  assert.ok(search.results[0].scoreBreakdown.vector > 0);

  const graph = buildEvidenceGraph(chineseDocs, [
    { id: 'cn-1', text: '报销材料自动整理试点已批准。' },
    { id: 'cn-2', text: '报销材料整理耗时已经减少。' },
  ], { topK: 2 });
  assert.ok(graph.edges.some(edge => edge.claimId === 'cn-1' && edge.type === 'support'));
  assert.ok(graph.edges.some(edge => edge.claimId === 'cn-2' && edge.type === 'conflict'));

  const combinedGraph = buildEvidenceGraph([
    { id: 'combined', path: 'sources/综合记录.md', text: '报销材料自动整理试点已批准，但首次演练未减少材料整理耗时。' },
  ], [
    { id: 'combined-approved', text: '报销材料自动整理试点已批准。' },
    { id: 'combined-time', text: '材料整理耗时已经减少。' },
  ]);
  assert.ok(combinedGraph.edges.some(edge => edge.claimId === 'combined-approved' && edge.type === 'support'));
  assert.ok(combinedGraph.edges.some(edge => edge.claimId === 'combined-time' && edge.type === 'conflict'));

  const proofGapGraph = buildEvidenceGraph([
    { id: 'proof-gap', path: 'sources/受控演练.md', text: '首次受控演练没有证明稳定提效，缺少业务样本时不得宣称规模化落地。' },
  ], [
    { id: 'proof-claimed', text: '受控演练已经证明稳定提效。' },
  ]);
  assert.ok(proofGapGraph.edges.some(edge => edge.claimId === 'proof-claimed' && edge.type === 'conflict'));

  const meeting = ingestMeetingTranscript({
    filename: '项目周会.txt',
    content: '[00:01:00] 王敏：讨论办公材料证据缺口。\n[00:02:00] 李强：决定：保留人工审批门禁。\n[00:03:00] 王敏：待办：陈晨负责于2026-08-30前补齐效果表。',
  });
  assert.match(meeting.summary, /记录 1 项决定、1 项待办/);
  assert.equal(meeting.decisions[0].text, '保留人工审批门禁。');
  assert.equal(meeting.actionItems[0].owner, '陈晨');
  assert.equal(meeting.actionItems[0].due, '2026-08-30');
  assert.equal(meeting.timestampEvidence[1].speaker, '李强');
});

test('service validates input limits and unsafe filenames', () => {
  assert.throws(
    () => buildHybridRetrievalIndex([{ path: '../secret.md', text: 'bad' }]),
    /unsafe document path/,
  );
  assert.throws(
    () => ingestMeetingTranscript({ filename: 'meeting.md', content: 'x'.repeat(1024 * 1024 + 1) }),
    /too large/,
  );
});
