import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadataPath = path.join(appRoot, 'apps', 'backend', '.openprism-build.json');
const builtAt = new Date().toISOString();
let revision = 'nogit';
try {
  revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    cwd: path.resolve(appRoot, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim() || revision;
} catch {
  // Source archives may not include .git; the timestamp and nonce remain unique.
}
const buildId = String(process.env.OPENPRISM_BUILD_ID || '').trim()
  || `${builtAt.replace(/[-:.TZ]/g, '').slice(0, 14)}-${revision}-${crypto.randomBytes(4).toString('hex')}`;
const metadata = {
  buildId,
  builtAt,
  version: '0.1.0',
  apiSchemaVersion: 2,
};

await mkdir(path.dirname(metadataPath), { recursive: true });
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
process.stdout.write(`Prepared Paper Writer build ${buildId}\n`);
