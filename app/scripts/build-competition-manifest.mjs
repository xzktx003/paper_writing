import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..');
const submissionRoot = join(repoRoot, 'docs/competition/submission_90plus');
const manifestPath = join(submissionRoot, 'submission-manifest.json');

async function collectFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const absolutePath = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Submission package cannot contain symlinks: ${absolutePath}`);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath));
      continue;
    }
    if (!entry.isFile() || absolutePath === manifestPath) continue;
    files.push(absolutePath);
  }
  return files;
}

const files = [];
for (const absolutePath of await collectFiles(submissionRoot)) {
  const bytes = await fs.readFile(absolutePath);
  const path = relative(submissionRoot, absolutePath).split(sep).join('/');
  files.push({
    path,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  });
}

const required = [
  'M01-proposal.md',
  'M02-demo-script.md',
  'M03-reuse-statement.md',
  'M04-significance.md',
  'M05-effect-evidence.md',
  'M06-reuse-assets.md',
  'reviewer-guide.md',
  'initial-score-guide.md',
  'blank-initial-score-sheet.md',
  'finals-pack.md',
  'finals-score-guide.md',
  'OpenPrism-Office-competition-submission.pdf',
  'evidence/demo/office-demo-submission.mp4',
  'evidence/demo/office-demo-submission.ass',
  'evidence/demo/office-demo-submission-transcript.md',
  'evidence/demo/office-demo-poster.jpg',
  'evidence/demo/office-demo.mp4',
  'evidence/demo/office-demo.webm',
  'evidence/demo/timestamps.md',
  'evidence/E05-quality-notes.md',
  'evidence/E06-reuse-assets.md',
];
const paths = new Set(files.map(file => file.path));
const missingRequiredFiles = required.filter(path => !paths.has(path));

const manifest = {
  schema: 'openprism-office-competition-submission-v1',
  generatedAt: new Date().toISOString(),
  ruleVersion: 'AI材料审核与评分规则@2026-08-27',
  officialJudgement: false,
  packageScope: '办公赛道材料、受控演示、测试/实验、复用资产和准备度说明',
  readiness: missingRequiredFiles.length === 0 ? 'technical-package-complete' : 'missing-required-files',
  missingRequiredFiles,
  evidenceBoundary: {
    demonstrated: '代码、测试、连续浏览器录屏和受控实验支持产品可运行与流程变化。',
    notDemonstrated: '尚无企业多用户/多周期试点，不能据此声称稳定生产率、真实落地或官方 90 分。',
  },
  unresolvedGaps: [
    '真实业务全成本样本及负责人确认',
    '非作者普通办公用户独立复现记录',
    '现场答辩录屏/纪要与评委评分',
  ],
  fileCount: files.length,
  files,
};

const tempPath = `${manifestPath}.${process.pid}.tmp`;
await fs.writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
await fs.rename(tempPath, manifestPath);
process.stdout.write(`${manifestPath}\n${files.length} files\n${manifest.readiness}\n`);
